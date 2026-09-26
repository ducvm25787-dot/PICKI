"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { BrandMark } from "../components/brand-mark";
import { NotificationBell } from "../components/notification-bell";

type Me = {
  id: string;
  displayName: string | null;
  identities: { provider: string; externalUserId: string }[];
};

const KVL = "kim-van-kim-lu";

function formatLoginPhone(identities: Me["identities"]): string | null {
  const phone = identities.find((i) => i.provider === "PHONE")?.externalUserId;
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) return `0${digits.slice(2)}`;
  return phone;
}

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void api<Me>("/me")
      .then(setMe)
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!me) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  const phone = formatLoginPhone(me.identities);

  return (
    <div className="container">
      <div className="header-row">
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark />
        </Link>
        <NotificationBell audience="customer" />
      </div>
      <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>Tôi</h1>
      <p className="stat" style={{ marginBottom: 16 }}>
        {me.displayName ?? "Khách Pickee"}
        {phone ? ` · ${phone}` : ""}
      </p>

      <nav className="me-menu" aria-label="Tài khoản">
        <Link href={`/zones/${KVL}`} className="me-menu-item">
          <span>Nhà &amp; địa chỉ</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href={`/zones/${KVL}/browse/food`} className="me-menu-item">
          <span>Chỗ quen / Đã lưu</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href="/activity?tab=done" className="me-menu-item">
          <span>Lịch sử hoạt động</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href="/me/notifications" className="me-menu-item">
          <span>Thông báo</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href="/hanoi/experiences?saved=1" className="me-menu-item">
          <span>Trải nghiệm đã lưu</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href="/hanoi/experiences?interested=1" className="me-menu-item">
          <span>Trải nghiệm đang quan tâm</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href="/hanoi/experiences/mine" className="me-menu-item">
          <span>Trải nghiệm tôi đăng</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href={`/zones/${KVL}/map`} className="me-menu-item">
          <span>Vị trí &amp; Zone</span>
          <span aria-hidden>→</span>
        </Link>
        <a
          href="https://pickee.local/help"
          className="me-menu-item"
          onClick={(e) => {
            e.preventDefault();
            alert("Trợ giúp pilot: liên hệ Ops Zone Kim Văn – Kim Lũ.");
          }}
        >
          <span>Trợ giúp</span>
          <span aria-hidden>→</span>
        </a>
      </nav>

      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 20 }}
        onClick={() => {
          void api("/auth/logout", { method: "POST" }).then(() => router.replace("/login"));
        }}
      >
        Đăng xuất
      </button>
    </div>
  );
}
