import { describe, it, expect } from "vitest";
import { applyRouteGroups, ifoptStationId } from "./groups";
import type { GtfsRoute, GtfsTrip } from "./parser";

const route = (id: string, name: string): GtfsRoute => ({
  route_id: id,
  route_short_name: name,
  route_type: 1,
  route_color: "FFFF33",
});

const trip = (id: string, routeId: string): GtfsTrip => ({
  trip_id: id,
  route_id: routeId,
  service_id: "wk",
});

describe("applyRouteGroups", () => {
  const routes = [route("1", "Yellow-S"), route("2", "Yellow-N"), route("7", "Red-S")];
  const trips = [trip("a", "1"), trip("b", "2"), trip("c", "7")];

  it("returns input untouched with no groups", () => {
    const out = applyRouteGroups(routes, trips, undefined);
    expect(out.routes).toEqual(routes);
    expect(out.trips).toEqual(trips);
  });

  it("collapses member routes into one synthetic route named by group key", () => {
    const out = applyRouteGroups(routes, trips, { yellow: ["1", "2"] });
    const ids = out.routes.map((r) => r.route_id);
    expect(ids).toContain("yellow");
    expect(ids).not.toContain("1");
    expect(ids).not.toContain("2");
    expect(ids).toContain("7"); // ungrouped passes through
    const yellow = out.routes.find((r) => r.route_id === "yellow")!;
    expect(yellow.route_short_name).toBe("yellow");
    expect(yellow.route_color).toBe("FFFF33"); // inherited from first member
  });

  it("repoints member trips at the group id", () => {
    const out = applyRouteGroups(routes, trips, { yellow: ["1", "2"] });
    expect(out.trips.map((t) => t.route_id)).toEqual(["yellow", "yellow", "7"]);
  });

  it("drops a group whose members are all absent from the feed", () => {
    const out = applyRouteGroups(routes, trips, { ghost: ["99"] });
    expect(out.routes.map((r) => r.route_id)).not.toContain("ghost");
  });

  it("throws when a route belongs to two groups", () => {
    expect(() => applyRouteGroups(routes, trips, { a: ["1"], b: ["1"] })).toThrow(/both/);
  });
});

describe("ifoptStationId", () => {
  it("truncates platform and quay segments to the station", () => {
    expect(ifoptStationId("de:08111:55:1:2")).toBe("de:08111:55");
    expect(ifoptStationId("de:08111:6073:1:2")).toBe("de:08111:6073");
  });
  it("returns non-IFOPT ids unchanged", () => {
    expect(ifoptStationId("place_PCTR")).toBe("place_PCTR");
    expect(ifoptStationId("101")).toBe("101");
  });
});
