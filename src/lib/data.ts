import { promises as fs } from "fs";
import path from "path";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type {
  TransitSystem,
  Line,
  Station,
  RailcarGeneration,
  HistoryEvent,
  IncidentData,
  UnitOutage,
  ServiceAlert,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "systems");

// Cache for loaded data
const cache: Map<string, unknown> = new Map();

async function loadJSON<T>(filePath: string): Promise<T> {
  const cached = cache.get(filePath);
  if (cached) return cached as T;

  const fullPath = path.join(DATA_DIR, filePath);
  const content = await fs.readFile(fullPath, "utf-8");
  const data = JSON.parse(content) as T;
  cache.set(filePath, data);
  return data;
}

// System data
export async function getSystem(
  systemId: string
): Promise<TransitSystem & { history: HistoryEvent[] }> {
  return loadJSON(`${systemId}/system.json`);
}

export async function getAllSystems(): Promise<TransitSystem[]> {
  const systemDirs = await fs.readdir(DATA_DIR);
  const systems: TransitSystem[] = [];

  for (const dir of systemDirs) {
    try {
      const system = await getSystem(dir);
      systems.push(system);
    } catch {
      // Skip directories without valid system.json
    }
  }

  return systems;
}

// Lines data
export async function getLines(systemId: string): Promise<Line[]> {
  const data = await loadJSON<{ lines: Line[] }>(`${systemId}/lines.json`);
  return data.lines.filter((line) => line.status !== "disabled");
}

export async function getLine(systemId: string, lineId: string): Promise<Line | undefined> {
  const lines = await getLines(systemId);
  return lines.find((line) => line.id === lineId);
}

// Stations data
export async function getStations(systemId: string): Promise<Station[]> {
  const data = await loadJSON<{ stations: Station[] }>(`${systemId}/stations.json`);
  return data.stations;
}

export async function getStation(
  systemId: string,
  stationId: string
): Promise<Station | undefined> {
  const stations = await getStations(systemId);
  return stations.find((station) => station.id === stationId);
}

export async function getStationsByLine(systemId: string, lineId: string): Promise<Station[]> {
  const stations = await getStations(systemId);
  return stations.filter((station) => station.lines.includes(lineId));
}

export async function getStationsByStatus(
  systemId: string,
  status: Station["status"]
): Promise<Station[]> {
  const stations = await getStations(systemId);
  return stations.filter((station) => station.status === status);
}

// Railcars data
export async function getRailcars(systemId: string): Promise<RailcarGeneration[]> {
  const data = await loadJSON<{ generations: RailcarGeneration[] }>(`${systemId}/railcars.json`);
  return data.generations;
}

export async function getRailcar(
  systemId: string,
  railcarId: string
): Promise<RailcarGeneration | undefined> {
  const railcars = await getRailcars(systemId);
  return railcars.find((railcar) => railcar.id === railcarId);
}

