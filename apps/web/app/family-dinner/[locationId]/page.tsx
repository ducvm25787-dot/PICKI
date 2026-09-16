"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { formatVnd } from "../../../lib/money";
import { NotificationBell } from "../../components/notification-bell";

type MenuItem = {
  id: string;
  category: string;
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
  acceptingPreorder: boolean;
  items: MenuItem[];
  windows: WindowRow[];
};

type Address = { id: string; label?: string | null; building?: string | null };

const CATEGORY_LABEL: Record<string, string> = {
  MAIN: "Món chính",
  SIDE: "Món phụ",
  VEGETABLE: "Rau",
  SOUP: "Canh",
  EXTRA: "Thêm",
};

const REQUIRED = ["MAIN", "SIDE", "VEGETABLE", "SOUP"] as const;

export default function FamilyDinnerBuilderPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const locationId = String(params.locationId);
  const zoneId = search.get("zoneId") ?? "";
  const date = search.get("date") ?? undefined;

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [windowId, setWindowId] = useState<string>("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [softWarning, setSoftWarning] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    subtotalVnd: number;
    deliveryFeeVnd: number;
    totalVnd: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const q = date ? `?serviceDate=${date}` : "";
    const data = await api<MenuResponse>(`/locations/${locationId}/family-dinner${q}`);
    setMenu(data);
    const open = data.windows.find((w) => w.available);
    if (open) setWindowId(open.id);
  }, [locationId, date]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Không tải menu");
    });
    void api<{ addresses: Address[] }>("/addresses")
      .then((r) => {
        setAddresses(r.addresses);
        if (r.addresses[0]) setAddressId(r.addresses[0].id);
      })
      .catch(() => undefined);
  }, [load]);

  const selectedLines = useMemo(() => {
    if (!menu) return [];
    return menu.items
      .filter((i) => (qty[i.id] ?? 0) > 0)
      .map((i) => ({
        menuItemId: i.id,
        category: i.category,
        quantity: qty[i.id]!,
        name: i.name,
        priceVnd: i.priceVnd,
      }));
  }, [menu, qty]);

  const groups = useMemo(() => {
    const g: Record<string, boolean> = {};
    for (const c of REQUIRED) g[c] = false;
    for (const line of selectedLines) {
      if (line.category in g) g[line.category] = true;
    }
    return g;
  }, [selectedLines]);

  const baseReady = REQUIRED.every((c) => groups[c]);
  const portionCount = selectedLines.reduce((s, l) => s + l.quantity, 0);

  function setItemQty(id: string, category: string, next: number) {
    setQty((prev) => {
      const copy = { ...prev };
      if (next <= 0) {
        delete copy[id];
        return copy;
      }
      if (!baseReady && !REQUIRED.includes(category as (typeof REQUIRED)[number])) {
        // allow EXTRA only after base — block early EXTRA
        if (category === "EXTRA") return prev;
      }
      // allow selecting required categories anytime; extras after base
      if (category === "EXTRA" && !baseReady && !(id in prev)) return prev;
      copy[id] = next;
      return copy;
    });
    setQuote(null);
  }

  async function refreshQuote() {
    if (!zoneId || !windowId || !menu || !baseReady) return;
    try {
      const res = await api<{
        subtotalVnd: number;
        deliveryFeeVnd: number;
        totalVnd: number;
        softWarning?: string | null;
      }>("/orders/quote", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: locationId,
          zoneId,
          orderKind: "FAMILY_DINNER",
          serviceDate: menu.serviceDate,
          deliveryWindowId: windowId,
          items: selectedLines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        }),
      });
      setQuote({
        subtotalVnd: res.subtotalVnd,
        deliveryFeeVnd: res.deliveryFeeVnd,
        totalVnd: res.totalVnd,
      });
      setSoftWarning(res.softWarning ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tính được giá");
    }
  }

  async function placeOrder() {
    if (!zoneId || !windowId || !addressId || !menu || !baseReady) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await api<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: locationId,
          zoneId,
          addressId,
          orderKind: "FAMILY_DINNER",
          serviceDate: menu.serviceDate,
          deliveryWindowId: windowId,
          paymentMode: "PAY_ON_PICKI",
          items: selectedLines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
          idempotencyKey: `fd-${locationId}-${Date.now()}`,
        }),
      });
      router.push(`/orders/${order.id}?pay=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt được");
    } finally {
      setSubmitting(false);
    }
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
          <Link href="/family-dinner" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Quay lại
          </Link>
        </div>
      </div>
    );
  }

  if (!menu) return null;

  const byCat = (cat: string) => menu.items.filter((i) => i.category === cat);

  return (
    <div className="container" style={{ paddingBottom: 160 }}>
      <div className="header-row">
        <div>
          <p className="section-title">Bữa tối ấm cúng</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>{menu.brandName}</h1>
          <p className="stat">
            {menu.displayName} · {menu.serviceDate} · chốt {menu.cutoffTime}
          </p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {!menu.acceptingPreorder ? (
        <div className="card" style={{ marginBottom: 12, background: "#f8e8e8" }}>
          <p className="stat" style={{ margin: 0 }}>
            Đã qua giờ chốt đơn — không nhận preorder thêm hôm nay.
          </p>
        </div>
      ) : null}

      {REQUIRED.map((cat) => (
        <div key={cat} className="card" style={{ marginBottom: 12 }}>
          <p className="section-title">
            {CATEGORY_LABEL[cat]} {groups[cat] ? "✓" : "○"}
          </p>
          {byCat(cat).map((item) => {
            const q = qty[item.id] ?? 0;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 10,
                  opacity: item.available ? 1 : 0.45,
                }}
              >
                <div>
                  <strong>{item.name}</strong>
                  <p className="stat" style={{ margin: "2px 0 0" }}>
                    {formatVnd(item.priceVnd)}
                    {!item.available ? " · Hết" : ""}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 36, padding: 0 }}
                    disabled={!item.available || q <= 0 || !menu.acceptingPreorder}
                    onClick={() => setItemQty(item.id, item.category, q - 1)}
                  >
                    −
                  </button>
                  <span style={{ minWidth: 16, textAlign: "center" }}>{q}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 36, padding: 0 }}
                    disabled={!item.available || !menu.acceptingPreorder}
                    onClick={() => setItemQty(item.id, item.category, q + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Thêm {baseReady ? "" : "(mở khi đủ 4 nhóm)"}</p>
        {byCat("EXTRA").map((item) => {
          const q = qty[item.id] ?? 0;
          const locked = !baseReady;
          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
                opacity: locked || !item.available ? 0.45 : 1,
              }}
            >
              <div>
                <strong>{item.name}</strong>
                <p className="stat" style={{ margin: "2px 0 0" }}>
                  {formatVnd(item.priceVnd)}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 36, padding: 0 }}
                  disabled={locked || q <= 0}
                  onClick={() => setItemQty(item.id, item.category, q - 1)}
                >
                  −
                </button>
                <span style={{ minWidth: 16, textAlign: "center" }}>{q}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 36, padding: 0 }}
                  disabled={locked || !item.available || !menu.acceptingPreorder}
                  onClick={() => setItemQty(item.id, item.category, q + 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="card"
        style={{
          position: "sticky",
          bottom: 72,
          zIndex: 5,
          borderColor: baseReady ? "#2d6a4f" : undefined,
        }}
      >
        <p className="section-title">Mâm nhà của bạn</p>
        <p className="stat">
          {REQUIRED.map((c) => `${CATEGORY_LABEL[c]} ${groups[c] ? "✓" : "○"}`).join(" · ")}
        </p>
        <p className="stat" style={{ marginTop: 4 }}>
          {baseReady ? `✓ Mâm đã đủ · ${portionCount} món` : `${Object.values(groups).filter(Boolean).length}/4 nhóm`}
        </p>

        {baseReady ? (
          <>
            <label className="field" style={{ marginTop: 12 }}>
              <span>Khung giao</span>
              <select
                value={windowId}
                onChange={(e) => {
                  setWindowId(e.target.value);
                  setQuote(null);
                }}
              >
                {menu.windows.map((w) => (
                  <option key={w.id} value={w.id} disabled={!w.available}>
                    {w.startsAt}–{w.endsAt}
                    {!w.available ? " (hết)" : ` · còn ${w.remainingCapacity}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Địa chỉ giao</span>
              <select
                value={addressId}
                onChange={(e) => {
                  setAddressId(e.target.value);
                }}
              >
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label ?? a.building ?? a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {softWarning ? <p className="stat">{softWarning}</p> : null}
            {quote ? (
              <p className="stat" style={{ marginTop: 8 }}>
                Món {formatVnd(quote.subtotalVnd)} + ship {formatVnd(quote.deliveryFeeVnd)} ={" "}
                <strong>{formatVnd(quote.totalVnd)}</strong>
              </p>
            ) : null}
            {error ? (
              <p className="stat" style={{ color: "#c0392b" }}>
                {error}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!menu.acceptingPreorder}
                onClick={() => void refreshQuote()}
              >
                Xem tổng
              </button>
              <button
                type="button"
                className="btn"
                disabled={
                  submitting || !menu.acceptingPreorder || !windowId || !addressId || !zoneId
                }
                onClick={() => void placeOrder()}
              >
                {submitting ? "Đang đặt…" : "Thanh toán trước"}
              </button>
            </div>
          </>
        ) : (
          <p className="stat" style={{ marginTop: 8 }}>
            Chọn đủ 4 nhóm để tiếp tục.
          </p>
        )}
      </div>

      <p style={{ marginTop: 16 }}>
        <Link href="/family-dinner" className="stat">
          ← Danh sách bếp
        </Link>
      </p>
    </div>
  );
}
