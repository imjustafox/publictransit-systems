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

// CARTO dark basemap tile URL
export const DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export const DARK_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
