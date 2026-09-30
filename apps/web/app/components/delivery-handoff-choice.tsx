"use client";

import { handoffModeLabel, isApartmentAddress, type SavedAddress } from "../../lib/addresses";

export type DeliveryHandoffMode = "LOBBY_PICKUP" | "DOOR_DELIVERY";

type AddressBits = Pick<SavedAddress, "addressType" | "building" | "apartment">;

export function resolveHandoffMode(
  address: AddressBits | undefined,
  chosen: DeliveryHandoffMode,
): DeliveryHandoffMode {
  if (!address || !isApartmentAddress(address)) return "DOOR_DELIVERY";
  return chosen;
}

export function DeliveryHandoffChoice({
  address,
  mode,
  onChange,
}: {
  address: AddressBits | undefined;
  mode: DeliveryHandoffMode;
  onChange: (mode: DeliveryHandoffMode) => void;
}) {
  if (!address) return null;

  if (!isApartmentAddress(address)) {
    return (
      <p className="stat" style={{ margin: "8px 0 0" }}>
        Giao tận cửa — runner đến địa chỉ nhà mặt đất.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="section-title">Nơi nhận</p>
      <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <input
          type="radio"
          name="delivery-handoff"
          checked={mode === "DOOR_DELIVERY"}
          onChange={() => onChange("DOOR_DELIVERY")}
        />
        <span>
          <strong>{handoffModeLabel("DOOR_DELIVERY")}</strong>
          <span className="stat" style={{ display: "block", fontSize: 13 }}>
            Runner lên giao đến cửa căn {address.building}-{address.apartment}
          </span>
        </span>
      </label>
      <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <input
          type="radio"
          name="delivery-handoff"
          checked={mode === "LOBBY_PICKUP"}
          onChange={() => onChange("LOBBY_PICKUP")}
        />
        <span>
          <strong>{handoffModeLabel("LOBBY_PICKUP")}</strong>
          <span className="stat" style={{ display: "block", fontSize: 13 }}>
            Xuống sảnh {address.building ?? "tòa nhà"} nhận — runner không lên căn
          </span>
        </span>
      </label>
    </div>
  );
}
