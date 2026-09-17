#!/usr/bin/env bash
# Pilot Family Dinner KVL — cook-first PREPAY loop (Bếp Nhà Lan)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${PICKI_API_BASE:-http://localhost:3000/v1}"
KVL_SLUG="kim-van-kim-lu"
KVL_LAT="20.9883"
KVL_LNG="105.8414"
SKIP_CANCEL=0
STAFF_DELIVER=0

CUSTOMER_PHONE="0901234567"
PROVIDER_PHONE="0908888014"
RUNNER_PHONE="0908888002"

COOKIE_DIR="$(mktemp -d)"
trap 'rm -rf "$COOKIE_DIR"' EXIT

usage() {
  echo "Usage: bash scripts/pilot-family-dinner-e2e.sh [--skip-cancel] [--staff-deliver] [--api URL]"
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-cancel) SKIP_CANCEL=1 ;;
    --staff-deliver) STAFF_DELIVER=1 ;;
    --api) API_BASE="$2"; shift ;;
    -h | --help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
  shift
done

log() { echo "→ $*" >&2; }
ok() { echo "✓ $*" >&2; }
fail() { echo "✗ $*" >&2; exit 1; }

json() {
  python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), indent=2))' 2>/dev/null || cat
}

py() {
  export _PY_JSON="$(cat)"
  python3 - "$@" <<'PY'
import json, sys, os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

d = json.loads(os.environ["_PY_JSON"])
cmd = sys.argv[1]

def vn_now():
    return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))

if cmd == "zone_id_for_slug":
    slug = sys.argv[2]
    for z in d.get("zones", []):
        if z.get("slug") == slug:
            print(z["zoneId"])
            break
elif cmd == "has_zone":
    slug = sys.argv[2]
    print(any(z.get("slug") == slug for z in d.get("zones", [])))
elif cmd == "bep_location":
    for loc in d.get("locations", []):
        slug = (loc.get("providerSlug") or "").lower()
        brand = loc.get("brandName") or ""
        if "bep-nha-lan" in slug or "BẾP NHÀ LAN" in brand or "Bếp Nhà Lan" in brand:
            print(loc.get("locationId") or "")
            break
elif cmd == "vn_today":
    print(vn_now().strftime("%Y-%m-%d"))
elif cmd == "future_cutoff":
    t = vn_now() + timedelta(minutes=45)
    print(t.strftime("%H:%M"))
elif cmd == "past_cutoff":
    t = vn_now() - timedelta(minutes=2)
    print(t.strftime("%H:%M"))
elif cmd == "publish_menu_body":
    service_date = sys.argv[2]
    body = {
        "serviceDate": service_date,
        "items": [
            {"category": "MAIN", "name": "E2E Thịt rang", "priceVnd": 109000, "capacity": 40, "allowsSelfCook": True},
            {"category": "SIDE", "name": "E2E Trứng rán", "priceVnd": 39000, "capacity": 40, "allowsSelfCook": True},
            {"category": "VEGETABLE", "name": "E2E Rau muống", "priceVnd": 29000, "capacity": 40},
            {"category": "SOUP", "name": "E2E Canh cua", "priceVnd": 69000, "capacity": 40},
            {"category": "RICE", "name": "E2E Cơm trắng", "priceVnd": 15000, "capacity": 80},
        ],
        "windows": [
            {"startsAt": "17:30", "endsAt": "18:00", "capacity": 20},
            {"startsAt": "18:00", "endsAt": "18:30", "capacity": 20},
        ],
    }
    print(json.dumps(body, ensure_ascii=False))
