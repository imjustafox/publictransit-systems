import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getSystem,
  getLine,
  getLines,
  getStationsByLine,
  getLineGeometry,
  formatDate,
} from "@/lib/data";
import type { Station, TransitNetwork } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { StationCard } from "@/components/transit/StationCard";
import { Badge } from "@/components/ui/Badge";
import { LineStats } from "@/components/transit/LineStats";
import { LineMap } from "@/components/map/LineMap";
import { formatTermini } from "@/lib/utils";

interface LineDetailContentProps {
  systemId: string;
  lineId: string;
  // Present when the page is scoped under a network URL; changes only the breadcrumb.
  network?: TransitNetwork;
}

// Greedy nearest-neighbor chain, starting from the station farthest from the
// centroid (an endpoint on any roughly linear route).
function orderByProximity(stations: Station[]): Station[] {
  if (stations.length < 3) return stations;
  const dist2 = (a: Station, b: Station) =>
    (a.coordinates!.lat - b.coordinates!.lat) ** 2 + (a.coordinates!.lng - b.coordinates!.lng) ** 2;
  const cLat = stations.reduce((sum, s) => sum + s.coordinates!.lat, 0) / stations.length;
  const cLng = stations.reduce((sum, s) => sum + s.coordinates!.lng, 0) / stations.length;
  const centroid = { coordinates: { lat: cLat, lng: cLng } } as Station;
  let current = stations.reduce((far, s) => (dist2(s, centroid) > dist2(far, centroid) ? s : far));
  const remaining = new Set(stations.filter((s) => s !== current));
  const ordered = [current];
  while (remaining.size > 0) {
    let next: Station | null = null;
    for (const s of remaining) {
      if (!next || dist2(current, s) < dist2(current, next)) next = s;
    }
    ordered.push(next!);
    remaining.delete(next!);
    current = next!;
  }
  return ordered;
}

// Shared body of the flat and network-scoped line detail pages.
export async function LineDetailContent({ systemId, lineId, network }: LineDetailContentProps) {
  const [system, line, allLines, stations, geometry] = await Promise.all([
    getSystem(systemId),
    getLine(systemId, lineId),
    getLines(systemId),
    getStationsByLine(systemId, lineId),
    getLineGeometry(systemId, lineId),
  ]).catch(() => notFound());

  if (!line) {
    notFound();
  }

  // Lines without feed shapes (hand-maintained systems, hand service-pattern
  // lines) fall back to a polyline through their stations so every line page
  // has a map. line.stations order wins when present; otherwise the member
  // stations are chained nearest-neighbor from an endpoint, since hand
  // stations.json files carry no reliable route order.
  let shapes = geometry ?? [];
  if (shapes.length === 0) {
    const byId = new Map(stations.map((s) => [s.id, s]));
    const ordered =
      line.stations && line.stations.length > 0
        ? line.stations.map((id) => byId.get(id)).filter((s) => s?.coordinates)
        : orderByProximity(stations.filter((s) => s.coordinates));
    const path = ordered.map((s) => [s!.coordinates!.lat, s!.coordinates!.lng] as [number, number]);
    if (path.length >= 2) {
      shapes = [path];
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        {network ? (
          <Link
            href={`/${systemId}/${network.id}`}
            className="text-text-muted hover:text-accent-secondary"
          >
            {network.name}
          </Link>
        ) : (
          <Link href={`/${systemId}/lines`} className="text-text-muted hover:text-accent-secondary">
            Lines
          </Link>
        )}
        <span className="text-text-muted">/</span>
        <span className="text-text-primary">{line.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-mono font-bold text-xl"
          style={{ backgroundColor: line.colorHex }}
        >
          {line.id.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-mono font-bold text-text-primary">{line.name}</h1>
            <StatusBadge status={line.status} />
          </div>
          <p className="text-text-secondary">{formatTermini(line)}</p>
          {line.opened && (
            <p className="text-sm text-text-muted mt-1">Opened {formatDate(line.opened)}</p>
          )}
        </div>
      </div>

      {/* Service Patterns (branches) */}
      {line.topology.branches && line.topology.branches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Service Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {line.topology.branches.map((branch) => (
                <div key={branch.id} className="flex items-start gap-3 p-3 rounded bg-bg-tertiary">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-mono font-medium text-text-primary">{branch.name}</p>
                      <Badge variant="outline">
                        {branch.servicePattern
                          .replace(/-/g, " ")
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Badge>
                    </div>
                    {branch.description && (
                      <p className="text-sm text-text-secondary mb-1">{branch.description}</p>
                    )}
                    <p className="text-xs text-text-muted">Branches at {branch.branchStation}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <LineStats
        length={line.length}
        sourceUnit={system.stats.distanceUnit}
        stationCount={stations.length}
        status={line.status}
        colorHex={line.colorHex}
      />

      {/* Route Map */}
      {shapes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Route Map</CardTitle>
          </CardHeader>
          <CardContent>
            <LineMap line={line} geometry={shapes} stations={stations} />
          </CardContent>
        </Card>
      )}

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary leading-relaxed">{line.description}</p>
        </CardContent>
      </Card>

      {/* Stations on this line */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-mono font-semibold text-text-primary">Stations</h2>
          <span className="text-sm font-mono text-text-muted">{stations.length} stations</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              systemId={systemId}
              lines={allLines}
              lineIndicatorShape={system.lineIndicatorShape}
              compact
            />
          ))}
        </div>
      </section>
    </div>
  );
}
