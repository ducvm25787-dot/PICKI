import { boolean, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { orders } from "./orders.js";
import { providers } from "./providers.js";
import { zones } from "./zones.js";

export const deliveryPromotions = pgTable("delivery_promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sponsorType: text("sponsor_type").notNull(),
  subsidyMode: text("subsidy_mode").notNull(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  providerId: uuid("provider_id").references(() => providers.id, { onDelete: "restrict" }),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
  minimumOrderVnd: integer("minimum_order_vnd").notNull().default(0),
  maxSubsidyPerOrderVnd: integer("max_subsidy_per_order_vnd").notNull(),
  providerShareVnd: integer("provider_share_vnd").notNull().default(0),
  pickeeShareVnd: integer("pickee_share_vnd").notNull().default(0),
  usageLimitTotal: integer("usage_limit_total"),
  usageLimitPerUser: integer("usage_limit_per_user"),
  usageLimitPerUserPerDay: integer("usage_limit_per_user_per_day"),
  budgetVnd: integer("budget_vnd"),
  budgetSpentVnd: integer("budget_spent_vnd").notNull().default(0),
  /** Comma-separated fulfillment modes. Default campaign is PICKEE_RUNNER only. */
  eligibleModes: text("eligible_modes").notNull().default("PICKEE_RUNNER"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const deliveryPromotionRedemptions = pgTable(
  "delivery_promotion_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => deliveryPromotions.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerUserId: uuid("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    providerSubsidyVnd: integer("provider_subsidy_vnd").notNull().default(0),
    pickeeSubsidyVnd: integer("pickee_subsidy_vnd").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique("delivery_promotion_redemptions_order_uidx").on(t.orderId)],
);
