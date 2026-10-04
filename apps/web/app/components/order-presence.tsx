"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { getCurrentPositionOnce, type GeoPosition } from "../../lib/geolocation";

export type PresenceStatus = "checking" | "inside" | "outside" | "unknown";

export function useOrderPresence(zoneId: string | null | undefined) {
  const [status, setStatus] = useState<PresenceStatus>(zoneId ? "checking" : "unknown");
  const [point, setPoint] = useState<GeoPosition | null>(null);

  useEffect(() => {
    if (!zoneId) {
      setStatus("unknown");
      setPoint(null);
      return;
    }
    let cancel = false;
    setStatus("checking");
    void (async () => {
      const geo = await getCurrentPositionOnce({ timeoutMs: 10_000 });
      if (cancel) return;
      if (geo.source !== "gps") {
        setPoint(null);
        setStatus("unknown");
        return;
      }
      setPoint(geo.position);
      try {
        const found = await api<{ zones: { id: string }[] }>("/zones/discover", {
          method: "POST",
          body: JSON.stringify(geo.position),
        });
        if (cancel) return;
        setStatus(found.zones.some((z) => z.id === zoneId) ? "inside" : "outside");
      } catch {
        if (!cancel) setStatus("unknown");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [zoneId]);

  function orderPresenceBody(confirmHomeDelivery: boolean) {
    return {
      ...(point ? { presenceLat: point.lat, presenceLng: point.lng } : {}),
      ...(status !== "inside" ? { confirmHomeDelivery } : {}),
    };
  }

  const needsHomeConfirm = status !== "inside" && status !== "checking";

  return { status, needsHomeConfirm, orderPresenceBody };
}

export function HomeDeliveryConfirm({
  status,
  checked,
  onChange,
}: {
  status: PresenceStatus;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  if (status === "inside" || status === "checking") return null;
  const text =
    status === "outside"
      ? "Bạn đang ở ngoài Zone. Xác nhận giao về địa chỉ nhà, không giao tại vị trí hiện tại."
      : "Chưa đọc được vị trí. Xác nhận giao về địa chỉ nhà đã lưu, không giao tại vị trí hiện tại.";
  return (
    <label className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 4 }}
      />
      <span>{text}</span>
    </label>
  );
}
