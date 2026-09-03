import { NextResponse } from "next/server";
import { getAllSystems, getIncidentCacheStatus } from "@/lib/data";

const INCIDENTS_WORKER_URL = process.env.INCIDENTS_WORKER_URL;

interface WorkerHealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  cronSchedule: string;
  systems: Record<
    string,
    {
      lastPullAt: string;
      lastPullDurationMs: number;
      lastPullSuccess: boolean;
      lastError: string | null;
    }
  >;
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const cacheEntries = getIncidentCacheStatus();

  // Check app health: can we load system data?
  let appStatus: "ok" | "error" = "ok";
  let systemCount = 0;
  try {
    const systems = await getAllSystems();
    systemCount = systems.length;
    if (systemCount === 0) {
      appStatus = "error";
    }
  } catch {
    appStatus = "error";
  }

  // Check worker health independently
  let workerStatus: "ok" | "degraded" | "unreachable" = "unreachable";
  let workerLatencyMs: number | null = null;
  let workerSystems: WorkerHealthResponse["systems"] | null = null;
  let workerCronSchedule: string | null = null;

  if (INCIDENTS_WORKER_URL) {
    const start = performance.now();
    try {
      const res = await fetch(`${INCIDENTS_WORKER_URL}/healthz`, {
        cache: "no-store",
      });
      workerLatencyMs = Math.round(performance.now() - start);

      if (res.ok) {
        const data = (await res.json()) as WorkerHealthResponse;
        workerStatus = data.status;
        workerSystems = data.systems;
        workerCronSchedule = data.cronSchedule;
      }
    } catch {
      workerLatencyMs = Math.round(performance.now() - start);
    }
  }

  const status = appStatus === "error" ? "error" : workerStatus !== "ok" ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      timestamp,
      app: {
        status: appStatus,
        systemCount,
        cacheEntries,
      },
      worker: {
        status: workerStatus,
        latencyMs: workerLatencyMs,
        cronSchedule: workerCronSchedule,
        systems: workerSystems,
      },
    },
    { status: appStatus === "error" ? 503 : 200 }
  );
}
