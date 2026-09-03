/**
 * One-time script to populate NYC Subway station entrances from MTA Open Data.
 *
 * Data sources:
 *   Entrances: "Subway Entrances and Exits: 2024" (NY Open Data)
 *     CSV cached at: data/.cache/mta-entrances.csv
 *   Coordinates: MTA GTFS Subway feed (https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip)
 *     Parent stops cached at: data/.cache/gtfs-stops.csv
 *
 * Usage: npx tsx scripts/generate-nyc-entrances.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Types (minimal, matching our schema)
// ---------------------------------------------------------------------------

interface Coordinates {
  lat: number;
  lng: number;
}

interface StationEntrance {
  id: string;
  name: string;
  coordinates: Coordinates;
  accessibility?: string[];
  wheelchair?: boolean;
}

interface Station {
  id: string;
  systemId: string;
  name: string;
  lines: string[];
  status: string;
  coordinates?: Coordinates;
  entrances?: StationEntrance[];
  [key: string]: unknown;
}

interface CsvRow {
  division: string;
  constituentStationName: string;
  gtfsStopId: string;
  daytimeRoutes: string[];
  entranceType: string;
  entryAllowed: boolean;
  exitAllowed: boolean;
  lat: number;
  lng: number;
}

interface GtfsStop {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "..");
const CSV_PATH = resolve(ROOT, "data/.cache/mta-entrances.csv");
const GTFS_STOPS_PATH = resolve(ROOT, "data/.cache/gtfs-stops.csv");
const STATIONS_PATH = resolve(ROOT, "data/systems/nyc-subway/stations.json");

// ---------------------------------------------------------------------------
// CSV parsing (simple, no deps)
// ---------------------------------------------------------------------------

function parseCsv(raw: string): CsvRow[] {
  const lines = raw.split("\n");
  const rows: CsvRow[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split on commas, but respect quoted fields
    const fields = splitCsvLine(line);
    if (fields.length < 14) continue;

    const division = fields[0];
    const constituentStationName = fields[5];
    const gtfsStopId = fields[7];
    const daytimeRoutes = fields[8].split(/\s+/).filter((r) => r.length > 0);
    const entranceType = fields[9];
    const entryAllowed = fields[10] === "YES";
    const exitAllowed = fields[11] === "YES";
    const lat = parseFloat(fields[12]);
    const lng = parseFloat(fields[13]);

    if (isNaN(lat) || isNaN(lng)) continue;

    rows.push({
      division,
      constituentStationName,
      gtfsStopId,
      daytimeRoutes,
      entranceType,
      entryAllowed,
      exitAllowed,
      lat,
      lng,
    });
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return (
    name
      .toLowerCase()
      // Replace dashes (en-dash, em-dash, hyphen) with space
      .replace(/[\u2013\u2014\-]/g, " ")
      // Normalize curly apostrophes to straight
      .replace(/[\u2018\u2019]/g, "'")
      // Replace slashes with space
      .replace(/\//g, " ")
      // Strip parenthetical suffixes like (110 St)
      .replace(/\([^)]*\)/g, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

// ---------------------------------------------------------------------------
// Alias table: CSV normalized name → our normalized name
// ---------------------------------------------------------------------------

const NAME_ALIASES: Record<string, string> = {
  // Abbreviation expansions
  "astor pl": "astor place",
  "christopher st stonewall": "christopher st sheridan sq",
  "w 4 st wash sq": "west 4 st washington sq",
  "w 8 st ny aquarium": "west 8 st ny aquarium",
  "42 st bryant pk": "42 st bryant park",
  "82 st jackson hts": "82 st jackson heights",
  "crown hts utica av": "crown heights utica av",
  "west farms sq e tremont av": "west farms sq east tremont av",
  "westchester sq e tremont av": "westchester sq east tremont av",
  "aqueduct n conduit av": "aqueduct north conduit av",
  "e 143 st st mary's st": "east 143 st st mary's st",
  "e 149 st": "east 149 st",
  "e 180 st": "east 180 st",

  // Spelling variants
  "beverley rd": "beverly rd",
  "86 street": "86 st",
  "34 st herald square": "34 st herald sq",

  // Suffix differences (CSV has extra info our data omits, or vice versa)
  "bedford park blvd lehman college": "bedford park blvd",
  "168 st washington hts": "168 st",
  "23 st baruch college": "23 st",
  "110 st malcolm x plaza": "110 st",

  // L train: CSV uses numbers, our data uses spelled-out names
  "1 av": "first av",
  "3 av": "third av",
  "6 av": "sixth av",

  // Station renamed or complex name differences
  "39 av dutch kills": "39 av",
  "207 st": "inwood 207 st",
  "cathedral pkwy": "cathedral pkwy 110 st",
  "park pl": "park place",
  "myrtle av": "myrtle av broadway",
  "74 st broadway": "jackson hts roosevelt av",
  "court sq 23 st": "court sq",
  "sutphin blvd archer av jfk airport": "sutphin blvd archer av jfk",

  // Combined station: CSV lists Bleecker & B'way-Lafayette separately, we have one
  "bleecker st": "bleecker st broadway lafayette st",
  "broadway lafayette st": "bleecker st broadway lafayette st",
};

// ---------------------------------------------------------------------------
// Entrance type → accessibility mapping
// ---------------------------------------------------------------------------

interface AccessibilityInfo {
  accessibility: string[];
  wheelchair: boolean;
}

const ENTRANCE_TYPE_MAP: Record<string, AccessibilityInfo> = {
  Stair: { accessibility: ["stairs-only"], wheelchair: false },
  Elevator: { accessibility: ["elevator"], wheelchair: true },
  Escalator: { accessibility: ["escalator"], wheelchair: false },
  "Stair/Escalator": { accessibility: ["escalator"], wheelchair: false },
  Ramp: { accessibility: ["stairs-only"], wheelchair: true },
  "Stair/Ramp": { accessibility: ["stairs-only"], wheelchair: true },
  "Stair/Ramp/Walkway": { accessibility: ["stairs-only"], wheelchair: true },
  "Easement - Street": { accessibility: ["stairs-only"], wheelchair: false },
  "Easement - Passage": { accessibility: ["stairs-only"], wheelchair: false },
  "Station House": { accessibility: ["stairs-only"], wheelchair: false },
  Walkway: { accessibility: ["stairs-only"], wheelchair: false },
  Overpass: { accessibility: ["stairs-only"], wheelchair: false },
  Underpass: { accessibility: ["stairs-only"], wheelchair: false },
};

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

// CSV shuttle route "S" → our internal IDs
const SHUTTLE_ROUTE_MAP: Record<string, string[]> = {
  S: ["S-42", "S-franklin", "S-rockaway"],
};

function lineOverlap(csvRoutes: string[], stationLines: string[]): number {
  let score = 0;
  for (const route of csvRoutes) {
    if (stationLines.includes(route)) {
      score++;
    }
    // Also check shuttle mappings
    const mapped = SHUTTLE_ROUTE_MAP[route];
    if (mapped) {
      for (const m of mapped) {
        if (stationLines.includes(m)) {
          score++;
        }
      }
    }
  }
  return score;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // 1. Load stations
  const stationsData = JSON.parse(readFileSync(STATIONS_PATH, "utf-8"));
  const stations: Station[] = stationsData.stations;
  const activeStations = stations.filter((s) => s.status === "active");

  // Clear any existing entrances from previous runs
  for (const station of stations) {
    delete station.entrances;
  }

  console.log(`Loaded ${stations.length} stations (${activeStations.length} active)`);

  // 2. Build station index: normalized name → station[]
  //    Also index by component parts (e.g. "Lexington Av/59 St" → also indexed under "59 st")
  const stationIndex = new Map<string, Station[]>();

  function addToIndex(key: string, station: Station) {
    if (!stationIndex.has(key)) {
      stationIndex.set(key, []);
    }
    const existing = stationIndex.get(key)!;
    if (!existing.includes(station)) {
      existing.push(station);
    }
  }

  for (const station of activeStations) {
    const norm = normalizeName(station.name);
    addToIndex(norm, station);

    // Also index by parts split on common separators in normalized form
    // e.g. "lexington av 59 st" → also index under partial matches
    // This helps match CSV "59 St" to our "Lexington Av/59 St"
    const parts = station.name.split(/[–—\-\/]/);
    if (parts.length > 1) {
      for (const part of parts) {
        const normPart = normalizeName(part);
        if (normPart.length > 0) {
          addToIndex(normPart, station);
        }
      }
    }
  }

  console.log(`Station index: ${stationIndex.size} unique normalized names`);

  // 3. Parse CSV
  const csvRaw = readFileSync(CSV_PATH, "utf-8");
  const csvRows = parseCsv(csvRaw);
  console.log(`Parsed ${csvRows.length} CSV entrance rows`);

  // 4. Filter out SIR
  const filteredRows = csvRows.filter((r) => !r.division.includes("SIR"));
  const sirCount = csvRows.length - filteredRows.length;
  console.log(`Filtered out ${sirCount} SIR rows, ${filteredRows.length} remaining`);

  // 5. Match each row to a station
  const entrancesByStationId = new Map<string, CsvRow[]>();
  const unmatched: CsvRow[] = [];

  for (const row of filteredRows) {
    let norm = normalizeName(row.constituentStationName);

    // Apply alias
    if (NAME_ALIASES[norm]) {
      norm = NAME_ALIASES[norm];
    }

    const candidates = stationIndex.get(norm);
    if (!candidates || candidates.length === 0) {
      unmatched.push(row);
      continue;
    }

    // Pick best candidate: line overlap first, then geographic proximity as tiebreaker
    let bestStation = candidates[0];

    if (candidates.length === 1) {
      // Only one candidate, use it
    } else {
      // Score each candidate by line overlap
      const scored = candidates.map((c) => ({
        station: c,
        overlap: lineOverlap(row.daytimeRoutes, c.lines),
        dist: c.coordinates
          ? haversineMeters(c.coordinates.lat, c.coordinates.lng, row.lat, row.lng)
          : Infinity,
      }));

      // Find best line overlap score
      const maxOverlap = Math.max(...scored.map((s) => s.overlap));

      // Among candidates with best overlap (or within 1), pick the closest geographically
      const topCandidates = scored.filter((s) => s.overlap >= maxOverlap - 1 && s.overlap >= 0);
      topCandidates.sort((a, b) => a.dist - b.dist);
      bestStation = topCandidates[0].station;
    }

    if (!entrancesByStationId.has(bestStation.id)) {
      entrancesByStationId.set(bestStation.id, []);
    }
    entrancesByStationId.get(bestStation.id)!.push(row);
  }

  // 6. Report
  console.log(`\nMatched entrances to ${entrancesByStationId.size} stations`);
  console.log(`Unmatched CSV rows: ${unmatched.length}`);

  if (unmatched.length > 0) {
    const uniqueUnmatched = [...new Set(unmatched.map((r) => r.constituentStationName))];
    console.log("\nUnmatched station names:");
    for (const name of uniqueUnmatched.sort()) {
      const norm = normalizeName(name);
      const aliased = NAME_ALIASES[norm] || norm;
      console.log(`  "${name}" → normalized: "${norm}" → aliased: "${aliased}"`);
    }
  }

  // 7. Build entrance objects and attach to stations
  let totalEntrances = 0;

  for (const station of stations) {
    const rows = entrancesByStationId.get(station.id);
    if (!rows || rows.length === 0) continue;

    const entrances: StationEntrance[] = [];
    // Track entrance type counts for naming
    const typeCounts: Record<string, number> = {};

    for (const row of rows) {
      const type = row.entranceType;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      const n = typeCounts[type];

      const accessInfo = ENTRANCE_TYPE_MAP[type] || {
        accessibility: ["stairs-only"],
        wheelchair: false,
      };

      // Build name
      let name = `${type} ${n}`;
      if (!row.entryAllowed) name += " (exit only)";
      if (!row.exitAllowed) name += " (entry only)";

      const entrance: StationEntrance = {
        id: `${station.id}-${entrances.length + 1}`,
        name,
        coordinates: {
          lat: parseFloat(row.lat.toFixed(7)),
          lng: parseFloat(row.lng.toFixed(7)),
        },
        accessibility: accessInfo.accessibility,
        wheelchair: accessInfo.wheelchair,
      };

      entrances.push(entrance);
    }

    station.entrances = entrances;
    totalEntrances += entrances.length;
  }

  console.log(`\nTotal entrances added: ${totalEntrances}`);

  // 8. Update station coordinates from GTFS stops.txt
  //    Use the entrance CSV's GTFS Stop ID to link each matched station to a GTFS parent stop.
  const gtfsRaw = readFileSync(GTFS_STOPS_PATH, "utf-8");
  const gtfsStops = new Map<string, GtfsStop>();
  for (const line of gtfsRaw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(",");
    // Format: stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
    const stopId = parts[0];
    const name = parts[1];
    const lat = parseFloat(parts[2]);
    const lng = parseFloat(parts[3]);
    if (!isNaN(lat) && !isNaN(lng)) {
      gtfsStops.set(stopId, { stopId, name, lat, lng });
    }
  }
  console.log(`\nLoaded ${gtfsStops.size} GTFS parent stops`);

  // Build station → GTFS stop ID mapping from the entrance CSV rows we already matched.
  // Each matched entrance row has a gtfsStopId; collect the most common one per station.
  const stationToGtfsId = new Map<string, string>();
  for (const [stationId, rows] of entrancesByStationId) {
    const idCounts = new Map<string, number>();
    for (const row of rows) {
      const id = row.gtfsStopId;
      if (id) {
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
      }
    }
    // Pick the most common GTFS stop ID
    let bestId = "";
    let bestCount = 0;
    for (const [id, count] of idCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestId = id;
      }
    }
    if (bestId) {
      stationToGtfsId.set(stationId, bestId);
    }
  }

  // Apply GTFS coordinates to stations
  let coordsUpdated = 0;
  let coordsSkipped = 0;
  for (const station of stations) {
    if (station.status !== "active") continue;

    const gtfsId = stationToGtfsId.get(station.id);
    if (!gtfsId) continue;

    const gtfsStop = gtfsStops.get(gtfsId);
    if (!gtfsStop) continue;

    if (!station.coordinates) {
      station.coordinates = { lat: gtfsStop.lat, lng: gtfsStop.lng };
      coordsUpdated++;
    } else {
      const dist = haversineMeters(
        station.coordinates.lat,
        station.coordinates.lng,
        gtfsStop.lat,
        gtfsStop.lng
      );
      // Update if GTFS coordinate differs by more than 50m (our data was approximate)
      if (dist > 50) {
        station.coordinates = {
          lat: parseFloat(gtfsStop.lat.toFixed(6)),
          lng: parseFloat(gtfsStop.lng.toFixed(6)),
        };
        coordsUpdated++;
      } else {
        coordsSkipped++;
      }
    }
  }
  console.log(`Coordinates updated: ${coordsUpdated}, unchanged (<50m): ${coordsSkipped}`);

  // 9. Merge entrances across duplicate stations (same name + lines, different IDs).
  //    Our data has some stations represented twice; entrances may have been split between them.
  //    Consolidate: each duplicate gets the union of all entrances from its twins.
  const dupeGroups = new Map<string, Station[]>();
  for (const station of activeStations) {
    const key = station.name + "|" + [...station.lines].sort().join(",");
    if (!dupeGroups.has(key)) {
      dupeGroups.set(key, []);
    }
    dupeGroups.get(key)!.push(station);
  }

  let mergedCount = 0;
  for (const [, group] of dupeGroups) {
    if (group.length <= 1) continue;

    // Collect all unique entrances across the group (dedupe by coordinates)
    const allEntrances: StationEntrance[] = [];
    const seenCoords = new Set<string>();
    for (const s of group) {
      if (!s.entrances) continue;
      for (const e of s.entrances) {
        const coordKey = `${e.coordinates.lat},${e.coordinates.lng}`;
        if (!seenCoords.has(coordKey)) {
          seenCoords.add(coordKey);
          allEntrances.push(e);
        }
      }
    }

    if (allEntrances.length === 0) continue;

    // Assign the merged entrance list to each station in the group, with correct IDs
    for (const s of group) {
      const hadEntrances = s.entrances && s.entrances.length > 0;
      s.entrances = allEntrances.map((e, i) => ({
        ...e,
        id: `${s.id}-${i + 1}`,
      }));
      if (!hadEntrances) mergedCount++;
    }
  }
  console.log(
    `Merged entrances across duplicate stations: ${mergedCount} stations gained entrances`
  );

  // 10. Write updated stations.json
  writeFileSync(STATIONS_PATH, JSON.stringify(stationsData, null, 2) + "\n", "utf-8");
  console.log(`\nWritten updated stations.json`);

  // 11. Summary stats
  const stationsWithEntrances = stations.filter(
    (s) => s.entrances && s.entrances.length > 0
  ).length;
  console.log(
    `Stations with entrances: ${stationsWithEntrances} / ${activeStations.length} active`
  );
}

main();
