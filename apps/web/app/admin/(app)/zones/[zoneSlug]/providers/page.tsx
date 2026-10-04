"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell, useAdminSession } from "../../../../../components/admin-session-context";
import { VerifiedQrImage } from "../../../../../components/verified-qr-image";
import { api } from "../../../../../../lib/api";

type Shop = {
  locationId: string;
  commerceModel?: string | null;
  draftBeerEnabled?: boolean;
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
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const { session } = useAdminSession();
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await api<{ shops: Shop[] }>(`/admin/zones/${slug}/shops`);
    setShops(res.shops);
  }

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được quán"));
  }, [slug]);

  async function toggleDraftBeer(shop: Shop) {
    setBusyId(shop.locationId);
    setError(null);
    try {
      await api(`/admin/locations/${shop.locationId}/draft-beer`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: shop.draftBeerEnabled !== true }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bật được bia hơi");
    } finally {
      setBusyId(null);
    }
  }

  async function saveStatus(shop: Shop, status: Shop["verificationStatus"], note: string) {
    setBusyId(shop.locationId);
    setError(null);
    try {
      await api(`/admin/zones/${slug}/locations/${shop.locationId}/verification`, {
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

  async function setPaused(shop: Shop, paused: boolean) {
    setBusyId(shop.locationId);
    setError(null);
    try {
      await api(`/admin/zones/${slug}/locations/${shop.locationId}/operations`, {
        method: "PATCH",
        body: JSON.stringify({ paused }),
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không đổi được trạng thái quán");
    } finally {
      setBusyId(null);
    }
  }

  async function issue(shop: Shop) {
    setBusyId(shop.locationId);
    setError(null);
    try {
      await api(`/admin/zones/${slug}/locations/${shop.locationId}/verified-qr`, {
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
          onDraftBeer={session?.superAdmin ? toggleDraftBeer : undefined}
          onPause={setPaused}
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
  onDraftBeer,
  onPause,
}: {
  shop: Shop;
  busy: boolean;
  onSave: (shop: Shop, status: Shop["verificationStatus"], note: string) => Promise<void>;
  onIssue: (shop: Shop) => Promise<void>;
  onDraftBeer?: (shop: Shop) => Promise<void>;
  onPause: (shop: Shop, paused: boolean) => Promise<void>;
}) {
  const [status, setStatus] = useState(shop.verificationStatus);
  const [note, setNote] = useState(shop.verificationNote ?? "");
  const [confirmPause, setConfirmPause] = useState(false);

  useEffect(() => {
    setStatus(shop.verificationStatus);
    setNote(shop.verificationNote ?? "");
  }, [shop.verificationStatus, shop.verificationNote]);

  return (
    <article className="card" style={{ marginBottom: 12 }}>
      <strong>{shop.brandName}</strong>
      <p className="stat" style={{ margin: "4px 0 8px" }}>
        {shop.displayName} · {shop.status === "PAUSED" ? "Tạm dừng hoạt động" : shop.status} ·{" "}
        {STATUS_LABEL[shop.verificationStatus]}
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
      {shop.status === "PAUSED" ? (
        <button
          type="button"
          className="btn"
          style={{ width: "auto", marginTop: 8 }}
          disabled={busy}
          onClick={() => void onPause(shop, false)}
        >
          Mở lại hoạt động
        </button>
      ) : shop.status === "ACTIVE" ? (
        confirmPause ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Tạm dừng {shop.brandName}?</strong> Khách không thấy quán và không đặt được. Đơn đang làm vẫn giữ.
            </p>
            <div className="board-row">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmPause(false)}>
                Hủy
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void onPause(shop, true)}>
                Tạm dừng
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", marginTop: 8 }}
            disabled={busy}
            onClick={() => setConfirmPause(true)}
          >
            Tạm dừng hoạt động
          </button>
        )
      ) : null}
      {onDraftBeer && shop.commerceModel === "FOOD_SERVICE" ? (
        <button
          type="button"
          className="btn"
          style={{ width: "auto", marginTop: 8 }}
          disabled={busy}
          onClick={() => void onDraftBeer(shop)}
        >
          {shop.draftBeerEnabled ? "Tắt bia hơi" : "Bật bia hơi"}
        </button>
      ) : null}
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
