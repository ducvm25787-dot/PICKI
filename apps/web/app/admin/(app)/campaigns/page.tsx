"use client";

import { useEffect, useState } from "react";
import { AdminPageShell } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";

type Campaign = {
  id: string;
  name: string;
  campaignType: string;
  brandName: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

export default function AdminCampaignQueuePage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    void api<{ campaigns: Campaign[] }>("/admin/campaigns")
      .then((data) => setRows(data.campaigns))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được"));
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <AdminPageShell title="Chương trình chuỗi">
      <h1 className="section-title">Chương trình chuỗi</h1>
      <p>Duyệt một lần cho cả phạm vi. Zone không duyệt lại.</p>
      {error ? <p className="card">{error}</p> : null}
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr><th>Chuỗi</th><th>Tên</th><th>Loại</th><th>Thời gian</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.brandName}</td>
                <td>{row.name}</td>
                <td>{row.campaignType}</td>
                <td>{new Date(row.startsAt).toLocaleString("vi-VN")} – {new Date(row.endsAt).toLocaleString("vi-VN")}</td>
                <td>
                  <button type="button" onClick={() => void api(`/admin/campaigns/${row.id}/approve`, { method: "POST" }).then(reload)}>Duyệt</button>
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt("Lý do từ chối");
                      if (!reason) return;
                      void api(`/admin/campaigns/${row.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }).then(reload);
                    }}
                  >
                    Từ chối
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPageShell>
  );
}
