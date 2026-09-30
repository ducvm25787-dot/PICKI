import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  applyDailyStockAction,
  setDailyPrice,
  breakfastPreorderDailyMenus,
  breakfastPreorderMenuItems,
  breakfastPreorderProviderSettings,
  commerceServiceDate,
  copyPreviousDailyAvailability,
  familyDinnerDailyMenus,
  familyDinnerMenuItems,
  familyDinnerProviderSettings,
  lateNightProviderSettings,
  offeringOptionGroups,
  offeringOptions,
  offeringPrices,
  offerings,
  productCategories,
  orders,
  productDailyAvailability,
  providerCapabilities,
  providerLocations,
  providerMembers,
  providers,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";

const CHANNELS = [
  { capability: "SELL_NOW", label: "Bán ngay", href: null },
  { capability: "BREAKFAST_PREORDER", label: "Sáng mai", href: "/provider/breakfast" },
  { capability: "FAMILY_DINNER", label: "Bữa tối ấm cúng", href: "/provider/family-dinner" },
  { capability: "LATE_NIGHT", label: "Ăn khuya", href: "/provider/live" },
] as const;

const FOOD_UNITS = ["phần", "tô", "đĩa", "ly", "suất", "cái"] as const;

type OptionGroupInput = {
  name: string;
  kind: "SINGLE" | "MULTI";
  options: { name: string; priceDeltaVnd: number }[];
};

type ProductInput = {
  name: string;
  priceVnd: number;
  description?: string | null;
  imageUrl?: string | null;
  unit?: (typeof FOOD_UNITS)[number];
  prepTimeMinutes?: number | null;
  categoryId?: string | null;
  optionGroups?: OptionGroupInput[];
};

function slugify(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "mon";
}

function remainingOf(row: {
  availableQty: number | null;
  reservedQty: number;
  soldQty: number;
  status: string;
} | undefined) {
  if (!row) return { status: "UNSET" as const, remaining: null as number | null };
  if (row.status === "HIDDEN") return { status: "HIDDEN" as const, remaining: null };
  if (row.status === "SOLD_OUT") {
    const left =
      row.availableQty == null ? 0 : Math.max(0, row.availableQty - row.reservedQty - row.soldQty);
    return { status: "SOLD_OUT" as const, remaining: left };
  }
  if (row.availableQty == null) return { status: "UNSET" as const, remaining: null };
  const remaining = row.availableQty - row.reservedQty - row.soldQty;
  return {
    status: remaining <= 0 || row.status === "SOLD_OUT" ? ("SOLD_OUT" as const) : ("AVAILABLE" as const),
    remaining: Math.max(0, remaining),
  };
}

@Injectable()
export class FoodBoardService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async board(userId: string, locationId: string) {
    const access = await this.assertFoodLocation(userId, locationId);
    const today = commerceServiceDate();
    const caps = await this.capabilityMap(access.providerId);

    const [counts] = await this.db
      .select({
        fresh: sql<number>`count(*) filter (where ${orders.status} in ('CREATED', 'PAYMENT_PENDING', 'PAID'))::int`,
        cooking: sql<number>`count(*) filter (where ${orders.status} in ('PROVIDER_ACCEPTED', 'PREPARING'))::int`,
        waitingRunner: sql<number>`count(*) filter (where ${orders.status} in ('READY', 'RUNNER_ASSIGNED'))::int`,
      })
      .from(orders)
      .where(eq(orders.providerLocationId, locationId));

