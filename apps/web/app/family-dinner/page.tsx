"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatVnd } from "../../lib/money";
import { NotificationBell } from "../components/notification-bell";

type Kitchen = {
  locationId: string;
  brandName: string;
  displayName: string;
  cutoffTime: string;
  acceptingPreorder: boolean;
};

type LateOffer = {
  id: string;
  locationId?: string;
  brandName?: string;
  displayName?: string;
  title: string;
  priceVnd: number;
  remainingCapacity: number;
  capacity?: number;
  etaMinutes: number;
  available: boolean;
  items?: { name: string; category: string; quantityPerTray: number }[];
};

type ZoneInfo = { zoneId: string; slug: string };

const KVL = "kim-van-kim-lu";

export default function FamilyDinnerListPage() {
  const [zone, setZone] = useState<ZoneInfo | null>(null);
  const [serviceDate, setServiceDate] = useState("");
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [lateOffers, setLateOffers] = useState<LateOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const discovery = await api<{ zoneId: string; slug: string }>(`/zones/${KVL}/discovery`);
        setZone({ zoneId: discovery.zoneId, slug: discovery.slug });
        const [res, late] = await Promise.all([
          api<{ serviceDate: string; providers: Kitchen[] }>(
            `/zones/${discovery.zoneId}/family-dinner`,
          ),
          api<{ serviceDate: string; offers: LateOffer[] }>(
            `/zones/${discovery.zoneId}/family-dinner/late`,
          ).catch(() => ({ serviceDate: "", offers: [] as LateOffer[] })),
        ]);
        setServiceDate(res.serviceDate || late.serviceDate);
        setKitchens(res.providers);
        setLateOffers(late.offers.filter((o) => o.available !== false && o.remainingCapacity > 0));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Bữa tối ấm cúng</h1>
          <p className="stat">Tối nay nhà mình ăn gì? · {serviceDate}</p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {error ? (
        <div className="card">
          <p>{error}</p>
        </div>
      ) : null}

      {lateOffers.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Bữa tối muộn</p>
          <p className="stat" style={{ marginTop: 0 }}>
            Tối nay vẫn còn gì ngon? — xem thực đơn & số suất còn lại
          </p>
          <div className="provider-list">
            {lateOffers.map((o) => (
              <Link
                key={o.id}
                href={`/family-dinner/late/${o.id}?zoneId=${zone?.zoneId ?? ""}&locationId=${o.locationId ?? ""}`}
                className="provider-card"
              >
                <h3 style={{ margin: "0 0 4px" }}>{o.title}</h3>
                <p className="stat" style={{ margin: 0 }}>
                  {o.brandName ?? o.displayName ?? "Bếp"} · {formatVnd(o.priceVnd)}
                </p>
                {o.items?.length ? (
                  <p className="stat" style={{ margin: "6px 0 0" }}>
                    Thực đơn: {o.items.map((i) => i.name).join(" · ")}
                  </p>
                ) : null}
                <p className="stat" style={{ margin: "6px 0 0" }}>
                  Còn <strong>{o.remainingCapacity}</strong>
                  {o.capacity != null ? `/${o.capacity}` : ""} suất · giao ~{o.etaMinutes} phút →
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {!error && kitchens.length === 0 && lateOffers.length === 0 ? (
        <div className="card">
          <p className="stat">Chưa có bếp nhận preorder tối nay.</p>
          <Link href="/" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Về trang chủ
          </Link>
        </div>
      ) : kitchens.length > 0 ? (
        <div className="provider-list">
          {kitchens.map((k) => (
            <Link
              key={k.locationId}
              href={`/family-dinner/${k.locationId}?zoneId=${zone?.zoneId ?? ""}`}
              className="provider-card"
            >
              <h3 style={{ margin: "0 0 4px" }}>{k.brandName}</h3>
              <p className="stat" style={{ margin: 0 }}>
                {k.displayName}
              </p>
              <p className="stat" style={{ margin: "8px 0 0" }}>
                {k.acceptingPreorder
                  ? `Đang nhận đơn tới ${k.cutoffTime}`
                  : `Đã qua cutoff ${k.cutoffTime}`}
                {" · "}
                Chọn 4 món →
              </p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
