import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "mini-gtfs");
const FILES = [
  "agency.txt",
  "routes.txt",
  "stops.txt",
  "trips.txt",
  "stop_times.txt",
  "calendar.txt",
  "shapes.txt",
];

export async function buildMiniGtfsZip(): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of FILES) {
    const content = await fs.readFile(path.join(FIXTURE_DIR, file), "utf-8");
    zip.file(file, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
