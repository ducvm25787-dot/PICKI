"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import {
  addToCart,
  cartItemCount,
  cartTotalVnd,
  readCart,
  type Cart,
} from "../../../lib/cart";
import { LocationContactActions } from "../../components/location-contact-actions";
import {
  formatBeautyPrice,
  formatHomeServicePrice,
  formatLaundryReferencePrice,
  formatVnd,
} from "../../../lib/money";
import {
  beautyWaitDisplay,
  fulfillmentLabel,
  isBeautyVertical,
  isHomeServiceVertical,
  isLaundryVertical,
  laundryPriceUnit,
  liveStatusClass,
  liveStatusLabel,
  orderButtonLabel,
} from "../../../lib/providers";

type MenuResponse = {
  location: {
    id: string;
    providerType?: string;
    brandName: string;
    displayName: string;
    liveStatus: string;
    tagline: string | null;
    prepMinutes?: number | null;
    etaMinutes?: number | null;
    estimatedWaitMinutes?: number | null;
    liveMessage?: string | null;
    addressLine?: string | null;
    lat?: number | null;
    lng?: number | null;
    contacts?: {
      provider: { phone: string | null; label?: string };
    };
  };
  items: {
    id: string;
    slug?: string;
    name: string;
    description: string | null;
    amountVnd: number;
    fulfillmentMode?: string | null;
    paymentPolicy?: string | null;
    estimatedDays?: number | null;
    pricingKind?: string | null;
  }[];
  dailySpecials: {
    id: string;
    offeringId: string;
    name: string;
    description: string | null;
    amountVnd: number;
    quantityRemaining: number;
    fulfillmentMode: string | null;
  }[];
};

type ReviewsResponse = {
  averageRating: number | null;
  count: number;
};

type VisitIntent = {
  id: string;
  offeringName: string | null;
  etaMinutes: number;
  expectedAt: string;
  status: string;
};

const VISIT_ETA_PRESETS = [15, 30, 45, 60] as const;

