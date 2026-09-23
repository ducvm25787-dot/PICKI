import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { providerLocations } from "./providers.js";

export const providerDailyUpdates = pgTable("provider_daily_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  updateType: text("update_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: uuid("linked_entity_id"),
  ctaLabel: text("cta_label"),
  ctaHref: text("cta_href"),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerLoyaltyPrograms = pgTable("provider_loyalty_programs", {
  providerLocationId: uuid("provider_location_id")
    .primaryKey()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  regularThreshold: integer("regular_threshold").notNull().default(5),
  vipThreshold: integer("vip_threshold").notNull().default(15),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerLoyaltyBenefits = pgTable("provider_loyalty_benefits", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  tier: text("tier").notNull(),
  benefitType: text("benefit_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  discountPercent: integer("discount_percent"),
  customText: text("custom_text"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
