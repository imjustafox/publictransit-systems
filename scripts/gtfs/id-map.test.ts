import { describe, it, expect } from "vitest";
import { kebabSlug, mergeIdMap, type IdMap } from "./id-map";

describe("kebabSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(kebabSlug("Westlake Station")).toBe("westlake-station");
  });

  it("strips diacritics and en-dashes", () => {
    expect(kebabSlug("Café — South")).toBe("cafe-south");
  });

  it("collapses runs of separators", () => {
    expect(kebabSlug("A//B  C")).toBe("a-b-c");
  });

  it("trims leading/trailing separators", () => {
    expect(kebabSlug(" -A- ")).toBe("a");
  });

  it("preserves digits", () => {
    expect(kebabSlug("47th Street")).toBe("47th-street");
  });
});

describe("mergeIdMap — initial generation", () => {
  it("derives slugs from names when map is empty", () => {
    const existing: IdMap = { stations: {}, lines: {} };
    const incoming = [
      { gtfs_id: "S001", name: "Westlake" },
      { gtfs_id: "S002", name: "Capitol Hill" },
    ];
    const merged = mergeIdMap(existing, incoming, "stations");
    expect(merged.stations["S001"]).toBe("westlake");
    expect(merged.stations["S002"]).toBe("capitol-hill");
  });

  it("disambiguates colliding slugs with numeric suffix", () => {
    const existing: IdMap = { stations: {}, lines: {} };
    const incoming = [
      { gtfs_id: "A", name: "Main Street" },
      { gtfs_id: "B", name: "Main Street" },
      { gtfs_id: "C", name: "Main Street" },
    ];
    const merged = mergeIdMap(existing, incoming, "stations");
    const slugs = Object.values(merged.stations);
    expect(slugs).toEqual(["main-street", "main-street-2", "main-street-3"]);
  });
});

describe("mergeIdMap — subsequent runs", () => {
  it("preserves existing slugs even when name changes", () => {
    const existing: IdMap = { stations: { S001: "westlake" }, lines: {} };
    const incoming = [{ gtfs_id: "S001", name: "Westlake Hub" }];
    const merged = mergeIdMap(existing, incoming, "stations");
    expect(merged.stations["S001"]).toBe("westlake");
  });

  it("appends new entries", () => {
    const existing: IdMap = { stations: { S001: "westlake" }, lines: {} };
    const incoming = [
      { gtfs_id: "S001", name: "Westlake" },
      { gtfs_id: "S002", name: "Capitol Hill" },
    ];
    const merged = mergeIdMap(existing, incoming, "stations");
    expect(merged.stations["S001"]).toBe("westlake");
    expect(merged.stations["S002"]).toBe("capitol-hill");
  });

  it("never deletes entries even if GTFS ID disappears", () => {
    const existing: IdMap = { stations: { S001: "westlake", S999: "old-stop" }, lines: {} };
    const incoming = [{ gtfs_id: "S001", name: "Westlake" }];
    const merged = mergeIdMap(existing, incoming, "stations");
    expect(merged.stations["S999"]).toBe("old-stop");
  });

  it("disambiguates new slug against existing entries", () => {
    const existing: IdMap = { stations: { OLD: "main-street" }, lines: {} };
    const incoming = [{ gtfs_id: "NEW", name: "Main Street" }];
    const merged = mergeIdMap(existing, incoming, "stations");
    expect(merged.stations["NEW"]).toBe("main-street-2");
  });
});

describe("reissued line route ids", () => {
  it("a new gtfs id whose name slugs to an existing line adopts that slug", () => {
    const existing = { stations: {}, lines: { "11693": "main-line" } };
    const out = mergeIdMap(existing, [{ gtfs_id: "99999", name: "Main Line" }], "lines");
    expect(out.lines["99999"]).toBe("main-line");
    expect(out.lines["11693"]).toBe("main-line");
  });

  it("stations with colliding names still get suffixes", () => {
    const existing = { stations: { a1: "18-av" }, lines: {} };
    const out = mergeIdMap(existing, [{ gtfs_id: "b2", name: "18 Av" }], "stations");
    expect(out.stations["b2"]).toBe("18-av-2");
  });
});
