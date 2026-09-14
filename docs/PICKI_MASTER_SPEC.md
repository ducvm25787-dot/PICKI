# PICKI — BẢN CHÍNH THỨC

**Master Product & Technical Specification**

**Single Source of Truth for Cursor**

**Greenfield Implementation — triển khai từ con số 0**

**Trạng thái: OFFICIAL**

**Mục đích:** Tài liệu nguồn duy nhất để Cursor thiết kế và triển khai Picki.

**Đường dẫn:** `/docs/PICKI_MASTER_SPEC.md`

**QUY TẮC ƯU TIÊN:** Nếu code, tài liệu con, comment, migration, Cursor Rule hoặc quyết định kỹ thuật mâu thuẫn với tài liệu này, `PICKI_MASTER_SPEC.md` được ưu tiên, trừ khi có ADR mới được chủ dự án phê duyệt rõ ràng.

---

## 0. EXECUTIVE SUMMARY

Picki là nền tảng tiện ích đời sống siêu địa phương theo Zone, lấy các cụm chung cư/khu đô thị đông dân làm Demand Core, kết nối household với nguồn cung hàng hóa và dịch vụ phân tán trong khu dân cư xung quanh.
Consumer proposition:
Picki — Hôm nay quanh bạn có gì?
Product thesis:
Concentrated Demand – Distributed Supply.
Hay:
Cầu tập trung ở lõi chung cư – nguồn cung phân tán quanh Zone.
Picki không cố số hóa mọi giao dịch.
Picki trước tiên làm cho:
hàng hóa
dịch vụ
cửa hàng
người cung cấp dịch vụ
khả năng phục vụ
trạng thái mở/đóng
thời gian chờ
khả năng giao hàng
trở nên:

```
VISIBLE
LIVE
LOCAL
TRUSTED
SEARCHABLE
ACTIONABLE
```

Sau đó chỉ sử dụng:

```
ORDER
BOOKING
PAYMENT
FULFILLMENT
```

khi loại giao dịch thực sự cần.
Mục tiêu dài hạn:
Một household trong Zone có bất kỳ nhu cầu nào liên quan đến cuộc sống quanh nhà thì Picki là nơi đầu tiên họ nghĩ đến.

## 1. PICKI KHÔNG PHẢI LÀ GÌ

Picki không phải:
Food Delivery App
Google Maps clone
Social Network
Group cư dân
Marketplace toàn quốc
ERP cho cửa hàng
App riêng cho chung cư
Food là vertical đầu tiên để tạo frequency.
Chung cư là Demand Core nhưng người sống ở nhà đất, biệt thự, liền kề trong Zone có quyền sử dụng Picki như nhau.
Picki không xây cộng đồng bằng:
post
like
follow
newsfeed
tranh luận
group chat công cộng
Picki xây community bằng utility.

## 2. PRODUCT PILLARS

Picki có các trụ cột:

| Pillar            | Vai trò                           |
| ----------------- | --------------------------------- |
| Zone              | Local context                     |
| Zone Planner      | Tìm nơi đáng mở Picki             |
| Household         | Demand unit                       |
| Provider          | Supply unit                       |
| Live Local Map    | Nhìn thấy những gì đang hoạt động |
| Live Availability | Biết có phục vụ ngay được không   |
| Discovery         | Tạo lý do mở Picki                |
| Search            | Giải quyết nhu cầu chủ động       |
| Trust             | Giúp chọn provider chưa quen      |
| Food              | Frequency engine                  |
| Services          | Utility dependence                |
| Fulfillment       | Logistics moat                    |
| Picki Point       | Density advantage                 |
| Reviews + Repeat  | Community curation                |
| Subscription      | Recurring revenue                 |
| Multi-Zone        | Scale                             |

## 3. PLATFORM ARCHITECTURE

Picki phải độc lập hoàn toàn với Zalo.

```
                       PICKI CORE
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   PostgreSQL         Picki Backend       Picki Storage
   + PostGIS               │
        └──────────────────┼──────────────────┘
                           │
                       PICKI API
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
    WEB/PWA          ZALO MINI APP          NATIVE
    V1 FIRST             LATER              FUTURE
       │
   ADMIN WEB
```

V1:

```
Customer → Web/PWA
Provider → Web/PWA
Runner   → Web/PWA
Admin    → Web
```

Sau này:
Zalo Mini App
iOS
Android
đều dùng:
same Picki API
same users
same database
same orders
same providers
same Zones
Không migrate business database.

## 4. PLATFORM INDEPENDENCE RULES

Bắt buộc:

1. Picki owns all core business data.
2. Picki owns all core business logic.
3. Zalo Mini App is a client, not the platform.
4. All core entities use Picki-generated UUIDs.
5. Zalo UID must never be a Picki primary key.
6. External identities use mapping tables.
7. Identity providers use adapters.
8. Payment providers use adapters.
9. Notification providers use adapters.
10. Geo/map providers use adapters.
11. Picki owns Zone polygons.
12. Picki owns messaging history.
13. Picki owns uploaded business assets.
14. Vendor-specific logic must not leak into core modules.
15. Removing Zalo must not require redesigning Picki Core.
16. Future clients must reuse the same business API/database.

## 5. MODULAR MONOLITH

V1 sử dụng:

```
ONE BACKEND
ONE PRIMARY POSTGRESQL DATABASE
CLEAR MODULE BOUNDARIES
```

Không microservices.
Không tạo:
zone-service
order-service
payment-service
runner-service
thành deployment riêng trong V1.
Chỉ tách khi scale thực tế chứng minh cần.

## 6. PICKI ZONE

Zone không phải đơn vị hành chính.
Zone không phải hình tròn 1 km.
Zone là:
Một local economy/community xoay quanh một cụm household mật độ cao và có khả năng vận hành hiệu quả.
Zone lý tưởng:

```
                    PICKI ZONE
               DENSE DEMAND CORE
            Chung cư / KĐT đông dân
                     │
              Household Demand
                     │
        ┌────────────┴────────────┐
        │                         │
```

Ground Residential Villas/Low-rise
Nhà dân/ngõ/phố Liền kề/biệt thự

```
        │                         │
        └────────────┬────────────┘
                     │
              DISTRIBUTED SUPPLY
       Food / Market / Retail / Services
```

## 7. CHUNG CƯ LÀ DEMAND CORE

Picki ưu tiên chung cư vì:
mật độ household cao
lối sống nhanh
nhiều gia đình trẻ
nhu cầu delivery cao
khả năng batching cao
Picki Point thuận lợi
dễ tạo repeat behavior
Sự ưu tiên nằm ở product design và logistics, không phải quyền sử dụng.
Người nhà đất vẫn có đầy đủ:
Food
Shopping
Services
Delivery
Beauty
Laundry
Education
Pet
Classified
Give Away

```
...
```

## 8. GROUND RESIDENTIAL SUPPLY RING

Khu dân cư mặt đất có vai trò kép:

```
USER
```

-

```
PROVIDER SUPPLY
```

Nguồn cung:
chợ
quán ăn
home cook
minimart
tạp hóa
cửa hàng
thợ
salon
giặt là
gia sư
dịch vụ
Hai khối cần nhau:
CHUNG CƯ
Demand density

```
      ↓
    PICKI
      ↑
GROUND AREA
```

Distributed supply

## 9. IDEAL ZONE CRITERIA

Không hard-code một ngưỡng duy nhất.
Zone Planner chấm điểm.
Suggested score:
Demand — 40%
Residential density
Apartment concentration
Occupied households
Residential ratio
Household lifestyle potential
Supply — 30%
Food diversity
Traditional market
Supermarket/minimart
Retail
Home services
Beauty
Laundry
Education
Health
Pet
Fulfillment — 20%
Travel time
Road accessibility
Batching potential
Building access
Picki Point feasibility
Operational complexity
Expansion — 10%
Ground population
Villas/low-rise
Adjacent supply
Cross-zone potential
Suggested interpretation:
80+ Strong Zone
70–79 Good candidate
60–69 Pilot only after field review
<60 Do not prioritize
Weights/configuration must be adjustable.

## 10. RESIDENTIAL RATIO

Ưu tiên:
~70–90% residential
Không hard-code.
Office có thể tồn tại nhưng household life phải là dominant demand.
Khu thuần office không phải Zone lý tưởng của Picki.

## 11. SUPPLY DIVERSITY

Không chỉ đếm số provider.
100 cafe không bằng hệ sinh thái:
Food
Fresh Food
Grocery
Milk
Pharmacy
Laundry
Beauty
Repair
Cleaning
Education
Pet

