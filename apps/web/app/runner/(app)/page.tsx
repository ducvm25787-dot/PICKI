"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OrderChat } from "../../components/order-chat";
import { OrderPhoneLinks } from "../../components/order-phone-links";
import { OrderStatusSteps } from "../../components/order-status-steps";
import {
  RunnerPageShell,
  lobbyStatusLabel,
  useRunnerSession,
  type RunnerOrder,
} from "../../components/runner-session-context";
import { api } from "../../../lib/api";
import { OrderNumberHeading } from "../../components/order-number-heading";
import { orderStatusRich } from "../../../lib/order-display";
import { formatOrderAmount, formatVnd } from "../../../lib/money";

function pickupBlockReason(mine: RunnerOrder[]): string | null {
  const active = mine.filter(
    (o) => o.assignedToMe && !["PICKED_UP", "DELIVERING", "DELIVERED"].includes(o.status),
  );
  if (active.length === 0) return null;
  if (active.some((o) => o.status === "RUNNER_ASSIGNED" || o.status === "PREPARING")) {
    return "Chưa hết đơn sẵn sàng — chờ quán nấu và bàn giao cho runner (tất cả đơn trong tiến trình)";
  }
  if (active.some((o) => o.status === "READY" && !o.providerHandoffAt)) {
    return "Chờ quán bấm 'Đã giao cho runner' trên các đơn còn lại trong tiến trình";
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

  async function lobbyAction(stopId: string, orderId: string, action: "received" | "no_response") {
    setActionError(null);
    try {
      await api(`/runner/route/stops/${stopId}/lobby/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
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
          Tiến trình · {route.orderCount} đơn
        </p>
        <Link href="/runner/route" className="stat" style={{ fontSize: 13 }}>
          Chi tiết tiến trình →
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
            <div key={h.orderId} style={{ marginTop: 8, fontSize: 14 }}>
              <p className="stat" style={{ margin: "0 0 6px" }}>
                <strong>{h.orderNumber}</strong> · {h.apartment ?? "—"} ·{" "}
                {lobbyStatusLabel(h.customerStatus)}
              </p>
              {nextStop.status === "ARRIVED" &&
              h.customerStatus !== "RECEIVED" &&
              h.customerStatus !== "NO_RESPONSE" ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn runner-btn"
                    style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                    onClick={() => void lobbyAction(nextStop.id, h.orderId, "received")}
                  >
                    Đã giao khách
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                    onClick={() => void lobbyAction(nextStop.id, h.orderId, "no_response")}
                  >
                    Không phản hồi
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {nextStop.stopType === "LOBBY_DROPOFF" || nextStop.stopType === "PICKI_POINT" ? (
              <p className="stat" style={{ margin: "0 0 8px", fontSize: 13, width: "100%" }}>
                Khách nhận tại sảnh — bấm <strong>Đã giao khách</strong> từng đơn, rồi hoàn thành bước.
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
            {nextStop.status === "PENDING" &&
            nextStop.stopType !== "PICKUP" &&
            nextStop.stopType !== "LOBBY_DROPOFF" &&
            nextStop.stopType !== "PICKI_POINT" ? (
              <button
                type="button"
                className="btn runner-btn"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => void completeStop(nextStop.id)}
              >
                Hoàn thành bước
              </button>
            ) : null}
            {nextStop.status === "ARRIVED" ? (
              <button
                type="button"
                className="btn runner-btn"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => void completeStop(nextStop.id)}
              >
                Hoàn thành điểm sảnh
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
  const onRoute = Boolean(order.routeId);
  const canClaim =
    !order.assignedToMe &&
    order.runnerSoughtAt != null &&
    (order.serviceVertical === "LAUNDRY"
      ? order.status === "READY_FOR_RETURN"
      : order.status === "PROVIDER_ACCEPTED" || order.status === "READY");

  return (
    <article id={`order-${order.id}`} className="provider-card" style={{ marginBottom: 12 }}>
      <OrderNumberHeading
        orderNumber={order.orderNumber}
        providerBrandName={order.providerBrandName}
        right={<span>{formatOrderAmount(order.totalVnd, order.serviceVertical)}</span>}
      />
      {(order.deliveryFeeVnd ?? 0) > 0 ? (
        <p className="stat" style={{ margin: "4px 0 0", fontSize: 13 }}>
          Phí giao (quán trả): {formatVnd(order.deliveryFeeVnd ?? 0)}
        </p>
      ) : null}
      <p className="stat">
        {orderStatusRich(order.status, {
          estimatedReadyAt: order.estimatedReadyAt,
          providerHandoffAt: order.providerHandoffAt,
          serviceVertical: order.serviceVertical,
        })}
      </p>
      <OrderStatusSteps
        status={order.status}
        runnerSoughtAt={order.runnerSoughtAt}
        serviceVertical={order.serviceVertical}
        orderKind={order.orderKind}
        audience="runner"
      />
      {order.deliveryWindow?.label || order.serviceDate ? (
        <p className="stat" style={{ margin: "4px 0" }}>
          {order.deliveryWindow?.label
            ? `Khung giao: ${order.deliveryWindow.label}`
            : null}
          {order.deliveryWindow?.label && order.serviceDate ? " · " : null}
          {order.serviceDate ? `Ngày ${order.serviceDate}` : null}
        </p>
      ) : null}
      <p className="stat">
        {order.delivery.building}-{order.delivery.apartment}
      </p>
      {order.contacts ? (
        <OrderPhoneLinks contacts={order.contacts} hideRole="runner" compact />
      ) : null}
      {order.assignedToMe && onRoute && order.status !== "DELIVERED" ? (
        <p className="stat" style={{ marginBottom: 8, fontSize: 13 }}>
          {hasRoute ? (
            <>
              Làm theo <strong>Tiến trình</strong> phía trên (hoặc tab{" "}
              <Link href="/runner/route">Tiến trình</Link>) — không cần bấm giao lại ở đây.
            </>
          ) : (
            <>Đã gắn tiến trình — trạng thái cập nhật khi hoàn thành bước giao.</>
          )}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {canClaim ? (
          <>
            <button
              type="button"
              className="btn runner-btn"
              style={{ width: "auto", padding: "8px 12px" }}
              onClick={() => onAction(order.id, "accept")}
            >
              Nhận giao
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "auto", padding: "8px 12px" }}
              onClick={() => onAction(order.id, "skip")}
            >
              Bỏ qua
            </button>
          </>
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
        {!onRoute && order.assignedToMe && order.status === "READY" && order.providerHandoffAt ? (
          <button
            type="button"
            className="btn runner-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => onAction(order.id, "picked_up")}
          >
            Đã nhận hàng tại quán
          </button>
        ) : null}
        {!onRoute && order.assignedToMe && order.status === "PICKED_UP" ? (
          <button
            type="button"
            className="btn runner-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => onAction(order.id, "delivering")}
          >
            Đang giao
          </button>
        ) : null}
        {!onRoute && order.assignedToMe && order.status === "DELIVERING" ? (
          <button
            type="button"
            className="btn runner-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => onAction(order.id, "delivered")}
          >
            Đã giao
          </button>
        ) : null}
        {onRoute &&
        order.assignedToMe &&
        (order.status === "PICKED_UP" || order.status === "DELIVERING") ? (
          <p className="stat" style={{ margin: 0 }}>
            Đang giao theo tiến trình
          </p>
        ) : null}
      </div>
      {order.assignedToMe && order.status !== "DELIVERED" ? (
        <OrderChat orderId={order.id} viewerRole="RUNNER" compact />
      ) : null}
    </article>
  );
}

export default function RunnerOrdersPage() {
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get("focus");
  const { pool, mine, route, refresh } = useRunnerSession();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!focusOrderId) return;
    const el = document.getElementById(`order-${focusOrderId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("order-focus-highlight");
    }
  }, [focusOrderId, pool, mine]);

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
          <p className="stat">
            Chưa có đơn — giặt là chỉ hiện khi tiệm bấm &quot;Tìm runner&quot; ở bước giao lại; food
            khi quán bấm tìm runner sau nhận đơn.
          </p>
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
