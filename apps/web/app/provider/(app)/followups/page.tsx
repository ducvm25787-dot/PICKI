"use client";

import { useCallback, useEffect, useState } from "react";
import { OrderPhoneLinks } from "../../../components/order-phone-links";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isHealthVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";

type Patient = {
  customerUserId: string;
  displayName: string;
  phone: string | null;
  lastVisitAt: string;
  visitCount: number;
  followupStatus: "SCHEDULED" | "SENT" | null;
};

type Reminder = {
  id: string;
  status: string;
  customerUserId: string;
  customerDisplayName: string;
  remindAt: string;
  sentAt: string | null;
  createdAt: string;
};

type ReminderListResponse = {
  summary: { pendingCount: number };
  reminders: Reminder[];
};

const PRESETS = [
  { label: "7 ngày", days: 7 },
  { label: "14 ngày", days: 14 },
  { label: "30 ngày", days: 30 },
  { label: "90 ngày", days: 90 },
] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Ngày nhắc dự kiến khi chọn N ngày (chỉ hiện ngày, không giờ). */
function previewRemindDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDate(d.toISOString());
}

function statusLabel(status: string): string {
  if (status === "SCHEDULED") return "Đang chờ gửi";
  if (status === "SENT") return "Đã nhắc khách";
  return "Đã hủy";
}

function patientLockLabel(status: Patient["followupStatus"]): string | null {
  if (status === "SCHEDULED") return "Đã đặt nhắc";
  if (status === "SENT") return "Đã nhắc";
  return null;
}

