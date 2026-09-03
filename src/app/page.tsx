import Link from "next/link";
import { getAllSystems } from "@/lib/data";
import { SystemCard } from "@/components/transit/SystemCard";
import { GlobalStats } from "@/components/transit/GlobalStats";
import { Terminal, TerminalLine, TerminalOutput } from "@/components/ui/Terminal";
import { Card } from "@/components/ui/Card";

export default async function HomePage() {
  const systems = await getAllSystems();

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="space-y-4">
        <Terminal title="publictransit.systems" scanline glow>
          <TerminalLine>query --list systems</TerminalLine>
          <TerminalOutput success>
            Found {systems.length} transit system{systems.length !== 1 ? "s" : ""} in database
          </TerminalOutput>
          <TerminalLine prompt=">">Displaying public transit information...</TerminalLine>
        </Terminal>

        <div className="space-y-2">
          <h1 className="text-4xl font-mono font-bold text-text-primary">
            Public Transit <span className="text-accent-primary">Systems</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-3xl">
            Comprehensive information about public transit systems worldwide. Explore stations,
            lines, railcars, and historical data through a terminal-inspired interface.
          </p>
        </div>
      </section>

      {/* Global Stats */}
      {systems.length > 0 && (
        <section>
          <GlobalStats
            systems={systems.map((s) => ({
              totalStations: s.stats.totalStations,
              totalLines: s.stats.totalLines,
              trackLength: s.stats.trackLength,
              distanceUnit: s.stats.distanceUnit,
            }))}
          />
        </section>
      )}

      {/* Systems Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-mono font-semibold text-text-primary flex items-center gap-2">
            <span className="text-accent-primary">&gt;</span> Available Systems
          </h2>
          <span className="text-sm font-mono text-text-muted px-3 py-1 bg-bg-secondary border border-border rounded">
            {systems.length} system{systems.length !== 1 ? "s" : ""}
          </span>
        </div>

        {systems.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {systems.map((system) => (
              <SystemCard key={system.id} system={system} />
            ))}
          </div>
        ) : (
          <Card>
            <div className="text-center py-12">
              <Terminal title="error">
                <TerminalLine prompt="!">No transit systems found</TerminalLine>
                <TerminalOutput error>Add system data to /data/systems/</TerminalOutput>
              </Terminal>
            </div>
          </Card>
        )}
      </section>

      {/* Quick Links */}
      <section>
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="font-mono font-semibold text-accent-primary">Compare Systems</h3>
              <p className="text-sm text-text-secondary">
                Side-by-side analysis of transit systems with detailed metrics and visualizations.
              </p>
              <Link
                href="/compare"
                className="inline-block text-sm text-accent-secondary hover:underline font-mono"
              >
                Open Compare Tool →
              </Link>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono font-semibold text-accent-primary">Global Search</h3>
              <p className="text-sm text-text-secondary">
                Find stations, lines, and railcars across all systems with powerful filters.
              </p>
              <Link
                href="/search"
                className="inline-block text-sm text-accent-secondary hover:underline font-mono"
              >
                Press ⌘K to Search →
              </Link>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono font-semibold text-accent-primary">About This Project</h3>
              <p className="text-sm text-text-secondary">
                Learn about data sources, contribute information, and explore the API.
              </p>
              <Link
                href="/docs/about"
                className="inline-block text-sm text-accent-secondary hover:underline font-mono"
              >
                View Documentation →
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
