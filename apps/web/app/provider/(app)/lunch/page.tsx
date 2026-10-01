"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import { bfGenerateDeliverySlots, formatVnd } from "../../../../lib/breakfast-preorder";
import { isFoodBreakfastVertical } from "../../../../lib/providers";

const LUNCH_DELIVERY_START = "11:00";
const LUNCH_DELIVERY_END = "13:00";

type CatalogItem = {
  offeringId: string;
  name: string;
  description: string | null;
  amountVnd: number;
};

type OpsResponse = {
  serviceDate: string;
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

export default function ProviderLunchPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [ops, setOps] = useState<OpsResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lunchOn, setLunchOn] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliveryStart, setDeliveryStart] = useState(LUNCH_DELIVERY_START);
  const [deliveryEnd, setDeliveryEnd] = useState(LUNCH_DELIVERY_END);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isFood = isFoodBreakfastVertical(activeLocation?.providerType);
  const serviceDate = ops?.serviceDate ?? "";

  const load = useCallback(async () => {
    if (!locationId) return;
    const [data, selling] = await Promise.all([
      api<OpsResponse>(
        `/provider/locations/${locationId}/breakfast-preorder/ops?daypart=LUNCH`,
      ),
      api<{ channels: { capability: string; enabled: boolean }[] }>(
        `/provider/locations/${locationId}/selling`,
      ),
    ]);
    setOps(data);
    setLunchOn(selling.channels.some((c) => c.capability === "LUNCH" && c.enabled));
    if (data.windows.length > 0) {
      setDeliveryStart(data.windows[0]!.startsAt.slice(0, 5));
      setDeliveryEnd(data.windows[data.windows.length - 1]!.endsAt.slice(0, 5));
    }
  }, [locationId]);

  const loadCatalog = useCallback(async () => {
    if (!locationId) return;
    const data = await api<MenuApi>(`/locations/${locationId}/menu`);
    const items = (data.items ?? [])
      .map((i) => ({
        offeringId: i.id,
        name: i.name,
        description: i.description ?? null,
        amountVnd: i.amountVnd ?? 0,
      }))
      .filter((i) => i.offeringId);
    setCatalog(items);
  }, [locationId]);

  useEffect(() => {
    if (!locationId || !isFood) return;
    void Promise.all([load(), loadCatalog()]).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Không tải được");
    });
  }, [locationId, isFood, load, loadCatalog]);

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
          daypart: "LUNCH",
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
        `Đã đăng menu trưa · ${String(previewSlots.length)} khung giao (${deliveryStart}–${deliveryEnd})`,
      );
      setSelected({});
      await load();
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
        items: { name: string }[];
        published: boolean;
      }>(`/provider/locations/${locationId}/breakfast-preorder/copy-last-menu`, {
        method: "POST",
        body: JSON.stringify({ publish: true, daypart: "LUNCH", serviceDate }),
      });
      setSuccessMsg(
        res.published ? `Đã chép và đăng ${res.items.length} món trưa` : "Đã lấy menu trưa cũ",
      );
      setSelected({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không chép được");
    } finally {
      setBusy(false);
    }
  }

  if (!isFood) {
    return (
      <ProviderPageShell title="Bữa trưa">
        <div className="card">
          <p>Chỉ quán ăn uống mới đăng menu trưa.</p>
        </div>
      </ProviderPageShell>
    );
  }

  return (
    <ProviderPageShell title="Bữa trưa">
      <p className="stat" style={{ marginTop: 0 }}>
        Menu trưa ngày {serviceDate || "…"} · khách đặt 09:00–13:00
      </p>

      {lunchOn === false ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ marginTop: 0 }}>
            Bữa trưa vui vẻ đang tắt. Khách chưa thấy menu này cho đến khi bật ở Cách bán.
          </p>
          <Link href="/provider/selling" className="btn">
            Mở Cách bán
          </Link>
        </div>
      ) : null}

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
        <p className="section-title">Menu trưa từ sản phẩm</p>
        <p className="stat">Chọn món sẵn có. Không ghép mâm như bữa tối.</p>
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
          <p className="stat">Chưa có món — thêm ở tab Sản phẩm.</p>
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
            Đăng menu trưa ({selectedOfferings.length})
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void copyLast()}>
            Chép menu trưa gần nhất
          </button>
        </div>
        {ops?.menu ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Menu hiện tại: {ops.menu.status}
            {ops.menu.copiedFromServiceDate ? ` · chép từ ${ops.menu.copiedFromServiceDate}` : ""}
            {ops.windows.length ? ` · ${String(ops.windows.length)} khung giao` : ""}
          </p>
        ) : null}
      </div>

      <div className="card">
        <p className="section-title">Suất đã bán</p>
        <p className="stat">{ops?.liveProduction.confirmedOrders ?? 0} đơn</p>
        {(ops?.items ?? []).length === 0 ? (
          <p className="stat">Chưa có menu trưa</p>
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
      </div>
    </ProviderPageShell>
  );
}
