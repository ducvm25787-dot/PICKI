"use client";

import { useEffect, useRef } from "react";
import { api } from "../../lib/api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Đăng ký Web Push sau khi user đăng nhập (PWA nền). */
export function PushSubscribe() {
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    triedRef.current = true;

    void (async () => {
      try {
        const { enabled, publicKey } = await api<{ enabled: boolean; publicKey: string | null }>(
          "/notifications/push/vapid-key",
        );
        if (!enabled || !publicKey) return;
        if (Notification.permission === "denied") return;
        if (Notification.permission === "default") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") return;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
          });
        }

        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;

        await api("/notifications/push/subscribe", {
          method: "POST",
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            userAgent: navigator.userAgent,
          }),
        });
      } catch {
        /* chưa login hoặc SW chưa sẵn sàng */
      }
    })();
  }, []);

  return null;
}
