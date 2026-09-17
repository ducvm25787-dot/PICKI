# Picki Architecture Decision Records

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on any conflict with this file.

Status legend:

- **ACCEPTED (Official)** — from Master Spec §148; binding for V1.
- **ACCEPTED (Technology)** — Stack choices approved 2026-09-14 (ADR-P01–P08).

---

## Accepted (Official)

### ADR-001 — Use Modular Monolith for V1

**Status:** ACCEPTED (Official)

V1 uses one Picki Backend and one primary PostgreSQL database with clear module boundaries inside a single deployable. Do not split into microservices (zone-service, order-service, payment-service, runner-service) in V1. Split only when real scale proves the need.

---

### ADR-002 — Picki V1 is Web/PWA-first

**Status:** ACCEPTED (Official)

Customer, Provider, and Runner clients ship as Web/PWA first. Admin ships as Web. No native consumer app in V1. Core features must not depend on Zalo Mini App availability.

---

### ADR-003 — Zalo Mini App is a later client

**Status:** ACCEPTED (Official)

Zalo Mini App is Client #1 for distribution when integrated, but it is a client—not the platform. It uses the same Picki API, users, database, orders, providers, and Zones. Picki must operate without Zalo.

---

### ADR-004 — Picki uses internal UUIDs

**Status:** ACCEPTED (Official)

All core entities use Picki-generated UUID primary keys (`users.id`, `zones.id`, `providers.id`, etc.). External vendor IDs never replace Picki IDs as business primary keys.

---

### ADR-005 — External identities use mappings/adapters

**Status:** ACCEPTED (Official)

External login identities map through `user_identities` (`provider`, `external_user_id` → `users.id`) via identity adapters. Supported providers include `PHONE`, `EMAIL`, `ZALO`, `APPLE`, `GOOGLE`. Removing an external provider deletes mapping rows, not Picki users or transaction history.

---

### ADR-006 — Apartment/residential density forms the primary Demand Core

**Status:** ACCEPTED (Official)

Picki Zones are anchored on dense apartment/residential clusters (chung cư / KĐT đông dân) as the primary Demand Core. High household density drives batching, repeat behavior, and Picki Point feasibility. Ground residential areas are both consumers and distributed supply—not second-class users.

---

### ADR-007 — Picki follows Concentrated Demand – Distributed Supply

**Status:** ACCEPTED (Official)

Zone economics assume concentrated household demand in the core and distributed supply in surrounding ground residential rings (food, market, retail, services). Product and logistics design reflect this model; it is not merely a map label.

---

### ADR-008 — Zone is core-driven and polygon-based

**Status:** ACCEPTED (Official)

A Zone is not an administrative unit or a fixed 1 km circle. It is a local economy/community polygon anchored on a dense demand core, stored as PostGIS geometry in Picki DB. ~1 km may seed candidate generation only; the operational boundary is operator-approved polygon.

---

### ADR-009 — Zone Planner and Zone Engine are separate

**Status:** ACCEPTED (Official)

**Zone Planner** proposes where Zones should exist (scoring, candidates, overlap resolution, shared service areas, approval workflow). **Zone Engine** operates approved Zones (membership, discovery, serviceability, settings). Do not collapse planning and runtime into one module.

---

### ADR-010 — Travel time/accessibility is preferred over fixed radius

**Status:** ACCEPTED (Official)

Do not use `radius <= 1 km` as a business rule. Prefer network-based travel-time accessibility (e.g. 5 / 8 / 12 minute thresholds, configurable) over naive radius checks when evaluating Zone viability and serviceability.

---

### ADR-011 — Zone boundaries are versioned

**Status:** ACCEPTED (Official)

Never overwrite Zone polygons in place. Use `zone_boundary_versions` with `zone_id`, `version`, `geometry`, `valid_from`, `valid_to`, `created_by`, `change_reason`. Historical transactions and analytics remain attributable to the boundary version in effect at the time.

---

### ADR-012 — Algorithm proposes; human approves

**Status:** ACCEPTED (Official)

