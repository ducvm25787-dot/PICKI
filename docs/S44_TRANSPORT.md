# S44 — Xe đưa đón (Transport)

**Status:** IMPLEMENTED lean V1 (2026-09-18) — ADR-049  
**Capability:** `LISTING` + `LIVE_STATUS` + `CONTACT`  
**Không:** booking engine, giỏ/checkout, runner chở khách, GPS tracking, AI dispatch, ride-hail, scrape Grab/Be.

## Mục tiêu

Nhà xe / tài xế Zone hiện “đang nhận chuyến” → khách gọi/Zalo/chat hỏi lịch & giá cho sân bay, về quê, du lịch, đưa đón học sinh.

## In scope

- Provider type `TRANSPORT_PROVIDER`
- Home category **Xe đưa đón** (`/zones/:slug/browse/transport`)
- Discovery block **XE ĐƯA ĐÓN** khi Zone có provider ACTIVE
- Live OPEN / BUSY / CLOSED / OFFLINE
- Offering danh mục dịch vụ (`CONTACT_ONLY` / FROM hoặc QUOTE_REQUIRED)
- Trang location: liên hệ + danh sách dịch vụ → CTA **Nhắn tin** (prefill + chat Picki)
- Provider tab **Tin nhắn** (`contextType = TRANSPORT`)

## Out of scope

- Đặt chỗ / giữ chỗ / lịch tự động
- Thanh toán chuyến qua Picki
- Matching tài xế realtime / định vị liên tục
- Tách vertical ride-hail cạnh tranh Grab

## Seed

`bash scripts/db-seed-transport.sh` — demo **Xe Kim Văn** (`xe-kim-van`), login `0908888016`.
