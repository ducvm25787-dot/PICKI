# Picki Security Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Covers Master Spec §121–123 and privacy §137.

---

## Mandatory controls (§121)

| Area                | Requirement                                                        |
| ------------------- | ------------------------------------------------------------------ |
| Authentication      | Picki-issued sessions bound to `users.id` UUID                     |
| Authorization       | RBAC + scope checks on every mutating/read-sensitive route         |
| RLS                 | Row Level Security where appropriate (especially direct DB access) |
| Least privilege     | Roles scoped to provider/zone where applicable                     |
| Rate limiting       | Auth, webhooks, public search/map endpoints                        |
| Audit logging       | All sensitive admin actions → `audit_logs`                         |
| Secret management   | Env/secrets store—never commit credentials                         |
| Assets              | Signed/private URLs for verification docs and private media        |
| PII protection      | Minimize collection; encrypt at rest where required                |
| Backup & recovery   | Postgres backups; tested restore procedure                         |
| Input validation    | Schema validation on all API inputs                                |
| Authorization tests | Automated tests for ownership/role matrix                          |

---

## Identity (§31, ADR-004, ADR-005)

| Rule            | Detail                                                                |
| --------------- | --------------------------------------------------------------------- |
| Business PK     | `users.id` UUID only                                                  |
| External IDs    | `user_identities` mapping table—never business PK                     |
| Zalo UID        | Must never be Picki primary key or `user_id`                          |
| Sessions        | Picki-issued (opaque or signed JWT)—**not** Supabase Auth as identity |
| Customer trust  | Progressive verification (ADR-019)                                    |
| Provider/Runner | Stronger verification before public / work                            |

Supported identity providers: `PHONE`, `EMAIL`, `ZALO`, `APPLE`, `GOOGLE`

---

## Multi-tenant authorization (§122)

**Never rely on frontend alone.**

Examples:

| Route                          | Check                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| `GET /orders/:id`              | Customer owns order OR provider location staff OR assigned runner OR admin |
| `GET /providers/:id/locations` | Public read vs owner write separated                                       |
| Runner customer PII            | Only for **assigned** active deliveries                                    |
| Provider data                  | Only transactions for their locations                                      |
| Zone Agent                     | Only assigned operational tasks/data                                       |
| Admin                          | `ZONE_ADMIN`, `SUPER_ADMIN`, `SUPPORT`, `FINANCE` as appropriate           |

Serviceability ≠ authorization: JOINED to a Zone does not grant provider-admin or cross-tenant access.

### RBAC roles (§32)

```
CUSTOMER, PROVIDER_OWNER, PROVIDER_MANAGER, PROVIDER_STAFF,
RUNNER, ZONE_AGENT, ZONE_OPERATOR, SUPPORT, FINANCE,
ZONE_ADMIN, SUPER_ADMIN
```

One user may hold multiple roles. Scope via `user_roles.scope_type` / `scope_id` (provider_id, zone_id).

---

## Concurrency & idempotency (§123)

Must test and implement safe handling for:

- Two runners accepting same route
- Two users buying last capacity
- Duplicate payment webhook
- Duplicate order submission
- Capacity reservation races
- Concurrent provider status updates
- Concurrent queue/wait updates
- Refund duplication

**Use:** DB transactions, unique constraints, atomic updates, locks where justified, idempotency keys.

---

## Payments security

- `Idempotency-Key` header on order create
- Webhook: verify adapter signature before trust
- Persist events with `provider_event_id UNIQUE`
- Integer VND only—reject float money
- Refunds require authorized role + audit log

---

## Admin sensitive actions (§135)

**Must** write `audit_logs`:

- Refunds, forced cancels, order reassignments
- Provider/Zone suspend, pause, override
- Zone boundary approve/reject
- Capacity/config changes
- Manual verification overrides
- User PII access by support (if implemented)

Audit fields: actor, action, target, before/after snapshot, timestamp, reason.

---

## Privacy & GPS (§137, ADR-015)

**Do not collect** simply because possible.

**Do not store:**

- Continuous user movement
- Minute-by-minute GPS trails
- Unnecessary behavioral telemetry

**Do store:** business-relevant events (order placed, join completed, delivery completed).

**GPS allowed for:** discover Zone, join Zone, "around here", anti-fraud when necessary.

**GPS must not:** auto-change `active_zone_id`; track customers continuously.

Aggregate analytics where possible ("12 households ordered this")—never expose private household identity (§92).

---

## Assets & evidence (ADR-038)

- Verification documents, provider images, classified photos → Picki storage
- Reference via `assets` table
- Signed URLs with expiry for private docs
- External marketplace CDN URLs are not master records

---

## Messaging (ADR-037)

- Picki DB owns `conversations` / `messages` transcript
- Notification adapters may send "new message" alerts only
- Do not delegate history to Zalo or push vendor

---

## RLS strategy (proposed)

| Layer         | Approach                                                         |
| ------------- | ---------------------------------------------------------------- |
| API (primary) | NestJS guards + service-layer ownership checks                   |
| Postgres RLS  | Supplement for defense-in-depth if Supabase direct access exists |
| Service role  | API uses service role; end-users never get unrestricted DB keys  |

Exact RLS policies defined per table in S2+; S0 documents intent only.

---

## Related docs

- `PICKI_API_SPEC.md` — client-independent routes
- `PICKI_INTEGRATIONS_SPEC.md` — adapter security for webhooks
- `DECISIONS.md` — ADR-004, ADR-005, ADR-019, ADR-037, ADR-038
- `PICKI_STATE_MACHINES.md` — server-controlled transitions
