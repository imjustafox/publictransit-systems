#!/usr/bin/env node
/**
 * Fetches WMATA elevator/escalator incidents and saves to data file.
 * Run nightly via cron or GitHub Actions.
 *
 * Usage: WMATA_API_KEY=xxx node scripts/fetch-wmata-incidents.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.WMATA_API_KEY;
if (!API_KEY) {
  console.error("Error: WMATA_API_KEY environment variable required");
  process.exit(1);
}

// WMATA station code to our station ID mapping
// Built from WMATA station names -> our IDs
const STATION_CODE_MAP = {
  A01: "metro-center",
  A02: "farragut-north",
  A03: "dupont-circle",
  A04: "woodley-park",
  A05: "cleveland-park",
  A06: "van-ness-udc",
  A07: "tenleytown-au",
  A08: "friendship-heights",
  A09: "bethesda",
  A10: "medical-center",
  A11: "grosvenor-strathmore",
  A12: "white-flint",
  A13: "twinbrook",
  A14: "rockville",
  A15: "shady-grove",
  B01: "gallery-place",
  B02: "judiciary-square",
  B03: "union-station",
  B04: "rhode-island-ave",
  B05: "brookland-cua",
  B06: "fort-totten",
  B07: "takoma",
  B08: "silver-spring",
  B09: "forest-glen",
  B10: "wheaton",
  B11: "glenmont",
  B35: "noma-gallaudet",
  C01: "metro-center",
  C02: "mcpherson-square",
  C03: "farragut-west",
  C04: "foggy-bottom",
  C05: "rosslyn",
  C06: "arlington-cemetery",
  C07: "pentagon",
  C08: "pentagon-city",
  C09: "crystal-city",
  C10: "reagan-national-airport",
  C12: "braddock-road",
  C13: "king-street",
  C14: "eisenhower-ave",
  C15: "huntington",
  D01: "federal-triangle",
  D02: "smithsonian",
  D03: "l-enfant-plaza",
  D04: "federal-center-sw",
  D05: "capitol-south",
  D06: "eastern-market",
  D07: "potomac-ave",
  D08: "stadium-armory",
  D09: "minnesota-ave",
  D10: "deanwood",
  D11: "cheverly",
  D12: "landover",
  D13: "new-carrollton",
  E01: "mt-vernon-sq",
  E02: "shaw-howard",
  E03: "u-street",
  E04: "columbia-heights",
  E05: "georgia-ave-petworth",
  E06: "fort-totten",
  E07: "west-hyattsville",
  E08: "prince-georges-plaza",
  E09: "college-park",
  E10: "greenbelt",
  F01: "gallery-place",
  F02: "archives",
  F03: "l-enfant-plaza",
  F04: "waterfront",
  F05: "navy-yard",
  F06: "anacostia",
  F07: "congress-heights",
  F08: "southern-avenue",
  F09: "naylor-road",
  F10: "suitland",
  F11: "branch-ave",
  G01: "benning-road",
  G02: "capitol-heights",
  G03: "addison-road",
  G04: "morgan-boulevard",
  G05: "largo-town-center",
  J02: "van-dorn-street",
  J03: "franconia-springfield",
  K01: "court-house",
  K02: "clarendon",
  K03: "virginia-square",
  K04: "ballston-mu",
  K05: "east-falls-church",
  K06: "west-falls-church",
  K07: "dunn-loring",
  K08: "vienna",
  N01: "mclean",
  N02: "tysons-corner",
  N03: "greensboro",
  N04: "spring-hill",
  N06: "wiehle-reston-east",
  N07: "reston-town-center",
  N08: "herndon",
  N09: "innovation-center",
  N10: "dulles-airport",
  N11: "loudoun-gateway",
  N12: "ashburn",
};

async function fetchIncidents() {
  const url = `https://api.wmata.com/Incidents.svc/json/ElevatorIncidents?api_key=${API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WMATA API error: ${response.status}`);
  }

  const data = await response.json();
  return data.ElevatorIncidents || [];
}

async function main() {
  console.log("Fetching WMATA elevator/escalator incidents...");

  const incidents = await fetchIncidents();
  console.log(`Found ${incidents.length} incidents`);

  // Group by station and transform
  const outagesByStation = {};

  for (const incident of incidents) {
    const stationId = STATION_CODE_MAP[incident.StationCode];
    if (!stationId) {
      console.warn(`Unknown station code: ${incident.StationCode}`);
      continue;
    }

    if (!outagesByStation[stationId]) {
      outagesByStation[stationId] = [];
    }

    outagesByStation[stationId].push({
      unitName: incident.UnitName,
      unitType: incident.UnitType.toLowerCase(), // 'elevator' or 'escalator'
      location: incident.LocationDescription,
      symptom: incident.SymptomDescription,
      outOfServiceSince: incident.DateOutOfServ,
      estimatedReturn: incident.EstimatedReturnToService,
      updatedAt: incident.DateUpdated,
    });
  }

  // Count totals
  let elevatorOutages = 0;
  let escalatorOutages = 0;
  for (const outages of Object.values(outagesByStation)) {
    for (const o of outages) {
      if (o.unitType === "elevator") elevatorOutages++;
      else escalatorOutages++;
    }
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    systemId: "wmata",
    summary: {
      totalOutages: incidents.length,
      elevatorOutages,
      escalatorOutages,
      stationsAffected: Object.keys(outagesByStation).length,
    },
    outagesByStation,
  };

  // Write to data file
  const outPath = path.join(__dirname, "..", "data", "incidents", "wmata.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");

  console.log(`\nSaved to ${outPath}`);
  console.log(
    `Summary: ${elevatorOutages} elevators, ${escalatorOutages} escalators out at ${Object.keys(outagesByStation).length} stations`
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