Zone Planner may recommend boundaries, splits, merges, and shared service areas—but **no auto-publish**. Operators must review, edit (add/remove area, move boundary, split, merge, mark barriers, add access points, add operational notes), and explicitly approve before a Zone enters production lifecycle.

---

### ADR-013 — Membership boundary and Serviceability are separate

**Status:** ACCEPTED (Official)

**Membership** answers: which Zone did the user JOIN with a Level-1-valid address? **Serviceability** answers: can Provider X fulfill to Address Y right now? These are independent. Adjacent Zones may have distinct membership polygons while sharing overlapping service coverage.

---

### ADR-014 — Adjacent Zones may share Service Areas

**Status:** ACCEPTED (Official)

Providers associated with Zone A may serve customers in Zone B when Serviceability = `ELIGIBLE`, without forcing membership polygons to overlap. Use `shared_service_areas` / service area configuration—not messy membership polygon overlap.

---

### ADR-015 — GPS discovers Zone

**Status:** ACCEPTED (Official)

GPS is used for: discover Zone (point-in-polygon), join a new Zone, "around here" context, and anti-fraud when necessary. GPS does **not** continuously track customers, does **not** store minute-by-minute location, and does **not** automatically change `active_zone_id`.

---

### ADR-016 — Level-1 Address allows customer to Join Zone

**Status:** ACCEPTED (Official)

Joining a Zone requires GPS presence in the Zone plus a delivery address that passes **Level-1 validation** (`LEVEL_1_VALIDATED`): structurally reasonable, in a valid service area, deliverable, not obvious junk. This is **not** legal residency KYC. Copy should be low-friction ("help Picki serve you better").

---

### ADR-017 — User may Join multiple Zones

**Status:** ACCEPTED (Official)

No hard Zone-per-user limit in V1. A user may JOIN home Zone, work Zone, and others. Each membership persists independently. `UNIQUE(user_id, zone_id)` on `user_zone_memberships`.

---

### ADR-018 — Membership persists after leaving physical Zone

**Status:** ACCEPTED (Official)

Travel away from a Zone does not set membership to `LEFT`. Membership is tied to a validated delivery address association, not current GPS position. Users explicitly leave or are suspended by policy/admin action.

---

### ADR-019 — Customer verification is progressive

**Status:** ACCEPTED (Official)

Customer access is low-friction with progressive verification. Enhanced resident privileges (e.g. `VERIFIED` membership) may require stronger checks later. Provider and Runner access require stronger verification before public visibility or work assignment.

---

### ADR-020 — Provider replaces Shop as generic business entity

**Status:** ACCEPTED (Official)

**Provider** is the generic supply-side business entity for all verticals (food, laundry, beauty, education, etc.). Do not center core architecture on "Shop". Food-specific code must not make `providers` / `offerings` Food-only tables.

---

### ADR-021 — Provider and Provider Location are separate

**Status:** ACCEPTED (Official)

**Provider** = business/brand identity (master profile, brand assets, master catalog). **Provider Location** = physical operating site. Each location has its own address, hours, live status, reviews, and zone memberships. Commerce and fulfillment reference `provider_location_id`.

---

### ADR-022 — Provider supports multiple Locations and Zones

**Status:** ACCEPTED (Official)

One Provider may have 1..N Locations. One Location may serve 1..N Zones (via `provider_zone_memberships` and serviceability). Opening in Zone 2 must not require rebuilding the entire brand profile or master catalog.

---

### ADR-023 — New Locations may clone reusable configuration

**Status:** ACCEPTED (Official)

When opening a new location, the operator may clone from an existing location: profile, logo, images, menu/catalog, prices, options, signature offerings, opening hours, service modes, and operational configuration—then edit differences before verification.

---

### ADR-024 — Opening new Location does not close old Location

**Status:** ACCEPTED (Official)

**Open another location:** Location 1 stays `ACTIVE`; Location 2 becomes `ACTIVE` or `PENDING_VERIFICATION` alongside it. **Relocate:** old location moves through `RELOCATING` → `CLOSED`/`RELOCATED` only after new location is verified; history is never deleted.

