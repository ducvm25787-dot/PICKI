"use client";

import { LocationContactActions } from "./location-contact-actions";
import { PickeeMap } from "./pickee-map";
import { SaveFamiliarButton } from "./save-familiar-button";

type Props = {
  brandName: string;
  displayName: string;
  tagline?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  addressLine?: string | null;
  lat?: number | null;
  lng?: number | null;
  providerPhone?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  saveLocationId?: string | null;
  liveLabel?: string | null;
  liveClassName?: string | null;
};

export function LocationIntroPanel({
  brandName,
  displayName,
  tagline,
  description,
  logoUrl,
  coverUrl,
  addressLine,
  lat,
  lng,
  providerPhone,
  averageRating,
  reviewCount = 0,
  saveLocationId,
  liveLabel,
  liveClassName,
}: Props) {
  return (
    <div className="location-intro">
      {coverUrl ? (
        <div className="location-intro-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" />
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="location-intro-head">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="location-intro-logo" />
          ) : (
            <div className="location-intro-logo location-intro-logo--fallback" aria-hidden>
              {brandName.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>
              {brandName}
              {liveLabel ? <span className={`live-pill ${liveClassName ?? ""}`}>{liveLabel}</span> : null}
            </h2>
            <p className="stat" style={{ margin: 0 }}>
              {displayName}
            </p>
            {saveLocationId ? <SaveFamiliarButton locationId={saveLocationId} /> : null}
            {tagline ? (
              <p style={{ margin: "8px 0 0", fontSize: 14 }}>{tagline}</p>
            ) : null}
            {averageRating != null && averageRating > 0 ? (
              <p className="stat" style={{ margin: "8px 0 0" }}>
                ★ {averageRating} · {reviewCount} đánh giá
              </p>
            ) : (
              <p className="stat" style={{ margin: "8px 0 0" }}>
                Chưa có đánh giá
              </p>
            )}
          </div>
        </div>
      </div>

      {description ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Giới thiệu</p>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{description}</p>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="stat" style={{ margin: 0 }}>
            Quán chưa viết giới thiệu — xem menu / dịch vụ hoặc liên hệ trực tiếp.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Địa chỉ & liên hệ</p>
        {addressLine ? (
          <p style={{ margin: "0 0 10px" }}>{addressLine}</p>
        ) : (
          <p className="stat" style={{ margin: "0 0 10px" }}>
            Chưa có địa chỉ trên Pickee
          </p>
        )}
        {lat != null && lng != null ? (
          <div style={{ marginBottom: 12, borderRadius: 16, overflow: "hidden" }}>
            <PickeeMap
              center={{ lat, lng }}
              markers={[
                {
                  id: "here",
                  lat,
                  lng,
                  label: brandName,
                  kind: "provider",
                },
              ]}
              height={200}
              fitMarkers
              zoom={17}
            />
          </div>
        ) : null}
        <LocationContactActions
          providerPhone={providerPhone ?? null}
          providerLabel={brandName}
          lat={lat}
          lng={lng}
          addressLine={addressLine}
        />
        <p className="stat" style={{ margin: "12px 0 0" }}>
          Liên hệ qua Pickee (gọi / Zalo / chat) — không cần rời app.
        </p>
      </div>
    </div>
  );
}
