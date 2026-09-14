# Picki Zone Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Actionable reference for Zone model, membership, serviceability, lifecycle, and GPS rules.

---

## What a Zone is

A Zone is **not**:

- An administrative ward/district
- A fixed 1 km circle
- Synonymous with "same polygon = same service"

A Zone **is**:

> A local economy/community centered on a dense household cluster that can be operated efficiently.

```
                    PICKI ZONE
               DENSE DEMAND CORE
            Chung cư / KĐT đông dân
                     │
              Household Demand
                     │
        ┌────────────┴────────────┐
        │                         │
 Ground Residential          Villas/Low-rise
        │                         │
        └────────────┬────────────┘
                     │
              DISTRIBUTED SUPPLY
```

---

## Demand core vs supply ring

### Demand core (chung cư / dense residential)

High household density drives:

- Delivery frequency and batching
- Picki Point feasibility
- Repeat behavior
- Food daily rhythm product design

Priority is in **product and logistics design**, not access denial. Ground residents retain full access to Food, Shopping, Services, Delivery, Beauty, Laundry, Education, Pet, Classified, Give Away.

### Ground residential supply ring

Ground areas serve dual role: **users** and **providers** (chợ, quán, home cook, minimart, thợ, salon, giặt là, gia sư, etc.). The core needs distributed supply; supply needs concentrated demand.

---

## Zone areas (§15)

Each Zone may define:

| Area                    | Meaning                                            |
| ----------------------- | -------------------------------------------------- |
| **CORE**                | Extreme demand density (primary anchor)            |
| **PRIMARY**             | Very favorable operations / SLA                    |
| **EXTENDED**            | Still serviceable; different SLA/cost expectations |
| **SHARED SERVICE AREA** | Cross-Zone service overlap (see below)             |

Areas are polygons or references in PostGIS—not concentric radius circles.

---

## Three functions (never collapse)

| Function                   | Persisted as                                    | Question answered                             |
| -------------------------- | ----------------------------------------------- | --------------------------------------------- |
| **Community / Membership** | `user_zone_memberships`                         | Which Zone did the user JOIN?                 |
| **Discovery**              | `active_zone_id` + catalog/availability queries | What is available in this Zone context today? |
| **Serviceability**         | Serviceability Engine                           | Can Provider X fulfill to Address Y now?      |

Membership ≠ serviceability. A user JOINED to Zone A may be served by a provider in Zone B when Serviceability = `ELIGIBLE`.

---

## Membership vs serviceability (§16–17)

**Membership boundary:** Which Zone can this address JOIN?

**Serviceability boundary:** Can this provider location reach this delivery address under current policy, ETA, capacity, and SLA?

Adjacent Zones:

```
Membership:  [ Zone A ] | [ Zone B ]     (distinct join polygons)
Service:     [────── overlap OK ──────]  (via shared_service_areas)
```

Do not solve cross-Zone service by overlapping membership polygons unnecessarily.

---

## Shared service areas (§17)

Provider associated with Zone A may serve Zone B customers when:

- Serviceability Engine returns `ELIGIBLE`
- Shared service area or cross-zone policy allows it

Configured via `shared_service_areas` and provider location service policies—not by duplicating membership.

---

## Zone versioning (§18)

**Never overwrite** boundary geometry in place.

Use `zone_boundary_versions`:

| Field           | Purpose                           |
| --------------- | --------------------------------- |
| `zone_id`       | Zone reference                    |
| `version`       | Monotonic version number          |
| `geometry`      | PostGIS `MULTIPOLYGON`            |
| `valid_from`    | When this version became active   |
| `valid_to`      | When superseded (null if current) |
| `created_by`    | Operator/admin                    |
| `change_reason` | Audit text                        |

Historical orders, analytics, and membership events remain valid against the version in effect at transaction time.

---

## Zone lifecycle (§19)

### Candidate (Planner)

```
DETECTED → CANDIDATE → UNDER_REVIEW → FIELD_VALIDATION → APPROVED | REJECTED → ARCHIVED
```

