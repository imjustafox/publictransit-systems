#!/usr/bin/env npx tsx
/**
 * Fetch Beijing Subway line-station mappings from bjsubway.com XML map
 * This provides authoritative station-line associations for all 27 lines
 *
 * Usage:
 *   npx tsx scripts/fetch-beijing-xml.ts
 *
 * Options:
 *   --output, -o    Output file path (default: data/systems/beijing-subway/line-mappings.json)
 *   --dry-run, -n   Don't write output, just print stats
 */

import * as fs from "fs";
import * as path from "path";

const XML_URL = "https://map.bjsubway.com/subwaymap/beijing.xml";

interface StationMapping {
  id: string;
  name: string;
  localName: string;
  lines: string[];
  isTransfer: boolean;
}

interface LineInfo {
  id: string;
  name: string;
  localName: string;
  stations: string[]; // localName references
}

interface MappingData {
  generated: string;
  source: string;
  lines: LineInfo[];
  stations: StationMapping[];
}

async function fetchXML(): Promise<string> {
  console.log(`Fetching ${XML_URL}...`);

  const response = await fetch(XML_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TransitDataBot/1.0)",
      Accept: "application/xml, text/xml, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

function parseLineId(rawId: string, lineName: string): string {
  // Extract number from formats like "地铁1号线" or "1号线八通线"
  const numMatch = rawId.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1 && num <= 30) {
      // Check if it's a combined line like "1号线八通线"
      if (rawId.includes("八通")) {
        return "line-1-batong"; // Combined Line 1 + Batong
      }
      return `line-${num}`;
    }
  }

  // Handle special lines by name
  const nameLower = (rawId + lineName).toLowerCase();
  if (nameLower.includes("八通") || nameLower.includes("batong")) {
    return "batong";
  }
  if (nameLower.includes("昌平") || nameLower.includes("changping")) {
    return "changping";
  }
  if (nameLower.includes("房山") || nameLower.includes("fangshan")) {
    return "fangshan";
  }
  if (nameLower.includes("亦庄") || nameLower.includes("yizhuang")) {
    return "yizhuang";
  }
  if (nameLower.includes("大兴机场") || nameLower.includes("daxing airport")) {
    return "daxing-airport";
  }
  if (nameLower.includes("大兴") || nameLower.includes("daxing")) {
    return "daxing";
  }
  if (
    nameLower.includes("首都机场") ||
    nameLower.includes("capital airport") ||
    nameLower.includes("机场线")
  ) {
    return "capital-airport-express";
  }
  if (nameLower.includes("西郊") || nameLower.includes("xijiao")) {
    return "xijiao";
  }
  if (nameLower.includes("s1") || nameLower.includes("磁浮") || nameLower.includes("maglev")) {
    return "s1";
  }
  if (nameLower.includes("燕房") || nameLower.includes("yanfang")) {
    return "yanfang";
  }

  // Fallback
  return rawId.toLowerCase().replace(/\s+/g, "-");
}