```
...
```

Zone Planner cần:
Supply Diversity Score

## 12. SMART ZONE PLANNER

Module:

```
ZONE PLANNER
├── Core Detection
├── Population Density
├── Household Density
├── Apartment Density
├── Building Density
├── Commercial Density
├── Provider Density
├── Road Accessibility
├── Barrier Analysis
├── Travel-Time Analysis
├── Candidate Generator
├── Zone Scoring
├── Overlap Resolver
├── Shared Service Areas
├── Polygon Editor
└── Approval Workflow
```

Zone Planner:
xác định Zone nên nằm ở đâu.
Zone Engine:
vận hành Zone đã được phê duyệt.

## 13. ZONE PLANNER PRINCIPLE

Algorithm proposes. Local knowledge corrects. Human approves.
Không auto-publish.
Operator phải sửa được:
Add area
Remove area
Move boundary
Split
Merge
Mark difficult access
Add access point
Mark barrier
Add operational note

## 14. TRAVEL TIME > RADIUS

Không:
radius <= 1 km
làm business rule.
Có thể dùng ~1 km để generate candidate.
Sau đó xét:
5-minute accessibility
8-minute accessibility
12-minute accessibility
theo network thực tế.
Các mốc configurable.

## 15. ZONE AREAS

Một Zone có:

```
CORE
PRIMARY
EXTENDED
```

Ngoài ra có:

```
SHARED SERVICE AREA
```

CORE:
demand density cực cao.
PRIMARY:
vùng vận hành rất thuận lợi.
EXTENDED:
vẫn phục vụ được nhưng SLA/cost khác.

## 16. MEMBERSHIP BOUNDARY ≠ SERVICE BOUNDARY

Membership:
địa chỉ này JOIN Zone nào?
Serviceability:
Provider X có phục vụ Address Y được không?
Hai thứ khác nhau.
Adjacent Zones có thể:
Membership A | Membership B
nhưng:
Service A >>>>> <<<<< Service B
được overlap.

## 17. SHARED SERVICE AREAS

Provider Zone A có thể phục vụ Zone B nếu:
Serviceability = ELIGIBLE
Không cần làm membership polygon chồng lấn lung tung.

## 18. ZONE VERSIONING

Không overwrite polygon.
Dùng:
zone_boundary_versions
Fields:
zone_id
version
geometry
valid_from
valid_to
created_by
change_reason
Giữ lịch sử.

## 19. ZONE LIFECYCLE

Candidate:

```
DETECTED
CANDIDATE
UNDER_REVIEW
FIELD_VALIDATION
APPROVED
REJECTED
ARCHIVED
```

Production:

```
DRAFT
CONFIGURING
PILOT
ACTIVE
PAUSED
SUSPENDED
CLOSED
```

Không delete Zone có transaction history.

## 20. FUTURE ZONE INTELLIGENCE

Sau khi có dữ liệu Picki:
orders
searches
actual ETA
routes
provider density
joins
failed deliveries
unserved demand
Zone Planner có thể đề xuất:

```
CREATE
EXPAND
SHRINK
SPLIT
MERGE
RECLASSIFY
```

Nhưng vẫn cần human approval.

## 21. USER DISCOVERS ZONE

Flow:

```
GPS
↓
```

Point-in-polygon

```
↓
```

Zone found

```
↓
```

Zone Preview
Ví dụ:
PICKI · ĐẠI KIM
12.486 thành viên
86 provider đang hoạt động
Hôm nay quanh bạn có gì?

```
[KHÁM PHÁ]
[THAM GIA ZONE]
```

## 22. GPS RULES

GPS dùng cho:
Discover Zone
Join new Zone
"Quanh đây"
Anti-fraud when necessary
Không continuous tracking customer.
Không lưu GPS mỗi phút.
GPS không tự thay Active Zone.

## 23. JOIN ZONE

Flow:
GPS inside Zone

```
↓
```

Join

```
↓
```

Add delivery address

```
↓
```

Level-1 validation

```
↓
JOINED
```

Copy UX:
Cho Picki biết bạn ở đâu để phục vụ bạn tốt hơn.
Không dùng KYC language.

## 24. USER-ZONE STATUS

```
VISITOR
JOINED
VERIFIED
SUSPENDED
LEFT
```

VISITOR:
chỉ discover.
JOINED:
GPS presence + valid Level-1 address.
VERIFIED:
enhanced resident privileges.

## 25. USER MAY JOIN MULTIPLE ZONES

Không hard limit V1.
User

```
├── Đại Kim
│   └── Nhà
├── Cầu Giấy
│   └── Công ty
└── Zone khác
```

Một Zone có thể có hàng triệu historical membership records.
Không xóa chỉ vì inactive.

## 26. INACTIVE MEMBERS

Không delete user chỉ vì lâu không quay lại.
Có thể tính:
Active 30d
Active 90d
Inactive
Historical
Membership history được giữ.
Large event/telemetry tables có retention riêng.

## 27. ACTIVE ZONE

Một thời điểm user có:
active_zone_id
UI:
📍 Đại Kim ▼
Selector:
ZONE CỦA BẠN
✓ Đại Kim
Cầu Giấy
Công ty

```
──────────────
```

📍 Khám phá Zone quanh đây

## 28. ADDRESS

Types:

```
RESIDENTIAL
WORKPLACE
STREET_ADDRESS
TEMPORARY
OTHER
```

Chung cư:
building
floor
apartment
delivery_note
coordinates
Nhà phố:
house_number
alley
street
ward
city
coordinates
delivery_note

## 29. ADDRESS VALIDATION

```
UNVALIDATED
```

LEVEL_1_VALIDATED

```
VERIFIED
REVOKED
```

Level 1 chỉ kiểm tra:
structure reasonable
location/service area valid
deliverable
not obvious junk
Không phải chứng minh cư trú pháp lý.

## 30. HOUSEHOLD

Tables:
households
household_members
household_invitations
Household không bắt buộc để order Food.
Dùng cho:
Picki Family
resident privileges
family sharing
household analytics
North Star ưu tiên household.

## 31. IDENTITY

Core:
users.id UUID
External:
user_identities
Providers:

```
PHONE
EMAIL
ZALO
APPLE
GOOGLE
```

Không để external ID làm business PK.

## 32. ROLE MODEL

```
CUSTOMER
PROVIDER_OWNER
PROVIDER_MANAGER
PROVIDER_STAFF
RUNNER
ZONE_AGENT
ZONE_OPERATOR
SUPPORT
FINANCE
ZONE_ADMIN
SUPER_ADMIN
```

Một user có thể nhiều role.

## 33. CUSTOMER / PROVIDER / RUNNER TRUST

| Actor    | Verification               |
| -------- | -------------------------- |
| Customer | Low friction / progressive |
| Provider | Stronger before public     |
| Runner   | Stronger before work       |

## 34. PROVIDER DEFINITION

Provider là business identity chung.
Không dùng Shop làm generic core entity.
Types có thể gồm:

```
RESTAURANT
FOOD_STALL
HOME_COOK
SUPERMARKET
MINIMART
MARKET_VENDOR
RETAIL_STORE
LAUNDRY
CLEANER
TECHNICIAN
SALON
SPA
NAIL
TUTOR
EDUCATION_PROVIDER
PET_SERVICE
HEALTH_PROVIDER
INDIVIDUAL
COMPANY
```

## 35. PROVIDER ONBOARDING PHILOSOPHY

Picki-native.
Đơn giản.
Không import/scrape:
Grab
ShopeeFood
Google Maps
Facebook
trong V1.
Provider tự tạo hồ sơ theo mẫu Picki.
Mục tiêu:
Tạo cửa hàng trên Picki phải đơn giản hơn các marketplace lớn.

## 36. CREATE PROVIDER

Basic form:
Tên
Loại hình
Địa chỉ
Map location
Giờ hoạt động
Logo/ảnh
Mô tả ngắn
Sản phẩm/dịch vụ chính
Cách hoạt động
Không bắt provider nhỏ nhập hàng trăm field.

## 37. PROVIDER ≠ PROVIDER LOCATION

Architecture:

```
PROVIDER
│
├── Master Profile
├── Brand assets
├── Master Catalog
│
└── LOCATIONS
     ├── Đại Kim
     ├── Linh Đàm
     └── Zone khác
```

Provider:
business/brand identity.
Provider Location:
physical operating location.

## 38. PROVIDER MULTI-LOCATION

Một Provider có:
1..N Locations
Một Location có thể phục vụ:
1..N Zones

