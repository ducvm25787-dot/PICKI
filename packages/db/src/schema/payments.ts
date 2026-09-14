import { integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { orders } from "./orders.js";

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "restrict" }),
  amountVnd: integer("amount_vnd").notNull(),
  status: text("status").notNull().default("PENDING"),
  providerKind: text("provider_kind").notNull().default("DEV_STUB"),
  providerRef: text("provider_ref"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: createdAt(),
});