export default function LocationMenuPage() {
  const params = useParams<{ locationId: string }>();
  const router = useRouter();
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewsResponse | null>(null);
  const [requestItem, setRequestItem] = useState<MenuResponse["items"][0] | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [requestBuilding, setRequestBuilding] = useState("CT12");
  const [requestApartment, setRequestApartment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [visitItem, setVisitItem] = useState<MenuResponse["items"][0] | null>(null);
  const [visitEtaMinutes, setVisitEtaMinutes] = useState<number>(30);
  const [activeVisit, setActiveVisit] = useState<VisitIntent | null>(null);
  const [visitSubmitting, setVisitSubmitting] = useState(false);

  useEffect(() => {
    if (!requestItem && !visitItem) return;
    requestAnimationFrame(() => {
      const id = visitItem ? "visit-intent-form" : "service-request-form";
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [requestItem?.id, visitItem?.id]);

  async function loadActiveVisit(locationId: string) {
    try {
      const res = await api<{ intent: VisitIntent | null }>(
        `/visit-intents/mine?locationId=${locationId}`,
      );
      setActiveVisit(res.intent);
    } catch {
      setActiveVisit(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        await api("/me").catch(() => {
          router.replace("/login");
          throw new Error("auth");
        });
        const [data, mine, rev] = await Promise.all([
          api<MenuResponse>(`/locations/${params.locationId}/menu`),
          api<{ zones: { zoneId: string }[] }>("/zones/mine"),
          api<ReviewsResponse>(`/locations/${params.locationId}/reviews`),
        ]);
        setMenu(data);
        setReviews(rev);
        setZoneId(mine.zones[0]?.zoneId ?? null);
        setCart(readCart());
        if (data.location.providerType === "BEAUTY") {
          await loadActiveVisit(data.location.id);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "auth") {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.locationId, router]);

  function handleAdd(item: MenuResponse["items"][0]) {
    if (!menu || !zoneId) {
      setToast(isLaundryVertical(menu?.location.providerType) ? "Tham gia Zone trước khi đặt hàng" : "Tham gia Zone trước khi đặt món");
      return;
    }
    try {
      const next = addToCart(
        {
          providerLocationId: menu.location.id,
          zoneId,
          brandName: menu.location.brandName,
          providerType: menu.location.providerType,
        },
        {
          offeringId: item.id,
          name: item.name,
          amountVnd: item.amountVnd,
          fulfillmentMode: item.fulfillmentMode,
          estimatedDays: item.estimatedDays,
          pricingKind: item.pricingKind,
        },
      );
      setCart(next);
      setToast(`Đã thêm ${item.name}`);
    } catch {
      setToast("Không thể trộn dịch vụ lấy về giặt và giặt tại nhà trong cùng đơn");
    }
    setTimeout(() => setToast(null), 2000);
  }

  async function submitVisitIntent() {
    if (!menu || !zoneId || !visitItem) {
      setToast("Tham gia Zone trước khi báo sắp tới");
      return;
    }
    setVisitSubmitting(true);
    try {
      const created = await api<VisitIntent>("/visit-intents", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: menu.location.id,
          zoneId,
          offeringId: visitItem.id,
          etaMinutes: visitEtaMinutes,
        }),
      });
      setActiveVisit(created);
      setVisitItem(null);
      setToast(`Đã báo tiệm — bạn sẽ tới sau ~${String(visitEtaMinutes)} phút`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Không gửi được thông báo");
    } finally {
      setVisitSubmitting(false);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function cancelVisitIntent() {
    if (!activeVisit || visitSubmitting) return;
    setVisitSubmitting(true);
    try {
      await api(`/visit-intents/${activeVisit.id}/cancel`, { method: "PATCH" });
      setActiveVisit(null);
      setToast("Đã hủy báo sắp tới");
    } finally {
      setVisitSubmitting(false);
      setTimeout(() => setToast(null), 2000);
    }
  }

  async function submitRequest() {
    if (!menu || !zoneId || !requestItem) {
      setToast("Tham gia Zone trước khi gửi yêu cầu");
      return;
    }
    if (!requestApartment.trim()) {
      setToast("Nhập số căn hộ");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api<{ id: string }>("/service-requests", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: menu.location.id,
          zoneId,
          offeringId: requestItem.id,
          customerNote: requestNote.trim() || undefined,
          deliveryBuilding: requestBuilding.trim(),
          deliveryApartment: requestApartment.trim(),
        }),
      });
      setRequestItem(null);
      setRequestNote("");
      router.push(`/requests/${created.id}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Không gửi được yêu cầu");
      setTimeout(() => setToast(null), 2500);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="container">
        <div className="card">{error ?? "Không tìm thấy quán"}</div>
      </div>
    );
  }

  const { location, items, dailySpecials } = menu;
  const isLaundry = isLaundryVertical(location.providerType);
  const isHomeService = isHomeServiceVertical(location.providerType);
  const isBeauty = isBeautyVertical(location.providerType);
  const count = cartItemCount(cart);
  const total = cartTotalVnd(cart);

  return (
    <div className="container" style={{ paddingBottom: count > 0 ? 120 : 16 }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: "auto", marginBottom: 16, padding: "8px 12px" }}
        onClick={() => router.back()}
      >
        ← Quay lại
      </button>

      {toast && (
        <div
          className="card"
          style={{ marginBottom: 12, background: "#e8f8ef", borderColor: "#9fd4b5" }}
        >
          <p style={{ margin: 0 }}>{toast}</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>
          {location.brandName}
          <span className={`live-pill ${liveStatusClass(location.liveStatus)}`}>
            {isBeauty
              ? beautyWaitDisplay(location.liveStatus, location.estimatedWaitMinutes)
              : liveStatusLabel(
                  location.liveStatus,
                  location.providerType,
                  location.estimatedWaitMinutes,
                )}
          </span>
        </h1>
        <p className="stat">{location.displayName}</p>
        {location.addressLine ? <p className="stat">{location.addressLine}</p> : null}
        {location.tagline && <p style={{ margin: "12px 0 0" }}>{location.tagline}</p>}
        {isBeauty ? (
          <p className="stat" style={{ marginTop: 8 }}>
            {beautyWaitDisplay(location.liveStatus, location.estimatedWaitMinutes)}
          </p>
        ) : null}
        {!isLaundry && !isHomeService && !isBeauty && (location.prepMinutes != null || location.etaMinutes != null) && (
          <p className="stat" style={{ marginTop: 8 }}>
            ⏱ {location.prepMinutes ?? "?"} phút nấu · ~{location.etaMinutes ?? "?"} phút giao
          </p>
        )}
        {location.liveMessage && (
          <p className="stat" style={{ marginTop: 4 }}>
            {location.liveMessage}
          </p>
        )}
        {reviews && reviews.count > 0 && (
          <p className="stat" style={{ marginTop: 8 }}>
            ★ {reviews.averageRating} · {reviews.count} đánh giá (S13)
          </p>
        )}
        {!zoneId && (
          <p className="stat" style={{ marginTop: 12, color: "var(--accent-dark)" }}>
            Tham gia Zone KVL để{" "}
            {isHomeService ? "gửi yêu cầu" : isBeauty ? "xem tiệm" : isLaundry ? "đặt hàng" : "đặt món"}.
          </p>
        )}
      </div>

      {isBeauty && activeVisit ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#9fd4b5" }}>
          <p className="section-title">Bạn đang báo sắp tới</p>
          <p style={{ margin: "0 0 8px" }}>
            {activeVisit.offeringName ?? "Dịch vụ"} · ~{String(activeVisit.etaMinutes)} phút nữa
          </p>
          <p className="stat" style={{ margin: "0 0 10px" }}>
            Dự kiến tới ~{" "}
            {new Date(activeVisit.expectedAt).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" · "}
            Tiệm đã nhận thông báo (không phải đặt lịch cố định).
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", padding: "8px 12px" }}
            disabled={visitSubmitting}
            onClick={() => void cancelVisitIntent()}
          >
            Hủy báo sắp tới
          </button>
        </div>
      ) : null}

      {isBeauty && location.contacts?.provider ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Liên hệ</p>
          <p className="stat" style={{ margin: "0 0 10px" }}>
            Gọi/Zalo tiệm hoặc chỉ đường — chọn dịch vụ bên dưới để báo sắp tới.
          </p>
          <LocationContactActions
            providerPhone={location.contacts.provider.phone}
            providerLabel={location.contacts.provider.label ?? location.brandName}
            lat={location.lat}
            lng={location.lng}
            addressLine={location.addressLine}
          />
        </div>
      ) : null}

      {dailySpecials.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Món trong ngày (S18)</p>
          {dailySpecials.map((s) => (
            <article key={s.id} className="provider-card" style={{ marginBottom: 8 }}>
              <strong>{s.name}</strong> · {formatVnd(s.amountVnd)}
              <p className="stat">
                Còn {s.quantityRemaining} suất
                {s.fulfillmentMode ? ` · ${fulfillmentLabel(s.fulfillmentMode)}` : ""}
              </p>
            </article>
          ))}
        </div>
      )}

      <div className="card">
        <p className="section-title">
          {isLaundry || isHomeService || isBeauty ? "Dịch vụ" : "Menu"}
        </p>
        {items.length === 0 ? (
          <p className="stat">
            {isLaundry || isHomeService || isBeauty
              ? "Chưa có dịch vụ — tiệm đang cập nhật."
              : "Chưa có món — provider đang cập nhật."}
          </p>
        ) : (
          <div className="provider-list">
            {items.map((item) => (
              <article key={item.id} className="provider-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{item.name}</h3>
                    {item.fulfillmentMode && (
                      <span className="badge" style={{ marginLeft: 6, fontSize: 11 }}>
                        {fulfillmentLabel(item.fulfillmentMode)}
                      </span>
                    )}
                    {item.description && (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {item.description}
                      </p>
                    )}
                    {isLaundry ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {formatLaundryReferencePrice(
                          item.amountVnd,
                          item.pricingKind,
                          laundryPriceUnit(item.slug),
                        ) ?? "Báo giá tại tiệm"}
                        {item.estimatedDays
                          ? ` · Dự kiến ~${String(item.estimatedDays)} ngày`
                          : ""}
                        {" · Thanh toán sau"}
                      </p>
                    ) : isHomeService ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {formatHomeServicePrice(item.amountVnd, item.pricingKind)}
                        {" · Liên hệ / báo giá tại nhà"}
                      </p>
                    ) : isBeauty ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {formatBeautyPrice(item.amountVnd, item.pricingKind)}
                        {" · Liên hệ tiệm"}
                      </p>
                    ) : (
                      <strong>{formatVnd(item.amountVnd)}</strong>
                    )}
                  </div>
                  {isHomeService ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }}
                      onClick={() => setRequestItem(item)}
                    >
                      Gửi yêu cầu
                    </button>
                  ) : isBeauty ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }}
                      onClick={() => {
                        setRequestItem(null);
                        setVisitItem(item);
                      }}
                    >
                      Báo sắp tới
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }}
                      onClick={() => handleAdd(item)}
                    >
                      + Thêm
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {visitItem ? (
        <div id="visit-intent-form" className="card service-request-form" style={{ marginTop: 16 }}>
          <p className="section-title">Báo sắp tới — {visitItem.name}</p>
          <p className="stat" style={{ margin: "0 0 12px" }}>
            Tiệm biết bạn sắp tới để cân ca — không cam kết giờ cố định.
          </p>
          <p className="stat" style={{ margin: "0 0 8px" }}>
            Tôi sẽ tới sau
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {VISIT_ETA_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={visitEtaMinutes === m ? "btn provider-btn" : "btn btn-secondary"}
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => setVisitEtaMinutes(m)}
              >
                ~{String(m)} phút
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={visitSubmitting}
              onClick={() => void submitVisitIntent()}
            >
              {visitSubmitting ? "Đang gửi…" : "Gửi thông báo cho tiệm"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "auto" }}
              onClick={() => setVisitItem(null)}
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}

      {requestItem ? (
        <div id="service-request-form" className="card service-request-form" style={{ marginTop: 16 }}>
          <p className="section-title">Gửi yêu cầu — {requestItem.name}</p>
          <label className="stat" htmlFor="req-building">
            Tòa
          </label>
          <input
            id="req-building"
            value={requestBuilding}
            onChange={(e) => setRequestBuilding(e.target.value)}
            style={{ width: "100%", marginBottom: 8, padding: 10 }}
          />
          <label className="stat" htmlFor="req-apt">
            Căn hộ
          </label>
          <input
            id="req-apt"
            value={requestApartment}
            onChange={(e) => setRequestApartment(e.target.value)}
            placeholder="VD: 1205"
            style={{ width: "100%", marginBottom: 8, padding: 10 }}
          />
          <label className="stat" htmlFor="req-note">
            Mô tả sự cố / yêu cầu
          </label>
          <textarea
            id="req-note"
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="VD: Ổ cắm phòng khách chập điện…"
            style={{ width: "100%", marginBottom: 12, padding: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={submitting}
              onClick={() => void submitRequest()}
            >
              {submitting ? "Đang gửi…" : "Gửi yêu cầu"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "auto" }}
              onClick={() => setRequestItem(null)}
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}

      {count > 0 && !isHomeService && !isBeauty && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "12px 16px 20px",
            background: "rgba(247,245,242,0.95)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <Link href="/checkout" className="btn" style={{ textAlign: "center" }}>
              {isLaundry
                ? `Giỏ · ${String(count)} dịch vụ · ${orderButtonLabel(location.providerType)}`
                : `Giỏ hàng · ${count} món · ${formatVnd(total)}`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
