"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { formatVnd } from "../../../lib/money";
import { NotificationBell } from "../../components/notification-bell";
import {
  DeliveryHandoffChoice,
  resolveHandoffMode,
  type DeliveryHandoffMode,
} from "../../components/delivery-handoff-choice";
import type { SavedAddress } from "../../../lib/addresses";
import { HomeDeliveryConfirm, useOrderPresence } from "../../../components/order-presence";

type LateOffer = {
  id: string;
  title: string;
  priceVnd: number;
  remainingCapacity: number;
  capacity: number;
  etaMinutes: number;
  available: boolean;
  serviceDate: string;
  items: { name: string; category: string; quantityPerTray: number }[];
};

type Address = SavedAddress;

export default function LateDinnerCheckoutPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const offerId = String(params.offerId);
  const zoneId = search.get("zoneId") ?? "";
  const presence = useOrderPresence(zoneId);
  const [confirmHome, setConfirmHome] = useState(false);
  const locationId = search.get("locationId") ?? "";

  const [offer, setOffer] = useState<LateOffer | null>(null);
  const [qty, setQty] = useState(1);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [handoffMode, setHandoffMode] = useState<DeliveryHandoffMode>("DOOR_DELIVERY");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<{
    subtotalVnd: number;
    deliveryFeeVnd: number;
    totalVnd: number;
  } | null>(null);

  const reloadOffer = useCallback(async () => {
    if (!locationId) return;
    const late = await api<{ offers: LateOffer[] }>(
      `/locations/${locationId}/family-dinner/late`,
    );
    const found = late.offers.find((o) => o.id === offerId) ?? null;
    setOffer(found);
    if (found && qty > found.remainingCapacity) {
      setQty(Math.max(1, found.remainingCapacity));
    }
  }, [locationId, offerId, qty]);

  useEffect(() => {
    void (async () => {
      try {
        await api("/me");
        if (!locationId) {
          setError("Thiếu locationId");
          return;
        }
        await reloadOffer();
        const addrs = await api<{ addresses: Address[] }>("/addresses");
        setAddresses(addrs.addresses);
        if (addrs.addresses[0]) setAddressId(addrs.addresses[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được");
      }
    })();
  }, [offerId, locationId, zoneId, reloadOffer]);

  const selectedAddress = addresses.find((a) => a.id === addressId);
  const handoff = resolveHandoffMode(selectedAddress, handoffMode);

  useEffect(() => {
    if (!locationId || !zoneId) return;
    void api<{ subtotalVnd: number; deliveryFeeVnd: number; totalVnd: number }>("/orders/quote", {
      method: "POST",
      body: JSON.stringify({
        providerLocationId: locationId,
        zoneId,
        orderKind: "LATE_DINNER",
        lateDinnerOfferId: offerId,
        deliveryHandoffMode: handoff,
        ...(addressId ? { addressId } : {}),
        items: [{ quantity: 1 }],
      }),
    })
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [locationId, zoneId, offerId, handoff, addressId]);

  async function checkout() {
    if (!offer || !zoneId || !locationId || !addressId) return;
    if (presence.status === "checking") {
      setError("Đang đọc vị trí…");
      return;
    }
    if (presence.needsHomeConfirm && !confirmHome) {
      setError(
        presence.status === "outside"
          ? "Bạn đang ở ngoài Zone. Xác nhận giao về địa chỉ nhà, không giao tại vị trí hiện tại."
          : "Chưa đọc được vị trí. Xác nhận giao về địa chỉ nhà đã lưu, không giao tại vị trí hiện tại.",
      );
      return;
    }
    if (offer.remainingCapacity < qty) {
      setError("Không đủ suất còn lại");
      await reloadOffer();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await api<{ id: string; orderNumber: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: locationId,
          zoneId,
          addressId,
          orderKind: "LATE_DINNER",
          lateDinnerOfferId: offerId,
          deliveryHandoffMode: handoff,
          paymentMode: "PAY_ON_PICKI",
          items: [{ quantity: qty }],
          ...presence.orderPresenceBody(confirmHome),
        }),
      });
      // Suất đã giữ chỗ khi tạo đơn; thanh toán trên trang đơn.
      router.push(`/orders/${order.id}?pay=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đặt thất bại");
      await reloadOffer();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <Link href="/family-dinner" className="stat">
            ← Bữa tối
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>Bữa tối muộn</h1>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {offer ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{offer.title}</h2>
          <p style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>
            {formatVnd(offer.priceVnd)}
            <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>
              {" "}
              / mâm
            </span>
          </p>
          <p className="stat" style={{ margin: 0 }}>
            Còn{" "}
            <strong>
              {offer.remainingCapacity}/{offer.capacity}
            </strong>{" "}
            suất · giao khoảng <strong>~{offer.etaMinutes} phút</strong> sau khi thanh toán
          </p>
          <p className="section-title" style={{ marginTop: 16 }}>
            Trong mâm
          </p>
          <ul style={{ marginTop: 0 }}>
            {offer.items.map((i) => (
              <li key={i.name}>
                {i.name}
                {i.quantityPerTray > 1 ? ` ×${i.quantityPerTray}` : ""}
              </li>
            ))}
          </ul>
          <label style={{ display: "grid", gap: 4, marginTop: 12 }}>
            Số mâm
            <input
              type="number"
              min={1}
              max={Math.max(1, offer.remainingCapacity)}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label style={{ display: "grid", gap: 4, marginTop: 12 }}>
            Địa chỉ
            <select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || a.building || a.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <DeliveryHandoffChoice
            address={selectedAddress}
            mode={handoffMode}
            onChange={setHandoffMode}
          />
          {quote ? (
            <p className="stat" style={{ marginTop: 12 }}>
              1 mâm ≈ {formatVnd(quote.totalVnd)} (gồm ship) · {qty} mâm ≈{" "}
              {formatVnd(offer.priceVnd * qty + quote.deliveryFeeVnd)}
            </p>
          ) : null}
          <p className="muted" style={{ fontSize: 12 }}>
            Đặt xong sẽ giữ suất; thanh toán xong suất trừ khỏi app. Hủy trước khi thanh toán hoàn suất.
          </p>
          <HomeDeliveryConfirm status={presence.status} checked={confirmHome} onChange={setConfirmHome} />
          <button
            type="button"
            className="btn"
            style={{ marginTop: 16 }}
            disabled={
              submitting ||
              !addressId ||
              offer.remainingCapacity < 1 ||
              presence.status === "checking" ||
              (presence.needsHomeConfirm && !confirmHome)
            }
            onClick={() => void checkout()}
          >
            {submitting
              ? "Đang đặt…"
              : `Đặt & thanh toán · ${formatVnd(offer.priceVnd * qty)}`}
          </button>
        </div>
      ) : !error ? (
        <p className="stat">Đang tải…</p>
      ) : null}
    </div>
  );
}
