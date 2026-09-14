# Picki API Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Client-independent REST API. All future clients (Web/PWA, Zalo Mini App, native) call the same resources.

**Proposed prefix:** `/v1` (ADR-P07, pending review).

---

## Client-independence rules (§130)

### Wrong

```
/zalo/create-order
/zalo/providers
```

Vendor names must not appear in core business routes.

### Correct

```
/v1/orders
/v1/providers
/v1/zones
/v1/addresses
/v1/routes
```

### Vendor-specific only

```
/v1/integrations/{vendor}/*
```

Examples:

- `/v1/integrations/zalo/session` — OAuth / Mini App session exchange
- `/v1/integrations/{payment}/webhooks` — Payment webhooks
- `/v1/integrations/{notify}/callbacks` — Notification delivery receipts

Integration routes translate vendor payloads ↔ Picki domain models. Core modules never import vendor SDKs.

---

## API layer principles

| Principle      | Rule                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| Stateless      | API layer is stateless; session/token validated per request            |
| Picki identity | All authorized actions bind to `users.id` UUID                         |
| Server state   | Order/booking/request status transitions are server-controlled         |
| Idempotency    | `Idempotency-Key` header on order create and other critical writes     |
| Authorization  | Every resource access verifies ownership/role—never trust client alone |
| Money          | Integer VND in request/response payloads                               |

---

## API groups (§131)

Exact REST paths may be refined; **business boundaries must not move**.

| Group                        | Methods / routes (illustrative)                            | Purpose                                    |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `/auth`                      | POST login, logout, refresh                                | Session via identity adapters              |
| `/me`                        | GET, PATCH                                                 | Current user, roles, `active_zone_id`      |
| `/geo`                       | GET status; POST distance, contains, eta, geocode, reverse | PostGIS + geo adapter (S3)                 |
| `/zones`                     | GET list, GET `:id`, GET `:id/preview`                     | Zone info and visitor preview              |
| `/zones/discover`            | POST (lat/lng)                                             | GPS point-in-polygon discovery             |
| `/zones/:id/join`            | POST                                                       | Join with Level-1 address                  |
| `/zones/:id/leave`           | POST                                                       | Explicit leave (not GPS-triggered)         |
| `/addresses`                 | CRUD                                                       | User delivery addresses                    |
| `/households`                | CRUD, invite                                               | Household foundation (S7+)                 |
| `/discovery`                 | GET                                                        | Rule-based "hôm nay quanh bạn" feed        |
| `/search`                    | GET                                                        | Providers, offerings, categories           |
| `/map`                       | GET                                                        | Live map markers (viewport-bounded)        |
| `/providers`                 | GET, POST                                                  | Public browse + owner create               |
| `/providers/:id/locations`   | CRUD                                                       | Provider locations                         |
| `/providers/:id/live-status` | GET, PATCH                                                 | Live availability                          |
| `/catalog`                   | GET, POST, PATCH                                           | Master catalog management                  |
| `/offerings`                 | GET, POST, PATCH                                           | Offerings and options                      |
| `/orders`                    | POST, GET, PATCH transitions                               | Commerce orders                            |
| `/bookings`                  | CRUD                                                       | Scheduled bookings (later product)         |
| `/service-requests`          | CRUD                                                       | Service requests (later product)           |
| `/quotes`                    | CRUD                                                       | Quotes on requests                         |
| `/leads`                     | POST                                                       | Lead capture                               |
| `/classifieds`               | CRUD                                                       | Classified listings                        |
| `/payments`                  | POST intent, GET status                                    | Payment initiation/status                  |
| `/billing`                   | GET plans, subscriptions                                   | Provider billing (later)                   |
| `/runner`                    | GET/PATCH presence, GET assignments                        | Runner app                                 |
| `/routes`                    | GET, PATCH stop progress                                   | Fulfillment routes                         |
| `/messages`                  | CRUD conversations/messages                                | Picki Chat                                 |
| `/admin`                     | *                                                          | Ops: zones, providers, orders, users       |
| `/admin/zone-planner`        | *                                                          | Planner candidates, scores, approve/reject |

---

## Cross-cutting behaviors

### Authentication

- Picki-issued session/token bound to `users.id`
- External login resolves via identity adapter → `user_identities` → `users`
- Supabase Auth is **not** the business identity layer (ADR-P05)

### Pagination

- Cursor or offset pagination on list endpoints
- Map/search endpoints require viewport or Zone scope + limits

### Errors

- Consistent error envelope: `code`, `message`, `details?`
- No vendor error strings leaked to clients without mapping

### Realtime

- Narrow subscriptions only (ADR-039)
- Primary discovery via HTTP query/cache; websocket for order/route/live-status fragments

---

## Module alignment

Backend modules under `apps/api/src/modules/` mirror API groups. See `SPRINT0_ARCHITECTURE.md` and Master Spec §132.

Integrations live under `apps/api/src/integrations/`—never inside domain modules.

---

## Related docs

- `DECISIONS.md` — ADR-003, ADR-040, ADR-P07
- `PICKI_SECURITY_SPEC.md` — authorization rules per route class
- `PICKI_INTEGRATIONS_SPEC.md` — adapter contracts for `/integrations/*`
