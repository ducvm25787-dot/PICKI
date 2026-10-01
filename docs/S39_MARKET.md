# S39 — Đi chợ (Minimart / Tạp hóa / Chợ)

**Status:** Market commerce V1 dùng chung offering, giỏ, đơn STANDARD và runner (2026-10-01). ADR-044 mục “không giỏ” không còn áp cho tiểu thương / tạp hóa khi `SELL_NOW` bật. Siêu thị V1 vẫn tắt bán.  
**Capability:** `LISTING` + `LIVE_STATUS` + `CONTACT`, cộng `SELL_NOW` / `DELIVERY` / `TODAY_FEATURE` theo capability.  
**Không:** digitization chợ truyền thống đầy đủ, engine sơ chế riêng, schema catalog riêng cho siêu thị.

**Debt — giá 0:** `amount_vnd = 0` kèm `QUOTE_REQUIRED` / `FROM` vẫn là cờ “hỏi giá” của các vertical liên hệ (nhà thuốc, xe, dịch vụ nhà, phòng khám, gara, và placeholder tạp hóa cũ). Đi chợ không nhân rộng quy ước này. Sản phẩm lên kệ khi `pricing_kind = FIXED`, giá > 0, và có số lượng hôm nay (`product_daily_availability` AVAILABLE). Chưa có migration đổi các dòng legacy.

## Mục tiêu

Cửa hàng gần nhà (minimart, tạp hóa, sạp chợ, retail nhỏ) hiện **đang mở** trong Zone → khách gọi/Zalo hoặc **hỏi hàng + ảnh** trên Picki rồi qua lấy.  
Khớp Master Spec homepage **Đi chợ** và late-night (sữa/bỉm, minimart).

## In scope

- Provider types: `MINIMART`, `MARKET_VENDOR`, `RETAIL_STORE` (cùng discovery block; seed demo = `MINIMART`)
- Discovery block **ĐI CHỢ** — không gate giấy phép
- Live OPEN / BUSY / CLOSED / OFFLINE
- Trang location: liên hệ + form hỏi hàng (tin + 1–3 ảnh) qua Picki Chat (`MARKET`)
- Provider app: tab **Hỏi hàng** / **Trạng thái** / **Cài đặt**
- Thông báo WEB — không tự đẩy Zalo chat

## Out of scope

- Cart / checkout / % đơn tạp hóa
- Runner giao hàng tạp hóa V1
- Full traditional market digitization
- SUPERMARKET chuỗi lớn (có thể liệt kê sau nếu peer Zone cần)

## Seed

`bash scripts/db-seed-minimart.sh` — demo **Tạp hóa Kim Văn** (`tap-hoa-kim-van`), login `0908888013`.
