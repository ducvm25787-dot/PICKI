"use client";

import Link from "next/link";
import { useEffect, useState, type TransitionEvent } from "react";
import { track } from "../../lib/analytics";
import { liveStatusClass } from "../../lib/providers";

export type TodaySpecial = {
  id: string;
  locationId: string;
  brandName: string;
  title: string;
  imageUrl: string | null;
  liveStatus: string;
  amountVnd?: number;
  listAmountVnd?: number;
  categoryName?: string | null;
  providerType?: string;
  providerClass?: string;
  href: string;
};

/** Cards visible on Home at once. The rest wait on the next slide and on Xem tất cả. */
export const HOME_RAIL_VISIBLE = 4;

const SLIDE_MS = 6_000;

function todayLiveIcon(status: string): string {
  if (status === "OPEN") return "Mở";
  if (status === "BUSY") return "Bận";
  return "Đóng";
}

export function HomeDishCard({
  item,
  badge,
  zoneId,
  trackSource,
}: {
  item: TodaySpecial;
  badge: string;
  zoneId?: string | null;
  trackSource: string;
}) {
  return (
    <Link
      href={item.href}
      className="today-hero-card"
      onClick={() =>
        track("today_offer_click", {
          zoneId: zoneId ?? undefined,
          properties: { locationId: item.locationId, source: trackSource },
        })
      }
    >
      <span className="today-hero-media">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" />
        ) : (
          <span className="today-hero-ph" aria-hidden>
            {item.title.trim().charAt(0).toUpperCase() || "•"}
          </span>
        )}
        <span className="today-hero-badge">{badge}</span>
      </span>
      <strong className="today-hero-title">{item.title}</strong>
      <span className="today-hero-shop">{item.brandName}</span>
      {item.amountVnd ? (
        item.listAmountVnd && item.listAmountVnd > item.amountVnd ? (
          <span className="today-hero-price">
            <s>{item.listAmountVnd.toLocaleString("vi-VN")}đ</s>
            <strong>{item.amountVnd.toLocaleString("vi-VN")}đ</strong>
          </span>
        ) : (
          <span className="today-hero-shop">{item.amountVnd.toLocaleString("vi-VN")}đ</span>
        )
      ) : null}
      <span className="today-hero-meta">
        <span className={`live-dot ${liveStatusClass(item.liveStatus)}`} aria-hidden />
        <span>{todayLiveIcon(item.liveStatus)}</span>
      </span>
    </Link>
  );
}

function slicePage(items: TodaySpecial[], page: number) {
  const start = page * HOME_RAIL_VISIBLE;
  return items.slice(start, start + HOME_RAIL_VISIBLE);
}

export function HomeDishRail({
  label,
  hint,
  items,
  badgeFor,
  empty,
  zoneId,
  trackSource,
  allHref,
}: {
  label: string;
  hint?: string;
  items: TodaySpecial[];
  badgeFor: (item: TodaySpecial) => string;
  empty?: string;
  zoneId: string | null;
  trackSource: string;
  allHref?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(items.length / HOME_RAIL_VISIBLE));
  const [page, setPage] = useState(0);
  const [sliding, setSliding] = useState(false);
  const safePage = page % pageCount;
  const current = slicePage(items, safePage);
  const upcoming = slicePage(items, (safePage + 1) % pageCount);

  useEffect(() => {
    setPage(0);
    setSliding(false);
  }, [items.map((item) => item.id).join("|")]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (reduce.matches) {
        setPage((value) => (value + 1) % pageCount);
        return;
      }
      setSliding(true);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [pageCount]);

  function onSlideEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.propertyName !== "transform" || event.target !== event.currentTarget) return;
    setSliding(false);
    setPage((value) => (value + 1) % pageCount);
  }

  if (items.length === 0 && !empty) return null;

  return (
    <section className="today-hero" aria-label={label}>
      <div className="section-head">
        <p className="section-title">{label}</p>
        {allHref && items.length > 0 ? (
          <Link href={allHref} className="section-more">
            Xem tất cả
          </Link>
        ) : null}
      </div>
      {hint ? <p className="tagline">{hint}</p> : null}
      {items.length === 0 ? (
        <p className="stat">{empty}</p>
      ) : pageCount <= 1 ? (
        <div className="today-hero-grid">
          {current.map((item) => (
            <HomeDishCard
              key={item.id}
              item={item}
              badge={badgeFor(item)}
              zoneId={zoneId}
              trackSource={trackSource}
            />
          ))}
        </div>
      ) : (
        <div className="today-rail-viewport">
          <div
            className={`today-rail-track${sliding ? " is-sliding" : ""}`}
            onTransitionEnd={onSlideEnd}
          >
            {[current, upcoming].map((group, groupIndex) => (
              <div className="today-hero-grid today-rail-page" key={groupIndex}>
                {group.map((item) => (
                  <HomeDishCard
                    key={`${groupIndex}-${item.id}`}
                    item={item}
                    badge={badgeFor(item)}
                    zoneId={zoneId}
                    trackSource={trackSource}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