## 39. OPEN ANOTHER LOCATION

Provider đã hoạt động ở Zone 1 chọn:
[+ MỞ THÊM ĐỊA ĐIỂM]
Choose Zone

```
↓
```

Choose physical location

```
↓
```

Clone from existing location

```
↓
```

Edit differences

```
↓
```

Submit location verification

```
↓
ACTIVE
```

## 40. LOCATION CLONING

Cho chọn copy:
Profile
Logo
Images
Menu/catalog
Prices
Options
Signature offerings
Opening hours
Service modes
Operational configuration
Không cần nhập lại.

## 41. OPENING NEW LOCATION DOES NOT CLOSE OLD LOCATION

Nếu:

```
OPEN NEW LOCATION
```

thì:
Location 1 ACTIVE
Location 2 ACTIVE/PENDING
cùng tồn tại.
Nếu:

```
RELOCATE
```

thì:
Old ACTIVE

```
↓
RELOCATING
↓
```

New location verified

```
↓
```

New ACTIVE
Old CLOSED/RELOCATED
Không delete history.

## 42. LOCATION OVERRIDES

Master Catalog có thể dùng chung.
Location được override:
price
availability
menu item
opening hours
capacity
service modes
Ví dụ:
Master:
Phở tái 45k
Linh Đàm:
Phở tái 50k
Sốt vang:

```
NOT_AVAILABLE
```

## 43. PROVIDER VERIFICATION

Provider level:
identity
business information
documents where applicable
Location level:
physical location
operational existence
service area
category-specific requirements
Mở location mới không bắt verify lại toàn bộ identity nếu còn hợp lệ.

## 44. PROVIDER STATUS

```
DRAFT
PENDING_VERIFICATION
VERIFIED
ACTIVE
PAUSED
SUSPENDED
CLOSED
```

Location có status riêng.

## 45. PROVIDER REPUTATION VS LOCATION REVIEW

Tách:
Provider Reputation +
Location Reviews
Ví dụ:
PHỞ HÙNG
Brand reputation: 4.8★
Đại Kim: 4.9★
Linh Đàm: 4.6★
Location mới:
Thương hiệu 4.8★ · Địa điểm mới
Không bê review location cũ sang location mới.

## 46. PROVIDER PAGE

Mỗi Provider Location có trang riêng.
Template:
[Cover]
✓ Picki Verified
🟢 Đang mở
⚡ Ra được ngay
⭐ 4.8
126 household trong Zone đã sử dụng
32 household quay lại

```
──────────────────
```

DỊCH VỤ
Cắt nam 100k
Cắt nữ 300k
Cắt trẻ em 70k
Gội đầu 80k
Nhuộm từ...

```
──────────────────
```

NỔI BẬT
Cắt Layer
Gội dưỡng sinh

```
──────────────────
```

```
[CHAT]
[ZALO]
[CHỈ ĐƯỜNG]
```

Template thay đổi theo capabilities.

## 47. PROVIDER ENGAGEMENT MODES

Generic:

```
LISTING
LIVE_STATUS
CONTACT
QUEUE_STATUS
BOOKING
LEAD
COMMERCE
PREORDER
DELIVERY
PICKUP_AND_RETURN
CLASSIFIED
PICKI_POINT
```

Provider bật capability cần thiết.
Không ép mọi provider cùng workflow.

## 48. LIVE LOCAL MAP

Feature lõi.
Primary navigation concept:

```
[HÔM NAY]
[BẢN ĐỒ LIVE]
[CỦA TÔI]
```

HÔM NAY
Discovery.
BẢN ĐỒ LIVE
Những gì đang usable NOW.
CỦA TÔI
Chỗ quen, favorite, đơn, lịch.

## 49. NEAR ME PHILOSOPHY

Picki không search toàn thành phố trước.
Search expansion:
closest micro-area

```
↓
```

Zone

```
↓
```

Shared Service Area

```
↓
```

Adjacent Zone if needed
Nếu trong 500m đã có đủ lựa chọn phù hợp, không cần đẩy provider 3km lên trước.
Exact radius phải configurable theo category.

## 50. LIVE AVAILABILITY

Generic states:

```
AVAILABLE_NOW
SHORT_WAIT
BUSY
NOT_ACCEPTING
CLOSED
```

Additional fields:
estimated_wait_minutes
estimated_arrival_minutes
estimated_prep_minutes
last_updated_at

## 51. LIVE STATUS UX

Salon:
🟢 Ra được ngay
🟡 ~15 phút
🟠 ~30 phút
🔴 Tạm hết lượt
⚫ Đóng cửa
Home technician:
🟢 Đang nhận việc
🟡 Có thể tới sau ~1h
🔴 Hết lịch hôm nay
Food:
🟢 Đang nhận đơn
🟡 Đang đông · prep ~25 phút
🔴 Tạm ngừng nhận
⚫ Đóng cửa

## 52. PROVIDER LIVE STATUS MUST BE SIMPLE

Provider không cần ERP.
Ví dụ:
HÔM NAY
🟢 ĐANG MỞ

```
[RA ĐƯỢC NGAY]
[~15 PHÚT]
[~30 PHÚT]
[~60 PHÚT]
[TẠM HẾT LƯỢT]
```

Một vài tap.

## 53. SEARCH

Search across:
Providers
Offerings
Categories
Services
Signature Offerings
Examples:
phở
phở tái lăn
sửa máy giặt
thợ khóa
giặt sofa
cắt tóc
gia sư toán lớp 8

## 54. PROVIDER CHOICE PROBLEM

Không hiển thị 50 provider giống nhau.
Search result phải tổ chức thành các lý do lựa chọn:
❤️ Bạn hay dùng
🔥 Được chọn nhiều trong Zone
⚡ Đang phục vụ nhanh
✨ Đáng thử / mới trong khu
⭐ Đánh giá tốt
📍 Gần nhất
Sau đó:
Xem tất cả

## 55. RANKING

Organic ranking signals:
query relevance
availability
distance/ETA
user previous usage
repeat rate
verified review quality
Zone popularity
operational reliability
signature offering match
reasonable new-provider exposure
Không chỉ rating.
Không chỉ sales volume.
Không để paid placement giả organic.
Sponsored result phải ghi:
TÀI TRỢ

## 56. FAVORITES & REPEAT

System supports:

```
FAVORITE
USED_BEFORE
REPEAT_PROVIDER
RECENT
```

Không bắt user favorite thủ công tất cả.
Repeat có thể suy ra từ transaction history.

## 57. REVIEWS

Review là community curation.
Picki kiểm tra provider hợp lệ.
Khách hàng quyết định chất lượng.
Ưu tiên review từ verified interaction.
Food dimensions:
taste
accuracy
portion
packaging
would_order_again
Service:
punctuality
professionalism
result
value
would_use_again

## 58. LOCAL TRUST SIGNALS

Picki ưu tiên:
32 household trong Zone đã dùng
18 household đã quay lại
67% khách muốn sử dụng lại
thay vì chỉ:
4.8★
Không công khai danh tính household khác.

## 59. OFFERING

Generic:

```
PRODUCT
SERVICE
BOOKING
REQUEST
LEAD
```

Pricing:

```
FIXED
FROM
RANGE
QUOTE_REQUIRED
FREE
CONTACT
```

Fulfillment:

```
DELIVERY
PICKUP
CUSTOMER_VISIT
PROVIDER_VISIT
ON_SITE
REMOTE
NONE
```

Payment:

```
PAY_ON_PICKI
PAY_PROVIDER_DIRECTLY
PAY_ON_COMPLETION
COD
NO_PAYMENT
```

## 60. FOOD POSITIONING

Food là launch vertical.
Nhưng Picki Food không phải restaurant marketplace thông thường.
Definition:
Household Food Planning + Hyperlocal Fulfillment.
Food phục vụ nhịp sống household.

## 61. FOOD DAILY RHYTHM

Default example, configurable by Zone:
20:00–23:30
SÁNG MAI ĂN GÌ?
05:30–10:00
ĂN SÁNG
10:00–14:00
ĂN TRƯA NHANH
14:00–16:00
TỐI NAY NHÀ MÌNH ĂN GÌ?
16:00–20:30
CỨU BỮA TỐI
20:30+
ĂN KHUYA / TIỆN ÍCH ĐÊM
Không hard-code time windows.

## 62. BREAKFAST PREORDER

Tối hôm trước household chọn:

```
Bố → Phở
Mẹ → Bánh cuốn
Con → Xôi
```

