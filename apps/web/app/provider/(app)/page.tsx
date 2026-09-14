"use client";

import { useCallback, useEffect, useState } from "react";
import { OrderChat } from "../../components/order-chat";
import { ProviderPageShell, useProviderLocation } from "../../components/provider-location-context";
import { OrderStatusSteps } from "../../components/order-status-steps";
import { api } from "../../../lib/api";
import { orderStatusRich } from "../../../lib/order-display";
import { formatVnd } from "../../../lib/money";

type ProviderOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalVnd: number;
  estimatedReadyAt: string | null;
  providerHandoffAt: string | null;
  runnerSoughtAt: string | null;
  runnerUserId: string | null;
  runner: { displayName: string } | null;
  delivery: { building: string | null; apartment: string | null };
  items: { name: string; quantity: number }[];
};

function hasRunnerSought(order: ProviderOrder): boolean {
  return order.runnerSoughtAt != null && order.runnerSoughtAt !== "";
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
  const { locationId, locations } = useProviderLocation();
  const [orders, setOrders] = useState<ProviderOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

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

  useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => {
      void loadOrders();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  async function action(orderId: string, act: string) {
    setActionError(null);
    setActingId(orderId);

    const current = orders.find((o) => o.id === orderId);
    if (act === "preparing" && current && current.status !== "RUNNER_ASSIGNED") {
      setActionError("Runner phải nhận đơn trước — mở app Runner (0908888002) bấm Nhận giao.");
      return;
    }

    try {
      const res = await api<Partial<ProviderOrder>>(`/provider/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: act }),
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
      await loadOrders();
    } finally {
      setRefreshing(false);
    }
  }

  const handoffBatches = computeHandoffBatches(orders);

  return (
    <ProviderPageShell title="Đơn hàng">
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
          <p className="stat">Chưa có đơn mới.</p>
        ) : (
          orders.map((o) => {
            const sought = hasRunnerSought(o);
            const waitingRunner =
              o.status === "PROVIDER_ACCEPTED" && sought && !o.runnerUserId && !o.runner;
            const busy = actingId === o.id;
            const batch = handoffBatchForOrder(o, handoffBatches);

            return (
              <article key={o.id} className="provider-card" style={{ marginBottom: 12 }}>
                <strong>{o.orderNumber}</strong> · {formatVnd(o.totalVnd)}
                <p className="stat">
                  {orderStatusRich(o.status, {
                    estimatedReadyAt: o.estimatedReadyAt,
                    providerHandoffAt: o.providerHandoffAt,
                    runnerSoughtAt: o.runnerSoughtAt,
                    runner: o.runner,
                  })}
                </p>
                <OrderStatusSteps status={o.status} runnerSoughtAt={o.runnerSoughtAt} />
                {waitingRunner ? (
                  <div className="runner-route-hint" style={{ margin: "8px 0", fontSize: 14 }}>
                    <strong>Bước tiếp:</strong> Runner mở app{" "}
                    <strong>Picki Runner</strong> (0908888002) → tab <strong>Đơn chờ nhận</strong>{" "}
                    → bấm <strong>Nhận giao</strong>. Quán chưa nấu cho đến khi runner nhận.
                  </div>
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
                  {o.status === "CREATED" || o.status === "PAID" ? (
                    <>
                      <button
                        type="button"
                        className="btn provider-btn"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "accept")}
                      >
                        {busy ? "…" : "Nhận đơn & tìm runner"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: "auto", padding: "8px 12px" }}
                        disabled={busy}
                        onClick={() => void action(o.id, "reject")}
                      >
                        Từ chối
                      </button>
                    </>
                  ) : null}
                  {o.status === "PROVIDER_ACCEPTED" && !sought ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px" }}
                      disabled={busy}
                      onClick={() => void action(o.id, "find_runner")}
                    >
                      {busy ? "…" : "Tìm runner"}
                    </button>
                  ) : null}
                  {waitingRunner ? (
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
                  {o.status === "RUNNER_ASSIGNED" ? (
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
                  {o.status === "PREPARING" ? (
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
                  {o.status === "READY" && !o.providerHandoffAt && (o.runner || o.runnerUserId) ? (
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
                  {o.status === "READY" && o.providerHandoffAt ? (
                    <p className="stat" style={{ margin: 0 }}>
                      ✓ Đã giao — chờ runner xác nhận nhận hàng
                    </p>
                  ) : null}
                </div>
                <OrderChat orderId={o.id} compact />
              </article>
            );
          })
        )}
      </div>
    </ProviderPageShell>
  );
}
