# Pilot harden — Zone 1 Kim Văn Kim Lũ

Chạy **trước khi mở pilot rộng** với bếp/runner thật. Stack: `bash scripts/start-local.sh` · API `:3000` · Web `:3001`.

## 0. Seed + accounts

| Bước | Lệnh / tài khoản |
|------|------------------|
| Base | `pnpm db:seed` (hoặc seed từng phần) |
| Food | Provider `0908888001` · Runner `0908888002` · Customer `0901234567` · Admin `0908888003` |
| Laundry | `0908888004` |
| Family Dinner | `bash scripts/db-seed-family-dinner.sh` · `0908888014` · demo: `FD_SEED_DEMO=1 …` |

---

## 1. Automated API (must pass)

```bash
pnpm pilot:e2e
pnpm pilot:laundry:e2e
pnpm pilot:family-dinner:e2e
```

Exit `0` cả ba = pass. Fail → dừng, không mở pilot.

---

## 2. PWA / icon tối thiểu

Icons: PNG 192/512 + apple-touch 180 (Customer / Provider / Runner). Regenerate:

```bash
bash scripts/generate-pwa-icons.sh
```

| # | Việc | Pass khi |
|---|------|----------|
| 1 | Chrome/Safari → `/` favicon + tab icon | PNG / SVG hiện |
| 2 | Customer: Add to Home Screen | Icon cam pin, mở standalone `/` |
| 3 | Provider: `/provider` → Add to Home Screen | Icon xanh storefront |
| 4 | Runner: `/runner` → Add to Home Screen | Icon xanh scooter |
| 5 | Offline: tắt mạng → navigate | Trang `/offline` (hoặc role offline) |
| 6 | Production / `NEXT_PUBLIC_ENABLE_PUSH=true` | SW `picki-shell-v6` đăng ký |

Dev local: SW **không** đăng ký trừ khi `NEXT_PUBLIC_ENABLE_PUSH=true` (tránh cache cũ).

---

## 3. Manual UI smoke (1 lần / role)

Chi tiết đầy đủ:

- Food: [`FOOD_E2E_CHECKLIST.md`](./FOOD_E2E_CHECKLIST.md)
- Laundry: checklist trong `scripts/pilot-laundry-e2e.sh` + UI 3 tab
- Family Dinner: [`FAMILY_DINNER_E2E_CHECKLIST.md`](./FAMILY_DINNER_E2E_CHECKLIST.md) (gồm D2 polish + tối muộn)

Tối thiểu:

- [ ] Food COD → DELIVERED (3 tab)
- [ ] Family Dinner PREPAY → cook-first → runner hoặc Tự giao
- [ ] Customer cancel PAID (trước nấu)
- [ ] Provider FD: Chép menu / banner copy · kế hoạch `nấu sẵn · tự nấu`

---

## 4. PayOS + Push (khi cấu hình)

- [ ] `.env` PayOS · checkout QR → PAID (hoặc `dev-confirm` khi DEV_STUB)
- [ ] VAPID + `NEXT_PUBLIC_ENABLE_PUSH=true` · Runner nhận push khi tìm runner

---

## 5. Architecture gate (§153)

Trước pilot: mọi câu YES trong `docs/PICKI_MVP_SCOPE.md` § Architecture acceptance. Bất kỳ NO → review ADR.

---

## 6. Ops playbook (1 trang)

- [ ] Ai seed / reset ngày (`db-seed-family-dinner`, food)
- [ ] SĐT demo + mật khẩu OTP blank
- [ ] Khi stuck: Admin hủy + audit
- [ ] Unregister SW nếu UI cũ

---

## Done khi

- [ ] Ba script E2E xanh (`pilot:e2e` · `pilot:laundry:e2e` · `pilot:family-dinner:e2e`) — đã harden lobby arrive/handoff trong laundry script
- [ ] PWA install 3 app có icon đúng  
- [ ] Một vòng UI Food + FD trên máy thật / simulator  
- [ ] §153 không còn NO blocker  

Sau đó mới Visual V1 (theme/layout) hoặc Zone 2.
