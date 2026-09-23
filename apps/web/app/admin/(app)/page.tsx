"use client";

import { useEffect, useState } from "react";
import { AdminPageShell } from "../../components/admin-session-context";
import { api } from "../../../lib/api";

type Dashboard = {
  orders: { total: number; active: number; byStatus: { status: string; count: number }[] };
  members: number;
  providerLocations: number;
  activeRunners: number;
};

type AnalyticsSummary = {
  days: number;
  counts: { eventName: string; count: number }[];
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [habit, setHabit] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    void api<Dashboard>("/admin/dashboard").then(setData);
    void api<AnalyticsSummary>("/analytics/summary?days=7")
      .then(setHabit)
      .catch(() => setHabit(null));
  }, []);

  return (
    <AdminPageShell title="Dashboard pilot KVL">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Tổng quan</p>
        {data ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Stat label="Đơn (tổng)" value={String(data.orders.total)} />
            <Stat label="Đơn active" value={String(data.orders.active)} />
            <Stat label="Members" value={String(data.members)} />
            <Stat label="Quán" value={String(data.providerLocations)} />
            <Stat label="Runners" value={String(data.activeRunners)} />
          </div>
        ) : (
          <p className="stat">Đang tải…</p>
        )}
      </div>
      {data && data.orders.byStatus.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Đơn theo trạng thái</p>
          {data.orders.byStatus.map((s) => (
            <p key={s.status} className="stat" style={{ margin: "4px 0" }}>
              {s.status}: <strong>{s.count}</strong>
            </p>
          ))}
        </div>
      ) : null}
      <div className="card">
        <p className="section-title">Habit analytics (7 ngày)</p>
        {!habit ? (
          <p className="stat" style={{ margin: 0 }}>
            Chưa có dữ liệu / không tải được.
          </p>
        ) : habit.counts.length === 0 ? (
          <p className="stat" style={{ margin: 0 }}>
            Chưa ghi event — mở Home / tìm kiếm / đặt lại để sinh số liệu.
          </p>
        ) : (
          habit.counts.map((c) => (
            <p key={c.eventName} className="stat" style={{ margin: "4px 0" }}>
              {c.eventName}: <strong>{c.count}</strong>
            </p>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, background: "#f1f5f9", borderRadius: 10 }}>
      <p className="stat" style={{ margin: "0 0 4px" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{value}</p>
    </div>
  );
}
