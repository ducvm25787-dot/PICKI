import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { zones } from "./zones.js";

export const runners = pgTable("runners", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
});

export const runnerPresence = pgTable("runner_presence", {
  runnerId: uuid("runner_id")
    .primaryKey()
    .references(() => runners.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("OFFLINE"),
  updatedAt: updatedAt(),
});
