"use client";

import { useEffect, useState } from "react";
import { AdminPageShell } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";
import { orderStatusLabel } from "../../../../lib/orders";

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
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await api<{ orders: AdminOrder[] }>("/admin/orders?limit=50");
    setOrders(res.orders);
  }

  useEffect(() => {
    void load();
  }, []);

  async function cancelOrder(orderId: string) {
    const reason = window.prompt("Lý do hủy (ops):") ?? "";
    setBusyId(orderId);
    try {
      await api(`/admin/orders/${orderId}`, {
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
            </article>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}
