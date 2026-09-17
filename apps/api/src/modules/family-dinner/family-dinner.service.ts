import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  FAMILY_DINNER_CATEGORY_LIMITS,
  familyDinnerDailyMenus,
  familyDinnerDeliveryWindows,
  familyDinnerInventorySnapshots,
  familyDinnerMenuItems,
  familyDinnerProductionBatches,
  familyDinnerProductionItemTotals,
  familyDinnerProviderSettings,
  grossFromNet,
  ingredientMaster,
  lateDinnerOfferItems,
  lateDinnerOffers,
  lateOfferMaxCapacity,
  orderItems,
  orders,
  providerLocations,
  providerMembers,
  providerRecipes,
  providerRecipeVersions,
  providers,
  providerZoneMemberships,
  recipeIngredients,
  toBuyQuantity,
  isFamilyDinnerSelfCookCategory,
  type FamilyDinnerCategory,
  type PickiDb,
  validateFamilyDinnerBaseMeal,
  validateFamilyDinnerDailyMenu,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";
import type { z } from "zod";
import type {
  createFamilyDinnerRecipeSchema,
  createLateDinnerOfferSchema,
  createRecipeVersionSchema,
  patchFamilyDinnerItemSchema,
  patchFamilyDinnerSettingsSchema,
  publishFamilyDinnerMenuSchema,
  upsertInventorySchema,
} from "./dto.js";

const PAID_FAMILY_DINNER_STATUSES = [
  "PAID",
  "PROVIDER_ACCEPTED",
  "RUNNER_ASSIGNED",
  "PREPARING",
  "READY",
  "PICKED_UP",
  "DELIVERING",
  "DELIVERED",
] as const;

type OrderTx = Parameters<Parameters<PickiDb["transaction"]>[0]>[0];

@Injectable()
export class FamilyDinnerService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async listForZone(zoneId: string, serviceDate: string) {
    await this.ensureTodayMenusForZone(zoneId, serviceDate);

    const rows = await this.db
      .select({
        locationId: providerLocations.id,
        providerId: providers.id,
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
        cutoffTime: familyDinnerProviderSettings.cutoffTime,
        menuId: familyDinnerDailyMenus.id,
        menuStatus: familyDinnerDailyMenus.status,
      })
      .from(familyDinnerProviderSettings)
      .innerJoin(
        providerLocations,
        eq(providerLocations.id, familyDinnerProviderSettings.providerLocationId),
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
        familyDinnerDailyMenus,
        and(
          eq(familyDinnerDailyMenus.providerLocationId, providerLocations.id),
          eq(familyDinnerDailyMenus.serviceDate, serviceDate),
          eq(familyDinnerDailyMenus.status, "PUBLISHED"),
        ),
      )
      .where(
        and(
          eq(familyDinnerProviderSettings.enabled, true),
          eq(providerLocations.status, "ACTIVE"),
          eq(providers.status, "ACTIVE"),
        ),
      );

