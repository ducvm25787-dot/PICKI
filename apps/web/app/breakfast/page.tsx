"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { vnClock } from "@picki/shared";
import { NotificationBell } from "../components/notification-bell";

type Kitchen = {
  locationId: string;
  brandName: string;
  displayName: string;
  cutoffTime: string;
  openFromTime?: string;
  acceptingPreorder: boolean;
};

type ZoneInfo = { zoneId: string; slug: string };

const KVL = "kim-van-kim-lu";

export default function BreakfastListPage() {
  const [zone, setZone] = useState<ZoneInfo | null>(null);
  const [serviceDate, setServiceDate] = useState("");
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const discovery = await api<{ zoneId: string; slug: string }>(`/zones/${KVL}/discovery`);
        setZone({ zoneId: discovery.zoneId, slug: discovery.slug });
        const res = await api<{ serviceDate: string; providers: Kitchen[] }>(
          `/zones/${discovery.zoneId}/breakfast-preorder`,
        );
        setServiceDate(res.serviceDate);
        setKitchens(res.providers);
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

  const morning = vnClock().hm >= "06:00" && vnClock().hm < "09:00";

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{morning ? "Ăn sáng" : "Sáng mai ăn gì?"}</h1>
          <p className="stat">
            {morning ? "Suất còn lại · giao quanh nhà" : "Đặt tối — giao sáng"} · {serviceDate}
          </p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {error ? (
        <div className="card">
          <p>{error}</p>
        </div>
      ) : null}

      {!error && kitchens.length === 0 ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Chưa có quán nào đang nhận đặt sáng. Quay lại sau 20:00 hoặc thử ngày khác.
          </p>
        </div>
      ) : null}

      <div className="provider-list">
        {kitchens.map((k) => (
          <Link
            key={k.locationId}
            href={`/breakfast/${k.locationId}?zoneId=${zone?.zoneId ?? ""}`}
            className="provider-card"
          >
            <h3 style={{ margin: "0 0 4px" }}>{k.brandName}</h3>
            <p className="stat" style={{ margin: 0 }}>
              {k.displayName}
            </p>
            <p className="stat" style={{ margin: "6px 0 0" }}>
              Chốt đơn {k.cutoffTime} tối hôm trước →
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
