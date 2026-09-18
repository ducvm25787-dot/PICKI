import Link from "next/link";
import {
  beautyWaitDisplay,
  isBeautyVertical,
  isContactLiveOnlyShop,
  isCustomerVisitVertical,
  isEducationVertical,
  isHealthVertical,
  isMarketVertical,
  isPharmacyVertical,
  isTransportVertical,
  isPetVertical,
  liveStatusClass,
  liveStatusLabel,
  type ProviderListing,
} from "../../lib/providers";

function brandInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t.charAt(0).toUpperCase();
}

function ProviderAvatar({ brandName, logoUrl }: { brandName: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="provider-avatar" width={48} height={48} />
    );
  }
  return (
    <span className="provider-avatar provider-avatar--letter" aria-hidden>
      {brandInitial(brandName)}
    </span>
  );
}

export function ProviderList({
  providers,
  favoriteIds,
  onToggleFavorite,
}: {
  providers: ProviderListing[];
  favoriteIds?: Set<string>;
  onToggleFavorite?: (locationId: string) => void;
}) {
  if (providers.length === 0) {
    return <p className="stat">Chưa có provider phù hợp khung giờ này.</p>;
  }

  return (
    <div className="provider-list">
      {providers.map((p) => (
        <article key={p.locationId} className="provider-card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <Link
              href={`/locations/${p.locationId}`}
              style={{
                flex: 1,
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <ProviderAvatar brandName={p.brandName} logoUrl={p.logoUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: "0 0 4px" }}>
                  {p.brandName}
                  <span
                    className={`live-pill ${liveStatusClass(
                      isEducationVertical(p.providerType) ? "OPEN" : p.liveStatus,
                    )}`}
                  >
                    {isCustomerVisitVertical(p.providerType)
                      ? beautyWaitDisplay(p.liveStatus, p.estimatedWaitMinutes, p.providerType)
                      : liveStatusLabel(p.liveStatus, p.providerType, p.estimatedWaitMinutes)}
                  </span>
                </h3>
                <p className="stat" style={{ margin: "0 0 4px" }}>
                  {p.displayName}
                </p>
                {p.tagline && <p style={{ margin: "0 0 4px", fontSize: 14 }}>{p.tagline}</p>}
                {isCustomerVisitVertical(p.providerType) && p.estimatedWaitMinutes != null ? (
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    {beautyWaitDisplay(p.liveStatus, p.estimatedWaitMinutes, p.providerType)}
                  </p>
                ) : null}
                {!isCustomerVisitVertical(p.providerType) &&
                !isContactLiveOnlyShop(p.providerType) &&
                (p.prepMinutes != null || p.etaMinutes != null) ? (
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    ⏱ {p.prepMinutes ?? "?"} phút nấu · ~{p.etaMinutes ?? "?"} phút giao
                  </p>
                ) : null}
                {p.averageRating != null && p.averageRating > 0 && (
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    ★ {p.averageRating} ({p.reviewCount ?? 0} đánh giá)
                  </p>
                )}
                {p.sampleOffering && (
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    Gợi ý: {p.sampleOffering}
                  </p>
                )}
                <p className="stat" style={{ margin: "8px 0 0", fontSize: 13 }}>
                  {isPharmacyVertical(p.providerType)
                    ? "Xem nhà thuốc →"
                    : isMarketVertical(p.providerType)
                      ? "Xem cửa hàng →"
                      : isTransportVertical(p.providerType)
                        ? "Xem nhà xe →"
                      : isHealthVertical(p.providerType)
                        ? "Xem phòng khám →"
                        : isBeautyVertical(p.providerType) || isPetVertical(p.providerType)
                          ? "Xem tiệm →"
                          : isEducationVertical(p.providerType)
                            ? "Xem chi tiết →"
                            : "Xem menu →"}
                </p>
              </div>
            </Link>
            {onToggleFavorite ? (
              <button
                type="button"
                aria-label="Yêu thích"
                className="btn btn-secondary"
                style={{ width: "auto", padding: "8px 10px", height: "fit-content" }}
                onClick={() => onToggleFavorite(p.locationId)}
              >
                {favoriteIds?.has(p.locationId) ? "♥" : "♡"}
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
