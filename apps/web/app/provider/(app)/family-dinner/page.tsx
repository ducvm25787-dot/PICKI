"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isHomeCookVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";

type OpsResponse = {
  serviceDate: string;
  settings: {
    enabled: boolean;
    cutoffTime: string;
    dailyCapacity: number | null;
    procurementBufferPercent: number | null;
  } | null;
  menu: { id: string; status: string } | null;
  items: {
    id: string;
    category: string;
    name: string;
    priceVnd: number;
    status: string;
    remainingCapacity: number | null;
    recipeVersionId: string | null;
  }[];
  windows: {
    id: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    remainingCapacity: number;
    paidOrders: number;
  }[];
  liveProduction: {
    confirmedOrders: number;
    byMenuItem: { menuItemId: string; quantity: number }[];
  };
  batch: {
    id: string;
    status: string;
    confirmedOrders: number;
    lockedAt: string | null;
    itemTotals: {
      menuItemId: string;
      confirmedQuantity: number;
      remainingQuantity: number;
    }[];
  } | null;
};

type ProcurementRow = {
  ingredientId: string;
  name: string;
  unit: string;
  netRequired: number;
  grossRequired: number;
  yieldPercent: number;
  onHandQuantity: number;
  toBuyQuantity: number;
};

type RecipeSummary = {
  id: string;
  name: string;
  category: string | null;
  latestVersion: { id: string; versionNumber: number } | null;
};

type LateOffer = {
  id: string;
  title: string;
  priceVnd: number;
  capacity: number;
  remainingCapacity: number;
  etaMinutes: number;
  status: string;
};

