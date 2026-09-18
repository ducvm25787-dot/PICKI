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
import {
  classifiedTypeLabel,
  isHousingListingType,
  isLostListingType,
} from "../../../lib/classifieds";

const CONDITIONS = [
  { value: "NEW", label: "Mới" },
  { value: "LIKE_NEW", label: "Như mới" },
  { value: "GOOD", label: "Tốt" },
  { value: "FAIR", label: "Khá" },
] as const;

type ListingType =
  | "RESALE"
  | "GIVE_AWAY"
  | "CHO_THUE"
  | "O_GHEP"
  | "LOST_FOUND"
  | "PET_LOST";

function parseType(raw: string | null): ListingType {
  if (
    raw === "GIVE_AWAY" ||
    raw === "CHO_THUE" ||
    raw === "O_GHEP" ||
    raw === "LOST_FOUND" ||
    raw === "PET_LOST"
  ) {
    return raw;
  }
  return "RESALE";
}

export default function NewClassifiedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const zoneId = searchParams.get("zoneId") ?? "";
  const listingType = parseType(searchParams.get("type"));
  const housing = isHousingListingType(listingType);
  const lost = isLostListingType(listingType);

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
    if (listingType === "PET_LOST" && photos.length < 1) {
      setError("Tin thú cưng thất lạc cần ít nhất 1 ảnh");
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
        locationLabel: locationLabel.trim(),
        photoUrls: photos.map((p) => p.url),
      };
      if (!housing && !lost) {
        body.condition = condition;
      }
      if (listingType === "RESALE") {
        body.priceVnd = Number.parseInt(priceVnd.replace(/\D/g, ""), 10);
      } else if (housing && priceVnd.trim()) {
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

      {housing ? (
        <div className="card" style={{ marginBottom: 12, background: "#f7f3ea" }}>
          <p className="stat" style={{ margin: 0, fontSize: 13 }}>
            Mỗi tài khoản đã xác thực SĐT: 1 tin đang mở · tối đa 2 lần đăng / tháng · tin tự ẩn
            sau 7 ngày. Liên hệ trực tiếp — Pickee không đặt lịch xem nhà hay nhận cọc.
          </p>
        </div>
      ) : null}

      {lost ? (
        <div className="card" style={{ marginBottom: 12, background: "#f0f4f8" }}>
          <p className="stat" style={{ margin: 0, fontSize: 13 }}>
            SĐT đã xác thực · tối đa 2 tin đang mở · 5 lần đăng / tháng · tự ẩn sau 14 ngày. Chat
            để liên hệ — không mua bán trên Pickee.
          </p>
        </div>
      ) : null}

      <form className="card" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Tiêu đề</span>
          <input
            type="text"
            value={title}
            maxLength={120}
            required
            placeholder={
              housing
                ? listingType === "O_GHEP"
                  ? "VD: Tìm bạn ở ghép CT12 — nữ"
                  : "VD: Cho thuê studio CT11 — full nội thất"
                : lost
                  ? listingType === "PET_LOST"
                    ? "VD: Mất chó Corgi đực — CT12"
                    : "VD: Nhặt được ví đen gần sảnh CT11"
                  : "VD: Xe đẩy em bé Aprica"
            }
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </label>

        <div className="field">
          <ClassifiedPhotoPicker photos={photos} onChange={setPhotos} disabled={submitting} />
        </div>

        <label className="field">
          <span>Mô tả</span>
          <textarea
            value={description}
            maxLength={2000}
            rows={4}
            placeholder={
              housing
                ? "Diện tích, tầng, nội thất, điều kiện ở ghép… Không ghi thông tin nhạy cảm."
                : lost
                  ? listingType === "PET_LOST"
                    ? "Giống, màu, đặc điểm, thời gian/mất ở đâu, cách liên hệ…"
                    : "Mất hay nhặt được? Mô tả đồ, thời gian, khu vực…"
                  : "Mô tả ngắn, tình trạng, cách giao/lấy…"
            }
            onChange={(e) => {
              setDescription(e.target.value);
            }}
          />
        </label>

        {listingType === "RESALE" || housing ? (
          <label className="field">
            <span>{housing ? "Giá thuê / tháng (VND, tùy chọn)" : "Giá (VND)"}</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceVnd}
              required={listingType === "RESALE"}
              placeholder={housing ? "4500000" : "350000"}
              onChange={(e) => {
                setPriceVnd(e.target.value);
              }}
            />
          </label>
        ) : null}

        {!housing && !lost ? (
          <label className="field">
            <span>Tình trạng</span>
            <select
              value={condition}
              onChange={(e) => {
                setCondition(e.target.value);
              }}
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span>
            {housing ? "Khu / tòa (trong Zone)" : lost ? "Khu vực (trong Zone)" : "Vị trí lấy/giao"}
          </span>
          <input
            type="text"
            value={locationLabel}
            maxLength={120}
            required
            placeholder={housing || lost ? "CT12 Kim Văn" : "Sảnh CT12 / căn hộ…"}
            onChange={(e) => {
              setLocationLabel(e.target.value);
            }}
          />
        </label>

        {error ? (
          <p className="stat" style={{ color: "#c0392b", marginBottom: 8 }}>
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Đang đăng…" : "Đăng tin"}
        </button>
        <p style={{ marginTop: 12 }}>
          <Link href="/" className="stat">
            ← Trang chủ
          </Link>
        </p>
      </form>
    </div>
  );
}
