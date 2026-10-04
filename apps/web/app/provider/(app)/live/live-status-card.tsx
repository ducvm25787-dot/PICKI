"use client";

import { useCallback, useEffect, useState } from "react";
import { useProviderLocation } from "../../../components/provider-location-context";
import {
  beautyWaitDisplay,
  isCustomerVisitVertical,
  isHealthVertical,
} from "../../../../lib/providers";
import { api } from "../../../../lib/api";

type LiveStatus = {
  locationId: string;
  status: string;
  message: string | null;
  estimatedWaitMinutes: number | null;
  updatedAt: string | null;
};

const STATUSES = ["OPEN", "BUSY", "CLOSED"] as const;
const WAIT_PRESETS = [0, 15, 30, 45, 60] as const;

function statusLabel(status: string, providerType?: string): string {
  if (providerType === "HOME_SERVICE") {
    if (status === "OPEN") return "Đang nhận việc";
    if (status === "BUSY") return "Có thể tới sau ~1h";
    if (status === "CLOSED") return "Hết lịch hôm nay";
    if (status === "OFFLINE") return "Chưa cập nhật";
    return status;
  }
  if (isCustomerVisitVertical(providerType)) {
    if (status === "OPEN") {
      if (providerType === "PET_SERVICE") return "Đang nhận pet";
      if (providerType === "AUTO_SERVICE") return "Đang nhận xe";
      if (isHealthVertical(providerType)) return "Đang nhận khám";
      return "Đang nhận khách";
    }
    if (status === "BUSY") return isHealthVertical(providerType) ? "Đông bệnh nhân" : "Đông khách";
    if (status === "CLOSED")
      return isHealthVertical(providerType) ? "Tạm ngừng nhận khám" : "Tạm hết lượt";
    if (status === "OFFLINE") return "Chưa cập nhật";
    return status;
  }
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

export function LiveStatusCard() {
  const { locationId, activeLocation } = useProviderLocation();
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const isCustomerVisit = isCustomerVisitVertical(activeLocation?.providerType);
  const isHealth = isHealthVertical(activeLocation?.providerType);

  const loadLive = useCallback(async () => {
    if (!locationId) return;
    const res = await api<LiveStatus>(`/provider/locations/${locationId}/live-status`);
    setLive(res);
  }, [locationId]);

  useEffect(() => {
    void loadLive();
  }, [loadLive]);

  async function patchLive(body: { status?: string; estimatedWaitMinutes?: number }) {
    if (!locationId || !live) return;
    setSaving(true);
    try {
      await api(`/provider/locations/${locationId}/live-status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: body.status ?? live.status,
          estimatedWaitMinutes:
            body.estimatedWaitMinutes !== undefined
              ? body.estimatedWaitMinutes
              : live.estimatedWaitMinutes,
        }),
      });
      await loadLive();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="section-title">Live status</p>
      <p style={{ margin: "0 0 16px" }}>
        {activeLocation?.locationName ?? "Quán"}
        {live ? (
          <span className={statusPillClass(live.status)}>
            {isCustomerVisit
              ? beautyWaitDisplay(
                  live.status,
                  live.estimatedWaitMinutes,
                  activeLocation?.providerType,
                )
              : statusLabel(live.status, activeLocation?.providerType)}
          </span>
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
            onClick={() => void patchLive({ status: s })}
          >
            {statusLabel(s, activeLocation?.providerType)}
          </button>
        ))}
      </div>

      {isCustomerVisit ? (
        <div style={{ marginTop: 20 }}>
          <p className="section-title">Thời gian chờ (Live Wait)</p>
          <p className="stat" style={{ margin: "0 0 10px" }}>
            {activeLocation?.providerType === "AUTO_SERVICE"
              ? "Khách xem đông vắng trước khi mang xe — cập nhật thường xuyên."
              : isHealth
                ? "Khách xem thời gian chờ trước khi tới phòng khám — cập nhật khi đông/vắng."
                : "Khách thấy ước lượng chờ trên trang chủ và trang tiệm."}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {WAIT_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={
                  live?.estimatedWaitMinutes === m ? "btn provider-btn" : "btn btn-secondary"
                }
                style={{ width: "auto", padding: "8px 12px" }}
                disabled={saving}
                onClick={() => void patchLive({ estimatedWaitMinutes: m })}
              >
                {m === 0 ? "Ra ngay" : `~${String(m)} phút`}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="stat" style={{ marginTop: 16, marginBottom: 0 }}>
        {isCustomerVisit
          ? "Cập nhật trạng thái và thời gian chờ khi đông/thưa."
          : "Khách thấy trạng thái này trên discovery và menu quán."}
      </p>
    </div>
  );
}
