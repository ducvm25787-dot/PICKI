"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { liveStatusClass, liveStatusLabel, type ProviderListing } from "../../../../lib/providers";

type MapResponse = {
  center: { lat: number; lng: number };
  markers: ProviderListing[];
};

export default function ZoneMapPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [data, setData] = useState<MapResponse | null>(null);

  useEffect(() => {
    void api("/me")
      .then(() => api<MapResponse>(`/zones/${params.slug}/map`))
      .then(setData)
      .catch(() => router.replace("/login"));
  }, [params.slug, router]);

  if (!data) {
    return (
      <div className="container">
        <p className="tagline">Đang tải bản đồ…</p>
      </div>
    );
  }

  const latSpan = 0.004;
  const lngSpan = 0.004;

  return (
    <div className="container">
      <Link href="/" className="stat">
        ← Trang chủ
      </Link>
      <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Live Map</h1>
      <p className="stat" style={{ marginBottom: 12 }}>
        Quán mở trong Zone — pilot map đơn giản (S12)
      </p>

      <div
        className="card"
        style={{
          position: "relative",
          height: 320,
          background: "linear-gradient(180deg, #e8f4ea 0%, #d4e8d8 100%)",
          overflow: "hidden",
        }}
      >
        {data.markers.map((m) => {
          if (m.lat == null || m.lng == null) return null;
          const top =
            ((data.center.lat + latSpan / 2 - m.lat) / latSpan) * 100;
          const left =
            ((m.lng - (data.center.lng - lngSpan / 2)) / lngSpan) * 100;
          return (
            <Link
              key={m.locationId}
              href={`/locations/${m.locationId}`}
              title={m.brandName}
              style={{
                position: "absolute",
                top: `${String(Math.min(92, Math.max(4, top)))}%`,
                left: `${String(Math.min(92, Math.max(4, left)))}%`,
                transform: "translate(-50%, -50%)",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 8px",
                borderRadius: 8,
                background: "white",
                border: "2px solid var(--accent)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                color: "inherit",
              }}
            >
              <span className={`live-pill ${liveStatusClass(m.liveStatus)}`} style={{ marginRight: 4 }}>
                {liveStatusLabel(m.liveStatus)}
              </span>
              {m.brandName.split(" ")[0]}
            </Link>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {data.markers.map((m) => (
          <p key={m.locationId} className="stat" style={{ margin: "0 0 8px" }}>
            <Link href={`/locations/${m.locationId}`}>{m.brandName}</Link> ·{" "}
            {liveStatusLabel(m.liveStatus)}
            {m.etaMinutes != null ? ` · ~${String(m.etaMinutes)} phút` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}
