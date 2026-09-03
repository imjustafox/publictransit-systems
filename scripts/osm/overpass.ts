// Minimal Overpass API client for station-area enrichment queries.

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const RETRYABLE = new Set([429, 502, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Everything enrichment cares about, in one request per system:
// entrances, elevators, and the station objects that carry osm/wikidata ids.
export function buildQuery(bbox: Bbox): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:90];
(
  node["railway"="subway_entrance"](${b});
  node["railway"="train_station_entrance"](${b});
  node["highway"="elevator"](${b});
  node["railway"~"^(station|halt|tram_stop)$"](${b});
  way["railway"~"^(station|halt)$"](${b});
);
out center tags;`;
}

export function bboxAround(coords: Array<{ lat: number; lng: number }>, padDegrees = 0.02): Bbox {
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  return {
    south: Math.min(...lats) - padDegrees,
    west: Math.min(...lngs) - padDegrees,
    north: Math.max(...lats) + padDegrees,
    east: Math.max(...lngs) + padDegrees,
  };
}

export async function fetchOverpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(15000);
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // OSM usage policy asks automated clients to identify themselves;
            // some instances reject anonymous user agents outright.
            "User-Agent":
              "publictransit-systems-enrichment/1.0 (+https://github.com/imjustafox/publictransit-systems)",
          },
          body: "data=" + encodeURIComponent(query),
        });
        if (!res.ok) {
          lastError = new Error(`Overpass ${endpoint} returned HTTP ${res.status}`);
          if (RETRYABLE.has(res.status)) continue;
          continue;
        }
        const json = (await res.json()) as { elements: OsmElement[] };
        return json.elements;
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
