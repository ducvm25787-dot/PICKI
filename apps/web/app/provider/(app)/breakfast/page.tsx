"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import {
  BF_DEFAULT_CUTOFF,
  BF_DEFAULT_DELIVERY_END,
  BF_DEFAULT_DELIVERY_START,
  BF_DEFAULT_OPEN_FROM,
  bfGenerateDeliverySlots,
  bfIsPastCutoff,
  formatVnd,
} from "../../../../lib/breakfast-preorder";
import { isFoodBreakfastVertical } from "../../../../lib/providers";

type CatalogItem = {
  offeringId: string;
  name: string;
  description: string | null;
  amountVnd: number;
};

type OpsResponse = {
  serviceDate: string;
  settings: {
    enabled: boolean;
    cutoffTime: string;
    openFromTime: string;
    dailyCapacity: number | null;
  } | null;
  acceptingPreorder?: boolean;
  menu: {
    id: string;
    status: string;
    publishedAt: string | null;
    copiedFromServiceDate?: string | null;
  } | null;
  items: {
    id: string;
    offeringId: string | null;
    name: string;
    priceVnd: number;
    status: string;
    remainingCapacity: number | null;
    paidQuantity: number;
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
};

type MenuApi = {
  items: {
    id: string;
    name: string;
    description?: string | null;
    amountVnd?: number;
  }[];
};

export default function ProviderBreakfastPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [ops, setOps] = useState<OpsResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cutoffDraft, setCutoffDraft] = useState(BF_DEFAULT_CUTOFF);
  const [deliveryStart, setDeliveryStart] = useState(BF_DEFAULT_DELIVERY_START);
  const [deliveryEnd, setDeliveryEnd] = useState(BF_DEFAULT_DELIVERY_END);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isFood = isFoodBreakfastVertical(activeLocation?.providerType);
  const serviceDate = ops?.serviceDate ?? "";
  const cutoffTime = (ops?.settings?.cutoffTime ?? cutoffDraft).slice(0, 5);

  const loadOps = useCallback(async () => {
    if (!locationId) return;
    const data = await api<OpsResponse>(
      `/provider/locations/${locationId}/breakfast-preorder/ops`,
    );
    setOps(data);
    setCutoffDraft(data.settings?.cutoffTime?.slice(0, 5) ?? BF_DEFAULT_CUTOFF);
  }, [locationId]);

  const loadCatalog = useCallback(async () => {
    if (!locationId) return;
    const data = await api<MenuApi>(`/locations/${locationId}/menu`);
    const items = (data.items ?? []).map((i) => ({
      offeringId: i.id,
      name: i.name,
      description: i.description ?? null,
      amountVnd: i.amountVnd ?? 0,
    })).filter((i) => i.offeringId);
    setCatalog(items);
  }, [locationId]);

  useEffect(() => {
    if (!locationId || !isFood) return;
    void Promise.all([loadOps(), loadCatalog()]).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Không tải được");
    });
  }, [locationId, isFood, loadOps, loadCatalog]);

  useEffect(() => {
    if (!ops?.items.length) return;
    const next: Record<string, boolean> = {};
    for (const i of ops.items) {
      if (i.offeringId) next[i.offeringId] = true;
    }
    setSelected((prev) => (Object.keys(prev).length ? prev : next));
  }, [ops?.items]);

  const selectedOfferings = useMemo(
    () => catalog.filter((c) => selected[c.offeringId]),
    [catalog, selected],
  );

  const previewSlots = useMemo(
    () => bfGenerateDeliverySlots(deliveryStart, deliveryEnd),
    [deliveryStart, deliveryEnd],
  );

  async function publishMenu() {
    if (!locationId || selectedOfferings.length === 0) return;
    if (previewSlots.length === 0) {
      setError("Giờ kết thúc phải sau giờ bắt đầu ít nhất 15 phút");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api(`/provider/locations/${locationId}/breakfast-preorder/menu`, {
        method: "POST",
        body: JSON.stringify({
          serviceDate,
          items: selectedOfferings.map((o, idx) => ({
            offeringId: o.offeringId,
            capacity: 40,
            sortOrder: idx,
          })),
          deliveryStartAt: deliveryStart,
          deliveryEndAt: deliveryEnd,
        }),
      });
      setSuccessMsg(
        `Đã đăng menu sáng · ${String(previewSlots.length)} khung giao (${deliveryStart}–${deliveryEnd})`,
      );
      await loadOps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng menu thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function copyLast() {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        items: { offeringId: string | null; name: string; priceVnd: number }[];
        published: boolean;
      }>(`/provider/locations/${locationId}/breakfast-preorder/copy-last-menu`, {
        method: "POST",
        body: JSON.stringify({ publish: true }),
      });
      setSuccessMsg(
        res.published
          ? `Đã chép & đăng ${res.items.length} món`
          : "Đã lấy menu cũ",
      );
      await loadOps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không chép được");
    } finally {
      setBusy(false);
    }
  }

  async function openReceiving() {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/provider/locations/${locationId}/breakfast-preorder/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: true,
          cutoffTime: cutoffDraft.slice(0, 5),
          openFromTime: BF_DEFAULT_OPEN_FROM,
        }),
      });
      setSuccessMsg(`Đã mở nhận đơn · chốt ${cutoffDraft}`);
      await loadOps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở được");
    } finally {
      setBusy(false);
    }
  }

  async function closeReceiving() {
    if (!locationId) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/breakfast-preorder/settings`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      });
      await loadOps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  if (!isFood) {
    return (
      <ProviderPageShell title="Sáng mai">
        <div className="card">
          <p>Chỉ quán ăn uống mới dùng «Sáng mai ăn gì?».</p>
        </div>
      </ProviderPageShell>
    );
  }

  const pastCutoff =
    Boolean(serviceDate && cutoffTime) && bfIsPastCutoff(serviceDate, cutoffTime);
  const receivingOpen = ops?.settings?.enabled === true;

  return (
    <ProviderPageShell title="Sáng mai">
      <p className="stat" style={{ marginTop: 0 }}>
        Ngày phục vụ {serviceDate || "…"} · chốt tối hôm trước
      </p>

      {error ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p>
        </div>
      ) : null}
      {successMsg ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>{successMsg}</p>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Nhận đơn</p>
        <p className="stat">
          {receivingOpen
            ? `Đang nhận · chốt ${cutoffTime}${pastCutoff ? " (đã qua)" : ""}`
            : "Chưa mở nhận đơn"}
        </p>
        <label className="stat" style={{ display: "block", marginTop: 8 }}>
          Giờ chốt (tối hôm trước)
          <input
            type="time"
            value={cutoffDraft}
            onChange={(e) => setCutoffDraft(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: 8 }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={busy || !ops?.menu || receivingOpen}
            onClick={() => void openReceiving()}
          >
            Mở nhận đơn
          </button>
          {receivingOpen ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void closeReceiving()}
            >
              Tắt nhận
            </button>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Menu sáng từ catalog</p>
        <p className="stat">Chọn món sẵn có trên thực đơn quán</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
          <label className="stat" style={{ display: "block" }}>
            Giao từ
            <input
              type="time"
              value={deliveryStart}
              onChange={(e) => setDeliveryStart(e.target.value)}
              step={900}
              style={{ display: "block", marginTop: 4, padding: 8 }}
            />
          </label>
          <label className="stat" style={{ display: "block" }}>
            đến
            <input
              type="time"
              value={deliveryEnd}
              onChange={(e) => setDeliveryEnd(e.target.value)}
              step={900}
              style={{ display: "block", marginTop: 4, padding: 8 }}
            />
          </label>
        </div>
        <p className="stat" style={{ marginTop: 0 }}>
          {previewSlots.length > 0
            ? `${String(previewSlots.length)} khung × 15 phút (${previewSlots[0]!.startsAt}–${previewSlots[previewSlots.length - 1]!.endsAt})`
            : "Khung giờ không hợp lệ"}
        </p>
        {catalog.length === 0 ? (
          <p className="stat">Chưa có món trong catalog — thêm món ở quản lý menu trước.</p>
        ) : (
          <div className="provider-list">
            {catalog.map((c) => (
              <label
                key={c.offeringId}
                className="provider-card"
                style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected[c.offeringId])}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [c.offeringId]: e.target.checked }))
                  }
                />
                <span>
                  <strong>{c.name}</strong>
                  <span className="stat" style={{ display: "block" }}>
                    {formatVnd(c.amountVnd)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={busy || selectedOfferings.length === 0 || previewSlots.length === 0}
            onClick={() => void publishMenu()}
          >
            Đăng menu ({selectedOfferings.length})
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void copyLast()}
          >
            Chép menu gần nhất
          </button>
        </div>
        {ops?.menu ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Menu hiện tại: {ops.menu.status}
            {ops.menu.copiedFromServiceDate
              ? ` · chép từ ${ops.menu.copiedFromServiceDate}`
              : ""}
            {ops.windows?.length
              ? ` · ${String(ops.windows.length)} khung giao`
              : ""}
          </p>
        ) : null}
      </div>

      <div className="card">
        <p className="section-title">Thống kê đơn đã trả</p>
        <p className="stat">
          {ops?.liveProduction.confirmedOrders ?? 0} đơn · theo món (mua nguyên liệu)
        </p>
        {(ops?.items ?? []).length === 0 ? (
          <p className="stat">Chưa có menu</p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {ops!.items.map((i) => (
              <li key={i.id}>
                {i.name}: <strong>{i.paidQuantity}</strong> suất
                {i.remainingCapacity != null ? ` · còn ${i.remainingCapacity}` : ""}
              </li>
            ))}
          </ul>
        )}
        {(ops?.windows ?? []).length > 0 ? (
          <>
            <p className="section-title" style={{ marginTop: 16 }}>
              Khung giờ
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {ops!.windows.map((w) => (
                <li key={w.id}>
                  {w.startsAt}–{w.endsAt}: {w.paidOrders} đơn · còn {w.remainingCapacity}/{w.capacity}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </ProviderPageShell>
  );
}
