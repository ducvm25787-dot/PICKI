"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";
import { orderStatusLabel } from "../../../../../../lib/orders";

type Overview = {
  zone: { displayName: string; status: string };
  orders: { total: number; active: number; byStatus: { status: string; count: number }[] };
  members: number;
  providerLocations: number;
  activeRunners: number;
};

export default function ZoneOverviewPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Overview>(`/admin/zones/${slug}/overview`)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được khu vực"));
  }, [slug]);

  return (
    <AdminPageShell title={data?.zone.displayName ?? "Khu vực"}>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {data ? (
        <div className="card">
          <p className="section-title">{data.zone.status}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Stat label="Tài khoản" value={String(data.members)} />
            <Stat label="Quán" value={String(data.providerLocations)} />
            <Stat label="Tài xế đang chạy" value={String(data.activeRunners)} />
            <Stat label="Đơn đang xử lý" value={String(data.orders.active)} />
          </div>
          {data.orders.byStatus.map((row) => (
            <p key={row.status} className="stat" style={{ margin: "8px 0 0" }}>
              {orderStatusLabel(row.status)}: <strong>{row.count}</strong>
            </p>
          ))}
        </div>
      ) : (
        <p className="stat">Đang tải…</p>
      )}
    </AdminPageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="stat" style={{ margin: 0 }}>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
