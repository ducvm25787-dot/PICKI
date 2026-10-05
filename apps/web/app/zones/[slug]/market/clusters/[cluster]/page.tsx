"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../../lib/api";
import { P6CartNote } from "../../../../../components/p6-cart-note";
import { StallCard, type StallCardData } from "../../../../../components/stall-card";

type Stall = StallCardData & { locationId: string };
type Group = { id: string; label: string; stalls: Stall[] };
type Payload = {
  cluster: { name: string; slug: string; stallCount: number };
  groups: Group[];
};

export default function MarketClusterPage() {
  const params = useParams<{ slug: string; cluster: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const loadFavorites = useCallback(async () => {
    const res = await api<{ favorites: { locationId: string }[] }>("/me/favorites").catch(() => ({
      favorites: [],
    }));
    setFavoriteIds(new Set(res.favorites.map((row) => row.locationId)));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<Payload>(`/zones/${params.slug}/market/clusters/${params.cluster}`);
        setData(res);
        await loadFavorites();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được");
      }
    })();
  }, [params.slug, params.cluster, loadFavorites]);

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

  return (
    <div className="container">
      <Link href={`/zones/${params.slug}/market/clusters`} className="stat">
        ← Các chợ
      </Link>
      <h1 className="page-title">{data?.cluster.name ?? "Chợ"}</h1>
      <P6CartNote />
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {data?.groups.map((group) => (
        <section key={group.id} style={{ marginBottom: 18 }}>
          <h2 className="section-title">{group.label}</h2>
          {group.stalls.map((stall) => (
            <StallCard
              key={stall.locationId}
              stall={stall}
              favorite={favoriteIds.has(stall.locationId)}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              href={`/locations/${stall.locationId}?context=market_trip&cluster=${params.cluster}`}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
