# Visual V1 — theme + layout + icons

**Status:** shipped lean (2026-09-17) · category browse 2026-09-18 · **Pickee brand Phase A 2026-09-18**  
**Goal:** polish Web/PWA trước pilot rộng / onboarding bếp thật — **không** đổi business logic.

## Direction: Zone Citrus × Pickee Op2

Tham chiếu layout marketplace (search → hero → quick grid → chip row → sections), **không** copy palette tím.  
Brand: **pickee** + tagline **Tiện ích quanh tôi** — logo symbol gradient cam→đỏ (`public/brand/`).

| Token | Value |
|-------|--------|
| Accent | `#e85d04` / dark `#c2410c` (+ brand gradient `#ff8a1f` → `#d62828`) |
| Surface | parchment `#f3f0ea` + soft citrus wash |
| Ink | `#1c1917` |
| Provider | `#2d6a4f` |
| Runner | `#1d4ed8` |
| Fonts | **Be Vietnam Pro** (UI) + **Sora** (logo / titles) |
| Icons | SVG line set (`nav-icons.tsx`) + PWA PNG từ `public/brand/symbol.png` |

## Surfaces

- Customer home: search → hero → quick tiles → **Tiện ích quanh nhà** (10 danh mục, gồm Thể thao + Xe đưa đón) → chips → sections
- BrandMark: symbol PNG + gradient wordmark **pickee**
- Location tabs: **Menu/Dịch vụ** + **Giới thiệu** (ảnh, mô tả, địa chỉ, maps, rating, liên hệ)
- **Admin Zone Setup:** `/admin/zones/:id` — polygon editor, CORE/EXTENDED, neo GPS, xác nhận pin shop
- **Map Phase 2:** Leaflet/OSM Live Map + Zone polygon; Chỉ đường **trong Pickee** (`/navigate`, OSRM, Bắt đầu) — mode **Đi bộ / Xe máy / Xe đạp** (gợi ý theo khoảng cách); Google Maps fallback; GPS follow chỉ khi đang dẫn đường
- Provider Cài đặt: sửa tagline / mô tả / logo / cover
- Browse: `/zones/:slug/browse/:category` — filter `provider_type` (`lib/categories.ts`)
- «Xem thêm» discovery → đúng danh mục / deep link (không search chung)
- Discovery food moments: **bắt buộc** `offerings.food_moment` khớp (không còn fallback mọi quán)
- «Sáng mai» block: chỉ quán bật breakfast preorder + đang nhận đơn
- Provider cards: `logoUrl` hoặc chữ cái đầu
- Bottom nav Customer / Provider / Runner: SVG
- Login: `BrandMark`

## Regenerate PWA icons

```bash
# From brand symbol (preferred after rebrand):
# node script in /tmp using sharp — or re-run Phase A icon pipeline
bash scripts/generate-pwa-icons.sh   # SVG fallback (legacy pin)
```

Logo sources: `apps/web/public/brand/` (`symbol.png`, lockups). Raw exports may keep `*-raw.png`.

## Out of this sprint

- Beauty sub-tags (filter chips)
- Full technical rename `@picki/*` / DB (ADR-050 Phase B)
- Beauty sub-service tags — hiện filter `BEAUTY` only
- Full photo catalog / promo CMS
- Dark mode
- Native / Zalo skins
