"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ServiceRequestZaloContact } from "../../../components/service-request-zalo";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import { serviceRequestStatusLabel } from "../../../../lib/providers";

type ServiceRequest = {
  id: string;
  requestNumber: string;
  status: string;
  offeringName: string | null;
  customerNote: string | null;
  providerNote: string | null;
  deliveryBuilding: string | null;
  deliveryApartment: string | null;
  deliveryNote: string | null;
  contacts?: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
  };
  createdAt: string;
};

export default function ProviderRequestsPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const { locationId, activeLocation } = useProviderLocation();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<{ requests: ServiceRequest[] }>(
      `/provider/service-requests?locationId=${locationId}`,
    );
    setRequests(res.requests);
  }, [locationId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`service-request-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, requests.length]);

  async function action(id: string, actionName: "accept" | "reject" | "start" | "complete", note?: string) {
    setBusyId(id);
    try {
      await api(`/provider/service-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: actionName, note }),
      });
      setRejectId(null);
      setRejectNote("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const open = requests.filter((r) => !["COMPLETED", "CANCELLED", "PROVIDER_REJECTED"].includes(r.status));

  return (
    <ProviderPageShell title="Yêu cầu dịch vụ">
      {activeLocation?.providerType !== "HOME_SERVICE" ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Tab này dành cho tiệm dịch vụ nhà. Chọn location Điện Nước Kim Văn trong Cài đặt.
          </p>
        </div>
      ) : open.length === 0 ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Chưa có yêu cầu mới.
          </p>
        </div>
      ) : (
        <div className="provider-list">
          {open.map((r) => {
            const busy = busyId === r.id;
            return (
              <article
                key={r.id}
                id={`service-request-${r.id}`}
                className={
                  focusId === r.id
                    ? "provider-card order-focus-highlight"
                    : "provider-card"
                }
              >
                <strong>{r.requestNumber}</strong>
                <p className="stat" style={{ margin: "6px 0" }}>
                  {serviceRequestStatusLabel(r.status)}
                  {r.offeringName ? ` · ${r.offeringName}` : ""}
                </p>
                {(r.deliveryBuilding || r.deliveryApartment) && (
                  <p style={{ margin: "0 0 6px", fontSize: 14 }}>
                    {r.deliveryBuilding}-{r.deliveryApartment}
                  </p>
                )}
                {r.customerNote ? (
                  <p className="stat" style={{ marginBottom: 8 }}>
                    {r.customerNote}
                  </p>
                ) : null}
                {r.contacts?.customer.phone && r.status === "OPEN" ? (
                  <div style={{ margin: "8px 0" }}>
                    <ServiceRequestZaloContact role="provider" contacts={r.contacts} />
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.status === "OPEN" ? (
                    <>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(r.id, "accept")}
                      >
                        Nhận
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => setRejectId(r.id)}
                      >
                        Từ chối
                      </button>
                    </>
                  ) : null}
                  {r.status === "CONFIRMED" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(r.id, "start")}
                    >
                      Bắt đầu
                    </button>
                  ) : null}
                  {r.status === "IN_PROGRESS" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(r.id, "complete")}
                    >
                      Hoàn thành
                    </button>
                  ) : null}
                </div>
                {rejectId === r.id ? (
                  <div style={{ marginTop: 10 }}>
                    <input
                      type="text"
                      value={rejectNote}
                      placeholder="Lý do từ chối…"
                      onChange={(e) => setRejectNote(e.target.value)}
                      style={{ width: "100%", marginBottom: 8, padding: 8 }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto" }}
                      disabled={busy || !rejectNote.trim()}
                      onClick={() => void action(r.id, "reject", rejectNote.trim())}
                    >
                      Xác nhận từ chối
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </ProviderPageShell>
  );
}
