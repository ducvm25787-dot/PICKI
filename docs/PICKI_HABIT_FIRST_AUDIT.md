# Pickee Habit-First — Repo Audit & Implementation Plan

**Status:** DRAFT — awaiting PM approval before coding  
**Product addendum:** `docs/PICKI_HABIT_FIRST_ADDENDUM.md`  
**Date:** 2026-09-23  
**Rule:** Experience-layer reorganization. Prefer reuse. No new verticals. No Elasticsearch/Algolia/AI unless Postgres fails pilot needs.

---

## Executive verdict

Pickee already has enough vertical surface for pilot. The gap is **composition + memory + search depth**, not more categories.

| Layer | Today | Habit-First need |
|-------|--------|------------------|
| Home | Category grid + time hero (dinner/breakfast) + discovery blocks | Context → Familiar → Today → Discovery → Categories |
| Favorites | `user_favorites` (user × location) | Keep + separate Familiar |
| Familiar / relationship | **Missing** (derivable from `orders`) | `user_provider_relationships` or materialized view |
| Repeat | **Missing** as product action | Revalidate + deep-link / rebuild cart |
| Search | Zone `ILIKE` on provider + `offerings` | Universal + VN normalize + FD/breakfast menus |
| Today updates | `daily_specials` (quantity/date) + FD/breakfast menus | Broader ephemeral “Hôm nay có” |
| Loyalty / coins | Out of Master Spec | Lean REGULAR/VIP only (P1) |
| Flags / analytics | Env toggles only; no product analytics | Lean flags + event table or outbox |

**Recommendation:** Ship **P0** as composition + familiar-from-orders + search upgrade; defer loyalty benefits and rich Today publisher to **P1**.

---

## 1. Current Home architecture

**File:** `apps/web/app/page.tsx`  
**Hero clock:** `apps/web/lib/home-hero.ts` (00–20 dinner · 20–24 breakfast)  
**Categories:** `apps/web/lib/categories.ts` (10 browse tiles)

**Joined-zone section order today:**

1. Brand + notifications  
2. Search link → `/zones/:slug/search`  
3. Hero (family-dinner \| breakfast)  
4. Quick tiles (Góc khu / Đơn / Bản đồ / Dịch vụ)  
5. **Tiện ích quanh nhà** (category-first)  
6. Chips (Sáng mai / Bữa tối / Ăn khuya / Cho tặng)  
7. Góc khu mình  
8. Discovery API blocks  
9. Favorites count teaser (not a familiar shelf)

**APIs:** `GET /me`, `/zones/mine`, `/zones/:slug/discovery`, `/me/favorites`.

**Gap vs Addendum §2:** Categories dominate; no Familiar shelf; no Today rail; Context Now only as 2-slot hero; multiple sequential client calls (no home composition endpoint).

---

## 2. Provider / category / catalog / menu models

| Concept | Implementation | Reuse? |
|---------|----------------|--------|
| Provider / Location | `providers`, `provider_locations`, zone membership | Yes |
| Categories (customer) | Client `HOME_CATEGORIES` → browse by `provider_type` | Yes (keep under Home) |
| Generic catalog | `offerings` + `offering_prices` (`0007_catalog.sql`) | Yes — primary search entity for PRODUCT/SERVICE |
| Food discovery meta | `food_moment`, fulfillment, payment on offerings | Yes |
| Family Dinner menus | `family_dinner_*` tables — **not** in `searchZone` | Must index into search |
| Breakfast menus | `breakfast_preorder_*` — **not** in `searchZone` | Must index into search |
| Live status | `provider_live_status` | Yes (unify status vocab carefully) |
| Reviews | `location_reviews` | Optional trust signal for ranking |

**Do not** create per-vertical provider tables or duplicate catalogs.

---

## 3. Favorites / repeat / relationship

| Capability | Status |
|------------|--------|
| Favorite / unfavorite | **Done** — `user_favorites`, `/me/favorites` |
| Familiar score | **Missing** |
| Household affinity | Spec’d historically; **no** household schema in pilot DB — use **user_id** for V1 |
| Repeat action | **Missing** — orders have `customer_user_id`, `provider_location_id`, `order_items.offering_id` |

**Derivation path (no AI):**

```text
completed interactions ≈ orders WHERE status IN ('DELIVERED', …)
  GROUP BY customer_user_id, provider_location_id
+ favorite boost
+ recency decay
→ relationship_score / REGULAR|VIP labels
```

Also count non-order interactions later (chat/contact/service_requests) if events exist — **do not** treat a single browse click as familiar.

---

## 4. Search — implementation & limitations

**Code:** `packages/db/src/discovery/queries.ts` → `searchZone`  
**API:** `GET /zones/:slugOrId/search`  
**UI:** `apps/web/app/zones/[slug]/search/page.tsx`

**What works:** Zone-scoped; returns `provider` + `offering` with live status + price; LIMIT 30.

**Limitations:**

