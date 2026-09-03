import type { DistanceUnit } from "./types";

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.60934;

/**
 * Convert a distance value between units
 */
export function convertDistance(value: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return value;
  if (from === "km" && to === "mi") return value * KM_TO_MI;
  if (from === "mi" && to === "km") return value * MI_TO_KM;
  return value;
}

/**
 * Format a distance value with the appropriate unit label
 */
export function formatDistance(
  value: number,
  sourceUnit: DistanceUnit,
  displayUnit: DistanceUnit,
  decimals: number = 1
): string {
  const converted = convertDistance(value, sourceUnit, displayUnit);
  const formatted = converted.toFixed(decimals);
  return `${formatted} ${displayUnit}`;
}

/**
 * Get the unit label for display
 */
export function getUnitLabel(unit: DistanceUnit, long: boolean = false): string {
  if (long) {
    return unit === "km" ? "kilometers" : "miles";
  }
  return unit;
}
