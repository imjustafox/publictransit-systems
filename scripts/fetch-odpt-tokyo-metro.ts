#!/usr/bin/env npx tsx
/**
 * Fetch Tokyo Metro station data from ODPT API including entrances, elevators, and escalators.
 *
 * Usage:
 *   npx tsx scripts/fetch-odpt-tokyo-metro.ts --api-key YOUR_API_KEY
 *
 * Or set environment variable:
 *   export ODPT_API_KEY=your_key
 *   npx tsx scripts/fetch-odpt-tokyo-metro.ts
 *
 * Options:
 *   --api-key, -k   ODPT API key
 *   --output, -o    Output file path (default: data/systems/tokyo-metro/stations.json)
 *   --dry-run, -n   Don't write output, just print stats
 *   --raw, -r       Save raw API responses for debugging
 */

import * as fs from "fs";
import * as path from "path";

// ODPT API endpoints
const ODPT_BASE_URL = "https://api.odpt.org/api/v4";
const TOKYO_METRO_OPERATOR = "odpt.Operator:TokyoMetro";

// Line code mapping
const LINE_CODES: Record<string, { id: string; code: string }> = {
  "odpt.Railway:TokyoMetro.Ginza": { id: "ginza", code: "G" },
  "odpt.Railway:TokyoMetro.Marunouchi": { id: "marunouchi", code: "M" },
  "odpt.Railway:TokyoMetro.MarunouchiBranch": { id: "marunouchi-branch", code: "Mb" },
  "odpt.Railway:TokyoMetro.Hibiya": { id: "hibiya", code: "H" },
  "odpt.Railway:TokyoMetro.Tozai": { id: "tozai", code: "T" },
  "odpt.Railway:TokyoMetro.Chiyoda": { id: "chiyoda", code: "C" },
  "odpt.Railway:TokyoMetro.Yurakucho": { id: "yurakucho", code: "Y" },
  "odpt.Railway:TokyoMetro.Hanzomon": { id: "hanzomon", code: "Z" },
  "odpt.Railway:TokyoMetro.Namboku": { id: "namboku", code: "N" },
  "odpt.Railway:TokyoMetro.Fukutoshin": { id: "fukutoshin", code: "F" },
};

// Types for ODPT API responses
interface ODPTStation {
  "owl:sameAs": string;
  "dc:title": string;
  "odpt:stationTitle"?: { ja?: string; en?: string };
  "odpt:stationCode"?: string;
  "odpt:railway": string;
  "odpt:operator": string;
  "odpt:stationFacility"?: string;
  "geo:lat"?: number;
  "geo:long"?: number;
}

interface ODPTEntrance {
  "owl:sameAs"?: string;
  "dc:title"?: string;
  "geo:lat"?: number;
  "geo:long"?: number;
  "odpt:elevatorAvailable"?: boolean;
  "odpt:escalatorAvailable"?: boolean;
  "odpt:wheelchairAccessible"?: boolean;
  "ug:region"?: { "ug:floor"?: number };
}

interface ODPTElevator {
  "owl:sameAs"?: string;
  "dc:title"?: string;
  "odpt:fromFloor"?: number;
  "odpt:toFloor"?: number;
  "geo:lat"?: number;
  "geo:long"?: number;
}

interface ODPTEscalator {
  "owl:sameAs"?: string;
  "odpt:direction"?: string;
  "odpt:fromFloor"?: number;
  "odpt:toFloor"?: number;
  "geo:lat"?: number;
  "geo:long"?: number;
}

interface ODPTFacility {
  "owl:sameAs": string;
  "odpt:entrance"?: ODPTEntrance[];
  "odpt:elevator"?: ODPTElevator[];
  "odpt:escalator"?: ODPTEscalator[];
  "odpt:toilet"?: Array<{
    "owl:sameAs"?: string;
    "odpt:wheelchairAccessible"?: boolean;
    "geo:lat"?: number;
    "geo:long"?: number;
  }>;
  "odpt:platformScreenDoor"?: boolean;
  "odpt:barrierFreeFacility"?: boolean;
}

// Output types
interface Coordinates {
  lat: number;
  lng: number;
}

interface Entrance {
  id: string;
  name: string;
  coordinates?: Coordinates;
  floor?: number;
  accessibility?: string[];
}

interface Elevator {
  id: string;
  name?: string;
  fromFloor?: number;
  toFloor?: number;
  coordinates?: Coordinates;
}

interface Escalator {
  id: string;
  direction?: string;
  fromFloor?: number;
  toFloor?: number;
  coordinates?: Coordinates;
}

interface Station {
  id: string;
  systemId: string;
  name: string;
  localName?: string;
  code?: string;
  codes?: string[];
  lines: string[];
  status: string;
  coordinates?: Coordinates;
  features: string[];
  entrances?: Entrance[];
  elevators?: Elevator[];
  escalators?: Escalator[];
}

