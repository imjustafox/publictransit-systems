import { promises as fs } from "fs";
import path from "path";
import type {
  TransitSystem,
  TransitNetwork,
  Line,
  Station,
  RailcarGeneration,
  HistoryEvent,
  IncidentData,
  UnitOutage,
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
export async function getLines(systemId: string, includeDisabled = false): Promise<Line[]> {
  const data = await loadJSON<{ lines: Line[] }>(`${systemId}/lines.json`);
  return includeDisabled ? data.lines : data.lines.filter((line) => line.status !== "disabled");
}

export async function getLine(systemId: string, lineId: string): Promise<Line | undefined> {
  const lines = await getLines(systemId);
  return lines.find((line) => line.id === lineId);
}

// Networks (declared in system.json for multi-mode systems; empty otherwise)
export async function getNetworks(systemId: string): Promise<TransitNetwork[]> {
  const system = await getSystem(systemId);
  return system.networks ?? [];
}

// A declared network is visible only when it has at least one active line.
// Placeholder networks whose lines are all disabled (Stride) stay declared
// for data completeness but never render.
export async function getVisibleNetworks(systemId: string): Promise<TransitNetwork[]> {
  const [networks, lines] = await Promise.all([getNetworks(systemId), getLines(systemId)]);
  return networks.filter((network) => lines.some((line) => line.network === network.id));
}

export async function getNetwork(
  systemId: string,
  networkId: string
): Promise<TransitNetwork | undefined> {
  const networks = await getNetworks(systemId);
  return networks.find((network) => network.id === networkId);
}

export async function getLinesByNetwork(
  systemId: string,
  networkId: string,
  includeDisabled = false
): Promise<Line[]> {
  const lines = await getLines(systemId, includeDisabled);
  return lines.filter((line) => line.network === networkId);
}

// A station's networks are derived from its lines at read time, never stored.
// Order follows the station's line order, so the first entry is the canonical
// network the station's URL lives under.
export async function getStationNetworkIds(systemId: string, station: Station): Promise<string[]> {
  const lines = await getLines(systemId, true);
  const networkIds: string[] = [];
  for (const lineId of station.lines) {
    const network = lines.find((line) => line.id === lineId)?.network;
    if (network && !networkIds.includes(network)) {
      networkIds.push(network);
    }
  }
  return networkIds;
}

export async function getStationCanonicalNetworkId(
  systemId: string,
  station: Station
): Promise<string | undefined> {
  const networkIds = await getStationNetworkIds(systemId, station);
  return networkIds[0];
}

export async function getStationsByNetwork(
  systemId: string,
  networkId: string
): Promise<Station[]> {
  const [stations, lines] = await Promise.all([getStations(systemId), getLines(systemId, true)]);
  const networkLineIds = new Set(
    lines.filter((line) => line.network === networkId).map((line) => line.id)
  );
  return stations.filter((station) => station.lines.some((lineId) => networkLineIds.has(lineId)));
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

// Line geometry (shape-derived polylines written by the GTFS pipeline)
export async function getLineGeometry(
  systemId: string,
  lineId: string
): Promise<[number, number][][] | null> {
  const all = await getLineGeometries(systemId, [lineId]);
  return all[lineId] ?? null;
}

export async function getLineGeometries(
  systemId: string,
  lineIds: string[]
): Promise<Record<string, [number, number][][]>> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, systemId, "geometry.json"), "utf-8");
    const geometry = JSON.parse(raw) as Record<
      string,
      { shapes?: Array<{ coordinates: [number, number][] }> }
    >;
    const out: Record<string, [number, number][][]> = {};
    for (const id of lineIds) {
      const shapes = geometry[id]?.shapes;
      if (shapes?.length) out[id] = shapes.map((s) => s.coordinates);
    }
    return out;
  } catch {
    return {};
  }
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

export function getNetworkUrl(systemId: string, networkId: string): string {
  return `/${systemId}/${networkId}`;
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

// The worker keeps its own feed ids; a merged app system maps onto several
// worker feeds. Station keys that were renamed in the merge are translated.
const WORKER_FEED_ALIASES: Record<
  string,
  Array<{ feed: string; renames?: Record<string, string> }>
> = {
  "mta-maryland": [
    { feed: "baltimore-metro" },
    {
      feed: "baltimore-light-rail",
      renames: { "lexington-market": "lexington-market-light-rail" },
    },
  ],
};

async function fetchWorkerFeed(feedId: string): Promise<IncidentData | null> {
  try {
    const response = await fetch(`${INCIDENTS_WORKER_URL}/incidents/${feedId}`, {
      next: { revalidate: 300 },
    });
    if (response.ok) {
      return (await response.json()) as IncidentData;
    }
  } catch {
    // Worker unavailable; pages render without incident data.
  }
  return null;
}

export async function getIncidents(systemId: string): Promise<IncidentData | null> {
  // Systems the incidents worker polls. Keep in sync with SYSTEM_IDS in
  // workers/incidents/src/index.ts.
  const supportedSystems = [
    "wmata",
    "bart",
    "sound-transit",
    "nyc-subway",
    "mta-maryland",
    "tokyo-metro",
    "cta",
    "rtd-denver",
  ];
  if (!supportedSystems.includes(systemId)) return null;
  if (!INCIDENTS_WORKER_URL) return null;

  const cached = incidentCache.get(systemId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  const aliases = WORKER_FEED_ALIASES[systemId];
  if (!aliases) {
    const data = await fetchWorkerFeed(systemId);
    if (data) incidentCache.set(systemId, { data, fetchedAt: Date.now() });
    return data;
  }

  const feeds = (await Promise.all(aliases.map((a) => fetchWorkerFeed(a.feed)))).map((data, i) => ({
    data,
    renames: aliases[i].renames,
  }));
  const present = feeds.filter((f) => f.data !== null);
  if (present.length === 0) return null;

  const merged: IncidentData = {
    fetchedAt: new Date().toISOString(),
    systemId,
    summary: {
      totalOutages: 0,
      elevatorOutages: 0,
      escalatorOutages: 0,
      stationsAffected: 0,
      activeAlerts: 0,
    },
    alerts: [],
    outagesByStation: {},
  };
  for (const { data, renames } of present) {
    const d = data!;
    merged.summary.totalOutages += d.summary.totalOutages;
    merged.summary.elevatorOutages += d.summary.elevatorOutages;
    merged.summary.escalatorOutages += d.summary.escalatorOutages;
    merged.summary.activeAlerts =
      (merged.summary.activeAlerts ?? 0) + (d.summary.activeAlerts ?? 0);
    merged.alerts!.push(...(d.alerts ?? []));
    for (const [station, outages] of Object.entries(d.outagesByStation)) {
      merged.outagesByStation[renames?.[station] ?? station] = outages;
    }
  }
  merged.summary.stationsAffected = Object.keys(merged.outagesByStation).length;
  incidentCache.set(systemId, { data: merged, fetchedAt: Date.now() });
  return merged;
}

export async function getStationOutages(
  systemId: string,
  stationId: string
): Promise<UnitOutage[]> {
  const incidents = await getIncidents(systemId);
  if (!incidents) return [];
  return incidents.outagesByStation[stationId] || [];
}
