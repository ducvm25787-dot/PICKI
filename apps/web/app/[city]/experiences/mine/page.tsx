"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { api } from "../../../../lib/api";
import {
  experienceApi,
  experienceHref,
  formatOccurrence,
  type ExperienceCard,
} from "../../../../lib/experiences";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  PUBLISHED: "Đã xuất bản",
  REJECTED: "Bị từ chối",
  EXPIRED: "Hết hạn",
};

export default function MyExperiencesPage() {
  const router = useRouter();
  const params = useParams<{ city: string }>();
  const [rows, setRows] = useState<ExperienceCard[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    void api<{ experiences: ExperienceCard[] }>(experienceApi(params.city, "/mine"))
      .then((res) => setRows(res.experiences))
      .catch(() => router.replace("/login"));
  }

  useEffect(() => {
    reload();
  }, [params.city, router]);

  async function remove(row: ExperienceCard) {
    if (!window.confirm(`Xóa “${row.title}”? Bài bị từ chối sẽ không còn trong danh sách.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await api(experienceApi(params.city, `/submissions/${row.id}`), { method: "DELETE" });
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xóa được");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container">
      <div className="header-row">
        <BrandMark subtitle="Đơn vị tổ chức" />
      </div>
      <p className="stat">
        <Link href="/me">← Tôi</Link>
      </p>
      <h1 className="section-title">Bài của tôi</h1>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <Link href={experienceHref(params.city, "/submit")} className="btn">
        Đăng trải nghiệm
      </Link>
      {rows.length === 0 ? <p className="stat">Chưa có bài nào.</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="card experience-card">
          <strong>{row.title}</strong>
          <span className="stat">{STATUS_LABEL[row.status] ?? row.status}</span>
          {row.occurrences[0] ? <span className="stat">{formatOccurrence(row.occurrences[0].startAt)}</span> : null}
          {row.status === "PENDING" || row.status === "REJECTED" ? (
            <Link href={`${experienceHref(params.city, "/submit")}?id=${row.id}`}>Sửa và gửi lại</Link>
          ) : null}
          {row.status === "REJECTED" ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyId === row.id}
              onClick={() => void remove(row)}
            >
              Xóa bài
            </button>
          ) : null}
          {row.status === "PUBLISHED" ? (
            <Link href={experienceHref(params.city, `/${row.id}`)}>Xem trang khách</Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}
