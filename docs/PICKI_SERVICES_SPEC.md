# Picki Services Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Non-food verticals compose **generic capabilities** (§80, ADR-030)—no separate app architecture per vertical.

---

## Generic capability composition (§80)

Before inventing new modules, compose:

```
LISTING | LIVE_STATUS | CONTACT | BOOKING | QUEUE_STATUS | LEAD
PROVIDER_VISIT | CUSTOMER_VISIT | PICKUP_AND_RETURN | DELIVERY
CLASSIFIED | PICKI_POINT
```

| Vertical               | Typical composition                                    | Sprint |
| ---------------------- | ------------------------------------------------------ | ------ |
| Laundry                | `LISTING` + `PICKUP_AND_RETURN` + `DELIVERY`           | S29    |
| Home services          | `LISTING` + `LIVE_STATUS` + `CONTACT`                  | S30    |
| Beauty                 | `LISTING` + `LIVE_STATUS` + `QUEUE_STATUS` + `CONTACT` | S31    |
| Education              | `LISTING` + `CONTACT` + `BOOKING` (optional)           | S32    |
| Pet                    | `LISTING` + `CONTACT` + `BOOKING`                      | S32    |
| Classified / Give Away | `CLASSIFIED` + `CONTACT`                               | S33    |

Schema for `bookings`, `service_requests`, `quotes`, `leads` may exist from S1; **product launches** per sprint above—not in Food MVP.

---

## Laundry (§81)

**Includes:** quần áo, chăn, ga, gối, giày

**Flow:**

```
User request pickup
  → Runner pickup
  → Laundry processing
  → Batch return delivery
```

Highly compatible with route batching and `PICKUP_AND_RETURN` mode.

Payment: per provider policy; may use `COMMERCE` or invoice-off-platform for V1.

---

## Sofa cleaning (§82)

**Not** pickup-return. Flow: **provider visits home** (`PROVIDER_VISIT` + `CONTACT` / `LEAD` / simple booking).

---

## Home services (§83)

Examples: vệ sinh nhà, sửa khóa, điện, nước, điều hòa, máy giặt, tủ lạnh, TV, điện tử gia dụng.

**Live status (simple):**

```
🟢 Đang nhận việc
🟡 Có thể tới sau ~1h
🔴 Hết lịch hôm nay
```

**Actions:** Chat, Zalo—no complex dispatch engine.

**Pricing:** `FIXED` | `FROM` | `QUOTE_REQUIRED`

Technicians show accepting-work status; coordination via Chat/Zalo (architecture acceptance #19).

---

## Beauty (§84–85)

**Includes:** cắt tóc, gội đầu, spa, nail, mi

**Primary differentiator:** `LIVE WAIT` / `QUEUE_STATUS`

Example display:

- Tóc Minh — 🟢 Ra được ngay
- Nail Trang — 🟡 ~15 phút
- Spa A — 🟠 ~40 phút

**Do not build complex queue engine V1.** Simple live status + wait estimate only.

Provider page pattern: cover, identity, address, live status, wait, services, prices, images, reviews, favorites, contact, directions—**not** national marketplace cart/checkout UX.

Actions: Directions, Picki Chat, Zalo.

---

## Health / medicine (§86)

**Includes:** đông y, trị liệu, khám bệnh, nhà thuốc

**Requirements before deep implementation:**

- Professional/provider verification
- Opening status and availability
- Contact and booking when appropriate
- **Compliance design review** separate from normal grocery

**Rules:**

- Do not treat medicine like normal grocery
- Do not build resident-to-resident medicine exchange
- Late-night pharmacy may appear in discovery as `LISTING` + `LIVE_STATUS`

---

## Education (§87)

**Includes:** học thêm, gia sư, lớp trẻ em

**Filters:** subject, grade, format, location, schedule, price

**Flow:**

```
Search → Profile → Chat → Trial / booking if needed
```

Picki does **not** collect tuition fees in V1.

Uses `LISTING` + `CONTACT` + optional `BOOKING`.

---

## Pet (§88)

**Includes:** grooming, tắm/cắt, pet hotel, trông pet, dắt chó, pet supplies, lost pet, vet

Veterinary services = regulated/professional—stricter verification like health.

Lost pet listings use classified/local utility patterns—not social feed.

---

## Classifieds — Thanh lý (§89)

Structured listing:

- Photo, title, price, condition, location, description

**Flow:**

```
View → Chat → Reserve → Self pickup / Picki delivery
```

Picki does **not** require payment for classifieds V1.

State machine: see `PICKI_STATE_MACHINES.md` (`DRAFT` → `AVAILABLE` → `RESERVED` → `COMPLETED` → `ARCHIVED`).

**No social feed** (architecture acceptance #28).

---

## Give away (§90)

**Status:** `AVAILABLE` → `RESERVED` → `GIVEN`

**Flow:**

```
Post → Request item → Chat → Self pickup / Picki delivery
```

May reuse classified state pattern with `GIVEN` terminal state.

---

## Local utility section (§91–92)

Homepage section **GÓC KHU MÌNH:**

- Cho tặng, Thanh lý, Lost & Found, Pet Lost, Reuse/Recycling

Each item solves one task—**not** a newsfeed.

**Live community signal:** aggregate only ("12 người quanh bạn vừa đặt món này")—never expose private household identity.

---

## Rollout

| Phase | Services                |
| ----- | ----------------------- |
| P3    | Laundry + Home Services |
| P4    | Beauty + Live Map       |
| P5    | Education + Pet         |
| P6    | Classified + Give Away  |

---

## Related docs

- `PICKI_PROVIDER_SPEC.md` — engagement modes
- `PICKI_FULFILLMENT_SPEC.md` — pickup-return routes
- `PICKI_STATE_MACHINES.md` — booking, request, classified states
- `DECISIONS.md` — ADR-030