elif cmd == "order_body":
    # stdin already loaded as d = menu response; argv has zone, loc, address, serviceDate, key
    zone_id, loc_id, address_id, service_date, key = sys.argv[2:7]
    by_cat = {}
    for item in d.get("items") or []:
        cat = item.get("category")
        if cat and cat not in by_cat and item.get("available", True):
            by_cat[cat] = item
    for need in ("MAIN", "SIDE", "VEGETABLE", "SOUP"):
        if need not in by_cat:
            sys.exit(1)
    window = None
    for w in d.get("windows") or []:
        if w.get("available"):
            window = w
            break
    if not window:
        sys.exit(1)
    items = [
        {"menuItemId": by_cat["MAIN"]["id"], "quantity": 1, "prepMode": "READY_COOKED"},
        {"menuItemId": by_cat["SIDE"]["id"], "quantity": 1, "prepMode": "SELF_COOK" if by_cat["SIDE"].get("allowsSelfCook") else "READY_COOKED"},
        {"menuItemId": by_cat["VEGETABLE"]["id"], "quantity": 1},
        {"menuItemId": by_cat["SOUP"]["id"], "quantity": 1},
    ]
    if "RICE" in by_cat:
        items.append({"menuItemId": by_cat["RICE"]["id"], "quantity": 2})
    body = {
        "providerLocationId": loc_id,
        "zoneId": zone_id,
        "addressId": address_id,
        "deliveryHandoffMode": "LOBBY_PICKUP",
        "paymentMode": "PAY_ON_PICKI",
        "orderKind": "FAMILY_DINNER",
        "serviceDate": service_date,
        "deliveryWindowId": window["id"],
        "idempotencyKey": key,
        "items": items,
    }
    print(json.dumps(body, ensure_ascii=False))
elif cmd == "first_address_id":
    addrs = d.get("addresses") or []
    if addrs:
        print(addrs[0]["id"])
elif cmd == "field":
    path = sys.argv[2]
    cur = d
    for part in path.split("."):
        if part.endswith("]"):
            name, idx = part[:-1].split("[")
            cur = cur[name][int(idx)]
        else:
            cur = cur[part]
    print(cur if cur is not None else "")
elif cmd == "len_orders":
    print(len(d.get("orders", [])))
elif cmd == "pool_has_order":
    order_id = sys.argv[2]
    print(any(o.get("id") == order_id for o in d.get("pool", [])))
elif cmd == "len_providers":
    print(len(d.get("providers", [])))
PY
  unset _PY_JSON
}

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local cookie="${4:-}"
  local args=(-sS -X "$method" "${API_BASE}${path}" -H "Content-Type: application/json")
  if [ -n "$cookie" ]; then
    args+=(-b "$cookie" -c "$cookie")
  fi
  if [ -n "$body" ]; then
    args+=(-d "$body")
  fi
  local out
  out="$(curl "${args[@]}" -w $'\n%{http_code}')"
  local code="${out##*$'\n'}"
  local resp="${out%$'\n'*}"
  echo "$resp"
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "HTTP $code for $method $path" >&2
    echo "$resp" | json >&2
    return 1
  fi
}

login() {
  local phone="$1"
  local label="$2"
  local jar="$COOKIE_DIR/$label.cookies"
  log "Login $label · $phone"
  local otp_resp
  otp_resp="$(api POST "/auth/otp/request" "{\"phone\":\"$phone\"}")"
  local otp
  otp="$(echo "$otp_resp" | py field devOtp)"
  [ -n "$otp" ] && [ "$otp" != "None" ] || fail "No devOtp — set AUTH_OTP_DEV_EXPOSE=true"
  api POST "/auth/otp/verify" "{\"phone\":\"$phone\",\"code\":\"$otp\",\"app\":\"$label\"}" "$jar" >/dev/null
  ok "$label logged in"
}

