# S40 — Thất lạc / Thú cưng thất lạc

**Status:** IMPLEMENTED lean V1 (2026-09-16) — ADR-045  
**Capability:** Classified peer listings trong GÓC KHU MÌNH (`CONTACT` only)  
**Không:** giữ chỗ, giá, matching AI, feed xã hội.

## Mục tiêu

Tin **đồ thất lạc / nhặt được** và **thú cưng thất lạc** trong Zone — hai bên chat/liên hệ. Khớp Master Spec §91.

## In scope

- Types: `LOST_FOUND`, `PET_LOST`
- Đăng: SĐT verified; tiêu đề, mô tả, vị trí, ảnh (PET_LOST ≥1 ảnh)
- Quota: **2 tin AVAILABLE** / user (chung 2 type) · **5 lần tạo / tháng**
- TTL **14 ngày** → auto ARCHIVED (cùng worker expire housing)
- Không giá / không giữ chỗ — chỉ chat + ẩn tin khi đã tìm thấy / đã trả

## Out of scope

- `REUSE` / Recycling (phase sau hoặc gộp Cho tặng)
- Matching AI, bản đồ toàn thành, thưởng tìm đồ
- Runner giao đồ thất lạc

## Seed

`bash scripts/db-seed-lost.sh` — demo trên customer `0901234567`.
