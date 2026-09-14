# Picki Database Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

This file is the **official domain map** and **invariants** for V1. It is an implementation reference—not permission to create every table in Sprint 1.

---

## Sprint-by-sprint creation

Tables are introduced **incrementally by sprint**, not all at once in S1.

| Sprint | Typical tables                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------ |
| S1     | PostGIS/pgcrypto, migrator, `audit_logs`, `outbox_events`; pilot KVL metadata (no domain tables) |
| S2     | `users`, `user_identities`, `user_roles`, `auth_sessions`, `auth_otp_challenges`                 |
| S3     | PostGIS spatial helpers (`distanceMeters`, `containsPoint`, WKT utils) — no zone tables yet      |
| S4–S5  | Zone Planner + Zone Engine tables                                                                |
| S6     | `user_zone_memberships`, `addresses`, `user_addresses`, `address_verifications`                  |
| S7     | `households`, `household_members`, `household_invitations`                                       |
| S8–S9  | Provider domain                                                                                  |
| S10+   | Catalog, commerce, fulfillment, etc. per sprint table in `PICKI_MVP_SCOPE.md`                    |

**Reserved but not shipped in Food MVP:** `bookings`, `service_requests`, `quotes`, `leads`, `classified_listings`—schema may exist early; product launches later.

Normalize only when useful; document deviations from this map.

---

## Official domain map (§114)

### IDENTITY

| Table             | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `users`           | Picki user; `users.id` UUID is business principal                        |
| `user_identities` | External identity mappings (`PHONE`, `EMAIL`, `ZALO`, `APPLE`, `GOOGLE`) |
| `user_roles`      | RBAC; multi-role per user                                                |

### USER / ZONE

| Table                   | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `user_zone_memberships` | JOINED / VERIFIED / SUSPENDED / LEFT — not VISITOR |
| `addresses`             | Normalized address records                         |
| `user_addresses`        | User ↔ address links                               |
| `address_verifications` | Validation state history                           |
| `households`            | Household unit (optional for Food order)           |
| `household_members`     | Members of a household                             |
| `household_invitations` | Invite flow                                        |

### ZONE / GEO

| Table                          | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `zones`                        | Operational Zone                                 |
| `zone_cores`                   | Demand core anchor metadata                      |
| `zone_candidates`              | Planner candidates (pre-approval)                |
| `zone_boundaries`              | Current boundary pointer                         |
| `zone_boundary_versions`       | Versioned PostGIS polygons                       |
| `service_areas`                | Serviceability polygons per Zone/location policy |
| `shared_service_areas`         | Cross-Zone shared coverage                       |
| `zone_settings`                | Operational config (batching, SLA, etc.)         |
| `zone_operational_overrides`   | Field ops notes, barriers, access difficulty     |
| `zone_planner_layers`          | Planner input layers                             |
| `zone_planner_scores`          | Scoring breakdown                                |
| `zone_planner_recommendations` | Algorithm proposals pending approval             |

### PHYSICAL LOCATION

| Table           | Purpose                        |
| --------------- | ------------------------------ |
| `buildings`     | High-rise / compound buildings |
| `floors`        | Floor metadata                 |
| `apartments`    | Unit identifiers               |
| `access_points` | Lobby, gate, desk              |
| `picki_points`  | Collection/handoff points      |

### PROVIDER

| Table                             | Purpose                      |
| --------------------------------- | ---------------------------- |
| `providers`                       | Business/brand entity        |
| `provider_profiles`               | Display and brand fields     |
| `provider_locations`              | Physical operating locations |
| `provider_zone_memberships`       | Location ↔ Zone association  |
| `provider_members`                | Staff access to provider     |
| `provider_categories`             | Category tags                |
| `provider_live_status`            | Live availability state      |
| `provider_location_verifications` | Location-level verification  |
| `verification_requirements`       | Category/policy requirements |

### CATALOG

| Table                        | Purpose                                        |
| ---------------------------- | ---------------------------------------------- |
| `categories`                 | Taxonomy                                       |
| `catalogs`                   | Provider master catalog                        |
| `catalog_items`              | Catalog membership                             |
| `offerings`                  | Sellable/service items (generic—not Food-only) |
| `offering_prices`            | Price rows (integer VND)                       |
| `offering_availability`      | Schedules / capacity                           |
| `option_groups`              | Menu/service option groups                     |
| `options`                    | Selectable options                             |
| `signature_offerings`        | Highlighted items                              |
| `daily_specials`             | Date-bounded specials                          |
| `location_catalog_overrides` | Per-location price/availability/menu overrides |

### REVIEWS / RELATIONSHIP

| Table                    | Purpose                      |
| ------------------------ | ---------------------------- |
| `reviews`                | Location-level reviews       |
| `review_dimensions`      | Structured review facets     |
| `favorites`              | User favorites               |
| `provider_usage_summary` | Aggregates for trust/ranking |

### COMMERCE

