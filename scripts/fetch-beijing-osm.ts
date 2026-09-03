#!/usr/bin/env npx tsx
/**
 * Fetch Beijing Subway station data from OpenStreetMap via Overpass API
 * Extracts: station coordinates, entrances, elevators, accessibility features
 *
 * Usage:
 *   npx tsx scripts/fetch-beijing-osm.ts
 *
 * Options:
 *   --output, -o    Output file path (default: data/systems/beijing-subway/stations-osm.json)
 *   --dry-run, -n   Don't write output, just print stats
 *   --raw, -r       Save raw Overpass response
 */

import * as fs from "fs";
import * as path from "path";

// Overpass API endpoints (try multiple)
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Beijing bounding box (tighter to reduce query size)
const BEIJING_BBOX = "39.4,115.7,40.1,117.0"; // south,west,north,east

// Simplified Overpass query - use bbox instead of area for speed
const OVERPASS_QUERY = `
[out:json][timeout:180][bbox:${BEIJING_BBOX}];

// Get subway stations
node["railway"="station"]["station"="subway"];
out body qt;

// Get subway entrances
node["railway"="subway_entrance"];
out body qt;

// Get subway lines
relation["route"="subway"]["network"~"北京|Beijing",i];
out body qt;
`;

interface OSMNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OSMRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members?: Array<{
    type: string;
    ref: number;
    role?: string;
  }>;
}

interface OSMResponse {
  elements: (OSMNode | OSMRelation)[];
}

interface Entrance {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  ref?: string;
  wheelchair?: boolean;
}

interface Elevator {
  id: string;
  coordinates: { lat: number; lng: number };
  wheelchair?: boolean;
  level?: string;
}

interface Station {
  id: string;
  systemId: string;
  name: string;
  localName: string;
  osmId: number;
  lines: string[];
  status: string;
  coordinates: { lat: number; lng: number };
  features: string[];
  entrances?: Entrance[];
  elevators?: Elevator[];
  wikidata?: string;
  wikipedia?: string;
}

