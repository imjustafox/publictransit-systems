// OSM enrichment: query Overpass per system, build the osm.json layer, and
// for JSON-only systems apply the field rules straight into stations.json.
//
// Usage: tsx scripts/enrich-osm.ts [--system=<id>] [--from-cache] [--dry-run]
//
// Every system participates unless its system.json sets osmEnrichment: false.
// Raw Overpass responses cache under data/raw/osm/ (gitignored).

import { promises as fs } from "fs";
import path from "path";
import { buildQuery, bboxAround, fetchOverpass, type OsmElement } from "./osm/overpass";
import { buildOsmLayer, applyOsmToStation, type EnrichStation } from "./osm/enrich";

const DATA_DIR = path.join(process.cwd(), "data", "systems");
const CACHE_DIR = path.join(process.cwd(), "data", "raw", "osm");
const OVERPASS_PAUSE_MS = 10000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--system="))?.split("=")[1];
  const fromCache = args.includes("--from-cache");
  const dryRun = args.includes("--dry-run");

  const systems = only ? [only] : await fs.readdir(DATA_DIR);
  let first = true;

  for (const systemId of systems) {
    const dir = path.join(DATA_DIR, systemId);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    let system: { dataSource?: string; osmEnrichment?: boolean };
    try {
      system = JSON.parse(await fs.readFile(path.join(dir, "system.json"), "utf-8"));
    } catch {
      console.log(`- ${systemId}: skipped (no system.json)`);
      continue;
    }
    if (system.osmEnrichment === false) {
      console.log(`- ${systemId}: skipped (osmEnrichment: false)`);
      continue;
    }

    const stationsFile = JSON.parse(await fs.readFile(path.join(dir, "stations.json"), "utf-8"));
    const stations: EnrichStation[] = stationsFile.stations;
    const located = stations.filter((s) => s.coordinates);
    if (located.length === 0) {
      console.log(`- ${systemId}: skipped (no station coordinates)`);
      continue;
    }

    const cachePath = path.join(CACHE_DIR, `${systemId}.json`);
    let elements: OsmElement[];
    if (fromCache) {
      elements = JSON.parse(await fs.readFile(cachePath, "utf-8"));
    } else {
      if (!first) await sleep(OVERPASS_PAUSE_MS);
      first = false;
      elements = await fetchOverpass(buildQuery(bboxAround(located.map((s) => s.coordinates!))));
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(elements));
    }

    const layer = buildOsmLayer(stations, elements);
    const matched = Object.keys(layer.stations).length;
    const entranceCount = Object.values(layer.stations).reduce(
      (a, s) => a + (s.entrances?.length ?? 0),
      0
    );
    const wikidataCount = Object.values(layer.stations).filter((s) => s.wikidata).length;
    console.log(
      `✓ ${systemId}: ${matched}/${stations.length} stations enriched, ` +
        `${entranceCount} entrances, ${wikidataCount} wikidata ids ` +
        `(${elements.length} OSM elements)`
    );
    if (dryRun) continue;

    await fs.writeFile(path.join(dir, "osm.json"), JSON.stringify(layer, null, 2) + "\n");

    // JSON-only systems have no processor run to fold the layer in.
    if (system.dataSource !== "gtfs") {
      stationsFile.stations = stations.map((s) => applyOsmToStation(s, layer.stations[s.id] ?? {}));
      await fs.writeFile(
        path.join(dir, "stations.json"),
        JSON.stringify(stationsFile, null, 2) + "\n"
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
