"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { track } from "../../../../lib/analytics";
import { homeCategoriesPrimary } from "../../../../lib/categories";
import { formatVnd } from "../../../../lib/money";
import { liveStatusLabel } from "../../../../lib/providers";
import { IconSearch } from "../../../components/nav-icons";

type SearchHit = {
  kind: string;
  locationId: string | null;
  brandName: string | null;
  displayName: string | null;
  liveStatus: string | null;
  itemName: string | null;
  itemSubtitle: string | null;
  amountVnd: number | null;
  href: string | null;
  lat?: number | null;
  lng?: number | null;
  familiar?: boolean;
};

type SearchGroup = {
  id: string;
  title: string;
  results: SearchHit[];
};

const RECENT_KEY = "pickee.search.recent.v1";
const MAX_RECENT = 8;

const SUGGESTIONS = [
  "phở",
  "cơm",
  "cắt tóc",
  "giặt",
  "thuốc",
  "sữa",
  "điện nước",
  "xe đưa đón",
];

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  const next = [q, ...loadRecent().filter((x) => x !== q)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export default function ZoneSearchPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [zeroResult, setZeroResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    async (raw: string) => {
      const query = raw.trim();
      if (!query) return;
      setQ(query);
      setLoading(true);
      setSearched(true);
      try {
        await api("/me");
        const res = await api<{ groups: SearchGroup[]; zeroResult: boolean }>(
          `/zones/${params.slug}/search?q=${encodeURIComponent(query)}`,
        );
        setGroups(res.groups ?? []);
        setZeroResult(
          Boolean(res.zeroResult) || (res.groups?.every((g) => g.results.length === 0) ?? true),
        );
        saveRecent(query);
        setRecent(loadRecent());
        track("search_submit", {
          properties: { slug: params.slug, q: query.slice(0, 80) },
        });
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    },
    [params.slug, router],
  );

  const showIdle = !searched && !loading;
  const cats = homeCategoriesPrimary();

  return (
    <div className="container search-page">
      <div className="search-sticky">
        <div className="search-bar">
          <span className="search-bar-icon" aria-hidden>
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Món, quán, dịch vụ quanh Zone…"
            aria-label="Tìm quanh Zone"
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(q);
            }}
          />
          {q ? (
            <button
              type="button"
              className="search-bar-clear"
              aria-label="Xóa"
              onClick={() => {
                setQ("");
                setGroups([]);
                setZeroResult(false);
                setSearched(false);
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          ) : null}
          <button
            type="button"
            className="search-bar-go"
            disabled={loading || !q.trim()}
            onClick={() => void runSearch(q)}
          >
            {loading ? "…" : "Tìm"}
          </button>
        </div>
        <p className="stat" style={{ margin: "8px 0 0" }}>
          Kim Văn – Kim Lũ ·{" "}
          <Link href={`/zones/${params.slug}/map`}>Xem bản đồ</Link>
        </p>
      </div>

      {showIdle ? (
        <div className="search-idle">
          {recent.length > 0 ? (
            <section aria-label="Tìm gần đây">
              <p className="section-title" style={{ marginBottom: 8 }}>
                Gần đây
              </p>
              <div className="filter-chip-row" style={{ margin: "0 0 16px", padding: 0 }}>
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="filter-chip"
                    onClick={() => void runSearch(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-label="Gợi ý nhanh">
            <p className="section-title" style={{ marginBottom: 8 }}>
              Thử tìm
            </p>
            <div className="filter-chip-row" style={{ margin: "0 0 16px", padding: 0 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="filter-chip"
                  onClick={() => void runSearch(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Danh mục">
            <p className="section-title" style={{ marginBottom: 10 }}>
              Duyệt theo danh mục
            </p>
            <div className="utility-grid utility-grid--compact">
              {cats.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/zones/${params.slug}/browse/${cat.id}`}
                  className="utility-tile"
                >
                  <span className="utility-tile-emoji" aria-hidden>
                    {cat.emoji}
                  </span>
                  <span className="utility-tile-label">{cat.shortLabel}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {searched && zeroResult ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Không thấy đúng thứ bạn cần</p>
          <p className="stat">Thử từ khóa khác (có/không dấu) hoặc mở danh mục.</p>
          <div className="filter-chip-row" style={{ margin: "10px 0 0", padding: 0 }}>
            {SUGGESTIONS.slice(0, 4).map((s) => (
              <button key={s} type="button" className="filter-chip" onClick={() => void runSearch(s)}>
                {s}
              </button>
            ))}
          </div>
          <Link
            href={`/zones/${params.slug}/browse/food`}
            className="order-phone-link"
            style={{ display: "inline-block", marginTop: 12 }}
          >
            Xem Ăn uống →
          </Link>
        </div>
      ) : null}

      {groups.map((g) =>
        g.results.length === 0 ? null : (
          <div key={g.id} className="card" style={{ marginTop: 16 }}>
            <p className="section-title">{g.title}</p>
            {g.results.map((r, idx) => {
              const href =
                r.href ??
                (r.locationId ? `/locations/${r.locationId}` : `/zones/${params.slug}`);
              return (
                <div
                  key={`${g.id}-${r.kind}-${r.locationId ?? "x"}-${r.itemName ?? ""}-${String(idx)}`}
                  className={
                    r.kind === "provider"
                      ? "provider-card provider-card--compact"
                      : "provider-card"
                  }
                  style={{ marginBottom: 10 }}
                >
                  <Link
                    href={href}
                    style={{ textDecoration: "none", color: "inherit" }}
                    onClick={() =>
                      track("search_result_click", {
                        properties: {
                          slug: params.slug,
                          kind: r.kind,
                          locationId: r.locationId,
                          groupId: g.id,
                          q: q.trim().slice(0, 80),
                        },
                      })
                    }
                  >
                    {r.kind === "category" ? (
                      <>
                        <strong>{r.itemName ?? r.brandName}</strong>
                        <p className="stat" style={{ margin: "4px 0 0" }}>
                          Danh mục
                        </p>
                      </>
                    ) : r.kind === "provider" ? (
                      <div className="search-hit-provider">
                        <strong>{r.brandName}</strong>
                        <p className="provider-card-compact-status" style={{ marginTop: 4 }}>
                          <span
                            className={`live-dot ${
                              r.liveStatus === "OPEN"
                                ? "live-open"
                                : r.liveStatus === "BUSY"
                                  ? "live-busy"
                                  : "live-closed"
                            }`}
                            aria-hidden
                          />
                          {r.liveStatus ? liveStatusLabel(r.liveStatus) : "Quán"}
                          {r.familiar ? " · Chỗ quen" : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="search-hit-item">
                        <strong>{r.itemName}</strong>
                        {r.amountVnd != null ? ` · ${formatVnd(r.amountVnd)}` : ""}
                        <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                          {r.brandName}
                          {r.liveStatus ? ` · ${liveStatusLabel(r.liveStatus)}` : ""}
                        </p>
                        {r.itemSubtitle ? (
                          <p className="stat" style={{ margin: "2px 0 0" }}>
                            {r.itemSubtitle}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </Link>
                </div>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}
