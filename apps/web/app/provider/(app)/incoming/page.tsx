"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderPhoneLinks } from "../../../components/order-phone-links";
import { VisitIntentTimer } from "../../../components/visit-intent-timer";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";

type VisitIntent = {
  id: string;
  status: string;
  offeringName: string | null;
  etaMinutes: number;
  expectedAt: string;
  expiresAt: string;
  createdAt: string;
  customer: { displayName: string; phone: string | null };
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

  async function action(id: string, actionName: "arrived" | "dismiss") {
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

  if (activeLocation?.providerType !== "BEAUTY") {
    return (
      <ProviderPageShell title="Khách sắp tới">
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Tab này dành cho tiệm làm đẹp.
          </p>
        </div>
      </ProviderPageShell>
    );
  }

  const summary = data?.summary;

  return (
    <ProviderPageShell title="Khách sắp tới">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Tổng quan</p>
        <p style={{ margin: 0 }}>
          <strong>{summary?.activeCount ?? 0}</strong> khách đang báo sắp tới
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
            return (
              <article key={intent.id} className="provider-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{intent.customer.displayName}</strong>
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
                {intent.customer.phone ? (
                  <div style={{ marginTop: 10 }}>
                    <OrderPhoneLinks
                      contacts={{
                        customer: {
                          phone: intent.customer.phone,
                          displayName: intent.customer.displayName,
                        },
                        provider: { phone: null },
                      }}
                      showOnly="customer"
                      compact
                    />
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn provider-btn"
                    style={{ width: "auto", padding: "8px 12px" }}
                    disabled={busy}
                    onClick={() => void action(intent.id, "arrived")}
                  >
                    Đã tới tiệm
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: "auto", padding: "8px 12px" }}
                    disabled={busy}
                    onClick={() => void action(intent.id, "dismiss")}
                  >
                    Bỏ theo dõi
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </ProviderPageShell>
  );
}
