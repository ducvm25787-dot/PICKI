# Pilot Family Dinner KVL — E2E Checklist

Zone: **Kim Văn – Kim Lũ** (`kim-van-kim-lu`)  
Stack local: API `:3000` · Web `:3001` · `bash scripts/start-local.sh`

## Demo accounts

| Vai trò | SĐT | App |
|---------|-----|-----|
| Customer | `0901234567` | http://localhost:3001/login |
| Provider (Bếp) | `0908888014` | http://localhost:3001/provider/login |
| Runner | `0908888002` | http://localhost:3001/runner/login |

Demo bếp: **BẾP NHÀ LAN** (`bep-nha-lan`) — seed `bash scripts/db-seed-family-dinner.sh`

- Mặc định: reset trống (bếp tạo menu trên UI).
- Demo nhanh: `FD_SEED_DEMO=1 bash scripts/db-seed-family-dinner.sh` (menu + nhận đơn, cutoff `23:59`).

---

## Chạy tự động (API)

```bash
# Terminal 1
bash scripts/start-local.sh

# Terminal 2 — sau khi API Ready + đã seed bếp
bash scripts/db-seed-family-dinner.sh   # hoặc FD_SEED_DEMO=1 …
pnpm pilot:family-dinner:e2e
# hoặc: bash scripts/pilot-family-dinner-e2e.sh
```

Script tự: đăng menu E2E → mở nhận đơn (cutoff tương lai) → khách PREPAY + `dev-confirm` → bếp nhận → kéo cutoff quá khứ → nấu → sẵn sàng → **Tìm runner** → runner nhận (giữ `READY`) → bàn giao → giao → `DELIVERED` → lịch sử → hủy đơn PAID.

Tuỳ chọn:

```bash
bash scripts/pilot-family-dinner-e2e.sh --skip-cancel
bash scripts/pilot-family-dinner-e2e.sh --staff-deliver   # Tự giao (không runner)
bash scripts/pilot-family-dinner-e2e.sh --api http://localhost:3000/v1
```

Exit `0` = pass · exit `1` = fail.

---

## Checklist thủ công (UI)

### A. Chuẩn bị

- [ ] `bash scripts/db-seed-family-dinner.sh` (hoặc `FD_SEED_DEMO=1`)
- [ ] API `:3000` · Web `:3001`
- [ ] Hard refresh / tab ẩn danh

### B. Provider — đăng menu + mở nhận

| # | Việc | Pass khi |
|---|------|----------|
| 1 | Provider login `0908888014` → **Bữa tối** | Trang ops |
| 2 | Đăng đủ nhóm MAIN / SIDE / VEGETABLE / SOUP / RICE | Menu PUBLISHED |
| 3 | Mở giờ chốt (cutoff tương lai) | Nhận đơn bật · countdown |
| 4 | Sau cutoff: CTA **Kế hoạch nấu** sáng · **Bắt đầu nấu** mờ đến khi qua cutoff | Đúng gate |

### C. Customer — meal builder + PREPAY

| # | Tab | Việc | Pass khi |
|---|-----|------|----------|
| 1 | Customer | Home → **Bữa tối ấm cúng** → Bếp Nhà Lan | Menu + khung giờ |
| 2 | | Chọn ≥1 MAIN/SIDE/VEG/SOUP · cơm ×2 · (tuỳ) Tự nấu | Title / giá cơm +5k/suất thêm |
| 3 | | Checkout → địa chỉ · sảnh · thanh toán Picki | Đặt OK |
| 4 | | Dev: confirm payment (hoặc QR) | Status **PAID** |

### D. Cook-first + runner

| # | Tab | Việc | Pass khi |
|---|-----|------|----------|
| 1 | Provider | **Nhận đơn** | `PROVIDER_ACCEPTED` · **không** ép runner |
| 2 | Provider | Sau cutoff → **Bắt đầu nấu** → **Sẵn sàng** | `READY` |
| 3 | Provider | **Tìm runner** (hoặc **Tự giao**) | Pool / DELIVERING |
| 4 | Runner | **Đơn chờ** → nhận (không cần «Nhận giao» sớm) | Claim khi READY |
| 5 | Provider | **Đã giao cho runner** | Handoff |
| 6 | Runner | Lấy → giao → hoàn thành (route auto DELIVERED) | Không cần bấm Đã giao lần 2 |
| 7 | Customer | Đơn → **Đã giao** | Steps xanh |

### D2. Kế hoạch nấu / tự nấu / chép menu

- [ ] Menu: **Chép menu gần nhất** đổ form (chưa publish) hoặc banner «lấy từ ngày …» khi auto-copy
- [ ] Kế hoạch nấu: số lượng dạng `nấu sẵn X · tự nấu Y` + block **Theo khung giao**
- [ ] Sau chốt: phần tự nấu vẫn hiện; **còn** = chỉ suất nấu sẵn (không vào kho tối muộn)

### E. Tối muộn + hủy

- [ ] Chốt nấu → Tối muộn: ETA, max suất theo món chọn, **Đóng mâm** hoàn suất
- [ ] Customer: `/family-dinner` → mâm muộn → ETA rõ · PREPAY
- [ ] Hủy đơn khi còn PAID (trước nấu) → `CUSTOMER_CANCELLED`

### F. Seed recreate

- [ ] `bash scripts/db-seed-family-dinner.sh` → menu trống, nhận tắt
- [ ] Provider tạo lại menu trên UI không lỗi

---

## Liên quan

- Spec: [`docs/PICKI_FAMILY_DINNER_SPEC.md`](../PICKI_FAMILY_DINNER_SPEC.md)
- Food E2E: [`FOOD_E2E_CHECKLIST.md`](./FOOD_E2E_CHECKLIST.md)
- Zone: [`KIM_VAN_KIM_LU.md`](./KIM_VAN_KIM_LU.md)