    const productRows = await this.db
      .select({
        id: offerings.id,
        name: offerings.name,
        imageUrl: offerings.imageUrl,
        availableQty: productDailyAvailability.availableQty,
        reservedQty: productDailyAvailability.reservedQty,
        soldQty: productDailyAvailability.soldQty,
        dayStatus: productDailyAvailability.status,
        priceOverrideVnd: productDailyAvailability.priceOverrideVnd,
      })
      .from(offerings)
      .leftJoin(
        productDailyAvailability,
        and(
          eq(productDailyAvailability.offeringId, offerings.id),
          eq(productDailyAvailability.serviceDate, today),
        ),
      )
      .where(and(eq(offerings.providerId, access.providerId), eq(offerings.status, "ACTIVE")))
      .orderBy(offerings.sortOrder, offerings.name);
    const priceByOffering = await this.priceMap(
      locationId,
      productRows.map((row) => row.id),
    );

    const sellNow = productRows.map((row) => {
      const day = remainingOf(
        row.dayStatus
          ? {
              availableQty: row.availableQty,
              reservedQty: row.reservedQty ?? 0,
              soldQty: row.soldQty ?? 0,
              status: row.dayStatus,
            }
          : undefined,
      );
      return {
        offeringId: row.id,
        name: row.name,
        imageUrl: row.imageUrl,
        priceVnd: priceByOffering.get(row.id) ?? 0,
        priceOverrideVnd: row.priceOverrideVnd,
        status: day.status,
        remaining: day.remaining,
      };
    });