Delivery windows:
06:30
07:00
07:30
08:00
Preorder ưu tiên prepaid.
Provider biết demand trước.
Fulfillment biết route trước.

## 63. BREAKFAST INSTANT

Sáng:
Phở
Bún
Miến
Xôi
Bánh mì
Bánh cuốn
Cháo

```
...
```

Live:
open
accepting
prep time
delivery ETA

## 64. LUNCH

Ban đầu:
Cơm suất
Bún
Miến
Phở
Món nhanh
Không overbuild nếu demand thấp.

## 65. DINNER PLANNING

14–16h:
TỐI NAY NHÀ MÌNH ĂN GÌ?
Paths:
MÂM CƠM LÀM SẴN
MÓN MẶN + CANH
MEAL KIT / NGUYÊN LIỆU SƠ CHẾ
GROCERY / CHỢ

## 66. FAMILY MEALS

Examples:
Canh cua mồng tơi

- thịt rang cháy cạnh
  Cá kho
- nem rán
- canh cải thịt băm
  Gà rang gừng
- rau
- canh bí
  Provider tự tạo.
  Picki không có đội đi nếm để tuyên bố ngon.
  Community curation thông qua:
  reviews
  repeat
  complaints
  reorder behavior

## 67. FOOD QUALITY GATE

Picki kiểm tra:
provider identity
location
operating conditions
required documents where applicable
Không tự đánh giá khẩu vị.
Nếu không đạt operating requirements:

```
NOT_ACTIVE
```

## 68. HOME COOK

Supported.
Ví dụ:
BẾP NHÀ LAN
20 mâm/ngày
Cutoff 16:00
Delivery 17:30–19:00
Phải đáp ứng verification/operating requirements phù hợp trước khi public.

## 69. FOOD PROVIDERS

```
RESTAURANT
FOOD_STALL
HOME_COOK
MARKET_VENDOR
SUPERMARKET
MINIMART
GROCERY
BRAND_STORE
```

## 70. GROCERY & DAILY GOODS

Examples:
sữa
nước
rau
thịt
cá
gà
bỉm
giấy
nước giặt
đồ gia dụng
Support:

```
BUY_AGAIN
```

based on household history.

## 71. TRADITIONAL MARKET

Không digitize toàn bộ chợ.
Onboard selected providers.
Example:
Gà ta làm sạch
1.4–1.6 kg

```
○ Chặt
○ Để nguyên
```

## 72. FOOD MENU OPTIONS

Generic:
option_groups
options
Example phở:
Loại thịt:
Tái
Chín
Nạm
Gầu
Tái chín
Kiểu:
Thường
Tái lăn
Sốt vang
Extra:
Quẩy
Trứng
Thêm thịt
Nhiều bánh
Không hard-code phở-specific DB design.

## 73. SIGNATURE OFFERINGS

Provider có thể chọn:
signature_offerings
Example:
Nổi bật: Phở tái lăn
Provider khai.
User behavior/reviews xác nhận.
Picki không gắn claim “ngon nhất”.

## 74. DAILY SPECIALS

Structured data:
daily_specials
offering_id
available_date
quantity
starts_at
ends_at
Example:
Cá lăng hôm nay
Gà đồi
Bánh chuối nóng
Tự hết hiệu lực.

## 75. SNACK / STREET FOOD

Official Food group:
Ốc
Chè
Kem
Bánh chuối
Khoai
Ngô
Bánh rán
Nem chua rán
Xiên nướng
Bánh tráng

```
...
```

Capabilities:

```
LIVE_AVAILABILITY
LIMITED_QUANTITY
DAILY_SPECIAL
INSTANT_DELIVERY
PICKI_POINT
```

## 76. LATE NIGHT

Late-night discovery:
Đồ ăn khuya
Nhà thuốc đang mở
Sữa/bỉm
Minimart
Sửa khóa
Điện nước
Giao đồ

## 77. WEEKEND FOOD

Discovery:
Nhà hàng
Cafe
Quán bia
Đồ nhậu
Mâm cơm
Đi chợ
Dine-in restaurant có thể chỉ:
View menu
Live status
Chat
Zalo
Directions
Không cần booking/payment.

## 78. FOOD INTERACTION MODES

```
DISCOVER
CONTACT
DINE_IN
TAKEAWAY
DELIVERY
PREORDER
PICKI_POINT
```

Một provider bật nhiều mode.

## 79. PAYMENT POLICY BY OFFERING

Examples:

```
PREPAY_REQUIRED
```

Preorder
Family Meal
Made-to-order
Home Cook

```
PREPAY_PREFERRED
```

Instant Food

```
COD_ALLOWED
```

Milk
Packaged grocery
Retail
Configurable.

## 80. SERVICE ARCHITECTURE

Không xây application riêng cho mỗi ngành.
Compose capabilities:

```
LISTING
LIVE_STATUS
CONTACT
BOOKING
QUEUE_STATUS
LEAD
PROVIDER_VISIT
CUSTOMER_VISIT
PICKUP_AND_RETURN
DELIVERY
CLASSIFIED
```

## 81. LAUNDRY

Includes:
quần áo
chăn
ga
gối
giày
Flow:
User

```
↓
```

Request pickup

```
↓
```

Runner

```
↓
```

Laundry

```
↓
```

Processing

```
↓
```

Batch return
Rất phù hợp batching.

## 82. SOFA CLEANING

Không pickup-return.
Flow:
Provider visits home

## 83. HOME SERVICES

Vệ sinh nhà
Sửa khóa
Điện
Nước
Điều hòa
Máy giặt
Tủ lạnh
TV
Điện tử gia dụng

```
...
```

Provider Live Status:
🟢 Đang nhận việc
🟡 Có thể tới sau ~1h
🔴 Hết lịch hôm nay
Actions:

```
CHAT
ZALO
```

Pricing:

```
FIXED
FROM
QUOTE_REQUIRED
```

## 84. BEAUTY

Includes:
Cắt tóc
Gội đầu
Spa
Nail
Mi
Beauty
Primary differentiator:

```
LIVE WAIT
```

Example:
Tóc Minh
🟢 Ra được ngay
Nail Trang
🟡 ~15 phút
Spa A
🟠 ~40 phút
Actions:
Directions
Picki Chat
Zalo
Không build complex queue engine V1.

## 85. BEAUTY PROVIDER PAGE

Nên học pattern marketplace thân thiện:
Cover
Provider identity
Address
Live status
Wait time
Services
Prices
Images
Reviews
Favorites
Contact
Directions
Không copy:
national marketplace browsing
promotion-first UX
mandatory cart/checkout
mandatory booking

## 86. HEALTH / MEDICINE

Includes:
Đông y
Trị liệu
Khám bệnh
Nhà thuốc
Needs:
professional/provider verification
opening status
availability
contact
booking when appropriate
Health/medicine phải có compliance design riêng trước implementation sâu.
Không coi medicine như normal grocery.
Không xây resident-to-resident medicine exchange.

## 87. EDUCATION

Học thêm
Gia sư
Lớp trẻ em
Filters:
Subject
Grade
Format
Location
Schedule
Price
Flow:
Search

```
↓
```

Profile

```
↓
```

Chat

```
↓
```

Trial / booking if needed
Không cần Picki thu học phí V1.

## 88. PET

Grooming
Tắm/cắt
Pet hotel
Trông pet
Dắt chó
Pet supplies
Lost pet
Vet
Veterinary services treated as regulated/professional services.

## 89. CLASSIFIEDS — THANH LÝ

Structured listing:
Photo
Title
Price
Condition
Location
Description
Flow:
View

```
↓
```

Chat

```
↓
```

Reserve

```
↓
```

Self pickup / Picki delivery
Picki không bắt buộc payment.

## 90. GIVE AWAY

Status:

```
AVAILABLE
RESERVED
GIVEN
```

Flow:
Post

```
↓
```

Request item

```
↓
```

Chat

```
↓
```

Self pickup / Picki delivery

## 91. LOCAL UTILITY

Section:
GÓC KHU MÌNH
🎁 Cho tặng
💰 Thanh lý
🔍 Lost & Found
🐶 Pet Lost
♻️ Reuse / Recycling
Không social feed.
Mỗi content giải quyết một việc.

## 92. LIVE COMMUNITY SIGNAL

Không công khai ai đang làm gì.
Có thể hiển thị aggregate:
12 người quanh bạn vừa đặt món này
8 hộ quanh đây đã dùng thợ này
Một gia đình cách khoảng 350m đang cho tặng bàn học
Không expose private household identity.

## 93. DISCOVERY

