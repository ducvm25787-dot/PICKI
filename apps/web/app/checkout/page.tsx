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
import { cartTotalVnd, readCart, writeCart, type Cart } from "../../lib/cart";
import { getCurrentPositionOnce } from "../../lib/geolocation";
import { mapsDirectionsUrl } from "../../lib/maps";
import { formatVnd } from "../../lib/money";
import { isLaundryVertical, orderButtonLabel } from "../../lib/providers";

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

function addressDisplayLabel(addr: SavedAddress, index: number): string {
  if (index === 0 && addr.label === "HOME") return "Nhà";
  return `Địa chỉ ${String(index + 1)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [handoffMode, setHandoffMode] = useState<"LOBBY_PICKUP" | "DOOR_DELIVERY">("LOBBY_PICKUP");
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
  const [laundryPickupMode, setLaundryPickupMode] = useState<"HOME_PICKUP" | "SHOP_DROP_OFF">(
    "HOME_PICKUP",
  );
  const [addressMenuId, setAddressMenuId] = useState<string | null>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [pinUpdatingId, setPinUpdatingId] = useState<string | null>(null);

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
            })),
          }),
        });
        setQuote(res);
      } catch {
        setQuote(null);
      }
    })();
  }, [cart, addresses, selectedAddressId, handoffMode]);

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
          paymentMode: isLaundry ? "PAY_ON_COMPLETION" : paymentMode,
          idempotencyKey,
          items: cart.items.map((i) => ({
            offeringId: i.offeringId,
            quantity: i.quantity,
          })),
        }),
      });
      writeCart(null);
      router.replace(
        `/orders/${order.id}?new=1${paymentMode === "PAY_ON_PICKI" ? "&pay=1" : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt được");
      setSubmitting(false);
    }
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
  const effectiveHandoff = isLaundry ? "DOOR_DELIVERY" : selectedIsApartment ? handoffMode : "DOOR_DELIVERY";
  const subtotal = cartTotalVnd(cart);
  const deliveryFee = !isLaundry && quote ? quote.deliveryFeeVnd : 0;
  const total = !isLaundry && quote ? quote.totalVnd : subtotal;

  return (
    <div className="container">
      <h1 style={{ fontSize: 22, margin: "0 0 16px" }}>Xác nhận đơn</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="stat" style={{ margin: "0 0 4px" }}>
          Quán
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
          <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <input
              type="radio"
              checked={handoffMode === "DOOR_DELIVERY"}
              onChange={() => setHandoffMode("DOOR_DELIVERY")}
            />
            <span>
              <strong>{handoffModeLabel("DOOR_DELIVERY")}</strong>
              <span className="stat" style={{ display: "block", fontSize: 13 }}>
                Runner giao đến cửa {selected ? formatAddressLine(selected) : "căn hộ"}
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
        <p className="section-title">Chi tiết</p>
        {cart.items.map((item) => (
          <div
            key={item.offeringId}
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 15,
            }}
          >
            <span>
              {item.name} × {item.quantity}
              {isLaundry && item.estimatedDays ? (
                <span className="stat" style={{ display: "block", fontSize: 13 }}>
                  Dự kiến ~{String(item.estimatedDays)} ngày
                </span>
              ) : null}
            </span>
            {!isLaundry ? <span>{formatVnd(item.amountVnd * item.quantity)}</span> : null}
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
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="radio"
                checked={paymentMode === "COD"}
                onChange={() => setPaymentMode("COD")}
              />
              COD — trả tổng đơn khi nhận{deliveryFee > 0 ? " (hàng + phí giao)" : ""}
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="radio"
                checked={paymentMode === "PAY_ON_PICKI"}
                onChange={() => setPaymentMode("PAY_ON_PICKI")}
              />
              Thanh toán online (demo stub)
            </label>
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

      <button type="button" className="btn" disabled={submitting} onClick={() => void placeOrder()}>
        {submitting ? "Đang đặt…" : orderButtonLabel(cart.providerType)}
      </button>
    </div>
  );
}