ensure_customer_zone() {
  local jar="$COOKIE_DIR/customer.cookies"
  local mine
  mine="$(api GET "/zones/mine" "" "$jar")"
  local joined
  joined="$(echo "$mine" | py has_zone "$KVL_SLUG")"
  if [ "$joined" = "True" ]; then
    ok "Customer already in $KVL_SLUG"
    echo "$mine" | py zone_id_for_slug "$KVL_SLUG"
    return
  fi
  log "Customer joining zone $KVL_SLUG"
  local preview
  preview="$(api GET "/zones/$KVL_SLUG/preview")"
  local zone_id
  zone_id="$(echo "$preview" | py field zone.id)"
  api POST "/zones/$zone_id/join" "{\"lat\":$KVL_LAT,\"lng\":$KVL_LNG,\"addressType\":\"RESIDENTIAL\",\"label\":\"HOME\",\"building\":\"CT1 Kim Van\",\"floor\":\"12\",\"apartment\":\"1204\"}" "$jar" >/dev/null
  ok "Customer joined zone"
  echo "$zone_id"
}

provider_kitchen_location() {
  local jar="$COOKIE_DIR/provider.cookies"
  local mine
  mine="$(api GET "/provider/locations/mine" "" "$jar")"
  local loc_id
  loc_id="$(echo "$mine" | py bep_location)"
  [ -n "$loc_id" ] && [ "$loc_id" != "None" ] || fail "No Bếp Nhà Lan — run: bash scripts/db-seed-family-dinner.sh"
  echo "$loc_id"
}

customer_address_id() {
  local zone_id="$1"
  api GET "/zones/${zone_id}/addresses" "" "$COOKIE_DIR/customer.cookies" | py first_address_id
}

order_status() {
  api GET "/orders/$1" "" "$COOKIE_DIR/customer.cookies" | py field status
}

setup_kitchen_receiving() {
  local loc_id="$1"
  local service_date="$2"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local future_cutoff past_cutoff menu_body

  future_cutoff="$(echo '{}' | py future_cutoff)"
  log "Publish menu for $service_date"
  menu_body="$(echo '{}' | py publish_menu_body "$service_date")"
  api POST "/provider/locations/$loc_id/family-dinner/menu" "$menu_body" "$prov_jar" >/dev/null
  ok "Menu published"

  log "Open receiving · cutoff=$future_cutoff"
  api PATCH "/provider/locations/$loc_id/family-dinner/settings" "{\"enabled\":true,\"cutoffTime\":\"$future_cutoff\"}" "$prov_jar" >/dev/null
  ok "Receiving open"
}

force_past_cutoff() {
  local loc_id="$1"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local past_cutoff
  past_cutoff="$(echo '{}' | py past_cutoff)"
  log "Move cutoff to past ($past_cutoff) so cooking unlocks"
  api PATCH "/provider/locations/$loc_id/family-dinner/settings" "{\"cutoffTime\":\"$past_cutoff\"}" "$prov_jar" >/dev/null
}

create_and_pay_order() {
  local zone_id="$1"
  local loc_id="$2"
  local address_id="$3"
  local service_date="$4"
  local key_prefix="${5:-e2e-fd}"
  local jar="$COOKIE_DIR/customer.cookies"
  local menu body key order_id payment_id st

  menu="$(api GET "/locations/$loc_id/family-dinner?serviceDate=$service_date" "" "$jar")"
  local accepting
  accepting="$(echo "$menu" | py field acceptingPreorder)"
  [ "$accepting" = "True" ] || fail "Not accepting preorder (acceptingPreorder=$accepting)"

  key="${key_prefix}-$(date +%s)-$RANDOM"
  body="$(echo "$menu" | py order_body "$zone_id" "$loc_id" "$address_id" "$service_date" "$key")"
  [ -n "$body" ] || fail "Could not build meal (missing categories/windows)"

  log "Create FAMILY_DINNER PREPAY order"
  order_id="$(api POST "/orders" "$body" "$jar" | py field id)"
  [ -n "$order_id" ] || fail "No order id"

  st="$(order_status "$order_id")"
  [ "$st" = "CREATED" ] || fail "Expected CREATED after place, got $st"

  log "Payment intent + dev-confirm"
  payment_id="$(api POST "/payments/orders/$order_id/intent" "{}" "$jar" | py field paymentId)"
  [ -n "$payment_id" ] || fail "No paymentId"
  api POST "/payments/$payment_id/dev-confirm" "{}" "$jar" >/dev/null

  st="$(order_status "$order_id")"
  [ "$st" = "PAID" ] || fail "Expected PAID, got $st"
  echo "$order_id"
}

