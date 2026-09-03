/**
 * Transit Incidents Worker
 *
 * Polls every supported transit agency's incident feed on a schedule and
 * serves the results via HTTP from KV storage. The app never talks to an
 * agency directly; it only reads this worker.
 *
 * WMATA and Tokyo Metro have bespoke modules because they need API keys and
 * nontrivial transformation. Every other system uses a fetcher ported from
 * the app plus the generic refreshSystem wrapper for KV and health writes.
 *
 * Endpoints:
 *   GET /healthz                          - Worker health check
 *   GET /incidents/:systemId              - All incidents for a system
 *   GET /incidents/:systemId/:stationId   - A station's unit outages
 *   POST /refresh                         - Refresh all systems
 *   POST /refresh/:systemId               - Refresh a single system
 */

import { refreshWmata } from "./systems/wmata";
import { refreshTokyoMetro } from "./systems/tokyo-metro";
import {
  fetchBartIncidents,
  fetchSoundTransitIncidents,
  fetchNycSubwayIncidents,
  fetchBaltimoreMetroIncidents,
  fetchBaltimoreLightRailIncidents,
  fetchCtaIncidents,
  fetchRtdIncidents,
} from "./fetchers";
import type { IncidentData, UnitOutage } from "./types";

export interface Env {
  INCIDENTS_KV: KVNamespace;
  WMATA_API_KEY: string;
  ODPT_CONSUMER_KEY: string;
  CORS_ORIGIN: string;
}

// Keep in sync with the cron trigger in wrangler.toml.
const CRON_SCHEDULE = "0 * * * *";
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2x the cron interval

const FETCHERS: Record<string, () => Promise<IncidentData | null>> = {
  bart: fetchBartIncidents,
  "sound-transit": fetchSoundTransitIncidents,
  "nyc-subway": fetchNycSubwayIncidents,
  "baltimore-metro": fetchBaltimoreMetroIncidents,
  "baltimore-light-rail": fetchBaltimoreLightRailIncidents,
  cta: fetchCtaIncidents,
  "rtd-denver": fetchRtdIncidents,
};

const SYSTEM_IDS = ["wmata", "tokyo-metro", ...Object.keys(FETCHERS)];

// Generic refresh for fetcher-based systems: pull, store, record health.
// A fetcher returning null counts as a failure so /healthz notices dead feeds,
// and the last good data stays in KV rather than being overwritten.
async function refreshSystem(kv: KVNamespace, systemId: string): Promise<IncidentData> {
  const start = Date.now();
  let data: IncidentData | null = null;
  let error: Error | null = null;
  try {
    data = await FETCHERS[systemId]();
  } catch (e) {
    error = e as Error;
  }
  if (!data) {
    await kv.put(
      `_health:${systemId}`,
      JSON.stringify({
        lastPullAt: new Date().toISOString(),
        lastPullDurationMs: Date.now() - start,
        lastPullSuccess: false,
        lastError: error?.message || "Fetcher returned no data",
      })
    );
    throw error || new Error("Fetcher returned no data");
  }

  await kv.put(systemId, JSON.stringify(data));
  await kv.put(
    `_health:${systemId}`,
    JSON.stringify({
      lastPullAt: new Date().toISOString(),
      lastPullDurationMs: Date.now() - start,
      lastPullSuccess: true,
      lastError: null,
    })
  );
  console.log(
    `${systemId}: ${data.summary.activeAlerts ?? 0} alerts, ${data.summary.totalOutages} outages`
  );
  return data;
}

function refreshOne(env: Env, systemId: string): Promise<{ summary: unknown }> {
  if (systemId === "wmata") return refreshWmata(env.INCIDENTS_KV, env.WMATA_API_KEY);
  if (systemId === "tokyo-metro") return refreshTokyoMetro(env.INCIDENTS_KV, env.ODPT_CONSUMER_KEY);
  if (FETCHERS[systemId]) return refreshSystem(env.INCIDENTS_KV, systemId);
  return Promise.reject(new Error(`Unknown system: ${systemId}`));
}

