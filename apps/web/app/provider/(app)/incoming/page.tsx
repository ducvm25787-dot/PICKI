"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderPhoneLinks } from "../../../components/order-phone-links";
import { VisitIntentTimer } from "../../../components/visit-intent-timer";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isCustomerVisitVertical, isHealthVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";

type VisitIntent = {
  id: string;
  status: string;
  offeringName: string | null;
  etaMinutes: number;
  expectedAt: string;
  expiresAt: string;
  createdAt: string;
  shopWaitingAt: string | null;
  customer: { displayName: string | null; avatarUrl?: string | null; phone: string | null };
};

type VisitListResponse = {
  summary: { activeCount: number; within30Minutes: number };
  intents: VisitIntent[];
};

function formatExpectedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function ProviderIncomingPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [data, setData] = useState<VisitListResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<VisitListResponse>(`/provider/visit-intents?locationId=${locationId}`);
    setData(res);
  }, [locationId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const sortedIntents = useMemo(() => {
    if (!data?.intents) return [];
    return [...data.intents].sort(
      (a, b) => new Date(a.expectedAt).getTime() - new Date(b.expectedAt).getTime(),
    );
  }, [data?.intents]);

  async function action(id: string, actionName: "waiting" | "arrived") {
    setBusyId(id);
    try {
      await api(`/provider/visit-intents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: actionName }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject(id: string) {
    const reason = rejectReason.trim();
    if (reason.length < 2) {
      setRejectError("Nhập lý do từ chối (ít nhất 2 ký tự)");
      return;
    }
    setBusyId(id);
    setRejectError(null);
    try {
      await api(`/provider/visit-intents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "dismiss", reason }),
      });
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setRejectError(e instanceof Error ? e.message : "Không từ chối được");
    } finally {
      setBusyId(null);
    }
  }

  const isCustomerVisit = isCustomerVisitVertical(activeLocation?.providerType);
  const isPet = activeLocation?.providerType === "PET_SERVICE";
  const isAuto = activeLocation?.providerType === "AUTO_SERVICE";
  const isHealth = isHealthVertical(activeLocation?.providerType);

  if (!isCustomerVisit) {
    return (
      <ProviderPageShell title="Khách sắp tới">
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Tab này dành cho tiệm làm đẹp, rửa xe, spa thú cưng và phòng khám.
          </p>
        </div>
      </ProviderPageShell>
    );
  }

  const summary = data?.summary;

  return (
    <ProviderPageShell title={isPet ? "Pet sắp tới" : isAuto ? "Xe sắp tới" : "Khách sắp tới"}>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Tổng quan</p>
        <p style={{ margin: 0 }}>
          <strong>{summary?.activeCount ?? 0}</strong>{" "}
          {isPet
            ? "pet sắp tới tiệm"
            : isAuto
              ? "xe sắp mang tới"
              : isHealth
                ? "khách sắp tới khám"
                : "khách đang báo sắp tới"}
          {summary && summary.within30Minutes > 0 ? (
            <span className="stat">
              {" "}
              · {String(summary.within30Minutes)} khách trong ~30 phút tới
            </span>
          ) : null}
        </p>
        <p className="stat" style={{ margin: "8px 0 0", fontSize: 13 }}>
          Sắp xếp theo giờ dự kiến — sớm nhất ở trên. Thanh thời gian chạy hết sẽ tự hủy theo dõi.
        </p>
      </div>

      {sortedIntents.length === 0 ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Chưa có khách báo sắp tới.
          </p>
        </div>
      ) : (
        <div className="provider-list">
          {sortedIntents.map((intent, index) => {
            const busy = busyId === intent.id;
            const rejecting = rejectingId === intent.id;
            return (
              <article key={intent.id} className="provider-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <OrderPhoneLinks
                    contacts={{
                      customer: {
                        phone: intent.customer.phone,
                        displayName: intent.customer.displayName,
                        avatarUrl: intent.customer.avatarUrl,
                      },
                      provider: { phone: null },
                    }}
                    showOnly="customer"
                    compact
                  />
                  <span className="badge" style={{ fontSize: 11 }}>
                    #{String(index + 1)}
                  </span>
                </div>
                <p className="stat" style={{ margin: "6px 0" }}>
                  Dự kiến tới ~{formatExpectedAt(intent.expectedAt)}
                  {intent.offeringName ? ` · ${intent.offeringName}` : ""}
                </p>
                <VisitIntentTimer
                  createdAt={intent.createdAt}
                  expectedAt={intent.expectedAt}
                  expiresAt={intent.expiresAt}
                  onExpired={() => void load()}
                />
                {intent.shopWaitingAt ? (
                  <p className="stat" style={{ margin: "8px 0 0", fontSize: 13, color: "#2d6a4f" }}>
                    ✓ Đã báo khách: tiệm đang chờ (
                    {new Date(intent.shopWaitingAt).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    )
                  </p>
                ) : null}

                {rejecting ? (
                  <div style={{ marginTop: 12 }}>
                    <p className="stat" style={{ margin: "0 0 8px" }}>
                      Lý do từ chối (khách sẽ nhận thông báo)
                    </p>
                    <textarea
                      value={rejectReason}
                      maxLength={300}
                      rows={3}
                      placeholder="VD: Hết chỗ hôm nay / Máy bận / Đóng sớm…"
                      onChange={(e) => setRejectReason(e.target.value)}
                      style={{ width: "100%", marginBottom: 8 }}
                    />
                    {rejectError ? (
                      <p className="stat" style={{ color: "#c0392b", margin: "0 0 8px" }}>
                        {rejectError}
                      </p>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void submitReject(intent.id)}
                      >
                        Xác nhận từ chối
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                          setRejectError(null);
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(intent.id, "waiting")}
                    >
                      {intent.shopWaitingAt ? "Nhắc lại đang chờ" : "Đang chờ"}
                    </button>
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(intent.id, "arrived")}
                    >
                      {isPet ? "Pet đã tới" : isHealth ? "Đã tới khám" : "Đã tới tiệm"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => {
                        setRejectingId(intent.id);
                        setRejectReason("");
                        setRejectError(null);
                      }}
                    >
                      Từ chối
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </ProviderPageShell>
  );
}
