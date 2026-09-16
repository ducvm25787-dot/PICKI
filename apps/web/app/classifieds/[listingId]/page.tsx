"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClassifiedChat } from "../../components/classified-chat";
import { ClassifiedPhotoGallery } from "../../components/classified-photo-gallery";
import { NotificationBell } from "../../components/notification-bell";
import { api } from "../../../lib/api";
import {
  type ClassifiedListing,
  classifiedConditionLabel,
  classifiedStatusLabel,
  classifiedTypeLabel,
  formatPriceVnd,
  isHousingListingType,
  isLostListingType,
  isContactOnlyListingType,
} from "../../../lib/classifieds";

export default function ClassifiedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = String(params.listingId);

  const [listing, setListing] = useState<ClassifiedListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ClassifiedListing>(`/classifieds/${listingId}`);
      setListing(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được tin");
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(path: string, method: "PATCH" | "POST" = "PATCH") {
    setActing(true);
    try {
      await api(path, { method });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  if (error && !listing) {
    return (
      <div className="container">
        <div className="card">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => router.back()}>
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  if (!listing) return null;

  const housing = isHousingListingType(listing.listingType);
  const lost = isLostListingType(listing.listingType);
  const contactOnly = isContactOnlyListingType(listing.listingType);
  const isAvailable = listing.status === "AVAILABLE";
  const isReserved = listing.status === "RESERVED";
  const canReserve = !contactOnly && isAvailable && !listing.mine;
  const canComplete = !contactOnly && isReserved && listing.mine;
  const canCancelReservation =
    !contactOnly && isReserved && (listing.mine || listing.reservedByMe);
  const showChat = !listing.mine && (contactOnly ? isAvailable : true);

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <p className="section-title">{classifiedTypeLabel(listing.listingType)}</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>{listing.title}</h1>
        </div>
        <NotificationBell audience="customer" />
      </div>

      {listing.photoUrls.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <ClassifiedPhotoGallery photos={listing.photoUrls} alt={listing.title} />
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="stat" style={{ fontSize: 18, fontWeight: 600 }}>
          {formatPriceVnd(listing.priceVnd, listing.listingType)}
        </p>
        <p className="stat">
          {classifiedStatusLabel(listing.status, listing.listingType)}
          {listing.condition ? ` · ${classifiedConditionLabel(listing.condition)}` : ""}
        </p>
        <p className="stat">📍 {listing.locationLabel}</p>
        {listing.expiresAt ? (
          <p className="stat">
            Hết hạn:{" "}
            {new Date(listing.expiresAt).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </p>
        ) : null}
        {listing.sellerDisplayName ? (
          <p className="stat">Người đăng: {listing.sellerDisplayName}</p>
        ) : null}
        {housing ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Liên hệ trực tiếp qua chat — Picki không đặt lịch xem nhà hay nhận cọc.
          </p>
        ) : null}
        {lost ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Chat để liên hệ — khi đã tìm thấy / đã trả, người đăng hãy ẩn tin.
          </p>
        ) : null}
        {listing.reservedByDisplayName ? (
          <p className="stat">Đang giữ: {listing.reservedByDisplayName}</p>
        ) : null}
        {listing.description ? (
          <p className="stat" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
            {listing.description}
          </p>
        ) : null}
        <p className="stat" style={{ marginTop: 8, fontSize: 12 }}>
          {listing.listingNumber}
        </p>
      </div>

      {error ? <p className="stat" style={{ color: "#c0392b", marginBottom: 12 }}>{error}</p> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        {canReserve ? (
          <button
            type="button"
            className="btn"
            disabled={acting}
            onClick={() => void runAction(`/classifieds/${listingId}/reserve`, "POST")}
          >
            Giữ chỗ
          </button>
        ) : null}
        {canComplete ? (
          <button
            type="button"
            className="btn"
            disabled={acting}
            onClick={() => void runAction(`/classifieds/${listingId}/complete`)}
          >
            {listing.listingType === "GIVE_AWAY" ? "Xác nhận đã tặng" : "Xác nhận đã giao/bán"}
          </button>
        ) : null}
        {canCancelReservation ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={acting}
            style={{ marginTop: canComplete ? 8 : 0 }}
            onClick={() => void runAction(`/classifieds/${listingId}/cancel-reservation`)}
          >
            Hủy giữ chỗ
          </button>
        ) : null}
        {listing.mine &&
        (listing.status === "AVAILABLE" ||
          listing.status === "COMPLETED" ||
          listing.status === "GIVEN") ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={acting}
            style={{ marginTop: 8 }}
            onClick={() => void runAction(`/classifieds/${listingId}/archive`)}
          >
            {contactOnly ? "Xóa tin" : "Ẩn tin"}
          </button>
        ) : null}
        {contactOnly && !listing.mine && isAvailable ? (
          <p className="stat">
            {lost ? "Chat bên dưới để hỏi / báo tin." : "Chat bên dưới để hỏi phòng / ở ghép."}
          </p>
        ) : null}
        {!contactOnly && !canReserve && !canComplete && !canCancelReservation && !listing.mine ? (
          <p className="stat">
            {isReserved
              ? "Tin đã được giữ — thử tin khác hoặc chat nếu bạn là người giữ."
              : "Tin đã đóng."}
          </p>
        ) : null}
      </div>

      {showChat ? (
        <div className="card">
          <ClassifiedChat listingId={listingId} />
        </div>
      ) : null}

      <p style={{ marginTop: 16 }}>
        <Link href="/classifieds/mine" className="stat">
          Tin của tôi
        </Link>
        {" · "}
        <Link href="/" className="stat">
          Trang chủ
        </Link>
      </p>
    </div>
  );
}
