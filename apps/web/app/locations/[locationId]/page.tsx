"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { track } from "../../../lib/analytics";
import {
  addToCart,
  cartItemCount,
  cartTotalVnd,
  readCart,
  type Cart,
} from "../../../lib/cart";
import { LocationContactActions } from "../../components/location-contact-actions";
import { OpeningInterest } from "../../components/opening-interest";
import { LocationIntroPanel } from "../../components/location-intro-panel";
import { OrderPhoneLinks } from "../../components/order-phone-links";
import { PharmacyInquiry } from "../../components/pharmacy-inquiry";
import { MarketInquiry } from "../../components/market-inquiry";
import { TransportInquiry } from "../../components/transport-inquiry";
import {
  formatBeautyPrice,
  formatHomeServicePrice,
  formatLaundryReferencePrice,
  formatVnd,
} from "../../../lib/money";
import {
  beautyWaitDisplay,
  fulfillmentLabel,
  isAutoVertical,
  isBeautyVertical,
  isCustomerVisitVertical,
  isEducationVertical,
  isHealthVertical,
  isHomeServiceVertical,
  isPetVertical,
  isPharmacyVertical,
  isMarketVertical,
  isTransportVertical,
  isSportsVertical,
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
    description?: string | null;
    logoUrl?: string | null;
    coverUrl?: string | null;
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
  familyDinner?: { enabled: boolean; serviceDate?: string };
  items: {
    id: string;
    slug?: string;
    name: string;
    description: string | null;
    amountVnd: number;
    fulfillmentMode?: string | null;
    educationSubject?: string | null;
    educationGrade?: string | null;
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
  shopWaitingAt?: string | null;
};

const VISIT_ETA_PRESETS = [15, 30, 45, 60] as const;

export default function LocationMenuPage() {
  const params = useParams<{ locationId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const wantRepeat = search.get("repeat") === "1";
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [repeatHint, setRepeatHint] = useState<{
    canRepeat: boolean;
    hint: string;
    blockedReasons: string[];
    items: { name: string; quantity: number; available: boolean; offeringId: string | null }[];
  } | null>(null);
  const [reviews, setReviews] = useState<ReviewsResponse | null>(null);
  const [requestItem, setRequestItem] = useState<MenuResponse["items"][0] | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [requestBuilding, setRequestBuilding] = useState("CT12");
  const [requestApartment, setRequestApartment] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [preferredAtLocal, setPreferredAtLocal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [visitItem, setVisitItem] = useState<MenuResponse["items"][0] | null>(null);
  const [visitEtaMinutes, setVisitEtaMinutes] = useState<number>(30);
  const [activeVisit, setActiveVisit] = useState<VisitIntent | null>(null);
  const [visitSubmitting, setVisitSubmitting] = useState(false);
  const [transportDraft, setTransportDraft] = useState<string | null>(null);
  const [transportDraftKey, setTransportDraftKey] = useState(0);
  const [tab, setTab] = useState<"menu" | "intro">("menu");

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
    if (!menu?.location.id || !isCustomerVisitVertical(menu.location.providerType)) return;
    void loadActiveVisit(menu.location.id);
    const t = setInterval(() => void loadActiveVisit(menu.location.id), 15000);
    return () => clearInterval(t);
  }, [menu?.location.id, menu?.location.providerType]);

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
        const zid = mine.zones[0]?.zoneId ?? null;
        if (data.familyDinner?.enabled) {
          const date = data.familyDinner.serviceDate ?? "";
          const q = new URLSearchParams();
          if (zid) q.set("zoneId", zid);
          if (date) q.set("date", date);
          router.replace(`/family-dinner/${params.locationId}?${q.toString()}`);
          return; // keep loading until navigation; skip empty menu flash
        }
        setMenu(data);
        setReviews(rev);
        setZoneId(zid);
        setCart(readCart());
        if (isCustomerVisitVertical(data.location.providerType)) {
          await loadActiveVisit(data.location.id);
        }
        if (wantRepeat) {
          const hint = await api<{
            canRepeat: boolean;
            hint: string;
            blockedReasons: string[];
            items: {
              name: string;
              quantity: number;
              available: boolean;
              offeringId: string | null;
            }[];
          }>(`/orders/repeat/${params.locationId}`).catch(() => null);
          setRepeatHint(hint);
        }
        setLoading(false);
      } catch (e) {
        if (e instanceof Error && e.message !== "auth") {
          setError(e.message);
        }
        setLoading(false);
      }
    }
    void load();
  }, [params.locationId, router, wantRepeat]);

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
    const isEducation = isEducationVertical(menu.location.providerType);
    const isSports = isSportsVertical(menu.location.providerType);
    if (isEducation && !homeAddress.trim()) {
      setToast("Nhập địa chỉ nhà");
      return;
    }
    if (isSports && !preferredAtLocal) {
      setToast("Chọn khung giờ muốn đặt sân");
      return;
    }
    if (!isEducation && !isSports && !requestApartment.trim()) {
      setToast("Nhập số căn hộ");
      return;
    }
    setSubmitting(true);
    try {
      const preferredAt = preferredAtLocal
        ? new Date(preferredAtLocal).toISOString()
        : undefined;
      const created = await api<{ id: string }>("/service-requests", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: menu.location.id,
          zoneId,
          offeringId: requestItem.id,
          customerNote: requestNote.trim() || undefined,
          preferredAt,
          deliveryNote: isEducation ? homeAddress.trim() : undefined,
          deliveryBuilding: isEducation || isSports ? undefined : requestBuilding.trim(),
          deliveryApartment: isEducation || isSports ? undefined : requestApartment.trim(),
        }),
      });
      setRequestItem(null);
      setRequestNote("");
      setHomeAddress("");
      setPreferredAtLocal("");
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
  const isPet = isPetVertical(location.providerType);
  const isAuto = isAutoVertical(location.providerType);
  const isHealth = isHealthVertical(location.providerType);
  const isPharmacy = isPharmacyVertical(location.providerType);
  const isMarket = isMarketVertical(location.providerType);
  const isTransport = isTransportVertical(location.providerType);
  const isCustomerVisit = isCustomerVisitVertical(location.providerType);
  const isEducation = isEducationVertical(location.providerType);
  const isSports = isSportsVertical(location.providerType);
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

      {repeatHint ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="section-title" style={{ marginBottom: 6 }}>
            Đặt lại đơn gần nhất
          </p>
          <p className="stat" style={{ marginBottom: 8 }}>
            {repeatHint.hint}
          </p>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 14 }}>
            {repeatHint.items.map((it) => (
              <li key={`${it.name}-${String(it.quantity)}`}>
                {it.name} ×{String(it.quantity)}
                {!it.available ? " — không còn / đổi menu" : ""}
              </li>
            ))}
          </ul>
          {repeatHint.blockedReasons.length > 0 ? (
            <p className="stat" style={{ color: "var(--danger, #dc2626)" }}>
              {repeatHint.blockedReasons.join(" · ")}
            </p>
          ) : null}
          {repeatHint.canRepeat ? (
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8 }}
              onClick={() => {
                track("repeat_action_click", {
                  properties: {
                    locationId: params.locationId,
                    itemCount: repeatHint.items.filter((i) => i.available).length,
                  },
                });
                let next = readCart();
                for (const it of repeatHint.items) {
                  if (!it.offeringId || !it.available || !menu) continue;
                  const menuItem = menu.items.find((m) => m.id === it.offeringId);
                  if (!menuItem || menuItem.amountVnd == null) continue;
                  next = addToCart(next, {
                    offeringId: menuItem.id,
                    name: menuItem.name,
                    amountVnd: menuItem.amountVnd,
                    quantity: it.quantity,
                  });
                }
                setCart(next);
                setToast("Đã thêm món còn bán vào giỏ — kiểm tra giá trước khi thanh toán.");
              }}
            >
              Thêm món còn bán vào giỏ
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <OpeningInterest locationId={location.id} />
        <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>
          {location.brandName}
          <span
            className={`live-pill ${liveStatusClass(
              isEducation ? "OPEN" : location.liveStatus,
            )}`}
          >
            {isCustomerVisit
              ? beautyWaitDisplay(
                  location.liveStatus,
                  location.estimatedWaitMinutes,
                  location.providerType,
                )
              : liveStatusLabel(
                  location.liveStatus,
                  location.providerType,
                  location.estimatedWaitMinutes,
                )}
          </span>
        </h1>
        <p className="stat">{location.displayName}</p>
        {location.addressLine ? <p className="stat">{location.addressLine}</p> : null}
        {(location.lat != null && location.lng != null) || location.addressLine ? (
          <div style={{ marginTop: 10 }}>
            <LocationContactActions
              providerPhone={null}
              providerLabel={location.brandName}
              lat={location.lat}
              lng={location.lng}
              addressLine={location.addressLine}
            />
          </div>
        ) : null}
        {location.tagline && <p style={{ margin: "12px 0 0" }}>{location.tagline}</p>}
        {isCustomerVisit ? (
          <p className="stat" style={{ marginTop: 8 }}>
            {beautyWaitDisplay(
              location.liveStatus,
              location.estimatedWaitMinutes,
              location.providerType,
            )}
          </p>
        ) : null}
        {isHealth ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Xem thời gian chờ rồi báo sắp tới khám. Triệu chứng và kết quả khám trao đổi trực tiếp
            với phòng khám — Pickee không lưu thông tin bệnh án.
          </p>
        ) : null}
        {isPharmacy ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Gọi/Zalo hỏi còn hàng rồi qua lấy — Pickee không bán thuốc online và không giao thuốc V1.
          </p>
        ) : null}
        {isMarket ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Gọi/Zalo hỏi còn hàng rồi qua lấy — Pickee chưa bán tạp hóa online và chưa giao hàng V1.
          </p>
        ) : null}
        {isTransport ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Gọi/Zalo hỏi lịch & giá — sân bay, về quê, du lịch, đưa đón học sinh. Không đặt chuyến
            tự động trên Pickee V1.
          </p>
        ) : null}
        {isPet ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Spa tại tiệm — báo sắp tới · Trông pet / dắt chó — gửi yêu cầu tại nhà.
          </p>
        ) : null}
        {isAuto ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Rửa xe & bơm lốp — xem chờ live, báo sắp mang xe · Thay dầu/sửa chữa — liên hệ trực tiếp.
          </p>
        ) : null}
        {isEducation ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Gia sư · học online · lớp tại trung tâm — đặt buổi học thử, không thu học phí qua Pickee.
          </p>
        ) : null}
        {isSports ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Chọn sân và gửi khung giờ mong muốn — sân xác nhận qua yêu cầu, không thanh toán qua Pickee V1.
          </p>
        ) : null}
        {!isLaundry &&
          !isHomeService &&
          !isCustomerVisit &&
          !isEducation &&
          !isSports &&
          !isPharmacy &&
          !isMarket &&
          !isTransport &&
          (location.prepMinutes != null || location.etaMinutes != null) && (
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
            {isHomeService || isEducation || isSports
              ? "gửi yêu cầu"
              : isCustomerVisit
                ? "xem tiệm"
                : isLaundry
                  ? "đặt hàng"
                  : "đặt món"}
            .
          </p>
        )}
      </div>

      <div className="location-tabs" role="tablist" aria-label="Nội dung quán">
        <button
          type="button"
          role="tab"
          className="location-tab"
          aria-selected={tab === "menu"}
          onClick={() => setTab("menu")}
        >
          {isLaundry || isHomeService || isCustomerVisit || isEducation || isSports || isTransport
            ? "Dịch vụ"
            : isPharmacy || isMarket
              ? "Hỏi hàng"
              : "Menu"}
        </button>
        <button
          type="button"
          role="tab"
          className="location-tab"
          aria-selected={tab === "intro"}
          onClick={() => setTab("intro")}
        >
          Giới thiệu
        </button>
      </div>

      {tab === "intro" ? (
        <LocationIntroPanel
          brandName={location.brandName}
          displayName={location.displayName}
          tagline={location.tagline}
          description={location.description}
          logoUrl={location.logoUrl}
          coverUrl={location.coverUrl}
          addressLine={location.addressLine}
          lat={location.lat}
          lng={location.lng}
          providerPhone={location.contacts?.provider?.phone ?? null}
          averageRating={reviews?.averageRating ?? null}
          reviewCount={reviews?.count ?? 0}
        />
      ) : null}

      {tab === "menu" ? (
      <>
      {isCustomerVisit && activeVisit ? (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: activeVisit.shopWaitingAt ? "#2d6a4f" : "#9fd4b5",
          }}
        >
          {activeVisit.shopWaitingAt ? (
            <p
              style={{
                margin: "0 0 10px",
                padding: "8px 10px",
                borderRadius: 8,
                background: "#d8f3dc",
                color: "#1b4332",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              ✓ {isHealth ? "Phòng khám đang chờ bạn" : "Tiệm đang chờ bạn"}
            </p>
          ) : null}
          <p className="section-title">
            {isPet
              ? "Bạn đang báo pet sắp tới"
              : isAuto
                ? "Bạn đang báo sắp mang xe"
                : isHealth
                  ? "Bạn đang báo sắp tới khám"
                  : "Bạn đang báo sắp tới"}
          </p>
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
            {activeVisit.shopWaitingAt
              ? isHealth
                ? "Phòng khám đang mở và chờ bạn tới."
                : "Tiệm đang mở cửa và chờ bạn tới."
              : isHealth
                ? "Phòng khám đã nhận thông báo (không phải đặt lịch hẹn)."
                : "Tiệm đã nhận thông báo (không phải đặt lịch cố định)."}
          </p>
          {location.contacts?.provider.phone ? (
            <div style={{ marginBottom: 10 }}>
              <OrderPhoneLinks
                contacts={{
                  customer: { phone: null },
                  provider: {
                    phone: location.contacts.provider.phone,
                    label: location.contacts.provider.label ?? location.brandName,
                  },
                }}
                hideRole="customer"
                compact
              />
            </div>
          ) : null}
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

      {(isCustomerVisit || isEducation || isSports || isPharmacy || isMarket || isTransport) &&
      location.contacts?.provider ? (
        <div id="location-contact" className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Liên hệ</p>
          <p className="stat" style={{ margin: "0 0 10px" }}>
            {isEducation
              ? "Gọi/Zalo trung tâm hoặc đặt buổi học thử bên dưới."
              : isSports
                ? "Gọi/Zalo sân hoặc gửi yêu cầu khung giờ bên dưới."
              : isPharmacy
                ? "Gọi/Zalo hỏi còn hàng / giá — rồi qua lấy tại hiệu. Không đặt hàng thuốc trên Pickee."
              : isMarket
                ? "Gọi/Zalo hỏi còn hàng / giá — rồi qua lấy tại quán. Không đặt hàng tạp hóa trên Pickee V1."
              : isTransport
                ? "Gọi/Zalo hỏi lịch đón & giá — không giữ chỗ tự động trên Pickee V1."
              : isAuto
                ? "Thay dầu, sửa chữa — gọi/Zalo trực tiếp. Rửa xe/bơm lốp có thể báo sắp mang xe bên dưới."
              : isHealth
                ? "Gọi/Zalo phòng khám để hỏi trước — hoặc chọn dịch vụ bên dưới để báo sắp tới khám."
              : isPet
                ? "Gọi/Zalo tiệm — spa thì báo sắp tới, trông/dắt chó thì gửi yêu cầu."
                : "Gọi/Zalo tiệm hoặc chỉ đường — chọn dịch vụ bên dưới để báo sắp tới."}
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

      {isPharmacy ? (
        <PharmacyInquiry locationId={location.id} />
      ) : isMarket ? (
        <MarketInquiry locationId={location.id} />
      ) : (
      <div className="card">
        <p className="section-title">
          {isLaundry || isHomeService || isCustomerVisit || isEducation || isSports || isTransport
            ? "Dịch vụ"
            : "Menu"}
        </p>
        {items.length === 0 ? (
          <p className="stat">
            {isLaundry || isHomeService || isCustomerVisit || isEducation || isSports || isTransport
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
                    {item.fulfillmentMode ? (
                      <span className="badge" style={{ marginLeft: 6, fontSize: 11 }}>
                        {fulfillmentLabel(item.fulfillmentMode, location.providerType)}
                      </span>
                    ) : null}
                    {isEducation && (item.educationSubject || item.educationGrade) ? (
                      <span className="badge" style={{ marginLeft: 6, fontSize: 11 }}>
                        {[item.educationSubject, item.educationGrade].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
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
                    ) : isCustomerVisit ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {item.fulfillmentMode === "CONTACT_ONLY"
                          ? item.pricingKind === "QUOTE_REQUIRED"
                            ? isHealth
                              ? "Khám và báo giá tại phòng khám"
                              : "Báo giá tại tiệm"
                            : formatBeautyPrice(item.amountVnd, item.pricingKind)
                          : `${formatBeautyPrice(item.amountVnd, item.pricingKind)} · Xem chờ live`}
                      </p>
                    ) : isEducation ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {formatHomeServicePrice(item.amountVnd, item.pricingKind)}
                        {" · Học phí trao đổi trực tiếp"}
                      </p>
                    ) : isSports ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {formatHomeServicePrice(item.amountVnd, item.pricingKind)}
                        {" · /giờ · Thanh toán tại sân"}
                      </p>
                    ) : isPharmacy ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {item.pricingKind === "QUOTE_REQUIRED" || item.amountVnd <= 0
                          ? "Gọi hỏi còn hàng / giá"
                          : `Tham khảo từ ${formatVnd(item.amountVnd)} · Gọi trước khi qua`}
                      </p>
                    ) : isTransport ? (
                      <p className="stat" style={{ margin: "4px 0 0" }}>
                        {item.pricingKind === "QUOTE_REQUIRED" || item.amountVnd <= 0
                          ? "Gọi hỏi lịch & giá"
                          : `Tham khảo từ ${formatVnd(item.amountVnd)} · Gọi chốt giờ`}
                      </p>
                    ) : (
                      <strong>{formatVnd(item.amountVnd)}</strong>
                    )}
                  </div>
                  {isEducation ||
                  isHomeService ||
                  isSports ||
                  (isPet && item.fulfillmentMode === "PROVIDER_VISIT") ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }}
                      onClick={() => {
                        setVisitItem(null);
                        setRequestItem(item);
                      }}
                    >
                      {isEducation ? "Học thử miễn phí" : isSports ? "Đặt sân" : "Gửi yêu cầu"}
                    </button>
                  ) : item.fulfillmentMode === "CONTACT_ONLY" &&
                    (isAuto || isHealth || isPharmacy || isTransport) ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }}
                      onClick={() => {
                        if (isTransport) {
                          setTransportDraft(
                            `Mình muốn hỏi về: ${item.name}.\nGiờ đón / điểm đến / số người: `,
                          );
                          setTransportDraftKey((k) => k + 1);
                          document
                            .getElementById("transport-chat")
                            ?.scrollIntoView({ behavior: "smooth" });
                          return;
                        }
                        document
                          .getElementById("location-contact")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      {isTransport ? "Nhắn tin" : "Liên hệ"}
                    </button>
                  ) : item.fulfillmentMode === "CUSTOMER_VISIT" && isCustomerVisit ? (
                    <button
                      type="button"
                      className="btn provider-btn"
                      style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }}
                      onClick={() => {
                        setRequestItem(null);
                        setVisitItem(item);
                      }}
                    >
                      {isPet
                        ? "Báo pet sắp tới"
                        : isAuto
                          ? "Báo sắp mang xe"
                          : isHealth
                            ? "Báo sắp tới khám"
                            : "Báo sắp tới"}
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
      )}

      {isTransport ? (
        <TransportInquiry
          locationId={location.id}
          draftPrefill={transportDraft}
          draftKey={transportDraftKey}
        />
      ) : null}
      </>
      ) : null}

      {visitItem ? (
        <div id="visit-intent-form" className="card service-request-form" style={{ marginTop: 16 }}>
          <p className="section-title">
            {isPet
              ? `Báo pet sắp tới — ${visitItem.name}`
              : isAuto
                ? `Báo sắp mang xe — ${visitItem.name}`
                : isHealth
                  ? `Báo sắp tới khám — ${visitItem.name}`
                  : `Báo sắp tới — ${visitItem.name}`}
          </p>
          <p className="stat" style={{ margin: "0 0 12px" }}>
            {isPet
              ? "Tiệm biết bạn sắp mang pet tới — không cam kết giờ cố định."
              : isAuto
                ? "Tiệm biết bạn sắp mang xe tới — xem đông vắng, không đặt lịch cố định."
                : isHealth
                  ? "Phòng khám biết bạn sắp tới để cân lượt — không phải đặt lịch hẹn. Không cần ghi triệu chứng ở đây."
                  : "Tiệm biết bạn sắp tới để cân ca — không cam kết giờ cố định."}
          </p>
          <p className="stat" style={{ margin: "0 0 8px" }}>
            {isAuto ? "Tôi sẽ mang xe tới sau" : "Tôi sẽ tới sau"}
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
              {visitSubmitting
                ? "Đang gửi…"
                : isHealth
                  ? "Gửi thông báo cho phòng khám"
                  : "Gửi thông báo cho tiệm"}
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
          <p className="section-title">
            {isEducation
              ? `Đặt buổi học thử — ${requestItem.name}`
              : isSports
                ? `Đặt sân — ${requestItem.name}`
                : `Gửi yêu cầu — ${requestItem.name}`}
          </p>
          {isEducation ? (
            <p className="stat" style={{ margin: "0 0 12px" }}>
              Phụ trách sẽ liên hệ sắp xếp lịch theo giáo viên.
            </p>
          ) : null}
          {isSports ? (
            <p className="stat" style={{ margin: "0 0 12px" }}>
              Gửi khung giờ mong muốn — sân xác nhận hoặc đề xuất giờ khác qua chat.
            </p>
          ) : null}
          {isEducation ? (
            <>
              <label className="stat" htmlFor="req-home-address">
                Địa chỉ nhà
              </label>
              <input
                id="req-home-address"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="VD: CT12-1205 Kim Văn hoặc 15 ngõ 123 Đại Kim"
                style={{ width: "100%", marginBottom: 12, padding: 10 }}
              />
            </>
          ) : isSports ? (
            <>
              <label className="stat" htmlFor="req-preferred-at">
                Khung giờ muốn chơi
              </label>
              <input
                id="req-preferred-at"
                type="datetime-local"
                value={preferredAtLocal}
                onChange={(e) => setPreferredAtLocal(e.target.value)}
                style={{ width: "100%", marginBottom: 12, padding: 10 }}
              />
            </>
          ) : (
            <>
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
            </>
          )}
          <label className="stat" htmlFor="req-note">
            {isEducation
              ? "Ghi chú (trình độ, mục tiêu…)"
              : isSports
                ? "Ghi chú (số người, thời lượng…)"
                : "Mô tả sự cố / yêu cầu"}
          </label>
          <textarea
            id="req-note"
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={
              isEducation
                ? "VD: Con đang học trường Đại kim, con yếu phần hình học, muốn ôn thi vào 10…"
                : isSports
                  ? "VD: 4 người, chơi 1.5 giờ, có vợt sẵn…"
                  : "VD: Ổ cắm phòng khách chập điện…"
            }
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
              {submitting
                ? "Đang gửi…"
                : isEducation
                  ? "Gửi đăng ký"
                  : isSports
                    ? "Gửi đặt sân"
                    : "Gửi yêu cầu"}
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

      {count > 0 && !isHomeService && !isCustomerVisit && !isEducation && !isSports && (
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
