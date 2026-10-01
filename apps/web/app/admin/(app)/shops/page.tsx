"use client";

import { useEffect, useState } from "react";
import { AdminPageShell } from "../../../components/admin-session-context";
import { VerifiedQrImage } from "../../../components/verified-qr-image";
import { api } from "../../../../lib/api";

type Shop = {
  locationId: string;
  brandName: string;
  displayName: string;
  status: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  verificationNote: string | null;
  qrPath: string | null;
};

const STATUS_LABEL = {
  UNVERIFIED: "Chưa xác minh",
  PENDING: "Đang xem",
  VERIFIED: "Đã xác minh",
  REJECTED: "Từ chối",
} as const;

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await api<{ shops: Shop[] }>("/admin/shops");
    setShops(res.shops);
  }

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được quán"));
  }, []);

  async function saveStatus(shop: Shop, status: Shop["verificationStatus"], note: string) {
    setBusyId(shop.locationId);
    setError(null);
    try {
      await api(`/admin/locations/${shop.locationId}/verification`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note || undefined }),
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không lưu được xác minh");
    } finally {
      setBusyId(null);
    }
  }

  async function issue(shop: Shop) {
    setBusyId(shop.locationId);
    setError(null);
    try {
      await api(`/admin/locations/${shop.locationId}/verified-qr`, {
        method: "POST",
        body: JSON.stringify({ reason: "In sticker" }),
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không cấp được QR");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageShell title="Quán">
      <p className="stat" style={{ marginBottom: 12 }}>
        Xác minh từng cơ sở rồi cấp QR dán tại cửa. Đổi mã làm sticker cũ hết hiệu lực.
      </p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {shops.map((shop) => (
        <ShopCard
          key={shop.locationId}
          shop={shop}
          busy={busyId === shop.locationId}
          onSave={saveStatus}
          onIssue={issue}
        />
      ))}
    </AdminPageShell>
  );
}

function ShopCard({
  shop,
  busy,
  onSave,
  onIssue,
}: {
  shop: Shop;
  busy: boolean;
  onSave: (shop: Shop, status: Shop["verificationStatus"], note: string) => Promise<void>;
  onIssue: (shop: Shop) => Promise<void>;
}) {
  const [status, setStatus] = useState(shop.verificationStatus);
  const [note, setNote] = useState(shop.verificationNote ?? "");

  useEffect(() => {
    setStatus(shop.verificationStatus);
    setNote(shop.verificationNote ?? "");
  }, [shop.verificationStatus, shop.verificationNote]);

  return (
    <article className="card" style={{ marginBottom: 12 }}>
      <strong>{shop.brandName}</strong>
      <p className="stat" style={{ margin: "4px 0 8px" }}>
        {shop.displayName} · {shop.status} · {STATUS_LABEL[shop.verificationStatus]}
      </p>
      <div className="field">
        <label htmlFor={`st-${shop.locationId}`}>Xác minh</label>
        <select
          id={`st-${shop.locationId}`}
          value={status}
          onChange={(e) => setStatus(e.target.value as Shop["verificationStatus"])}
        >
          <option value="UNVERIFIED">Chưa xác minh</option>
          <option value="PENDING">Đang xem</option>
          <option value="VERIFIED">Đã xác minh</option>
          <option value="REJECTED">Từ chối</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`note-${shop.locationId}`}>Ghi chú</label>
        <input id={`note-${shop.locationId}`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="board-row">
        <button type="button" className="btn" disabled={busy} onClick={() => void onSave(shop, status, note)}>
          Lưu xác minh
        </button>
        {shop.verificationStatus === "VERIFIED" ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onIssue(shop)}>
            {shop.qrPath ? "Đổi QR" : "Cấp QR"}
          </button>
        ) : null}
      </div>
      {shop.qrPath ? (
        <div style={{ marginTop: 12 }}>
          <VerifiedQrImage path={shop.qrPath} />
          <p className="stat">{shop.qrPath}</p>
        </div>
      ) : (
        <p className="stat">Chưa có mã để in.</p>
      )}
    </article>
  );
}
