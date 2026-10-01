import { boolean, date, integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { offerings } from "./catalog.js";
import { providerLocations } from "./providers.js";

export const breakfastPreorderProviderSettings = pgTable("breakfast_preorder_provider_settings", {
  providerLocationId: uuid("provider_location_id")
    .primaryKey()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  cutoffTime: time("cutoff_time").notNull().default("23:30"),
  openFromTime: time("open_from_time").notNull().default("20:00"),
  dailyCapacity: integer("daily_capacity"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const breakfastPreorderDeliveryWindows = pgTable("breakfast_preorder_delivery_windows", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  serviceDate: date("service_date").notNull(),
  startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull(),
  capacity: integer("capacity").notNull(),
  remainingCapacity: integer("remaining_capacity").notNull(),
  /** BREAKFAST | LUNCH. Slot belongs to that daypart only. */
  daypart: text("daypart").notNull().default("BREAKFAST"),
  status: text("status").notNull().default("OPEN"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const breakfastPreorderDailyMenus = pgTable("breakfast_preorder_daily_menus", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  serviceDate: date("service_date").notNull(),
  /** BREAKFAST | LUNCH. One menu per location, date, and daypart. */
  daypart: text("daypart").notNull().default("BREAKFAST"),
  status: text("status").notNull().default("DRAFT"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  copiedFromServiceDate: date("copied_from_service_date"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const breakfastPreorderMenuItems = pgTable("breakfast_preorder_menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  dailyMenuId: uuid("daily_menu_id")
    .notNull()
    .references(() => breakfastPreorderDailyMenus.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => offerings.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  priceVnd: integer("price_vnd").notNull(),
  capacity: integer("capacity"),
  remainingCapacity: integer("remaining_capacity"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
