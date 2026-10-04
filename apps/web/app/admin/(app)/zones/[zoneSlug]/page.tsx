"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ZoneIndexPage() {
  const params = useParams<{ zoneSlug: string }>();
  const router = useRouter();
  const slug = params.zoneSlug;

  useEffect(() => {
    if (slug) router.replace(`/admin/zones/${slug}/overview`);
  }, [router, slug]);

  return <p className="tagline">Đang mở khu vực…</p>;
}
