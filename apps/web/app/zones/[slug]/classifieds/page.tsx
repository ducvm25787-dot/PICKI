"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "../../../components/notification-bell";
import { api } from "../../../../lib/api";
import {
  type ClassifiedListing,
  classifiedConditionLabel,
  classifiedStatusLabel,
  classifiedTypeLabel,
  formatPriceVnd,
  isHousingListingType,
  isLostListingType,
} from "../../../../lib/classifieds";

type ZoneInfo = {
  zoneId: string;
  slug: string;
};

type ListingTypeFilter =
  | "RESALE"
  | "GIVE_AWAY"
  | "CHO_THUE"
  | "O_GHEP"
  | "LOST_FOUND"
  | "PET_LOST";

function parseListingType(raw: string | null): ListingTypeFilter {
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

const TITLES: Record<ListingTypeFilter, string> = {
  RESALE: "Thanh lý",
  GIVE_AWAY: "Cho tặng",
  CHO_THUE: "Cho thuê",
  O_GHEP: "Ở ghép",
  LOST_FOUND: "Thất lạc",
  PET_LOST: "Thú cưng thất lạc",
};

export default function ZoneClassifiedsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = String(params.slug);
  const listingType = parseListingType(searchParams.get("type"));
  const housing = isHousingListingType(listingType);
  const lost = isLostListingType(listingType);

  const [zone, setZone] = useState<ZoneInfo | null>(null);
  const [listings, setListings] = useState<ClassifiedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const discovery = await api<{ zoneId: string; slug: string }>(`/zones/${slug}/discovery`);
        setZone({ zoneId: discovery.zoneId, slug: discovery.slug });

        const res = await api<{ listings: ClassifiedListing[] }>(
          `/classifieds?zoneId=${discovery.zoneId}&listingType=${listingType}`,
        );
        setListings(res.listings);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải danh sách");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, listingType]);

  const pageTitle = TITLES[listingType];

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{pageTitle}</h1>
          <p className="stat">
            GÓC KHU MÌNH · {classifiedTypeLabel(listingType)}
            {housing ? " · liên hệ trực tiếp · tin hết hạn sau 7 ngày" : ""}
            {lost ? " · chat liên hệ · tin hết hạn sau 14 ngày" : ""}
          </p>
        </div>
        <NotificationBell audience="customer" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["RESALE", "Thanh lý"],
              ["GIVE_AWAY", "Cho tặng"],
              ["CHO_THUE", "Cho thuê"],
              ["O_GHEP", "Ở ghép"],
              ["LOST_FOUND", "Thất lạc"],
              ["PET_LOST", "Thú cưng"],
            ] as const
          ).map(([type, label]) => (
            <Link
              key={type}
              href={`/zones/${slug}/classifieds?type=${type}`}
              className={listingType === type ? "btn" : "btn btn-secondary"}
              style={{ width: "auto" }}
            >
              {label}
            </Link>
          ))}
          <Link href="/classifieds/mine" className="btn btn-secondary" style={{ width: "auto" }}>
            Tin của tôi
          </Link>
          {zone ? (
            <Link
              href={`/classifieds/new?zoneId=${zone.zoneId}&type=${listingType}`}
              className="btn btn-secondary"
              style={{ width: "auto" }}
            >
              + Đăng tin
            </Link>
          ) : null}
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="card">
          <p className="stat">Chưa có tin {pageTitle.toLowerCase()} nào trong khu.</p>
          {zone ? (
            <Link
              href={`/classifieds/new?zoneId=${zone.zoneId}&type=${listingType}`}
              className="btn"
              style={{ marginTop: 12 }}
            >
              Đăng tin đầu tiên
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="provider-list">
          {listings.map((item) => (
            <Link
              key={item.id}
              href={`/classifieds/${item.id}`}
              className="provider-card classified-list-card"
            >
              {item.photoUrls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- static upload thumb
                <img src={item.photoUrls[0]} alt="" className="classified-list-thumb" />
              ) : null}
              <div className="provider-card-main">
                <p className="provider-name">{item.title}</p>
                <p className="stat">
                  {formatPriceVnd(item.priceVnd, item.listingType)}
                  {item.condition
                    ? ` · ${classifiedConditionLabel(item.condition) ?? ""}`
                    : ""}
                </p>
                <p className="stat">
                  📍 {item.locationLabel} · {classifiedStatusLabel(item.status, item.listingType)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p style={{ marginTop: 16 }}>
        <Link href="/" className="stat">
          ← Trang chủ
        </Link>
      </p>
    </div>
  );
}
