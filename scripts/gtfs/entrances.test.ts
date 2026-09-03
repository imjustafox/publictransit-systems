import { describe, it, expect } from "vitest";
import { extractEntrances, inferAccessibility, entranceDisplayName } from "./entrances";
import type { GtfsStop, GtfsPathway } from "./parser";

const pathway = (id: string, from: string, to: string, mode: number): GtfsPathway => ({
  pathway_id: id,
  from_stop_id: from,
  to_stop_id: to,
  pathway_mode: mode,
});

const entranceStop = (id: string, name: string, parent: string, wheelchair?: number): GtfsStop => ({
  stop_id: id,
  stop_name: name,
  stop_lat: 38.9,
  stop_lon: -77.1,
  location_type: 2,
  parent_station: parent,
  wheelchair_boarding: wheelchair,
});

describe("entranceDisplayName", () => {
  it("strips the station-name prefix", () => {
    expect(
      entranceDisplayName("Wiehle-Reston East - Dulles Toll Rd Exit 13", "Wiehle-Reston East")
    ).toBe("Dulles Toll Rd Exit 13");
  });
  it("leaves names without the prefix untouched", () => {
    expect(entranceDisplayName("North Entrance", "Wiehle-Reston East")).toBe("North Entrance");
  });
});

describe("inferAccessibility", () => {
  const pathways = [
    pathway("p1", "ENT_A", "MEZZ", 5),
    pathway("p2", "MEZZ", "ENT_A", 4),
    pathway("p3", "ENT_B", "MEZZ", 2),
    pathway("p4", "ENT_C", "MEZZ", 1),
  ];
  it("reports elevator and escalator when both touch the entrance", () => {
    expect(inferAccessibility("ENT_A", pathways)).toEqual(["elevator", "escalator"]);
  });
  it("reports stairs-only when stairs are the only classified mode", () => {
    expect(inferAccessibility("ENT_B", pathways)).toEqual(["stairs-only"]);
  });
  it("claims nothing for walkway-only or unknown entrances", () => {
    expect(inferAccessibility("ENT_C", pathways)).toEqual([]);
    expect(inferAccessibility("ENT_X", pathways)).toEqual([]);
  });
});

describe("extractEntrances", () => {
  const stops: GtfsStop[] = [
    entranceStop("ENT_A", "Foo Station - North Elevator", "STN_1", 1),
    entranceStop("ENT_B", "Foo Station - South Stairs", "STN_1", 2),
    { stop_id: "PLAT_1", stop_name: "Foo Station", stop_lat: 0, stop_lon: 0, location_type: 0 },
  ];
  const pathways = [pathway("p1", "ENT_A", "MEZZ", 5), pathway("p2", "ENT_B", "MEZZ", 2)];
  const canonical = (id: string) => id;
  const names = (id: string) => (id === "STN_1" ? "Foo Station" : undefined);

  it("groups entrances by station, ignores non-entrance stops, maps wheelchair", () => {
    const out = extractEntrances(stops, pathways, canonical, names);
    expect([...out.keys()]).toEqual(["STN_1"]);
    const [a, b] = out.get("STN_1")!;
    expect(a).toEqual({
      id: "ENT_A",
      name: "North Elevator",
      coordinates: { lat: 38.9, lng: -77.1 },
      accessibility: ["elevator"],
      wheelchair: true,
    });
    expect(b.name).toBe("South Stairs");
    expect(b.accessibility).toEqual(["stairs-only"]);
    expect(b.wheelchair).toBe(false);
  });
});

describe("name-derived accessibility", () => {
  it("marks elevator entrances by name when pathways are silent", () => {
    const out = extractEntrances(
      [entranceStop("E1", "Foo Station - West (Elevator)", "STN_1", 1)],
      [],
      (id) => id,
      () => "Foo Station"
    );
    expect(out.get("STN_1")![0].accessibility).toEqual(["elevator"]);
  });

  it("drops stairs-only when a name reveals an elevator", () => {
    const out = extractEntrances(
      [entranceStop("E1", "Foo Station - West Elevator", "STN_1", 1)],
      [pathway("p", "E1", "M", 2)],
      (id) => id,
      () => "Foo Station"
    );
    expect(out.get("STN_1")![0].accessibility).toEqual(["elevator"]);
  });
});
