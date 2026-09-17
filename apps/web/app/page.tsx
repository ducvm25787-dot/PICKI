"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { browseHrefForDiscoveryBlock, HOME_CATEGORIES } from "../lib/categories";
import { type ProviderListing } from "../lib/providers";
import { BrandMark } from "./components/brand-mark";
import { NotificationBell } from "./components/notification-bell";
import { ProviderList } from "./components/provider-list";
import {
  IconGift,
  IconMap,
  IconOrders,
  IconSearch,
  IconUsers,
  IconWrench,
} from "./components/nav-icons";

type Me = {
  id: string;
  displayName: string | null;
};

type DiscoveryBlock = {
  id: string;
  title: string;
  subtitle: string;
  providers: ProviderListing[];
};

type CommunityListing = {
  id: string;
  listingType: string;
  title: string;
  priceVnd: number | null;
  status: string;
  locationLabel: string;
};

type CommunitySummary = {
  resaleCount: number;
  giveAwayCount: number;
  rentCount?: number;
  roommateCount?: number;
  lostFoundCount?: number;
  petLostCount?: number;
  recentListings: CommunityListing[];
};

type MyZone = {
  zoneId: string;
  slug: string;
  displayName: string;
};

const KVL_SLUG = "kim-van-kim-lu";

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [myZones, setMyZones] = useState<MyZone[]>([]);
  const [blocks, setBlocks] = useState<DiscoveryBlock[]>([]);
  const [community, setCommunity] = useState<CommunitySummary | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    const res = await api<{ favorites: { locationId: string }[] }>("/me/favorites").catch(
      () => ({ favorites: [] }),
    );
    setFavoriteIds(new Set(res.favorites.map((f) => f.locationId)));
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
          const discovery = await api<{ blocks: DiscoveryBlock[]; community?: CommunitySummary }>(
            `/zones/${KVL_SLUG}/discovery`,
          );
          setBlocks(discovery.blocks);
          setCommunity(discovery.community ?? null);
          await loadFavorites();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router, loadFavorites]);

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

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải Picki…</p>
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

  return (
    <div className="container">
      <div className="header-row">
        <BrandMark subtitle="Hôm nay quanh bạn có gì?" />
        <NotificationBell audience="customer" />
      </div>

      {!joinedKvl ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Kim Văn – Kim Lũ</h2>
          <p className="stat">Tham gia Zone để xem discovery theo khung giờ (S14–S18).</p>
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
            <span>Tìm món, dịch vụ quanh Kim Văn…</span>
          </Link>

          <Link href="/family-dinner" className="home-hero">
            <p className="home-hero-kicker">Bữa tối ấm cúng</p>
            <h2 className="home-hero-title">Tối nay nhà mình ăn gì?</h2>
            <p className="home-hero-copy">
              Chọn mâm theo nhóm · giao khung giờ · trả trước — bếp đang nhận đơn trong Zone.
            </p>
            <span className="home-hero-cta">Xem bếp nhận đơn →</span>
          </Link>

          <div className="quick-grid" aria-label="Lối tắt">
            <Link href={`/zones/${KVL_SLUG}/classifieds`} className="quick-tile">
              <span className="quick-tile-icon quick-tile-icon--amber">
                <IconUsers />
              </span>
              Góc khu
            </Link>
            <Link href="/orders" className="quick-tile">
              <span className="quick-tile-icon quick-tile-icon--green">
                <IconOrders />
              </span>
              Đơn
            </Link>
            <Link href={`/zones/${KVL_SLUG}/map`} className="quick-tile">
              <span className="quick-tile-icon quick-tile-icon--blue">
                <IconMap />
              </span>
              Bản đồ
            </Link>
            <Link href="/requests" className="quick-tile">
              <span className="quick-tile-icon">
                <IconWrench />
              </span>
              Dịch vụ
            </Link>
          </div>

          <section className="home-utilities" aria-label="Tiện ích quanh nhà">
            <p className="section-title" style={{ marginBottom: 12 }}>
              Tiện ích quanh nhà
            </p>
            <div className="utility-grid">
              {HOME_CATEGORIES.map((cat) => (
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
          </section>

          <div className="chip-row" aria-label="Lối tắt hôm nay">
            <Link href="/breakfast" className="chip">
              <span className="chip-icon">
                <IconGift />
              </span>
              Sáng mai
            </Link>
            <Link href="/family-dinner" className="chip">
              <span className="chip-icon">
                <IconGift />
              </span>
              Bữa tối
            </Link>
            <Link href="/late-night" className="chip">
              Ăn khuya
            </Link>
            <Link href={`/zones/${KVL_SLUG}/classifieds?type=GIVE_AWAY`} className="chip">
              Cho tặng
            </Link>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <p className="section-title">Góc khu mình</p>
              <Link href={`/zones/${KVL_SLUG}/classifieds`} className="section-more">
                Xem thêm →
              </Link>
            </div>
            <p className="stat" style={{ marginBottom: 12 }}>
              Cho tặng · thanh lý · cho thuê · thất lạc — trong Zone
            </p>
            {community && community.recentListings.length > 0 ? (
              <div className="home-scroll-row">
                {community.recentListings.map((item) => (
                  <Link key={item.id} href={`/classifieds/${item.id}`} className="home-scroll-card">
                    <strong>{item.title}</strong>
                    <span className="stat">
                      {item.listingType === "GIVE_AWAY"
                        ? "Miễn phí"
                        : item.listingType === "LOST_FOUND" || item.listingType === "PET_LOST"
                          ? "Không mua bán"
                          : item.priceVnd != null
                            ? `${item.priceVnd.toLocaleString("vi-VN")}đ${
                                item.listingType === "CHO_THUE" || item.listingType === "O_GHEP"
                                  ? "/tháng"
                                  : ""
                              }`
                            : "Liên hệ"}
                    </span>
                    <span className="stat">{item.locationLabel}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="stat">Chưa có tin — mở Góc khu để đăng.</p>
            )}
          </div>

          {blocks.map((block) => (
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
                providers={block.providers}
                favoriteIds={favoriteIds}
                onToggleFavorite={(id) => void toggleFavorite(id)}
              />
            </div>
          ))}

          {favoriteIds.size > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <p className="section-title">Quán yêu thích</p>
              <p className="stat">{favoriteIds.size} quán đã lưu — ♥ trên thẻ quán.</p>
            </div>
          )}
        </>
      )}

      <div className="card">
        <p className="stat">Xin chào{me?.displayName ? `, ${me.displayName}` : ""}!</p>
        <p className="stat" style={{ marginTop: 8 }}>
          Dùng thanh tab bên dưới · cài Picki lên màn hình chính (Add to Home Screen).
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <Link href="/provider/login" className="stat">
            Provider app →
          </Link>
          <Link href="/runner/login" className="stat">
            Runner app →
          </Link>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 12 }}
          onClick={() => {
            void api("/auth/logout", { method: "POST" }).then(() => router.replace("/login"));
          }}
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}