---

### ADR-025 — Provider reputation and Location reviews are separate

**Status:** ACCEPTED (Official)

Brand-level **Provider Reputation** and per-location **Location Reviews** are stored and displayed separately. Reviews from Location A are not copied to new Location B. New locations may show brand reputation with "new location" context.

---

### ADR-026 — Provider onboarding is Picki-native

**Status:** ACCEPTED (Official)

Providers create profiles using Picki templates—simple forms (name, type, address, hours, logo, description, main offerings, operating mode). Goal: easier than large marketplaces. No dependency on external listing import for go-live.

---

### ADR-027 — No external marketplace scraping/import in V1

**Status:** ACCEPTED (Official)

Do not scrape or bulk-import from Grab, ShopeeFood, Google Maps, Facebook, or similar in V1. Picki DB and assets are the source of truth. External URLs are not master records for provider catalog or images.

---

### ADR-028 — Live Availability is a first-class capability

**Status:** ACCEPTED (Official)

Live Availability is a generic platform capability, not a food-only hack. Standard states include `AVAILABLE_NOW`, `SHORT_WAIT`, `BUSY`, `NOT_ACCEPTING`, `CLOSED`, with optional `estimated_wait_minutes`, `estimated_prep_minutes`, `estimated_arrival_minutes`, `last_updated_at`. Used by food, beauty, home services, and discovery/map.

---

### ADR-029 — Provider ranking uses multiple trust/relevance signals

**Status:** ACCEPTED (Official)

Ranking combines relevance (distance/micro-area, serviceability, category fit), trust (verified reviews, repeat usage, complaint signals), and fairness (exposure for new providers). Do not display 50 similar providers as undifferentiated equals. No AI recommendation engine in V1—rule-based signals only.

---

### ADR-030 — New verticals compose generic capabilities

**Status:** ACCEPTED (Official)

New service categories (laundry, beauty, education, classifieds) compose existing capabilities (`LISTING`, `LIVE_STATUS`, `CONTACT`, `BOOKING`, `QUEUE_STATUS`, `LEAD`, `COMMERCE`, `PREORDER`, `DELIVERY`, `PICKUP_AND_RETURN`, `CLASSIFIED`, `PICKI_POINT`) before inventing new architecture. See `PICKI_SERVICES_SPEC.md`.

---

### ADR-031 — Serviceability is final authority for fulfillment

**Status:** ACCEPTED (Official)

The Serviceability Engine is the final gate for whether an order/request can be fulfilled. Inputs: provider location, customer address, service type, ETA, Zone policy, provider/runner availability, capacity, route detour, SLA. Output: `ELIGIBLE` | `NOT_ELIGIBLE`. **Never assume `same_zone` = deliverable.**

---

### ADR-032 — Fulfillment uses Route + Stop architecture

**Status:** ACCEPTED (Official)

Fulfillment uses `deliveries`, `delivery_routes`, `route_stops`, `route_orders`. **Not** 1 order = 1 route. Multiple orders may share one route with ordered stops (pickups, lobby dropoffs, apartment dropoffs, Picki Points).

---

### ADR-033 — High-rise and ground residential use different batching strategies

**Status:** ACCEPTED (Official)

**High-rise:** building batch → lobby / Picki Point → apartment if required. **Ground residential:** micro-area batch → street/alley cluster → door delivery. Batching V1 is rule-based (compatible destination, ready time, detour, capacity, SLA)—no advanced route optimization solver.

---

### ADR-034 — Shop-owned runners may fall back to Picki runners

**Status:** ACCEPTED (Official)

Provider dispatch policies: `PICKI_ONLY`, `SHOP_RUNNER_FIRST`, `PICKI_FIRST`, `MANUAL`. Under `SHOP_RUNNER_FIRST`, offer shop runner first; on timeout, fall back to Picki dispatch. Picki runners are overflow, not replacement for shop staff when accepted.

---

### ADR-035 — Payment integrations use adapters

**Status:** ACCEPTED (Official)

