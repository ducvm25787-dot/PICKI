"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { formatVnd } from "../../../lib/money";
import { NotificationBell } from "../../components/notification-bell";

type LateOffer = {
  id: string;
  title: string;
  priceVnd: number;
  remainingCapacity: number;
  etaMinutes: number;
  available: boolean;
  serviceDate: string;
  items: { name: string; category: string; quantityPerTray: number }[];
};

type Address = { id: string; label?: string | null; building?: string | null };

export default function LateDinnerCheckoutPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const offerId = String(params.offerId);
  const zoneId = search.get("zoneId") ?? "";
  const locationId = search.get("locationId") ?? "";

  const [offer, setOffer] = useState<LateOffer | null>(null);
  const [qty, setQty] = useState(1);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<{
    subtotalVnd: number;
    deliveryFeeVnd: number;
    totalVnd: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await api("/me");
        if (!locationId) {
          setError("Thiếu locationId");
          return;
        }
        const late = await api<{ offers: LateOffer[] }>(
          `/locations/${locationId}/family-dinner/late`,
        );
        const found = late.offers.find((o) => o.id === offerId) ?? null;
        if (!found) {
          setError("Mâm tối muộn không còn");
          return;
        }
        setOffer(found);
        const addrs = await api<{ addresses: Address[] }>("/addresses");
        setAddresses(addrs.addresses);
        if (addrs.addresses[0]) setAddressId(addrs.addresses[0].id);

        const q = await api<{
          subtotalVnd: number;
          deliveryFeeVnd: number;
          totalVnd: number;
        }>("/orders/quote", {
          method: "POST",
          body: JSON.stringify({
            providerLocationId: locationId,
            zoneId,
            orderKind: "LATE_DINNER",
            lateDinnerOfferId: offerId,
            deliveryHandoffMode: "LOBBY_PICKUP",
            items: [{ quantity: 1 }],
          }),
        });
        setQuote(q);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được");
      }
    })();
  }, [offerId, locationId, zoneId]);

  async function checkout() {
    if (!offer || !zoneId || !locationId || !addressId) return;
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
          deliveryHandoffMode: "LOBBY_PICKUP",
          paymentMode: "PAY_ON_PICKI",
          items: [{ quantity: qty }],
        }),
      });
      router.push(`/orders/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đặt thất bại");
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
          <p className="stat">
            {formatVnd(offer.priceVnd)} · còn {offer.remainingCapacity} · ~{offer.etaMinutes} phút
          </p>
          <ul>
            {offer.items.map((i) => (
              <li key={i.name}>
                {i.name} ×{i.quantityPerTray}
              </li>
            ))}
          </ul>
          <label style={{ display: "grid", gap: 4, marginTop: 12 }}>
            Số mâm
            <input
              type="number"
              min={1}
              max={offer.remainingCapacity}
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
          {quote ? (
            <p className="stat" style={{ marginTop: 12 }}>
              Tạm tính 1 mâm: {formatVnd(quote.totalVnd)} (gồm ship)
            </p>
          ) : null}
          <button
            type="button"
            className="btn"
            style={{ marginTop: 16 }}
            disabled={submitting || !addressId}
            onClick={() => void checkout()}
          >
            {submitting ? "Đang đặt…" : `Thanh toán trước · ${formatVnd(offer.priceVnd * qty)}`}
          </button>
        </div>
      ) : !error ? (
        <p className="stat">Đang tải…</p>
      ) : null}
    </div>
  );
}
