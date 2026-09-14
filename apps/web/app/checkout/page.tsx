"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { cartTotalVnd, readCart, writeCart, type Cart } from "../../lib/cart";
import { formatVnd } from "../../lib/money";

type OrderResult = {
  id: string;
  orderNumber: string;
  status: string;
  totalVnd: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"COD" | "PAY_ON_PICKI">("COD");

  useEffect(() => {
    void api("/me")
      .catch(() => router.replace("/login"))
      .finally(() => {
        const c = readCart();
        if (!c?.items.length) {
          router.replace("/");
          return;
        }
        setCart(c);
        setLoading(false);
      });
  }, [router]);

  async function placeOrder() {
    if (!cart) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = `web-${cart.providerLocationId}-${String(Date.now())}`;
      const order = await api<OrderResult>("/orders", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: cart.providerLocationId,
          zoneId: cart.zoneId,
          paymentMode,
          idempotencyKey,
          items: cart.items.map((i) => ({
            offeringId: i.offeringId,
            quantity: i.quantity,
          })),
        }),
      });
      writeCart(null);
      router.replace(
        `/orders/${order.id}?new=1${paymentMode === "PAY_ON_PICKI" ? "&pay=1" : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt được");
      setSubmitting(false);
    }
  }

  if (loading || !cart) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  const total = cartTotalVnd(cart);

  return (
    <div className="container">
      <h1 style={{ fontSize: 22, margin: "0 0 16px" }}>Xác nhận đơn</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="stat" style={{ margin: "0 0 4px" }}>
          Quán
        </p>
        <strong>{cart.brandName}</strong>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Chi tiết</p>
        {cart.items.map((item) => (
          <div
            key={item.offeringId}
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 15,
            }}
          >
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatVnd(item.amountVnd * item.quantity)}</span>
          </div>
        ))}
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
        <p className="section-title" style={{ marginTop: 16 }}>
          Thanh toán
        </p>
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="radio"
            checked={paymentMode === "COD"}
            onChange={() => setPaymentMode("COD")}
          />
          COD — trả khi nhận hàng
        </label>
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="radio"
            checked={paymentMode === "PAY_ON_PICKI"}
            onChange={() => setPaymentMode("PAY_ON_PICKI")}
          />
          Thanh toán online (demo stub)
        </label>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            marginTop: 12,
          }}
        >
          <span>Tổng</span>
          <span>{formatVnd(total)}</span>
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <button type="button" className="btn" disabled={submitting} onClick={() => void placeOrder()}>
        {submitting ? "Đang đặt…" : "Đặt món"}
      </button>
    </div>
  );
}
