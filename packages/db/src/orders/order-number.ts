/** 2-letter provider code from slug, e.g. com-tam-kim-van → CT */
export function providerOrderPrefix(providerSlug: string): string {
  const parts = providerSlug.split("-").filter((p) => p.length > 0);
  if (parts.length >= 2) {
    const a = parts[0]![0]?.toUpperCase();
    const b = parts[1]![0]?.toUpperCase();
    if (a && b && /[A-Z]/.test(a) && /[A-Z]/.test(b)) {
      return a + b;
    }
  }
  const letters = providerSlug.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return letters.slice(0, 2).padEnd(2, "X");
}

/** e.g. CT-250914-3847 — prefix, YYMMDD, 4 digits */
export function buildOrderNumber(providerSlug: string, date: Date, suffix4: string): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  if (!/^\d{4}$/.test(suffix4)) {
    throw new Error("Order suffix must be 4 digits");
  }
  return `${providerOrderPrefix(providerSlug)}-${yy}${mm}${dd}-${suffix4}`;
}

export function randomOrderSuffix4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
