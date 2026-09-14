# Picki Fulfillment Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Core fulfillment architecture for V1. Product implementation: S21–S23. Schema reserved earlier per sprint plan.

---

## Core principle (§95, ADR-032)

**Not** 1 order = 1 route.

Core entities:

| Table             | Role                            |
| ----------------- | ------------------------------- |
| `deliveries`      | Delivery job linked to order(s) |
| `delivery_routes` | Runner route (multi-stop)       |
| `route_stops`     | Ordered stops on a route        |
| `route_orders`    | Many-to-many order ↔ route      |

Example route: Shop A → Shop B → Shop C → CT12A Lobby → Floor 18 → Floor 22.

Batching is a **core economic advantage**—especially in high-rise demand cores.

---

## High-rise fulfillment (§96)

```
Building Batch
  → Lobby bulk handoff
  → Picki Point (if applicable)
  → Apartment door (only when required)
```

Default strategy: batch to lobby/Picki Point first; apartment delivery only when policy or customer requires.

---

## Ground residential fulfillment (§97)

```
Micro-area Batch
  → Street / Alley Cluster
  → Door Delivery
```

Batch by geographic micro-area—not building lobby pattern.

Different batching rules from high-rise (ADR-033).

---

## Batching V1 (§98)

**Rule-based only—no advanced optimization solver** (DO NOT BUILD V1).

Batch when **all** hold:

- Compatible destination (building/micro-area/cluster)
- Compatible ready time (within `batch_wait_window`)
- Acceptable pickup detour (`max_route_detour`)
- Runner capacity not exceeded
- SLA still valid

**Config** (typically `zone_settings`):

| Key                 | Purpose                                |
| ------------------- | -------------------------------------- |
| `batch_wait_window` | Max wait to collect compatible orders  |
| `max_batch_orders`  | Max orders per route                   |
| `max_route_detour`  | Max extra travel for additional pickup |

---

## Lobby bulk handoff (§99)

Runner marks arrival:

```
[TÔI ĐÃ ĐẾN SẢNH] → backend event RUNNER_ARRIVED_LOBBY
```

→ Notify all relevant customers on that route/building.

Customer signals:

```
[TÔI ĐANG XUỐNG]
```

Runner view:

```
#125 Đang xuống
#126 Đã nhận
#127 Chưa phản hồi
```

Reduces repeated lobby↔floor trips.

---

## Picki Point (§100)

**Types:**

```
LOBBY | DESK | LOCKER | COLLECTION_POINT | PARTNER_STORE
```

**Uses:** Food, Grocery, Laundry, Parcel, Classified, Give Away

Offerings/orders carry `picki_point_eligibility`—not all goods eligible (e.g. hot soup vs packaged grocery).

Stored in `picki_points` + building/access linkage.

---

## Shop-owned runner (§101, ADR-034)

Dispatch policy on provider location:

| Policy              | Behavior                                      |
| ------------------- | --------------------------------------------- |
| `PICKI_ONLY`        | Always Picki dispatch                         |
| `SHOP_RUNNER_FIRST` | Offer shop runner at `READY`; timeout → Picki |
| `PICKI_FIRST`       | Picki first; shop runner fallback             |
| `MANUAL`            | Operator/provider assigns manually            |

**SHOP_RUNNER_FIRST flow:**

```
READY
  → Offer own runner
  → Accepted → assign shop runner
  → Timeout → Picki dispatch
```

Picki runners are **overflow**, not default replacement when shop runner accepts.

Entity is **Provider**; "shop runner" is fulfillment vernacular (`runner_affiliations.SHOP_STAFF`).

---

## Runner model (§102)

**Tables:** `runners`, `runner_affiliations`, `runner_presence`, `runner_shifts`, `runner_earnings`

**Affiliation:**

```
INDEPENDENT | SHOP_STAFF | PREFERRED
```

**Presence:**

```
OFFLINE | AVAILABLE | PICKING_UP | DELIVERING
```

Runner must be **verified** before `ACTIVE` and receiving assignments.

---

## Route stop types (implementation reference)

| Stop type           | Typical use                    |
| ------------------- | ------------------------------ |
| `PICKUP`            | Collect from provider location |
| `LOBBY_DROPOFF`     | Bulk handoff at building lobby |
| `APARTMENT_DROPOFF` | Door delivery to unit          |
| `PICKI_POINT`       | Locker/desk/collection point   |

Location kinds: `PROVIDER_LOCATION`, `ACCESS_POINT`, `BUILDING`, `APARTMENT`, `PICKI_POINT`

---

## Serviceability vs membership (§103)

Fulfillment eligibility is decided by the **Serviceability Engine**—not Zone membership equality.

Inputs: provider location, customer address, service type, ETA, Zone policy, availability, capacity, detour, SLA.

Output: `ELIGIBLE` | `NOT_ELIGIBLE`

Never assume `same_zone` ⇒ deliverable.

---

## Order ↔ fulfillment linkage

- Order reaches `READY` → eligible for route assignment
- `RUNNER_ASSIGNED` → `PICKED_UP` → `DELIVERING` → `DELIVERED` (see `PICKI_STATE_MACHINES.md`)
- Shop-runner offer occurs at fulfillment layer; avoid duplicate order statuses unless necessary

---

## Sprint mapping

| Sprint | Scope                          |
| ------ | ------------------------------ |
| S21    | Runner                         |
| S22    | Fulfillment + Route            |
| S23    | Batching + Lobby + Picki Point |

Pilot KPI: lobby delivery ~≤ 12 min where applicable; runner assignment p50 ≤ 60 sec.

---

## Related docs

- `PICKI_ZONE_SPEC.md` — demand core vs ground supply
- `PICKI_STATE_MACHINES.md` — order and runner presence
- `DECISIONS.md` — ADR-032, ADR-033, ADR-034