export default function ProviderFollowupsPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const isHealth = isHealthVertical(activeLocation?.providerType);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [data, setData] = useState<ReminderListResponse | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId || !isHealth) return;
    const [list, pats] = await Promise.all([
      api<ReminderListResponse>(`/provider/health/followups?locationId=${locationId}`),
      api<{ patients: Patient[] }>(`/provider/health/patients?locationId=${locationId}`),
    ]);
    setData(list);
    setPatients(pats.patients);
  }, [locationId, isHealth]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createReminder() {
    if (!locationId || !selectedPatient) return;
    if (!Number.isFinite(days) || days < 1) {
      setError("Nhập số ngày (≥ 1)");
      return;
    }
    if (days > 365) {
      setError("Chỉ nhắc trong vòng 1 năm");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/provider/health/followups", {
        method: "POST",
        body: JSON.stringify({
          locationId,
          customerUserId: selectedPatient.customerUserId,
          days,
        }),
      });
      setSelectedPatient(null);
      setDays(30);
      setToast(`Đã đặt nhắc sau ${String(days)} ngày — Picki gửi một lần vào ngày đó`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt được lời nhắc");
    } finally {
      setBusy(false);
      setTimeout(() => {
        setToast(null);
      }, 3000);
    }
  }

  async function cancelReminder(id: string) {
    setBusy(true);
    try {
      await api(`/provider/health/followups/${id}/cancel`, { method: "PATCH" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!isHealth) {
    return (
      <ProviderPageShell title="Nhắc tái khám">
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Tab này dành cho phòng khám.
          </p>
        </div>
      </ProviderPageShell>
    );
  }

  return (
    <ProviderPageShell title="Nhắc tái khám">
      {toast ? (
        <div
          className="card"
          style={{ marginBottom: 12, background: "#e8f8ef", borderColor: "#9fd4b5" }}
        >
          <p style={{ margin: 0 }}>{toast}</p>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Tổng quan</p>
        <p style={{ margin: 0 }}>
          <strong>{data?.summary.pendingCount ?? 0}</strong> lời nhắc đang chờ gửi
        </p>
        <p className="stat" style={{ margin: "8px 0 0", fontSize: 13 }}>
          Chỉ nhập số ngày sau lần khám. Picki nhắc khách một lần — đã nhắc thì không đặt lại
          cho khách đó. Không gửi kèm lý do khám.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Đặt lời nhắc</p>
        {patients.length === 0 ? (
          <p className="stat" style={{ margin: 0 }}>
            Chưa có khách nào được đánh dấu &quot;Đã tới&quot; ở tab Sắp tới — nhắc tái khám chỉ áp
            dụng cho khách đã tới khám.
          </p>
        ) : selectedPatient ? (
          <>
            <p style={{ margin: "0 0 4px" }}>
              <strong>{selectedPatient.displayName}</strong>
            </p>
            <p className="stat" style={{ margin: "0 0 12px" }}>
              Lần khám gần nhất: {formatDate(selectedPatient.lastVisitAt)}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  className={days === p.days ? "btn provider-btn" : "btn btn-secondary"}
                  style={{ width: "auto", padding: "8px 12px" }}
                  onClick={() => {
                    setDays(p.days);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="stat" htmlFor="followup-days">
              Số ngày sau lần khám
            </label>
            <input
              id="followup-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => {
                const n = Number(e.target.value);
                setDays(Number.isFinite(n) ? n : 0);
              }}
              style={{ width: "100%", marginBottom: 8, padding: 10 }}
            />
            {days >= 1 && days <= 365 ? (
              <p className="stat" style={{ margin: "0 0 12px" }}>
                Sẽ nhắc khoảng ngày {previewRemindDate(days)} (một lần)
              </p>
            ) : null}
            {error ? (
              <p className="stat" style={{ color: "#c0392b", margin: "0 0 8px" }}>
                {error}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                disabled={busy}
                onClick={() => void createReminder()}
              >
                {busy ? "Đang lưu…" : "Đặt lời nhắc"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "auto" }}
                disabled={busy}
                onClick={() => {
                  setSelectedPatient(null);
                  setDays(30);
                  setError(null);
                }}
              >
                Hủy
              </button>
            </div>
          </>
        ) : (
          <div className="provider-list">
            {patients.map((p) => {
              const lock = patientLockLabel(p.followupStatus);
              return (
                <article key={p.customerUserId} className="provider-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{p.displayName}</strong>
                    <span className="badge" style={{ fontSize: 11 }}>
                      {String(p.visitCount)} lần khám
                    </span>
                  </div>
                  <p className="stat" style={{ margin: "6px 0" }}>
                    Gần nhất: {formatDate(p.lastVisitAt)}
                  </p>
                  {p.phone ? (
                    <OrderPhoneLinks
                      contacts={{
                        customer: { phone: p.phone, displayName: p.displayName },
                        provider: { phone: null },
                      }}
                      showOnly="customer"
                      compact
                    />
                  ) : null}
                  {lock ? (
                    <p className="stat" style={{ margin: "10px 0 0", color: "#2d6a4f" }}>
                      {lock} — không đặt thêm
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px", marginTop: 10 }}
                      onClick={() => {
                        setSelectedPatient(p);
                        setDays(30);
                        setError(null);
                      }}
                    >
                      Nhắc tái khám
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <p className="section-title">Lời nhắc đã đặt</p>
        {!data || data.reminders.length === 0 ? (
          <p className="stat" style={{ margin: 0 }}>
            Chưa có lời nhắc nào.
          </p>
        ) : (
          <div className="provider-list">
            {data.reminders.map((r) => (
              <article key={r.id} className="provider-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{r.customerDisplayName}</strong>
                  <span className="badge" style={{ fontSize: 11 }}>
                    {statusLabel(r.status)}
                  </span>
                </div>
                <p className="stat" style={{ margin: "6px 0 0" }}>
                  Hẹn nhắc: {formatDate(r.remindAt)}
                  {r.sentAt ? ` · Đã gửi ${formatDate(r.sentAt)}` : ""}
                </p>
                {r.status === "SCHEDULED" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: "auto", padding: "8px 12px", marginTop: 10 }}
                    disabled={busy}
                    onClick={() => void cancelReminder(r.id)}
                  >
                    Hủy lời nhắc
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </ProviderPageShell>
  );
}
