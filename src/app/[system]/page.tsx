import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getSystem,
  getLines,
  getStations,
  getRailcars,
  getIncidents,
  formatDate,
} from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Terminal, TerminalLine, TerminalOutput } from "@/components/ui/Terminal";
import { Badge } from "@/components/ui/Badge";
import { LineIndicator } from "@/components/transit/LineIndicator";
import { StationCard } from "@/components/transit/StationCard";
import { RailcarCard } from "@/components/transit/RailcarCard";
import { SystemStats } from "@/components/transit/SystemStats";
import { LineLength } from "@/components/transit/LineLength";
import { formatTermini } from "@/lib/utils";

interface PageProps {
  params: Promise<{ system: string }>;
}

export default async function SystemPage({ params }: PageProps) {
  const { system: systemId } = await params;

  const [system, lines, stations, railcars, incidents] = await Promise.all([
    getSystem(systemId),
    getLines(systemId),
    getStations(systemId),
    getRailcars(systemId),
    getIncidents(systemId),
  ]).catch(() => notFound());

  const activeStations = stations.filter((s) => s.status === "active").length;
  const activeRailcars = railcars.filter((r) => r.status === "active");
  const alerts = incidents?.alerts || [];
  const hasOutages = incidents && incidents.summary.totalOutages > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="space-y-4">
        <Terminal title={systemId}>
          <TerminalLine>fetch --system {systemId}</TerminalLine>
          <TerminalOutput>Loading {system.shortName} data...</TerminalOutput>
          <TerminalLine prompt="✓">Connected to {system.name}</TerminalLine>
        </Terminal>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-mono font-bold text-text-primary mb-2">
              {system.shortName}
            </h1>
            <p className="text-text-secondary">{system.name}</p>
            <p className="text-sm text-text-muted mt-1">
              {system.location} • Opened {formatDate(system.opened)}
            </p>
          </div>
          <div
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: system.colors.primary }}
          />
        </div>
      </section>

      {/* Stats */}
      <section>
        <SystemStats
          totalStations={system.stats.totalStations}
          totalLines={system.stats.totalLines}
          trackLength={system.stats.trackLength}
          sourceUnit={system.stats.distanceUnit}
          dailyRidership={system.stats.dailyRidership}
        />
      </section>

      {/* Service Alerts */}
      {(alerts.length > 0 || hasOutages) && (
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-status-construction"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Service Alerts
                </CardTitle>
                {incidents && (
                  <div className="flex items-center gap-2 text-sm">
                    {incidents.summary.activeAlerts !== undefined &&
                      incidents.summary.activeAlerts > 0 && (
                        <Badge variant="warning">
                          {incidents.summary.activeAlerts} alert
                          {incidents.summary.activeAlerts !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    {incidents.summary.totalOutages > 0 && (
                      <Badge variant="error">
                        {incidents.summary.totalOutages} outage
                        {incidents.summary.totalOutages !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex gap-3">
                    <div className="shrink-0 mt-0.5">
                      {alert.type === "emergency" ? (
                        <span className="block w-2 h-2 rounded-full bg-status-closed" />
                      ) : alert.type === "delay" ? (
                        <span className="block w-2 h-2 rounded-full bg-status-construction" />
                      ) : (
                        <span className="block w-2 h-2 rounded-full bg-accent-secondary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{alert.title}</p>
                      <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                        {alert.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge
                          variant={
                            alert.type === "emergency"
                              ? "error"
                              : alert.type === "delay"
                                ? "warning"
                                : "info"
                          }
                          size="sm"
                        >
                          {alert.type}
                        </Badge>
                        {alert.affectedLines && alert.affectedLines.length > 0 && (
                          <span className="text-xs text-text-muted">
                            {alert.affectedLines.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {alerts.length > 5 && (
                  <p className="text-xs text-text-muted pt-2 border-t border-border">
                    + {alerts.length - 5} more alert{alerts.length - 5 !== 1 ? "s" : ""}
                  </p>
                )}
                {hasOutages && alerts.length === 0 && (
                  <p className="text-sm text-text-secondary">
                    {incidents.summary.elevatorOutages > 0 && (
                      <span>
                        {incidents.summary.elevatorOutages} elevator
                        {incidents.summary.elevatorOutages !== 1 ? "s" : ""} out of service.{" "}
                      </span>
                    )}
                    {incidents.summary.escalatorOutages > 0 && (
                      <span>
                        {incidents.summary.escalatorOutages} escalator
                        {incidents.summary.escalatorOutages !== 1 ? "s" : ""} out of service.{" "}
                      </span>
                    )}
                    <span className="text-text-muted">
                      {incidents.summary.stationsAffected} station
                      {incidents.summary.stationsAffected !== 1 ? "s" : ""} affected.
                    </span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Overview */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-secondary leading-relaxed">{system.overview}</p>
            {system.website && (
              <a
                href={system.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-4 text-sm text-accent-secondary hover:underline"
              >
                Visit official website
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Lines */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-mono font-semibold text-text-primary">Lines</h2>
          <Link
            href={`/${systemId}/lines`}
            className="text-sm text-accent-secondary hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lines.map((line) => (
            <Link key={line.id} href={`/${systemId}/lines/${line.id}`}>
              <Card hover className="flex items-center gap-3">
                <LineIndicator
                  line={line}
                  size="lg"
                  shape={system.lineIndicatorShape}
                  linkable={false}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-medium text-text-primary truncate">{line.name}</p>
                  <p className="text-xs text-text-muted truncate">{formatTermini(line)}</p>
                </div>
                <span className="text-xs font-mono text-text-muted shrink-0">
                  <LineLength length={line.length} sourceUnit={system.stats.distanceUnit} />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Stations */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-mono font-semibold text-text-primary">Featured Stations</h2>
          <Link
            href={`/${systemId}/stations`}
            className="text-sm text-accent-secondary hover:underline"
          >
            View all {activeStations} stations →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stations.slice(0, 6).map((station) => (
            <StationCard
              key={station.id}
              station={station}
              systemId={systemId}
              lines={lines}
              lineIndicatorShape={system.lineIndicatorShape}
              compact
            />
          ))}
        </div>
      </section>

      {/* Railcars */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-mono font-semibold text-text-primary">Railcar Fleet</h2>
          <Link
            href={`/${systemId}/railcars`}
            className="text-sm text-accent-secondary hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeRailcars.slice(0, 3).map((railcar) => (
            <RailcarCard key={railcar.id} railcar={railcar} systemId={systemId} />
          ))}
        </div>
      </section>

      {/* History Preview */}
      {system.history && system.history.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-mono font-semibold text-text-primary">History</h2>
            <Link
              href={`/${systemId}/history`}
              className="text-sm text-accent-secondary hover:underline"
            >
              Full timeline →
            </Link>
          </div>
          <Card>
            <div className="space-y-4">
              {system.history.slice(0, 3).map((event, idx) => (
                <div key={idx} className={idx > 0 ? "pt-4 border-t border-border" : ""}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-accent-primary shrink-0">
                      {formatDate(event.date)}
                    </span>
                    <div>
                      <p className="font-medium text-text-primary">{event.title}</p>
                      <p className="text-sm text-text-secondary mt-1">{event.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
