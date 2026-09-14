# @picki/db

Picki database schema, SQL migrations, and client.

## Sprint 1

- PostGIS + pgcrypto extensions
- `audit_logs`, `outbox_events` infrastructure
- Custom migrator (`picki_schema_migrations`)
- Pilot Zone 1 metadata: Kim Văn – Kim Lũ (seed file; SQL seed in S5)

Domain tables (users, zones, providers, …) are added **incrementally** per `docs/PICKI_DATABASE_SPEC.md`.

## Local setup

```bash
# From repo root
pnpm db:up
pnpm db:migrate
pnpm db:integration   # requires Postgres running
```

## Commands

| Command                 | Description                  |
| ----------------------- | ---------------------------- |
| `pnpm migrate`          | Apply pending SQL migrations |
| `pnpm test:integration` | PostGIS + schema smoke tests |

Migrations live in `migrations/*.sql` — review every file before commit.
