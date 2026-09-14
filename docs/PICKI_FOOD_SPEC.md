# Picki Food Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Food is the **launch vertical** and **frequency engine** for V1 pilot—not a generic restaurant marketplace. Scoped to pilot (P1) and Food sprints S15–S19.

---

## Positioning (§60)

> **Household Food Planning + Hyperlocal Fulfillment**

Picki Food serves **household daily rhythm**—breakfast, lunch, dinner planning, family meals, grocery—not only on-demand restaurant delivery.

Food modules compose generic Provider/Offering/Order capabilities. Do not Food-only the core `providers` / `offerings` schema.

---

## Daily rhythm (§61)

Default example windows ( **configurable per Zone**—do not hard-code):

| Window      | Discovery theme                      |
| ----------- | ------------------------------------ |
| 20:00–23:30 | SÁNG MAI ĂN GÌ? (breakfast preorder) |
| 05:30–10:00 | ĂN SÁNG (breakfast instant)          |
| 10:00–14:00 | ĂN TRƯA NHANH                        |
| 14:00–16:00 | TỐI NAY NHÀ MÌNH ĂN GÌ?              |
| 16:00–20:30 | CỨU BỮA TỐI                          |
| 20:30+      | ĂN KHUYA / TIỆN ÍCH ĐÊM              |

Discovery/home rules drive which blocks surface—no AI recommendation engine in V1.

---

## Breakfast preorder (§62)

Evening before: household selects per-person items (e.g. Bố → Phở, Mẹ → Bánh cuốn, Con → Xôi).

Delivery windows: 06:30, 07:00, 07:30, 08:00 (configurable).

- Preorder typically **prepaid** (`PREPAY_REQUIRED`)
- Provider sees demand early; fulfillment plans routes early

**Sprint:** S15

---

## Breakfast instant (§63)

Morning live items: phở, bún, miến, xôi, bánh mì, bánh cuốn, cháo, …

Live signals: open, accepting, prep time, delivery ETA.

**Sprint:** S16

---

## Lunch (§64)

Initial scope: cơm suất, bún, miến, phở, món nhanh. Do not overbuild if demand is low.

---

## Dinner planning (§65)

14:00–16:00 block: **TỐI NAY NHÀ MÌNH ĂN GÌ?**

Paths:

- MÂM CƠM LÀM SẴN (family meals)
- MÓN MẶN + CANH
- MEAL KIT / NGUYÊN LIỆU SƠ CHẾ
- GROCERY / CHỢ

**Sprint:** S17

---

## Family meals (§66)

Provider-created combo offerings (e.g. canh cua + thịt rang; cá kho + nem + canh).

Picki does **not** taste-test or claim "best". Quality signals from:

- Community reviews
- Repeat orders
- Complaints
- Reorder behavior

Payment: typically `PREPAY_REQUIRED`.

---

## Food quality gate (§67)

Picki verifies:

- Provider identity
- Location and operating conditions
- Required documents (category-dependent)

Picki does **not** judge taste. Fail operating requirements → `NOT_ACTIVE` / not public.

---

## Home cook (§68)

Supported provider type (`HOME_COOK`).

Example pattern: daily cap (20 mâm), cutoff 16:00, delivery 17:30–19:00. Must pass verification before public.

---

## Food provider types (§69)

```
RESTAURANT
FOOD_STALL
HOME_COOK
MARKET_VENDOR
SUPERMARKET
MINIMART
GROCERY
BRAND_STORE
```

Mapped to generic `providers` + `provider_categories`—not a parallel Food-only entity model.

---

## Grocery & daily goods (§70)

Milk, water, produce, meat, diapers, household goods, etc.

Support **BUY_AGAIN** from household order history.

---

## Traditional market (§71)

Do not digitize entire market. Onboard selected vendors with structured offerings (e.g. "Gà ta làm sạch 1.4–1.6 kg" with options: Chặt / Để nguyên).

---

## Menu options (§72)

Generic `option_groups` + `options`—not phở-specific tables.

Example phở options: loại thịt, kiểu, extras (quẩy, trứng, thêm thịt). Same pattern works for other dishes.

---

## Signature offerings & daily specials (§73–74)

| Feature                 | Storage               | Behavior                                                                         |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------- |
| **Signature offerings** | `signature_offerings` | Provider-declared highlights; behavior confirms                                  |
| **Daily specials**      | `daily_specials`      | `offering_id`, `available_date`, `quantity`, `starts_at`, `ends_at`; auto-expire |

---

## Snacks / street food (§75)

Official food group: ốc, chè, kem, bánh chuối, khoai, ngô, nem chua rán, …

Capabilities: `LIVE_AVAILABILITY`, `LIMITED_QUANTITY`, `DAILY_SPECIAL`, `INSTANT_DELIVERY`, `PICKI_POINT`

**Sprint:** S18

---

## Late night & weekend (§76–77)

**Late night discovery:** đồ ăn khuya, nhà thuốc mở, sữa/bỉm, minimart, sửa khóa, điện nước, giao đồ.

**Weekend:** nhà hàng, cafe, quán bia, mâm cơm, đi chợ. Dine-in may be `LISTING` + `LIVE_STATUS` + `CONTACT` only—no mandatory booking/payment.

---

## Interaction modes (§78)

```
DISCOVER | CONTACT | DINE_IN | TAKEAWAY | DELIVERY | PREORDER | PICKI_POINT
```

Provider enables subset per location.

---

## Payment policy by offering (§79)

| Policy             | Typical use                                      |
| ------------------ | ------------------------------------------------ |
| `PREPAY_REQUIRED`  | Preorder, family meals, made-to-order, home cook |
| `PREPAY_PREFERRED` | Instant food                                     |
| `COD_ALLOWED`      | Milk, packaged grocery, retail                   |

Configurable per offering/Zone—not global hard-code.

---

## Pilot scope (P1 checklist)

Must have for Food MVP:

- [ ] Zone discover + join + Level-1 address
- [ ] ~10 food providers with locations in pilot Zone
- [ ] Offerings + options + pricing (integer VND)
- [ ] Preorder (breakfast) + instant (breakfast/lunch)
- [ ] Order state machine + payment adapter
- [ ] Runner + route + lobby batching where applicable
- [ ] Rule-based discovery (no AI, no social feed)
- [ ] Customer Web/PWA (S24)—Mini App later

See `PICKI_MVP_SCOPE.md` for pilot KPIs and sprint order.

---

## Related docs

- `PICKI_PROVIDER_SPEC.md` — provider/location model
- `PICKI_FULFILLMENT_SPEC.md` — delivery and batching
- `PICKI_STATE_MACHINES.md` — order states
- `DECISIONS.md` — ADR-028, ADR-031, ADR-032
