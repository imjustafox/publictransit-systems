import JSZip from "jszip";
import { parse } from "csv-parse/sync";

export interface GtfsRoute {
  route_id: string;
  agency_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type: number;
  route_color?: string;
  route_text_color?: string;
}

export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  location_type?: number;
  parent_station?: string;
  wheelchair_boarding?: number;
}

export interface GtfsTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  direction_id?: 0 | 1;
  shape_id?: string;
}

export interface GtfsStopTime {
  trip_id: string;
  arrival_time?: string;
  departure_time?: string;
  stop_id: string;
  stop_sequence: number;
}

export interface GtfsShapePoint {
  shape_id: string;
  shape_pt_lat: number;
  shape_pt_lon: number;
  shape_pt_sequence: number;
}

export interface GtfsPathway {
  pathway_id: string;
  from_stop_id: string;
  to_stop_id: string;
  pathway_mode: number;
}

export interface GtfsBundle {
  routes: GtfsRoute[];
  stops: GtfsStop[];
  trips: GtfsTrip[];
  stopTimesByTrip: Map<string, GtfsStopTime[]>;
  shapesByShapeId: Map<string, GtfsShapePoint[]>;
  pathways: GtfsPathway[];
}

const REQUIRED_FILES = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"];

async function readFile(zip: JSZip, name: string, required: boolean): Promise<string | null> {
  const file = zip.file(name);
  if (!file) {
    if (required) throw new Error(`GTFS bundle missing required file: ${name}`);
    return null;
  }
  return file.async("string");
}

function parseCsv<T>(content: string, transformer: (row: Record<string, string>) => T): T[] {
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as Record<string, string>[];
  return rows.map(transformer);
}

export async function parseGtfsBundle(zipBuffer: Buffer): Promise<GtfsBundle> {
  const zip = await JSZip.loadAsync(zipBuffer);

  for (const name of REQUIRED_FILES) {
    if (!zip.file(name)) throw new Error(`GTFS bundle missing required file: ${name}`);
  }

  const routesCsv = await readFile(zip, "routes.txt", true);
  const stopsCsv = await readFile(zip, "stops.txt", true);
  const tripsCsv = await readFile(zip, "trips.txt", true);
  const stopTimesCsv = await readFile(zip, "stop_times.txt", true);
  const shapesCsv = await readFile(zip, "shapes.txt", false);
  const pathwaysCsv = await readFile(zip, "pathways.txt", false);

  const routes: GtfsRoute[] = parseCsv(routesCsv!, (row) => ({
    route_id: row.route_id,
    agency_id: row.agency_id || undefined,
    route_short_name: row.route_short_name || undefined,
    route_long_name: row.route_long_name || undefined,
    route_type: parseInt(row.route_type, 10),
    route_color: row.route_color || undefined,
    route_text_color: row.route_text_color || undefined,
  }));

  const stops: GtfsStop[] = parseCsv(stopsCsv!, (row) => ({
    stop_id: row.stop_id,
    stop_name: row.stop_name,
    stop_lat: parseFloat(row.stop_lat),
    stop_lon: parseFloat(row.stop_lon),
    location_type: row.location_type ? parseInt(row.location_type, 10) : undefined,
    parent_station: row.parent_station || undefined,
    wheelchair_boarding: row.wheelchair_boarding
      ? parseInt(row.wheelchair_boarding, 10)
      : undefined,
  }));

  const trips: GtfsTrip[] = parseCsv(tripsCsv!, (row) => ({
    route_id: row.route_id,
    service_id: row.service_id,
    trip_id: row.trip_id,
    trip_headsign: row.trip_headsign || undefined,
    direction_id:
      row.direction_id !== undefined && row.direction_id !== ""
        ? (parseInt(row.direction_id, 10) as 0 | 1)
        : undefined,
    shape_id: row.shape_id || undefined,
  }));

  const stopTimesByTrip = new Map<string, GtfsStopTime[]>();
  const stopTimes: GtfsStopTime[] = parseCsv(stopTimesCsv!, (row) => ({
    trip_id: row.trip_id,
    arrival_time: row.arrival_time || undefined,
    departure_time: row.departure_time || undefined,
    stop_id: row.stop_id,
    stop_sequence: parseInt(row.stop_sequence, 10),
  }));
  for (const st of stopTimes) {
    let arr = stopTimesByTrip.get(st.trip_id);
    if (!arr) {
      arr = [];
      stopTimesByTrip.set(st.trip_id, arr);
    }
    arr.push(st);
  }
  for (const arr of stopTimesByTrip.values()) {
    arr.sort((a, b) => a.stop_sequence - b.stop_sequence);
  }

  const shapesByShapeId = new Map<string, GtfsShapePoint[]>();
  if (shapesCsv) {
    const shapes: GtfsShapePoint[] = parseCsv(shapesCsv, (row) => ({
      shape_id: row.shape_id,
      shape_pt_lat: parseFloat(row.shape_pt_lat),
      shape_pt_lon: parseFloat(row.shape_pt_lon),
      shape_pt_sequence: parseInt(row.shape_pt_sequence, 10),
    }));
    for (const pt of shapes) {
      let arr = shapesByShapeId.get(pt.shape_id);
      if (!arr) {
        arr = [];
        shapesByShapeId.set(pt.shape_id, arr);
      }
      arr.push(pt);
    }
    for (const arr of shapesByShapeId.values()) {
      arr.sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
    }
  }

  return {
    routes,
    stops,
    trips,
    stopTimesByTrip,
    shapesByShapeId,
    pathways: pathwaysCsv
      ? parseCsv(pathwaysCsv, (row) => ({
          pathway_id: row.pathway_id,
          from_stop_id: row.from_stop_id,
          to_stop_id: row.to_stop_id,
          pathway_mode: parseInt(row.pathway_mode, 10),
        }))
      : [],
  };
}

