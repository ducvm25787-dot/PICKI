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
import { addToP6Cart } from "../../../lib/p6-cart";
import { marketEntryFromQuery } from "@picki/shared";
import { LocationContactActions } from "../../components/location-contact-actions";
import { SaveFamiliarButton } from "../../components/save-familiar-button";
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
  isFoodBreakfastVertical,
  isLaundryVertical,
  laundryPriceUnit,
  liveStatusClass,
  liveStatusLabel,
  orderButtonLabel,
} from "../../../lib/providers";

type MorningShelf = {
  enabled: boolean;
  orderingOpen: boolean;
  serviceDate: string | null;
  cutoffTime: string | null;
  windows: { id: string; startsAt: string; endsAt: string; label: string }[];
  items: MenuResponse["items"];
};

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
    pickeeVerified?: boolean;
    sellNow?: boolean;
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
    listAmountVnd?: number;
    fulfillmentMode?: string | null;
    educationSubject?: string | null;
    educationGrade?: string | null;
    paymentPolicy?: string | null;
    estimatedDays?: number | null;
    pricingKind?: string | null;
    imageUrl?: string | null;
    unit?: string | null;
    prepTimeMinutes?: number | null;
    categoryName?: string | null;
    todayStatus?: "UNSET" | "AVAILABLE" | "SOLD_OUT";
    todayRemaining?: number | null;
    alcoholRestricted?: boolean;
    optionGroups?: {
      id: string;
      name: string;
      selection: "SINGLE" | "MULTI";
      required: boolean;
      options: { id: string; name: string; priceDeltaVnd: number }[];
    }[];
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

/**
 * Debt: amount 0 is not a market "ask price" state. Legacy contact verticals still store
 * QUOTE_REQUIRED / FROM with amount 0. A market line is on the shelf only when pricing is
 * FIXED, amount is above 0, and today has a published quantity.
 */
function marketOnShelf(item: MenuResponse["items"][number]) {
  return item.amountVnd > 0 && item.pricingKind !== "QUOTE_REQUIRED" && item.todayStatus !== "SOLD_OUT";
}

function groupMenu(items: MenuResponse["items"]) {
  const order: string[] = [];
  const buckets = new Map<string, MenuResponse["items"]>();
  for (const item of items) {
    const name = item.categoryName ?? "Khác";
    const bucket = buckets.get(name);
    if (bucket) bucket.push(item);
    else {
      order.push(name);
      buckets.set(name, [item]);
    }
  }
  return order.map((name) => ({ name, items: buckets.get(name) ?? [] }));
}

