#!/usr/bin/env bash
# Pilot Food KVL — automated API E2E (COD full loop + cancel smoke test)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${PICKI_API_BASE:-http://localhost:3000/v1}"
KVL_SLUG="kim-van-kim-lu"
KVL_LAT="20.9883"
KVL_LNG="105.8414"
SKIP_CANCEL=0

CUSTOMER_PHONE="0901234567"
PROVIDER_PHONE="0908888001"
RUNNER_PHONE="0908888002"
ADMIN_PHONE="0908888003"

COOKIE_DIR="$(mktemp -d)"
trap 'rm -rf "$COOKIE_DIR"' EXIT

usage() {
  echo "Usage: bash scripts/pilot-food-e2e.sh [--skip-cancel] [--api URL]"
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-cancel) SKIP_CANCEL=1 ;;
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
d = json.loads(os.environ["_PY_JSON"])
cmd = sys.argv[1]
if cmd == "zone_id_for_slug":
    slug = sys.argv[2]
    for z in d.get("zones", []):
        if z.get("slug") == slug:
            print(z["zoneId"])
            break
elif cmd == "has_zone":
    slug = sys.argv[2]
    print(any(z.get("slug") == slug for z in d.get("zones", [])))
elif cmd == "com_tam_location":
    for p in d.get("providers", []):
        slug = (p.get("slug") or p.get("providerSlug") or "").lower()
        brand = p.get("brandName") or ""
        if "com-tam" in slug or "Cơm Tấm" in brand:
            print(p.get("locationId") or p.get("id") or "")
            break
    else:
        ps = d.get("providers") or []
        if ps:
            print(ps[0].get("locationId") or ps[0].get("id") or "")
elif cmd == "first_offering":
    items = d.get("items") or []
    if items:
        print(items[0]["id"])
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
    print(cur)
elif cmd == "len_orders":
    print(len(d.get("orders", [])))
elif cmd == "len_providers":
    print(len(d.get("providers", [])))
PY
  unset _PY_JSON
}

# shellcheck disable=SC2120
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
  [ -n "$otp" ] || fail "No devOtp — set AUTH_OTP_DEV_EXPOSE=true"
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

pick_demo_location() {
  local providers
  providers="$(api GET "/zones/$KVL_SLUG/providers")"
  local loc_id
  loc_id="$(echo "$providers" | py com_tam_location)"
  [ -n "$loc_id" ] && [ "$loc_id" != "None" ] || fail "No provider location in zone"
  echo "$loc_id"
}

first_offering() {
  local loc_id="$1"
  local menu
  menu="$(api GET "/locations/$loc_id/menu")"
  echo "$menu" | py first_offering
}

customer_address_id() {
  local zone_id="$1"
  local jar="$COOKIE_DIR/customer.cookies"
  api GET "/zones/${zone_id}/addresses" "" "$jar" | py first_address_id
}

create_cod_order() {
  local zone_id="$1"
  local loc_id="$2"
  local offering_id="$3"
  local address_id="$4"
  local jar="$COOKIE_DIR/customer.cookies"
  local key="e2e-$(date +%s)-$RANDOM"
  log "Create COD order"
  local order
  order="$(api POST "/orders" "{\"providerLocationId\":\"$loc_id\",\"zoneId\":\"$zone_id\",\"addressId\":\"$address_id\",\"deliveryHandoffMode\":\"LOBBY_PICKUP\",\"paymentMode\":\"COD\",\"idempotencyKey\":\"$key\",\"items\":[{\"offeringId\":\"$offering_id\",\"quantity\":1}]}" "$jar")"
  echo "$order" | py field id
}

order_status() {
  local order_id="$1"
  # Customer-only endpoint; provider/runner use PATCH responses for their flows.
  api GET "/orders/$order_id" "" "$COOKIE_DIR/customer.cookies" | py field status
}

provider_location_id() {
  local jar="$COOKIE_DIR/provider.cookies"
  api GET "/provider/locations/mine" "" "$jar" | py field locations[0].locationId
}