Payments flow: Transaction → Payment Service → Payment Adapter. Vendor-specific logic stays in `src/integrations/payments/*`. Core `orders` / `payments` modules do not hard-code ZaloPay, VietQR, or any single provider. Webhooks are idempotent.

---

### ADR-036 — Notification integrations use adapters

**Status:** ACCEPTED (Official)

Notifications flow: Business Event → Outbox → Notification Service → Channel Adapter. Channels include `WEB`, `ZALO`, `PUSH`, `SMS`, `EMAIL`. Order/Service modules never call Zalo (or any vendor) directly. Picki OA is central when Zalo is used.

---

### ADR-037 — Picki owns messaging history

**Status:** ACCEPTED (Official)

`conversations`, `conversation_participants`, and `messages` in Picki DB are the source of truth for Picki Chat. External channels (Zalo) may be offered alongside; they do not replace stored transcript. Notification adapters may alert "new message" only.

---

### ADR-038 — Picki owns business assets

**Status:** ACCEPTED (Official)

Provider images, offering images, avatars, verification documents, and classified photos live in Picki-controlled storage (`assets` table with `storage_key`, metadata). Do not hotlink external marketplace CDN URLs as master records.

---

### ADR-039 — Realtime subscriptions are narrowly scoped

**Status:** ACCEPTED (Official)

Do not subscribe every user to all Zone events. Narrow subscriptions: customer → own order; runner → assigned route; provider → own orders; user viewing provider → that provider's live status. Zone-wide discovery uses cached/query data, not broadcast realtime.

---

### ADR-040 — Future clients reuse the same API/database

**Status:** ACCEPTED (Official)

Web/PWA, Zalo Mini App, and future native iOS/Android clients all use the same Picki API, users, database, and business logic. No per-client business databases. No vendor-specific core endpoints (except `/integrations/{vendor}/*`).

---

## Accepted (Technology — architecture review 2026-09-14)

### ADR-P01 — TypeScript strict + pnpm workspaces

**Status:** ACCEPTED

Monorepo with `pnpm` workspaces. TypeScript `strict` mode across packages. Shared types in `packages/` where useful.

---

### ADR-P02 — NestJS modular monolith (`apps/api`)

**Status:** ACCEPTED

Backend runtime: NestJS modular monolith under `apps/api`, aligned with Master Spec module boundaries (`src/modules/*`). **Runtime ships from S2+**; S0 establishes structure, interfaces, and tooling only.

---

### ADR-P03 — Next.js Web/PWA (`apps/web`)

**Status:** ACCEPTED

Customer/Provider/Runner Web/PWA via Next.js under `apps/web`. **Ships from S24+**; S0 may scaffold placeholder only.

---

### ADR-P04 — PostgreSQL 16 + PostGIS, Drizzle ORM + SQL migrations

**Status:** ACCEPTED

Primary database: PostgreSQL 16 with PostGIS extension. ORM: Drizzle with SQL-first migrations (generated + reviewed). Picki owns schema; Supabase hosts Postgres but is not the schema authority.

---

### ADR-P05 — Picki-controlled Supabase for hosted Postgres + Storage

**Status:** ACCEPTED

Use Supabase for managed PostgreSQL and object storage. **Do not use Supabase Auth as business identity**—Picki issues sessions and owns `users` / `user_identities`. RLS may supplement API authorization where appropriate.

---

### ADR-P06 — Vitest + ESLint + GitHub Actions CI

**Status:** ACCEPTED

Unit/integration tests: Vitest. Lint: ESLint (TypeScript-aware). CI: GitHub Actions running lint, typecheck, and tests on PR.

---

### ADR-P07 — API prefix `/v1`

**Status:** ACCEPTED

All public REST resources under `/v1/*`. Vendor integrations under `/v1/integrations/{vendor}/*` only.

---

### ADR-P08 — Outbox + job worker in-process (V1)

**Status:** ACCEPTED

Transactional outbox (`outbox_events`) processed by an in-process or same-deploy worker in V1. Extract to separate worker service only when load requires.

---

