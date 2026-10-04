import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { offerings } from "./catalog.js";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { orders } from "./orders.js";
import { providerLocations, providers } from "./providers.js";
import { zones } from "./zones.js";

export const providerCampaigns = pgTable("provider_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  campaignType: text("campaign_type").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull().default("DRAFT"),
  approvalStatus: text("approval_status").notNull().default("NONE"),
  contentRevision: integer("content_revision").notNull().default(1),
  approvedRevision: integer("approved_revision"),
  approvedSnapshot: jsonb("approved_snapshot"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
  rejectionReason: text("rejection_reason"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerCampaignTargets = pgTable(
  "provider_campaign_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => providerCampaigns.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
  },
  (table) => [unique("provider_campaign_targets_uidx").on(table.campaignId, table.targetType, table.targetId)],
);

export const providerCampaignItems = pgTable("provider_campaign_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => providerCampaigns.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => offerings.id, { onDelete: "restrict" }),
  campaignPrice: integer("campaign_price"),
  discountAmount: integer("discount_amount"),
  discountPercent: integer("discount_percent"),
  heroPriority: integer("hero_priority"),
  metadata: jsonb("metadata").notNull().default({}),
});

export const providerCampaignSuppressions = pgTable("provider_campaign_suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => providerCampaigns.id, { onDelete: "cascade" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "cascade" }),
  providerLocationId: uuid("provider_location_id").references(() => providerLocations.id, { onDelete: "cascade" }),
  suppressedBy: uuid("suppressed_by").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  liftedAt: timestamp("lifted_at", { withTimezone: true, mode: "date" }),
});

export const orderCampaignAttributions = pgTable(
  "order_campaign_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => providerCampaigns.id, { onDelete: "restrict" }),
    providerLocationId: uuid("provider_location_id").references(() => providerLocations.id, {
      onDelete: "set null",
    }),
    offeringId: uuid("offering_id").references(() => offerings.id, { onDelete: "set null" }),
    attributionKind: text("attribution_kind").notNull(),
    campaignPrice: integer("campaign_price"),
    discountAmount: integer("discount_amount"),
    discountPercent: integer("discount_percent"),
    snapshot: jsonb("snapshot").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    unique("order_campaign_attributions_uidx").on(
      table.orderId,
      table.campaignId,
      table.offeringId,
      table.attributionKind,
    ),
  ],
);
