import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { orders } from "./orders.js";
import { payments } from "./payments.js";
import { providerLocations, providers } from "./providers.js";
import { experienceCities } from "./experiences.js";
import { zones } from "./zones.js";
import { providerCampaigns } from "./campaigns.js";

export const commercialPolicies = pgTable("commercial_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  scopeType: text("scope_type").notNull(),
  scopeKey: text("scope_key").notNull().default(""),
  revenueModel: text("revenue_model").notNull(),
  subscriptionRequired: boolean("subscription_required").notNull().default(false),
  transactionFeeType: text("transaction_fee_type").notNull().default("NONE"),
  transactionFeeValue: integer("transaction_fee_value").notNull().default(0),
  transactionFeeBasis: text("transaction_fee_basis").notNull().default("MERCHANDISE_GMV"),
  policySource: text("policy_source").notNull().default("DEFAULT"),
  note: text("note"),
  contractRef: text("contract_ref"),
  version: integer("version").notNull().default(1),
  effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
});

export const providerSubscriptionPlans = pgTable("provider_subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  providerType: text("provider_type"),
  maxLocations: integer("max_locations"),
  maxMembers: integer("max_members"),
  featureFlags: jsonb("feature_flags").notNull().default({}),
  gracePeriodDays: integer("grace_period_days").notNull().default(7),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const providerSubscriptionPlanPrices = pgTable("provider_subscription_plan_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => providerSubscriptionPlans.id, { onDelete: "cascade" }),
  durationMonths: integer("duration_months").notNull(),
  priceVnd: integer("price_vnd").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const providerSubscriptions = pgTable("provider_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "restrict" }),
  planId: uuid("plan_id")
    .notNull()
    .references(() => providerSubscriptionPlans.id, { onDelete: "restrict" }),
  planPriceId: uuid("plan_price_id")
    .notNull()
    .references(() => providerSubscriptionPlanPrices.id, { onDelete: "restrict" }),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull(),
  autoRenewRequested: boolean("auto_renew_requested").notNull().default(false),
  gracePeriodDays: integer("grace_period_days").notNull().default(7),
  nextBillingAt: timestamp("next_billing_at", { withTimezone: true, mode: "date" }),
  lastInvoiceId: uuid("last_invoice_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerBillingInvoices = pgTable("provider_billing_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => providerSubscriptions.id, { onDelete: "restrict" }),
  invoiceType: text("invoice_type").notNull().default("SUBSCRIPTION"),
  amountVnd: integer("amount_vnd").notNull(),
  status: text("status").notNull().default("OPEN"),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  billingSnapshot: jsonb("billing_snapshot").notNull().default({}),
  createdAt: createdAt(),
});

export const billingPayments = pgTable("billing_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .unique()
    .references(() => providerBillingInvoices.id, { onDelete: "restrict" }),
  amountVnd: integer("amount_vnd").notNull(),
  status: text("status").notNull().default("PENDING"),
  providerKind: text("provider_kind").notNull().default("DEV_STUB"),
  providerRef: text("provider_ref"),
  payosOrderCode: bigint("payos_order_code", { mode: "number" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const billingPaymentEvents = pgTable("billing_payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingPaymentId: uuid("billing_payment_id")
    .notNull()
    .references(() => billingPayments.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: createdAt(),
});

export const financialLedgerEntries = pgTable("financial_ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryType: text("entry_type").notNull(),
  status: text("status").notNull().default("POSTED"),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
  providerId: uuid("provider_id").references(() => providers.id, { onDelete: "restrict" }),
  providerLocationId: uuid("provider_location_id").references(() => providerLocations.id, {
    onDelete: "restrict",
  }),
  zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "restrict" }),
  cityId: uuid("city_id").references(() => experienceCities.id, { onDelete: "restrict" }),
  campaignId: uuid("campaign_id").references(() => providerCampaigns.id, { onDelete: "restrict" }),
  runnerUserId: uuid("runner_user_id").references(() => users.id, { onDelete: "restrict" }),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
  billingPaymentId: uuid("billing_payment_id").references(() => billingPayments.id, {
    onDelete: "restrict",
  }),
  amountVnd: integer("amount_vnd").notNull(),
  currency: text("currency").notNull().default("VND"),
  fromParty: text("from_party").notNull(),
  toParty: text("to_party").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  reversalOfId: uuid("reversal_of_id"),
  snapshot: jsonb("snapshot").notNull().default({}),
  createdAt: createdAt(),
});

export const settlements = pgTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyType: text("party_type").notNull(),
  partyId: uuid("party_id").notNull(),
  zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "restrict" }),
  cityId: uuid("city_id").references(() => experienceCities.id, { onDelete: "restrict" }),
  amountVnd: integer("amount_vnd").notNull(),
  direction: text("direction").notNull(),
  status: text("status").notNull().default("OPEN"),
  reference: text("reference"),
  note: text("note"),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const providerCommercialStandings = pgTable("provider_commercial_standings", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "restrict" }),
  standing: text("standing").notNull(),
  reason: text("reason").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const providerSubscriptionNotices = pgTable("provider_subscription_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => providerSubscriptions.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: createdAt(),
});
