# Pilot Zone 1 — Kim Văn – Kim Lũ

**Status:** Approved pilot target (architecture review 2026-09-14)

**Slug:** `kim-van-kim-lu`  
**Display:** PICKI · KIM VĂN KIM LŨ

## Why this Zone

- Dense apartment demand core (Kim Văn, Kim Lũ, adjacent Linh Đàm)
- Strong fit for **Concentrated Demand – Distributed Supply**
- High-rise batching + lobby / Picki Point potential
- Ground residential supply ring in Hoàng Mai

## Pilot targets (Master Spec §142)

| Parameter      | Target        |
| -------------- | ------------- |
| Households     | 300–500       |
| Food providers | ~10 initially |
| Runners        | 10–15         |
| Vertical       | Food first    |
| Duration       | 4–8 weeks     |

## Implementation timeline

| Sprint | Work                                                            |
| ------ | --------------------------------------------------------------- |
| S1     | DB foundation (this doc + seed metadata only)                   |
| S4     | Zone Planner scoring + candidate polygon from anchor            |
| S5     | Operator-approved boundary → `zones` + `zone_boundary_versions` |
| S6+    | GPS discover, join, addresses in Zone                           |

Machine-readable metadata: [`packages/db/seeds/pilot/kim-van-kim-lu.json`](../packages/db/seeds/pilot/kim-van-kim-lu.json)

## Anchor (initial only)

Approximate demand-core anchor for candidate generation (~not the final polygon):

- Lat: 20.9883
- Lng: 105.8414

Travel-time accessibility and operator edits replace any fixed-radius assumption (ADR-010).

## E2E testing (Food pilot)

- **Automated API:** `pnpm pilot:e2e` (script: `scripts/pilot-food-e2e.sh`)
- **Manual UI checklist:** [`FOOD_E2E_CHECKLIST.md`](./FOOD_E2E_CHECKLIST.md) — 3-tab COD flow, cancel, PayOS, push, Admin

## E2E testing (Family Dinner — S41)

- **Seed:** `bash scripts/db-seed-family-dinner.sh` · demo menu: `FD_SEED_DEMO=1 …`
- **Automated API:** `pnpm pilot:family-dinner:e2e` (script: `scripts/pilot-family-dinner-e2e.sh`)
- **Manual UI checklist:** [`FAMILY_DINNER_E2E_CHECKLIST.md`](./FAMILY_DINNER_E2E_CHECKLIST.md) — cook-first PREPAY, runner sau READY, Tự giao, cutoff gate

## Breakfast Preorder — S42

- **Seed:** `bash scripts/db-seed-breakfast.sh` · demo: `BF_SEED_DEMO=1 …`
- **Demo:** Phở Gà Kim Văn · login `0908888015` · customer `/breakfast`
- **Rules:** PREPAY · Nấu sẵn only · cutoff tối hôm trước (gợi ý 23:30) · ADR-047 · [`PICKI_BREAKFAST_PREORDER_SPEC.md`](../PICKI_BREAKFAST_PREORDER_SPEC.md)

## Góc ăn khuya — S43

- **Seed:** `bash scripts/db-seed-late-night.sh` (sau breakfast seed)
- **Demo:** cùng Phở Gà · Bán khuya 20:30–02:00 · customer `/late-night` · provider tab Trạng thái
- **ADR-048** · [`PICKI_LATE_NIGHT_SPEC.md`](../PICKI_LATE_NIGHT_SPEC.md)

## Pilot harden + PWA

- **Gate trước pilot rộng:** [`PILOT_HARDEN_CHECKLIST.md`](./PILOT_HARDEN_CHECKLIST.md)
- **Icons:** `bash scripts/generate-pwa-icons.sh` → PNG 192/512 + apple-touch (Customer / Provider / Runner)
- **Visual V1:** [`VISUAL_V1.md`](./VISUAL_V1.md) — Zone Citrus theme, home layout, SVG nav