Homepage không phải category directory.
Core question:
Hôm nay quanh bạn có gì?
Inputs:
active_zone
time_of_day
availability
open status
popularity
user history
household history
distance
live events
V1 rule-based.
Không AI recommendation.

## 94. HOMEPAGE EXAMPLE

```
PICKI
```

📍 Đại Kim ▼
🔎 Bạn cần gì hôm nay?

```
────────────────
```

HÔM NAY QUANH BẠN
🥖 Bữa sáng đang mở
✂ Salon ra được ngay
🔧 Thợ đang nhận việc
🧺 Giặt là đang nhận đồ
🍌 Bánh chuối đang có
✨ Mới trong khu

```
────────────────
```

TIỆN ÍCH
Ăn uống
Đi chợ
Nhà cửa
Làm đẹp
Giặt là
Sức khỏe
Giáo dục
Thú cưng

```
────────────────
```

CỦA NHÀ BẠN
❤️ Chỗ quen
↻ Mua lại
📦 Đơn
📅 Lịch

```
────────────────
```

GÓC KHU MÌNH
Cho tặng
Thanh lý
Lost & Found

## 95. FULFILLMENT

Core:
deliveries
delivery_routes
route_stops
route_orders
Không:
1 order = 1 route

## 96. HIGH-RISE FULFILLMENT

Building Batch

```
↓
```

Lobby

```
↓
```

Picki Point

```
↓
```

Apartment if required

## 97. GROUND RESIDENTIAL FULFILLMENT

Micro-area Batch

```
↓
```

Street/Alley Cluster

```
↓
```

Door Delivery

## 98. BATCHING V1

Rule based:
compatible destination
compatible ready time
acceptable pickup detour
runner capacity
SLA remains valid
Config:
batch_wait_window
max_batch_orders
max_route_detour
Không advanced optimization solver.

## 99. LOBBY BULK HANDOFF

Runner:

```
[TÔI ĐÃ ĐẾN SẢNH]
Backend event:
```

```
RUNNER_ARRIVED_LOBBY
```

Notify relevant customers.
Customer:

```
[TÔI ĐANG XUỐNG]
Runner sees:
```

#125 Đang xuống
#126 Đã nhận
#127 Chưa phản hồi

## 100. PICKI POINT

Types:

```
LOBBY
DESK
LOCKER
COLLECTION_POINT
PARTNER_STORE
```

Uses:
Food
Grocery
Laundry
Parcel
Classified
Give Away
Offering/order has:
picki_point_eligibility
Not all goods eligible.

## 101. SHOP-OWNED RUNNER

Dispatch policy:

```
PICKI_ONLY
SHOP_RUNNER_FIRST
PICKI_FIRST
MANUAL
```

SHOP_RUNNER_FIRST:

```
READY
↓
```

Offer own runner

```
↓
```

Timeout

```
├── accepted → assign
└── timeout → Picki dispatch
```

## 102. RUNNER

Core:
runners
runner_affiliations
runner_presence
runner_shifts
runner_earnings
Affiliation:

```
INDEPENDENT
SHOP_STAFF
PREFERRED
```

Presence:

```
OFFLINE
AVAILABLE
PICKING_UP
DELIVERING
```

Runner requires verification.

## 103. SERVICEABILITY ENGINE

Final authority.
Inputs:
provider location
customer address
service type

```
ETA
```

Zone policy
provider availability
runner availability
capacity
route detour

```
SLA
```

Output:

```
ELIGIBLE
NOT_ELIGIBLE
```

Never assume:
same_zone = deliverable

## 104. PAYMENT ARCHITECTURE

Transaction

```
↓
```

Payment Service

```
↓
```

Payment Adapter
Vendor independent.
Tables:
payments
payment_events
payment_provider_transactions
refunds
Webhook:
provider_event_id UNIQUE
Idempotent.

## 105. BILLING

Generic:
billing_accounts
plans
plan_features
subscriptions
invoices
invoice_items
payments
Owners:

```
PROVIDER
USER
HOUSEHOLD
```

## 106. PROVIDER MONETIZATION

Pilot:

```
FREE / TRIAL
```

Later:

```
FREE
STANDARD
PRO
```

Core proposition:
Provider trả subscription để có vị trí và khả năng tiếp cận local demand trong Picki Zone.
Không cần commission cao là core business model.

## 107. CONSUMER MONETIZATION

V1:

```
FREE
```

Future:

```
PICKI PLUS
PICKI FAMILY
```

Không paywall core utility V1.

## 108. COMMUNICATION

Two primary paths:

```
PICKI CHAT
ZALO
```

Provider nhỏ có thể dùng Zalo.
Picki Chat giữ conversation trong hệ thống.
Không bắt provider bỏ Zalo.

## 109. MESSAGING

Tables:
conversations
conversation_participants
messages
Picki DB là source of truth.

## 110. NOTIFICATION ARCHITECTURE

Không gọi Zalo trực tiếp trong Order/Service modules.
Business Event

```
↓
```

Outbox

```
↓
```

Notification Service

```
↓
```

Channel Adapter
Channels:

```
WEB
ZALO
PUSH
SMS
EMAIL
```

## 111. OUTBOX

Critical business transaction:
DB transaction

```
↓
```

business state committed +
outbox event committed

```
↓
```

worker

```
↓
```

notification/analytics/side effects
Không giữ user request chờ các side effect không cần thiết.

## 112. GEO ABSTRACTION

GeoService
Capabilities:
geocoding
reverse geocoding

```
ETA
```

routing
navigation link
map rendering
Zone polygons/buildings/access points vẫn thuộc Picki DB.

## 113. STORAGE

Picki-controlled storage:
provider images
offering images
avatars
documents
verification evidence
classified images
Use:
asset_id
storage_key
metadata
Không hotlink external marketplace assets làm source of truth.

## 114. DATABASE — OFFICIAL DOMAIN MAP

```
IDENTITY
────────
```

users
user_identities
user_roles

```
USER / ZONE
───────────
```

user_zone_memberships
addresses
user_addresses
address_verifications
households
household_members
household_invitations

```
ZONE / GEO
──────────
```

zones
zone_cores
zone_candidates
zone_boundaries
zone_boundary_versions
service_areas
shared_service_areas
zone_settings
zone_operational_overrides
zone_planner_layers
zone_planner_scores
zone_planner_recommendations

```
PHYSICAL LOCATION
─────────────────
```

buildings
floors
apartments
access_points
picki_points

```
PROVIDER
────────
```

providers
provider_profiles
provider_locations
provider_zone_memberships
provider_members
provider_categories
provider_live_status
provider_location_verifications
verification_requirements

```
CATALOG
───────
```

categories
catalogs
catalog_items
offerings
offering_prices
offering_availability
option_groups
options
signature_offerings
daily_specials
location_catalog_overrides

```
REVIEWS / RELATIONSHIP
──────────────────────
```

reviews
review_dimensions
favorites
provider_usage_summary

```
COMMERCE
────────
```

orders
order_items
order_status_history

```
SERVICES
────────
```

service_requests
quotes
bookings
leads

```
CLASSIFIED
──────────
```

classified_listings
classified_reservations

```
RUNNER / FULFILLMENT
────────────────────
```

runners
runner_affiliations
runner_presence
runner_shifts
runner_earnings
deliveries
delivery_routes
route_stops
route_orders

```
PAYMENTS
────────
```

payments
payment_events
payment_provider_transactions
refunds

```
BILLING
───────
```

billing_accounts
plans
plan_features
subscriptions
invoices
invoice_items

```
TRUST / FIELD OPS
─────────────────
```

zone_agents
zone_tasks
verification_tasks
verification_results

```
COMMUNICATION
─────────────
```

notifications
notification_channels
notification_preferences
outbox_events
conversations
conversation_participants
messages

```
ASSETS
──────
```

assets

```
OPERATIONS
──────────
```

support_cases
audit_logs

```
ANALYTICS
─────────
```

analytics_events
unserved_demand_events
This is a domain map, not permission to create every table blindly.
Cursor must normalize only when useful and explain deviations.

## 115. DATABASE INVARIANTS

Mandatory:
UUID internal IDs
timestamptz timestamps
integer VND money
never floating-point money
foreign keys
appropriate indexes
appropriate unique constraints
soft delete only where justified
order item snapshots
price snapshots
delivery fee snapshots
delivery address snapshots
server-controlled states
idempotent critical operations
audit sensitive operations
RLS where appropriate
external IDs never replace Picki IDs

## 116. TRANSACTION SNAPSHOTS

