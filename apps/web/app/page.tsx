"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  browseHrefForDiscoveryBlock,
  homeCategoriesPrimary,
  homeCategoriesSecondary,
} from "../lib/categories";
import { familiarPrimaryCta } from "../lib/familiar";
import { contextNowFor, type ContextNowContent } from "../lib/home-hero";
import { track, trackMany } from "../lib/analytics";
import { liveStatusClass, liveStatusLabel, type ProviderListing } from "../lib/providers";
import { BrandMark } from "./components/brand-mark";
import { NotificationBell } from "./components/notification-bell";
import { ProviderList } from "./components/provider-list";
import { IconSearch } from "./components/nav-icons";

type Me = { id: string; displayName: string | null };

type DiscoveryBlock = {
  id: string;
  title: string;
  subtitle: string;
  providers: ProviderListing[];
};

type FamiliarCard = {
  locationId: string;
  brandName: string;
  displayName: string;
  providerType: string;
  liveStatus: string;
  estimatedWaitMinutes: number | null;
  completedInteractions: number;
  favorite: boolean;
};

type NowAroundCard = {
  locationId: string;
  brandName: string;
  displayName: string;
  providerType: string;
  liveStatus: string;
  estimatedWaitMinutes: number | null;
  headline: string;
  detail: string | null;
  source: string;
  ctaLabel: string;
  ctaHref: string;
};

type ExploreChipId = "new" | "open" | "near" | "popular";

type MyZone = { zoneId: string; slug: string; displayName: string };

const KVL_SLUG = "kim-van-kim-lu";

