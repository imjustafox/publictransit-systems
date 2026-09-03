import type { GtfsStop, GtfsPathway } from "./parser";
import { WHEELCHAIR_BOARDING } from "./constants";

// GTFS pathway_mode values that describe how an entrance connects inward.
const MODE_STAIRS = 2;
const MODE_ESCALATOR = 4;
const MODE_ELEVATOR = 5;

export interface GeneratedEntrance {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  accessibility: string[];
  wheelchair?: boolean;
}

// Strip a "Station Name - " prefix agencies put on entrance names (WMATA:
// "Wiehle-Reston East - Dulles Toll Rd Exit 13"), and a trailing
// "(Elevator)"-style qualifier that duplicates the accessibility field.
export function entranceDisplayName(stopName: string, stationName: string): string {
  let name = stopName;
  const prefixes = [`${stationName} - `, `${stationName} – `, `${stationName}: `];
  for (const p of prefixes) {
    if (name.startsWith(p)) {
      name = name.slice(p.length);
      break;
    }
  }
  return name.trim();
}

// Infer entrance accessibility from the pathway edges that touch it:
// an elevator pathway means "elevator", an escalator "escalator", and an
// entrance reached only by stairs is "stairs-only". Entrances with no
// classifiable pathway (walkways only, or no pathways.txt at all) get no
// accessibility claims rather than a guess.
export function inferAccessibility(entranceId: string, pathways: GtfsPathway[]): string[] {
  const touching = pathways.filter(
    (p) => p.from_stop_id === entranceId || p.to_stop_id === entranceId
  );
  const modes = new Set(touching.map((p) => p.pathway_mode));
  const out: string[] = [];
  if (modes.has(MODE_ELEVATOR)) out.push("elevator");
  if (modes.has(MODE_ESCALATOR)) out.push("escalator");
  if (out.length === 0 && modes.has(MODE_STAIRS)) out.push("stairs-only");
  return out;
}

// Extract entrances (location_type 2) grouped by canonical station id.
export function extractEntrances(
  stops: GtfsStop[],
  pathways: GtfsPathway[],
  canonical: (stopId: string) => string,
  stationNameOf: (canonicalId: string) => string | undefined
): Map<string, GeneratedEntrance[]> {
  const byStation = new Map<string, GeneratedEntrance[]>();
  for (const s of stops) {
    if (s.location_type !== 2) continue;
    const stationId = s.parent_station ? canonical(s.parent_station) : canonical(s.stop_id);
    const stationName = stationNameOf(stationId) ?? "";
    // Pathways describe the inside of the station; the entrance's own
    // vertical access is often only in its name ("... (Elevator)").
    const accessibility = inferAccessibility(s.stop_id, pathways);
    if (/\belevator\b/i.test(s.stop_name) && !accessibility.includes("elevator")) {
      accessibility.unshift("elevator");
    }
    if (/\bescalator\b/i.test(s.stop_name) && !accessibility.includes("escalator")) {
      accessibility.push("escalator");
    }
    const entrance: GeneratedEntrance = {
      id: s.stop_id,
      name: entranceDisplayName(s.stop_name, stationName),
      coordinates: { lat: s.stop_lat, lng: s.stop_lon },
      accessibility:
        accessibility.length > 1 ? accessibility.filter((a) => a !== "stairs-only") : accessibility,
    };
    if (s.wheelchair_boarding === WHEELCHAIR_BOARDING.ACCESSIBLE) entrance.wheelchair = true;
    else if (s.wheelchair_boarding === WHEELCHAIR_BOARDING.NOT_ACCESSIBLE)
      entrance.wheelchair = false;
    const arr = byStation.get(stationId);
    if (arr) arr.push(entrance);
    else byStation.set(stationId, [entrance]);
  }
  for (const arr of byStation.values()) arr.sort((a, b) => a.id.localeCompare(b.id));
  return byStation;
}