### Production (Engine)

```
DRAFT → CONFIGURING → PILOT → ACTIVE → PAUSED | SUSPENDED → CLOSED
```

**Never delete** a Zone with transaction history. Close and archive instead.

---

## User discovers Zone (§21)

```
GPS → point-in-polygon → Zone found → Zone Preview
```

Preview shows: Zone name, member count, active provider count, discovery teaser ("Hôm nay quanh bạn có gì?"), CTAs: **Explore** (visitor) / **Join Zone**.

Visitors discover without membership row. `VISITOR` is a UX concept, not a DB status.

---

## Join Zone (§23)

```
GPS inside Zone polygon
  → User taps Join
  → Add delivery address
  → Level-1 validation
  → JOINED
```

Copy: low-friction ("Cho Picki biết bạn ở đâu để phục vụ bạn tốt hơn")—not KYC language.

Requirements:

- GPS presence in Zone (for join flow)
- Level-1-valid delivery address associated with that Zone

---

## User–Zone status (§24)

| Status      | Meaning                                              |
| ----------- | ---------------------------------------------------- |
| `JOINED`    | Valid Level-1 address; full member                   |
| `VERIFIED`  | Enhanced resident privileges (stronger verification) |
| `SUSPENDED` | Policy/admin suspension                              |
| `LEFT`      | Explicit leave—not triggered by travel               |

`VISITOR`: discover only; no membership row.

---

## Multi-Zone membership (§25–26)

- User may JOIN **multiple Zones**—no hard V1 limit
- Each Zone membership is independent
- `active_zone_id` on user is UI context selector—not GPS-driven
- Membership **persists** when user leaves physical Zone (ADR-018)
- Do not delete users or memberships for inactivity; track Active 30d / 90d / Inactive for analytics
- A Zone may have millions of historical membership records

### Active Zone selector (§27)

UI shows current context, e.g. "📍 Đại Kim ▼" with list of joined Zones + "Khám phá Zone quanh đây". Changing active Zone does not affect other memberships.

---

## GPS rules (§22)

| Use GPS for               | Do NOT use GPS for                |
| ------------------------- | --------------------------------- |
| Discover Zone             | Continuous customer tracking      |
| Join new Zone             | Minute-by-minute location storage |
| "Around here" context     | Auto-changing `active_zone_id`    |
| Anti-fraud when necessary |                                   |

---

## Address (§28–29)

### Address types

`RESIDENTIAL`, `WORKPLACE`, `STREET_ADDRESS`, `TEMPORARY`, `OTHER`

High-rise: building, floor, apartment, delivery_note, coordinates  
Street: house_number, alley, street, ward, city, coordinates, delivery_note

### Validation states

```
UNVALIDATED → LEVEL_1_VALIDATED → VERIFIED
                                    ↓
                                 REVOKED
```

**Level-1** checks: structure reasonable, location valid, deliverable, not junk—not legal proof of residence.

Level-1 is sufficient for Zone JOIN.

---

## Serviceability Engine (§103)

Final authority for fulfillment eligibility.

**Inputs:** provider location, customer address, service type, ETA estimate, Zone policy, provider availability, runner availability, capacity, route detour, SLA

**Output:** `ELIGIBLE` | `NOT_ELIGIBLE`

**Never:** `same_zone` alone implies deliverable.

---

## Future Zone intelligence (§20)

After operational data exists (orders, searches, ETAs, routes, joins, failed deliveries, unserved demand), Zone Planner may propose:

`CREATE`, `EXPAND`, `SHRINK`, `SPLIT`, `MERGE`, `RECLASSIFY`

All proposals still require **human approval** (ADR-012). No auto-publish.

---

## Related docs

- `PICKI_ZONE_PLANNER_SPEC.md` — scoring, candidates, approval workflow
- `PICKI_FULFILLMENT_SPEC.md` — high-rise vs ground batching
- `DECISIONS.md` — ADR-006 through ADR-018, ADR-031
