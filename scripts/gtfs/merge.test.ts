import { describe, it, expect } from "vitest";
import { mergeOverlay, applyOverlayCollection } from "./merge";

describe("mergeOverlay", () => {
  it("returns base unchanged when overlay is undefined", () => {
    const base = { name: "Westlake", coordinates: { lat: 1, lng: 2 }, lines: ["1-line"] };
    expect(mergeOverlay(base, undefined)).toEqual(base);
  });

  it("returns base unchanged when overlay is empty object", () => {
    const base = { name: "Westlake", coordinates: { lat: 1, lng: 2 }, lines: ["1-line"] };
    expect(mergeOverlay(base, {})).toEqual(base);
  });

  it("overlay scalar replaces base scalar", () => {
    const base = { name: "Westlake", description: "" };
    const overlay = { description: "central hub" };
    expect(mergeOverlay(base, overlay)).toEqual({ name: "Westlake", description: "central hub" });
  });

  it("overlay deep-merges objects field-by-field", () => {
    const base = { topology: { type: "linear" } };
    const overlay = { topology: { type: "loop", referenceStation: "main" } };
    expect(mergeOverlay(base, overlay)).toEqual({
      topology: { type: "loop", referenceStation: "main" },
    });
  });

  it("deep-merges nested objects without losing untouched keys", () => {
    const base = { stats: { riders: 100, lines: 5 } };
    const overlay = { stats: { riders: 200 } };
    expect(mergeOverlay(base, overlay)).toEqual({ stats: { riders: 200, lines: 5 } });
  });

  it("overlay arrays replace base arrays wholesale (no element merge)", () => {
    const base = { features: ["elevator", "escalator"] };
    const overlay = { features: ["elevator", "fare-vending"] };
    expect(mergeOverlay(base, overlay)).toEqual({ features: ["elevator", "fare-vending"] });
  });

  it("overlay-only field is added when base lacks it", () => {
    const base = { name: "X" };
    const overlay = { description: "Y" };
    expect(mergeOverlay(base, overlay)).toEqual({ name: "X", description: "Y" });
  });

  it("preserves non-overlapping base fields", () => {
    const base = { a: 1, b: 2 };
    const overlay = { b: 99 };
    expect(mergeOverlay(base, overlay)).toEqual({ a: 1, b: 99 });
  });

  it("treats null in overlay as explicit unset (replaces base)", () => {
    const base = { description: "old" };
    const overlay = { description: null };
    expect(mergeOverlay(base, overlay)).toEqual({ description: null });
  });

  it("treats undefined in overlay as no-op (preserves base)", () => {
    const base = { description: "old" };
    const overlay = { description: undefined };
    expect(mergeOverlay(base, overlay)).toEqual({ description: "old" });
  });
});

describe("applyOverlayCollection", () => {
  const base = [
    { id: "1-line", systemId: "st", name: "1 Line", status: "active" },
    { id: "2-line", systemId: "st", name: "2 Line", status: "active" },
  ];

  it("decorates generated items that have overlay entries", () => {
    const out = applyOverlayCollection(base, { "1-line": { description: "backbone" } });
    expect(out[0]).toEqual({
      id: "1-line",
      systemId: "st",
      name: "1 Line",
      status: "active",
      description: "backbone",
    });
    expect(out[1]).toEqual(base[1]);
  });

  it("passes hand-only overlay entries through whole, with defaults", () => {
    const out = applyOverlayCollection(
      base,
      { "s-line": { name: "S Line", status: "disabled" } },
      { systemId: "st" }
    );
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ id: "s-line", systemId: "st", name: "S Line", status: "disabled" });
  });

  it("hand-only entry fields win over defaults", () => {
    const out = applyOverlayCollection(base, { x: { systemId: "other" } }, { systemId: "st" });
    expect(out[2].systemId).toBe("other");
  });

  it("returns decorated base unchanged when overlay map is undefined", () => {
    expect(applyOverlayCollection(base, undefined)).toEqual(base);
  });

  it("keeps generated items first and hand-only items after, in overlay order", () => {
    const out = applyOverlayCollection(base, {
      "b-extra": { name: "B" },
      "1-line": { description: "d" },
      "a-extra": { name: "A" },
    });
    expect(out.map((o) => o.id)).toEqual(["1-line", "2-line", "b-extra", "a-extra"]);
  });
});

describe("$replace marker", () => {
  it("replaces the object wholesale instead of deep-merging", () => {
    const base = { topology: { type: "loop", referenceStation: "kimball" } };
    const overlay = { topology: { $replace: true, type: "lollipop", loopStation: "Clark/Lake" } };
    expect(mergeOverlay(base, overlay)).toEqual({
      topology: { type: "lollipop", loopStation: "Clark/Lake" },
    });
  });

  it("marker works when base lacks the key", () => {
    expect(mergeOverlay({}, { a: { $replace: true, x: 1 } })).toEqual({ a: { x: 1 } });
  });
});
