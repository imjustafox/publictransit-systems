// Per-segment line bundling for map overlays.
//
// A line should ride beside its neighbors only where they actually share
// track, and sit exactly on its own alignment where it runs alone. For every
// point of every line we ask "which lines run within corridor distance of
// here", take this line's position in that local bundle as its slot, smooth
// the slot values along the line so corridor entries ramp instead of kink,
// and offset each point perpendicular by slot x gap. Slots are geometry-only
// and computed once; zoom scales the gap at render time.

export interface BundleInput {
  lineId: string;
  shapes: [number, number][][];
}

const M_PER_DEG_LAT = 111320;
const CORRIDOR_RADIUS_M = 25;
const DECIMATE_GAP_M = 8;
const SMOOTH_WINDOW = 9;

function mPerDegLng(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

// Drop vertices closer together than minGap meters; dense vertices produce
// unstable offset normals.
export function decimate(points: [number, number][], minGapM = DECIMATE_GAP_M): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const dx = (points[i][1] - prev[1]) * mPerDegLng(prev[0]);
    const dy = (points[i][0] - prev[0]) * M_PER_DEG_LAT;
    if (Math.hypot(dx, dy) >= minGapM) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

type Grid = Map<string, Set<number>>; // cell -> set of input indices

function cellKey(lat: number, lng: number, cellLat: number, cellLng: number): string {
  return `${Math.round(lat / cellLat)}:${Math.round(lng / cellLng)}`;
}

export interface BundledLine {
  lineId: string;
  // one entry per (decimated) shape: the points and each point's slot
  shapes: Array<{ points: [number, number][]; slots: number[] }>;
}

export function computeBundles(inputs: BundleInput[]): BundledLine[] {
  const midLat =
    inputs.flatMap((i) => i.shapes[0] ?? []).reduce((a, p) => a + p[0], 0) /
      Math.max(1, inputs.flatMap((i) => i.shapes[0] ?? []).length) || 0;
  const cellLat = CORRIDOR_RADIUS_M / M_PER_DEG_LAT;
  const cellLng = CORRIDOR_RADIUS_M / mPerDegLng(midLat || 45);

  const decimated = inputs.map((input) => input.shapes.map((s) => decimate(s)));

  // Index every line's presence into the grid (cell plus 8 neighbors, so a
  // lookup is a single cell read).
  const grid: Grid = new Map();
  decimated.forEach((shapes, lineIdx) => {
    for (const shape of shapes) {
      for (const [lat, lng] of shape) {
        const baseLat = Math.round(lat / cellLat);
        const baseLng = Math.round(lng / cellLng);
        for (let dLat = -1; dLat <= 1; dLat++) {
          for (let dLng = -1; dLng <= 1; dLng++) {
            const k = `${baseLat + dLat}:${baseLng + dLng}`;
            let set = grid.get(k);
            if (!set) grid.set(k, (set = new Set()));
            set.add(lineIdx);
          }
        }
      }
    }
  });

  return inputs.map((input, lineIdx) => ({
    lineId: input.lineId,
    shapes: decimated[lineIdx].map((points) => {
      const raw = points.map(([lat, lng]) => {
        const here = grid.get(cellKey(lat, lng, cellLat, cellLng));
        if (!here || !here.has(lineIdx)) return 0;
        const bundle = [...here].sort((a, b) => a - b);
        return bundle.indexOf(lineIdx) - (bundle.length - 1) / 2;
      });
      // Moving-average smoothing: corridor entries and exits become ramps.
      const slots = raw.map((_, i) => {
        const from = Math.max(0, i - (SMOOTH_WINDOW - 1) / 2);
        const to = Math.min(raw.length - 1, i + (SMOOTH_WINDOW - 1) / 2);
        let sum = 0;
        for (let j = from; j <= to; j++) sum += raw[j];
        return sum / (to - from + 1);
      });
      return { points, slots };
    }),
  }));
}

// Offset each point perpendicular to travel by its own magnitude, with
// averaged segment normals and a clamped miter so corners bevel, not spike.
export function offsetPolylineVariable(
  points: [number, number][],
  offsetsM: number[]
): [number, number][] {
  if (points.length < 2) return points;
  const segNormals: Array<[number, number]> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const scale = mPerDegLng(points[i][0]);
    const dx = (points[i + 1][1] - points[i][1]) * scale;
    const dy = (points[i + 1][0] - points[i][0]) * M_PER_DEG_LAT;
    const len = Math.hypot(dx, dy);
    segNormals.push(len === 0 ? [0, 0] : [-dy / len, dx / len]);
  }
  return points.map((p, i) => {
    const meters = offsetsM[i] ?? 0;
    if (meters === 0) return p;
    const n1 = segNormals[Math.max(0, i - 1)];
    const n2 = segNormals[Math.min(segNormals.length - 1, i)];
    let nx = (n1[0] + n2[0]) / 2;
    let ny = (n1[1] + n2[1]) / 2;
    const len = Math.hypot(nx, ny);
    if (len < 0.001) return p;
    const s = Math.min(1 / len, 2) * meters;
    nx *= s;
    ny *= s;
    return [p[0] + ny / M_PER_DEG_LAT, p[1] + nx / mPerDegLng(p[0])];
  });
}
