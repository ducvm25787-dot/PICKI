"use client";

import { useParams } from "next/navigation";
import { ChainPage } from "../../../../../components/chain-page";

export default function OrganizationProductPage() {
  const params = useParams<{ offeringId: string }>();
  return <ChainPage view="product" offeringId={params.offeringId} />;
}
