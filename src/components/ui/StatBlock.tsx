import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatBlockProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: number;
  icon?: ReactNode;
  className?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatBlock({ label, value, unit, change, icon, className, trend }: StatBlockProps) {
  const formattedValue = typeof value === "number" ? value.toLocaleString() : value;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        {icon && <div className="text-accent-primary">{icon}</div>}
        <p className="text-xs font-mono uppercase tracking-wider text-text-muted">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl sm:text-3xl font-mono font-semibold text-accent-primary tabular-nums">
          {formattedValue}
          {unit && <span className="text-base text-text-muted ml-1">{unit}</span>}
        </p>
        {change !== undefined && (
          <span
            className={cn(
              "text-xs font-mono",
              trend === "up" && "text-status-active",
              trend === "down" && "text-status-closed",
              trend === "neutral" && "text-text-muted"
            )}
          >
            {change > 0 ? "▲" : change < 0 ? "▼" : "●"} {Math.abs(change)}%
          </span>
        )}
      </div>
    </div>
  );
}

interface StatGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatGrid({ children, columns = 4, className }: StatGridProps) {
  const gridClasses = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4",
  };

  return <div className={cn("grid gap-6", gridClasses[columns], className)}>{children}</div>;
}