    return {
      date: today,
      orders: {
        fresh: counts?.fresh ?? 0,
        cooking: counts?.cooking ?? 0,
        waitingRunner: counts?.waitingRunner ?? 0,
      },
      sellNow: caps.SELL_NOW === false ? [] : sellNow,
      sellNowEnabled: caps.SELL_NOW !== false,
      breakfast: caps.BREAKFAST_PREORDER
        ? await this.menuSection(locationId, today, "breakfast")
        : null,
      dinner: caps.FAMILY_DINNER ? await this.menuSection(locationId, today, "dinner") : null,
    };
  }

  async stockAction(
    userId: string,
    locationId: string,
    input: {
      offeringId: string;
      serviceDate?: string;
      action: "add" | "sold_out" | "hide" | "show" | "price";
      quantity?: number;
      priceVnd?: number | null;
    },
  ) {
    const access = await this.assertFoodLocation(userId, locationId);
    await this.assertOffering(access.providerId, input.offeringId);
    await this.db.transaction(async (tx) => {
      if (input.action === "price") {
        await setDailyPrice(tx, {
          offeringId: input.offeringId,
          serviceDate: input.serviceDate ?? commerceServiceDate(),
          priceVnd: input.priceVnd ?? null,
        });
        return;
      }
      await applyDailyStockAction(tx, {
        offeringId: input.offeringId,
        serviceDate: input.serviceDate ?? commerceServiceDate(),
        action: input.action,
        quantity: input.quantity,
      });
    });
    return this.board(userId, locationId);
  }

  async menuStockAction(
    userId: string,
    locationId: string,
    input: {
      channel: "breakfast" | "dinner";
      menuItemId: string;
      action: "add" | "sold_out" | "hide" | "show";
      quantity?: number;
    },
  ) {
    const access = await this.assertFoodLocation(userId, locationId);
    const item = await this.loadMenuItem(locationId, input.channel, input.menuItemId);
    if (item.offeringId) {
      const menuDate = await this.menuDate(locationId, input.channel, input.menuItemId);
      const [day] = await this.db
        .select({ id: productDailyAvailability.id })
        .from(productDailyAvailability)
        .where(
          and(
            eq(productDailyAvailability.offeringId, item.offeringId),
            eq(productDailyAvailability.serviceDate, menuDate),
          ),
        )
        .limit(1);
      if (day) {
        return this.stockAction(userId, locationId, {
          offeringId: item.offeringId,
          serviceDate: menuDate,
          action: input.action,
          quantity: input.quantity,
        });
      }
    }

    const add = input.quantity && input.quantity > 0 ? input.quantity : 5;
    if (input.channel === "breakfast") {
      await this.patchMenuQty(breakfastPreorderMenuItems, item, input.action, add);
    } else {
      await this.patchMenuQty(familyDinnerMenuItems, item, input.action, add);
    }
    void access;
    return this.board(userId, locationId);
  }

  async copyPrevious(userId: string, locationId: string) {
    const access = await this.assertFoodLocation(userId, locationId);
    const result = await this.db.transaction((tx) =>
      copyPreviousDailyAvailability(tx, access.providerId, commerceServiceDate()),
    );
    const board = await this.board(userId, locationId);
    return { ...result, board };
  }

  async listCategories(userId: string, locationId: string) {
    await this.assertFoodLocation(userId, locationId);
    const rows = await this.db
      .select({ id: productCategories.id, name: productCategories.name })
      .from(productCategories)
      .where(and(eq(productCategories.type, "FOOD"), eq(productCategories.active, true)))
      .orderBy(productCategories.sortOrder, productCategories.name);
    return { categories: rows };
  }

  async listProducts(userId: string, locationId: string) {
    const access = await this.assertFoodLocation(userId, locationId);
    const rows = await this.productRows(access.providerId);
    const priceByOffering = await this.priceMap(
      locationId,
      rows.map((row) => row.id),
    );
    const breakfastIds = await this.breakfastOfferingIds(locationId);
    const categories = await this.categoryNameMap(rows.map((row) => row.categoryId));
    return {
      products: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        imageUrl: row.imageUrl,
        unit: row.unit,
        prepTimeMinutes: row.prepTimeMinutes,
        categoryId: row.categoryId,
        categoryName: row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
        active: row.status === "ACTIVE",
        priceVnd: priceByOffering.get(row.id) ?? 0,
        onBreakfastMenu: breakfastIds.has(row.id),
      })),
    };
  }

  async getProduct(userId: string, locationId: string, offeringId: string) {
    const listed = await this.listProducts(userId, locationId);
    const product = listed.products.find((row) => row.id === offeringId);
    if (!product) throw new PickiError("NOT_FOUND", "Không thấy món");
    const groups = await this.optionGroupsFor(product.id);
    return { product: { ...product, optionGroups: groups } };
  }

  async createProduct(
    userId: string,
    locationId: string,
    input: ProductInput,
  ) {
    const access = await this.assertFoodLocation(userId, locationId);
    await this.assertFoodCategory(input.categoryId);
    const slug = await this.uniqueSlug(access.providerId, slugify(input.name));
    const [created] = await this.db
      .insert(offerings)
      .values({
        providerId: access.providerId,
        slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        imageUrl: input.imageUrl?.trim() || null,
        unit: input.unit ?? "phần",
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        categoryId: input.categoryId ?? null,
        status: "ACTIVE",
      })
      .returning();
    await this.db.insert(offeringPrices).values({
      offeringId: created!.id,
      providerLocationId: locationId,
      amountVnd: input.priceVnd,
    });
    await this.db
      .insert(providerCapabilities)
      .values({ providerId: access.providerId, capability: "SELL_NOW", enabled: true })
      .onConflictDoNothing();
    await this.replaceOptionGroups(created!.id, input.optionGroups);
    return { id: created!.id };
  }

  async updateProduct(
    userId: string,
    locationId: string,
    offeringId: string,
    input: Partial<ProductInput> & { active?: boolean },
  ) {
    const access = await this.assertFoodLocation(userId, locationId);
    await this.assertOffering(access.providerId, offeringId);
    if (input.categoryId) await this.assertFoodCategory(input.categoryId);
    await this.db
      .update(offerings)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl?.trim() || null } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.prepTimeMinutes !== undefined ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.active !== undefined ? { status: input.active ? "ACTIVE" : "ARCHIVED" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(offerings.id, offeringId));
    if (input.priceVnd !== undefined) {
      await this.upsertLocationPrice(locationId, offeringId, input.priceVnd);
    }
    await this.replaceOptionGroups(offeringId, input.optionGroups);
    return this.getProduct(userId, locationId, offeringId);
  }

  async selling(userId: string, locationId: string) {
    const access = await this.assertFoodLocation(userId, locationId);
    const caps = await this.capabilityMap(access.providerId);
    return {
      channels: CHANNELS.map((channel) => ({
        capability: channel.capability,
        label: channel.label,
        href: channel.href,
        enabled: caps[channel.capability] === true,
      })),
    };
  }

  async setSelling(
    userId: string,
    locationId: string,
    input: { capability: (typeof CHANNELS)[number]["capability"]; enabled: boolean },
  ) {
    const access = await this.assertFoodLocation(userId, locationId);
    await this.db
      .insert(providerCapabilities)
      .values({
        providerId: access.providerId,
        capability: input.capability,
        enabled: input.enabled,
      })
      .onConflictDoUpdate({
        target: [providerCapabilities.providerId, providerCapabilities.capability],
        set: { enabled: input.enabled, updatedAt: new Date() },
      });

    if (input.capability === "BREAKFAST_PREORDER") {
      await this.db
        .insert(breakfastPreorderProviderSettings)
        .values({ providerLocationId: locationId, enabled: input.enabled })
        .onConflictDoUpdate({
          target: breakfastPreorderProviderSettings.providerLocationId,
          set: { enabled: input.enabled, updatedAt: new Date() },
        });
    }
    if (input.capability === "FAMILY_DINNER") {
      await this.db
        .insert(familyDinnerProviderSettings)
        .values({ providerLocationId: locationId, enabled: input.enabled })
        .onConflictDoUpdate({
          target: familyDinnerProviderSettings.providerLocationId,
          set: { enabled: input.enabled, updatedAt: new Date() },
        });
    }
    if (input.capability === "LATE_NIGHT") {
      await this.db
        .insert(lateNightProviderSettings)
        .values({ providerLocationId: locationId, enabled: input.enabled })
        .onConflictDoUpdate({
          target: lateNightProviderSettings.providerLocationId,
          set: { enabled: input.enabled, updatedAt: new Date() },
        });
    }
    return this.selling(userId, locationId);
  }

  private async menuSection(locationId: string, today: string, channel: "breakfast" | "dinner") {
    const menus =
      channel === "breakfast" ? breakfastPreorderDailyMenus : familyDinnerDailyMenus;
    const items = channel === "breakfast" ? breakfastPreorderMenuItems : familyDinnerMenuItems;
    const [menu] = await this.db
      .select()
      .from(menus)
      .where(
        and(
          eq(menus.providerLocationId, locationId),
          sql`${menus.serviceDate} >= ${today}`,
          eq(menus.status, "PUBLISHED"),
        ),
      )
      .orderBy(menus.serviceDate)
      .limit(1);
    if (!menu) return { serviceDate: null as string | null, items: [] };

    const rows = await this.db
      .select()
      .from(items)
      .where(eq(items.dailyMenuId, menu.id))
      .orderBy(items.sortOrder, items.name);

    const offeringIds = rows.map((row) => row.offeringId).filter((id): id is string => !!id);
    const days =
      offeringIds.length === 0
        ? []
        : await this.db
            .select()
            .from(productDailyAvailability)
            .where(
              and(
                inArray(productDailyAvailability.offeringId, offeringIds),
                eq(productDailyAvailability.serviceDate, menu.serviceDate),
              ),
            );
    const byOffering = new Map(days.map((day) => [day.offeringId, day]));

    return {
      serviceDate: menu.serviceDate,
      items: rows.map((row) => {
        const shared = row.offeringId ? byOffering.get(row.offeringId) : undefined;
        if (shared) {
          const day = remainingOf(shared);
          return {
            id: row.id,
            offeringId: row.offeringId,
            name: row.name,
            status: day.status === "UNSET" ? row.status : day.status,
            remaining: day.status === "UNSET" ? row.remainingCapacity : day.remaining,
            selfCook: "allowsSelfCook" in row ? row.allowsSelfCook : false,
            shared: true,
          };
        }
        return {
          id: row.id,
          offeringId: row.offeringId,
          name: row.name,
          status: row.status,
          remaining: row.remainingCapacity,
          selfCook: "allowsSelfCook" in row ? row.allowsSelfCook : false,
          shared: false,
        };
      }),
    };
  }

  private async patchMenuQty(
    table: typeof breakfastPreorderMenuItems | typeof familyDinnerMenuItems,
    item: { id: string; remainingCapacity: number | null; capacity: number | null; status: string },
    action: "add" | "sold_out" | "hide" | "show",
    add: number,
  ) {
    if (action === "hide") {
      await this.db.update(table).set({ status: "PAUSED", updatedAt: new Date() }).where(eq(table.id, item.id));
      return;
    }
    if (action === "sold_out") {
      await this.db
        .update(table)
        .set({ remainingCapacity: 0, status: "SOLD_OUT", updatedAt: new Date() })
        .where(eq(table.id, item.id));
      return;
    }
    if (action === "show") {
      const status = item.remainingCapacity === 0 ? "SOLD_OUT" : "ACTIVE";
      await this.db.update(table).set({ status, updatedAt: new Date() }).where(eq(table.id, item.id));
      return;
    }
    const nextRemaining = (item.remainingCapacity ?? 0) + add;
    const nextCapacity = item.capacity == null ? null : Math.max(item.capacity, nextRemaining);
    await this.db
      .update(table)
      .set({
        remainingCapacity: nextRemaining,
        ...(nextCapacity != null ? { capacity: nextCapacity } : {}),
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(table.id, item.id));
  }

  private async loadMenuItem(locationId: string, channel: "breakfast" | "dinner", menuItemId: string) {
    if (channel === "breakfast") {
      const [row] = await this.db
        .select({
          id: breakfastPreorderMenuItems.id,
          offeringId: breakfastPreorderMenuItems.offeringId,
          remainingCapacity: breakfastPreorderMenuItems.remainingCapacity,
          capacity: breakfastPreorderMenuItems.capacity,
          status: breakfastPreorderMenuItems.status,
          locationId: breakfastPreorderDailyMenus.providerLocationId,
        })
        .from(breakfastPreorderMenuItems)
        .innerJoin(
          breakfastPreorderDailyMenus,
          eq(breakfastPreorderDailyMenus.id, breakfastPreorderMenuItems.dailyMenuId),
        )
        .where(eq(breakfastPreorderMenuItems.id, menuItemId))
        .limit(1);
      if (!row || row.locationId !== locationId) {
        throw new PickiError("NOT_FOUND", "Không thấy món");
      }
      return row;
    }
    const [row] = await this.db
      .select({
        id: familyDinnerMenuItems.id,
        offeringId: familyDinnerMenuItems.offeringId,
        remainingCapacity: familyDinnerMenuItems.remainingCapacity,
        capacity: familyDinnerMenuItems.capacity,
        status: familyDinnerMenuItems.status,
        locationId: familyDinnerDailyMenus.providerLocationId,
      })
      .from(familyDinnerMenuItems)
      .innerJoin(familyDinnerDailyMenus, eq(familyDinnerDailyMenus.id, familyDinnerMenuItems.dailyMenuId))
      .where(eq(familyDinnerMenuItems.id, menuItemId))
      .limit(1);
    if (!row || row.locationId !== locationId) {
      throw new PickiError("NOT_FOUND", "Không thấy món");
    }
    return row;
  }

  private async menuDate(locationId: string, channel: "breakfast" | "dinner", menuItemId: string) {
    if (channel === "breakfast") {
      const [row] = await this.db
        .select({ serviceDate: breakfastPreorderDailyMenus.serviceDate })
        .from(breakfastPreorderMenuItems)
        .innerJoin(
          breakfastPreorderDailyMenus,
          eq(breakfastPreorderDailyMenus.id, breakfastPreorderMenuItems.dailyMenuId),
        )
        .where(
          and(
            eq(breakfastPreorderMenuItems.id, menuItemId),
            eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
          ),
        )
        .limit(1);
      if (!row) throw new PickiError("NOT_FOUND", "Không thấy món");
      return row.serviceDate;
    }
    const [row] = await this.db
      .select({ serviceDate: familyDinnerDailyMenus.serviceDate })
      .from(familyDinnerMenuItems)
      .innerJoin(familyDinnerDailyMenus, eq(familyDinnerDailyMenus.id, familyDinnerMenuItems.dailyMenuId))
      .where(
        and(
          eq(familyDinnerMenuItems.id, menuItemId),
          eq(familyDinnerDailyMenus.providerLocationId, locationId),
        ),
      )
      .limit(1);
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy món");
    return row.serviceDate;
  }

  private async productRows(providerId: string) {
    return this.db
      .select({
        id: offerings.id,
        name: offerings.name,
        description: offerings.description,
        imageUrl: offerings.imageUrl,
        unit: offerings.unit,
        prepTimeMinutes: offerings.prepTimeMinutes,
        categoryId: offerings.categoryId,
        status: offerings.status,
      })
      .from(offerings)
      .where(eq(offerings.providerId, providerId))
      .orderBy(offerings.sortOrder, offerings.name);
  }

  private async categoryNameMap(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const rows = await this.db
      .select({ id: productCategories.id, name: productCategories.name })
      .from(productCategories)
      .where(inArray(productCategories.id, unique));
    for (const row of rows) map.set(row.id, row.name);
    return map;
  }

  private async breakfastOfferingIds(locationId: string) {
    const today = commerceServiceDate();
    const rows = await this.db
      .select({ offeringId: breakfastPreorderMenuItems.offeringId })
      .from(breakfastPreorderMenuItems)
      .innerJoin(
        breakfastPreorderDailyMenus,
        eq(breakfastPreorderDailyMenus.id, breakfastPreorderMenuItems.dailyMenuId),
      )
      .where(
        and(
          eq(breakfastPreorderDailyMenus.providerLocationId, locationId),
          eq(breakfastPreorderDailyMenus.status, "PUBLISHED"),
          sql`${breakfastPreorderDailyMenus.serviceDate} >= ${today}`,
          sql`${breakfastPreorderMenuItems.offeringId} IS NOT NULL`,
        ),
      );
    return new Set(rows.map((row) => row.offeringId).filter((id): id is string => !!id));
  }

  private async optionGroupsFor(offeringId: string): Promise<OptionGroupInput[]> {
    const groups = await this.db
      .select()
      .from(offeringOptionGroups)
      .where(eq(offeringOptionGroups.offeringId, offeringId))
      .orderBy(offeringOptionGroups.sortOrder, offeringOptionGroups.name);
    if (groups.length === 0) return [];
    const options = await this.db
      .select()
      .from(offeringOptions)
      .where(inArray(offeringOptions.groupId, groups.map((group) => group.id)))
      .orderBy(offeringOptions.sortOrder, offeringOptions.name);
    return groups.map((group) => ({
      name: group.name,
      kind: group.selection === "MULTI" ? "MULTI" : "SINGLE",
      options: options
        .filter((option) => option.groupId === group.id && option.active)
        .map((option) => ({ name: option.name, priceDeltaVnd: option.priceDeltaVnd })),
    }));
  }

  private async replaceOptionGroups(offeringId: string, groups: OptionGroupInput[] | undefined) {
    if (groups === undefined) return;
    await this.db.delete(offeringOptionGroups).where(eq(offeringOptionGroups.offeringId, offeringId));
    for (const [index, group] of groups.entries()) {
      const [created] = await this.db
        .insert(offeringOptionGroups)
        .values({
          offeringId,
          name: group.name.trim(),
          selection: group.kind,
          required: group.kind === "SINGLE",
          minSelect: group.kind === "SINGLE" ? 1 : 0,
          maxSelect: group.kind === "SINGLE" ? 1 : group.options.length,
          sortOrder: index,
        })
        .returning();
      if (!created || group.options.length === 0) continue;
      await this.db.insert(offeringOptions).values(
        group.options.map((option, optionIndex) => ({
          groupId: created.id,
          name: option.name.trim(),
          priceDeltaVnd: option.priceDeltaVnd,
          sortOrder: optionIndex,
        })),
      );
    }
  }

  private async assertFoodCategory(categoryId?: string | null) {
    if (!categoryId) return;
    const [row] = await this.db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.id, categoryId),
          eq(productCategories.type, "FOOD"),
          eq(productCategories.active, true),
        ),
      )
      .limit(1);
    if (!row) throw new PickiError("VALIDATION_ERROR", "Nhóm món không hợp lệ");
  }

  private async upsertLocationPrice(locationId: string, offeringId: string, priceVnd: number) {
    const [loc] = await this.db
      .select({ id: offeringPrices.id })
      .from(offeringPrices)
      .where(
        and(eq(offeringPrices.offeringId, offeringId), eq(offeringPrices.providerLocationId, locationId)),
      )
      .limit(1);
    if (loc) {
      await this.db.update(offeringPrices).set({ amountVnd: priceVnd }).where(eq(offeringPrices.id, loc.id));
      return;
    }
    await this.db.insert(offeringPrices).values({
      offeringId,
      providerLocationId: locationId,
      amountVnd: priceVnd,
    });
  }

  private async priceMap(locationId: string, offeringIds: string[]) {
    const map = new Map<string, number>();
    if (offeringIds.length === 0) return map;
    const prices = await this.db
      .select()
      .from(offeringPrices)
      .where(inArray(offeringPrices.offeringId, offeringIds));
    for (const price of prices) {
      if (price.providerLocationId && price.providerLocationId !== locationId) continue;
      const current = map.get(price.offeringId);
      if (current == null || price.providerLocationId === locationId) {
        map.set(price.offeringId, price.amountVnd);
      }
    }
    return map;
  }

  private async capabilityMap(providerId: string) {
    const rows = await this.db
      .select({ capability: providerCapabilities.capability, enabled: providerCapabilities.enabled })
      .from(providerCapabilities)
      .where(eq(providerCapabilities.providerId, providerId));
    const map: Record<string, boolean> = {};
    for (const row of rows) map[row.capability] = row.enabled;
    return map;
  }

  private async assertOffering(providerId: string, offeringId: string) {
    const [row] = await this.db
      .select({ id: offerings.id })
      .from(offerings)
      .where(and(eq(offerings.id, offeringId), eq(offerings.providerId, providerId)))
      .limit(1);
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy món");
  }

  private async uniqueSlug(providerId: string, base: string) {
    for (let i = 0; i < 5; i += 1) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const [hit] = await this.db
        .select({ id: offerings.id })
        .from(offerings)
        .where(and(eq(offerings.providerId, providerId), eq(offerings.slug, slug)))
        .limit(1);
      if (!hit) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private async assertFoodLocation(userId: string, locationId: string) {
    const [location] = await this.db
      .select({
        providerId: providerLocations.providerId,
        commerceModel: providers.commerceModel,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!location) throw new PickiError("NOT_FOUND", "Location not found");
    if (location.commerceModel !== "FOOD_SERVICE") {
      throw new PickiError("FORBIDDEN", "Màn này chỉ dành cho quán ăn");
    }
    const members = await this.db
      .select()
      .from(providerMembers)
      .where(and(eq(providerMembers.userId, userId), eq(providerMembers.providerId, location.providerId)));
    const allowed = members.some((m) => !m.providerLocationId || m.providerLocationId === locationId);
    if (!allowed) throw new PickiError("FORBIDDEN", "Not a staff member for this location");
    return location;
  }
}
