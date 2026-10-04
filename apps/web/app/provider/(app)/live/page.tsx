"use client";

import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isFoodBreakfastVertical } from "../../../../lib/providers";
import { LN_DEFAULT_END, LN_DEFAULT_START } from "../../../../lib/late-night";
import { api } from "../../../../lib/api";
import { LiveStatusCard } from "./live-status-card";

type LateNightSettings = {
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  acceptingNow: boolean;
};

export default function ProviderLivePage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [late, setLate] = useState<LateNightSettings | null>(null);
  const [lateBusy, setLateBusy] = useState(false);
  const [lateError, setLateError] = useState<string | null>(null);
  const [startsDraft, setStartsDraft] = useState(LN_DEFAULT_START);
  const [endsDraft, setEndsDraft] = useState(LN_DEFAULT_END);
  const isFood = isFoodBreakfastVertical(activeLocation?.providerType);

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
    void loadLate().catch(() => setLate(null));
  }, [loadLate]);

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
    <ProviderPageShell title={isFood ? "Bán khuya" : "Trạng thái"}>
      {isFood ? null : <LiveStatusCard />}

      {isFood ? (
        <div className="card">
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
