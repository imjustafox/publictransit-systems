import { promises as fs } from "fs";
import path from "path";
import {
  parseGtfsBundle,
  parseGtfsSubfeeds,
  mergeGtfsBundles,
  type GtfsBundle,
  type GtfsRoute,
  type GtfsStopTime,
  type SubfeedSpec,
} from "./parser";
import { resolveAuth, resolveUrl, MissingSecretError, type AuthConfig } from "./secrets";
import { loadIdMap, saveIdMap, mergeIdMap, type IdMap } from "./id-map";
import { detectTopology, extractTripPatterns } from "./topology";
import {
  selectShapesForRoute,
  shapeToPolyline,
  polylineLength,
  simplifyPolyline,
} from "./geometry";
import { mergeOverlay, applyOverlayCollection } from "./merge";
import { applyRouteGroups, ifoptStationId } from "./groups";
import { extractEntrances } from "./entrances";
import { applyOsmToStation, type OsmLayer } from "../osm/enrich";
import { RAIL_ROUTE_TYPES, WHEELCHAIR_BOARDING } from "./constants";

interface GtfsConfig {
  static: {
    // Single-download form. Mutually exclusive with `sources`.
    url_secret?: string;
    auth?: AuthConfig;
    // Independent downloads merged with the subfeed semantics (Baltimore's
    // two static feeds stay separate fetches). Entries may carry a network
    // id, tagging every route the source contributes.
    sources?: Array<{ url_secret: string; auth?: AuthConfig; network?: string }>;
    // Inner zip paths for feeds that nest one bundle per branch in the
    // downloaded zip (e.g. Victoria's "2/google_transit.zip"). Entries may
    // be { path, network } objects, tagging that branch's routes.
    subfeeds?: SubfeedSpec[];
    route_groups?: Record<string, string[]>;
    // Post-grouping line slugs per network id, for feeds where the network
    // split doesn't follow subfeed/source boundaries (Sound Transit).
    networks?: Record<string, string[]>;
    filters?: {
      route_types?: number[];
      agency_ids?: string[] | null;
      route_ids_include?: string[] | null;
      route_ids_exclude?: string[];
      stop_ids_exclude?: string[];
    };
    fields?: {
      line_name_source?: "route_short_name" | "route_long_name";
      line_color_fallback?: string;
      stop_grouping?: "parent_station" | "ifopt" | "name";
      entrances?: "gtfs";
    };
  };
}

type Plain = Record<string, unknown>;

interface OverlayShape {
  system?: Plain;
  lines?: Record<string, Plain>;
  stations?: Record<string, Plain>;
  railcars?: unknown[];
}

export interface ProcessResult {
  systemId: string;
  status: "regenerated" | "skipped" | "failed";
  reason?: string;
  diagnostics?: {
    linesDetected: number;
    stationsDetected: number;
    topologyByLine: Record<string, string>;
  };
}