async function fetchOverpass(query: string): Promise<OSMResponse> {
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Querying ${endpoint}...`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<OSMResponse>;
    } catch (error) {
      lastError = error as Error;
      console.log(`  Failed: ${lastError.message}`);
      console.log("  Trying next endpoint...");
    }
  }

  throw new Error(`All Overpass endpoints failed. Last error: ${lastError?.message}`);
}

function isNode(element: OSMNode | OSMRelation): element is OSMNode {
  return element.type === "node";
}

function isRelation(element: OSMNode | OSMRelation): element is OSMRelation {
  return element.type === "relation";
}

function extractStationName(tags: Record<string, string>): { name: string; localName: string } {
  const localName = tags["name:zh"] || tags["name"] || "";
  const name = tags["name:en"] || tags["name:ja_rm"] || tags["name"] || localName;

  return { name, localName };
}

function findNearbyEntrances(
  station: OSMNode,
  entrances: OSMNode[],
  maxDistance: number = 0.003 // ~300 meters in degrees
): Entrance[] {
  const nearby: Entrance[] = [];

  for (const entrance of entrances) {
    const distance = Math.sqrt(
      Math.pow(entrance.lat - station.lat, 2) + Math.pow(entrance.lon - station.lon, 2)
    );

    if (distance <= maxDistance) {
      const tags = entrance.tags || {};
      nearby.push({
        id: `osm-${entrance.id}`,
        name: tags["ref"] || tags["name"] || `Entrance ${nearby.length + 1}`,
        coordinates: {
          lat: entrance.lat,
          lng: entrance.lon,
        },
        ref: tags["ref"],
        wheelchair: tags["wheelchair"] === "yes",
      });
    }
  }

  return nearby;
}

function findNearbyElevators(
  station: OSMNode,
  elevators: OSMNode[],
  maxDistance: number = 0.002 // ~200 meters
): Elevator[] {
  const nearby: Elevator[] = [];

  for (const elevator of elevators) {
    const distance = Math.sqrt(
      Math.pow(elevator.lat - station.lat, 2) + Math.pow(elevator.lon - station.lon, 2)
    );

    if (distance <= maxDistance) {
      const tags = elevator.tags || {};
      nearby.push({
        id: `osm-${elevator.id}`,
        coordinates: {
          lat: elevator.lat,
          lng: elevator.lon,
        },
        wheelchair: tags["wheelchair"] === "yes",
        level: tags["level"],
      });
    }
  }

  return nearby;
}

function extractLineFromRelation(relation: OSMRelation): string | undefined {
  const tags = relation.tags || {};
  const ref = tags["ref"];
  const name = tags["name"] || tags["name:en"] || "";

  if (ref) {
    // Handle refs like "1", "2", "BT" etc.
    const num = parseInt(ref, 10);
    if (!isNaN(num)) {
      return `line-${num}`;
    }
    return ref.toLowerCase().replace(/\s+/g, "-");
  }

  // Try to extract line number from name
  const lineMatch = name.match(/(\d+)号线|Line\s*(\d+)/i);
  if (lineMatch) {
    const num = lineMatch[1] || lineMatch[2];
    return `line-${num}`;
  }

  return undefined;
}

function processOSMData(data: OSMResponse): {
  stations: Station[];
  entranceCount: number;
  elevatorCount: number;
} {
  const stationNodes: OSMNode[] = [];
  const entranceNodes: OSMNode[] = [];
  const elevatorNodes: OSMNode[] = [];
  const lineRelations: OSMRelation[] = [];

  // Categorize elements
  for (const element of data.elements) {
    if (isNode(element)) {
      const tags = element.tags || {};

      if (
        tags["railway"] === "station" ||
        tags["railway"] === "stop" ||
        tags["public_transport"] === "station"
      ) {
        stationNodes.push(element);
      } else if (tags["railway"] === "subway_entrance" || tags["entrance"] === "subway") {
        entranceNodes.push(element);
      } else if (tags["highway"] === "elevator" || tags["elevator"] === "yes") {
        elevatorNodes.push(element);
      }
    } else if (isRelation(element)) {
      const tags = element.tags || {};
      if (tags["route"] === "subway") {
        lineRelations.push(element);
      }
    }
  }

  console.log(`  Found ${stationNodes.length} stations`);
  console.log(`  Found ${entranceNodes.length} entrances`);
  console.log(`  Found ${elevatorNodes.length} elevators`);
  console.log(`  Found ${lineRelations.length} subway lines`);

  // Build station-to-line mapping from relations
  const stationLines = new Map<number, string[]>();
  for (const relation of lineRelations) {
    const lineId = extractLineFromRelation(relation);
    if (!lineId || !relation.members) continue;

    for (const member of relation.members) {
      if (member.type === "node" && member.role === "stop") {
        if (!stationLines.has(member.ref)) {
          stationLines.set(member.ref, []);
        }
        const lines = stationLines.get(member.ref)!;
        if (!lines.includes(lineId)) {
          lines.push(lineId);
        }
      }
    }
  }

  // Process stations
  const stations: Station[] = [];

  for (const node of stationNodes) {
    const tags = node.tags || {};
    const { name, localName } = extractStationName(tags);

    if (!name && !localName) continue; // Skip unnamed stations

    const features: string[] = ["fare-vending"];

    // Find nearby entrances and elevators
    const entrances = findNearbyEntrances(node, entranceNodes);
    const elevators = findNearbyElevators(node, elevatorNodes);

    if (entrances.length > 0) {
      features.push("escalator"); // Assume entrances have escalators
      if (entrances.some((e) => e.wheelchair)) {
        features.push("accessible");
      }
    }

    if (elevators.length > 0) {
      features.push("elevator");
    }

    if (tags["wheelchair"] === "yes") {
      features.push("accessible");
    }

    if (tags["toilets"] === "yes" || tags["toilets:wheelchair"] === "yes") {
      features.push("restroom");
    }

    const lines = stationLines.get(node.id) || [];
    if (lines.length > 1) {
      features.push("transfer");
    }

    const station: Station = {
      id: localName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[()（）]/g, ""),
      systemId: "beijing-subway",
      name,
      localName,
      osmId: node.id,
      lines: lines.sort(),
      status: "active",
      coordinates: {
        lat: node.lat,
        lng: node.lon,
      },
      features: [...new Set(features)].sort(),
    };

    if (entrances.length > 0) {
      station.entrances = entrances;
    }

    if (elevators.length > 0) {
      station.elevators = elevators;
    }

    if (tags["wikidata"]) {
      station.wikidata = tags["wikidata"];
    }

    if (tags["wikipedia"]) {
      station.wikipedia = tags["wikipedia"];
    }

    stations.push(station);
  }

  return {
    stations,
    entranceCount: entranceNodes.length,
    elevatorCount: elevatorNodes.length,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    output: "data/systems/beijing-subway/stations-osm.json",
    dryRun: false,
    raw: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (arg === "--dry-run" || arg === "-n") {
      result.dryRun = true;
    } else if (arg === "--raw" || arg === "-r") {
      result.raw = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();
  const projectRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(projectRoot, args.output);

  try {
    const data = await fetchOverpass(OVERPASS_QUERY);
    console.log(`  Total elements: ${data.elements.length}`);

    if (args.raw) {
      const rawDir = path.join(projectRoot, "data", "raw", "osm");
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(path.join(rawDir, "beijing-subway.json"), JSON.stringify(data, null, 2));
      console.log(`  Saved raw data to ${rawDir}/beijing-subway.json`);
    }

    console.log("\nProcessing OSM data...");
    const { stations, entranceCount, elevatorCount } = processOSMData(data);

    // Sort by name
    stations.sort((a, b) => a.name.localeCompare(b.name));

    // Stats
    const withEntrances = stations.filter((s) => s.entrances && s.entrances.length > 0).length;
    const withElevators = stations.filter((s) => s.elevators && s.elevators.length > 0).length;
    const transfers = stations.filter((s) => s.features.includes("transfer")).length;
    const withLines = stations.filter((s) => s.lines.length > 0).length;

    console.log("\nResults:");
    console.log(`  Stations: ${stations.length}`);
    console.log(`  With line info: ${withLines}`);
    console.log(`  With entrances: ${withEntrances}`);
    console.log(`  With elevators: ${withElevators}`);
    console.log(`  Transfer stations: ${transfers}`);
    console.log(`  Total entrances found: ${entranceCount}`);
    console.log(`  Total elevators found: ${elevatorCount}`);

    if (args.dryRun) {
      console.log("\nDry run - not writing output");
      if (stations.length > 0) {
        console.log("\nSample station:");
        console.log(JSON.stringify(stations[0], null, 2));
      }
    } else {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify({ stations }, null, 2));
      console.log(`\nWritten to: ${outputPath}`);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