function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export default function ProviderFamilyDinnerPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [serviceDate, setServiceDate] = useState(vnToday);
  const [ops, setOps] = useState<OpsResponse | null>(null);
  const [procurement, setProcurement] = useState<ProcurementRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [lateOffers, setLateOffers] = useState<LateOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cutoffDraft, setCutoffDraft] = useState("16:00");
  const [capacityDraft, setCapacityDraft] = useState("");
  const [bufferDraft, setBufferDraft] = useState("60");
  const [lateTitle, setLateTitle] = useState("Mâm tối muộn");
  const [latePrice, setLatePrice] = useState("289000");
  const [selectedLateItems, setSelectedLateItems] = useState<string[]>([]);

  const isHomeCook = isHomeCookVertical(activeLocation?.providerType);

  const itemNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of ops?.items ?? []) m.set(i.id, i.name);
    return m;
  }, [ops?.items]);

  const productionRows = useMemo(() => {
    if (ops?.batch?.itemTotals?.length) {
      return ops.batch.itemTotals.map((t) => ({
        menuItemId: t.menuItemId,
        name: itemNameById.get(t.menuItemId) ?? t.menuItemId.slice(0, 8),
        category: ops.items.find((i) => i.id === t.menuItemId)?.category ?? "",
        confirmedQuantity: t.confirmedQuantity,
        remainingQuantity: t.remainingQuantity,
      }));
    }
    return (ops?.liveProduction.byMenuItem ?? []).map((t) => ({
      menuItemId: t.menuItemId,
      name: itemNameById.get(t.menuItemId) ?? t.menuItemId.slice(0, 8),
      category: ops?.items.find((i) => i.id === t.menuItemId)?.category ?? "",
      confirmedQuantity: t.quantity,
      remainingQuantity: t.quantity,
    }));
  }, [ops, itemNameById]);

  const load = useCallback(async () => {
    if (!locationId || !isHomeCook) return;
    setError(null);
    try {
      const [opsRes, recipesRes, lateRes, procRes] = await Promise.all([
        api<OpsResponse>(
          `/provider/locations/${locationId}/family-dinner/ops?serviceDate=${serviceDate}`,
        ),
        api<{ recipes: RecipeSummary[] }>(
          `/provider/locations/${locationId}/family-dinner/recipes`,
        ).catch(() => ({ recipes: [] as RecipeSummary[] })),
        api<{ offers: LateOffer[] }>(
          `/locations/${locationId}/family-dinner/late?serviceDate=${serviceDate}`,
        ).catch(() => ({ offers: [] as LateOffer[] })),
        api<{ items: ProcurementRow[] }>(
          `/provider/locations/${locationId}/family-dinner/procurement?serviceDate=${serviceDate}`,
        ).catch(() => ({ items: [] as ProcurementRow[] })),
      ]);
      setOps(opsRes);
      setCutoffDraft(opsRes.settings?.cutoffTime?.slice(0, 5) ?? "16:00");
      setCapacityDraft(
        opsRes.settings?.dailyCapacity != null ? String(opsRes.settings.dailyCapacity) : "",
      );
      setBufferDraft(
        opsRes.settings?.procurementBufferPercent != null
          ? String(opsRes.settings.procurementBufferPercent)
          : "60",
      );
      setRecipes(recipesRes.recipes);
      setLateOffers(lateRes.offers);
      setProcurement(procRes.items ?? []);
      setSelectedLateItems((prev) => {
        if (prev.length > 0) return prev;
        const rows =
          opsRes.batch?.itemTotals?.filter((t) => t.remainingQuantity > 0).slice(0, 4) ?? [];
        return rows.map((r) => r.menuItemId);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được Bữa tối");
      setOps(null);
    }
  }, [locationId, isHomeCook, serviceDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = ops?.batch?.status === "LOCKED" || !!ops?.batch?.lockedAt;
  const confirmedOrders = ops?.batch?.confirmedOrders ?? ops?.liveProduction.confirmedOrders ?? 0;

  async function saveSettings() {
    if (!locationId) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: true,
          cutoffTime: cutoffDraft,
          dailyCapacity: capacityDraft ? Number(capacityDraft) : null,
          procurementBufferPercent: bufferDraft ? Number(bufferDraft) : null,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu settings thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function setItemStatus(itemId: string, status: string) {
    if (!locationId) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cập nhật món thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function lockProduction() {
    if (!locationId) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/lock`, {
        method: "POST",
        body: JSON.stringify({ serviceDate }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chốt sản xuất thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function saveInventoryRow(ingredientId: string, onHand: number, unit: string) {
    if (!locationId) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/inventory`, {
        method: "PUT",
        body: JSON.stringify({
          serviceDate,
          items: [{ ingredientId, onHandQuantity: onHand, unit }],
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu tồn thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function createLateOffer() {
    if (!locationId || selectedLateItems.length === 0) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/late-offers`, {
        method: "POST",
        body: JSON.stringify({
          serviceDate,
          title: lateTitle,
          priceVnd: Number(latePrice),
          etaMinutes: 25,
          items: selectedLateItems.map((menuItemId) => ({
            menuItemId,
            quantityPerTray: 1,
          })),
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tạo mâm muộn thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (!isHomeCook) {
    return (
      <ProviderPageShell title="Bữa tối ấm cúng">
        <p className="muted">Tab này dành cho bếp HOME_COOK (Family Dinner).</p>
      </ProviderPageShell>
    );
  }

  return (
    <ProviderPageShell title="Bữa tối ấm cúng">
      <div className="stack" style={{ gap: 16 }}>
        <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Ngày phục vụ
            </span>
            <input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={busy}>
            Tải lại
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <section className="card">
          <p className="section-title">Cài đặt</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Cutoff
              </span>
              <input value={cutoffDraft} onChange={(e) => setCutoffDraft(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Capacity/ngày
              </span>
              <input
                value={capacityDraft}
                onChange={(e) => setCapacityDraft(e.target.value)}
                placeholder="20"
                inputMode="numeric"
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Buffer mua sáng %
              </span>
              <input
                value={bufferDraft}
                onChange={(e) => setBufferDraft(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <button type="button" className="btn" onClick={() => void saveSettings()} disabled={busy}>
              Lưu
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            {ops?.settings?.enabled ? "Đã bật Family Dinner" : "Chưa bật — lưu để enable"} · Cutoff{" "}
            {ops?.settings?.cutoffTime ?? "—"}
          </p>
        </section>

        <section className="card">
          <p className="section-title">Menu ngày · sold-out</p>
          {!ops?.items.length ? (
            <p className="muted">Chưa có menu — chạy seed hoặc publish menu.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {ops.items.map((item) => (
                <li
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{item.name}</strong>{" "}
                    <span className="muted">
                      {item.category} · {formatVnd(item.priceVnd)} · {item.status}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "6px 10px" }}
                      disabled={busy || item.status === "SOLD_OUT"}
                      onClick={() => void setItemStatus(item.id, "SOLD_OUT")}
                    >
                      Hết
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "6px 10px" }}
                      disabled={busy || item.status === "ACTIVE"}
                      onClick={() => void setItemStatus(item.id, "ACTIVE")}
                    >
                      Mở lại
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <p className="section-title" style={{ marginBottom: 4 }}>
                Sản xuất hôm nay
              </p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Đơn PAID: {confirmedOrders} · Batch: {ops?.batch?.status ?? "PLANNING"}
                {locked ? " · ĐÃ CHỐT" : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy || locked}
              onClick={() => void lockProduction()}
            >
              {locked ? "Đã chốt" : "Chốt kế hoạch nấu"}
            </button>
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {productionRows.map((row) => (
              <div key={row.menuItemId} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {row.name} <span className="muted">({row.category})</span>
                </span>
                <strong>
                  {row.confirmedQuantity}
                  {locked ? ` · còn ${row.remainingQuantity}` : ""}
                </strong>
              </div>
            ))}
            {!productionRows.length ? (
              <p className="muted">Chưa có đơn PAID cho ngày này.</p>
            ) : null}
          </div>
          {(ops?.windows.length ?? 0) > 0 ? (
            <div style={{ marginTop: 16 }}>
              <p className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                KHUNG GIAO
              </p>
              {ops!.windows.map((w) => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    {w.startsAt.slice(0, 5)}–{w.endsAt.slice(0, 5)}
                  </span>
                  <span>
                    {w.paidOrders} đơn · còn slot {w.remainingCapacity}/{w.capacity}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card">
          <p className="section-title">Nguyên liệu cần hôm nay</p>
          {recipes.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Chưa có recipe — chạy lại seed Family Dinner.
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              {recipes.length} công thức đã lưu
            </p>
          )}
          {!procurement.length ? (
            <p className="muted">Chưa tính được — cần PAID orders + recipe gắn món.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {procurement.map((row) => (
                <li key={row.ingredientId} style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{row.name}</strong>
                    <span className="muted">
                      net {row.netRequired}
                      {row.unit} · gross {row.grossRequired}
                      {row.unit} · mua thêm <strong>{row.toBuyQuantity}</strong>
                    </span>
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    Đang có
                    <input
                      defaultValue={String(row.onHandQuantity)}
                      style={{ width: 88 }}
                      inputMode="decimal"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v) || v === row.onHandQuantity) return;
                        void saveInventoryRow(row.ingredientId, v, row.unit);
                      }}
                    />
                    {row.unit}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <p className="section-title">Bữa tối muộn</p>
          {!locked ? (
            <p className="muted">Chốt sản xuất trước khi tạo mâm bán nhanh.</p>
          ) : (
            <>
              <div style={{ display: "grid", gap: 8 }}>
                <input value={lateTitle} onChange={(e) => setLateTitle(e.target.value)} />
                <input
                  value={latePrice}
                  onChange={(e) => setLatePrice(e.target.value)}
                  inputMode="numeric"
                />
                <div style={{ display: "grid", gap: 4 }}>
                  {productionRows
                    .filter((i) => i.remainingQuantity > 0)
                    .map((i) => {
                      const checked = selectedLateItems.includes(i.menuItemId);
                      return (
                        <label key={i.menuItemId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedLateItems((prev) =>
                                checked
                                  ? prev.filter((id) => id !== i.menuItemId)
                                  : [...prev, i.menuItemId],
                              );
                            }}
                          />
                          {i.name} (còn {i.remainingQuantity})
                        </label>
                      );
                    })}
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || selectedLateItems.length === 0}
                  onClick={() => void createLateOffer()}
                >
                  Tạo mâm bán nhanh
                </button>
              </div>
              {lateOffers.length > 0 ? (
                <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                  {lateOffers.map((o) => (
                    <li key={o.id}>
                      {o.title} · {formatVnd(o.priceVnd)} · còn {o.remainingCapacity}/{o.capacity} ·{" "}
                      {o.status}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      </div>
    </ProviderPageShell>
  );
}
