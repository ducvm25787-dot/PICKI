"use client";

import Link from "next/link";
import { ProviderPageShell, useProviderLocation } from "../../../../components/provider-location-context";
import { isMarketVertical } from "../../../../../lib/providers";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const title = isMarketVertical(activeLocation?.providerType) ? "Thêm sản phẩm" : "Thêm món";
  return (
    <ProviderPageShell title={title}>
      <Link href="/provider/products" className="stat">
        ← Sản phẩm
      </Link>
      <h1 className="section-title">{title}</h1>
      {locationId ? <ProductForm locationId={locationId} /> : null}
    </ProviderPageShell>
  );
}
