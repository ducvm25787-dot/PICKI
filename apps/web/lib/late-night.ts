/** Góc ăn khuya — web helpers */

export const LN_DEFAULT_START = "20:30";
export const LN_DEFAULT_END = "02:00";

export function lnParseHm(hhMm: string): number {
  const [h, m] = hhMm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function lnIsWithinWindow(nowHhMm: string, startsAt: string, endsAt: string): boolean {
  const now = lnParseHm(nowHhMm);
  const start = lnParseHm(startsAt);
  const end = lnParseHm(endsAt);
  if (end === start) return true;
  if (end > start) return now >= start && now < end;
  return now >= start || now < end;
}