async function refreshAll(env: Env): Promise<Record<string, unknown>> {
  const results = await Promise.allSettled(SYSTEM_IDS.map((id) => refreshOne(env, id)));
  const summary: Record<string, unknown> = {};
  for (const [i, result] of results.entries()) {
    const systemId = SYSTEM_IDS[i];
    if (result.status === "fulfilled") {
      summary[systemId] = { success: true, summary: result.value.summary };
    } else {
      summary[systemId] = {
        success: false,
        error: (result.reason as Error)?.message || "Unknown error",
      };
    }
  }
  return summary;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = {
      "Access-Control-Allow-Origin": env.CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // GET /healthz
    if (url.pathname === "/healthz" && request.method === "GET") {
      const systems: Record<string, unknown> = {};
      let allOk = true;
      for (const systemId of SYSTEM_IDS) {
        const data = (await env.INCIDENTS_KV.get(`_health:${systemId}`, "json")) as {
          lastPullAt: string;
          lastPullSuccess: boolean;
        } | null;
        if (data) {
          systems[systemId] = data;
          const age = Date.now() - new Date(data.lastPullAt).getTime();
          if (!data.lastPullSuccess || age > STALE_THRESHOLD_MS) {
            allOk = false;
          }
        }
      }

      return new Response(
        JSON.stringify({
          status: allOk ? "ok" : "degraded",
          timestamp: new Date().toISOString(),
          cronSchedule: CRON_SCHEDULE,
          systems,
        }),
        { headers }
      );
    }

    // GET /incidents/:systemId
    const incidentsMatch = url.pathname.match(/^\/incidents\/([a-z0-9-]+)$/);
    if (incidentsMatch && request.method === "GET") {
      const systemId = incidentsMatch[1];
      if (!SYSTEM_IDS.includes(systemId)) {
        return new Response(JSON.stringify({ error: `Unknown system: ${systemId}` }), {
          status: 404,
          headers,
        });
      }
      const data = await env.INCIDENTS_KV.get(systemId, "json");
      if (!data) {
        return new Response(JSON.stringify({ error: "No incident data available" }), {
          status: 404,
          headers,
        });
      }
      return new Response(JSON.stringify(data), { headers });
    }

    // GET /incidents/:systemId/:stationId
    const stationMatch = url.pathname.match(/^\/incidents\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
    if (stationMatch && request.method === "GET") {
      const [, systemId, stationId] = stationMatch;
      const data = (await env.INCIDENTS_KV.get(systemId, "json")) as {
        outagesByStation?: Record<string, UnitOutage[]>;
      } | null;
      const outages = data?.outagesByStation?.[stationId] || [];
      return new Response(JSON.stringify(outages), { headers });
    }

    // POST /refresh - Refresh all systems
    if (url.pathname === "/refresh" && request.method === "POST") {
      const summary = await refreshAll(env);
      const allSucceeded = Object.values(summary).every((s) => (s as { success: boolean }).success);
      return new Response(JSON.stringify({ success: allSucceeded, systems: summary }), {
        status: allSucceeded ? 200 : 207,
        headers,
      });
    }

    // POST /refresh/:systemId - Refresh a single system
    const refreshMatch = url.pathname.match(/^\/refresh\/([a-z0-9-]+)$/);
    if (refreshMatch && request.method === "POST") {
      const systemId = refreshMatch[1];
      if (!SYSTEM_IDS.includes(systemId)) {
        return new Response(JSON.stringify({ error: `Unknown system: ${systemId}` }), {
          status: 404,
          headers,
        });
      }
      try {
        const result = await refreshOne(env, systemId);
        return new Response(JSON.stringify({ success: true, summary: result.summary }), {
          headers,
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
          headers,
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    console.log("Running scheduled incident fetch for all systems...");
    const summary = await refreshAll(env);
    for (const [systemId, result] of Object.entries(summary)) {
      if (!(result as { success: boolean }).success) {
        console.error(`Failed to refresh ${systemId}:`, (result as { error?: string }).error);
      }
    }
  },
};

export default worker;
