"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  addressKind,
  addressKindLabel,
  formatAddressLine,
  handoffModeLabel,
  isApartmentAddress,
  type AddressKind,
  type SavedAddress,
} from "../../lib/addresses";
import { AddressActionsMenu } from "../components/address-actions-menu";
import { HomeDeliveryConfirm, useOrderPresence } from "../components/order-presence";
import { cartTotalVnd, readCart, setCartLineQuantity, writeCart, type Cart } from "../../lib/cart";
import { getCurrentPositionOnce } from "../../lib/geolocation";
import { mapsDirectionsUrl } from "../../lib/maps";
import { formatVnd } from "../../lib/money";
import { isLaundryVertical, isMarketVertical, orderButtonLabel } from "../../lib/providers";

type OrderResult = {
  id: string;
  orderNumber: string;
  status: string;
  totalVnd: number;
};

type OrderQuote = {
  subtotalVnd: number;
  deliveryFeeVnd: number;
  totalVnd: number;
};

type ZonePlace = {
  code: string;
  displayName: string;
  elevatorNote: string | null;
  accessCardRequired: boolean;
  securityNote: string | null;
  callUpRequired: boolean;
  doorDeliveryAllowed: boolean;
  lobbyWaitMinutes: number;
  doorWaitMinutes: number;
  runnerFeePerMinuteVnd: number;
  notes: string | null;
};

function matchPlace(places: ZonePlace[], building: string | null | undefined): ZonePlace | null {
  if (!building) return null;
  const code = building.trim().replace(/\s+/g, "").toUpperCase();
  return places.find((place) => place.code === code) ?? null;
}

