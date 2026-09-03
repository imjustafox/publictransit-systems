import { promises as fs } from "fs";
import path from "path";
import type {
  TransitSystem,
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

export async function getIncidents(systemId: string): Promise<IncidentData | null> {
  // Systems the incidents worker polls. Keep in sync with SYSTEM_IDS in
  // workers/incidents/src/index.ts.
  const supportedSystems = [
    "wmata",
    "bart",
    "sound-transit",
    "nyc-subway",
    "baltimore-metro",
    "baltimore-light-rail",
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

  try {
    const response = await fetch(`${INCIDENTS_WORKER_URL}/incidents/${systemId}`, {
      next: { revalidate: 300 },
    });
    if (response.ok) {
      const data = (await response.json()) as IncidentData;
      incidentCache.set(systemId, { data, fetchedAt: Date.now() });
      return data;
    }
  } catch {
    // Worker unavailable; pages render without incident data.
  }
  return null;
}

export async function getStationOutages(
  systemId: string,
  stationId: string
): Promise<UnitOutage[]> {
  const incidents = await getIncidents(systemId);
  if (!incidents) return [];
  return incidents.outagesByStation[stationId] || [];
}
