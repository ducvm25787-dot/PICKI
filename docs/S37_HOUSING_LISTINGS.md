# S37 — Cho thuê / Ở ghép (Housing listings)

**Status:** IMPLEMENTED (2026-09-16) — ADR-042  
**ADR:** ADR-042  
**Capability:** `CLASSIFIED` + `CONTACT` (extend GÓC KHU MÌNH) — **không** tạo Provider BĐS.

## Mục tiêu

Nơi peer trong Zone up tin phòng cho thuê / tìm người ở ghép; hai bên tự liên hệ. Picki không đứng giữa giao dịch.

## In scope

- Category tin: `CHO_THUÊ` | `Ở_GHÉP` (chung engine Classified hoặc bảng/listing kind tương đương)
- Đăng tin: tiêu đề, mô tả, giá (integer VND, optional), ảnh (reuse compress ≤3 / <300KB), Zone membership
- Liên hệ: Picki chat + SĐT/Zalo (CONTACT) — giống Classified hiện tại
- Gate: chỉ tài khoản **SĐT verified** mới đăng
- Quota:
  - **1 tin ACTIVE** / user tại một thời điểm
  - **2 lần tạo tin / tháng lịch** / user
  - Xóa tay hoặc **TTL 7 ngày** → status hết ACTIVE → được đăng tin mới (nếu còn quota tháng)
- Auto-expire worker + (optional) nhắc trước hết hạn 1 ngày qua outbox
- Discovery: mục trong GÓC KHU MÌNH (không block Provider)

## Out of scope (V1)

- Provider / sale / môi giới BĐS
- Đặt lịch xem nhà, giữ chỗ, cọc, hợp đồng, thanh toán thuê
- Multi-listing, gia hạn vô hạn, hoàn quota khi xóa
- Matching AI roommate, scoring tín dụng, bản đồ toàn thành

## Acceptance (khi implement)

- [x] User chưa verify SĐT → không đăng
- [x] Đang có 1 tin AVAILABLE → API từ chối tin thứ 2
- [x] Tháng đã tạo 2 tin → từ chối tạo thêm (kể cả đã xóa tin cũ)
- [x] Sau xóa hoặc sau 7 ngày → không còn AVAILABLE → tạo được tin mới nếu còn quota
- [x] Không có flow cọc / lịch xem / Provider BĐS trên UI hay API
