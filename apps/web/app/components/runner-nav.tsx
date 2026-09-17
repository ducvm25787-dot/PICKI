"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconHistory,
  IconLive,
  IconOrders,
  IconRoute,
  IconSettings,
} from "./nav-icons";

const tabs: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  exact: boolean;
}[] = [
  { href: "/runner", label: "Đơn", Icon: IconOrders, exact: true },
  { href: "/runner/route", label: "Tiến trình", Icon: IconRoute, exact: false },
  { href: "/runner/history", label: "Lịch sử", Icon: IconHistory, exact: false },
  { href: "/runner/status", label: "Trạng thái", Icon: IconLive, exact: false },
  { href: "/runner/settings", label: "Cài đặt", Icon: IconSettings, exact: false },
];

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
              <tab.Icon />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
