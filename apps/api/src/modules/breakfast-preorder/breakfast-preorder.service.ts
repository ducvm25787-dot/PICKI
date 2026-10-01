import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import {
  breakfastPreorderDailyMenus,
  breakfastPreorderDeliveryWindows,
  breakfastPreorderMenuItems,
  breakfastPreorderProviderSettings,
  offeringPrices,
  offerings,
  orderItems,
  orders,
  providerLocations,
  providerMembers,
  providers,
  providerCapabilities,
  providerZoneMemberships,
  type PickiDb,
} from "@picki/db";
import { PickiError, breakfastSellPhase, isLunchSellOpen, vnClock, type FoodDaypart } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";
import {
  formatTime,
  isPastCutoff,
  vnCalendarDate,
} from "../family-dinner/family-dinner.service.js";
import type { z } from "zod";
import type {
  copyLastBreakfastMenuSchema,
  patchBreakfastItemSchema,
  patchBreakfastSettingsSchema,
  publishBreakfastMenuSchema,
} from "./dto.js";

const PAID_BREAKFAST_STATUSES = [
  "PAID",
  "PROVIDER_ACCEPTED",
  "RUNNER_ASSIGNED",
  "PREPARING",
  "READY",
  "PICKED_UP",
  "DELIVERING",
  "DELIVERED",
] as const;

const DEFAULT_DELIVERY_START = "06:00";
const DEFAULT_DELIVERY_END = "08:30";
const SLOT_MINUTES = 15;
const DEFAULT_SLOT_CAPACITY = 15;

