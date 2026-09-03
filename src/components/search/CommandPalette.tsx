"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { Search, MapPin, Train, CreditCard, TrendingUp } from "lucide-react";
import { searchAll, type SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const results = useMemo<SearchResult[]>(() => {
    if (search.length === 0) return [];
    return searchAll(search).slice(0, 20);
  }, [search]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const handleSelect = useCallback(
    (value: string) => {
      onOpenChange(false);
      router.push(value);
      setSearch("");
    },
    [router, onOpenChange]
  );

  const getIcon = (type: string) => {
    switch (type) {
      case "system":
        return <TrendingUp className="w-4 h-4" />;
      case "station":
        return <MapPin className="w-4 h-4" />;
      case "line":
        return <Train className="w-4 h-4" />;
      case "railcar":
        return <CreditCard className="w-4 h-4" />;
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  const groupedResults = results.reduce(
    (acc, result) => {
      if (!acc[result.type]) {
        acc[result.type] = [];
      }
      acc[result.type].push(result);
      return acc;
    },
    {} as Record<string, SearchResult[]>
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-2xl px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center border-b border-border px-4">
            <Search className="w-4 h-4 text-text-muted mr-2 shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search systems, stations, lines, railcars..."
              className="flex-1 bg-transparent py-4 font-mono text-sm text-text-primary placeholder:text-text-muted outline-none"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-bg-tertiary px-1.5 font-mono text-xs text-text-muted">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-text-muted font-mono">
              No results found.
            </Command.Empty>

            {Object.entries(groupedResults).map(([type, items]) => (
              <Command.Group key={type} heading={type.toUpperCase()} className="mb-2">
                <div className="px-2 py-1.5 text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                  {type}s
                </div>
                {items.map((result) => (
                  <Command.Item
                    key={result.url}
                    value={result.url}
                    onSelect={handleSelect}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer font-mono text-sm",
                      "data-[selected=true]:bg-bg-tertiary data-[selected=true]:text-accent-primary",
                      "transition-colors"
                    )}
                  >
                    <div className="text-text-muted">{getIcon(result.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-text-primary truncate">{result.name}</div>
                      {result.subtitle && (
                        <div className="text-xs text-text-muted truncate">{result.subtitle}</div>
                      )}
                    </div>
                    {result.metadata && (
                      <div className="text-xs text-text-muted shrink-0">{result.metadata}</div>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-muted font-mono">
            <div className="flex gap-4">
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 border border-border rounded bg-bg-tertiary">↑↓</kbd>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 border border-border rounded bg-bg-tertiary">↵</kbd>
                <span>Select</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 border border-border rounded bg-bg-tertiary">⌘K</kbd>
              <span>Toggle</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