run_main_flow() {
  local order_id="$1"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local run_jar="$COOKIE_DIR/runner.cookies"

  log "Provider accept + auto find runner"
  api PATCH "/provider/orders/$order_id" '{"action":"accept"}' "$prov_jar" >/dev/null

  log "Runner set AVAILABLE"
  api PATCH "/runner/presence" '{"status":"AVAILABLE"}' "$run_jar" >/dev/null

  log "Runner accept"
  api PATCH "/runner/orders/$order_id" '{"action":"accept"}' "$run_jar" >/dev/null

  local st
  st="$(order_status "$order_id")"
  [ "$st" = "RUNNER_ASSIGNED" ] || fail "Expected RUNNER_ASSIGNED, got $st"

  log "Provider preparing → ready → handoff"
  api PATCH "/provider/orders/$order_id" '{"action":"preparing"}' "$prov_jar" >/dev/null
  api PATCH "/provider/orders/$order_id" '{"action":"ready"}' "$prov_jar" >/dev/null
  api PATCH "/provider/orders/$order_id" '{"action":"handoff"}' "$prov_jar" >/dev/null

  log "Runner pickup → deliver"
  api PATCH "/runner/orders/$order_id" '{"action":"picked_up"}' "$run_jar" >/dev/null
  api PATCH "/runner/orders/$order_id" '{"action":"delivering"}' "$run_jar" >/dev/null
  api PATCH "/runner/orders/$order_id" '{"action":"delivered"}' "$run_jar" >/dev/null

  st="$(order_status "$order_id")"
  [ "$st" = "DELIVERED" ] || fail "Expected DELIVERED, got $st"
  ok "Order $order_id delivered"
}

verify_history() {
  local loc_id="$1"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local run_jar="$COOKIE_DIR/runner.cookies"

  local ph
  ph="$(api GET "/provider/orders/history?locationId=$loc_id" "" "$prov_jar")"
  local pc
  pc="$(echo "$ph" | py len_orders)"
  [ "${pc:-0}" -gt 0 ] || fail "Provider history empty"
  ok "Provider history: $pc orders"

  local rh
  rh="$(api GET "/runner/orders/history" "" "$run_jar")"
  local rc
  rc="$(echo "$rh" | py len_orders)"
  [ "${rc:-0}" -gt 0 ] || fail "Runner history empty"
  ok "Runner history: $rc orders"
}

run_cancel_test() {
  local zone_id="$1"
  local loc_id="$2"
  local offering_id="$3"
  local address_id="$4"
  local jar="$COOKIE_DIR/customer.cookies"
  local key="e2e-cancel-$(date +%s)"
  log "Cancel smoke test"
  local order_id
  order_id="$(api POST "/orders" "{\"providerLocationId\":\"$loc_id\",\"zoneId\":\"$zone_id\",\"addressId\":\"$address_id\",\"deliveryHandoffMode\":\"LOBBY_PICKUP\",\"paymentMode\":\"COD\",\"idempotencyKey\":\"$key\",\"items\":[{\"offeringId\":\"$offering_id\",\"quantity\":1}]}" "$jar" | py field id)"
  api PATCH "/orders/$order_id" '{"action":"cancel"}' "$jar" >/dev/null
  local st
  st="$(order_status "$order_id")"
  [ "$st" = "CUSTOMER_CANCELLED" ] || fail "Expected CUSTOMER_CANCELLED, got $st"
  ok "Customer cancel OK"
}

preflight() {
  log "Preflight $API_BASE"
  api GET "/health" >/dev/null || fail "API not reachable — run: bash scripts/start-local.sh"
  ok "API health"

  local providers
  providers="$(api GET "/zones/$KVL_SLUG/providers")"
  local count
  count="$(echo "$providers" | py len_providers)"
  [ "${count:-0}" -gt 0 ] || fail "No providers — run: pnpm db:seed"
  ok "Zone $KVL_SLUG has $count providers"
}

main() {
  echo ""
  echo "=== Picki Pilot Food E2E · API ==="
  echo ""

  preflight

  login "$CUSTOMER_PHONE" "customer"
  login "$PROVIDER_PHONE" "provider"
  login "$RUNNER_PHONE" "runner"
  login "$ADMIN_PHONE" "admin"

  local zone_id loc_id offering_id order_id
  zone_id="$(ensure_customer_zone)"
  loc_id="$(pick_demo_location)"
  offering_id="$(first_offering "$loc_id")"
  [ -n "$offering_id" ] && [ "$offering_id" != "None" ] || fail "No menu offering"

  ok "Zone=$zone_id location=$loc_id offering=$offering_id"

  local address_id
  address_id="$(customer_address_id "$zone_id")"
  [ -n "$address_id" ] && [ "$address_id" != "None" ] || fail "No delivery address — join zone first"

  order_id="$(create_cod_order "$zone_id" "$loc_id" "$offering_id" "$address_id")"
  ok "Created order $order_id"

  run_main_flow "$order_id"

  local prov_loc
  prov_loc="$(provider_location_id)"
  verify_history "$prov_loc"

  if [ "$SKIP_CANCEL" -eq 0 ]; then
    run_cancel_test "$zone_id" "$loc_id" "$offering_id" "$address_id"
  fi

  log "Admin dashboard"
  api GET "/admin/dashboard" "" "$COOKIE_DIR/admin.cookies" >/dev/null
  ok "Admin dashboard OK"

  echo ""
  echo "=== ALL PASS ==="
  echo "Order: $order_id - see docs/pilot/FOOD_E2E_CHECKLIST.md for manual UI steps"
  echo ""
}

main "$@"
