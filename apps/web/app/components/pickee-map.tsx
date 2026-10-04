"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  /** Live status tint for compact provider dots */
  status?: string | null;
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
  /** Prefer over href navigation — tap marker / expand cluster child */
  onMarkerSelect?: (id: string) => void;
  /** Compact dots + lightweight cluster (Zone map). Off for navigate/admin. */
  compactMarkers?: boolean;
  /** Cluster when provider markers >= this (default 8) */
  clusterThreshold?: number;
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

function statusColor(status?: string | null): string {
  switch (status) {
    case "OPEN":
      return "#16a34a";
    case "BUSY":
      return "#d97706";
    case "CLOSED":
      return "#a8a29e";
    default:
      return KIND_COLOR.provider;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markerHtml(m: MapMarker, focused: boolean, compact: boolean): string {
  if (compact && (m.kind === "provider" || m.kind === "default")) {
    const color = statusColor(m.status);
    const size = focused ? 18 : 14;
    const ring = focused ? "outline:3px solid #fff; outline-offset:2px;" : "";
    return `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.28);${ring}
    "></div>`;
  }

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

function clusterHtml(count: number): string {
  return `<div style="
    min-width:28px;height:28px;padding:0 7px;
    border-radius:999px;background:#c2410c;color:#fff;
    font:700 12px/28px system-ui,sans-serif;text-align:center;
    border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
  ">${String(count)}</div>`;
}

type ClusterBucket = {
  key: string;
  lat: number;
  lng: number;
  members: MapMarker[];
};

function clusterProviders(markers: MapMarker[], zoom: number, threshold: number): {
  singles: MapMarker[];
  clusters: ClusterBucket[];
} {
  const providers = markers.filter((m) => m.kind === "provider" || m.kind === "default");
  const others = markers.filter((m) => m.kind !== "provider" && m.kind !== "default");
  if (providers.length < threshold) {
    return { singles: markers, clusters: [] };
  }

  // Coarser grid when zoomed out
  const cell = zoom >= 17 ? 0.0008 : zoom >= 15 ? 0.0016 : zoom >= 13 ? 0.0035 : 0.007;
  const buckets = new Map<string, ClusterBucket>();
  for (const m of providers) {
    const gk = `${Math.round(m.lat / cell)}_${Math.round(m.lng / cell)}`;
    const existing = buckets.get(gk);
    if (existing) {
      existing.members.push(m);
      existing.lat = (existing.lat * (existing.members.length - 1) + m.lat) / existing.members.length;
      existing.lng = (existing.lng * (existing.members.length - 1) + m.lng) / existing.members.length;
    } else {
      buckets.set(gk, { key: gk, lat: m.lat, lng: m.lng, members: [m] });
    }
  }

  const singles: MapMarker[] = [...others];
  const clusters: ClusterBucket[] = [];
  for (const b of buckets.values()) {
    if (b.members.length === 1) {
      singles.push(b.members[0]!);
    } else {
      clusters.push(b);
    }
  }
  return { singles, clusters };
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
  onMarkerSelect,
  compactMarkers = false,
  clusterThreshold = 8,
  routePath = null,
  className = "",
  height = 320,
  fitMarkers = true,
  followCenter = false,
}: Props) {
  const [liveZoom, setLiveZoom] = useState(zoom);
  const fittedKeyRef = useRef<string>("");
  const viewLockRef = useRef({ userAdjusted: false, ignoreZoomEnd: false, zoomProp: zoom });
  const domId = useId().replace(/:/g, "");
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const polygonRef = useRef<LeafletGeoJSON | null>(null);
  const routeRef = useRef<Polyline | null>(null);
  const draggingRef = useRef(false);
  const onMarkerDragRef = useRef(onMarkerDrag);
  const onMapClickRef = useRef(onMapClick);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  onMarkerDragRef.current = onMarkerDrag;
  onMapClickRef.current = onMapClick;
  onMarkerSelectRef.current = onMarkerSelect;

  const markersKey = useMemo(
    () =>
      JSON.stringify(
        markers.map((m) => [
          m.id,
          m.lat,
          m.lng,
          m.label ?? "",
          m.href ?? "",
          m.kind ?? "",
          m.sequence ?? null,
          m.status ?? "",
        ]),
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
        map.on("zoomend", () => {
          setLiveZoom(map.getZoom());
          if (viewLockRef.current.ignoreZoomEnd) {
            viewLockRef.current.ignoreZoomEnd = false;
            return;
          }
          viewLockRef.current.userAdjusted = true;
        });
        map.on("dragend", () => {
          viewLockRef.current.userAdjusted = true;
        });

        mapRef.current = map;
        setLiveZoom(map.getZoom());
        requestAnimationFrame(() => {
          map.invalidateSize();
          setTimeout(() => map.invalidateSize(), 100);
          setTimeout(() => map.invalidateSize(), 400);
        });
      } else if (!draggingRef.current) {
        const zoomPropChanged = viewLockRef.current.zoomProp !== zoom;
        if (zoomPropChanged) {
          viewLockRef.current.zoomProp = zoom;
          viewLockRef.current.userAdjusted = false;
        }
        if (followCenter || (zoomPropChanged && !compactMarkers)) {
          const nextZoom = zoomPropChanged ? zoom : mapRef.current.getZoom();
          const before = mapRef.current.getZoom();
          viewLockRef.current.ignoreZoomEnd = true;
          mapRef.current.setView([center.lat, center.lng], nextZoom, {
            animate: followCenter,
          });
          if (mapRef.current.getZoom() === before && nextZoom === before) {
            viewLockRef.current.ignoreZoomEnd = false;
          }
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

      const currentZoom = map.getZoom();
      const { singles, clusters } =
        compactMarkers
          ? clusterProviders(markers, liveZoom || currentZoom, clusterThreshold)
          : { singles: markers, clusters: [] as ClusterBucket[] };

      for (const cluster of clusters) {
        const icon = L.divIcon({
          className: "pickee-map-marker",
          html: clusterHtml(cluster.members.length),
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const marker = L.marker([cluster.lat, cluster.lng], { icon, zIndexOffset: 200 });
        marker.on("click", () => {
          map.setView([cluster.lat, cluster.lng], Math.min(currentZoom + 2, 18), { animate: true });
        });
        marker.addTo(map);
        markersRef.current.push(marker);
        latLngs.push([cluster.lat, cluster.lng]);
      }

      for (const m of singles) {
        const focused = focusId != null && m.id === focusId;
        const canDrag = draggableId != null && m.id === draggableId;
        const compact = compactMarkers && m.kind === "provider";
        const icon = L.divIcon({
          className: "pickee-map-marker",
          html: markerHtml(m, focused || canDrag, compact),
          iconSize: compact ? [18, 18] : [80, 28],
          iconAnchor: compact ? [9, 9] : [40, 14],
        });
        const marker = L.marker([m.lat, m.lng], {
          icon,
          draggable: canDrag,
          zIndexOffset: focused || canDrag ? 1000 : 0,
          autoPan: canDrag,
        });
        if (m.label && !compact) {
          marker.bindTooltip(m.label, { direction: "top", offset: [0, -12] });
        }
        if (canDrag) {
          marker.on("dragstart", () => {
            draggingRef.current = true;
          });
          marker.on("dragend", () => {
            draggingRef.current = false;
            const ll = marker.getLatLng();
            onMarkerDragRef.current?.(m.id, { lat: ll.lat, lng: ll.lng });
          });
        } else {
          marker.on("click", () => {
            if (onMarkerSelectRef.current) {
              onMarkerSelectRef.current(m.id);
              return;
            }
            if (m.href) window.location.href = m.href;
          });
        }
        marker.addTo(map);
        markersRef.current.push(marker);
        latLngs.push([m.lat, m.lng]);
      }

      if (!followCenter && !viewLockRef.current.userAdjusted) {
        const fitKey = `${markersKey}|${polygonKey}|${routeKey}|${focusId ?? ""}`;
        const alreadyFitted = fittedKeyRef.current === fitKey;
        if (!alreadyFitted) {
          fittedKeyRef.current = fitKey;
          const beforeFit = map.getZoom();
          viewLockRef.current.ignoreZoomEnd = true;
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
          if (map.getZoom() === beforeFit) {
            viewLockRef.current.ignoreZoomEnd = false;
          }

          if (focusId) {
            const focused = markers.find((m) => m.id === focusId);
            if (focused) {
              viewLockRef.current.ignoreZoomEnd = true;
              map.setView([focused.lat, focused.lng], Math.max(zoom, 17));
            }
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
    compactMarkers,
    clusterThreshold,
    liveZoom,
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