function parseHm(hhMm: string): number {
  const [h, m] = hhMm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Chia khung giao 15 phút từ start → end (mặc định 06:00–08:30). */
export function generateBreakfastDeliverySlots(
  startHhMm = DEFAULT_DELIVERY_START,
  endHhMm = DEFAULT_DELIVERY_END,
  capacityPerSlot = DEFAULT_SLOT_CAPACITY,
): { startsAt: string; endsAt: string; capacity: number }[] {
  let start = parseHm(startHhMm);
  const end = parseHm(endHhMm);
  if (end <= start) return [];
  start = Math.ceil(start / SLOT_MINUTES) * SLOT_MINUTES;
  const slots: { startsAt: string; endsAt: string; capacity: number }[] = [];
  for (let t = start; t + SLOT_MINUTES <= end; t += SLOT_MINUTES) {
    slots.push({
      startsAt: formatHm(t),
      endsAt: formatHm(t + SLOT_MINUTES),
      capacity: capacityPerSlot,
    });
  }
  return slots;
}

const DEFAULT_WINDOWS = generateBreakfastDeliverySlots();

function subtractOneCalendarDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Cutoff / open-from are on the evening BEFORE service_date.
 * Reuses FD isPastCutoff against (serviceDate − 1 day) + HH:MM.
 */
export function isPastBreakfastCutoff(serviceDate: string, cutoffHhMm: string): boolean {
  return isPastCutoff(subtractOneCalendarDay(serviceDate), cutoffHhMm);
}

const LUNCH_DELIVERY_START = "11:00";
const LUNCH_DELIVERY_END = "13:00";

/** Lunch is same-day until 13:00 VN, then the next calendar day. */
export function defaultLunchServiceDate(now = new Date()): string {
  const clock = vnClock(now);
  if (clock.hm < "13:00") return clock.date;
  const [y, m, d] = clock.date.split("-").map(Number);
  const base = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

/** Default service date: before noon VN → today; else tomorrow. */
export function defaultBreakfastServiceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hour = Number(get("hour"));
  const base = new Date(Date.UTC(y, m - 1, d));
  if (hour >= 12) base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

function acceptingPreorderFlags(opts: {
  enabled: boolean;
  openFromTime: string;
  cutoffTime: string;
  serviceDate: string;
  menuPublished: boolean;
}) {
  const openFrom = formatTime(opts.openFromTime);
  const cutoff = formatTime(opts.cutoffTime);
  const phase = breakfastSellPhase(opts.serviceDate, openFrom, cutoff);
  const accepting = opts.enabled && opts.menuPublished && phase !== "CLOSED";
  return { acceptingPreorder: accepting, openFromTime: openFrom, cutoffTime: cutoff, phase };
}

@Injectable()
export class BreakfastPreorderService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async listForZone(zoneId: string, serviceDate: string, daypart: FoodDaypart = "BREAKFAST") {
    if (daypart === "LUNCH") return this.listLunchForZone(zoneId, serviceDate);
    const rows = await this.db
      .select({
        locationId: providerLocations.id,
        providerId: providers.id,
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
        enabled: breakfastPreorderProviderSettings.enabled,
        cutoffTime: breakfastPreorderProviderSettings.cutoffTime,
        openFromTime: breakfastPreorderProviderSettings.openFromTime,
        menuId: breakfastPreorderDailyMenus.id,
        menuStatus: breakfastPreorderDailyMenus.status,
      })
      .from(breakfastPreorderProviderSettings)
      .innerJoin(
        providerLocations,
        eq(providerLocations.id, breakfastPreorderProviderSettings.providerLocationId),
      )
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .innerJoin(
        providerZoneMemberships,
        and(
          eq(providerZoneMemberships.providerLocationId, providerLocations.id),
          eq(providerZoneMemberships.zoneId, zoneId),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      )
      .innerJoin(
        breakfastPreorderDailyMenus,
        and(
          eq(breakfastPreorderDailyMenus.providerLocationId, providerLocations.id),
          eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
          eq(breakfastPreorderDailyMenus.daypart, "BREAKFAST"),
          eq(breakfastPreorderDailyMenus.status, "PUBLISHED"),
        ),
      )
      .where(
        and(
          eq(breakfastPreorderProviderSettings.enabled, true),
          eq(providerLocations.status, "ACTIVE"),
          eq(providers.status, "ACTIVE"),
        ),
      );

    const providersOut = rows
      .map((r) => {
        const flags = acceptingPreorderFlags({
          enabled: r.enabled,
          openFromTime: formatTime(r.openFromTime),
          cutoffTime: formatTime(r.cutoffTime),
          serviceDate,
          menuPublished: r.menuStatus === "PUBLISHED",
        });
        return {
          locationId: r.locationId,
          providerId: r.providerId,
          brandName: r.brandName,
          displayName: r.displayName,
          cutoffTime: flags.cutoffTime,
          openFromTime: flags.openFromTime,
          acceptingPreorder: flags.acceptingPreorder,
        };
      })
      .filter((p) => p.acceptingPreorder);

    return { serviceDate, providers: providersOut };
  }

  private async listLunchForZone(zoneId: string, serviceDate: string) {
    if (!isLunchSellOpen(serviceDate)) {
      return { serviceDate, daypart: "LUNCH" as const, providers: [] };
    }
    const rows = await this.db
      .select({
        locationId: providerLocations.id,
        providerId: providers.id,
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
      })
      .from(breakfastPreorderDailyMenus)
      .innerJoin(
        providerLocations,
        eq(providerLocations.id, breakfastPreorderDailyMenus.providerLocationId),
      )
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .innerJoin(
        providerCapabilities,
        and(
          eq(providerCapabilities.providerId, providers.id),
          eq(providerCapabilities.capability, "LUNCH"),
          eq(providerCapabilities.enabled, true),
        ),
      )
      .innerJoin(
        providerZoneMemberships,
        and(
          eq(providerZoneMemberships.providerLocationId, providerLocations.id),
          eq(providerZoneMemberships.zoneId, zoneId),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      )
      .where(
        and(
          eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
          eq(breakfastPreorderDailyMenus.daypart, "LUNCH"),
          eq(breakfastPreorderDailyMenus.status, "PUBLISHED"),
          eq(providerLocations.status, "ACTIVE"),
          eq(providers.status, "ACTIVE"),
        ),
      );
    return {
      serviceDate,
      daypart: "LUNCH" as const,
      providers: rows.map((r) => ({
        locationId: r.locationId,
        providerId: r.providerId,
        brandName: r.brandName,
        displayName: r.displayName,
        cutoffTime: "13:00",
        openFromTime: "09:00",
        acceptingPreorder: true,
      })),
    };
  }

  async getMenu(locationId: string, serviceDate: string, daypart: FoodDaypart = "BREAKFAST") {
    const settings = await this.db
      .select()
      .from(breakfastPreorderProviderSettings)
      .where(eq(breakfastPreorderProviderSettings.providerLocationId, locationId))
      .limit(1);
    if (daypart === "BREAKFAST" && !settings[0]) {
      throw new PickiError("NOT_FOUND", "Quán chưa cấu hình Sáng mai ăn gì?");
    }

    const loc = await this.db
      .select({
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
        providerType: providers.providerType,
        addressLine: providerLocations.addressLine,
        lat: providerLocations.lat,
        lng: providerLocations.lng,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!loc[0]) throw new PickiError("NOT_FOUND", "Location not found");

    const menu = await this.db
      .select()
      .from(breakfastPreorderDailyMenus)
      .where(
        and(
          eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
          eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
          eq(breakfastPreorderDailyMenus.daypart, daypart),
          eq(breakfastPreorderDailyMenus.status, "PUBLISHED"),
        ),
      )
      .limit(1);
    if (!menu[0]) {
      throw new PickiError("NOT_FOUND", "Chưa có menu sáng cho ngày này");
    }

    const items = await this.db
      .select()
      .from(breakfastPreorderMenuItems)
      .where(eq(breakfastPreorderMenuItems.dailyMenuId, menu[0].id))
      .orderBy(asc(breakfastPreorderMenuItems.sortOrder), asc(breakfastPreorderMenuItems.name));

    const windows = await this.db
      .select()
      .from(breakfastPreorderDeliveryWindows)
      .where(
        and(
          eq(breakfastPreorderDeliveryWindows.providerLocationId, locationId),
          eq(breakfastPreorderDeliveryWindows.serviceDate, serviceDate),
          eq(breakfastPreorderDeliveryWindows.daypart, daypart),
        ),
      )
      .orderBy(asc(breakfastPreorderDeliveryWindows.startsAt));

    const lunchOpen = daypart === "LUNCH" && isLunchSellOpen(serviceDate);
    const flags =
      daypart === "LUNCH"
        ? {
            acceptingPreorder: lunchOpen,
            openFromTime: "09:00",
            cutoffTime: "13:00",
          }
        : acceptingPreorderFlags({
            enabled: settings[0]?.enabled === true,
            openFromTime: formatTime(settings[0]?.openFromTime ?? "20:00"),
            cutoffTime: formatTime(settings[0]?.cutoffTime ?? "23:30"),
            serviceDate,
            menuPublished: true,
          });

    return {
      locationId,
      brandName: loc[0].brandName,
      displayName: loc[0].displayName,
      addressLine: loc[0].addressLine,
      lat: loc[0].lat,
      lng: loc[0].lng,
      serviceDate,
      cutoffTime: flags.cutoffTime,
      openFromTime: flags.openFromTime,
      acceptingPreorder: flags.acceptingPreorder,
      receivingOpen: daypart === "LUNCH" ? lunchOpen : settings[0]?.enabled === true,
      publishedAt: menu[0].publishedAt?.toISOString() ?? null,
      menuId: menu[0].id,
      items: items.map((i) => ({
        id: i.id,
        offeringId: i.offeringId,
        name: i.name,
        description: i.description,
        priceVnd: i.priceVnd,
        capacity: i.capacity,
        remainingCapacity: i.remainingCapacity,
        status: i.status,
        available:
          i.status === "ACTIVE" &&
          (i.remainingCapacity == null || i.remainingCapacity > 0),
      })),
      windows: windows.map((w) => ({
        id: w.id,
        startsAt: formatTime(w.startsAt),
        endsAt: formatTime(w.endsAt),
        capacity: w.capacity,
        remainingCapacity: w.remainingCapacity,
        status: w.status,
        available: w.status === "OPEN" && w.remainingCapacity > 0,
      })),
    };
  }

  async publishMenu(
    userId: string,
    locationId: string,
    input: z.infer<typeof publishBreakfastMenuSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);
    const daypart: FoodDaypart = input.daypart ?? "BREAKFAST";
    const serviceDate =
      input.serviceDate ??
      (daypart === "LUNCH" ? defaultLunchServiceDate() : defaultBreakfastServiceDate());
    let windows =
      input.windows && input.windows.length > 0 ? input.windows : null;
    if (!windows) {
      const start =
        input.deliveryStartAt ?? (daypart === "LUNCH" ? LUNCH_DELIVERY_START : DEFAULT_DELIVERY_START);
      const end =
        input.deliveryEndAt ?? (daypart === "LUNCH" ? LUNCH_DELIVERY_END : DEFAULT_DELIVERY_END);
      const capacity = input.capacityPerSlot ?? DEFAULT_SLOT_CAPACITY;
      windows = generateBreakfastDeliverySlots(start, end, capacity);
      if (windows.length === 0) {
        throw new PickiError(
          "VALIDATION_ERROR",
          "Khung giao không hợp lệ — giờ kết thúc phải sau giờ bắt đầu ít nhất 15 phút",
        );
      }
    } else if (windows.length === 0) {
      windows = [...DEFAULT_WINDOWS];
    }

    const resolvedItems = await this.resolvePublishItems(locationId, input.items);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(breakfastPreorderProviderSettings)
        .values({
          providerLocationId: locationId,
          enabled: false,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: breakfastPreorderProviderSettings.providerLocationId,
          set: { updatedAt: new Date() },
        });

      const existing = await tx
        .select()
        .from(breakfastPreorderDailyMenus)
        .where(
          and(
            eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
            eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
            eq(breakfastPreorderDailyMenus.daypart, daypart),
          ),
        )
        .limit(1);

      let menuId = existing[0]?.id;
      if (menuId) {
        await tx
          .delete(breakfastPreorderMenuItems)
          .where(eq(breakfastPreorderMenuItems.dailyMenuId, menuId));
        await tx
          .delete(breakfastPreorderDeliveryWindows)
          .where(
            and(
              eq(breakfastPreorderDeliveryWindows.providerLocationId, locationId),
              eq(breakfastPreorderDeliveryWindows.serviceDate, serviceDate),
              eq(breakfastPreorderDeliveryWindows.daypart, daypart),
            ),
          );
        await tx
          .update(breakfastPreorderDailyMenus)
          .set({ status: "PUBLISHED", publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(breakfastPreorderDailyMenus.id, menuId));
      } else {
        const [created] = await tx
          .insert(breakfastPreorderDailyMenus)
          .values({
            providerLocationId: locationId,
            serviceDate,
            daypart,
            status: "PUBLISHED",
            publishedAt: new Date(),
          })
          .returning();
        if (!created) throw new PickiError("INTERNAL_ERROR", "Failed to create menu");
        menuId = created.id;
      }

      await tx.insert(breakfastPreorderMenuItems).values(
        resolvedItems.map((item, idx) => ({
          dailyMenuId: menuId!,
          offeringId: item.offeringId,
          name: item.name,
          description: item.description,
          priceVnd: item.priceVnd,
          capacity: item.capacity ?? null,
          remainingCapacity: item.capacity ?? null,
          sortOrder: item.sortOrder ?? idx,
          status: "ACTIVE" as const,
        })),
      );

      await tx.insert(breakfastPreorderDeliveryWindows).values(
        windows.map((w) => ({
          providerLocationId: locationId,
          serviceDate,
          daypart,
          startsAt: w.startsAt,
          endsAt: w.endsAt,
          capacity: w.capacity,
          remainingCapacity: w.capacity,
          status: "OPEN" as const,
        })),
      );
    });

    return {
      ok: true as const,
      serviceDate,
      status: "PUBLISHED" as const,
      itemCount: resolvedItems.length,
    };
  }

  async getOps(
    userId: string,
    locationId: string,
    serviceDate: string,
    daypart: FoodDaypart = "BREAKFAST",
  ) {
    await this.assertProviderStaff(userId, locationId);

    const settingsRows = await this.db
      .select()
      .from(breakfastPreorderProviderSettings)
      .where(eq(breakfastPreorderProviderSettings.providerLocationId, locationId))
      .limit(1);
    const settings = settingsRows[0] ?? null;

    const menu = await this.db
      .select()
      .from(breakfastPreorderDailyMenus)
      .where(
        and(
          eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
          eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
          eq(breakfastPreorderDailyMenus.daypart, daypart),
        ),
      )
      .limit(1);

    const items = menu[0]
      ? await this.db
          .select()
          .from(breakfastPreorderMenuItems)
          .where(eq(breakfastPreorderMenuItems.dailyMenuId, menu[0].id))
          .orderBy(asc(breakfastPreorderMenuItems.sortOrder), asc(breakfastPreorderMenuItems.name))
      : [];

    const windows = await this.db
      .select()
      .from(breakfastPreorderDeliveryWindows)
      .where(
        and(
          eq(breakfastPreorderDeliveryWindows.providerLocationId, locationId),
          eq(breakfastPreorderDeliveryWindows.serviceDate, serviceDate),
          eq(breakfastPreorderDeliveryWindows.daypart, daypart),
        ),
      )
      .orderBy(asc(breakfastPreorderDeliveryWindows.startsAt));

    const liveTotals = await this.aggregatePaidOrders(locationId, serviceDate, daypart);
    const flags = settings
      ? acceptingPreorderFlags({
          enabled: settings.enabled,
          openFromTime: formatTime(settings.openFromTime),
          cutoffTime: formatTime(settings.cutoffTime),
          serviceDate,
          menuPublished: menu[0]?.status === "PUBLISHED",
        })
      : null;

    return {
      serviceDate,
      settings: settings
        ? {
            enabled: settings.enabled,
            cutoffTime: formatTime(settings.cutoffTime),
            openFromTime: formatTime(settings.openFromTime),
            dailyCapacity: settings.dailyCapacity,
            receivingOpenedAt:
              settings.enabled && settings.updatedAt
                ? settings.updatedAt.toISOString()
                : null,
          }
        : null,
      acceptingPreorder: flags?.acceptingPreorder ?? false,
      menu: menu[0]
        ? {
            id: menu[0].id,
            status: menu[0].status,
            publishedAt: menu[0].publishedAt?.toISOString() ?? null,
            copiedFromServiceDate: menu[0].copiedFromServiceDate ?? null,
          }
        : null,
      items: items.map((i) => ({
        id: i.id,
        offeringId: i.offeringId,
        name: i.name,
        description: i.description,
        priceVnd: i.priceVnd,
        capacity: i.capacity,
        remainingCapacity: i.remainingCapacity,
        status: i.status,
        sortOrder: i.sortOrder,
        paidQuantity: liveTotals.byMenuItem.get(i.id) ?? 0,
      })),
      windows: windows.map((w) => ({
        id: w.id,
        startsAt: formatTime(w.startsAt),
        endsAt: formatTime(w.endsAt),
        capacity: w.capacity,
        remainingCapacity: w.remainingCapacity,
        status: w.status,
        paidOrders: liveTotals.byWindow.get(w.id) ?? 0,
      })),
      liveProduction: {
        confirmedOrders: liveTotals.orderCount,
        byMenuItem: [...liveTotals.byMenuItem.entries()].map(([menuItemId, quantity]) => ({
          menuItemId,
          quantity,
        })),
      },
    };
  }

  async patchSettings(
    userId: string,
    locationId: string,
    input: z.infer<typeof patchBreakfastSettingsSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);

    const openingReceiving =
      input.enabled === true || input.cutoffTime !== undefined || input.openFromTime !== undefined;
    if (openingReceiving && input.enabled !== false) {
      const serviceDate = defaultBreakfastServiceDate();
      const menu = await this.db
        .select({ id: breakfastPreorderDailyMenus.id })
        .from(breakfastPreorderDailyMenus)
        .where(
          and(
            eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
            eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
            eq(breakfastPreorderDailyMenus.status, "PUBLISHED"),
          ),
        )
        .limit(1);
      if (!menu[0] && input.enabled === true) {
        throw new PickiError(
          "FORBIDDEN",
          "Đăng menu sáng trước, rồi mới mở nhận đơn.",
        );
      }
    }

    await this.db
      .insert(breakfastPreorderProviderSettings)
      .values({
        providerLocationId: locationId,
        enabled: input.enabled ?? false,
        cutoffTime: input.cutoffTime ?? "23:30",
        openFromTime: input.openFromTime ?? "20:00",
        dailyCapacity: input.dailyCapacity ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: breakfastPreorderProviderSettings.providerLocationId,
        set: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.cutoffTime !== undefined
            ? { cutoffTime: input.cutoffTime, enabled: true }
            : {}),
          ...(input.openFromTime !== undefined ? { openFromTime: input.openFromTime } : {}),
          ...(input.dailyCapacity !== undefined ? { dailyCapacity: input.dailyCapacity } : {}),
          updatedAt: new Date(),
        },
      });

    const row = await this.db
      .select()
      .from(breakfastPreorderProviderSettings)
      .where(eq(breakfastPreorderProviderSettings.providerLocationId, locationId))
      .limit(1);

    return {
      enabled: row[0]!.enabled,
      cutoffTime: formatTime(row[0]!.cutoffTime),
      openFromTime: formatTime(row[0]!.openFromTime),
      dailyCapacity: row[0]!.dailyCapacity,
      receivingOpenedAt:
        row[0]!.enabled && row[0]!.updatedAt ? row[0]!.updatedAt.toISOString() : null,
    };
  }

  async patchItem(
    userId: string,
    locationId: string,
    itemId: string,
    input: z.infer<typeof patchBreakfastItemSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);

    const item = await this.db
      .select({
        item: breakfastPreorderMenuItems,
        menu: breakfastPreorderDailyMenus,
      })
      .from(breakfastPreorderMenuItems)
      .innerJoin(
        breakfastPreorderDailyMenus,
        eq(breakfastPreorderDailyMenus.id, breakfastPreorderMenuItems.dailyMenuId),
      )
      .where(eq(breakfastPreorderMenuItems.id, itemId))
      .limit(1);

    if (!item[0] || item[0].menu.providerLocationId !== locationId) {
      throw new PickiError("NOT_FOUND", "Menu item not found");
    }

    const [updated] = await this.db
      .update(breakfastPreorderMenuItems)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(breakfastPreorderMenuItems.id, itemId))
      .returning();

    return { id: updated!.id, status: updated!.status };
  }

  async copyLastMenuForProvider(
    userId: string,
    locationId: string,
    input: z.infer<typeof copyLastBreakfastMenuSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);
    const daypart: FoodDaypart = input.daypart ?? "BREAKFAST";
    const serviceDate =
      input.serviceDate ??
      (daypart === "LUNCH" ? defaultLunchServiceDate() : defaultBreakfastServiceDate());

    const last = await this.db
      .select()
      .from(breakfastPreorderDailyMenus)
      .where(
        and(
          eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
          eq(breakfastPreorderDailyMenus.status, "PUBLISHED"),
          eq(breakfastPreorderDailyMenus.daypart, daypart),
          lt(breakfastPreorderDailyMenus.serviceDate, serviceDate),
        ),
      )
      .orderBy(desc(breakfastPreorderDailyMenus.serviceDate))
      .limit(1);
    if (!last[0]) {
      throw new PickiError("NOT_FOUND", "Chưa có menu ngày trước để chép");
    }

    const items = await this.db
      .select()
      .from(breakfastPreorderMenuItems)
      .where(eq(breakfastPreorderMenuItems.dailyMenuId, last[0].id))
      .orderBy(asc(breakfastPreorderMenuItems.sortOrder), asc(breakfastPreorderMenuItems.name));

    const windows = await this.db
      .select()
      .from(breakfastPreorderDeliveryWindows)
      .where(
        and(
          eq(breakfastPreorderDeliveryWindows.providerLocationId, locationId),
          eq(breakfastPreorderDeliveryWindows.serviceDate, last[0].serviceDate),
          eq(breakfastPreorderDeliveryWindows.daypart, daypart),
        ),
      )
      .orderBy(asc(breakfastPreorderDeliveryWindows.startsAt));

    const payload = {
      sourceServiceDate: last[0].serviceDate,
      serviceDate,
      items: items.map((i) => ({
        offeringId: i.offeringId,
        name: i.name,
        description: i.description,
        priceVnd: i.priceVnd,
        capacity: i.capacity,
        sortOrder: i.sortOrder,
      })),
      windows: windows.map((w) => ({
        startsAt: formatTime(w.startsAt),
        endsAt: formatTime(w.endsAt),
        capacity: w.capacity,
      })),
    };

    if (!input.publish) {
      return { ...payload, published: false as const };
    }

    const today = await this.db
      .select({ id: breakfastPreorderDailyMenus.id, status: breakfastPreorderDailyMenus.status })
      .from(breakfastPreorderDailyMenus)
      .where(
        and(
          eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
          eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
          eq(breakfastPreorderDailyMenus.daypart, daypart),
        ),
      )
      .limit(1);
    if (today[0]?.status === "PUBLISHED") {
      throw new PickiError("CONFLICT", "Ngày phục vụ đã có menu — đăng lại hoặc sửa");
    }

    await this.publishMenu(userId, locationId, {
      serviceDate,
      daypart,
      items: payload.items.map((i) => ({
        offeringId: i.offeringId ?? undefined,
        name: i.name,
        description: i.description ?? undefined,
        priceVnd: i.priceVnd,
        capacity: i.capacity ?? undefined,
        sortOrder: i.sortOrder,
      })),
      windows: payload.windows,
    });

    await this.db
      .update(breakfastPreorderDailyMenus)
      .set({ copiedFromServiceDate: last[0].serviceDate, updatedAt: new Date() })
      .where(
        and(
          eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
          eq(breakfastPreorderDailyMenus.serviceDate, serviceDate),
          eq(breakfastPreorderDailyMenus.daypart, daypart),
        ),
      );

    return { ...payload, published: true as const };
  }

  private async resolvePublishItems(
    locationId: string,
    items: z.infer<typeof publishBreakfastMenuSchema>["items"],
  ) {
    const loc = await this.db
      .select({ providerId: providerLocations.providerId })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!loc[0]) throw new PickiError("NOT_FOUND", "Location not found");

    const resolved: {
      offeringId: string | null;
      name: string;
      description: string | null;
      priceVnd: number;
      capacity?: number;
      sortOrder?: number;
    }[] = [];

    for (const item of items) {
      if (item.offeringId) {
        const row = await this.db
          .select({
            id: offerings.id,
            name: offerings.name,
            description: offerings.description,
            amountVnd: offeringPrices.amountVnd,
            providerId: offerings.providerId,
          })
          .from(offerings)
          .leftJoin(
            offeringPrices,
            and(
              eq(offeringPrices.offeringId, offerings.id),
              eq(offeringPrices.providerLocationId, locationId),
            ),
          )
          .where(eq(offerings.id, item.offeringId))
          .limit(1);
        const off = row[0];
        if (!off || off.providerId !== loc[0].providerId) {
          throw new PickiError("VALIDATION_ERROR", "offeringId không thuộc quán này", {
            details: { offeringId: item.offeringId },
          });
        }
        const price = item.priceVnd ?? off.amountVnd ?? 0;
        resolved.push({
          offeringId: off.id,
          name: item.name?.trim() || off.name,
          description: item.description ?? off.description,
          priceVnd: price,
          capacity: item.capacity,
          sortOrder: item.sortOrder,
        });
      } else {
        resolved.push({
          offeringId: null,
          name: item.name!.trim(),
          description: item.description ?? null,
          priceVnd: item.priceVnd!,
          capacity: item.capacity,
          sortOrder: item.sortOrder,
        });
      }
    }
    return resolved;
  }

  private async aggregatePaidOrders(
    locationId: string,
    serviceDate: string,
    daypart: FoodDaypart = "BREAKFAST",
  ) {
    const paidOrders = await this.db
      .select({
        id: orders.id,
        breakfastDeliveryWindowId: orders.breakfastDeliveryWindowId,
      })
      .from(orders)
      .where(
        and(
          eq(orders.providerLocationId, locationId),
          eq(orders.serviceDate, serviceDate),
          eq(orders.orderKind, daypart === "LUNCH" ? "LUNCH" : "BREAKFAST_PREORDER"),
          inArray(orders.status, [...PAID_BREAKFAST_STATUSES]),
        ),
      );

    const byMenuItem = new Map<string, number>();
    const byWindow = new Map<string, number>();
    const orderIds = paidOrders.map((o) => o.id);

    for (const o of paidOrders) {
      if (o.breakfastDeliveryWindowId) {
        byWindow.set(
          o.breakfastDeliveryWindowId,
          (byWindow.get(o.breakfastDeliveryWindowId) ?? 0) + 1,
        );
      }
    }

    if (orderIds.length > 0) {
      const lines = await this.db
        .select({
          menuItemId: orderItems.breakfastMenuItemId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds));

      for (const line of lines) {
        if (!line.menuItemId) continue;
        byMenuItem.set(
          line.menuItemId,
          (byMenuItem.get(line.menuItemId) ?? 0) + line.quantity,
        );
      }
    }

    return { orderCount: paidOrders.length, byMenuItem, byWindow };
  }

  private async assertProviderStaff(userId: string, locationId: string): Promise<string> {
    const loc = await this.db
      .select({ providerId: providerLocations.providerId })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!loc[0]) throw new PickiError("NOT_FOUND", "Location not found");

    const members = await this.db
      .select()
      .from(providerMembers)
      .where(
        and(
          eq(providerMembers.userId, userId),
          eq(providerMembers.providerId, loc[0].providerId),
        ),
      );
    const allowed = members.some(
      (m) => !m.providerLocationId || m.providerLocationId === locationId,
    );
    if (!allowed) {
      throw new PickiError("FORBIDDEN", "Chỉ nhân viên quán mới thao tác");
    }
    return loc[0].providerId;
  }
}

export { formatTime, vnCalendarDate };
