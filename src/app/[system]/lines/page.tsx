import { notFound } from "next/navigation";
import Link from "next/link";
import { getSystem, getLines } from "@/lib/data";
import { Card } from "@/components/ui/Card";
import { LineIndicator } from "@/components/transit/LineIndicator";
import { StatusBadge } from "@/components/ui/Badge";
import { LineLength } from "@/components/transit/LineLength";
import { formatTermini } from "@/lib/utils";

interface PageProps {
  params: Promise<{ system: string }>;
}

export default async function LinesPage({ params }: PageProps) {
  const { system: systemId } = await params;

  const [system, lines] = await Promise.all([getSystem(systemId), getLines(systemId)]).catch(() =>
    notFound()
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary">Lines</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-mono font-bold text-text-primary">{system.shortName} Lines</h1>
        <p className="text-text-secondary">
          {lines.length} lines serving the {system.location} area
        </p>
      </div>

      {/* Lines List */}
      <div className="space-y-3">
        {lines.map((line) => (
          <Link key={line.id} href={`/${systemId}/lines/${line.id}`}>
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
