"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OrderChat } from "../../components/order-chat";
import { OrderStatusSteps } from "../../components/order-status-steps";
import {
  RunnerPageShell,
  useRunnerSession,
  type RunnerOrder,
} from "../../components/runner-session-context";
import { api } from "../../../lib/api";
import { orderStatusRich } from "../../../lib/order-display";
import { formatVnd } from "../../../lib/money";

function RunnerOrderCard({
  order,
  hasRoute,
  onAction,
}: {
  order: RunnerOrder;
  hasRoute: boolean;
  onAction: (orderId: string, act: string) => void;
}) {
  const canClaim = !order.assignedToMe && order.status === "PROVIDER_ACCEPTED";

  return (
    <article className="provider-card" style={{ marginBottom: 12 }}>
      <strong>{order.orderNumber}</strong> · {formatVnd(order.totalVnd)}
      <p className="stat">
        {orderStatusRich(order.status, {
          estimatedReadyAt: order.estimatedReadyAt,
          providerHandoffAt: order.providerHandoffAt,
        })}
      </p>
      <OrderStatusSteps status={order.status} />
      <p className="stat">
        {order.delivery.building}-{order.delivery.apartment}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {canClaim ? (
          <button
            type="button"
            className="btn runner-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => onAction(order.id, "accept")}
          >
            Nhận giao
          </button>
        ) : null}
        {order.assignedToMe && order.status === "RUNNER_ASSIGNED" ? (
          <p className="stat" style={{ margin: 0 }}>
            Chờ quán bắt đầu nấu…
          </p>
        ) : null}
        {order.assignedToMe && order.status === "PREPARING" ? (
          <p className="stat" style={{ margin: 0 }}>
            Quán đang nấu — chuẩn bị đến lấy theo ETA
          </p>
        ) : null}
        {order.assignedToMe && order.status === "READY" && !order.providerHandoffAt ? (
          <p className="stat" style={{ margin: 0 }}>
            Món sẵn sàng — chờ quán xác nhận giao hàng
          </p>
        ) : null}
        {!hasRoute && order.assignedToMe && order.status === "READY" && order.providerHandoffAt ? (
          <button
            type="button"
            className="btn runner-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => onAction(order.id, "picked_up")}
          >
            Đã nhận hàng tại quán
          </button>
        ) : null}
        {!hasRoute && order.assignedToMe && order.status === "PICKED_UP" ? (
          <button
            type="button"
            className="btn runner-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => onAction(order.id, "delivering")}
          >
            Đang giao
          </button>
        ) : null}
        {!hasRoute && order.assignedToMe && order.status === "DELIVERING" ? (
          <button
            type="button"
            className="btn runner-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => onAction(order.id, "delivered")}
          >
            Đã giao
          </button>
        ) : null}
      </div>
      {order.assignedToMe && order.status !== "DELIVERED" ? (
        <OrderChat orderId={order.id} compact />
      ) : null}
    </article>
  );
}

export default function RunnerOrdersPage() {
  const { pool, mine, route, refresh } = useRunnerSession();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function action(orderId: string, act: string) {
    await api(`/runner/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: act }),
    });
    await refresh();
  }

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const hasRoute = Boolean(route && route.stops.length > 0);

  return (
    <RunnerPageShell title="Giao hàng Zone KVL">
      {hasRoute ? (
        <div className="runner-route-hint">
          Route batch đang chạy — bước sảnh/lobby ở tab <Link href="/runner/route">Route</Link>.
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}
        >
          <p className="section-title" style={{ margin: 0 }}>
            Tìm runner ({pool.length})
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
        {pool.length === 0 ? (
          <p className="stat">Chưa có đơn chờ runner (quán phải nhận đơn trước).</p>
        ) : (
          pool.map((o) => (
            <RunnerOrderCard
              key={o.id}
              order={o}
              hasRoute={hasRoute}
              onAction={(id, act) => void action(id, act)}
            />
          ))
        )}
      </div>

      <div className="card">
        <p className="section-title">Đơn của tôi ({mine.length})</p>
        {mine.length === 0 ? (
          <p className="stat">Chưa nhận đơn — nhận khi quán vừa xác nhận.</p>
        ) : (
          mine.map((o) => (
            <RunnerOrderCard
              key={o.id}
              order={o}
              hasRoute={hasRoute}
              onAction={(id, act) => void action(id, act)}
            />
          ))
        )}
      </div>
    </RunnerPageShell>
  );
}
