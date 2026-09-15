import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { providerLocations } from "./providers.js";

/**
 * Nhắc tái khám — chỉ lưu khách nào, phòng khám nào, mốc giờ nào.
 * Không có trường lý do/triệu chứng: dữ liệu sức khỏe không nằm trong Picki (§86).
 */
export const healthFollowupReminders = pgTable("health_followup_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  customerUserId: uuid("customer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("SCHEDULED"),
  remindAt: timestamp("remind_at", { withTimezone: true, mode: "date" }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
