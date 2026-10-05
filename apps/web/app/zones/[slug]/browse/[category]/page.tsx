"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../lib/api";
import { getHomeCategory } from "../../../../../lib/categories";
import { type ProviderListing } from "../../../../../lib/providers";
import { NotificationBell } from "../../../../components/notification-bell";
import { ProviderList } from "../../../../components/provider-list";

export default function CategoryBrowsePage() {
  const params = useParams<{ slug: string; category: string }>();
  const slug = params.slug;
  const categoryId = params.category;
  const category = getHomeCategory(categoryId);
  const morning = useSearchParams().get("when") === "morning";

  const [providers, setProviders] = useState<ProviderListing[]>([]);
  const [shelf, setShelf] = useState<{ local: ProviderListing[]; supermarkets: ProviderListing[] } | null>(null);
  const [lanes, setLanes] = useState<{ minimart: ProviderListing[]; convenience: ProviderListing[] } | null>(null);
  const [goodsCategories, setGoodsCategories] = useState<{ id: string; name: string }[]>([]);
  const [goodsId, setGoodsId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    const res = await api<{ favorites: { locationId: string }[] }>("/me/favorites").catch(
      () => ({ favorites: [] }),
    );
    setFavoriteIds(new Set(res.favorites.map((f) => f.locationId)));
  }, []);

  useEffect(() => {
    if (!category) {
      setError("Danh mục không tồn tại");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const types = encodeURIComponent(category.providerTypes.join(","));
        const goods = category.id === "market" && goodsId ? `&goods=${goodsId}` : "";
        const res = await api<{
          providers: ProviderListing[];
          shelf?: { local: ProviderListing[]; supermarkets: ProviderListing[] };
          goodsCategories?: { id: string; name: string }[];
          lanes?: { minimart: ProviderListing[]; convenience: ProviderListing[] };
        }>(`/zones/${slug}/browse/${category.id}?types=${types}${goods}`);
        setProviders(res.providers);
        setShelf(res.shelf ?? null);
        setLanes(res.lanes ?? null);
        setGoodsCategories(res.goodsCategories ?? []);
        await loadFavorites();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, category, goodsId, loadFavorites]);

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

  if (!category) {
    return (
      <div className="container">
        <p className="stat">Danh mục không hợp lệ.</p>
        <Link href="/">← Về trang chủ</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row" style={{ marginBottom: 12 }}>
        <div>
          <Link href="/" className="stat" style={{ display: "inline-block", marginBottom: 6 }}>
            ← Trang chủ
          </Link>
          <h1 className="page-title" style={{ margin: 0 }}>
            <span aria-hidden style={{ marginRight: 8 }}>
              {category.emoji}
            </span>
            {category.label}
          </h1>
          {category.id === "market" ? null : (
            <p className="stat">{category.subs.slice(0, 4).join(" · ")}</p>
          )}
        </div>
        <NotificationBell audience="customer" />
      </div>

      {category.deepLinks && category.deepLinks.length > 0 ? (
        <div className="chip-row" style={{ marginBottom: 16 }} aria-label="Lối tắt trong danh mục">
          {category.deepLinks.map((d) => (
            <Link key={d.href} href={d.href} className="chip">
              {d.label}
            </Link>
          ))}
        </div>
      ) : null}

      <p style={{ marginBottom: 12 }}>
        <Link
          href={`/zones/${slug}/map?category=${category.id}&types=${encodeURIComponent(category.providerTypes.join(","))}`}
          className="order-phone-link"
        >
          Xem trên bản đồ
        </Link>
      </p>

      {category.id === "market" ? (
        <div className="location-tabs" role="tablist" aria-label="Cách đặt" style={{ marginBottom: 16 }}>
          <Link href={`/zones/${slug}/browse/market`} className="location-tab" aria-selected={!morning}>
            Đi chợ ngay
          </Link>
          <Link href={`/zones/${slug}/browse/market?when=morning`} className="location-tab" aria-selected={morning}>
            Sáng mai giao
          </Link>
        </div>
      ) : null}

      {category.id === "market" && goodsCategories.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }} aria-label="Nhóm hàng">
          <button
            type="button"
            className={goodsId ? "btn btn-secondary" : "btn"}
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => setGoodsId(null)}
          >
            Tất cả
          </button>
          {goodsCategories.map((goods) => (
            <button
              key={goods.id}
              type="button"
              className={goodsId === goods.id ? "btn" : "btn btn-secondary"}
              style={{ width: "auto", padding: "8px 12px" }}
              onClick={() => setGoodsId(goods.id)}
            >
              {goods.name}
            </button>
          ))}
        </div>
      ) : null}

      {category.id === "beauty" ? (
        <p className="stat" style={{ marginBottom: 12 }}>
          Đang lọc tiệm làm đẹp · tag dịch vụ con (cắt tóc, nail…) sẽ bổ sung sau.
        </p>
      ) : null}

      {favoriteError ? (
        <p className="stat" style={{ color: "#b91c1c", marginBottom: 12 }}>
          {favoriteError}
        </p>
      ) : null}

      {loading ? (
        <p className="stat">Đang tải…</p>
      ) : error ? (
        <div className="card">
          <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
        </div>
      ) : (
        category.id === "convenience" && lanes ? (
          <>
            <h2 className="section-title">Minimart</h2>
            <ProviderList
              providers={lanes.minimart}
              favoriteIds={favoriteIds}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              emptyLabel="Chưa có minimart trong Zone."
            />
            <h2 className="section-title" style={{ marginTop: 20 }}>
              Tiện lợi
            </h2>
            <ProviderList
              providers={lanes.convenience}
              favoriteIds={favoriteIds}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              emptyLabel="Chưa có cửa tiện lợi trong Zone."
            />
          </>
        ) : category.id === "market" && shelf ? (
          <>
            <h2 className="section-title">Quanh bạn</h2>
            <ProviderList
              providers={shelf.local}
              favoriteIds={favoriteIds}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              emptyLabel="Chưa có cửa hàng trong nhóm này."
              hrefQuery={morning ? "?when=morning" : undefined}
            />
            {shelf.supermarkets.length > 0 ? (
              <>
                <h2 className="section-title" style={{ marginTop: 20 }}>
                  Siêu thị gần đây
                </h2>
                <ProviderList
                  providers={shelf.supermarkets}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={(id) => void toggleFavorite(id)}
                  hrefQuery={morning ? "?when=morning" : undefined}
                />
              </>
            ) : null}
          </>
        ) : (
        <ProviderList
          providers={providers}
          favoriteIds={favoriteIds}
          onToggleFavorite={(id) => void toggleFavorite(id)}
        />
        )
      )}
    </div>
  );
}
