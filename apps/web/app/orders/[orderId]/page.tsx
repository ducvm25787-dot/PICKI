"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NotificationBell } from "../../components/notification-bell";
import { OrderChat } from "../../components/order-chat";
import { OrderPhoneLinks } from "../../components/order-phone-links";
import { api } from "../../../lib/api";
import { OrderNumberHeading } from "../../components/order-number-heading";
import { formatLaundryReferencePrice, formatOrderAmount, formatVnd } from "../../../lib/money";
import { fdFormatItemQtyLabel } from "../../../lib/family-dinner";
import { isLaundryVertical, orderButtonLabel } from "../../../lib/providers";
import { OrderStatusSteps } from "../../components/order-status-steps";
import { formatAddressLine, handoffModeLabel, isApartmentAddress } from "../../../lib/addresses";
import { orderStatusRich } from "../../../lib/order-display";

type OrderDetail = {
  id: string;
  orderNumber: string;
  providerBrandName?: string | null;
  status: string;
  serviceVertical?: string;
  orderKind?: string;
  serviceDate?: string | null;
  laundryPickupMode?: string | null;
  estimatedReadyAt: string | null;
  providerHandoffAt: string | null;
  runnerSoughtAt?: string | null;
  runner: { displayName: string } | null;
  contacts?: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
    runner?: { phone: string | null; displayName?: string | null } | null;
  };
  paymentMode: string;
  subtotalVnd?: number;
  deliveryFeeVnd?: number;
  totalVnd: number;
  deliveryWindow?: { startsAt: string; endsAt: string; label: string } | null;
  delivery: {
    addressType?: string;
    handoffMode?: string;
    building: string | null;
    houseNumber?: string | null;
    alley?: string | null;
    street?: string | null;
    ward?: string | null;
    floor: string | null;
    apartment: string | null;
    note?: string | null;
  };
  items: {
    name: string;
    quantity: number;
    unitPriceVnd?: number;
    lineTotalVnd: number;
    estimatedDays?: number | null;
    category?: string | null;
    prepMode?: string | null;
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
  canCancel?: boolean;
};

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const search = useSearchParams();
  const isNew = search.get("new") === "1";
  const needPay = search.get("pay") === "1";
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<{
    paymentId: string;
    checkoutUrl?: string;
    qrCode?: string;
    providerKind?: string;
    devConfirmPath?: string;
  } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [lobbySending, setLobbySending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  async function cancelOrder() {
    if (!order || !window.confirm("Hủy đơn này?")) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await api(`/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });
      await reload();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Không hủy được đơn");
    } finally {
      setCancelling(false);
    }
  }

  async function payOnline() {
    setPaying(true);
    setPayError(null);
    try {
      const intent = await api<{
        paymentId: string;
        status: string;
        providerKind: string;
        checkoutUrl?: string;
        qrCode?: string;
        devConfirmPath?: string;
      }>(`/payments/orders/${params.orderId}/intent`, { method: "POST" });

      if (intent.status === "SUCCEEDED") {
        await reload();
        return;
      }

      setPaymentInfo({
        paymentId: intent.paymentId,
        checkoutUrl: intent.checkoutUrl,
        qrCode: intent.qrCode,
        providerKind: intent.providerKind,
        devConfirmPath: intent.devConfirmPath,
      });

      if (intent.providerKind === "PAYOS") {
        void pollPayment(intent.paymentId);
        return;
      }

      if (intent.devConfirmPath) {
        await api(`/payments/${intent.paymentId}/dev-confirm`, { method: "POST" });
        await reload();
      }
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Thanh toán thất bại");
    } finally {
      setPaying(false);
    }
  }

  async function pollPayment(paymentId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const st = await api<{ status: string; orderStatus: string }>(`/payments/${paymentId}`);
        if (st.status === "SUCCEEDED") {
          setPaymentInfo(null);
          await reload();
          return;
        }
        if (st.status === "FAILED") {
          setPayError("Thanh toán không thành công");
          return;
        }
      } catch {
        /* retry */
      }
    }
  }

  async function devConfirmPayment() {
    if (!paymentInfo?.paymentId) return;
    setPaying(true);
    try {
      await api(`/payments/${paymentInfo.paymentId}/dev-confirm`, { method: "POST" });
      setPaymentInfo(null);
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

  const addr = formatAddressLine({
    id: "",
    label: "",
    addressType: order.delivery.addressType ?? "RESIDENTIAL",
    building: order.delivery.building,
    floor: order.delivery.floor,
    apartment: order.delivery.apartment,
    houseNumber: order.delivery.houseNumber ?? null,
    alley: order.delivery.alley ?? null,
    street: order.delivery.street ?? null,
    ward: order.delivery.ward ?? null,
    city: null,
    deliveryNote: order.delivery.note ?? null,
  });
  const handoffMode =
    order.delivery.handoffMode === "DOOR_DELIVERY" ? "DOOR_DELIVERY" : "LOBBY_PICKUP";
  const isApartment = isApartmentAddress({
    addressType: order.delivery.addressType ?? "RESIDENTIAL",
  });
  const showLobbyPickup =
    isApartment &&
    handoffMode === "LOBBY_PICKUP" &&
    order.lobby?.runnerArrived &&
    order.status !== "DELIVERED";

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
          <p style={{ margin: 0, fontWeight: 600 }}>
            ✓ {orderButtonLabel(order.serviceVertical === "LAUNDRY" ? "LAUNDRY" : "FOOD")} thành công!
          </p>
        </div>
      )}

      <div className="header-row" style={{ marginBottom: 8 }}>
        <div>
          <OrderNumberHeading
            orderNumber={order.orderNumber}
            providerBrandName={order.providerBrandName}
            as="h1"
          />
          <p className="stat" style={{ margin: 0 }}>
            {orderStatusRich(order.status, {
              estimatedReadyAt: order.estimatedReadyAt,
              providerHandoffAt: order.providerHandoffAt,
              runner: order.runner,
              serviceVertical: order.serviceVertical,
              laundryPickupMode: order.laundryPickupMode,
            })}
          </p>
          <OrderStatusSteps
            status={order.status}
            runnerSoughtAt={order.runnerSoughtAt}
            hasRunner={!!order.runner}
            serviceVertical={order.serviceVertical}
            laundryPickupMode={order.laundryPickupMode}
            orderKind={order.orderKind}
            audience="customer"
          />
          {order.deliveryWindow?.label || order.serviceDate ? (
            <p className="stat" style={{ margin: "8px 0 0" }}>
              {order.deliveryWindow?.label
                ? `Khung giao: ${order.deliveryWindow.label}`
                : null}
              {order.deliveryWindow?.label && order.serviceDate ? " · " : null}
              {order.serviceDate ? `Ngày ${order.serviceDate}` : null}
            </p>
          ) : null}
          {order.runner && order.serviceVertical !== "LAUNDRY" ? (
            <p className="stat" style={{ margin: "8px 0 0" }}>
              Runner: <strong>{order.runner.displayName}</strong>
            </p>
          ) : null}
        </div>
        <NotificationBell audience="customer" />
      </div>

      {order.contacts ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Liên hệ qua Zalo</p>
          <OrderPhoneLinks contacts={order.contacts} hideRole="customer" />
        </div>
      ) : null}

      {showPay && order.status !== "PAID" && (
        <div className="card" style={{ margin: "16px 0" }}>
          {!paymentInfo ? (
            <button type="button" className="btn" disabled={paying} onClick={() => void payOnline()}>
              {paying ? "Đang xử lý…" : `Thanh toán ${formatVnd(order.totalVnd)}`}
            </button>
          ) : (
            <>
              <p className="section-title" style={{ marginTop: 0 }}>
                {paymentInfo.providerKind === "PAYOS" ? "Quét VietQR để thanh toán" : "Xác nhận thanh toán"}
              </p>
              {paymentInfo.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={paymentInfo.qrCode}
                  alt="VietQR thanh toán Picki"
                  style={{ width: "100%", maxWidth: 280, display: "block", margin: "0 auto 12px" }}
                />
              ) : null}
              {paymentInfo.checkoutUrl ? (
                <a
                  href={paymentInfo.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ display: "block", textAlign: "center", marginBottom: 8 }}
                >
                  Mở trang thanh toán PayOS
                </a>
              ) : null}
              {paymentInfo.devConfirmPath ? (
                <button
                  type="button"
                  className="btn"
                  disabled={paying}
                  onClick={() => void devConfirmPayment()}
                >
                  {paying ? "…" : "Xác nhận demo (dev)"}
                </button>
              ) : (
                <p className="stat" style={{ margin: "8px 0 0" }}>
                  Đang chờ xác nhận từ ngân hàng… Trang sẽ tự cập nhật khi thanh toán thành công.
                </p>
              )}
            </>
          )}
          {payError ? (
            <p style={{ color: "crimson", margin: "8px 0 0", fontSize: 14 }}>{payError}</p>
          ) : null}
        </div>
      )}

      {order.canCancel ? (
        <div className="card" style={{ margin: "16px 0" }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={cancelling}
            onClick={() => void cancelOrder()}
          >
            {cancelling ? "Đang hủy…" : "Hủy đơn"}
          </button>
          {cancelError ? (
            <p style={{ color: "crimson", margin: "8px 0 0", fontSize: 14 }}>{cancelError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="card" style={{ margin: "16px 0" }}>
        <p className="section-title">
          {isLaundryVertical(order.serviceVertical) ? "Dịch vụ đã đặt" : "Món đã đặt"}
        </p>
        {order.items.map((item) => (
          <div
            key={`${item.name}-${String(item.quantity)}`}
            style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}
          >
            <span>
              {fdFormatItemQtyLabel(item.name, item.quantity, { category: item.category })}
              {item.prepMode === "SELF_COOK" ? (
                <span className="stat" style={{ display: "block", fontSize: 13 }}>
                  Tự nấu
                </span>
              ) : null}
              {isLaundryVertical(order.serviceVertical) && item.estimatedDays ? (
                <span className="stat" style={{ display: "block", fontSize: 13 }}>
                  Dự kiến ~{String(item.estimatedDays)} ngày
                </span>
              ) : null}
            </span>
            {!isLaundryVertical(order.serviceVertical) ? (
              <span>{formatVnd(item.lineTotalVnd)}</span>
            ) : (item.unitPriceVnd ?? 0) > 0 ? (
              <span className="stat" style={{ fontSize: 13 }}>
                {formatLaundryReferencePrice(item.unitPriceVnd ?? 0, "FROM")}
              </span>
            ) : null}
          </div>
        ))}
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
        {isLaundryVertical(order.serviceVertical) ? (
          <p className="stat" style={{ margin: 0 }}>
            Báo giá và {formatOrderAmount(order.totalVnd, order.serviceVertical).toLowerCase()}.
          </p>
        ) : (
          <>
            {order.deliveryFeeVnd != null && order.deliveryFeeVnd > 0 ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>Tiền hàng</span>
                  <span>{formatVnd(order.subtotalVnd ?? order.totalVnd - order.deliveryFeeVnd)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>Phí giao</span>
                  <span>{formatVnd(order.deliveryFeeVnd)}</span>
                </div>
              </>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Tổng</span>
              <strong>{formatVnd(order.totalVnd)}</strong>
            </div>
          </>
        )}
      </div>

      {addr && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Giao đến</p>
          <p style={{ margin: 0 }}>{addr}</p>
          {order.deliveryWindow?.label || order.serviceDate ? (
            <p className="stat" style={{ margin: "8px 0 0" }}>
              {order.deliveryWindow?.label
                ? `Khung giao: ${order.deliveryWindow.label}`
                : null}
              {order.deliveryWindow?.label && order.serviceDate ? " · " : null}
              {order.serviceDate ? `Ngày ${order.serviceDate}` : null}
            </p>
          ) : null}
          <p className="stat" style={{ margin: "8px 0 0" }}>
            {isApartment ? handoffModeLabel(handoffMode) : "Giao tận cửa"}
          </p>
          {order.delivery.note ? (
            <p className="stat" style={{ margin: "4px 0 0" }}>
              {order.delivery.note}
            </p>
          ) : null}
        </div>
      )}

      {showLobbyPickup && (
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
            <p style={{ margin: 0 }}>Tiến trình giao hoàn tất</p>
          )}
        </div>
      )}

      {order.status !== "DELIVERED" &&
      !["CUSTOMER_CANCELLED", "SYSTEM_CANCELLED", "PROVIDER_REJECTED"].includes(order.status) ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <OrderChat orderId={order.id} viewerRole="CUSTOMER" />
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
