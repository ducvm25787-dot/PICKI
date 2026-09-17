"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  isContactLiveOnlyShop,
  isCustomerVisitVertical,
  isEducationVertical,
  isFoodBreakfastVertical,
  isHealthVertical,
  isHomeCookVertical,
  isHomeServiceVertical,
  isQueueOnlyShop,
  isSportsVertical,
} from "../../lib/providers";
import {
  IconBell,
  IconChat,
  IconClipboard,
  IconDinner,
  IconHistory,
  IconLive,
  IconOrders,
  IconSettings,
  IconWalk,
  IconWrench,
} from "./nav-icons";
import { useProviderLocation } from "./provider-location-context";

type Tab = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  exact: boolean;
  hideForBeauty: boolean;
  beautyOnly: boolean;
  hideForEducation: boolean;
  healthOnly: boolean;
  pharmacyOnly: boolean;
  homeCookOnly: boolean;
  foodBreakfastOnly: boolean;
};

const tabs: Tab[] = [
  {
    href: "/provider",
    label: "Đơn",
    Icon: IconClipboard,
    exact: true,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/family-dinner",
    label: "Bữa tối",
    Icon: IconDinner,
    exact: false,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: true,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/breakfast",
    label: "Sáng mai",
    Icon: IconDinner,
    exact: false,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: true,
  },
  {
    href: "/provider/incoming",
    label: "Sắp tới",
    Icon: IconWalk,
    exact: false,
    hideForBeauty: false,
    beautyOnly: true,
    hideForEducation: true,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/followups",
    label: "Tái khám",
    Icon: IconBell,
    exact: false,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: true,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/chats",
    label: "Hỏi hàng",
    Icon: IconChat,
    exact: false,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: false,
    pharmacyOnly: true,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/requests",
    label: "Yêu cầu",
    Icon: IconWrench,
    exact: false,
    hideForBeauty: true,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/history",
    label: "Lịch sử",
    Icon: IconOrders,
    exact: false,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/live",
    label: "Trạng thái",
    Icon: IconLive,
    exact: false,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: true,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
  {
    href: "/provider/settings",
    label: "Cài đặt",
    Icon: IconSettings,
    exact: false,
    hideForBeauty: false,
    beautyOnly: false,
    hideForEducation: false,
    healthOnly: false,
    pharmacyOnly: false,
    homeCookOnly: false,
    foodBreakfastOnly: false,
  },
];

export function ProviderNav() {
  const pathname = usePathname();
  const { activeLocation } = useProviderLocation();
  const providerType = activeLocation?.providerType;
  const isCustomerVisit = isCustomerVisitVertical(providerType);
  const hideServiceRequests = isQueueOnlyShop(providerType);
  const isHealth = isHealthVertical(providerType);
  const isHomeCook = isHomeCookVertical(providerType);
  const foodBreakfast = isFoodBreakfastVertical(providerType);
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
    if (tab.pharmacyOnly) return false;
    if (tab.homeCookOnly && !isHomeCook) return false;
    if (tab.foodBreakfastOnly && !foodBreakfast) return false;
    if (tab.foodBreakfastOnly && isHomeServiceVertical(providerType)) return false;
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
              <tab.Icon />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
