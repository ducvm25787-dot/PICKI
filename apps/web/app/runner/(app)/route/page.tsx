"use client";

import { useEffect, useState } from "react";
import {
  RunnerPageShell,
  lobbyStatusLabel,
  useRunnerSession,
  type RunnerOrder,
} from "../../../components/runner-session-context";
import { api } from "../../../../lib/api";

function pickupBlockReason(mine: RunnerOrder[]): string | null {
  const active = mine.filter(
    (o) => o.assignedToMe && !["PICKED_UP", "DELIVERING", "DELIVERED"].includes(o.status),
  );
  if (active.length === 0) return null;
  if (active.some((o) => o.status === "RUNNER_ASSIGNED" || o.status === "PREPARING")) {
    return "Chưa hết đơn sẵn sàng — chờ quán nấu và bàn giao cho runner";
  }
  if (active.some((o) => o.status === "READY" && !o.providerHandoffAt)) {
    return "Chờ quán bấm 'Đã giao cho runner'";
  }
  return null;
}

export default function RunnerRoutePage() {
  const { route, mine, refresh } = useRunnerSession();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function completeStop(stopId: string) {
    setActionError(null);
    try {
      await api(`/runner/route/stops/${stopId}`, { method: "PATCH" });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không thực hiện được");
    }
  }

  async function arriveLobby(stopId: string) {
    setActionError(null);
    try {
      await api(`/runner/route/stops/${stopId}/arrive`, { method: "PATCH" });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không thực hiện được");
    }
  }

  async function lobbyAction(stopId: string, orderId: string, action: string) {
    setActionError(null);
    try {
      await api(`/runner/route/stops/${stopId}/lobby/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không thực hiện được");
    }
  }

  const nextStop = route?.stops.find((s) => s.status === "PENDING" || s.status === "ARRIVED");
  const pickupBlocked =
    nextStop?.stopType === "PICKUP" ? pickupBlockReason(mine) : null;

  return (
    <RunnerPageShell title="Tiến trình giao hàng">
      <div className="card">
        {!route || route.stops.length === 0 ? (
          <p className="stat">Chưa có tiến trình active. Nhận đơn ở tab Đơn.</p>
        ) : (
          <>
            <p className="section-title">
              {route.orderCount} đơn · {route.status}
            </p>
            {pickupBlocked ? (
              <p className="stat" style={{ marginBottom: 12, color: "var(--warn, #b45309)" }}>
                {pickupBlocked}
              </p>
            ) : null}
            {actionError ? (
              <p className="stat" style={{ marginBottom: 12, color: "var(--danger, #dc2626)" }}>
                {actionError}
              </p>
            ) : null}
            {route.stops.map((s) => (
              <article key={s.id} className="provider-card" style={{ marginBottom: 12 }}>
                <strong>
                  {s.sequence}. {s.label}
                </strong>
                <p className="stat">
                  {s.stopType} ·{" "}
                  {s.status === "COMPLETED"
                    ? "✓ Xong"
                    : s.status === "SKIPPED"
                      ? "Bỏ qua (đã giao sảnh)"
                      : s.status === "ARRIVED"
                        ? "Đã đến sảnh"
                        : "Chờ"}
                </p>
                {s.handoffs?.map((h) => (
                  <div key={h.orderId} style={{ marginTop: 8, fontSize: 14 }}>
                    <strong>{h.orderNumber}</strong> · {h.apartment ?? "—"} ·{" "}
                    {lobbyStatusLabel(h.customerStatus)}
                    {s.status === "ARRIVED" &&
                    h.customerStatus !== "RECEIVED" &&
                    h.customerStatus !== "NO_RESPONSE" ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn runner-btn"
                          style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                          onClick={() => void lobbyAction(s.id, h.orderId, "received")}
                        >
                          Đã giao
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                          onClick={() => void lobbyAction(s.id, h.orderId, "no_response")}
                        >
                          Không phản hồi
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {s.status === "PENDING" && nextStop?.id === s.id ? (
                  <button
                    type="button"
                    className="btn runner-btn"
                    style={{ width: "auto", padding: "8px 12px", marginTop: 8 }}
                    disabled={s.stopType === "PICKUP" && Boolean(pickupBlocked)}
                    onClick={() =>
                      void (s.stopType === "LOBBY_DROPOFF" || s.stopType === "PICKI_POINT"
                        ? arriveLobby(s.id)
                        : completeStop(s.id))
                    }
                  >
                    {s.stopType === "LOBBY_DROPOFF" || s.stopType === "PICKI_POINT"
                      ? "Đã đến sảnh"
                      : s.stopType === "PICKUP"
                        ? "Đã lấy hàng tại quán"
                        : "Hoàn thành"}
                  </button>
                ) : null}
                {s.status === "ARRIVED" && nextStop?.id === s.id ? (
                  <button
                    type="button"
                    className="btn runner-btn"
                    style={{ width: "auto", padding: "8px 12px", marginTop: 8 }}
                    onClick={() => void completeStop(s.id)}
                  >
                    Hoàn thành điểm sảnh
                  </button>
                ) : null}
              </article>
            ))}
          </>
        )}
      </div>
    </RunnerPageShell>
  );
}
