"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type TransitionEvent } from "react";
import { api } from "../lib/api";
import { getCurrentPositionOnce } from "../lib/geolocation";
import {
  browseHrefForDiscoveryBlock,
  homeCategoriesPrimary,
  homeCategoriesSecondary,
} from "../lib/categories";
import { familiarPrimaryCta } from "../lib/familiar";
import { contextNowFor, type ContextNowContent } from "../lib/home-hero";
import { track, trackMany } from "../lib/analytics";
import {
  experienceApi,
  experienceHref,
  formatOccurrence,
  priceLabel,
  type ExperienceCard,
  type ExperienceCityRef,
} from "../lib/experiences";
import { liveStatusClass, liveStatusLabel, type ProviderListing } from "../lib/providers";
import { marketTierBadge } from "@picki/shared";
import { BrandMark } from "./components/brand-mark";
import { HomeDishRail, type TodaySpecial } from "./components/home-dish-rail";
import { NotificationBell } from "./components/notification-bell";
import { ProviderList } from "./components/provider-list";
import { IconSearch } from "./components/nav-icons";

type Me = { id: string; displayName: string | null; draftBeerAllowed?: boolean };

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
  familiarOffer?: { title: string; kindLabel: string } | null;
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
  badge?: string | null;
  sponsored?: boolean;
};

type SpotlightCard = {
  locationId: string;
  brandName: string;
  title: string;
  detail: string | null;
  kindLabel: string;
  href: string;
  sponsored: boolean;
};

type ExploreChipId = "new" | "open" | "near" | "popular" | "bia-hoi";

type MyZone = { zoneId: string; slug: string; displayName: string };

type NearbyZone = { id: string; slug: string; displayName: string };

const KVL_SLUG = "kim-van-kim-lu";

const EXPLORE_CHIPS: { id: ExploreChipId; label: string }[] = [
  { id: "open", label: "Đang mở" },
  { id: "new", label: "Mới" },
  { id: "near", label: "Gần tôi" },
  { id: "popular", label: "Phổ biến" },
  { id: "bia-hoi", label: "Bia hơi" },
];