run_cook_first_runner_flow() {
  local order_id="$1"
  local loc_id="$2"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local run_jar="$COOKIE_DIR/runner.cookies"
  local st

  log "Provider accept (no runner yet)"
  api PATCH "/provider/orders/$order_id" '{"action":"accept"}' "$prov_jar" >/dev/null
  st="$(order_status "$order_id")"
  [ "$st" = "PROVIDER_ACCEPTED" ] || fail "Expected PROVIDER_ACCEPTED, got $st"

  force_past_cutoff "$loc_id"

  log "Provider preparing → ready"
  api PATCH "/provider/orders/$order_id" '{"action":"preparing"}' "$prov_jar" >/dev/null
  api PATCH "/provider/orders/$order_id" '{"action":"ready"}' "$prov_jar" >/dev/null
  st="$(order_status "$order_id")"
  [ "$st" = "READY" ] || fail "Expected READY, got $st"

  log "Provider find_runner (after READY)"
  api PATCH "/provider/orders/$order_id" '{"action":"find_runner"}' "$prov_jar" >/dev/null

  log "Runner AVAILABLE + accept (stays READY)"
  api PATCH "/runner/presence" '{"status":"AVAILABLE"}' "$run_jar" >/dev/null
  local pool
  pool="$(api GET "/runner/orders" "" "$run_jar")"
  [ "$(echo "$pool" | py pool_has_order "$order_id")" = "True" ] || fail "Order not in runner pool after find_runner"

  api PATCH "/runner/orders/$order_id" '{"action":"accept"}' "$run_jar" >/dev/null
  st="$(order_status "$order_id")"
  [ "$st" = "READY" ] || fail "Cook-first claim should stay READY, got $st"

  log "Provider handoff → runner pickup → deliver"
  api PATCH "/provider/orders/$order_id" '{"action":"handoff"}' "$prov_jar" >/dev/null
  api PATCH "/runner/orders/$order_id" '{"action":"picked_up"}' "$run_jar" >/dev/null
  api PATCH "/runner/orders/$order_id" '{"action":"delivering"}' "$run_jar" >/dev/null
  api PATCH "/runner/orders/$order_id" '{"action":"delivered"}' "$run_jar" >/dev/null

  st="$(order_status "$order_id")"
  [ "$st" = "DELIVERED" ] || fail "Expected DELIVERED, got $st"
  ok "Order $order_id delivered (runner path)"
}

run_staff_deliver_flow() {
  local order_id="$1"
  local loc_id="$2"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local st

  log "Provider accept → past cutoff → cook → staff_deliver"
  api PATCH "/provider/orders/$order_id" '{"action":"accept"}' "$prov_jar" >/dev/null
  force_past_cutoff "$loc_id"
  api PATCH "/provider/orders/$order_id" '{"action":"preparing"}' "$prov_jar" >/dev/null
  api PATCH "/provider/orders/$order_id" '{"action":"ready"}' "$prov_jar" >/dev/null
  api PATCH "/provider/orders/$order_id" '{"action":"staff_deliver"}' "$prov_jar" >/dev/null
  st="$(order_status "$order_id")"
  [ "$st" = "DELIVERING" ] || fail "Expected DELIVERING after staff_deliver, got $st"
  api PATCH "/provider/orders/$order_id" '{"action":"complete"}' "$prov_jar" >/dev/null
  st="$(order_status "$order_id")"
  [ "$st" = "DELIVERED" ] || fail "Expected DELIVERED, got $st"
  ok "Order $order_id delivered (staff path)"
}

