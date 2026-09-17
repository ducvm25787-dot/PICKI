# Góc ăn khuya — Bán khuya

**Status:** Phase 1 lean (2026-09-18) — ADR-048  
**Add-on to:** `PICKI_FOOD_SPEC.md` §61 · §76 late night

## Positioning

**Góc ăn khuya** — discovery tối/đêm gom quán Food **opt-in Bán khuya**, đang trong khung giờ (đến giờ kết thúc do quán set).

Không preorder. Đặt = đơn Food **STANDARD** qua menu quán như ban ngày.

## Phase 1

- Settings per location: `enabled`, `starts_at` (default 20:30), `ends_at` (default 02:00, overnight OK)
- Provider: bật/tắt + sửa giờ trên tab **Trạng thái** (live)
- Discovery block **ĂN KHUYA** + trang `/late-night` chỉ list quán `enabled` + đang trong khung + live OPEN/BUSY
- Seed demo: bật bán khuya trên **Phở Gà Kim Văn** (đến 02:00)

## Rules

| Rule | Value |
|------|--------|
| Opt-in | Provider bật «Bán khuya» |
| End time | Provider set (gợi ý 02:00) |
| Start | Default 20:30 (provider có thể sửa) |
| Order | STANDARD Food menu |
| Discovery | Chỉ khi trong khung + live OPEN/BUSY |

## Out of V1 lean

- Menu khuya tách / flag món riêng
- Preorder khuya
- Tiện ích đêm non-food trong cùng block (nhà thuốc / sửa khóa — phase sau)
