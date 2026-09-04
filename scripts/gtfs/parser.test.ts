import { describe, it, expect } from "vitest";
import { parseGtfsBundle, parseGtfsSubfeeds } from "./parser";
import { buildMiniGtfsZip } from "./__fixtures__/build-zip";

describe("parseGtfsBundle", () => {
  it("parses routes including bus routes", async () => {
    const zip = await buildMiniGtfsZip();
    const gtfs = await parseGtfsBundle(zip);
    expect(gtfs.routes).toHaveLength(3);
    expect(gtfs.routes.find((r) => r.route_id === "R001")?.route_short_name).toBe("RED");
    expect(gtfs.routes.find((r) => r.route_id === "R001")?.route_color).toBe("FF0000");
  });

  it("parses stops with coordinates and wheelchair_boarding", async () => {
    const zip = await buildMiniGtfsZip();
    const gtfs = await parseGtfsBundle(zip);
    expect(gtfs.stops).toHaveLength(7);
    const alpha = gtfs.stops.find((s) => s.stop_id === "S001");
    expect(alpha?.stop_name).toBe("Alpha Station");
    expect(alpha?.stop_lat).toBeCloseTo(47.61);
    expect(alpha?.stop_lon).toBeCloseTo(-122.33);
    expect(alpha?.wheelchair_boarding).toBe(1);
  });

  it("parses trips with direction_id and shape_id", async () => {
    const zip = await buildMiniGtfsZip();
    const gtfs = await parseGtfsBundle(zip);
    expect(gtfs.trips).toHaveLength(3);
    const t001 = gtfs.trips.find((t) => t.trip_id === "T001");
    expect(t001?.direction_id).toBe(0);
    expect(t001?.shape_id).toBe("SH001");
  });

  it("groups stop_times by trip_id", async () => {
    const zip = await buildMiniGtfsZip();
    const gtfs = await parseGtfsBundle(zip);
    const t001Stops = gtfs.stopTimesByTrip.get("T001");
    expect(t001Stops?.map((s) => s.stop_id)).toEqual(["S001", "S002", "S003"]);
    expect(t001Stops?.map((s) => s.stop_sequence)).toEqual([1, 2, 3]);
  });

  it("parses shapes grouped by shape_id, sorted by sequence", async () => {
    const zip = await buildMiniGtfsZip();
    const gtfs = await parseGtfsBundle(zip);
    const sh001 = gtfs.shapesByShapeId.get("SH001");
    expect(sh001).toHaveLength(3);
    expect(sh001?.[0].shape_pt_sequence).toBe(1);
    expect(sh001?.[2].shape_pt_sequence).toBe(3);
  });

  it("throws on missing required file", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("agency.txt", "agency_id,agency_name\nT,Test\n");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    await expect(parseGtfsBundle(buf)).rejects.toThrow(
      /required.*stops\.txt|stops\.txt.*required/i
    );
  });
});

describe("parseGtfsSubfeeds", () => {
  async function buildOuterZip(): Promise<Buffer> {
    const JSZip = (await import("jszip")).default;
    const inner = await buildMiniGtfsZip();
    // Second branch: same stops S001/S002 (shared station ids, Victoria
    // style), plus its own route/trip so every id class is exercised.
    const second = new JSZip();
    second.file(
      "routes.txt",
      "route_id,route_short_name,route_long_name,route_type,route_color\nX900,PURPLE,Purple Line,2,800080\n"
    );
    second.file(
      "stops.txt",
      "stop_id,stop_name,stop_lat,stop_lon\nS001,Alpha Station,47.61,-122.33\nS900,Zeta Station,47.7,-122.4\n"
    );
    second.file("trips.txt", "route_id,service_id,trip_id\nX900,WK,X900-T1\n");
    second.file(
      "stop_times.txt",
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nX900-T1,08:00:00,08:00:00,S001,1\nX900-T1,08:10:00,08:10:00,S900,2\n"
    );
    const outer = new JSZip();
    outer.file("1/google_transit.zip", inner);
    outer.file("2/google_transit.zip", await second.generateAsync({ type: "nodebuffer" }));
    return outer.generateAsync({ type: "nodebuffer" });
  }

  it("merges routes and trips from every subfeed", async () => {
    const gtfs = await parseGtfsSubfeeds(await buildOuterZip(), [
      "1/google_transit.zip",
      "2/google_transit.zip",
    ]);
    expect(gtfs.routes.map((r) => r.route_id)).toContain("R001");
    expect(gtfs.routes.map((r) => r.route_id)).toContain("X900");
    expect(gtfs.stopTimesByTrip.get("X900-T1")?.map((s) => s.stop_id)).toEqual(["S001", "S900"]);
  });

  it("dedupes stops shared between subfeeds by stop_id", async () => {
    const gtfs = await parseGtfsSubfeeds(await buildOuterZip(), [
      "1/google_transit.zip",
      "2/google_transit.zip",
    ]);
    expect(gtfs.stops.filter((s) => s.stop_id === "S001")).toHaveLength(1);
    expect(gtfs.stops.some((s) => s.stop_id === "S900")).toBe(true);
  });

  it("fails loud on a missing subfeed path", async () => {
    await expect(
      parseGtfsSubfeeds(await buildOuterZip(), ["9/google_transit.zip"])
    ).rejects.toThrow(/missing subfeed/);
  });

  it("tags every route with its subfeed's network for object entries", async () => {
    const gtfs = await parseGtfsSubfeeds(await buildOuterZip(), [
      { path: "1/google_transit.zip", network: "metro" },
      { path: "2/google_transit.zip", network: "trams" },
    ]);
    expect(gtfs.networkByRouteId.get("R001")).toBe("metro");
    expect(gtfs.networkByRouteId.get("R002")).toBe("metro");
    expect(gtfs.networkByRouteId.get("X900")).toBe("trams");
  });

  it("mixes string and object entries, leaving untagged routes unmapped", async () => {
    const gtfs = await parseGtfsSubfeeds(await buildOuterZip(), [
      "1/google_transit.zip",
      { path: "2/google_transit.zip", network: "trams" },
    ]);
    expect(gtfs.networkByRouteId.has("R001")).toBe(false);
    expect(gtfs.networkByRouteId.get("X900")).toBe("trams");
    expect(gtfs.routes.map((r) => r.route_id)).toContain("R001");
  });
});
