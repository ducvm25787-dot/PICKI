"use client";

import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";

type LiveStatus = {
  locationId: string;
  status: string;
  message: string | null;
  updatedAt: string | null;
};

const STATUSES = ["OPEN", "BUSY", "CLOSED"] as const;

function statusLabel(status: string): string {
  if (status === "OPEN") return "Đang mở";
  if (status === "BUSY") return "Đông khách";
  if (status === "CLOSED") return "Đóng cửa";
  if (status === "OFFLINE") return "Chưa cập nhật";
  return status;
}

function statusPillClass(status: string): string {
  if (status === "OPEN") return "live-pill live-open";
  if (status === "BUSY") return "live-pill live-busy";
  return "live-pill live-closed";
}

export default function ProviderLivePage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const loadLive = useCallback(async () => {
    if (!locationId) return;
    const res = await api<LiveStatus>(`/provider/locations/${locationId}/live-status`);
    setLive(res);
  }, [locationId]);

  useEffect(() => {
    void loadLive();
  }, [loadLive]);

  async function setLiveStatus(status: string) {
    if (!locationId) return;
    setSaving(true);
    try {
      await api(`/provider/locations/${locationId}/live-status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadLive();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProviderPageShell title="Trạng thái">
      <div className="card">
        <p className="section-title">Live status</p>
        <p style={{ margin: "0 0 16px" }}>
          {activeLocation?.locationName ?? "Quán"}
          {live ? (
            <span className={statusPillClass(live.status)}>{statusLabel(live.status)}</span>
          ) : null}
        </p>
        {live?.updatedAt ? (
          <p className="stat" style={{ marginBottom: 16 }}>
            Cập nhật: {new Date(live.updatedAt).toLocaleString("vi-VN")}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={live?.status === s ? "btn provider-btn" : "btn btn-secondary"}
              style={{ width: "auto", padding: "10px 16px", flex: "1 1 30%" }}
              disabled={saving}
              onClick={() => void setLiveStatus(s)}
            >
              {statusLabel(s)}
            </button>
          ))}
        </div>
        <p className="stat" style={{ marginTop: 16, marginBottom: 0 }}>
          Khách thấy trạng thái này trên discovery và menu quán.
        </p>
      </div>
    </ProviderPageShell>
  );
}
