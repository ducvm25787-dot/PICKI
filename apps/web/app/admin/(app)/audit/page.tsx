"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageShell, useAdminSession } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";

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
  const router = useRouter();
  const { session } = useAdminSession();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (!session) return;
    if (!session.superAdmin && !session.supportReadOnlyGlobal) {
      if (session.zones.length === 1) router.replace(`/admin/zones/${session.zones[0]!.slug}/logs`);
      else router.replace("/admin");
      return;
    }
    void api<{ logs: AuditLog[] }>("/admin/audit-logs?limit=50").then((res) => setLogs(res.logs));
  }, [router, session]);

  return (
    <AdminPageShell title="Nhật ký toàn hệ thống">
      <div className="card">
        <p className="section-title">Toàn hệ thống</p>
        <p className="stat">Zone admin chỉ thấy nhật ký có gắn khu vực, trong mục Nhật ký của khu đó.</p>
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
