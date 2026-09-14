import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Sensitive admin/ops actions — actor FK added when `users` lands (S2). */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const outboxEventStatuses = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
] as const;

export type OutboxEventStatus = (typeof outboxEventStatuses)[number];

/** Transactional outbox — same Postgres, processed by API worker (ADR-P08). */
export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
});
