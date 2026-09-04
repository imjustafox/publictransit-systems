import { describe, it, expect, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import JSZip from "jszip";
import { processSystem } from "./system";

type Plain = Record<string, unknown>;

// Tiny single-route feed: route_type 1 (subway) so the default rail filter
// keeps it, no shapes (optional). Stops become the trip's calling pattern in
// order.
function feedFiles(
  routeId: string,
  longName: string,
  stops: Array<[id: string, name: string, lat: number, lon: number]>
): Record<string, string> {
  return {
    "routes.txt":
      "route_id,route_short_name,route_long_name,route_type,route_color\n" +
      `${routeId},,${longName},1,FF0000\n`,
    "stops.txt":
      "stop_id,stop_name,stop_lat,stop_lon\n" +
      stops.map(([id, name, lat, lon]) => `${id},${name},${lat},${lon}`).join("\n") +
      "\n",
    "trips.txt": `route_id,service_id,trip_id\n${routeId},WK,${routeId}-T1\n`,
    "stop_times.txt":
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" +
      stops.map(([id], i) => `${routeId}-T1,08:0${i}:00,08:0${i}:00,${id},${i + 1}`).join("\n") +
      "\n",
  };
}

async function buildZip(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

const alphaFeed = feedFiles("RA", "Alpha Line", [
  ["SA1", "First", 47.6, -122.3],
  ["SHARED", "Central", 47.61, -122.31],
]);
const betaFeed = feedFiles("RB", "Beta Line", [
  ["SHARED", "Central", 47.61, -122.31],
  ["SB1", "Second", 47.62, -122.32],
]);

const createdDirs: string[] = [];

async function makeSystemDir(
  systemJson: Plain,
  gtfsJson: Plain,
  overlayJson?: Plain
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gtfs-system-test-"));
  createdDirs.push(dir);
  await fs.writeFile(path.join(dir, "system.json"), JSON.stringify(systemJson, null, 2) + "\n");
  await fs.writeFile(path.join(dir, "gtfs.json"), JSON.stringify(gtfsJson, null, 2) + "\n");
  if (overlayJson) {
    await fs.writeFile(path.join(dir, "overlay.json"), JSON.stringify(overlayJson, null, 2) + "\n");
  }
  return dir;
}

function systemJson(networks?: Array<{ id: string; name: string; type: string }>): Plain {
  return {
    id: "testville",
    dataSource: "gtfs",
    name: "Testville Transit",
    stats: { distanceUnit: "km" },
    ...(networks ? { networks } : {}),
  };
}

function stubFetch(byUrl: Record<string, Buffer>) {
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const body = byUrl[String(url)];
    if (!body) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(body));
  });
}

