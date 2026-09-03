import L from "leaflet";
import type { EntranceAccessibility } from "@/lib/types";

// Get accessibility color based on entrance features
export function getAccessibilityColor(accessibility?: EntranceAccessibility[]): string {
  if (!accessibility || accessibility.length === 0) {
    return "#737373"; // Gray - unknown/stairs only
  }
  if (accessibility.includes("elevator")) {
    return "#00ff9d"; // Green - fully accessible
  }
  if (accessibility.includes("escalator")) {
    return "#f59e0b"; // Orange - escalator only
  }
  return "#737373"; // Gray - stairs only
}

// Create station marker icon with line color and glow effect
export function createStationIcon(lineColor: string): L.DivIcon {
  return L.divIcon({
    className: "station-marker",
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${lineColor};
        border: 3px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 12px ${lineColor}, 0 0 24px ${lineColor}80;
      "></div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

// Create entrance marker icon (diamond shape)
export function createEntranceIcon(accessibility?: EntranceAccessibility[]): L.DivIcon {
  const color = getAccessibilityColor(accessibility);

  return L.divIcon({
    className: "entrance-marker",
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background: ${color};
        border: 2px solid #fff;
        transform: rotate(45deg);
        box-shadow: 0 0 6px ${color};
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

// CARTO dark vector basemap style, rendered by MapLibre GL (see
// VectorBasemap.tsx). The API key is not enforced for vector yet but CARTO
// says it will be; it is inlined at build time, and the style loads without
// it either way for now.
const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
export const DARK_VECTOR_STYLE_URL = `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json${
  cartoKey ? `?key=${cartoKey}` : ""
}`;

export const DARK_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Offset a polyline perpendicular to its direction of travel by roughly
// `meters`, so lines sharing a corridor render side by side instead of
// overdrawing each other into an unreadable blend. Ground-relative, so
// parallel ribbons merge naturally at low zoom and separate up close.
export function offsetPolyline(points: [number, number][], meters: number): [number, number][] {
  if (points.length < 2 || meters === 0) return points;
  const mPerDegLat = 111320;
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const mPerDegLng = mPerDegLat * Math.cos((p[0] * Math.PI) / 180);
    // direction vector in meters
    const dx = (next[1] - prev[1]) * mPerDegLng;
    const dy = (next[0] - prev[0]) * mPerDegLat;
    const len = Math.hypot(dx, dy);
    if (len === 0) return p;
    // left-hand normal, scaled to the requested offset
    const ox = (-dy / len) * meters;
    const oy = (dx / len) * meters;
    return [p[0] + oy / mPerDegLat, p[1] + ox / mPerDegLng];
  });
}
