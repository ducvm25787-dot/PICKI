"use client";

import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import {
  beautyWaitDisplay,
  isCustomerVisitVertical,
  isFoodBreakfastVertical,
  isHealthVertical,
} from "../../../../lib/providers";
import { LN_DEFAULT_END, LN_DEFAULT_START } from "../../../../lib/late-night";
import { api } from "../../../../lib/api";

type LiveStatus = {
  locationId: string;
  status: string;
  message: string | null;
  estimatedWaitMinutes: number | null;
  updatedAt: string | null;
};

type LateNightSettings = {
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  acceptingNow: boolean;
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

export default function ProviderLivePage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [late, setLate] = useState<LateNightSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [lateBusy, setLateBusy] = useState(false);
  const [lateError, setLateError] = useState<string | null>(null);
  const [startsDraft, setStartsDraft] = useState(LN_DEFAULT_START);
  const [endsDraft, setEndsDraft] = useState(LN_DEFAULT_END);
  const isCustomerVisit = isCustomerVisitVertical(activeLocation?.providerType);
  const isHealth = isHealthVertical(activeLocation?.providerType);
  const isFood = isFoodBreakfastVertical(activeLocation?.providerType);

  const loadLive = useCallback(async () => {
    if (!locationId) return;
    const res = await api<LiveStatus>(`/provider/locations/${locationId}/live-status`);
    setLive(res);
  }, [locationId]);

  const loadLate = useCallback(async () => {
    if (!locationId || !isFood) return;
    const res = await api<LateNightSettings>(
      `/provider/locations/${locationId}/late-night/settings`,
    );
    setLate(res);
    setStartsDraft(res.startsAt.slice(0, 5));
    setEndsDraft(res.endsAt.slice(0, 5));
  }, [locationId, isFood]);

  useEffect(() => {
    void loadLive();
    void loadLate().catch(() => setLate(null));
  }, [loadLive, loadLate]);

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

  async function setLiveStatus(status: string) {
    await patchLive({ status });
  }

  async function setWaitMinutes(minutes: number) {
    await patchLive({ estimatedWaitMinutes: minutes });
  }

  async function saveLate(patch: Partial<{ enabled: boolean; startsAt: string; endsAt: string }>) {
    if (!locationId) return;
    setLateBusy(true);
    setLateError(null);
    try {
      const res = await api<LateNightSettings>(
        `/provider/locations/${locationId}/late-night/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({
            enabled: patch.enabled ?? late?.enabled,
            startsAt: patch.startsAt ?? startsDraft,
            endsAt: patch.endsAt ?? endsDraft,
          }),
        },
      );
      setLate(res);
      setStartsDraft(res.startsAt.slice(0, 5));
      setEndsDraft(res.endsAt.slice(0, 5));
    } catch (e) {
      setLateError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setLateBusy(false);
    }
  }

  return (
    <ProviderPageShell title="Trạng thái">
      <div className="card">
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
              onClick={() => void setLiveStatus(s)}
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
                  onClick={() => void setWaitMinutes(m)}
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

      {isFood ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="section-title">Bán khuya</p>
          <p className="stat" style={{ marginTop: 0 }}>
            Bật để hiện trong «Góc ăn khuya». Cần đang mở (OPEN/BUSY) và trong khung giờ.
          </p>
          {lateError ? <p style={{ color: "#b91c1c", fontSize: 14 }}>{lateError}</p> : null}
          <p style={{ margin: "8px 0" }}>
            {late?.enabled ? (
              <span className="live-pill live-open">Đang bán khuya</span>
            ) : (
              <span className="live-pill live-closed">Tắt</span>
            )}
            {late?.acceptingNow ? (
              <span className="stat" style={{ marginLeft: 8 }}>
                · đang trong khung
              </span>
            ) : null}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <label className="stat" style={{ display: "block" }}>
              Từ
              <input
                type="time"
                value={startsDraft}
                onChange={(e) => setStartsDraft(e.target.value)}
                style={{ display: "block", marginTop: 4, padding: 8 }}
              />
            </label>
            <label className="stat" style={{ display: "block" }}>
              Đến
              <input
                type="time"
                value={endsDraft}
                onChange={(e) => setEndsDraft(e.target.value)}
                style={{ display: "block", marginTop: 4, padding: 8 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn provider-btn"
              style={{ width: "auto", padding: "8px 14px" }}
              disabled={lateBusy}
              onClick={() =>
                void saveLate({ enabled: true, startsAt: startsDraft, endsAt: endsDraft })
              }
            >
              {lateBusy ? "…" : late?.enabled ? "Lưu giờ" : "Bật bán khuya"}
            </button>
            {late?.enabled ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "auto", padding: "8px 14px" }}
                disabled={lateBusy}
                onClick={() => void saveLate({ enabled: false })}
              >
                Tắt
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ProviderPageShell>
  );
}
