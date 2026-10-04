"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { NotificationBell } from "../components/notification-bell";
import { ProviderList } from "../components/provider-list";
import type { ProviderListing } from "../../lib/providers";

const KVL = "kim-van-kim-lu";

type LateProvider = ProviderListing & {
  lateNightUntil?: string;
  lateNightFrom?: string;
};

export default function LateNightPage() {
  const [providers, setProviders] = useState<LateProvider[]>([]);
  const [nowHhMm, setNowHhMm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const discovery = await api<{ zoneId: string; slug: string }>(`/zones/${KVL}/discovery`);
        const res = await api<{
          nowHhMm: string;
          providers: LateProvider[];
        }>(`/zones/${discovery.zoneId}/late-night`);
        setNowHhMm(res.nowHhMm);
        setProviders(res.providers);
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
      <div className="header-row" style={{ marginBottom: 12 }}>
        <div>
          <p className="eyebrow">Góc ăn khuya</p>
          <h1 className="page-title" style={{ margin: 0 }}>
            Ăn khuya
          </h1>
          <p className="stat">
            Quán đang bán khuya
            {nowHhMm ? ` · ${nowHhMm}` : ""}
          </p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {error ? (
        <div className="card">
          <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p>
          <Link href="/login" className="btn" style={{ marginTop: 12, display: "inline-block" }}>
            Đăng nhập
          </Link>
        </div>
      ) : providers.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>Chưa có quán bán khuya trong khung giờ này.</p>
          <p className="stat" style={{ marginTop: 8 }}>
            Quán bật «Bán khuya» và đang mở cửa mới hiện ở đây.
          </p>
          <Link href="/" className="stat" style={{ display: "inline-block", marginTop: 12 }}>
            ← Về trang chủ
          </Link>
        </div>
      ) : (
        <ProviderList
          providers={providers.map((p) => ({
            ...p,
            tagline: p.lateNightUntil
              ? `Bán đến ${p.lateNightUntil}${p.tagline ? ` · ${p.tagline}` : ""}`
              : p.tagline,
          }))}
        />
      )}
    </div>
  );
}
