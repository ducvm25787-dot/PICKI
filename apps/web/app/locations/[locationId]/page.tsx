"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import {
  addToCart,
  cartItemCount,
  cartTotalVnd,
  readCart,
  type Cart,
} from "../../../lib/cart";
import { formatVnd } from "../../../lib/money";
import {
  fulfillmentLabel,
  liveStatusClass,
  liveStatusLabel,
} from "../../../lib/providers";

type MenuResponse = {
  location: {
    id: string;
    providerType?: string;
    brandName: string;
    displayName: string;
    liveStatus: string;
    tagline: string | null;
    prepMinutes?: number | null;
    etaMinutes?: number | null;
    liveMessage?: string | null;
  };
  items: {
    id: string;
    name: string;
    description: string | null;
    amountVnd: number;
    fulfillmentMode?: string | null;
    paymentPolicy?: string | null;
  }[];
  dailySpecials: {
    id: string;
    offeringId: string;
    name: string;
    description: string | null;
    amountVnd: number;
    quantityRemaining: number;
    fulfillmentMode: string | null;
  }[];
};

type ReviewsResponse = {
  averageRating: number | null;
  count: number;
};

export default function LocationMenuPage() {
  const params = useParams<{ locationId: string }>();
  const router = useRouter();
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewsResponse | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await api("/me").catch(() => {
          router.replace("/login");
          throw new Error("auth");
        });
        const [data, mine, rev] = await Promise.all([
          api<MenuResponse>(`/locations/${params.locationId}/menu`),
          api<{ zones: { zoneId: string }[] }>("/zones/mine"),
          api<ReviewsResponse>(`/locations/${params.locationId}/reviews`),
        ]);
        setMenu(data);
        setReviews(rev);
        setZoneId(mine.zones[0]?.zoneId ?? null);
        setCart(readCart());
      } catch (e) {
        if (e instanceof Error && e.message !== "auth") {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.locationId, router]);

  function handleAdd(item: MenuResponse["items"][0]) {
    if (!menu || !zoneId) {
      setToast("Tham gia Zone trước khi đặt món");
      return;
    }
    const next = addToCart(
      {
        providerLocationId: menu.location.id,
        zoneId,
        brandName: menu.location.brandName,
        providerType: menu.location.providerType,
      },
      { offeringId: item.id, name: item.name, amountVnd: item.amountVnd },
    );
    setCart(next);
    setToast(`Đã thêm ${item.name}`);
    setTimeout(() => setToast(null), 2000);
  }

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải menu…</p>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="container">
        <div className="card">{error ?? "Không tìm thấy quán"}</div>
      </div>
    );
  }

  const { location, items, dailySpecials } = menu;
  const count = cartItemCount(cart);
  const total = cartTotalVnd(cart);

  return (
    <div className="container" style={{ paddingBottom: count > 0 ? 120 : 16 }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: "auto", marginBottom: 16, padding: "8px 12px" }}
        onClick={() => router.back()}
      >
        ← Quay lại
      </button>

      {toast && (
        <div
          className="card"
          style={{ marginBottom: 12, background: "#e8f8ef", borderColor: "#9fd4b5" }}
        >
          <p style={{ margin: 0 }}>{toast}</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>
          {location.brandName}
          <span className={`live-pill ${liveStatusClass(location.liveStatus)}`}>
            {liveStatusLabel(location.liveStatus)}
          </span>
        </h1>
        <p className="stat">{location.displayName}</p>
        {location.tagline && <p style={{ margin: "12px 0 0" }}>{location.tagline}</p>}
        {(location.prepMinutes != null || location.etaMinutes != null) && (
          <p className="stat" style={{ marginTop: 8 }}>
            ⏱ {location.prepMinutes ?? "?"} phút nấu · ~{location.etaMinutes ?? "?"} phút giao
          </p>
        )}
        {location.liveMessage && (
          <p className="stat" style={{ marginTop: 4 }}>
            {location.liveMessage}
          </p>
        )}
        {reviews && reviews.count > 0 && (
          <p className="stat" style={{ marginTop: 8 }}>
            ★ {reviews.averageRating} · {reviews.count} đánh giá (S13)
          </p>
        )}
        {!zoneId && (
          <p className="stat" style={{ marginTop: 12, color: "var(--accent-dark)" }}>
            Tham gia Zone KVL để đặt món.
          </p>
        )}
      </div>

      {dailySpecials.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Món trong ngày (S18)</p>
          {dailySpecials.map((s) => (
            <article key={s.id} className="provider-card" style={{ marginBottom: 8 }}>
              <strong>{s.name}</strong> · {formatVnd(s.amountVnd)}
              <p className="stat">
                Còn {s.quantityRemaining} suất
                {s.fulfillmentMode ? ` · ${fulfillmentLabel(s.fulfillmentMode)}` : ""}
              </p>
            </article>
          ))}
        </div>
      )}

      <div className="card">
        <p className="section-title">Menu</p>
        {items.length === 0 ? (
          <p className="stat">Chưa có món — provider đang cập nhật.</p>
        ) : (
          <div className="provider-list">
            {items.map((item) => (
              <article key={item.id} className="provider-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{item.name}</h3>
                    {item.fulfillmentMode && (
                      <span className="badge" style={{ marginLeft: 6, fontSize: 11 }}>
                        {fulfillmentLabel(item.fulfillmentMode)}
                      </span>
                    )}
                    {item.description && (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {item.description}
                      </p>
                    )}
                    <strong>{formatVnd(item.amountVnd)}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }}
                    onClick={() => handleAdd(item)}
                  >
                    + Thêm
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {count > 0 && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "12px 16px 20px",
            background: "rgba(247,245,242,0.95)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <Link href="/checkout" className="btn" style={{ textAlign: "center" }}>
              Giỏ hàng · {count} món · {formatVnd(total)}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
