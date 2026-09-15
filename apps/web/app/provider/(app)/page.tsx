"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrderChat } from "../../components/order-chat";
import { OrderPhoneLinks } from "../../components/order-phone-links";
import { ProviderPageShell, useProviderLocation } from "../../components/provider-location-context";
import { OrderStatusSteps } from "../../components/order-status-steps";
import { api } from "../../../lib/api";
import { OrderNumberHeading } from "../../components/order-number-heading";
import { orderStatusRich } from "../../../lib/order-display";
import { formatOrderAmount, formatVnd } from "../../../lib/money";

type DailyRunnerStats = {
  date: string;
  deliveredOrderCount: number;
  totalDeliveryFeeVnd: number;
  inProgressOrderCount: number;
  inProgressDeliveryFeeVnd: number;
  note: string;
};

type ProviderOrder = {
  id: string;
  orderNumber: string;
  providerBrandName?: string | null;
  status: string;
  serviceVertical?: string;
  laundryPickupMode?: string | null;
  subtotalVnd?: number;
  deliveryFeeVnd?: number;
  runnerFeeVnd?: number;
  totalVnd: number;
  estimatedReadyAt: string | null;
  providerHandoffAt: string | null;
  runnerSoughtAt: string | null;
  runnerUserId: string | null;
  runner: { displayName: string } | null;
  delivery: { building: string | null; apartment: string | null };
  contacts?: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
    runner?: { phone: string | null; displayName?: string | null } | null;
  };
  items: { name: string; quantity: number }[];
};

function hasRunnerSought(order: ProviderOrder): boolean {
  return order.runnerSoughtAt != null && order.runnerSoughtAt !== "";
}

function patchOrder(prev: ProviderOrder, patch: Partial<ProviderOrder>): ProviderOrder {
  return { ...prev, ...patch };
}

const PICKUP_PIPELINE = new Set(["RUNNER_ASSIGNED", "PREPARING", "READY"]);

const REJECT_PRESETS = [
  "Tiệm đang quá tải, mong quý khách thông cảm",
  "Tiệm đang sửa chữa, mong quý khách thông cảm",
] as const;

type HandoffBatch = {
  runnerUserId: string;
  runnerName: string;
  total: number;
  handedOff: number;
};

function computeHandoffBatches(orders: ProviderOrder[]): HandoffBatch[] {
  const byRunner = new Map<string, ProviderOrder[]>();
  for (const o of orders) {
    if (!o.runnerUserId || !PICKUP_PIPELINE.has(o.status)) continue;
    const list = byRunner.get(o.runnerUserId) ?? [];
    list.push(o);
    byRunner.set(o.runnerUserId, list);
  }

  const batches: HandoffBatch[] = [];
  for (const [runnerUserId, group] of byRunner) {
    if (group.length < 2) continue;
    batches.push({
      runnerUserId,
      runnerName: group[0]?.runner?.displayName ?? "Runner",
      total: group.length,
      handedOff: group.filter((o) => o.providerHandoffAt).length,
    });
  }
  return batches;
}

function handoffBatchForOrder(order: ProviderOrder, batches: HandoffBatch[]): HandoffBatch | null {
  if (!order.runnerUserId) return null;
  return batches.find((b) => b.runnerUserId === order.runnerUserId) ?? null;
}

function handoffBatchMessage(batch: HandoffBatch): string {
  const base = `${String(batch.handedOff)}/${String(batch.total)} đơn đã bàn giao — runner chờ lấy hàng`;
  if (batch.handedOff < batch.total) {
    return `${base} (bàn giao hết đơn còn lại trước)`;
  }
  return base;
}

