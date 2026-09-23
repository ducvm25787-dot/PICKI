# PICKee — HABIT-FIRST EXPERIENCE ADDENDUM

**Điều chỉnh Pickee theo thói quen sử dụng thực tế**  
**Version:** Habit & Familiarity Layer V1  
**Status:** PRODUCT ADDENDUM — IA/UX + relationship + search (not a vertical rebuild)  
**Authority:** Supplements `docs/PICKI_MASTER_SPEC.md`. Master Spec still wins on conflict for out-of-scope items (AI recs, wallet, coins, social feed, microservices).  
**Related:** `docs/PICKI_HABIT_FIRST_AUDIT.md` (repo audit + implementation plan — **code only after PM approval of that plan**).

---

## 0. MỤC ĐÍCH

Pickee hiện đã có các vertical và chức năng cơ bản để pilot.

**KHÔNG** xây thêm vertical mới trong task này.

Mục tiêu là tổ chức lại những capability hiện có để Pickee chuyển từ:

> “Danh mục tiện ích quanh tôi”

thành:

> “Ứng dụng tôi mở khi trở về nhà, để xem chỗ quen, hôm nay quanh mình có gì và giải quyết nhanh nhu cầu đời sống.”

Ba nguyên tắc UX mới:

1. **FAMILIARITY** → ưu tiên những nơi household đã quen dùng  
2. **CONTEXT** → ưu tiên những thứ phù hợp với thời điểm hiện tại  
3. **DISCOVERY** → vẫn giúp user tìm được lựa chọn mới  

Không được hy sinh Discovery để chỉ hiện Favorites.

---

## 1. PRODUCT BEHAVIOR MỚI

Pickee phải hỗ trợ đồng thời ba hành vi:

| | Hành vi | Surface |
|---|---------|---------|
| A | Tôi đã biết mình muốn dùng ai | **Chỗ quen** |
| B | Tôi muốn xem hôm nay quanh nhà có gì | **Hôm nay có gì** |
| C | Tôi muốn tìm một thứ cụ thể hoặc tìm lựa chọn mới | **Universal Search + Khám phá** |

```
                 PICKee
                    │
        ┌───────────┼───────────┐
        │           │           │
     CHỖ QUEN    HÔM NAY     KHÁM PHÁ
        │           │           │
     Repeat       Live       Discovery
     Favorite     Offers     Search
     Loyalty*     Status     Categories
```

\*Loyalty = provider-local REGULAR/VIP labels + optional benefits — **not** Pickee coins/points/gamification (Master Spec out of scope).

---

## 2. HOME KHÔNG CÒN CATEGORY-FIRST

Không xóa category. Category không còn là nội dung ưu tiên số 1 trên Home.

**Home mới (composition order):**

1. Brand + Zone context (`Nhà · Pickee Zone …`)  
2. **Universal Search**  
3. **CONTEXT NOW** (dynamic theo thời gian — configurable rules)  
4. **CHỖ QUEN CỦA NHÀ MÌNH**  
5. **HÔM NAY CÓ GÌ**  
6. **KHÁM PHÁ QUANH TÔI**  
7. **TIỆN ÍCH QUANH TÔI** (categories — Food / Shopping / Beauty / …)  
8. **GÓC KHU MÌNH**  

Không duplicate nội dung máy móc giữa các section (xem §33).

---

## 3. CONTEXT NOW

Home thay đổi nhẹ theo thời điểm — không tạo Home hoàn toàn khác nhau. Chỉ thay contextual hero / first content block.

| Window (conceptual) | Tone |
|---------------------|------|
| Buổi sáng | Chào buổi sáng · ăn sáng · đơn đang giao · mua nhanh |
| Ban ngày | Quanh bạn hôm nay · food / shopping / live |
| ~15:00–19:30 | **Về nhà thôi** · tối nay · Bữa tối ấm cúng · chợ · provider rảnh |
| Tối | Tối nay quanh bạn · ăn muộn · ăn vặt · beauty mở muộn |
| Cuối tuần | Cuối tuần quanh nhà · discovery rộng hơn |