- `ILIKE '%q%'` only — no FTS / `pg_trgm` / `unaccent`  
- Extensions today: PostGIS + pgcrypto only (`0001_extensions.sql`)  
- No synonym table  
- No result grouping (familiar / entity type)  
- FD / breakfast menu items, classifieds, daily specials titles not searched  
- No relationship boost / explicit familiar group  

**Pilot strategy (proposed):**

1. Enable `pg_trgm` + `unaccent` (or app-level VN fold).  
2. Expand UNION: offerings + FD menu items (active day) + breakfast menu items + optional daily_specials titles.  
3. Add `search_synonyms` config table.  
4. Optional `search_documents` materialized/denormalized table refreshed on write — only if query complexity warrants.  
5. API response groups: `familiar` · `items` · `providers` · `categories` · `discover`.  
6. **Reject** ES/Algolia for pilot unless measured latency/quality fails.

---

## 5. Live status

**Table:** `provider_live_status` (OPEN/BUSY/CLOSED/OFFLINE in migration; domain enum also has AVAILABLE_NOW / SHORT_WAIT / …).

**Action:** Reuse one vocabulary in Habit cards/search; document mapping; do not invent parallel status systems per Home section.

---

## 6. Promotion / Spotlight

No campaign/spotlight tables found. Organic vs sponsored rule remains: if Spotlight is added later, keep **labeled** and **out of** familiarity/organic score. Out of Habit P0 unless already elsewhere.

---

## 7. Reusable building blocks (checklist)

- [x] Zone membership + serviceability  
- [x] Provider location + live status  
- [x] Favorites  
- [x] Discovery blocks / time windows  
- [x] Offerings catalog  
- [x] Orders + order_items for familiarity & repeat seeds  
- [x] `daily_specials` (narrow)  
- [x] FD / breakfast daily menus (Today + search sources)  
- [x] Partial Context hero (`home-hero.ts`)  
- [x] Home composition API  
- [x] Relationship store  
- [x] Repeat revalidation flow  
- [x] Universal search + VN normalize  
- [x] Rich Today publisher UX  
- [x] Lean loyalty  
- [x] Product analytics events  

---

## 8. Missing domain concepts (evaluate)

| Concept | Verdict |
|---------|---------|
| `user_provider_relationships` | **Recommend P0** — avoid recompute-only on every Home hit; upsert from order completion + favorite |
| `provider_daily_updates` | **P1** — extend `daily_specials` or new table if specials too food/qty-centric |
| `search_synonyms` | **P0** |
| `search_documents` | **P0 optional** — start with expanded SQL UNION; add if slow |
| `provider_loyalty_*` | **P1** |
| Household tables | **Defer** — user-scoped relationships until household ships |

---

## 9. Proposed schema (P0 sketch — not approved to migrate yet)

### 9.1 `user_provider_relationships`

- `user_id`, `provider_location_id` (PK-ish unique)  
- `favorite` (sync from `user_favorites` or replace later)  
- `completed_interactions`, `last_interaction_at`  
- `relationship_score`, `relationship_status` (`NEW`\|`RETURNING`\|`REGULAR`\|`VIP`)  
- `hidden_by_user`, timestamps  

Worker/trigger: on order terminal success → upsert counts + recompute score from **config weights**.

### 9.2 Config

- `habit_context_windows` or JSON config module (time → hero copy + deep links)  
- `familiarity_weights` (env or DB)  
- `search_synonyms (canonical, variants[])`

### 9.3 Extensions

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`  
- `unaccent` or application normalizer for Vietnamese  

### 9.4 P1 tables

- `provider_daily_updates` (or migrate `daily_specials`)  
- `provider_loyalty_programs` / `provider_loyalty_benefits`

---

## 10. Proposed Home composition architecture

**New endpoint (proposed):** `GET /zones/:slug/home` (auth) returning section payloads:

```text
{
  contextNow: { slotId, title, subtitle, cta, href },
  familiar: [ { locationId, brandName, liveStatus, score, usageHint, primaryCta } ],
  today: [ { updateId, locationId, title, expiresAt, cta } ],
  discover: [ … deduped vs familiar … ],
  categories: [ … existing HOME_CATEGORIES … ],
  community: { … existing … }
}
```

**Web:** Recompose `page.tsx` sections; keep browse routes. Feature flag `habit_home_v1`.

**Dedup:** Familiar location IDs excluded from Discover provider cards; Today rows may still mention them.

**Perf:** Single composition call; SQL parallel inside service; limit N per section (e.g. familiar 6, today 8, discover 8).

---

## 11. Familiarity algorithm (deterministic)

```text
score =
  w_completed * completed_interactions
+ w_repeat    * repeat_bonus          -- e.g. 2+ deliveries
+ w_recency   * decay(last_interaction_at)
+ w_favorite  * (favorite ? 1 : 0)

status:
  VIP       if completed >= vip_threshold (default 15) OR manual override (P1)
  REGULAR   if completed >= regular_threshold (default 5)
  RETURNING if completed >= 1
  NEW       else
