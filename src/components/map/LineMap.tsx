"use client";

import dynamic from "next/dynamic";
import type { Station, Line } from "@/lib/types";

const LineMapClient = dynamic(() => import("./LineMapClient").then((mod) => mod.LineMapClient), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-bg-tertiary">
      <div className="text-center font-mono text-text-muted">
        <div className="mb-2">Loading map...</div>
      </div>
    </div>
  ),
});

interface LineMapProps {
  line: Line;
  geometry: [number, number][][];
  stations: Station[];
}

export function LineMap({ line, geometry, stations }: LineMapProps) {
  return (
    <div className="aspect-video overflow-hidden rounded-lg border border-border">
      <LineMapClient line={line} geometry={geometry} stations={stations} />
    </div>
  );
}
