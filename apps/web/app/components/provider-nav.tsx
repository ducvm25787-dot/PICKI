"use client";

import { CHAIN_SCOPE_STORAGE_KEY, decodeChainScope } from "@picki/shared";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  isContactLiveOnlyShop,
  isCustomerVisitVertical,
  isEducationVertical,
  isFoodBreakfastVertical,
  isHealthVertical,
  isHomeCookVertical,
  isHomeServiceVertical,
  isMarketVertical,
  isQueueOnlyShop,
  isSportsVertical,
  isSupermarket,
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
    href: "/provider/subscription",
    label: "Gói dịch vụ",
    Icon: IconClipboard,
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

const LOCAL_MODE = "picki-provider-local";

export function ProviderNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeLocation, chain } = useProviderLocation();
  const onChain = pathname.startsWith("/provider/organization");
  const scopeType = searchParams.get("scopeType");
  const scopeId = searchParams.get("scopeId");
  const [rememberedQuery, setRememberedQuery] = useState("");
  useEffect(() => {
    const scope = decodeChainScope(sessionStorage.getItem(CHAIN_SCOPE_STORAGE_KEY));
    setRememberedQuery(scope ? `?scopeType=${encodeURIComponent(scope.scopeType)}&scopeId=${encodeURIComponent(scope.scopeId)}` : "");
  }, [scopeType, scopeId]);
  const scopeQuery = onChain && scopeType && scopeId
    ? `?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}`
    : onChain ? rememberedQuery : "";
  const providerType = activeLocation?.providerType;
  const isCustomerVisit = isCustomerVisitVertical(providerType);
  const hideServiceRequests = isQueueOnlyShop(providerType);
  const isHealth = isHealthVertical(providerType);
  const isHomeCook = isHomeCookVertical(providerType);
  const foodBreakfast = isFoodBreakfastVertical(providerType);
  const contactLiveOnly = isContactLiveOnlyShop(providerType);
  const hideQueueTabs = isEducationVertical(providerType) || isSportsVertical(providerType);
  const foodShop = isFoodBreakfastVertical(providerType);
  const marketShop = isMarketVertical(providerType) && activeLocation?.sellNowEnabled === true;
  const visibleTabs = foodShop
    ? [
        { href: "/provider/board", label: "Hôm nay", Icon: IconLive, exact: false },
        { href: "/provider", label: "Đơn", Icon: IconClipboard, exact: true },
        { href: "/provider/products", label: "Sản phẩm", Icon: IconOrders, exact: false },
        { href: "/provider/selling", label: "Cách bán", Icon: IconDinner, exact: false },
        { href: "/provider/finance", label: "Tài chính", Icon: IconClipboard, exact: false },
        { href: "/provider/subscription", label: "Gói dịch vụ", Icon: IconClipboard, exact: false },
        { href: "/provider/settings", label: "Cài đặt gian hàng", Icon: IconSettings, exact: false },
      ]
    : marketShop
      ? [
          { href: "/provider/board", label: "Hôm nay", Icon: IconLive, exact: false },
          { href: "/provider", label: "Đơn", Icon: IconClipboard, exact: true },
          { href: "/provider/products", label: "Sản phẩm", Icon: IconOrders, exact: false },
          { href: "/provider/finance", label: "Tài chính", Icon: IconClipboard, exact: false },
          { href: "/provider/subscription", label: "Gói dịch vụ", Icon: IconClipboard, exact: false },
          { href: "/provider/settings", label: "Cài đặt gian hàng", Icon: IconSettings, exact: false },
        ]
    : tabs.filter((tab) => {
    if (isSupermarket(providerType)) {
      return tab.href === "/provider/live" || tab.href === "/provider/settings";
    }
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

  const chainTabs = [
    { href: "/provider/organization", label: "Tổng quan", exact: true },
    { href: "/provider/organization/locations", label: "Điểm bán", exact: false },
    { href: "/provider/organization/orders", label: "Đơn hàng", exact: false },
    { href: "/provider/organization/products", label: "Sản phẩm", exact: false },
    { href: "/provider/organization/today", label: "Hôm nay", exact: false },
    { href: "/provider/organization/finance", label: "Tài chính", exact: false },
    ...(chain?.canManageCampaigns
      ? [{ href: "/provider/organization/campaigns", label: "Chương trình", exact: false }]
      : []),
    ...(chain?.canManageMembers
      ? [{ href: "/provider/organization/members", label: "Người dùng", exact: false }]
      : []),
  ];

  if (chain?.chainEnabled && onChain) {
    return (
      <nav className="provider-nav" aria-label="Điều hướng chuỗi">
        {chainTabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={`${tab.href}${scopeQuery}`}
              className={active ? "provider-nav-link active" : "provider-nav-link"}
              aria-current={active ? "page" : undefined}
              onClick={() => sessionStorage.removeItem(LOCAL_MODE)}
            >
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="provider-nav" aria-label="Điều hướng Provider">
      {chain?.canManageCampaigns && !chain.chainEnabled ? (
        <Link
          href={`/provider/organization/campaigns${rememberedQuery}`}
          className={pathname.startsWith("/provider/organization/campaigns") ? "provider-nav-link active" : "provider-nav-link"}
        >
          <span>Chương trình</span>
        </Link>
      ) : null}
      {chain?.chainEnabled ? (
        <Link
          href={`/provider/organization${rememberedQuery}`}
          className="provider-nav-link"
          onClick={() => sessionStorage.removeItem(LOCAL_MODE)}
        >
          <span>Chuỗi</span>
        </Link>
      ) : null}
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
