"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { BrandMark } from "../../components/brand-mark";

type NotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export default function MeNotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api<{ unreadCount: number; notifications: NotificationItem[] }>(
        "/notifications?limit=50",
      );
      setItems(res.notifications ?? []);
      setUnread(res.unreadCount ?? 0);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAll() {
    await api("/notifications/read-all", { method: "PATCH" });
    await load();
  }

  return (
    <div className="container">
      <div className="header-row">
        <Link href="/me" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark />
        </Link>
      </div>
      <div className="section-head">
        <h1 style={{ fontSize: 22, margin: 0 }}>Thông báo</h1>
        {unread > 0 ? (
          <button type="button" className="notification-mark-all" onClick={() => void markAll()}>
            Đọc hết
          </button>
        ) : null}
      </div>
      <Link href="/me" className="stat" style={{ display: "inline-block", marginBottom: 12 }}>
        ← Tôi
      </Link>
      {items.length === 0 ? (
        <p className="stat">Chưa có thông báo.</p>
      ) : (
        <div className="provider-list">
          {items.map((n) => (
            <article
              key={n.id}
              className={`provider-card ${n.read ? "" : "notification-item unread"}`}
              style={{ padding: 12 }}
            >
              <strong>{n.title}</strong>
              <p className="stat" style={{ margin: "4px 0 0" }}>
                {n.body}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
