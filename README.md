# Picki

**Picki — Hôm nay quanh bạn có gì?**

Zone-based local-life utility platform. **Concentrated Demand – Distributed Supply.**

Food is the launch vertical, not the platform. **V1 is Web/PWA-first** (Customer, Provider, Runner, Admin). Zalo Mini App and native clients come later on the same API and database.

## Status

**Sprint 20–25 (pilot loop)** — Customer order → Provider xử lý → Runner giao → Payments stub. Zone: **Kim Văn – Kim Lũ**.

## Source of truth

| Document                                                     | Role                                           |
| ------------------------------------------------------------ | ---------------------------------------------- |
| [docs/PICKI_MASTER_SPEC.md](docs/PICKI_MASTER_SPEC.md)       | **OFFICIAL** — wins on conflict                |
| [docs/DECISIONS.md](docs/DECISIONS.md)                       | ADR-001–040 (accepted) + proposed tech ADRs    |
| [docs/SPRINT0_ARCHITECTURE.md](docs/SPRINT0_ARCHITECTURE.md) | Sprint 0 architecture answers (§152)           |
| [docs/PICKI_MVP_SCOPE.md](docs/PICKI_MVP_SCOPE.md)           | Sprints, pilot, DO NOT BUILD, acceptance tests |

Child specs: Zone, Zone Planner, Provider, Food, Services, Fulfillment, API, Database, Security, Integrations, State Machines.

## Repository

```
apps/api          Picki Backend (modular monolith)
apps/web          Customer Web demo (login, discover, join)
packages/shared   Types, errors, adapter ports, VND helpers
packages/db       Drizzle schema + migrations (S1+)
docs/             Specifications
infra/            Local Postgres+PostGIS (docker compose)
```

## Commands

Requires Node 22+ and pnpm 9.

```bash
pnpm install
pnpm verify      # typecheck + lint + test + format
pnpm typecheck
pnpm test
```

Local database:

```bash
pnpm dev:setup        # lần đầu: Docker Postgres + migrate + seed KVL
pnpm dev              # chạy API (:3000) + Web (:3001) cùng lúc
pnpm db:integration   # smoke test PostGIS + schema
pnpm api:e2e          # auth flow tests
```

**Local demo (3 bước):**

1. Bật **Docker Desktop** (chờ icon xanh)
2. `pnpm dev:setup` — chỉ cần chạy lại khi reset DB
3. `bash scripts/start-local.sh` — giữ terminal mở

| App | URL | OTP demo |
|-----|-----|----------|
| Customer | /login | 0901234567 |
| Provider | /provider/login | 0908888001 |
| Runner | /runner/login | 0908888002 |

Luồng: Customer đặt món → Provider nhận/nấu/sẵn sàng → Runner giao → DELIVERED.

## Constitution

Always-on rules in `.cursor/rules/picki-core.mdc`.

Before architectural work, read Master Spec, DECISIONS, and all Cursor rules.
