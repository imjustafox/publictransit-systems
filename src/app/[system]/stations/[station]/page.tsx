import { notFound } from "next/navigation";
import Link from "next/link";
import { getSystem, getStation, getLines, getStationOutages, formatDate } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatBlock, StatGrid } from "@/components/ui/StatBlock";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { LineIndicatorGroup } from "@/components/transit/LineIndicator";
import { Terminal, TerminalLine, TerminalOutput } from "@/components/ui/Terminal";
import { StationMap } from "@/components/map";
import { OutageAlert } from "@/components/transit/OutageAlert";
import { formatTermini } from "@/lib/utils";

interface PageProps {
  params: Promise<{ system: string; station: string }>;
}

export default async function StationDetailPage({ params }: PageProps) {
  const { system: systemId, station: stationId } = await params;

  // Decode station ID if it's URL-encoded
  const decodedStationId = decodeURIComponent(stationId);

  const [system, station, lines, outages] = await Promise.all([
    getSystem(systemId),
    getStation(systemId, decodedStationId),
    getLines(systemId),
    getStationOutages(systemId, decodedStationId),
  ]).catch(() => notFound());

  if (!station) {
    notFound();
  }

  const stationLines = lines.filter((line) => station.lines.includes(line.id));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        <Link
          href={`/${systemId}/stations`}
          className="text-text-muted hover:text-accent-secondary"
        >
          Stations
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary truncate">{station.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-mono font-bold text-text-primary">{station.name}</h1>
            <StatusBadge status={station.status} />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <LineIndicatorGroup
              lines={stationLines}
              systemId={systemId}
              size="md"
              shape={system.lineIndicatorShape}
            />
          </div>
          {(station.opened || station.closedDate) && (
            <p className="text-sm text-text-muted">
              {station.opened && `Opened ${formatDate(station.opened)}`}
              {station.closedDate &&
                `${station.opened ? " • " : ""}Closed ${formatDate(station.closedDate)}`}
            </p>
          )}
        </div>
      </div>

      {/* Outage Alert */}
      {outages.length > 0 && <OutageAlert outages={outages} />}

      {/* Terminal Block */}
      <Terminal title={station.name}>
        <TerminalLine>
          query --station {station.name.toLowerCase().replace(/\s+/g, "-")}
        </TerminalLine>
        <TerminalOutput>Station ID: {station.id}</TerminalOutput>
        {station.coordinates && (
          <TerminalOutput>
            Coordinates: {station.coordinates.lat}, {station.coordinates.lng}
          </TerminalOutput>
        )}
        <TerminalOutput>Lines: {station.lines.join(", ")}</TerminalOutput>
        <TerminalLine prompt="✓">Station data loaded</TerminalLine>
      </Terminal>

      {/* Stats */}
      <Card>
        <StatGrid columns={station.coordinates ? 4 : 2}>
          <StatBlock label="Lines Served" value={station.lines.length} />
          <StatBlock label="Features" value={station.features.length} />
          {station.coordinates && (
            <>
              <StatBlock label="Latitude" value={station.coordinates.lat.toFixed(4)} />
              <StatBlock label="Longitude" value={station.coordinates.lng.toFixed(4)} />
            </>
          )}
        </StatGrid>
      </Card>

      {/* Description */}
      {(station.description || station.address) && (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            {station.description && (
              <p className="text-text-secondary leading-relaxed">{station.description}</p>
            )}
            {station.address && (
              <div className={station.description ? "mt-4 pt-4 border-t border-border" : ""}>
                <p className="text-sm text-text-muted">Address</p>
                <p className="text-text-primary font-mono">{station.address}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lines */}
      <Card>
        <CardHeader>
          <CardTitle>Lines at this Station</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stationLines.map((line) => (
              <Link
                key={line.id}
                href={`/${systemId}/lines/${line.id}`}
                className="flex items-center gap-3 p-2 -mx-2 rounded hover:bg-bg-tertiary transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-mono font-bold"
                  style={{ backgroundColor: line.colorHex }}
                >
                  {line.id.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-mono font-medium text-text-primary">{line.name}</p>
                  <p className="text-xs text-text-muted">{formatTermini(line)}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      {station.features.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Station Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {station.features.map((feature) => (
                <Badge key={feature} variant="outline">
                  {feature.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Map */}
      {station.coordinates && (
        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent>
            <StationMap
              station={
                station as typeof station & { coordinates: NonNullable<typeof station.coordinates> }
              }
              stationLines={stationLines}
            />
            <div className="mt-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-4 text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: stationLines[0]?.colorHex || "#00ff9d" }}
                  />
                  Station
                </span>
                {station.entrances && station.entrances.length > 0 && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rotate-45 border-2 border-white"
                        style={{ backgroundColor: "#00ff9d" }}
                      />
                      Elevator
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rotate-45 border-2 border-white"
                        style={{ backgroundColor: "#f59e0b" }}
                      />
                      Escalator
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rotate-45 border-2 border-white"
                        style={{ backgroundColor: "#737373" }}
                      />
                      Stairs
                    </span>
                  </>
                )}
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${station.coordinates.lat},${station.coordinates.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-secondary hover:underline"
              >
                Open in Google Maps →
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
