import { describe, it, expect } from "vitest";
import { computeBundles, decimate, offsetPolylineVariable } from "./bundling";

// A north-south line at the given longitude; ~11m per step.
const vertical = (lng: number, from = 0, steps = 60): [number, number][] =>
  Array.from({ length: steps }, (_, i) => [40 + (from + i) * 0.0001, lng]);

describe("computeBundles", () => {
  it("a solo line keeps slot 0 everywhere", () => {
    const [line] = computeBundles([{ lineId: "a", shapes: [vertical(-75)] }]);
    expect(line.shapes[0].slots.every((s) => s === 0)).toBe(true);
  });

  it("two lines sharing a corridor take opposite half slots there, zero apart", () => {
    // b shares a's longitude for the middle stretch, then veers far east.
    const aPts = vertical(-75, 0, 90);
    const bShared = vertical(-75, 30, 30);
    const bAway = vertical(-74.9, 60, 30);
    const [a, b] = computeBundles([
      { lineId: "a", shapes: [aPts] },
      { lineId: "b", shapes: [[...bShared, ...bAway]] },
    ]);

    const aSlots = a.shapes[0].slots;
    const bSlots = b.shapes[0].slots;
    // middle of a's shared stretch: bundled as pair
    expect(aSlots[Math.floor(aSlots.length * 0.45)]).toBeCloseTo(-0.5, 1);
    // start of a: alone
    expect(aSlots[0]).toBe(0);
    // b while shared: +0.5; b when far away: 0
    expect(bSlots[2]).toBeCloseTo(0.5, 1);
    expect(bSlots[bSlots.length - 1]).toBe(0);
  });

  it("slot transitions ramp rather than jump", () => {
    const aPts = vertical(-75, 0, 90);
    const bPts = vertical(-75, 45, 45);
    const [a] = computeBundles([
      { lineId: "a", shapes: [aPts] },
      { lineId: "b", shapes: [bPts] },
    ]);
    const slots = a.shapes[0].slots;
    for (let i = 1; i < slots.length; i++) {
      expect(Math.abs(slots[i] - slots[i - 1])).toBeLessThan(0.3);
    }
  });
});

describe("decimate", () => {
  it("drops points closer than the gap but keeps endpoints", () => {
    const dense: [number, number][] = Array.from({ length: 100 }, (_, i) => [
      40 + i * 0.00001, // ~1.1m apart
      -75,
    ]);
    const out = decimate(dense, 8);
    expect(out.length).toBeLessThan(20);
    expect(out[0]).toEqual(dense[0]);
    expect(out[out.length - 1]).toEqual(dense[dense.length - 1]);
  });
});

describe("offsetPolylineVariable", () => {
  it("moves points perpendicular by their own magnitude and leaves zeros alone", () => {
    const pts = vertical(-75, 0, 5);
    const out = offsetPolylineVariable(pts, [0, 10, 10, 10, 0]);
    expect(out[0]).toEqual(pts[0]);
    expect(out[4]).toEqual(pts[4]);
    // 10m east-west shift on a north-south line changes longitude only
    expect(Math.abs(out[2][0] - pts[2][0])).toBeLessThan(1e-9);
    const meters = Math.abs(out[2][1] - pts[2][1]) * 111320 * Math.cos((40 * Math.PI) / 180);
    expect(meters).toBeCloseTo(10, 0);
  });
});
