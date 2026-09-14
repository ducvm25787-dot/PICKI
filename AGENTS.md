# Picki agent notes

Greenfield implementation. **No legacy code or database to preserve.**

Before any architectural decision, read:

1. `docs/PICKI_MASTER_SPEC.md` (OFFICIAL — highest priority)
2. `docs/DECISIONS.md`
3. Every file in `.cursor/rules/`

Master Spec wins on conflict. Implement **the current sprint only**.

**Sprint 20–29 (current):** Full pilot loop — Provider/Runner/Payments. **S11–S18:** discovery, search/map, favorites. **S22–S23:** route + lobby handoff. **S24–S26:** Customer/Provider/Runner Web/PWA. **S27:** Admin/Ops Web — dashboard, orders, zones, cancel + audit_logs + audit UI. **S28:** Picki Chat + WEB notifications (outbox worker) + desktop alerts (Runner). **P2 pilot hardening:** committed — customer cancel, auto find-runner, PayOS/push adapters, E2E (`pnpm pilot:e2e`). **Current — S29 Laundry:** inbound `PICKUP_AND_RETURN` (customer → tiệm); seed `pnpm --filter @picki/db seed:laundry`; demo tiệm **Giặt Kim Văn** (`giat-kim-van`). **Next:** return leg + laundry E2E.

**Demo accounts (seed:ops):** Provider `0908888001` · Runner `0908888002` · Admin `0908888003` · Customer `0901234567`

**Pilot Zone 1:** Kim Văn – Kim Lũ (`kim-van-kim-lu`) — see `docs/pilot/KIM_VAN_KIM_LU.md`. **E2E:** `pnpm pilot:e2e` · manual checklist `docs/pilot/FOOD_E2E_CHECKLIST.md`.

Key model reminders:

- Concentrated Demand – Distributed Supply; apartment/residential = Demand Core
- Zone Planner ≠ Zone Engine; human approves boundaries; versioned polygons
- Membership ≠ Serviceability; shared service areas between adjacent Zones
- Provider ≠ Provider Location; cloning for new locations
- Live Availability is first-class; compose capabilities for new verticals
- Web/PWA-first; Zalo later; integer VND; Picki UUIDs; adapter pattern

Proposed tech stack (ADR-P01–P08) needs review before Sprint 1 lock-in.
