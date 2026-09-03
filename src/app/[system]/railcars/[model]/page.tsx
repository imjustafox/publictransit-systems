import { notFound } from "next/navigation";
import Link from "next/link";
import { getSystem, getRailcar } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Terminal, TerminalLine, TerminalOutput } from "@/components/ui/Terminal";

interface PageProps {
  params: Promise<{ system: string; model: string }>;
}

export default async function RailcarDetailPage({ params }: PageProps) {
  const { system: systemId, model: modelId } = await params;

  // Decode model ID if it's URL-encoded
  const decodedModelId = decodeURIComponent(modelId);

  const [system, railcar] = await Promise.all([
    getSystem(systemId),
    getRailcar(systemId, decodedModelId),
  ]).catch(() => notFound());

  if (!railcar) {
    notFound();
  }

  const statusVariant = {
    active: "success" as const,
    retired: "error" as const,
    testing: "warning" as const,
  }[railcar.status];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        <Link
          href={`/${systemId}/railcars`}
          className="text-text-muted hover:text-accent-secondary"
        >
          Railcars
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary">{railcar.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-mono font-bold text-text-primary">{railcar.name}</h1>
            <Badge variant={statusVariant}>{railcar.status.toUpperCase()}</Badge>
          </div>
          <p className="text-text-secondary">
            {railcar.manufacturer} • {railcar.introduced}
            {railcar.retired && ` - ${railcar.retired}`}
          </p>
        </div>
      </div>

      {/* Terminal Block */}
      <Terminal title={railcar.name}>
        <TerminalLine>specs --model {railcar.name.replace(/\s+/g, "-").toLowerCase()}</TerminalLine>
        <TerminalOutput>Manufacturer: {railcar.manufacturer}</TerminalOutput>
        <TerminalOutput>Fleet Size: {railcar.count} cars</TerminalOutput>
        <TerminalOutput>Status: {railcar.status}</TerminalOutput>
        <TerminalLine prompt="✓">Specifications loaded</TerminalLine>
      </Terminal>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
            Fleet Size
          </p>
          <p className="text-2xl font-mono font-semibold text-accent-primary">{railcar.count}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
            Capacity
          </p>
          <p className="text-2xl font-mono font-semibold text-accent-primary">
            {railcar.specs.capacity}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
            Max Speed
          </p>
          <p className="text-2xl font-mono font-semibold text-accent-primary">
            {railcar.specs.maxSpeed}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">Length</p>
          <p className="text-2xl font-mono font-semibold text-accent-primary">
            {railcar.specs.length}
          </p>
        </Card>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary leading-relaxed">{railcar.description}</p>
        </CardContent>
      </Card>

      {/* Technical Specifications */}
      <Card>
        <CardHeader>
          <CardTitle>Technical Specifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted font-mono text-sm">Manufacturer</span>
                <span className="text-text-primary font-mono">{railcar.manufacturer}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted font-mono text-sm">Introduced</span>
                <span className="text-text-primary font-mono">{railcar.introduced}</span>
              </div>
              {railcar.retired && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted font-mono text-sm">Retired</span>
                  <span className="text-text-primary font-mono">{railcar.retired}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted font-mono text-sm">Fleet Size</span>
                <span className="text-text-primary font-mono">{railcar.count} cars</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted font-mono text-sm">Length</span>
                <span className="text-text-primary font-mono">{railcar.specs.length}</span>
              </div>
              {railcar.specs.width && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted font-mono text-sm">Width</span>
                  <span className="text-text-primary font-mono">{railcar.specs.width}</span>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted font-mono text-sm">Total Capacity</span>
                <span className="text-text-primary font-mono">{railcar.specs.capacity}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted font-mono text-sm">Seated Capacity</span>
                <span className="text-text-primary font-mono">{railcar.specs.seatedCapacity}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted font-mono text-sm">Max Speed</span>
                <span className="text-text-primary font-mono">{railcar.specs.maxSpeed}</span>
              </div>
              {railcar.specs.weight && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted font-mono text-sm">Weight</span>
                  <span className="text-text-primary font-mono">{railcar.specs.weight}</span>
                </div>
              )}
              {railcar.specs.traction && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted font-mono text-sm">Traction</span>
                  <span className="text-text-primary font-mono">{railcar.specs.traction}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
