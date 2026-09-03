#!/usr/bin/env npx tsx
/**
 * Merge Beijing Subway station data from multiple sources:
 * - line-mappings.json (authoritative station list from bjsubway.com XML)
 * - OpenStreetMap (crowd-sourced entrance/elevator coordinates)
 * - Existing stations.json (enrichment data)
 *
 * Usage:
 *   npx tsx scripts/merge-beijing-data.ts
 *
 * Options:
 *   --output, -o      Output file (default: data/systems/beijing-subway/stations.json)
 *   --mappings        Path to line-mappings.json (authoritative)
 *   --osm, -m         Path to OSM data
 *   --base            Path to existing stations.json for enrichment
 *   --dry-run, -n     Don't write output
 */

import * as fs from "fs";
import * as path from "path";

interface Coordinates {
  lat: number;
  lng: number;
}

interface Entrance {
  id: string;
  name: string;
  coordinates?: Coordinates;
  features?: string[];
  accessibility?: string[];
  ref?: string;
  wheelchair?: boolean;
}

interface Elevator {
  id: string;
  location?: string;
  coordinates?: Coordinates;
  fromFloor?: number;
  toFloor?: number;
  wheelchair?: boolean;
}

interface Station {
  id: string;
  systemId: string;
  name: string;
  localName?: string;
  lines: string[];
  status: string;
  coordinates?: Coordinates;
  features: string[];
  entrances?: Entrance[];
  elevators?: Elevator[];
  escalatorLocations?: string[];
  osmId?: number;
  wikidata?: string;
}

interface StationsFile {
  stations: Station[];
}

interface StationMapping {
  id: string;
  name: string;
  localName: string;
  lines: string[];
  isTransfer: boolean;
}

interface MappingsFile {
  generated: string;
  source: string;
  lines: Array<{ id: string; name: string; localName: string; stations: string[] }>;
  stations: StationMapping[];
}

function loadJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    console.log(`  File not found: ${filePath}`);
    return null;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\-_]/g, "")
    .replace(/station|站/gi, "");
}

