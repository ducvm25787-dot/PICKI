# Picki Family Dinner — Bữa tối ấm cúng

**Status:** Phase A–D IMPLEMENTED lean (2026-09-16) — ADR-046  
**Add-on to:** `PICKI_MASTER_SPEC.md` §65–68

## Positioning

**Bữa tối ấm cúng** — *Tối nay nhà mình ăn gì?*  
Household dinner planning: chọn provider → build mâm theo menu ngày → chọn khung giao → **PREPAY** → provider nấu theo đơn → (sau cutoff) có thể mở **Bữa tối muộn**.

Không phải restaurant delivery tức thì. Không combo mâm cố định do Picki áp. Recipe Engine **deterministic** — không LLM.

## Phase A (customer path)

- Provider settings: `enabled`, `cutoff_time` (per location)
- Daily menu: MAIN≤5 · SIDE≤4 · VEGETABLE≤3 · SOUP≤3 · EXTRA tùy
- Delivery windows + capacity
- Meal builder ≥1 mỗi nhóm bắt buộc; không min VND
- `orders.order_kind = FAMILY_DINNER` + `service_date` + `delivery_window_id`
- Payment `PAY_ON_PICKI`
- Discovery `/family-dinner` + homepage card
- Seed **Bếp Nhà Lan** (`bep-nha-lan`), login `0908888014`

## Phase B (provider ops)

- Provider Web tab **Bữa tối** (`/provider/family-dinner`)
- Settings: cutoff, daily capacity, buffer %
- Sold-out / pause món trong ngày
- Production dashboard: tổng phần theo món + theo khung (đơn PAID)
- Lock production sau cutoff (manual hoặc worker)
- `orders.production_locked_at` — customer không tự hủy sau lock

## Phase C (recipe engine)

- `ingredient_master` + `provider_recipes` + versions + `recipe_ingredients`
- Menu item gắn `recipe_version_id`; order line snapshot version
- Procurement: net → gross (yield%) → to_buy = max(gross − on_hand, 0)
- Inventory snapshot theo ngày; provider nhập on_hand

## Phase D (late dinner)

- Sau batch `LOCKED`, provider tạo **mâm bán nhanh** từ `remaining_quantity`
- Capacity offer = min(remaining / qty_per_tray) across dishes
- `order_kind = LATE_DINNER` + atomic decrement offer + remaining
- Vẫn PREPAY

## Rules

| Rule | Value |
|------|--------|
| Base meal | ≥1 MAIN + SIDE + VEGETABLE + SOUP |
| Extra | Sau khi đủ 4 nhóm |
| Payment | PREPAY |
| Cutoff | Per provider |
| Soft warn | >10 món — UI only |
| Cancel | Block khi `production_locked_at` |
| Recipe | Deterministic; không LLM |

## Seed / migrate

```bash
# migration 0042 + 0043
pnpm --filter @picki/db migrate   # or project migrate script
bash scripts/db-seed-family-dinner.sh
```

## Out of V1 lean

- AI forecast / menu suggestion
- Advanced route solver mới (reuse Route/Lobby hiện có)
- Copy-yesterday UX sâu / ranking “bếp hay dùng”
- Packaging fee / platform discount
