"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPageShell } from "../../../components/admin-session-context";
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
  const [zones, setZones] = useState<AdminZone[]>([]);

  useEffect(() => {
    void api<{ zones: AdminZone[] }>("/admin/zones").then((res) => setZones(res.zones));
  }, []);

  return (
    <AdminPageShell title="Zones">
      <p className="stat" style={{ marginBottom: 12 }}>
        Setup quan trọng: chỉnh polygon, vùng lõi, neo GPS, xác nhận vị trí shop — mở từng Zone.
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
                href={`/admin/zones/${z.id}`}
                className="order-phone-link"
                style={{ marginTop: 8, display: "inline-flex" }}
              >
                Setup bản đồ (polygon · GPS · shop)
              </Link>
            </article>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}
