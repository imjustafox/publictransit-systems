#!/usr/bin/env npx tsx
/**
 * Scrape Beijing Subway station data from bjsubway.com
 * Extracts: coordinates, entrances, elevators, escalators, accessibility features
 *
 * Usage:
 *   npx tsx scripts/fetch-beijing-bjsubway.ts
 *
 * Options:
 *   --output, -o    Output file path (default: data/systems/beijing-subway/stations.json)
 *   --dry-run, -n   Don't write output, just print stats
 *   --line, -l      Only fetch specific line (e.g., "line1")
 *   --delay, -d     Delay between requests in ms (default: 500)
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://www.bjsubway.com";

// Line configuration with index page paths
const LINES: Record<string, { id: string; name: string; path: string }> = {
  line1: { id: "line-1", name: "Line 1", path: "/station/xltcx/line1/" },
  line2: { id: "line-2", name: "Line 2", path: "/station/xltcx/line2/" },
  line4: { id: "line-4", name: "Line 4", path: "/station/xltcx/line4/" },
  line5: { id: "line-5", name: "Line 5", path: "/station/xltcx/line5/" },
  line6: { id: "line-6", name: "Line 6", path: "/station/xltcx/line6/" },
  line7: { id: "line-7", name: "Line 7", path: "/station/xltcx/line7/" },
  line8: { id: "line-8", name: "Line 8", path: "/station/xltcx/line8/" },
  line9: { id: "line-9", name: "Line 9", path: "/station/xltcx/line9/" },
  line10: { id: "line-10", name: "Line 10", path: "/station/xltcx/line10/" },
  line11: { id: "line-11", name: "Line 11", path: "/station/xltcx/line11/" },
  line13: { id: "line-13", name: "Line 13", path: "/station/xltcx/line13/" },
  line14: { id: "line-14", name: "Line 14", path: "/station/xltcx/line14/" },
  line15: { id: "line-15", name: "Line 15", path: "/station/xltcx/line15/" },
  line16: { id: "line-16", name: "Line 16", path: "/station/xltcx/line16/" },
  line17: { id: "line-17", name: "Line 17", path: "/station/xltcx/line17/" },
  line19: { id: "line-19", name: "Line 19", path: "/station/xltcx/line19/" },
  batong: { id: "batong", name: "Batong Line", path: "/station/xltcx/btx/" },
  changping: { id: "changping", name: "Changping Line", path: "/station/xltcx/cpx/" },
  fangshan: { id: "fangshan", name: "Fangshan Line", path: "/station/xltcx/fsx/" },
  yizhuang: { id: "yizhuang", name: "Yizhuang Line", path: "/station/xltcx/yzx/" },
  daxing: { id: "daxing", name: "Daxing Line", path: "/station/xltcx/dxx/" },
  airport: { id: "capital-airport-express", name: "Airport Express", path: "/station/xltcx/jcx/" },
  s1: { id: "s1", name: "S1 Line", path: "/station/xltcx/s1x/" },
};

interface Entrance {
  id: string;
  name: string;
  features?: string[];
}

interface Elevator {
  id: string;
  location: string;
  type?: string;
}

interface Station {
  id: string;
  systemId: string;
  name: string;
  localName: string;
  lines: string[];
  status: string;
  coordinates?: { lat: number; lng: number };
  features: string[];
  entrances?: Entrance[];
  elevators?: Elevator[];
  escalatorLocations?: string[];
  facilities?: string[];
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TransitDataBot/1.0)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.text();
}

function extractCoordinates(html: string): { lat: number; lng: number } | undefined {
  // Look for: var x = 116.190337; var y = 39.907450;
  const xMatch = html.match(/var\s+x\s*=\s*([\d.]+)/);
  const yMatch = html.match(/var\s+y\s*=\s*([\d.]+)/);

  if (xMatch && yMatch) {
    return {
      lng: parseFloat(xMatch[1]),
      lat: parseFloat(yMatch[1]),
    };
  }
  return undefined;
}

function extractStationName(html: string): { name: string; localName: string } {
  // Look for station name in title or h1
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);

  let localName = "";
  if (titleMatch) {
    // Title format: "站名-北京地铁" or similar
    localName = titleMatch[1].split(/[-_]/)[0].trim();
  } else if (h1Match) {
    localName = h1Match[1].trim();
  }

  // Try to find English name
  const engMatch = html.match(/[\u4e00-\u9fa5]+\s*[（(]([A-Za-z\s]+)[)）]/);
  const name = engMatch ? engMatch[1].trim() : pinyinFromChinese(localName);

  return { name, localName };
}

function pinyinFromChinese(chinese: string): string {
  // Basic conversion - in production you'd use a proper pinyin library
  // This just returns the Chinese for now
  return chinese;
}

function extractFacilities(html: string): {
  features: string[];
  entrances: Entrance[];
  elevators: Elevator[];
  escalatorLocations: string[];
} {
  const features: Set<string> = new Set(["fare-vending"]);
  const entrances: Entrance[] = [];
  const elevators: Elevator[] = [];
  const escalatorLocations: string[] = [];

  // Check for elevators
  if (html.includes("ico_s11") || html.includes("电梯") || html.includes("直梯")) {
    features.add("elevator");

    // Try to extract elevator locations
    const elevatorMatches = html.matchAll(/([A-D][1-2]?口?|站台|站厅)[^<]*(?:电梯|直梯)/g);
    for (const match of elevatorMatches) {
      elevators.push({
        id: `elevator-${elevators.length + 1}`,
        location: match[1],
      });
    }

    // Also check reverse pattern
    const reverseMatches = html.matchAll(/(?:电梯|直梯)[^<]*([A-D][1-2]?口)/g);
    for (const match of reverseMatches) {
      const exists = elevators.some((e) => e.location === match[1]);
      if (!exists) {
        elevators.push({
          id: `elevator-${elevators.length + 1}`,
          location: match[1],
        });
      }
    }
  }

  // Check for escalators
  if (html.includes("扶梯") || html.includes("自动扶梯")) {
    features.add("escalator");

    const escalatorMatches = html.matchAll(/([A-D][1-2]?口?)[^<]*扶梯/g);
    for (const match of escalatorMatches) {
      if (!escalatorLocations.includes(match[1])) {
        escalatorLocations.push(match[1]);
      }
    }
  }

  // Check for AED
  if (html.includes("ico_aed") || html.includes("AED") || html.includes("除颤")) {
    features.add("aed");
  }

  // Check for accessible facilities
  if (html.includes("无障碍") || html.includes("轮椅") || html.includes("盲道")) {
    features.add("accessible");
  }

  // Check for restrooms
  if (html.includes("卫生间") || html.includes("洗手间") || html.includes("厕所")) {
    features.add("restroom");
  }

  // Extract entrance info
  const entrancePattern = /([A-D][1-2]?)(?:口|出入口)/g;
  const entranceSet = new Set<string>();
  let match;
  while ((match = entrancePattern.exec(html)) !== null) {
    entranceSet.add(match[1]);
  }

  for (const exit of entranceSet) {
    const entrance: Entrance = {
      id: `entrance-${exit.toLowerCase()}`,
      name: `Exit ${exit}`,
    };

    // Check if this entrance has specific features
    const exitFeatures: string[] = [];
    const exitRegion = html.slice(
      Math.max(0, html.indexOf(exit + "口") - 100),
      html.indexOf(exit + "口") + 200
    );

    if (exitRegion.includes("电梯") || exitRegion.includes("直梯")) {
      exitFeatures.push("elevator");
    }
    if (exitRegion.includes("扶梯")) {
      exitFeatures.push("escalator");
    }
    if (exitFeatures.length > 0) {
      entrance.features = exitFeatures;
    }

    entrances.push(entrance);
  }

  // Sort entrances
  entrances.sort((a, b) => a.name.localeCompare(b.name));

  return {
    features: Array.from(features).sort(),
    entrances,
    elevators,
    escalatorLocations,
  };
}

async function fetchStationUrls(lineUrl: string): Promise<string[]> {
  console.log(`  Fetching station list from ${lineUrl}`);
  const html = await fetchHtml(lineUrl);

  // Extract station page URLs
  const urlPattern = /href="([^"]+\.html\?sk=1)"/g;
  const urls: string[] = [];
  let match;

  while ((match = urlPattern.exec(html)) !== null) {
    let url = match[1];
    if (!url.startsWith("http")) {
      url = BASE_URL + (url.startsWith("/") ? url : "/" + url);
    }
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

async function fetchStation(url: string, lineId: string): Promise<Station | null> {
  try {
    const html = await fetchHtml(url);

    const { name, localName } = extractStationName(html);
    const coordinates = extractCoordinates(html);
    const { features, entrances, elevators, escalatorLocations } = extractFacilities(html);

    const station: Station = {
      id: localName.toLowerCase().replace(/\s+/g, "-"),
      systemId: "beijing-subway",
      name,
      localName,
      lines: [lineId],
      status: "active",
      features,
    };

    if (coordinates) {
      station.coordinates = coordinates;
    }

    if (entrances.length > 0) {
      station.entrances = entrances;
    }

    if (elevators.length > 0) {
      station.elevators = elevators;
    }

    if (escalatorLocations.length > 0) {
      station.escalatorLocations = escalatorLocations;
    }

    return station;
  } catch (error) {
    console.error(`  Error fetching ${url}:`, error);
    return null;
  }
}

function mergeStations(stations: Station[]): Station[] {
  const byName = new Map<string, Station[]>();

  for (const station of stations) {
    const key = station.localName;
    if (!byName.has(key)) {
      byName.set(key, []);
    }
    byName.get(key)!.push(station);
  }

  const merged: Station[] = [];

  for (const [, stationList] of byName) {
    if (stationList.length === 1) {
      merged.push(stationList[0]);
    } else {
      const base = { ...stationList[0] };

      const allLines = new Set<string>();
      const allFeatures = new Set<string>();
      const allEntrances: Entrance[] = [];
      const allElevators: Elevator[] = [];
      const allEscalators: string[] = [];

      for (const s of stationList) {
        s.lines.forEach((l) => allLines.add(l));
        s.features.forEach((f) => allFeatures.add(f));
        if (s.entrances) allEntrances.push(...s.entrances);
        if (s.elevators) allElevators.push(...s.elevators);
        if (s.escalatorLocations) allEscalators.push(...s.escalatorLocations);
      }

      allFeatures.add("transfer");
      base.lines = Array.from(allLines).sort();
      base.features = Array.from(allFeatures).sort();

      // Dedupe entrances
      const seenEntrances = new Set<string>();
      base.entrances = allEntrances.filter((e) => {
        if (seenEntrances.has(e.id)) return false;
        seenEntrances.add(e.id);
        return true;
      });

      if (allElevators.length > 0) base.elevators = allElevators;
      if (allEscalators.length > 0) {
        base.escalatorLocations = [...new Set(allEscalators)];
      }

      merged.push(base);
    }
  }

  return merged;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    output: "data/systems/beijing-subway/stations-scraped.json",
    dryRun: false,
    line: undefined as string | undefined,
    delay: 500,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (arg === "--dry-run" || arg === "-n") {
      result.dryRun = true;
    } else if (arg === "--line" || arg === "-l") {
      result.line = args[++i];
    } else if (arg === "--delay" || arg === "-d") {
      result.delay = parseInt(args[++i], 10);
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();
  const projectRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(projectRoot, args.output);

  const linesToFetch = args.line ? { [args.line]: LINES[args.line] } : LINES;

  if (args.line && !LINES[args.line]) {
    console.error(`Unknown line: ${args.line}`);
    console.error(`Available lines: ${Object.keys(LINES).join(", ")}`);
    process.exit(1);
  }

  const allStations: Station[] = [];

  for (const [lineKey, lineInfo] of Object.entries(linesToFetch)) {
    console.log(`\nProcessing ${lineInfo.name}...`);

    try {
      const lineUrl = BASE_URL + lineInfo.path;
      const stationUrls = await fetchStationUrls(lineUrl);
      console.log(`  Found ${stationUrls.length} stations`);

      for (const url of stationUrls) {
        const station = await fetchStation(url, lineInfo.id);
        if (station) {
          allStations.push(station);
          process.stdout.write(".");
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, args.delay));
      }
      console.log();
    } catch (error) {
      console.error(`  Error processing ${lineKey}:`, error);
    }
  }

  // Merge transfer stations
  console.log("\nMerging transfer stations...");
  const merged = mergeStations(allStations);
  merged.sort((a, b) => a.localName.localeCompare(b.localName));

  // Stats
  const withCoords = merged.filter((s) => s.coordinates).length;
  const withEntrances = merged.filter((s) => s.entrances && s.entrances.length > 0).length;
  const withElevators = merged.filter((s) => s.elevators && s.elevators.length > 0).length;
  const transfers = merged.filter((s) => s.features.includes("transfer")).length;

  console.log("\nResults:");
  console.log(`  Total stations: ${merged.length}`);
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  With entrances: ${withEntrances}`);
  console.log(`  With elevators: ${withElevators}`);
  console.log(`  Transfer stations: ${transfers}`);

  if (args.dryRun) {
    console.log("\nDry run - not writing output");
    if (merged.length > 0) {
      console.log("\nSample station:");
      console.log(JSON.stringify(merged[0], null, 2));
    }
  } else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({ stations: merged }, null, 2));
    console.log(`\nWritten to: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
