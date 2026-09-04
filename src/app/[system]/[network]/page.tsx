import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getAllSystems,
  getSystem,
  getNetwork,
  getLinesByNetwork,
  getStationsByNetwork,
} from "@/lib/data";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { LineIndicator } from "@/components/transit/LineIndicator";
import { LineLength } from "@/components/transit/LineLength";
import { formatTermini } from "@/lib/utils";

interface PageProps {
  params: Promise<{ system: string; network: string }>;
}

export async function generateStaticParams() {
  const systems = await getAllSystems();
  return systems.flatMap((system) =>
    (system.networks ?? []).map((network) => ({ system: system.id, network: network.id }))
  );
}

export default async function NetworkPage({ params }: PageProps) {
  const { system: systemId, network: networkId } = await params;

  const [system, network] = await Promise.all([
    getSystem(systemId),
    getNetwork(systemId, networkId),
  ]).catch(() => notFound());

  if (!network) {
    notFound();
  }

  const activeLines = await getLinesByNetwork(systemId, networkId);
  if (activeLines.length === 0) {
    // Declared but all-disabled networks (placeholders) do not render.
    notFound();
  }

  const [lines, stations] = await Promise.all([
    getLinesByNetwork(systemId, networkId),
    getStationsByNetwork(systemId, networkId),
  ]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary">{network.name}</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-mono font-bold text-text-primary">{network.name}</h1>
          <Badge variant="outline">
            {network.type.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </Badge>
        </div>
        <p className="text-text-secondary">
          {lines.length} line{lines.length !== 1 ? "s" : ""} •{" "}
          <Link
            href={`/${systemId}/${networkId}/stations`}
            className="text-accent-secondary hover:underline"
          >
            {stations.length} station{stations.length !== 1 ? "s" : ""} →
          </Link>
        </p>
      </div>

      {/* Lines List */}
      <div className="space-y-3">
        {lines.map((line) => (
          <Link key={line.id} href={`/${systemId}/${networkId}/lines/${line.id}`}>
            <Card hover>
              <div className="flex items-center gap-4">
                <LineIndicator
                  line={line}
                  size="lg"
                  shape={system.lineIndicatorShape}
                  linkable={false}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-mono font-semibold text-text-primary">{line.name}</h2>
                    <StatusBadge status={line.status} />
                  </div>
                  <p className="text-sm text-text-muted">{formatTermini(line)}</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-sm font-mono">
                  <div className="text-center">
                    <p className="text-text-muted text-xs">Length</p>
                    <p className="text-accent-primary">
                      <LineLength length={line.length} sourceUnit={system.stats.distanceUnit} />
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-text-muted text-xs">Stations</p>
                    <p className="text-accent-primary">{line.stationCount}</p>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
