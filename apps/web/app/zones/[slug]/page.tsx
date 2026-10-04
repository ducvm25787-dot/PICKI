"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getCurrentPositionOnce } from "../../../lib/geolocation";
import { type ProviderListing } from "../../../lib/providers";
import { ProviderList } from "../../components/provider-list";

type ZonePreview = {
  id: string;
  slug: string;
  displayName: string;
  memberCount: number;
  providerCount: number;
  tagline: string;
};

export default function ZonePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [zone, setZone] = useState<ZonePreview | null>(null);
  const [joined, setJoined] = useState(false);
  const [building, setBuilding] = useState("CT12A");
  const [apartment, setApartment] = useState("1808");
  const [floor, setFloor] = useState("18");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<ProviderListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gpsHint, setGpsHint] = useState<string | null>(null);
  const [insideZone, setInsideZone] = useState<boolean | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await api("/me").catch(() => {
          router.replace("/login");
          throw new Error("auth");
        });
        const preview = await api<ZonePreview>(`/zones/${params.slug}/preview`);
        setZone(preview);
        const [mine, listing] = await Promise.all([
          api<{ zones: { slug: string }[] }>("/zones/mine"),
          api<{ providers: ProviderListing[] }>(`/zones/${params.slug}/providers`),
        ]);
        setJoined(mine.zones.some((z) => z.slug === params.slug));
        setProviders(listing.providers);
      } catch (e) {
        if (e instanceof Error && e.message !== "auth") {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.slug, router]);

  useEffect(() => {
    if (!zone || joined) return;
    let cancel = false;
    void (async () => {
      const geo = await getCurrentPositionOnce();
      if (cancel) return;
      if (geo.source !== "gps") {
        setInsideZone(false);
        setGpsHint(geo.error ?? "Không lấy được GPS. Chỉ tham gia khi đứng trong Zone.");
        return;
      }
      try {
        const found = await api<{ zones: { id: string }[] }>("/zones/discover", {
          method: "POST",
          body: JSON.stringify(geo.position),
        });
        if (cancel) return;
        const ok = found.zones.some((z) => z.id === zone.id);
        setInsideZone(ok);
        setGpsHint(
          ok
            ? "GPS đang nằm trong Zone — có thể tham gia"
            : "GPS đang ở ngoài Zone này. Vào trong khu rồi thử lại.",
        );
      } catch {
        if (!cancel) {
          setInsideZone(false);
          setGpsHint("Không kiểm tra được vị trí.");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [zone, joined]);

  async function join() {
    if (!zone) return;
    setSubmitting(true);
    setError(null);
    try {
      const geo = await getCurrentPositionOnce();
      if (geo.source !== "gps") {
        setError(geo.error ?? "Không lấy được GPS. Chỉ tham gia khi đứng trong Zone.");
        return;
      }
      setGpsHint("Đã dùng vị trí GPS (một lần) để join Zone");
      await api(`/zones/${zone.id}/join`, {
        method: "POST",
        body: JSON.stringify({
          lat: geo.position.lat,
          lng: geo.position.lng,
          addressType: "RESIDENTIAL",
          label: "HOME",
          building,
          floor,
          apartment,
          deliveryNote: "",
        }),
      });
      setJoined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tham gia được");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="container">
        <div className="card">{error ?? "Không tìm thấy Zone"}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: "auto", marginBottom: 16, padding: "8px 12px" }}
        onClick={() => router.push("/")}
      >
        ← Trang chủ
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>{zone.displayName}</h1>
        <p className="stat">
          {zone.memberCount.toLocaleString("vi-VN")} thành viên · {zone.providerCount} provider
        </p>
        <p style={{ fontSize: 18, margin: "20px 0 8px" }}>{zone.tagline}</p>
        <p className="stat">
          Cho Pickee biết bạn ở đâu để phục vụ bạn tốt hơn — không phải xác minh cư trú.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Provider quanh bạn</p>
        <ProviderList providers={providers} />
      </div>

      {joined ? (
        <div className="card">
          <p style={{ fontWeight: 600, marginTop: 0 }}>✓ Bạn đã tham gia Zone này</p>
          <p className="stat">
            {building}-{apartment} · Menu & đặt món sprint tiếp theo
          </p>
        </div>
      ) : insideZone ? (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Tham gia Zone</h2>
          <div className="field">
            <label htmlFor="building">Tòa nhà</label>
            <input id="building" value={building} onChange={(e) => setBuilding(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="floor">Tầng</label>
            <input id="floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="apartment">Căn hộ</label>
            <input id="apartment" value={apartment} onChange={(e) => setApartment(e.target.value)} />
          </div>
          {gpsHint ? <p className="stat">{gpsHint}</p> : null}
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="button" className="btn" disabled={submitting} onClick={() => void join()}>
            {submitting ? "Đang tham gia…" : "Tham gia Zone (dùng GPS một lần)"}
          </button>
          <p className="stat" style={{ marginTop: 8 }}>
            Pickee chỉ lấy vị trí lúc join — không theo dõi liên tục.
          </p>
        </div>
      ) : (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Chưa ở trong Zone</h2>
          <p className="stat">
            {gpsHint ?? "Đang đọc vị trí… Chỉ tham gia được khi GPS nằm trong khu."}
          </p>
          <p className="stat">
            Tài khoản đã tham gia vẫn dùng được dịch vụ khi ra ngoài. Đơn mới giao về địa chỉ nhà, không giao tại chỗ đang đứng.
          </p>
        </div>
      )}
    </div>
  );
}
