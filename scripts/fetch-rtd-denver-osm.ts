#!/usr/bin/env npx tsx
/**
 * Build RTD Denver rail stations from RTD's official GTFS feed and enrich them
 * with nearby OpenStreetMap entrances, elevators, and OSM/Wikidata IDs.
 *
 * Usage:
 *   npx tsx scripts/fetch-rtd-denver-osm.ts --dry-run
 *   npx tsx scripts/fetch-rtd-denver-osm.ts --raw-osm
 *
 * Options:
 *   --gtfs-dir <path>     Use an already extracted GTFS directory.
 *   --skip-download        Do not download/extract the official GTFS feed.
 *   --skip-osm             Build solely from GTFS (no OSM enrichment).
 *   --raw-osm              Cache the raw OSM response in data/raw/osm/.
 *   --from-cache           Reuse data/raw/osm/rtd-denver.json; do not query Overpass.
 *   --output, -o <path>   Output path (default: data/systems/rtd-denver/stations-osm.json).
 *   --dry-run, -n         Report results without writing the output.
 *
 * GTFS is the source of truth for station names, coordinates, and stop-to-line
 * membership. OSM data is supplemental and never determines whether a station
 * belongs to a line.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

const SYSTEM_ID = "rtd-denver";
const GTFS_URL = "https://www.rtd-denver.com/files/gtfs/google_transit.zip";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

interface CsvRow {
  [key: string]: string;
}

interface LineDefinition {
  id: string;
  name: string;
  status: string;
}

interface GtfsStop {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  parentStation?: string;
  locationType?: string;
  wheelchairBoarding?: string;
}

interface OSMNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OSMResponse {
  elements: OSMNode[];
}

interface Entrance {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  ref?: string;
  wheelchair?: boolean;
}

interface CuratedStation {
  id: string;
  name: string;
  lines: string[];
  coordinates?: { lat: number; lng: number };
  features?: string[];
}

interface Station {
  id: string;
  systemId: string;
  name: string;
  gtfsId?: string;
  osmId?: number;
  lines: string[];
  status: "active";
  coordinates: { lat: number; lng: number };
  features: string[];
  entrances?: Entrance[];
  wikidata?: string;
  wikipedia?: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

function readCsv(filePath: string): CsvRow[] {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).flatMap((line) => {
    if (!line) return [];
    const values = parseCsvLine(line);
    return [Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))];
  });
}

function nameToId(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bstation\b/gi, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function buildLineRefMap(lines: LineDefinition[]): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of lines) {
    const letter = line.id.match(/^([a-z])-line$/i)?.[1];
    if (letter) refs.set(letter.toUpperCase(), line.id);
    refs.set(line.name.toUpperCase(), line.id);
  }
  return refs;
}

async function ensureGtfs(
  projectRoot: string,
  args: ReturnType<typeof parseArgs>
): Promise<string> {
  if (args.gtfsDir) return path.resolve(projectRoot, args.gtfsDir);

  const cacheDir = path.join(projectRoot, "data/.cache/rtd-denver-gtfs");
  const requiredFiles = ["routes.txt", "trips.txt", "stop_times.txt", "stops.txt"];
  if (requiredFiles.every((file) => fs.existsSync(path.join(cacheDir, file)))) return cacheDir;

  if (args.skipDownload) {
    throw new Error(
      `GTFS files are missing from ${cacheDir}; remove --skip-download or provide --gtfs-dir.`
    );
  }

  const zipPath = path.join(projectRoot, "data/.cache/rtd-denver-gtfs.zip");
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  console.log(`Downloading RTD GTFS from ${GTFS_URL}...`);

  try {
    const response = await fetch(GTFS_URL);
    if (!response.ok) throw new Error(`GTFS download failed: HTTP ${response.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    fs.mkdirSync(cacheDir, { recursive: true });
    execFileSync("unzip", ["-oq", zipPath, "-d", cacheDir]);
    return cacheDir;
  } catch (error) {
    throw new Error(`Could not obtain RTD GTFS: ${(error as Error).message}`);
  }
}

function loadGtfsStations(
  gtfsDir: string,
  lineRefMap: Map<string, string>
): { stations: Station[]; railRoutes: Array<{ id: string; shortName: string; longName: string }> } {
  const routes = readCsv(path.join(gtfsDir, "routes.txt"));
  const routeIds = new Map<string, string>();
  const railRoutes = routes
    .filter((route) => route.route_type === "0" || route.route_type === "2")
    .map((route) => ({
      id: route.route_id,
      shortName: route.route_short_name || "",
      longName: route.route_long_name || "",
    }));
  for (const route of routes) {
    const candidates = [route.route_short_name, route.route_long_name, route.route_id]
      .filter(Boolean)
      .map((value) => value.toUpperCase().trim());
    const lineId = candidates.map((value) => lineRefMap.get(value)).find(Boolean);
    if (lineId) routeIds.set(route.route_id, lineId);
  }

  const tripsById = new Map<string, string>();
  for (const trip of readCsv(path.join(gtfsDir, "trips.txt"))) {
    const lineId = routeIds.get(trip.route_id);
    if (lineId) tripsById.set(trip.trip_id, lineId);
  }

  const stops = new Map<string, GtfsStop>();
  for (const row of readCsv(path.join(gtfsDir, "stops.txt"))) {
    const lat = Number(row.stop_lat);
    const lng = Number(row.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    stops.set(row.stop_id, {
      stopId: row.stop_id,
      name: row.stop_name,
      lat,
      lng,
      parentStation: row.parent_station || undefined,
      locationType: row.location_type,
      wheelchairBoarding: row.wheelchair_boarding,
    });
  }

  const stationLines = new Map<string, Set<string>>();
  for (const stopTime of readCsv(path.join(gtfsDir, "stop_times.txt"))) {
    const lineId = tripsById.get(stopTime.trip_id);
    const stop = stops.get(stopTime.stop_id);
    if (!lineId || !stop) continue;

    const stationId = stop.parentStation || stop.stopId;
    if (!stationLines.has(stationId)) stationLines.set(stationId, new Set());
    stationLines.get(stationId)!.add(lineId);
  }

  const byName = new Map<string, Station>();
  for (const [stationId, lines] of stationLines) {
    const stop = stops.get(stationId);
    if (!stop) continue;

    const candidate: Station = {
      id: nameToId(stop.name),
      systemId: SYSTEM_ID,
      gtfsId: stationId,
      name: stop.name,
      lines: [...lines].sort(),
      status: "active",
      coordinates: { lat: stop.lat, lng: stop.lng },
      features: ["fare-vending", ...(lines.size > 1 ? ["transfer"] : [])],
    };

    if (stop.wheelchairBoarding === "1" || stop.wheelchairBoarding === "2") {
      candidate.features.push("accessible");
    }

    // Some GTFS feeds omit parent stations. Merge same-named platform stops in
    // that case so a station still appears once with every served line.
    const key = normalizeName(stop.name);
    const existing = byName.get(key);
    if (existing) {
      candidate.lines.forEach((line) => {
        if (!existing.lines.includes(line)) existing.lines.push(line);
      });
      existing.lines.sort();
      if (existing.lines.length > 1 && !existing.features.includes("transfer")) {
        existing.features.push("transfer");
      }
    } else {
      byName.set(key, candidate);
    }
  }

  return {
    stations: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    railRoutes,
  };
}

function preserveSuspendedLineAssignments(
  stations: Station[],
  curatedStations: CuratedStation[],
  suspendedLineIds: Set<string>
): string[] {
  const stationsByName = new Map(stations.map((station) => [normalizeName(station.name), station]));
  const preserved = new Set<string>();

  for (const curated of curatedStations) {
    const suspendedLines = curated.lines.filter((line) => suspendedLineIds.has(line));
    if (suspendedLines.length === 0) continue;

    let station = stationsByName.get(normalizeName(curated.name));
    if (!station && curated.coordinates) {
      station = {
        id: curated.id || nameToId(curated.name),
        systemId: SYSTEM_ID,
        name: curated.name,
        lines: [],
        status: "active",
        coordinates: curated.coordinates,
        features: curated.features || ["fare-vending"],
      };
      stations.push(station);
      stationsByName.set(normalizeName(station.name), station);
    }
    if (!station) continue;

    for (const line of suspendedLines) {
      if (!station.lines.includes(line)) {
        station.lines.push(line);
        preserved.add(line);
      }
    }
    station.lines.sort();
    if (station.lines.length > 1 && !station.features.includes("transfer")) {
      station.features.push("transfer");
    }
    station.features = [...new Set(station.features)].sort();
  }

  stations.sort((a, b) => a.name.localeCompare(b.name));
  return [...preserved].sort();
}

function buildOverpassQuery(stations: Station[]): string {
  // Query only small areas around GTFS-confirmed rail stations. A city-wide
  // entrance query is both expensive and often rejected by public Overpass
  // instances before execution.
  // A single tag-regex scan per station is substantially cheaper than making
  // one nearby scan for each feature type. The GTFS location already narrows
  // the candidate area, and enrichWithOsm validates the returned tags.
  const nearbyQueries = stations.map(
    (station) =>
      'node[~"^(railway|public_transport|entrance|highway)$"~"^(station|halt|stop|tram_stop|stop_position|subway_entrance|yes|elevator)$"]' +
      `(around:400,${station.coordinates.lat},${station.coordinates.lng});`
  );

  return `[out:json][timeout:180];
(
  ${nearbyQueries.join("\n  ")}
);
out body qt;`;
}

async function fetchOverpass(stations: Station[]): Promise<OSMResponse> {
  const elements = new Map<number, OSMNode>();
  const batchSize = 5;

  for (let start = 0; start < stations.length; start += batchSize) {
    const batch = stations.slice(start, start + batchSize);
    let lastError: Error | undefined;
    let result: OSMResponse | undefined;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      console.log(`Querying OSM batch ${start / batchSize + 1} (${endpoint})...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": "publictransit-systems/0.1 (GTFS station enrichment)",
          },
          body: `data=${encodeURIComponent(buildOverpassQuery(batch))}`,
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${detail}`);
        }
        result = (await response.json()) as OSMResponse;
        break;
      } catch (error) {
        lastError = error as Error;
        console.log(`  Failed: ${lastError.message}`);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!result) {
      // OSM enrichment is supplemental. Retain completed batches rather than
      // discarding their useful entrance/accessibility data because one public
      // Overpass request was unavailable.
      console.warn(`OSM batch ${start / batchSize + 1} skipped: ${lastError?.message}`);
    } else {
      for (const element of result.elements) elements.set(element.id, element);
    }

    // Avoid putting burst pressure on shared public Overpass instances.
    if (start + batchSize < stations.length) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }

  return { elements: [...elements.values()] };
}

function distanceInMeters(lat: number, lng: number, node: OSMNode): number {
  const latitudeRadians = ((lat + node.lat) / 2) * (Math.PI / 180);
  const latMeters = (lat - node.lat) * 111_320;
  const lngMeters = (lng - node.lon) * 111_320 * Math.cos(latitudeRadians);
  return Math.hypot(latMeters, lngMeters);
}

function enrichWithOsm(stations: Station[], osm: OSMResponse): void {
  const nodes = osm.elements.filter((element) => element.type === "node");
  const osmStations = nodes.filter((node) => {
    const tags = node.tags || {};
    return (
      ["station", "halt", "stop", "tram_stop"].includes(tags.railway || "") ||
      tags.public_transport === "stop_position"
    );
  });
  const entrances = nodes.filter((node) => {
    const tags = node.tags || {};
    return tags.railway === "subway_entrance" || tags.entrance === "yes";
  });
  const elevators = nodes.filter((node) => node.tags?.highway === "elevator");

  for (const station of stations) {
    const matchingNode = osmStations
      .filter((node) => normalizeName(node.tags?.name || "") === normalizeName(station.name))
      .sort(
        (a, b) =>
          distanceInMeters(station.coordinates.lat, station.coordinates.lng, a) -
          distanceInMeters(station.coordinates.lat, station.coordinates.lng, b)
      )[0];

    if (
      matchingNode &&
      distanceInMeters(station.coordinates.lat, station.coordinates.lng, matchingNode) <= 500
    ) {
      const tags = matchingNode.tags || {};
      station.osmId = matchingNode.id;
      if (tags.wikidata) station.wikidata = tags.wikidata;
      if (tags.wikipedia) station.wikipedia = tags.wikipedia;
    }

    const stationEntrances = entrances
      .filter(
        (node) => distanceInMeters(station.coordinates.lat, station.coordinates.lng, node) <= 300
      )
      .map((node, index) => ({
        id: `osm-${node.id}`,
        name: node.tags?.ref || node.tags?.name || `Entrance ${index + 1}`,
        coordinates: { lat: node.lat, lng: node.lon },
        ref: node.tags?.ref,
        wheelchair: node.tags?.wheelchair === "yes",
      }));
    if (stationEntrances.length > 0) station.entrances = stationEntrances;

    if (
      station.features.includes("accessible") ||
      stationEntrances.some((entrance) => entrance.wheelchair) ||
      elevators.some(
        (node) => distanceInMeters(station.coordinates.lat, station.coordinates.lng, node) <= 200
      )
    ) {
      if (!station.features.includes("accessible")) station.features.push("accessible");
    }
    if (
      elevators.some(
        (node) => distanceInMeters(station.coordinates.lat, station.coordinates.lng, node) <= 200
      )
    ) {
      station.features.push("elevator");
    }
    station.features = [...new Set(station.features)].sort();
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    output: "data/systems/rtd-denver/stations-osm.json",
    dryRun: false,
    gtfsDir: "",
    skipDownload: false,
    skipOsm: false,
    rawOsm: false,
    fromCache: false,
  };

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--output" || argument === "-o") result.output = args[++index];
    else if (argument === "--dry-run" || argument === "-n") result.dryRun = true;
    else if (argument === "--gtfs-dir") result.gtfsDir = args[++index];
    else if (argument === "--skip-download") result.skipDownload = true;
    else if (argument === "--skip-osm") result.skipOsm = true;
    else if (argument === "--raw-osm") result.rawOsm = true;
    else if (argument === "--from-cache") result.fromCache = true;
  }
  return result;
}

async function main() {
  const args = parseArgs();
  const projectRoot = path.resolve(__dirname, "..");
  const lines = (
    JSON.parse(
      fs.readFileSync(path.join(projectRoot, "data/systems/rtd-denver/lines.json"), "utf8")
    ) as { lines: LineDefinition[] }
  ).lines;
  const gtfsDir = await ensureGtfs(projectRoot, args);
  const { stations, railRoutes } = loadGtfsStations(gtfsDir, buildLineRefMap(lines));
  const curatedStations = (
    JSON.parse(
      fs.readFileSync(path.join(projectRoot, "data/systems/rtd-denver/stations.json"), "utf8")
    ) as { stations: CuratedStation[] }
  ).stations;
  const suspendedLineIds = new Set(
    lines.filter((line) => line.status !== "active").map((line) => line.id)
  );
  const preservedLines = preserveSuspendedLineAssignments(
    stations,
    curatedStations,
    suspendedLineIds
  );

  if (!args.skipOsm) {
    const rawPath = path.join(projectRoot, "data/raw/osm/rtd-denver.json");
    try {
      const osm = args.fromCache
        ? (JSON.parse(fs.readFileSync(rawPath, "utf8")) as OSMResponse)
        : await fetchOverpass(stations);
      if (args.fromCache) {
        console.log(`Using cached OSM data from: ${rawPath}`);
      } else if (args.rawOsm) {
        fs.mkdirSync(path.dirname(rawPath), { recursive: true });
        fs.writeFileSync(rawPath, JSON.stringify(osm, null, 2));
        console.log(`Saved raw OSM data to: ${rawPath}`);
      }
      enrichWithOsm(stations, osm);
    } catch (error) {
      console.warn(`\nOSM enrichment skipped: ${(error as Error).message}`);
      console.warn("The GTFS-derived station data will still be written.");
    }
  }

  const represented = new Set(stations.flatMap((station) => station.lines));
  const missing = lines.filter((line) => !represented.has(line.id)).map((line) => line.id);
  console.log(`\nStations: ${stations.length}`);
  console.log(`Lines represented: ${[...represented].sort().join(", ") || "none"}`);
  console.log(`Lines not represented: ${missing.join(", ") || "none"}`);
  console.log(
    `Suspended line assignments preserved from stations.json: ${
      preservedLines.join(", ") || "none"
    }`
  );
  console.log(
    `GTFS rail routes: ${
      railRoutes
        .map((route) => `${route.shortName || "(no short name)"} [${route.id}]`)
        .join(", ") || "none"
    }`
  );
  console.log(
    `Transfer stations: ${stations.filter((station) => station.lines.length > 1).length}`
  );

  if (args.dryRun) {
    console.log("\nDry run — station output was not written.");
    return;
  }

  const outputPath = path.join(projectRoot, args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ stations }, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
