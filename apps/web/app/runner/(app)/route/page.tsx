"use client";

import { useEffect } from "react";
import {
  RunnerPageShell,
  lobbyStatusLabel,
  useRunnerSession,
} from "../../../components/runner-session-context";
import { api } from "../../../../lib/api";

export default function RunnerRoutePage() {
  const { route, refresh } = useRunnerSession();

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function completeStop(stopId: string) {
    await api(`/runner/route/stops/${stopId}`, { method: "PATCH" });
    await refresh();
  }

  async function arriveLobby(stopId: string) {
    await api(`/runner/route/stops/${stopId}/arrive`, { method: "PATCH" });
    await refresh();
  }

  async function lobbyAction(stopId: string, orderId: string, action: string) {
    await api(`/runner/route/stops/${stopId}/lobby/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    await refresh();
  }

  const nextStop = route?.stops.find((s) => s.status === "PENDING" || s.status === "ARRIVED");

  return (
    <RunnerPageShell title="Route · lobby handoff">
      <div className="card">
        {!route || route.stops.length === 0 ? (
          <p className="stat">Chưa có route active. Nhận đơn ở tab Đơn.</p>
        ) : (
          <>
            <p className="section-title">
              {route.orderCount} đơn · {route.status}
            </p>
            {route.stops.map((s) => (
              <article key={s.id} className="provider-card" style={{ marginBottom: 12 }}>
                <strong>
                  {s.sequence}. {s.label}
                </strong>
                <p className="stat">
                  {s.stopType} ·{" "}
                  {s.status === "COMPLETED"
                    ? "✓ Xong"
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
                    onClick={() =>
                      void (s.stopType === "LOBBY_DROPOFF" || s.stopType === "PICKI_POINT"
                        ? arriveLobby(s.id)
                        : completeStop(s.id))
                    }
                  >
                    {s.stopType === "LOBBY_DROPOFF" || s.stopType === "PICKI_POINT"
                      ? "Đã đến sảnh"
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
