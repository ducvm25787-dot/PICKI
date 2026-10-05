import { date, index, pgTable, text, time, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { zones } from "./zones.js";

/** Logistics grouping for multi-stall pickup. Not a zone_places.kind. */
export const marketClusters = pgTable(
  "market_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    clusterFormat: text("cluster_format").notNull(),
    /** FK to zone_places lives in SQL. Omitted here to keep the schema graph acyclic. */
    originZonePlaceId: uuid("origin_zone_place_id"),
    status: text("status").notNull().default("DRAFT"),
    preorderOrderCutoff: time("preorder_order_cutoff").notNull().default("22:00"),
    preorderSessionGraceEnd: time("preorder_session_grace_end").notNull().default("22:15"),
    preorderHardClose: time("preorder_hard_close").notNull().default("22:15"),
    customerCancelCutoff: time("customer_cancel_cutoff").notNull().default("23:00"),
    lastOnDemandOrderAt: time("last_on_demand_order_at").notNull().default("10:00"),
    deliveryServiceEnd: time("delivery_service_end").notNull().default("11:00"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("market_clusters_zone_slug_uidx").on(t.zoneId, t.slug),
    index("market_clusters_zone_status_idx").on(t.zoneId, t.status),
  ],
);

/** One basket is one cluster trip on one service date. DIRECT orders do not use this table. */
export const marketBaskets = pgTable(
  "market_baskets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerUserId: uuid("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "restrict" }),
    marketClusterId: uuid("market_cluster_id")
      .notNull()
      .references(() => marketClusters.id, { onDelete: "restrict" }),
    commerceContext: text("commerce_context").notNull().default("MARKET_TRIP"),
    serviceDate: date("service_date").notNull(),
    orderingMode: text("ordering_mode").notNull(),
    status: text("status").notNull().default("OPEN"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("market_baskets_customer_date_idx").on(t.customerUserId, t.serviceDate)],
);