Historical transactions must not change when provider edits catalog.
Order item stores snapshot:
name
description where relevant
unit_price
selected_options
provider_location
Order stores delivery snapshot.

## 117. ORDER STATE MACHINE

```
CREATED
↓
PAYMENT_PENDING
↓
PAID
↓
PROVIDER_ACCEPTED
↓
PREPARING
↓
READY
↓
RUNNER_ASSIGNED
↓
PICKED_UP
↓
DELIVERING
↓
DELIVERED
```

Exceptions:

```
PROVIDER_REJECTED
CUSTOMER_CANCELLED
SYSTEM_CANCELLED
PAYMENT_FAILED
REFUND_PENDING
REFUNDED
```

Server controls transitions.

## 118. BOOKING STATE

```
REQUESTED
CONFIRMED
UPCOMING
IN_PROGRESS
COMPLETED
```

Exceptions:

```
CANCELLED_BY_CUSTOMER
CANCELLED_BY_PROVIDER
NO_SHOW
```

## 119. SERVICE REQUEST STATE

```
OPEN
RECEIVING_QUOTES
QUOTE_SELECTED
CONFIRMED
IN_PROGRESS
COMPLETED
```

Exceptions:

```
CANCELLED
EXPIRED
```

## 120. CLASSIFIED STATE

```
DRAFT
AVAILABLE
RESERVED
COMPLETED
ARCHIVED
```

Give Away can reuse.

## 121. SECURITY

Mandatory:
Authentication

```
RBAC
RLS
```

least privilege
rate limiting
audit logging
secret management
signed/private asset URLs
PII protection
backup
recovery
input validation
authorization tests

## 122. MULTI-TENANT AUTHORIZATION

Never rely only on frontend.
Example:
/orders/:id
must verify ownership/role.
Runner sees customer details only for assigned work.
Provider sees only relevant business/customer transaction data.
Zone Agent sees only assigned operational data.

## 123. CONCURRENCY

Must test:
Two runners accepting same route
Two users buying last capacity
Duplicate payment webhook
Duplicate order submission
Capacity reservation
Concurrent provider status updates
Concurrent queue/wait updates
Refund duplication
Use:
transactions
unique constraints
atomic updates
locks where justified
idempotency keys
No naive read-then-write.

## 124. REALTIME

Do not subscribe every user to all Zone events.
Narrow subscriptions:

```
customer → own order
runner → assigned route
provider → own orders
user viewing provider → provider live status
```

Zone-wide discovery should primarily use cached/query data.

## 125. CACHE

Homepage:
Zone Feed

```
↓
```

precompute/cache

```
↓
```

light personalization

```
↓
```

live fragments
Do not run dozens of expensive queries per app open.

## 126. MAP PERFORMANCE

Query by:
active_zone
viewport
category
live status
Use:
PostGIS spatial indexes
marker clustering
pagination/limits
Never load all providers in Hanoi.

## 127. LARGE DATA

Keep business truth:
users
providers
orders
payments
reviews
Partition/archive high-volume tables:
analytics_events
notifications
audit logs
large event history
Do not store continuous GPS trails.

## 128. SCALE STRATEGY

Stage 1
Web/PWA
Modular Monolith
PostgreSQL/PostGIS
Stage 2

```
CDN
```

Cache
Background workers
Observability
Stage 3
Multiple API instances
Redis/cache if justified
Read replicas
Partitioning
Dedicated search if justified
Stage 4
Only then consider extracting services.

## 129. API LAYER MUST BE STATELESS

Load Balancer

```
    │
 ┌──┼──┐
API API API
 └──┼──┘
    │
```

Database
No critical session/business state stored only in one API process memory.

## 130. API IS CLIENT-INDEPENDENT

