import { notFound } from "next/navigation";
import Link from "next/link";
import { getSystem, getStations, getLines } from "@/lib/data";
import { StationCard } from "@/components/transit/StationCard";
import { StationFilters } from "@/components/transit/StationFilters";

interface PageProps {
  params: Promise<{ system: string }>;
  searchParams: Promise<{ status?: string; line?: string }>;
}

export default async function StationsPage({ params, searchParams }: PageProps) {
  const { system: systemId } = await params;
  const { status, line } = await searchParams;

  const [system, stations, lines] = await Promise.all([
    getSystem(systemId),
    getStations(systemId),
    getLines(systemId),
  ]).catch(() => notFound());

  let filteredStations = stations;

  if (status) {
    filteredStations = filteredStations.filter((s) => s.status === status);
  }

  if (line) {
    filteredStations = filteredStations.filter((s) => s.lines.includes(line));
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary">Stations</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-mono font-bold text-text-primary">
          {system.shortName} Stations
        </h1>
        <p className="text-text-secondary">
          {stations.length} stations across {lines.length} lines
        </p>
      </div>

      {/* Filters */}
      <StationFilters
        systemId={systemId}
        lines={lines}
        currentStatus={status}
        currentLine={line}
        totalStations={stations.length}
        filteredCount={filteredStations.length}
      />

      {/* Stations Grid */}
      {filteredStations.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStations.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              systemId={systemId}
              lines={lines}
              lineIndicatorShape={system.lineIndicatorShape}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted font-mono">
          <p>No stations match the current filters.</p>
          <Link
            href={`/${systemId}/stations`}
            className="text-accent-secondary hover:underline mt-2 inline-block"
          >
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}
