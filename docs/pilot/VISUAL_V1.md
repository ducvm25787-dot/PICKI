# Visual V1 — theme + layout + icons

**Status:** shipped lean (2026-09-17)  
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

- Customer home: search pill, Family Dinner hero, 4 quick tiles, horizontal chips, section heads «Xem thêm»
- Bottom nav Customer / Provider / Runner: SVG (no emoji)
- Login Customer / Provider / Runner: `BrandMark`
- Role shells inherit accent via `.provider-app` / `.runner-app`

## Regenerate PWA icons

```bash
bash scripts/generate-pwa-icons.sh
# or: pnpm pwa:icons
```

## Out of this sprint

- Full photo catalog / promo CMS
- Per-vertical illustration packs
- Dark mode
- Native / Zalo skins
