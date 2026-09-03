"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSearchIndex, search, groupResultsByType } from "@/lib/search";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { TransitSystem, Station, Line, RailcarGeneration } from "@/lib/types";

interface SearchResultsProps {
  query: string;
  systems: TransitSystem[];
  stations: Station[];
  lines: Line[];
  railcars: RailcarGeneration[];
}

export function SearchResults({
  query: initialQuery,
  systems,
  stations,
  lines,
  railcars,
}: SearchResultsProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const searchIndex = useMemo(
    () => createSearchIndex(systems, stations, lines, railcars),
    [systems, stations, lines, railcars]
  );

  const results = useMemo(() => {
    if (!query.trim()) return null;
    return search(searchIndex, query);
  }, [searchIndex, query]);

  const grouped = useMemo(() => {
    if (!results) return null;
    return groupResultsByType(results);
  }, [results]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const typeLabels = {
    systems: "Systems",
    stations: "Stations",
    lines: "Lines",
    railcars: "Railcars",
  };

  const typeColors = {
    systems: "text-accent-primary",
    stations: "text-accent-secondary",
    lines: "text-status-active",
    railcars: "text-status-construction",
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stations, lines, railcars..."
            className={cn(
              "w-full pl-12 pr-4 py-3 rounded-lg",
              "bg-bg-secondary border border-border",
              "text-text-primary font-mono",
              "placeholder:text-text-muted",
              "focus:border-accent-primary outline-none"
            )}
            autoFocus
          />
        </div>
      </form>

      {/* Results */}
      {!query.trim() ? (
        <div className="text-center py-12">
          <p className="text-text-muted font-mono">
            Enter a search term to find stations, lines, and more
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["Metro Center", "Red Line", "7000 Series", "Union Station"].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setQuery(suggestion)}
                className="px-3 py-1 text-sm font-mono bg-bg-tertiary border border-border rounded hover:border-border-hover transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : results && results.length > 0 ? (
        <div className="space-y-6">
          <p className="text-sm text-text-muted font-mono">
            Found {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
          </p>

          {grouped &&
            Object.entries(grouped).map(
              ([type, items]) =>
                items.length > 0 && (
                  <section key={type}>
                    <h2
                      className={cn(
                        "text-lg font-mono font-semibold mb-3",
                        typeColors[type as keyof typeof typeColors]
                      )}
                    >
                      {typeLabels[type as keyof typeof typeLabels]} ({items.length})
                    </h2>
                    <div className="space-y-2">
                      {items.map((result) => (
                        <Link key={`${result.type}-${result.id}`} href={result.url}>
                          <Card hover className="flex items-center gap-3">
                            <Badge variant="outline" className="shrink-0 uppercase">
                              {result.type}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <p className="font-mono font-medium text-text-primary truncate">
                                {result.name}
                              </p>
                              {result.subtitle && (
                                <p className="text-sm text-text-muted truncate">
                                  {result.subtitle}
                                </p>
                              )}
                            </div>
                            <span className="text-xs font-mono text-text-muted shrink-0">
                              {result.systemId.toUpperCase()}
                            </span>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </section>
                )
            )}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-text-muted font-mono">No results found for &quot;{query}&quot;</p>
          <p className="text-sm text-text-muted mt-2">
            Try a different search term or check your spelling
          </p>
        </div>
      )}
    </div>
  );
}
