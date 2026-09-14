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
          const discovery = await api<{ blocks: DiscoveryBlock[] }>(
            `/zones/${KVL_SLUG}/discovery`,
          );
          setBlocks(discovery.blocks);
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
        <NotificationBell />
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
            </div>
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