verify_history() {
  local loc_id="$1"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local run_jar="$COOKIE_DIR/runner.cookies"

  local ph pc
  ph="$(api GET "/provider/orders/history?locationId=$loc_id" "" "$prov_jar")"
  pc="$(echo "$ph" | py len_orders)"
  [ "${pc:-0}" -gt 0 ] || fail "Provider history empty"
  ok "Provider history: $pc orders"

  if [ "$STAFF_DELIVER" -eq 0 ]; then
    local rh rc
    rh="$(api GET "/runner/orders/history" "" "$run_jar")"
    rc="$(echo "$rh" | py len_orders)"
    [ "${rc:-0}" -gt 0 ] || fail "Runner history empty"
    ok "Runner history: $rc orders"
  fi
}

run_cancel_test() {
  local zone_id="$1"
  local loc_id="$2"
  local address_id="$3"
  local service_date="$4"
  local order_id st

  # Re-open receiving if cutoff was moved past during main flow
  local future_cutoff
  future_cutoff="$(echo '{}' | py future_cutoff)"
  api PATCH "/provider/locations/$loc_id/family-dinner/settings" "{\"enabled\":true,\"cutoffTime\":\"$future_cutoff\"}" "$COOKIE_DIR/provider.cookies" >/dev/null

  log "Cancel smoke (PAID → CUSTOMER_CANCELLED)"
  order_id="$(create_and_pay_order "$zone_id" "$loc_id" "$address_id" "$service_date" "e2e-fd-cancel")"
  api PATCH "/orders/$order_id" '{"action":"cancel"}' "$COOKIE_DIR/customer.cookies" >/dev/null
  st="$(order_status "$order_id")"
  [ "$st" = "CUSTOMER_CANCELLED" ] || fail "Expected CUSTOMER_CANCELLED, got $st"
  ok "Customer cancel OK"
}

preflight() {
  log "Preflight $API_BASE"
  api GET "/health" >/dev/null || fail "API not reachable — run: bash scripts/start-local.sh"
  ok "API health"

  local providers count
  providers="$(api GET "/zones/$KVL_SLUG/providers")"
  count="$(echo "$providers" | py len_providers)"
  [ "${count:-0}" -gt 0 ] || fail "No providers — run: pnpm db:seed"
  ok "Zone $KVL_SLUG has $count providers"
}

main() {
  echo ""
  echo "=== Picki Pilot Family Dinner E2E · API ==="
  echo ""

  preflight

  login "$CUSTOMER_PHONE" "customer"
  login "$PROVIDER_PHONE" "provider"
  login "$RUNNER_PHONE" "runner"

  local zone_id loc_id address_id service_date order_id
  zone_id="$(ensure_customer_zone)"
  loc_id="$(provider_kitchen_location)"
  address_id="$(customer_address_id "$zone_id")"
  [ -n "$address_id" ] && [ "$address_id" != "None" ] || fail "No delivery address — join zone first"
  service_date="$(echo '{}' | py vn_today)"

  ok "Zone=$zone_id location=$loc_id serviceDate=$service_date"

  setup_kitchen_receiving "$loc_id" "$service_date"
  order_id="$(create_and_pay_order "$zone_id" "$loc_id" "$address_id" "$service_date")"
  ok "Paid order $order_id"

  if [ "$STAFF_DELIVER" -eq 1 ]; then
    run_staff_deliver_flow "$order_id" "$loc_id"
  else
    run_cook_first_runner_flow "$order_id" "$loc_id"
  fi

  verify_history "$loc_id"

  if [ "$SKIP_CANCEL" -eq 0 ]; then
    run_cancel_test "$zone_id" "$loc_id" "$address_id" "$service_date"
  fi

  echo ""
  echo "=== ALL PASS ==="
  echo "Order: $order_id — see docs/pilot/FAMILY_DINNER_E2E_CHECKLIST.md"
  echo ""
}

main "$@"
