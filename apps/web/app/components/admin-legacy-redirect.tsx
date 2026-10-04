"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import type { AdminSessionInfo } from "./admin-session-context";

export function AdminLegacyRedirect({ module }: { module: string }) {
  const router = useRouter();

  useEffect(() => {
    void api<AdminSessionInfo>("/admin/session")
      .then((session) => {
        if (session.zones.length === 1) {
          router.replace(`/admin/zones/${session.zones[0]!.slug}/${module}`);
          return;
        }
        router.replace("/admin");
      })
      .catch(() => router.replace("/admin"));
  }, [module, router]);

  return <p className="tagline">Đang chuyển vào khu vực…</p>;
}