// Merge parsed bundles into one: routes/trips/pathways concatenate, stop_times
// and shapes union by id. Ids are trusted to be globally unique across bundles
// except stops, which deliberately reuse ids for stations served by several
// bundles (Footscray is vic:rail:FSY in both the V/Line and metro feeds);
// first occurrence wins so shared stations merge instead of duplicating.
export function mergeGtfsBundles(bundles: GtfsBundle[]): GtfsBundle {
  const merged: GtfsBundle = {
    routes: [],
    stops: [],
    trips: [],
    stopTimesByTrip: new Map(),
    shapesByShapeId: new Map(),
    pathways: [],
  };
  const seenStops = new Set<string>();

  for (const bundle of bundles) {
    merged.routes.push(...bundle.routes);
    merged.trips.push(...bundle.trips);
    merged.pathways.push(...bundle.pathways);
    for (const stop of bundle.stops) {
      if (!seenStops.has(stop.stop_id)) {
        seenStops.add(stop.stop_id);
        merged.stops.push(stop);
      }
    }
    for (const [tripId, stopTimes] of bundle.stopTimesByTrip) {
      merged.stopTimesByTrip.set(tripId, stopTimes);
    }
    for (const [shapeId, points] of bundle.shapesByShapeId) {
      merged.shapesByShapeId.set(shapeId, points);
    }
  }

  return merged;
}

// A subfeed entry is either a bare inner-zip path or a { path, network }
// object; the network id tags every route the subfeed contributes.
export type SubfeedSpec = string | { path: string; network?: string };

// Some publishers (Victoria's PTV) ship one outer zip holding a zip per
// operational branch. Parse the named inner bundles and merge them into one.
// Routes parsed from a subfeed that declares a network are reported in
// networkByRouteId so the caller can carry the origin onto its lines.
export async function parseGtfsSubfeeds(
  outerBuffer: Buffer,
  subfeeds: SubfeedSpec[]
): Promise<GtfsBundle & { networkByRouteId: Map<string, string> }> {
  const outer = await JSZip.loadAsync(outerBuffer);

  const bundles: GtfsBundle[] = [];
  const networkByRouteId = new Map<string, string>();

  for (const entry of subfeeds) {
    const { path, network } =
      typeof entry === "string" ? { path: entry, network: undefined } : entry;
    const file = outer.file(path);
    if (!file) throw new Error(`Outer GTFS bundle missing subfeed: ${path}`);
    const bundle = await parseGtfsBundle(Buffer.from(await file.async("nodebuffer")));
    if (network) {
      for (const route of bundle.routes) networkByRouteId.set(route.route_id, network);
    }
    bundles.push(bundle);
  }

  return { ...mergeGtfsBundles(bundles), networkByRouteId };
}
