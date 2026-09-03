import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { RailcarGeneration } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RailcarCardProps {
  railcar: RailcarGeneration;
  systemId: string;
  className?: string;
}

export function RailcarCard({ railcar, systemId, className }: RailcarCardProps) {
  const statusVariant = {
    active: "success" as const,
    retired: "error" as const,
    testing: "warning" as const,
  }[railcar.status];

  return (
    <Link href={`/${systemId}/railcars/${railcar.id}`}>
      <Card hover className={cn("h-full", className)}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="font-mono font-semibold text-text-primary">{railcar.name}</h2>
          <Badge variant={statusVariant}>{railcar.status.toUpperCase()}</Badge>
        </div>

        <p className="text-sm text-text-muted mb-3">
          {railcar.manufacturer} • {railcar.introduced}
          {railcar.retired && ` - ${railcar.retired}`}
        </p>

        <p className="text-sm text-text-secondary mb-4 line-clamp-2">{railcar.description}</p>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-3 border-t border-border">
          <div>
            <span className="text-text-muted">Count:</span>{" "}
            <span className="text-accent-primary">{railcar.count}</span>
          </div>
          <div>
            <span className="text-text-muted">Capacity:</span>{" "}
            <span className="text-accent-primary">{railcar.specs.capacity}</span>
          </div>
          <div>
            <span className="text-text-muted">Length:</span>{" "}
            <span className="text-text-primary">{railcar.specs.length}</span>
          </div>
          <div>
            <span className="text-text-muted">Max Speed:</span>{" "}
            <span className="text-text-primary">{railcar.specs.maxSpeed}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
