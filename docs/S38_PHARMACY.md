# S38 — Nhà thuốc (Pharmacy)

**Status:** IMPLEMENTED lean V1 (2026-09-16) — ADR-043  
**Capability:** `LISTING` + `LIVE_STATUS` + `CONTACT`  
**Không:** giỏ thuốc, thanh toán thuốc, giao thuốc runner, C2C thuốc, visit intent / queue.

## Mục tiêu

Hiệu thuốc **độc lập trong Zone** hiện “đang mở gần bạn” → khách gọi/Zalo/chat hỏi rồi qua lấy.  
Không đối đầu catalog Long Châu / Pharmacity.

## In scope

- Provider type `PHARMACY`
- Discovery block **NHÀ THUỐC** — chỉ hiện khi `license_verified_at` (reuse cột giấy phép §86)
- Live OPEN / BUSY / CLOSED / OFFLINE
- Trang location: liên hệ (Gọi/Zalo + chỉ đường) + **form hỏi thuốc** (tin nhắn + 1–3 ảnh) qua **Picki Chat** — không danh mục “dịch vụ” giả
- Provider app: tab **Hỏi hàng** + **Trạng thái** + **Cài đặt**
- Thông báo: kênh **WEB** (chuông Picki) — **không** tự đẩy vào Zalo chat

## Out of scope

- Cart / checkout thuốc, đơn thuốc điện tử
- Delivery thuốc bằng runner
- Resident-to-resident medicine exchange
- So giá / tồn kho sâu / tích điểm chuỗi
- Tự mở Zalo OA / Mini App chat khi bấm Gửi (Zalo chỉ là shortcut gọi riêng)
## Seed

`bash scripts/db-seed-pharmacy.sh` — demo **Nhà thuốc Kim Văn** (`nha-thuoc-kim-van`), login `0908888012`.
