"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const KVL = "kim-van-kim-lu";

const tabs = [
  { href: "/", label: "Trang chủ", icon: "🏠" },
  { href: `/zones/${KVL}/search`, label: "Tìm", icon: "🔍" },
  { href: "/orders", label: "Đơn", icon: "📦" },
  { href: `/zones/${KVL}`, label: "Zone", icon: "📍" },
] as const;

export function CustomerNav() {
  const pathname = usePathname();

  return (
    <nav className="customer-nav" aria-label="Điều hướng chính">
      {tabs.map((tab) => {
        const active =
          tab.href === "/"
            ? pathname === "/"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "customer-nav-link active" : "customer-nav-link"}
            aria-current={active ? "page" : undefined}
          >
            <span className="customer-nav-icon" aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
