"use client";

import { Card } from "@/components/ui/Card";
import { StatBlock, StatGrid } from "@/components/ui/StatBlock";
import { MapPin, Train, Route, Layers } from "lucide-react";
import { useDistanceUnit } from "@/components/layout/DistanceUnitProvider";
import { convertDistance } from "@/lib/distance";
import type { DistanceUnit } from "@/lib/types";

interface SystemStats {
  totalStations: number;
  totalLines: number;
  trackLength: number;
  distanceUnit: DistanceUnit;
}

interface GlobalStatsProps {
  systems: SystemStats[];
}

export function GlobalStats({ systems }: GlobalStatsProps) {
  const { unit: displayUnit } = useDistanceUnit();

  const totalStations = systems.reduce((sum, s) => sum + s.totalStations, 0);
  const totalLines = systems.reduce((sum, s) => sum + s.totalLines, 0);

  // Convert all track lengths to the display unit and sum
  const totalTrackLength = systems.reduce((sum, s) => {
    return sum + convertDistance(s.trackLength, s.distanceUnit, displayUnit);
  }, 0);

  return (
    <Card elevated glow>
      <h2 className="text-xl font-mono font-semibold text-text-primary mb-6 flex items-center gap-2">
        <span className="text-accent-primary">$</span> Global Network Statistics
      </h2>
      <StatGrid columns={4}>
        <StatBlock
          label="Total Stations"
          value={totalStations}
          icon={<MapPin className="w-4 h-4" />}
        />
        <StatBlock label="Total Lines" value={totalLines} icon={<Train className="w-4 h-4" />} />
        <StatBlock
          label="Track Length"
          value={Math.round(totalTrackLength)}
          unit={displayUnit}
          icon={<Route className="w-4 h-4" />}
        />
        <StatBlock label="Systems" value={systems.length} icon={<Layers className="w-4 h-4" />} />
      </StatGrid>
    </Card>
  );
}