### ADR-041 — Delivery fees: checkout total → provider; provider settles runner (revised 2026-09-15)

**Status:** ACCEPTED (Official) — supersedes prior “runner fee COD at delivery” wording.

**Context:** Pilot cần minh bạch tổng chi phí cho khách, một giao dịch thanh toán đơn giản, và tránh Picki làm trung gian thu–chia provider↔runner (wallet / complex settlement §146).

**Decision — Food:**

1. Picki **tính và hiển thị** `delivery_fee_vnd`; `total_vnd = subtotal_vnd + delivery_fee_vnd` trên checkout / xác nhận đơn.
2. Khách trả **một lần** tổng (tiền hàng + phí giao) lúc đặt — prepay qua PayOS (`PAY_ON_PICKI`) hoặc COD **full tổng** khi nhận.
3. **Một giao dịch duy nhất** với khách → tiền vào **tài khoản merchant Provider** (không qua ví Picki).
4. Provider **tự quyết** trả runner (tiền mặt / chuyển khoản) theo **thống kê ngày** Picki cung cấp — giao dịch provider↔runner **ngoài** payment adapter Picki V1.
5. Picki: rule tính phí + snapshot + breakdown hiển thị + stats đối soát — **không** chia payout, không wallet.

**Decision — Laundry (`PICKUP_AND_RETURN`):**

1. Khách **không** trả phí ship chiều nào trên đơn (`delivery_fee_vnd = 0`; `total_vnd = subtotal_vnd`).
2. **Lấy đồ tại nhà:** người đến lấy phải là **nhân viên tiệm đã xác minh** (chuyên môn nhận & kiểm tra tình trạng đồ) — không phải runner pool chung kiểu Food.
3. **Giao trả:** mặc định nhân viên tiệm; Provider có thể **gọi runner giao hộ** — phí runner do **Provider** chịu, thống kê riêng (không cộng vào total khách).
4. Picki chỉ cần tính năng Provider **tìm runner cho chặng giao** (return leg); không hiển thị phí ship cho khách.

**Full spec:** `PICKI_MASTER_SPEC.md` §104, §81 (Laundry), §116.

---

### ADR-042 — Cho thuê / ở ghép = tin peer trong Zone (không Provider BĐS)

**Status:** ACCEPTED (2026-09-16)

**Context:** Chung cư Demand Core có nhu cầu phòng cho thuê và ở ghép. Đặc thù BĐS khác nhu cầu hàng ngày (Food, Laundry, Health) — không onboard sale/môi giới thành Provider.

**Decision:**

1. Chỉ **đăng tin** trong GÓC KHU MÌNH (extend Classified / capability `CLASSIFIED` + `CONTACT`). Hai bên **liên hệ trực tiếp** (chat / SĐT / Zalo).
2. **Không** Provider type BĐS; **không** đặt lịch xem nhà; **không** cọc / thanh toán thuê trên Picki.
3. Mỗi tài khoản **đã xác thực SĐT**: tối đa **1 tin đang ACTIVE**; tối đa **2 lần đăng / tháng lịch**.
4. Xóa tay hoặc **auto-expire (TTL 7 ngày)** → hết tin ACTIVE → mới được đăng tin khác (vẫn trong quota tháng). Quota tính theo lần **tạo** tin; xóa/hết hạn **không** hoàn lượt.
5. `CHO_THUÊ` và `Ở_GHÉP` **chung** quota (1 ACTIVE + 2/tháng).

**Full scope:** `docs/S37_HOUSING_LISTINGS.md`.

---

### ADR-043 — Nhà thuốc lean: LISTING + LIVE + CONTACT (không giỏ thuốc)

**Status:** ACCEPTED (2026-09-16)

**Context:** Spec §86 gồm Nhà thuốc. Chuỗi Long Châu / Pharmacity đã thắng ở app + catalog + lịch sử mua. Picki không đối đầu đó.

**Decision:**