async function readLines(dir: string): Promise<Plain[]> {
  const raw = JSON.parse(await fs.readFile(path.join(dir, "lines.json"), "utf-8"));
  return raw.lines;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(createdDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("processSystem network assignment", () => {
  const env = { FEED_URL: "https://feeds.test/main.zip" };

  it("carries subfeed networks onto lines and satisfies the invariant", async () => {
    const outer = await buildZip({
      "a/gtfs.zip": await buildZip(alphaFeed),
      "b/gtfs.zip": await buildZip(betaFeed),
    });
    stubFetch({ [env.FEED_URL]: outer });
    const dir = await makeSystemDir(
      systemJson([
        { id: "metro", name: "Metro", type: "metro" },
        { id: "trams", name: "Trams", type: "tram" },
      ]),
      {
        static: {
          url_secret: "FEED_URL",
          auth: { type: "none" },
          subfeeds: [
            { path: "a/gtfs.zip", network: "metro" },
            { path: "b/gtfs.zip", network: "trams" },
          ],
        },
      }
    );

    const result = await processSystem(dir, "testville", env);
    expect(result.status).toBe("regenerated");
    const lines = await readLines(dir);
    expect(lines.find((l) => l.id === "alpha-line")?.network).toBe("metro");
    expect(lines.find((l) => l.id === "beta-line")?.network).toBe("trams");
  });

  it("assigns networks from the static.networks slug map, beating subfeed origin", async () => {
    const outer = await buildZip({
      "a/gtfs.zip": await buildZip(alphaFeed),
      "b/gtfs.zip": await buildZip(betaFeed),
    });
    stubFetch({ [env.FEED_URL]: outer });
    const dir = await makeSystemDir(
      systemJson([
        { id: "metro", name: "Metro", type: "metro" },
        { id: "special", name: "Special", type: "rail" },
      ]),
      {
        static: {
          url_secret: "FEED_URL",
          auth: { type: "none" },
          subfeeds: [
            { path: "a/gtfs.zip", network: "metro" },
            { path: "b/gtfs.zip", network: "metro" },
          ],
          networks: { special: ["beta-line"] },
        },
      }
    );

    await processSystem(dir, "testville", env);
    const lines = await readLines(dir);
    expect(lines.find((l) => l.id === "alpha-line")?.network).toBe("metro");
    expect(lines.find((l) => l.id === "beta-line")?.network).toBe("special");
  });

  it("lets the overlay win over subfeed origin via the normal merge", async () => {
    const outer = await buildZip({ "a/gtfs.zip": await buildZip(alphaFeed) });
    stubFetch({ [env.FEED_URL]: outer });
    const dir = await makeSystemDir(
      systemJson([
        { id: "metro", name: "Metro", type: "metro" },
        { id: "special", name: "Special", type: "rail" },
      ]),
      {
        static: {
          url_secret: "FEED_URL",
          auth: { type: "none" },
          subfeeds: [{ path: "a/gtfs.zip", network: "metro" }],
        },
      },
      { lines: { "alpha-line": { network: "special" } } }
    );

    await processSystem(dir, "testville", env);
    const lines = await readLines(dir);
    expect(lines.find((l) => l.id === "alpha-line")?.network).toBe("special");
  });

  it("omits the network key entirely when nothing assigns one", async () => {
    stubFetch({ [env.FEED_URL]: await buildZip(alphaFeed) });
    const dir = await makeSystemDir(systemJson(), {
      static: { url_secret: "FEED_URL", auth: { type: "none" } },
    });

    const result = await processSystem(dir, "testville", env);
    expect(result.status).toBe("regenerated");
    const lines = await readLines(dir);
    expect("network" in lines[0]).toBe(false);
  });
});

describe("processSystem network invariant", () => {
  const env = { FEED_URL: "https://feeds.test/main.zip" };

  it("fails loud when a declared-networks system leaves a line unassigned", async () => {
    stubFetch({ [env.FEED_URL]: await buildZip(alphaFeed) });
    const dir = await makeSystemDir(systemJson([{ id: "metro", name: "Metro", type: "metro" }]), {
      static: { url_secret: "FEED_URL", auth: { type: "none" } },
    });

    await expect(processSystem(dir, "testville", env)).rejects.toThrow(/alpha-line has no network/);
  });

  it("fails loud when a line carries an undeclared network id", async () => {
    stubFetch({ [env.FEED_URL]: await buildZip(alphaFeed) });
    const dir = await makeSystemDir(systemJson([{ id: "metro", name: "Metro", type: "metro" }]), {
      static: {
        url_secret: "FEED_URL",
        auth: { type: "none" },
        networks: { ghost: ["alpha-line"] },
      },
    });

    await expect(processSystem(dir, "testville", env)).rejects.toThrow(
      /undeclared network "ghost"/
    );
  });

  it("accepts a network on a line even when the system declares none", async () => {
    stubFetch({ [env.FEED_URL]: await buildZip(alphaFeed) });
    const dir = await makeSystemDir(systemJson(), {
      static: {
        url_secret: "FEED_URL",
        auth: { type: "none" },
        networks: { metro: ["alpha-line"] },
      },
    });

    const result = await processSystem(dir, "testville", env);
    expect(result.status).toBe("regenerated");
    const lines = await readLines(dir);
    expect(lines.find((l) => l.id === "alpha-line")?.network).toBe("metro");
  });
});

describe("processSystem multi-source feeds", () => {
  const env = {
    FEED_A_URL: "https://feeds.test/a.zip",
    FEED_B_URL: "https://feeds.test/b.zip",
  };

  it("fetches each source independently and merges with subfeed semantics", async () => {
    stubFetch({
      [env.FEED_A_URL]: await buildZip(alphaFeed),
      [env.FEED_B_URL]: await buildZip(betaFeed),
    });
    const dir = await makeSystemDir(
      systemJson([
        { id: "metro", name: "Metro", type: "metro" },
        { id: "light-rail", name: "Light Rail", type: "light-rail" },
      ]),
      {
        static: {
          sources: [
            { url_secret: "FEED_A_URL", network: "metro" },
            { url_secret: "FEED_B_URL", auth: { type: "none" }, network: "light-rail" },
          ],
        },
      }
    );

    const result = await processSystem(dir, "testville", env);
    expect(result.status).toBe("regenerated");

    const lines = await readLines(dir);
    expect(lines.find((l) => l.id === "alpha-line")?.network).toBe("metro");
    expect(lines.find((l) => l.id === "beta-line")?.network).toBe("light-rail");

    // SHARED appears in both feeds with a consistent name: the stop dedups
    // and the station serves both lines.
    const stations = JSON.parse(await fs.readFile(path.join(dir, "stations.json"), "utf-8"))
      .stations as Plain[];
    const central = stations.find((s) => s.id === "central");
    expect(central?.name).toBe("Central");
    expect([...(central?.lines as string[])].sort()).toEqual(["alpha-line", "beta-line"]);
  });

  it("rejects gtfs.json declaring both sources and a top-level url_secret", async () => {
    const dir = await makeSystemDir(systemJson(), {
      static: {
        url_secret: "FEED_A_URL",
        auth: { type: "none" },
        sources: [{ url_secret: "FEED_B_URL" }],
      },
    });

    await expect(processSystem(dir, "testville", env)).rejects.toThrow(/mutually exclusive/);
  });

  it("skips with a missing-secret reason when a source secret is unset", async () => {
    const dir = await makeSystemDir(systemJson(), {
      static: { sources: [{ url_secret: "UNSET_FEED_URL" }] },
    });

    const result = await processSystem(dir, "testville", {});
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("missing secret: UNSET_FEED_URL");
  });

  it("fails loud when sources reuse a stop id for different stops", async () => {
    const conflicting = feedFiles("RB", "Beta Line", [
      ["SHARED", "Somewhere Else", 47.9, -122.9],
      ["SB1", "Second", 47.62, -122.32],
    ]);
    stubFetch({
      [env.FEED_A_URL]: await buildZip(alphaFeed),
      [env.FEED_B_URL]: await buildZip(conflicting),
    });
    const dir = await makeSystemDir(systemJson([{ id: "metro", name: "Metro", type: "metro" }]), {
      static: {
        sources: [
          { url_secret: "FEED_A_URL", network: "metro" },
          { url_secret: "FEED_B_URL", network: "metro" },
        ],
      },
    });
    await expect(processSystem(dir, "testville", env)).rejects.toThrow(/stop_id collision/);
  });
});
