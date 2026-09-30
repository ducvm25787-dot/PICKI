"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../../components/provider-location-context";
import { api } from "../../../../../lib/api";
import { ProductForm, type FoodProduct } from "../product-form";

export default function EditProductPage() {
  const params = useParams();
  const offeringId = String(params.offeringId);
  const { locationId } = useProviderLocation();
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    void api<{ product: FoodProduct }>(`/provider/locations/${locationId}/products/${offeringId}`)
      .then((res) => setProduct(res.product))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được món"));
  }, [locationId, offeringId]);

  return (
    <ProviderPageShell title="Sửa món">
      <Link href="/provider/products" className="stat">
        ← Sản phẩm
      </Link>
      <h1 className="section-title">Sửa món</h1>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {locationId && product ? <ProductForm locationId={locationId} product={product} /> : null}
      {!error && !product ? <p className="tagline">Đang tải…</p> : null}
    </ProviderPageShell>
  );
}
