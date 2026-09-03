/**
 * Tokyo Metro incident fetching and processing
 *
 * Fetches train operation information from the ODPT API
 * and maps alerts to our line IDs.
 */

// ODPT railway suffix → our line ID
const RAILWAY_LINE_MAP: Record<string, string> = {
  Ginza: "ginza",
  Marunouchi: "marunouchi",
  Hibiya: "hibiya",
  Tozai: "tozai",
  Chiyoda: "chiyoda",
  Yurakucho: "yurakucho",
  Hanzomon: "hanzomon",
  Namboku: "namboku",
  Fukutoshin: "fukutoshin",
};

interface ODPTTrainInformation {
  "odpt:railway": string;
  "odpt:trainInformationStatus"?: { ja?: string; en?: string };
  "odpt:trainInformationText"?: { ja?: string; en?: string };
  "odpt:timeOfOrigin"?: string;
  "dct:valid"?: string;
}

interface ServiceAlert {
  id: string;
  type: "delay" | "emergency" | "advisory";
  title: string;
  description: string;
  affectedLines: string[];
  affectedStations: string[];
  postedAt: string;
  expiresAt: string | null;
}

export interface TokyoMetroIncidentData {
  fetchedAt: string;
  systemId: string;
  summary: {
    totalOutages: number;
    elevatorOutages: number;
    escalatorOutages: number;
    stationsAffected: number;
    activeAlerts: number;
  };
  alerts: ServiceAlert[];
  outagesByStation: Record<string, never[]>;
}

function extractLineId(railway: string): string | null {
  // odpt:railway = "odpt.Railway:TokyoMetro.Ginza" → "Ginza"
  const parts = railway.split(".");
  const suffix = parts[parts.length - 1];
  return RAILWAY_LINE_MAP[suffix] ?? null;
}

function mapAlertType(status?: { ja?: string; en?: string }): ServiceAlert["type"] {
  if (!status) return "advisory";
  const ja = status.ja || "";
  const en = (status.en || "").toLowerCase();

  if (ja.includes("運転見合わせ") || en.includes("suspend")) return "emergency";
  if (ja.includes("遅延") || en.includes("delay")) return "delay";
  return "advisory";
}

async function fetchODPTTrainInfo(consumerKey: string): Promise<ODPTTrainInformation[]> {
  const url = `https://api.odpt.org/api/v4/odpt:TrainInformation?acl:consumerKey=${consumerKey}&odpt:operator=odpt.Operator:TokyoMetro`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ODPT API error: ${response.status}`);
  }

  return (await response.json()) as ODPTTrainInformation[];
}

function processTrainInfo(entries: ODPTTrainInformation[]): TokyoMetroIncidentData {
  const alerts: ServiceAlert[] = [];

  for (const entry of entries) {
    if (!entry["odpt:trainInformationStatus"]) continue;

    const lineId = extractLineId(entry["odpt:railway"]);
    if (!lineId) continue;

    const text = entry["odpt:trainInformationText"] || {};
    const title = text.en || text.ja || "Service disruption";
    const description = text.ja || "";

    alerts.push({
      id: `tokyo-metro-${lineId}-${Date.now()}`,
      type: mapAlertType(entry["odpt:trainInformationStatus"]),
      title,
      description,
      affectedLines: [lineId],
      affectedStations: [],
      postedAt: entry["odpt:timeOfOrigin"] || new Date().toISOString(),
      expiresAt: entry["dct:valid"] || null,
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    systemId: "tokyo-metro",
    summary: {
      totalOutages: 0,
      elevatorOutages: 0,
      escalatorOutages: 0,
      stationsAffected: 0,
      activeAlerts: alerts.length,
    },
    alerts,
    outagesByStation: {},
  };
}

export async function refreshTokyoMetro(
  kv: KVNamespace,
  consumerKey: string
): Promise<TokyoMetroIncidentData> {
  const start = Date.now();
  let entries: ODPTTrainInformation[];
  try {
    entries = await fetchODPTTrainInfo(consumerKey);
  } catch (error) {
    await kv.put(
      "_health:tokyo-metro",
      JSON.stringify({
        lastPullAt: new Date().toISOString(),
        lastPullDurationMs: Date.now() - start,
        lastPullSuccess: false,
        lastError: (error as Error).message,
      })
    );
    throw error;
  }

  const data = processTrainInfo(entries);
  await kv.put("tokyo-metro", JSON.stringify(data));
  await kv.put(
    "_health:tokyo-metro",
    JSON.stringify({
      lastPullAt: new Date().toISOString(),
      lastPullDurationMs: Date.now() - start,
      lastPullSuccess: true,
      lastError: null,
    })
  );
  console.log(`Tokyo Metro: ${data.summary.activeAlerts} active alerts`);
  return data;
}
