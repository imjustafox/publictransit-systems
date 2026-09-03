// Onboarding helpers: build the initial id_map and overlay for a system that
// already has hand-maintained JSON, so flipping it to dataSource "gtfs"
// preserves existing station ids (URLs) and every hand-authored field.

type Plain = Record<string, unknown>;

export interface SeedStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

export interface ExistingStation {
  id: string;
  name: string;
  coordinates?: { lat: number; lng: number };
  [k: string]: unknown;
}

const EARTH_RADIUS_M = 6371008.8;

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export interface SeedResult {
  stations: Record<string, string>; // gtfs stop_id -> existing station id
  unmatchedStops: SeedStop[];
  unmatchedStations: ExistingStation[];
}

// Greedy nearest-neighbor matching: every feed stop pairs with the closest
// existing station within maxMeters, closest pairs claimed first so two stops
// cannot share one station.
export function seedStationIdMap(
  stops: SeedStop[],
  stations: ExistingStation[],
  maxMeters = 250
): SeedResult {
  const candidates: Array<{ stop: SeedStop; station: ExistingStation; d: number }> = [];
  for (const stop of stops) {
    for (const station of stations) {
      if (!station.coordinates) continue;
      const d = distanceMeters({ lat: stop.stop_lat, lng: stop.stop_lon }, station.coordinates);
      if (d <= maxMeters) candidates.push({ stop, station, d });
    }
  }
  candidates.sort((a, b) => a.d - b.d);

  const map: Record<string, string> = {};
  const claimedStops = new Set<string>();
  const claimedStations = new Set<string>();
  for (const c of candidates) {
    if (claimedStops.has(c.stop.stop_id) || claimedStations.has(c.station.id)) continue;
    map[c.stop.stop_id] = c.station.id;
    claimedStops.add(c.stop.stop_id);
    claimedStations.add(c.station.id);
  }

  return {
    stations: map,
    unmatchedStops: stops.filter((s) => !claimedStops.has(s.stop_id)),
    unmatchedStations: stations.filter((s) => !claimedStations.has(s.id)),
  };
}

const GENERATED_STATION_FIELDS = new Set(["id", "systemId", "lines", "status", "coordinates"]);
const GENERATED_LINE_FIELDS = new Set([
  "id",
  "systemId",
  "status",
  "stations",
  "stationCount",
  "termini",
  "topology",
  "length",
]);

// Everything the generator cannot produce is, by definition, a hand decision.
export function extractStationOverlay(station: Plain): Plain | undefined {
  const overlay: Plain = {};
  for (const [k, v] of Object.entries(station)) {
    if (!GENERATED_STATION_FIELDS.has(k)) overlay[k] = v;
  }
  // name IS generated (from the feed), but a hand rename must survive; callers
  // drop it when it matches the feed name.
  return Object.keys(overlay).length ? overlay : undefined;
}

export function extractLineOverlay(line: Plain): Plain | undefined {
  const overlay: Plain = {};
  for (const [k, v] of Object.entries(line)) {
    if (!GENERATED_LINE_FIELDS.has(k)) overlay[k] = v;
  }
  return Object.keys(overlay).length ? overlay : undefined;
}
