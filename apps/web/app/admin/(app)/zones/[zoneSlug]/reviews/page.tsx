"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DISCOVERY_SURFACE_LABEL, type DiscoverySurface } from "@picki/shared";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";

type Reviews = {
  spotlights: {
    id: string;
    title: string;
    updateType: string;
    description: string | null;
    brandName: string;
    offeringName: string | null;
    imageUrl: string | null;
    promoPriceVnd: number | null;
    suggestedSurface: DiscoverySurface | null;
    categoryName: string | null;
    allowedSurfaces: DiscoverySurface[];
    createdAt: string;
  }[];
};

function surfaceLabel(value: string | null | undefined) {
  if (value && value in DISCOVERY_SURFACE_LABEL) {
    return DISCOVERY_SURFACE_LABEL[value as DiscoverySurface];
  }
  return "Chưa gợi ý";
}

export default function AdminReviewsPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const [data, setData] = useState<Reviews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [surfaceById, setSurfaceById] = useState<Record<string, DiscoverySurface>>({});

  const load = useCallback(async () => {
    setData(await api<Reviews>(`/admin/zones/${slug}/reviews`));
  }, [slug]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [load]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      setData(
        await api<Reviews>(path, {
          method: "POST",
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không duyệt được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageShell title="Duyệt">
      <h1 className="section-title">Duyệt</h1>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!data ? <p className="tagline">Đang tải…</p> : null}
      {data ? (
        <>
          <section>
            <h2 className="section-title">Bài trang chủ</h2>
            <p className="tagline">
              Quán chỉ đẩy món. Hệ thống gợi ý mục. Duyệt đúng mục, đổi mục Food, hoặc từ chối.
            </p>
            {data.spotlights.length === 0 ? (
              <p className="tagline">Không có bài chờ duyệt.</p>
            ) : (
              data.spotlights.map((row) => (
                <article key={row.id} className="card" style={{ marginBottom: 8 }}>
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.imageUrl}
                      alt=""
                      style={{
                        width: 120,
                        height: 120,
                        objectFit: "cover",
                        borderRadius: 12,
                        display: "block",
                        marginBottom: 8,
                      }}
                    />
                  ) : (
                    <p className="stat" style={{ marginTop: 0 }}>
                      Món này chưa có ảnh.
                    </p>
                  )}
                  <strong>{row.title}</strong>
                  <p style={{ margin: "4px 0 8px" }}>
                    {row.brandName}
                    {row.offeringName ? ` · ${row.offeringName}` : ""}
                    {row.categoryName ? ` · ${row.categoryName}` : ""}
                    {row.promoPriceVnd ? ` · ${row.promoPriceVnd.toLocaleString("vi-VN")}đ` : ""}
                  </p>
                  <p className="stat" style={{ marginTop: 0 }}>
                    Gợi ý: {surfaceLabel(row.suggestedSurface)}
                  </p>
                  {row.description ? <p className="stat">{row.description}</p> : null}
                  {row.allowedSurfaces.length > 1 ? (
                    <label className="field">
                      <span>Mục trên trang chủ</span>
                      <select
                        value={surfaceById[row.id] ?? row.suggestedSurface ?? row.allowedSurfaces[0]}
                        onChange={(event) =>
                          setSurfaceById((current) => ({
                            ...current,
                            [row.id]: event.target.value as DiscoverySurface,
                          }))
                        }
                      >
                        {row.allowedSurfaces.map((surface) => (
                          <option key={surface} value={surface}>
                            {surfaceLabel(surface)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="stat">Mục: {surfaceLabel(row.allowedSurfaces[0])}</p>
                  )}
                  <div className="board-row">
                    <button
                      type="button"
                      className="btn"
                      style={{ width: "auto" }}
                      disabled={busy}
                      onClick={() =>
                        void act(`/admin/zones/${slug}/reviews/spotlights/${row.id}/approve`, {
                          approvedSurface:
                            surfaceById[row.id] ?? row.suggestedSurface ?? row.allowedSurfaces[0],
                        })
                      }
                    >
                      Duyệt lên trang chủ
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto" }}
                      disabled={busy}
                      onClick={() => void act(`/admin/zones/${slug}/reviews/spotlights/${row.id}/reject`)}
                    >
                      Không duyệt
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      ) : null}
    </AdminPageShell>
  );
}
