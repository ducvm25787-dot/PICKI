import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { offerings } from "./catalog.js";
import { providerLocations, providers } from "./providers.js";

export const familyDinnerProviderSettings = pgTable("family_dinner_provider_settings", {
  providerLocationId: uuid("provider_location_id")
    .primaryKey()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  cutoffTime: time("cutoff_time").notNull().default("16:00"),
  dailyCapacity: integer("daily_capacity"),
  procurementBufferPercent: integer("procurement_buffer_percent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const familyDinnerDeliveryWindows = pgTable("family_dinner_delivery_windows", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  serviceDate: date("service_date").notNull(),
  startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull(),
  capacity: integer("capacity").notNull(),
  remainingCapacity: integer("remaining_capacity").notNull(),
  status: text("status").notNull().default("OPEN"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const familyDinnerDailyMenus = pgTable("family_dinner_daily_menus", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  serviceDate: date("service_date").notNull(),
  status: text("status").notNull().default("DRAFT"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  /** When menu was cloned from a prior day (auto-copy or Chép menu). */
  copiedFromServiceDate: date("copied_from_service_date"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ingredientMaster = pgTable("ingredient_master", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category"),
  baseUnit: text("base_unit").notNull().default("g"),
  procurementClass: text("procurement_class").notNull().default("SAME_DAY"),
  defaultYieldPercent: numeric("default_yield_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("100"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerRecipes = pgTable("provider_recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerRecipeVersions = pgTable("provider_recipe_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => providerRecipes.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  portionLabel: text("portion_label").notNull().default("1 family portion"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeVersionId: uuid("recipe_version_id")
    .notNull()
    .references(() => providerRecipeVersions.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientMaster.id, { onDelete: "restrict" }),
  quantityNet: numeric("quantity_net", { precision: 12, scale: 3 }).notNull(),
  unit: text("unit").notNull().default("g"),
  yieldPercentOverride: numeric("yield_percent_override", { precision: 5, scale: 2 }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const familyDinnerMenuItems = pgTable("family_dinner_menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  dailyMenuId: uuid("daily_menu_id")
    .notNull()
    .references(() => familyDinnerDailyMenus.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priceVnd: integer("price_vnd").notNull(),
  capacity: integer("capacity"),
  remainingCapacity: integer("remaining_capacity"),
  recipeVersionId: uuid("recipe_version_id").references(() => providerRecipeVersions.id, {
    onDelete: "set null",
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("ACTIVE"),
  /** Provider tick: khách được chọn Tự nấu (cùng giá). Chỉ MAIN/SIDE/VEGETABLE/SOUP. */
  allowsSelfCook: boolean("allows_self_cook").notNull().default(false),
  /** Gắn catalog khi trùng tên trong cùng provider. Null = món chỉ có trên menu ngày. */
  offeringId: uuid("offering_id").references(() => offerings.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const familyDinnerProductionBatches = pgTable(
  "family_dinner_production_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerLocationId: uuid("provider_location_id")
      .notNull()
      .references(() => providerLocations.id, { onDelete: "cascade" }),
    serviceDate: date("service_date").notNull(),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true, mode: "date" }),
    status: text("status").notNull().default("PLANNING"),
    confirmedOrders: integer("confirmed_orders").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("fd_batch_location_date_uidx").on(t.providerLocationId, t.serviceDate)],
);

export const familyDinnerProductionItemTotals = pgTable(
  "family_dinner_production_item_totals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionBatchId: uuid("production_batch_id")
      .notNull()
      .references(() => familyDinnerProductionBatches.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => familyDinnerMenuItems.id, { onDelete: "restrict" }),
    recipeVersionId: uuid("recipe_version_id").references(() => providerRecipeVersions.id, {
      onDelete: "set null",
    }),
    confirmedQuantity: integer("confirmed_quantity").notNull().default(0),
    lateQuantity: integer("late_quantity").notNull().default(0),
    preparedQuantity: integer("prepared_quantity").notNull().default(0),
    remainingQuantity: integer("remaining_quantity").notNull().default(0),
  },
  (t) => [unique("fd_item_totals_batch_item_uidx").on(t.productionBatchId, t.menuItemId)],
);

export const familyDinnerInventorySnapshots = pgTable(
  "family_dinner_inventory_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerLocationId: uuid("provider_location_id")
      .notNull()
      .references(() => providerLocations.id, { onDelete: "cascade" }),
    serviceDate: date("service_date").notNull(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredientMaster.id, { onDelete: "restrict" }),
    onHandQuantity: numeric("on_hand_quantity", { precision: 12, scale: 3 }).notNull().default("0"),
    unit: text("unit").notNull().default("g"),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("fd_inventory_location_date_ingredient_uidx").on(
      t.providerLocationId,
      t.serviceDate,
      t.ingredientId,
    ),
  ],
);

export const lateDinnerOffers = pgTable("late_dinner_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  serviceDate: date("service_date").notNull(),
  productionBatchId: uuid("production_batch_id").references(() => familyDinnerProductionBatches.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  priceVnd: integer("price_vnd").notNull(),
  capacity: integer("capacity").notNull(),
  remainingCapacity: integer("remaining_capacity").notNull(),
  etaMinutes: integer("eta_minutes").notNull().default(25),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const lateDinnerOfferItems = pgTable("late_dinner_offer_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  offerId: uuid("offer_id")
    .notNull()
    .references(() => lateDinnerOffers.id, { onDelete: "cascade" }),
  menuItemId: uuid("menu_item_id")
    .notNull()
    .references(() => familyDinnerMenuItems.id, { onDelete: "restrict" }),
  quantityPerTray: integer("quantity_per_tray").notNull().default(1),
});
