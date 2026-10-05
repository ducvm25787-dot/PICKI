"use client";

import Link from "next/link";

export type StallCardData = {
  locationId: string;
  displayName: string;
  brandName: string;
  stallCode: string | null;
  sellerPortraitUrl: string | null;
  logoUrl: string | null;
  groupLabel: string;
  clusterName: string | null;
  averageRating: number | null;
  reviewCount: number;
};

export function StallCard({
  stall,
  href,
  favorite,
  onToggleFavorite,
}: {
  stall: StallCardData;
  href: string;
  favorite?: boolean;
  onToggleFavorite?: (locationId: string) => void;
}) {
  const portrait = stall.sellerPortraitUrl || stall.logoUrl;
  const name = stall.displayName || stall.brandName;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <article className="provider-card provider-card--compact">
      <div className="provider-card-compact-row">
        <Link href={href} className="provider-card-compact-main">
          {portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portrait} alt="" className="provider-avatar provider-avatar--compact" width={44} height={44} />
          ) : (
            <span className="provider-avatar provider-avatar--letter provider-avatar--compact" aria-hidden>
              {initial}
            </span>
          )}
          <div className="provider-card-compact-body">
            <h3 className="provider-card-compact-title">{name}</h3>
            <p className="provider-card-compact-status">
              {stall.groupLabel}
              {stall.stallCode ? ` · Quầy ${stall.stallCode}` : ""}
            </p>
            <p className="stat" style={{ margin: "4px 0 0" }}>
              {stall.reviewCount > 0 && stall.averageRating != null
                ? `★ ${stall.averageRating} · ${stall.reviewCount} đánh giá`
                : "Chưa có đánh giá"}
            </p>
            {stall.clusterName ? <p className="stat" style={{ margin: "2px 0 0" }}>{stall.clusterName}</p> : null}
          </div>
        </Link>
        {onToggleFavorite ? (
          <button
            type="button"
            className="provider-fav-btn"
            aria-label={favorite ? "Bỏ yêu thích" : "Yêu thích"}
            onClick={() => onToggleFavorite(stall.locationId)}
          >
            {favorite ? "♥" : "♡"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
