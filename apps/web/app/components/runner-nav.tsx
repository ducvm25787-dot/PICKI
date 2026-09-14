"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/runner", label: "Đơn", icon: "📦", exact: true },
  { href: "/runner/route", label: "Route", icon: "🗺️", exact: false },
  { href: "/runner/history", label: "Lịch sử", icon: "📋", exact: false },
  { href: "/runner/status", label: "Trạng thái", icon: "🟢", exact: false },
  { href: "/runner/settings", label: "Cài đặt", icon: "⚙️", exact: false },
] as const;

export function RunnerNav() {
  const pathname = usePathname();

  return (
    <nav className="runner-nav" aria-label="Điều hướng Runner">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "runner-nav-link active" : "runner-nav-link"}
            aria-current={active ? "page" : undefined}
          >
            <span className="runner-nav-icon" aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