function parseXML(xml: string): MappingData {
  const lines: LineInfo[] = [];
  const stationMap = new Map<string, StationMapping>();

  // Parse line blocks: <l lid="地铁1号线八通线" lb="1号线八通线" ...>...</l>
  // Each line contains <p> station elements
  const lineBlockRegex = /<l\s+[^>]*lid="([^"]+)"[^>]*lb="([^"]+)"[^>]*>([\s\S]*?)<\/l>/g;
  let lineMatch;

  while ((lineMatch = lineBlockRegex.exec(xml)) !== null) {
    const [, rawId, localName, lineContent] = lineMatch;
    const lineId = parseLineId(rawId, localName);

    const lineInfo: LineInfo = {
      id: lineId,
      name: localName, // Will update with English name if found
      localName,
      stations: [],
    };

    // Parse stations within this line block: <p ... lb="苹果园" .../>
    // Use word boundary to avoid matching slb="true" etc.
    const stationRegex = /<p\s+[^>]*\slb="([^"]+)"[^>]*\/>/g;
    let stationMatch;

    while ((stationMatch = stationRegex.exec(lineContent)) !== null) {
      const stationName = stationMatch[1];

      // Skip if empty
      if (!stationName.trim()) continue;

      // Add to line's station list
      if (!lineInfo.stations.includes(stationName)) {
        lineInfo.stations.push(stationName);
      }

      // Create or update station mapping
      if (!stationMap.has(stationName)) {
        stationMap.set(stationName, {
          id: stationName
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[()（）]/g, ""),
          name: stationName, // Chinese name for now
          localName: stationName,
          lines: [],
          isTransfer: false,
        });
      }

      const station = stationMap.get(stationName)!;
      if (!station.lines.includes(lineId)) {
        station.lines.push(lineId);
      }
    }

    lines.push(lineInfo);
  }

  console.log(`  Found ${lines.length} lines`);

  // Mark transfer stations (appear on multiple lines)
  for (const station of stationMap.values()) {
    station.isTransfer = station.lines.length > 1;
    station.lines.sort();
  }

  const stations = Array.from(stationMap.values()).sort((a, b) =>
    a.localName.localeCompare(b.localName)
  );

  console.log(`  Found ${stations.length} unique stations`);
  console.log(`  Transfer stations: ${stations.filter((s) => s.isTransfer).length}`);

  return {
    generated: new Date().toISOString(),
    source: XML_URL,
    lines,
    stations,
  };
}

// Alternative parser that looks for JSON embedded in the XML/HTML response
function tryParseEmbeddedJSON(content: string): MappingData | null {
  // Look for JavaScript object definitions
  const jsonPatterns = [
    /var\s+lines?\s*=\s*(\[[\s\S]*?\]);/,
    /var\s+stations?\s*=\s*(\[[\s\S]*?\]);/,
    /"lines"\s*:\s*(\[[\s\S]*?\])/,
    /"stations"\s*:\s*(\[[\s\S]*?\])/,
  ];

  for (const pattern of jsonPatterns) {
    const match = content.match(pattern);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        console.log(`  Found embedded JSON data: ${data.length} items`);
        return null; // Would need custom parsing based on actual structure
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    output: "data/systems/beijing-subway/line-mappings.json",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (arg === "--dry-run" || arg === "-n") {
      result.dryRun = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();
  const projectRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(projectRoot, args.output);

  try {
    const content = await fetchXML();
    console.log(`  Received ${content.length} bytes`);

    // Try embedded JSON first
    let data = tryParseEmbeddedJSON(content);

    // Fall back to XML parsing
    if (!data) {
      data = parseXML(content);
    }

    // Stats
    const linesWithStations = data.lines.filter((l) => l.stations.length > 0);
    const totalStationRefs = data.lines.reduce((sum, l) => sum + l.stations.length, 0);

    console.log("\nResults:");
    console.log(`  Lines: ${data.lines.length} (${linesWithStations.length} with stations)`);
    console.log(`  Unique stations: ${data.stations.length}`);
    console.log(`  Station-line associations: ${totalStationRefs}`);
    console.log(`  Transfer stations: ${data.stations.filter((s) => s.isTransfer).length}`);

    // Show lines breakdown
    console.log("\nLines breakdown:");
    for (const line of data.lines.sort((a, b) => a.id.localeCompare(b.id))) {
      console.log(`  ${line.id}: ${line.stations.length} stations`);
    }

    if (args.dryRun) {
      console.log("\nDry run - not writing output");
      if (data.stations.length > 0) {
        console.log("\nSample transfer station:");
        const transfer = data.stations.find((s) => s.isTransfer);
        if (transfer) {
          console.log(JSON.stringify(transfer, null, 2));
        }
      }
    } else {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`\nWritten to: ${outputPath}`);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
