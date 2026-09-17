"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { formatAddressLine, type SavedAddress } from "../../../lib/addresses";
import { formatVnd } from "../../../lib/money";
import { NotificationBell } from "../../components/notification-bell";

type MenuItem = {
  id: string;
  offeringId: string | null;
  name: string;
  description: string | null;
  priceVnd: number;
  available: boolean;
  status: string;
};

type WindowRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  remainingCapacity: number;
  available: boolean;
};

type MenuResponse = {
  brandName: string;
  displayName: string;
  serviceDate: string;
  cutoffTime: string;
  openFromTime?: string;
  acceptingPreorder: boolean;
  items: MenuItem[];
  windows: WindowRow[];
};

export default function BreakfastOrderPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const locationId = String(params.locationId);
  const [zoneId, setZoneId] = useState(search.get("zoneId") ?? "");

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [windowId, setWindowId] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    subtotalVnd: number;
    deliveryFeeVnd: number;
    totalVnd: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const data = await api<MenuResponse>(`/locations/${locationId}/breakfast-preorder`);
    setMenu(data);
    const open = data.windows.find((w) => w.available);
    if (open) setWindowId(open.id);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Không tải menu");
    });
  }, [load]);

  useEffect(() => {
    if (zoneId) return;
    void api<{ zoneId: string }>("/zones/kim-van-kim-lu/discovery")
      .then((d) => setZoneId(d.zoneId))
      .catch(() => undefined);
  }, [zoneId]);

  useEffect(() => {
    if (!zoneId) return;
    void api<{ addresses: SavedAddress[] }>(`/zones/${zoneId}/addresses`)
      .then((r) => {
        setAddresses(r.addresses ?? []);
        if (r.addresses?.[0]) setAddressId(r.addresses[0].id);
      })
      .catch(() => {
        setAddresses([]);
        setAddressId("");
      });
  }, [zoneId]);

  const selectedLines = useMemo(() => {
    if (!menu) return [];
    return menu.items
      .filter((i) => (qty[i.id] ?? 0) > 0)
      .map((i) => ({
        menuItemId: i.id,
        name: i.name,
        quantity: qty[i.id]!,
        priceVnd: i.priceVnd,
      }));
  }, [menu, qty]);

  const checkoutReady = selectedLines.length > 0 && Boolean(windowId) && Boolean(addressId);

  useEffect(() => {
    if (!zoneId || !windowId || !menu || selectedLines.length === 0) {
      setQuote(null);
      return;
    }
    void api<{ subtotalVnd: number; deliveryFeeVnd: number; totalVnd: number }>("/orders/quote", {
      method: "POST",
      body: JSON.stringify({
        providerLocationId: locationId,
        zoneId,
        orderKind: "BREAKFAST_PREORDER",
        serviceDate: menu.serviceDate,
        deliveryWindowId: windowId,
        items: selectedLines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
        })),
      }),
    })
      .then((res) =>
        setQuote({
          subtotalVnd: res.subtotalVnd,
          deliveryFeeVnd: res.deliveryFeeVnd,
          totalVnd: res.totalVnd,
        }),
      )
      .catch(() => setQuote(null));
  }, [zoneId, windowId, menu, selectedLines, locationId]);

  async function placeOrder() {
    if (!zoneId || !windowId || !addressId || !menu || !checkoutReady) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await api<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: locationId,
          zoneId,
          addressId,
          orderKind: "BREAKFAST_PREORDER",
          serviceDate: menu.serviceDate,
          deliveryWindowId: windowId,
          paymentMode: "PAY_ON_PICKI",
          items: selectedLines.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
          })),
          idempotencyKey: `bf-${locationId}-${Date.now()}`,
        }),
      });
      router.push(`/orders/${order.id}?pay=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt được");
    } finally {
      setSubmitting(false);
    }
  }

  function bump(id: string, delta: number) {
    setQty((prev) => {
      const next = Math.max(0, Math.min(20, (prev[id] ?? 0) + delta));
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  }

  if (!menu && !error) {
    return (
      <div className="container">
        <p className="tagline">Đang tải menu…</p>
      </div>
    );
  }

  if (error && !menu) {
    return (
      <div className="container">
        <div className="card">
          <p>{error}</p>
          <Link href="/breakfast" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Quay lại
          </Link>
        </div>
      </div>
    );
  }

  if (!menu) return null;

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <Link href="/breakfast" className="stat">
            ← Sáng mai
          </Link>
          <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>{menu.brandName}</h1>
          <p className="stat">
            Giao {menu.serviceDate} · chốt {menu.cutoffTime} tối hôm trước
          </p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {!menu.acceptingPreorder ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>Quán tạm không nhận đặt sáng lúc này.</p>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0, color: "var(--danger, #b91c1c)" }}>{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Chọn món</p>
        <div className="provider-list">
          {menu.items
            .filter((i) => i.available)
            .map((item) => (
              <div key={item.id} className="provider-card" style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <strong>{item.name}</strong>
                  {item.description ? <p className="stat">{item.description}</p> : null}
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    {formatVnd(item.priceVnd)}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => bump(item.id, -1)}>
                    −
                  </button>
                  <span style={{ minWidth: 20, textAlign: "center" }}>{qty[item.id] ?? 0}</span>
                  <button type="button" className="btn btn-secondary" onClick={() => bump(item.id, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Khung giờ giao</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {menu.windows.map((w) => (
            <button
              key={w.id}
              type="button"
              className={windowId === w.id ? "btn" : "btn btn-secondary"}
              disabled={!w.available}
              onClick={() => setWindowId(w.id)}
            >
              {w.startsAt}–{w.endsAt}
              {!w.available ? " (hết)" : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Địa chỉ giao</p>
        {addresses.length === 0 ? (
          <p className="stat">
            Chưa có địa chỉ —{" "}
            <Link href="/addresses">thêm địa chỉ</Link>
          </p>
        ) : (
          <select
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
            style={{ width: "100%", padding: 10 }}
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {formatAddressLine(a)}
              </option>
            ))}
          </select>
        )}
      </div>

      {quote ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="stat" style={{ margin: 0 }}>
            Món {formatVnd(quote.subtotalVnd)} · Ship {formatVnd(quote.deliveryFeeVnd)}
          </p>
          <p style={{ margin: "8px 0 0", fontWeight: 700 }}>
            Tổng {formatVnd(quote.totalVnd)} · thanh toán trên Picki
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className="btn"
        style={{ width: "100%" }}
        disabled={!checkoutReady || submitting || !menu.acceptingPreorder}
        onClick={() => void placeOrder()}
      >
        {submitting ? "Đang đặt…" : "Đặt sáng & thanh toán"}
      </button>
    </div>
  );
}
