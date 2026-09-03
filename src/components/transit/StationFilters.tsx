"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Line } from "@/lib/types";

interface StationFiltersProps {
  systemId: string;
  lines: Line[];
  currentStatus?: string;
  currentLine?: string;
  totalStations: number;
  filteredCount: number;
}

export function StationFilters({
  systemId,
  lines,
  currentStatus,
  currentLine,
  totalStations,
  filteredCount,
}: StationFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/${systemId}/stations?${params.toString()}`);
  };

  const statuses = [
    { value: "active", label: "Active" },
    { value: "closed", label: "Closed" },
    { value: "under-construction", label: "Under Construction" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-text-muted">Status:</span>
          <div className="flex gap-1">
            <button
              onClick={() => updateFilter("status", null)}
              className={cn(
                "px-2 py-1 text-xs font-mono rounded border transition-colors",
                !currentStatus
                  ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                  : "bg-bg-tertiary border-border text-text-secondary hover:border-border-hover"
              )}
            >
              All
            </button>
            {statuses.map((status) => (
              <button
                key={status.value}
                onClick={() => updateFilter("status", status.value)}
                className={cn(
                  "px-2 py-1 text-xs font-mono rounded border transition-colors",
                  currentStatus === status.value
                    ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                    : "bg-bg-tertiary border-border text-text-secondary hover:border-border-hover"
                )}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>

        {/* Line Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-text-muted">Line:</span>
          <select
            aria-label="Filter stations by line"
            value={currentLine || ""}
            onChange={(e) => updateFilter("line", e.target.value || null)}
            className="px-2 py-1 text-xs font-mono rounded border border-border bg-bg-tertiary text-text-primary focus:border-accent-primary outline-none"
          >
            <option value="">All Lines</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results count */}
      {(currentStatus || currentLine) && (
        <p className="text-sm text-text-muted font-mono">
          Showing {filteredCount} of {totalStations} stations
        </p>
      )}
    </div>
  );
}
