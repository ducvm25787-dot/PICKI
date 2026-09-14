"use client";

import { useCallback, useEffect, useState } from "react";
import { OrderChat } from "../../components/order-chat";
import { ProviderPageShell, useProviderLocation } from "../../components/provider-location-context";
import { OrderStatusSteps } from "../../components/order-status-steps";
import { api } from "../../../lib/api";
import { orderStatusRich } from "../../../lib/order-display";
import { formatVnd } from "../../../lib/money";

type ProviderOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalVnd: number;
  estimatedReadyAt: string | null;
  providerHandoffAt: string | null;
  runner: { displayName: string } | null;
  delivery: { building: string | null; apartment: string | null };
  items: { name: string; quantity: number }[];
};

export default function ProviderOrdersPage() {
  const { locationId } = useProviderLocation();
  const [orders, setOrders] = useState<ProviderOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!locationId) return;
    const res = await api<{ orders: ProviderOrder[] }>(`/provider/orders?locationId=${locationId}`);
    setOrders(res.orders);
  }, [locationId]);

  useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => {
      void loadOrders();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  async function action(orderId: string, act: string) {
    await api(`/provider/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: act }),
    });
    await loadOrders();
  }

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await loadOrders();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ProviderPageShell title="Đơn hàng">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p className="section-title" style={{ margin: 0 }}>
            Đơn hàng
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
            disabled={refreshing}
            onClick={() => void manualRefresh()}
          >
            {refreshing ? "…" : "Làm mới"}
          </button>
        </div>
        {orders.length === 0 ? (
          <p className="stat">Chưa có đơn mới.</p>
        ) : (
          orders.map((o) => (
            <article key={o.id} className="provider-card" style={{ marginBottom: 12 }}>
              <strong>{o.orderNumber}</strong> · {formatVnd(o.totalVnd)}
              <p className="stat">
                {orderStatusRich(o.status, {
                  estimatedReadyAt: o.estimatedReadyAt,
                  providerHandoffAt: o.providerHandoffAt,
                  runner: o.runner,
                })}
              </p>
              <OrderStatusSteps status={o.status} />
              <p style={{ fontSize: 14, margin: "4px 0 8px" }}>
                {o.items.map((i) => `${i.name}×${String(i.quantity)}`).join(", ")}
              </p>
              <p className="stat" style={{ marginBottom: 8 }}>
                Giao: {o.delivery.building}-{o.delivery.apartment}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {o.status === "CREATED" || o.status === "PAID" ? (
                  <>
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      onClick={() => void action(o.id, "accept")}
                    >
                      Nhận đơn
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "8px 12px" }}
                      onClick={() => void action(o.id, "reject")}
                    >
                      Từ chối
                    </button>
                  </>
                ) : null}
                {o.status === "PROVIDER_ACCEPTED" ? (
                  <p className="stat" style={{ margin: 0 }}>
                    ⏳ Đang tìm runner… Runner nhận xong mới bấm nấu.
                  </p>
                ) : null}
                {o.status === "RUNNER_ASSIGNED" ? (
                  <button
                    type="button"
                    className="btn provider-btn"
                    style={{ width: "auto", padding: "8px 12px" }}
                    onClick={() => void action(o.id, "preparing")}
                  >
                    Bắt đầu nấu
                  </button>
                ) : null}
                {o.status === "PREPARING" ? (
                  <button
                    type="button"
                    className="btn provider-btn"
                    style={{ width: "auto", padding: "8px 12px" }}
                    onClick={() => void action(o.id, "ready")}
                  >
                    Sẵn sàng giao
                  </button>
                ) : null}
                {o.status === "READY" && !o.providerHandoffAt && o.runner ? (
                  <button
                    type="button"
                    className="btn provider-btn"
                    style={{ width: "auto", padding: "8px 12px" }}
                    onClick={() => void action(o.id, "handoff")}
                  >
                    Đã giao cho runner
                  </button>
                ) : null}
                {o.status === "READY" && o.providerHandoffAt ? (
                  <p className="stat" style={{ margin: 0 }}>
                    ✓ Đã giao — chờ runner xác nhận nhận hàng
                  </p>
                ) : null}
              </div>
              <OrderChat orderId={o.id} compact />
            </article>
          ))
        )}
      </div>
    </ProviderPageShell>
  );
}
