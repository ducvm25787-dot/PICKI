"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrderChat } from "../../components/order-chat";
import { OrderPhoneLinks } from "../../components/order-phone-links";
import { ProviderPageShell, useProviderLocation } from "../../components/provider-location-context";
import { OrderStatusSteps } from "../../components/order-status-steps";
import { api } from "../../../lib/api";
import { OrderNumberHeading } from "../../components/order-number-heading";
import { isDaypartMenuOrder } from "@picki/shared";
import { orderStatusRich } from "../../../lib/order-display";
import { formatOrderAmount, formatVnd } from "../../../lib/money";
import { fdFormatItemQtyLabel, fdIsPastCutoff } from "../../../lib/family-dinner";
import { bfIsPastCutoff } from "../../../lib/breakfast-preorder";
import { loyaltyLabelClass, loyaltyLabelVi } from "../../../lib/loyalty";
import { isMarketVertical } from "../../../lib/providers";

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
  orderKind?: string;
  serviceDate?: string | null;
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
  deliveryWindow?: { startsAt: string; endsAt: string; label: string } | null;
  scheduledPrepareOpen?: boolean | null;
  delivery: {
    building: string | null;
    apartment: string | null;
    accessNote?: string | null;
    runnerWaitMinutes?: number;
    runnerWaitFeeVnd?: number;
  };
  customerNote?: string | null;
  contacts?: {
    customer: { phone: string | null; displayName?: string | null; avatarUrl?: string | null };
    provider: { phone: string | null; label?: string };
    runner?: { phone: string | null; displayName?: string | null } | null;
  };
  customerLoyalty?: { label: string; completedInteractions: number };
  containsAlcohol?: boolean;
  items: { name: string; quantity: number; familyDinnerCategory?: string | null }[];
};

function hasRunnerSought(order: ProviderOrder): boolean {
  return order.runnerSoughtAt != null && order.runnerSoughtAt !== "";
}

function isCookFirstOrder(order: ProviderOrder): boolean {
  return (
    order.orderKind === "FAMILY_DINNER" ||
    order.orderKind === "LATE_DINNER" ||
    isDaypartMenuOrder(order.orderKind)
  );
}

function patchOrder(prev: ProviderOrder, patch: Partial<ProviderOrder>): ProviderOrder {
  return { ...prev, ...patch };
}

