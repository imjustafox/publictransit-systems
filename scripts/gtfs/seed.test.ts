import { describe, it, expect } from "vitest";
import { seedStationIdMap, extractStationOverlay, extractLineOverlay } from "./seed";

const stop = (id: string, name: string, lat: number, lon: number) => ({
  stop_id: id,
  stop_name: name,
  stop_lat: lat,
  stop_lon: lon,
});

describe("seedStationIdMap", () => {
  const stations = [
    {
      id: "16th-street-mission",
      name: "16th St Mission",
      coordinates: { lat: 37.7651, lng: -122.4196 },
    },
    {
      id: "24th-street-mission",
      name: "24th St Mission",
      coordinates: { lat: 37.7522, lng: -122.4184 },
    },
  ];

  it("matches each stop to the nearest station within range", () => {
    const result = seedStationIdMap(
      [
        stop("place_16TH", "16th St/Mission", 37.7652, -122.4197),
        stop("place_24TH", "24th St/Mission", 37.7523, -122.4183),
      ],
      stations
    );
    expect(result.stations).toEqual({
      place_16TH: "16th-street-mission",
      place_24TH: "24th-street-mission",
    });
    expect(result.unmatchedStops).toHaveLength(0);
    expect(result.unmatchedStations).toHaveLength(0);
  });

  it("never assigns two stops to one station (closest wins)", () => {
    const result = seedStationIdMap(
      [stop("near", "A", 37.76515, -122.41965), stop("far", "B", 37.766, -122.4205)],
      [stations[0]]
    );
    expect(result.stations).toEqual({ near: "16th-street-mission" });
    expect(result.unmatchedStops.map((s) => s.stop_id)).toEqual(["far"]);
  });

  it("reports stops beyond range and stations the feed lacks", () => {
    const result = seedStationIdMap([stop("x", "Elsewhere", 40, -100)], stations);
    expect(result.stations).toEqual({});
    expect(result.unmatchedStops).toHaveLength(1);
    expect(result.unmatchedStations).toHaveLength(2);
  });
});

describe("overlay extraction", () => {
  it("keeps only non-generated station fields", () => {
    const overlay = extractStationOverlay({
      id: "x",
      systemId: "s",
      name: "X",
      lines: ["a"],
      status: "active",
      coordinates: { lat: 1, lng: 2 },
      description: "hand prose",
      address: "1 Main St",
      features: ["elevator", "bike-parking"],
    });
    expect(overlay).toEqual({
      name: "X",
      description: "hand prose",
      address: "1 Main St",
      features: ["elevator", "bike-parking"],
    });
  });

  it("keeps hand line fields, drops generated ones", () => {
    const overlay = extractLineOverlay({
      id: "red",
      systemId: "s",
      status: "active",
      termini: ["A", "B"],
      topology: { type: "linear" },
      length: 10,
      name: "Red Line",
      colorHex: "#ED1C24",
      description: "hand prose",
    });
    expect(overlay).toEqual({ name: "Red Line", colorHex: "#ED1C24", description: "hand prose" });
  });

  it("returns undefined when nothing is hand-authored", () => {
    expect(
      extractStationOverlay({ id: "x", systemId: "s", lines: [], status: "active" })
    ).toBeUndefined();
  });
});
