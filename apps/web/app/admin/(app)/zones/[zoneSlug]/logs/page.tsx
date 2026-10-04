"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export default function AdminAuditPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    void api<{ logs: AuditLog[] }>(`/admin/zones/${slug}/logs?limit=50`).then((res) => setLogs(res.logs));
  }, [slug]);

  return (
    <AdminPageShell title="Nhật ký khu vực">
      <div className="card">
        <p className="section-title">Hoạt động Ops gần đây</p>
        {logs.length === 0 ? (
          <p className="stat">Chưa có bản ghi.</p>
        ) : (
          logs.map((log) => (
            <article key={log.id} className="provider-card" style={{ marginBottom: 12 }}>
              <strong>{log.action}</strong> · {log.entityType}
              <p className="stat" style={{ margin: "4px 0" }}>
                {log.actorName} · {new Date(log.createdAt).toLocaleString("vi-VN")}
              </p>
              {log.entityId ? (
                <p className="stat" style={{ margin: 0, fontSize: 13 }}>
                  Entity: {log.entityId}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}