Wrong:
/zalo/create-order
Correct:
/orders
/providers
/zones
/addresses
/routes
Only integrations:
/integrations/zalo/*
are vendor-specific.

## 131. API GROUPS

/auth
/me
/zones
/zones/discover
/zones/:id/join
/zones/:id/leave
/addresses
/households
/discovery
/search
/map
/providers
/providers/:id/locations
/providers/:id/live-status
/catalog
/offerings
/orders
/bookings
/service-requests
/quotes
/leads
/classifieds
/payments
/billing
/runner
/routes
/messages
/admin
/admin/zone-planner
Exact REST structure may be refined, but business boundaries remain.

## 132. BACKEND MODULES

src/

```
├── modules/
│   ├── auth/
│   ├── users/
│   ├── zones/
│   ├── zone-planner/
│   ├── addresses/
│   ├── households/
│   ├── geo/
│   │
│   ├── providers/
│   ├── catalog/
│   ├── availability/
│   ├── discovery/
│   ├── search/
│   ├── reviews/
│   │
│   ├── orders/
│   ├── bookings/
│   ├── requests/
│   ├── quotes/
│   ├── classifieds/
│   │
│   ├── payments/
│   ├── billing/
│   │
│   ├── runners/
│   ├── fulfillment/
│   ├── routing/
│   │
│   ├── trust/
│   ├── notifications/
│   ├── messaging/
│   │
│   ├── analytics/
│   ├── support/
│   └── admin/
│
├── integrations/
│   ├── identity/
│   ├── notifications/
│   ├── payments/
│   └── geo/
│
├── shared/
└── jobs/
```

## 133. GENERIC CAPABILITY PRINCIPLE

When adding a new vertical:
Compose existing capabilities before creating new architecture.
Example:
Salon

```
LISTING
+ LIVE_STATUS
+ CONTACT
```

Laundry

```
LISTING
+ PICKUP_AND_RETURN
+ DELIVERY
```

Technician

```
LISTING
+ LIVE_STATUS
+ LEAD
+ PROVIDER_VISIT
```

Restaurant

```
LISTING
+ LIVE_STATUS
+ COMMERCE
+ DELIVERY
```

Do not create:
salon-app
laundry-app
technician-app
inside Picki.

## 134. ADMIN IS FIRST-CLASS PRODUCT

Admin manages:
Zone Planner
Zones
Boundaries
Service areas
Shared areas
Operational overrides
Buildings
Access points
Picki Points
Users
Memberships
Addresses
Providers
Locations
Verification
Catalogs
Live status
Orders
Bookings
Requests
Classifieds
Runners
Routes
Payments
Billing
Reviews
Support
Analytics

## 135. ADMIN SENSITIVE ACTIONS

Examples:
refund
cancel
reassign
suspend
approve provider
approve location
pause provider
pause Zone
edit boundary
override serviceability
Must write:
audit_logs

## 136. ANALYTICS EVENTS

At minimum:

```
APP_OPENED
ZONE_DISCOVERED
ZONE_VIEWED
ZONE_JOINED
SEARCH_PERFORMED
MAP_VIEWED
DISCOVERY_CARD_CLICKED
PROVIDER_VIEWED
OFFERING_VIEWED
CONTACT_PROVIDER
DIRECTION_REQUESTED
ORDER_CREATED
ORDER_COMPLETED
BOOKING_CREATED
REQUEST_CREATED
QUOTE_ACCEPTED
CLASSIFIED_VIEWED
CLASSIFIED_RESERVED
```

No warehouse required V1.

## 137. PRIVACY

Do not collect data simply because possible.
Do not store:
continuous user movement
minute-by-minute GPS
unnecessary behavioral telemetry
Store business-relevant events.
Aggregate where possible.

## 138. NORTH STAR

Primary:
Weekly Active Households / Total Households
Secondary:
Useful Actions / Active Household / Week
Useful Action examples:
order
provider contact
booking
service request
classified exchange
Picki delivery

## 139. OTHER KPIs

Marketplace:
Provider retention
Provider paid conversion
Provider response rate
Discovery:
Search success
Provider contact rate

```
Discovery → action
```

Food:
Repeat
Order completion
Preorder adoption
Fulfillment:
Orders / Route
Batch size

```
SLA
```

Lobby handoff time
Zone:
Active households
Supply diversity
Provider density
Zone economics

## 140. INFRASTRUCTURE KPIs

Track:
Infrastructure Cost / MAU
Infrastructure Cost / Useful Action
Infrastructure Cost / Transaction
Do not optimize only total bill.

## 141. ZONE ECONOMICS

Each Zone is measurable economic unit.
Track:
members
active households
providers
paid providers
orders
useful actions
routes
batch size

```
SLA
```

revenue
ops cost
allocated infrastructure cost

## 142. PILOT

Initial:
1 Zone
300–500 target households
~10 Food providers initially
10–15 runners
Food first
4–8 weeks
Numbers are pilot targets, not hard architecture limits.

## 143. PILOT FOOD KPI

Suggested:

| KPI                         | Target                    |
| --------------------------- | ------------------------- |
| Completion                  | ≥95%                      |
| Provider acceptance         | ≥95%                      |
| Cancellation                | <5%                       |
| Prep p50                    | ≤10 min                   |
| Runner assignment p50       | ≤60 sec                   |
| Lobby delivery target       | ~≤12 min where applicable |
| 14-day repeat               | ≥30%                      |
| Orders / active HH / week   | ≥1.5 good                 |
| Provider willingness to pay | Must measure              |

## 144. ROLLOUT

P0
Architecture + Zone Planner
P1
Food MVP
P2
Food + Fulfillment optimization
P3
Laundry + Home Services
P4
Beauty + Live Map
P5
Education + Pet
P6
Classified + Give Away
P7
Zone 2
P8
Multi-Zone replication
Later
Zalo Mini App
Later
Native

## 145. CONDITION TO OPEN ZONE 2

Zone 1 should demonstrate:
repeat household usage
provider value
provider willingness to pay
fulfillment reliability
acceptable complaints
operational playbook
new Zone launch mostly by data/config
Do not open Zone 2 simply because software works.

## 146. DO NOT BUILD V1

Do not implement without explicit approval:
AI recommendation
AI dispatch
social network
newsfeed
public community chat
wallet
crypto
loyalty points
gamification
advanced route solver
microservices
automatic Zone publishing
full automatic Hanoi Zone generation
Grab/ShopeeFood scraping/import
native consumer app
complex automatic settlement
separate architecture per vertical

## 147. CURSOR PROJECT CONSTITUTION

Create:
.cursor/rules/picki-core.mdc
with:

```
PICKI PROJECT CONSTITUTION
```

Picki is a Zone-based local-life utility platform.
Picki follows a Concentrated Demand –
Distributed Supply model.
Dense apartment and urban residential clusters
are the primary demand core.
Surrounding ground residential areas are both
consumers and distributed supply.
Food is the launch vertical, not the platform.
Picki V1 is Web/PWA-first.
Zalo Mini App is a later client.
Picki owns all core business data and logic.
All core entities use Picki UUIDs.
External services must use adapters.
A Zone is core-driven and polygon-based,
not a fixed-radius circle.
Zone Planner and Zone Engine are separate.
Algorithm proposes.
Local knowledge corrects.
Human approves.
Zone boundaries must be versioned.
Membership and Serviceability are separate.
Adjacent Zones may share service areas.
GPS discovers a Zone.
A customer joins a Zone using a
Level-1-valid delivery address.
Membership persists after leaving
the physical Zone.
Customers may join multiple Zones.
Do not impose a hard Zone limit in V1.
Customer verification is progressive.
Provider and Runner verification is stronger.
Provider is the generic business entity.
Provider and Provider Location are separate.
A Provider may have multiple Locations
across multiple Zones.
Opening a new Location must support cloning
reusable configuration from an existing Location.
Opening a new Location must not automatically
close an existing Location.
Location-specific configuration must support overrides.
Provider-level reputation and Location-level
reviews must remain distinguishable.
Provider onboarding must be Picki-native and simple.
Do not implement scraping/import from Grab,
ShopeeFood, Google Maps or similar platforms in V1.
New verticals must compose generic capabilities
instead of creating independent systems.
Live Availability is a first-class capability.
Picki helps users choose nearby providers using
relevance, availability, distance/ETA,
previous usage, repeat behavior,
verified reviews, local popularity,
operational reliability and fair new-provider exposure.
Picki does not declare which provider is
the best or tastiest.
Serviceability is the final authority
for fulfillment eligibility.
All money uses integer VND.
Transaction states are server-controlled.
Critical operations must be idempotent.
Concurrency-sensitive operations must use
atomic database guarantees.
Realtime subscriptions must be narrowly scoped.
Sensitive operations must be audited.
Use a Modular Monolith for V1.
Future Zalo/iOS/Android clients must reuse
the same Picki API and database.
Do not implement features outside
the approved scope without explicit approval.

## 148. ARCHITECTURE DECISION RECORDS

Create:
/docs/DECISIONS.md
Initial ADRs:
ADR-001
Use Modular Monolith for V1.
ADR-002
Picki V1 is Web/PWA-first.
ADR-003
Zalo Mini App is a later client.
ADR-004
Picki uses internal UUIDs.
ADR-005
External identities use mappings/adapters.
ADR-006
Apartment/residential density forms the primary Demand Core.
ADR-007
Picki follows Concentrated Demand – Distributed Supply.
ADR-008
Zone is core-driven and polygon-based.
ADR-009
Zone Planner and Zone Engine are separate.
ADR-010
Travel time/accessibility is preferred over fixed radius.
ADR-011
Zone boundaries are versioned.
ADR-012
Algorithm proposes; human approves.
ADR-013
Membership boundary and Serviceability are separate.
ADR-014
Adjacent Zones may share Service Areas.
ADR-015
GPS discovers Zone.
ADR-016
Level-1 Address allows customer to Join Zone.
ADR-017
User may Join multiple Zones.
ADR-018
Membership persists after leaving physical Zone.
ADR-019
Customer verification is progressive.
ADR-020
Provider replaces Shop as generic business entity.
ADR-021
Provider and Provider Location are separate.
ADR-022
Provider supports multiple Locations and Zones.
ADR-023
New Locations may clone reusable configuration.
ADR-024
Opening new Location does not close old Location.
ADR-025
Provider reputation and Location reviews are separate.
ADR-026
Provider onboarding is Picki-native.
ADR-027
No external marketplace scraping/import in V1.
ADR-028
Live Availability is a first-class capability.
ADR-029
Provider ranking uses multiple trust/relevance signals.
ADR-030
New verticals compose generic capabilities.
ADR-031
Serviceability is final authority for fulfillment.
ADR-032
Fulfillment uses Route + Stop architecture.
ADR-033
High-rise and ground residential use different batching strategies.
ADR-034
Shop-owned runners may fall back to Picki runners.
ADR-035
Payment integrations use adapters.
ADR-036
Notification integrations use adapters.
ADR-037
Picki owns messaging history.
ADR-038
Picki owns business assets.
ADR-039
Realtime subscriptions are narrowly scoped.
ADR-040
Future clients reuse the same API/database.

## 149. DOCUMENT STRUCTURE

Repository:
/docs/
PICKI_MASTER_SPEC.md
PICKI_MVP_SCOPE.md
PICKI_DATABASE_SPEC.md
PICKI_API_SPEC.md
PICKI_ZONE_SPEC.md
PICKI_ZONE_PLANNER_SPEC.md
PICKI_PROVIDER_SPEC.md
PICKI_FOOD_SPEC.md
PICKI_SERVICES_SPEC.md
PICKI_FULFILLMENT_SPEC.md
PICKI_STATE_MACHINES.md
PICKI_SECURITY_SPEC.md
PICKI_INTEGRATIONS_SPEC.md
DECISIONS.md
This file:
PICKI_MASTER_SPEC.md
is highest-level Source of Truth.

## 150. IMPLEMENTATION SPRINTS

| Sprint | Scope                                 |
| ------ | ------------------------------------- |
| S0     | Repository + docs + Cursor Rules      |
| S1     | Database foundation                   |
| S2     | Auth + Identity                       |
| S3     | Geo + PostGIS                         |
| S4     | Zone Planner V1                       |
| S5     | Zone Engine + versioning              |
| S6     | GPS Discover + Join + Address         |
| S7     | Household foundation                  |
| S8     | Provider + Location + Verification    |
| S9     | Provider cloning + multi-Zone         |
| S10    | Catalog + Offering + Options          |
| S11    | Live Availability                     |
| S12    | Search + Live Map                     |
| S13    | Reviews + Favorites + Repeat          |
| S14    | Discovery/Home                        |
| S15    | Food Breakfast/Preorder               |
| S16    | Food Instant/Menu                     |
| S17    | Dinner/Family Meal/Grocery            |
| S18    | Snacks/Daily Specials                 |
| S19    | Orders + State Machine                |
| S20    | Payments                              |
| S21    | Runner                                |
| S22    | Fulfillment + Route                   |
| S23    | Batching + Lobby + Picki Point        |
| S24    | Customer Web/PWA                      |
| S25    | Provider Web/PWA                      |
| S26    | Runner Web/PWA                        |
| S27    | Admin/Ops                             |
| S28    | Messaging + Notifications             |
| S29    | Laundry                               |
| S30    | Home Services                         |
| S31    | Beauty Live Wait                      |
| S32    | Education + Pet                       |
| S33    | Classified + Give Away                |
| S34    | Analytics + Security + Load hardening |
| Later  | Zalo Mini App                         |
| Later  | Native                                |

Sprint order may be adjusted for dependency reasons, but architectural boundaries must remain.

## 151. SPRINT 0 — NO PRODUCT FEATURES

Sprint 0 creates:
repository
workspace structure
docs
Cursor Rules
architecture baseline
TypeScript configuration
environment strategy
lint
typecheck
tests
CI
database migration tooling
integration interfaces
error model
logging baseline
Do not implement:
Food
Provider UI
Zone UI
Orders
Payments
yet.

## 152. FIRST PROMPT FOR CURSOR

Copy exactly after the repository contains this document:
Read /docs/PICKI_MASTER_SPEC.md, /docs/DECISIONS.md,
and every .cursor/rules file before making any
architectural decision.
We are implementing Picki completely from scratch.
There is no production code, no legacy database,
and no architecture that needs to be preserved.
PICKI_MASTER_SPEC.md is the highest-level
Single Source of Truth.
Picki is a Zone-based local-life utility platform
following a Concentrated Demand – Distributed Supply model.
Dense apartment/residential clusters are the primary
Demand Core. Surrounding ground residential areas are
both consumers and distributed supply.
Picki V1 is Web/PWA-first.
Zalo Mini App will be integrated later as another
client using the same Picki API, users and database.
Implement Sprint 0 only.
Do not implement product features yet.
Before modifying files, provide:

1. proposed repository structure;
2. technology stack;
3. dependency choices;
4. PostgreSQL/PostGIS strategy;
5. database migration strategy;
6. authentication strategy;
7. security/RLS strategy;
8. testing strategy;
9. integration adapter architecture;
10. background jobs/outbox strategy;
11. logging/observability strategy;
12. environment/deployment strategy;
13. assumptions;
14. ambiguities or conflicts found in the Master Spec;
15. Sprint 0 implementation plan.
    Do not silently make architecture-changing assumptions.
    Do not implement future features outside the approved scope.
    Prefer the simplest architecture that satisfies the
    Master Spec and can evolve safely.
    Wait for architecture review before making major
    irreversible design choices.

## 153. ARCHITECTURE ACCEPTANCE TEST

Before pilot, answer YES to all:
Can Picki operate without Zalo?

```
YES
```

Can Zalo later become another client?

```
YES
```

Can native clients reuse existing users/data?

```
YES
```

Can one user Join multiple Zones?

```
YES
```

Does leaving a physical Zone preserve membership?

```
YES
```

Can a visitor discover without Joining?

```
YES
```

Does Join collect a useful delivery address?

```
YES
```

Can Zone boundaries change without losing history?

```
YES
```

Can adjacent Zones share service areas?

```
YES
```

Can local knowledge override Zone recommendations?

```
YES
```

Can a Provider have multiple Locations?

```
YES
```

Can a Provider open in Zone 2 without rebuilding
its entire profile/catalog?

```
YES
```

Does opening Zone 2 preserve Zone 1 Location?

```
YES
```

Can Location 2 have different prices/availability?

```
YES
```

Are Location reviews separate from brand reputation?

```
YES
```

Can a provider operate as Listing only?

```
YES
```

Can another provider support full Commerce?

```
YES
```

Can salons show live waiting status without
a complex booking engine?

```
YES
```

Can technicians simply show accepting-work status
and use Chat/Zalo?

```
YES
```

Can Laundry use Pickup-and-Return?

```
YES
```

Can Food support Preorder and Instant?

```
YES
```

Can Food support Family Meals?

```
YES
```

Can Food support complex menu options?

```
YES
```

Can snacks use Live Limited Availability?

```
YES
```

Can Picki help choose among 50 similar providers
without displaying all equally?

```
YES
```

Can verified reviews and repeat behavior influence ranking?

```
YES
```

Can a new provider receive fair exposure?

```
YES
```

Can Classified/Give Away exist without a social feed?

```
YES
```

Can multiple orders share one Route?

```
YES
```

Can high-rise orders batch to Lobby/Picki Point?

```
YES
```

Can ground-residential orders batch by micro-area?

```
YES
```

Can provider-owned runners fall back to Picki runners?

```
YES
```

Can payment vendor be replaced?

```
YES
```

Can map vendor be replaced?

```
YES
```

Can notification vendor be replaced?

```
YES
```

Can new service categories be added mainly by
combining existing capabilities?

```
YES
```

Can API capacity scale horizontally?

```
YES
```

Can Picki reach many Zones without creating
a database per Zone?

```
YES
```

Any NO requires architecture review.

## 154. FINAL PRODUCT MODEL

```
                              PICKI
                          ZONE PLANNER
                               │
                              ZONE
                               │
                       DEMAND CORE
                  Chung cư / KĐT đông dân
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
         USERS              PROVIDERS           LIVE MAP
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                           DISCOVERY
                               │
                  "Hôm nay quanh bạn có gì?"
                               │
       ┌───────────────────────┼────────────────────────┐
       │                       │                        │
      FOOD                  SERVICES               LOCAL UTILITY
       │                       │                        │
```

Breakfast Laundry Thanh lý
Preorder Home Services Cho tặng
Instant Beauty Lost & Found
Family Meals Health Pet Lost
Grocery Education Reuse
Market Pet
Snacks
Late Night

```
       │                       │
       └───────────────────────┼────────────────────────┘
                               │
                         CONNECTION
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
          CHAT              COMMERCE           CONTACT
            │                  │                  │
            └──────────────────┼──────────────────┘
                               │
                         FULFILLMENT
                               │
                ROUTE / BATCH / PICKI POINT
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
         TRUST              BILLING          COMMUNICATION
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                           PICKI API
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
          WEB/PWA             ZALO              NATIVE
          V1 FIRST            LATER             FUTURE
```

## 155. THE PICKI PRINCIPLE

Cursor, developers, operators and future product teams must preserve this:
Picki không cố biến mọi nhu cầu thành một giao dịch phức tạp.
Một salon có thể chỉ cần:
Đang mở

```
↓
```

Ra được ngay

```
↓
```

Chỉ đường / Chat
Một thợ điện:
Đang nhận việc

```
↓
```

Có thể tới sau 30 phút

```
↓
```

Chat / Zalo
Một quán phở:
Đang nhận đơn

```
↓
```

Menu

```
↓
```

Order

```
↓
```

Delivery
Một Home Cook:
Mâm cơm hôm nay

```
↓
```

Preorder

```
↓
```

Prepay

```
↓
```

Batch Delivery
Một người cho bàn cũ:
Cho tặng

```
↓
```

Chat

```
↓
```

Tự lấy / Picki Delivery
Cùng một Picki, nhưng mỗi nhu cầu chỉ sử dụng mức số hóa cần thiết.

## 156. THE PICKI MOAT

Picki không thắng vì có nhiều listing nhất.
Picki phải xây lợi thế từ sự kết hợp:
Dense Local Demand +
Distributed Local Supply +
Live Availability +
Household Context +
Local Trust +
Provider Repeat Data +
Hyperlocal Discovery +
Route Density +
Batching +
Picki Point +
Zone Operational Knowledge

## 157. FINAL NORTH STAR

Picki phải trở thành “lớp tiện ích số” của khu dân cư.
Food đưa user vào.
Live Map cho user thấy khu mình đang sống.
Search giải quyết nhu cầu.
Provider tạo supply.
Reviews tạo trust.
Chỗ quen tạo retention.
Discovery tạo curiosity.
Services tạo dependence.
Picki Point + batching tạo logistics advantage.
Subscription tạo recurring revenue.
Zone Planner tạo khả năng nhân rộng.
Và cuối cùng:
Một gia đình có việc gì quanh nhà — ăn gì, mua gì, tìm ai, sửa gì, làm đẹp ở đâu, chỗ nào đang rảnh, cần giao thứ gì, muốn thanh lý hay cho tặng món gì — phản xạ đầu tiên là mở Picki.

## 158. STATUS OF THIS DOCUMENT OFFICIAL

Từ thời điểm bắt đầu implementation:
Cursor chỉ được coi /docs/PICKI_MASTER_SPEC.md này là Master Product Source of Truth.
Mọi thay đổi kiến trúc quan trọng sau này phải được ghi thành ADR và cập nhật tài liệu chính thức, thay vì để quyết định mới chỉ tồn tại trong prompt hoặc source code.
