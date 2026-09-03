"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { Station, Line } from "@/lib/types";
import { DARK_TILE_URL, DARK_TILE_ATTRIBUTION } from "./mapStyles";

interface LineMapClientProps {
  line: Line;
  geometry: [number, number][][];
  stations: Station[];
}

function FitBounds({ geometry }: { geometry: [number, number][][] }) {
  const map = useMap();

  useEffect(() => {
    const all = geometry.flat();
    if (all.length > 1) {
      map.fitBounds(all, { padding: [30, 30] });
    }
  }, [map, geometry]);

  return null;
}

export function LineMapClient({ line, geometry, stations }: LineMapClientProps) {
  const color = line.colorHex || "#00ff9d";
  const located = stations.filter(
    (s): s is Station & { coordinates: NonNullable<Station["coordinates"]> } =>
      Boolean(s.coordinates)
  );

  return (
    <MapContainer
      center={geometry[0][0]}
      zoom={12}
      scrollWheelZoom={true}
      className="h-full w-full rounded-lg"
      style={{ background: "#0a0a0a" }}
    >
      <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTRIBUTION} />

      <FitBounds geometry={geometry} />

      {geometry.map((shape, i) => (
        <Polyline
          key={i}
          positions={shape}
          pathOptions={{ color, weight: 4, opacity: 0.85, lineCap: "round", lineJoin: "round" }}
        />
      ))}

      {located.map((station) => (
        <CircleMarker
          key={station.id}
          center={[station.coordinates.lat, station.coordinates.lng]}
          radius={5}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 1 }}
        >
          <Popup>
            <div className="font-mono text-sm">
              <Link href={`/${station.systemId}/stations/${station.id}`}>{station.name}</Link>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
