import Link from "next/link";
import {
  beautyWaitDisplay,
  isContactLiveOnlyShop,
  isCustomerVisitVertical,
  isEducationVertical,
  liveStatusClass,
  liveStatusLabel,
  type ProviderListing,
} from "../../lib/providers";

function brandInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t.charAt(0).toUpperCase();
}

function ProviderAvatar({
  brandName,
  logoUrl,
  size = 44,
}: {
  brandName: string;
  logoUrl?: string | null;
  size?: number;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="provider-avatar provider-avatar--compact"
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="provider-avatar provider-avatar--letter provider-avatar--compact"
      style={{ width: size, height: size, fontSize: size > 40 ? 16 : 14 }}
      aria-hidden
    >
      {brandInitial(brandName)}
    </span>
  );
}

function statusLine(p: ProviderListing): string {
  if (isEducationVertical(p.providerType)) return "Đang mở";
  if (isCustomerVisitVertical(p.providerType)) {
    return beautyWaitDisplay(p.liveStatus, p.estimatedWaitMinutes, p.providerType);
  }
  const label = liveStatusLabel(p.liveStatus, p.providerType, p.estimatedWaitMinutes);
  if (
    !isContactLiveOnlyShop(p.providerType) &&
    p.prepMinutes != null &&
    p.prepMinutes > 0 &&
    (p.liveStatus === "OPEN" || p.liveStatus === "BUSY")
  ) {
    return `${label} · ~${String(p.prepMinutes)} phút`;
  }
  return label;
}

function liveStatusForPill(p: ProviderListing): string {
  return isEducationVertical(p.providerType) ? "OPEN" : p.liveStatus;
}

export function ProviderCardCompact({
  provider: p,
  favorite,
  onToggleFavorite,
}: {
  provider: ProviderListing;
  favorite?: boolean;
  onToggleFavorite?: (locationId: string) => void;
}) {
  const status = statusLine(p);
  const offer = p.sampleOffering?.trim() || null;

  return (
    <article className="provider-card provider-card--compact">
      <div className="provider-card-compact-row">
        <Link href={`/locations/${p.locationId}`} className="provider-card-compact-main">
          <ProviderAvatar brandName={p.brandName} logoUrl={p.logoUrl} />
          <div className="provider-card-compact-body">
            <h3 className="provider-card-compact-title">{p.brandName}</h3>
            {p.freshnessLabel || p.promotionLabel ? (
              <p className="provider-card-compact-offer">
                {p.freshnessLabel ? <span className="fresh-badge">{p.freshnessLabel}</span> : null}
                {p.promotionLabel ? <span className="promo-badge">{p.promotionLabel}</span> : null}
              </p>
            ) : null}
            <p className="provider-card-compact-status">
              <span className={`live-dot ${liveStatusClass(liveStatusForPill(p))}`} aria-hidden />
              {status}
            </p>
            {offer ? <p className="provider-card-compact-offer">{offer}</p> : null}
          </div>
        </Link>
        <div className="provider-card-compact-actions">
          {onToggleFavorite ? (
            <button
              type="button"
              aria-label={favorite ? "Bỏ yêu thích" : "Yêu thích"}
              className="provider-fav-btn"
              onClick={() => onToggleFavorite(p.locationId)}
            >
              {favorite ? "♥" : "♡"}
            </button>
          ) : null}
          <Link href={`/locations/${p.locationId}`} className="provider-card-compact-cta">
            Mở →
          </Link>
        </div>
      </div>
    </article>
  );
}
