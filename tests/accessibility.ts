import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test as base } from "@playwright/test";

type AxeFixture = {
  makeAxeBuilder: () => AxeBuilder;
};

type LinesFile = {
  lines?: Array<{ id?: string; status?: string }>;
};

type RailcarsFile = {
  generations?: Array<{ id?: string }>;
};

type StationsFile = {
  stations?: Array<{ id?: string }>;
};

const dataDir = path.join(process.cwd(), "data", "systems");

export const localURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

function readJSON<T>(filePath: string): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(`Unable to read route data from ${filePath}: ${(error as Error).message}`);
  }
}

// Synchronous so tests can be declared per route at collection time.
export function getRoutes(): string[] {
  const routes = new Set<string>(["/", "/compare", "/search", "/docs/about", "/docs/api"]);

  const systemIds = fs.readdirSync(dataDir);

  for (const systemId of systemIds) {
    const systemDir = path.join(dataDir, systemId);
    if (!fs.statSync(systemDir).isDirectory()) {
      continue;
    }

    routes.add(`/${systemId}`);
    routes.add(`/${systemId}/history`);
    routes.add(`/${systemId}/lines`);
    routes.add(`/${systemId}/railcars`);
    routes.add(`/${systemId}/stations`);

    const lines = readJSON<LinesFile>(path.join(systemDir, "lines.json"));
    const firstLine = lines?.lines?.find((line) => line.id && line.status !== "disabled");
    if (firstLine?.id) {
      routes.add(`/${systemId}/lines/${firstLine.id}`);
    }

    const railcars = readJSON<RailcarsFile>(path.join(systemDir, "railcars.json"));
    const firstRailcar = railcars?.generations?.find((railcar) => railcar.id);
    if (firstRailcar?.id) {
      routes.add(`/${systemId}/railcars/${firstRailcar.id}`);
    }

    const stations = readJSON<StationsFile>(path.join(systemDir, "stations.json"));
    const firstStation = stations?.stations?.find((station) => station.id);
    if (firstStation?.id) {
      routes.add(`/${systemId}/stations/${firstStation.id}`);
    }
  }

  return [...routes].sort();
}

export const test = base.extend<AxeFixture>({
  makeAxeBuilder: async ({ page }, runFixture) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page })
        .exclude(".leaflet-marker-icon")
        .exclude(".leaflet-control-attribution")
        .withTags(["wcag2a", "wcag21a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]);

    await runFixture(makeAxeBuilder);
  },
});

export { expect } from "@playwright/test";
