#!/usr/bin/env npx tsx
/**
 * Fetch Stuttgart Stadtbahn station data from OpenStreetMap via Overpass API.
 * Extracts: station coordinates, line assignments, entrances, accessibility features.
 *
 * Usage:
 *   npx tsx scripts/fetch-stuttgart-osm.ts
 *
 * Options:
 *   --output, -o    Output file path (default: data/systems/stuttgart-light-rail/stations-osm.json)
 *   --dry-run, -n   Don't write output, just print stats
 *   --raw, -r       Save raw Overpass response to data/raw/osm/
 */

import * as fs from "fs";
import * as path from "path";

// Overpass API endpoints (tried in order until one succeeds)
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Stuttgart metropolitan area bounding box: south,west,north,east
const STUTTGART_BBOX = "48.65,9.00,48.90,9.40";

// Stadtbahn line ref → internal ID mapping
const LINE_REF_MAP: Record<string, string> = {
  U1: "u1",
  U2: "u2",
  U3: "u3",
  U4: "u4",
  U5: "u5",
  U6: "u6",
  U7: "u7",
  U8: "u8",
  U9: "u9",
  U11: "u11",
  U12: "u12",
  U13: "u13",
  U14: "u14",
  U15: "u15",
  U16: "u16",
  U19: "u19",
};

const OVERPASS_QUERY = `
[out:json][timeout:180][bbox:${STUTTGART_BBOX}];

// Get Stadtbahn / light-rail route relations (VVS/SSB operated)
(
  relation["route"="light_rail"]["operator"~"SSB|Stuttgarter Straßenbahnen",i];
  relation["route"="light_rail"]["network"~"VVS|SSB",i];
  relation["route"="tram"]["operator"~"SSB|Stuttgarter Straßenbahnen",i]["ref"~"^U"];
)->.routes;

// Output route relation bodies (contains member lists needed for line assignment)
.routes out body;

// Fetch ALL direct node members of those route relations.
// This guarantees we capture every stop position regardless of which tags
// (network, operator, railway) the individual node happens to carry.
node(r.routes);
out body qt;

// Get underground entrance nodes
node["railway"="subway_entrance"];
out body qt;

// Get elevator nodes near underground sections
node["highway"="elevator"];
out body qt;
`;

// ── Types ────────────────────────────────────────────────────────────────────

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

