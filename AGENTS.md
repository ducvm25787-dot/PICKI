# Picki agent notes

Greenfield implementation. **No legacy code or database to preserve.**

Before any architectural decision, read:

1. `docs/PICKI_MASTER_SPEC.md` (OFFICIAL — highest priority)
2. `docs/DECISIONS.md`
3. Every file in `.cursor/rules/`

Master Spec wins on conflict. Implement **the current sprint only**.

**Sprint 20–31 (current):** Full pilot loop — Provider/Runner/Payments + Food delivery fee (ADR-041). **S11–S18:** discovery, search/map, favorites. **S22–S23:** route + lobby handoff. **S24–S26:** Customer/Provider/Runner Web/PWA. **S27:** Admin/Ops Web — dashboard, orders, zones, cancel + audit_logs + audit UI. **S28:** Picki Chat + WEB notifications (outbox worker) + desktop alerts (Runner). **P2 pilot hardening:** committed — customer cancel, auto find-runner, PayOS/push adapters, E2E (`pnpm pilot:e2e`). **S29 Laundry:** full `PICKUP_AND_RETURN` — seed `pnpm --filter @picki/db seed:laundry`; demo **Giặt Kim Văn** (`giat-kim-van`). **E2E:** `pnpm pilot:laundry:e2e`. **S30 Home Services:** `LISTING` + `LIVE_STATUS` + `CONTACT` — thợ đến nhà (`PROVIDER_VISIT`); service requests; seed `npm run db:seed:home`; demo **Điện Nước Kim Văn** (`dien-nuoc-kim-van`). **S31 Beauty Live Wait:** `LISTING` + `LIVE_STATUS` + `QUEUE_STATUS` + `CONTACT` — khách tới tiệm (`CUSTOMER_VISIT`); `estimated_wait_minutes` trên live status; **visit intents** — khách chọn dịch vụ + báo ETA, tiệm theo dõi tab **Sắp tới** (không đặt lịch); seed `npm run db:seed:beauty`; demo **Tóc Minh Kim Văn** (`toc-minh-kim-van`).

**S32 Education + Pet:** service requests cho học thử (`ONLINE`/`CUSTOMER_VISIT`) và dịch vụ pet tại nhà; seed `bash scripts/db-seed-education.sh`, `bash scripts/db-seed-pet.sh`. **S33 Classified + Give Away (GÓC KHU MÌNH):** tin thanh lý/cho tặng trong Zone + giữ chỗ + chat + ảnh (nén client, tối đa 3 ảnh < 300KB); seed `bash scripts/db-seed-classified.sh`. **S34 Auto Service:** rửa xe/bơm lốp dùng queue (`CUSTOMER_VISIT`), thay dầu/sửa chữa dùng `CONTACT_ONLY`; seed `bash scripts/db-seed-auto.sh`. **S35 Đặt sân:** service request kèm khung giờ mong muốn — không có booking engine/lịch sân (quyết định giữ lean); seed `bash scripts/db-seed-sports.sh`.

**Current — S42 Breakfast Preorder Phase 1 (ADR-047):** Sáng mai ăn gì? — lean FD-like preorder (READY_COOKED only, PREPAY, cutoff tối hôm trước). Seed `bash scripts/db-seed-breakfast.sh` — **Phở Gà Kim Văn** (`pho-ga-kim-van`), login `0908888015` (blank reset; `BF_SEED_DEMO=1` = menu + receiving). Scope: catalog offerings → daily breakfast menu.

**S41 Family Dinner Phase A–D (ADR-046):** Bữa tối ấm cúng — daily menu + meal builder + PREPAY; provider ops/dashboard + production lock; recipe/yield/inventory; late dinner atomic. Seed `bash scripts/db-seed-family-dinner.sh` — **Bếp Nhà Lan** (`bep-nha-lan`), login `0908888014` (blank reset; `FD_SEED_DEMO=1` = menu + receiving). **E2E:** `pnpm pilot:family-dinner:e2e` · checklist `docs/pilot/FAMILY_DINNER_E2E_CHECKLIST.md`. Scope: `docs/PICKI_FAMILY_DINNER_SPEC.md`.

**S40 Thất lạc / Pet Lost (ADR-045):** `LOST_FOUND` / `PET_LOST` trong GÓC KHU MÌNH — chat only, TTL 14 ngày, quota 2 ACTIVE · 5/tháng. Seed `bash scripts/db-seed-lost.sh`. Scope: `docs/S40_LOST_FOUND.md`.

**S39 Đi chợ (ADR-044):** `MINIMART` / `MARKET_VENDOR` / `RETAIL_STORE` = `LISTING` + `LIVE_STATUS` + `CONTACT` — discovery **ĐI CHỢ**; hỏi hàng + ảnh qua Picki Chat; **không** giỏ / giao runner. Seed `bash scripts/db-seed-minimart.sh` — demo **Tạp hóa Kim Văn** (`tap-hoa-kim-van`), login `0908888013`. Scope: `docs/S39_MARKET.md`.

**S38 Nhà thuốc (ADR-043):** `PHARMACY` lean — seed `bash scripts/db-seed-pharmacy.sh`, login `0908888012`.

**S37 Cho thuê / Ở ghép (ADR-042):** peer listing `CHO_THUE` / `O_GHEP`. Seed `bash scripts/db-seed-housing.sh`.

**S36 Phòng khám (Health):** visit intent + nhắc tái khám nhẹ. Seed `npm run db:seed:health`. Demo phòng khám `0908888009`–`011`.

**Demo accounts (seed:ops):** Food `0908888001` · Laundry `0908888004` · Home `0908888005` · Beauty `0908888006` · Auto `0908888007` · Sports `0908888008` · Phòng khám `0908888009`–`011` · Nhà thuốc `0908888012` · Tạp hóa `0908888013` · Bếp tối `0908888014` · Phở sáng `0908888015` · Runner `0908888002` · Admin `0908888003` · Customer `0901234567`

**Pilot Zone 1:** Kim Văn – Kim Lũ (`kim-van-kim-lu`) — see `docs/pilot/KIM_VAN_KIM_LU.md`. **E2E:** `pnpm pilot:e2e` · laundry `pnpm pilot:laundry:e2e` · FD `pnpm pilot:family-dinner:e2e`. **Pilot harden + PWA icons:** `docs/pilot/PILOT_HARDEN_CHECKLIST.md` · `bash scripts/generate-pwa-icons.sh`. **Visual V1:** `docs/pilot/VISUAL_V1.md`.

**Delivery fees (ADR-041):** Food — khách trả **một lần** hàng + ship → merchant Provider; provider tự trả runner theo stats ngày. Laundry — khách **0 phí ship**; lấy đồ = staff tiệm; giao = staff hoặc runner do tiệm gọi (phí tiệm chịu).

Key model reminders:

- Concentrated Demand – Distributed Supply; apartment/residential = Demand Core
- Zone Planner ≠ Zone Engine; human approves boundaries; versioned polygons
- Membership ≠ Serviceability; shared service areas between adjacent Zones
- Provider ≠ Provider Location; cloning for new locations
- Live Availability is first-class; compose capabilities for new verticals
- Web/PWA-first; Zalo later; integer VND; Picki UUIDs; adapter pattern

Proposed tech stack (ADR-P01–P08) needs review before Sprint 1 lock-in.
