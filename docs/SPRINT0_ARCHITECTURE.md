# Sprint 0 Architecture

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Answers Master Spec §152 items 1–15 for greenfield Sprint 0. **Proposed** technology choices are marked pending review (`DECISIONS.md` ADR-P01–P08).

Sprint 0 delivers **no product features**—repository, docs, rules, tooling, interfaces, CI only (§151).

---

## 1. Proposed repository structure

```
/Volumes/DATA/PICKI/
├── apps/
│   ├── api/                    # NestJS modular monolith (runtime S2+)
│   │   ├── src/
│   │   │   ├── modules/        # Domain modules (auth, zones, orders, …)
│   │   │   ├── integrations/   # Vendor adapters (identity, geo, pay, notify)
│   │   │   ├── shared/         # Errors, guards, pipes, utils
│   │   │   └── jobs/           # Outbox worker entry
│   │   └── test/
│   └── web/                    # Next.js Web/PWA (runtime S24+)
│       └── src/
├── packages/
│   ├── db/                     # Drizzle schema + migrations
│   ├── shared-types/           # Cross-app TypeScript types
│   └── eslint-config/          # Shared ESLint config
├── docs/                       # Specs (this folder)
├── .cursor/rules/              # Cursor project rules
├── .github/workflows/          # CI
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

**S0 scaffolds** structure and placeholder packages; NestJS/Next apps may contain minimal health-check stubs only.

---

## 2. Technology stack

| Layer              | Choice                     | Status   | Notes                      |
| ------------------ | -------------------------- | -------- | -------------------------- |
| Language           | TypeScript (strict)        | PROPOSED | ADR-P01                    |
| Package manager    | pnpm workspaces            | PROPOSED | ADR-P01                    |
| Backend            | NestJS modular monolith    | PROPOSED | ADR-P02; ships S2+         |
| Frontend           | Next.js Web/PWA            | PROPOSED | ADR-P03; ships S24+        |
| Database           | PostgreSQL 16 + PostGIS    | PROPOSED | ADR-P04                    |
| ORM                | Drizzle ORM                | PROPOSED | ADR-P04                    |
| Migrations         | Drizzle Kit + SQL review   | PROPOSED | ADR-P04                    |
| Hosting DB/Storage | Picki-controlled Supabase  | PROPOSED | ADR-P05; not Supabase Auth |
| Tests              | Vitest                     | PROPOSED | ADR-P06                    |
| Lint               | ESLint (typescript-eslint) | PROPOSED | ADR-P06                    |
| CI                 | GitHub Actions             | PROPOSED | ADR-P06                    |

**Accepted architecture** (not negotiable without ADR change): modular monolith, Web/PWA-first, client-independent API, adapter pattern, integer VND, UUID IDs (ADR-001–040).

---

## 3. Dependency choices

### Root / workspace

- `pnpm` 9.x
- `typescript` 5.x (strict)
- `@types/node`
- `eslint`, `prettier` (if adopted)
- `vitest`

### `apps/api` (S2+ runtime; S0 declares in package.json)

- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`
- `drizzle-orm`, `postgres` (or `pg`)
- `zod` or `class-validator` for DTO validation (pick one in review)
- `pino` or Nest logger for structured logs

### `packages/db`

- `drizzle-orm`, `drizzle-kit`
- `postgis` types via custom geometry columns

### `apps/web` (S24+; S0 placeholder)

- `next` 14+, `react` 18+

### Explicitly avoid in S0

- Vendor SDKs in core modules
- Microservice frameworks
- Supabase Auth as identity
- ORMs that hide SQL migrations from review

---

## 4. PostgreSQL / PostGIS strategy

