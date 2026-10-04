"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";
import { formatVnd } from "../../../../../../lib/money";
import { orderStatusLabel } from "../../../../../../lib/orders";

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalVnd: number;
  zone: { slug: string; displayName: string };
  provider: { brandName: string; locationName: string };
  delivery: { building: string | null; apartment: string | null };
  createdAt: string;
};

export default function AdminOrdersPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await api<{ orders: AdminOrder[] }>(`/admin/zones/${slug}/orders?limit=50`);
    setOrders(res.orders);
  }

  useEffect(() => {
    void load();
  }, [slug]);

  async function cancelOrder(orderId: string) {
    const reason = window.prompt("Lý do hủy (ops):") ?? "";
    setBusyId(orderId);
    try {
      await api(`/admin/zones/${slug}/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel", reason: reason || undefined }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageShell title="Đơn hàng">
      <div className="card">
        {orders.length === 0 ? (
          <p className="stat">Chưa có đơn.</p>
        ) : (
          orders.map((o) => (
            <article key={o.id} className="provider-card" style={{ marginBottom: 12 }}>
              <strong>{o.orderNumber}</strong> · {formatVnd(o.totalVnd)}
              <p className="stat">{orderStatusLabel(o.status)}</p>
              <p className="stat">
                {o.zone.displayName} · {o.provider.brandName}
              </p>
              <p className="stat" style={{ marginBottom: 8 }}>
                Giao: {o.delivery.building}-{o.delivery.apartment}
              </p>
              {!["DELIVERED", "SYSTEM_CANCELLED", "CUSTOMER_CANCELLED", "PROVIDER_REJECTED"].includes(
                o.status,
              ) ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                  disabled={busyId === o.id}
                  onClick={() => void cancelOrder(o.id)}
                >
                  Hủy (ops)
                </button>
              ) : null}
              <OrderFinance orderId={o.id} status={o.status} />
            </article>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}

function OrderFinance({ orderId, status }: { orderId: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const cancelled = ["CUSTOMER_CANCELLED", "SYSTEM_CANCELLED", "PROVIDER_REJECTED"].includes(status);

  useEffect(() => {
    if (!open) return;
    void api<{ canWrite: boolean }>(`/admin/finance/orders/${orderId}`)
      .then((row) => setCanWrite(row.canWrite))
      .catch(() => setCanWrite(false));
  }, [open, orderId]);

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ width: "auto", marginTop: 8 }} onClick={() => setOpen(true)}>
        Tài chính đơn
      </button>
    );
  }

  return (
    <form
      style={{ display: "grid", gap: 8, marginTop: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        void api<{ message?: string }>(`/admin/finance/orders/${orderId}/refund`, {
          method: "POST",
          body: JSON.stringify({ amountVnd: Number(amount), reason }),
        }).then((row) => setMessage(row.message ?? "Đã ghi hoàn tiền trên sổ. Hoàn ngân hàng vẫn thủ công."));
      }}
    >
      {canWrite ? (
        <>
          <input placeholder="Số tiền hoàn" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <input placeholder="Lý do" value={reason} onChange={(event) => setReason(event.target.value)} />
          <button type="submit" className="btn">Ghi hoàn tiền nội bộ</button>
          <p className="stat">Sổ ghi nhận hoàn tiền. PayOS/ngân hàng không tự hoàn — trạng thái ngoài là chờ xử lý thủ công.</p>
          {cancelled ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const why = window.prompt("Lý do xác nhận đã giao sau hủy") ?? "";
                if (!why) return;
                void api(`/admin/finance/orders/${orderId}/fulfilled-after-cancel`, {
                  method: "POST",
                  body: JSON.stringify({ reason: why }),
                }).then(() => setMessage("Đã xác nhận giao sau hủy. Phí chỉ ghi một lần."));
              }}
            >
              Xác nhận đã giao sau khi hủy
            </button>
          ) : null}
        </>
      ) : (
        <p className="stat">Chỉ SUPER_ADMIN hoặc FINANCE đúng khu được ghi hoàn tiền.</p>
      )}
      {message ? <p>{message}</p> : null}
    </form>
  );
}
