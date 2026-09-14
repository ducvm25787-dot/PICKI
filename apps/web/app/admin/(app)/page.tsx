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

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    void api<Dashboard>("/admin/dashboard").then(setData);
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
        <div className="card">
          <p className="section-title">Đơn theo trạng thái</p>
          {data.orders.byStatus.map((s) => (
            <p key={s.status} className="stat" style={{ margin: "4px 0" }}>
              {s.status}: <strong>{s.count}</strong>
            </p>
          ))}
        </div>
      ) : null}
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
