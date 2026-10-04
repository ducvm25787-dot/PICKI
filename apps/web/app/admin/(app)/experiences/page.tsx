"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageShell, canSeeCityContent, useAdminSession } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";
import { formatOccurrence, priceLabel, type ExperienceCard } from "../../../../lib/experiences";

export default function AdminExperiencesPage() {
  const router = useRouter();
  const { session } = useAdminSession();
  const [rows, setRows] = useState<ExperienceCard[]>([]);
  const [status, setStatus] = useState("");
  const [tick, setTick] = useState(0);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    if (!canSeeCityContent(session)) {
      if (session.zones.length === 1) router.replace(`/admin/zones/${session.zones[0]!.slug}/overview`);
      else router.replace("/admin");
      return;
    }
    const query = status ? `?status=${status}` : "";
    void api<{ experiences: ExperienceCard[] }>(`/admin/experiences${query}`).then((res) =>
      setRows(res.experiences),
    );
  }, [router, session, status, tick]);

  async function remove(row: ExperienceCard) {
    if (!window.confirm(`Xóa “${row.title}” khỏi danh sách? Tổ chức không còn thấy bài này.`)) return;
    setRemoving(row.id);
    setNotice(null);
    try {
      await api(`/admin/experiences/${row.id}`, { method: "DELETE" });
      setTick((value) => value + 1);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Không xóa được");
    } finally {
      setRemoving(null);
    }
  }
  async function publish(id: string) {
    setPublishing(id);
    setNotice(null);
    try {
      await api(`/admin/experiences/${id}/publish`, { method: "POST" });
      setTick((value) => value + 1);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Không xuất bản được");
    } finally {
      setPublishing(null);
    }
  }

  return (
    <AdminPageShell title="Trải nghiệm">
      <div className="header-row" style={{ marginBottom: 12 }}>
        <p className="stat" style={{ margin: 0 }}>
          Draft từ Import nhanh. Xuất bản là bước riêng.
        </p>
        <Link href="/admin/experiences/import" className="btn" style={{ width: "auto" }}>
          Import nhanh
        </Link>
      </div>
      <div className="filter-chip-row">
        {[
          ["", "Tất cả"],
          ["DRAFT", "Draft"],
          ["PENDING", "Chờ duyệt"],
          ["PUBLISHED", "Đã xuất bản"],
          ["REJECTED", "Từ chối"],
        ].map(([value, label]) => (
          <button
            key={value || "all"}
            type="button"
            className={status === value ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setStatus(value ?? "")}
          >
            {label}
          </button>
        ))}
      </div>
      {notice ? <p style={{ color: "crimson" }}>{notice}</p> : null}
      <div className="card">
        {rows.length === 0 ? (
          <p className="stat">Chưa có trải nghiệm.</p>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="provider-card" style={{ marginBottom: 12 }}>
              <strong>{row.title}</strong>
              {row.city ? <p className="stat">{row.city.label}</p> : null}
              <p className="stat">
                {row.status} · {priceLabel(row)} · {row.venue.name}
              </p>
              {row.occurrences[0] ? (
                <p className="stat">{formatOccurrence(row.occurrences[0].startAt)}</p>
              ) : null}
              <div className="experience-import-actions">
                <Link href={`/admin/experiences/${row.id}`}>Xem và duyệt</Link>
                {row.status === "REJECTED" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={removing === row.id}
                    onClick={() => void remove(row)}
                  >
                    Xóa
                  </button>
                ) : null}
                {row.status === "DRAFT" || row.status === "PENDING" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={publishing === row.id}
                    onClick={() => void publish(row.id)}
                  >
                    Xuất bản
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </AdminPageShell>
  );
}
