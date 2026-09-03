"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatBlock } from "@/components/ui/StatBlock";
import { useDistanceUnit } from "@/components/layout/DistanceUnitProvider";
import { convertDistance } from "@/lib/distance";
import type { TransitSystem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SystemCardProps {
  system: TransitSystem;
  className?: string;
}

export function SystemCard({ system, className }: SystemCardProps) {
  const { unit: displayUnit } = useDistanceUnit();
  const trackLength = convertDistance(
    system.stats.trackLength,
    system.stats.distanceUnit,
    displayUnit
  );

  return (
    <Link href={`/${system.id}`}>
      <Card hover className={cn("h-full", className)}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-mono font-semibold text-text-primary mb-1">
              {system.shortName}
            </h2>
            <p className="text-sm text-text-muted">{system.location}</p>
          </div>
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: system.colors.primary }}
          />
        </div>

        <p className="text-sm text-text-secondary mb-4 line-clamp-2">{system.overview}</p>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
          <StatBlock label="Stations" value={system.stats.totalStations} />
          <StatBlock label="Lines" value={system.stats.totalLines} />
          <StatBlock label="Track Length" value={Math.round(trackLength)} unit={displayUnit} />
          <StatBlock label="Daily Riders" value={system.stats.dailyRidership} />
        </div>
      </Card>
    </Link>
  );
}
