"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageShell, useAdminSession } from "../../components/admin-session-context";
import { api } from "../../../lib/api";

type Dashboard = {
  orders: { total: number; active: number };
  members: number;
  providerLocations: number;
  activeRunners: number;
};

type ZoneRow = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  memberCount: number;
  providerLocationCount: number;
  runnerCount: number;
  orderCount: number;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { session } = useAdminSession();
  const [data, setData] = useState<Dashboard | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);

  useEffect(() => {
    if (!session) return;
    if (!session.superAdmin && !session.supportReadOnlyGlobal) {
      if (session.zones.length === 1 && session.cities.length === 0) {
        router.replace(`/admin/zones/${session.zones[0]!.slug}/overview`);
      }
      return;
    }
    void api<Dashboard>("/admin/dashboard").then(setData);
    void api<{ zones: ZoneRow[] }>("/admin/zones").then((res) => setZones(res.zones));
  }, [router, session]);

  if (session && !session.superAdmin && !session.supportReadOnlyGlobal) {
    return (
      <AdminPageShell title={session.cities.length > 0 && session.zones.length === 0 ? "Thành phố" : "Chọn phạm vi"}>
        <div className="card">
          {session.cities.map((city) => (
            <p key={city.id}>
              {city.label}
              {" · "}
              <Link href="/admin/experiences">Trải nghiệm</Link>
              {" · "}
              <Link href="/admin/settings">Banner</Link>
            </p>
          ))}
          {session.zones.map((zone) => (
            <p key={zone.id}>
              <Link href={`/admin/zones/${zone.slug}/overview`}>{zone.displayName}</Link>
            </p>
          ))}
          {session.cities.length === 0 && session.zones.length === 0 ? (
            <p className="stat">Tài chính theo khu sẽ mở sau khi phạm vi vận hành đã khóa.</p>
          ) : null}
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="Tất cả khu vực">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Tổng quan</p>
        {data ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Stat label="Khu vực" value={String(zones.length)} />
            <Stat label="Đang hoạt động" value={String(zones.filter((zone) => zone.status === "ACTIVE" || zone.status === "PILOT").length)} />
            <Stat label="Tài khoản" value={String(data.members)} />
            <Stat label="Cơ sở" value={String(data.providerLocations)} />
            <Stat label="Đơn" value={String(data.orders.total)} />
            <Stat label="Tài xế đang chạy" value={String(data.activeRunners)} />
          </div>
        ) : (
          <p className="stat">Đang tải…</p>
        )}
      </div>
      <div className="card">
        <p className="section-title">Khu vực</p>
        {zones.map((zone) => (
          <article key={zone.id} className="provider-card" style={{ marginBottom: 12 }}>
            <strong>{zone.displayName}</strong>
            <p className="stat">
              {zone.status} · {zone.memberCount} tài khoản · {zone.providerLocationCount} quán · {zone.runnerCount} tài xế · {zone.orderCount} đơn
            </p>
            <Link href={`/admin/zones/${zone.slug}/overview`}>Vào khu vực</Link>
          </article>
        ))}
        <p className="stat" style={{ marginTop: 8 }}>
          <Link href="/admin/zones">Quản lý khu vực</Link>
        </p>
      </div>
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
