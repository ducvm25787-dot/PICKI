# Picki agent notes

Greenfield implementation. **No legacy code or database to preserve.**

Before any architectural decision, read:

1. `docs/PICKI_MASTER_SPEC.md` (OFFICIAL — highest priority)
2. `docs/DECISIONS.md`
3. Every file in `.cursor/rules/`

Master Spec wins on conflict. Implement **the current sprint only**.

**Sprint 20–31 (current):** Full pilot loop — Provider/Runner/Payments + Food delivery fee (ADR-041). **S11–S18:** discovery, search/map, favorites. **S22–S23:** route + lobby handoff. **S24–S26:** Customer/Provider/Runner Web/PWA. **S27:** Admin/Ops Web — dashboard, orders, zones, cancel + audit_logs + audit UI. **S28:** Picki Chat + WEB notifications (outbox worker) + desktop alerts (Runner). **P2 pilot hardening:** committed — customer cancel, auto find-runner, PayOS/push adapters, E2E (`pnpm pilot:e2e`). **S29 Laundry:** full `PICKUP_AND_RETURN` — seed `pnpm --filter @picki/db seed:laundry`; demo **Giặt Kim Văn** (`giat-kim-van`). **E2E:** `pnpm pilot:laundry:e2e`. **S30 Home Services:** `LISTING` + `LIVE_STATUS` + `CONTACT` — thợ đến nhà (`PROVIDER_VISIT`); service requests; seed `npm run db:seed:home`; demo **Điện Nước Kim Văn** (`dien-nuoc-kim-van`). **S31 Beauty Live Wait:** `LISTING` + `LIVE_STATUS` + `QUEUE_STATUS` + `CONTACT` — khách tới tiệm (`CUSTOMER_VISIT`); `estimated_wait_minutes` trên live status; **visit intents** — khách chọn dịch vụ + báo ETA, tiệm theo dõi tab **Sắp tới** (không đặt lịch); seed `npm run db:seed:beauty`; demo **Tóc Minh Kim Văn** (`toc-minh-kim-van`).

**S32 Education + Pet:** service requests cho học thử (`ONLINE`/`CUSTOMER_VISIT`) và dịch vụ pet tại nhà; seed `bash scripts/db-seed-education.sh`, `bash scripts/db-seed-pet.sh`. **S33 Classified + Give Away (GÓC KHU MÌNH):** tin thanh lý/cho tặng trong Zone + giữ chỗ + chat + ảnh (nén client, tối đa 3 ảnh < 300KB); seed `bash scripts/db-seed-classified.sh`. **S34 Auto Service:** rửa xe/bơm lốp dùng queue (`CUSTOMER_VISIT`), thay dầu/sửa chữa dùng `CONTACT_ONLY`; seed `bash scripts/db-seed-auto.sh`. **S35 Đặt sân:** service request kèm khung giờ mong muốn — không có booking engine/lịch sân (quyết định giữ lean); seed `bash scripts/db-seed-sports.sh`.

**Current — S36 Phòng khám (Health):** `LISTING` + `LIVE_STATUS` + `QUEUE_STATUS` + `CONTACT` + visit intent — 9 chuyên khoa là **offering**, không phải provider type riêng. Master Spec §86: **giấy phép hoạt động phải verify** (`provider_profiles.license_verified_at`) mới hiện trên discovery. **Không đi sâu** vào hẹn tái khám có lý do, lộ trình điều trị, khám thai theo tuần — dữ liệu sức khỏe không nằm trong Picki. **Nhắc tái khám dạng nhẹ:** `health_followup_reminders` chỉ lưu khách + mốc giờ; provider tab **Tái khám**; worker phát outbox `health.followup_due`. Seed `npm run db:seed:health` — demo **Đa khoa Kim Văn** (`da-khoa-kim-van`), **Nha khoa Kim Văn** (`nha-khoa-kim-van`), **Đông y Kim Văn** (`dong-y-kim-van`).

**Demo accounts (seed:ops):** Food provider `0908888001` (Cơm Tấm) · Laundry provider `0908888004` (Giặt Kim Văn) · Home service `0908888005` (Điện Nước) · Beauty `0908888006` (Tóc Minh) · Auto `0908888007` (Rửa Xe Kim Văn) · Sports `0908888008` (Sân CT12) · Phòng khám `0908888009` (Đa khoa) / `0908888010` (Nha khoa) / `0908888011` (Đông y) · Runner `0908888002` · Admin `0908888003` · Customer `0901234567`

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
