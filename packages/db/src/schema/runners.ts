import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  cccdNumber: text("cccd_number"),
  cccdFullName: text("cccd_full_name"),
  cccdFrontFile: text("cccd_front_file"),
  cccdBackFile: text("cccd_back_file"),
  vehiclePlate: text("vehicle_plate"),
  vehicleDocFile: text("vehicle_doc_file"),
  payoutBankName: text("payout_bank_name"),
  payoutAccountNumber: text("payout_account_number"),
  payoutAccountHolder: text("payout_account_holder"),
  credentialsUpdatedAt: timestamp("credentials_updated_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
});

export const runnerPresence = pgTable("runner_presence", {
  runnerId: uuid("runner_id")
    .primaryKey()
    .references(() => runners.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("OFFLINE"),
  updatedAt: updatedAt(),
});
