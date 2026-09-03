import { describe, it, expect } from "vitest";
import { parseGtfsBundle } from "./parser";
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
