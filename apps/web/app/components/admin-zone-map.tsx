"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LatLngExpression, Map as LeafletMap, Marker, Polygon } from "leaflet";

export type AdminLatLng = { lat: number; lng: number };

type Overlay = {
  id: string;
  ring: AdminLatLng[];
  color: string;
  label?: string;
};

type Props = {
  center: AdminLatLng;
  editableRing: AdminLatLng[];
  onRingChange: (ring: AdminLatLng[]) => void;
  overlays?: Overlay[];
  draggablePin?: AdminLatLng | null;
  onPinChange?: (pos: AdminLatLng) => void;
  pinLabel?: string;
  height?: number | string;
  editMode?: boolean;
  /** Fill parent — no rounded card look */
  fill?: boolean;
};

function ensureLeafletCss() {
  if (document.getElementById("leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

export function AdminZoneMapEditor({
  center,
  editableRing,
  onRingChange,
  overlays = [],
  draggablePin = null,
  onPinChange,
  pinLabel = "Neo GPS",
  height = 420,
  editMode = true,
  fill = false,
}: Props) {
  const domId = useId().replace(/:/g, "");
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const polyRef = useRef<Polygon | null>(null);
  const vertexRefs = useRef<Marker[]>([]);
  const overlayRefs = useRef<Polygon[]>([]);
  const pinRef = useRef<Marker | null>(null);
  const draggingRef = useRef(false);
  const ringRef = useRef(editableRing);
  const onRingChangeRef = useRef(onRingChange);
  const onPinChangeRef = useRef(onPinChange);
  const editModeRef = useRef(editMode);
  const fittedRef = useRef(false);

  ringRef.current = editableRing;
  onRingChangeRef.current = onRingChange;
  onPinChangeRef.current = onPinChange;
  editModeRef.current = editMode;

  const overlaysKey = useMemo(
    () =>
      overlays
        .map(
          (o) =>
            `${o.id}:${o.color}:${o.ring.map((p) => `${p.lat},${p.lng}`).join(";")}`,
        )
        .join("|"),
    [overlays],
  );

  useEffect(() => {
    let cancelled = false;
    let resizeCleanup: (() => void) | undefined;

    void (async () => {
      const L = await import("leaflet");
      LRef.current = L;
      ensureLeafletCss();
      if (cancelled || mapRef.current) return;

      const map = L.map(`admin-zone-map-${domId}`, {
        scrollWheelZoom: true,
        zoomControl: true,
      }).setView([center.lat, center.lng] as LatLngExpression, 15);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e) => {
        if (!editModeRef.current) return;
        const next = [...ringRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }];
        onRingChangeRef.current(next);
      });

      mapRef.current = map;
      setMapReady(true);
      requestAnimationFrame(() => map.invalidateSize());

      const el = document.getElementById(`admin-zone-map-${domId}`);
      if (el && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(el);
        resizeCleanup = () => ro.disconnect();
      }
    })();

    return () => {
      cancelled = true;
      resizeCleanup?.();
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per map instance
  }, [domId]);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!mapReady || !map || !L || draggingRef.current) return;

    for (const p of overlayRefs.current) p.remove();
    overlayRefs.current = [];
    for (const o of overlays) {
      if (o.ring.length < 3) continue;
      const layer = L.polygon(
        o.ring.map((p) => [p.lat, p.lng] as LatLngExpression),
        {
          color: o.color,
          weight: 2,
          fillColor: o.color,
          fillOpacity: 0.06,
          dashArray: "6 4",
          interactive: false,
        },
      );
      if (o.label) layer.bindTooltip(o.label, { sticky: true });
      layer.addTo(map);
      overlayRefs.current.push(layer);
    }

    if (polyRef.current) {
      polyRef.current.remove();
      polyRef.current = null;
    }
    for (const v of vertexRefs.current) v.remove();
    vertexRefs.current = [];

    if (editableRing.length >= 2) {
      const poly = L.polygon(
        editableRing.map((p) => [p.lat, p.lng] as LatLngExpression),
        {
          color: "#e85d04",
          weight: 3,
          fillColor: "#e85d04",
          fillOpacity: 0.12,
        },
      );
      poly.addTo(map);
      polyRef.current = poly;
    }

    if (editMode) {
      editableRing.forEach((p, index) => {
        const marker = L.marker([p.lat, p.lng], {
          draggable: true,
          icon: L.divIcon({
            className: "admin-vertex-marker",
            html: `<div style="
              width:14px;height:14px;border-radius:50%;
              background:#e85d04;border:2px solid #fff;
              box-shadow:0 1px 4px rgba(0,0,0,.35);
            "></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        });
        marker.on("dragstart", () => {
          draggingRef.current = true;
        });
        marker.on("drag", () => {
          const ll = marker.getLatLng();
          const next = ringRef.current.map((pt, i) =>
            i === index ? { lat: ll.lat, lng: ll.lng } : pt,
          );
          ringRef.current = next;
          if (polyRef.current) {
            polyRef.current.setLatLngs(next.map((pt) => [pt.lat, pt.lng] as LatLngExpression));
          }
        });
        marker.on("dragend", () => {
          draggingRef.current = false;
          onRingChangeRef.current([...ringRef.current]);
        });
        marker.on("dblclick", (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (ringRef.current.length <= 3) return;
          onRingChangeRef.current(ringRef.current.filter((_, i) => i !== index));
        });
        marker.addTo(map);
        vertexRefs.current.push(marker);
      });
    }

    if (pinRef.current) {
      pinRef.current.remove();
      pinRef.current = null;
    }
    if (draggablePin) {
      const pin = L.marker([draggablePin.lat, draggablePin.lng], {
        draggable: Boolean(onPinChange),
        icon: L.divIcon({
          className: "admin-pin-marker",
          html: `<div style="
            background:#2563eb;color:#fff;font:600 11px system-ui;
            padding:4px 8px;border-radius:8px;border:2px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;
          ">${pinLabel}</div>`,
          iconSize: [80, 28],
          iconAnchor: [40, 14],
        }),
      });
      if (onPinChange) {
        pin.on("dragend", () => {
          const ll = pin.getLatLng();
          onPinChangeRef.current?.({ lat: ll.lat, lng: ll.lng });
        });
      }
      pin.addTo(map);
      pinRef.current = pin;
    }

    if (!fittedRef.current) {
      const fitPts: LatLngExpression[] = [
        ...editableRing.map((p) => [p.lat, p.lng] as LatLngExpression),
        ...overlays.flatMap((o) => o.ring.map((p) => [p.lat, p.lng] as LatLngExpression)),
      ];
      if (draggablePin) fitPts.push([draggablePin.lat, draggablePin.lng]);
      if (fitPts.length >= 2) {
        map.fitBounds(L.latLngBounds(fitPts), { padding: [40, 40], maxZoom: 16 });
        fittedRef.current = true;
      } else if (fitPts.length === 1) {
        map.setView(fitPts[0]!, 16);
        fittedRef.current = true;
      }
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [
    mapReady,
    editableRing,
    overlays,
    overlaysKey,
    draggablePin,
    onPinChange,
    pinLabel,
    editMode,
  ]);

  return (
    <div
      id={`admin-zone-map-${domId}`}
      className={`admin-zone-map${fill ? " admin-zone-map--fill" : ""}`}
      style={{
        height: typeof height === "number" ? `${String(height)}px` : height,
        width: "100%",
        borderRadius: fill ? 0 : 16,
        overflow: "hidden",
        zIndex: 0,
      }}
    />
  );
}
