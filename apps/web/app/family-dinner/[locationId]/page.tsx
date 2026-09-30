"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { formatAddressLine, type SavedAddress } from "../../../lib/addresses";
import { formatVnd } from "../../../lib/money";
import {
  FD_CATEGORY_LABEL,
  FD_RICE_EXTRA_PORTION_VND,
  fdRiceLineTotalVnd,
  type FdPrepMode,
} from "../../../lib/family-dinner";
import { FdCutoffCountdown } from "../../components/fd-cutoff-countdown";
import { NotificationBell } from "../../components/notification-bell";
import {
  DeliveryHandoffChoice,
  resolveHandoffMode,
  type DeliveryHandoffMode,
} from "../../components/delivery-handoff-choice";

type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  priceVnd: number;
  available: boolean;
  status: string;
  allowsSelfCook?: boolean;
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
  receivingOpen?: boolean;
  publishedAt?: string | null;
  receivingOpenedAt?: string | null;
  items: MenuItem[];
  windows: WindowRow[];
};

/** Các bước của một mâm. Mỗi bước bỏ qua được; mâm trống thì không đặt. */
const TRAY_STEPS = ["MAIN", "SIDE", "VEGETABLE", "SOUP"] as const;
type TrayCat = (typeof TRAY_STEPS)[number];

const NO_RICE = "__NO_RICE__";

export default function FamilyDinnerBuilderPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const locationId = String(params.locationId);
  const [zoneId, setZoneId] = useState(search.get("zoneId") ?? "");

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  /** Nhiều món / nhóm — danh sách id đã chọn */
  const [picks, setPicks] = useState<Partial<Record<TrayCat, string[]>>>({});
  /** Prep theo từng món (menuItemId) */
  const [prepModes, setPrepModes] = useState<Record<string, FdPrepMode>>({});
  /** null = chưa chọn; NO_RICE = tự nấu; uuid = mua cơm */
  const [ricePick, setRicePick] = useState<string | null>(null);
  /** Số suất cơm (khi mua) — suất 1 = giá menu; mỗi + thêm 5.000đ */
  const [riceQty, setRiceQty] = useState(1);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [windowId, setWindowId] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [handoffMode, setHandoffMode] = useState<DeliveryHandoffMode>("DOOR_DELIVERY");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    subtotalVnd: number;
    deliveryFeeVnd: number;
    totalVnd: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const data = await api<MenuResponse>(`/locations/${locationId}/family-dinner`);
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

  function togglePick(cat: TrayCat, item: MenuItem) {
    setPicks((prev) => {
      const cur = prev[cat] ?? [];
      const has = cur.includes(item.id);
      const next = has ? cur.filter((id) => id !== item.id) : [...cur, item.id];
      return { ...prev, [cat]: next };
    });
    setPrepModes((m) => {
      if (m[item.id]) return m;
      return { ...m, [item.id]: "READY_COOKED" };
    });
  }

  const selectedLines = useMemo(() => {
    if (!menu) return [];
    const lines: {
      menuItemId: string;
      category: string;
      quantity: number;
      name: string;
      priceVnd: number;
      prepMode: FdPrepMode;
    }[] = [];
    for (const cat of TRAY_STEPS) {
      for (const id of picks[cat] ?? []) {
        const item = menu.items.find((i) => i.id === id);
        if (!item) continue;
        const prepMode: FdPrepMode =
          item.allowsSelfCook && prepModes[id] === "SELF_COOK" ? "SELF_COOK" : "READY_COOKED";
        lines.push({
          menuItemId: item.id,
          category: item.category,
          quantity: 1,
          name: item.name,
          priceVnd: item.priceVnd,
          prepMode,
        });
      }
    }
    if (ricePick && ricePick !== NO_RICE) {
      const item = menu.items.find((i) => i.id === ricePick);
      if (item) {
        const qty = Math.max(1, riceQty);
        lines.push({
          menuItemId: item.id,
          category: item.category,
          quantity: qty,
          name: item.name,
          priceVnd: fdRiceLineTotalVnd(item.priceVnd, qty),
          prepMode: "READY_COOKED",
        });
      }
    }
    for (const [id, q] of Object.entries(extras)) {
      if (q <= 0) continue;
      const item = menu.items.find((i) => i.id === id);
      if (!item) continue;
      lines.push({
        menuItemId: item.id,
        category: item.category,
        quantity: q,
        name: item.name,
        priceVnd: item.priceVnd,
        prepMode: "READY_COOKED",
      });
    }
    return lines;
  }, [menu, picks, prepModes, ricePick, riceQty, extras]);

  const checkoutReady = selectedLines.some((line) => line.category !== "EXTRA");
  const onRiceStep = step === TRAY_STEPS.length;
  const onCheckout = step > TRAY_STEPS.length;
  const currentCat = step < TRAY_STEPS.length ? TRAY_STEPS[step]! : null;

  const selectedAddress = addresses.find((a) => a.id === addressId);
  const handoff = resolveHandoffMode(selectedAddress, handoffMode);

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
          orderKind: "FAMILY_DINNER",
          serviceDate: menu.serviceDate,
          deliveryWindowId: windowId,
          deliveryHandoffMode: handoff,
          paymentMode: "PAY_ON_PICKI",
          items: selectedLines.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            prepMode: l.prepMode,
          })),
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

  useEffect(() => {
    if (!zoneId || !windowId || !menu || !checkoutReady) {
      setQuote(null);
      return;
    }
    void api<{ subtotalVnd: number; deliveryFeeVnd: number; totalVnd: number }>("/orders/quote", {
      method: "POST",
      body: JSON.stringify({
        providerLocationId: locationId,
        zoneId,
        orderKind: "FAMILY_DINNER",
        serviceDate: menu.serviceDate,
        deliveryWindowId: windowId,
        deliveryHandoffMode: handoff,
        items: selectedLines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          prepMode: l.prepMode,
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
  }, [zoneId, windowId, menu, checkoutReady, selectedLines, locationId, handoff]);

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

  const byCat = (cat: string) => menu.items.filter((i) => i.category === cat && i.available);
  const riceItem = ricePick && ricePick !== NO_RICE ? menu.items.find((i) => i.id === ricePick) : null;
  const riceLabel =
    ricePick === NO_RICE
      ? "Tự nấu / không lấy cơm"
      : riceItem
        ? riceQty > 1
          ? `${riceItem.name} ×1 + ${riceQty - 1} suất`
          : riceItem.name
        : "…";

  const payDisabled =
    submitting ||
    !menu.acceptingPreorder ||
    !windowId ||
    !addressId ||
    !zoneId ||
    !checkoutReady;

  const payHint = !menu.acceptingPreorder
    ? "Đã hết giờ nhận đơn."
    : !zoneId
      ? "Đang tải Zone…"
      : !addressId
        ? "Chọn địa chỉ giao trong Zone của bạn."
        : !windowId
          ? "Chọn khung giao."
          : !checkoutReady
            ? "Mâm cần ít nhất một món. Bước nào không cần thì bỏ qua."
            : null;
  const skippedLabels = [
    ...TRAY_STEPS.filter((cat) => (picks[cat] ?? []).length === 0).map((cat) => FD_CATEGORY_LABEL[cat]),
    ...(ricePick === NO_RICE ? ["Cơm"] : []),
  ];

  const currentSelected = currentCat ? (picks[currentCat] ?? []) : [];

  return (
    <div className="container" style={{ paddingBottom: 120 }}>
      <div className="header-row">
        <div>
          <Link href="/family-dinner" className="stat">
            ← Bữa tối
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>{menu.brandName}</h1>
          <p className="stat">
            {menu.displayName} · nhận tới {menu.cutoffTime}
          </p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {!menu.acceptingPreorder ? (
        <div className="card" style={{ marginBottom: 12, background: "#f8e8e8" }}>
          <p className="stat" style={{ margin: 0 }}>
            {menu.receivingOpen === false
              ? "Bếp đã có menu nhưng chưa mở giờ nhận đơn."
              : "Đã qua giờ chốt đơn hôm nay."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="section-title" style={{ marginBottom: 4 }}>
            Giờ nhận đơn
          </p>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Đặt trước {menu.cutoffTime} — bếp chốt nấu sau giờ này.
          </p>
          <FdCutoffCountdown
            serviceDate={menu.serviceDate}
            cutoffTime={menu.cutoffTime}
            publishedAt={menu.receivingOpenedAt ?? menu.publishedAt}
            activeLabel="Còn đến giờ chốt đơn"
            pastLabel="Đã hết giờ nhận đơn"
          />
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Mâm nhà của bạn (phù hợp cho 3-4 người)</p>
        {menu.acceptingPreorder ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => {
              const next: Partial<Record<TrayCat, string[]>> = {};
              for (const cat of TRAY_STEPS) {
                const first = byCat(cat)[0];
                if (first) next[cat] = [first.id];
              }
              setPicks(next);
              const rice = byCat("RICE")[0];
              setRicePick(rice ? rice.id : NO_RICE);
              setRiceQty(1);
              setStep(TRAY_STEPS.length + 1);
            }}
          >
            Gợi ý một mâm
          </button>
        ) : null}
        <p className="stat" style={{ margin: 0 }}>
          {TRAY_STEPS.map((c) => {
            const ids = picks[c] ?? [];
            const names = ids
              .map((id) => {
                const item = menu.items.find((i) => i.id === id);
                if (!item) return null;
                const prep =
                  item.allowsSelfCook && prepModes[id] === "SELF_COOK" ? " (tự nấu)" : "";
                return `${item.name}${prep}`;
              })
              .filter(Boolean);
            return `${FD_CATEGORY_LABEL[c]}: ${names.length ? names.join(", ") : "…"}`;
          }).join(" · ")}
          {" · "}
          Cơm: {riceLabel}
        </p>
      </div>

      {currentCat ? (
        <div className="card">
          <p className="section-title">
            Bước {step + 1}/5 — Chọn {FD_CATEGORY_LABEL[currentCat]}
          </p>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Chọn một hoặc nhiều món — bấm lại để bỏ chọn.
          </p>
          {byCat(currentCat).length === 0 ? (
            <p className="muted">Bếp chưa mở nhóm này.</p>
          ) : (
            byCat(currentCat).map((item) => {
              const selected = currentSelected.includes(item.id);
              return (
                <div key={item.id} style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className={selected ? "btn" : "btn btn-secondary"}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                    disabled={!menu.acceptingPreorder}
                    onClick={() => togglePick(currentCat, item)}
                  >
                    <span>
                      {selected ? "✓ " : ""}
                      {item.name}
                      {item.allowsSelfCook ? (
                        <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
                          · có tự nấu
                        </span>
                      ) : null}
                    </span>
                    <span>{formatVnd(item.priceVnd)}</span>
                  </button>
                  {selected && item.allowsSelfCook ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={
                          (prepModes[item.id] ?? "READY_COOKED") === "READY_COOKED"
                            ? "btn"
                            : "btn btn-secondary"
                        }
                        style={{ width: "auto", padding: "8px 12px" }}
                        onClick={() =>
                          setPrepModes((m) => ({ ...m, [item.id]: "READY_COOKED" }))
                        }
                      >
                        Nấu sẵn
                      </button>
                      <button
                        type="button"
                        className={
                          prepModes[item.id] === "SELF_COOK" ? "btn" : "btn btn-secondary"
                        }
                        style={{ width: "auto", padding: "8px 12px" }}
                        onClick={() =>
                          setPrepModes((m) => ({ ...m, [item.id]: "SELF_COOK" }))
                        }
                      >
                        Tự nấu
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          <button
            type="button"
            className="btn"
            style={{ width: "100%", marginTop: 8 }}
            disabled={currentSelected.length < 1 || !menu.acceptingPreorder}
            onClick={() => setStep((s) => s + 1)}
          >
            Tiếp tục → ({currentSelected.length} món)
          </button>
          {currentSelected.length === 0 ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={!menu.acceptingPreorder}
              onClick={() => setStep((s) => s + 1)}
            >
              Bỏ qua bước này
            </button>
          ) : null}
          {step > 0 ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => setStep((s) => s - 1)}
            >
              ← Quay lại bước trước
            </button>
          ) : null}
        </div>
      ) : null}

      {onRiceStep ? (
        <div className="card">
          <p className="section-title">Bước 5/5 — Cơm (3-4 người)</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Chọn loại cơm hoặc tự nấu. Bấm + để thêm suất (+{formatVnd(FD_RICE_EXTRA_PORTION_VND)}
            /suất).
          </p>
          {byCat("RICE").map((item) => {
            const selected = ricePick === item.id;
            const total = selected
              ? fdRiceLineTotalVnd(item.priceVnd, riceQty)
              : item.priceVnd;
            return (
              <div key={item.id} style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className={selected ? "btn" : "btn btn-secondary"}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                  disabled={!menu.acceptingPreorder}
                  onClick={() => {
                    setRicePick(item.id);
                    setRiceQty(1);
                  }}
                >
                  <span>{item.name}</span>
                  <span>{formatVnd(total)}</span>
                </button>
                {selected ? (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="stat" style={{ margin: 0, fontSize: 13 }}>
                      Số suất: {riceQty}
                      {riceQty > 1
                        ? ` · ${formatVnd(item.priceVnd)} + ${riceQty - 1}×${formatVnd(FD_RICE_EXTRA_PORTION_VND)}`
                        : ""}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 40, padding: 0 }}
                        disabled={riceQty <= 1}
                        onClick={() => setRiceQty((q) => Math.max(1, q - 1))}
                      >
                        −
                      </button>
                      <strong>{riceQty}</strong>
                      <button
                        type="button"
                        className="btn"
                        style={{ width: 40, padding: 0 }}
                        aria-label="Thêm suất cơm"
                        onClick={() => setRiceQty((q) => Math.min(20, q + 1))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className={ricePick === NO_RICE ? "btn" : "btn btn-secondary"}
            style={{ width: "100%", marginBottom: 8, textAlign: "left" }}
            disabled={!menu.acceptingPreorder}
            onClick={() => {
              setRicePick(NO_RICE);
              setRiceQty(1);
            }}
          >
            Tự nấu / không lấy cơm — 0đ
          </button>
          {byCat("RICE").length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Bếp chưa đăng món cơm — bạn vẫn có thể chọn tự nấu.
            </p>
          ) : null}
          <button
            type="button"
            className="btn"
            style={{ width: "100%", marginTop: 8 }}
            disabled={ricePick === null || !menu.acceptingPreorder}
            onClick={() => setStep(TRAY_STEPS.length + 1)}
          >
            Tiếp tục →
          </button>
          {ricePick === null ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={!menu.acceptingPreorder}
              onClick={() => {
                setRicePick(NO_RICE);
                setRiceQty(1);
                setStep(TRAY_STEPS.length + 1);
              }}
            >
              Bỏ qua cơm
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => setStep(TRAY_STEPS.length - 1)}
          >
            ← Quay lại bước trước
          </button>
        </div>
      ) : null}

      {onCheckout ? (
        <>
          {byCat("EXTRA").length > 0 ? (
            <div className="card" style={{ marginBottom: 12 }}>
              <p className="section-title">Thêm (tuỳ chọn)</p>
              {byCat("EXTRA").map((item) => {
                const q = extras[item.id] ?? 0;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <p className="stat" style={{ margin: 0 }}>
                        {formatVnd(item.priceVnd)}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 36, padding: 0 }}
                        disabled={q <= 0}
                        onClick={() =>
                          setExtras((prev) => {
                            const n = { ...prev };
                            if (q <= 1) delete n[item.id];
                            else n[item.id] = q - 1;
                            return n;
                          })
                        }
                      >
                        −
                      </button>
                      <span>{q}</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 36, padding: 0 }}
                        onClick={() => setExtras((prev) => ({ ...prev, [item.id]: q + 1 }))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="card">
            <p className="section-title">Giao hàng & thanh toán</p>
            {skippedLabels.length > 0 && checkoutReady ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Chưa chọn: {skippedLabels.join(", ")}. Vẫn đặt được, hoặc quay lại để thêm.
              </p>
            ) : null}
            <label className="field">
              <span>Khung giao</span>
              <select value={windowId} onChange={(e) => setWindowId(e.target.value)}>
                {menu.windows.map((w) => (
                  <option key={w.id} value={w.id} disabled={!w.available}>
                    {w.startsAt.slice(0, 5)}–{w.endsAt.slice(0, 5)}
                    {!w.available ? " (hết chỗ)" : ` · còn ${w.remainingCapacity}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Địa chỉ giao (trong Zone của bạn)</span>
              {addresses.length > 0 ? (
                <select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                  {addresses.map((a, idx) => (
                    <option key={a.id} value={a.id}>
                      {a.label === "HOME" && idx === 0 ? "Nhà" : a.label || `Địa chỉ ${idx + 1}`}
                      {" — "}
                      {formatAddressLine(a)}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  style={{
                    padding: 12,
                    background: "#fff8f0",
                    border: "1px solid #f0a060",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  <p style={{ margin: "0 0 8px" }}>
                    Chưa có địa chỉ giao trong Zone. Thêm địa chỉ Level-1 rồi quay lại đặt.
                  </p>
                  <Link href={zoneId ? `/zones/kim-van-kim-lu` : "/"} className="btn btn-secondary">
                    Thêm / chọn địa chỉ Zone
                  </Link>
                </div>
              )}
            </label>
            <DeliveryHandoffChoice
              address={selectedAddress}
              mode={handoffMode}
              onChange={setHandoffMode}
            />
            {quote ? (
              <div style={{ marginTop: 12, fontSize: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Món</span>
                  <span>{formatVnd(quote.subtotalVnd)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Phí runner giao hàng</span>
                  <span>{formatVnd(quote.deliveryFeeVnd)}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    fontWeight: 700,
                  }}
                >
                  <span>Tổng thanh toán</span>
                  <span>{formatVnd(quote.totalVnd)}</span>
                </div>
              </div>
            ) : checkoutReady && zoneId ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Đang tính phí…
              </p>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            {payHint ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {payHint}
              </p>
            ) : null}
            <button
              type="button"
              className="btn"
              style={{ marginTop: 12, width: "100%", fontSize: 16, padding: "14px 16px" }}
              disabled={payDisabled}
              onClick={() => void placeOrder()}
            >
              {submitting ? "Đang đặt…" : "Thanh toán để đặt hàng"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => setStep(TRAY_STEPS.length)}
            >
              ← Đổi món / cơm
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
