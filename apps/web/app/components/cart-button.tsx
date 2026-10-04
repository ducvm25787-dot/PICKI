"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cartItemCount, cartTotalVnd, readCart, type Cart } from "../../lib/cart";
import { formatVnd } from "../../lib/money";
import { IconCart } from "./nav-icons";

export function CartButton() {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function sync() {
      const next = readCart();
      setCart(next);
      if (!next?.items.length) setOpen(false);
    }
    sync();
    window.addEventListener("picki-cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("picki-cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  const count = cartItemCount(cart);
  if (!cart || count < 1) return null;

  const shopHref = `/locations/${cart.providerLocationId}${
    cart.scheduledDeliveryWindowId ? "?when=morning" : ""
  }`;
  const total = cartTotalVnd(cart);

  return (
    <div ref={panelRef}>
      <button
        type="button"
        className="notification-bell-btn notification-bell-btn-inline"
        aria-label={`Giỏ hàng, ${String(count)} món`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden className="notification-bell-icon">
          <IconCart />
        </span>
        <span className="notification-badge">{count > 9 ? "9+" : count}</span>
      </button>
      {open ? (
        <div className="notification-panel" role="dialog" aria-label="Giỏ hàng">
          <div className="notification-panel-head">
            <strong>Giỏ hàng</strong>
            <button type="button" className="notification-mark-all" onClick={() => router.push(shopHref)}>
              Thêm món
            </button>
          </div>
          <div className="notification-list" style={{ padding: "8px 12px 12px" }}>
            <p className="stat" style={{ margin: "0 0 8px" }}>
              {cart.brandName}
              {cart.scheduledWindowLabel ? ` · Sáng mai ${cart.scheduledWindowLabel}` : ""}
            </p>
            {cart.items.map((item) => (
              <div
                key={`${item.offeringId}:${(item.optionIds ?? []).join(",")}`}
                style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}
              >
                <span>
                  {item.name} × {item.quantity}
                </span>
                {total > 0 ? <span>{formatVnd(item.amountVnd * item.quantity)}</span> : null}
              </div>
            ))}
            {total > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, margin: "8px 0 12px" }}>
                <span>Tổng</span>
                <span>{formatVnd(total)}</span>
              </div>
            ) : null}
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOpen(false);
                router.push("/checkout");
              }}
            >
              Đặt hàng
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
