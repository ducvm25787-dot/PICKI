"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import type {
  GeoJSON as LeafletGeoJSON,
  LatLngExpression,
  Map as LeafletMap,
  Marker,
  Polyline,
} from "leaflet";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  href?: string;
  kind?: "provider" | "user" | "stop" | "default";
  sequence?: number;
};

export type MapPolygonGeoJson = {
  type: "MultiPolygon" | "Polygon";
  coordinates: number[][][] | number[][][][];
};

type Props = {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  /** Zone boundary GeoJSON (WGS84) */
  polygon?: MapPolygonGeoJson | null;
  /** Emphasize a marker (e.g. from search focus) */
  focusId?: string | null;
  /** Marker id that can be dragged */
  draggableId?: string | null;
  onMarkerDrag?: (id: string, pos: { lat: number; lng: number }) => void;
  /** Click map to place/move pin (when editing location) */
  onMapClick?: (pos: { lat: number; lng: number }) => void;
  /** Driving route path (lat/lng) */
  routePath?: { lat: number; lng: number }[] | null;
  className?: string;
  height?: number | string;
  fitMarkers?: boolean;
  /** Follow center without re-fitting (active navigation) */
  followCenter?: boolean;
};

const KIND_COLOR: Record<NonNullable<MapMarker["kind"]>, string> = {
  provider: "#e85d04",
  user: "#2563eb",
  stop: "#1d4ed8",
  default: "#57534e",
};

