export function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

export function formatOrderAmount(totalVnd: number, serviceVertical?: string | null): string {
  if (serviceVertical === "LAUNDRY" && totalVnd === 0) return "Thanh toán sau";
  return formatVnd(totalVnd);
}

/** Giá dịch vụ nhà — FIXED / FROM / QUOTE_REQUIRED */
export function formatHomeServicePrice(
  amountVnd: number,
  pricingKind?: string | null,
): string {
  if (pricingKind === "QUOTE_REQUIRED" || amountVnd <= 0) return "Báo giá tại nhà";
  if (pricingKind === "FROM") return `Từ ${formatVnd(amountVnd)}`;
  return formatVnd(amountVnd);
}

/** Giá làm đẹp — FIXED / FROM, không cart V1 */
export function formatBeautyPrice(amountVnd: number, pricingKind?: string | null): string {
  if (amountVnd <= 0) return "Liên hệ tiệm";
  if (pricingKind === "FROM") return `Từ ${formatVnd(amountVnd)}`;
  return formatVnd(amountVnd);
}

/** Giá tham khảo dịch vụ giặt là — hiển thị menu, không dùng checkout. */
export function formatLaundryReferencePrice(
  amountVnd: number,
  pricingKind?: string | null,
  priceUnit?: string | null,
): string | null {
  if (amountVnd <= 0) return null;
  const unit = priceUnit ?? "";
  if (pricingKind === "FROM") return `Từ ${formatVnd(amountVnd)}${unit}`;
  return `${formatVnd(amountVnd)}${unit}`;
}
