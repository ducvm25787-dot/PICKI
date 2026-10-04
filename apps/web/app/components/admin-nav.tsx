"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { AdminSessionInfo } from "./admin-session-context";

const ZONE_TABS = [
  { module: "overview", label: "Tổng quan" },
  { module: "accounts", label: "Tài khoản" },
  { module: "providers", label: "Quán" },
  { module: "runners", label: "Tài xế" },
  { module: "reviews", label: "Duyệt" },
  { module: "campaigns", label: "Chương trình" },
  { module: "orders", label: "Đơn hàng" },
  { module: "finance", label: "Tài chính" },
  { module: "logs", label: "Nhật ký" },
  { module: "settings", label: "Cài đặt" },
] as const;

const GLOBAL_TABS = [
  { href: "/admin", label: "Tổng quan", exact: true },
  { href: "/admin/zones", label: "Khu vực", exact: false },
  { href: "/admin/experiences", label: "Trải nghiệm", exact: false },
  { href: "/admin/settings", label: "Banner", exact: false },
  { href: "/admin/finance", label: "Tài chính", exact: false },
  { href: "/admin/audit", label: "Nhật ký", exact: false },
  { href: "/admin/campaigns", label: "Chương trình", exact: false },
] as const;

const CITY_TABS = [
  { href: "/admin/experiences", label: "Trải nghiệm", exact: false },
  { href: "/admin/settings", label: "Banner", exact: false },
] as const;

function zoneSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/zones\/([^/]+)/);
  return match?.[1] ?? null;
}

export function AdminNav() {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const [session, setSession] = useState<AdminSessionInfo | null>(null);

  useEffect(() => {
    void api<AdminSessionInfo>("/admin/session")
      .then(setSession)
      .catch(() => setSession(null));
  }, [pathname]);
  const slug = zoneSlugFromPath(pathname);
  const inZone = slug != null && session?.zones.some((zone) => zone.slug === slug);
  const globalReader = session?.superAdmin === true || session?.supportReadOnlyGlobal === true;
  const cityReader = (session?.cities.length ?? 0) > 0;

  function openZone(nextSlug: string) {
    const moduleMatch = pathname.match(/^\/admin\/zones\/[^/]+\/([^/]+)/);
    const moduleName = moduleMatch?.[1];
    const keep = ZONE_TABS.some((tab) => tab.module === moduleName) ? moduleName : "overview";
    router.push(`/admin/zones/${nextSlug}/${keep}`);
  }

  return (
    <nav className="admin-nav" aria-label="Điều hướng Ops">
      <div className="admin-nav-scope">
        <Link href={globalReader || cityReader ? "/admin" : session?.zones[0] ? `/admin/zones/${session.zones[0].slug}/overview` : "/admin"} className="admin-nav-brand">
          Pickee Ops
        </Link>
        {session && (session.zones.length > 0 || globalReader) ? (
          <select
            aria-label="Khu vực"
            className="admin-zone-select"
            value={inZone ? slug ?? "" : ""}
            onChange={(event) => {
              const next = event.target.value;
              if (!next) router.push("/admin");
              else openZone(next);
            }}
          >
            {globalReader ? <option value="">Tất cả khu vực</option> : null}
            {session.zones.map((zone) => (
              <option key={zone.id} value={zone.slug}>
                {zone.displayName}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="admin-nav-tabs">
        {inZone && slug
          ? ZONE_TABS.map((tab) => {
              const href = `/admin/zones/${slug}/${tab.module}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link key={tab.module} href={href} className={active ? "admin-nav-link active" : "admin-nav-link"} aria-current={active ? "page" : undefined}>
                  {tab.label}
                </Link>
              );
            })
          : globalReader
            ? GLOBAL_TABS.filter((tab) => tab.href !== "/admin/campaigns" || session?.superAdmin).map((tab) => {
                const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
                return (
                  <Link key={tab.href} href={tab.href} className={active ? "admin-nav-link active" : "admin-nav-link"} aria-current={active ? "page" : undefined}>
                    {tab.label}
                  </Link>
                );
              })
            : cityReader
              ? CITY_TABS.map((tab) => {
                  const active = pathname.startsWith(tab.href);
                  return (
                    <Link key={tab.href} href={tab.href} className={active ? "admin-nav-link active" : "admin-nav-link"} aria-current={active ? "page" : undefined}>
                      {tab.label}
                    </Link>
                  );
                })
              : null}
      </div>
    </nav>
  );
}