function markerHtml(m: MapMarker, focused: boolean): string {
  const color = KIND_COLOR[m.kind ?? "default"];
  const text =
    m.sequence != null
      ? String(m.sequence)
      : m.kind === "user"
        ? "Bạn"
        : (m.label ?? "·").slice(0, 8);
  const scale = focused ? "transform:scale(1.15);" : "";
  const ring = focused ? "outline:3px solid #fff; outline-offset:2px;" : "";
  return `<div style="
    background:${color};
    color:#fff;
    font:600 11px/1.2 system-ui,sans-serif;
    padding:5px 8px;
    border-radius:999px;
    border:2px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,.25);
    white-space:nowrap;
    max-width:120px;
    overflow:hidden;
    text-overflow:ellipsis;
    ${scale}${ring}
  ">${escapeHtml(text)}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function PickeeMap({
  center,
  zoom = 16,
  markers = [],
  polygon = null,
  focusId = null,
  draggableId = null,
  onMarkerDrag,
  onMapClick,
  routePath = null,
  className = "",
  height = 320,
  fitMarkers = true,
  followCenter = false,
}: Props) {
  const domId = useId().replace(/:/g, "");
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const polygonRef = useRef<LeafletGeoJSON | null>(null);
  const routeRef = useRef<Polyline | null>(null);
  const draggingRef = useRef(false);
  const onMarkerDragRef = useRef(onMarkerDrag);
  const onMapClickRef = useRef(onMapClick);
  onMarkerDragRef.current = onMarkerDrag;
  onMapClickRef.current = onMapClick;

  const markersKey = useMemo(
    () =>
      JSON.stringify(
        markers.map((m) => [m.id, m.lat, m.lng, m.label ?? "", m.href ?? "", m.kind ?? "", m.sequence ?? null]),
      ),
    [markers],
  );
  const polygonKey = useMemo(() => (polygon ? JSON.stringify(polygon) : ""), [polygon]);
  const routeKey = useMemo(
    () => (routePath ? routePath.map((p) => `${p.lat},${p.lng}`).join(";") : ""),
    [routePath],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const L = await import("leaflet");
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (cancelled) return;

      if (!mapRef.current) {
        const map = L.map(`pickee-map-${domId}`, {
          scrollWheelZoom: false,
          zoomControl: true,
        }).setView([center.lat, center.lng] as LatLngExpression, zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 19,
        }).addTo(map);

        map.on("click", (e) => {
          onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        mapRef.current = map;
        // Full-height navigate: Leaflet needs invalidate after layout
        requestAnimationFrame(() => {
          map.invalidateSize();
          setTimeout(() => map.invalidateSize(), 100);
          setTimeout(() => map.invalidateSize(), 400);
        });
      } else if (!draggingRef.current) {
        if (followCenter) {
          mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom(), {
            animate: true,
          });
        } else {
          mapRef.current.setView([center.lat, center.lng], zoom);
        }
        requestAnimationFrame(() => {
          mapRef.current?.invalidateSize();
        });
      }

      const map = mapRef.current;
      if (draggingRef.current) return;

      if (routeRef.current) {
        routeRef.current.remove();
        routeRef.current = null;
      }
      if (routePath && routePath.length >= 2) {
        const line = L.polyline(
          routePath.map((p) => [p.lat, p.lng] as LatLngExpression),
          { color: "#2563eb", weight: 5, opacity: 0.85, lineJoin: "round" },
        );
        line.addTo(map);
        routeRef.current = line;
      }

      if (polygonRef.current) {
        polygonRef.current.remove();
        polygonRef.current = null;
      }
      if (polygon) {
        const feature = {
          type: "Feature" as const,
          properties: {},
          geometry: polygon,
        };
        const layer = L.geoJSON(feature as never, {
          style: {
            color: "#e85d04",
            weight: 2,
            opacity: 0.85,
            fillColor: "#e85d04",
            fillOpacity: 0.08,
          },
        });
        layer.addTo(map);
        polygonRef.current = layer;
      }

      for (const mk of markersRef.current) {
        mk.remove();
      }
      markersRef.current = [];

      const latLngs: LatLngExpression[] = [];
      if (routePath) {
        for (const p of routePath) latLngs.push([p.lat, p.lng]);
      }
      for (const m of markers) {
        const focused = focusId != null && m.id === focusId;
        const canDrag = draggableId != null && m.id === draggableId;
        const icon = L.divIcon({
          className: "pickee-map-marker",
          html: markerHtml(m, focused || canDrag),
          iconSize: [80, 28],
          iconAnchor: [40, 14],
        });
        const marker = L.marker([m.lat, m.lng], {
          icon,
          draggable: canDrag,
          zIndexOffset: focused || canDrag ? 1000 : 0,
          autoPan: canDrag,
        });
        if (m.label) marker.bindTooltip(m.label, { direction: "top", offset: [0, -12] });
        if (canDrag) {
          marker.on("dragstart", () => {
            draggingRef.current = true;
          });
          marker.on("dragend", () => {
            draggingRef.current = false;
            const ll = marker.getLatLng();
            onMarkerDragRef.current?.(m.id, { lat: ll.lat, lng: ll.lng });
          });
        } else if (m.href) {
          marker.on("click", () => {
            window.location.href = m.href!;
          });
        }
        marker.addTo(map);
        markersRef.current.push(marker);
        latLngs.push([m.lat, m.lng]);
      }

      if (!followCenter) {
        if (polygonRef.current && latLngs.length === 0) {
          try {
            map.fitBounds(polygonRef.current.getBounds(), { padding: [28, 28], maxZoom: 16 });
          } catch {
            /* empty polygon */
          }
        } else if (fitMarkers && latLngs.length >= 2) {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 17 });
        } else if (fitMarkers && latLngs.length === 1) {
          map.setView(latLngs[0]!, Math.max(zoom, 16));
        }

        if (focusId) {
          const focused = markers.find((m) => m.id === focusId);
          if (focused) {
            map.setView([focused.lat, focused.lng], Math.max(zoom, 17));
          }
        }
      }

      requestAnimationFrame(() => map.invalidateSize());
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [
    center.lat,
    center.lng,
    zoom,
    fitMarkers,
    domId,
    markersKey,
    markers,
    polygonKey,
    polygon,
    focusId,
    draggableId,
    routeKey,
    routePath,
    followCenter,
  ]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
      polygonRef.current = null;
      routeRef.current = null;
    };
  }, []);

  // Keep tiles filling flex/absolute containers (navigate full-bleed)
  useEffect(() => {
    const el = document.getElementById(`pickee-map-${domId}`);
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [domId]);

  return (
    <div
      id={`pickee-map-${domId}`}
      className={`pickee-map ${className}`.trim()}
      style={{
        height: typeof height === "number" ? `${String(height)}px` : height,
        width: "100%",
        borderRadius: 16,
        overflow: "hidden",
        zIndex: 0,
      }}
    />
  );
}
