"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { IconHome, IconOrders, IconPin, IconSearch } from "./nav-icons";

const KVL = "kim-van-kim-lu";

const tabs: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { href: "/", label: "Trang chủ", Icon: IconHome },
  { href: `/zones/${KVL}/search`, label: "Tìm", Icon: IconSearch },
  { href: "/orders", label: "Đơn", Icon: IconOrders },
  { href: `/zones/${KVL}`, label: "Zone", Icon: IconPin },
];

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
              <tab.Icon />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
