"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "../components/notification-bell";
import { api } from "../../lib/api";
import { OrderNumberHeading } from "../components/order-number-heading";
import { formatOrderAmount } from "../../lib/money";
import { orderStatusRich } from "../../lib/order-display";
import { isOrderFinished } from "../../lib/orders";

type OrderSummary = {
  id: string;
  orderNumber: string;
  providerBrandName?: string | null;
  status: string;
  serviceVertical?: string;
  totalVnd: number;
  estimatedReadyAt: string | null;
  runner: { displayName: string } | null;
  createdAt: string;
  items: { name: string; quantity: number }[];
};

type Me = {
  identities: { provider: string; externalUserId: string }[];
};

function formatLoginPhone(identities: Me["identities"]): string | null {
  const phone = identities.find((i) => i.provider === "PHONE")?.externalUserId;
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) return `0${digits.slice(2)}`;
  return phone;
}

function OrderCard({ order }: { order: OrderSummary }) {
  const active = !isOrderFinished(order.status);

  return (
    <Link
      href={`/orders/${order.id}`}
      className={`provider-card order-list-card ${active ? "order-list-card-active" : "order-list-card-finished"}`}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div className="order-list-card-head">
        <OrderNumberHeading
          orderNumber={order.orderNumber}
          providerBrandName={order.providerBrandName}
          right={<span>{formatOrderAmount(order.totalVnd, order.serviceVertical)}</span>}
        />
        {active ? (
          <span className="order-active-badge" aria-label="Đang xử lý">
            ⏳ Đang xử lý
          </span>
        ) : order.status === "DELIVERED" || order.status === "COMPLETED" ? (
          <span className="order-finished-badge" aria-label="Đã hoàn tất">
            ✓ Hoàn tất
          </span>
        ) : null}
      </div>
      <p className="stat" style={{ margin: "6px 0" }}>
        {orderStatusRich(order.status, {
          estimatedReadyAt: order.estimatedReadyAt,
          runner: order.runner,
          serviceVertical: order.serviceVertical,
        })}
      </p>
      <p style={{ margin: 0, fontSize: 14 }}>
        {order.items.map((i) => `${i.name}×${String(i.quantity)}`).join(", ")}
      </p>
    </Link>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loginPhone, setLoginPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const me = await api<Me>("/me");
        setLoginPhone(formatLoginPhone(me.identities));
        const res = await api<{ orders: OrderSummary[] }>("/orders/mine");
        setOrders(res.orders);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const activeOrders = orders.filter((o) => !isOrderFinished(o.status));
  const finishedOrders = orders.filter((o) => isOrderFinished(o.status));

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
          <NotificationBell audience="customer" />
          <Link href="/" className="stat">
            ← Trang chủ
          </Link>
        </div>
      </div>

      {loginPhone ? (
        <p className="stat" style={{ margin: "0 0 12px", fontSize: 13 }}>
          Đang xem với SĐT khách: <strong>{loginPhone}</strong>
          {orders.length === 0 ? (
            <>
              {" "}
              — nếu vừa đăng nhập Provider/Runner trên cùng trình duyệt, hãy{" "}
              <Link href="/login">đăng nhập lại khách</Link>.
            </>
          ) : null}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <div className="card">
          <p className="stat">Chưa có đơn — chọn quán và đặt món thử nhé.</p>
        </div>
      ) : (
        <>
          <section className="order-list-section">
            <h2 className="order-list-section-title">
              <span className="order-list-section-icon order-list-section-icon-active">⏳</span>
              Đơn đang xử lý
              {activeOrders.length > 0 ? (
                <span className="order-list-section-count">{activeOrders.length}</span>
              ) : null}
            </h2>
            {activeOrders.length === 0 ? (
              <p className="stat order-list-empty">Không có đơn đang xử lý.</p>
            ) : (
              <div className="provider-list">
                {activeOrders.map((o) => (
                  <OrderCard key={o.id} order={o} />
                ))}
              </div>
            )}
          </section>

          {finishedOrders.length > 0 ? (
            <section className="order-list-section order-list-section-finished">
              <h2 className="order-list-section-title">
                <span className="order-list-section-icon">✓</span>
                Đơn đã hoàn tất
                <span className="order-list-section-count">{finishedOrders.length}</span>
              </h2>
              <div className="provider-list">
                {finishedOrders.map((o) => (
                  <OrderCard key={o.id} order={o} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
