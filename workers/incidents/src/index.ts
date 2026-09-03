/**
 * Transit Incidents Worker
 *
 * Unified worker that fetches incident data from multiple transit APIs
 * on a schedule and serves it via HTTP from KV storage.
 *
 * Systems:
 *   - WMATA (elevator/escalator outages)
 *   - Tokyo Metro (service alerts via ODPT)
 *
 * Endpoints:
 *   GET /healthz                      - Worker health check
 *   GET /incidents/wmata              - All WMATA incidents
 *   GET /incidents/wmata/:stationId   - WMATA incidents for a station
 *   GET /incidents/tokyo-metro        - Tokyo Metro service alerts
 *   POST /refresh                     - Refresh all systems
 *   POST /refresh/:systemId           - Refresh a single system
 */

import { refreshWmata, type WmataIncidentData } from "./systems/wmata";
import { refreshTokyoMetro } from "./systems/tokyo-metro";

export interface Env {
  INCIDENTS_KV: KVNamespace;
  WMATA_API_KEY: string;
  ODPT_CONSUMER_KEY: string;
  CORS_ORIGIN: string;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(env.CORS_ORIGIN);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // GET /healthz
    if (url.pathname === "/healthz" && request.method === "GET") {
      const SYSTEM_IDS = ["wmata", "tokyo-metro"];
      const systems: Record<string, unknown> = {};
      const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2x cron interval (1h)

      let allOk = true;
      for (const systemId of SYSTEM_IDS) {
        const data = (await env.INCIDENTS_KV.get(`_health:${systemId}`, "json")) as {
          lastPullAt: string;
          lastPullDurationMs: number;
          lastPullSuccess: boolean;
          lastError: string | null;
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
          cronSchedule: "0 * * * *",
          systems,
        }),
        { headers }
      );
    }

    // GET /incidents/wmata
    if (url.pathname === "/incidents/wmata" && request.method === "GET") {
      const data = await env.INCIDENTS_KV.get("wmata", "json");
      if (!data) {
        return new Response(JSON.stringify({ error: "No incident data available" }), {
          status: 404,
          headers,
        });
      }
      return new Response(JSON.stringify(data), { headers });
    }

    // GET /incidents/wmata/:stationId
    const stationMatch = url.pathname.match(/^\/incidents\/wmata\/([a-z0-9-]+)$/);
    if (stationMatch && request.method === "GET") {
      const stationId = stationMatch[1];
      const data = (await env.INCIDENTS_KV.get("wmata", "json")) as WmataIncidentData | null;
      if (!data) {
        return new Response(JSON.stringify([]), { headers });
      }
      const outages = data.outagesByStation[stationId] || [];
      return new Response(JSON.stringify(outages), { headers });
    }

    // GET /incidents/tokyo-metro
    if (url.pathname === "/incidents/tokyo-metro" && request.method === "GET") {
      const data = await env.INCIDENTS_KV.get("tokyo-metro", "json");
      if (!data) {
        return new Response(JSON.stringify({ error: "No incident data available" }), {
          status: 404,
          headers,
        });
      }
      return new Response(JSON.stringify(data), { headers });
    }

    // POST /refresh - Refresh all systems
    if (url.pathname === "/refresh" && request.method === "POST") {
      const results = await Promise.allSettled([
        refreshWmata(env.INCIDENTS_KV, env.WMATA_API_KEY),
        refreshTokyoMetro(env.INCIDENTS_KV, env.ODPT_CONSUMER_KEY),
      ]);

      const summary: Record<string, unknown> = {};
      for (const [i, result] of results.entries()) {
        const system = i === 0 ? "wmata" : "tokyo-metro";
        if (result.status === "fulfilled") {
          summary[system] = { success: true, summary: result.value.summary };
        } else {
          summary[system] = { success: false, error: result.reason?.message || "Unknown error" };
        }
      }

      const allSucceeded = results.every((r) => r.status === "fulfilled");
      return new Response(JSON.stringify({ success: allSucceeded, systems: summary }), {
        status: allSucceeded ? 200 : 207,
        headers,
      });
    }

    // POST /refresh/:systemId - Refresh a single system
    const refreshMatch = url.pathname.match(/^\/refresh\/([a-z-]+)$/);
    if (refreshMatch && request.method === "POST") {
      const systemId = refreshMatch[1];
      try {
        let result;
        if (systemId === "wmata") {
          result = await refreshWmata(env.INCIDENTS_KV, env.WMATA_API_KEY);
        } else if (systemId === "tokyo-metro") {
          result = await refreshTokyoMetro(env.INCIDENTS_KV, env.ODPT_CONSUMER_KEY);
        } else {
          return new Response(JSON.stringify({ error: `Unknown system: ${systemId}` }), {
            status: 404,
            headers,
          });
        }
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

    const results = await Promise.allSettled([
      refreshWmata(env.INCIDENTS_KV, env.WMATA_API_KEY),
      refreshTokyoMetro(env.INCIDENTS_KV, env.ODPT_CONSUMER_KEY),
    ]);

    for (const [i, result] of results.entries()) {
      const system = i === 0 ? "WMATA" : "Tokyo Metro";
      if (result.status === "rejected") {
        console.error(`Failed to fetch ${system} incidents:`, result.reason);
      }
    }
  },
};

export default worker;
