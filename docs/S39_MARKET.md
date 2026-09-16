# S39 — Đi chợ (Minimart / Tạp hóa / Chợ)

**Status:** IMPLEMENTED lean V1 (2026-09-16) — ADR-044  
**Capability:** `LISTING` + `LIVE_STATUS` + `CONTACT`  
**Không:** giỏ hàng tạp hóa, checkout, giao runner, digitization chợ truyền thống đầy đủ.

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
