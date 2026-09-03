import { notFound } from "next/navigation";
import Link from "next/link";
import { getSystem, formatDate } from "@/lib/data";
import { Card } from "@/components/ui/Card";

interface PageProps {
  params: Promise<{ system: string }>;
}

export default async function HistoryPage({ params }: PageProps) {
  const { system: systemId } = await params;
  const system = await getSystem(systemId).catch(() => notFound());

  if (!system.history || system.history.length === 0) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-2 text-sm font-mono" aria-label="Breadcrumb">
          <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
            {system.shortName}
          </Link>
          <span className="text-text-muted">/</span>
          <span className="text-text-primary">History</span>
        </nav>
        <div className="text-center py-12 text-text-muted font-mono">
          <p>No history available for this system.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-mono" aria-label="Breadcrumb">
        <Link href={`/${systemId}`} className="text-text-muted hover:text-accent-secondary">
          {system.shortName}
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary">History</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-mono font-bold text-text-primary">
          {system.shortName} History
        </h1>
        <p className="text-text-secondary">
          Timeline of major events from {formatDate(system.opened)} to present
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-6">
          {system.history.map((event, idx) => (
            <div key={idx} className="relative pl-12">
              {/* Timeline dot */}
              <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-accent-primary border-2 border-bg-primary" />

              <Card>
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                  <span className="text-sm font-mono text-accent-primary shrink-0">
                    {formatDate(event.date)}
                  </span>
                  <div>
                    <h2 className="font-semibold text-text-primary mb-1">{event.title}</h2>
                    <p className="text-sm text-text-secondary">{event.description}</p>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
