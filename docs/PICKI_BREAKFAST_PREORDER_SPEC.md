# Picki Breakfast Preorder — Sáng mai ăn gì?

**Status:** Phase 1 shipped lean (2026-09-17) — ADR-047  
**Add-on to:** `PICKI_FOOD_SPEC.md` §61–62 · `PICKI_MASTER_SPEC.md`

## Positioning

**Sáng mai ăn gì?** — preorder tối hôm trước, giao khung sáng hôm sau.

Cùng **pattern vận hành** với Bữa tối ấm cúng (daily menu · copy hôm trước · mở nhận · cutoff · thống kê số lượng), khác:

- Món chọn từ **catalog offerings** của quán (không meal-builder 4 nhóm)
- Luôn **Nấu sẵn** — không Tự nấu
- Cutoff trên **đêm trước** ngày giao (gợi ý 23:30; provider tự set)
- Mở nhận gợi ý **20:00**

Không tách «phân phối» vs «quán». Quán bún/phở/bánh mì: preorder sáng + bán instant cả ngày trên cùng tài khoản Food.

## Phase 1 (ship)

- Settings: `enabled`, `cutoff_time` (default 23:30), `open_from_time` (default 20:00), `daily_capacity`
- Daily menu + items (`offering_id` + snapshot tên/giá) + morning delivery windows
- Copy menu gần nhất / auto-copy nếu thiếu
- Customer: `/breakfast` · chọn món · khung giao · **PREPAY 100%**
- `orders.order_kind = BREAKFAST_PREORDER` · cook-first fulfillment
- Provider tab **Sáng mai** · thống kê số lượng sau chốt (nhập hàng)
- Seed **Phở Gà Kim Văn** (`pho-ga-kim-van`), login `0908888015`

## Rules

| Rule | Value |
|------|--------|
| Payment | PREPAY (`PAY_ON_PICKI`) bắt buộc |
| Prep | READY_COOKED only |
| Flow | Quán nhận → Sẵn sàng → Tìm runner (hoặc tự giao) → … (không bước Nấu) |
| Cutoff | Per provider; evening before `service_date` |
| Open from | Per provider (default 20:00) |
| Delivery slots | 15 phút; mặc định 06:00–08:30; provider set start/end khi đăng menu |
| Menu source | Offerings của location |
| Discovery | Chỉ `enabled` + menu PUBLISHED + trong cửa sổ nhận |

Hiển thị **khung giao** trên customer + provider + runner.

## Out of Phase 1

- Góc ăn khuya / Bán khuya (phase sau)
- Recipe / inventory / production lock nâng cao
- Self-cook
- Tách distributor account

```bash
bash scripts/db-seed-breakfast.sh
BF_SEED_DEMO=1 bash scripts/db-seed-breakfast.sh
```
