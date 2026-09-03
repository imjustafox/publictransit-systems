// One-time onboarding: seed id_map.json and overlay.json for a system that
// already has hand-maintained JSON, from a local GTFS zip.
//
// Usage: tsx scripts/seed-gtfs.ts --system=bart --zip=/path/to/gtfs.zip
//
// Reads the system's gtfs.json for route filters/groups, matches feed stops to
// existing stations by proximity, extracts every hand-authored field into the
// overlay, and reports anything it could not match. Review the report before
// trusting the result.

import { promises as fs } from "fs";
import path from "path";
import { parseGtfsBundle } from "./gtfs/parser";
import { applyRouteGroups, ifoptStationId } from "./gtfs/groups";
import { RAIL_ROUTE_TYPES } from "./gtfs/constants";
import {
  seedStationIdMap,
  extractStationOverlay,
  extractLineOverlay,
  type SeedStop,
} from "./gtfs/seed";

async function main() {
  const args = process.argv.slice(2);
  const systemId = args.find((a) => a.startsWith("--system="))?.split("=")[1];
  const zipPath = args.find((a) => a.startsWith("--zip="))?.split("=")[1];
  if (!systemId || !zipPath) {
    console.error("Usage: tsx scripts/seed-gtfs.ts --system=<id> --zip=<gtfs.zip>");
    process.exit(1);
  }

  const systemDir = path.join(process.cwd(), "data", "systems", systemId);
  const config = JSON.parse(await fs.readFile(path.join(systemDir, "gtfs.json"), "utf-8"));
  const existingStations = JSON.parse(
    await fs.readFile(path.join(systemDir, "stations.json"), "utf-8")
  ).stations;
  const existingLines = JSON.parse(
    await fs.readFile(path.join(systemDir, "lines.json"), "utf-8")
  ).lines;
  const existingSystem = JSON.parse(
    await fs.readFile(path.join(systemDir, "system.json"), "utf-8")
  );
  const existingRailcars = JSON.parse(
    await fs.readFile(path.join(systemDir, "railcars.json"), "utf-8")
  ).generations;

  const gtfs = await parseGtfsBundle(await fs.readFile(zipPath));

  // Same route filtering as the processor
  const filters = config.static.filters || {};
  const routeTypes: number[] = filters.route_types ?? [...RAIL_ROUTE_TYPES];
  let routes = gtfs.routes.filter((r) => routeTypes.includes(r.route_type));
  if (filters.agency_ids)
    routes = routes.filter((r) => r.agency_id && filters.agency_ids.includes(r.agency_id));
  if (filters.route_ids_include)
    routes = routes.filter((r) => filters.route_ids_include.includes(r.route_id));
  if (filters.route_ids_exclude?.length)
    routes = routes.filter((r) => !filters.route_ids_exclude.includes(r.route_id));
  const grouped = applyRouteGroups(routes, gtfs.trips, config.static.route_groups);

  // Canonical stops: collapse platforms to parent stations, keep only stops
  // that rail trips actually serve.
  const routeIds = new Set(grouped.routes.map((r) => r.route_id));
  const tripIds = new Set(
    grouped.trips.filter((t) => routeIds.has(t.route_id)).map((t) => t.trip_id)
  );
  const stopById = new Map(gtfs.stops.map((s) => [s.stop_id, s]));
  const servedCanonical = new Set<string>();
  const representative = new Map<string, (typeof gtfs.stops)[number]>();
  for (const [tripId, stopTimes] of gtfs.stopTimesByTrip) {
    if (!tripIds.has(tripId)) continue;
    const excluded = new Set(filters.stop_ids_exclude || []);
    for (const st of stopTimes) {
      if (excluded.has(st.stop_id)) continue;
      const stop = stopById.get(st.stop_id);
      if (!stop) continue;
      const canonical =
        config.static.fields?.stop_grouping === "ifopt"
          ? ifoptStationId(stop.stop_id)
          : stop.parent_station && stopById.has(stop.parent_station)
            ? stop.parent_station
            : stop.stop_id;
      servedCanonical.add(canonical);
      // IFOPT canonical ids have no stop row of their own; remember a
      // representative platform for name and coordinates.
      if (!representative.has(canonical)) representative.set(canonical, stop);
    }
  }
  const stops: SeedStop[] = [...servedCanonical].map((id) => {
    const s = stopById.get(id) ?? representative.get(id)!;
    return {
      stop_id: id,
      stop_name: s.stop_name,
      stop_lat: s.stop_lat,
      stop_lon: s.stop_lon,
    };
  });

  // Seed station id map by proximity
  const seed = seedStationIdMap(stops, existingStations);

  // Line id map: match by existing line ids against group keys / route names
  const lineMap: Record<string, string> = {};
  for (const r of grouped.routes) {
    const key = r.route_id;
    const existing = existingLines.find(
      (l: { id: string }) => l.id === key || l.id === key.toLowerCase()
    );
    if (existing) lineMap[key] = existing.id;
  }

  // Extract overlay from existing hand data
  const overlay: Record<string, unknown> = {
    system: {
      overview: existingSystem.overview,
      history: existingSystem.history ?? [],
      stats: existingSystem.stats,
    },
    lines: Object.fromEntries(
      existingLines
        .map((l: Record<string, unknown>) => [l.id, extractLineOverlay(l)])
        .filter(([, v]: [string, unknown]) => v)
    ),
    stations: Object.fromEntries(
      existingStations
        .map((s: Record<string, unknown>) => [s.id, extractStationOverlay(s)])
        .filter(([, v]: [string, unknown]) => v)
    ),
    railcars: existingRailcars,
  };

  await fs.writeFile(
    path.join(systemDir, "id_map.json"),
    JSON.stringify({ stations: seed.stations, lines: lineMap }, null, 2) + "\n"
  );
  await fs.writeFile(path.join(systemDir, "overlay.json"), JSON.stringify(overlay, null, 2) + "\n");

  console.log(`Seeded ${systemId}:`);
  console.log(`  station matches: ${Object.keys(seed.stations).length}/${stops.length} feed stops`);
  if (seed.unmatchedStops.length)
    console.log(
      `  UNMATCHED feed stops (will get fresh slugs): ${seed.unmatchedStops.map((s) => s.stop_name).join(", ")}`
    );
  if (seed.unmatchedStations.length)
    console.log(
      `  UNMATCHED existing stations (feed doesn't serve them; add to overlay if hand-only): ${seed.unmatchedStations.map((s) => s.id).join(", ")}`
    );
  console.log(`  line matches: ${Object.keys(lineMap).length}/${grouped.routes.length} routes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
