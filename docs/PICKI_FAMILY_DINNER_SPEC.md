# Picki Family Dinner — Bữa tối ấm cúng

**Status:** Phase A–D IMPLEMENTED lean (2026-09-16) — ADR-046  
**Add-on to:** `PICKI_MASTER_SPEC.md` §65–68

## Positioning

**Bữa tối ấm cúng** — *Tối nay nhà mình ăn gì?*  
Household dinner planning: chọn provider → build mâm theo menu ngày → chọn khung giao → **PREPAY** → provider nấu theo đơn → (sau cutoff) có thể mở **Bữa tối muộn**.

Không phải restaurant delivery tức thì. Không combo mâm cố định do Picki áp. Recipe Engine **deterministic** — không LLM.

## Phase A (customer path)

- Provider: đăng menu trước → rồi mới «Mở nhận đơn tới giờ này» (cutoff 1 lần) → countdown chạy; discovery chỉ hiện bếp `enabled`
- Daily menu: MAIN≤10 (khuyến nghị 5) · SIDE≤10 (khuyến nghị 5) · VEGETABLE≤5 (khuyến nghị 3) · SOUP≤5 (khuyến nghị 3) · RICE≤5 (khuyến nghị 2) · EXTRA tùy
- Khách chọn ≥1 MAIN/SIDE/VEGETABLE/SOUP; Cơm tuỳ chọn (mua hoặc tự nấu)
- Prep mode: mặc định **Nấu sẵn**; provider tick cho phép **Tự nấu** (MAIN/SIDE/VEGETABLE/SOUP); **cùng giá** V1
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

## Buffer mua sáng % (Phase C — ẩn trên UI provider)

Chỉ dùng khi bếp bật procurement: % nguyên liệu mua sớm trước cutoff (vd 60% forecast).
Pilot không cần — đã ẩn khỏi tab Bữa tối. Giữ cột DB cho Phase C nâng cao.

```bash
# migration 0042–0045
pnpm --filter @picki/db migrate   # or project migrate script
bash scripts/db-seed-family-dinner.sh
# Demo menu + receiving: FD_SEED_DEMO=1 bash scripts/db-seed-family-dinner.sh

# API E2E (cook-first PREPAY + runner sau READY)
pnpm pilot:family-dinner:e2e
# Checklist UI: docs/pilot/FAMILY_DINNER_E2E_CHECKLIST.md
```

## Out of V1 lean

- AI forecast / menu suggestion
- Advanced route solver mới (reuse Route/Lobby hiện có)
- Ranking “bếp hay dùng” / packaging fee / platform discount

**Polish (post A–D, không phase mới):** late dinner ETA + đóng mâm + max capacity; kế hoạch nấu tách nấu sẵn/tự nấu + theo khung; «Chép menu gần nhất» + banner auto-copy.
