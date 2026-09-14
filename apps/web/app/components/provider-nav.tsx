"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/provider", label: "Đơn", icon: "📋", exact: true },
  { href: "/provider/history", label: "Lịch sử", icon: "📦", exact: false },
  { href: "/provider/live", label: "Trạng thái", icon: "🟢", exact: false },
  { href: "/provider/settings", label: "Cài đặt", icon: "⚙️", exact: false },
] as const;

export function ProviderNav() {
  const pathname = usePathname();

  return (
    <nav className="provider-nav" aria-label="Điều hướng Provider">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "provider-nav-link active" : "provider-nav-link"}
            aria-current={active ? "page" : undefined}
          >
            <span className="provider-nav-icon" aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
