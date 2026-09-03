"use client";

import { Card } from "@/components/ui/Card";
import { StatBlock, StatGrid } from "@/components/ui/StatBlock";
import { useDistanceUnit } from "@/components/layout/DistanceUnitProvider";
import { convertDistance } from "@/lib/distance";
import type { DistanceUnit } from "@/lib/types";

interface SystemStatsProps {
  totalStations: number;
  totalLines: number;
  trackLength: number;
  sourceUnit: DistanceUnit;
  dailyRidership: string;
}

export function SystemStats({
  totalStations,
  totalLines,
  trackLength,
  sourceUnit,
  dailyRidership,
}: SystemStatsProps) {
  const { unit: displayUnit } = useDistanceUnit();
  const convertedLength = convertDistance(trackLength, sourceUnit, displayUnit);

  return (
    <Card>
      <StatGrid columns={4}>
        <StatBlock label="Stations" value={totalStations} />
        <StatBlock label="Lines" value={totalLines} />
        <StatBlock label="Track Length" value={convertedLength.toFixed(1)} unit={displayUnit} />
        <StatBlock label="Daily Ridership" value={dailyRidership} />
      </StatGrid>
    </Card>
  );
}
