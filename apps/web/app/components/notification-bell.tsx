"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type NotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload: {
    orderId?: string;
    orderNumber?: string;
    requestId?: string;
    intentId?: string;
    locationId?: string;
    listingId?: string;
  };
  read: boolean;
  createdAt: string;
};

type NotificationResponse = {
  unreadCount: number;
  notifications: NotificationItem[];
};

type Audience = "customer" | "provider" | "runner";

type Props = {
  /** Inline trong header-row (mặc định) thay vì float góc màn hình */
  inline?: boolean;
  /** Bật desktop notification khi có đơn mới (Runner) */
  desktopAlerts?: boolean;
  /** Vai trò người xem — dùng để điều hướng khi bấm thông báo */
  audience?: Audience;
};

function orderHref(orderId: string, audience: Audience): string {
  switch (audience) {
    case "provider":
      return `/provider?focus=${orderId}`;
    case "runner":
      return `/runner?focus=${orderId}`;
    default:
      return `/orders/${orderId}`;
  }
}

function notificationTargetHref(n: NotificationItem, audience: Audience): string | null {
  if (n.eventType.startsWith("visit_intent.")) {
    if (audience === "provider") return "/provider/incoming";
    if (
      n.eventType === "visit_intent.shop_waiting" ||
      n.eventType === "visit_intent.provider_rejected"
    ) {
      const locationId = n.payload?.locationId;
      if (typeof locationId === "string") return `/locations/${locationId}`;
    }
    return null;
  }

  if (n.eventType.startsWith("health.")) {
    if (audience === "provider") return "/provider/followups";
    const locationId = n.payload?.locationId;
    if (typeof locationId === "string") return `/locations/${locationId}`;
    return null;
  }

  if (n.eventType.startsWith("service_request.")) {
    const requestId = n.payload?.requestId;
    if (typeof requestId === "string") {
      return audience === "provider"
        ? `/provider/requests?focus=${requestId}`
        : `/requests/${requestId}`;
    }
    return audience === "provider" ? "/provider/requests" : "/requests";
  }

  if (n.eventType.startsWith("classified.")) {
    const listingId = n.payload?.listingId;
    if (typeof listingId === "string") return `/classifieds/${listingId}`;
    return "/classifieds/mine";
  }

  if (n.eventType === "message.received") {
    const listingId = n.payload?.listingId;
    if (typeof listingId === "string") return `/classifieds/${listingId}`;
    const locationId = n.payload?.locationId;
    const conversationId = n.payload?.conversationId;
    if (typeof locationId === "string") {
      if (audience === "provider") {
        return typeof conversationId === "string"
          ? `/provider/chats?id=${conversationId}`
          : "/provider/chats";
      }
      return `/locations/${locationId}`;
    }
  }

  const orderId = n.payload?.orderId;
  if (!orderId) return null;
  if (n.eventType === "order.seeking_runner" && audience !== "runner") {
    return orderHref(orderId, audience);
  }
  if (
    n.eventType.startsWith("order.") ||
    n.eventType.startsWith("runner.") ||
    n.eventType === "message.received"
  ) {
    return orderHref(orderId, audience);
  }
  return null;
}

function maybeDesktopAlert(items: NotificationItem[]) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  for (const n of items) {
    if (n.read) continue;
    if (n.eventType !== "order.seeking_runner" && n.eventType !== "order.status_changed") continue;
    try {
      new Notification(n.title, { body: n.body, tag: n.id });
    } catch {
      /* ignore */
    }
  }
}

export function NotificationBell({
  inline = true,
  desktopAlerts = false,
  audience = "customer",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationResponse | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const promptedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await api<NotificationResponse>("/notifications?limit=20");
      setData(res);

      if (desktopAlerts) {
        const fresh = res.notifications.filter((n) => !seenIdsRef.current.has(n.id));
        for (const n of res.notifications) {
          seenIdsRef.current.add(n.id);
        }
        if (fresh.length > 0) {
          maybeDesktopAlert(fresh);
        }
      }
    } catch {
      /* not logged in or API down */
    }
  }, [desktopAlerts]);

  useEffect(() => {
    if (!desktopAlerts || promptedRef.current) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    promptedRef.current = true;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [desktopAlerts]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), desktopAlerts ? 5000 : 12000);
    return () => clearInterval(t);
  }, [load, desktopAlerts]);

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

  async function openNotification(n: NotificationItem) {
    await markRead(n.id);
    setOpen(false);
    const href = notificationTargetHref(n, audience);
    if (href) router.push(href);
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
                  onClick={() => void openNotification(n)}
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
