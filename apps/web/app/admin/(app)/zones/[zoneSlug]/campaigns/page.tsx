"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";

type Board = {
  running: { campaignId: string; name: string; brandName: string; locationName: string; providerType: string }[];
  suppressed: { campaignId: string; name: string; brandName: string; locationId: string | null; reason: string }[];
};

export default function ZoneCampaignsPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    void api<Board>(`/admin/zones/${slug}/campaigns`)
      .then(setBoard)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được"));
  }

  useEffect(() => {
    reload();
  }, [slug]);

  return (
    <AdminPageShell title="Chương trình trong Zone">
      <h1 className="section-title">Chương trình đang chạy</h1>
      <p>Ẩn tại Zone không sửa giá, ảnh hay thời gian của chương trình.</p>
      {error ? <p className="card">{error}</p> : null}
      {board?.running.map((row) => (
        <article key={`${row.campaignId}:${row.locationName}`} className="card">
          <strong>{row.brandName}</strong>
          <p>{row.name} · {row.locationName} · {row.providerType}</p>
          <button
            type="button"
            onClick={() => {
              const reason = window.prompt("Lý do ẩn tại Zone");
              if (!reason) return;
              void api(`/admin/zones/${slug}/campaigns/${row.campaignId}/suppress`, {
                method: "POST",
                body: JSON.stringify({ reason }),
              }).then(reload);
            }}
          >
            Ẩn tại Zone
          </button>
        </article>
      ))}
      {board?.suppressed.map((row) => (
        <article key={`${row.campaignId}:${row.locationId ?? "zone"}`} className="card">
          <p>Đang ẩn: {row.brandName} · {row.name}. {row.reason}</p>
          <button
            type="button"
            onClick={() => void api(`/admin/zones/${slug}/campaigns/${row.campaignId}/unsuppress`, {
              method: "POST",
              body: JSON.stringify({ locationId: row.locationId }),
            }).then(reload)}
          >
            Hiện lại
          </button>
        </article>
      ))}
    </AdminPageShell>
  );
}
