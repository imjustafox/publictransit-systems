"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { DARK_VECTOR_STYLE_URL, DARK_TILE_ATTRIBUTION } from "./mapStyles";

// CARTO's vector basemap rendered by MapLibre GL as a Leaflet layer, so every
// Leaflet overlay (geometry ribbons, markers, popups) keeps working unchanged.
//
// maplibre-gl is pinned to v5. Under v6 the style never finishes loading here
// (no error, no tile requests, blank basemap): v6 changed worker bundling and
// a silently unloaded worker is a known failure mode, tracked with the rest
// of the v6 ecosystem fallout in maplibre/maplibre-gl-js#8168. The bridge
// plugin's peer range allows v6 but the combination is untested upstream.
// Retest before any major bump.
export function VectorBasemap() {
  const map = useMap();

  useEffect(() => {
    const layer = L.maplibreGL({
      style: DARK_VECTOR_STYLE_URL,
      attributionControl: { customAttribution: DARK_TILE_ATTRIBUTION },
    });
    layer.addTo(map);
    // A failed basemap is otherwise a silently blank map; keep it loud.
    layer
      .getMaplibreMap()
      .on("error", (e) => console.error("maplibre error:", e.error?.message ?? e));
    return () => {
      layer.remove();
    };
  }, [map]);

  return null;
}
