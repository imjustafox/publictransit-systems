import { notFound } from "next/navigation";
import Link from "next/link";
import { getSystem, getRailcars } from "@/lib/data";
import { RailcarCard } from "@/components/transit/RailcarCard";

interface PageProps {
  params: Promise<{ system: string }>;
}

export default async function RailcarsPage({ params }: PageProps) {
  const { system: systemId } = await params;

  const [system, railcars] = await Promise.all([getSystem(systemId), getRailcars(systemId)]).catch(
    () => notFound()
  );

  const activeRailcars = railcars.filter((r) => r.status === "active");
  const retiredRailcars = railcars.filter((r) => r.status === "retired");
  const totalCars = railcars.reduce((sum, r) => sum + r.count, 0);
  const activeCars = activeRailcars.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary">Railcars</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-mono font-bold text-text-primary">
          {system.shortName} Railcar Fleet
        </h1>
        <p className="text-text-secondary">
          {railcars.length} generations • {activeCars.toLocaleString()} active cars
        </p>
      </div>

      {/* Fleet Summary */}
      <div className="bg-bg-secondary border border-border rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Total Generations
            </p>
            <p className="text-2xl font-mono font-semibold text-accent-primary">
              {railcars.length}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Active Generations
            </p>
            <p className="text-2xl font-mono font-semibold text-accent-primary">
              {activeRailcars.length}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Active Cars
            </p>
            <p className="text-2xl font-mono font-semibold text-accent-primary">
              {activeCars.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Historical Total
            </p>
            <p className="text-2xl font-mono font-semibold text-text-secondary">
              {totalCars.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Active Fleet */}
      {activeRailcars.length > 0 && (
        <section>
          <h2 className="text-xl font-mono font-semibold text-text-primary mb-4">Active Fleet</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeRailcars.map((railcar) => (
              <RailcarCard key={railcar.id} railcar={railcar} systemId={systemId} />
            ))}
          </div>
        </section>
      )}

      {/* Retired Fleet */}
      {retiredRailcars.length > 0 && (
        <section>
          <h2 className="text-xl font-mono font-semibold text-text-primary mb-4">Retired Fleet</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {retiredRailcars.map((railcar) => (
              <RailcarCard key={railcar.id} railcar={railcar} systemId={systemId} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