Time rules **must be configurable** (config/module) — không hard-code text/rules rải rác trong UI components.  
(Current pilot already has a partial clock hero: dinner vs breakfast 20:00 — extend, do not fork.)

---

## 4–5. CHỖ QUEN + FAMILIARITY SCORE

**Favorite ≠ Familiar.**

| | Favorite | Familiar |
|---|----------|----------|
| Source | User taps ♥ | Deterministic signals from usage |
| Signals | Explicit | completed_orders, repeat, service interactions, contact (if tracked), favorite boost, recency, frequency |

**Không** dùng một lần click ngẫu nhiên để xác định “chỗ quen”.

`relationship_score` = weighted sum (weights **configurable**, not magic numbers in React). No AI in V1.

Relationship layer is **generic** across provider types (food, retail, beauty, repair, laundry, education, pet, …) — not restaurant-only.

Scoped to **user** in V1 if household model is not shipped; filter/rank by current address/Zone in UI without duplicating relationship rows per Zone unless required.

---

## 6–8. CHỖ QUEN UX

- Card shows live status + usage hint (“Nhà bạn đã đặt N lần”) + **capability-aware CTA** (Đặt lại / Xem tối nay / Mua lại / Liên hệ).  
- Optional filter: Quanh nhà vs Quanh công ty via current address context.  
- Section “Nhà mình hay dùng” (profile) can be derived — user may favorite / hide / remove from familiar suggestions.

---

## 9–12. PROVIDER RELATIONSHIP + LOYALTY (LEAN)

Provider-facing labels only: **New / Returning / Regular / VIP** (+ aggregate completed count when justified).

V1 loyalty program (optional, per-provider config):

- NONE / REGULAR / VIP thresholds (e.g. ≥5 / ≥15 completed)  
- Optional benefits: discount_percent, free_item, free_delivery, priority_slot, early_access, custom_text  
- Provider-funded; Pickee does not default-subsidize  

**Out of scope for this task (Master Spec):** coins, tokens, gamification, global Pickee points, complex tiers.

---

## 13. QUICK REPEAT

Capability **Repeat** with revalidation before checkout (price/item/menu/availability/open). Do not blind-clone orders.

---

## 15–17. HÔM NAY CÓ GÌ (PROVIDER DAILY UPDATES)

Ephemeral local updates — **not** a social feed.

Types (conceptual): `TODAY_AVAILABLE`, `DAILY_SPECIAL`, `NEW_ITEM`, `OPEN_SLOT`, `LOW_STOCK`, `LATE_DINNER`, `PROMOTION`, `NEW_SERVICE`.

Fields: image optional, title, short description, linked entity optional, valid_from, expires_at (default end-of-day), CTA. Zone/serviceability aware. Publish UX &lt; 30s.

Reuse/extend existing `daily_specials` where it fits; do not invent a parallel feed architecture.

---

## 18–19. DISCOVERY + ORGANIC VS PAID

Home must keep: thử chỗ mới · nhiều household quanh đây · mới trong Zone · gần bạn · đang phục vụ.

Organic ranking ≠ sponsored. Money cannot buy familiarity, reviews, repeat, trust, or organic score. Spotlight stays labeled **Tài trợ**.

---

## 20–30. UNIVERSAL SEARCH

Search must return: CATEGORY · PROVIDER · SERVICE · PRODUCT · MENU_ITEM · DAILY_OFFER (and promotion if appropriate), grouped (Chỗ quen → entity → provider → category → khám phá).

Ranking: text relevance, availability, serviceability, Zone, distance, relationship (without permanent domination — prefer explicit grouping), live status.

**Vietnamese:** diacritics / không dấu, basic typo if stack allows, synonym map (config-driven).

**Stack preference (pilot):** audit first; prefer PostgreSQL FTS + `pg_trgm` + unaccent/normalized VN text. **Do not** introduce Elasticsearch/Algolia/AI search unless Postgres cannot meet pilot needs.

`search_documents` (if added) is **derived** index — not a second source of truth.

---

## 31–33. LIVE STATUS + HOME COMPOSITION + DEDUPE

