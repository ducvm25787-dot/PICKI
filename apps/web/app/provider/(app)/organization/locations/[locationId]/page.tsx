"use client";

import { useParams } from "next/navigation";
import { ChainPage } from "../../../../../components/chain-page";

export default function OrganizationLocationPage() {
  const params = useParams<{ locationId: string }>();
  return <ChainPage view="location" locationId={params.locationId} />;
}