interface Station {
  id: string;
  systemId: string;
  name: string;
  osmId: number;
  lines: string[];
  status: string;
  coordinates: { lat: number; lng: number };
  features: string[];
  description?: string;
  entrances?: Entrance[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchOverpass(query: string): Promise<OSMResponse> {
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Querying ${endpoint}...`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

function isNode(el: OSMNode | OSMRelation): el is OSMNode {
  return el.type === "node";
}

function isRelation(el: OSMNode | OSMRelation): el is OSMRelation {
  return el.type === "relation";
}

/** Convert a German station name to a URL-safe ID.
 *  Parenthetical subtitles like "(Arnulf-Klett-Platz)" are stripped so the
 *  ID stays stable even if OSM uses the long form of the name.
 */
function nameToId(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ") // remove (parenthetical) parts
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extract the Stadtbahn line ID from a relation's ref tag (e.g. "U1" → "u1"). */
function extractLineId(tags: Record<string, string>): string | undefined {
  const ref = (tags["ref"] || "").toUpperCase().trim();
  return LINE_REF_MAP[ref];
}

/**
 * Return a name-key suitable for deduplication: strips parenthetical
 * suffixes such as "(Arnulf-Klett-Platz)" so that surface and underground
 * stop-position nodes for the same station collapse into one entry.
 */
function normalizeNameKey(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, "")
    .trim()
    .toLowerCase();
}

/** Find entrance nodes within maxDist degrees of a station node. */
function findNearbyEntrances(
  station: OSMNode,
  entrances: OSMNode[],
  maxDist = 0.003 // ~300 m in degrees
): Entrance[] {
  const seen = new Set<number>();
  const result: Entrance[] = [];
  for (const entrance of entrances) {
    if (seen.has(entrance.id)) continue; // deduplicate by OSM node ID
    const dist = Math.sqrt(
      Math.pow(entrance.lat - station.lat, 2) + Math.pow(entrance.lon - station.lon, 2)
    );
    if (dist <= maxDist) {
      seen.add(entrance.id);
      const t = entrance.tags || {};
      result.push({
        id: `osm-${entrance.id}`,
        name: t["ref"] || t["name"] || `Eingang ${result.length + 1}`,
        coordinates: { lat: entrance.lat, lng: entrance.lon },
        ref: t["ref"],
        wheelchair: t["wheelchair"] === "yes",
      });
    }
  }
  return result;
}

/** Check whether an elevator node is within maxDist degrees of a station. */
function hasNearbyElevator(
  station: OSMNode,
  elevators: OSMNode[],
  maxDist = 0.002 // ~200 m
): boolean {
  return elevators.some(
    (el) =>
      Math.sqrt(Math.pow(el.lat - station.lat, 2) + Math.pow(el.lon - station.lon, 2)) <= maxDist
  );
}

// ── Core processing ───────────────────────────────────────────────────────────

function processOSMData(data: OSMResponse): {
  stations: Station[];
  skipped: number;
} {
  const stopNodes: OSMNode[] = [];
  const entranceNodes: OSMNode[] = [];
  const elevatorNodes: OSMNode[] = [];
  const lineRelations: OSMRelation[] = [];

  const seenNodeIds = new Set<number>();

  for (const el of data.elements) {
    if (isNode(el)) {
      const t = el.tags || {};
      const isPlatform = t["public_transport"] === "platform" || t["railway"] === "platform";
      const isStopPosition =
        t["public_transport"] === "stop_position" ||
        t["railway"] === "tram_stop" ||
        t["railway"] === "stop" ||
        t["railway"] === "station";

      if (isStopPosition && !isPlatform && t["bus"] !== "yes" && t["ferry"] !== "yes") {
        // Overpass may return the same node multiple times across query blocks;
        // deduplicate here so the nodeLines merge step doesn't double-count.
        if (!seenNodeIds.has(el.id)) {
          seenNodeIds.add(el.id);
          stopNodes.push(el);
        }
      } else if (t["railway"] === "subway_entrance") {
        entranceNodes.push(el);
      } else if (t["highway"] === "elevator") {
        elevatorNodes.push(el);
      }
    } else if (isRelation(el)) {
      const t = el.tags || {};
      // Only keep relations whose ref matches a known Stadtbahn line
      if (extractLineId(t)) {
        lineRelations.push(el);
      }
    }
  }

  console.log(`  Stop candidates:  ${stopNodes.length}`);
  console.log(`  Entrances found:  ${entranceNodes.length}`);
  console.log(`  Elevators found:  ${elevatorNodes.length}`);
  console.log(`  Line relations:   ${lineRelations.length}`);

  // Build node-ID → line IDs map from route relation member lists
  const nodeLines = new Map<number, Set<string>>();
  for (const relation of lineRelations) {
    const lineId = extractLineId(relation.tags || {});
    if (!lineId || !relation.members) continue;
    for (const member of relation.members) {
      if (
        member.type === "node" &&
        (member.role === "stop" ||
          member.role === "stop_entry_only" ||
          member.role === "stop_exit_only" ||
          member.role === "")
      ) {
        if (!nodeLines.has(member.ref)) nodeLines.set(member.ref, new Set());
        nodeLines.get(member.ref)!.add(lineId);
      }
    }
  }

  // Deduplicate stops so we get one entry per physical station.
  //
  // Key insight: the same station can appear as several OSM nodes with
  // slightly different names (e.g. "Hauptbahnhof" for the underground
  // stop-position and "Hauptbahnhof (Arnulf-Klett-Platz)" for the surface
  // tram_stop).  We normalise the name (strip parenthetical suffixes) to
  // produce a merge key, then keep the shortest / simplest name variant as
  // the canonical display name.
  const byName = new Map<string, { node: OSMNode; lines: Set<string>; canonicalName: string }>();

  let skipped = 0;
  for (const node of stopNodes) {
    const name = (node.tags?.["name"] || node.tags?.["name:de"] || "").trim();
    if (!name) {
      skipped++;
      continue;
    }

    const linesFromRelations = nodeLines.get(node.id) || new Set<string>();

    // Skip stop nodes that belong to no known Stadtbahn line
    if (linesFromRelations.size === 0) {
      skipped++;
      continue;
    }

    const key = normalizeNameKey(name);
    // Base name = full name with parenthetical stripped.  Used as canonical only
    // when two nodes with DIFFERENT parentheticals collide under the same key
    // (e.g. "Berliner Platz (Hohe Straße)" + "Berliner Platz (Liederhalle)"
    //  → "Berliner Platz").  Nodes that share the exact same full name (e.g.
    // two direction-specific nodes for "Ruhbank (Fernsehturm)") keep the full
    // name verbatim.
    const baseName = name.replace(/\s*\([^)]*\)\s*/g, "").trim();

    if (byName.has(key)) {
      const existing = byName.get(key)!;
      // Merge line sets
      linesFromRelations.forEach((l) => existing.lines.add(l));
      // Strip to base name only when the incoming name differs from the already-
      // stored canonical (different parentheticals → same physical station).
      if (name !== existing.canonicalName && existing.canonicalName !== baseName) {
        existing.canonicalName = baseName;
        existing.node = node;
      }
    } else {
      byName.set(key, { node, lines: linesFromRelations, canonicalName: name });
    }
  }

  // Build station objects
  const stations: Station[] = [];

  for (const [, { node, lines, canonicalName }] of byName) {
    const name = canonicalName;
    const t = node.tags || {};
    const features: string[] = [];

    const entrances = findNearbyEntrances(node, entranceNodes);

    if (entrances.length > 0) features.push("escalator");
    if (hasNearbyElevator(node, elevatorNodes)) features.push("elevator");
    if (
      t["wheelchair"] === "yes" ||
      t["wheelchair:description"] ||
      entrances.some((e) => e.wheelchair)
    ) {
      features.push("wheelchair-accessible");
    }
    if (lines.size > 1) features.push("transfer");
    features.push("fare-vending");

    const sortedLines = Array.from(lines).sort();

    const station: Station = {
      id: nameToId(name),
      systemId: "stuttgart-light-rail",
      name,
      osmId: node.id,
      lines: sortedLines,
      status: t["disused"] ? "closed" : "active",
      coordinates: { lat: node.lat, lng: node.lon },
      features: [...new Set(features)].sort(),
    };

    if (entrances.length > 0) station.entrances = entrances;

    stations.push(station);
  }

  // Sort by importance: most lines served first, then alphabetically
  stations.sort((a, b) => b.lines.length - a.lines.length || a.name.localeCompare(b.name, "de"));

  return { stations, skipped };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    output: "data/systems/stuttgart-light-rail/stations.json",
    dryRun: false,
    raw: false,
    fromCache: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (arg === "--dry-run" || arg === "-n") {
      result.dryRun = true;
    } else if (arg === "--raw" || arg === "-r") {
      result.raw = true;
    } else if (arg === "--from-cache" || arg === "-C") {
      result.fromCache = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();
  const projectRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(projectRoot, args.output);

  const rawPath = path.join(projectRoot, "data", "raw", "osm", "stuttgart-light-rail.json");

  let data: OSMResponse;
  if (args.fromCache) {
    console.log(`Using cached raw data from: ${rawPath}\n`);
    data = JSON.parse(fs.readFileSync(rawPath, "utf8")) as OSMResponse;
  } else {
    console.log("Fetching Stuttgart Stadtbahn data from OpenStreetMap...\n");
    data = await fetchOverpass(OVERPASS_QUERY);
  }
  console.log(`\nTotal OSM elements: ${data.elements.length}`);

  if (args.raw && !args.fromCache) {
    const rawDir = path.dirname(rawPath);
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(rawPath, JSON.stringify(data, null, 2));
    console.log(`Saved raw OSM data to: ${rawPath}`);
  }

  console.log("\nProcessing OSM data...");
  const { stations, skipped } = processOSMData(data);

  const withEntrances = stations.filter((s) => s.entrances && s.entrances.length > 0).length;
  const withElevator = stations.filter((s) => s.features.includes("elevator")).length;
  const transfers = stations.filter((s) => s.features.includes("transfer")).length;

  console.log("\nResults:");
  console.log(`  Stations processed: ${stations.length}`);
  console.log(`  Skipped (no name / no known line): ${skipped}`);
  console.log(`  Transfer stations:  ${transfers}`);
  console.log(`  With entrances:     ${withEntrances}`);
  console.log(`  With elevator:      ${withElevator}`);

  // Compare with previous output
  const newIds = new Set(stations.map((s) => s.id));
  let prevIds = new Set<string>();
  try {
    const prev = JSON.parse(fs.readFileSync(outputPath, "utf8")) as {
      stations: { id: string; name: string }[];
    };
    prevIds = new Set(prev.stations.map((s) => s.id));
  } catch {
    // No previous file
  }

  if (prevIds.size > 0) {
    const added = stations.filter((s) => !prevIds.has(s.id));
    const removedIds = [...prevIds].filter((id) => !newIds.has(id));
    const unchanged = stations.filter((s) => prevIds.has(s.id)).length;
    console.log("\nComparison with previous output:");
    console.log(
      `  Added   (${added.length}):  ${
        added.length > 0 ? added.map((s) => s.name).join(", ") : "—"
      }`
    );
    console.log(
      `  Removed (${removedIds.length}):  ${removedIds.length > 0 ? removedIds.join(", ") : "—"}`
    );
    console.log(`  Unchanged: ${unchanged}`);
  } else {
    console.log("\nNo existing file to compare against.");
  }

  if (args.dryRun) {
    console.log("\nDry run — not writing output.");
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ stations }, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
