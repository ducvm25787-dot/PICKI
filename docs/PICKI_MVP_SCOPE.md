# Picki MVP Scope

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

This file bounds **what to build when**. It is an actionable sprint/rollout reference—not a duplicate of the Master Spec.

---

## Implementation sprints (S0–S34 + Later)

| Sprint | Scope                                 |
| ------ | ------------------------------------- |
| S0     | Repository + docs + Cursor Rules      |
| S1     | Database foundation                   |
| S2     | Auth + Identity                       |
| S3     | Geo + PostGIS                         |
| S4     | Zone Planner V1                       |
| S5     | Zone Engine + versioning              |
| S6     | GPS Discover + Join + Address         |
| S7     | Household foundation                  |
| S8     | Provider + Location + Verification    |
| S9     | Provider cloning + multi-Zone         |
| S10    | Catalog + Offering + Options          |
| S11    | Live Availability                     |
| S12    | Search + Live Map                     |
| S13    | Reviews + Favorites + Repeat          |
| S14    | Discovery/Home                        |
| S15    | Food Breakfast/Preorder               |
| S16    | Food Instant/Menu                     |
| S17    | Dinner/Family Meal/Grocery            |
| S18    | Snacks/Daily Specials                 |
| S19    | Orders + State Machine                |
| S20    | Payments                              |
| S21    | Runner                                |
| S22    | Fulfillment + Route                   |
| S23    | Batching + Lobby + Picki Point        |
| S24    | Customer Web/PWA                      |
| S25    | Provider Web/PWA                      |
| S26    | Runner Web/PWA                        |
| S27    | Admin/Ops                             |
| S28    | Messaging + Notifications             |
| S29    | Laundry                               |
| S30    | Home Services                         |
| S31    | Beauty Live Wait                      |
| S32    | Education + Pet                       |
| S33    | Classified + Give Away                |
| S34    | Analytics + Security + Load hardening |
| S37    | Cho thuê / Ở ghép (peer listings) — ADR-042; scope `docs/S37_HOUSING_LISTINGS.md` |
| S38    | Nhà thuốc lean — ADR-043; scope `docs/S38_PHARMACY.md` |
| S39    | Đi chợ lean (minimart/tạp hóa) — ADR-044; scope `docs/S39_MARKET.md` |
| S40    | Thất lạc / Pet Lost — ADR-045; scope `docs/S40_LOST_FOUND.md` |
| S41    | Family Dinner Phase A–D — ADR-046; scope `docs/PICKI_FAMILY_DINNER_SPEC.md` |
| S42    | Breakfast Preorder («Sáng mai ăn gì?») Phase 1 — ADR-047 |
| Later  | Zalo Mini App                         |
| Later  | Native                                |

Sprint order may be adjusted for dependency reasons, but **architectural boundaries must remain**.

### Sprint 0 — no product features

S0 creates: repository, workspace structure, docs, Cursor Rules, architecture baseline, TypeScript configuration, environment strategy, lint, typecheck, tests, CI, database migration tooling, integration interfaces, error model, logging baseline.

S0 does **not** implement: Food, Provider UI, Zone UI, Orders, Payments.

---

## Rollout phases (P0–P8 + Later)

| Phase | Scope                           |
| ----- | ------------------------------- |
| P0    | Architecture + Zone Planner     |
| P1    | Food MVP                        |
| P2    | Food + Fulfillment optimization |
| P3    | Laundry + Home Services         |
| P4    | Beauty + Live Map               |
| P5    | Education + Pet                 |
| P6    | Classified + Give Away          |
| P7    | Zone 2                          |
| P8    | Multi-Zone replication          |
| Later | Zalo Mini App                   |
| Later | Native                          |

---

## Pilot (Zone 1)

**Zone:** **Kim Văn – Kim Lũ** (`kim-van-kim-lu`) — see [`docs/pilot/KIM_VAN_KIM_LU.md`](pilot/KIM_VAN_KIM_LU.md)

| Parameter      | Target               |
| -------------- | -------------------- |
| Zones          | 1 (Kim Văn – Kim Lũ) |
| Households     | 300–500 target       |
| Food providers | ~10 initially        |
| Runners        | 10–15                |
| Vertical       | Food first           |
| Duration       | 4–8 weeks            |

Numbers are pilot targets, not hard architecture limits.

### Pilot Food KPIs (suggested)

| KPI                         | Target                      |
| --------------------------- | --------------------------- |
| Completion                  | ≥ 95%                       |
| Provider acceptance         | ≥ 95%                       |
| Cancellation                | < 5%                        |
| Prep p50                    | ≤ 10 min                    |
| Runner assignment p50       | ≤ 60 sec                    |
| Lobby delivery target       | ~ ≤ 12 min where applicable |
| 14-day repeat               | ≥ 30%                       |
| Orders / active HH / week   | ≥ 1.5 good                  |
| Provider willingness to pay | Must measure                |

