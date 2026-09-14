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
