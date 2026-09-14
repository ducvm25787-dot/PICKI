"use client";

import { useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
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
  runner: { displayName: string } | null;
};

export default function ProviderHistoryPage() {
  const { locationId, locations } = useProviderLocation();
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const activeLocationId = locations.some((l) => l.locationId === locationId) ? locationId : "";

  useEffect(() => {
    if (!activeLocationId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void api<{ orders: HistoryOrder[] }>(
      `/provider/orders/history?locationId=${activeLocationId}`,
    )
      .then((res) => setOrders(res.orders))
      .finally(() => setLoading(false));
  }, [activeLocationId]);

  return (
    <ProviderPageShell title="Lịch sử đơn hàng">
      <div className="card">
        <p className="section-title">Đơn đã xử lý ({orders.length})</p>
        {loading ? (
          <p className="stat">Đang tải…</p>
        ) : orders.length === 0 ? (
          <p className="stat">Chưa có đơn — sau khi giao xong hoặc hủy sẽ hiện ở đây.</p>
        ) : (
          orders.map((o) => (
            <article key={o.id} className="provider-card" style={{ marginBottom: 12 }}>
              <strong>{o.orderNumber}</strong> · {formatVnd(o.totalVnd)}
              <p className="stat">
                {orderStatusRich(o.status, { runner: o.runner })}
              </p>
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
    </ProviderPageShell>
  );
}
