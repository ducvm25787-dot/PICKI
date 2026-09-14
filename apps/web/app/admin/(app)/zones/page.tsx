"use client";

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
            </article>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}
