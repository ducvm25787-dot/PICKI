# Picki Integrations Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

All external vendors are **adapters**. Core modules contain **no vendor-specific business logic** (Master Spec §4, ADR-035–036).

---

## Adapter pattern

```
Core module
  → Port (interface in domain layer)
  → Adapter (src/integrations/{vendor}/*)
```

HTTP surface for vendors:

```
/v1/integrations/{vendor}/*
```

Only integration routes carry vendor names. Core routes remain vendor-neutral (`PICKI_API_SPEC.md`).

---

## Identity integrations (ADR-005)

```
External account
  → Identity Adapter
  → user_identities (provider, external_user_id)
  → users.id (Picki UUID)
```

| Provider          | V1 notes                             |
| ----------------- | ------------------------------------ |
| `PHONE`           | Web/PWA-first login                  |
| `EMAIL`           | Optional magic link                  |
| `ZALO`            | Mini App later; adapter port from S2 |
| `APPLE`, `GOOGLE` | Future native                        |

**Rules:**

- Web-first may ship `PHONE`/`EMAIL` before Zalo
- Removing Zalo deletes `user_identities` rows—not users, orders, or providers
- Supabase Auth is **not** business identity (ADR-P05)

---

## Notification integrations (§110, ADR-036)

```
Business Event (in domain transaction)
  → outbox_events (same DB transaction)
  → Worker / Notification Service
  → Channel Adapter
```

**Channels:** `WEB`, `ZALO`, `PUSH`, `SMS`, `EMAIL`

**Rules:**

- Order/Service modules **never** call Zalo (or any vendor) directly
- Picki OA is central when Zalo is used—shops/runners/customers do not need separate OA for platform notifications
- V1 may use `noop`/log adapter until OA wired
- Adapters are replaceable (architecture acceptance #35)

---

## Outbox (§111, ADR-P08)

Critical pattern:

```
BEGIN TRANSACTION
  → commit business state
  → insert outbox_events row
COMMIT
  → worker polls/processes outbox
  → notification / analytics / side effects
END
```

**Do not** block user HTTP response waiting for notification delivery or analytics.

`outbox_events` fields (illustrative): `id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload`, `created_at`, `processed_at`, `retry_count`, `last_error`

Worker: in-process or same-deploy job runner V1; extract when load requires.

---

## Payment integrations (§104, ADR-035)

```
Transaction (orders module)
  → Payment Service
  → Payment Adapter
  → Vendor (ZaloPay, VietQR, etc.)
```

**Persist:**

- `payments`
- `payment_events` (idempotent: `provider_event_id UNIQUE`)
- `payment_provider_transactions`
- `refunds`

**Rules:**

- Do not hard-code vendor in `orders` module
- Webhooks under `/v1/integrations/{payment}/webhooks`
- Verify signatures before state transitions
- Vendor replaceable without schema redesign

---

## Geo abstraction (§112)

**GeoService** port capabilities:

| Capability                               | Owner        |
| ---------------------------------------- | ------------ |
| Geocoding                                | Adapter      |
| Reverse geocoding                        | Adapter      |
| ETA / routing                            | Adapter      |
| Navigation link                          | Adapter      |
| Map rendering (client)                   | Adapter SDK  |
| Zone polygons                            | **Picki DB** |
| Buildings / access points / Picki Points | **Picki DB** |

Travel-time analysis for Zone Planner uses adapter routing/isochrones—not fixed radius (ADR-010).

Map vendor replaceable (architecture acceptance #34).

---

## Messaging vs notifications (§108–109, ADR-037)

Two primary user communication paths:

```
PICKI CHAT    — transcript in Picki DB
ZALO          — optional external contact channel
```

| Concern             | Owner                                                    |
| ------------------- | -------------------------------------------------------- |
| Chat history        | `conversations`, `conversation_participants`, `messages` |
| "New message" alert | Notification adapter                                     |
| Provider preference | May prefer Zalo for small shops—both allowed             |

Picki DB is **source of truth** for Picki Chat. Do not require providers to abandon Zalo.

---

## Storage (§113, ADR-038)

Picki-controlled storage (proposed: Supabase Storage):

| Asset type                 | Storage                      |
| -------------------------- | ---------------------------- |
| Provider / offering images | Picki bucket                 |
| Avatars                    | Picki bucket                 |
| Verification documents     | Private bucket + signed URLs |
| Classified photos          | Picki bucket                 |

`assets` table: `asset_id`, `storage_key`, `mime_type`, `metadata`, `owner_type`, `owner_id`

Do not hotlink Grab/Shopee/Google CDN as master.

---

## Realtime (§124, ADR-039)

Realtime adapters (websocket/SSE) for **narrow** subscriptions only:

- Customer → own order updates
- Runner → assigned route
- Provider → own incoming orders
- Viewer → single provider live status

Zone-wide discovery uses HTTP + cache—not broadcast realtime.

---

## Integration module layout (proposed)

```
apps/api/src/integrations/
├── identity/
│   ├── identity.port.ts
│   ├── phone.adapter.ts
│   └── zalo.adapter.ts
├── payments/
│   ├── payment.port.ts
│   └── noop.adapter.ts
├── notifications/
│   ├── notification.port.ts
│   └── noop.adapter.ts
└── geo/
    ├── geo.port.ts
    └── mapbox.adapter.ts   (example)
```

S0: define ports + noop/stub adapters; wire real adapters per sprint.

---

## Related docs

- `PICKI_API_SPEC.md` — `/integrations/*` routes
- `PICKI_SECURITY_SPEC.md` — webhook verification, secrets
- `DECISIONS.md` — ADR-035, ADR-036, ADR-037, ADR-P08
- `SPRINT0_ARCHITECTURE.md` — adapter architecture baseline