export async function processSystem(
  systemDir: string,
  systemId: string,
  env: Record<string, string | undefined>
): Promise<ProcessResult> {
  const systemJsonPath = path.join(systemDir, "system.json");
  let systemRaw: Plain;
  try {
    systemRaw = JSON.parse(await fs.readFile(systemJsonPath, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { systemId, status: "skipped", reason: "no system.json" };
    }
    throw err;
  }
  if (systemRaw.dataSource !== "gtfs") {
    return { systemId, status: "skipped", reason: "dataSource is not gtfs" };
  }

  const gtfsConfigPath = path.join(systemDir, "gtfs.json");
  let config: GtfsConfig;
  try {
    config = JSON.parse(await fs.readFile(gtfsConfigPath, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { systemId, status: "skipped", reason: "no gtfs.json" };
    }
    throw err;
  }

  // Resolve secrets, fetch, parse — malformed = fail loud. Routes from a
  // subfeed or source that declares a network are remembered so their lines
  // carry it.
  if (config.static.sources && config.static.url_secret) {
    throw new Error(
      `${systemId}: gtfs.json static.sources and static.url_secret are mutually exclusive`
    );
  }
  if (!config.static.sources && !config.static.url_secret) {
    throw new Error(`${systemId}: gtfs.json needs static.url_secret or static.sources`);
  }
  let gtfs: GtfsBundle;
  const networkByRouteId = new Map<string, string>();
  try {
    if (config.static.sources) {
      const bundles: GtfsBundle[] = [];
      for (const source of config.static.sources) {
        const fetched = await fetchFeed(source.url_secret, source.auth ?? { type: "none" }, env);
        if (!fetched.ok) return { systemId, status: "skipped", reason: fetched.reason };
        const bundle = await parseGtfsBundle(fetched.buffer);
        if (source.network) {
          for (const route of bundle.routes) networkByRouteId.set(route.route_id, source.network);
        }
        bundles.push(bundle);
      }
      gtfs = mergeGtfsBundles(bundles);
    } else {
      const fetched = await fetchFeed(
        config.static.url_secret!,
        config.static.auth ?? { type: "none" },
        env
      );
      if (!fetched.ok) return { systemId, status: "skipped", reason: fetched.reason };
      if (config.static.subfeeds?.length) {
        const parsed = await parseGtfsSubfeeds(fetched.buffer, config.static.subfeeds);
        for (const [routeId, network] of parsed.networkByRouteId) {
          networkByRouteId.set(routeId, network);
        }
        gtfs = parsed;
      } else {
        gtfs = await parseGtfsBundle(fetched.buffer);
      }
    }
  } catch (err) {
    if (err instanceof MissingSecretError) {
      return { systemId, status: "skipped", reason: `missing secret: ${err.secretName}` };
    }
    throw err;
  }

  // Filter routes
  const filters = config.static.filters || {};
  const routeTypes: readonly number[] = filters.route_types ?? RAIL_ROUTE_TYPES;
  const agencyIds = filters.agency_ids;
  const includeIds = filters.route_ids_include;
  const excludeIds = filters.route_ids_exclude || [];

  let routes = gtfs.routes.filter((r) => routeTypes.includes(r.route_type));
  if (agencyIds) routes = routes.filter((r) => r.agency_id && agencyIds.includes(r.agency_id));
  if (includeIds) routes = routes.filter((r) => includeIds.includes(r.route_id));
  if (excludeIds.length) routes = routes.filter((r) => !excludeIds.includes(r.route_id));

  // Collapse direction/branch routes into configured line groups
  const grouped = applyRouteGroups(routes, gtfs.trips, config.static.route_groups);
  routes = grouped.routes;
  const trips = grouped.trips;

  // Build id_map for lines (must run BEFORE stations so we have line slugs)
  let idMap: IdMap = await loadIdMap(path.join(systemDir, "id_map.json"));
  idMap = mergeIdMap(
    idMap,
    routes.map((r) => ({
      gtfs_id: r.route_id,
      name: pickRouteName(r, config.static.fields?.line_name_source ?? "route_long_name"),
    })),
    "lines"
  );

  // Build canonical stop_id resolver: platform stops collapse to their parent_station.
  // Falls back to self when parent_station is missing or points to a non-existent stop.
  const excludedStops = new Set(filters.stop_ids_exclude || []);
  const stopExists = new Set(gtfs.stops.map((s) => s.stop_id));
  const parentByStopId = new Map<string, string>();
  for (const stop of gtfs.stops) {
    const parent = stop.parent_station;
    if (parent && stopExists.has(parent)) {
      parentByStopId.set(stop.stop_id, parent);
    } else {
      parentByStopId.set(stop.stop_id, stop.stop_id);
    }
  }
  const useIfopt = config.static.fields?.stop_grouping === "ifopt";
  // "name" grouping: stops sharing an exact name collapse to one station.
  // For feeds with no parent stations where a platform pair is two stops with
  // the same name (Yarra Trams: "Spencer St #122" once per direction). Falls
  // back to parent_station when one exists so mixed subfeeds behave.
  const useNameGrouping = config.static.fields?.stop_grouping === "name";
  const firstStopIdByName = new Map<string, string>();
  if (useNameGrouping) {
    for (const stop of gtfs.stops) {
      if (stop.parent_station) continue;
      if (!firstStopIdByName.has(stop.stop_name)) {
        firstStopIdByName.set(stop.stop_name, stop.stop_id);
      }
    }
  }
  const nameByStopId = new Map(gtfs.stops.map((s) => [s.stop_id, s.stop_name]));
  const canonical = (sid: string): string => {
    if (useIfopt) return ifoptStationId(sid);
    const parent = parentByStopId.get(sid) ?? sid;
    if (useNameGrouping && parent === sid) {
      const name = nameByStopId.get(sid);
      if (name) return firstStopIdByName.get(name) ?? sid;
    }
    return parent;
  };

  // Build canonical stop_times per trip with consecutive-duplicate compression.
  // Two consecutive platforms of the same parent station collapse to a single visit
  // so topology detection doesn't see them as a "loop visiting the same station twice".
  const canonicalStopTimesByTrip = new Map<string, GtfsStopTime[]>();
  for (const [tripId, stopTimes] of gtfs.stopTimesByTrip) {
    const out: GtfsStopTime[] = [];
    let prevCanonical: string | null = null;
    for (const st of stopTimes) {
      const c = canonical(st.stop_id);
      if (excludedStops.has(c) || excludedStops.has(st.stop_id)) continue;
      if (c !== prevCanonical) {
        out.push({ ...st, stop_id: c });
        prevCanonical = c;
      }
    }
    canonicalStopTimesByTrip.set(tripId, out);
  }

  // Determine reachable canonical stops from filtered routes
  const reachableStopIds = new Set<string>();
  const tripsByRoute = new Map<string, string[]>();
  for (const trip of trips) {
    if (!routes.some((r) => r.route_id === trip.route_id)) continue;
    const stopTimes = canonicalStopTimesByTrip.get(trip.trip_id);
    if (!stopTimes) continue;
    for (const st of stopTimes) reachableStopIds.add(st.stop_id);
    let arr = tripsByRoute.get(trip.route_id);
    if (!arr) {
      arr = [];
      tripsByRoute.set(trip.route_id, arr);
    }
    arr.push(trip.trip_id);
  }
  // Final stops array contains only canonical entries (platform-only stops are
  // excluded). IFOPT canonical ids have no stop row of their own, so a
  // representative platform stands in for name and coordinates.
  const stops = gtfs.stops.filter((s) => reachableStopIds.has(s.stop_id));
  if (useIfopt) {
    const have = new Set(stops.map((s) => s.stop_id));
    const repByCanonical = new Map<string, (typeof gtfs.stops)[number]>();
    for (const s of gtfs.stops) {
      const c = ifoptStationId(s.stop_id);
      if (reachableStopIds.has(c) && !have.has(c) && !repByCanonical.has(c)) {
        repByCanonical.set(c, s);
      }
    }
    for (const [c, rep] of repByCanonical) stops.push({ ...rep, stop_id: c });
  }
  idMap = mergeIdMap(
    idMap,
    stops.map((s) => ({ gtfs_id: s.stop_id, name: s.stop_name })),
    "stations"
  );

  // Network assignment: subfeed/source origin loses to the static.networks
  // map (post-grouping line slugs); the overlay wins over both via the
  // normal overlay merge. Grouped routes inherit from their first member
  // with a known origin.
  const networkBySlug = new Map<string, string>();
  for (const [networkId, slugs] of Object.entries(config.static.networks ?? {})) {
    for (const slug of slugs) {
      const existing = networkBySlug.get(slug);
      if (existing && existing !== networkId) {
        throw new Error(`networks: line ${slug} appears in both "${existing}" and "${networkId}"`);
      }
      networkBySlug.set(slug, networkId);
    }
  }
  const routeNetworkOrigin = (routeId: string): string | undefined => {
    const direct = networkByRouteId.get(routeId);
    if (direct) return direct;
    for (const member of config.static.route_groups?.[routeId] ?? []) {
      const network = networkByRouteId.get(member);
      if (network) return network;
    }
    return undefined;
  };

  // Build topology + per-line records
  const topologyByLine: Record<string, string> = {};
  const baseLines: Plain[] = [];
  const baseStationLines = new Map<string, Set<string>>();
  const baseGeometry: Record<
    string,
    { shapes: Array<{ shapeId: string; coordinates: [number, number][] }> }
  > = {};
  const distanceUnit =
    (systemRaw.stats as { distanceUnit?: "mi" | "km" } | undefined)?.distanceUnit ?? "mi";
  const fallbackColor = (config.static.fields?.line_color_fallback || "#888888").replace(/^#/, "");

  for (const route of routes) {
    const lineSlug = idMap.lines[route.route_id];
    const tripIds = tripsByRoute.get(route.route_id) ?? [];
    const patterns = extractTripPatterns(tripIds, canonicalStopTimesByTrip);
    const detected = detectTopology(patterns);
    const branchTag =
      detected.topology.type === "linear" && detected.topology.branches ? "+branches" : "";
    topologyByLine[lineSlug] = detected.topology.type + branchTag;

    const stationSlugs = [
      ...new Set(
        detected.dominantStops
          .map((sid) => idMap.stations[sid])
          .filter((slug): slug is string => Boolean(slug))
      ),
    ];
    for (const slug of stationSlugs) {
      let set = baseStationLines.get(slug);
      if (!set) {
        set = new Set();
        baseStationLines.set(slug, set);
      }
      set.add(lineSlug);
    }

    const termini = detected.termini.map((sid) => {
      const slug = idMap.stations[sid];
      const stop = stops.find((s) => s.stop_id === sid);
      return stop?.stop_name ?? slug ?? sid;
    });

    let topologyOut: Plain;
    if (detected.topology.type === "linear" && detected.topology.branches) {
      topologyOut = {
        type: "linear",
        branches: detected.topology.branches.map((b, i) => ({
          id: `${lineSlug}-branch-${i + 1}`,
          name: `Branch ${i + 1}`,
          termini: [
            stops.find((s) => s.stop_id === b.terminus)?.stop_name ??
              idMap.stations[b.terminus] ??
              b.terminus,
          ],
          branchStation: idMap.stations[b.branchStation] ?? b.branchStation,
          servicePattern: "full-time",
        })),
      };
    } else if (detected.topology.type === "loop") {
      topologyOut = {
        type: "loop",
        referenceStation:
          idMap.stations[detected.topology.referenceStation] ?? detected.topology.referenceStation,
      };
    } else if (detected.topology.type === "lollipop") {
      topologyOut = {
        type: "lollipop",
        loopStation: idMap.stations[detected.topology.loopStation] ?? detected.topology.loopStation,
      };
    } else {
      topologyOut = { type: "linear" };
    }

    // Geometry + length
    // Keep a covering set of shapes so branches render, not just the most
    // common pattern; the line's length reports the longest variant.
    const shapeIds = selectShapesForRoute(route.route_id, trips, gtfs.shapesByShapeId);
    let length = 0;
    const shapes: Array<{ shapeId: string; coordinates: [number, number][] }> = [];
    for (const shapeId of shapeIds) {
      const shape = gtfs.shapesByShapeId.get(shapeId);
      if (!shape) continue;
      const polyline = simplifyPolyline(shapeToPolyline(shape), 0.00005); // ~5m
      shapes.push({ shapeId, coordinates: polyline });
      length = Math.max(length, +polylineLength(polyline, distanceUnit).toFixed(2));
    }
    if (shapes.length) baseGeometry[lineSlug] = { shapes };

    const colorHex = `#${(route.route_color || fallbackColor).replace(/^#/, "")}`;
    const baseLine: Plain = {
      id: lineSlug,
      systemId,
      // undefined serializes away, so unassigned lines simply omit the key
      network: networkBySlug.get(lineSlug) ?? routeNetworkOrigin(route.route_id),
      name: pickRouteName(route, config.static.fields?.line_name_source ?? "route_long_name"),
      color: route.route_color || fallbackColor,
      colorHex,
      status: "active",
      stations: stationSlugs,
      stationCount: stationSlugs.length,
      termini,
      topology: topologyOut,
      length,
      description: "",
    };
    baseLines.push(baseLine);
  }

  // Build base stations. Several feed parents can share one slug (station
  // complexes like Times Sq have a parent per line); the first occurrence
  // wins for name and coordinates, features union, lines are already
  // unioned per slug in baseStationLines.
  const baseBySlug = new Map<string, Plain>();
  for (const s of stops) {
    const slug = idMap.stations[s.stop_id];
    const accessible = s.wheelchair_boarding === WHEELCHAIR_BOARDING.ACCESSIBLE;
    const existing = baseBySlug.get(slug);
    if (existing) {
      if (accessible && !(existing.features as string[]).includes("elevator")) {
        (existing.features as string[]).push("elevator");
      }
      continue;
    }
    baseBySlug.set(slug, {
      id: slug,
      systemId,
      name: s.stop_name,
      lines: [...(baseStationLines.get(slug) ?? [])],
      status: "active",
      coordinates: { lat: s.stop_lat, lng: s.stop_lon },
      features: accessible ? ["elevator"] : [],
    });
  }
  // Optional GTFS-sourced entrances (location_type 2 + pathways accessibility)
  if (config.static.fields?.entrances === "gtfs") {
    const nameByCanonical = new Map(stops.map((s) => [s.stop_id, s.stop_name]));
    const entrancesByStation = extractEntrances(gtfs.stops, gtfs.pathways, canonical, (cid) =>
      nameByCanonical.get(cid)
    );
    for (const [cid, entrances] of entrancesByStation) {
      const slug = idMap.stations[cid];
      if (!slug) continue;
      const station = baseBySlug.get(slug);
      if (station) station.entrances = entrances;
    }
  }

  // OSM enrichment layer: feed base < OSM < hand overlay.
  let osmLayer: OsmLayer = { stations: {} };
  try {
    osmLayer = JSON.parse(await fs.readFile(path.join(systemDir, "osm.json"), "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const baseStations: Plain[] = [...baseBySlug.values()].map((s) =>
    applyOsmToStation(
      s as Parameters<typeof applyOsmToStation>[0],
      osmLayer.stations[s.id as string] ?? {}
    )
  );

  // Load + apply overlay
  const overlayPath = path.join(systemDir, "overlay.json");
  const overlay = await readOverlay(overlayPath);

  const finalLines = applyOverlayCollection(baseLines, overlay.lines, { systemId });
  const finalStations = applyOverlayCollection(baseStations, overlay.stations, { systemId });

  // Line and station counts are facts of the merged output, so compute them
  // into the base on every refresh. The overlay still wins if a human pins an
  // official figure that counts differently than our data does.
  systemRaw.stats = {
    ...((systemRaw.stats as Record<string, unknown> | undefined) ?? {}),
    totalLines: finalLines.filter((l) => l.status === "active").length,
    totalStations: finalStations.filter((s) => s.status === "active").length,
  };

  const finalSystem = mergeOverlay(systemRaw, overlay.system);
  const finalRailcars = overlay.railcars ?? [];

  // Invariants - fail loud rather than write data the app will crash on.
  for (const l of finalLines) {
    if (!Array.isArray(l.termini) || typeof l.status !== "string" || !l.topology) {
      throw new Error(
        `line ${l.id} is incomplete after overlay merge (termini/status/topology); ` +
          `hand-only overlay lines must be complete objects`
      );
    }
  }
  for (const s of finalStations) {
    if (!Array.isArray(s.lines) || typeof s.status !== "string" || !s.coordinates) {
      throw new Error(
        `station ${s.id} is incomplete after overlay merge (lines/status/coordinates); ` +
          `hand-only overlay stations must be complete objects`
      );
    }
  }
  // A system that declares networks must file every line into one; systems
  // without a declaration are free-form (network optional).
  const declaredNetworks = (finalSystem as { networks?: Array<{ id: string }> }).networks;
  if (declaredNetworks?.length) {
    const declaredIds = new Set(declaredNetworks.map((n) => n.id));
    for (const l of finalLines) {
      if (typeof l.network !== "string" || !declaredIds.has(l.network)) {
        throw new Error(
          `line ${l.id} has ` +
            (typeof l.network === "string" ? `undeclared network "${l.network}"` : "no network") +
            ` but the system declares networks [${[...declaredIds].join(", ")}]; ` +
            `assign one via a subfeed/source network, static.networks, or the overlay`
        );
      }
    }
  }

  // Write artifacts
  await fs.writeFile(systemJsonPath, JSON.stringify(finalSystem, null, 2) + "\n");
  await fs.writeFile(
    path.join(systemDir, "lines.json"),
    JSON.stringify({ lines: finalLines }, null, 2) + "\n"
  );
  await fs.writeFile(
    path.join(systemDir, "stations.json"),
    JSON.stringify({ stations: finalStations }, null, 2) + "\n"
  );
  await fs.writeFile(
    path.join(systemDir, "railcars.json"),
    JSON.stringify({ generations: finalRailcars }, null, 2) + "\n"
  );
  await fs.writeFile(
    path.join(systemDir, "geometry.json"),
    JSON.stringify(baseGeometry, null, 2) + "\n"
  );
  await fs.writeFile(
    path.join(systemDir, "topology_detected.json"),
    JSON.stringify(topologyByLine, null, 2) + "\n"
  );
  await saveIdMap(path.join(systemDir, "id_map.json"), idMap);

  return {
    systemId,
    status: "regenerated",
    diagnostics: {
      linesDetected: baseLines.length,
      stationsDetected: baseStations.length,
      topologyByLine,
    },
  };
}

async function fetchFeed(
  urlSecret: string,
  auth: AuthConfig,
  env: Record<string, string | undefined>
): Promise<{ ok: true; buffer: Buffer } | { ok: false; reason: string }> {
  const baseUrl = resolveUrl(urlSecret, env);
  const { url, headers } = resolveAuth(baseUrl, auth, env);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    return { ok: false, reason: `feed HTTP ${response.status}` };
  }
  return { ok: true, buffer: Buffer.from(await response.arrayBuffer()) };
}

async function readOverlay(filepath: string): Promise<OverlayShape> {
  try {
    const raw = await fs.readFile(filepath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function pickRouteName(r: GtfsRoute, source: "route_short_name" | "route_long_name"): string {
  return r[source] || r.route_long_name || r.route_short_name || r.route_id;
}
