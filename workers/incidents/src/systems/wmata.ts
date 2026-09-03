/**
 * WMATA incident fetching and processing
 *
 * Fetches elevator/escalator incidents from the WMATA API
 * and maps them to our station IDs.
 */

// WMATA station code to our station ID mapping
const STATION_CODE_MAP: Record<string, string> = {
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

interface WMATAIncident {
  UnitName: string;
  UnitType: string;
  StationCode: string;
  StationName: string;
  LocationDescription: string;
  SymptomDescription: string;
  DateOutOfServ: string;
  DateUpdated: string;
  EstimatedReturnToService: string | null;
}

interface UnitOutage {
  unitName: string;
  unitType: "elevator" | "escalator";
  location: string;
  symptom: string;
  outOfServiceSince: string;
  estimatedReturn: string | null;
  updatedAt: string;
}

export interface WmataIncidentData {
  fetchedAt: string;
  systemId: string;
  summary: {
    totalOutages: number;
    elevatorOutages: number;
    escalatorOutages: number;
    stationsAffected: number;
  };
  outagesByStation: Record<string, UnitOutage[]>;
}

async function fetchWMATAIncidents(apiKey: string): Promise<WMATAIncident[]> {
  const response = await fetch(
    `https://api.wmata.com/Incidents.svc/json/ElevatorIncidents?api_key=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`WMATA API error: ${response.status}`);
  }

  const data = (await response.json()) as { ElevatorIncidents: WMATAIncident[] };
  return data.ElevatorIncidents || [];
}

function processIncidents(incidents: WMATAIncident[]): WmataIncidentData {
  const outagesByStation: Record<string, UnitOutage[]> = {};

  for (const incident of incidents) {
    const stationId = STATION_CODE_MAP[incident.StationCode];
    if (!stationId) continue;

    if (!outagesByStation[stationId]) {
      outagesByStation[stationId] = [];
    }

    outagesByStation[stationId].push({
      unitName: incident.UnitName,
      unitType: incident.UnitType.toLowerCase() as "elevator" | "escalator",
      location: incident.LocationDescription,
      symptom: incident.SymptomDescription,
      outOfServiceSince: incident.DateOutOfServ,
      estimatedReturn: incident.EstimatedReturnToService,
      updatedAt: incident.DateUpdated,
    });
  }

  let elevatorOutages = 0;
  let escalatorOutages = 0;
  for (const outages of Object.values(outagesByStation)) {
    for (const o of outages) {
      if (o.unitType === "elevator") elevatorOutages++;
      else escalatorOutages++;
    }
  }

  return {
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
}

export async function refreshWmata(kv: KVNamespace, apiKey: string): Promise<WmataIncidentData> {
  const start = Date.now();
  let incidents: WMATAIncident[];
  try {
    incidents = await fetchWMATAIncidents(apiKey);
  } catch (error) {
    await kv.put(
      "_health:wmata",
      JSON.stringify({
        lastPullAt: new Date().toISOString(),
        lastPullDurationMs: Date.now() - start,
        lastPullSuccess: false,
        lastError: (error as Error).message,
      })
    );
    throw error;
  }

  const data = processIncidents(incidents);
  await kv.put("wmata", JSON.stringify(data));
  await kv.put(
    "_health:wmata",
    JSON.stringify({
      lastPullAt: new Date().toISOString(),
      lastPullDurationMs: Date.now() - start,
      lastPullSuccess: true,
      lastError: null,
    })
  );
  console.log(
    `WMATA: ${data.summary.totalOutages} incidents ` +
      `(${data.summary.elevatorOutages} elevators, ${data.summary.escalatorOutages} escalators) ` +
      `at ${data.summary.stationsAffected} stations`
  );
  return data;
}
