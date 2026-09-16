"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { type ProviderListing } from "../lib/providers";
import { NotificationBell } from "./components/notification-bell";
import { ProviderList } from "./components/provider-list";

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
        <div>
          <div className="logo">Picki</div>
          <div className="tagline">Hôm nay quanh bạn có gì?</div>
        </div>
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
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href={`/zones/${KVL_SLUG}/search`} className="btn btn-secondary" style={{ width: "auto" }}>
                🔍 Tìm món (S12)
              </Link>
              <Link href={`/zones/${KVL_SLUG}/map`} className="btn btn-secondary" style={{ width: "auto" }}>
                🗺 Bản đồ live (S12)
              </Link>
              <Link href="/orders" className="btn btn-secondary" style={{ width: "auto" }}>
                📋 Đơn của tôi
              </Link>
              <Link href="/requests" className="btn btn-secondary" style={{ width: "auto" }}>
                🔧 Yêu cầu dịch vụ
              </Link>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <p className="section-title">GÓC KHU MÌNH</p>
            <p className="stat" style={{ marginBottom: 12 }}>
              Cho tặng, thanh lý, cho thuê, thất lạc trong khu — không phải mạng xã hội
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Link
                href={`/zones/${KVL_SLUG}/classifieds?type=GIVE_AWAY`}
                className="btn btn-secondary"
                style={{ width: "auto" }}
              >
                Cho tặng ({community?.giveAwayCount ?? 0})
              </Link>
              <Link
                href={`/zones/${KVL_SLUG}/classifieds?type=RESALE`}
                className="btn btn-secondary"
                style={{ width: "auto" }}
              >
                Thanh lý ({community?.resaleCount ?? 0})
              </Link>
              <Link
                href={`/zones/${KVL_SLUG}/classifieds?type=CHO_THUE`}
                className="btn btn-secondary"
                style={{ width: "auto" }}
              >
                Cho thuê ({community?.rentCount ?? 0})
              </Link>
              <Link
                href={`/zones/${KVL_SLUG}/classifieds?type=O_GHEP`}
                className="btn btn-secondary"
                style={{ width: "auto" }}
              >
                Ở ghép ({community?.roommateCount ?? 0})
              </Link>
              <Link
                href={`/zones/${KVL_SLUG}/classifieds?type=LOST_FOUND`}
                className="btn btn-secondary"
                style={{ width: "auto" }}
              >
                Thất lạc ({community?.lostFoundCount ?? 0})
              </Link>
              <Link
                href={`/zones/${KVL_SLUG}/classifieds?type=PET_LOST`}
                className="btn btn-secondary"
                style={{ width: "auto" }}
              >
                Thú cưng ({community?.petLostCount ?? 0})
              </Link>
              <Link href="/classifieds/mine" className="btn btn-secondary" style={{ width: "auto" }}>
                Tin của tôi
              </Link>
            </div>
            {community && community.recentListings.length > 0 ? (
              <div className="provider-list">
                {community.recentListings.map((item) => (
                  <Link key={item.id} href={`/classifieds/${item.id}`} className="provider-card">
                    <div className="provider-card-main">
                      <p className="provider-name">{item.title}</p>
                      <p className="stat">
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
                        {" · "}
                        {item.locationLabel}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="stat">Chưa có tin — chọn mục trên để đăng.</p>
            )}
          </div>

          {blocks.map((block) => (
            <div key={block.id} className="card" style={{ marginBottom: 16 }}>
              <p className="section-title">{block.title}</p>
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
              <p className="section-title">Quán yêu thích (S13)</p>
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
