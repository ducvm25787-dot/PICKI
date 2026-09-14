"use client";

import { useEffect, useState } from "react";
import { RunnerPageShell } from "../../../components/runner-session-context";
import { api } from "../../../../lib/api";
import { orderStatusRich } from "../../../../lib/order-display";
import { formatVnd } from "../../../../lib/money";

type HistoryOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalVnd: number;
  completedAt: string;
  delivery: { building: string | null; apartment: string | null };
};

export default function RunnerHistoryPage() {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ orders: HistoryOrder[] }>("/runner/orders/history")
      .then((res) => setOrders(res.orders))
      .finally(() => setLoading(false));
  }, []);

  return (
    <RunnerPageShell title="Lịch sử giao hàng">
      <div className="card">
        <p className="section-title">Đơn đã hoàn thành ({orders.length})</p>
        {loading ? (
          <p className="stat">Đang tải…</p>
        ) : orders.length === 0 ? (
          <p className="stat">Chưa có đơn — sau khi giao xong sẽ hiện ở đây.</p>
        ) : (
          orders.map((o) => (
            <article key={o.id} className="provider-card" style={{ marginBottom: 12 }}>
              <strong>{o.orderNumber}</strong> · {formatVnd(o.totalVnd)}
              <p className="stat">{orderStatusRich(o.status)}</p>
              <p className="stat">
                {o.delivery.building}-{o.delivery.apartment}
              </p>
              <p className="stat" style={{ margin: 0, fontSize: 13 }}>
                {new Date(o.completedAt).toLocaleString("vi-VN")}
              </p>
            </article>
          ))
        )}
      </div>
    </RunnerPageShell>
  );
}