Reuse existing live-status capabilities. Home = section-based candidate pools (not one opaque global ranker). Deduplicate providers across Familiar vs Discovery; Today Offer may reappear if it adds new info.

---

## 34–38. PROVIDER UI / NOTIFICATIONS / CONTROLS / PRIVACY

Keep provider ops simple and vertical-specific. Providers create updates; Pickee controls notification delivery (consent-aware, no spam). User can unfavorite / hide familiar / mute updates. Do not expose household browsing/search history to providers.

---

## 39–40. ANALYTICS + METRICS

Events (add or reuse): home_section_impression, familiar_*, repeat_action_click, today_offer_*, search_*, favorite_*, provider_contact, loyalty_benefit_used.

Metrics: Home→action conversion, familiar CTR, repeat rate, time-to-task, search success / zero-result, discovery→first transaction, familiar vs new usage, household return.

---

## 41–42. DO NOT REBUILD / MIGRATION PRINCIPLE

Experience-layer reorganization. Map existing provider/category/catalog/favorites/orders/live/Zone/search/Home first.

Prefer: **existing capability + new composition/relationship/search layer** over duplicate modules/tables.

---

## 43–45. PROPOSED DOMAIN CONCEPTS (EVALUATE, DON’T BLIND-IMPLEMENT)

| Concept | Purpose |
|---------|---------|
| `user_provider_relationships` | Familiar score + status + hidden |
| `provider_loyalty_programs` / `provider_loyalty_benefits` | Optional REGULAR/VIP + benefits |
| `provider_daily_updates` | Ephemeral “Hôm nay có” (or extend `daily_specials`) |
| `search_documents` / `search_synonyms` | Derived search + VN synonyms |

---

## 46–48. PERFORMANCE / EMPTY STATES / FLAGS

Home composition endpoint (or parallel aggregation) — no N+1 vertical fetches. Empty: hide empty Today; friendly empty Familiar; search zero-result with alternatives.

Suggested flags (if infra exists or add lean env flags): `habit_home_v1`, `familiar_providers_v1`, `universal_search_v1`, `provider_daily_updates_v1`, `provider_loyalty_v1`.

---

## 49. PILOT PRIORITY

| Priority | Scope |
|----------|--------|
| **P0** | Home recomposition · Universal Search · Favorites · Familiar · Repeat · VN search · Search into offerings + FD/breakfast menus |
| **P1** | Provider Today updates · Relationship labels · Simple loyalty · Discovery balancing |
| **P2** | Advanced personalization · AI · Complex loyalty · Cross-Zone intelligence |

Do not implement P2 before pilot evidence.

---

## 50. CRITICAL PRODUCT PRINCIPLE

> Pickee should remember what the household likes, show what is useful right now, and always keep discovery one step away.

**FAMILIARITY ≠ LOCK-IN · DISCOVERY ≠ RANDOMNESS**

---

## 51. ACCEPTANCE CRITERIA

1. Home reorganized around Context + Familiar + Today + Discovery.  
2. Category navigation remains accessible.  
3. Favorite / unfavorite works.  
4. Familiar providers via deterministic signals.  
5. Familiar cards show live/operational status.  
6. Capability-aware quick actions (reorder / buy again / contact / view today).  
7. Search returns provider + service + product + menu-item level results.  
8. Accented and unaccented Vietnamese search works.  
9. Search is Zone/serviceability aware.  
10. Familiar surfacing without suppressing discovery.  
11. Paid placement separate from organic/familiar.  
12. Optional ephemeral Today updates.  
13. Today updates expire automatically.  
14. Loyalty without global Pickee coins.  
15. Existing vertical logic reused.  
16. No duplicate provider/catalog/order architecture.  
17. Analytics to measure repeat-usage impact.

---

## 52. IMPLEMENTATION GATE FOR AGENTS

**Do not code until** `docs/PICKI_HABIT_FIRST_AUDIT.md` (or an updated plan) is reviewed and approved by PM.

Task framing: IA/UX reorganization + relationship + search layers — **not** a greenfield rebuild.