function mergeEntrances(base: Entrance[], overlay: Entrance[]): Entrance[] {
  const byId = new Map<string, Entrance>();

  // Add base entrances
  for (const e of base) {
    byId.set(e.id, { ...e });
  }

  // Merge overlay entrances
  for (const e of overlay) {
    const existing = byId.get(e.id);
    if (existing) {
      // Merge: prefer overlay coordinates if base doesn't have them
      if (!existing.coordinates && e.coordinates) {
        existing.coordinates = e.coordinates;
      }
      // Merge features
      if (e.features) {
        existing.features = [...new Set([...(existing.features || []), ...e.features])];
      }
    } else {
      byId.set(e.id, { ...e });
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function mergeElevators(base: Elevator[], overlay: Elevator[]): Elevator[] {
  const result = [...base];

  for (const e of overlay) {
    // Check if we already have this elevator (by coordinates proximity)
    const exists = result.some((existing) => {
      if (!existing.coordinates || !e.coordinates) return false;
      const dist = Math.sqrt(
        Math.pow(existing.coordinates.lat - e.coordinates.lat, 2) +
          Math.pow(existing.coordinates.lng - e.coordinates.lng, 2)
      );
      return dist < 0.0001; // ~10 meters
    });

    if (!exists) {
      result.push({ ...e });
    }
  }

  return result;
}

// Normalize line IDs to match our lines.json schema
function normalizeLineId(lineId: string): string {
  // Handle combined lines
  if (lineId === "line-1-batong") {
    return "line-1"; // Batong is now part of Line 1
  }
  // Handle duplicate line-1 entries
  if (lineId === "line-1") {
    return "line-1";
  }
  return lineId;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const projectRoot = path.resolve(__dirname, "..");

  const result = {
    output: path.join(projectRoot, "data/systems/beijing-subway/stations.json"),
    mappings: path.join(projectRoot, "data/systems/beijing-subway/line-mappings.json"),
    osm: path.join(projectRoot, "data/systems/beijing-subway/stations-osm.json"),
    base: path.join(projectRoot, "data/systems/beijing-subway/stations.json"),
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (arg === "--mappings") {
      result.mappings = args[++i];
    } else if (arg === "--osm" || arg === "-m") {
      result.osm = args[++i];
    } else if (arg === "--base") {
      result.base = args[++i];
    } else if (arg === "--dry-run" || arg === "-n") {
      result.dryRun = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  console.log("Loading data sources...");

  // Load authoritative line-station mappings
  const mappingsData = loadJson<MappingsFile>(args.mappings);
  if (!mappingsData) {
    console.error("line-mappings.json not found! Run fetch-beijing-xml.ts first.");
    process.exit(1);
  }

  // Load enrichment data
  const osmData = loadJson<StationsFile>(args.osm);
  const baseData = loadJson<StationsFile>(args.base);

  console.log(`  Mappings: ${mappingsData.stations.length} stations (authoritative)`);
  console.log(`  OSM: ${osmData?.stations.length || 0} stations`);
  console.log(`  Base: ${baseData?.stations.length || 0} stations`);

  // Build lookup maps for enrichment
  const osmByName = new Map<string, Station>();
  for (const s of osmData?.stations || []) {
    const key = normalizeStationName(s.localName || s.name);
    osmByName.set(key, s);
  }

  const baseByName = new Map<string, Station>();
  for (const s of baseData?.stations || []) {
    const key = normalizeStationName(s.localName || s.name);
    baseByName.set(key, s);
  }

  console.log("\nBuilding station list from mappings...");

  const merged: Station[] = [];
  let enrichedFromOsm = 0;
  let enrichedFromBase = 0;

  for (const mapping of mappingsData.stations) {
    const normalizedName = normalizeStationName(mapping.localName);

    // Normalize line IDs
    const lines = [...new Set(mapping.lines.map(normalizeLineId))].sort();

    // Create base station
    const station: Station = {
      id: mapping.localName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[()（）]/g, ""),
      systemId: "beijing-subway",
      name: mapping.name,
      localName: mapping.localName,
      lines,
      status: "active",
      features: ["fare-vending"],
    };

    // Add transfer feature if multiple lines
    if (lines.length > 1) {
      station.features.push("transfer");
    }

    // Enrich from OSM data (coordinates, entrances, elevators)
    const osmStation = osmByName.get(normalizedName);
    if (osmStation) {
      enrichedFromOsm++;

      if (osmStation.coordinates) {
        station.coordinates = osmStation.coordinates;
      }

      if (osmStation.entrances && osmStation.entrances.length > 0) {
        station.entrances = osmStation.entrances;
        station.features.push("escalator"); // Assume entrances have escalators
      }

      if (osmStation.elevators && osmStation.elevators.length > 0) {
        station.elevators = osmStation.elevators;
        station.features.push("elevator");
      }

      if (osmStation.osmId) {
        station.osmId = osmStation.osmId;
      }

      if (osmStation.wikidata) {
        station.wikidata = osmStation.wikidata;
      }

      // Merge features
      if (osmStation.features) {
        station.features = [...new Set([...station.features, ...osmStation.features])];
      }
    }

    // Enrich from base data (may have additional entrance info)
    const baseStation = baseByName.get(normalizedName);
    if (baseStation) {
      enrichedFromBase++;

      // Use base coordinates if OSM didn't have them
      if (!station.coordinates && baseStation.coordinates) {
        station.coordinates = baseStation.coordinates;
      }

      // Merge entrances
      if (baseStation.entrances && baseStation.entrances.length > 0) {
        station.entrances = mergeEntrances(station.entrances || [], baseStation.entrances);
      }

      // Merge elevators
      if (baseStation.elevators && baseStation.elevators.length > 0) {
        station.elevators = mergeElevators(station.elevators || [], baseStation.elevators);
      }

      // Merge escalator locations
      if (baseStation.escalatorLocations) {
        station.escalatorLocations = baseStation.escalatorLocations;
      }

      // Merge features
      station.features = [...new Set([...station.features, ...baseStation.features])];
    }

    // Sort and dedupe features
    station.features = [...new Set(station.features)].sort();

    merged.push(station);
  }

  console.log(`  Enriched from OSM: ${enrichedFromOsm}`);
  console.log(`  Enriched from base: ${enrichedFromBase}`);

  // Sort by Chinese name
  merged.sort((a, b) => (a.localName || a.name).localeCompare(b.localName || b.name));

  // Stats
  const withCoords = merged.filter((s) => s.coordinates).length;
  const withEntrances = merged.filter((s) => s.entrances && s.entrances.length > 0).length;
  const entrancesWithCoords = merged.reduce(
    (sum, s) => sum + (s.entrances?.filter((e) => e.coordinates).length || 0),
    0
  );
  const totalEntrances = merged.reduce((sum, s) => sum + (s.entrances?.length || 0), 0);
  const withElevators = merged.filter((s) => s.elevators && s.elevators.length > 0).length;
  const totalElevators = merged.reduce((sum, s) => sum + (s.elevators?.length || 0), 0);
  const transfers = merged.filter((s) => s.features.includes("transfer")).length;

  // Lines breakdown
  const lineStationCount = new Map<string, number>();
  for (const station of merged) {
    for (const line of station.lines) {
      lineStationCount.set(line, (lineStationCount.get(line) || 0) + 1);
    }
  }

  console.log("\nResults:");
  console.log(`  Total stations: ${merged.length}`);
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  Transfer stations: ${transfers}`);
  console.log(`  With entrances: ${withEntrances}`);
  console.log(`  Total entrances: ${totalEntrances} (${entrancesWithCoords} with coordinates)`);
  console.log(`  With elevators: ${withElevators}`);
  console.log(`  Total elevators: ${totalElevators}`);

  console.log("\nLines coverage:");
  const sortedLines = [...lineStationCount.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [line, count] of sortedLines) {
    console.log(`  ${line}: ${count} stations`);
  }

  if (args.dryRun) {
    console.log("\nDry run - not writing output");
    const sample = merged.find((s) => s.entrances && s.entrances.length > 0);
    if (sample) {
      console.log("\nSample station with entrances:");
      console.log(JSON.stringify(sample, null, 2));
    }
  } else {
    fs.writeFileSync(args.output, JSON.stringify({ stations: merged }, null, 2));
    console.log(`\nWritten to: ${args.output}`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
