# Picki agent notes

Greenfield implementation. **No legacy code or database to preserve.**

Before any architectural decision, read:

1. `docs/PICKI_MASTER_SPEC.md` (OFFICIAL — highest priority)
2. `docs/DECISIONS.md`
3. Every file in `.cursor/rules/`

Master Spec wins on conflict. Implement **the current sprint only**.

**Sprint 20–31 (current):** Full pilot loop — Provider/Runner/Payments + Food delivery fee (ADR-041). **S11–S18:** discovery, search/map, favorites. **S22–S23:** route + lobby handoff. **S24–S26:** Customer/Provider/Runner Web/PWA. **S27:** Admin/Ops Web — dashboard, orders, zones, cancel + audit_logs + audit UI. **S28:** Picki Chat + WEB notifications (outbox worker) + desktop alerts (Runner). **P2 pilot hardening:** committed — customer cancel, auto find-runner, PayOS/push adapters, E2E (`pnpm pilot:e2e`). **S29 Laundry:** full `PICKUP_AND_RETURN` — seed `pnpm --filter @picki/db seed:laundry`; demo **Giặt Kim Văn** (`giat-kim-van`). **E2E:** `pnpm pilot:laundry:e2e`. **S30 Home Services:** `LISTING` + `LIVE_STATUS` + `CONTACT` — thợ đến nhà (`PROVIDER_VISIT`); service requests; seed `npm run db:seed:home`; demo **Điện Nước Kim Văn** (`dien-nuoc-kim-van`). **Current — S31 Beauty Live Wait:** `LISTING` + `LIVE_STATUS` + `QUEUE_STATUS` + `CONTACT` — khách tới tiệm (`CUSTOMER_VISIT`); `estimated_wait_minutes` trên live status; **visit intents** — khách chọn dịch vụ + báo ETA, tiệm theo dõi tab **Sắp tới** (không đặt lịch); seed `npm run db:seed:beauty`; demo **Tóc Minh Kim Văn** (`toc-minh-kim-van`).

**Demo accounts (seed:ops):** Food provider `0908888001` (Cơm Tấm) · Laundry provider `0908888004` (Giặt Kim Văn) · Home service `0908888005` (Điện Nước) · Beauty `0908888006` (Tóc Minh) · Runner `0908888002` · Admin `0908888003` · Customer `0901234567`

**Pilot Zone 1:** Kim Văn – Kim Lũ (`kim-van-kim-lu`) — see `docs/pilot/KIM_VAN_KIM_LU.md`. **E2E:** `pnpm pilot:e2e` · manual checklist `docs/pilot/FOOD_E2E_CHECKLIST.md`.

**Delivery fees (ADR-041):** Food — khách trả **một lần** hàng + ship → merchant Provider; provider tự trả runner theo stats ngày. Laundry — khách **0 phí ship**; lấy đồ = staff tiệm; giao = staff hoặc runner do tiệm gọi (phí tiệm chịu).

Key model reminders:

- Concentrated Demand – Distributed Supply; apartment/residential = Demand Core
- Zone Planner ≠ Zone Engine; human approves boundaries; versioned polygons
- Membership ≠ Serviceability; shared service areas between adjacent Zones
- Provider ≠ Provider Location; cloning for new locations
- Live Availability is first-class; compose capabilities for new verticals
- Web/PWA-first; Zalo later; integer VND; Picki UUIDs; adapter pattern

Proposed tech stack (ADR-P01–P08) needs review before Sprint 1 lock-in.
