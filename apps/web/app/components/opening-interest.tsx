"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Presence = {
  freshnessLabel: string | null;
  opensAt: string | null;
  promotion: { title: string; kindLabel: string; spotlight: boolean } | null;
  reminding: boolean;
};

export function OpeningInterest({ locationId }: { locationId: string }) {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Presence>(`/locations/${locationId}/presence`)
      .then(setPresence)
      .catch(() => setPresence(null));
  }, [locationId]);

  if (!presence?.freshnessLabel && !presence?.promotion) return null;

  const when = presence.opensAt
    ? new Date(presence.opensAt).toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "numeric",
        month: "numeric",
      })
    : null;

  return (
    <div className="opening-interest">
      {presence.freshnessLabel ? <span className="fresh-badge">{presence.freshnessLabel}</span> : null}
      {when && presence.freshnessLabel === "Sắp khai trương" ? (
        <span className="stat">{when}</span>
      ) : null}
      {presence.promotion && !presence.promotion.spotlight ? (
        <span className="promo-badge">
          {presence.promotion.kindLabel}: {presence.promotion.title}
        </span>
      ) : null}
      {presence.freshnessLabel === "Sắp khai trương" ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: "auto", marginTop: 8 }}
          disabled={busy || presence.reminding}
          onClick={() => {
            setBusy(true);
            void api(`/locations/${locationId}/opening-reminder`, { method: "POST" })
              .then(() => setPresence((p) => (p ? { ...p, reminding: true } : p)))
              .finally(() => setBusy(false));
          }}
        >
          {presence.reminding ? "Sẽ nhắc khi mở" : "Nhắc tôi khi mở"}
        </button>
      ) : null}
    </div>
  );
}
