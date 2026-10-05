"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { familiarPrimaryCta } from "../../../lib/familiar";
import { track } from "../../../lib/analytics";
import { liveStatusClass, liveStatusLabel } from "../../../lib/providers";

type FamiliarPlace = {
  locationId: string;
  brandName: string;
  providerType: string;
  liveStatus: string;
  estimatedWaitMinutes: number | null;
  familiarOffer?: { title: string; kindLabel: string } | null;
};

const KVL_SLUG = "kim-van-kim-lu";

export default function FamiliarPlacesPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<FamiliarPlace[] | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ zoneId: string; familiar: FamiliarPlace[] }>(`/zones/${KVL_SLUG}/familiar`)
      .then((res) => {
        setZoneId(res.zoneId);
        setPlaces(res.familiar);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && /401|unauthorized/i.test(err.message)) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Không tải được chỗ quen");
        setPlaces([]);
      });
  }, [router]);

  return (
    <div className="container">
      <Link href="/me" className="stat">
        ← Tôi
      </Link>
      <h1 style={{ fontSize: 22, margin: "12px 0 4px" }}>Chỗ quen của nhà mình</h1>
      <p className="tagline">Những chỗ nhà mình đã dùng hoặc đã lưu.</p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {places == null && !error ? <p className="tagline">Đang tải…</p> : null}
      {places && places.length === 0 ? (
        <p className="stat">Lưu ♥ hoặc hoàn thành đơn — chỗ quen sẽ hiện ở đây.</p>
      ) : null}
      {places && places.length > 0 ? (
        <ul className="familiar-list card">
          {places.map((place) => {
            const cta = familiarPrimaryCta({
              locationId: place.locationId,
              providerType: place.providerType,
              zoneSlug: KVL_SLUG,
            });
            const waitHint =
              place.estimatedWaitMinutes != null && place.estimatedWaitMinutes <= 5
                ? "Ngay"
                : place.estimatedWaitMinutes != null
                  ? `~${String(place.estimatedWaitMinutes)} phút`
                  : null;
            return (
              <li key={place.locationId} className="familiar-row">
                <div>
                  <Link href={`/locations/${place.locationId}`} className="familiar-name">
                    {place.brandName}
                  </Link>
                  <div className="familiar-mini-status">
                    <span className={`live-dot ${liveStatusClass(place.liveStatus)}`} aria-hidden />
                    {waitHint ?? liveStatusLabel(place.liveStatus)}
                  </div>
                  {place.familiarOffer ? (
                    <span className="promo-badge">{place.familiarOffer.title}</span>
                  ) : null}
                </div>
                <Link
                  href={cta.href}
                  className="familiar-cta"
                  onClick={() =>
                    track("familiar_provider_click", {
                      zoneId: zoneId ?? undefined,
                      properties: { locationId: place.locationId, cta: cta.label },
                    })
                  }
                >
                  {cta.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
