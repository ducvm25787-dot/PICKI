"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./notification-bell";

const tabs = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Đơn hàng", exact: false },
  { href: "/admin/zones", label: "Zones", exact: false },
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
      <div className="admin-nav-bell">
        <NotificationBell />
      </div>
    </nav>
  );
}
