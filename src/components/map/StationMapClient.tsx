"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Station, Line, Coordinates } from "@/lib/types";
import {
  createStationIcon,
  createEntranceIcon,
  getAccessibilityColor,
  offsetPolyline,
  DARK_TILE_URL,
  DARK_TILE_ATTRIBUTION,
} from "./mapStyles";

// Station with coordinates required for map rendering
type StationWithCoordinates = Omit<Station, "coordinates"> & { coordinates: Coordinates };

interface GeometryOverlay {
  lineId: string;
  color: string;
  shapes: [number, number][][];
}

interface StationMapClientProps {
  station: StationWithCoordinates;
  stationLines: Line[];
  geometryOverlays?: GeometryOverlay[];
}

// Component to fit map bounds to markers
function FitBounds({ station }: { station: StationWithCoordinates }) {
  const map = useMap();

  useEffect(() => {
    const bounds: [number, number][] = [[station.coordinates.lat, station.coordinates.lng]];

    if (station.entrances) {
      station.entrances.forEach((entrance) => {
        bounds.push([entrance.coordinates.lat, entrance.coordinates.lng]);
      });
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    } else {
      map.setView([station.coordinates.lat, station.coordinates.lng], 16);
    }
  }, [map, station]);

  return null;
}

export function StationMapClient({
  station,
  stationLines,
  geometryOverlays,
}: StationMapClientProps) {
  const primaryLineColor = stationLines[0]?.colorHex || "#00ff9d";

  return (
    <MapContainer
      center={[station.coordinates.lat, station.coordinates.lng]}
      zoom={16}
      scrollWheelZoom={true}
      className="h-full w-full rounded-lg"
      style={{ background: "#0a0a0a" }}
    >
      <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTRIBUTION} />

      <FitBounds station={station} />

      {/* Every line's track geometry in the system, drawn as context; the
          view stays fitted to the station so only nearby track shows */}
      {geometryOverlays?.map((overlay, lineIndex) =>
        overlay.shapes.map((shape, i) => (
          <Polyline
            key={`${overlay.lineId}-${i}`}
            positions={offsetPolyline(shape, (lineIndex - (geometryOverlays.length - 1) / 2) * 6)}
            pathOptions={{
              color: overlay.color,
              weight: 3,
              opacity: 0.7,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ))
      )}

      {/* Station marker */}
      <Marker
        position={[station.coordinates.lat, station.coordinates.lng]}
        icon={createStationIcon(primaryLineColor)}
        title={station.name}
        alt={`${station.name} station marker`}
      >
        <Popup>
          <div className="font-mono text-sm">
            <p className="font-bold text-base">{station.name}</p>
            <p className="text-neutral-400">{station.address}</p>
          </div>
        </Popup>
      </Marker>

      {/* Entrance markers */}
      {station.entrances?.map((entrance) => (
        <Marker
          key={entrance.id}
          position={[entrance.coordinates.lat, entrance.coordinates.lng]}
          icon={createEntranceIcon(entrance.accessibility)}
          title={entrance.name}
          alt={`${entrance.name} entrance marker`}
        >
          <Popup>
            <div className="font-mono text-sm">
              <p className="font-bold">{entrance.name}</p>
              {entrance.street && <p className="text-neutral-400">{entrance.street}</p>}
              {entrance.accessibility && entrance.accessibility.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entrance.accessibility.map((access) => (
                    <span
                      key={access}
                      className="inline-block rounded px-1.5 py-0.5 text-xs"
                      style={{
                        backgroundColor: getAccessibilityColor([access]),
                        color: access === "stairs-only" ? "#fff" : "#000",
                      }}
                    >
                      {access.replace("-", " ")}
                    </span>
                  ))}
                </div>
              )}
              {entrance.wheelchair !== undefined && (
                <p className="mt-1 text-xs text-neutral-400">
                  {entrance.wheelchair ? "♿ Wheelchair accessible" : "No wheelchair access"}
                </p>
              )}
              {entrance.description && (
                <p className="mt-1 text-neutral-400">{entrance.description}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
