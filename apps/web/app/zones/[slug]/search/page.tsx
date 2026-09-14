"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";
import { liveStatusLabel } from "../../../../lib/providers";

type SearchResult = {
  kind: string;
  locationId: string;
  brandName: string;
  displayName: string;
  liveStatus: string;
  offeringName: string | null;
  amountVnd: number | null;
};

export default function ZoneSearchPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      await api("/me");
      const res = await api<{ results: SearchResult[] }>(
        `/zones/${params.slug}/search?q=${encodeURIComponent(q.trim())}`,
      );
      setResults(res.results);
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <Link href="/" className="stat">
        ← Trang chủ
      </Link>
      <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Tìm trong Zone</h1>
      <div className="card">
        <div className="field">
          <label htmlFor="q">Tên quán, món…</label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="phở, cơm tấm, bún chả…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
          />
        </div>
        <button type="button" className="btn" disabled={loading} onClick={() => void search()}>
          {loading ? "Đang tìm…" : "Tìm"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">{results.length} kết quả</p>
          {results.map((r, idx) => (
            <Link
              key={`${r.kind}-${r.locationId}-${String(idx)}`}
              href={`/locations/${r.locationId}`}
              className="provider-card"
              style={{ display: "block", marginBottom: 10, textDecoration: "none", color: "inherit" }}
            >
              <strong>{r.brandName}</strong> · {liveStatusLabel(r.liveStatus)}
              {r.kind === "offering" && r.offeringName ? (
                <p style={{ margin: "4px 0 0" }}>
                  {r.offeringName}
                  {r.amountVnd != null ? ` · ${formatVnd(r.amountVnd)}` : ""}
                </p>
              ) : (
                <p className="stat" style={{ margin: "4px 0 0" }}>
                  {r.displayName}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
