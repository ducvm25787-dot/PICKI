export type SavedAddress = {
  id: string;
  label: string;
  addressType: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  houseNumber: string | null;
  alley: string | null;
  street: string | null;
  ward: string | null;
  city: string | null;
  deliveryNote: string | null;
};

export type AddressKind = "APARTMENT" | "STREET";

export function addressKind(addr: Pick<SavedAddress, "addressType">): AddressKind {
  return addr.addressType === "STREET_ADDRESS" ? "STREET" : "APARTMENT";
}

export function isApartmentAddress(addr: Pick<SavedAddress, "addressType">): boolean {
  return addressKind(addr) === "APARTMENT";
}

export function formatAddressLine(addr: SavedAddress): string {
  if (addr.addressType === "STREET_ADDRESS" || (!addr.building && addr.street)) {
    const parts = [
      addr.houseNumber,
      addr.alley ? `ngõ ${addr.alley}` : null,
      addr.street,
      addr.ward,
    ].filter(Boolean);
    return parts.join(", ") || "—";
  }
  if (addr.building && addr.apartment) {
    const floor = addr.floor ? `, tầng ${addr.floor}` : "";
    return `${addr.building}-${addr.apartment}${floor}`;
  }
  return "—";
}

export function handoffModeLabel(mode: "LOBBY_PICKUP" | "DOOR_DELIVERY"): string {
  return mode === "DOOR_DELIVERY" ? "Giao tận căn hộ" : "Nhận tại sảnh";
}

export function addressKindLabel(kind: AddressKind): string {
  return kind === "STREET" ? "Nhà mặt đất / ngõ phố" : "Chung cư";
}
