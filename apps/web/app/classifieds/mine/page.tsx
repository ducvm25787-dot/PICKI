"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "../../components/notification-bell";
import { api } from "../../../lib/api";
import {
  type ClassifiedListing,
  classifiedStatusLabel,
  classifiedTypeLabel,
  formatPriceVnd,
} from "../../../lib/classifieds";

type ReservationRow = {
  id: string;
  status: string;
  createdAt: string;
  listing: ClassifiedListing;
};

export default function MyClassifiedsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<ClassifiedListing[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [mine, reserved] = await Promise.all([
          api<{ listings: ClassifiedListing[] }>("/classifieds/mine"),
          api<{ reservations: ReservationRow[] }>("/classifieds/reservations/mine"),
        ]);
        setListings(mine.listings);
        setReservations(reserved.reservations);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row">
        <h1 style={{ margin: 0, fontSize: 22 }}>GÓC KHU MÌNH</h1>
        <NotificationBell audience="customer" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/zones/kim-van-kim-lu/classifieds?type=RESALE" className="btn btn-secondary" style={{ width: "auto" }}>
            💰 Thanh lý
          </Link>
          <Link href="/zones/kim-van-kim-lu/classifieds?type=GIVE_AWAY" className="btn btn-secondary" style={{ width: "auto" }}>
            🎁 Cho tặng
          </Link>
        </div>
      </div>

      <section className="order-list-section">
        <h2 className="order-list-section-title">Tin tôi đăng</h2>
        {listings.length === 0 ? (
          <p className="stat order-list-empty">Chưa đăng tin nào.</p>
        ) : (
          <div className="provider-list">
            {listings.map((item) => (
              <Link key={item.id} href={`/classifieds/${item.id}`} className="provider-card">
                <div className="provider-card-main">
                  <p className="provider-name">
                    {item.title}
                    <span className="stat" style={{ marginLeft: 8 }}>
                      · {classifiedTypeLabel(item.listingType)}
                    </span>
                  </p>
                  <p className="stat">
                    {formatPriceVnd(item.priceVnd, item.listingType)} ·{" "}
                    {classifiedStatusLabel(item.status, item.listingType)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="order-list-section" style={{ marginTop: 24 }}>
        <h2 className="order-list-section-title">Tin tôi đang giữ</h2>
        {reservations.length === 0 ? (
          <p className="stat order-list-empty">Chưa giữ tin nào.</p>
        ) : (
          <div className="provider-list">
            {reservations.map((row) => (
              <Link key={row.id} href={`/classifieds/${row.listing.id}`} className="provider-card">
                <div className="provider-card-main">
                  <p className="provider-name">{row.listing.title}</p>
                  <p className="stat">
                    {formatPriceVnd(row.listing.priceVnd, row.listing.listingType)} ·{" "}
                    {classifiedStatusLabel(row.listing.status, row.listing.listingType)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p style={{ marginTop: 16 }}>
        <Link href="/" className="stat">
          ← Trang chủ
        </Link>
      </p>
    </div>
  );
}
