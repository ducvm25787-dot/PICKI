"use client";

import { RunnerPageShell, useRunnerSession } from "../../../components/runner-session-context";

function presenceLabel(status: string): string {
  if (status === "AVAILABLE") return "Sẵn sàng nhận đơn";
  if (status === "OFFLINE") return "Offline";
  return status;
}

export default function RunnerStatusPage() {
  const { presence, setPresenceStatus } = useRunnerSession();

  return (
    <RunnerPageShell title="Trạng thái">
      <div className="card">
        <p className="section-title">Presence</p>
        <p style={{ margin: "0 0 16px" }}>
          Hiện tại: <strong>{presenceLabel(presence)}</strong>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={presence === "AVAILABLE" ? "btn runner-btn" : "btn btn-secondary"}
            style={{ width: "auto", padding: "10px 16px", flex: "1 1 40%" }}
            onClick={() => void setPresenceStatus("AVAILABLE")}
          >
            Sẵn sàng
          </button>
          <button
            type="button"
            className={presence === "OFFLINE" ? "btn runner-btn" : "btn btn-secondary"}
            style={{ width: "auto", padding: "10px 16px", flex: "1 1 40%" }}
            onClick={() => void setPresenceStatus("OFFLINE")}
          >
            Offline
          </button>
        </div>
        <p className="stat" style={{ marginTop: 16, marginBottom: 0 }}>
          Bật Sẵn sàng trước khi nhận đơn giao.
        </p>
      </div>
    </RunnerPageShell>
  );
}