| Table                  | Purpose                       |
| ---------------------- | ----------------------------- |
| `orders`               | Commerce orders               |
| `order_items`          | Line items with snapshots     |
| `order_status_history` | Server-controlled transitions |

### SERVICES (reserved)

| Table              | Purpose                   |
| ------------------ | ------------------------- |
| `service_requests` | Quote-based service flows |
| `quotes`           | Provider quotes           |
| `bookings`         | Scheduled bookings        |
| `leads`            | Lead capture              |

### CLASSIFIED

| Table                     | Purpose                        |
| ------------------------- | ------------------------------ |
| `classified_listings`     | Thanh lý / structured listings |
| `classified_reservations` | Reserve flow                   |

### RUNNER / FULFILLMENT

| Table                 | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `runners`             | Runner profile                                     |
| `runner_affiliations` | `INDEPENDENT`, `SHOP_STAFF`, `PREFERRED`           |
| `runner_presence`     | `OFFLINE`, `AVAILABLE`, `PICKING_UP`, `DELIVERING` |
| `runner_shifts`       | Shift windows                                      |
| `runner_earnings`     | Earnings ledger                                    |
| `deliveries`          | Delivery jobs                                      |
| `delivery_routes`     | Routes (multi-order)                               |
| `route_stops`         | Ordered stops                                      |
| `route_orders`        | Order ↔ route linkage                              |

### PAYMENTS

| Table                           | Purpose                 |
| ------------------------------- | ----------------------- |
| `payments`                      | Payment records         |
| `payment_events`                | Idempotent event log    |
| `payment_provider_transactions` | Vendor transaction refs |
| `refunds`                       | Refund records          |

### BILLING

| Table              | Purpose                  |
| ------------------ | ------------------------ |
| `billing_accounts` | Provider billing account |
| `plans`            | Subscription plans       |
| `plan_features`    | Feature flags per plan   |
| `subscriptions`    | Active subscriptions     |
| `invoices`         | Invoices                 |
| `invoice_items`    | Line items               |

### TRUST / FIELD OPS

| Table                  | Purpose               |
| ---------------------- | --------------------- |
| `zone_agents`          | Field agents          |
| `zone_tasks`           | Operational tasks     |
| `verification_tasks`   | Verification workflow |
| `verification_results` | Outcomes              |

### COMMUNICATION

| Table                       | Purpose                       |
| --------------------------- | ----------------------------- |
| `notifications`             | Notification records          |
| `notification_channels`     | Channel config                |
| `notification_preferences`  | User preferences              |
| `outbox_events`             | Transactional outbox          |
| `conversations`             | Chat threads                  |
| `conversation_participants` | Participants                  |
| `messages`                  | Message history (Picki-owned) |

### ASSETS

| Table    | Purpose                           |
| -------- | --------------------------------- |
| `assets` | Picki-controlled storage metadata |

### OPERATIONS

| Table           | Purpose                      |
| --------------- | ---------------------------- |
| `support_cases` | Support tickets              |
| `audit_logs`    | Sensitive admin action audit |

### ANALYTICS

| Table                    | Purpose                   |
| ------------------------ | ------------------------- |
| `analytics_events`       | Business events           |
| `unserved_demand_events` | Demand we could not serve |

---

## Database invariants (§115)

Mandatory for all implemented tables:

| Rule         | Detail                                                                      |
| ------------ | --------------------------------------------------------------------------- |
| IDs          | UUID internal primary keys                                                  |
| Time         | `timestamptz` for all timestamps                                            |
| Money        | Integer VND only—**never** floating-point money                             |
| Integrity    | Foreign keys; appropriate indexes and unique constraints                    |
| Deletes      | Soft delete only where justified                                            |
| Snapshots    | Order item, price, delivery fee, delivery address snapshots on transactions |
| State        | Server-controlled state machines                                            |
| Idempotency  | Critical operations (payments, order create) idempotent                     |
| Audit        | Sensitive admin operations audited                                          |
| Security     | RLS where appropriate (especially if direct DB access exists)               |
| External IDs | Never replace Picki UUIDs as business keys                                  |

### Membership note

`VISITOR` is **not** stored in `user_zone_memberships.status`. Visitors discover without a membership row.

### Payments note

Single `payments` table for checkout and billing references—not parallel incompatible schemas.

---

## Transaction snapshots (§116)

Historical transactions must **not** change when a provider edits catalog.

**`order_items` snapshot stores:**

- `name`
- `description` (where relevant)
- `unit_price` (integer VND)
- `selected_options`
- `provider_location_id` (and display fields as needed)

**`orders` snapshot stores:**

- Delivery address fields at time of order
- Delivery fee snapshot
- Price totals as committed at checkout

Snapshots are write-once at order creation / confirmation; later catalog edits do not retroactively alter past orders.

---

## Related docs

- `PICKI_STATE_MACHINES.md` — allowed status values and transitions
- `PICKI_SECURITY_SPEC.md` — RLS, RBAC, audit
- `PICKI_API_SPEC.md` — API boundaries per domain