    return {
      serviceDate,
      providers: rows.map((r) => ({
        locationId: r.locationId,
        providerId: r.providerId,
        brandName: r.brandName,
        displayName: r.displayName,
        cutoffTime: formatTime(r.cutoffTime),
        acceptingPreorder: !isPastCutoff(serviceDate, formatTime(r.cutoffTime)),
      })),
    };
  }

  async getMenu(locationId: string, serviceDate: string) {
    await this.copyLastPublishedMenuIfMissing(locationId, serviceDate);

    const settings = await this.db
      .select()
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
      .limit(1);
    if (!settings[0]) {
      throw new PickiError("NOT_FOUND", "Bếp chưa cấu hình Bữa tối ấm cúng");
    }

    const loc = await this.db
      .select({
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
        providerType: providers.providerType,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!loc[0]) throw new PickiError("NOT_FOUND", "Location not found");

    const menu = await this.db
      .select()
      .from(familyDinnerDailyMenus)
      .where(
        and(
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
          eq(familyDinnerDailyMenus.serviceDate, serviceDate),
          eq(familyDinnerDailyMenus.status, "PUBLISHED"),
        ),
      )
      .limit(1);
    if (!menu[0]) {
      throw new PickiError("NOT_FOUND", "Chưa có menu tối cho ngày này");
    }

    const items = await this.db
      .select()
      .from(familyDinnerMenuItems)
      .where(eq(familyDinnerMenuItems.dailyMenuId, menu[0].id))
      .orderBy(asc(familyDinnerMenuItems.sortOrder), asc(familyDinnerMenuItems.name));

    const windows = await this.db
      .select()
      .from(familyDinnerDeliveryWindows)
      .where(
        and(
          eq(familyDinnerDeliveryWindows.providerLocationId, locationId),
          eq(familyDinnerDeliveryWindows.serviceDate, serviceDate),
        ),
      )
      .orderBy(asc(familyDinnerDeliveryWindows.startsAt));

    const cutoff = formatTime(settings[0].cutoffTime);
    const receivingOpen = settings[0].enabled === true;
    return {
      locationId,
      brandName: loc[0].brandName,
      displayName: loc[0].displayName,
      serviceDate,
      cutoffTime: cutoff,
      // Chỉ nhận đơn sau khi bếp bấm mở giờ cutoff (enabled).
      acceptingPreorder: receivingOpen && !isPastCutoff(serviceDate, cutoff),
      receivingOpen,
      publishedAt: menu[0].publishedAt?.toISOString() ?? null,
      receivingOpenedAt: receivingOpen ? settings[0].updatedAt?.toISOString() ?? null : null,
      menuId: menu[0].id,
      items: items.map((i) => ({
        id: i.id,
        category: i.category,
        name: i.name,
        description: i.description,
        priceVnd: i.priceVnd,
        capacity: i.capacity,
        remainingCapacity: i.remainingCapacity,
        recipeVersionId: i.recipeVersionId,
        status: i.status,
        allowsSelfCook:
          i.allowsSelfCook && isFamilyDinnerSelfCookCategory(i.category),
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
    input: z.infer<typeof publishFamilyDinnerMenuSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);
    this.assertCategoryQuotas(input.items);

    const serviceDate = input.serviceDate ?? defaultDinnerServiceDate();
    const windows =
      input.windows && input.windows.length > 0
        ? input.windows
        : [
            { startsAt: "17:30", endsAt: "18:00", capacity: 12 },
            { startsAt: "18:00", endsAt: "18:30", capacity: 15 },
            { startsAt: "18:30", endsAt: "19:00", capacity: 15 },
            { startsAt: "19:00", endsAt: "19:30", capacity: 10 },
          ];

    const baseCheck = validateFamilyDinnerDailyMenu(
      input.items.map((i) => ({ category: i.category, quantity: 1 })),
    );
    if (!baseCheck.ok) {
      throw new PickiError(
        "VALIDATION_ERROR",
        `Menu phải có đủ nhóm: ${baseCheck.missing.join(", ")}`,
      );
    }

    const locked = await this.db
      .select({ status: familyDinnerProductionBatches.status })
      .from(familyDinnerProductionBatches)
      .where(
        and(
          eq(familyDinnerProductionBatches.providerLocationId, locationId),
          eq(familyDinnerProductionBatches.serviceDate, serviceDate),
          eq(familyDinnerProductionBatches.status, "LOCKED"),
        ),
      )
      .limit(1);
    if (locked[0]) {
      throw new PickiError(
        "FORBIDDEN",
        "Đã chốt kế hoạch nấu — bấm «Mở lại chốt nấu» ở mục Sản xuất nếu cần sửa menu.",
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .insert(familyDinnerProviderSettings)
        .values({
          providerLocationId: locationId,
          enabled: false,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: familyDinnerProviderSettings.providerLocationId,
          // Đăng menu ≠ mở nhận đơn — chỉ bật khi bếp set giờ cutoff.
          set: { updatedAt: new Date() },
        });

      const existing = await tx
        .select()
        .from(familyDinnerDailyMenus)
        .where(
          and(
            eq(familyDinnerDailyMenus.providerLocationId, locationId),
            eq(familyDinnerDailyMenus.serviceDate, serviceDate),
          ),
        )
        .limit(1);

      let menuId = existing[0]?.id;
      if (menuId) {
        await tx.delete(familyDinnerMenuItems).where(eq(familyDinnerMenuItems.dailyMenuId, menuId));
        await tx
          .delete(familyDinnerDeliveryWindows)
          .where(
            and(
              eq(familyDinnerDeliveryWindows.providerLocationId, locationId),
              eq(familyDinnerDeliveryWindows.serviceDate, serviceDate),
            ),
          );
        await tx
          .update(familyDinnerDailyMenus)
          .set({ status: "PUBLISHED", publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(familyDinnerDailyMenus.id, menuId));
      } else {
        const [created] = await tx
          .insert(familyDinnerDailyMenus)
          .values({
            providerLocationId: locationId,
            serviceDate,
            status: "PUBLISHED",
            publishedAt: new Date(),
          })
          .returning();
        if (!created) throw new PickiError("INTERNAL_ERROR", "Failed to create menu");
        menuId = created.id;
      }

      await tx.insert(familyDinnerMenuItems).values(
        input.items.map((item, idx) => ({
          dailyMenuId: menuId!,
          category: item.category,
          name: item.name,
          description: item.description ?? null,
          priceVnd: item.priceVnd,
          capacity: item.capacity ?? null,
          remainingCapacity: item.capacity ?? null,
          recipeVersionId: item.recipeVersionId ?? null,
          sortOrder: item.sortOrder ?? idx,
          status: "ACTIVE" as const,
          allowsSelfCook:
            Boolean(item.allowsSelfCook) && isFamilyDinnerSelfCookCategory(item.category),
        })),
      );

      await tx.insert(familyDinnerDeliveryWindows).values(
        windows.map((w) => ({
          providerLocationId: locationId,
          serviceDate,
          startsAt: w.startsAt,
          endsAt: w.endsAt,
          capacity: w.capacity,
          remainingCapacity: w.capacity,
          status: "OPEN" as const,
        })),
      );
    });

    // Không gọi getMenu trong/sau tx cho response — client tự refresh ops.
    // Tránh lỗi phụ (settings/enabled) làm FE tưởng đăng menu thất bại.
    return {
      ok: true as const,
      serviceDate,
      status: "PUBLISHED" as const,
      itemCount: input.items.length,
    };
  }

  // ─── Phase B: provider ops ───────────────────────────────────────────────

  async getOps(userId: string, locationId: string, serviceDate: string) {
    await this.assertProviderStaff(userId, locationId);
    await this.copyLastPublishedMenuIfMissing(locationId, serviceDate);

    const settingsRows = await this.db
      .select()
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
      .limit(1);
    const settings = settingsRows[0] ?? null;

    const menu = await this.db
      .select()
      .from(familyDinnerDailyMenus)
      .where(
        and(
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
          eq(familyDinnerDailyMenus.serviceDate, serviceDate),
        ),
      )
      .limit(1);

    const items = menu[0]
      ? await this.db
          .select()
          .from(familyDinnerMenuItems)
          .where(eq(familyDinnerMenuItems.dailyMenuId, menu[0].id))
          .orderBy(asc(familyDinnerMenuItems.sortOrder), asc(familyDinnerMenuItems.name))
      : [];

    const windows = await this.db
      .select()
      .from(familyDinnerDeliveryWindows)
      .where(
        and(
          eq(familyDinnerDeliveryWindows.providerLocationId, locationId),
          eq(familyDinnerDeliveryWindows.serviceDate, serviceDate),
        ),
      )
      .orderBy(asc(familyDinnerDeliveryWindows.startsAt));

    const batch = await this.db
      .select()
      .from(familyDinnerProductionBatches)
      .where(
        and(
          eq(familyDinnerProductionBatches.providerLocationId, locationId),
          eq(familyDinnerProductionBatches.serviceDate, serviceDate),
        ),
      )
      .limit(1);

    const liveTotals = await this.aggregatePaidProduction(locationId, serviceDate);

    let batchTotals: (typeof familyDinnerProductionItemTotals.$inferSelect)[] = [];
    if (batch[0]) {
      batchTotals = await this.db
        .select()
        .from(familyDinnerProductionItemTotals)
        .where(eq(familyDinnerProductionItemTotals.productionBatchId, batch[0].id));
    }

    return {
      serviceDate,
      settings: settings
        ? {
            enabled: settings.enabled,
            cutoffTime: formatTime(settings.cutoffTime),
            dailyCapacity: settings.dailyCapacity,
            procurementBufferPercent: settings.procurementBufferPercent,
            receivingOpenedAt:
              settings.enabled && settings.updatedAt
                ? settings.updatedAt.toISOString()
                : null,
          }
        : null,
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
        category: i.category,
        name: i.name,
        priceVnd: i.priceVnd,
        capacity: i.capacity,
        remainingCapacity: i.remainingCapacity,
        recipeVersionId: i.recipeVersionId,
        status: i.status,
        sortOrder: i.sortOrder,
        allowsSelfCook:
          i.allowsSelfCook && isFamilyDinnerSelfCookCategory(i.category),
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
          selfCookQuantity: liveTotals.byMenuItemSelfCook.get(menuItemId) ?? 0,
        })),
      },
      batch: batch[0]
        ? {
            id: batch[0].id,
            status: batch[0].status,
            confirmedOrders: batch[0].confirmedOrders,
            lockedAt: batch[0].lockedAt?.toISOString() ?? null,
            itemTotals: batchTotals.map((t) => ({
              menuItemId: t.menuItemId,
              recipeVersionId: t.recipeVersionId,
              confirmedQuantity: t.confirmedQuantity,
              lateQuantity: t.lateQuantity,
              preparedQuantity: t.preparedQuantity,
              remainingQuantity: t.remainingQuantity,
            })),
          }
        : null,
    };
  }

  async patchSettings(
    userId: string,
    locationId: string,
    input: z.infer<typeof patchFamilyDinnerSettingsSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);

    const openingReceiving = input.enabled === true || input.cutoffTime !== undefined;
    if (openingReceiving) {
      const today = defaultDinnerServiceDate();
      const menu = await this.db
        .select({ id: familyDinnerDailyMenus.id, status: familyDinnerDailyMenus.status })
        .from(familyDinnerDailyMenus)
        .where(
          and(
            eq(familyDinnerDailyMenus.providerLocationId, locationId),
            eq(familyDinnerDailyMenus.serviceDate, today),
            eq(familyDinnerDailyMenus.status, "PUBLISHED"),
          ),
        )
        .limit(1);
      if (!menu[0]) {
        throw new PickiError(
          "FORBIDDEN",
          "Đăng menu hôm nay trước, rồi mới mở giờ nhận đơn.",
        );
      }
    }

    await this.db
      .insert(familyDinnerProviderSettings)
      .values({
        providerLocationId: locationId,
        enabled: input.enabled ?? false,
        cutoffTime: input.cutoffTime ?? "16:00",
        dailyCapacity: input.dailyCapacity ?? null,
        procurementBufferPercent: input.procurementBufferPercent ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: familyDinnerProviderSettings.providerLocationId,
        set: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.cutoffTime !== undefined
            ? { cutoffTime: input.cutoffTime, enabled: true }
            : {}),
          ...(input.dailyCapacity !== undefined ? { dailyCapacity: input.dailyCapacity } : {}),
          ...(input.procurementBufferPercent !== undefined
            ? { procurementBufferPercent: input.procurementBufferPercent }
            : {}),
          updatedAt: new Date(),
        },
      });

    const row = await this.db
      .select()
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
      .limit(1);

    return {
      enabled: row[0]!.enabled,
      cutoffTime: formatTime(row[0]!.cutoffTime),
      dailyCapacity: row[0]!.dailyCapacity,
      procurementBufferPercent: row[0]!.procurementBufferPercent,
      receivingOpenedAt:
        row[0]!.enabled && row[0]!.updatedAt ? row[0]!.updatedAt.toISOString() : null,
    };
  }

  async patchItem(
    userId: string,
    locationId: string,
    itemId: string,
    input: z.infer<typeof patchFamilyDinnerItemSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);

    const item = await this.db
      .select({
        item: familyDinnerMenuItems,
        menu: familyDinnerDailyMenus,
      })
      .from(familyDinnerMenuItems)
      .innerJoin(
        familyDinnerDailyMenus,
        eq(familyDinnerDailyMenus.id, familyDinnerMenuItems.dailyMenuId),
      )
      .where(eq(familyDinnerMenuItems.id, itemId))
      .limit(1);

    if (!item[0] || item[0].menu.providerLocationId !== locationId) {
      throw new PickiError("NOT_FOUND", "Menu item not found");
    }

    if (input.recipeVersionId) {
      await this.assertRecipeVersionOwned(locationId, input.recipeVersionId);
    }

    const [updated] = await this.db
      .update(familyDinnerMenuItems)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.recipeVersionId !== undefined
          ? { recipeVersionId: input.recipeVersionId }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(familyDinnerMenuItems.id, itemId))
      .returning();

    return {
      id: updated!.id,
      status: updated!.status,
      recipeVersionId: updated!.recipeVersionId,
    };
  }

  async lockProduction(userId: string, locationId: string, serviceDate: string) {
    await this.assertProviderStaff(userId, locationId);
    const settings = await this.db
      .select({ cutoffTime: familyDinnerProviderSettings.cutoffTime })
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
      .limit(1);
    const cutoff = formatTime(settings[0]?.cutoffTime ?? "16:00");
    if (!isPastCutoff(serviceDate, cutoff)) {
      throw new PickiError(
        "FORBIDDEN",
        `Chỉ chốt kế hoạch nấu sau giờ nhận đơn (${cutoff}).`,
      );
    }
    return this.lockProductionInternal(locationId, serviceDate);
  }

  /** Provider mở lại batch để sửa/đăng menu (pilot). Không xóa đơn PAID. */
  async unlockProduction(userId: string, locationId: string, serviceDate?: string) {
    await this.assertProviderStaff(userId, locationId);
    const date = serviceDate ?? defaultDinnerServiceDate();
    const batch = await this.db
      .select()
      .from(familyDinnerProductionBatches)
      .where(
        and(
          eq(familyDinnerProductionBatches.providerLocationId, locationId),
          eq(familyDinnerProductionBatches.serviceDate, date),
        ),
      )
      .limit(1);
    if (!batch[0]) {
      return { serviceDate: date, status: "PLANNING" as const, unlocked: false };
    }
    await this.db
      .update(familyDinnerProductionBatches)
      .set({
        status: "PLANNING",
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(familyDinnerProductionBatches.id, batch[0].id));

    await this.db
      .update(orders)
      .set({ productionLockedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(orders.providerLocationId, locationId),
          eq(orders.serviceDate, date),
          eq(orders.orderKind, "FAMILY_DINNER"),
        ),
      );

    // Chốt nấu từng đóng menu → mở lại để bếp đăng/sửa được.
    await this.db
      .update(familyDinnerDailyMenus)
      .set({ status: "PUBLISHED", updatedAt: new Date() })
      .where(
        and(
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
          eq(familyDinnerDailyMenus.serviceDate, date),
          eq(familyDinnerDailyMenus.status, "CLOSED"),
        ),
      );

    return { serviceDate: date, status: "PLANNING" as const, unlocked: true };
  }

  /** Worker entry: lock all enabled kitchens past cutoff for today without a LOCKED batch. */
  async lockProductionDue(): Promise<number> {
    const today = vnCalendarDate();
    const settings = await this.db
      .select()
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.enabled, true));

    let locked = 0;
    for (const s of settings) {
      const cutoff = formatTime(s.cutoffTime);
      if (!isPastCutoff(today, cutoff)) continue;

      const existing = await this.db
        .select({ status: familyDinnerProductionBatches.status })
        .from(familyDinnerProductionBatches)
        .where(
          and(
            eq(familyDinnerProductionBatches.providerLocationId, s.providerLocationId),
            eq(familyDinnerProductionBatches.serviceDate, today),
          ),
        )
        .limit(1);

      // Đã có batch hôm nay (kể cả sau khi bếp «Mở lại chốt nấu») → không auto-chốt lại.
      if (existing[0]) continue;

      try {
        await this.lockProductionInternal(s.providerLocationId, today);
        locked += 1;
      } catch {
        // Skip locations without menu / nothing to lock
      }
    }
    return locked;
  }

  private async lockProductionInternal(locationId: string, serviceDate: string) {
    return this.db.transaction(async (tx) => {
      const live = await this.aggregatePaidProduction(locationId, serviceDate, tx);

      const existing = await tx
        .select()
        .from(familyDinnerProductionBatches)
        .where(
          and(
            eq(familyDinnerProductionBatches.providerLocationId, locationId),
            eq(familyDinnerProductionBatches.serviceDate, serviceDate),
          ),
        )
        .limit(1);

      const now = new Date();
      let batchId = existing[0]?.id;

      if (batchId) {
        await tx
          .update(familyDinnerProductionBatches)
          .set({
            status: "LOCKED",
            confirmedOrders: live.orderCount,
            lockedAt: now,
            updatedAt: now,
          })
          .where(eq(familyDinnerProductionBatches.id, batchId));
        await tx
          .delete(familyDinnerProductionItemTotals)
          .where(eq(familyDinnerProductionItemTotals.productionBatchId, batchId));
      } else {
        const [created] = await tx
          .insert(familyDinnerProductionBatches)
          .values({
            providerLocationId: locationId,
            serviceDate,
            status: "LOCKED",
            confirmedOrders: live.orderCount,
            lockedAt: now,
            cutoffAt: now,
          })
          .returning();
        if (!created) throw new PickiError("INTERNAL_ERROR", "Failed to create production batch");
        batchId = created.id;
      }

      const menuItemIds = [...live.byMenuItem.keys()];
      const recipeByItem = new Map<string, string | null>();
      if (menuItemIds.length > 0) {
        const rows = await tx
          .select({
            id: familyDinnerMenuItems.id,
            recipeVersionId: familyDinnerMenuItems.recipeVersionId,
          })
          .from(familyDinnerMenuItems)
          .where(inArray(familyDinnerMenuItems.id, menuItemIds));
        for (const r of rows) recipeByItem.set(r.id, r.recipeVersionId);
      }

      if (live.byMenuItem.size > 0) {
        await tx.insert(familyDinnerProductionItemTotals).values(
          [...live.byMenuItem.entries()].map(([menuItemId, qty]) => {
            const selfCook = live.byMenuItemSelfCook.get(menuItemId) ?? 0;
            // Suất tự nấu không nằm trong kho mâm tối muộn (chỉ phần bếp nấu sẵn).
            const remaining = Math.max(0, qty - selfCook);
            return {
              productionBatchId: batchId!,
              menuItemId,
              recipeVersionId: recipeByItem.get(menuItemId) ?? null,
              confirmedQuantity: qty,
              lateQuantity: 0,
              preparedQuantity: 0,
              remainingQuantity: remaining,
            };
          }),
        );
      }

      if (live.orderIds.length > 0) {
        await tx
          .update(orders)
          .set({ productionLockedAt: now, updatedAt: now })
          .where(inArray(orders.id, live.orderIds));
      }

      await tx
        .update(familyDinnerDailyMenus)
        .set({ status: "CLOSED", updatedAt: now })
        .where(
          and(
            eq(familyDinnerDailyMenus.providerLocationId, locationId),
            eq(familyDinnerDailyMenus.serviceDate, serviceDate),
          ),
        );

      await tx
        .update(familyDinnerDeliveryWindows)
        .set({ status: "CLOSED", updatedAt: now })
        .where(
          and(
            eq(familyDinnerDeliveryWindows.providerLocationId, locationId),
            eq(familyDinnerDeliveryWindows.serviceDate, serviceDate),
            eq(familyDinnerDeliveryWindows.status, "OPEN"),
          ),
        );

      return {
        batchId,
        serviceDate,
        status: "LOCKED" as const,
        confirmedOrders: live.orderCount,
        lockedAt: now.toISOString(),
        itemTotals: [...live.byMenuItem.entries()].map(([menuItemId, quantity]) => {
          const selfCook = live.byMenuItemSelfCook.get(menuItemId) ?? 0;
          return {
            menuItemId,
            confirmedQuantity: quantity,
            remainingQuantity: Math.max(0, quantity - selfCook),
            selfCookQuantity: selfCook,
          };
        }),
      };
    });
  }

  // ─── Phase C: recipes + procurement ──────────────────────────────────────

  async listRecipes(userId: string, locationId: string) {
    const providerId = await this.assertProviderStaff(userId, locationId);

    const recipes = await this.db
      .select()
      .from(providerRecipes)
      .where(eq(providerRecipes.providerId, providerId))
      .orderBy(asc(providerRecipes.name));

    const out = [];
    for (const recipe of recipes) {
      const versions = await this.db
        .select()
        .from(providerRecipeVersions)
        .where(eq(providerRecipeVersions.recipeId, recipe.id))
        .orderBy(desc(providerRecipeVersions.versionNumber))
        .limit(1);
      const latest = versions[0] ?? null;
      const ingredients = latest
        ? await this.db
            .select({
              id: recipeIngredients.id,
              ingredientId: recipeIngredients.ingredientId,
              ingredientName: ingredientMaster.name,
              quantityNet: recipeIngredients.quantityNet,
              unit: recipeIngredients.unit,
              yieldPercentOverride: recipeIngredients.yieldPercentOverride,
              defaultYieldPercent: ingredientMaster.defaultYieldPercent,
              sortOrder: recipeIngredients.sortOrder,
            })
            .from(recipeIngredients)
            .innerJoin(ingredientMaster, eq(ingredientMaster.id, recipeIngredients.ingredientId))
            .where(eq(recipeIngredients.recipeVersionId, latest.id))
            .orderBy(asc(recipeIngredients.sortOrder))
        : [];

      out.push({
        id: recipe.id,
        name: recipe.name,
        category: recipe.category,
        status: recipe.status,
        latestVersion: latest
          ? {
              id: latest.id,
              versionNumber: latest.versionNumber,
              portionLabel: latest.portionLabel,
              notes: latest.notes,
              ingredients: ingredients.map((i) => ({
                id: i.id,
                ingredientId: i.ingredientId,
                ingredientName: i.ingredientName,
                quantityNet: Number(i.quantityNet),
                unit: i.unit,
                yieldPercent:
                  i.yieldPercentOverride != null
                    ? Number(i.yieldPercentOverride)
                    : Number(i.defaultYieldPercent),
                sortOrder: i.sortOrder,
              })),
            }
          : null,
      });
    }
    return { recipes: out };
  }

  async createRecipe(
    userId: string,
    locationId: string,
    input: z.infer<typeof createFamilyDinnerRecipeSchema>,
  ) {
    const providerId = await this.assertProviderStaff(userId, locationId);

    return this.db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(providerRecipes)
        .values({
          providerId,
          name: input.name,
          category: input.category ?? null,
          status: "ACTIVE",
        })
        .returning();
      if (!recipe) throw new PickiError("INTERNAL_ERROR", "Failed to create recipe");

      const [version] = await tx
        .insert(providerRecipeVersions)
        .values({
          recipeId: recipe.id,
          versionNumber: 1,
          portionLabel: input.portionLabel ?? "1 family portion",
          notes: input.notes ?? null,
        })
        .returning();
      if (!version) throw new PickiError("INTERNAL_ERROR", "Failed to create recipe version");

      await this.insertRecipeIngredients(tx, version.id, input.ingredients);

      return {
        id: recipe.id,
        name: recipe.name,
        versionId: version.id,
        versionNumber: 1,
      };
    });
  }

  async createRecipeVersion(
    userId: string,
    locationId: string,
    recipeId: string,
    input: z.infer<typeof createRecipeVersionSchema>,
  ) {
    const providerId = await this.assertProviderStaff(userId, locationId);

    const recipe = await this.db
      .select()
      .from(providerRecipes)
      .where(and(eq(providerRecipes.id, recipeId), eq(providerRecipes.providerId, providerId)))
      .limit(1);
    if (!recipe[0]) throw new PickiError("NOT_FOUND", "Recipe not found");

    return this.db.transaction(async (tx) => {
      const latest = await tx
        .select({ versionNumber: providerRecipeVersions.versionNumber })
        .from(providerRecipeVersions)
        .where(eq(providerRecipeVersions.recipeId, recipeId))
        .orderBy(desc(providerRecipeVersions.versionNumber))
        .limit(1);
      const next = (latest[0]?.versionNumber ?? 0) + 1;

      const [version] = await tx
        .insert(providerRecipeVersions)
        .values({
          recipeId,
          versionNumber: next,
          portionLabel: input.portionLabel ?? "1 family portion",
          notes: input.notes ?? null,
        })
        .returning();
      if (!version) throw new PickiError("INTERNAL_ERROR", "Failed to create recipe version");

      await this.insertRecipeIngredients(tx, version.id, input.ingredients);

      return {
        recipeId,
        versionId: version.id,
        versionNumber: next,
      };
    });
  }

  async getProcurement(userId: string, locationId: string, serviceDate: string) {
    await this.assertProviderStaff(userId, locationId);

    const settings = await this.db
      .select()
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
      .limit(1);
    const bufferPercent = settings[0]?.procurementBufferPercent ?? 0;

    const batch = await this.db
      .select()
      .from(familyDinnerProductionBatches)
      .where(
        and(
          eq(familyDinnerProductionBatches.providerLocationId, locationId),
          eq(familyDinnerProductionBatches.serviceDate, serviceDate),
        ),
      )
      .limit(1);

    type QtyLine = { menuItemId: string; quantity: number; recipeVersionId: string | null };
    let lines: QtyLine[] = [];

    if (batch[0]?.status === "LOCKED") {
      const totals = await this.db
        .select()
        .from(familyDinnerProductionItemTotals)
        .where(eq(familyDinnerProductionItemTotals.productionBatchId, batch[0].id));
      lines = totals.map((t) => ({
        menuItemId: t.menuItemId,
        quantity: t.confirmedQuantity + t.lateQuantity,
        recipeVersionId: t.recipeVersionId,
      }));
    } else {
      const live = await this.aggregatePaidProduction(locationId, serviceDate);
      const menuItemIds = [...live.byMenuItem.keys()];
      const recipeMap = new Map<string, string | null>();
      if (menuItemIds.length > 0) {
        const rows = await this.db
          .select({
            id: familyDinnerMenuItems.id,
            recipeVersionId: familyDinnerMenuItems.recipeVersionId,
          })
          .from(familyDinnerMenuItems)
          .where(inArray(familyDinnerMenuItems.id, menuItemIds));
        for (const r of rows) recipeMap.set(r.id, r.recipeVersionId);
      }
      lines = [...live.byMenuItem.entries()].map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
        recipeVersionId: recipeMap.get(menuItemId) ?? null,
      }));
    }

    const netByIngredient = new Map<
      string,
      { name: string; unit: string; net: number; yieldPercent: number }
    >();

    for (const line of lines) {
      if (!line.recipeVersionId || line.quantity <= 0) continue;
      const ings = await this.db
        .select({
          ingredientId: recipeIngredients.ingredientId,
          ingredientName: ingredientMaster.name,
          quantityNet: recipeIngredients.quantityNet,
          unit: recipeIngredients.unit,
          yieldOverride: recipeIngredients.yieldPercentOverride,
          defaultYield: ingredientMaster.defaultYieldPercent,
        })
        .from(recipeIngredients)
        .innerJoin(ingredientMaster, eq(ingredientMaster.id, recipeIngredients.ingredientId))
        .where(eq(recipeIngredients.recipeVersionId, line.recipeVersionId));

      for (const ing of ings) {
        const yieldPercent =
          ing.yieldOverride != null ? Number(ing.yieldOverride) : Number(ing.defaultYield);
        const net = Number(ing.quantityNet) * line.quantity;
        const prev = netByIngredient.get(ing.ingredientId);
        if (prev) {
          prev.net += net;
        } else {
          netByIngredient.set(ing.ingredientId, {
            name: ing.ingredientName,
            unit: ing.unit,
            net,
            yieldPercent,
          });
        }
      }
    }

    const snapshots = await this.db
      .select()
      .from(familyDinnerInventorySnapshots)
      .where(
        and(
          eq(familyDinnerInventorySnapshots.providerLocationId, locationId),
          eq(familyDinnerInventorySnapshots.serviceDate, serviceDate),
        ),
      );
    const onHandById = new Map(
      snapshots.map((s) => [s.ingredientId, Number(s.onHandQuantity)] as const),
    );

    const bufferFactor = 1 + bufferPercent / 100;
    const items = [...netByIngredient.entries()].map(([ingredientId, row]) => {
      const netRequired = Math.round(row.net * bufferFactor * 1000) / 1000;
      const grossRequired = grossFromNet(netRequired, row.yieldPercent);
      const onHand = onHandById.get(ingredientId) ?? 0;
      return {
        ingredientId,
        name: row.name,
        unit: row.unit,
        netRequired,
        grossRequired,
        yieldPercent: row.yieldPercent,
        onHandQuantity: onHand,
        toBuyQuantity: toBuyQuantity(grossRequired, onHand),
      };
    });

    return {
      serviceDate,
      source: batch[0]?.status === "LOCKED" ? "LOCKED_BATCH" : "LIVE_PAID",
      bufferPercent,
      items,
    };
  }

  async upsertInventory(
    userId: string,
    locationId: string,
    input: z.infer<typeof upsertInventorySchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);

    await this.db.transaction(async (tx) => {
      for (const item of input.items) {
        await tx
          .insert(familyDinnerInventorySnapshots)
          .values({
            providerLocationId: locationId,
            serviceDate: input.serviceDate,
            ingredientId: item.ingredientId,
            onHandQuantity: String(item.onHandQuantity),
            unit: item.unit ?? "g",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              familyDinnerInventorySnapshots.providerLocationId,
              familyDinnerInventorySnapshots.serviceDate,
              familyDinnerInventorySnapshots.ingredientId,
            ],
            set: {
              onHandQuantity: String(item.onHandQuantity),
              ...(item.unit !== undefined ? { unit: item.unit } : {}),
              updatedAt: new Date(),
            },
          });
      }
    });

    const rows = await this.db
      .select({
        ingredientId: familyDinnerInventorySnapshots.ingredientId,
        name: ingredientMaster.name,
        onHandQuantity: familyDinnerInventorySnapshots.onHandQuantity,
        unit: familyDinnerInventorySnapshots.unit,
      })
      .from(familyDinnerInventorySnapshots)
      .innerJoin(
        ingredientMaster,
        eq(ingredientMaster.id, familyDinnerInventorySnapshots.ingredientId),
      )
      .where(
        and(
          eq(familyDinnerInventorySnapshots.providerLocationId, locationId),
          eq(familyDinnerInventorySnapshots.serviceDate, input.serviceDate),
        ),
      );

    return {
      serviceDate: input.serviceDate,
      items: rows.map((r) => ({
        ingredientId: r.ingredientId,
        name: r.name,
        onHandQuantity: Number(r.onHandQuantity),
        unit: r.unit,
      })),
    };
  }

  // ─── Phase D: late dinner ────────────────────────────────────────────────

  async createLateOffer(
    userId: string,
    locationId: string,
    input: z.infer<typeof createLateDinnerOfferSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);
    const serviceDate = input.serviceDate ?? defaultDinnerServiceDate();

    return this.db.transaction(async (tx) => {
      const batch = await tx
        .select()
        .from(familyDinnerProductionBatches)
        .where(
          and(
            eq(familyDinnerProductionBatches.providerLocationId, locationId),
            eq(familyDinnerProductionBatches.serviceDate, serviceDate),
            eq(familyDinnerProductionBatches.status, "LOCKED"),
          ),
        )
        .limit(1);
      if (!batch[0]) {
        throw new PickiError("FORBIDDEN", "Chỉ mở Late Dinner sau khi đã khóa sản xuất");
      }

      const menuItemIds = input.items.map((i) => i.menuItemId);
      const totals = await tx
        .select()
        .from(familyDinnerProductionItemTotals)
        .where(
          and(
            eq(familyDinnerProductionItemTotals.productionBatchId, batch[0].id),
            inArray(familyDinnerProductionItemTotals.menuItemId, menuItemIds),
          ),
        );
      const remainingByItem = new Map(totals.map((t) => [t.menuItemId, t.remainingQuantity]));

      const capacityLines = input.items.map((i) => ({
        remaining: remainingByItem.get(i.menuItemId) ?? 0,
        quantityPerTray: i.quantityPerTray,
      }));
      const maxCapacity = lateOfferMaxCapacity(capacityLines);
      if (maxCapacity < 1) {
        throw new PickiError("CONFLICT", "Không còn suất để mở Late Dinner");
      }

      const capacity = input.capacity ?? maxCapacity;
      if (capacity > maxCapacity) {
        throw new PickiError(
          "CONFLICT",
          `Capacity tối đa theo remaining là ${String(maxCapacity)}`,
        );
      }

      // Soft-reserve production remaining so concurrent offers cannot oversell.
      for (const line of input.items) {
        const need = line.quantityPerTray * capacity;
        const [updated] = await tx
          .update(familyDinnerProductionItemTotals)
          .set({
            remainingQuantity: sql`${familyDinnerProductionItemTotals.remainingQuantity} - ${need}`,
          })
          .where(
            and(
              eq(familyDinnerProductionItemTotals.productionBatchId, batch[0].id),
              eq(familyDinnerProductionItemTotals.menuItemId, line.menuItemId),
              sql`${familyDinnerProductionItemTotals.remainingQuantity} >= ${need}`,
            ),
          )
          .returning();
        if (!updated) {
          throw new PickiError("CONFLICT", "Không đủ suất remaining (offer khác vừa giữ chỗ)");
        }
      }

      const [offer] = await tx
        .insert(lateDinnerOffers)
        .values({
          providerLocationId: locationId,
          serviceDate,
          productionBatchId: batch[0].id,
          title: input.title,
          priceVnd: input.priceVnd,
          capacity,
          remainingCapacity: capacity,
          etaMinutes: input.etaMinutes,
          status: "ACTIVE",
        })
        .returning();
      if (!offer) throw new PickiError("INTERNAL_ERROR", "Failed to create late offer");

      await tx.insert(lateDinnerOfferItems).values(
        input.items.map((i) => ({
          offerId: offer.id,
          menuItemId: i.menuItemId,
          quantityPerTray: i.quantityPerTray,
        })),
      );

      return {
        id: offer.id,
        title: offer.title,
        priceVnd: offer.priceVnd,
        capacity: offer.capacity,
        remainingCapacity: offer.remainingCapacity,
        etaMinutes: offer.etaMinutes,
        status: offer.status,
        maxCapacity,
        items: input.items,
      };
    });
  }

  async listLateForLocation(locationId: string, serviceDate: string) {
    const offers = await this.db
      .select()
      .from(lateDinnerOffers)
      .where(
        and(
          eq(lateDinnerOffers.providerLocationId, locationId),
          eq(lateDinnerOffers.serviceDate, serviceDate),
          eq(lateDinnerOffers.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(lateDinnerOffers.createdAt));

    return this.mapLateOffers(offers);
  }

  /** Provider ops — gồm cả mâm đã đóng. */
  async listLateForProvider(userId: string, locationId: string, serviceDate: string) {
    await this.assertProviderStaff(userId, locationId);
    const offers = await this.db
      .select()
      .from(lateDinnerOffers)
      .where(
        and(
          eq(lateDinnerOffers.providerLocationId, locationId),
          eq(lateDinnerOffers.serviceDate, serviceDate),
        ),
      )
      .orderBy(desc(lateDinnerOffers.createdAt));

    const mapped = await this.mapLateOffers(offers);
    const batch = await this.db
      .select({ id: familyDinnerProductionBatches.id })
      .from(familyDinnerProductionBatches)
      .where(
        and(
          eq(familyDinnerProductionBatches.providerLocationId, locationId),
          eq(familyDinnerProductionBatches.serviceDate, serviceDate),
          eq(familyDinnerProductionBatches.status, "LOCKED"),
        ),
      )
      .limit(1);

    let maxCapacityHint: number | null = null;
    if (batch[0]) {
      const totals = await this.db
        .select({
          menuItemId: familyDinnerProductionItemTotals.menuItemId,
          remainingQuantity: familyDinnerProductionItemTotals.remainingQuantity,
        })
        .from(familyDinnerProductionItemTotals)
        .where(eq(familyDinnerProductionItemTotals.productionBatchId, batch[0].id));
      if (totals.length > 0) {
        maxCapacityHint = Math.max(...totals.map((t) => t.remainingQuantity), 0);
      }
    }

    return { ...mapped, maxCapacityHint };
  }

  async closeLateOffer(userId: string, locationId: string, offerId: string) {
    await this.assertProviderStaff(userId, locationId);

    return this.db.transaction(async (tx) => {
      const offerRows = await tx
        .select()
        .from(lateDinnerOffers)
        .where(
          and(eq(lateDinnerOffers.id, offerId), eq(lateDinnerOffers.providerLocationId, locationId)),
        )
        .limit(1);
      const offer = offerRows[0];
      if (!offer) throw new PickiError("NOT_FOUND", "Không tìm thấy mâm tối muộn");
      if (offer.status !== "ACTIVE") {
        return {
          id: offer.id,
          status: offer.status,
          remainingCapacity: offer.remainingCapacity,
        };
      }

      const lines = await tx
        .select()
        .from(lateDinnerOfferItems)
        .where(eq(lateDinnerOfferItems.offerId, offerId));

      const release = offer.remainingCapacity;
      if (release > 0 && offer.productionBatchId) {
        for (const line of lines) {
          const restore = line.quantityPerTray * release;
          await tx
            .update(familyDinnerProductionItemTotals)
            .set({
              remainingQuantity: sql`${familyDinnerProductionItemTotals.remainingQuantity} + ${restore}`,
            })
            .where(
              and(
                eq(familyDinnerProductionItemTotals.productionBatchId, offer.productionBatchId),
                eq(familyDinnerProductionItemTotals.menuItemId, line.menuItemId),
              ),
            );
        }
      }

      const [updated] = await tx
        .update(lateDinnerOffers)
        .set({ status: "CLOSED", remainingCapacity: 0, updatedAt: new Date() })
        .where(eq(lateDinnerOffers.id, offerId))
        .returning();

      return {
        id: updated!.id,
        status: updated!.status,
        remainingCapacity: updated!.remainingCapacity,
        releasedCapacity: release,
      };
    });
  }

  /**
   * Provider «Chép menu gần nhất»:
   * - publish=false → trả items/windows để FE đổ draft (không ghi DB menu hôm nay).
   * - publish=true → clone + PUBLISHED như auto-copy (khi hôm nay chưa có menu).
   */
  async copyLastMenuForProvider(
    userId: string,
    locationId: string,
    input: { serviceDate?: string; publish?: boolean },
  ) {
    await this.assertProviderStaff(userId, locationId);
    const serviceDate = input.serviceDate ?? defaultDinnerServiceDate();

    const last = await this.db
      .select()
      .from(familyDinnerDailyMenus)
      .where(
        and(
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
          eq(familyDinnerDailyMenus.status, "PUBLISHED"),
          lt(familyDinnerDailyMenus.serviceDate, serviceDate),
        ),
      )
      .orderBy(desc(familyDinnerDailyMenus.serviceDate))
      .limit(1);
    if (!last[0]) {
      throw new PickiError("NOT_FOUND", "Chưa có menu ngày trước để chép");
    }

    const items = await this.db
      .select()
      .from(familyDinnerMenuItems)
      .where(eq(familyDinnerMenuItems.dailyMenuId, last[0].id))
      .orderBy(asc(familyDinnerMenuItems.sortOrder), asc(familyDinnerMenuItems.name));

    const windows = await this.db
      .select()
      .from(familyDinnerDeliveryWindows)
      .where(
        and(
          eq(familyDinnerDeliveryWindows.providerLocationId, locationId),
          eq(familyDinnerDeliveryWindows.serviceDate, last[0].serviceDate),
        ),
      )
      .orderBy(asc(familyDinnerDeliveryWindows.startsAt));

    const payload = {
      sourceServiceDate: last[0].serviceDate,
      serviceDate,
      items: items.map((i) => ({
        category: i.category,
        name: i.name,
        description: i.description,
        priceVnd: i.priceVnd,
        capacity: i.capacity,
        allowsSelfCook: i.allowsSelfCook && isFamilyDinnerSelfCookCategory(i.category),
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
      .select({ id: familyDinnerDailyMenus.id, status: familyDinnerDailyMenus.status })
      .from(familyDinnerDailyMenus)
      .where(
        and(
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
          eq(familyDinnerDailyMenus.serviceDate, serviceDate),
        ),
      )
      .limit(1);
    if (today[0]?.status === "PUBLISHED") {
      throw new PickiError("CONFLICT", "Hôm nay đã có menu — dùng Sửa menu hoặc đăng lại");
    }

    await this.copyLastPublishedMenuIfMissing(locationId, serviceDate);
    return { ...payload, published: true as const };
  }

  async listLateForZone(zoneId: string, serviceDate: string) {
    const offers = await this.db
      .select({
        offer: lateDinnerOffers,
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
      })
      .from(lateDinnerOffers)
      .innerJoin(
        providerLocations,
        eq(providerLocations.id, lateDinnerOffers.providerLocationId),
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
      .where(
        and(
          eq(lateDinnerOffers.serviceDate, serviceDate),
          eq(lateDinnerOffers.status, "ACTIVE"),
          sql`${lateDinnerOffers.remainingCapacity} > 0`,
        ),
      )
      .orderBy(desc(lateDinnerOffers.createdAt));

    const mapped = await this.mapLateOffers(offers.map((o) => o.offer));
    const meta = new Map(
      offers.map((o) => [
        o.offer.id,
        {
          locationId: o.offer.providerLocationId,
          brandName: o.brandName,
          displayName: o.displayName,
        },
      ]),
    );

    return {
      serviceDate,
      offers: mapped.offers.map((o) => ({
        ...o,
        ...(meta.get(o.id) ?? {}),
      })),
    };
  }

  private async mapLateOffers(offers: (typeof lateDinnerOffers.$inferSelect)[]) {
    if (offers.length === 0) return { offers: [] as const };

    const offerIds = offers.map((o) => o.id);
    const items = await this.db
      .select({
        offerId: lateDinnerOfferItems.offerId,
        menuItemId: lateDinnerOfferItems.menuItemId,
        quantityPerTray: lateDinnerOfferItems.quantityPerTray,
        name: familyDinnerMenuItems.name,
        category: familyDinnerMenuItems.category,
      })
      .from(lateDinnerOfferItems)
      .innerJoin(
        familyDinnerMenuItems,
        eq(familyDinnerMenuItems.id, lateDinnerOfferItems.menuItemId),
      )
      .where(inArray(lateDinnerOfferItems.offerId, offerIds));

    const byOffer = new Map<string, typeof items>();
    for (const item of items) {
      const list = byOffer.get(item.offerId) ?? [];
      list.push(item);
      byOffer.set(item.offerId, list);
    }

    return {
      offers: offers.map((o) => ({
        id: o.id,
        title: o.title,
        priceVnd: o.priceVnd,
        capacity: o.capacity,
        remainingCapacity: o.remainingCapacity,
        etaMinutes: o.etaMinutes,
        status: o.status,
        serviceDate: o.serviceDate,
        available: o.status === "ACTIVE" && o.remainingCapacity > 0,
        items: (byOffer.get(o.id) ?? []).map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          category: i.category,
          quantityPerTray: i.quantityPerTray,
        })),
      })),
    };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async aggregatePaidProduction(
    locationId: string,
    serviceDate: string,
    tx: OrderTx | PickiDb = this.db,
  ) {
    const paidOrders = await tx
      .select({
        id: orders.id,
        deliveryWindowId: orders.deliveryWindowId,
      })
      .from(orders)
      .where(
        and(
          eq(orders.providerLocationId, locationId),
          eq(orders.serviceDate, serviceDate),
          eq(orders.orderKind, "FAMILY_DINNER"),
          inArray(orders.status, [...PAID_FAMILY_DINNER_STATUSES]),
        ),
      );

    const byMenuItem = new Map<string, number>();
    const byMenuItemSelfCook = new Map<string, number>();
    const byWindow = new Map<string, number>();
    const orderIds = paidOrders.map((o) => o.id);

    for (const o of paidOrders) {
      if (o.deliveryWindowId) {
        byWindow.set(o.deliveryWindowId, (byWindow.get(o.deliveryWindowId) ?? 0) + 1);
      }
    }

    if (orderIds.length > 0) {
      const lines = await tx
        .select({
          menuItemId: orderItems.familyDinnerMenuItemId,
          quantity: orderItems.quantity,
          prepMode: orderItems.prepMode,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds));

      for (const line of lines) {
        if (!line.menuItemId) continue;
        byMenuItem.set(
          line.menuItemId,
          (byMenuItem.get(line.menuItemId) ?? 0) + line.quantity,
        );
        if (line.prepMode === "SELF_COOK") {
          byMenuItemSelfCook.set(
            line.menuItemId,
            (byMenuItemSelfCook.get(line.menuItemId) ?? 0) + line.quantity,
          );
        }
      }
    }

    return { orderCount: paidOrders.length, orderIds, byMenuItem, byMenuItemSelfCook, byWindow };
  }

  private async insertRecipeIngredients(
    tx: OrderTx,
    recipeVersionId: string,
    lines: z.infer<typeof createFamilyDinnerRecipeSchema>["ingredients"],
  ) {
    for (const [idx, line] of lines.entries()) {
      const ingredientId = await this.resolveOrCreateIngredient(tx, line);
      await tx.insert(recipeIngredients).values({
        recipeVersionId,
        ingredientId,
        quantityNet: String(line.quantityNet),
        unit: line.unit,
        yieldPercentOverride:
          line.yieldPercentOverride != null ? String(line.yieldPercentOverride) : null,
        sortOrder: line.sortOrder ?? idx,
      });
    }
  }

  private async resolveOrCreateIngredient(
    tx: OrderTx,
    line: {
      ingredientName: string;
      category?: string;
      baseUnit?: string;
      unit: string;
    },
  ): Promise<string> {
    const existing = await tx
      .select({ id: ingredientMaster.id })
      .from(ingredientMaster)
      .where(sql`lower(${ingredientMaster.name}) = lower(${line.ingredientName})`)
      .limit(1);
    if (existing[0]) return existing[0].id;

    const [created] = await tx
      .insert(ingredientMaster)
      .values({
        name: line.ingredientName.trim(),
        category: line.category ?? null,
        baseUnit: line.baseUnit ?? line.unit,
      })
      .returning({ id: ingredientMaster.id });
    if (!created) throw new PickiError("INTERNAL_ERROR", "Failed to create ingredient");
    return created.id;
  }

  private async assertRecipeVersionOwned(locationId: string, recipeVersionId: string) {
    const loc = await this.db
      .select({ providerId: providerLocations.providerId })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!loc[0]) throw new PickiError("NOT_FOUND", "Location not found");

    const row = await this.db
      .select({ id: providerRecipeVersions.id })
      .from(providerRecipeVersions)
      .innerJoin(providerRecipes, eq(providerRecipes.id, providerRecipeVersions.recipeId))
      .where(
        and(
          eq(providerRecipeVersions.id, recipeVersionId),
          eq(providerRecipes.providerId, loc[0].providerId),
        ),
      )
      .limit(1);
    if (!row[0]) {
      throw new PickiError("VALIDATION_ERROR", "recipeVersionId không thuộc provider này");
    }
  }

  private assertCategoryQuotas(items: { category: FamilyDinnerCategory }[]) {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    for (const [cat, limit] of Object.entries(FAMILY_DINNER_CATEGORY_LIMITS)) {
      if ((counts[cat] ?? 0) > limit) {
        throw new PickiError(
          "VALIDATION_ERROR",
          `${cat} tối đa ${String(limit)} món / ngày`,
        );
      }
    }
  }

  /** Returns providerId. Location-scoped membership preferred (same as ProviderService). */
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
      throw new PickiError("FORBIDDEN", "Chỉ nhân viên bếp mới thao tác");
    }
    return loc[0].providerId;
  }

  /**
   * Mỗi ngày mặc định phục vụ: nếu bếp đã bật + từng có menu PUBLISHED
   * mà hôm nay chưa có → copy menu/windows gần nhất sang ngày phục vụ hiện tại.
   */
  private async ensureTodayMenusForZone(zoneId: string, serviceDate: string) {
    const kitchens = await this.db
      .select({ locationId: familyDinnerProviderSettings.providerLocationId })
      .from(familyDinnerProviderSettings)
      .innerJoin(
        providerZoneMemberships,
        and(
          eq(
            providerZoneMemberships.providerLocationId,
            familyDinnerProviderSettings.providerLocationId,
          ),
          eq(providerZoneMemberships.zoneId, zoneId),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      )
      .where(eq(familyDinnerProviderSettings.enabled, true));

    for (const k of kitchens) {
      await this.copyLastPublishedMenuIfMissing(k.locationId, serviceDate);
    }
  }

  private async copyLastPublishedMenuIfMissing(locationId: string, serviceDate: string) {
    const today = await this.db
      .select({ id: familyDinnerDailyMenus.id })
      .from(familyDinnerDailyMenus)
      .where(
        and(
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
          eq(familyDinnerDailyMenus.serviceDate, serviceDate),
          eq(familyDinnerDailyMenus.status, "PUBLISHED"),
        ),
      )
      .limit(1);
    if (today[0]) return;

    const last = await this.db
      .select()
      .from(familyDinnerDailyMenus)
      .where(
        and(
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
          eq(familyDinnerDailyMenus.status, "PUBLISHED"),
        ),
      )
      .orderBy(desc(familyDinnerDailyMenus.serviceDate))
      .limit(1);
    if (!last[0]) return;

    await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(familyDinnerDailyMenus)
        .values({
          providerLocationId: locationId,
          serviceDate,
          status: "PUBLISHED",
          publishedAt: new Date(),
          copiedFromServiceDate: last[0]!.serviceDate,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) return;

      const items = await tx
        .select()
        .from(familyDinnerMenuItems)
        .where(eq(familyDinnerMenuItems.dailyMenuId, last[0]!.id));
      if (items.length > 0) {
        await tx.insert(familyDinnerMenuItems).values(
          items.map((i, idx) => ({
            dailyMenuId: created.id,
            category: i.category,
            name: i.name,
            description: i.description,
            priceVnd: i.priceVnd,
            capacity: i.capacity,
            remainingCapacity: i.capacity,
            recipeVersionId: i.recipeVersionId,
            sortOrder: i.sortOrder ?? idx,
            status: "ACTIVE" as const,
            allowsSelfCook: i.allowsSelfCook,
          })),
        );
      }

      const windows = await tx
        .select()
        .from(familyDinnerDeliveryWindows)
        .where(
          and(
            eq(familyDinnerDeliveryWindows.providerLocationId, locationId),
            eq(familyDinnerDeliveryWindows.serviceDate, last[0]!.serviceDate),
          ),
        );
      if (windows.length > 0) {
        await tx.insert(familyDinnerDeliveryWindows).values(
          windows.map((w) => ({
            providerLocationId: locationId,
            serviceDate,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
            capacity: w.capacity,
            remainingCapacity: w.capacity,
            status: "OPEN" as const,
          })),
        );
      } else {
        await tx.insert(familyDinnerDeliveryWindows).values([
          {
            providerLocationId: locationId,
            serviceDate,
            startsAt: "17:30",
            endsAt: "18:00",
            capacity: 12,
            remainingCapacity: 12,
            status: "OPEN",
          },
          {
            providerLocationId: locationId,
            serviceDate,
            startsAt: "18:00",
            endsAt: "18:30",
            capacity: 15,
            remainingCapacity: 15,
            status: "OPEN",
          },
          {
            providerLocationId: locationId,
            serviceDate,
            startsAt: "18:30",
            endsAt: "19:00",
            capacity: 15,
            remainingCapacity: 15,
            status: "OPEN",
          },
          {
            providerLocationId: locationId,
            serviceDate,
            startsAt: "19:00",
            endsAt: "19:30",
            capacity: 10,
            remainingCapacity: 10,
            status: "OPEN",
          },
        ]);
      }
    });
  }
}

export function formatTime(value: string | unknown): string {
  if (typeof value !== "string") return "16:00";
  return value.slice(0, 5);
}

/** Compare now (Asia/Ho_Chi_Minh) to service_date + cutoff HH:MM. */
export function isPastCutoff(serviceDate: string, cutoffHhMm: string): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const nowHm = `${get("hour")}:${get("minute")}`;
  if (serviceDate < today) return true;
  if (serviceDate > today) return false;
  return nowHm >= cutoffHhMm;
}

export function vnCalendarDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

/** Default service date for dinner: today if before 20:00 VN, else tomorrow. */
export function defaultDinnerServiceDate(now = new Date()): string {
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
  if (hour >= 20) base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}
