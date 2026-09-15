import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { providerLocations, providers } from "./providers.js";

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
  estimatedDays: integer("estimated_days"),
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
