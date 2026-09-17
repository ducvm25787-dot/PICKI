# Visual V1 — theme + layout + icons

**Status:** shipped lean (2026-09-17) · category browse 2026-09-18  
**Goal:** polish Web/PWA trước pilot rộng / onboarding bếp thật — **không** đổi business logic.

## Direction: Zone Citrus

Tham chiếu layout marketplace (search → hero → quick grid → chip row → sections), **không** copy palette tím.

| Token | Value |
|-------|--------|
| Accent | `#e85d04` / dark `#c2410c` |
| Surface | parchment `#f3f0ea` + soft citrus wash |
| Ink | `#1c1917` |
| Provider | `#2d6a4f` |
| Runner | `#1d4ed8` |
| Fonts | **Be Vietnam Pro** (UI) + **Sora** (logo / titles) |
| Icons | SVG line set (`nav-icons.tsx`) + PWA PNG 192/512 |

## Surfaces

- Customer home: search → hero → quick tiles → **Tiện ích quanh nhà** (9 danh mục, gồm Thể thao) → chips → sections
- Browse: `/zones/:slug/browse/:category` — filter `provider_type` (`lib/categories.ts`)
- «Xem thêm» discovery → đúng danh mục / deep link (không search chung)
- Discovery food moments: **bắt buộc** `offerings.food_moment` khớp (không còn fallback mọi quán)
- «Sáng mai» block: chỉ quán bật breakfast preorder + đang nhận đơn
- Provider cards: `logoUrl` hoặc chữ cái đầu
- Bottom nav Customer / Provider / Runner: SVG
- Login: `BrandMark`

## Regenerate PWA icons

```bash
bash scripts/generate-pwa-icons.sh
# or: pnpm pwa:icons
```

## Out of this sprint

- Tab Giới thiệu provider (phase 4)
- Beauty sub-service tags — hiện filter `BEAUTY` only
- Full photo catalog / promo CMS
- Dark mode
- Native / Zalo skins
