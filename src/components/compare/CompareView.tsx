"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { useDistanceUnit } from "@/components/layout/DistanceUnitProvider";
import { convertDistance } from "@/lib/distance";
import type { TransitSystem } from "@/lib/types";

interface CompareViewProps {
  systems: TransitSystem[];
}

export function CompareView({ systems }: CompareViewProps) {
  const [selected, setSelected] = useState<string[]>(
    systems.slice(0, Math.min(2, systems.length)).map((s) => s.id)
  );

  const toggleSystem = (systemId: string) => {
    setSelected((prev) => {
      if (prev.includes(systemId)) {
        return prev.filter((id) => id !== systemId);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), systemId];
      }
      return [...prev, systemId];
    });
  };

  const selectedSystems = systems.filter((s) => selected.includes(s.id));
  const { unit: displayUnit } = useDistanceUnit();

  const comparisonFields = [
    { key: "location", label: "Location", getValue: (s: TransitSystem) => s.location },
    {
      key: "opened",
      label: "Opened",
      getValue: (s: TransitSystem) => new Date(s.opened).getFullYear().toString(),
    },
    {
      key: "stations",
      label: "Stations",
      getValue: (s: TransitSystem) => s.stats.totalStations.toString(),
    },
    { key: "lines", label: "Lines", getValue: (s: TransitSystem) => s.stats.totalLines.toString() },
    {
      key: "trackLength",
      label: `Track Length (${displayUnit})`,
      getValue: (s: TransitSystem) =>
        convertDistance(s.stats.trackLength, s.stats.distanceUnit, displayUnit).toFixed(1),
    },
    {
      key: "dailyRidership",
      label: "Daily Ridership",
      getValue: (s: TransitSystem) => s.stats.dailyRidership,
    },
    {
      key: "annualRidership",
      label: "Annual Ridership",
      getValue: (s: TransitSystem) => s.stats.annualRidership,
    },
  ];

  return (
    <div className="space-y-6">
      {/* System Selector */}
      <Card>
        <p className="text-sm text-text-muted mb-3 font-mono">Select up to 3 systems to compare</p>
        <div className="flex flex-wrap gap-2">
          {systems.map((system) => (
            <button
              key={system.id}
              onClick={() => toggleSystem(system.id)}
              className={cn(
                "px-3 py-2 rounded-lg border font-mono text-sm transition-colors",
                selected.includes(system.id)
                  ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                  : "bg-bg-tertiary border-border text-text-secondary hover:border-border-hover"
              )}
            >
              {system.shortName}
            </button>
          ))}
        </div>
      </Card>

      {/* Comparison Table */}
      {selectedSystems.length > 0 ? (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-mono text-xs uppercase tracking-wider text-text-muted">
                  Metric
                </th>
                {selectedSystems.map((system) => (
                  <th key={system.id} className="text-left py-3 px-4 font-mono text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: system.colors.primary }}
                      />
                      <span className="text-text-primary">{system.shortName}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonFields.map((field) => (
                <tr key={field.key} className="border-b border-border/50">
                  <td className="py-3 px-4 font-mono text-sm text-text-muted">{field.label}</td>
                  {selectedSystems.map((system) => {
                    const value = field.getValue(system);
                    const numValue = parseInt(value.replace(/[^0-9]/g, ""));
                    const maxValue = Math.max(
                      ...selectedSystems.map(
                        (s) => parseInt(field.getValue(s).replace(/[^0-9]/g, "")) || 0
                      )
                    );
                    const isMax = !isNaN(numValue) && numValue === maxValue && maxValue > 0;

                    return (
                      <td
                        key={system.id}
                        className={cn(
                          "py-3 px-4 font-mono text-sm",
                          isMax ? "text-accent-primary font-semibold" : "text-text-primary"
                        )}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="text-center py-12 text-text-muted font-mono">
          <p>Select at least one system to compare</p>
        </div>
      )}

      {/* Visual Comparison */}
      {selectedSystems.length > 1 && (
        <Card>
          <h2 className="font-mono font-semibold text-text-primary mb-4">Stations Comparison</h2>
          <div className="space-y-3">
            {selectedSystems.map((system) => {
              const maxStations = Math.max(...selectedSystems.map((s) => s.stats.totalStations));
              const percentage = (system.stats.totalStations / maxStations) * 100;

              return (
                <div key={system.id} className="space-y-1">
                  <div className="flex justify-between text-sm font-mono">
                    <span className="text-text-secondary">{system.shortName}</span>
                    <span className="text-accent-primary">{system.stats.totalStations}</span>
                  </div>
                  <div className="h-4 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: system.colors.primary,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