1. Provider type `PHARMACY` — peer Zone / hiệu độc lập, không Classified C2C thuốc.
2. Capabilities V1: `LISTING` + `LIVE_STATUS` + `CONTACT` only.
3. Discovery chỉ hiện khi `provider_profiles.license_verified_at IS NOT NULL` (cùng cột giấy phép phòng khám).
4. **Không** giỏ thuốc, thanh toán thuốc, giao thuốc runner, visit intent, queue.
5. Offering chỉ mang tính danh mục hỏi hàng (`CONTACT_ONLY` / báo giá) — khách gọi rồi qua lấy.

**Full scope:** `docs/S38_PHARMACY.md`.

---

### ADR-044 — Đi chợ lean: MINIMART / MARKET_VENDOR / RETAIL (không giỏ)

**Status:** ACCEPTED (2026-09-16)

**Context:** Homepage Spec §94 có **Đi chợ**; §76 late-night gồm minimart / sữa-bỉm. Types `MINIMART`, `MARKET_VENDOR`, `RETAIL_STORE`, `SUPERMARKET` đã có trong domain — chưa có product surface.

**Decision:**

1. Discovery block **ĐI CHỢ** gồm `MINIMART` + `MARKET_VENDOR` + `RETAIL_STORE` (không bắt buộc `SUPERMARKET` chuỗi V1).
2. Capabilities V1: `LISTING` + `LIVE_STATUS` + `CONTACT` — mirror nhà thuốc lean.
3. **Không** gate `license_verified_at` (không phải ngành thuốc).
4. **Không** cart/checkout/giao runner tạp hóa V1.
5. Hỏi hàng + ảnh qua Picki Chat (`contextType = MARKET`).

**Full scope:** `docs/S39_MARKET.md`.

---

### ADR-045 — Thất lạc / Pet Lost = tin peer Classified (không giữ chỗ)

**Status:** ACCEPTED (2026-09-16)

**Context:** Master Spec §91 GÓC KHU MÌNH gồm Lost & Found và Pet Lost — chưa có surface.

**Decision:**

1. Extend Classified: `LOST_FOUND`, `PET_LOST` — không module mới.
2. Phone verified để đăng; **không** giá / điều kiện đồ / giữ chỗ.
3. Quota: 2 AVAILABLE / user (chung 2 type) · 5 tạo / tháng lịch.
4. TTL 14 ngày → auto ARCHIVED (reuse `expires_at` + expire worker).
5. PET_LOST bắt buộc ≥1 ảnh. REUSE deferred.

**Full scope:** `docs/S40_LOST_FOUND.md`.

---

### ADR-046 — Family Dinner = build-your-own tray (không combo cố định)

**Status:** ACCEPTED (2026-09-16)

**Context:** Master Spec §65–68 + Food Spec §66 mô tả family meals. Draft “Bữa tối ấm cúng” định nghĩa meal builder ≥1 MAIN/SIDE/VEGETABLE/SOUP thay vì combo cố định.

**Decision:**

1. Family Dinner V1 = **build-your-own** từ daily menu theo category; Picki không áp mâm combo sẵn.
2. Reuse `orders` / `order_items` / payments / fulfillment với `order_kind = FAMILY_DINNER`.
3. Ship **phased**: A = menu + builder + windows + PREPAY; B = provider ops/cutoff dashboard; C = recipe engine; D = late dinner. **A–D shipped lean (2026-09-16).**
4. Recipe calculation (khi có) **deterministic** — không LLM.
5. Combo cố định (nếu cần) = Late Dinner offer hoặc offering thường — không thay meal builder.

**Full scope:** `docs/PICKI_FAMILY_DINNER_SPEC.md`.

**Addendum (2026-09-17) — Prep mode Nấu sẵn / Tự nấu:**

1. Mặc định **Nấu sẵn**. Provider tick `allows_self_cook` trên món MAIN/SIDE/VEGETABLE/SOUP.
2. Khách chọn **Tự nấu** chỉ khi món được mở; **cùng giá** V1 (không giảm giá platform).
3. Snapshot `order_items.prep_mode`; kế hoạch nấu hiện số phần tự nấu (lean). Giảm giá / recipe tách = Phase sau.

---