const EXPLORE_CHIPS: { id: ExploreChipId; label: string }[] = [
  { id: "open", label: "Đang mở" },
  { id: "new", label: "Mới" },
  { id: "near", label: "Gần tôi" },
  { id: "popular", label: "Phổ biến" },
];

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [myZones, setMyZones] = useState<MyZone[]>([]);
  const [blocks, setBlocks] = useState<DiscoveryBlock[]>([]);
  const [familiar, setFamiliar] = useState<FamiliarCard[]>([]);
  const [nowAround, setNowAround] = useState<NowAroundCard[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [exploreChip, setExploreChip] = useState<ExploreChipId>("open");
  const [exploreProviders, setExploreProviders] = useState<ProviderListing[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextNow, setContextNow] = useState<ContextNowContent>(() => contextNowFor());

  useEffect(() => {
    const tick = () => setContextNow(contextNowFor());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadFavorites = useCallback(async () => {
    const res = await api<{ favorites: { locationId: string }[] }>("/me/favorites").catch(
      () => ({ favorites: [] }),
    );
    setFavoriteIds(new Set(res.favorites.map((f) => f.locationId)));
  }, []);

  const loadExplore = useCallback(async (chip: ExploreChipId) => {
    setExploreLoading(true);
    try {
      const res = await api<{ providers: ProviderListing[] }>(
        `/zones/${KVL_SLUG}/explore?chip=${chip}`,
      );
      setExploreProviders(res.providers ?? []);
    } catch {
      setExploreProviders([]);
    } finally {
      setExploreLoading(false);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const user = await api<Me>("/me").catch(() => null);
        if (!user) {
          router.replace("/login");
          return;
        }
        setMe(user);

        const mine = await api<{ zones: MyZone[] }>("/zones/mine");
        setMyZones(mine.zones);

        const joined = mine.zones.some((z) => z.slug === KVL_SLUG);
        if (joined) {
          const home = await api<{
            zoneId?: string;
            blocks: DiscoveryBlock[];
            familiar?: FamiliarCard[];
            nowAround?: NowAroundCard[];
            today?: NowAroundCard[];
          }>(`/zones/${KVL_SLUG}/home`).catch(async () => {
            const discovery = await api<{ blocks: DiscoveryBlock[] }>(
              `/zones/${KVL_SLUG}/discovery`,
            );
            return {
              ...discovery,
              familiar: [] as FamiliarCard[],
              nowAround: [] as NowAroundCard[],
            };
          });
          setBlocks(home.blocks);
          setFamiliar(home.familiar ?? []);
          setNowAround(home.nowAround ?? []);
          if (home.zoneId) setZoneId(home.zoneId);
          await loadFavorites();
          await loadExplore("open");

          trackMany([
            {
              name: "home_section_impression",
              zoneId: home.zoneId,
              properties: { section: "context_now", hero: contextNowFor().id },
            },
            {
              name: "home_section_impression",
              zoneId: home.zoneId,
              properties: {
                section: "now_around",
                count: (home.nowAround ?? []).length,
              },
            },
            {
              name: "home_section_impression",
              zoneId: home.zoneId,
              properties: {
                section: "familiar",
                count: (home.familiar ?? []).length,
              },
            },
          ]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router, loadFavorites, loadExplore]);

  async function toggleFavorite(locationId: string) {
    if (favoriteIds.has(locationId)) {
      await api(`/me/favorites/${locationId}`, { method: "DELETE" });
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(locationId);
        return next;
      });
    } else {
      await api("/me/favorites", {
        method: "POST",
        body: JSON.stringify({ locationId }),
      });
      setFavoriteIds((prev) => new Set(prev).add(locationId));
    }
  }

  async function selectExploreChip(chip: ExploreChipId) {
    setExploreChip(chip);
    await loadExplore(chip);
  }

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải Pickee…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const joinedKvl = myZones.some((z) => z.slug === KVL_SLUG);
  const primaryCats = homeCategoriesPrimary();
  const secondaryCats = homeCategoriesSecondary();
  const otherBlocks = blocks.filter(
    (b) =>
      ![
        "dinner-plan",
        "dinner-rescue",
        "breakfast-preorder",
        "breakfast-instant",
        "lunch",
        "late-snack",
      ].includes(b.id),
  );

  return (
    <div className="container">
      <div className="header-row">
        <BrandMark subtitle="Tiện ích quanh tôi" />
        <NotificationBell audience="customer" />
      </div>

      {!joinedKvl ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Kim Văn – Kim Lũ</h2>
          <p className="stat">Tham gia Zone để xem quanh nhà.</p>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12 }}
            onClick={() => router.push(`/zones/${KVL_SLUG}`)}
          >
            Tham gia Zone
          </button>
        </div>
      ) : (
        <>
          <Link
            href={`/zones/${KVL_SLUG}/search`}
            className="home-search"
            aria-label="Tìm quanh Zone"
          >
            <span className="home-search-icon">
              <IconSearch />
            </span>
            <span>Tìm món, sản phẩm, dịch vụ…</span>
          </Link>

          <p className="stat" style={{ margin: "0 0 10px" }}>
            📍 Nhà · Kim Văn – Kim Lũ
          </p>

          <Link href={contextNow.href} className={`home-hero home-hero--${contextNow.tone}`}>
            <p className="home-hero-kicker">{contextNow.kicker}</p>
            <h2 className="home-hero-title">{contextNow.title}</h2>
            <p className="home-hero-copy">{contextNow.copy}</p>
            <span className="home-hero-cta">{contextNow.cta}</span>
          </Link>

          <section className="card today-section" aria-label="Quanh bạn lúc này">
            <p className="section-title" style={{ marginBottom: 8 }}>
              Quanh bạn lúc này
            </p>
            {nowAround.length === 0 ? (
              <p className="stat" style={{ margin: 0 }}>
                Chưa có chỗ đang mở nổi bật — thử Khám phá bên dưới.
              </p>
            ) : (
              <div className="home-scroll-row">
                {nowAround.map((n) => (
                  <Link
                    key={`${n.locationId}-${n.headline}`}
                    href={n.ctaHref}
                    className="home-scroll-card"
                    onClick={() =>
                      track("today_offer_click", {
                        zoneId: zoneId ?? undefined,
                        properties: { locationId: n.locationId, source: n.source },
                      })
                    }
                  >
                    <strong>{n.brandName}</strong>
                    <span className="stat">
                      <span className={`live-pill ${liveStatusClass(n.liveStatus)}`}>
                        {liveStatusLabel(n.liveStatus)}
                      </span>
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{n.headline}</span>
                    {n.detail ? <span className="stat">{n.detail}</span> : null}
                    <span className="familiar-cta" style={{ alignSelf: "flex-start", marginTop: 6 }}>
                      {n.ctaLabel}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card familiar-section" aria-label="Chỗ quen">
            <div className="section-head">
              <p className="section-title" style={{ margin: 0 }}>
                Chỗ quen của nhà mình
              </p>
              {familiar.length > 5 ? (
                <Link href={`/zones/${KVL_SLUG}/browse/food`} className="section-more">
                  Xem thêm →
                </Link>
              ) : null}
            </div>
            {familiar.length === 0 ? (
              <p className="stat" style={{ margin: "8px 0 0" }}>
                Lưu ♥ hoặc hoàn thành đơn — chỗ quen sẽ hiện ở đây.
              </p>
            ) : (
              <div className="home-scroll-row home-scroll-row--mini" style={{ marginTop: 10 }}>
                {familiar.map((f) => {
                  const cta = familiarPrimaryCta({
                    locationId: f.locationId,
                    providerType: f.providerType,
                    zoneSlug: KVL_SLUG,
                  });
                  const waitHint =
                    f.estimatedWaitMinutes != null && f.estimatedWaitMinutes <= 5
                      ? "Ngay"
                      : f.estimatedWaitMinutes != null
                        ? `~${String(f.estimatedWaitMinutes)}p`
                        : null;
                  return (
                    <div key={f.locationId} className="home-scroll-card home-scroll-card--mini">
                      <Link href={`/locations/${f.locationId}`} className="familiar-name">
                        {f.brandName}
                      </Link>
                      <span className="familiar-mini-status">
                        <span className={`live-dot ${liveStatusClass(f.liveStatus)}`} aria-hidden />
                        {waitHint ?? liveStatusLabel(f.liveStatus)}
                      </span>
                      <Link
                        href={cta.href}
                        className="familiar-cta"
                        onClick={() =>
                          track("familiar_provider_click", {
                            zoneId: zoneId ?? undefined,
                            properties: { locationId: f.locationId, cta: cta.label },
                          })
                        }
                      >
                        {cta.label}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="home-utilities" aria-label="Tiện ích quanh tôi">
            <p className="section-title" style={{ marginBottom: 12 }}>
              Tiện ích quanh tôi
            </p>
            <div className="utility-grid utility-grid--compact">
              {primaryCats.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/zones/${KVL_SLUG}/browse/${cat.id}`}
                  className="utility-tile"
                >
                  <span className="utility-tile-emoji" aria-hidden>
                    {cat.emoji}
                  </span>
                  <span className="utility-tile-label">{cat.shortLabel}</span>
                </Link>
              ))}
              <button
                type="button"
                className="utility-tile"
                onClick={() => setCategoriesOpen((v) => !v)}
                aria-expanded={categoriesOpen}
              >
                <span className="utility-tile-emoji" aria-hidden>
                  ▦
                </span>
                <span className="utility-tile-label">{categoriesOpen ? "Thu gọn" : "Tất cả"}</span>
              </button>
            </div>
            {categoriesOpen ? (
              <div className="utility-grid" style={{ marginTop: 10 }}>
                {secondaryCats.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/zones/${KVL_SLUG}/browse/${cat.id}`}
                    className="utility-tile"
                  >
                    <span className="utility-tile-emoji" aria-hidden>
                      {cat.emoji}
                    </span>
                    <span className="utility-tile-label">{cat.shortLabel}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>

          <section aria-label="Khám phá quanh tôi">
            <p className="section-title" style={{ margin: "8px 0 12px" }}>
              Khám phá quanh tôi
            </p>
            <div className="filter-chip-row" aria-label="Bộ lọc khám phá">
              {EXPLORE_CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={
                    exploreChip === c.id ? "filter-chip filter-chip--active" : "filter-chip"
                  }
                  onClick={() => void selectExploreChip(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {exploreLoading ? (
              <div className="explore-skeleton" aria-busy="true" aria-label="Đang tải">
                <div className="explore-skeleton-row" />
                <div className="explore-skeleton-row" />
                <div className="explore-skeleton-row" />
              </div>
            ) : exploreProviders.length > 0 ? (
              <div className="card" style={{ marginBottom: 16 }}>
                <ProviderList
                  providers={exploreProviders.slice(0, 5)}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={(id) => void toggleFavorite(id)}
                />
              </div>
            ) : (
              <p className="stat" style={{ marginBottom: 16 }}>
                Chưa có chỗ khớp — thử chip khác.
              </p>
            )}

            {otherBlocks.map((block) =>
              block.providers.length === 0 ? null : (
                <div key={block.id} className="card" style={{ marginBottom: 16 }}>
                  <div className="section-head">
                    <p className="section-title">{block.title}</p>
                    <Link
                      href={browseHrefForDiscoveryBlock(block.id, KVL_SLUG)}
                      className="section-more"
                    >
                      Xem thêm →
                    </Link>
                  </div>
                  <p className="stat" style={{ marginBottom: 12 }}>
                    {block.subtitle}
                  </p>
                  <ProviderList
                    providers={block.providers.slice(0, 3)}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={(id) => void toggleFavorite(id)}
                  />
                </div>
              ),
            )}
          </section>
        </>
      )}

      <p className="stat" style={{ marginTop: 8, marginBottom: 0 }}>
        Xin chào{me?.displayName ? `, ${me.displayName}` : ""} ·{" "}
        <Link href="/me">Tài khoản →</Link>
      </p>
    </div>
  );
}
