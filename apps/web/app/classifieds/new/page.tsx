"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  ClassifiedPhotoPicker,
  type ClassifiedPhoto,
} from "../../components/classified-photo-picker";
import { NotificationBell } from "../../components/notification-bell";
import { api } from "../../../lib/api";
import { classifiedTypeLabel } from "../../../lib/classifieds";

const CONDITIONS = [
  { value: "NEW", label: "Mới" },
  { value: "LIKE_NEW", label: "Như mới" },
  { value: "GOOD", label: "Tốt" },
  { value: "FAIR", label: "Khá" },
] as const;

export default function NewClassifiedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const zoneId = searchParams.get("zoneId") ?? "";
  const listingType =
    searchParams.get("type") === "GIVE_AWAY" ? ("GIVE_AWAY" as const) : ("RESALE" as const);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceVnd, setPriceVnd] = useState("");
  const [condition, setCondition] = useState<string>("GOOD");
  const [locationLabel, setLocationLabel] = useState("");
  const [photos, setPhotos] = useState<ClassifiedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!zoneId) {
      setError("Thiếu Zone — quay lại trang chủ.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        zoneId,
        listingType,
        title: title.trim(),
        description: description.trim() || undefined,
        condition,
        locationLabel: locationLabel.trim(),
        photoUrls: photos.map((p) => p.url),
      };
      if (listingType === "RESALE") {
        body.priceVnd = Number.parseInt(priceVnd.replace(/\D/g, ""), 10);
      }
      const created = await api<{ id: string }>("/classifieds", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/classifieds/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đăng được tin");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Đăng tin</h1>
          <p className="stat">{classifiedTypeLabel(listingType)} · GÓC KHU MÌNH</p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      <form className="card" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Tiêu đề</span>
          <input
            type="text"
            value={title}
            maxLength={120}
            required
            placeholder="VD: Xe đẩy em bé Aprica"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="field">
          <ClassifiedPhotoPicker
            photos={photos}
            onChange={setPhotos}
            disabled={submitting}
          />
        </div>

        <label className="field">
          <span>Mô tả</span>
          <textarea
            value={description}
            maxLength={2000}
            rows={4}
            placeholder="Mô tả ngắn, tình trạng, cách giao/lấy…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {listingType === "RESALE" ? (
          <label className="field">
            <span>Giá (VND)</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceVnd}
              required
              placeholder="350000"
              onChange={(e) => setPriceVnd(e.target.value)}
            />
          </label>
        ) : null}

        <label className="field">
          <span>Tình trạng</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Vị trí lấy/giao</span>
          <input
            type="text"
            value={locationLabel}
            maxLength={120}
            required
            placeholder="VD: CT12 — tầng 15, gặp tại sảnh"
            onChange={(e) => setLocationLabel(e.target.value)}
          />
        </label>

        {error ? <p className="stat" style={{ color: "#c0392b" }}>{error}</p> : null}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Đang đăng…" : "Đăng tin"}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        <Link href="/" className="stat">
          ← Trang chủ
        </Link>
      </p>
    </div>
  );
}
