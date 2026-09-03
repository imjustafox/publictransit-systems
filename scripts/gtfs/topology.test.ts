import { describe, it, expect } from "vitest";
import { detectTopology, extractTripPatterns } from "./topology";

describe("extractTripPatterns", () => {
  it("groups trips into unique stop sequences", () => {
    const stopTimesByTrip = new Map<
      string,
      Array<{ stop_id: string; stop_sequence: number; trip_id: string }>
    >();
    stopTimesByTrip.set("T1", [
      { trip_id: "T1", stop_id: "A", stop_sequence: 1 },
      { trip_id: "T1", stop_id: "B", stop_sequence: 2 },
      { trip_id: "T1", stop_id: "C", stop_sequence: 3 },
    ]);
    stopTimesByTrip.set("T2", [
      { trip_id: "T2", stop_id: "A", stop_sequence: 1 },
      { trip_id: "T2", stop_id: "B", stop_sequence: 2 },
      { trip_id: "T2", stop_id: "C", stop_sequence: 3 },
    ]);
    stopTimesByTrip.set("T3", [
      { trip_id: "T3", stop_id: "C", stop_sequence: 1 },
      { trip_id: "T3", stop_id: "B", stop_sequence: 2 },
      { trip_id: "T3", stop_id: "A", stop_sequence: 3 },
    ]);
    const patterns = extractTripPatterns(["T1", "T2", "T3"], stopTimesByTrip as never);
    expect(patterns).toHaveLength(2);
    expect(patterns.find((p) => p.stops[0] === "A")?.tripCount).toBe(2);
    expect(patterns.find((p) => p.stops[0] === "C")?.tripCount).toBe(1);
  });
});

describe("detectTopology — linear", () => {
  it("detects simple A→B→C as linear", () => {
    const patterns = [{ stops: ["A", "B", "C"], tripCount: 10 }];
    const result = detectTopology(patterns);
    expect(result.topology.type).toBe("linear");
    expect(result.termini).toEqual(["A", "C"]);
  });

  it("detects bidirectional A→B→C and C→B→A as linear", () => {
    const patterns = [
      { stops: ["A", "B", "C"], tripCount: 10 },
      { stops: ["C", "B", "A"], tripCount: 10 },
    ];
    const result = detectTopology(patterns);
    expect(result.topology.type).toBe("linear");
    expect(new Set(result.termini)).toEqual(new Set(["A", "C"]));
  });
});

describe("detectTopology — loop", () => {
  it("detects loop when first === last in dominant pattern", () => {
    const patterns = [{ stops: ["A", "B", "C", "D", "A"], tripCount: 100 }];
    const result = detectTopology(patterns);
    expect(result.topology.type).toBe("loop");
    if (result.topology.type === "loop") {
      expect(result.topology.referenceStation).toBe("A");
    }
  });

  it("does not detect loop from short-turn artifacts when minority", () => {
    const patterns = [
      { stops: ["A", "B", "C"], tripCount: 100 },
      { stops: ["A", "B", "A"], tripCount: 5 }, // a tail-track short-turn
    ];
    const result = detectTopology(patterns);
    expect(result.topology.type).toBe("linear");
  });
});

describe("detectTopology — lollipop", () => {
  it("detects lollipop when single trip visits one stop twice", () => {
    const patterns = [{ stops: ["A", "B", "C", "D", "E", "C"], tripCount: 50 }];
    const result = detectTopology(patterns);
    expect(result.topology.type).toBe("lollipop");
    if (result.topology.type === "lollipop") {
      expect(result.topology.loopStation).toBe("C");
    }
  });
});

describe("detectTopology — branches", () => {
  it("detects branches sharing common prefix", () => {
    const patterns = [
      { stops: ["A", "B", "C", "D1", "D2"], tripCount: 50 },
      { stops: ["A", "B", "C", "E1", "E2"], tripCount: 50 },
    ];
    const result = detectTopology(patterns);
    expect(result.topology.type).toBe("linear");
    if (result.topology.type === "linear") {
      expect(result.topology.branches).toBeDefined();
      expect(result.topology.branches?.length).toBe(2);
      const branchStations = result.topology.branches?.map((b) => b.branchStation);
      expect(branchStations?.[0]).toBe("C");
    }
  });
});
