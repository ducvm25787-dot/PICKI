"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "../components/notification-bell";
import { api } from "../../lib/api";
import { formatVnd } from "../../lib/money";
import { orderStatusRich } from "../../lib/order-display";

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  totalVnd: number;
  estimatedReadyAt: string | null;
  runner: { displayName: string } | null;
  createdAt: string;
  items: { name: string; quantity: number }[];
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ orders: OrderSummary[] }>("/orders/mine")
      .then((res) => setOrders(res.orders))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải đơn hàng…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row">
        <h1 style={{ margin: 0, fontSize: 22 }}>Đơn của tôi</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationBell />
          <Link href="/" className="stat">
            ← Trang chủ
          </Link>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <p className="stat">Chưa có đơn — chọn quán và đặt món thử nhé.</p>
        </div>
      ) : (
        <div className="provider-list">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="provider-card"
              style={{ display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{o.orderNumber}</strong>
                <span>{formatVnd(o.totalVnd)}</span>
              </div>
              <p className="stat" style={{ margin: "6px 0" }}>
                {orderStatusRich(o.status, { estimatedReadyAt: o.estimatedReadyAt, runner: o.runner })}
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>
                {o.items.map((i) => `${i.name}×${String(i.quantity)}`).join(", ")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
