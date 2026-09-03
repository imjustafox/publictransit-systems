import { describe, it, expect } from "vitest";
import {
  matchStationsToOsm,
  buildOsmLayer,
  applyOsmToStation,
  entranceFromElement,
} from "./enrich";
import type { OsmElement } from "./overpass";

const station = (
  tags: Record<string, string>,
  id: number,
  lat: number,
  lon: number
): OsmElement => ({ type: "node", id, lat, lon, tags: { railway: "station", ...tags } });

const entrance = (
  tags: Record<string, string>,
  id: number,
  lat: number,
  lon: number
): OsmElement => ({ type: "node", id, lat, lon, tags: { railway: "subway_entrance", ...tags } });

import type { EnrichStation } from "./enrich";
const ours = (id: string, lat: number, lng: number, extra: object = {}): EnrichStation => ({
  id,
  name: id,
  coordinates: { lat, lng },
  ...extra,
});

describe("matchStationsToOsm", () => {
  it("matches by recorded osmId before proximity", () => {
    const far = station({ name: "Far" }, 99, 40.1, -75.1);
    const near = station({ name: "Near" }, 1, 40.0, -75.0);
    const out = matchStationsToOsm([ours("a", 40.0, -75.0, { osmId: "node/99" })], [far, near]);
    expect(out.get("a")!.id).toBe(99);
  });

  it("greedy nearest within radius, one claim per element", () => {
    const el = station({}, 1, 40.0, -75.0);
    const out = matchStationsToOsm(
      [ours("closest", 40.00001, -75.0), ours("nextdoor", 40.0004, -75.0)],
      [el]
    );
    expect(out.get("closest")!.id).toBe(1);
    expect(out.has("nextdoor")).toBe(false);
  });

  it("ignores elements beyond the radius", () => {
    const out = matchStationsToOsm([ours("a", 40.0, -75.0)], [station({}, 1, 40.01, -75.0)]);
    expect(out.size).toBe(0);
  });
});

describe("entranceFromElement", () => {
  it("names from ref and maps wheelchair", () => {
    const e = entranceFromElement(entrance({ ref: "B2", wheelchair: "no" }, 5, 40, -75));
    expect(e).toEqual({
      id: "osm-node-5",
      name: "Exit B2",
      coordinates: { lat: 40, lng: -75 },
      accessibility: [],
      wheelchair: false,
    });
  });

  it("marks elevator entrances", () => {
    const el: OsmElement = {
      type: "node",
      id: 6,
      lat: 40,
      lon: -75,
      tags: { highway: "elevator", wheelchair: "yes" },
    };
    const e = entranceFromElement(el);
    expect(e.accessibility).toEqual(["elevator"]);
    expect(e.name).toBe("Elevator");
    expect(e.wheelchair).toBe(true);
  });
});

describe("buildOsmLayer", () => {
  const elements = [
    station({ wikidata: "Q42", wheelchair: "yes", name: "Foo" }, 1, 40.0, -75.0),
    entrance({ ref: "A" }, 2, 40.0005, -75.0),
    { type: "node" as const, id: 3, lat: 40.0006, lon: -75.0, tags: { highway: "elevator" } },
    entrance({ ref: "Z" }, 4, 41.0, -75.0), // far from everything
  ];

  it("assembles identifiers, features, and entrances per station", () => {
    const layer = buildOsmLayer([ours("foo", 40.0, -75.0)], elements);
    const foo = layer.stations.foo;
    expect(foo.osmId).toBe("node/1");
    expect(foo.wikidata).toBe("Q42");
    expect(foo.features).toEqual(["accessible", "elevator"]);
    expect(foo.entrances!.map((e) => e.id)).toEqual(["osm-node-2", "osm-node-3"]);
  });

  it("orphan entrances attach to nothing", () => {
    const layer = buildOsmLayer([ours("foo", 40.0, -75.0)], elements);
    const all = Object.values(layer.stations).flatMap((s) => s.entrances ?? []);
    expect(all.find((e) => e.id === "osm-node-4")).toBeUndefined();
  });
});

describe("applyOsmToStation", () => {
  const osm = {
    osmId: "node/1",
    wikidata: "Q42",
    features: ["elevator"],
    entrances: [
      { id: "osm-node-2", name: "Exit A", coordinates: { lat: 1, lng: 2 }, accessibility: [] },
    ],
  };

  it("fills identifiers, unions features, adds entrances when absent", () => {
    const out = applyOsmToStation(ours("s", 1, 2, { features: ["fare-vending"] }), osm);
    expect(out.osmId).toBe("node/1");
    expect(out.wikidata).toBe("Q42");
    expect(out.features).toEqual(["elevator", "fare-vending"]);
    expect(out.entrances).toHaveLength(1);
  });

  it("never replaces existing entrances", () => {
    const existing = [{ id: "hand-1", name: "Hand entrance" }];
    const out = applyOsmToStation(ours("s", 1, 2, { entrances: existing }), osm);
    expect(out.entrances).toBe(existing);
  });
});