export default function LocationMenuPage() {
  const params = useParams<{ locationId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const marketEntry = marketEntryFromQuery(search.get("context"));
  const wantRepeat = search.get("repeat") === "1";
  const offerId = search.get("offer");
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
  const [detailQty, setDetailQty] = useState(1);
  const [morning, setMorning] = useState<MorningShelf | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);

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
        if (data.familyDinner?.enabled && !offerId) {
          const date = data.familyDinner.serviceDate ?? "";
          const q = new URLSearchParams();
          if (zid) q.set("zoneId", zid);
          if (date) q.set("date", date);
          router.replace(`/family-dinner/${params.locationId}?${q.toString()}`);
          return; // keep loading until navigation; skip empty menu flash
        }
        setMenu(data);
        const shelf = await api<MorningShelf>(`/locations/${params.locationId}/morning`).catch(() => null);
        setMorning(shelf);
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
        if (offerId) {
          requestAnimationFrame(() => {
            document.getElementById(`offer-${offerId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "auth") {
          setError(e.message);
        }
        setLoading(false);
      }
    }
    void load();
  }, [params.locationId, router, wantRepeat, offerId]);

  const [optionItem, setOptionItem] = useState<MenuResponse["items"][0] | null>(null);
  const [optionPicks, setOptionPicks] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setDetailQty(1);
    const item = menu?.items.find((row) => row.id === offerId);
    if (!item?.optionGroups?.length) {
      setOptionItem(null);
      return;
    }
    const picks: Record<string, string[]> = {};
    for (const group of item.optionGroups) {
      if (group.selection === "SINGLE" && group.options[0]) picks[group.id] = [group.options[0].id];
    }
    setOptionPicks(picks);
    setOptionItem(item);
  }, [offerId, menu]);

  function startAdd(item: MenuResponse["items"][0]) {
    if (item.optionGroups && item.optionGroups.length > 0) {
      const picks: Record<string, string[]> = {};
      for (const group of item.optionGroups) {
        if (group.selection === "SINGLE" && group.options[0]) picks[group.id] = [group.options[0].id];
      }
      setOptionPicks(picks);
      setOptionItem(item);
      return;
    }
    handleAdd(item);
  }

  function confirmOptions() {
    if (!optionItem?.optionGroups) return;
    const optionIds = optionItem.optionGroups.flatMap((group) => optionPicks[group.id] ?? []);
    const missing = optionItem.optionGroups.some(
      (group) => group.selection === "SINGLE" && (optionPicks[group.id] ?? []).length !== 1,
    );
    if (missing) {
      setToast("Chọn đủ lựa chọn bắt buộc");
      return;
    }
    const extra = optionItem.optionGroups
      .flatMap((group) => group.options)
      .filter((option) => optionIds.includes(option.id))
      .reduce((sum, option) => sum + option.priceDeltaVnd, 0);
    const labels = optionItem.optionGroups
      .flatMap((group) => group.options)
      .filter((option) => optionIds.includes(option.id))
      .map((option) => option.name);
    handleAdd(
      { ...optionItem, name: labels.length ? `${optionItem.name} · ${labels.join(", ")}` : optionItem.name, amountVnd: optionItem.amountVnd + extra },
      optionIds,
      detailQty,
    );
    setOptionItem(null);
  }

  function handleAdd(item: MenuResponse["items"][0], optionIds?: string[], quantity = 1) {
    if (marketEntry) {
      if (!menu || !zoneId) {
        setToast("Tham gia Zone trước khi thêm vào giỏ");
        return;
      }
      addToP6Cart({
        entry: marketEntry,
        clusterSlug: search.get("cluster"),
        zoneId,
        locationId: menu.location.id,
        brandName: menu.location.brandName,
        line: { offeringId: item.id, name: item.name, amountVnd: item.amountVnd },
        quantity,
      });
      setToast(marketEntry === "CLUSTER" ? "Đã thêm vào giỏ chợ" : "Đã thêm vào giỏ cửa hàng");
      return;
    }
    if (search.get("when") === "morning") {
      if (!morning?.orderingOpen) {
        setToast(morning?.cutoffTime ? `Đã qua giờ chốt ${morning.cutoffTime}` : "Quán chưa mở Sáng mai giao");
        return;
      }
      if (!windowId) {
        setToast("Chọn khung giờ sáng");
        return;
      }
    }
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
          serviceDate: search.get("when") === "morning" ? morning?.serviceDate ?? null : null,
          scheduledDeliveryWindowId: search.get("when") === "morning" ? windowId : null,
          scheduledWindowLabel:
            search.get("when") === "morning"
              ? morning?.windows.find((window) => window.id === windowId)?.label ?? null
              : null,
        },
        {
          offeringId: item.id,
          name: item.name,
          amountVnd: item.amountVnd,
          fulfillmentMode: item.fulfillmentMode,
          estimatedDays: item.estimatedDays,
          pricingKind: item.pricingKind,
          alcoholRestricted: item.alcoholRestricted === true,
          ...(optionIds?.length ? { optionIds } : {}),
        },
        quantity,
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
  const morningMode = search.get("when") === "morning";
  const catalogItems = morningMode ? (morning?.enabled ? morning.items : []) : items;
  const isLaundry = isLaundryVertical(location.providerType);
  const isFood = isFoodBreakfastVertical(location.providerType);
  const isHomeService = isHomeServiceVertical(location.providerType);
  const isBeauty = isBeautyVertical(location.providerType);
  const isPet = isPetVertical(location.providerType);
  const isAuto = isAutoVertical(location.providerType);
  const isHealth = isHealthVertical(location.providerType);
  const isPharmacy = isPharmacyVertical(location.providerType);
  const isMarket = isMarketVertical(location.providerType);
  const marketSell = isMarket && location.sellNow === true;
  const shelfItems = morningMode ? catalogItems : marketSell ? items.filter(marketOnShelf) : items;
  const askItems = morningMode || !marketSell ? [] : items.filter((item) => !marketOnShelf(item));
  const menuGroups =
    (marketSell || isFood) && shelfItems.some((item) => item.categoryName)
      ? groupMenu(shelfItems)
      : [{ name: null as string | null, items: shelfItems }];
  const isTransport = isTransportVertical(location.providerType);
  const isCustomerVisit = isCustomerVisitVertical(location.providerType);
  const isEducation = isEducationVertical(location.providerType);
  const isSports = isSportsVertical(location.providerType);
  const goodsShop = isFood || isMarket;
  const shopCart = cart?.providerLocationId === location.id ? cart : null;
  const count = cartItemCount(shopCart);
  const total = cartTotalVnd(shopCart);
  const focused = offerId ? catalogItems.find((item) => item.id === offerId) ?? null : null;
  const otherGoods = goodsShop
    ? (marketSell || isFood ? shelfItems : items).filter(
        (item) => item.id !== focused?.id && item.todayStatus !== "SOLD_OUT" && item.amountVnd > 0,
      )
    : [];

  return (
    <div className="container" style={count > 0 ? { paddingBottom: 96 } : undefined}>
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

      {!goodsShop ? (
      <div className="card" style={{ marginBottom: 16 }}>
        <OpeningInterest locationId={location.id} />
        <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>
          {location.brandName}
          {location.pickeeVerified ? <span className="verified-pill">Pickee Verified</span> : null}
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
        <SaveFamiliarButton locationId={location.id} />
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
        {isMarket && !marketSell ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Gọi/Zalo hỏi còn hàng rồi qua lấy — cửa hàng chưa mở bán trên Pickee.
          </p>
        ) : null}
        {marketSell ? (
          <p className="stat" style={{ marginTop: 8 }}>
            Chọn sản phẩm đang bán hôm nay để giao tận căn hộ.
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
      ) : null}

      {marketEntry === "CLUSTER" ? (
        <p className="stat" style={{ marginBottom: 12 }}>
          Đang mua trong chợ. Thêm món vào giỏ chợ — giỏ cửa hàng giữ nguyên.
        </p>
      ) : marketEntry === "STORE" ? (
        <p className="stat" style={{ marginBottom: 12 }}>
          Đang mua trực tiếp cửa hàng này. Giỏ chợ giữ nguyên.
        </p>
      ) : null}

      {isMarket && !marketEntry ? (
        <div className="location-tabs" role="tablist" aria-label="Cách đặt">
          <button
            type="button"
            className="location-tab"
            aria-selected={!morningMode}
            onClick={() => router.replace(`/locations/${location.id}`)}
          >
            Đi chợ ngay
          </button>
          <button
            type="button"
            className="location-tab"
            aria-selected={morningMode}
            onClick={() => router.replace(`/locations/${location.id}?when=morning`)}
          >
            Sáng mai giao
          </button>
        </div>
      ) : null}

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
            : marketSell
              ? "Sản phẩm"
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
          saveLocationId={goodsShop ? location.id : null}
          liveLabel={
            goodsShop
              ? liveStatusLabel(location.liveStatus, location.providerType, location.estimatedWaitMinutes)
              : null
          }
          liveClassName={goodsShop ? liveStatusClass(location.liveStatus) : null}
        />
      ) : null}

      {tab === "menu" ? (
      <>
      {morningMode ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Sáng mai giao</p>
          {!morning?.enabled ? (
            <p className="stat">Quán chưa mở bán cho sáng mai.</p>
          ) : !morning.orderingOpen ? (
            <p className="stat">Đã qua giờ chốt {morning.cutoffTime}. Chọn lại vào tối mai.</p>
          ) : (
            <>
              <p className="stat">Giao {morning.serviceDate}. Chọn khung giờ rồi chọn hàng.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {morning.windows.map((window) => (
                  <button
                    key={window.id}
                    type="button"
                    className={windowId === window.id ? "btn" : "btn btn-secondary"}
                    style={{ width: "auto" }}
                    onClick={() => setWindowId(window.id)}
                  >
                    {window.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
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

      {(isCustomerVisit || isEducation || isSports || isPharmacy || (isMarket && !marketSell) || isTransport) &&
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
              : isMarket && !marketSell
                ? "Gọi/Zalo hỏi còn hàng / giá — rồi qua lấy tại quán."
              : marketSell
                ? "Có thể hỏi thêm loại hoặc số lượng trước khi đặt."
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
      ) : isMarket && !marketSell ? (
        <MarketInquiry locationId={location.id} />
      ) : goodsShop ? (
        <>
          {focused ? (
            <article id={`offer-${focused.id}`} className="card" style={{ marginBottom: 16 }}>
              {focused.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={focused.imageUrl}
                  alt=""
                  style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 12, display: "block" }}
                />
              ) : (
                <div className="today-hero-ph" style={{ height: 160, borderRadius: 12 }}>
                  {focused.name.trim().charAt(0).toUpperCase() || "•"}
                </div>
              )}
              <h2 style={{ margin: "12px 0 4px", fontSize: 22 }}>{focused.name}</h2>
              <p className="stat" style={{ margin: "0 0 8px" }}>
                {[focused.categoryName, focused.unit].filter(Boolean).join(" · ")}
              </p>
              {focused.description ? <p style={{ margin: "0 0 8px" }}>{focused.description}</p> : null}
              <p style={{ margin: "0 0 8px" }}>
                {focused.listAmountVnd && focused.listAmountVnd > focused.amountVnd ? (
                  <>
                    <s style={{ color: "var(--muted)", fontWeight: 500, marginRight: 6 }}>
                      {formatVnd(focused.listAmountVnd)}
                    </s>
                    <strong>{formatVnd(focused.amountVnd)}</strong>
                  </>
                ) : (
                  <strong>{formatVnd(focused.amountVnd)}</strong>
                )}
                {focused.unit ? <span className="stat"> / {focused.unit}</span> : null}
              </p>
              {focused.todayStatus === "SOLD_OUT" ? (
                <p className="stat">{morningMode ? "Hết sáng mai" : "Hết hôm nay"}</p>
              ) : focused.todayRemaining != null ? (
                <p className="stat">Còn {focused.todayRemaining}</p>
              ) : null}
              {focused.optionGroups?.map((group) => (
                <div key={group.id} style={{ marginTop: 10 }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 700 }}>
                    {group.name}
                    {group.selection === "SINGLE" ? " · chọn một" : " · thêm nếu muốn"}
                  </p>
                  {group.options.map((option) => {
                    const selected = (optionPicks[group.id] ?? []).includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={selected ? "btn" : "btn btn-secondary"}
                        style={{ width: "100%", marginBottom: 6, textAlign: "left" }}
                        onClick={() =>
                          setOptionPicks((prev) => {
                            const current = prev[group.id] ?? [];
                            if (group.selection === "SINGLE") return { ...prev, [group.id]: [option.id] };
                            const next = selected
                              ? current.filter((id) => id !== option.id)
                              : [...current, option.id];
                            return { ...prev, [group.id]: next };
                          })
                        }
                      >
                        {option.name}
                        {option.priceDeltaVnd > 0 ? ` · +${formatVnd(option.priceDeltaVnd)}` : ""}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="board-row" style={{ alignItems: "center", marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "auto" }}
                  onClick={() => setDetailQty((qty) => Math.max(1, qty - 1))}
                >
                  −
                </button>
                <strong>{detailQty}</strong>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "auto" }}
                  onClick={() =>
                    setDetailQty((qty) =>
                      focused.todayRemaining != null ? Math.min(focused.todayRemaining, qty + 1) : qty + 1,
                    )
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ width: "auto", marginLeft: "auto" }}
                  disabled={focused.todayStatus === "SOLD_OUT" || focused.amountVnd <= 0}
                  onClick={() =>
                    focused.optionGroups?.length ? confirmOptions() : handleAdd(focused, undefined, detailQty)
                  }
                >
                  Thêm vào giỏ
                </button>
              </div>
            </article>
          ) : (
            <p className="tagline">Chọn một sản phẩm để xem giá và số lượng.</p>
          )}
          <p className="section-title">
            {morningMode
              ? focused
                ? "Hàng khác sáng mai"
                : "Hàng sáng mai"
              : focused
                ? "Sản phẩm khác hôm nay"
                : "Đang bán hôm nay"}
          </p>
          {otherGoods.length === 0 ? (
            <p className="stat">
              {morningMode ? "Quán chưa mở hàng cho sáng mai." : "Chưa có sản phẩm khác đang bán."}
            </p>
          ) : (
            <div className="today-hero-grid" style={{ marginBottom: 16 }}>
              {otherGoods.map((item) => (
                <Link
                  key={item.id}
                  href={`/locations/${location.id}?offer=${item.id}${morningMode ? "&when=morning" : ""}${
                    marketEntry
                      ? `&context=${search.get("context")}${search.get("cluster") ? `&cluster=${search.get("cluster")}` : ""}`
                      : ""
                  }`}
                  className="today-hero-card"
                >
                  <span className="today-hero-media">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" />
                    ) : (
                      <span className="today-hero-ph" aria-hidden>
                        {item.name.trim().charAt(0).toUpperCase() || "•"}
                      </span>
                    )}
                    {item.categoryName ? <span className="today-hero-badge">{item.categoryName}</span> : null}
                  </span>
                  <strong className="today-hero-title">{item.name}</strong>
                  <span className="today-hero-price">
                    {item.listAmountVnd && item.listAmountVnd > item.amountVnd ? (
                      <>
                        <s>{formatVnd(item.listAmountVnd)}</s>
                        <strong>{formatVnd(item.amountVnd)}</strong>
                      </>
                    ) : (
                      <strong>{formatVnd(item.amountVnd)}</strong>
                    )}
                    {item.unit ? <span className="stat">/{item.unit}</span> : null}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
      <div className="card">
        <p className="section-title">
          {isLaundry || isHomeService || isCustomerVisit || isEducation || isSports || isTransport
            ? "Dịch vụ"
            : marketSell
              ? "Đang bán hôm nay"
              : "Menu"}
        </p>
        {optionItem?.optionGroups?.length ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <p className="section-title">{optionItem.name}</p>
            {optionItem.optionGroups.map((group) => (
              <div key={group.id} style={{ marginBottom: 10 }}>
                <p style={{ margin: "0 0 6px", fontWeight: 700 }}>
                  {group.name}
                  {group.selection === "SINGLE" ? " · chọn một" : " · thêm nếu muốn"}
                </p>
                {group.options.map((option) => {
                  const selected = (optionPicks[group.id] ?? []).includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={selected ? "btn" : "btn btn-secondary"}
                      style={{ width: "100%", marginBottom: 6, textAlign: "left" }}
                      onClick={() =>
                        setOptionPicks((prev) => {
                          const current = prev[group.id] ?? [];
                          if (group.selection === "SINGLE") return { ...prev, [group.id]: [option.id] };
                          const next = selected
                            ? current.filter((id) => id !== option.id)
                            : [...current, option.id];
                          return { ...prev, [group.id]: next };
                        })
                      }
                    >
                      {option.name}
                      {option.priceDeltaVnd > 0 ? ` · +${formatVnd(option.priceDeltaVnd)}` : ""}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="board-row">
              <button type="button" className="btn" onClick={() => confirmOptions()}>
                Thêm vào giỏ
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setOptionItem(null)}>
                Đóng
              </button>
            </div>
          </div>
        ) : null}
        {shelfItems.length === 0 ? (
          <p className="stat">
            {marketSell
              ? "Hôm nay chưa mở bán sản phẩm nào."
              : isLaundry || isHomeService || isCustomerVisit || isEducation || isSports || isTransport
              ? "Chưa có dịch vụ — tiệm đang cập nhật."
              : "Chưa có món — provider đang cập nhật."}
          </p>
        ) : (
          <div className="provider-list">
            {menuGroups.map((group) => (
              <div key={group.name ?? "all"}>
                {group.name ? (
                  <p className="section-title" style={{ margin: "12px 0 8px", fontSize: 15 }}>
                    {group.name}
                  </p>
                ) : null}
                {group.items.map((item) => (
              <article
                key={item.id}
                id={`offer-${item.id}`}
                className="provider-card"
                style={offerId === item.id ? { outline: "2px solid #2d6a4f" } : undefined}
              >
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
                    {isFood && item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        width={64}
                        height={64}
                        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, marginTop: 6 }}
                      />
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
                      <>
                        <strong>
                          {item.listAmountVnd && item.listAmountVnd > item.amountVnd ? (
                            <>
                              <s style={{ color: "var(--muted)", fontWeight: 500, marginRight: 6 }}>
                                {formatVnd(item.listAmountVnd)}
                              </s>
                              {formatVnd(item.amountVnd)}
                            </>
                          ) : (
                            formatVnd(item.amountVnd)
                          )}
                          {(isFood || marketSell) && item.unit ? ` / ${item.unit}` : ""}
                        </strong>
                        {isFood && item.prepTimeMinutes ? (
                          <span className="stat"> · ~{item.prepTimeMinutes} phút</span>
                        ) : null}
                        {(isFood || marketSell) && item.todayStatus === "SOLD_OUT" ? (
                          <span className="stat"> · Hết hôm nay</span>
                        ) : null}
                        {(isFood || marketSell) && item.todayStatus === "AVAILABLE" && item.todayRemaining != null ? (
                          <span className="stat"> · Còn {item.todayRemaining}</span>
                        ) : null}
                      </>
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
                      disabled={(isFood || marketSell) && item.todayStatus === "SOLD_OUT"}
                      onClick={() => startAdd(item)}
                    >
                      {(isFood || marketSell) && item.todayStatus === "SOLD_OUT" ? "Hết hôm nay" : "+ Thêm"}
                    </button>
                  )}
                </div>
              </article>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {askItems.length > 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="section-title">Chưa mở bán hôm nay</p>
          <p className="tagline" style={{ marginTop: 0 }}>
            Những sản phẩm này chưa có số lượng trên kệ. Hỏi cửa hàng nếu cần.
          </p>
          {askItems.map((item) => (
            <div key={item.id} className="board-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span>
                <strong>{item.name}</strong>
                {item.categoryName ? <span className="stat"> · {item.categoryName}</span> : null}
                {item.amountVnd > 0 ? (
                  <span className="stat">
                    {" "}
                    · {formatVnd(item.amountVnd)}
                    {item.unit ? `/${item.unit}` : ""}
                    {item.todayStatus === "SOLD_OUT" ? " · Hết hôm nay" : ""}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => document.getElementById("market-chat")?.scrollIntoView({ behavior: "smooth" })}
              >
                Hỏi hàng
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {marketSell ? (
        <div id="market-chat">
          <MarketInquiry locationId={location.id} />
        </div>
      ) : null}

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
        <div className="dock-action">
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <Link href="/checkout" className="btn" style={{ textAlign: "center" }}>
              {isLaundry
                ? `Giỏ · ${String(count)} dịch vụ · ${orderButtonLabel(location.providerType)}`
                : `Giỏ hàng · ${count} món · ${formatVnd(total)}${shopCart?.scheduledWindowLabel ? ` · ${shopCart.scheduledWindowLabel}` : ""}`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