| Topic            | Decision                                                            |
| ---------------- | ------------------------------------------------------------------- |
| Version          | PostgreSQL 16                                                       |
| Extensions       | `postgis`, `pgcrypto` (UUID gen if not app-side), `citext` optional |
| Hosting          | Picki-controlled Supabase project (ADR-P05)                         |
| Geometry         | `geometry(MultiPolygon, 4326)` for zone boundaries; GiST indexes    |
| Connection       | API connects via connection pooler (Supabase pooler or PgBouncer)   |
| Local dev        | Docker Compose Postgres 16 + PostGIS OR Supabase local CLI          |
| Schema authority | Picki repo migrations in `packages/db`—not Supabase dashboard DDL   |
| Multi-Zone       | Single shared database—all Zones in one DB (acceptance test #38)    |

S1 enables PostGIS and first migration tooling. Zone polygon tables land S4–S5.

---

## 5. Database migration strategy

1. **Drizzle schema** in `packages/db/src/schema/` defines tables incrementally per sprint
2. **Drizzle Kit** generates SQL migrations to `packages/db/migrations/`
3. **Human review** of every generated SQL file before commit
4. **Apply** via CI and deploy script: `pnpm db:migrate`
5. **Seed** scripts optional per sprint (`packages/db/seeds/`)—pilot data only in later sprints
6. **Rollback** manual SQL down migrations for critical changes; prefer forward-fix in production
7. **No** create-all-tables-in-S1—follow sprint table in `PICKI_DATABASE_SPEC.md`

Naming: `YYYYMMDDHHMMSS_description.sql`

---

## 6. Authentication strategy

| Principle                         | Implementation                                    |
| --------------------------------- | ------------------------------------------------- |
| Business identity                 | Picki `users.id` UUID                             |
| External login                    | Identity adapters → `user_identities`             |
| Session                           | Picki-issued HTTP-only cookie or Bearer token     |
| Not used                          | Supabase Auth as business PK                      |
| Web-first                         | `PHONE` OTP or magic link in S2                   |
| Zalo                              | Adapter port in S2; Mini App client S24+ / Later  |
| Progressive customer verification | Low friction join; stronger for VERIFIED/resident |
| Provider/Runner                   | Stronger verification gates before ACTIVE         |

Auth module: `apps/api/src/modules/auth/` + `integrations/identity/*`

S0: document strategy + port interfaces; no login UI.

---

## 7. Security / RLS strategy

| Layer             | S0 / V1 approach                                                                       |
| ----------------- | -------------------------------------------------------------------------------------- |
| API authorization | Primary enforcement—NestJS guards + service ownership checks                           |
| RBAC              | `user_roles` with optional scope (provider_id, zone_id)                                |
| RLS               | Defense-in-depth on Supabase if anon/service roles exist; policies added S2+ per table |
| Secrets           | `.env` local; GitHub Secrets + Supabase vault in CI/prod                               |
| Webhooks          | Signature verification in adapter before state change                                  |
| Audit             | `audit_logs` for sensitive admin actions                                               |
| PII / GPS         | No continuous tracking; minimal retention (§137)                                       |
| Rate limit        | Middleware on auth, search, webhooks                                                   |

S0: security spec documented; RLS policies stubbed in migration comments where helpful.

---

## 8. Testing strategy

| Level         | Tool                            | S0 scope                               |
| ------------- | ------------------------------- | -------------------------------------- |
| Unit          | Vitest                          | Sample test + config                   |
| Integration   | Vitest + test Postgres (Docker) | DB connection smoke S1                 |
| API e2e       | Vitest + supertest              | Health endpoint S2                     |
| Authorization | Vitest matrix                   | Per-module from S2                     |
| Concurrency   | Integration tests               | Payment webhook, route claim from S19+ |
| CI            | GitHub Actions                  | lint + typecheck + test on PR          |

Coverage target: meaningful paths over percentage gates. Prioritize auth, orders, payments, fulfillment concurrency.

---

## 9. Integration adapter architecture

Ports defined in S0; noop adapters allow core development without vendors.

```
Domain Module
  └── injects IdentityPort | PaymentPort | NotificationPort | GeoPort
        └── Adapter implementation in integrations/
```

| Port               | S0 deliverable       | First real adapter |
| ------------------ | -------------------- | ------------------ |
| `IdentityPort`     | Interface + noop     | S2 Phone           |
| `PaymentPort`      | Interface + noop     | S20                |
| `NotificationPort` | Interface + noop/log | S28                |
| `GeoPort`          | Interface + stub     | S3                 |

Rules:

- Core modules import ports only—never `@vendor/sdk`
- Vendor HTTP routes only under `/v1/integrations/{vendor}/*`
- See `PICKI_INTEGRATIONS_SPEC.md`

---

## 10. Background jobs / outbox strategy

| Component    | V1 approach                                                    |
| ------------ | -------------------------------------------------------------- |
| Outbox table | `outbox_events` in same Postgres transaction as business write |
| Worker       | In-process cron/queue poller in `apps/api/src/jobs/` (ADR-P08) |
| Retry        | Exponential backoff; `retry_count`, `last_error` on outbox row |
| Idempotency  | Consumer checks processed state before side effect             |
| Future       | Extract worker to separate deploy when outbox volume requires  |

S0: outbox interface + worker skeleton; no business events yet.

Side effects via outbox: notifications, analytics, async geo (non-blocking).

---

## 11. Logging / observability strategy

| Concern | Approach                                                |
| ------- | ------------------------------------------------------- |
| Logs    | Structured JSON (pino); request_id correlation          |
| Levels  | error, warn, info, debug                                |
| PII     | Never log full addresses, phone, tokens                 |
| Metrics | Request latency, error rate—Prometheus-compatible later |
| Tracing | OpenTelemetry optional post-pilot                       |
| Alerts  | CI failure, error spike, payment webhook failures       |

S0: logger interface + request ID middleware stub.

---

## 12. Environment / deployment strategy

| Environment  | Purpose                                              |
| ------------ | ---------------------------------------------------- |
| `local`      | Developer machine; Docker Postgres or Supabase local |
| `staging`    | Pre-pilot integration testing                        |
| `production` | Pilot Zone 1                                         |

**Env vars** (`.env.example` in S0):

```
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=    # server only
STORAGE_BUCKET=
SESSION_SECRET=
NODE_ENV=
API_PORT=
```

**Deploy V1 target:** single API deploy (Railway, Fly.io, VPS, or Supabase Edge Functions **not** for monolith—full Node process preferred for NestJS).

Web static/SSR deploy: Vercel or similar from S24.

S0: document env contract; no production deploy required.

---

## 13. Assumptions

1. Greenfield—no legacy code or data migration
2. Pilot starts with **one Zone** in Hanoi metro (exact anchor TBD by Zone Planner)
3. Vietnamese locale primary; i18n structure deferred
4. Integer VND sufficient for all money—no fractional currency
5. Single region deployment acceptable for pilot; horizontal API scaling via stateless replicas later
6. Operators use Admin Web for Zone Planner approval—no auto-publish
7. Picki OA available before Zalo notification adapter goes live; noop until then
8. Payment adapter starts with one provider (e.g. VietQR or ZaloPay)—vendor TBD at S20
9. Map/geo vendor TBD at S3 (Mapbox, Google, or OSRM self-host)—behind GeoPort
10. Household feature optional for Food order in pilot

---

## 14. Ambiguities / conflicts found

| #   | Topic                        | Notes                                                                                                                               | Resolution proposal                                                                                                           |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | ADR-002 vs ADR-003 wording   | Master Spec lists Web/PWA-first (002) then Zalo later (003). Older docs sometimes called Zalo "Client #1" for **distribution** only | Treat Web/PWA as first **implemented** client; Zalo as first **distribution channel** when added—both consistent with ADR-003 |
| 2   | Provider verification states | Master Spec §44 simpler than older DRAFT→IDENTITY_PENDING chain                                                                     | Use §44 states in `PICKI_STATE_MACHINES.md`; sub-states in `verification_tasks` if needed                                     |
| 3   | Exact REST paths             | §131 lists groups not full paths                                                                                                    | Prefix `/v1`; refine paths in OpenAPI during S2—boundaries fixed                                                              |
| 4   | Supabase vs pure Postgres    | Master Spec says Picki owns DB; S0 proposes Supabase hosting                                                                        | Supabase = managed Postgres + Storage only; Picki owns schema and auth                                                        |
| 5   | Give Away terminal state     | §120 classified vs §90 GIVEN                                                                                                        | Reuse classified machine; map `COMPLETED` ↔ `GIVEN` for give-away listing type                                                |
| 6   | Sprint order dependency      | S3 Geo before S4 Planner vs table order                                                                                             | Keep S3→S4; Planner needs PostGIS primitives                                                                                  |

**No unresolved conflict** with Master Spec product architecture identified. Tech stack items are PROPOSED pending review.

---

## 15. Sprint 0 implementation plan

### Week 0 — Docs & rules (this deliverable)

- [x] `docs/PICKI_MASTER_SPEC.md` (existing)
- [x] All child spec docs per §149
- [x] `docs/DECISIONS.md` ADR-001–040 + proposed tech ADRs
- [x] `docs/SPRINT0_ARCHITECTURE.md` (this file)
- [ ] `.cursor/rules/picki-core.mdc` + scope rules (if not present)

### Week 1 — Repository scaffold

- [ ] Init pnpm workspace + `tsconfig.base.json` strict
- [ ] Create `packages/shared-types`, `packages/eslint-config`
- [ ] Create `packages/db` with Drizzle config + empty migration
- [ ] Create `apps/api` NestJS skeleton (health module only)
- [ ] Create `apps/web` placeholder (optional hello page)
- [ ] `.env.example` + README setup instructions

### Week 1 — Tooling

- [ ] ESLint + Prettier (if used) wired across packages
- [ ] Vitest root config + one passing smoke test
- [ ] GitHub Actions: `lint`, `typecheck`, `test`
- [ ] Docker Compose for local Postgres 16 + PostGIS (optional Supabase CLI doc)

### Week 1 — Architecture interfaces (no product logic)

- [ ] Shared error model (`AppError`, HTTP mapping)
- [ ] Port interfaces: `IdentityPort`, `PaymentPort`, `NotificationPort`, `GeoPort`
- [ ] Noop/stub adapters registered in DI
- [ ] Outbox worker skeleton (poll loop, no events)
- [ ] Logger + request ID middleware stub

### Explicit S0 exclusions

Do **not** implement: Food, Provider UI, Zone UI, Orders, Payments, Zone Planner UI, real auth, real geo vendor, RLS policies beyond stubs.

### Exit criteria

- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` pass in CI
- [ ] `pnpm db:migrate` runs against local Postgres (empty or extensions only)
- [ ] All §153 acceptance test questions answerable YES at architecture level
- [ ] Architecture review completed for ADR-P01–P08 before S1 merge to main

---

## Related docs

| Doc                          | Purpose                        |
| ---------------------------- | ------------------------------ |
| `PICKI_MVP_SCOPE.md`         | S0–S34 sprint table            |
| `DECISIONS.md`               | Official + proposed ADRs       |
| `PICKI_INTEGRATIONS_SPEC.md` | Adapter details                |
| `PICKI_SECURITY_SPEC.md`     | Auth, RBAC, privacy            |
| `PICKI_DATABASE_SPEC.md`     | Domain map; incremental tables |
