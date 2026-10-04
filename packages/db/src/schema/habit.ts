import { boolean, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { experienceCities } from "./experiences.js";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { providerLocations } from "./providers.js";
import { zones } from "./zones.js";

/** Admin-curated face of the home context banner. Max 5 per meal window, enforced in the API. */
export const homeHeroImages = pgTable("home_hero_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  contextId: text("context_id").notNull(),
  city: text("city")
    .notNull()
    .default("Hanoi")
    .references(() => experienceCities.code),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

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
  promoPriceVnd: integer("promo_price_vnd"),
  suggestedSurface: text("suggested_surface"),
  approvedSurface: text("approved_surface"),
  ctaLabel: text("cta_label"),
  ctaHref: text("cta_href"),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One local post can be approved in one Zone and still pending in another. */
export const providerDailyUpdateZoneTargets = pgTable(
  "provider_daily_update_zone_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    updateId: uuid("update_id")
      .notNull()
      .references(() => providerDailyUpdates.id, { onDelete: "cascade" }),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    reviewStatus: text("review_status").notNull().default("PENDING_REVIEW"),
    approvedSurface: text("approved_surface"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [unique("pdu_zone_targets_uidx").on(t.updateId, t.zoneId)],
);

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
