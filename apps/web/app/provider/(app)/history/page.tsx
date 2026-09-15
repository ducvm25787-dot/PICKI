"use client";

import { useEffect, useState } from "react";
import { OrderPhoneLinks } from "../../../components/order-phone-links";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isCustomerVisitVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";
import { OrderNumberHeading } from "../../../components/order-number-heading";
import { orderStatusRich } from "../../../../lib/order-display";
import { formatOrderAmount } from "../../../../lib/money";

type HistoryOrder = {
  id: string;
  orderNumber: string;
  providerBrandName?: string | null;
  serviceVertical?: string;
  status: string;
  totalVnd: number;
  completedAt: string;
  delivery: { building: string | null; apartment: string | null };
  runner: { displayName: string } | null;
};

type VisitHistoryIntent = {
  id: string;
  offeringName: string | null;
  etaMinutes: number;
  expectedAt: string;
  arrivedAt: string | null;
  customer: { displayName: string; phone: string | null };
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BeautyVisitHistory() {
  const { locationId, locations } = useProviderLocation();
  const [intents, setIntents] = useState<VisitHistoryIntent[]>([]);
  const [loading, setLoading] = useState(true);

  const activeLocationId = locations.some((l) => l.locationId === locationId) ? locationId : "";

  useEffect(() => {
    if (!activeLocationId) {
      setIntents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void api<{ intents: VisitHistoryIntent[] }>(
      `/provider/visit-intents/history?locationId=${activeLocationId}`,
    )
      .then((res) => setIntents(res.intents))
      .finally(() => setLoading(false));
  }, [activeLocationId]);

  return (
    <div className="card">
      <p className="section-title">Khách đã tới tiệm ({intents.length})</p>
      {loading ? (
        <p className="stat">Đang tải…</p>
      ) : intents.length === 0 ? (
          <p className="stat">
            Chưa có khách — bấm &quot;Đã tới tiệm&quot; / &quot;Pet đã tới&quot; ở tab Sắp tới để lưu vào
            đây.
          </p>
      ) : (
        intents.map((intent) => (
          <article key={intent.id} className="provider-card" style={{ marginBottom: 12 }}>
            <strong>{intent.customer.displayName}</strong>
            <p className="stat" style={{ margin: "6px 0" }}>
              {intent.offeringName ?? "Dịch vụ"}
              {" · "}
              Dự kiến ~{" "}
              {new Date(intent.expectedAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {intent.arrivedAt ? (
              <p className="stat" style={{ margin: "0 0 8px", fontSize: 13 }}>
                Đã tới lúc {formatDateTime(intent.arrivedAt)}
              </p>
            ) : null}
            {intent.customer.phone ? (
              <OrderPhoneLinks
                contacts={{
                  customer: {
                    phone: intent.customer.phone,
                    displayName: intent.customer.displayName,
                  },
                  provider: { phone: null },
                }}
                showOnly="customer"
                compact
              />
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}

function OrderHistory() {
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
    <div className="card">
      <p className="section-title">Đơn đã xử lý ({orders.length})</p>
      {loading ? (
        <p className="stat">Đang tải…</p>
      ) : orders.length === 0 ? (
        <p className="stat">Chưa có đơn — sau khi giao xong hoặc hủy sẽ hiện ở đây.</p>
      ) : (
        orders.map((o) => (
          <article key={o.id} className="provider-card" style={{ marginBottom: 12 }}>
            <OrderNumberHeading
              orderNumber={o.orderNumber}
              providerBrandName={o.providerBrandName}
              right={<span>{formatOrderAmount(o.totalVnd, o.serviceVertical)}</span>}
            />
            <p className="stat">{orderStatusRich(o.status, { runner: o.runner })}</p>
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
  );
}

export default function ProviderHistoryPage() {
  const { activeLocation } = useProviderLocation();
  const isCustomerVisit = isCustomerVisitVertical(activeLocation?.providerType);
  const isPet = activeLocation?.providerType === "PET_SERVICE";

  return (
    <ProviderPageShell
      title={
        isCustomerVisit
          ? isPet
            ? "Lịch sử pet đã tới tiệm"
            : "Lịch sử khách tới tiệm"
          : "Lịch sử đơn hàng"
      }
    >
      {isCustomerVisit ? <BeautyVisitHistory /> : <OrderHistory />}
    </ProviderPageShell>
  );
}
