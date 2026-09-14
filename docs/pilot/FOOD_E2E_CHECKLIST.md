# Pilot Food KVL — E2E Checklist

Zone: **Kim Văn – Kim Lũ** (`kim-van-kim-lu`)  
Stack local: API `:3000` · Web `:3001` · `bash scripts/start-local.sh`

## Demo accounts

| Vai trò | SĐT | App |
|---------|-----|-----|
| Customer | `0901234567` | http://localhost:3001/login |
| Provider | `0908888001` | http://localhost:3001/provider/login |
| Runner | `0908888002` | http://localhost:3001/runner/login |
| Admin | `0908888003` | http://localhost:3001/admin/login |

Demo quán: **Cơm Tấm Kim Văn** (`com-tam-kim-van`)

---

## Chạy tự động (API)

```bash
# Terminal 1
bash scripts/start-local.sh

# Terminal 2 — sau khi API Ready
pnpm pilot:e2e
# hoặc: bash scripts/pilot-food-e2e.sh
```

Script kiểm tra: health → seed data → login 4 role → join Zone (nếu cần) → đặt COD → full loop đến **DELIVERED** → lịch sử Provider/Runner → hủy đơn test.

Exit `0` = pass · exit `1` = fail (in lý do).

Tuỳ chọn:

```bash
bash scripts/pilot-food-e2e.sh --skip-cancel   # bỏ test hủy đơn
bash scripts/pilot-food-e2e.sh --api http://localhost:3000/v1
```

---

## Checklist thủ công (UI — 3 tab)

Dùng sau khi script pass, hoặc khi cần verify giao diện / PWA / push.

### A. Chuẩn bị

- [ ] Docker Postgres chạy · `pnpm db:seed` đã chạy
- [ ] API log: `Picki API listening on :3000`
- [ ] Web log: `Ready` trên `:3001`
- [ ] Hard refresh hoặc tab ẩn danh (tránh SW cũ)

### B. Flow COD chính (Grab-like)

| # | Tab | Việc | Pass khi |
|---|-----|------|----------|
| 1 | Customer | Login → Home KVL → Cơm Tấm → thêm món → Checkout: **chọn địa chỉ** + **Nhận tại sảnh** hoặc **Giao tận căn** → **COD** | Đặt thành công |
| 2 | Provider | Login → chọn **Cơm Tấm Kim Văn** → **Nhận đơn & tìm runner** | Badge "Đang chờ runner" |
| 3 | Runner | Login → **Đơn chờ nhận** → **Nhận giao** | Route / đơn của tôi |
| 4 | Provider | Làm mới → **Bắt đầu nấu** → **Sẵn sàng** → **Đã giao cho runner** | Không lỗi |
| 5 | Runner | Route: lấy hàng → giao → **Hoàn thành** (hoặc nút trên đơn) | Status giao |
| 6 | Customer | Trang đơn → **Đã giao** · chat đóng | Steps xanh hết |
| 7 | Provider | Tab **Lịch sử** | Đơn hiện |
| 8 | Runner | Tab **Lịch sử** | Đơn hiện |

### C. Hủy đơn (Customer)

- [ ] Đặt đơn mới COD
- [ ] Trang đơn → **Hủy đơn** (trước khi quán nấu)
- [ ] Admin → **Audit** → thấy log

### D. Thanh toán PayOS (khi đã cấu hình)

- [ ] Checkout → **Thanh toán trên Picki**
- [ ] QR VietQR hiện · sau chuyển khoản → **PAID**
- [ ] Provider mới nhận được đơn

Xem canvas: [PayOS KVL Pilot](/Users/vcomms/.cursor/projects/Volumes-DATA-PICKI/canvases/payos-kvl-pilot.canvas.tsx)

### E. Push Runner (khi VAPID bật)

- [ ] Restart với `.env` VAPID + `NEXT_PUBLIC_ENABLE_PUSH=true`
- [ ] Runner → Cài đặt → **Gửi push thử**
- [ ] Provider tìm runner → Runner nhận popup (PWA đóng)

### F. Admin Ops

- [ ] Dashboard: đơn active / tổng quan
- [ ] Đơn hàng: list + **Hủy (ops)** trên đơn stuck (nếu cần)
- [ ] Audit: log thao tác

---

## KPI pilot (tham chiếu)

| KPI | Target |
|-----|--------|
| Completion | ≥ 95% |
| Provider acceptance | ≥ 95% |
| Cancellation | < 5% |
| Runner assignment p50 | ≤ 60s |

Ghi kết quả test vào sheet ops sau mỗi tuần pilot.

---

## Troubleshooting nhanh

| Triệu chứng | Cách xử lý |
|-------------|------------|
| Provider "Not a staff member" | `pnpm db:seed` · login `0908888001` · xóa localStorage `picki-provider-location` |
| Nút Provider cũ "Nhận đơn" | Unregister SW · hard refresh |
| Runner không thấy đơn | Provider phải **Nhận & tìm runner** · Runner **AVAILABLE** |
| "Runner phải nhận trước khi nấu" | Runner tab → Nhận giao trước |
| Route: không bấm được **Đã lấy hàng** | Quán phải **Nấu → Sẵn sàng → Đã giao cho runner** trên **tất cả đơn** trong route (batch) |
| Runner lên căn sau khi khách nhận sảnh | Khách phải chọn **Nhận tại sảnh** lúc checkout; runner bấm **Đã giao** tại sảnh (không lên căn) |
| `RUNNER_ASSIGNED → PICKED_UP` | Cùng nguyên nhân — pickup chỉ được sau khi quán bàn giao |
| API unreachable | `bash scripts/start-local.sh` · port 3000 free |
