import Fuse from "fuse.js";
import type { TransitSystem, Station, Line, RailcarGeneration, SearchResult } from "./types";
import { formatTermini } from "./utils";

export type { SearchResult };

interface SearchableItem {
  type: "system" | "station" | "line" | "railcar";
  id: string;
  systemId: string;
  name: string;
  subtitle?: string;
  description?: string;
  keywords?: string[];
}

export function createSearchIndex(
  systems: TransitSystem[],
  stations: Station[],
  lines: Line[],
  railcars: RailcarGeneration[]
): Fuse<SearchableItem> {
  const items: SearchableItem[] = [
    // Systems
    ...systems.map((system) => ({
      type: "system" as const,
      id: system.id,
      systemId: system.id,
      name: system.name,
      subtitle: system.location,
      description: system.overview,
      keywords: [system.shortName, system.location, system.region],
    })),
    // Stations
    ...stations.map((station) => ({
      type: "station" as const,
      id: station.id,
      systemId: station.systemId,
      name: station.name,
      subtitle: station.lines.join(", "),
      description: station.description,
      keywords: [station.address, station.localName, ...station.features].filter(
        (k): k is string => !!k
      ),
    })),
    // Lines
    ...lines.map((line) => ({
      type: "line" as const,
      id: line.id,
      systemId: line.systemId,
      name: line.name,
      subtitle: formatTermini(line),
      description: line.description,
      keywords: [line.color],
    })),
    // Railcars
    ...railcars.map((railcar) => ({
      type: "railcar" as const,
      id: railcar.id,
      systemId: railcar.systemId,
      name: railcar.name,
      subtitle: railcar.manufacturer,
      description: railcar.description,
      keywords: [railcar.manufacturer, railcar.specs.traction || ""],
    })),
  ];

  return new Fuse(items, {
    keys: [
      { name: "name", weight: 2 },
      { name: "subtitle", weight: 1.5 },
      { name: "description", weight: 1 },
      { name: "keywords", weight: 1.2 },
    ],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 2,
  });
}

export function search(index: Fuse<SearchableItem>, query: string, limit = 20): SearchResult[] {
  const results = index.search(query, { limit });

  return results.map((result) => {
    const item = result.item;
    let url = "";

    switch (item.type) {
      case "system":
        url = `/${item.systemId}`;
        break;
      case "station":
        url = `/${item.systemId}/stations/${item.id}`;
        break;
      case "line":
        url = `/${item.systemId}/lines/${item.id}`;
        break;
      case "railcar":
        url = `/${item.systemId}/railcars/${item.id}`;
        break;
    }

    return {
      type: item.type,
      id: item.id,
      systemId: item.systemId,
      name: item.name,
      subtitle: item.subtitle,
      url,
    };
  });
}

export function groupResultsByType(results: SearchResult[]) {
  return {
    systems: results.filter((r) => r.type === "system"),
    stations: results.filter((r) => r.type === "station"),
    lines: results.filter((r) => r.type === "line"),
    railcars: results.filter((r) => r.type === "railcar"),
  };
}

// Global search index for client-side search
let globalSearchIndex: Fuse<SearchableItem> | null = null;

export function initializeSearchIndex(
  systems: TransitSystem[],
  stations: Station[],
  lines: Line[],
  railcars: RailcarGeneration[]
): void {
  globalSearchIndex = createSearchIndex(systems, stations, lines, railcars);
}

export function searchAll(query: string, limit = 20): SearchResult[] {
  if (!globalSearchIndex || query.length < 2) {
    return [];
  }
  return search(globalSearchIndex, query, limit);
}
