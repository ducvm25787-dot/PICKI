"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NotificationBell } from "../../components/notification-bell";
import { OrderChat } from "../../components/order-chat";
import { api } from "../../../lib/api";
import { formatVnd } from "../../../lib/money";
import { OrderStatusSteps } from "../../components/order-status-steps";
import { orderStatusRich } from "../../../lib/order-display";

type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  estimatedReadyAt: string | null;
  providerHandoffAt: string | null;
  runner: { displayName: string } | null;
  paymentMode: string;
  totalVnd: number;
  delivery: {
    building: string | null;
    floor: string | null;
    apartment: string | null;
  };
  items: {
    name: string;
    quantity: number;
    lineTotalVnd: number;
  }[];
  fulfillment: {
    nextStop: { label: string; stopType: string } | null;
    completedStops: number;
    totalStops: number;
  } | null;
  lobby: {
    building: string | null;
    pickiPointName: string | null;
    runnerArrived: boolean;
    customerStatus: string;
  } | null;
};

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const search = useSearchParams();
  const isNew = search.get("new") === "1";
  const needPay = search.get("pay") === "1";
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [lobbySending, setLobbySending] = useState(false);

  const reload = useCallback(async () => {
    const data = await api<OrderDetail>(`/orders/${params.orderId}`);
    setOrder(data);
  }, [params.orderId]);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
    const t = setInterval(() => void reload(), 8000);
    return () => clearInterval(t);
  }, [reload]);

  async function comingDown() {
    setLobbySending(true);
    try {
      await api(`/orders/${params.orderId}/lobby`, {
        method: "PATCH",
        body: JSON.stringify({ action: "coming_down" }),
      });
      await reload();
    } finally {
      setLobbySending(false);
    }
  }

  async function payOnline() {
    setPaying(true);
    try {
      const intent = await api<{ paymentId: string }>(
        `/payments/orders/${params.orderId}/intent`,
        { method: "POST" },
      );
      await api(`/payments/${intent.paymentId}/dev-confirm`, { method: "POST" });
      await reload();
    } finally {
      setPaying(false);
    }
  }

  if (loading || !order) {
    return (
      <div className="container">
        <p className="tagline">{loading ? "Đang tải…" : "Không tìm thấy đơn"}</p>
      </div>
    );
  }

  const addr = [order.delivery.building, order.delivery.floor, order.delivery.apartment]
    .filter(Boolean)
    .join(" · ");

  const showPay =
    needPay ||
    (order.paymentMode === "PAY_ON_PICKI" &&
      (order.status === "CREATED" || order.status === "PAYMENT_PENDING"));

  return (
    <div className="container">
      {isNew && (
        <div
          className="card"
          style={{ marginBottom: 16, background: "#e8f8ef", borderColor: "#9fd4b5" }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>✓ Đặt món thành công!</p>
        </div>
      )}

      <div className="header-row" style={{ marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{order.orderNumber}</h1>
          <p className="stat" style={{ margin: 0 }}>
            {orderStatusRich(order.status, {
              estimatedReadyAt: order.estimatedReadyAt,
              providerHandoffAt: order.providerHandoffAt,
              runner: order.runner,
            })}
          </p>
          <OrderStatusSteps status={order.status} />
          {order.runner ? (
            <p className="stat" style={{ margin: "8px 0 0" }}>
              Runner: <strong>{order.runner.displayName}</strong>
            </p>
          ) : null}
        </div>
        <NotificationBell />
      </div>

      {showPay && order.status !== "PAID" && (
        <div className="card" style={{ margin: "16px 0" }}>
          <button type="button" className="btn" disabled={paying} onClick={() => void payOnline()}>
            {paying ? "Đang xử lý…" : `Thanh toán ${formatVnd(order.totalVnd)} (demo)`}
          </button>
        </div>
      )}

      <div className="card" style={{ margin: "16px 0" }}>
        <p className="section-title">Món đã đặt</p>
        {order.items.map((item) => (
          <div
            key={`${item.name}-${String(item.quantity)}`}
            style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}
          >
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatVnd(item.lineTotalVnd)}</span>
          </div>
        ))}
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
        <strong>{formatVnd(order.totalVnd)}</strong>
      </div>

      {addr && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Giao đến</p>
          <p style={{ margin: 0 }}>{addr}</p>
        </div>
      )}

      {order.lobby?.runnerArrived && order.status !== "DELIVERED" && (
        <div
          className="card"
          style={{ marginBottom: 16, background: "#fff8e6", borderColor: "#e6c878" }}
        >
          <p className="section-title">Runner đã đến sảnh</p>
          <p style={{ margin: "0 0 8px" }}>
            {order.lobby.pickiPointName ?? order.lobby.building ?? "Sảnh tòa nhà"}
          </p>
          {order.lobby.customerStatus === "COMING_DOWN" ? (
            <p className="stat">✓ Bạn đã báo đang xuống — runner sẽ giao tại sảnh</p>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={lobbySending}
              onClick={() => void comingDown()}
            >
              {lobbySending ? "Đang gửi…" : "Tôi đang xuống"}
            </button>
          )}
        </div>
      )}

      {order.fulfillment && order.fulfillment.totalStops > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Tiến độ giao</p>
          <p className="stat">
            {order.fulfillment.completedStops}/{order.fulfillment.totalStops} điểm dừng
          </p>
          {order.fulfillment.nextStop ? (
            <p style={{ margin: 0 }}>Tiếp theo: {order.fulfillment.nextStop.label}</p>
          ) : (
            <p style={{ margin: 0 }}>Route hoàn tất</p>
          )}
        </div>
      )}

      {order.status !== "DELIVERED" &&
      !["CUSTOMER_CANCELLED", "SYSTEM_CANCELLED", "PROVIDER_REJECTED"].includes(order.status) ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <OrderChat orderId={order.id} />
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
        <Link href="/provider/login" className="stat">
          Mở Provider app →
        </Link>
        <Link href="/runner/login" className="stat">
          Mở Runner app →
        </Link>
        <Link href="/orders" className="btn btn-secondary" style={{ textAlign: "center" }}>
          Tất cả đơn hàng
        </Link>
      </div>
    </div>
  );
}
