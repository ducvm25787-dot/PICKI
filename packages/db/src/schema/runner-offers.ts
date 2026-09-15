import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { orders } from "./orders.js";
import { users } from "./identity.js";

export const runnerOrderOffers = pgTable("runner_order_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  runnerUserId: uuid("runner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  wave: integer("wave").notNull(),
  status: text("status").notNull().default("PENDING"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
