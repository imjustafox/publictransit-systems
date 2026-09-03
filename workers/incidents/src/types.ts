// Incident shapes shared by every system module. These mirror the app's
// src/lib/types.ts definitions; the app consumes worker responses as-is.

export interface UnitOutage {
  unitName: string;
  unitType: "elevator" | "escalator";
  location: string;
  symptom: string;
  outOfServiceSince: string;
  estimatedReturn: string | null;
  updatedAt: string;
}

export interface ServiceAlert {
  id: string;
  type: "delay" | "emergency" | "advisory";
  title: string;
  description: string;
  affectedLines?: string[];
  affectedStations?: string[];
  postedAt: string;
  expiresAt: string | null;
}

export interface IncidentData {
  fetchedAt: string;
  systemId: string;
  summary: {
    totalOutages: number;
    elevatorOutages: number;
    escalatorOutages: number;
    stationsAffected: number;
    activeAlerts?: number;
  };
  alerts?: ServiceAlert[];
  outagesByStation: Record<string, UnitOutage[]>;
}
