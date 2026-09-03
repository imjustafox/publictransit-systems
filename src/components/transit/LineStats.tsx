"use client";

import { Card } from "@/components/ui/Card";
import { StatBlock, StatGrid } from "@/components/ui/StatBlock";
import { useDistanceUnit } from "@/components/layout/DistanceUnitProvider";
import { convertDistance } from "@/lib/distance";
import type { DistanceUnit } from "@/lib/types";

interface LineStatsProps {
  length: number;
  sourceUnit: DistanceUnit;
  stationCount: number;
  status: string;
  colorHex: string;
}

export function LineStats({ length, sourceUnit, stationCount, status, colorHex }: LineStatsProps) {
  const { unit: displayUnit } = useDistanceUnit();
  const convertedLength = convertDistance(length, sourceUnit, displayUnit);

  return (
    <Card>
      <StatGrid columns={4}>
        <StatBlock label="Length" value={convertedLength.toFixed(1)} unit={displayUnit} />
        <StatBlock label="Stations" value={stationCount} />
        <StatBlock label="Status" value={status.toUpperCase()} />
        <StatBlock label="Color Code" value={colorHex} />
      </StatGrid>
    </Card>
  );
}
