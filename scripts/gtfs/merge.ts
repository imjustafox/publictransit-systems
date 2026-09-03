type Plain = Record<string, unknown>;

function isPlainObject(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function mergeOverlay<T extends Plain>(base: T, overlay: Plain | undefined): T {
  if (!overlay) return base;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) continue;
    const baseVal = (base as Plain)[k];
    if (isPlainObject(v) && v.$replace === true) {
      // Escape hatch: deep-merging is wrong when the overlay means "exactly
      // this object" (e.g. a topology whose generated fields must not leak
      // through). { "$replace": true, ...rest } uses rest wholesale.
      const { $replace, ...rest } = v;
      out[k] = rest;
    } else if (isPlainObject(v) && isPlainObject(baseVal)) {
      out[k] = mergeOverlay(baseVal, v);
    } else {
      out[k] = v; // scalars, arrays, null all replace wholesale
    }
  }
  return out as T;
}

// Applies an overlay map to a generated collection: entries whose id matches a
// generated item decorate it via mergeOverlay; entries with no generated
// counterpart pass through whole (with defaults filled in), so hand-only
// items that never appear in the feed - future lines, suspended service,
// other modes - survive regeneration.
export function applyOverlayCollection(
  base: Plain[],
  overlayMap: Record<string, Plain> | undefined,
  defaults: Plain = {}
): Plain[] {
  const merged = base.map((item) => mergeOverlay(item, overlayMap?.[item.id as string]));
  if (!overlayMap) return merged;

  const baseIds = new Set(base.map((item) => item.id as string));
  const handOnly = Object.entries(overlayMap)
    .filter(([id]) => !baseIds.has(id))
    .map(([id, item]) => ({ ...defaults, id, ...item }));

  return [...merged, ...handOnly];
}
