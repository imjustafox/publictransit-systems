"use client";

import dynamic from "next/dynamic";
import type { Station, Line, Coordinates } from "@/lib/types";

const StationMapClient = dynamic(
  () => import("./StationMapClient").then((mod) => mod.StationMapClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-bg-tertiary">
        <div className="text-center font-mono text-text-muted">
          <div className="mb-2">Loading map...</div>
        </div>
      </div>
    ),
  }
);

// Station with coordinates required for map rendering
type StationWithCoordinates = Omit<Station, "coordinates"> & { coordinates: Coordinates };

export interface GeometryOverlay {
  lineId: string;
  color: string;
  shapes: [number, number][][];
}

interface StationMapProps {
  station: StationWithCoordinates;
  stationLines: Line[];
  geometryOverlays?: GeometryOverlay[];
}

export function StationMap({ station, stationLines, geometryOverlays }: StationMapProps) {
  return (
    <div className="aspect-video overflow-hidden rounded-lg border border-border">
      <StationMapClient
        station={station}
        stationLines={stationLines}
        geometryOverlays={geometryOverlays}
      />
    </div>
  );
}
