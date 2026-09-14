# Picki agent notes

Greenfield implementation. **No legacy code or database to preserve.**

Before any architectural decision, read:

1. `docs/PICKI_MASTER_SPEC.md` (OFFICIAL — highest priority)
2. `docs/DECISIONS.md`
3. Every file in `.cursor/rules/`

Master Spec wins on conflict. Implement **the current sprint only**.

**Sprint 20–29 (current):** Full pilot loop — Provider/Runner/Payments. **S11–S18:** discovery, search/map, favorites. **S22–S23:** route + lobby handoff. **S24–S26:** Customer/Provider/Runner Web/PWA. **S27:** Admin/Ops Web — dashboard, orders, zones, cancel + audit_logs. **S28:** Picki Chat (order threads) + WEB notifications via outbox worker.

**Demo accounts (seed:ops):** Provider `0908888001` · Runner `0908888002` · Admin `0908888003` · Customer `0901234567`

**Pilot Zone 1:** Kim Văn – Kim Lũ (`kim-van-kim-lu`) — see `docs/pilot/KIM_VAN_KIM_LU.md`.

Key model reminders:

- Concentrated Demand – Distributed Supply; apartment/residential = Demand Core
- Zone Planner ≠ Zone Engine; human approves boundaries; versioned polygons
- Membership ≠ Serviceability; shared service areas between adjacent Zones
- Provider ≠ Provider Location; cloning for new locations
- Live Availability is first-class; compose capabilities for new verticals
- Web/PWA-first; Zalo later; integer VND; Picki UUIDs; adapter pattern

Proposed tech stack (ADR-P01–P08) needs review before Sprint 1 lock-in.
