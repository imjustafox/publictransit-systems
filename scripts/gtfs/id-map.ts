export interface IdMap {
  stations: Record<string, string>; // gtfs_id → slug
  lines: Record<string, string>;
}

export interface IdMapEntry {
  gtfs_id: string;
  name: string;
}

export function kebabSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[–—]/g, "-") // en/em-dashes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function mergeIdMap(
  existing: IdMap,
  incoming: IdMapEntry[],
  scope: "stations" | "lines"
): IdMap {
  const result: IdMap = {
    stations: { ...existing.stations },
    lines: { ...existing.lines },
  };
  const target = result[scope];
  const usedSlugs = new Set(Object.values(target));

  for (const entry of incoming) {
    if (target[entry.gtfs_id]) continue; // preserved

    const base = kebabSlug(entry.name) || entry.gtfs_id.toLowerCase();
    let candidate = base;
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${base}-${suffix++}`;
    }
    target[entry.gtfs_id] = candidate;
    usedSlugs.add(candidate);
  }

  return result;
}

export async function loadIdMap(filepath: string): Promise<IdMap> {
  const { promises: fs } = await import("fs");
  try {
    const content = await fs.readFile(filepath, "utf-8");
    const parsed = JSON.parse(content) as IdMap;
    return {
      stations: parsed.stations || {},
      lines: parsed.lines || {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { stations: {}, lines: {} };
    }
    throw err;
  }
}

export async function saveIdMap(filepath: string, idMap: IdMap): Promise<void> {
  const { promises: fs } = await import("fs");
  const sorted: IdMap = {
    stations: Object.fromEntries(Object.entries(idMap.stations).sort()),
    lines: Object.fromEntries(Object.entries(idMap.lines).sort()),
  };
  await fs.writeFile(filepath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}
