import { and, eq } from "drizzle-orm";
import { MARKET_MORNING_PURPOSE, morningPrepareOpen } from "@picki/shared";
import type { PickiDb } from "../client.js";
import { scheduledDeliveryWindows, scheduledFulfillmentSettings } from "../schema/scheduled-fulfillment.js";

function clock(value: string | unknown): string {
  return typeof value === "string" ? value.slice(0, 5) : "00:00";
}

export async function ensureScheduledWindows(
  db: PickiDb,
  input: {
    providerLocationId: string;
    serviceDate: string;
    purpose: string;
    slots: { startsAt: string; endsAt: string }[];
  },
) {
  if (input.slots.length === 0) return;
  await db
    .insert(scheduledDeliveryWindows)
    .values(
      input.slots.map((slot) => ({
        providerLocationId: input.providerLocationId,
        serviceDate: input.serviceDate,
        startsAt: slot.startsAt.length === 5 ? `${slot.startsAt}:00` : slot.startsAt,
        endsAt: slot.endsAt.length === 5 ? `${slot.endsAt}:00` : slot.endsAt,
        purpose: input.purpose,
        status: "OPEN" as const,
      })),
    )
    .onConflictDoNothing({
      target: [
        scheduledDeliveryWindows.providerLocationId,
        scheduledDeliveryWindows.serviceDate,
        scheduledDeliveryWindows.purpose,
        scheduledDeliveryWindows.startsAt,
        scheduledDeliveryWindows.endsAt,
      ],
    });
}

export type ScheduledPrepareState =
  | { scheduled: false }
  | {
      scheduled: true;
      open: boolean;
      message: string;
      serviceDate: string;
      label: string;
      prepareLeadMinutes: number;
    };

export async function scheduledPrepareState(
  db: PickiDb,
  order: { scheduledDeliveryWindowId?: string | null },
  now = new Date(),
): Promise<ScheduledPrepareState> {
  if (!order.scheduledDeliveryWindowId) return { scheduled: false };
  const [window] = await db
    .select()
    .from(scheduledDeliveryWindows)
    .where(eq(scheduledDeliveryWindows.id, order.scheduledDeliveryWindowId))
    .limit(1);
  if (!window) {
    return {
      scheduled: true,
      open: false,
      message: "Không thấy khung giờ giao",
      serviceDate: "",
      label: "",
      prepareLeadMinutes: 0,
    };
  }
  const [settings] = await db
    .select()
    .from(scheduledFulfillmentSettings)
    .where(
      and(
        eq(scheduledFulfillmentSettings.providerLocationId, window.providerLocationId),
        eq(scheduledFulfillmentSettings.purpose, window.purpose),
      ),
    )
    .limit(1);
  const startsAt = clock(window.startsAt);
  const endsAt = clock(window.endsAt);
  const label = `${startsAt}–${endsAt}`;
  const lead = settings?.prepareLeadMinutes;
  if (lead == null || window.purpose !== MARKET_MORNING_PURPOSE) {
    return {
      scheduled: true,
      open: false,
      message: "Chưa cấu hình giờ chuẩn bị",
      serviceDate: window.serviceDate,
      label,
      prepareLeadMinutes: 0,
    };
  }
  const open = morningPrepareOpen({
    now,
    serviceDate: window.serviceDate,
    startsAt,
    prepareLeadMinutes: lead,
  });
  return {
    scheduled: true,
    open,
    message: open
      ? ""
      : `Chưa tới giờ chuẩn bị. Có thể sẵn sàng từ ${String(lead)} phút trước khung ${label}.`,
    serviceDate: window.serviceDate,
    label,
    prepareLeadMinutes: lead,
  };
}
