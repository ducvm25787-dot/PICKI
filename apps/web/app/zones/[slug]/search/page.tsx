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
  freshnessLabel?: string | null;
  promotionLabel?: string | null;
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

const OPEN_STATUSES = new Set(["OPEN", "AVAILABLE_NOW", "BUSY", "SHORT_WAIT"]);

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = fold(query.trim());
  if (!text || q.length < 2) return <>{text}</>;
  const chars = [...text];
  let folded = "";
  const starts: number[] = [];
  for (const ch of chars) {
    starts.push(folded.length);
    folded += fold(ch);
  }
  const idx = folded.indexOf(q);
  if (idx < 0) return <>{text}</>;
  let start = 0;
  let end = chars.length;
  for (let i = 0; i < chars.length; i++) {
    const from = starts[i] ?? 0;
    const to = i + 1 < chars.length ? (starts[i + 1] ?? folded.length) : folded.length;
    if (from <= idx && idx < to) start = i;
    if (from < idx + q.length && idx + q.length <= to) {
      end = i + 1;
      break;
    }
  }
  return (
    <>
      {chars.slice(0, start).join("")}
      <mark className="search-mark">{chars.slice(start, end).join("")}</mark>
      {chars.slice(end).join("")}
    </>
  );
}

function hitVisible(hit: SearchHit, openOnly: boolean, familiarOnly: boolean): boolean {
  if (hit.kind === "category") return !openOnly && !familiarOnly;
  if (openOnly && !OPEN_STATUSES.has(hit.liveStatus ?? "")) return false;
  if (familiarOnly && !hit.familiar) return false;
  return true;
}

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
  const [openOnly, setOpenOnly] = useState(false);
  const [familiarOnly, setFamiliarOnly] = useState(false);
  const seqRef = useRef(0);
  const authedRef = useRef(false);
  const skipUrlWrite = useRef(true);

  useEffect(() => {
    setRecent(loadRecent());
    inputRef.current?.focus();
    const initial = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
    if (initial) setQ(initial);
    else skipUrlWrite.current = false;
  }, []);

  useEffect(() => {
    if (skipUrlWrite.current) {
      if (q.trim()) skipUrlWrite.current = false;
      return;
    }
    const query = q.trim();
    const path = `/zones/${params.slug}/search`;
    router.replace(query ? `${path}?q=${encodeURIComponent(query)}` : path, { scroll: false });
  }, [q, params.slug, router]);

  const runSearch = useCallback(
    async (raw: string, opts?: { saveRecent?: boolean }) => {
      const query = raw.trim();
      if (query.length < 2) return;
      const seq = ++seqRef.current;
      setLoading(true);
      setSearched(true);
      if (opts?.saveRecent) {
        saveRecent(query);
        setRecent(loadRecent());
        track("search_submit", {
          properties: { slug: params.slug, q: query.slice(0, 80) },
        });
      }
      try {
        if (!authedRef.current) {
          await api("/me");
          authedRef.current = true;
        }
        const res = await api<{ groups: SearchGroup[]; zeroResult: boolean }>(
          `/zones/${params.slug}/search?q=${encodeURIComponent(query)}`,
        );
        if (seq !== seqRef.current) return;
        setGroups(res.groups ?? []);
        setZeroResult(
          Boolean(res.zeroResult) || (res.groups?.every((g) => g.results.length === 0) ?? true),
        );
      } catch (err) {
        if (seq !== seqRef.current) return;
        const message = err instanceof Error ? err.message : "";
        if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
          router.replace("/login");
        }
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [params.slug, router],
  );

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      seqRef.current += 1;
      if (!query) {
        setGroups([]);
        setZeroResult(false);
        setSearched(false);
        setLoading(false);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [q, runSearch]);

  const showIdle = !searched && !loading;
  const cats = homeCategoriesPrimary();
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      results: g.results.filter((r) => hitVisible(r, openOnly, familiarOnly)),
    }))
    .filter((g) => g.results.length > 0);
  const filteredEmpty = searched && !zeroResult && !loading && visibleGroups.length === 0;
  const pinIds = [
    ...new Set(
      visibleGroups
        .flatMap((g) => g.results)
        .map((r) => r.locationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, 40);
  const mapQuery = new URLSearchParams();
  if (pinIds[0]) mapQuery.set("locationId", pinIds[0]);
  if (pinIds.length > 0) mapQuery.set("ids", pinIds.join(","));
  if (openOnly) mapQuery.set("open", "1");
  const mapQs = mapQuery.toString();
  const mapHref = `/zones/${params.slug}/map${mapQs ? `?${mapQs}` : ""}`;

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
              if (e.key === "Enter") void runSearch(q, { saveRecent: true });
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
            onClick={() => void runSearch(q, { saveRecent: true })}
          >
            {loading ? "…" : "Tìm"}
          </button>
        </div>
        <p className="stat" style={{ margin: "8px 0 0" }}>
          Kim Văn – Kim Lũ
          {loading ? " · đang tìm…" : ""}
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
                    onClick={() => {
                      setQ(r);
                      void runSearch(r, { saveRecent: true });
                    }}
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
                  onClick={() => {
                    setQ(s);
                    void runSearch(s, { saveRecent: true });
                  }}
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
              <button
                key={s}
                type="button"
                className="filter-chip"
                onClick={() => {
                  setQ(s);
                  void runSearch(s, { saveRecent: true });
                }}
              >
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

      {searched && !zeroResult ? (
        <div className="filter-chip-row" style={{ margin: "4px 0 0", padding: 0 }}>
          <button
            type="button"
            className={openOnly ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setOpenOnly((v) => !v)}
          >
            Đang mở
          </button>
          <button
            type="button"
            className={familiarOnly ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setFamiliarOnly((v) => !v)}
          >
            Chỗ quen
          </button>
          <Link href={mapHref} className="filter-chip" style={{ textDecoration: "none" }}>
            Xem trên bản đồ
          </Link>
        </div>
      ) : null}

      {loading && visibleGroups.length === 0 && !zeroResult ? (
        <div className="explore-skeleton" aria-busy="true" aria-label="Đang tìm">
          <div className="explore-skeleton-row" />
          <div className="explore-skeleton-row" />
          <div className="explore-skeleton-row" />
        </div>
      ) : null}

      {filteredEmpty ? (
        <p className="stat" style={{ marginTop: 12 }}>
          Không còn kết quả với bộ lọc này.
        </p>
      ) : null}

      {visibleGroups.map((g) => (
          <div key={g.id} className="card" style={{ marginTop: 16 }}>
            <p className="section-title">{g.title}</p>
            {g.results.map((r, idx) => {
              const href =
                r.href ??
                (r.locationId ? `/locations/${r.locationId}` : `/zones/${params.slug}`);
              return (
                <div
                  key={`${g.id}-${r.kind}-${r.locationId ?? "x"}-${r.itemName ?? ""}-${String(idx)}`}
                  className="provider-card provider-card--compact"
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
                        <strong>
                          <Highlight text={r.itemName ?? r.brandName ?? ""} query={q} />
                        </strong>
                        <p className="stat" style={{ margin: "4px 0 0" }}>
                          Danh mục
                        </p>
                      </>
                    ) : r.kind === "provider" ? (
                      <div className="search-hit-provider">
                        <strong>
                          <Highlight text={r.brandName ?? ""} query={q} />
                        </strong>
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
                          {r.freshnessLabel ? ` · ${r.freshnessLabel}` : ""}
                          {r.promotionLabel ? ` · ${r.promotionLabel}` : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="search-hit-item">
                        <strong>
                          <Highlight text={r.itemName ?? ""} query={q} />
                        </strong>
                        {r.amountVnd != null ? ` · ${formatVnd(r.amountVnd)}` : ""}
                        <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                          <Highlight text={r.brandName ?? ""} query={q} />
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
      ))}
    </div>
  );
}
