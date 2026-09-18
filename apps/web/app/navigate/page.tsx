"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PickeeMap, type MapMarker } from "../components/pickee-map";
import { getCurrentPositionOnce, watchPositionLive, type GeoPosition } from "../../lib/geolocation";
import { mapsDirectionsUrl } from "../../lib/maps";
import {
  TRAVEL_MODES,
  fetchRoute,
  formatDistance,
  formatDuration,
  parseTravelMode,
  suggestTravelMode,
  travelModeMeta,
  type PickeeRoute,
  type TravelMode,
} from "../../lib/routing";

function parseNum(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function NavigateInner() {
  const sp = useSearchParams();
  const destLat = parseNum(sp.get("destLat"));
  const destLng = parseNum(sp.get("destLng"));
  const label = sp.get("label")?.trim() || "Điểm đến";
  const qOriginLat = parseNum(sp.get("originLat"));
  const qOriginLng = parseNum(sp.get("originLng"));
  const modeFromUrl = sp.get("mode");
  const hasExplicitMode = modeFromUrl != null && modeFromUrl !== "";

  const destOk = destLat != null && destLng != null;

  const [origin, setOrigin] = useState<GeoPosition | null>(
    qOriginLat != null && qOriginLng != null ? { lat: qOriginLat, lng: qOriginLng } : null,
  );
  const [mode, setMode] = useState<TravelMode>(() =>
    hasExplicitMode ? parseTravelMode(modeFromUrl) : "walk",
  );
  const [modeReady, setModeReady] = useState(hasExplicitMode);
  const [route, setRoute] = useState<PickeeRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [livePos, setLivePos] = useState<GeoPosition | null>(null);

  useEffect(() => {
    if (origin) return;
    void getCurrentPositionOnce({ timeoutMs: 10_000, enableHighAccuracy: true }).then((r) => {
      setOrigin(r.position);
      if (r.source === "fallback" && r.error) setError(r.error);
    });
  }, [origin]);

  // Gợi ý mode theo khoảng cách Zone (≤900m → đi bộ) khi URL không chỉ định
  useEffect(() => {
    if (hasExplicitMode || !origin || !destOk) return;
    setMode(suggestTravelMode(origin, { lat: destLat!, lng: destLng! }));
    setModeReady(true);
  }, [hasExplicitMode, origin, destOk, destLat, destLng]);

  useEffect(() => {
    if (!destOk || !origin || !modeReady) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchRoute(origin, { lat: destLat!, lng: destLng! }, mode).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r) {
        setRoute(null);
        setError("Không lấy được lộ trình. Thử đổi phương tiện hoặc mở Google Maps.");
        return;
      }
      setRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [destOk, destLat, destLng, origin?.lat, origin?.lng, mode, modeReady]);

  useEffect(() => {
    if (!navigating) {
      setLivePos(null);
      return;
    }
    const { stop } = watchPositionLive((pos) => setLivePos(pos), { enableHighAccuracy: true });
    return () => stop();
  }, [navigating]);

  const displayOrigin = livePos ?? origin;
  const modeMeta = travelModeMeta(mode);

  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];
    if (displayOrigin) {
      list.push({
        id: "you",
        lat: displayOrigin.lat,
        lng: displayOrigin.lng,
        kind: "user",
        label: "Bạn",
      });
    }
    if (destOk) {
      list.push({
        id: "dest",
        lat: destLat!,
        lng: destLng!,
        kind: "provider",
        label: label.slice(0, 12),
      });
    }
    return list;
  }, [displayOrigin, destOk, destLat, destLng, label]);

  const mapCenter =
    displayOrigin ?? (destOk ? { lat: destLat!, lng: destLng! } : { lat: 20.9883, lng: 105.8414 });

  const googleHref = destOk
    ? mapsDirectionsUrl({
        destLat: destLat!,
        destLng: destLng!,
        originLat: displayOrigin?.lat,
        originLng: displayOrigin?.lng,
        travelMode: modeMeta.googleTravelMode,
      })
    : null;

  function selectMode(next: TravelMode) {
    if (next === mode) return;
    setNavigating(false);
    setMode(next);
    setModeReady(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  if (!destOk) {
    return (
      <div className="container" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <p className="stat">Thiếu điểm đến. Quay lại và chọn Chỉ đường từ tiệm hoặc điểm giao.</p>
        <a href="/" className="btn" style={{ display: "inline-block", marginTop: 12 }}>
          Về trang chủ
        </a>
      </div>
    );
  }

  return (
    <div className="navigate-shell">
      <div className="navigate-map-wrap">
        <PickeeMap
          center={mapCenter}
          zoom={navigating ? 17 : 15}
          markers={markers}
          routePath={route?.path ?? null}
          height="100%"
          fitMarkers={!navigating}
          followCenter={navigating}
          className="navigate-map"
        />
      </div>

      <div className="navigate-sheet card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <p className="section-title" style={{ margin: 0 }}>
              {label}
            </p>
            {loading ? <p className="stat" style={{ margin: "6px 0 0" }}>Đang tính lộ trình…</p> : null}
            {route && !loading ? (
              <p className="stat" style={{ margin: "6px 0 0" }}>
                {modeMeta.label} · {formatDistance(route.distanceM)} · {formatDuration(route.durationS)}
                {navigating ? " · Đang dẫn đường" : ""}
              </p>
            ) : null}
            {error && !route ? (
              <p className="stat" style={{ margin: "6px 0 0", color: "var(--danger, #dc2626)" }}>
                {error}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="stat"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              whiteSpace: "nowrap",
              textDecoration: "underline",
            }}
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
              else window.location.href = "/";
            }}
          >
            Đóng
          </button>
        </div>

        {!navigating ? (
          <div className="navigate-mode-row" role="group" aria-label="Phương tiện">
            {TRAVEL_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`navigate-mode-chip${mode === m.id ? " is-active" : ""}`}
                onClick={() => selectMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {!navigating ? (
            <button
              type="button"
              className="btn"
              disabled={!route || loading}
              onClick={() => setNavigating(true)}
              style={{ flex: 1, minWidth: 140 }}
            >
              Bắt đầu
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => setNavigating(false)}
              style={{ flex: 1, minWidth: 140, background: "#57534e" }}
            >
              Dừng
            </button>
          )}
          {googleHref ? (
            <a
              href={googleHref}
              className="order-phone-link"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", padding: "10px 14px" }}
            >
              Google Maps
            </a>
          ) : null}
        </div>

        {route && route.steps.length > 0 ? (
          <ol
            className="navigate-steps"
            style={{
              margin: "16px 0 0",
              padding: "0 0 0 18px",
              maxHeight: navigating ? 120 : 220,
              overflow: "auto",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {route.steps.map((s, i) => (
              <li key={`${String(i)}-${s.instruction}`} style={{ marginBottom: 8 }}>
                <strong style={{ fontWeight: 600 }}>{s.instruction}</strong>
                {s.distanceM > 0 ? (
                  <span className="stat" style={{ marginLeft: 6 }}>
                    {formatDistance(s.distanceM)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        <p className="stat" style={{ margin: "12px 0 0", fontSize: 12 }}>
          Zone gần: ưu tiên đi bộ / xe máy / xe đạp. GPS chỉ khi đang dẫn đường — không lưu hành trình.
        </p>
      </div>
    </div>
  );
}

export default function NavigatePage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: 32 }}>
          <p className="stat">Đang mở chỉ đường…</p>
        </div>
      }
    >
      <NavigateInner />
    </Suspense>
  );
}
