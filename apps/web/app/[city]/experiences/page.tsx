"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandMark } from "../../components/brand-mark";
import { api } from "../../../lib/api";
import { track } from "../../../lib/analytics";
import {
  AUDIENCE_LABELS,
  CATEGORY_LABELS,
  audienceLine,
  experienceApi,
  experienceHref,
  formatOccurrence,
  priceLabel,
  type ExperienceCard,
  type ExperienceCityRef,
} from "../../../lib/experiences";

const WHEN = [
  ["today", "Hôm nay"],
  ["weekend", "Cuối tuần này"],
  ["next_week", "Tuần tới"],
  ["upcoming", "Sắp tới"],
] as const;

const PRICE = [
  ["", "Mọi giá"],
  ["free", "Miễn phí"],
  ["under_200", "< 200k"],
  ["mid", "200–500k"],
  ["high", "500k+"],
] as const;

export default function HanoiExperiencesPage() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <p className="tagline">Đang tải…</p>
        </div>
      }
    >
      <HanoiExperiencesInner />
    </Suspense>
  );
}

function HanoiExperiencesInner() {
  const router = useRouter();
  const params = useParams<{ city: string }>();
  const citySlug = params.city;
  const search = useSearchParams();
  const saved = search.get("saved") === "1";
  const interested = search.get("interested") === "1";
  const when = saved || interested ? (search.get("when") ?? "") : (search.get("when") ?? "upcoming");
  const price = search.get("price") ?? "";
  const audience = search.get("audience") ?? "";
  const category = search.get("category") ?? "";
  const [q, setQ] = useState(search.get("q") ?? "");
  const [rows, setRows] = useState<ExperienceCard[]>([]);
  const [city, setCity] = useState<ExperienceCityRef | null>(null);
  const [closed, setClosed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (when) params.set("when", when);
      if (price) params.set("price", price);
      if (audience) params.set("audience", audience);
      if (category) params.set("category", category);
      if (q.trim()) params.set("q", q.trim());
      if (saved) params.set("saved", "1");
      if (interested) params.set("interested", "1");
      void api<{ city: ExperienceCityRef; experiences: ExperienceCard[] }>(
        `${experienceApi(citySlug)}?${params.toString()}`,
      )
        .then((res) => {
          setCity(res.city);
          setClosed(false);
          setRows(res.experiences);
          setLoaded(true);
          if (res.experiences.length === 0) {
            track("filter_zero_result", { properties: { when, price, audience, q, city: citySlug } });
          }
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "";
          if (message.includes("401") || message.includes("Authentication")) {
            router.replace("/login");
            return;
          }
          if (message.includes("chưa mở")) {
            setClosed(true);
            setLoaded(true);
          }
        });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [when, price, audience, category, q, saved, interested, router, citySlug]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${experienceHref(citySlug)}?${params.toString()}`);
  }

  return (
    <div className="container">
      <div className="header-row">
        <BrandMark subtitle={city?.label ?? "Trải nghiệm"} />
      </div>
      <h1 className="section-title">Trải nghiệm</h1>
      {closed ? <p className="stat">Thành phố chưa mở.</p> : null}
      <p className="stat">
        <Link href={experienceHref(citySlug, "/submit")}>Đơn vị tổ chức đăng bài</Link>
        {" · "}
        <button
          type="button"
          className={saved ? "filter-chip filter-chip--active" : "filter-chip"}
          onClick={() => {
            const next = new URLSearchParams(search.toString());
            if (saved) next.delete("saved");
            else {
              next.set("saved", "1");
              next.delete("when");
            }
            router.replace(`${experienceHref(citySlug)}?${next.toString()}`);
          }}
        >
          Đã lưu
        </button>{" "}
        <button
          type="button"
          className={interested ? "filter-chip filter-chip--active" : "filter-chip"}
          onClick={() => {
            const next = new URLSearchParams(search.toString());
            if (interested) next.delete("interested");
            else {
              next.set("interested", "1");
              next.delete("when");
            }
            router.replace(`${experienceHref(citySlug)}?${next.toString()}`);
          }}
        >
          Quan tâm
        </button>
      </p>
      <div className="field">
        <label htmlFor="experience-q">Tìm trong {city?.label ?? "thành phố"}</label>
        <input
          id="experience-q"
          value={q}
          placeholder="Tên chương trình, địa điểm, đơn vị"
          onChange={(event) => setQ(event.target.value)}
        />
      </div>
      <div className="filter-chip-row" aria-label="Thời gian">
        {WHEN.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={when === value ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setParam("when", value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filter-chip-row" aria-label="Giá">
        {PRICE.map(([value, label]) => (
          <button
            key={value || "any"}
            type="button"
            className={price === value ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setParam("price", value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filter-chip-row" aria-label="Đi cùng">
        <button
          type="button"
          className={audience === "" ? "filter-chip filter-chip--active" : "filter-chip"}
          onClick={() => setParam("audience", "")}
        >
          Mọi người
        </button>
        {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={audience === value ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setParam("audience", value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filter-chip-row" aria-label="Nhóm">
        <button
          type="button"
          className={category === "" ? "filter-chip filter-chip--active" : "filter-chip"}
          onClick={() => setParam("category", "")}
        >
          Mọi nhóm
        </button>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={category === value ? "filter-chip filter-chip--active" : "filter-chip"}
            onClick={() => setParam("category", value)}
          >
            {label}
          </button>
        ))}
      </div>
      {loaded && !closed && rows.length === 0 ? (
        <p className="stat">
          {saved && interested
            ? "Không có bài vừa lưu vừa quan tâm."
            : saved
              ? "Chưa có trải nghiệm đã lưu."
              : interested
                ? "Chưa đánh dấu quan tâm trải nghiệm nào."
                : "Chưa có suất khớp bộ lọc."}
        </p>
      ) : null}
      {rows.map((row) => (
        <Link key={row.id} href={experienceHref(citySlug, `/${row.id}`)} className="card experience-card">
          <strong>{row.title}</strong>
          <span className="stat">
            {row.occurrences[0] ? formatOccurrence(row.occurrences[0].startAt) : "Chưa có lịch"}
          </span>
          <span className="stat">Hợp: {audienceLine(row.audiences)}</span>
          <span>{priceLabel(row)}</span>
          {row.priceNote ? <span className="stat">{row.priceNote}</span> : null}
          {row.durationMinutes ? <span className="stat">Khoảng {row.durationMinutes} phút</span> : null}
          <span className="stat">{row.venue.name}</span>
          <span>{row.whyGo}</span>
        </Link>
      ))}
    </div>
  );
}
