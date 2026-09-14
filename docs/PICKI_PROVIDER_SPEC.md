# Picki Provider Spec

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

Provider is the **generic supply-side entity** for all verticals (ADR-020). Not "Shop". Food-specific logic must not make `providers` / `offerings` Food-only.

---

## Provider vs Provider Location (§37)

```
PROVIDER (brand / business identity)
├── Master Profile
├── Brand assets
├── Master Catalog
│
└── LOCATIONS (1..N)
     ├── Location A (Zone 1)
     ├── Location B (Zone 2)
     └── ...
```

| Entity                | Holds                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| **Provider**          | Brand name, type, master catalog, brand reputation, verification at business level                    |
| **Provider Location** | Physical address, map pin, hours, live status, location reviews, zone memberships, fulfillment config |

Commerce, live status, and reviews reference **`provider_location_id`**.

---

## Provider types (§34, §69)

Examples (extensible enum—not Food-only):

```
RESTAURANT, FOOD_STALL, HOME_COOK, SUPERMARKET, MINIMART, MARKET_VENDOR,
RETAIL_STORE, LAUNDRY, CLEANER, TECHNICIAN, SALON, SPA, NAIL,
TUTOR, EDUCATION_PROVIDER, PET_SERVICE, HEALTH_PROVIDER,
INDIVIDUAL, COMPANY
```

---

## Multi-location & multi-Zone (§38–39)

- One Provider → 1..N Locations
- One Location → 1..N Zones (via `provider_zone_memberships` + serviceability)

### Open another location flow

```
[+ MỞ THÊM ĐỊA ĐIỂM]
  → Choose Zone
  → Choose physical location
  → Clone from existing location (optional)
  → Edit differences
  → Submit location verification
  → ACTIVE (when verified)
```

Opening Zone 2 must **not** require rebuilding entire profile/catalog (architecture acceptance test #12).

---

## Location cloning (§40)

When opening a new location, operator selects items to copy:

- Profile, logo, images
- Menu / catalog, prices, options
- Signature offerings
- Opening hours
- Service modes
- Operational configuration

Then edit differences before submit. No re-entry of hundreds of fields.

---

## Opening vs relocating (§41)

| Action           | Old location                                   | New location                                 |
| ---------------- | ---------------------------------------------- | -------------------------------------------- |
| **Open another** | Stays `ACTIVE`                                 | `ACTIVE` or `PENDING_VERIFICATION` alongside |
| **Relocate**     | `ACTIVE` → `RELOCATING` → `CLOSED`/`RELOCATED` | Verified → `ACTIVE`                          |

Never delete location history.

---

## Location overrides (§42)

Master catalog shared at Provider level. Each Location may override:

- Price
- Availability / `NOT_AVAILABLE`
- Menu item visibility
- Opening hours
- Capacity
- Service modes

Example: Master "Phở tái 45k" → Location B "50k"; Location C "NOT_AVAILABLE" for "Sốt vang".

Stored in `location_catalog_overrides` (and related price/availability tables).

---

## Verification (§43)

| Level        | Checks                                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| **Provider** | Identity, business information, documents where applicable                            |
| **Location** | Physical existence, operational address, service area, category-specific requirements |

Opening a new location does **not** re-verify entire provider identity if still valid.

Provider and Runner require **stronger verification** before public / work (vs progressive customer verification).

---

## Provider status (§44)

**Provider-level:**

```
DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE → PAUSED | SUSPENDED → CLOSED
```

**Location-level:** separate status column/lifecycle (includes `PENDING_VERIFICATION`, `RELOCATING`, etc.).

Not public before category `verification_requirements` are met.

---

## Reputation vs location reviews (§45)

| Signal                  | Scope           | Example                     |
| ----------------------- | --------------- | --------------------------- |
| **Provider Reputation** | Brand aggregate | PHỞ HÙNG 4.8★               |
| **Location Reviews**    | Per location    | Đại Kim 4.9★, Linh Đàm 4.6★ |

- Reviews do **not** copy from old location to new location
- New location may show: "Thương hiệu 4.8★ · Địa điểm mới"

---

## Onboarding philosophy (§35–36)

**Picki-native. Simple. No scraping/import in V1** (ADR-026, ADR-027).

Forbidden V1: bulk import from Grab, ShopeeFood, Google Maps, Facebook.

Basic create form:

- Tên, loại hình, địa chỉ, map location
- Giờ hoạt động, logo/ảnh, mô tả ngắn
- Sản phẩm/dịch vụ chính, cách hoạt động

Goal: creating a store on Picki is **simpler** than large marketplaces. Small providers must not face hundreds of required fields.

Assets uploaded to Picki storage (`assets`)—not hotlinked from external marketplaces (ADR-038).

---

## Engagement modes (§47)

Providers enable only the capabilities they need:

```
LISTING          — browse-only presence
LIVE_STATUS      — availability / wait signals
CONTACT          — Chat / Zalo
QUEUE_STATUS     — simple wait (beauty)
BOOKING          — scheduled appointments
LEAD             — capture interest
COMMERCE         — cart/checkout orders
PREORDER         — scheduled fulfillment
DELIVERY         — Picki delivery
PICKUP_AND_RETURN — laundry-style flows
CLASSIFIED       — listing/reserve
PICKI_POINT      — handoff at collection point
```

One provider may enable multiple modes. Do not force one workflow for all categories.

Examples:

- Dine-in restaurant weekend: `LISTING` + `LIVE_STATUS` + `CONTACT` only—no booking/payment required
- Full food shop: `COMMERCE` + `DELIVERY` + `PREORDER`
- Salon: `LISTING` + `LIVE_STATUS` + `CONTACT` + `QUEUE_STATUS`

---

## Provider page (§46)

Each **Provider Location** has its own public page.

Template varies by enabled capabilities; typical blocks:

- Cover, Picki Verified badge, live status, prep/wait ETA
- Star rating (location), household usage / repeat signals
- Services + prices
- Signature offerings
- Actions: Chat, Zalo, Directions

Trust signals: verified reviews, repeat usage counts (aggregate—no private household exposure).

---

## Live availability (§50, ADR-028)

Generic states:

```
AVAILABLE_NOW | SHORT_WAIT | BUSY | NOT_ACCEPTING | CLOSED
```

Optional: `estimated_wait_minutes`, `estimated_prep_minutes`, `estimated_arrival_minutes`, `last_updated_at`

Provider live status UX must stay **simple** (§52)—especially for small shops and technicians.

---

## Ranking & discovery (§54–55, ADR-029)

When many similar providers exist, ranking uses multiple signals:

- Relevance: micro-area proximity, serviceability, category fit
- Trust: verified reviews, repeat orders, complaint rate
- Fairness: exposure for new providers

Search expansion (§49): closest micro-area → Zone → Shared Service Area → adjacent Zone if needed. Do not surface 3 km providers when 500 m options suffice.

---

## Sprint mapping

| Sprint | Scope                              |
| ------ | ---------------------------------- |
| S8     | Provider + Location + Verification |
| S9     | Cloning + multi-Zone               |
| S10    | Catalog + Offering                 |
| S11    | Live Availability                  |
| S13    | Reviews + Favorites                |

---

## Related docs

- `PICKI_FOOD_SPEC.md` — food provider types and rhythms
- `PICKI_SERVICES_SPEC.md` — non-food capability composition
- `PICKI_DATABASE_SPEC.md` — provider domain tables
- `DECISIONS.md` — ADR-020 through ADR-029
