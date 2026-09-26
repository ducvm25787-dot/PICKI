"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Đơn hàng", exact: false },
  { href: "/admin/audit", label: "Audit", exact: false },
  { href: "/admin/zones", label: "Zones", exact: false },
  { href: "/admin/experiences", label: "Trải nghiệm", exact: false },
  { href: "/admin/settings", label: "Cài đặt", exact: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Điều hướng Ops">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "admin-nav-link active" : "admin-nav-link"}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
