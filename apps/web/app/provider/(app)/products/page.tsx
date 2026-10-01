"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";
import { isMarketVertical } from "../../../../lib/providers";
import type { FoodProduct } from "./product-form";

export default function ProviderProductsPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const market = isMarketVertical(activeLocation?.providerType);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<{ products: FoodProduct[] }>(`/provider/locations/${locationId}/products`);
    setProducts(res.products);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [load]);

  return (
    <ProviderPageShell title="Sản phẩm">
      <div className="board-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1 className="section-title" style={{ margin: 0 }}>
          Sản phẩm
        </h1>
        <Link href="/provider/products/new" className="btn" style={{ width: "auto" }}>
          {market ? "Thêm sản phẩm" : "Thêm món"}
        </Link>
      </div>
      {market ? (
        <p className="tagline">Sản phẩm giữ trong catalog. Hôm nay bán bao nhiêu thì nhập ở tab Hôm nay.</p>
      ) : (
        <p className="tagline">Một món tạo một lần. Sáng, tối và bán ngay dùng chung món này.</p>
      )}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {products.map((product) => (
        <Link
          key={product.id}
          href={`/provider/products/${product.id}`}
          className="card"
          style={{ marginBottom: 8, display: "flex", gap: 12, textDecoration: "none", color: "inherit" }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              width={64}
              height={64}
              style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
            />
          ) : (
            <span
              aria-hidden
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                background: "#f3efe8",
                flexShrink: 0,
              }}
            />
          )}
          <span>
            <strong>{product.name}</strong>
            <span style={{ display: "block", marginTop: 4 }}>
              {formatVnd(product.priceVnd)} / {product.unit}
              {product.categoryName ? ` · ${product.categoryName}` : ""}
              {product.active ? "" : " · Đã tắt"}
            </span>
            {!market && product.onBreakfastMenu ? (
              <span className="stat" style={{ display: "block" }}>
                Có trên menu sáng
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </ProviderPageShell>
  );
}