function addressDisplayLabel(addr: SavedAddress, index: number): string {
  if (index === 0 && addr.label === "HOME") return "Nhà";
  return `Địa chỉ ${String(index + 1)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [handoffMode, setHandoffMode] = useState<"LOBBY_PICKUP" | "DOOR_DELIVERY">("DOOR_DELIVERY");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [newAddressKind, setNewAddressKind] = useState<AddressKind>("APARTMENT");
  const [newBuilding, setNewBuilding] = useState("");
  const [newFloor, setNewFloor] = useState("");
  const [newApartment, setNewApartment] = useState("");
  const [newHouseNumber, setNewHouseNumber] = useState("");
  const [newAlley, setNewAlley] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newWard, setNewWard] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingAddress, setConfirmingAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"COD" | "PAY_ON_PICKI">("COD");
  const [recipientAgeConfirmed, setRecipientAgeConfirmed] = useState(false);
  const hasDraftBeer = cart?.items.some((item) => item.alcoholRestricted) === true;
  const [laundryPickupMode, setLaundryPickupMode] = useState<"HOME_PICKUP" | "SHOP_DROP_OFF">(
    "HOME_PICKUP",
  );
  const [addressMenuId, setAddressMenuId] = useState<string | null>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [pinUpdatingId, setPinUpdatingId] = useState<string | null>(null);
  const [places, setPlaces] = useState<ZonePlace[]>([]);
  const [confirmHome, setConfirmHome] = useState(false);
  const presence = useOrderPresence(cart?.zoneId);

  useEffect(() => {
    if (!addressMenuId) return;
    const close = () => setAddressMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [addressMenuId]);

  useEffect(() => {
    void (async () => {
      try {
        await api("/me");
      } catch {
        router.replace("/login");
        return;
      }

      const c = readCart();
      if (!c?.items.length) {
        router.replace("/");
        return;
      }
      setCart(c);

      try {
        const res = await api<{ addresses: SavedAddress[] }>(`/zones/${c.zoneId}/addresses`);
        setAddresses(res.addresses);
        if (res.addresses[0]) {
          setSelectedAddressId(res.addresses[0].id);
        } else {
          setShowNewAddress(true);
        }
        try {
          const placeRes = await api<{ places: ZonePlace[] }>(`/zones/${c.zoneId}/places`);
          setPlaces(placeRes.places);
        } catch {
          setPlaces([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được địa chỉ");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!cart || cart.providerType === "LAUNDRY") {
      setQuote(null);
      return;
    }
    const selected = addresses.find((a) => a.id === selectedAddressId);
    const isApt = selected ? isApartmentAddress(selected) : true;
    const handoff = isApt ? handoffMode : "DOOR_DELIVERY";
    void (async () => {
      try {
        const res = await api<OrderQuote>("/orders/quote", {
          method: "POST",
          body: JSON.stringify({
            providerLocationId: cart.providerLocationId,
            zoneId: cart.zoneId,
            deliveryHandoffMode: handoff,
            items: cart.items.map((i) => ({
              offeringId: i.offeringId,
              quantity: i.quantity,
              ...(i.optionIds?.length ? { optionIds: i.optionIds } : {}),
            })),
          }),
        });
        setQuote(res);
      } catch {
        setQuote(null);
      }
    })();
  }, [cart, addresses, selectedAddressId, handoffMode]);

  useEffect(() => {
    const selected = addresses.find((a) => a.id === selectedAddressId);
    const place = matchPlace(places, selected?.building);
    if (place && !place.doorDeliveryAllowed && handoffMode === "DOOR_DELIVERY") {
      setHandoffMode("LOBBY_PICKUP");
    }
  }, [addresses, selectedAddressId, places, handoffMode]);

  function resetAddressForm() {
    setNewBuilding("");
    setNewFloor("");
    setNewApartment("");
    setNewHouseNumber("");
    setNewAlley("");
    setNewStreet("");
    setNewWard("");
    setNewNote("");
    setNewAddressKind("APARTMENT");
  }

  function closeAddressForm() {
    setShowNewAddress(false);
    setEditingAddressId(null);
    setAddressMenuId(null);
    resetAddressForm();
    setError(null);
  }

  async function refreshAddressPin(addressId: string) {
    if (!cart) return;
    setPinUpdatingId(addressId);
    setError(null);
    try {
      const geo = await getCurrentPositionOnce({ timeoutMs: 10000 });
      if (geo.source !== "gps") {
        setError(geo.error ?? "Không lấy được GPS — bật vị trí và thử lại");
        return;
      }
      const found = await api<{ zones: { id: string }[] }>("/zones/discover", {
        method: "POST",
        body: JSON.stringify(geo.position),
      });
      if (!found.zones.some((z) => z.id === cart.zoneId)) {
        setError("Bạn đang ở ngoài Zone. Không ghi vị trí hiện tại lên địa chỉ nhà.");
        return;
      }
      const updated = await api<{ id: string; lat: number; lng: number; hasPin: boolean }>(
        `/zones/${cart.zoneId}/addresses/${addressId}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify(geo.position),
        },
      );
      setAddresses((prev) =>
        prev.map((a) =>
          a.id === addressId
            ? { ...a, lat: updated.lat, lng: updated.lng, hasPin: true }
            : a,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được vị trí");
    } finally {
      setPinUpdatingId(null);
    }
  }

  function startEditAddress(addr: SavedAddress) {
    setAddressMenuId(null);
    setShowNewAddress(false);
    setEditingAddressId(addr.id);
    setNewAddressKind(addressKind(addr));
    setNewBuilding(addr.building ?? "");
    setNewFloor(addr.floor ?? "");
    setNewApartment(addr.apartment ?? "");
    setNewHouseNumber(addr.houseNumber ?? "");
    setNewAlley(addr.alley ?? "");
    setNewStreet(addr.street ?? "");
    setNewWard(addr.ward ?? "");
    setNewNote(addr.deliveryNote ?? "");
    setError(null);
  }

  function buildAddressBody(label: string) {
    return newAddressKind === "APARTMENT"
      ? {
          addressType: "RESIDENTIAL",
          label,
          building: newBuilding.trim(),
          floor: newFloor.trim() || undefined,
          apartment: newApartment.trim(),
          deliveryNote: newNote.trim() || undefined,
        }
      : {
          addressType: "STREET_ADDRESS",
          label,
          houseNumber: newHouseNumber.trim() || undefined,
          alley: newAlley.trim() || undefined,
          street: newStreet.trim(),
          ward: newWard.trim() || undefined,
          deliveryNote: newNote.trim() || undefined,
        };
  }

  function validateAddressForm(): boolean {
    if (newAddressKind === "APARTMENT") {
      if (!newBuilding.trim() || !newApartment.trim()) {
        setError("Nhập tòa và số căn");
        return false;
      }
    } else if (!newStreet.trim()) {
      setError("Nhập tên đường hoặc ngõ");
      return false;
    }
    return true;
  }

  async function addAddress(): Promise<string | null> {
    if (!cart) return null;
    if (!validateAddressForm()) return null;

    const addressLabel = addresses.length === 0 ? "HOME" : "OTHER";
    const created = await api<SavedAddress>(`/zones/${cart.zoneId}/addresses`, {
      method: "POST",
      body: JSON.stringify(buildAddressBody(addressLabel)),
    });
    setAddresses((prev) => [...prev, created]);
    setSelectedAddressId(created.id);
    closeAddressForm();
    return created.id;
  }

  async function updateAddress(addressId: string): Promise<boolean> {
    if (!cart) return false;
    if (!validateAddressForm()) return false;

    const existing = addresses.find((a) => a.id === addressId);
    if (!existing) return false;

    const updated = await api<SavedAddress>(`/zones/${cart.zoneId}/addresses/${addressId}`, {
      method: "PATCH",
      body: JSON.stringify(buildAddressBody(existing.label)),
    });
    setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
    setSelectedAddressId(addressId);
    closeAddressForm();
    return true;
  }

  async function deleteAddress(addressId: string) {
    if (!cart) return;
    if (addresses.length <= 1) {
      setError("Không thể xóa địa chỉ duy nhất");
      return;
    }
    if (!window.confirm("Xóa địa chỉ này?")) return;

    setError(null);
    try {
      await api(`/zones/${cart.zoneId}/addresses/${addressId}`, { method: "DELETE" });
      const next = addresses.filter((a) => a.id !== addressId);
      setAddresses(next);
      if (selectedAddressId === addressId) {
        setSelectedAddressId(next[0]?.id ?? "");
      }
      if (editingAddressId === addressId) {
        closeAddressForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được địa chỉ");
    }
  }

  async function confirmAddressForm() {
    setConfirmingAddress(true);
    setError(null);
    try {
      if (editingAddressId) {
        await updateAddress(editingAddressId);
      } else {
        await addAddress();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được địa chỉ");
    } finally {
      setConfirmingAddress(false);
    }
  }

  async function placeOrder() {
    if (!cart) return;
    if (!selectedAddressId) {
      setError("Chọn địa chỉ nhận hàng hoặc bấm Xác nhận sau khi nhập địa chỉ khác");
      return;
    }
    if (presence.status === "checking") {
      setError("Đang đọc vị trí…");
      return;
    }
    if (presence.needsHomeConfirm && !confirmHome) {
      setError(
        presence.status === "outside"
          ? "Bạn đang ở ngoài Zone. Xác nhận giao về địa chỉ nhà, không giao tại vị trí hiện tại."
          : "Chưa đọc được vị trí. Xác nhận giao về địa chỉ nhà đã lưu, không giao tại vị trí hiện tại.",
      );
      return;
    }
    if (hasDraftBeer && !recipientAgeConfirmed) {
      setError("Xác nhận người nhận đủ 18 tuổi");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = `web-${cart.providerLocationId}-${String(Date.now())}`;
      const order = await api<OrderResult>("/orders", {
        method: "POST",
        body: JSON.stringify({
          providerLocationId: cart.providerLocationId,
          zoneId: cart.zoneId,
          addressId: selectedAddressId,
          deliveryHandoffMode: effectiveHandoff,
          ...(isLaundry && !cartHasOnSite ? { laundryPickupMode } : {}),
          paymentMode: isLaundry
            ? "PAY_ON_COMPLETION"
            : hasDraftBeer
              ? "PAY_ON_PICKI"
              : cart.scheduledDeliveryWindowId
                ? "COD"
                : paymentMode,
          ...(cart.scheduledDeliveryWindowId
            ? {
                scheduledDeliveryWindowId: cart.scheduledDeliveryWindowId,
                serviceDate: cart.serviceDate,
              }
            : {}),
          ...(hasDraftBeer ? { recipientAgeConfirmed: true } : {}),
          idempotencyKey,
          ...presence.orderPresenceBody(confirmHome),
          items: cart.items.map((i) => ({
            offeringId: i.offeringId,
            quantity: i.quantity,
            ...(i.optionIds?.length ? { optionIds: i.optionIds } : {}),
          })),
        }),
      });
      writeCart(null);
      router.replace(
        `/orders/${order.id}?new=1${hasDraftBeer || paymentMode === "PAY_ON_PICKI" ? "&pay=1" : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt được");
      setSubmitting(false);
    }
  }

  function changeLine(item: Cart["items"][number], quantity: number) {
    const shop = cart
      ? `/locations/${cart.providerLocationId}${cart.scheduledDeliveryWindowId ? "?when=morning" : ""}`
      : "/";
    const next = setCartLineQuantity(item.offeringId, item.optionIds, quantity);
    setError(null);
    if (!next) {
      router.replace(shop);
      return;
    }
    setCart(next);
  }

  if (loading || !cart) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  const selected = addresses.find((a) => a.id === selectedAddressId);
  const isLaundry = isLaundryVertical(cart.providerType);
  const cartHasOnSite = cart.items.some((i) => i.fulfillmentMode === "ON_SITE");
  const selectedIsApartment = selected ? isApartmentAddress(selected) : true;
  const place = selected ? matchPlace(places, selected.building) : null;
  const doorAllowed = place ? place.doorDeliveryAllowed : true;
  const effectiveHandoff = isLaundry
    ? "DOOR_DELIVERY"
    : selectedIsApartment
      ? doorAllowed
        ? handoffMode
        : "LOBBY_PICKUP"
      : "DOOR_DELIVERY";
  const placeWaitMinutes = place
    ? effectiveHandoff === "DOOR_DELIVERY"
      ? place.doorWaitMinutes
      : place.lobbyWaitMinutes
    : 0;
  const placeWaitFee = placeWaitMinutes * (place?.runnerFeePerMinuteVnd ?? 0);
  const subtotal = cartTotalVnd(cart);
  const deliveryFee = !isLaundry && quote ? quote.deliveryFeeVnd : 0;
  const total = !isLaundry && quote ? quote.totalVnd : subtotal;

  return (
    <div className="container">
      <h1 style={{ fontSize: 22, margin: "0 0 16px" }}>Xác nhận đơn</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="stat" style={{ margin: "0 0 4px" }}>
          {isMarketVertical(cart.providerType) ? "Cửa hàng" : "Quán"}
        </p>
        <strong>{cart.brandName}</strong>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Địa chỉ nhận hàng</p>
        {addresses.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {addresses.map((addr, index) => (
              <div
                key={addr.id}
                className="field"
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: 10,
                  border:
                    addr.id === selectedAddressId
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                <input
                  type="radio"
                  name="address"
                  checked={selectedAddressId === addr.id}
                  onChange={() => {
                    setSelectedAddressId(addr.id);
                    closeAddressForm();
                  }}
                />
                <span style={{ fontSize: 14, flex: 1 }}>
                  <strong>{addressDisplayLabel(addr, index)}</strong> · {formatAddressLine(addr)}
                  {addr.deliveryNote ? (
                    <span className="stat" style={{ display: "block", marginTop: 2 }}>
                      {addr.deliveryNote}
                    </span>
                  ) : null}
                  <span className="stat" style={{ display: "block", marginTop: 4 }}>
                    {addr.hasPin || (addr.lat != null && addr.lng != null)
                      ? `Pin: ${Number(addr.lat).toFixed(5)}, ${Number(addr.lng).toFixed(5)}`
                      : "Chưa có vị trí map — bấm cập nhật GPS"}
                  </span>
                  <span style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="order-phone-link"
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                      disabled={pinUpdatingId === addr.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void refreshAddressPin(addr.id);
                      }}
                    >
                      {pinUpdatingId === addr.id ? "Đang lấy GPS…" : "Cập nhật GPS"}
                    </button>
                    {addr.lat != null && addr.lng != null ? (
                      <a
                        className="order-phone-link"
                        href={mapsDirectionsUrl({
                          destLat: addr.lat,
                          destLng: addr.lng,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Xem trên map
                      </a>
                    ) : null}
                  </span>
                </span>
                <AddressActionsMenu
                  open={addressMenuId === addr.id}
                  canDelete={addresses.length > 1}
                  onToggle={() =>
                    setAddressMenuId((id) => (id === addr.id ? null : addr.id))
                  }
                  onEdit={() => startEditAddress(addr)}
                  onDelete={() => {
                    setAddressMenuId(null);
                    void deleteAddress(addr.id);
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="stat" style={{ marginBottom: 12 }}>
            Chưa có địa chỉ lưu trong Zone — thêm bên dưới.
          </p>
        )}
        {!showNewAddress && !editingAddressId ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
            onClick={() => {
              setEditingAddressId(null);
              resetAddressForm();
              setShowNewAddress(true);
              setError(null);
            }}
          >
            + Địa chỉ khác
          </button>
        ) : (
          <div style={{ marginTop: 8 }}>
            <p className="stat" style={{ margin: "0 0 8px" }}>
              {editingAddressId ? "Sửa địa chỉ" : "Địa chỉ khác"}
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["APARTMENT", "STREET"] as AddressKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={newAddressKind === kind ? "btn" : "btn btn-secondary"}
                  style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                  onClick={() => setNewAddressKind(kind)}
                >
                  {addressKindLabel(kind)}
                </button>
              ))}
            </div>
            {newAddressKind === "APARTMENT" ? (
              <>
                <input
                  className="input"
                  placeholder="Tòa (vd CT12A)"
                  value={newBuilding}
                  onChange={(e) => setNewBuilding(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    className="input"
                    placeholder="Căn"
                    value={newApartment}
                    onChange={(e) => setNewApartment(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Tầng"
                    value={newFloor}
                    onChange={(e) => setNewFloor(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    className="input"
                    placeholder="Số nhà"
                    value={newHouseNumber}
                    onChange={(e) => setNewHouseNumber(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Ngõ (nếu có)"
                    value={newAlley}
                    onChange={(e) => setNewAlley(e.target.value)}
                  />
                </div>
                <input
                  className="input"
                  placeholder="Tên đường / ngõ"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <input
                  className="input"
                  placeholder="Phường (vd Đại Kim)"
                  value={newWard}
                  onChange={(e) => setNewWard(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
              </>
            )}
            <input
              className="input"
              placeholder="Ghi chú giao hàng (tuỳ chọn)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                style={{ width: "auto", padding: "8px 16px" }}
                disabled={confirmingAddress}
                onClick={() => void confirmAddressForm()}
              >
                {confirmingAddress ? "Đang lưu…" : "Xác nhận"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "auto", padding: "8px 16px" }}
                disabled={confirmingAddress}
                onClick={closeAddressForm}
              >
                Huỷ
              </button>
            </div>
          </div>
        )}
      </div>

      {isLaundry && cartHasOnSite ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Dịch vụ tại nhà</p>
          <p className="stat" style={{ margin: 0 }}>
            Nhân viên tiệm đến{" "}
            {selected ? formatAddressLine(selected) : "địa chỉ bạn"} thực hiện dịch vụ. Tiệm sẽ hẹn giờ qua
            chat sau khi nhận đơn.
          </p>
        </div>
      ) : isLaundry ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Hình thức nhận đồ</p>
          <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <input
              type="radio"
              checked={laundryPickupMode === "HOME_PICKUP"}
              onChange={() => setLaundryPickupMode("HOME_PICKUP")}
            />
            <span>
              <strong>Đến lấy tận nhà</strong>
              <span className="stat" style={{ display: "block", fontSize: 13 }}>
                Nhân viên tiệm đến {selected ? formatAddressLine(selected) : "địa chỉ bạn"} lấy đồ → giặt
                tại tiệm → giao lại
              </span>
            </span>
          </label>
          <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <input
              type="radio"
              checked={laundryPickupMode === "SHOP_DROP_OFF"}
              onChange={() => setLaundryPickupMode("SHOP_DROP_OFF")}
            />
            <span>
              <strong>Tự mang tới tiệm</strong>
              <span className="stat" style={{ display: "block", fontSize: 13 }}>
                Bạn mang đồ tới tiệm — tiệm giao lại khi xong
              </span>
            </span>
          </label>
        </div>
      ) : selectedIsApartment ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Hình thức giao (chung cư)</p>
          {place ? (
            <p className="stat" style={{ margin: "0 0 10px", fontSize: 13 }}>
              {place.displayName}
              {place.elevatorNote ? ` · ${place.elevatorNote}` : ""}
              {place.accessCardRequired ? " · Cần thẻ thang máy" : ""}
              {place.securityNote ? ` · ${place.securityNote}` : ""}
              {place.callUpRequired ? " · Bảo vệ gọi lên căn trước khi lên" : ""}
              {placeWaitMinutes > 0 ? ` · Chờ khoảng ${String(placeWaitMinutes)} phút` : ""}
              {placeWaitFee > 0
                ? ` · Phí runner thêm ${formatVnd(placeWaitFee)} (quán trả, không cộng vào tiền khách)`
                : ""}
            </p>
          ) : null}
          <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <input
              type="radio"
              checked={effectiveHandoff === "DOOR_DELIVERY"}
              disabled={!doorAllowed}
              onChange={() => setHandoffMode("DOOR_DELIVERY")}
            />
            <span>
              <strong>{handoffModeLabel("DOOR_DELIVERY")}</strong>
              <span className="stat" style={{ display: "block", fontSize: 13 }}>
                {doorAllowed
                  ? `Runner giao đến cửa ${selected ? formatAddressLine(selected) : "căn hộ"}`
                  : `${place?.displayName ?? "Tòa này"} chỉ nhận tại sảnh`}
              </span>
            </span>
          </label>
          <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <input
              type="radio"
              checked={handoffMode === "LOBBY_PICKUP"}
              onChange={() => setHandoffMode("LOBBY_PICKUP")}
            />
            <span>
              <strong>{handoffModeLabel("LOBBY_PICKUP")}</strong>
              <span className="stat" style={{ display: "block", fontSize: 13 }}>
                Xuống sảnh {selected?.building ?? "tòa nhà"} nhận — runner không lên căn
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">Hình thức giao</p>
          <p className="stat" style={{ margin: 0 }}>
            <strong>Giao tận cửa</strong> — runner đến địa chỉ{" "}
            {selected ? formatAddressLine(selected) : "mặt đất"} (không qua sảnh chung cư).
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="board-row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
          <p className="section-title" style={{ margin: 0 }}>
            Chi tiết
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", padding: "6px 10px" }}
            onClick={() =>
              router.push(
                `/locations/${cart.providerLocationId}${cart.scheduledDeliveryWindowId ? "?when=morning" : ""}`,
              )
            }
          >
            Thêm món
          </button>
        </div>
        {cart.items.map((item) => (
          <div
            key={`${item.offeringId}:${(item.optionIds ?? []).join(",")}`}
            style={{ marginTop: 12, fontSize: 15 }}
          >
            <div>{item.name}</div>
            {isLaundry && item.estimatedDays ? (
              <span className="stat" style={{ display: "block", fontSize: 13 }}>
                Dự kiến ~{String(item.estimatedDays)} ngày
              </span>
            ) : null}
            <div className="board-row" style={{ alignItems: "center", marginTop: 6 }}>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={`Giảm ${item.name}`}
                onClick={() => changeLine(item, item.quantity - 1)}
              >
                −
              </button>
              <strong>{item.quantity}</strong>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={`Tăng ${item.name}`}
                onClick={() => changeLine(item, item.quantity + 1)}
              >
                +
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => changeLine(item, 0)}
              >
                Bỏ
              </button>
              {!isLaundry ? (
                <span style={{ marginLeft: "auto" }}>{formatVnd(item.amountVnd * item.quantity)}</span>
              ) : null}
            </div>
          </div>
        ))}
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
        {isLaundry ? (
          <p className="stat" style={{ margin: 0 }}>
            Báo giá và thanh toán sau khi tiệm xác nhận / hoàn thành dịch vụ.
          </p>
        ) : (
          <>
            <p className="section-title" style={{ marginTop: 16 }}>
              Thanh toán
            </p>
            {cart.scheduledDeliveryWindowId ? (
              <p className="stat" style={{ marginTop: 0 }}>
                Sáng mai giao
                {cart.serviceDate ? ` · ${cart.serviceDate}` : ""}
                {cart.scheduledWindowLabel ? ` · ${cart.scheduledWindowLabel}` : ""}. Trả khi nhận hàng.
              </p>
            ) : null}
            {hasDraftBeer ? (
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={recipientAgeConfirmed}
                  onChange={(event) => setRecipientAgeConfirmed(event.target.checked)}
                />
                Người nhận đủ 18 tuổi
              </label>
            ) : (
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  checked={paymentMode === "COD"}
                  onChange={() => setPaymentMode("COD")}
                />
                COD — trả tổng đơn khi nhận{deliveryFee > 0 ? " (hàng + phí giao)" : ""}
              </label>
            )}
            {cart.scheduledDeliveryWindowId ? null : (
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="radio"
                checked={hasDraftBeer || paymentMode === "PAY_ON_PICKI"}
                onChange={() => setPaymentMode("PAY_ON_PICKI")}
              />
              Thanh toán online (demo stub)
            </label>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              <span>Tiền hàng</span>
              <span>{formatVnd(subtotal)}</span>
            </div>
            {deliveryFee > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span>Phí giao</span>
                <span>{formatVnd(deliveryFee)}</span>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                marginTop: 12,
              }}
            >
              <span>Tổng</span>
              <span>{formatVnd(total)}</span>
            </div>
            {deliveryFee > 0 ? (
              <p className="stat" style={{ margin: "8px 0 0", fontSize: 13 }}>
                Quán nhận tổng đơn; tự trả runner theo thống kê ngày.
              </p>
            ) : null}
          </>
        )}
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <HomeDeliveryConfirm status={presence.status} checked={confirmHome} onChange={setConfirmHome} />

      <button
        type="button"
        className="btn"
        disabled={submitting || presence.status === "checking" || (presence.needsHomeConfirm && !confirmHome)}
        onClick={() => void placeOrder()}
      >
        {submitting ? "Đang đặt…" : orderButtonLabel(cart.providerType)}
      </button>
    </div>
  );
}
