"use client";

import { useEffect, useState } from "react";
import { OrderPhoneLinks } from "./order-phone-links";
import { getCurrentPositionOnce, type GeoPosition } from "../../lib/geolocation";
import { mapsSearchAddressUrl, mapsSearchUrl, pickeeNavigateHref } from "../../lib/maps";

type Props = {
  providerPhone: string | null;
  providerLabel: string;
  lat?: number | null;
  lng?: number | null;
  addressLine?: string | null;
  /** Prefetch GPS once for directions origin */
  autoLocate?: boolean;
};

export function LocationContactActions({
  providerPhone,
  providerLabel,
  lat,
  lng,
  addressLine,
  autoLocate = true,
}: Props) {
  const [origin, setOrigin] = useState<GeoPosition | null>(null);

  useEffect(() => {
    if (!autoLocate) return;
    void getCurrentPositionOnce({ timeoutMs: 8000, enableHighAccuracy: false }).then((r) => {
      if (r.source === "gps") setOrigin(r.position);
    });
  }, [autoLocate]);

  const navigateHref =
    lat != null && lng != null
      ? pickeeNavigateHref({
          destLat: lat,
          destLng: lng,
          label: providerLabel,
          originLat: origin?.lat,
          originLng: origin?.lng,
        })
      : addressLine
        ? mapsSearchAddressUrl(addressLine)
        : null;

  const inApp = lat != null && lng != null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {providerPhone ? (
        <OrderPhoneLinks
          contacts={{
            customer: { phone: null },
            provider: { phone: providerPhone, label: providerLabel },
          }}
          hideRole="customer"
          compact
        />
      ) : null}
      {navigateHref ? (
        <a
          href={navigateHref}
          className="order-phone-link"
          {...(inApp ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          title="Chỉ đường tới tiệm"
        >
          <span>Chỉ đường</span>
        </a>
      ) : null}
      {lat != null && lng != null ? (
        <a
          href={mapsSearchUrl(lat, lng)}
          className="order-phone-link"
          target="_blank"
          rel="noopener noreferrer"
          title="Xem trên bản đồ"
        >
          <span>Xem vị trí</span>
        </a>
      ) : null}
    </div>
  );
}