function HomeHeroPhoto({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const signature = urls.join("|");
  useEffect(() => {
    const list = urlsRef.current;
    if (list.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIndex(0);
      return;
    }
    const started = Date.now();
    const tick = () => {
      const current = urlsRef.current;
      if (current.length < 2) return;
      setIndex(Math.floor((Date.now() - started) / 6_000) % current.length);
    };
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [signature]);
  const src = urls[index] ?? urls[0];
  if (!src) return null;
  return <img className="home-hero-photo" src={src} alt="" />;
}

function ExperienceHomeReel({
  copy,
  when,
  citySlug,
  cityLabel,
  experiences,
}: {
  copy: string;
  when: string;
  citySlug: string;
  cityLabel: string;
  experiences: ExperienceCard[];
}) {
  const count = experiences.length;
  const visible = Math.min(3, count);
  const [step, setStep] = useState(0);
  const [gliding, setGliding] = useState(false);
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    if (count <= 1) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      const id = window.setInterval(() => setStep((value) => value + 1), 7_500);
      return () => window.clearInterval(id);
    }
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) setGliding(true);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    };
  }, [count]);

  function onGlideEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.propertyName !== "transform" || event.target !== event.currentTarget) return;
    setGliding(false);
    setStep((value) => value + 1);
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setGliding(true), 6_000);
  }

  if (count === 0) return null;
  const reel =
    count <= 1
      ? experiences
      : Array.from(
          { length: visible + 1 },
          (_, index) => experiences[(step + index) % count]!,
        );

  return (
    <section className="card home-experience" aria-label={copy}>
      <p className="section-title" style={{ marginBottom: 8 }}>
        {copy}
      </p>
      <div className="home-experience-viewport" style={{ ["--rows" as string]: visible }}>
        <div
          className={`home-experience-track${gliding ? " is-gliding" : ""}`}
          onTransitionEnd={onGlideEnd}
        >
          {reel.map((item, index) => (
            <Link
              key={`slot-${index}`}
              href={experienceHref(citySlug, `/${item.id}`)}
              className="home-experience-row"
              onClick={() => track("weekend_card_open", { properties: { experienceId: item.id } })}
            >
              <strong>{item.title}</strong>
              <span className="stat">
                {item.occurrences[0] ? formatOccurrence(item.occurrences[0].startAt) : item.venue.name}
                {" · "}
                {priceLabel(item)}
              </span>
            </Link>
          ))}
        </div>
      </div>
      <Link href={`${experienceHref(citySlug)}?when=${when}`} className="stat">
        Xem trải nghiệm {cityLabel}
      </Link>
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [myZones, setMyZones] = useState<MyZone[]>([]);
  const [nearbyZone, setNearbyZone] = useState<NearbyZone | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DiscoveryBlock[]>([]);
  const [familiar, setFamiliar] = useState<FamiliarCard[]>([]);
  const [nowAround, setNowAround] = useState<NowAroundCard[]>([]);
  const [todaySpecials, setTodaySpecials] = useState<TodaySpecial[]>([]);
  const [snackDesserts, setSnackDesserts] = useState<TodaySpecial[]>([]);
  const [marketToday, setMarketToday] = useState<TodaySpecial[]>([]);
  const [heroByContext, setHeroByContext] = useState<Record<string, string[]>>({});
  const [spotlight, setSpotlight] = useState<SpotlightCard | null>(null);
  const [experienceHome, setExperienceHome] = useState<{
    copy: string;
    when: string;
    city?: ExperienceCityRef;
    experiences: ExperienceCard[];
  } | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [exploreChip, setExploreChip] = useState<ExploreChipId>("open");
  const [ageName, setAgeName] = useState("");
  const [ageDob, setAgeDob] = useState("");
  const [ageError, setAgeError] = useState<string | null>(null);
  const [exploreProviders, setExploreProviders] = useState<ProviderListing[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
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
        const experienceRes = await api<{
          card: {
            copy: string;
            when: string;
            city?: ExperienceCityRef;
            experiences: ExperienceCard[];
          } | null;
        }>(experienceApi("hanoi", "/home-card")).catch(() => ({ card: null }));
        setExperienceHome(experienceRes.card);

        const joined = mine.zones.some((z) => z.slug === KVL_SLUG);
        if (!joined) {
          const geo = await getCurrentPositionOnce({ timeoutMs: 10_000 });
          if (geo.source !== "gps") {
            setNearbyZone(null);
            setGpsNote(geo.error ?? "Bật vị trí khi đứng trong Zone để tham gia.");
          } else {
            const found = await api<{ zones: NearbyZone[] }>("/zones/discover", {
              method: "POST",
              body: JSON.stringify(geo.position),
            }).catch(() => ({ zones: [] as NearbyZone[] }));
            setNearbyZone(found.zones[0] ?? null);
            setGpsNote(
              found.zones[0]
                ? null
                : "Bạn đang ở ngoài Zone. Vào trong khu và bật vị trí để tham gia.",
            );
          }
        }
        if (joined) {
          const home = await api<{
            zoneId?: string;
            blocks: DiscoveryBlock[];
            familiar?: FamiliarCard[];
            nowAround?: NowAroundCard[];
            todaySpecials?: TodaySpecial[];
            snackDesserts?: TodaySpecial[];
            marketToday?: TodaySpecial[];
            heroImages?: Record<string, string[]>;
            today?: NowAroundCard[];
            spotlight?: SpotlightCard | null;
          }>(`/zones/${KVL_SLUG}/home`).catch(async () => {
            const discovery = await api<{ blocks: DiscoveryBlock[] }>(
              `/zones/${KVL_SLUG}/discovery`,
            );
            return {
              ...discovery,
              familiar: [] as FamiliarCard[],
              nowAround: [] as NowAroundCard[],
              todaySpecials: [] as TodaySpecial[],
              heroImages: {} as Record<string, string[]>,
              spotlight: null as SpotlightCard | null,
            };
          });
          setBlocks(home.blocks);
          setFamiliar(home.familiar ?? []);
          setNowAround(home.nowAround ?? []);
          setTodaySpecials("todaySpecials" in home ? (home.todaySpecials ?? []) : []);
          setSnackDesserts("snackDesserts" in home ? (home.snackDesserts ?? []) : []);
          setMarketToday("marketToday" in home ? (home.marketToday ?? []) : []);
          setHeroByContext("heroImages" in home ? (home.heroImages ?? {}) : {});
          setSpotlight("spotlight" in home ? (home.spotlight ?? null) : null);
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
    try {
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
      setFavoriteError(null);
    } catch (e) {
      setFavoriteError(e instanceof Error ? e.message : "Không lưu được yêu thích");
    }
  }

  async function declareAge() {
    setAgeError(null);
    try {
      const user = await api<Me>("/me/age-declaration", {
        method: "POST",
        body: JSON.stringify({ fullName: ageName, dateOfBirth: ageDob }),
      });
      setMe(user);
    } catch (e) {
      setAgeError(e instanceof Error ? e.message : "Không khai được tuổi");
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

  const experienceBlock = experienceHome ? (
    <ExperienceHomeReel
      copy={experienceHome.copy}
      when={experienceHome.when}
      citySlug={experienceHome.city?.slug ?? "hanoi"}
      cityLabel={experienceHome.city?.label ?? "Hà Nội"}
      experiences={experienceHome.experiences}
    />
  ) : null;

  const utilitiesBlock = (
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
  );

  return (
    <div className="container">
      <div className="header-row">
        <BrandMark subtitle="Tiện ích quanh tôi" />
        <NotificationBell audience="customer" />
      </div>
      {favoriteError ? (
        <p className="stat" style={{ color: "#b91c1c", margin: "0 0 12px" }}>
          {favoriteError}
        </p>
      ) : null}

      {!joinedKvl ? (
        <>
        <div className="card" style={{ marginBottom: 16 }}>
          {nearbyZone ? (
            <>
              <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>{nearbyZone.displayName}</h2>
              <p className="stat">GPS đang nằm trong Zone này. Tham gia để dùng dịch vụ quanh nhà.</p>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => router.push(`/zones/${nearbyZone.slug}`)}
              >
                Tham gia Zone
              </button>
            </>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Chưa ở trong Zone</h2>
              <p className="stat">
                {gpsNote ?? "Đang đọc vị trí… Chỉ hiện Zone khi GPS nằm trong khu."}
              </p>
            </>
          )}
        </div>
        {experienceBlock}
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <Link
              href={`/zones/${KVL_SLUG}/search`}
              className="home-search"
              aria-label="Tìm quanh Zone"
              style={{ flex: 1, marginBottom: 0 }}
            >
              <span className="home-search-icon">
                <IconSearch />
              </span>
              <span>Tìm món, sản phẩm, dịch vụ…</span>
            </Link>
            <Link href="/scan" className="btn" style={{ width: "auto", padding: "12px 14px" }}>
              Quét QR
            </Link>
          </div>

          <p className="stat" style={{ margin: "0 0 10px" }}>
            📍 Nhà · Kim Văn – Kim Lũ
          </p>

          <Link
            href={contextNow.href}
            className={`home-hero home-hero--${contextNow.tone}${(heroByContext[contextNow.id]?.length ?? 0) > 0 ? " home-hero--has-photo" : ""}`}
          >
            <span className="home-hero-text">
              <p className="home-hero-kicker">{contextNow.kicker}</p>
              <h2 className="home-hero-title">{contextNow.title}</h2>
              <p className="home-hero-copy">{contextNow.copy}</p>
              <span className="home-hero-cta">{contextNow.cta}</span>
            </span>
            <HomeHeroPhoto urls={heroByContext[contextNow.id] ?? []} />
          </Link>

          <HomeDishRail
            label="Đặc biệt hôm nay"
            allHref="/pushes/special"
            items={todaySpecials}
            badgeFor={(item) =>
              item.campaignId
                ? "Chương trình"
                : item.listAmountVnd && item.amountVnd && item.listAmountVnd > item.amountVnd
                  ? "Ưu đãi giảm giá"
                  : "Đặc biệt"
            }
            zoneId={zoneId}
            trackSource="today_special"
          />
          <HomeDishRail
            label="Ăn vặt & Tráng miệng"
            hint="Thèm gì gọi nấy quanh nhà"
            allHref="/pushes/snacks"
            items={snackDesserts}
            badgeFor={(item) => item.categoryName ?? "Ăn vặt"}
            empty="Chưa có món được đẩy hôm nay."
            zoneId={zoneId}
            trackSource="snack_dessert"
          />
          <HomeDishRail
            label="Đi chợ"
            allHref="/pushes/market"
            items={marketToday}
            badgeFor={(item) => item.providerClass ?? marketTierBadge(item.providerType) ?? "Đi chợ"}
            empty="Chưa có hàng được đẩy hôm nay."
            zoneId={zoneId}
            trackSource="market_today"
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Link href={`/zones/${KVL_SLUG}/browse/market`} className="familiar-cta" style={{ marginBottom: 0 }}>
              Đi chợ ngay
            </Link>
            <Link href={`/zones/${KVL_SLUG}/browse/market?when=morning`} className="familiar-cta" style={{ marginBottom: 0 }}>
              Sáng mai giao
            </Link>
          </div>

          {spotlight ? (
            <Link href={spotlight.href} className="card spotlight-card">
              <p className="fresh-badge">Tài trợ</p>
              <strong>{spotlight.brandName}</strong>
              <span>{spotlight.title}</span>
              {spotlight.detail ? <span className="stat">{spotlight.detail}</span> : null}
            </Link>
          ) : null}

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
                    {n.badge ? <span className="fresh-badge">{n.badge}</span> : null}
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
                      {f.familiarOffer ? (
                        <span className="promo-badge">{f.familiarOffer.title}</span>
                      ) : null}
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

          {utilitiesBlock}

          {experienceBlock}

          <section aria-label="Khám phá quanh tôi">
            <p className="section-title" style={{ margin: "8px 0 12px" }}>
              Khám phá quanh tôi
            </p>
            {me?.draftBeerAllowed ? null : (
              <form
                className="card"
                style={{ marginBottom: 12 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void declareAge();
                }}
              >
                <strong>Bia hơi</strong>
                <p className="stat" style={{ margin: "4px 0 8px" }}>
                  Khai họ tên và ngày sinh đủ 18 tuổi để xem quán rót bia hơi.
                </p>
                <label className="field">
                  Họ tên
                  <input value={ageName} onChange={(event) => setAgeName(event.target.value)} required />
                </label>
                <label className="field">
                  Ngày sinh
                  <input
                    type="date"
                    value={ageDob}
                    onChange={(event) => setAgeDob(event.target.value)}
                    required
                  />
                </label>
                {ageError ? <p style={{ color: "#b91c1c" }}>{ageError}</p> : null}
                <button className="btn" type="submit">
                  Xác nhận đủ 18 tuổi
                </button>
              </form>
            )}
            <div className="filter-chip-row" aria-label="Bộ lọc khám phá">
              {EXPLORE_CHIPS.filter((c) => c.id !== "bia-hoi" || me?.draftBeerAllowed).map((c) => (
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