// Utility functions
export function getLineColor(line: Line): string {
  const colorMap: Record<string, string> = {
    red: "var(--line-red)",
    orange: "var(--line-orange)",
    yellow: "var(--line-yellow)",
    green: "var(--line-green)",
    blue: "var(--line-blue)",
    silver: "var(--line-silver)",
    purple: "var(--line-purple)",
  };
  return colorMap[line.color] || line.colorHex;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getSystemUrl(systemId: string): string {
  return `/${systemId}`;
}

export function getLineUrl(systemId: string, lineId: string): string {
  return `/${systemId}/lines/${lineId}`;
}

export function getStationUrl(systemId: string, stationId: string): string {
  return `/${systemId}/stations/${stationId}`;
}

export function getRailcarUrl(systemId: string, railcarId: string): string {
  return `/${systemId}/railcars/${railcarId}`;
}

// Incident/Outage data
const INCIDENTS_WORKER_URL = process.env.INCIDENTS_WORKER_URL;

// BART API configuration (public demo key)
const BART_API_KEY = process.env.BART_API_KEY || "MW9S-E7SL-26DU-VV8V";
const BART_API_BASE = "https://api.bart.gov/api";

// Sound Transit GTFS-RT alerts feed (protobuf, public, no auth required)
const SOUND_TRANSIT_ALERTS_URL = "https://s3.amazonaws.com/st-service-alerts-prod/alerts.pb";

// MTA NYC Subway endpoints (public, no auth required)
// Subway-only alerts in protobuf format; elevator/escalator outages remain JSON (no protobuf available)
const NYC_SUBWAY_ALERTS_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts";
const NYC_SUBWAY_ENE_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json";

// Simple in-memory cache for incident data (5 minute TTL)
const incidentCache: Map<string, { data: IncidentData; fetchedAt: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getIncidentCacheStatus(): Record<string, { ageSeconds: number; stale: boolean }> {
  const now = Date.now();
  const status: Record<string, { ageSeconds: number; stale: boolean }> = {};
  for (const [systemId, entry] of incidentCache.entries()) {
    const ageMs = now - entry.fetchedAt;
    status[systemId] = {
      ageSeconds: Math.round(ageMs / 1000),
      stale: ageMs > CACHE_TTL,
    };
  }
  return status;
}

// BART station code to station ID mapping
const BART_STATION_CODES: Record<string, string> = {
  "12TH": "12th-street-oakland",
  "16TH": "16th-street-mission",
  "19TH": "19th-street-oakland",
  "24TH": "24th-street-mission",
  ANTC: "antioch",
  ASHB: "ashby",
  BALB: "balboa-park",
  BAYF: "bay-fair",
  BERY: "berryessa",
  CAST: "castro-valley",
  CIVC: "civic-center",
  COLM: "colma",
  COLS: "coliseum",
  CONC: "concord",
  DALY: "daly-city",
  DBRK: "downtown-berkeley",
  DELN: "el-cerrito-del-norte",
  DUBL: "dublin-pleasanton",
  EMBR: "embarcadero",
  FRMT: "fremont",
  FTVL: "fruitvale",
  GLEN: "glen-park",
  HAYW: "hayward",
  LAFY: "lafayette",
  LAKE: "lake-merritt",
  MCAR: "macarthur",
  MLBR: "millbrae",
  MLPT: "milpitas",
  MONT: "montgomery-street",
  NBRK: "north-berkeley",
  NCON: "north-concord-martinez",
  OAKL: "oakland-airport",
  ORIN: "orinda",
  PCTR: "pittsburg-center",
  PHIL: "pleasant-hill",
  PITT: "pittsburg-bay-point",
  PLZA: "el-cerrito-plaza",
  POWL: "powell-street",
  RICH: "richmond",
  ROCK: "rockridge",
  SANL: "san-leandro",
  SBRN: "san-bruno",
  SFIA: "sfo-airport",
  SHAY: "south-hayward",
  SSAN: "south-san-francisco",
  UCTY: "union-city",
  WARM: "warm-springs",
  WCRK: "walnut-creek",
  WDUB: "west-dublin-pleasanton",
  WOAK: "west-oakland",
};

// CTA Customer Alerts API (public, no auth required)
const CTA_ALERTS_URL = "http://lapi.transitchicago.com/api/1.0/alerts.aspx?outputType=JSON";

// CTA route service IDs to our line IDs
const CTA_ROUTE_TO_LINE: Record<string, string> = {
  Red: "red",
  Blue: "blue",
  Brn: "brown",
  G: "green",
  Org: "orange",
  Pink: "pink",
  P: "purple",
  Y: "yellow",
};

interface CtaAlertService {
  ServiceType: string;
  ServiceId: string;
  ServiceName: string;
  ServiceBackColor?: string;
  ServiceTextColor?: string;
}

interface CtaAlertsResponse {
  CTAAlerts: {
    TimeStamp: string;
    ErrorCode: string;
    ErrorMessage: string | null;
    Alert: Array<{
      AlertId: string;
      Headline: string;
      ShortDescription: string;
      FullDescription?: string;
      SeverityScore: string;
      SeverityCSS: string;
      Impact: string;
      EventStart: string;
      EventEnd: string | null;
      TBD: string;
      MajorAlert: string;
      AlertURL?: string;
      ImpactedService: {
        Service: CtaAlertService | CtaAlertService[];
      };
    }>;
  };
}

// CTA station name patterns for text-based matching in alert text
// Ordered from most specific to least specific
const CTA_STATION_PATTERNS: Array<{ pattern: RegExp; stationId: string }> = [
  // Multi-word / compound stations (most specific first)
  {
    pattern: /\bHarold Washington Library\b/i,
    stationId: "harold-washington-library-state-van-buren",
  },
  { pattern: /\bState\/Van Buren\b/i, stationId: "harold-washington-library-state-van-buren" },
  { pattern: /\bConservatory.Central Park Drive\b/i, stationId: "conservatory-central-park-drive" },
  { pattern: /\bJefferson Park\b/i, stationId: "jefferson-park-transit-center" },
  { pattern: /\bIllinois Medical District\b/i, stationId: "illinois-medical-district" },
  { pattern: /\bMerchandise Mart\b/i, stationId: "merchandise-mart-brown-purple" },
  { pattern: /\bCermak.McCormick Place\b/i, stationId: "cermak-mccormick-place" },
  { pattern: /\bCermak.Chinatown\b/i, stationId: "cermak-chinatown" },
  { pattern: /\b35th.Bronzeville.IIT\b/i, stationId: "35th-bronzeville-iit" },
  { pattern: /\b35th\/Archer\b/i, stationId: "35th-archer" },
  { pattern: /\b95th\/Dan Ryan\b/i, stationId: "95th-dan-ryan" },
  { pattern: /\b95th\b/i, stationId: "95th-dan-ryan" },
  { pattern: /\b54th\/Cermak\b/i, stationId: "54th-cermak" },
  { pattern: /\bAshland\/63rd\b/i, stationId: "ashland-63rd" },
  { pattern: /\bDempster.Skokie\b/i, stationId: "dempster-skokie" },
  { pattern: /\bOakton.Skokie\b/i, stationId: "oakton-skokie" },
  { pattern: /\bSox.35th\b/i, stationId: "sox-35th" },
  { pattern: /\bNorth\/Clybourn\b/i, stationId: "north-clybourn" },
  { pattern: /\bClark\/Division\b/i, stationId: "clark-division" },
  { pattern: /\bClark\/Lake\b/i, stationId: "clark-lake" },
  { pattern: /\bKedzie.Homan\b/i, stationId: "kedzie-homan" },
  { pattern: /\bLaSalle\/Van Buren\b/i, stationId: "lasalle-van-buren" },
  { pattern: /\bAdams\/Wabash\b/i, stationId: "adams-wabash" },
  { pattern: /\bWashington\/Wabash\b/i, stationId: "washington-wabash" },
  { pattern: /\bWashington\/Wells\b/i, stationId: "washington-wells" },
  { pattern: /\bBryn Mawr\b/i, stationId: "bryn-mawr" },
  { pattern: /\bCentral Park\b/i, stationId: "central-park" },
  { pattern: /\bCottage Grove\b/i, stationId: "cottage-grove" },
  { pattern: /\bKing Drive\b/i, stationId: "king-drive" },
  { pattern: /\bLogan Square\b/i, stationId: "logan-square" },
  { pattern: /\bForest Park\b/i, stationId: "forest-park" },
  { pattern: /\bSouth Boulevard\b/i, stationId: "south-boulevard" },
  { pattern: /\bLake\b.*\bSubway\b/i, stationId: "lake-subway" },
  { pattern: /\bO'Hare\b/i, stationId: "ohare" },
  { pattern: /\bHarlem\/Lake\b/i, stationId: "harlem-lake" },
  { pattern: /\bUIC.Halsted\b/i, stationId: "uic-halsted" },

  // Disambiguated stations: line-specific patterns (more specific first)
  // Harlem (3 variants)
  { pattern: /\bHarlem\b.*\bForest Park\b/i, stationId: "harlem-blue-forest-park" },
  { pattern: /\bHarlem\b.*\bO'Hare\b/i, stationId: "harlem-blue-ohare" },

  // Western (5 variants)
  { pattern: /\bWestern\b.*\bForest Park\b/i, stationId: "western-blue-forest-park" },
  { pattern: /\bWestern\b.*\bO'Hare\b/i, stationId: "western-blue-ohare" },
  { pattern: /\bWestern\b.*\bBrown\b/i, stationId: "western-brown" },
  { pattern: /\bWestern\b.*\bOrange\b/i, stationId: "western-orange" },
  { pattern: /\bWestern\b.*\bPink\b/i, stationId: "western-pink" },

  // Addison (3 variants)
  { pattern: /\bAddison\b.*\bBlue\b/i, stationId: "addison-blue" },
  { pattern: /\bAddison\b.*\bBrown\b/i, stationId: "addison-brown" },
  { pattern: /\bAddison\b.*\bRed\b/i, stationId: "addison-red" },

  // Belmont (2 variants)
  { pattern: /\bBelmont\b.*\bBlue\b/i, stationId: "belmont-blue" },
  { pattern: /\bBelmont\b.*\b(?:Red|Brown|Purple)\b/i, stationId: "belmont-red-brown-purple" },

  // Austin (2 variants)
  { pattern: /\bAustin\b.*\bBlue\b/i, stationId: "austin-blue" },
  { pattern: /\bAustin\b.*\bGreen\b/i, stationId: "austin-green" },

  // California (3 variants)
  { pattern: /\bCalifornia\b.*\bBlue\b/i, stationId: "california-blue" },
  { pattern: /\bCalifornia\b.*\bGreen\b/i, stationId: "california-green" },
  { pattern: /\bCalifornia\b.*\bPink\b/i, stationId: "california-pink" },

  // Central (2 variants)
  { pattern: /\bCentral\b.*\bGreen\b/i, stationId: "central-green" },
  { pattern: /\bCentral\b.*\bPurple\b/i, stationId: "central-purple" },

  // Chicago (3 variants)
  { pattern: /\bChicago\b.*\bBlue\b/i, stationId: "chicago-blue" },
  { pattern: /\bChicago\b.*\b(?:Brown|Purple)\b/i, stationId: "chicago-brown-purple" },
  { pattern: /\bChicago\b.*\bRed\b/i, stationId: "chicago-red" },

  // Cicero (3 variants)
  { pattern: /\bCicero\b.*\bBlue\b/i, stationId: "cicero-blue" },
  { pattern: /\bCicero\b.*\bGreen\b/i, stationId: "cicero-green" },
  { pattern: /\bCicero\b.*\bPink\b/i, stationId: "cicero-pink" },

  // Clinton (2 variants)
  { pattern: /\bClinton\b.*\bBlue\b/i, stationId: "clinton-blue" },
  { pattern: /\bClinton\b.*\b(?:Green|Pink)\b/i, stationId: "clinton-green-pink" },

  // Damen (4 variants)
  { pattern: /\bDamen\b.*\bBlue\b/i, stationId: "damen-blue" },
  { pattern: /\bDamen\b.*\bBrown\b/i, stationId: "damen-brown" },
  { pattern: /\bDamen\b.*\bGreen\b/i, stationId: "damen-green" },
  { pattern: /\bDamen\b.*\bPink\b/i, stationId: "damen-pink" },

  // Garfield (2 variants)
  { pattern: /\bGarfield\b.*\bGreen\b/i, stationId: "garfield-green" },
  { pattern: /\bGarfield\b.*\bRed\b/i, stationId: "garfield-red" },

  // Grand (2 variants)
  { pattern: /\bGrand\b.*\bBlue\b/i, stationId: "grand-blue" },
  { pattern: /\bGrand\b.*\bRed\b/i, stationId: "grand-red" },

  // Halsted (2 variants - not UIC-Halsted, matched above)
  { pattern: /\bHalsted\b.*\bGreen\b/i, stationId: "halsted-green" },
  { pattern: /\bHalsted\b.*\bOrange\b/i, stationId: "halsted-orange" },

  // Irving Park (2 variants)
  { pattern: /\bIrving Park\b.*\bBlue\b/i, stationId: "irving-park-blue" },
  { pattern: /\bIrving Park\b.*\bBrown\b/i, stationId: "irving-park-brown" },

  // Jackson (2 variants)
  { pattern: /\bJackson\b.*\bBlue\b/i, stationId: "jackson-blue" },
  { pattern: /\bJackson\b.*\bRed\b/i, stationId: "jackson-red" },

  // Kedzie (4 variants - not Kedzie-Homan, matched above)
  { pattern: /\bKedzie\b.*\bBrown\b/i, stationId: "kedzie-brown" },
  { pattern: /\bKedzie\b.*\bGreen\b/i, stationId: "kedzie-green" },
  { pattern: /\bKedzie\b.*\bOrange\b/i, stationId: "kedzie-orange" },
  { pattern: /\bKedzie\b.*\bPink\b/i, stationId: "kedzie-pink" },

  // Monroe (2 variants)
  { pattern: /\bMonroe\b.*\bBlue\b/i, stationId: "monroe-blue" },
  { pattern: /\bMonroe\b.*\bRed\b/i, stationId: "monroe-red" },

  // Montrose (2 variants)
  { pattern: /\bMontrose\b.*\bBlue\b/i, stationId: "montrose-blue" },
  { pattern: /\bMontrose\b.*\bBrown\b/i, stationId: "montrose-brown" },

  // Oak Park (2 variants)
  { pattern: /\bOak Park\b.*\bBlue\b/i, stationId: "oak-park-blue" },
  { pattern: /\bOak Park\b.*\bGreen\b/i, stationId: "oak-park-green" },

  // Pulaski (4 variants)
  { pattern: /\bPulaski\b.*\bBlue\b/i, stationId: "pulaski-blue" },
  { pattern: /\bPulaski\b.*\bGreen\b/i, stationId: "pulaski-green" },
  { pattern: /\bPulaski\b.*\bOrange\b/i, stationId: "pulaski-orange" },
  { pattern: /\bPulaski\b.*\bPink\b/i, stationId: "pulaski-pink" },

  // 47th (2 variants)
  { pattern: /\b47th\b.*\bGreen\b/i, stationId: "47th-green" },
  { pattern: /\b47th\b.*\bRed\b/i, stationId: "47th-red" },

  // Ashland (2 variants - not Ashland/63rd, matched above)
  { pattern: /\bAshland\b.*\b(?:Green|Pink)\b/i, stationId: "ashland-green-pink" },
  { pattern: /\bAshland\b.*\bOrange\b/i, stationId: "ashland-orange" },

  // Armitage (Brown/Purple)
  { pattern: /\bArmitage\b/i, stationId: "armitage-brown-purple" },

  // Diversey (Brown/Purple)
  { pattern: /\bDiversey\b/i, stationId: "diversey-brown-purple" },

  // Morgan (Green/Pink)
  { pattern: /\bMorgan\b.*\b(?:Green|Pink)\b/i, stationId: "morgan-green-pink" },

  // Sedgwick (Brown/Purple)
  { pattern: /\bSedgwick\b/i, stationId: "sedgwick-brown-purple" },

  // Wellington (Brown/Purple)
  { pattern: /\bWellington\b/i, stationId: "wellington-brown-purple" },

  // Unique station names (simple word-boundary patterns)
  { pattern: /\b18th\b/i, stationId: "18th" },
  { pattern: /\b43rd\b/i, stationId: "43rd" },
  { pattern: /\b51st\b/i, stationId: "51st" },
  { pattern: /\b63rd\b/i, stationId: "63rd" },
  { pattern: /\b69th\b/i, stationId: "69th" },
  { pattern: /\b79th\b/i, stationId: "79th" },
  { pattern: /\b87th\b/i, stationId: "87th" },
  { pattern: /\bArgyle\b/i, stationId: "argyle" },
  { pattern: /\bBerwyn\b/i, stationId: "berwyn" },
  { pattern: /\bCumberland\b/i, stationId: "cumberland" },
  { pattern: /\bDavis\b/i, stationId: "davis" },
  { pattern: /\bDempster\b/i, stationId: "dempster" },
  { pattern: /\bDivision\b/i, stationId: "division" },
  { pattern: /\bFoster\b/i, stationId: "foster" },
  { pattern: /\bFrancisco\b/i, stationId: "francisco" },
  { pattern: /\bFullerton\b/i, stationId: "fullerton" },
  { pattern: /\bGranville\b/i, stationId: "granville" },
  { pattern: /\bHarrison\b/i, stationId: "harrison" },
  { pattern: /\bHoward\b/i, stationId: "howard" },
  { pattern: /\bIndiana\b/i, stationId: "indiana" },
  { pattern: /\bJarvis\b/i, stationId: "jarvis" },
  { pattern: /\bKimball\b/i, stationId: "kimball" },
  { pattern: /\bKostner\b/i, stationId: "kostner" },
  { pattern: /\bLaSalle\b/i, stationId: "lasalle" },
  { pattern: /\bLaramie\b/i, stationId: "laramie" },
  { pattern: /\bLawrence\b/i, stationId: "lawrence" },
  { pattern: /\bLinden\b/i, stationId: "linden" },
  { pattern: /\bLoyola\b/i, stationId: "loyola" },
  { pattern: /\bMain\b/i, stationId: "main" },
  { pattern: /\bMidway\b/i, stationId: "midway" },
  { pattern: /\bMorse\b/i, stationId: "morse" },
  { pattern: /\bNoyes\b/i, stationId: "noyes" },
  { pattern: /\bPaulina\b/i, stationId: "paulina" },
  { pattern: /\bPolk\b/i, stationId: "polk" },
  { pattern: /\bQuincy\b/i, stationId: "quincy" },
  { pattern: /\bRacine\b/i, stationId: "racine" },
  { pattern: /\bRidgeland\b/i, stationId: "ridgeland" },
  { pattern: /\bRockwell\b/i, stationId: "rockwell" },
  { pattern: /\bRoosevelt\b/i, stationId: "roosevelt" },
  { pattern: /\bRosemont\b/i, stationId: "rosemont" },
  { pattern: /\bSheridan\b/i, stationId: "sheridan" },
  { pattern: /\bSouthport\b/i, stationId: "southport" },
  { pattern: /\bThorndale\b/i, stationId: "thorndale" },
  { pattern: /\bWashington\b/i, stationId: "washington" },
  { pattern: /\bWilson\b/i, stationId: "wilson" },
  { pattern: /\bMorgan\b/i, stationId: "morgan-green-pink" },
];

interface BartApiResponse {
  root: {
    date: string;
    time: string;
    bsa: Array<{
      "@id": string;
      station: string;
      type: string;
      description: { "#cdata-section": string };
      sms_text: { "#cdata-section": string };
      posted: string;
      expires: string;
    }>;
  };
}

// MTA NYC Subway elevator/escalator outage response type (JSON-only feed, no protobuf available)
interface NycSubwayEneOutage {
  borough: string;
  trainno: string;
  equipmentno: string;
  equipmenttype: "EL" | "ES";
  serving: string;
  ADA: "Y" | "N";
  isupcomingoutage: "Y" | "N";
  ismaintenanceoutage: "Y" | "N";
  station: string;
  outagedate: string;
  estimatedreturntoservice: string;
  reason: string;
  linesimpacted?: string;
}

// MTA route ID to our line ID mapping
const NYC_SUBWAY_ROUTE_MAP: Record<string, string> = {
  GS: "S-42",
  FS: "S-franklin",
  H: "S-rockaway",
};

// Lazy-loaded station name index for NYC Subway
let nycStationIndex: Map<string, Array<{ id: string; lines: string[] }>> | null = null;

function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[\/\\]/g, " ")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getNycStationIndex(): Promise<Map<string, Array<{ id: string; lines: string[] }>>> {
  if (nycStationIndex) return nycStationIndex;

  const stations = await getStations("nyc-subway");
  nycStationIndex = new Map();

  for (const station of stations) {
    if (station.status !== "active") continue;
    const normalized = normalizeStationName(station.name);
    const existing = nycStationIndex.get(normalized) || [];
    existing.push({ id: station.id, lines: station.lines });
    nycStationIndex.set(normalized, existing);
  }

  return nycStationIndex;
}

function mapNycRouteId(routeId: string): string | null {
  if (routeId === "SI") return null; // Staten Island Railway not in our data
  return NYC_SUBWAY_ROUTE_MAP[routeId] || routeId;
}

// Sound Transit route ID to line ID mapping
const SOUND_TRANSIT_ROUTES: Record<string, string> = {
  "100479": "1-line",
  "1LINE": "1-line",
  "2LINE": "2-line",
  TLINE: "t-line",
  NLINE: "n-line",
  SLINE: "s-line",
};

// Sound Transit station name patterns for text matching
// Maps search patterns to station IDs
const SOUND_TRANSIT_STATION_PATTERNS: Array<{ pattern: RegExp; stationId: string }> = [
  { pattern: /\bwestlake\b/i, stationId: "westlake" },
  { pattern: /\bsymphony\b|\buniversity street\b/i, stationId: "symphony" },
  { pattern: /\bpioneer square\b/i, stationId: "pioneer-square" },
  {
    pattern: /\binternational district|chinatown|int'l dist/i,
    stationId: "international-district",
  },
  { pattern: /\bstadium\b(?!\s*district)/i, stationId: "stadium" },
  { pattern: /\bsodo\b/i, stationId: "sodo" },
  { pattern: /\bbeacon hill\b/i, stationId: "beacon-hill" },
  { pattern: /\bmount baker|mt\.?\s*baker/i, stationId: "mount-baker" },
  { pattern: /\bcolumbia city\b/i, stationId: "columbia-city" },
  { pattern: /\bothello\b/i, stationId: "othello" },
  { pattern: /\brainier beach\b/i, stationId: "rainier-beach" },
  { pattern: /\btukwila\b/i, stationId: "tukwila-international-boulevard" },
  { pattern: /\bseatac|sea-tac|seatac\/airport/i, stationId: "sea-tac-airport" },
  { pattern: /\bangle lake\b/i, stationId: "angle-lake" },
  { pattern: /\bcapitol hill\b/i, stationId: "capitol-hill" },
  { pattern: /\buniversity of washington\b|uw station/i, stationId: "university-of-washington" },
  { pattern: /\bu district\b/i, stationId: "u-district" },
  { pattern: /\broosevelt\b/i, stationId: "roosevelt" },
  { pattern: /\bnorthgate\b/i, stationId: "northgate" },
  { pattern: /\bshoreline south|148th\b/i, stationId: "shoreline-south-148th" },
  { pattern: /\bshoreline north|185th\b/i, stationId: "shoreline-north-185th" },
  { pattern: /\bmountlake terrace\b/i, stationId: "mountlake-terrace" },
  { pattern: /\blynnwood\b/i, stationId: "lynnwood-city-center" },
  { pattern: /\bjudkins park\b/i, stationId: "judkins-park" },
  { pattern: /\bmercer island\b/i, stationId: "mercer-island" },
  { pattern: /\bsouth bellevue\b/i, stationId: "south-bellevue" },
  { pattern: /\beast main\b/i, stationId: "east-main" },
  { pattern: /\bbellevue downtown\b/i, stationId: "bellevue-downtown" },
  { pattern: /\bwilburton\b/i, stationId: "wilburton" },
  { pattern: /\bspring district|120th\b/i, stationId: "spring-district-120th" },
  { pattern: /\bbel-red|130th\b/i, stationId: "bel-red-130th" },
  { pattern: /\boverlake village\b/i, stationId: "overlake-village" },
  { pattern: /\bredmond technology\b/i, stationId: "redmond-technology" },
  { pattern: /\bmarymoor\b/i, stationId: "marymoor-village" },
  { pattern: /\bdowntown redmond\b/i, stationId: "downtown-redmond" },
  { pattern: /\bfederal way\b/i, stationId: "federal-way-downtown" },
  { pattern: /\bkent des moines\b/i, stationId: "kent-des-moines" },
  { pattern: /\bstar lake\b/i, stationId: "star-lake" },
];

function findStationsInTextByPattern(
  text: string,
  patterns: Array<{ pattern: RegExp; stationId: string }>
): string[] {
  const found: string[] = [];
  for (const { pattern, stationId } of patterns) {
    if (pattern.test(text) && !found.includes(stationId)) {
      found.push(stationId);
    }
  }
  return found;
}

// Shared helper to fetch and decode a GTFS-RT protobuf feed
async function fetchGtfsRtFeed(
  url: string
): Promise<GtfsRealtimeBindings.transit_realtime.FeedMessage | null> {
  try {
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

// Shared helper to detect elevator/escalator outages from alert text and add them to stations
function detectEquipmentOutages(
  fullText: string,
  affectedStations: string[],
  outagesByStation: Record<string, UnitOutage[]>,
  headerText: string,
  postedAt: string,
  expiresAt: string | null
): { elevatorOutages: number; escalatorOutages: number } {
  let elevatorOutages = 0;
  let escalatorOutages = 0;

  const lowerFullText = fullText.toLowerCase();
  const hasElevatorOutage =
    lowerFullText.includes("elevator") &&
    (lowerFullText.includes("out of service") ||
      lowerFullText.includes("unavailable") ||
      lowerFullText.includes("closed") ||
      lowerFullText.includes("outage"));
  const hasEscalatorOutage =
    lowerFullText.includes("escalator") &&
    (lowerFullText.includes("out of service") ||
      lowerFullText.includes("unavailable") ||
      lowerFullText.includes("closed") ||
      lowerFullText.includes("outage"));

  if ((hasElevatorOutage || hasEscalatorOutage) && affectedStations.length > 0) {
    for (const stationId of affectedStations) {
      if (!outagesByStation[stationId]) {
        outagesByStation[stationId] = [];
      }
      if (hasElevatorOutage) {
        outagesByStation[stationId].push({
          unitName: "Elevator",
          unitType: "elevator",
          location: headerText,
          symptom: "Out of service",
          outOfServiceSince: postedAt,
          estimatedReturn: expiresAt,
          updatedAt: postedAt,
        });
        elevatorOutages++;
      }
      if (hasEscalatorOutage) {
        outagesByStation[stationId].push({
          unitName: "Escalator",
          unitType: "escalator",
          location: headerText,
          symptom: "Out of service",
          outOfServiceSince: postedAt,
          estimatedReturn: expiresAt,
          updatedAt: postedAt,
        });
        escalatorOutages++;
      }
    }
  }

  return { elevatorOutages, escalatorOutages };
}

// Map GTFS-RT Effect enum to our alert type classification
function mapGtfsEffect(effect: number | null | undefined): "delay" | "emergency" | "advisory" {
  switch (effect) {
    case 1: // NO_SERVICE
      return "emergency";
    case 2: // REDUCED_SERVICE
    case 3: // SIGNIFICANT_DELAYS
    case 4: // DETOUR
    case 6: // MODIFIED_SERVICE
      return "delay";
    default:
      return "advisory";
  }
}

async function fetchBartIncidents(): Promise<IncidentData | null> {
  try {
    // Fetch both BSA (service advisories) and elevator status
    const [bsaResponse, elevResponse] = await Promise.all([
      fetch(`${BART_API_BASE}/bsa.aspx?cmd=bsa&key=${BART_API_KEY}&json=y`, {
        next: { revalidate: 300 },
      }),
      fetch(`${BART_API_BASE}/bsa.aspx?cmd=elev&key=${BART_API_KEY}&json=y`, {
        next: { revalidate: 300 },
      }),
    ]);

    if (!bsaResponse.ok || !elevResponse.ok) {
      return null;
    }

    const bsaData = (await bsaResponse.json()) as BartApiResponse;
    const elevData = (await elevResponse.json()) as BartApiResponse;

    const alerts: ServiceAlert[] = [];
    const outagesByStation: Record<string, UnitOutage[]> = {};
    let elevatorOutages = 0;

    // Process service advisories
    for (const bsa of bsaData.root.bsa || []) {
      const description = bsa.description?.["#cdata-section"] || "";
      const type = bsa.type?.toLowerCase() as "delay" | "emergency" | "advisory";

      alerts.push({
        id: bsa["@id"],
        type: type === "delay" || type === "emergency" ? type : "advisory",
        title: bsa.type || "Service Advisory",
        description: description.trim(),
        postedAt: bsa.posted || new Date().toISOString(),
        expiresAt: bsa.expires || null,
      });
    }

    // Process elevator outages
    for (const elev of elevData.root.bsa || []) {
      const description = elev.description?.["#cdata-section"] || "";

      // Parse elevator outage description to extract station codes
      // Format: "There is 1 elevator out of service at this time: BAYF: Station"
      const stationMatches = description.match(/([A-Z]{4}):/g);
      if (stationMatches) {
        for (const match of stationMatches) {
          const stationCode = match.replace(":", "");
          const stationId = BART_STATION_CODES[stationCode];

          if (stationId) {
            if (!outagesByStation[stationId]) {
              outagesByStation[stationId] = [];
            }

            // Extract location info after the station code
            const locationMatch = description.match(new RegExp(`${stationCode}:\\s*([^,]+)`));
            const location = locationMatch ? locationMatch[1].trim() : "Station";

            outagesByStation[stationId].push({
              unitName: `${stationCode} Elevator`,
              unitType: "elevator",
              location: location,
              symptom: "Out of service",
              outOfServiceSince: elev.posted || new Date().toISOString(),
              estimatedReturn: null,
              updatedAt: `${elevData.root.date} ${elevData.root.time}`,
            });
            elevatorOutages++;
          }
        }
      }
    }

    const stationsAffected = Object.keys(outagesByStation).length;

    return {
      fetchedAt: new Date().toISOString(),
      systemId: "bart",
      summary: {
        totalOutages: elevatorOutages,
        elevatorOutages,
        escalatorOutages: 0, // BART API doesn't provide escalator status
        stationsAffected,
        activeAlerts: alerts.length,
      },
      alerts,
      outagesByStation,
    };
  } catch {
    return null;
  }
}

async function fetchSoundTransitIncidents(): Promise<IncidentData | null> {
  const feed = await fetchGtfsRtFeed(SOUND_TRANSIT_ALERTS_URL);
  if (!feed) return null;

  const alerts: ServiceAlert[] = [];
  const outagesByStation: Record<string, UnitOutage[]> = {};
  let elevatorOutages = 0;
  let escalatorOutages = 0;

  for (const entity of feed.entity || []) {
    const alert = entity.alert;
    if (!alert) continue;

    const headerText = alert.headerText?.translation?.[0]?.text || "Service Alert";
    const descriptionText = alert.descriptionText?.translation?.[0]?.text || "";
    const fullText = `${headerText} ${descriptionText}`;
    const alertType = mapGtfsEffect(alert.effect);

    // Extract affected lines from informed_entity
    const affectedLines: string[] = [];
    for (const informed of alert.informedEntity || []) {
      if (informed.routeId) {
        const lineId = SOUND_TRANSIT_ROUTES[informed.routeId];
        if (lineId && !affectedLines.includes(lineId)) {
          affectedLines.push(lineId);
        }
      }
    }

    // Find affected stations by searching text
    const affectedStations = findStationsInTextByPattern(fullText, SOUND_TRANSIT_STATION_PATTERNS);

    // Convert timestamps
    const startTime = alert.activePeriod?.[0]?.start;
    const endTime = alert.activePeriod?.[0]?.end;
    const postedAt = startTime
      ? new Date(Number(startTime) * 1000).toISOString()
      : new Date().toISOString();
    const expiresAt = endTime ? new Date(Number(endTime) * 1000).toISOString() : null;

    // Detect elevator/escalator outages from alert text
    const equipment = detectEquipmentOutages(
      fullText,
      affectedStations,
      outagesByStation,
      headerText,
      postedAt,
      expiresAt
    );
    elevatorOutages += equipment.elevatorOutages;
    escalatorOutages += equipment.escalatorOutages;

    alerts.push({
      id: entity.id,
      type: alertType,
      title: headerText,
      description: descriptionText.trim(),
      affectedLines: affectedLines.length > 0 ? affectedLines : undefined,
      affectedStations: affectedStations.length > 0 ? affectedStations : undefined,
      postedAt,
      expiresAt,
    });
  }

  const stationsAffected = Object.keys(outagesByStation).length;

  return {
    fetchedAt: new Date().toISOString(),
    systemId: "sound-transit",
    summary: {
      totalOutages: elevatorOutages + escalatorOutages,
      elevatorOutages,
      escalatorOutages,
      stationsAffected,
      activeAlerts: alerts.length,
    },
    alerts,
    outagesByStation,
  };
}

async function fetchNycSubwayIncidents(): Promise<IncidentData | null> {
  try {
    // Fetch protobuf alerts and JSON elevator/escalator data in parallel
    const [feed, eneResponse] = await Promise.all([
      fetchGtfsRtFeed(NYC_SUBWAY_ALERTS_URL),
      fetch(NYC_SUBWAY_ENE_URL, { next: { revalidate: 300 } }),
    ]);

    const alerts: ServiceAlert[] = [];
    const outagesByStation: Record<string, UnitOutage[]> = {};
    let elevatorOutages = 0;
    let escalatorOutages = 0;

    // Process service alerts from protobuf feed
    if (feed) {
      for (const entity of feed.entity || []) {
        const alert = entity.alert;
        if (!alert) continue;

        // Filter to subway alerts only (skip SIR / Staten Island Railway)
        const isSubway = (alert.informedEntity || []).some((ie) => ie.agencyId === "MTASBWY");
        if (!isSubway) continue;

        const headerText = alert.headerText?.translation?.[0]?.text || "Service Alert";
        const descriptionText = alert.descriptionText?.translation?.[0]?.text || "";
        const alertType = mapGtfsEffect(alert.effect);

        // Extract affected lines from informed_entity route_ids
        const affectedLines: string[] = [];
        for (const ie of alert.informedEntity || []) {
          if (ie.routeId) {
            const lineId = mapNycRouteId(ie.routeId);
            if (lineId && !affectedLines.includes(lineId)) {
              affectedLines.push(lineId);
            }
          }
        }

        const startTime = alert.activePeriod?.[0]?.start;
        const endTime = alert.activePeriod?.[0]?.end;
        const postedAt = startTime
          ? new Date(Number(startTime) * 1000).toISOString()
          : new Date().toISOString();
        const expiresAt = endTime ? new Date(Number(endTime) * 1000).toISOString() : null;

        alerts.push({
          id: entity.id,
          type: alertType,
          title: headerText,
          description: descriptionText.trim(),
          affectedLines: affectedLines.length > 0 ? affectedLines : undefined,
          postedAt,
          expiresAt,
        });
      }
    }

    // Process elevator/escalator outages from JSON feed
    if (eneResponse.ok) {
      const eneData = (await eneResponse.json()) as NycSubwayEneOutage[];
      const stationIndex = await getNycStationIndex();

      for (const outage of eneData || []) {
        // Skip upcoming outages — only show current
        if (outage.isupcomingoutage === "Y") continue;

        const normalizedName = normalizeStationName(outage.station);
        const candidates = stationIndex.get(normalizedName);
        if (!candidates || candidates.length === 0) continue;

        // Disambiguate by line overlap if multiple stations share name
        let matchedStation = candidates[0];
        if (candidates.length > 1 && outage.trainno) {
          const outageLines = outage.trainno
            .split("/")
            .map((t) => t.trim())
            .map(mapNycRouteId)
            .filter((id): id is string => id !== null);

          const scored = candidates.map((c) => ({
            ...c,
            overlap: c.lines.filter((l) => outageLines.includes(l)).length,
          }));
          const best = scored.reduce((a, b) => (b.overlap > a.overlap ? b : a));
          if (best.overlap > 0) matchedStation = best;
        }

        const unitType = outage.equipmenttype === "EL" ? "elevator" : "escalator";

        if (!outagesByStation[matchedStation.id]) {
          outagesByStation[matchedStation.id] = [];
        }

        outagesByStation[matchedStation.id].push({
          unitName: `${outage.equipmenttype === "EL" ? "Elevator" : "Escalator"} ${outage.equipmentno}`,
          unitType,
          location: outage.serving || outage.station,
          symptom: outage.reason || "Out of service",
          outOfServiceSince: outage.outagedate || new Date().toISOString(),
          estimatedReturn: outage.estimatedreturntoservice || null,
          updatedAt: outage.outagedate || new Date().toISOString(),
        });

        if (unitType === "elevator") elevatorOutages++;
        else escalatorOutages++;
      }
    }

    const stationsAffected = Object.keys(outagesByStation).length;

    return {
      fetchedAt: new Date().toISOString(),
      systemId: "nyc-subway",
      summary: {
        totalOutages: elevatorOutages + escalatorOutages,
        elevatorOutages,
        escalatorOutages,
        stationsAffected,
        activeAlerts: alerts.length,
      },
      alerts,
      outagesByStation,
    };
  } catch {
    return null;
  }
}

// MTA Maryland GTFS-RT alerts feed (protobuf, public, no auth required)
// Covers all MTA Maryland modes: Light RailLink, Metro SubwayLink, MARC, Bus
const MTA_MARYLAND_ALERTS_URL = "https://feeds.mta.maryland.gov/alerts.pb";

// MTA Maryland GTFS route IDs for rail systems
const MTA_MARYLAND_LIGHT_RAIL_ROUTE = "11693";
const MTA_MARYLAND_METRO_ROUTE = "11682";

// Baltimore Metro SubwayLink: GTFS parent station ID → our station ID
const BALTIMORE_METRO_STOPS: Record<string, string> = {
  s0001: "owings-mills",
  s0002: "old-court",
  s0003: "milford-mill",
  s0004: "reisterstown-plaza",
  s0005: "rogers-avenue",
  s0006: "west-cold-spring",
  s0007: "mondawmin",
  s0008: "penn-north",
  s0009: "upton",
  s0010: "state-center",
  s0011: "lexington-market",
  s0012: "charles-center",
  s0013: "shot-tower",
  s0014: "johns-hopkins-hospital",
};

// Baltimore Light RailLink: GTFS parent station ID → our station ID
const BALTIMORE_LIGHT_RAIL_STOPS: Record<string, string> = {
  s7001: "cromwell-station-glen-burnie",
  s7002: "ferndale",
  s7003: "bwi-airport",
  s7004: "bwi-business-district",
  s7005: "linthicum",
  s7006: "north-linthicum",
  s7007: "nursery-road",
  s7008: "baltimore-highlands",
  s7009: "patapsco",
  s7010: "cherry-hill",
  s7011: "westport",
  s7012: "stadium-federal-hill",
  s7013: "camden-yards",
  s7014: "convention-center",
  s7015: "university-center-baltimore-street",
  s7016: "lexington-market",
  s7017: "centre-street",
  s7018: "cultural-center",
  s7019: "university-of-baltimore-mt-royal",
  s7020: "penn-station",
  s7021: "north-avenue",
  s7022: "woodberry",
  s7023: "cold-spring-lane",
  s7024: "mt-washington",
  s7025: "falls-road",
  s7026: "lutherville",
  s7027: "timonium-business-park",
  s7028: "fairgrounds",
  s7029: "warren-road",
  s7030: "gilroy-road",
  s7031: "mccormick-road",
  s7032: "pepper-road",
  s7033: "hunt-valley",
  s7034: "penn-station",
};

// Station name patterns for text matching in MTA Maryland alerts
const BALTIMORE_METRO_STATION_PATTERNS: Array<{ pattern: RegExp; stationId: string }> = [
  { pattern: /\bowings mills\b/i, stationId: "owings-mills" },
  { pattern: /\bold court\b/i, stationId: "old-court" },
  { pattern: /\bmilford mill\b/i, stationId: "milford-mill" },
  { pattern: /\breisterstown\b/i, stationId: "reisterstown-plaza" },
  { pattern: /\brogers ave/i, stationId: "rogers-avenue" },
  { pattern: /\bwest cold spring\b/i, stationId: "west-cold-spring" },
  { pattern: /\bmondawmin\b/i, stationId: "mondawmin" },
  { pattern: /\bpenn north\b/i, stationId: "penn-north" },
  { pattern: /\bupton\b/i, stationId: "upton" },
  { pattern: /\bstate center\b/i, stationId: "state-center" },
  { pattern: /\blexington market\b/i, stationId: "lexington-market" },
  { pattern: /\bcharles center\b/i, stationId: "charles-center" },
  { pattern: /\bshot tower\b/i, stationId: "shot-tower" },
  { pattern: /\bjohns hopkins\b/i, stationId: "johns-hopkins-hospital" },
];

const BALTIMORE_LIGHT_RAIL_STATION_PATTERNS: Array<{ pattern: RegExp; stationId: string }> = [
  { pattern: /\bhunt valley\b/i, stationId: "hunt-valley" },
  { pattern: /\bpepper road\b/i, stationId: "pepper-road" },
  { pattern: /\bmccormick\b/i, stationId: "mccormick-road" },
  { pattern: /\bgilroy\b/i, stationId: "gilroy-road" },
  { pattern: /\bwarren road\b/i, stationId: "warren-road" },
  { pattern: /\bfairgrounds?\b/i, stationId: "fairgrounds" },
  { pattern: /\btimonium\b/i, stationId: "timonium-business-park" },
  { pattern: /\blutherville\b/i, stationId: "lutherville" },
  { pattern: /\bfalls road\b/i, stationId: "falls-road" },
  { pattern: /\bmt\.?\s*washington\b/i, stationId: "mt-washington" },
  { pattern: /\bcold spring\b/i, stationId: "cold-spring-lane" },
  { pattern: /\bwoodberry\b/i, stationId: "woodberry" },
  { pattern: /\bnorth ave/i, stationId: "north-avenue" },
  { pattern: /\bmt\.?\s*royal|mica\b/i, stationId: "university-of-baltimore-mt-royal" },
  { pattern: /\bcultural center\b/i, stationId: "cultural-center" },
  { pattern: /\bcentre st/i, stationId: "centre-street" },
  { pattern: /\blexington market\b/i, stationId: "lexington-market" },
  {
    pattern: /\bbaltimore arena|university center\b/i,
    stationId: "university-center-baltimore-street",
  },
  { pattern: /\bconvention center\b/i, stationId: "convention-center" },
  { pattern: /\bcamden\b/i, stationId: "camden-yards" },
  { pattern: /\bstadium|federal hill|hamburg\b/i, stationId: "stadium-federal-hill" },
  { pattern: /\bwestport\b/i, stationId: "westport" },
  { pattern: /\bcherry hill\b/i, stationId: "cherry-hill" },
  { pattern: /\bpatapsco\b/i, stationId: "patapsco" },
  { pattern: /\bbaltimore highlands\b/i, stationId: "baltimore-highlands" },
  { pattern: /\bnursery road\b/i, stationId: "nursery-road" },
  { pattern: /\bnorth linthicum\b/i, stationId: "north-linthicum" },
  { pattern: /\blinthicum\b(?!\s*heights)/i, stationId: "linthicum" },
  { pattern: /\bferndale\b/i, stationId: "ferndale" },
  { pattern: /\bcromwell|glen burnie\b/i, stationId: "cromwell-station-glen-burnie" },
  { pattern: /\bbwi business\b/i, stationId: "bwi-business-district" },
  { pattern: /\bbwi airport\b|bwi\b(?!\s*business)/i, stationId: "bwi-airport" },
  { pattern: /\bpenn station\b/i, stationId: "penn-station" },
];

// Shared parsed feed cache for MTA Maryland (both systems use the same feed)
let mtaMarylandFeedCache: {
  data: GtfsRealtimeBindings.transit_realtime.FeedMessage;
  fetchedAt: number;
} | null = null;
const MTA_MARYLAND_FEED_CACHE_TTL = 5 * 60 * 1000;

async function fetchMtaMarylandFeed(): Promise<GtfsRealtimeBindings.transit_realtime.FeedMessage | null> {
  if (
    mtaMarylandFeedCache &&
    Date.now() - mtaMarylandFeedCache.fetchedAt < MTA_MARYLAND_FEED_CACHE_TTL
  ) {
    return mtaMarylandFeedCache.data;
  }

  try {
    const response = await fetch(MTA_MARYLAND_ALERTS_URL, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    mtaMarylandFeedCache = { data: feed, fetchedAt: Date.now() };
    return feed;
  } catch {
    return null;
  }
}

async function fetchBaltimoreIncidents(
  systemId: string,
  targetRouteId: string,
  stopMapping: Record<string, string>,
  stationPatterns: Array<{ pattern: RegExp; stationId: string }>,
  lineId: string
): Promise<IncidentData | null> {
  const feed = await fetchMtaMarylandFeed();
  if (!feed) return null;

  const alerts: ServiceAlert[] = [];
  const outagesByStation: Record<string, UnitOutage[]> = {};
  let elevatorOutages = 0;
  let escalatorOutages = 0;

  for (const entity of feed.entity || []) {
    const alert = entity.alert;
    if (!alert) continue;

    // Check if this alert affects our target system
    const informedEntities = alert.informedEntity || [];
    const isRelevant = informedEntities.some((ie) => ie.routeId === targetRouteId);
    if (!isRelevant) continue;

    const headerText = alert.headerText?.translation?.[0]?.text || "Service Alert";
    const descriptionText = alert.descriptionText?.translation?.[0]?.text || "";
    const fullText = `${headerText} ${descriptionText}`;
    const alertType = mapGtfsEffect(alert.effect);

    // Convert timestamps
    const startTime = alert.activePeriod?.[0]?.start;
    const endTime = alert.activePeriod?.[0]?.end;
    const postedAt = startTime
      ? new Date(Number(startTime) * 1000).toISOString()
      : new Date().toISOString();
    const expiresAt = endTime ? new Date(Number(endTime) * 1000).toISOString() : null;

    // Find affected stations from stop_ids in informed_entity
    const affectedStations: string[] = [];
    for (const ie of informedEntities) {
      if (ie.stopId) {
        // Try direct parent station mapping
        const stationId = stopMapping[ie.stopId];
        if (stationId && !affectedStations.includes(stationId)) {
          affectedStations.push(stationId);
        }
      }
    }

    // Also try text matching for station names
    const textMatched = findStationsInTextByPattern(fullText, stationPatterns);
    for (const stationId of textMatched) {
      if (!affectedStations.includes(stationId)) {
        affectedStations.push(stationId);
      }
    }

    // Detect elevator/escalator outages from alert text
    const equipment = detectEquipmentOutages(
      fullText,
      affectedStations,
      outagesByStation,
      headerText,
      postedAt,
      expiresAt
    );
    elevatorOutages += equipment.elevatorOutages;
    escalatorOutages += equipment.escalatorOutages;

    alerts.push({
      id: entity.id,
      type: alertType,
      title: headerText,
      description: descriptionText.trim(),
      affectedLines: [lineId],
      affectedStations: affectedStations.length > 0 ? affectedStations : undefined,
      postedAt,
      expiresAt,
    });
  }

  const stationsAffected = Object.keys(outagesByStation).length;

  return {
    fetchedAt: new Date().toISOString(),
    systemId,
    summary: {
      totalOutages: elevatorOutages + escalatorOutages,
      elevatorOutages,
      escalatorOutages,
      stationsAffected,
      activeAlerts: alerts.length,
    },
    alerts,
    outagesByStation,
  };
}

async function fetchBaltimoreMetroIncidents(): Promise<IncidentData | null> {
  return fetchBaltimoreIncidents(
    "baltimore-metro",
    MTA_MARYLAND_METRO_ROUTE,
    BALTIMORE_METRO_STOPS,
    BALTIMORE_METRO_STATION_PATTERNS,
    "metro"
  );
}

async function fetchBaltimoreLightRailIncidents(): Promise<IncidentData | null> {
  return fetchBaltimoreIncidents(
    "baltimore-light-rail",
    MTA_MARYLAND_LIGHT_RAIL_ROUTE,
    BALTIMORE_LIGHT_RAIL_STOPS,
    BALTIMORE_LIGHT_RAIL_STATION_PATTERNS,
    "main-line"
  );
}

async function fetchCtaIncidents(): Promise<IncidentData | null> {
  try {
    const response = await fetch(CTA_ALERTS_URL, { next: { revalidate: 300 } });
    if (!response.ok) return null;

    const data = (await response.json()) as CtaAlertsResponse;
    const alerts: ServiceAlert[] = [];
    const outagesByStation: Record<string, UnitOutage[]> = {};
    let elevatorOutages = 0;
    let escalatorOutages = 0;

    for (const alert of data.CTAAlerts.Alert || []) {
      // Normalize Service to always be an array
      const services = Array.isArray(alert.ImpactedService.Service)
        ? alert.ImpactedService.Service
        : [alert.ImpactedService.Service];

      // Only process rail alerts
      const railServices = services.filter((s) => s.ServiceType === "R");
      if (railServices.length === 0) continue;

      // Map CTA route IDs to our line IDs
      const affectedLines = railServices.map((s) => CTA_ROUTE_TO_LINE[s.ServiceId]).filter(Boolean);

      // Determine alert type
      let alertType: "delay" | "emergency" | "advisory" = "advisory";
      if (alert.MajorAlert === "1") {
        alertType = "emergency";
      } else if (
        alert.SeverityCSS !== "planned" &&
        alert.SeverityCSS !== "special-note" &&
        parseInt(alert.SeverityScore) >= 50
      ) {
        alertType = "delay";
      }

      const fullText = `${alert.Headline} ${alert.ShortDescription}`;

      // Find affected stations from alert text
      const affectedStations = findStationsInTextByPattern(fullText, CTA_STATION_PATTERNS);

      // Detect elevator/escalator outages
      const equipment = detectEquipmentOutages(
        fullText,
        affectedStations,
        outagesByStation,
        alert.Headline,
        alert.EventStart,
        alert.EventEnd
      );
      elevatorOutages += equipment.elevatorOutages;
      escalatorOutages += equipment.escalatorOutages;

      alerts.push({
        id: alert.AlertId,
        type: alertType,
        title: alert.Headline,
        description: alert.ShortDescription,
        affectedLines: affectedLines.length > 0 ? affectedLines : undefined,
        affectedStations: affectedStations.length > 0 ? affectedStations : undefined,
        postedAt: alert.EventStart,
        expiresAt: alert.EventEnd,
      });
    }

    const stationsAffected = Object.keys(outagesByStation).length;

    return {
      fetchedAt: new Date().toISOString(),
      systemId: "cta",
      summary: {
        totalOutages: elevatorOutages + escalatorOutages,
        elevatorOutages,
        escalatorOutages,
        stationsAffected,
        activeAlerts: alerts.length,
      },
      alerts,
      outagesByStation,
    };
  } catch {
    return null;
  }
}

async function fetchTokyoMetroIncidents(): Promise<IncidentData | null> {
  if (!INCIDENTS_WORKER_URL) return null;
  try {
    const response = await fetch(`${INCIDENTS_WORKER_URL}/incidents/tokyo-metro`, {
      next: { revalidate: 300 },
    });
    if (response.ok) {
      return (await response.json()) as IncidentData;
    }
  } catch {
    // Worker unavailable
  }
  return null;
}

async function fetchWmataIncidents(): Promise<IncidentData | null> {
  if (!INCIDENTS_WORKER_URL) return null;
  try {
    const response = await fetch(`${INCIDENTS_WORKER_URL}/incidents/wmata`, {
      next: { revalidate: 300 },
    });
    if (response.ok) {
      return (await response.json()) as IncidentData;
    }
  } catch {
    // Worker unavailable
  }
  return null;
}

export async function getIncidents(systemId: string): Promise<IncidentData | null> {
  // Check supported systems
  const supportedSystems = [
    "wmata",
    "bart",
    "sound-transit",
    "nyc-subway",
    "baltimore-metro",
    "baltimore-light-rail",
    "tokyo-metro",
    "cta",
  ];
  if (!supportedSystems.includes(systemId)) return null;

  // Check cache first
  const cached = incidentCache.get(systemId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  // Fetch based on system
  let data: IncidentData | null = null;
  if (systemId === "bart") {
    data = await fetchBartIncidents();
  } else if (systemId === "wmata") {
    data = await fetchWmataIncidents();
  } else if (systemId === "sound-transit") {
    data = await fetchSoundTransitIncidents();
  } else if (systemId === "nyc-subway") {
    data = await fetchNycSubwayIncidents();
  } else if (systemId === "baltimore-metro") {
    data = await fetchBaltimoreMetroIncidents();
  } else if (systemId === "baltimore-light-rail") {
    data = await fetchBaltimoreLightRailIncidents();
  } else if (systemId === "tokyo-metro") {
    data = await fetchTokyoMetroIncidents();
  } else if (systemId === "cta") {
    data = await fetchCtaIncidents();
  }

  if (data) {
    incidentCache.set(systemId, { data, fetchedAt: Date.now() });
  }

  return data;
}

export async function getStationOutages(
  systemId: string,
  stationId: string
): Promise<UnitOutage[]> {
  const incidents = await getIncidents(systemId);
  if (!incidents) return [];
  return incidents.outagesByStation[stationId] || [];
}
