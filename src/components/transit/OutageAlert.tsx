import type { UnitOutage } from "@/lib/types";

interface OutageAlertProps {
  outages: UnitOutage[];
}

export function OutageAlert({ outages }: OutageAlertProps) {
  if (outages.length === 0) return null;

  const elevatorOutages = outages.filter((o) => o.unitType === "elevator");
  const escalatorOutages = outages.filter((o) => o.unitType === "escalator");

  return (
    <div className="rounded-lg border border-status-construction/50 bg-status-construction/10 p-4">
      <div className="flex items-start gap-3">
        <div className="text-status-construction text-xl">⚠</div>
        <div className="flex-1">
          <h2 className="font-mono font-semibold text-status-construction">Service Alert</h2>
          <p className="text-sm text-text-secondary mt-1">
            {elevatorOutages.length > 0 && (
              <span>
                {elevatorOutages.length} elevator
                {elevatorOutages.length !== 1 ? "s" : ""} out of service
                {escalatorOutages.length > 0 ? ", " : ""}
              </span>
            )}
            {escalatorOutages.length > 0 && (
              <span>
                {escalatorOutages.length} escalator
                {escalatorOutages.length !== 1 ? "s" : ""} out of service
              </span>
            )}
          </p>

          <div className="mt-3 space-y-2">
            {outages.map((outage) => (
              <div key={outage.unitName} className="text-sm bg-bg-tertiary rounded p-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      outage.unitType === "elevator" ? "bg-status-closed" : "bg-status-construction"
                    }`}
                  />
                  <span className="font-mono text-text-primary">
                    {outage.unitType === "elevator" ? "Elevator" : "Escalator"}
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-muted">{outage.unitName}</span>
                </div>
                <p className="text-text-secondary mt-1 ml-4">{outage.location}</p>
                {outage.estimatedReturn && (
                  <p className="text-text-muted text-xs mt-1 ml-4">
                    Est. return: {new Date(outage.estimatedReturn).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface OutageBadgeProps {
  outages: UnitOutage[];
}

export function OutageBadge({ outages }: OutageBadgeProps) {
  if (outages.length === 0) return null;

  const hasElevatorOutage = outages.some((o) => o.unitType === "elevator");

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
        hasElevatorOutage
          ? "bg-status-closed/20 text-status-closed"
          : "bg-status-construction/20 text-status-construction"
      }`}
    >
      <span>⚠</span>
      {outages.length} outage{outages.length !== 1 ? "s" : ""}
    </span>
  );
}
