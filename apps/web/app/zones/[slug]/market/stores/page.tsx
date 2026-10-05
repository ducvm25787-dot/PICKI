"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../lib/api";
import { P6CartNote } from "../../../../components/p6-cart-note";
import { StallCard, type StallCardData } from "../../../../components/stall-card";

type Stall = StallCardData & { locationId: string };
type Group = { id: string; label: string; stalls: Stall[] };

export default function MarketStoresPage() {
  const slug = useParams<{ slug: string }>().slug;
  const [groups, setGroups] = useState<Group[]>([]);
  const [stores, setStores] = useState<Stall[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    const res = await api<{ favorites: { locationId: string }[] }>("/me/favorites").catch(() => ({
      favorites: [],
    }));
    setFavoriteIds(new Set(res.favorites.map((row) => row.locationId)));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<{ groups: Group[]; stores: Stall[] }>(`/zones/${slug}/market/stores`);
        setGroups(res.groups);
        setStores(res.stores);
        await loadFavorites();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được");
      }
    })();
  }, [slug, loadFavorites]);

  async function toggleFavorite(locationId: string) {
    if (favoriteIds.has(locationId)) {
      await api(`/me/favorites/${locationId}`, { method: "DELETE" });
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(locationId);
        return next;
      });
    } else {
      await api("/me/favorites", { method: "POST", body: JSON.stringify({ locationId }) });
      setFavoriteIds((prev) => new Set(prev).add(locationId));
    }
  }

  const familiar = stores.filter((store) => favoriteIds.has(store.locationId));

  return (
    <div className="container">
      <Link href={`/zones/${slug}/market`} className="stat">
        ← Đi chợ
      </Link>
      <h1 className="page-title">Cửa hàng</h1>
      <p className="stat">Mua trực tiếp từ cửa hàng chuyên bạn tin dùng</p>
      <P6CartNote />
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {familiar.length > 0 ? (
        <section style={{ marginBottom: 18 }}>
          <h2 className="section-title">Cửa hàng quen</h2>
          {familiar.map((stall) => (
            <StallCard
              key={`fav-${stall.locationId}`}
              stall={stall}
              favorite
              onToggleFavorite={(id) => void toggleFavorite(id)}
              href={`/locations/${stall.locationId}?context=direct`}
            />
          ))}
        </section>
      ) : null}
      {groups.map((group) => (
        <section key={group.id} style={{ marginBottom: 18 }}>
          <h2 className="section-title">{group.label}</h2>
          {group.stalls.map((stall) => (
            <StallCard
              key={stall.locationId}
              stall={stall}
              favorite={favoriteIds.has(stall.locationId)}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              href={`/locations/${stall.locationId}?context=direct`}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
