"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPageShell, useAdminSession } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";

type AdminZone = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  memberCount: number;
  providerLocationCount: number;
};

export default function AdminZonesPage() {
  const { session } = useAdminSession();
  const [zones, setZones] = useState<AdminZone[]>([]);

  useEffect(() => {
    void api<{ zones: AdminZone[] }>("/admin/zones").then((res) => setZones(res.zones));
  }, []);

  return (
    <AdminPageShell title="Khu vực">
      <p className="stat" style={{ marginBottom: 12 }}>
        Tạo và sửa ranh giới khu vực. Vận hành đơn, quán, tài xế nằm trong từng khu.
      </p>
      <div className="card">
        {zones.length === 0 ? (
          <p className="stat">Chưa có Zone.</p>
        ) : (
          zones.map((z) => (
            <article key={z.id} className="provider-card" style={{ marginBottom: 12 }}>
              <strong>{z.displayName}</strong>
              <p className="stat">
                {z.slug} · {z.status}
              </p>
              <p className="stat">
                {z.memberCount} members · {z.providerLocationCount} quán
              </p>
              <Link
                href={`/admin/zones/${z.slug}/overview`}
                className="order-phone-link"
                style={{ marginTop: 8, display: "inline-flex" }}
              >
                Vào vận hành
              </Link>
              {session?.superAdmin ? (
                <Link
                  href={`/admin/zones/${z.slug}/map`}
                  className="order-phone-link"
                  style={{ marginTop: 8, marginLeft: 12, display: "inline-flex" }}
                >
                  Bản đồ
                </Link>
              ) : null}
            </article>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}
