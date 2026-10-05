"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HomeDishCard, type TodaySpecial } from "../../components/home-dish-rail";
import { api } from "../../../lib/api";
import { marketTierBadge } from "@picki/shared";

const RAILS = {
  special: {
    label: "Đặc biệt hôm nay",
    hint: "Món được duyệt lên mục này.",
    source: "today_special",
    pick: (home: HomePayload) => home.todaySpecials ?? [],
    badge: (item: TodaySpecial) =>
      item.listAmountVnd && item.amountVnd && item.listAmountVnd > item.amountVnd
        ? "Ưu đãi giảm giá"
        : "Đặc biệt",
  },
  snacks: {
    label: "Ăn vặt & Tráng miệng",
    hint: "Thèm gì gọi nấy quanh nhà",
    source: "snack_dessert",
    pick: (home: HomePayload) => home.snackDesserts ?? [],
    badge: (item: TodaySpecial) => item.categoryName ?? "Ăn vặt",
  },
  market: {
    label: "Hôm nay có",
    hint: "Bài đã được Zone duyệt.",
    source: "market_today",
    pick: (home: HomePayload) => home.marketToday ?? [],
    badge: (item: TodaySpecial) => item.providerClass ?? marketTierBadge(item.providerType) ?? "Hôm nay có",
  },
} as const;

type RailId = keyof typeof RAILS;

type HomePayload = {
  zoneId?: string;
  todaySpecials?: TodaySpecial[];
  snackDesserts?: TodaySpecial[];
  marketToday?: TodaySpecial[];
};

export default function HomePushesPage() {
  const params = useParams<{ rail: string }>();
  const rail = RAILS[params.rail as RailId];
  const [items, setItems] = useState<TodaySpecial[] | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rail) return;
    void api<HomePayload>("/zones/kim-van-kim-lu/home")
      .then((home) => {
        setZoneId(home.zoneId ?? null);
        setItems(rail.pick(home));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được"));
  }, [rail]);

  if (!rail) {
    return (
      <div className="container">
        <p className="tagline">Không thấy mục này.</p>
        <Link href="/">Về trang chủ</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <Link href="/" className="stat">
        ← Trang chủ
      </Link>
      <div className="section-head" style={{ marginTop: 12 }}>
        <h1 className="section-title">{rail.label}</h1>
      </div>
      <p className="tagline">{rail.hint}</p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {items == null && !error ? <p className="tagline">Đang tải…</p> : null}
      {items && items.length === 0 ? <p className="stat">Chưa có bài nào.</p> : null}
      {items && items.length > 0 ? (
        <div className="today-hero-grid">
          {items.map((item) => (
            <HomeDishCard
              key={item.id}
              item={item}
              badge={rail.badge(item)}
              zoneId={zoneId}
              trackSource={rail.source}
            />
          ))}
        </div>
      ) : null}
      {params.rail === "market" ? (
        <Link href="/zones/kim-van-kim-lu/browse/market" className="familiar-cta" style={{ marginTop: 16 }}>
          Đi chợ ngay
        </Link>
      ) : null}
    </div>
  );
}
