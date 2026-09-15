"use client";

import { OrderPhoneLinks } from "./order-phone-links";

type Props = {
  providerPhone: string | null;
  providerLabel: string;
  lat?: number | null;
  lng?: number | null;
  addressLine?: string | null;
};

export function LocationContactActions({
  providerPhone,
  providerLabel,
  lat,
  lng,
  addressLine,
}: Props) {
  const mapsHref =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${String(lat)},${String(lng)}`
      : addressLine
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`
        : null;

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
      {mapsHref ? (
        <a
          href={mapsHref}
          className="order-phone-link"
          target="_blank"
          rel="noopener noreferrer"
          title="Chỉ đường tới tiệm"
        >
          <span aria-hidden>📍</span>
          <span>Chỉ đường</span>
        </a>
      ) : null}
    </div>
  );
}
