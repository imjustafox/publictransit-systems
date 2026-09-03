import type { GtfsTrip, GtfsShapePoint } from "./parser";

export function dominantShapeForRoute(routeId: string, trips: GtfsTrip[]): string | null {
  const counts = new Map<string, number>();
  for (const t of trips) {
    if (t.route_id !== routeId || !t.shape_id) continue;
    counts.set(t.shape_id, (counts.get(t.shape_id) || 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function shapeToPolyline(shape: GtfsShapePoint[]): [number, number][] {
  return shape
    .slice()
    .sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence)
    .map((p) => [p.shape_pt_lat, p.shape_pt_lon]);
}

const EARTH_RADIUS_KM = 6371.0088;

function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function polylineLength(points: [number, number][], unit: "km" | "mi"): number {
  if (points.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return unit === "mi" ? km * 0.621371 : km;
}

// Standard iterative Douglas-Peucker. epsilon in degrees (planar approximation;
// fine for short polylines at metro scale).
export function simplifyPolyline(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points.slice();
  const keep = new Array(points.length).fill(false) as boolean[];
  keep[0] = keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx !== -1) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + tc * dx), y - (y1 + tc * dy));
}

// A route's dominant shape misses branches entirely (NYC's A runs 25 shape
// variants; the most common covers 18% of trips). Select a covering set:
// walk shapes by trip count and keep each one that adds meaningfully new
// geometry, measured as the share of ~100m grid cells not touched by
// already-kept shapes. Direction mirrors and short-turns contribute nothing
// new and drop out; branches survive.
export function selectShapesForRoute(
  routeId: string,
  trips: GtfsTrip[],
  shapesById: Map<string, GtfsShapePoint[]>,
  opts: { noveltyThreshold?: number; maxShapes?: number } = {}
): string[] {
  const noveltyThreshold = opts.noveltyThreshold ?? 0.05;
  const maxShapes = opts.maxShapes ?? 8;

  const counts = new Map<string, number>();
  for (const t of trips) {
    if (t.route_id !== routeId || !t.shape_id) continue;
    counts.set(t.shape_id, (counts.get(t.shape_id) || 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  const cellOf = (p: GtfsShapePoint) =>
    `${Math.round(p.shape_pt_lat * 1000)}:${Math.round(p.shape_pt_lon * 1000)}`;

  const covered = new Set<string>();
  const kept: string[] = [];
  for (const shapeId of ordered) {
    if (kept.length >= maxShapes) break;
    const points = shapesById.get(shapeId);
    if (!points || points.length < 2) continue;
    const cells = new Set(points.map(cellOf));
    let novel = 0;
    for (const c of cells) if (!covered.has(c)) novel++;
    if (kept.length === 0 || novel / cells.size > noveltyThreshold) {
      kept.push(shapeId);
      for (const c of cells) covered.add(c);
    }
  }
  return kept;
}
