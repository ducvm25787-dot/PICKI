"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { IconActivity, IconHome, IconMe, IconSearch, IconUsers } from "./nav-icons";

const KVL = "kim-van-kim-lu";

const tabs: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  match?: (pathname: string) => boolean;
}[] = [
  { href: "/", label: "Trang chủ", Icon: IconHome },
  {
    href: "/activity",
    label: "Hoạt động",
    Icon: IconActivity,
    match: (p) =>
      p === "/activity" ||
      p.startsWith("/activity/") ||
      p.startsWith("/orders") ||
      p.startsWith("/requests"),
  },
  {
    href: `/zones/${KVL}/search`,
    label: "Tìm quanh",
    Icon: IconSearch,
    match: (p) => p.includes("/search"),
  },
  { href: `/zones/${KVL}/classifieds`, label: "Góc khu", Icon: IconUsers },
  {
    href: "/me",
    label: "Tôi",
    Icon: IconMe,
    match: (p) => p === "/me" || p.startsWith("/me/"),
  },
];

export function CustomerNav() {
  const pathname = usePathname();

  return (
    <nav className="customer-nav" aria-label="Điều hướng chính">
      {tabs.map((tab) => {
        const active = tab.match
          ? tab.match(pathname)
          : tab.href === "/"
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
              <tab.Icon />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
