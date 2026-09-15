"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProviderLocation } from "./provider-location-context";

const tabs = [
  { href: "/provider", label: "Đơn", icon: "📋", exact: true, hideForBeauty: false, beautyOnly: false },
  { href: "/provider/incoming", label: "Sắp tới", icon: "🚶", exact: false, hideForBeauty: false, beautyOnly: true },
  { href: "/provider/requests", label: "Yêu cầu", icon: "🔧", exact: false, hideForBeauty: true, beautyOnly: false },
  { href: "/provider/history", label: "Lịch sử", icon: "📦", exact: false, hideForBeauty: false, beautyOnly: false },
  { href: "/provider/live", label: "Trạng thái", icon: "🟢", exact: false, hideForBeauty: false, beautyOnly: false },
  { href: "/provider/settings", label: "Cài đặt", icon: "⚙️", exact: false, hideForBeauty: false, beautyOnly: false },
] as const;

export function ProviderNav() {
  const pathname = usePathname();
  const { activeLocation } = useProviderLocation();
  const isBeauty = activeLocation?.providerType === "BEAUTY";
  const visibleTabs = tabs.filter((tab) => {
    if (isBeauty && tab.hideForBeauty) return false;
    if (!isBeauty && tab.beautyOnly) return false;
    return true;
  });

  return (
    <nav className="provider-nav" aria-label="Điều hướng Provider">
      {visibleTabs.map((tab) => {
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