async function fetchJson<T>(url: string, apiKey: string): Promise<T> {
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}acl:consumerKey=${apiKey}`;

  const response = await fetch(fullUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function fetchStations(apiKey: string): Promise<ODPTStation[]> {
  console.log("Fetching Tokyo Metro stations...");
  const url = `${ODPT_BASE_URL}/odpt:Station?odpt:operator=${TOKYO_METRO_OPERATOR}`;
  return fetchJson<ODPTStation[]>(url, apiKey);
}

async function fetchStationFacilities(apiKey: string): Promise<ODPTFacility[]> {
  console.log("Fetching station facilities...");
  const url = `${ODPT_BASE_URL}/odpt:StationFacility?odpt:operator=${TOKYO_METRO_OPERATOR}`;
  return fetchJson<ODPTFacility[]>(url, apiKey);
}

function getLineId(railway: string): string {
  if (railway in LINE_CODES) {
    return LINE_CODES[railway].id;
  }
  return railway.split(".").pop()?.toLowerCase() || railway;
}

function parseEntrance(entrance: ODPTEntrance): Entrance {
  const result: Entrance = {
    id: (entrance["owl:sameAs"] || "").split(":").pop()?.replace(/\./g, "-").toLowerCase() || "",
    name: entrance["dc:title"] || "",
  };

  if (entrance["geo:lat"] && entrance["geo:long"]) {
    result.coordinates = {
      lat: entrance["geo:lat"],
      lng: entrance["geo:long"],
    };
  }

  if (entrance["ug:region"]?.["ug:floor"]) {
    result.floor = entrance["ug:region"]["ug:floor"];
  }

  const accessibility: string[] = [];
  if (entrance["odpt:elevatorAvailable"]) accessibility.push("elevator");
  if (entrance["odpt:escalatorAvailable"]) accessibility.push("escalator");
  if (entrance["odpt:wheelchairAccessible"]) accessibility.push("wheelchair");

  if (accessibility.length > 0) {
    result.accessibility = accessibility;
  }

  return result;
}

function parseElevator(elevator: ODPTElevator): Elevator {
  const result: Elevator = {
    id: (elevator["owl:sameAs"] || "").split(":").pop() || "",
    name: elevator["dc:title"],
  };

  if (elevator["odpt:fromFloor"]) result.fromFloor = elevator["odpt:fromFloor"];
  if (elevator["odpt:toFloor"]) result.toFloor = elevator["odpt:toFloor"];

  if (elevator["geo:lat"] && elevator["geo:long"]) {
    result.coordinates = {
      lat: elevator["geo:lat"],
      lng: elevator["geo:long"],
    };
  }

  return result;
}

function parseEscalator(escalator: ODPTEscalator): Escalator {
  const result: Escalator = {
    id: (escalator["owl:sameAs"] || "").split(":").pop() || "",
    direction: escalator["odpt:direction"],
  };

  if (escalator["odpt:fromFloor"]) result.fromFloor = escalator["odpt:fromFloor"];
  if (escalator["odpt:toFloor"]) result.toFloor = escalator["odpt:toFloor"];

  if (escalator["geo:lat"] && escalator["geo:long"]) {
    result.coordinates = {
      lat: escalator["geo:lat"],
      lng: escalator["geo:long"],
    };
  }

  return result;
}

function buildStation(stationData: ODPTStation, facilitiesMap: Map<string, ODPTFacility>): Station {
  const stationCode = stationData["odpt:stationCode"] || "";
  const railway = stationData["odpt:railway"];
  const stationName = stationData["dc:title"].replace(/ /g, "-").toLowerCase();
  const uniqueId = stationCode ? `${stationName}-${stationCode.toLowerCase()}` : stationName;

  const station: Station = {
    id: uniqueId,
    systemId: "tokyo-metro",
    name: stationData["dc:title"],
    localName: stationData["odpt:stationTitle"]?.ja,
    code: stationCode,
    lines: [getLineId(railway)],
    status: "active",
    features: ["fare-vending"],
  };

  if (stationData["geo:lat"] && stationData["geo:long"]) {
    station.coordinates = {
      lat: stationData["geo:lat"],
      lng: stationData["geo:long"],
    };
  }

  const features = new Set(station.features);
  const facilityId = stationData["odpt:stationFacility"];

  if (facilityId && facilitiesMap.has(facilityId)) {
    const facilityData = facilitiesMap.get(facilityId)!;

    // Parse entrances
    if (facilityData["odpt:entrance"]) {
      const entrances: Entrance[] = [];
      for (const entrance of facilityData["odpt:entrance"]) {
        const parsed = parseEntrance(entrance);
        if (parsed.name) {
          entrances.push(parsed);
        }
        if (parsed.accessibility?.includes("elevator")) features.add("elevator");
        if (parsed.accessibility?.includes("escalator")) features.add("escalator");
      }
      if (entrances.length > 0) station.entrances = entrances;
    }

    // Parse elevators
    if (facilityData["odpt:elevator"]) {
      const elevators = facilityData["odpt:elevator"].map(parseElevator);
      if (elevators.length > 0) {
        features.add("elevator");
        station.elevators = elevators;
      }
    }

    // Parse escalators
    if (facilityData["odpt:escalator"]) {
      const escalators = facilityData["odpt:escalator"].map(parseEscalator);
      if (escalators.length > 0) {
        features.add("escalator");
        station.escalators = escalators;
      }
    }

    if (facilityData["odpt:platformScreenDoor"]) {
      features.add("platform-screen-doors");
    }

    if (facilityData["odpt:barrierFreeFacility"]) {
      features.add("barrier-free");
    }
  }

  station.features = Array.from(features).sort();
  return station;
}

function mergeTransferStations(stations: Station[]): Station[] {
  const byName = new Map<string, Station[]>();

  for (const station of stations) {
    const name = station.name;
    if (!byName.has(name)) {
      byName.set(name, []);
    }
    byName.get(name)!.push(station);
  }

  const merged: Station[] = [];

  for (const [name, stationList] of byName) {
    if (stationList.length === 1) {
      merged.push(stationList[0]);
    } else {
      // Merge multiple stations
      const base = { ...stationList[0] };

      const allLines = new Set<string>();
      const allCodes = new Set<string>();
      const allEntrances: Entrance[] = [];
      const allElevators: Elevator[] = [];
      const allEscalators: Escalator[] = [];
      const allFeatures = new Set<string>();

      for (const s of stationList) {
        s.lines.forEach((l) => allLines.add(l));
        if (s.code) allCodes.add(s.code);
        if (s.entrances) allEntrances.push(...s.entrances);
        if (s.elevators) allElevators.push(...s.elevators);
        if (s.escalators) allEscalators.push(...s.escalators);
        s.features.forEach((f) => allFeatures.add(f));
      }

      base.id = name.replace(/ /g, "-").toLowerCase();
      base.lines = Array.from(allLines).sort();
      base.codes = Array.from(allCodes).sort();
      delete base.code;

      allFeatures.add("transfer");
      base.features = Array.from(allFeatures).sort();

      if (allEntrances.length > 0) base.entrances = allEntrances;
      if (allElevators.length > 0) base.elevators = allElevators;
      if (allEscalators.length > 0) base.escalators = allEscalators;

      merged.push(base);
    }
  }

  return merged;
}

function parseArgs(): {
  apiKey?: string;
  output: string;
  dryRun: boolean;
  raw: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    apiKey: process.env.ODPT_API_KEY,
    output: "data/systems/tokyo-metro/stations.json",
    dryRun: false,
    raw: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--api-key" || arg === "-k") {
      result.apiKey = args[++i];
    } else if (arg === "--output" || arg === "-o") {
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

  if (!args.apiKey) {
    console.error("Error: API key required. Use --api-key or set ODPT_API_KEY");
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(projectRoot, args.output);

  try {
    // Fetch data
    const stationsRaw = await fetchStations(args.apiKey);
    console.log(`  Found ${stationsRaw.length} station records`);

    await new Promise((r) => setTimeout(r, 500)); // Rate limit

    const facilitiesRaw = await fetchStationFacilities(args.apiKey);
    console.log(`  Found ${facilitiesRaw.length} facility records`);

    // Save raw data if requested
    if (args.raw) {
      const rawDir = path.join(projectRoot, "data", "raw", "odpt");
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(path.join(rawDir, "stations.json"), JSON.stringify(stationsRaw, null, 2));
      fs.writeFileSync(
        path.join(rawDir, "facilities.json"),
        JSON.stringify(facilitiesRaw, null, 2)
      );
      console.log(`  Saved raw data to ${rawDir}`);
    }

    // Build facilities map
    const facilitiesMap = new Map<string, ODPTFacility>();
    for (const facility of facilitiesRaw) {
      facilitiesMap.set(facility["owl:sameAs"], facility);
    }

    // Build stations
    console.log("Processing stations...");
    let stations = stationsRaw.map((s) => buildStation(s, facilitiesMap));

    // Merge transfer stations
    console.log("Merging transfer stations...");
    stations = mergeTransferStations(stations);

    // Sort by name
    stations.sort((a, b) => a.name.localeCompare(b.name));

    // Stats
    const totalEntrances = stations.reduce((sum, s) => sum + (s.entrances?.length || 0), 0);
    const totalElevators = stations.reduce((sum, s) => sum + (s.elevators?.length || 0), 0);
    const totalEscalators = stations.reduce((sum, s) => sum + (s.escalators?.length || 0), 0);
    const transferStations = stations.filter((s) => s.features.includes("transfer")).length;

    console.log("\nResults:");
    console.log(`  Stations: ${stations.length}`);
    console.log(`  Transfer stations: ${transferStations}`);
    console.log(`  Entrances: ${totalEntrances}`);
    console.log(`  Elevators: ${totalElevators}`);
    console.log(`  Escalators: ${totalEscalators}`);

    if (args.dryRun) {
      console.log("\nDry run - not writing output file");
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