```

Eligibility for **Chỗ quen** shelf: `score ≥ min_score` AND NOT `hidden_by_user` AND (completed ≥ 2 OR favorite).  
Exact weights in config — not in React.

---

## 12. Universal Search architecture

1. Normalize query (lowercase, strip accents, synonym expand).  
2. Zone + ACTIVE + serviceability filter.  
3. Query pools: providers, offerings, FD items (today/open), breakfast items, categories (static map), optional today updates.  
4. Group response; inject familiar group first without burying discovery groups.  
5. Live status on cards; CTA by capability.

---

## 13. Vietnamese search strategy

- Store/search `normalized_text` (unaccented) alongside display title.  
- Match both raw ILIKE/FTS and normalized.  
- Synonyms: ship→giao hàng, sửa lạnh→điều hòa, cơm nhà→family dinner, etc.  
- Optional trigram for typo tolerance on titles.

---

## 14. Search indexing / update strategy

| Source write | Index action |
|--------------|--------------|
| Offering create/update | Upsert search row / rely on live JOIN |
| FD/breakfast menu publish | Upsert day’s items |
| Location rename | Upsert provider doc |
| Soft delete / ARCHIVE | Remove from search |

Start with **live JOIN** for pilot; add `search_documents` if EXPLAIN shows pain.

---

## 15. Organic vs Sponsored

No change to fairness rules. Familiar score is organic. Sponsored slots (if any) separate + labeled. Money cannot buy familiarity.

---

## 16. Performance implications

- Risk: Home N+1 if client keeps calling every vertical. → Composition endpoint.  
- Risk: Heavy search UNION. → LIMIT per group, trigram indexes on `normalized_text`.  
- Risk: Score recompute on read. → Upsert on order complete.

---

## 17. Authorization / RLS

Pickee API today is session-cookie Modular Monolith (not Supabase RLS on app tables). Relationships and search must enforce:

- Customer: own relationships only  
- Provider: aggregate labels for **their** location’s customers only (no browse/search history)  
- Zone/serviceability on all customer list/search  

Document any new endpoints in audit trail if sensitive.

---

## 18. Analytics events (P0 minimum)

Insert lean `analytics_events` (or reuse outbox with type prefix) for:

`home_section_impression`, `familiar_provider_impression|click`, `repeat_action_click`, `search_query`, `search_result_click`, `search_zero_result`, `favorite_add|remove`.

P1: `today_offer_*`, `loyalty_benefit_used`.

---

## 19. Feature flags (lean)

If no flag service: env / DB settings row:

- `HABIT_HOME_V1=true`  
- `FAMILIAR_PROVIDERS_V1=true`  
- `UNIVERSAL_SEARCH_V1=true`  
- later: daily updates / loyalty  

---

## 20. Test plan

1. Unit: familiarity score fixtures; VN normalize + synonyms.  
2. API: home composition section shapes; dedupe; empty familiar.  
3. Search: `canh cua`, `cat toc`, `nuoc giat`, offering hit, FD menu hit, zero-result.  
4. Repeat: price change / sold out blocks blind clone.  
5. Regression: existing discovery browse, favorites, FD/breakfast order paths, provider live status.  
6. E2E smoke: login → home sections → open familiar → search dish → category still reachable.

---

## 21. Migration / regression risks

| Risk | Mitigation |
|------|------------|
| Home rewrite breaks pilot demos | Flag + keep old layout behind flag |
| Status enum drift | Map layer in one module |
| Search slower with UNION | Indexes + limits; feature flag |
| Familiar over-dominates | Explicit groups + discovery quota |
| Loyalty/coins scope creep | P1 only; no points tables |
| Admin polygon / geo join issues | Orthogonal; don’t couple |

---

## 22. Proposed delivery slices (after PM approval)

| Slice | Scope | Gate |
|-------|--------|------|
| **S-H0** | Docs + flags + context config (extend `home-hero`) | Done with this audit |
| **S-H1** | `user_provider_relationships` + backfill from orders + Home Familiar section | P0 |
| **S-H2** | Home composition API + reorder sections (categories down) | P0 |
| **S-H3** | Universal search VN + offerings + FD/breakfast + grouping | P0 |
| **S-H4** | Repeat CTAs with revalidation | P0 |
| **S-H5** | Today updates (extend specials or new table) + provider UX | P1 ✅ |
| **S-H6** | Lean loyalty REGULAR/VIP + optional benefits | P1 ✅ |
| **S-H7** | Analytics events + basic dash queries | P0/P1 ✅ |

---

## 23. What we will NOT do in this initiative

- New verticals  
- Rebuild Food/Beauty/… stacks  
- Elasticsearch / Algolia / AI recommendations  
- Coins, wallet, gamification, global Pickee points  
- Social feed / newsfeed  
- Household CRM for providers  

---

## Approval checklist (PM)

- [ ] Accept user-scoped relationships (no household yet)  
- [ ] Accept P0/P1 split above  
- [ ] Accept Postgres search path (no ES)  
- [ ] Accept extend `daily_specials` vs new `provider_daily_updates` for P1  
- [ ] Approve coding start at **S-H1**  

**No implementation until this plan is approved.**
