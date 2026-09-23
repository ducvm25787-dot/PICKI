"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { formatOrderAmount } from "../../lib/money";
import { BrandMark } from "../components/brand-mark";
import { NotificationBell } from "../components/notification-bell";

type ActivityBucket = "active" | "upcoming" | "done";

type ActivityItem = {
  id: string;
  kind: "order" | "service_request" | "visit_intent";
  bucket: ActivityBucket;
  title: string;
  statusLabel: string;
  detail: string | null;
  amountVnd: number | null;
  href: string;
  createdAt: string;
  meta: {
    orderNumber?: string;
    requestNumber?: string;
    orderKind?: string;
    serviceVertical?: string;
  };
};

type TabId = "active" | "upcoming" | "done";

const TABS: { id: TabId; label: string }[] = [
  { id: "active", label: "Đang xử lý" },
  { id: "upcoming", label: "Sắp tới" },
  { id: "done", label: "Đã xong" },
];

function ActivityCard({ item }: { item: ActivityItem }) {
  const secondary = item.meta.orderNumber ?? item.meta.requestNumber ?? null;

  return (
    <Link
      href={item.href}
      className="provider-card activity-card"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div className="activity-card-head">
        <strong className="activity-card-title">{item.title}</strong>
        {item.amountVnd != null ? (
          <span className="activity-card-amount">
            {formatOrderAmount(item.amountVnd, item.meta.serviceVertical)}
          </span>
        ) : null}
      </div>
      <p className="activity-card-status">{item.statusLabel}</p>
      {item.detail ? <p className="activity-card-detail">{item.detail}</p> : null}
      <div className="activity-card-foot">
        {secondary ? <span className="stat">{secondary}</span> : <span />}
        <span className="activity-card-cta">Theo dõi →</span>
      </div>
    </Link>
  );
}

function ActivityPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const tabParam = search.get("tab");
  const initialTab: TabId =
    tabParam === "upcoming" || tabParam === "done" || tabParam === "active"
      ? tabParam
      : "active";

  const [tab, setTab] = useState<TabId>(initialTab);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await api("/me");
      const res = await api<{ items: ActivityItem[] }>("/me/activity");
      setItems(res.items ?? []);
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const filtered = useMemo(() => items.filter((i) => i.bucket === tab), [items, tab]);

  function selectTab(next: TabId) {
    setTab(next);
    router.replace(`/activity?tab=${next}`, { scroll: false });
  }

  return (
    <div className="container">
      <div className="header-row">
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark />
        </Link>
        <NotificationBell audience="customer" />
      </div>
      <h1 style={{ fontSize: 22, margin: "8px 0 12px" }}>Hoạt động</h1>

      <div className="filter-chip-row" style={{ marginLeft: 0, marginRight: 0, padding: "0 0 8px" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="stat">Đang tải…</p>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            {tab === "active"
              ? "Chưa có việc đang xử lý."
              : tab === "upcoming"
                ? "Chưa có lịch sắp tới."
                : "Chưa có hoạt động gần đây."}
          </p>
          <Link href="/" className="order-phone-link" style={{ display: "inline-block", marginTop: 10 }}>
            Về trang chủ →
          </Link>
        </div>
      ) : (
        <div className="provider-list">
          {filtered.map((item) => (
            <ActivityCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      )}

      <p className="stat" style={{ marginTop: 16 }}>
        <Link href="/orders">Đơn hàng (cũ) →</Link>
        {" · "}
        <Link href="/requests">Yêu cầu (cũ) →</Link>
      </p>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <p className="tagline">Đang tải…</p>
        </div>
      }
    >
      <ActivityPageInner />
    </Suspense>
  );
}
