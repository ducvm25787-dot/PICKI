export const planDurations = [1, 3, 6, 12, 36] as const;
export type PlanDurationMonths = (typeof planDurations)[number];

export const subscriptionStatuses = ["TRIAL", "ACTIVE", "GRACE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export function isPlanDuration(months: number): months is PlanDurationMonths {
  return (planDurations as readonly number[]).includes(months);
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
}

/** Still-valid time is kept. An expired date is never the start of a new paid period. */
export function renewalAnchor(now: Date, expiresAt: Date): Date {
  return new Date(Math.max(now.getTime(), expiresAt.getTime()));
}

export function extendSubscriptionExpiry(input: {
  now: Date;
  expiresAt: Date;
  durationMonths: number;
}): Date {
  return addMonths(renewalAnchor(input.now, input.expiresAt), input.durationMonths);
}

export function advanceSubscriptionStatus(input: {
  status: SubscriptionStatus;
  expiresAt: Date;
  gracePeriodDays: number;
  now: Date;
}): SubscriptionStatus {
  if (input.status === "CANCELLED") return input.status;
  const expires = input.expiresAt.getTime();
  const now = input.now.getTime();
  if (input.status === "TRIAL" && now < expires) return "TRIAL";
  if (now < expires) return "ACTIVE";
  const graceMs = input.gracePeriodDays * 24 * 60 * 60 * 1000;
  if (now < expires + graceMs) return "GRACE";
  if (now < expires + graceMs * 2) return "PAST_DUE";
  return "SUSPENDED";
}

export const noticeKinds = [
  "T-14",
  "T-7",
  "T-3",
  "T-1",
  "EXPIRY_DAY",
  "GRACE_WARNING",
  "FINAL_SUSPENSION_WARNING",
] as const;

const NOTICE_OFFSET_DAYS: Record<(typeof noticeKinds)[number], number> = {
  "T-14": 14,
  "T-7": 7,
  "T-3": 3,
  "T-1": 1,
  EXPIRY_DAY: 0,
  GRACE_WARNING: -1,
  FINAL_SUSPENSION_WARNING: -7,
};

export function dueSubscriptionNotices(input: {
  expiresAt: Date;
  gracePeriodDays: number;
  now: Date;
  alreadySent: readonly string[];
}): string[] {
  const day = 24 * 60 * 60 * 1000;
  const sent = new Set(input.alreadySent);
  return noticeKinds.filter((kind) => {
    if (sent.has(kind)) return false;
    const offset = NOTICE_OFFSET_DAYS[kind];
    const trigger =
      kind === "FINAL_SUSPENSION_WARNING"
        ? input.expiresAt.getTime() + input.gracePeriodDays * day
        : input.expiresAt.getTime() - offset * day;
    return input.now.getTime() >= trigger;
  });
}
