import { promises as fs } from "fs";
import path from "path";
import { parseGtfsBundle, type GtfsRoute, type GtfsStopTime } from "./parser";
import { resolveAuth, resolveUrl, MissingSecretError, type AuthConfig } from "./secrets";
import { loadIdMap, saveIdMap, mergeIdMap, type IdMap } from "./id-map";
import { detectTopology, extractTripPatterns } from "./topology";
import {
  dominantShapeForRoute,
  shapeToPolyline,
  polylineLength,
  simplifyPolyline,
} from "./geometry";
import { mergeOverlay, applyOverlayCollection } from "./merge";
import { applyRouteGroups } from "./groups";
import { RAIL_ROUTE_TYPES, WHEELCHAIR_BOARDING } from "./constants";

interface GtfsConfig {
  static: {
    url_secret: string;
    auth: AuthConfig;
    route_groups?: Record<string, string[]>;
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

  // Resolve secrets, fetch
  let bundleBuffer: Buffer;
  try {
    const baseUrl = resolveUrl(config.static.url_secret, env);
    const { url, headers } = resolveAuth(baseUrl, config.static.auth, env);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { systemId, status: "skipped", reason: `feed HTTP ${response.status}` };
    }
    bundleBuffer = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    if (err instanceof MissingSecretError) {
      return { systemId, status: "skipped", reason: `missing secret: ${err.secretName}` };
    }
    throw err;
  }

  // Parse — malformed = fail loud
  const gtfs = await parseGtfsBundle(bundleBuffer);

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
  const canonical = (sid: string): string => parentByStopId.get(sid) ?? sid;

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
  // Final stops array contains only canonical entries (platform-only stops are excluded).
  const stops = gtfs.stops.filter((s) => reachableStopIds.has(s.stop_id));
  idMap = mergeIdMap(
    idMap,
    stops.map((s) => ({ gtfs_id: s.stop_id, name: s.stop_name })),
    "stations"
  );

  // Build topology + per-line records
  const topologyByLine: Record<string, string> = {};
  const baseLines: Plain[] = [];
  const baseStationLines = new Map<string, Set<string>>();
  const baseGeometry: Record<string, { shapeId: string; coordinates: [number, number][] }> = {};
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
    const shapeId = dominantShapeForRoute(route.route_id, trips);
    let length = 0;
    if (shapeId) {
      const shape = gtfs.shapesByShapeId.get(shapeId);
      if (shape) {
        const polyline = simplifyPolyline(shapeToPolyline(shape), 0.00005); // ~5m
        length = +polylineLength(polyline, distanceUnit).toFixed(2);
        baseGeometry[lineSlug] = { shapeId, coordinates: polyline };
      }
    }

    const colorHex = `#${(route.route_color || fallbackColor).replace(/^#/, "")}`;
    const baseLine: Plain = {
      id: lineSlug,
      systemId,
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
  const baseStations: Plain[] = [...baseBySlug.values()];

  // Load + apply overlay
  const overlayPath = path.join(systemDir, "overlay.json");
  const overlay = await readOverlay(overlayPath);

  const finalLines = applyOverlayCollection(baseLines, overlay.lines, { systemId });
  const finalStations = applyOverlayCollection(baseStations, overlay.stations, { systemId });
  const finalSystem = mergeOverlay(systemRaw, overlay.system);
  const finalRailcars = overlay.railcars ?? [];

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
