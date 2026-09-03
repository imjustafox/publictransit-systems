import type { GtfsStopTime } from "./parser";

export interface TripPattern {
  stops: string[]; // ordered stop_ids
  tripCount: number;
}

export interface DetectedBranch {
  branchStation: string;
  terminus: string;
  tripCount: number;
}

export type DetectedTopologyValue =
  | { type: "linear"; branches?: DetectedBranch[] }
  | { type: "loop"; referenceStation: string }
  | { type: "lollipop"; loopStation: string };

export interface DetectedTopology {
  topology: DetectedTopologyValue;
  termini: string[]; // GTFS stop_ids — caller maps to slugs
  dominantStops: string[]; // for stationCount/stations
}

export function extractTripPatterns(
  tripIds: string[],
  stopTimesByTrip: Map<string, GtfsStopTime[]>
): TripPattern[] {
  const counts = new Map<string, { stops: string[]; tripCount: number }>();
  for (const tripId of tripIds) {
    const stopTimes = stopTimesByTrip.get(tripId);
    if (!stopTimes || stopTimes.length === 0) continue;
    const stops = stopTimes.map((s) => s.stop_id);
    const key = stops.join("→");
    const existing = counts.get(key);
    if (existing) existing.tripCount++;
    else counts.set(key, { stops, tripCount: 1 });
  }
  return Array.from(counts.values()).sort((a, b) => b.tripCount - a.tripCount);
}

export function detectTopology(patterns: TripPattern[]): DetectedTopology {
  if (patterns.length === 0) {
    return { topology: { type: "linear" }, termini: [], dominantStops: [] };
  }

  const dominant = patterns[0];
  const totalTrips = patterns.reduce((s, p) => s + p.tripCount, 0);

  // Loop check: dominant pattern starts and ends at same stop, and majority of trips agree
  const closesLoop =
    dominant.stops[0] === dominant.stops[dominant.stops.length - 1] && dominant.stops.length > 2;
  const loopShareTrips = patterns
    .filter((p) => p.stops[0] === p.stops[p.stops.length - 1] && p.stops.length > 2)
    .reduce((s, p) => s + p.tripCount, 0);
  if (closesLoop && loopShareTrips / totalTrips >= 0.5) {
    const ref = dominant.stops[0];
    return {
      topology: { type: "loop", referenceStation: ref },
      termini: [ref],
      dominantStops: dedupeOrdered(dominant.stops),
    };
  }

  // Lollipop check: dominant pattern visits exactly one stop twice and isn't a full loop
  const dupes = findDuplicates(dominant.stops);
  if (dupes.length === 1 && !closesLoop) {
    const loopStation = dupes[0];
    return {
      topology: { type: "lollipop", loopStation },
      termini: [dominant.stops[0]],
      dominantStops: dedupeOrdered(dominant.stops),
    };
  }

  // Branches: find patterns that share a common prefix
  const branches = detectBranches(patterns);
  const allStops = collectAllStops(patterns);
  const termini = collectTermini(patterns);

  return {
    topology: branches.length >= 2 ? { type: "linear", branches } : { type: "linear" },
    termini,
    dominantStops: allStops,
  };
}

function dedupeOrdered(stops: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of stops) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function findDuplicates(stops: string[]): string[] {
  const counts = new Map<string, number>();
  for (const s of stops) counts.set(s, (counts.get(s) || 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s);
}

function collectAllStops(patterns: TripPattern[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of patterns) {
    for (const s of p.stops) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

function collectTermini(patterns: TripPattern[]): string[] {
  const candidates = new Set<string>();
  for (const p of patterns) {
    if (p.stops.length === 0) continue;
    candidates.add(p.stops[0]);
    candidates.add(p.stops[p.stops.length - 1]);
  }
  // Filter to "leaf" termini: stops that appear only at ends, not in middle of any pattern
  const middleStops = new Set<string>();
  for (const p of patterns) {
    for (let i = 1; i < p.stops.length - 1; i++) middleStops.add(p.stops[i]);
  }
  const leaves = [...candidates].filter((c) => !middleStops.has(c));
  return leaves.length > 0 ? leaves : [...candidates].slice(0, 2);
}

function detectBranches(patterns: TripPattern[]): DetectedBranch[] {
  if (patterns.length < 2) return [];

  const top = patterns.slice(0, Math.min(patterns.length, 4));
  const prefix = longestCommonPrefix(top.map((p) => p.stops));
  if (prefix.length < 2) return []; // need at least 2-stop trunk

  const branchStation = prefix[prefix.length - 1];
  const branches: DetectedBranch[] = [];
  for (const p of top) {
    const tail = p.stops.slice(prefix.length);
    if (tail.length === 0) continue;
    branches.push({
      branchStation,
      terminus: tail[tail.length - 1],
      tripCount: p.tripCount,
    });
  }
  // Dedupe branches by terminus
  const byTerminus = new Map<string, DetectedBranch>();
  for (const b of branches) {
    const existing = byTerminus.get(b.terminus);
    if (!existing || b.tripCount > existing.tripCount) byTerminus.set(b.terminus, b);
  }
  return [...byTerminus.values()];
}

function longestCommonPrefix(seqs: string[][]): string[] {
  if (seqs.length === 0) return [];
  const minLen = Math.min(...seqs.map((s) => s.length));
  const out: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const v = seqs[0][i];
    if (seqs.every((s) => s[i] === v)) out.push(v);
    else break;
  }
  return out;
}
