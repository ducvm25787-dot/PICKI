"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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

  const [providers, setProviders] = useState<ProviderListing[]>([]);
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
        const res = await api<{ providers: ProviderListing[] }>(
          `/zones/${slug}/browse/${category.id}?types=${types}`,
        );
        setProviders(res.providers);
        await loadFavorites();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, category, loadFavorites]);

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
          <p className="stat">{category.subs.slice(0, 4).join(" · ")}</p>
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
        <ProviderList
          providers={providers}
          favoriteIds={favoriteIds}
          onToggleFavorite={(id) => void toggleFavorite(id)}
        />
      )}
    </div>
  );
}
