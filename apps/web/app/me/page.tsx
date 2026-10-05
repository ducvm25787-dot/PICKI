"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { compressImageFile } from "../../lib/compress-image";
import { BrandMark } from "../components/brand-mark";
import { NotificationBell } from "../components/notification-bell";

type Me = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(blob);
  });
}

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [zaloName, setZaloName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<Me>("/me")
      .then((user) => {
        setMe(user);
        setZaloName(user.displayName ?? "");
        setPreview(user.avatarUrl);
      })
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
  const initial = (zaloName.trim() || "K").slice(0, 1).toUpperCase();

  async function saveProfile() {
    const name = zaloName.trim();
    if (name.length < 1) {
      setMessage("Nhập tên hiển thị trên Zalo.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (photo) {
        const blob = await compressImageFile(photo);
        const dataUrl = await blobToDataUrl(blob);
        const updated = await api<Me>("/me/avatar", {
          method: "POST",
          body: JSON.stringify({ dataUrl }),
        });
        setMe(updated);
        setPreview(updated.avatarUrl);
        setPhoto(null);
      }
      const updated = await api<Me>("/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: name }),
      });
      setMe(updated);
      setMessage("Đã lưu. Quán sẽ thấy tên và ảnh này trên đơn.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="header-row">
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <BrandMark />
        </Link>
        <NotificationBell audience="customer" />
      </div>
      <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>Tôi</h1>
      <p className="stat" style={{ marginBottom: 12 }}>
        {phone ? phone : "Tài khoản Pickee"}
      </p>
      <section className="card" style={{ marginBottom: 16 }}>
        <p className="section-title" style={{ marginTop: 0 }}>
          Tên Zalo
        </p>
        <p className="stat" style={{ marginTop: 0 }}>
          Quán nhìn tên và ảnh này trên đơn để biết khách là ai, có quen không. Nhập đúng tên đang hiện trên Zalo.
        </p>
        <div className="order-customer-face" style={{ marginBottom: 12 }}>
          {preview ? (
            <img src={preview} alt="" className="order-customer-avatar" />
          ) : (
            <span className="order-customer-avatar order-customer-avatar--empty" aria-hidden>
              {initial}
            </span>
          )}
          <label className="btn btn-secondary" style={{ margin: 0 }}>
            Chọn ảnh
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setPhoto(file);
                if (file) setPreview(URL.createObjectURL(file));
              }}
            />
          </label>
        </div>
        <label className="stat" htmlFor="zalo-name">
          Tên hiển thị Zalo
        </label>
        <input
          id="zalo-name"
          value={zaloName}
          maxLength={120}
          placeholder="Ví dụ: Lan Nguyễn"
          onChange={(event) => setZaloName(event.target.value)}
          style={{ width: "100%", margin: "6px 0 12px" }}
        />
        <button type="button" className="btn" disabled={saving} onClick={() => void saveProfile()}>
          {saving ? "Đang lưu…" : "Lưu tên và ảnh"}
        </button>
        {message ? (
          <p className="stat" style={{ margin: "8px 0 0" }}>
            {message}
          </p>
        ) : null}
      </section>

      <nav className="me-menu" aria-label="Tài khoản">
        <Link href={`/zones/${KVL}`} className="me-menu-item">
          <span>Nhà &amp; địa chỉ</span>
          <span aria-hidden>→</span>
        </Link>
        <Link href="/me/familiar" className="me-menu-item">
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
