import { describe, it, expect } from "vitest";
import {
  dominantShapeForRoute,
  selectShapesForRoute,
  polylineLength,
  simplifyPolyline,
} from "./geometry";
import type { GtfsShapePoint } from "./parser";
import type { GtfsTrip } from "./parser";

describe("dominantShapeForRoute", () => {
  it("picks shape_id used by most trips of a route", () => {
    const trips: GtfsTrip[] = [
      { trip_id: "T1", route_id: "R1", service_id: "WK", shape_id: "A" },
      { trip_id: "T2", route_id: "R1", service_id: "WK", shape_id: "A" },
      { trip_id: "T3", route_id: "R1", service_id: "WK", shape_id: "B" },
    ];
    expect(dominantShapeForRoute("R1", trips)).toBe("A");
  });

  it("returns null when no trips have shape_id", () => {
    const trips: GtfsTrip[] = [{ trip_id: "T1", route_id: "R1", service_id: "WK" }];
    expect(dominantShapeForRoute("R1", trips)).toBeNull();
  });

  it("returns null when no trips for the route", () => {
    const trips: GtfsTrip[] = [{ trip_id: "T1", route_id: "R2", service_id: "WK", shape_id: "A" }];
    expect(dominantShapeForRoute("R1", trips)).toBeNull();
  });
});

describe("polylineLength (haversine)", () => {
  it("computes ~3.1 miles for a 5km segment", () => {
    // 0.045 deg latitude ~ 5.005 km. ~3.108 mi.
    const points: [number, number][] = [
      [0, 0],
      [0.045, 0],
    ];
    const miles = polylineLength(points, "mi");
    expect(miles).toBeCloseTo(3.106, 1);
  });

  it("returns 0 for single point", () => {
    expect(polylineLength([[0, 0]], "mi")).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(polylineLength([], "mi")).toBe(0);
  });

  it("supports km unit", () => {
    const points: [number, number][] = [
      [0, 0],
      [0.045, 0],
    ];
    expect(polylineLength(points, "km")).toBeCloseTo(5.0, 0);
  });

  it("sums multi-segment paths", () => {
    const points: [number, number][] = [
      [0, 0],
      [0.045, 0],
      [0.09, 0],
    ];
    expect(polylineLength(points, "km")).toBeCloseTo(10.0, 0);
  });
});

describe("simplifyPolyline (Douglas-Peucker)", () => {
  it("preserves endpoints and removes near-collinear interior points", () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.0001, 0.0001],
      [0.0002, 0.0002],
      [1, 1],
    ];
    const simplified = simplifyPolyline(pts, 0.001);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[simplified.length - 1]).toEqual([1, 1]);
    expect(simplified.length).toBeLessThan(pts.length);
  });

  it("returns input unchanged when length <= 2", () => {
    expect(simplifyPolyline([[0, 0]], 0.1)).toEqual([[0, 0]]);
    expect(
      simplifyPolyline(
        [
          [0, 0],
          [1, 1],
        ],
        0.1
      )
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it("preserves significant detours that exceed epsilon", () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.5, 1],
      [1, 0],
    ]; // sharp peak
    const simplified = simplifyPolyline(pts, 0.1);
    expect(simplified.length).toBe(3); // peak must be preserved
  });
});

describe("selectShapesForRoute", () => {
  const line = (startLon: number): GtfsShapePoint[] =>
    Array.from({ length: 50 }, (_, i) => ({
      shape_id: "s",
      shape_pt_lat: 40 + i * 0.005,
      shape_pt_lon: startLon,
      shape_pt_sequence: i,
    }));
  const trips = (shapeId: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      trip_id: `${shapeId}-${i}`,
      route_id: "A",
      service_id: "wk",
      shape_id: shapeId,
    }));

  it("keeps branches, drops mirrors of already-covered track", () => {
    const shapes = new Map([
      ["trunk", line(-75.0)],
      ["trunk-reverse", [...line(-75.0)].reverse().map((p, i) => ({ ...p, shape_pt_sequence: i }))],
      ["branch", line(-75.2)],
    ]);
    const all = [...trips("trunk", 100), ...trips("trunk-reverse", 90), ...trips("branch", 20)];
    expect(selectShapesForRoute("A", all, shapes)).toEqual(["trunk", "branch"]);
  });

  it("respects maxShapes", () => {
    const shapes = new Map(
      Array.from({ length: 5 }, (_, i) => [`s${i}`, line(-75 - i * 0.3)] as const)
    );
    const all = Array.from({ length: 5 }, (_, i) => trips(`s${i}`, 50 - i)).flat();
    expect(
      selectShapesForRoute("A", all, shapes as Map<string, GtfsShapePoint[]>, { maxShapes: 3 })
    ).toHaveLength(3);
  });
});