const PICKUP_PIPELINE = new Set(["RUNNER_ASSIGNED", "PREPARING", "READY"]);

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get("focus");
  const { chain, loading: locationLoading, locationId, locations, activeLocation } = useProviderLocation();
  useEffect(() => {
    if (locationLoading || !chain?.chainEnabled) return;
    if (focusOrderId) {
      sessionStorage.setItem("picki-provider-local", "1");
      return;
    }
    if (sessionStorage.getItem("picki-provider-local") !== "1") {
      router.replace("/provider/organization");
    }
  }, [chain?.chainEnabled, focusOrderId, locationLoading, router]);
  const [orders, setOrders] = useState<ProviderOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [runnerStats, setRunnerStats] = useState<DailyRunnerStats | null>(null);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectCustom, setRejectCustom] = useState("");
  const [fdCutoffTime, setFdCutoffTime] = useState<string | null>(null);
  const [bfCutoffTime, setBfCutoffTime] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const activeLocationId = locations.some((l) => l.locationId === locationId) ? locationId : "";

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!activeLocationId) return;
    setLoadError(null);
    try {
      const res = await api<{
        orders: ProviderOrder[];
        familyDinnerCutoffTime?: string | null;
        breakfastCutoffTime?: string | null;
      }>(`/provider/orders?locationId=${activeLocationId}`);
      setOrders(res.orders);
      setFdCutoffTime(res.familyDinnerCutoffTime?.slice(0, 5) ?? null);
      setBfCutoffTime(res.breakfastCutoffTime?.slice(0, 5) ?? null);
    } catch (e) {
      setOrders([]);
      setLoadError(e instanceof Error ? e.message : "Không tải được đơn hàng");
    }
  }, [activeLocationId]);

  function canStartFamilyDinnerCook(order: ProviderOrder): boolean {
    if (order.orderKind === "LATE_DINNER") return true;
    if (order.orderKind === "LUNCH") return true;
    if (order.orderKind === "BREAKFAST_PREORDER") {
      if (!order.serviceDate || !bfCutoffTime) return false;
      return bfIsPastCutoff(order.serviceDate, bfCutoffTime, nowTick);
    }
    if (order.orderKind !== "FAMILY_DINNER") return true;
    if (!order.serviceDate || !fdCutoffTime) return false;
    return fdIsPastCutoff(order.serviceDate, fdCutoffTime, nowTick);
  }

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
    if (
      act === "preparing" &&
      current &&
      current.status !== "RUNNER_ASSIGNED" &&
      !isCookFirstOrder(current)
    ) {
      setActionError("Runner phải nhận đơn trước — mở app Runner (0908888002) bấm Nhận giao.");
      setActingId(null);
      return;
    }
    if (act === "preparing" && current && isCookFirstOrder(current) && !canStartFamilyDinnerCook(current)) {
      const cutoffLabel =
        current.orderKind === "BREAKFAST_PREORDER" ? bfCutoffTime : fdCutoffTime;
      setActionError(
        `Chỉ bắt đầu nấu sau giờ chốt nhận đơn${cutoffLabel ? ` (${cutoffLabel})` : ""}`,
      );
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
    setRejectCustom("");
    setActionError(null);
  }

  async function confirmReject() {
    if (!rejectOrderId) return;
    const reason = rejectCustom.trim();
    await action(rejectOrderId, "reject", reason ? { rejectReason: reason } : undefined);
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
          <p className="stat" style={{ marginTop: 0 }}>
            Có thể để trống. Khách nhận thông báo “Đơn hàng bị từ chối”.
          </p>
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
          ) : activeLocation?.providerType === "AUTO_SERVICE" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Rửa xe / bơm lốp — xem xe sắp tới ở tab{" "}
                <a href="/provider/incoming" style={{ color: "var(--accent-dark)" }}>
                  Sắp tới
                </a>
                . Cập nhật thời gian chờ ở tab{" "}
                <a href="/provider/live" style={{ color: "var(--accent-dark)" }}>
                  Trạng thái
                </a>
                . Thay dầu/sửa chữa — khách liên hệ trực tiếp.
              </p>
            </div>
          ) : activeLocation?.providerType === "PET_SERVICE" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                PET SPA — spa pet ở tab{" "}
                <a href="/provider/incoming" style={{ color: "var(--accent-dark)" }}>
                  Sắp tới
                </a>
                , trông pet / dắt chó ở tab{" "}
                <a href="/provider/requests" style={{ color: "var(--accent-dark)" }}>
                  Yêu cầu
                </a>
                . Cập nhật thời gian chờ ở tab{" "}
                <a href="/provider/live" style={{ color: "var(--accent-dark)" }}>
                  Trạng thái
                </a>
                .
              </p>
            </div>
          ) : activeLocation?.providerType === "EDUCATION_PROVIDER" ||
            activeLocation?.providerType === "TUTOR" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Trung tâm giáo dục quản lý{" "}
                <strong>buổi học thử</strong> ở tab{" "}
                <a href="/provider/requests" style={{ color: "var(--accent-dark)" }}>
                  Yêu cầu
                </a>
                .
              </p>
            </div>
          ) : activeLocation?.providerType === "SPORTS_FACILITY" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Đặt sân — xem yêu cầu khung giờ ở tab{" "}
                <a href="/provider/requests" style={{ color: "var(--accent-dark)" }}>
                  Yêu cầu
                </a>
                . Xác nhận hoặc từ chối, không thu phí qua Pickee V1.
              </p>
            </div>
          ) : activeLocation?.providerType === "TRANSPORT_PROVIDER" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Xe đưa đón trên Pickee hiện <strong>đang nhận chuyến</strong>, nhận{" "}
                <strong>gọi / Zalo</strong> và tin nhắn hỏi lịch & giá. Cập nhật trạng thái ở tab{" "}
                <a href="/provider/live" style={{ color: "var(--accent-dark)" }}>
                  Trạng thái
                </a>
                ; tin khách ở tab{" "}
                <a href="/provider/chats" style={{ color: "var(--accent-dark)" }}>
                  Tin nhắn
                </a>
                .
              </p>
            </div>
          ) : activeLocation?.providerType === "PHARMACY" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Nhà thuốc trên Pickee chỉ hiện <strong>đang mở</strong> và nhận{" "}
                <strong>gọi / Zalo</strong> — không bán thuốc qua giỏ hàng. Cập nhật trạng thái ở
                tab{" "}
                <a href="/provider/live" style={{ color: "var(--accent-dark)" }}>
                  Trạng thái
                </a>
                . Câu hỏi kèm ảnh của khách ở tab{" "}
                <a href="/provider/chats" style={{ color: "var(--accent-dark)" }}>
                  Hỏi hàng
                </a>
                .
              </p>
            </div>
          ) : activeLocation?.providerType === "SUPERMARKET" ? (
            <div className="card">
              <p className="stat" style={{ margin: 0 }}>
                Siêu thị trên Pickee hiện trạng thái mở và gian hàng. Bán hàng theo món sẽ bật khi
                cửa hàng được mở bán.
              </p>
            </div>
          ) : (
            <p className="stat">Chưa có đơn mới.</p>
          )
        ) : (
          orders.map((o) => {
            const sought = hasRunnerSought(o);
            const cookFirst = isCookFirstOrder(o);
            const marketPack = isMarketVertical(activeLocation?.providerType);
            const waitingRunner = cookFirst || marketPack
              ? o.status === "READY" && sought && !o.runnerUserId && !o.runner
              : o.status === "PROVIDER_ACCEPTED" && sought && !o.runnerUserId && !o.runner;
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
                {o.customerLoyalty && o.customerLoyalty.label !== "NEW" ? (
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    <span className={loyaltyLabelClass(o.customerLoyalty.label)}>
                      {loyaltyLabelVi(o.customerLoyalty.label)}
                    </span>
                    {o.customerLoyalty.completedInteractions > 0
                      ? ` · ${String(o.customerLoyalty.completedInteractions)} lần`
                      : null}
                  </p>
                ) : null}
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
                  runnerUserId={o.runnerUserId}
                  hasRunner={!!o.runner}
                  serviceVertical={o.serviceVertical}
                  laundryPickupMode={o.laundryPickupMode}
                  orderKind={o.orderKind}
                />
                {waitingRunner && o.serviceVertical !== "LAUNDRY" && !cookFirst ? (
                  <div className="runner-route-hint" style={{ margin: "8px 0", fontSize: 14 }}>
                    <strong>Bước tiếp:</strong> Runner mở app{" "}
                    <strong>Pickee Runner</strong> (0908888002) → tab <strong>Đơn chờ nhận</strong>{" "}
                    → bấm <strong>Nhận giao</strong>. Quán chưa nấu cho đến khi runner nhận.
                  </div>
                ) : null}
                {waitingRunner && cookFirst ? (
                  <div className="runner-route-hint" style={{ margin: "8px 0", fontSize: 14 }}>
                    {isDaypartMenuOrder(o.orderKind)
                      ? "Đã sẵn sàng — đang chờ runner nhận giao. Hoặc bấm Tự giao nếu quán tự sắp xếp."
                      : "Đã nấu xong — đang chờ runner nhận giao. Hoặc bấm Tự giao nếu bếp tự sắp xếp."}
                  </div>
                ) : null}
                {waitingRunner && o.serviceVertical === "LAUNDRY" ? (
                  <p className="stat" style={{ margin: "8px 0", fontSize: 14 }}>
                    Đang chờ runner nhận chặng giao về.
                  </p>
                ) : null}
                {o.contacts ? (
                  <OrderPhoneLinks contacts={o.contacts} showOnly="customer" compact />
                ) : null}
                {batch ? (
                  <p className="stat" style={{ margin: "8px 0", fontSize: 13, color: "#b45309" }}>
                    Batch: {handoffBatchMessage(batch)}
                  </p>
                ) : null}
                {o.containsAlcohol ? (
                  <p style={{ margin: "4px 0 8px", fontWeight: 700 }}>
                    18+ · Có đồ uống có cồn. Rót sau khi thanh toán, đậy nắp kín, không giao cốc mở hay túi nilon.
                  </p>
                ) : null}
                <p style={{ fontSize: 14, margin: "4px 0 8px" }}>
                  {o.items
                    .map((i) =>
                      fdFormatItemQtyLabel(i.name, i.quantity, {
                        category: i.familyDinnerCategory,
                      }),
                    )
                    .join(", ")}
                </p>
                {o.deliveryWindow?.label || o.serviceDate ? (
                  <p className="stat" style={{ marginBottom: 4 }}>
                    {o.orderKind === "STANDARD" && o.serviceDate ? "Sáng mai giao · " : null}
                    {o.deliveryWindow?.label
                      ? `Khung giao: ${o.deliveryWindow.label}`
                      : null}
                    {o.deliveryWindow?.label && o.serviceDate ? " · " : null}
                    {o.serviceDate ? `Ngày ${o.serviceDate}` : null}
                  </p>
                ) : null}
                <p className="stat" style={{ marginBottom: 8 }}>
                  Giao: {o.delivery.building}-{o.delivery.apartment}
                </p>
                {o.delivery.accessNote ? (
                  <p className="stat" style={{ margin: "0 0 8px", fontSize: 13 }}>
                    {o.delivery.accessNote}
                    {(o.delivery.runnerWaitFeeVnd ?? 0) > 0
                      ? ` · Phí chờ ${formatVnd(o.delivery.runnerWaitFeeVnd ?? 0)} (quán trả, cộng vào phí runner)`
                      : ""}
                  </p>
                ) : null}
                {o.customerNote ? (
                  <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                    Khách nhắn: {o.customerNote}
                  </p>
                ) : null}
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
                        {(o.runnerFeeVnd ?? 0) > 0 ? ` · ${formatVnd(o.runnerFeeVnd ?? 0)}` : ""}
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
                          : cookFirst || marketPack
                            ? "Nhận đơn"
                            : `Nhận đơn & tìm runner${(o.runnerFeeVnd ?? 0) > 0 ? ` · ${formatVnd(o.runnerFeeVnd ?? 0)}` : ""}`}
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
                  {marketPack &&
                  (o.status === "PROVIDER_ACCEPTED" || o.status === "PREPARING") ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy || o.scheduledPrepareOpen === false}
                      onClick={() => void action(o.id, "ready")}
                    >
                      {busy ? "…" : o.scheduledPrepareOpen === false ? "Chưa tới giờ chuẩn bị" : "Sẵn sàng giao"}
                    </button>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" &&
                  !cookFirst &&
                  !marketPack &&
                  o.status === "PROVIDER_ACCEPTED" &&
                  !sought ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "find_runner")}
                    >
                      {busy
                        ? "…"
                        : `Tìm runner${(o.runnerFeeVnd ?? 0) > 0 ? ` · ${formatVnd(o.runnerFeeVnd ?? 0)}` : ""}`}
                    </button>
                  ) : null}
                  {cookFirst &&
                  o.status === "PROVIDER_ACCEPTED" &&
                  isDaypartMenuOrder(o.orderKind) ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{
                        width: "auto",
                        padding: "8px 12px",
                        opacity: canStartFamilyDinnerCook(o) ? 1 : 0.45,
                      }}
                      disabled={busy || !canStartFamilyDinnerCook(o)}
                      title={
                        canStartFamilyDinnerCook(o)
                          ? undefined
                          : `Sẵn sàng sau giờ chốt nhận đơn${
                              bfCutoffTime ? ` (${bfCutoffTime})` : ""
                            }`
                      }
                      onClick={() => void action(o.id, "ready")}
                    >
                      {busy
                        ? "…"
                        : canStartFamilyDinnerCook(o)
                          ? "Sẵn sàng giao"
                          : `Sẵn sàng giao (sau ${bfCutoffTime ?? "giờ chốt"})`}
                    </button>
                  ) : null}
                  {cookFirst &&
                  o.status === "PROVIDER_ACCEPTED" &&
                  !isDaypartMenuOrder(o.orderKind) ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{
                        width: "auto",
                        padding: "8px 12px",
                        opacity: canStartFamilyDinnerCook(o) ? 1 : 0.45,
                      }}
                      disabled={busy || !canStartFamilyDinnerCook(o)}
                      title={
                        canStartFamilyDinnerCook(o)
                          ? undefined
                          : `Bắt đầu nấu sau giờ chốt nhận đơn${
                              fdCutoffTime ? ` (${fdCutoffTime})` : ""
                            }`
                      }
                      onClick={() => void action(o.id, "preparing")}
                    >
                      {busy
                        ? "…"
                        : canStartFamilyDinnerCook(o)
                          ? "Bắt đầu nấu"
                          : `Bắt đầu nấu (sau ${fdCutoffTime ?? "giờ chốt"})`}
                    </button>
                  ) : null}
                  {waitingRunner && o.serviceVertical !== "LAUNDRY" && !cookFirst ? (
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
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "cancel_find_runner")}
                      >
                        {busy ? "…" : "Hủy tìm runner"}
                      </button>
                    </>
                  ) : null}
                  {o.serviceVertical !== "LAUNDRY" && !cookFirst && o.status === "RUNNER_ASSIGNED" ? (
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
                  {(cookFirst || marketPack) && o.status === "READY" && !o.runner && !o.runnerUserId && !sought ? (
                    <>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy || o.scheduledPrepareOpen === false}
                        onClick={() => void action(o.id, "find_runner")}
                      >
                        {busy
                          ? "…"
                          : o.scheduledPrepareOpen === false
                            ? "Chưa tới giờ tìm runner"
                            : `Tìm runner${(o.runnerFeeVnd ?? 0) > 0 ? ` · ${formatVnd(o.runnerFeeVnd ?? 0)}` : ""}`}
                      </button>
                      {cookFirst ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary"
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
                            onClick={() => void action(o.id, "customer_pickup")}
                          >
                            {busy ? "…" : "Khách lấy tại quán"}
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {cookFirst && waitingRunner ? (
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
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "cancel_find_runner")}
                      >
                        {busy ? "…" : "Hủy tìm runner"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "staff_deliver")}
                      >
                        {busy ? "…" : "Tự giao"}
                      </button>
                    </>
                  ) : null}
                  {cookFirst && o.status === "DELIVERING" && !o.runnerUserId && !o.runner ? (
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
