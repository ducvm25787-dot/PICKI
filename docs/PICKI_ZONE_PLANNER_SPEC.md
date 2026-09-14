# Picki Zone Planner Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Zone Planner **proposes** where Zones should exist. Zone Engine **operates** approved Zones. These modules are separate (ADR-009).

---

## Module structure (§12)

```
ZONE PLANNER
├── Core Detection
├── Population Density
├── Household Density
├── Apartment Density
├── Building Density
├── Commercial Density
├── Provider Density
├── Road Accessibility
├── Barrier Analysis
├── Travel-Time Analysis
├── Candidate Generator
├── Zone Scoring
├── Overlap Resolver
├── Shared Service Areas
├── Polygon Editor
└── Approval Workflow
```

**Sprint:** S4 (Zone Planner V1). Admin UI: `/admin/zone-planner`.

---

## Core principle (§13)

> **Algorithm proposes. Local knowledge corrects. Human approves.**

- **No auto-publish** (ADR-012)
- Operator must be able to edit before approval:
  - Add / remove area
  - Move boundary
  - Split / merge candidates
  - Mark difficult access
  - Add access point
  - Mark barrier (river, highway, gate)
  - Add operational note

Local field knowledge overrides algorithm recommendations when justified—record reason in audit.

---

## Ideal Zone criteria & scoring (§9)

Do **not** hard-code a single threshold. Zone Planner scores candidates with **adjustable weights**.

### Suggested score weights

| Dimension       | Weight | Signals                                                                                                                  |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Demand**      | 40%    | Residential density, apartment concentration, occupied households, residential ratio, household lifestyle potential      |
| **Supply**      | 30%    | Food diversity, traditional market, supermarket/minimart, retail, home services, beauty, laundry, education, health, pet |
| **Fulfillment** | 20%    | Travel time, road accessibility, batching potential, building access, Picki Point feasibility, operational complexity    |
| **Expansion**   | 10%    | Ground population, villas/low-rise, adjacent supply, cross-zone potential                                                |

### Interpretation (configurable)

| Score | Action                        |
| ----- | ----------------------------- |
| 80+   | Strong Zone — prioritize      |
| 70–79 | Good candidate                |
| 60–69 | Pilot only after field review |
| < 60  | Do not prioritize             |

Weights and thresholds live in config (`zone_planner_scores`, admin settings)—not code constants.

---

## Residential ratio (§10)

Prefer ~70–90% residential in demand core. Not hard-coded.

Office-dominant areas are poor Zone anchors. Household life must dominate demand signal.

---

## Supply diversity (§11)

Do not count providers alone (100 cafés ≠ healthy ecosystem).

Supply Diversity Score considers category coverage:

Food, Fresh Food, Grocery, Milk, Pharmacy, Laundry, Beauty, Repair, Cleaning, Education, Pet, …

---

## Travel time > radius (§14)

**Forbidden as business rule:** `radius <= 1 km`

**Allowed:** ~1 km (or similar) to **seed candidate generation** only.

Evaluate using network-based accessibility:

- 5-minute accessibility
- 8-minute accessibility
- 12-minute accessibility

Thresholds are configurable per city/context. Travel-time analysis uses GeoService adapter (routing/isochrones)—see `PICKI_INTEGRATIONS_SPEC.md`.

---

## Zone areas in planner output (§15)

Planner proposes polygons tagged as:

| Tag                 | Role                                |
| ------------------- | ----------------------------------- |
| CORE                | Demand anchor                       |
| PRIMARY             | Primary operations footprint        |
| EXTENDED            | Extended service footprint          |
| SHARED SERVICE AREA | Proposed cross-Zone service overlap |

Final tags may be adjusted by operator before approval.

---

## Candidate lifecycle

```
DETECTED
  → CANDIDATE (scored, geometry draft)
  → UNDER_REVIEW (operator editing)
  → FIELD_VALIDATION (optional site visit)
  → APPROVED → handoff to Zone Engine (DRAFT/CONFIGURING)
  → REJECTED / ARCHIVED
```

On **APPROVED**:

1. Create `zones` row
2. Create initial `zone_boundary_versions` row
3. Copy relevant `zone_planner_recommendations` into operational config
4. Zone enters Engine lifecycle—Planner no longer mutates production polygon without new version workflow

---

## Overlap resolver

When candidate polygons overlap existing Zones:

- Flag conflict for operator review
- Options: adjust boundary, define shared service area, split candidate, reject
- Do not silently merge or auto-resolve

---

## Shared service areas (planner role)

Planner may **propose** shared service areas between adjacent candidates or existing Zones. Operator approves. Engine enforces via Serviceability—not membership polygon overlap.

---

## Data tables (see `PICKI_DATABASE_SPEC.md`)

| Table                          | Role                                   |
| ------------------------------ | -------------------------------------- |
| `zone_candidates`              | Pre-approval candidates                |
| `zone_planner_layers`          | Input GIS layers (density, POI, roads) |
| `zone_planner_scores`          | Score breakdown per candidate          |
| `zone_planner_recommendations` | Algorithm output + operator edits      |
| `zone_boundary_versions`       | Created on approval (Engine)           |
| `shared_service_areas`         | Approved cross-zone coverage           |

---

## Future intelligence (§20)

With live Picki data, Planner may suggest CREATE / EXPAND / SHRINK / SPLIT / MERGE / RECLASSIFY for **existing** Zones. Same rule: propose only, human approves, version boundaries.

**Out of V1 scope without approval:**

- Full automatic Hanoi Zone generation
- Automatic Zone publishing

---

## Admin API (illustrative)

| Endpoint                                            | Action                            |
| --------------------------------------------------- | --------------------------------- |
| `GET /admin/zone-planner/candidates`                | List candidates with scores       |
| `GET /admin/zone-planner/candidates/:id`            | Detail + layers + score breakdown |
| `PATCH /admin/zone-planner/candidates/:id/geometry` | Operator polygon edit             |
| `POST /admin/zone-planner/candidates/:id/score`     | Re-run scoring                    |
| `POST /admin/zone-planner/candidates/:id/approve`   | Approve → create Zone + version   |
| `POST /admin/zone-planner/candidates/:id/reject`    | Reject with reason                |

All approve/reject actions write `audit_logs`.

---

## Related docs

- `PICKI_ZONE_SPEC.md` — runtime Zone model, membership, GPS
- `PICKI_MVP_SCOPE.md` — S4 scope, P0 rollout
- `DECISIONS.md` — ADR-009, ADR-010, ADR-011, ADR-012
