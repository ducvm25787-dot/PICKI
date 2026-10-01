"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { NotificationBell } from "../components/notification-bell";

type Kitchen = {
  locationId: string;
  brandName: string;
  displayName: string;
};

type ZoneInfo = { zoneId: string; slug: string };

const KVL = "kim-van-kim-lu";

export default function LunchListPage() {
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
          `/zones/${discovery.zoneId}/breakfast-preorder?daypart=LUNCH`,
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

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Bữa trưa vui vẻ</h1>
          <p className="stat">09:00–13:00 · {serviceDate}</p>
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
            Chưa có quán nào đang bán trưa trong khung 09:00–13:00.
          </p>
        </div>
      ) : null}

      <div className="provider-list">
        {kitchens.map((k) => (
          <Link
            key={k.locationId}
            href={`/breakfast/${k.locationId}?zoneId=${zone?.zoneId ?? ""}&daypart=LUNCH`}
            className="provider-card"
          >
            <h3 style={{ margin: "0 0 4px" }}>{k.brandName}</h3>
            <p className="stat" style={{ margin: 0 }}>
              {k.displayName}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
