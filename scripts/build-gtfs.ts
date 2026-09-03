import { promises as fs } from "fs";
import path from "path";
import { processSystem } from "./gtfs/system";

const DATA_DIR = path.join(process.cwd(), "data", "systems");

async function main() {
  const args = process.argv.slice(2);
  const systemArg = args.find((a) => a.startsWith("--system="))?.split("=")[1];

  const allSystems = await fs.readdir(DATA_DIR);
  const targets = systemArg ? [systemArg] : allSystems;

  let hadFatalFailure = false;
  const summary: string[] = [];

  for (const systemId of targets) {
    const systemDir = path.join(DATA_DIR, systemId);
    try {
      const stat = await fs.stat(systemDir).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        summary.push(`- ${systemId}: skipped (not a directory)`);
        continue;
      }
      const result = await processSystem(systemDir, systemId, process.env);
      if (result.status === "regenerated") {
        const d = result.diagnostics!;
        summary.push(
          `✓ ${systemId}: regenerated (${d.linesDetected} lines, ${d.stationsDetected} stations)`
        );
      } else {
        summary.push(`- ${systemId}: skipped (${result.reason})`);
      }
    } catch (err) {
      hadFatalFailure = true;
      const msg = err instanceof Error ? err.message : String(err);
      summary.push(`✗ ${systemId}: FAILED — ${msg}`);
    }
  }

  console.log("\n=== GTFS build summary ===");
  for (const line of summary) console.log(line);

  if (hadFatalFailure) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error in GTFS build:", err);
  process.exit(1);
});
