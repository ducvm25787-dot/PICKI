"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isContactLiveOnlyShop,
  isCustomerVisitVertical,
  isEducationVertical,
  isHealthVertical,
  isQueueOnlyShop,
  isSportsVertical,
} from "../../lib/providers";
import { useProviderLocation } from "./provider-location-context";

const tabs = [
  { href: "/provider", label: "Đơn", icon: "📋", exact: true, hideForBeauty: false, beautyOnly: false, hideForEducation: false, healthOnly: false, pharmacyOnly: false },
  { href: "/provider/incoming", label: "Sắp tới", icon: "🚶", exact: false, hideForBeauty: false, beautyOnly: true, hideForEducation: true, healthOnly: false, pharmacyOnly: false },
  { href: "/provider/followups", label: "Tái khám", icon: "🔔", exact: false, hideForBeauty: false, beautyOnly: false, hideForEducation: false, healthOnly: true, pharmacyOnly: false },
  { href: "/provider/chats", label: "Hỏi hàng", icon: "💬", exact: false, hideForBeauty: false, beautyOnly: false, hideForEducation: false, healthOnly: false, pharmacyOnly: true },
  { href: "/provider/requests", label: "Yêu cầu", icon: "🔧", exact: false, hideForBeauty: true, beautyOnly: false, hideForEducation: false, healthOnly: false, pharmacyOnly: false },
  { href: "/provider/history", label: "Lịch sử", icon: "📦", exact: false, hideForBeauty: false, beautyOnly: false, hideForEducation: false, healthOnly: false, pharmacyOnly: false },
  { href: "/provider/live", label: "Trạng thái", icon: "🟢", exact: false, hideForBeauty: false, beautyOnly: false, hideForEducation: true, healthOnly: false, pharmacyOnly: false },
  { href: "/provider/settings", label: "Cài đặt", icon: "⚙️", exact: false, hideForBeauty: false, beautyOnly: false, hideForEducation: false, healthOnly: false, pharmacyOnly: false },
] as const;

export function ProviderNav() {
  const pathname = usePathname();
  const { activeLocation } = useProviderLocation();
  const providerType = activeLocation?.providerType;
  const isCustomerVisit = isCustomerVisitVertical(providerType);
  const hideServiceRequests = isQueueOnlyShop(providerType);
  const isHealth = isHealthVertical(providerType);
  const contactLiveOnly = isContactLiveOnlyShop(providerType);
  const hideQueueTabs = isEducationVertical(providerType) || isSportsVertical(providerType);
  const visibleTabs = tabs.filter((tab) => {
    if (contactLiveOnly) {
      return (
        tab.href === "/provider/live" ||
        tab.href === "/provider/settings" ||
        tab.href === "/provider/chats"
      );
    }
    // pharmacyOnly tabs are only for contact-live shops (handled above)
    if (tab.pharmacyOnly) return false;
    if (tab.healthOnly && !isHealth) return false;
    if (hideServiceRequests && tab.hideForBeauty) return false;
    if (hideQueueTabs && tab.hideForEducation) return false;
    if (!isCustomerVisit && tab.beautyOnly) return false;
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
