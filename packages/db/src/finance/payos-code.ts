/** 1e12 .. 2e12-1 are order payments. 2e12 .. 3e12-1 are provider billing. */
export const PAYOS_ORDER_CODE_BASE = 1_000_000_000_000;
export const PAYOS_BILLING_CODE_BASE = 2_000_000_000_000;
const PAYOS_NAMESPACE_SPAN = 1_000_000_000_000;

export type PayosPaymentSource = "ORDER" | "PROVIDER_BILLING" | "LEGACY";

export function payosOrderCodeFor(source: "ORDER" | "PROVIDER_BILLING", sequence: number): number {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= PAYOS_NAMESPACE_SPAN) {
    throw new Error("PayOS sequence is outside the namespace");
  }
  const base = source === "ORDER" ? PAYOS_ORDER_CODE_BASE : PAYOS_BILLING_CODE_BASE;
  return base + sequence;
}

export function payosSourceFromOrderCode(orderCode: number): PayosPaymentSource {
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) return "LEGACY";
  if (orderCode >= PAYOS_BILLING_CODE_BASE && orderCode < PAYOS_BILLING_CODE_BASE + PAYOS_NAMESPACE_SPAN) {
    return "PROVIDER_BILLING";
  }
  if (orderCode >= PAYOS_ORDER_CODE_BASE && orderCode < PAYOS_ORDER_CODE_BASE + PAYOS_NAMESPACE_SPAN) {
    return "ORDER";
  }
  return "LEGACY";
}
