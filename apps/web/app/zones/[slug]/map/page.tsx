"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { HOME_CATEGORIES } from "../../../../lib/categories";
import { getCurrentPositionOnce, type GeoPosition } from "../../../../lib/geolocation";
import { pickeeNavigateHref } from "../../../../lib/maps";
import { liveStatusClass, liveStatusLabel, type ProviderListing } from "../../../../lib/providers";
import { PickeeMap, type MapMarker, type MapPolygonGeoJson } from "../../../components/pickee-map";
import { ProviderCardCompact } from "../../../components/provider-card-compact";

type MapResponse = {
  zoneId: string;
  slug?: string;
  displayName?: string;
  center: { lat: number; lng: number };
  boundary?: MapPolygonGeoJson | null;
  markers: ProviderListing[];
};

export default function ZoneMapPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const focusId = search.get("locationId") ?? search.get("focus");
  const initialOpen = search.get("open") === "1" || search.get("open") === "true";
  const initialCategory = search.get("category") ?? "";
  const initialTypes = search.get("types") ?? "";

  const [data, setData] = useState<MapResponse | null>(null);
  const [userPos, setUserPos] = useState<GeoPosition | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [openOnly, setOpenOnly] = useState(initialOpen);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);

  const typesParam = useMemo(() => {
    if (initialTypes.trim()) return initialTypes.trim();
    const cat = HOME_CATEGORIES.find((c) => c.id === categoryId);
    return cat ? cat.providerTypes.join(",") : "";
  }, [categoryId, initialTypes]);

  const loadMap = useCallback(async () => {
    const qs = new URLSearchParams();
    if (openOnly) qs.set("open", "1");
    if (typesParam) qs.set("types", typesParam);
    const q = qs.toString();
    const res = await api<MapResponse>(`/zones/${params.slug}/map${q ? `?${q}` : ""}`);
    setData(res);
  }, [params.slug, openOnly, typesParam]);

  useEffect(() => {
    void api("/me")
      .then(() => loadMap())
      .catch(() => router.replace("/login"));
  }, [loadMap, router]);

  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  async function locateMe() {
    setLocating(true);
    const result = await getCurrentPositionOnce({
      fallback: data?.center ?? null,
    });
    setUserPos(result.position);
    setGpsNote(
      result.source === "gps"
        ? "Đã gắn vị trí hiện tại (một lần — không theo dõi liên tục)"
        : `Dùng tâm Zone — ${result.error ?? "GPS không sẵn"}`,
    );
    setLocating(false);
  }

  const mapMarkers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    const list: MapMarker[] = data.markers
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) => ({
        id: m.locationId,
        lat: m.lat!,
        lng: m.lng!,
        label: m.brandName,
        kind: "provider" as const,
        status: m.liveStatus,
      }));
    if (userPos) {
      list.push({
        id: "user",
        lat: userPos.lat,
        lng: userPos.lng,
        label: "Bạn",
        kind: "user",
      });
    }
    return list;
  }, [data, userPos]);

  const selected = useMemo(
    () => data?.markers.find((m) => m.locationId === selectedId) ?? null,
    [data, selectedId],
  );

  const center = userPos ?? data?.center ?? { lat: 20.9883, lng: 105.8414 };

  if (!data) {
    return (
      <div className="container">
        <p className="tagline">Đang tải bản đồ…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <Link href="/" className="stat">
        ← Trang chủ
      </Link>
      <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>
        Bản đồ {data.displayName ?? "Zone"}
      </h1>
      <p className="stat" style={{ marginBottom: 12 }}>
        Chạm marker để xem nhanh · OpenStreetMap
      </p>

      <div className="map-filter-row" aria-label="Lọc bản đồ">
        <button
          type="button"
          className={`map-filter-chip ${!openOnly ? "is-active" : ""}`}
          onClick={() => setOpenOnly(false)}
        >
          Tất cả
        </button>
        <button
          type="button"
          className={`map-filter-chip ${openOnly ? "is-active" : ""}`}
          onClick={() => setOpenOnly(true)}
        >
          Đang mở
        </button>
        {HOME_CATEGORIES.slice(0, 6).map((c) => (
          <button
            key={c.id}
            type="button"
            className={`map-filter-chip ${categoryId === c.id ? "is-active" : ""}`}
            onClick={() => setCategoryId((prev) => (prev === c.id ? "" : c.id))}
          >
            {c.shortLabel}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", padding: "8px 14px" }}
          disabled={locating}
          onClick={() => void locateMe()}
        >
          {locating ? "Đang lấy vị trí…" : userPos ? "Cập nhật vị trí" : "Gắn vị trí của tôi"}
        </button>
      </div>
      {gpsNote ? <p className="stat" style={{ marginBottom: 12 }}>{gpsNote}</p> : null}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <PickeeMap
          center={center}
          markers={mapMarkers}
          polygon={data.boundary ?? null}
          focusId={selectedId}
          height={360}
          compactMarkers
          clusterThreshold={8}
          onMarkerSelect={(id) => {
            if (id === "user") return;
            setSelectedId(id);
          }}
        />
      </div>

      {selected ? (
        <div className="map-bottom-sheet" role="dialog" aria-label="Xem nhanh quán">
          <div className="map-bottom-sheet-handle" aria-hidden />
          <button
            type="button"
            className="map-bottom-sheet-close"
            aria-label="Đóng"
            onClick={() => setSelectedId(null)}
          >
            ×
          </button>
          <ProviderCardCompact provider={selected} />
          <div className="map-bottom-sheet-actions">
            <Link href={`/locations/${selected.locationId}`} className="btn" style={{ flex: 1 }}>
              Mở quán
            </Link>
            {selected.lat != null && selected.lng != null ? (
              <a
                className="btn btn-secondary"
                style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
                href={pickeeNavigateHref({
                  destLat: selected.lat,
                  destLng: selected.lng,
                  label: selected.brandName,
                  originLat: userPos?.lat,
                  originLng: userPos?.lng,
                })}
              >
                Chỉ đường
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Quán trên bản đồ ({data.markers.length})</p>
          {data.markers.length === 0 ? (
            <p className="stat" style={{ margin: 0 }}>
              Không có quán khớp bộ lọc
            </p>
          ) : (
            <div className="provider-list" style={{ marginTop: 8 }}>
              {data.markers.slice(0, 8).map((m) => (
                <button
                  key={m.locationId}
                  type="button"
                  className="map-list-row"
                  onClick={() => setSelectedId(m.locationId)}
                >
                  <span>{m.brandName}</span>
                  <span className={`live-pill ${liveStatusClass(m.liveStatus)}`}>
                    {liveStatusLabel(m.liveStatus)}
                  </span>
                </button>
              ))}
              {data.markers.length > 8 ? (
                <p className="stat" style={{ margin: "8px 0 0" }}>
                  +{String(data.markers.length - 8)} quán — chạm marker hoặc thu phóng để xem.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
