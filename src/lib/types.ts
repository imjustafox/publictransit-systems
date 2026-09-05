// Transit System Types

export type StationStatus = "active" | "closed" | "under-construction" | "disabled";
export type RailcarStatus = "active" | "retired" | "testing";
export type EntranceAccessibility = "elevator" | "escalator" | "stairs-only";
export type DistanceUnit = "km" | "mi";
export type TopologyType = "linear" | "loop" | "lollipop";
export type LineIndicatorShape = "circle" | "square";
export type ServicePattern =
  "full-time" | "alternating" | "peak-only" | "weekend-only" | "rush-hour";
export type DataSource = "json" | "gtfs";

export interface StationEntrance {
  id: string;
  name: string;
  coordinates: Coordinates;
  accessibility?: EntranceAccessibility[];
  wheelchair?: boolean;
  description?: string;
  street?: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface TransitNetwork {
  id: string;
  name: string;
  // Free mode label, e.g. "light-rail", "commuter-rail", "metro", "tram".
  type: string;
}

export interface TransitSystem {
  id: string;
  name: string;
  shortName: string;
  location: string;
  region: string;
  country: string;
  opened: string;
  overview: string;
  website: string;
  stats: SystemStats;
  colors: {
    primary: string;
    secondary: string;
  };
  lineIndicatorShape?: LineIndicatorShape;
  dataSource?: DataSource;
  // OSM enrichment runs for every system unless a system opts out.
  osmEnrichment?: boolean;
  // Declared networks for multi-mode systems; absent for single-mode systems.
  networks?: TransitNetwork[];
}

export interface SystemStats {
  totalStations: number;
  totalLines: number;
  annualRidership: string;
  // Hand-authored published figure; absent until someone sources one.
  trackLength?: number;
  trackMiles?: number; // deprecated, use trackLength
  dailyRidership: string;
  distanceUnit: DistanceUnit;
}

export interface RouteBranch {
  id: string;
  name: string;
  termini: string[];
  branchStation: string;
  servicePattern: ServicePattern;
  description?: string;
}

export interface LineTopology {
  type: TopologyType;
  branches?: RouteBranch[];
  loopStation?: string;
  referenceStation?: string;
}

export interface Line {
  id: string;
  systemId: string;
  name: string;
  color: string;
  colorHex: string;
  // Declared network id; present on every line of a system that declares networks.
  network?: string;
  abbreviation?: string;
  opened?: string;
  status: StationStatus;
  stations?: string[];
  stationCount?: number;
  termini: string[];
  topology: LineTopology;
  length: number;
  description: string;
}

export interface Station {
  id: string;
  systemId: string;
  name: string;
  localName?: string;
  lines: string[];
  opened?: string;
  status: StationStatus;
  closedDate?: string;
  coordinates?: Coordinates;
  wikipedia?: string;
  address?: string;
  features: string[];
  description?: string;
  connections?: string[];
  entrances?: StationEntrance[];
  // Stable external identifiers; import and enrichment tooling matches on
  // these instead of names or proximity when refreshing.
  gtfsId?: string;
  osmId?: string;
  wikidata?: string;
}

export interface RailcarGeneration {
  id: string;
  systemId: string;
  name: string;
  manufacturer: string;
  introduced: number;
  retired?: number;
  status: RailcarStatus;
  count: number;
  specs: RailcarSpecs;
  description: string;
}

export interface RailcarSpecs {
  length: string;
  width: string;
  capacity: number;
  seatedCapacity: number;
  maxSpeed: string;
  weight?: string;
  traction?: string;
}

export interface HistoryEvent {
  date: string;
  title: string;
  description: string;
}

// Outage/Incident Types
export interface UnitOutage {
  unitName: string;
  unitType: "elevator" | "escalator";
  location: string;
  symptom: string;
  outOfServiceSince: string;
  estimatedReturn: string | null;
  updatedAt: string;
}

export interface ServiceAlert {
  id: string;
  type: "delay" | "emergency" | "advisory";
  title: string;
  description: string;
  affectedLines?: string[];
  affectedStations?: string[];
  postedAt: string;
  expiresAt: string | null;
}

export interface IncidentData {
  fetchedAt: string;
  systemId: string;
  summary: {
    totalOutages: number;
    elevatorOutages: number;
    escalatorOutages: number;
    stationsAffected: number;
    activeAlerts?: number;
  };
  alerts?: ServiceAlert[];
  outagesByStation: Record<string, UnitOutage[]>;
}

// Search Result Types
export interface SearchResult {
  type: "system" | "station" | "line" | "railcar";
  id: string;
  systemId: string;
  name: string;
  subtitle?: string;
  description?: string;
  metadata?: string;
  url: string;
}
