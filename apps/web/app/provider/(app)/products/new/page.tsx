"use client";

import Link from "next/link";
import { ProviderPageShell, useProviderLocation } from "../../../../components/provider-location-context";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  const { locationId } = useProviderLocation();
  return (
    <ProviderPageShell title="Thêm món">
      <Link href="/provider/products" className="stat">
        ← Sản phẩm
      </Link>
      <h1 className="section-title">Thêm món</h1>
      {locationId ? <ProductForm locationId={locationId} /> : null}
    </ProviderPageShell>
  );
}
