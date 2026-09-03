// Pure enrichment logic: match Overpass elements to our stations and build
// the per-system osm.json layer. Merge order across the pipeline is
// feed base < OSM layer < hand overlay; for JSON-only systems the same field
// rules apply directly (see applyOsmToStations).

import type { OsmElement } from "./overpass";

type Coordinates = { lat: number; lng: number };

export interface EnrichStation {
  id: string;
  name: string;
  coordinates?: Coordinates;
  osmId?: string;
  wikidata?: string;
  entrances?: unknown[];
  features?: string[];
  [k: string]: unknown;
}

export interface OsmEntrance {
  id: string;
  name: string;
  coordinates: Coordinates;
  accessibility: string[];
  wheelchair?: boolean;
}

export interface OsmStationLayer {
  osmId?: string;
  wikidata?: string;
  features?: string[];
  entrances?: OsmEntrance[];
}

export type OsmLayer = { stations: Record<string, OsmStationLayer> };

const EARTH_RADIUS_M = 6371008.8;
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function coordsOf(el: OsmElement): Coordinates | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

export function isStationElement(el: OsmElement): boolean {
  const r = el.tags?.railway;
  return r === "station" || r === "halt" || r === "tram_stop";
}

export function isEntranceElement(el: OsmElement): boolean {
  const r = el.tags?.railway;
  return r === "subway_entrance" || r === "train_station_entrance";
}

export function isElevatorElement(el: OsmElement): boolean {
  return el.tags?.highway === "elevator";
}

// If an OSM station already carries a stable id we previously recorded, match
// on it; otherwise greedy nearest within maxMeters, closest pairs first.
export function matchStationsToOsm(
  stations: EnrichStation[],
  elements: OsmElement[],
  maxMeters = 200
): Map<string, OsmElement> {
  const osmStations = elements.filter(isStationElement);
  const byOsmId = new Map(osmStations.map((el) => [`${el.type}/${el.id}`, el]));
  const out = new Map<string, OsmElement>();
  const claimed = new Set<string>();

  for (const s of stations) {
    if (s.osmId && byOsmId.has(s.osmId)) {
      out.set(s.id, byOsmId.get(s.osmId)!);
      claimed.add(s.osmId);
    }
  }

  const cands: Array<{ station: EnrichStation; el: OsmElement; d: number }> = [];
  for (const s of stations) {
    if (out.has(s.id) || !s.coordinates) continue;
    for (const el of osmStations) {
      const key = `${el.type}/${el.id}`;
      if (claimed.has(key)) continue;
      const c = coordsOf(el);
      if (!c) continue;
      const d = distanceMeters(s.coordinates, c);
      if (d <= maxMeters) cands.push({ station: s, el, d });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    const key = `${c.el.type}/${c.el.id}`;
    if (out.has(c.station.id) || claimed.has(key)) continue;
    out.set(c.station.id, c.el);
    claimed.add(key);
  }
  return out;
}

export function entranceFromElement(el: OsmElement): OsmEntrance {
  const tags = el.tags ?? {};
  const accessibility: string[] = [];
  if (isElevatorElement(el) || tags.elevator === "yes") accessibility.push("elevator");
  const name =
    tags.name ?? (tags.ref ? `Exit ${tags.ref}` : isElevatorElement(el) ? "Elevator" : "Entrance");
  const entrance: OsmEntrance = {
    id: `osm-${el.type}-${el.id}`,
    name,
    coordinates: coordsOf(el)!,
    accessibility,
  };
  if (tags.wheelchair === "yes") entrance.wheelchair = true;
  else if (tags.wheelchair === "no") entrance.wheelchair = false;
  return entrance;
}

export function buildOsmLayer(
  stations: EnrichStation[],
  elements: OsmElement[],
  opts: { entranceRadius?: number; elevatorFeatureRadius?: number } = {}
): OsmLayer {
  const entranceRadius = opts.entranceRadius ?? 250;
  const elevatorFeatureRadius = opts.elevatorFeatureRadius ?? 120;
  const layer: OsmLayer = { stations: {} };
  const get = (id: string) => (layer.stations[id] ??= {});

  const stationMatches = matchStationsToOsm(stations, elements);
  for (const [id, el] of stationMatches) {
    const entry = get(id);
    entry.osmId = `${el.type}/${el.id}`;
    if (el.tags?.wikidata) entry.wikidata = el.tags.wikidata;
    if (el.tags?.wheelchair === "yes") entry.features = ["accessible"];
  }

  // Entrances and standalone elevators attach to the nearest station.
  const located = stations.filter((s) => s.coordinates) as Array<
    EnrichStation & { coordinates: Coordinates }
  >;
  const nearest = (c: Coordinates, radius: number) => {
    let best: { s: (typeof located)[number]; d: number } | null = null;
    for (const s of located) {
      const d = distanceMeters(c, s.coordinates);
      if (d <= radius && (!best || d < best.d)) best = { s, d };
    }
    return best?.s ?? null;
  };

  for (const el of elements) {
    const isEntrance = isEntranceElement(el);
    const isElevator = isElevatorElement(el);
    if (!isEntrance && !isElevator) continue;
    const c = coordsOf(el);
    if (!c) continue;
    const station = nearest(c, isEntrance ? entranceRadius : elevatorFeatureRadius);
    if (!station) continue;
    const entry = get(station.id);
    if (isElevator) {
      entry.features = [...new Set([...(entry.features ?? []), "elevator"])];
    }
    // Street elevator nodes are entrances too - that's how hand data has
    // always modeled them.
    (entry.entrances ??= []).push(entranceFromElement(el));
  }

  for (const entry of Object.values(layer.stations)) {
    entry.entrances?.sort((a, b) => a.id.localeCompare(b.id));
  }
  return layer;
}

// Field rules shared by the pipeline merge and the JSON-system apply:
// identifiers are OSM's to own, features union, entrances only fill absence.
export function applyOsmToStation<T extends EnrichStation>(station: T, osm: OsmStationLayer): T {
  const out: T = { ...station };
  if (osm.osmId) out.osmId = osm.osmId;
  if (osm.wikidata) out.wikidata = osm.wikidata;
  if (osm.features?.length) {
    out.features = [
      ...new Set([...((station.features as string[]) ?? []), ...osm.features]),
    ].sort();
  }
  if (osm.entrances?.length && !(station.entrances && station.entrances.length)) {
    out.entrances = osm.entrances;
  }
  return out;
}
