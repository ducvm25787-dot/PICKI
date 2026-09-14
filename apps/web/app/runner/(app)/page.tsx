"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OrderChat } from "../../components/order-chat";
import { OrderStatusSteps } from "../../components/order-status-steps";
import {
  RunnerPageShell,
  lobbyStatusLabel,
  useRunnerSession,
  type RunnerOrder,
} from "../../components/runner-session-context";
import { api } from "../../../lib/api";
import { orderStatusRich } from "../../../lib/order-display";
import { formatVnd } from "../../../lib/money";

function pickupBlockReason(mine: RunnerOrder[]): string | null {
  const active = mine.filter(
    (o) => o.assignedToMe && !["PICKED_UP", "DELIVERING", "DELIVERED"].includes(o.status),
  );
  if (active.length === 0) return null;
  if (active.some((o) => o.status === "RUNNER_ASSIGNED" || o.status === "PREPARING")) {
    return "Chưa hết đơn sẵn sàng — chờ quán nấu và bàn giao cho runner (tất cả đơn trong route)";
  }
  if (active.some((o) => o.status === "READY" && !o.providerHandoffAt)) {
    return "Chờ quán bấm 'Đã giao cho runner' trên các đơn còn lại trong route";
  }
  return null;
}

function RouteSummaryCard() {
  const { route, mine, refresh } = useRunnerSession();
  const [actionError, setActionError] = useState<string | null>(null);

  if (!route || route.stops.length === 0) return null;

  const nextStop = route.stops.find((s) => s.status === "PENDING" || s.status === "ARRIVED");

  async function completeStop(stopId: string) {
    setActionError(null);
    try {
      await api(`/runner/route/stops/${stopId}`, { method: "PATCH" });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không thực hiện được");
    }
  }

  async function arriveLobby(stopId: string) {
    setActionError(null);
    try {
      await api(`/runner/route/stops/${stopId}/arrive`, { method: "PATCH" });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không thực hiện được");
    }
  }

  const pickupBlocked =
    nextStop?.stopType === "PICKUP" ? pickupBlockReason(mine) : null;

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--runner-accent, #0d9488)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p className="section-title" style={{ margin: 0 }}>
          Route đang chạy · {route.orderCount} đơn
        </p>
        <Link href="/runner/route" className="stat" style={{ fontSize: 13 }}>
          Chi tiết →
        </Link>
      </div>
      {nextStop ? (
        <article className="provider-card" style={{ marginBottom: 0 }}>
          <strong>
            Bước tiếp: {nextStop.sequence}. {nextStop.label}
          </strong>
          <p className="stat" style={{ margin: "4px 0 8px" }}>
            {nextStop.stopType} ·{" "}
            {nextStop.status === "ARRIVED" ? "Đã đến — xử lý giao hàng" : "Chưa hoàn thành"}
          </p>
          {nextStop.handoffs?.map((h) => (
            <p key={h.orderId} className="stat" style={{ margin: "2px 0", fontSize: 14 }}>
              {h.orderNumber} · {h.apartment ?? "—"} · {lobbyStatusLabel(h.customerStatus)}
            </p>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {nextStop.stopType === "LOBBY_DROPOFF" ? (
              <p className="stat" style={{ margin: "0 0 8px", fontSize: 13 }}>
                Khách chọn <strong>nhận tại sảnh</strong> — bấm &quot;Đã giao&quot; khi khách nhận, không lên căn.
              </p>
            ) : null}
            {nextStop.status === "PENDING" &&
            (nextStop.stopType === "LOBBY_DROPOFF" || nextStop.stopType === "PICKI_POINT") ? (
              <button
                type="button"
                className="btn runner-btn"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => void arriveLobby(nextStop.id)}
              >
                Đã đến sảnh
              </button>
            ) : null}
            {pickupBlocked ? (
              <p className="stat" style={{ margin: "8px 0 0", color: "var(--warn, #b45309)" }}>
                {pickupBlocked}
              </p>
            ) : null}
            {actionError ? (
              <p className="stat" style={{ margin: "8px 0 0", color: "var(--danger, #dc2626)" }}>
                {actionError}
              </p>
            ) : null}
            {nextStop.status === "PENDING" && nextStop.stopType === "PICKUP" ? (
              <button
                type="button"
                className="btn runner-btn"
                style={{ width: "auto", padding: "8px 12px" }}
                disabled={Boolean(pickupBlocked)}
                onClick={() => void completeStop(nextStop.id)}
              >
                Đã lấy hàng tại quán
              </button>
            ) : null}
            {nextStop.status === "ARRIVED" || (nextStop.status === "PENDING" && nextStop.stopType !== "PICKUP") ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => void completeStop(nextStop.id)}
              >
                Hoàn thành bước
              </button>
            ) : null}
          </div>
        </article>
      ) : (
        <p className="stat" style={{ margin: 0 }}>
          Tất cả bước đã xong.
        </p>
      )}
    </div>
  );
}

function RunnerOrderCard({
  order,
  hasRoute,
  onAction,
}: {
  order: RunnerOrder;
  hasRoute: boolean;
  onAction: (orderId: string, act: string) => void;
}) {
  const canClaim =
    !order.assignedToMe && order.status === "PROVIDER_ACCEPTED" && order.runnerSoughtAt != null;

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
      {order.assignedToMe && order.routeId && hasRoute ? (
        <p className="stat" style={{ marginBottom: 8, fontSize: 13 }}>
          Route đã tạo — làm theo bước ở thẻ Route phía trên hoặc tab{" "}
          <Link href="/runner/route">Route</Link>.
        </p>
      ) : null}
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
      <RouteSummaryCard />

      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}
        >
          <p className="section-title" style={{ margin: 0 }}>
            Đơn chờ nhận ({pool.length})
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
          <p className="stat">Chưa có đơn — quán phải nhận đơn và bấm &quot;Tìm runner&quot; trước.</p>
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
          <p className="stat">Chưa nhận đơn — nhận từ danh sách phía trên.</p>
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
