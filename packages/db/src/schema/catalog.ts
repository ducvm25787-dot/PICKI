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
import { providerLocations, providers } from "./providers.js";

export const productFamilies = pgTable("product_families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const offerings = pgTable("offerings", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  offeringType: text("offering_type").notNull().default("PRODUCT"),
  status: text("status").notNull().default("ACTIVE"),
  sortOrder: integer("sort_order").notNull().default(0),
  foodMoment: text("food_moment"),
  fulfillmentMode: text("fulfillment_mode"),
  educationSubject: text("education_subject"),
  educationGrade: text("education_grade"),
  paymentPolicy: text("payment_policy"),
  /** True only for draft beer poured at the shop. Default false for every other offering. */
  alcoholRestricted: boolean("alcohol_restricted").notNull().default(false),
  estimatedDays: integer("estimated_days"),
  categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  imageUrl: text("image_url"),
  unit: text("unit").notNull().default("phần"),
  prepTimeMinutes: integer("prep_time_minutes"),
  readyToEatEnabled: boolean("ready_to_eat_enabled").notNull().default(true),
  selfCookEnabled: boolean("self_cook_enabled").notNull().default(false),
  selfCookInstruction: text("self_cook_instruction"),
  /** V2 hooks. V1 UI không nhập. */
  productFamilyId: uuid("product_family_id").references(() => productFamilies.id, {
    onDelete: "set null",
  }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  skuCode: text("sku_code"),
  barcode: text("barcode"),
  packSize: text("pack_size"),
  netWeight: numeric("net_weight", { precision: 12, scale: 3 }),
  salePriceVnd: integer("sale_price_vnd"),
  externalSource: text("external_source"),
  externalId: text("external_id"),
  externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true, mode: "date" }),
  syncStatus: text("sync_status"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const offeringPrices = pgTable("offering_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  offeringId: uuid("offering_id")
    .notNull()
    .references(() => offerings.id, { onDelete: "cascade" }),
  providerLocationId: uuid("provider_location_id").references(() => providerLocations.id, {
    onDelete: "cascade",
  }),
  amountVnd: integer("amount_vnd").notNull(),
  pricingKind: text("pricing_kind").notNull().default("FIXED"),
  createdAt: createdAt(),
});

/** Catalog là dài hạn. Hôm nay bán gì là một dòng theo ngày. available_qty null = không giới hạn. */
export const productDailyAvailability = pgTable(
  "product_daily_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    providerLocationId: uuid("provider_location_id")
      .notNull()
      .references(() => providerLocations.id, { onDelete: "cascade" }),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    serviceDate: date("service_date").notNull(),
    status: text("status").notNull().default("AVAILABLE"),
    availableQty: integer("available_qty"),
    reservedQty: integer("reserved_qty").notNull().default(0),
    soldQty: integer("sold_qty").notNull().default(0),
    priceOverrideVnd: integer("price_override_vnd"),
    featured: boolean("featured").notNull().default(false),
    availableFrom: time("available_from"),
    availableUntil: time("available_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("product_daily_availability_location_offering_date_uidx").on(
      t.providerLocationId,
      t.offeringId,
      t.serviceDate,
    ),
  ],
);

export const offeringStockReservations = pgTable(
  "offering_stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    providerLocationId: uuid("provider_location_id")
      .notNull()
      .references(() => providerLocations.id, { onDelete: "cascade" }),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    serviceDate: date("service_date").notNull(),
    quantity: integer("quantity").notNull(),
    status: text("status").notNull().default("RESERVED"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("offering_stock_reservations_order_offering_uidx").on(t.orderId, t.offeringId)],
);

/** Size / loại (chọn một) hoặc món thêm (chọn nhiều). Giá cộng vào giá món. */
export const offeringOptionGroups = pgTable("offering_option_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  offeringId: uuid("offering_id")
    .notNull()
    .references(() => offerings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  selection: text("selection").notNull().default("SINGLE"),
  required: boolean("required").notNull().default(false),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const offeringOptions = pgTable("offering_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => offeringOptionGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceDeltaVnd: integer("price_delta_vnd").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