---

## Condition to open Zone 2 (§145)

Zone 1 should demonstrate **before** opening Zone 2:

- Repeat household usage
- Provider value (retention, engagement)
- Provider willingness to pay
- Fulfillment reliability (SLA, complaints acceptable)
- Operational playbook documented
- New Zone launch mostly by data/config (Zone Planner + templates)—not bespoke engineering per Zone

**Do not open Zone 2 simply because software works.**

---

## DO NOT BUILD V1

Do not implement without explicit approval:

- AI recommendation
- AI dispatch
- Social network / newsfeed
- Public community chat
- Wallet / crypto
- Loyalty points / gamification
- Advanced route optimization solver
- Microservices split
- Automatic Zone publishing
- Full automatic city-wide Zone generation
- Grab / ShopeeFood scraping or import
- Native consumer app
- Complex automatic settlement
- Separate architecture per vertical

Schema may **reserve** Booking, Request, Lead, Household for future verticals; do not ship those products in Food MVP.

---

## Architecture acceptance test (before pilot)

Answer **YES** to all. Any **NO** requires architecture review.

| #   | Question                                                                         | Expected |
| --- | -------------------------------------------------------------------------------- | -------- |
| 1   | Can Picki operate without Zalo?                                                  | YES      |
| 2   | Can Zalo later become another client?                                            | YES      |
| 3   | Can native clients reuse existing users/data?                                    | YES      |
| 4   | Can one user Join multiple Zones?                                                | YES      |
| 5   | Does leaving a physical Zone preserve membership?                                | YES      |
| 6   | Can a visitor discover without Joining?                                          | YES      |
| 7   | Does Join collect a useful delivery address?                                     | YES      |
| 8   | Can Zone boundaries change without losing history?                               | YES      |
| 9   | Can adjacent Zones share service areas?                                          | YES      |
| 10  | Can local knowledge override Zone recommendations?                               | YES      |
| 11  | Can a Provider have multiple Locations?                                          | YES      |
| 12  | Can a Provider open in Zone 2 without rebuilding entire profile/catalog?         | YES      |
| 13  | Does opening Zone 2 preserve Zone 1 Location?                                    | YES      |
| 14  | Can Location 2 have different prices/availability?                               | YES      |
| 15  | Are Location reviews separate from brand reputation?                             | YES      |
| 16  | Can a provider operate as Listing only?                                          | YES      |
| 17  | Can another provider support full Commerce?                                      | YES      |
| 18  | Can salons show live waiting status without complex booking engine?              | YES      |
| 19  | Can technicians simply show accepting-work status and use Chat/Zalo?             | YES      |
| 20  | Can Laundry use Pickup-and-Return?                                               | YES      |
| 21  | Can Food support Preorder and Instant?                                           | YES      |
| 22  | Can Food support Family Meals?                                                   | YES      |
| 23  | Can Food support complex menu options?                                           | YES      |
| 24  | Can snacks use Live Limited Availability?                                        | YES      |
| 25  | Can Picki help choose among 50 similar providers without displaying all equally? | YES      |
| 26  | Can verified reviews and repeat behavior influence ranking?                      | YES      |
| 27  | Can a new provider receive fair exposure?                                        | YES      |
| 28  | Can Classified/Give Away exist without a social feed?                            | YES      |
| 29  | Can multiple orders share one Route?                                             | YES      |
| 30  | Can high-rise orders batch to Lobby/Picki Point?                                 | YES      |
| 31  | Can ground-residential orders batch by micro-area?                               | YES      |
| 32  | Can provider-owned runners fall back to Picki runners?                           | YES      |
| 33  | Can payment vendor be replaced?                                                  | YES      |
| 34  | Can map vendor be replaced?                                                      | YES      |
| 35  | Can notification vendor be replaced?                                             | YES      |
| 36  | Can new service categories be added mainly by combining existing capabilities?   | YES      |
| 37  | Can API capacity scale horizontally?                                             | YES      |
| 38  | Can Picki reach many Zones without creating a database per Zone?                 | YES      |

---

## Related docs

| Doc                       | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `PICKI_MASTER_SPEC.md`    | Full product/architecture source of truth         |
| `DECISIONS.md`            | ADR-001–040 + proposed tech ADRs                  |
| `SPRINT0_ARCHITECTURE.md` | S0 baseline answers (§152)                        |
| `PICKI_DATABASE_SPEC.md`  | Domain map; tables created sprint-by-sprint       |
| Vertical specs            | Zone, Provider, Food, Services, Fulfillment, etc. |
