"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";

type RunnerRow = {
  id: string;
  status: string;
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  zoneName: string;
  presence: string;
  createdAt: string;
  cccdNumber: string | null;
  cccdFullName: string | null;
  hasCccdFront: boolean;
  hasCccdBack: boolean;
  vehiclePlate: string | null;
  hasVehicleDoc: boolean;
  payoutBankName: string | null;
  payoutAccountNumber: string | null;
  payoutAccountHolder: string | null;
};

const PRESENCE: Record<string, string> = {
  OFFLINE: "Ngoại tuyến",
  AVAILABLE: "Sẵn sàng",
  PICKING_UP: "Đang lấy hàng",
  DELIVERING: "Đang giao",
};

function phoneLabel(phone: string | null) {
  if (!phone) return "Chưa có số";
  if (phone.startsWith("+84")) return `0${phone.slice(3)}`;
  return phone;
}

export default function AdminRunnersPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const [runners, setRunners] = useState<RunnerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [docsId, setDocsId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ runners: RunnerRow[] }>(`/admin/zones/${slug}/runners`);
    setRunners(res.runners);
  }, [slug]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [load]);

  async function setPaused(runnerId: string, paused: boolean) {
    setBusyId(runnerId);
    setError(null);
    try {
      const res = await api<{ runners: RunnerRow[] }>(`/admin/zones/${slug}/runners/${runnerId}/operations`, {
        method: "PATCH",
        body: JSON.stringify({ paused }),
      });
      setRunners(res.runners);
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đổi được");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageShell title="Tài xế">
      <h1 className="section-title">Tài xế</h1>
      <p className="tagline">
        Ảnh chân dung, CCCD, giấy tờ xe và tài khoản nhận tiền do tài xế nộp trong Cài đặt. Tài khoản chỉ để lưu hồ sơ, Pickee chưa chuyển tiền.
      </p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!runners ? <p className="tagline">Đang tải…</p> : null}
      {runners?.length === 0 ? <p className="tagline">Chưa có tài xế.</p> : null}
      {runners?.map((runner) => {
        const name = runner.displayName?.trim() || "Chưa đặt tên";
        const initial = runner.displayName?.trim()?.slice(0, 1).toUpperCase() || "T";
        return (
          <article key={runner.id} className="card" style={{ marginBottom: 8, display: "flex", gap: 12 }}>
            {runner.avatarUrl ? (
              <img
                src={runner.avatarUrl}
                alt=""
                width={64}
                height={64}
                style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 32, flexShrink: 0 }}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: "#e7eef2",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initial}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{name}</strong>
              <p style={{ margin: "4px 0 0" }}>{phoneLabel(runner.phone)}</p>
              <p className="stat" style={{ margin: "4px 0 0" }}>
                {runner.zoneName} · {PRESENCE[runner.presence] ?? runner.presence}
                {runner.status === "PAUSED" ? " · Tạm dừng" : ""}
              </p>
              <p className="stat" style={{ margin: "4px 0 0" }}>
                {runner.cccdNumber
                  ? `CCCD ${runner.cccdNumber} · ${runner.cccdFullName ?? ""}`
                  : "Chưa nộp CCCD"}
              </p>
              <p className="stat" style={{ margin: "4px 0 0" }}>
                {runner.vehiclePlate ? `Xe ${runner.vehiclePlate}` : "Chưa có giấy tờ xe"}
                {runner.payoutAccountNumber
                  ? ` · ${runner.payoutBankName} ${runner.payoutAccountNumber}`
                  : " · Chưa có tài khoản nhận tiền"}
              </p>
              {runner.hasCccdFront || runner.hasCccdBack || runner.hasVehicleDoc ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "auto", marginTop: 8 }}
                  onClick={() => setDocsId(docsId === runner.id ? null : runner.id)}
                >
                  {docsId === runner.id ? "Ẩn giấy tờ" : "Xem giấy tờ"}
                </button>
              ) : null}
              {docsId === runner.id ? (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {runner.hasCccdFront ? <DocImage runnerId={runner.id} kind="cccd-front" label="CCCD mặt trước" /> : null}
                  {runner.hasCccdBack ? <DocImage runnerId={runner.id} kind="cccd-back" label="CCCD mặt sau" /> : null}
                  {runner.hasVehicleDoc ? <DocImage runnerId={runner.id} kind="vehicle" label="Giấy đăng ký xe" /> : null}
                </div>
              ) : null}
              {runner.status === "PAUSED" ? (
                <button
                  type="button"
                  className="btn"
                  style={{ width: "auto", marginTop: 8 }}
                  disabled={busyId === runner.id}
                  onClick={() => void setPaused(runner.id, false)}
                >
                  Mở lại
                </button>
              ) : confirmId === runner.id ? (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: "0 0 8px" }}>Tạm dừng {name}? Tài xế không nhận đơn mới.</p>
                  <div className="board-row">
                    <button type="button" className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                      Hủy
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busyId === runner.id}
                      onClick={() => void setPaused(runner.id, true)}
                    >
                      Tạm dừng
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "auto", marginTop: 8 }}
                  disabled={busyId === runner.id || runner.status !== "ACTIVE"}
                  onClick={() => setConfirmId(runner.id)}
                >
                  Tạm dừng
                </button>
              )}
            </div>
          </article>
        );
      })}
    </AdminPageShell>
  );
}

function DocImage({ runnerId, kind, label }: { runnerId: string; kind: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void api<{ dataUrl: string }>(`/admin/runners/${runnerId}/documents/${kind}`)
      .then((res) => setSrc(res.dataUrl))
      .catch(() => setFailed(true));
  }, [runnerId, kind]);

  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="stat">{label}</figcaption>
      {src ? (
        <img src={src} alt={label} style={{ width: "100%", maxWidth: 320, borderRadius: 8 }} />
      ) : (
        <p className="stat">{failed ? "Không tải được ảnh" : "Đang tải…"}</p>
      )}
    </figure>
  );
}
