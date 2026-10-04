import { boolean, doublePrecision, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { zones } from "./zones.js";

export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  brandName: text("brand_name").notNull(),
  providerType: text("provider_type").notNull(),
  /** FOOD_SERVICE | FRESH_MARKET | RETAIL_STORE. Null = vertical không thuộc commerce này. */
  commerceModel: text("commerce_model"),
  /** Goods taxonomy. Shop kind stays on provider_type. */
  primaryCategoryId: uuid("primary_category_id"),
  status: text("status").notNull().default("DRAFT"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerProfiles = pgTable("provider_profiles", {
  providerId: uuid("provider_id")
    .primaryKey()
    .references(() => providers.id, { onDelete: "cascade" }),
  tagline: text("tagline"),
  description: text("description"),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  licenseNumber: text("license_number"),
  licenseVerifiedAt: timestamp("license_verified_at", { withTimezone: true, mode: "date" }),
  updatedAt: updatedAt(),
});

export const providerLocations = pgTable("provider_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("DRAFT"),
  addressLine: text("address_line"),
  zonePlaceId: uuid("zone_place_id"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  pinVerifiedAt: timestamp("pin_verified_at", { withTimezone: true, mode: "date" }),
  pinVerifiedBy: uuid("pin_verified_by"),
  pinNote: text("pin_note"),
  /** Null = đã mở từ trước. Tương lai = sắp khai trương. Badge «Mới» tự hết sau 14 ngày. */
  opensAt: timestamp("opens_at", { withTimezone: true, mode: "date" }),
  /** UNVERIFIED | PENDING | VERIFIED | REJECTED. Separate from pin and license checks. */
  verificationStatus: text("verification_status").notNull().default("UNVERIFIED"),
  verificationNote: text("verification_note"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
  /** Opaque sticker token. Null until Ops issues one. Unique. Never logged. */
  verifiedQrToken: text("verified_qr_token").unique(),
  verifiedQrIssuedAt: timestamp("verified_qr_issued_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerZoneMemberships = pgTable("provider_zone_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
});

export const providerLiveStatus = pgTable("provider_live_status", {
  providerLocationId: uuid("provider_location_id")
    .primaryKey()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("OFFLINE"),
  message: text("message"),
  prepMinutes: integer("prep_minutes"),
  etaMinutes: integer("eta_minutes"),
  estimatedWaitMinutes: integer("estimated_wait_minutes"),
  updatedAt: updatedAt(),
});

/** Một quán, nhiều cách bán. Không suy ra từ provider_type. */
export const providerCapabilities = pgTable(
  "provider_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("provider_capabilities_provider_capability_uidx").on(t.providerId, t.capability)],
);