export default function ProviderOrdersPage() {
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get("focus");
  const { locationId, locations, activeLocation } = useProviderLocation();
  const [orders, setOrders] = useState<ProviderOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [runnerStats, setRunnerStats] = useState<DailyRunnerStats | null>(null);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectPreset, setRejectPreset] = useState<string>(REJECT_PRESETS[0]);
  const [rejectCustom, setRejectCustom] = useState("");

  const activeLocationId = locations.some((l) => l.locationId === locationId) ? locationId : "";

  const loadOrders = useCallback(async () => {
    if (!activeLocationId) return;
    setLoadError(null);
    try {
      const res = await api<{ orders: ProviderOrder[] }>(
        `/provider/orders?locationId=${activeLocationId}`,
      );
      setOrders(res.orders);
    } catch (e) {
      setOrders([]);
      setLoadError(e instanceof Error ? e.message : "Không tải được đơn hàng");
    }
  }, [activeLocationId]);

  const loadRunnerStats = useCallback(async () => {
    if (!activeLocationId) return;
    try {
      const res = await api<DailyRunnerStats>(
        `/provider/runner-stats/daily?locationId=${activeLocationId}`,
      );
      setRunnerStats(res);
    } catch {
      setRunnerStats(null);
    }
  }, [activeLocationId]);

  useEffect(() => {
    void loadOrders();
    void loadRunnerStats();
    const timer = window.setInterval(() => {
      void loadOrders();
      void loadRunnerStats();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadOrders, loadRunnerStats]);

  useEffect(() => {
    if (!focusOrderId) return;
    const el = document.getElementById(`order-${focusOrderId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("order-focus-highlight");
    }
  }, [focusOrderId, orders]);

  async function action(orderId: string, act: string, extra?: { rejectReason?: string }) {
    setActionError(null);
    setActingId(orderId);

    const current = orders.find((o) => o.id === orderId);
    if (act === "preparing" && current && current.status !== "RUNNER_ASSIGNED") {
      setActionError("Runner phải nhận đơn trước — mở app Runner (0908888002) bấm Nhận giao.");
      setActingId(null);
      return;
    }

    try {
      const payload: { action: string; rejectReason?: string } = { action: act };
      if (extra?.rejectReason) payload.rejectReason = extra.rejectReason;

      const res = await api<Partial<ProviderOrder>>(`/provider/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? patchOrder(o, res) : o)),
      );
      await loadOrders();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không thực hiện được thao tác");
    } finally {
      setActingId(null);
    }
  }

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([loadOrders(), loadRunnerStats()]);
    } finally {
      setRefreshing(false);
    }
  }

  function openReject(orderId: string) {
    setRejectOrderId(orderId);
    setRejectPreset(REJECT_PRESETS[0]);
    setRejectCustom("");
    setActionError(null);
  }

  async function confirmReject() {
    if (!rejectOrderId) return;
    const reason = rejectCustom.trim() || rejectPreset;
    if (!reason) {
      setActionError("Vui lòng chọn hoặc nhập lý do từ chối");
      return;
    }
    await action(rejectOrderId, "reject", { rejectReason: reason });
    setRejectOrderId(null);
  }

  const handoffBatches = computeHandoffBatches(orders);

  return (
    <ProviderPageShell title="Đơn hàng">
      {rejectOrderId ? (
        <div
          className="card"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            maxWidth: 420,
            margin: "auto",
            height: "fit-content",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          }}
        >
          <p className="section-title">Lý do từ chối đơn</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {REJECT_PRESETS.map((preset) => (
              <label
                key={preset}
                style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="reject-preset"
                  checked={rejectPreset === preset && !rejectCustom.trim()}
                  onChange={() => {
                    setRejectPreset(preset);
                    setRejectCustom("");
                  }}
                />
                {preset}
              </label>
            ))}
          </div>
          <label className="stat" style={{ display: "block", marginBottom: 6 }}>
            Hoặc nhập lý do khác
          </label>
          <input
            type="text"
            value={rejectCustom}
            maxLength={500}
            placeholder="Nhập lý do…"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              marginBottom: 12,
              fontSize: 14,
            }}
            onChange={(e) => setRejectCustom(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn provider-btn"
              style={{ width: "auto", padding: "8px 12px" }}
              disabled={actingId === rejectOrderId}
              onClick={() => void confirmReject()}
            >
              {actingId === rejectOrderId ? "…" : "Xác nhận từ chối"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "auto", padding: "8px 12px" }}
              disabled={actingId === rejectOrderId}
              onClick={() => setRejectOrderId(null)}
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p className="section-title" style={{ margin: 0 }}>
            Đơn hàng
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
            disabled={refreshing}
            onClick={() => void manualRefresh()}
          >
            {refreshing ? "…" : "Làm mới"}
          </button>
        </div>
        {loadError ? (
          <p style={{ color: "crimson", margin: "0 0 12px", fontSize: 14 }}>
            {loadError}
            {loadError.includes("staff member") ? (
              <>
                {" "}
                — thử{" "}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "auto", padding: "2px 8px", fontSize: 12, marginLeft: 4 }}
                  onClick={() => {
                    localStorage.removeItem("picki-provider-location");
                    window.location.reload();
                  }}
                >
                  Reset chi nhánh
                </button>
              </>
            ) : null}
          </p>
        ) : null}
        {actionError ? (
          <p style={{ color: "crimson", margin: "0 0 12px", fontSize: 14 }}>{actionError}</p>
        ) : null}
        {runnerStats && runnerStats.deliveredOrderCount + runnerStats.inProgressOrderCount > 0 ? (
          <div
            className="runner-route-hint"
            style={{
              margin: "0 0 12px",
              padding: "12px",
              borderRadius: 8,
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              fontSize: 14,
            }}
          >
            <strong>Phí runner hôm nay ({runnerStats.date})</strong>
            <p className="stat" style={{ margin: "6px 0 0" }}>
              Đã giao: {runnerStats.deliveredOrderCount} đơn ·{" "}
              {formatVnd(runnerStats.totalDeliveryFeeVnd)}
              {runnerStats.inProgressOrderCount > 0
                ? ` · Đang giao: ${String(runnerStats.inProgressOrderCount)} đơn · ${formatVnd(runnerStats.inProgressDeliveryFeeVnd)}`
                : ""}
            </p>
            <p className="stat" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {runnerStats.note}
            </p>
          </div>
        ) : null}
        {handoffBatches.map((batch) => (
          <div
            key={batch.runnerUserId}
            className="runner-route-hint"
            style={{
              margin: "0 0 12px",
              padding: "10px 12px",
              borderRadius: 8,
              background: batch.handedOff === batch.total ? "#ecfdf5" : "#fffbeb",
              border: `1px solid ${batch.handedOff === batch.total ? "#6ee7b7" : "#fcd34d"}`,
              fontSize: 14,
            }}
          >
            <strong>Route batch · {batch.runnerName}:</strong> {handoffBatchMessage(batch)}
          </div>
        ))}
        {orders.length === 0 ? (
          activeLocation?.providerType === "HOME_SERVICE" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Tiệm dịch vụ nhà không dùng tab Đơn món/ship — khách gửi{" "}
                <strong>yêu cầu dịch vụ</strong>. Mở tab{" "}
                <a href="/provider/requests" style={{ color: "var(--accent-dark)" }}>
                  Yêu cầu
                </a>{" "}
                để nhận và xử lý.
              </p>
            </div>
          ) : activeLocation?.providerType === "BEAUTY" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Tiệm làm đẹp không nhận đơn ship — xem khách báo sắp tới ở tab{" "}
                <a href="/provider/incoming" style={{ color: "var(--accent-dark)" }}>
                  Sắp tới
                </a>
                . Cập nhật thời gian chờ ở tab{" "}
                <a href="/provider/live" style={{ color: "var(--accent-dark)" }}>
                  Trạng thái
                </a>
                .
              </p>
            </div>
          ) : (
            <p className="stat">Chưa có đơn mới.</p>
          )
        ) : (
          orders.map((o) => {
            const sought = hasRunnerSought(o);
            const waitingRunner =
              o.status === "PROVIDER_ACCEPTED" && sought && !o.runnerUserId && !o.runner;
            const busy = actingId === o.id;
            const batch = handoffBatchForOrder(o, handoffBatches);

            return (
              <article
                key={o.id}
                id={`order-${o.id}`}
                className={
                  focusOrderId === o.id
                    ? "provider-card order-focus-highlight"
                    : "provider-card"
                }
                style={{ marginBottom: 12 }}
              >
                <OrderNumberHeading
                  orderNumber={o.orderNumber}
                  providerBrandName={o.providerBrandName}
                  right={<span>{formatOrderAmount(o.totalVnd, o.serviceVertical)}</span>}
                />
                {o.serviceVertical !== "LAUNDRY" && (o.deliveryFeeVnd ?? 0) > 0 ? (
                  <p className="stat" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    Hàng {formatVnd(o.subtotalVnd ?? o.totalVnd - (o.deliveryFeeVnd ?? 0))} + ship{" "}
                    {formatVnd(o.deliveryFeeVnd ?? 0)}
                  </p>
                ) : null}
                <p className="stat">
                  {orderStatusRich(o.status, {
                    estimatedReadyAt: o.estimatedReadyAt,
                    providerHandoffAt: o.providerHandoffAt,
                    runnerSoughtAt: o.runnerSoughtAt,
                    runner: o.runner,
                    serviceVertical: o.serviceVertical,
                    laundryPickupMode: o.laundryPickupMode,
                  })}
                </p>
                <OrderStatusSteps
                  status={o.status}
                  runnerSoughtAt={o.runnerSoughtAt}
                  serviceVertical={o.serviceVertical}
                  laundryPickupMode={o.laundryPickupMode}
                />
                {waitingRunner && o.serviceVertical !== "LAUNDRY" ? (
                  <div className="runner-route-hint" style={{ margin: "8px 0", fontSize: 14 }}>
                    <strong>Bước tiếp:</strong> Runner mở app{" "}
                    <strong>Picki Runner</strong> (0908888002) → tab <strong>Đơn chờ nhận</strong>{" "}
                    → bấm <strong>Nhận giao</strong>. Quán chưa nấu cho đến khi runner nhận.
                  </div>
                ) : null}
                {waitingRunner && o.serviceVertical === "LAUNDRY" ? (
                  <p className="stat" style={{ margin: "8px 0", fontSize: 14 }}>
                    Đang chờ runner nhận chặng giao về.
                  </p>
                ) : null}
                {o.contacts?.customer.phone ? (
                  <OrderPhoneLinks contacts={o.contacts} showOnly="customer" compact />
                ) : null}
                {batch ? (
                  <p className="stat" style={{ margin: "8px 0", fontSize: 13, color: "#b45309" }}>
                    Batch: {handoffBatchMessage(batch)}
                  </p>
                ) : null}
                <p style={{ fontSize: 14, margin: "4px 0 8px" }}>
                  {o.items.map((i) => `${i.name}×${String(i.quantity)}`).join(", ")}
                </p>
                <p className="stat" style={{ marginBottom: 8 }}>
                  Giao: {o.delivery.building}-{o.delivery.apartment}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {o.serviceVertical === "LAUNDRY" &&
                  o.status === "PROVIDER_ACCEPTED" &&
                  o.laundryPickupMode === "HOME_PICKUP" ? (
                    <>
                      <span className="stat" style={{ width: "100%", marginBottom: 4 }}>
                        Hẹn giờ lấy đồ qua chat / gọi khách
                      </span>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "collected")}
                      >
                        {busy ? "…" : "Đã lấy đồ về giặt"}
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" &&
                  o.status === "PROVIDER_ACCEPTED" &&
                  o.laundryPickupMode === "ON_SITE" ? (
                    <>
                      <span className="stat" style={{ width: "100%", marginBottom: 4 }}>
                        Hẹn giờ qua chat / gọi khách
                      </span>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "processing")}
                      >
                        {busy ? "…" : "Bắt đầu dịch vụ tại nhà"}
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" && o.status === "PROVIDER_ACCEPTED" && o.laundryPickupMode === "SHOP_DROP_OFF" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "received")}
                    >
                      {busy ? "…" : "Đã nhận đồ tại tiệm"}
                    </button>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" && o.status === "AT_SHOP" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "processing")}
                    >
                      {busy ? "…" : "Bắt đầu giặt"}
                    </button>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" &&
                  o.status === "PROCESSING" &&
                  o.laundryPickupMode !== "ON_SITE" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "ready_for_return")}
                    >
                      {busy ? "…" : "Sẵn sàng giao lại"}
                    </button>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" &&
                  o.status === "PROCESSING" &&
                  o.laundryPickupMode === "ON_SITE" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "complete")}
                    >
                      {busy ? "…" : "Hoàn thành đơn"}
                    </button>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" && o.status === "READY_FOR_RETURN" && !sought ? (
                    <>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "staff_deliver")}
                      >
                        {busy ? "…" : "Tự giao"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "find_return_runner")}
                      >
                        {busy
                          ? "…"
                          : `Tìm runner${(o.runnerFeeVnd ?? 0) > 0 ? ` · ${formatVnd(o.runnerFeeVnd ?? 0)}` : ""}`}
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" &&
                  o.status === "RETURN_DELIVERING" &&
                  !o.runnerUserId ? (
                    <>
                      <span className="live-pill live-open" style={{ margin: 0 }}>
                        Đang tự giao về khách
                      </span>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "complete")}
                      >
                        {busy ? "…" : "Hoàn thành đơn hàng"}
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" &&
                  o.status === "READY_FOR_RETURN" &&
                  sought &&
                  !o.runner ? (
                    <>
                      <span className="live-pill live-open" style={{ margin: 0 }}>
                        Đang chờ runner
                        {(o.runnerFeeVnd ?? o.deliveryFeeVnd ?? 0) > 0
                          ? ` · ${formatVnd(o.runnerFeeVnd ?? o.deliveryFeeVnd ?? 0)}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "find_return_runner")}
                      >
                        Gửi lại runner
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "cancel_return_runner")}
                      >
                        {busy ? "…" : "Hủy gọi runner"}
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical === "LAUNDRY" && (o.status === "CREATED" || o.status === "PAID") ? (
                    <>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "accept")}
                      >
                        {busy ? "…" : "Nhận đơn giặt"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => openReject(o.id)}
                      >
                        Từ chối
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" && (o.status === "CREATED" || o.status === "PAID") ? (
                    <>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "accept")}
                      >
                        {busy
                          ? "…"
                          : `Nhận đơn & tìm runner${(o.runnerFeeVnd ?? o.deliveryFeeVnd ?? 0) > 0 ? ` · ${formatVnd(o.runnerFeeVnd ?? o.deliveryFeeVnd ?? 0)}` : ""}`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => openReject(o.id)}
                      >
                        Từ chối
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" && o.status === "PROVIDER_ACCEPTED" && !sought ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "find_runner")}
                    >
                      {busy
                        ? "…"
                        : `Tìm runner${(o.runnerFeeVnd ?? o.deliveryFeeVnd ?? 0) > 0 ? ` · ${formatVnd(o.runnerFeeVnd ?? o.deliveryFeeVnd ?? 0)}` : ""}`}
                    </button>
                  ) : null}
                  {waitingRunner && o.serviceVertical !== "LAUNDRY" ? (
                    <>
                      <span className="live-pill live-open" style={{ margin: 0 }}>
                        Đang chờ runner
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "find_runner")}
                      >
                        Gửi lại runner
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" && o.status === "RUNNER_ASSIGNED" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "preparing")}
                    >
                      {busy ? "…" : "Bắt đầu nấu"}
                    </button>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" && o.status === "PREPARING" ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "ready")}
                    >
                      Sẵn sàng giao
                    </button>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" && o.status === "READY" && !o.providerHandoffAt && (o.runner || o.runnerUserId) ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "handoff")}
                    >
                      Đã giao cho runner
                    </button>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" && o.status === "READY" && o.providerHandoffAt ? (
                    <p className="stat" style={{ margin: 0 }}>
                      ✓ Đã giao — chờ runner xác nhận nhận hàng
                    </p>
                  ) : null}
                </div>
                <OrderChat orderId={o.id} viewerRole="PROVIDER" compact />
              </article>
            );
          })
        )}
      </div>
    </ProviderPageShell>
  );
}
