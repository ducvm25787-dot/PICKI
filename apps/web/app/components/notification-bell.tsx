"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type NotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload: { orderId?: string };
  read: boolean;
  createdAt: string;
};

type NotificationResponse = {
  unreadCount: number;
  notifications: NotificationItem[];
};

type Props = {
  /** Inline trong header-row (mặc định) thay vì float góc màn hình */
  inline?: boolean;
};

export function NotificationBell({ inline = true }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationResponse | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<NotificationResponse>("/notifications?limit=20");
      setData(res);
    } catch {
      /* not logged in or API down */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: "PATCH" });
    await load();
  }

  async function markAllRead() {
    await api("/notifications/read-all", { method: "PATCH" });
    await load();
  }

  const unread = data?.unreadCount ?? 0;

  return (
    <div
      className={inline ? "notification-bell notification-bell-inline" : "notification-bell"}
      ref={panelRef}
    >
      <button
        type="button"
        className={inline ? "notification-bell-btn notification-bell-btn-inline" : "notification-bell-btn"}
        aria-label={`Thông báo${unread > 0 ? `, ${String(unread)} chưa đọc` : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden>🔔</span>
        {inline ? <span className="notification-bell-label">Thông báo</span> : null}
        {unread > 0 ? <span className="notification-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="notification-panel" role="dialog" aria-label="Thông báo">
          <div className="notification-panel-head">
            <strong>Thông báo</strong>
            {unread > 0 ? (
              <button type="button" className="notification-mark-all" onClick={() => void markAllRead()}>
                Đọc hết
              </button>
            ) : null}
          </div>
          <div className="notification-list">
            {!data || data.notifications.length === 0 ? (
              <p className="stat" style={{ padding: 12, margin: 0 }}>
                Chưa có thông báo.
              </p>
            ) : (
              data.notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={n.read ? "notification-item" : "notification-item unread"}
                  onClick={() => {
                    void markRead(n.id);
                    setOpen(false);
                  }}
                >
                  <strong>{n.title}</strong>
                  <span>{n.body}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
