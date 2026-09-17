#!/usr/bin/env bash
# Pilot Laundry KVL — staff pickup → shop → return via Picki runner
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${PICKI_API_BASE:-http://localhost:3000/v1}"
KVL_SLUG="kim-van-kim-lu"
KVL_LAT="20.9883"
KVL_LNG="105.8414"

CUSTOMER_PHONE="0901234567"
PROVIDER_PHONE="0908888004"
RUNNER_PHONE="0908888002"

COOKIE_DIR="$(mktemp -d)"
trap 'rm -rf "$COOKIE_DIR"' EXIT

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
elif cmd == "laundry_location":
    for p in d.get("providers", []):
        slug = (p.get("slug") or p.get("providerSlug") or "").lower()
        brand = p.get("brandName") or ""
        if "giat" in slug or "Giặt" in brand:
            print(p.get("locationId") or p.get("id") or "")
            break
elif cmd == "first_offering":
    items = d.get("items") or []
    for item in items:
        if item.get("fulfillmentMode") == "PICKUP_AND_RETURN":
            print(item["id"])
            break
    else:
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
elif cmd == "first_pending_stop":
    route = d.get("route")
    if not route:
        sys.exit(0)
    for s in route.get("stops") or []:
        if s.get("status") in ("PENDING", "ARRIVED"):
            print(s["id"])
            break
elif cmd == "pending_stop_type":
    route = d.get("route")
    if not route:
        sys.exit(0)
    for s in route.get("stops") or []:
        if s.get("status") in ("PENDING", "ARRIVED"):
            print(s.get("stopType") or "")
            break
elif cmd == "pending_stop_status":
    route = d.get("route")
    if not route:
        sys.exit(0)
    for s in route.get("stops") or []:
        if s.get("status") in ("PENDING", "ARRIVED"):
            print(s.get("status") or "")
            break
elif cmd == "lobby_order_ids":
    for h in d.get("handoffs") or []:
        oid = h.get("orderId")
        if oid and h.get("customerStatus") in (None, "WAITING", "waiting"):
            print(oid)
elif cmd == "len_orders":
    print(len(d.get("orders", [])))
elif cmd == "len_pool":
    print(len(d.get("pool", [])))
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
  [ -n "$otp" ] || fail "No devOtp — set AUTH_OTP_DEV_EXPOSE=true"
  api POST "/auth/otp/verify" "{\"phone\":\"$phone\",\"code\":\"$otp\",\"app\":\"$label\"}" "$jar" >/dev/null
  ok "$label logged in"
}

ensure_customer_zone() {
  local jar="$COOKIE_DIR/customer.cookies"
  local mine
  mine="$(api GET "/zones/mine" "" "$jar")"
  if [ "$(echo "$mine" | py has_zone "$KVL_SLUG")" = "True" ]; then
    ok "Customer already in $KVL_SLUG"
    echo "$mine" | py zone_id_for_slug "$KVL_SLUG"
    return
  fi
  fail "Customer not in zone — run food e2e or join manually first"
}

pick_laundry_location() {
  local providers
  providers="$(api GET "/zones/$KVL_SLUG/providers")"
  local loc_id
  loc_id="$(echo "$providers" | py laundry_location)"
  [ -n "$loc_id" ] && [ "$loc_id" != "None" ] || fail "No laundry provider — run: pnpm --filter @picki/db seed:laundry"
  echo "$loc_id"
}

first_offering() {
  local loc_id="$1"
  api GET "/locations/$loc_id/menu" | py first_offering
}

customer_address_id() {
  local zone_id="$1"
  api GET "/zones/${zone_id}/addresses" "" "$COOKIE_DIR/customer.cookies" | py first_address_id
}

create_laundry_order() {
  local zone_id="$1"
  local loc_id="$2"
  local offering_id="$3"
  local address_id="$4"
  local key="e2e-laundry-$(date +%s)-$RANDOM"
  log "Create laundry order (staff home pickup, pay on completion)"
  api POST "/orders" "{\"providerLocationId\":\"$loc_id\",\"zoneId\":\"$zone_id\",\"addressId\":\"$address_id\",\"deliveryHandoffMode\":\"DOOR_DELIVERY\",\"laundryPickupMode\":\"HOME_PICKUP\",\"paymentMode\":\"PAY_ON_COMPLETION\",\"idempotencyKey\":\"$key\",\"items\":[{\"offeringId\":\"$offering_id\",\"quantity\":1}]}" "$COOKIE_DIR/customer.cookies" | py field id
}

order_status() {
  api GET "/orders/$1" "" "$COOKIE_DIR/customer.cookies" | py field status
}

runner_pool_has_order() {
  local order_id="$1"
  api GET "/runner/orders" "" "$COOKIE_DIR/runner.cookies" | py pool_has_order "$order_id"
}

complete_all_pending_stops() {
  local run_jar="$COOKIE_DIR/runner.cookies"
  local n=0
  while [ "$n" -lt 12 ]; do
    local route_resp stop_id stop_type stop_status
    route_resp="$(api GET "/runner/route/active" "" "$run_jar")"
    stop_id="$(echo "$route_resp" | py first_pending_stop)"
    if [ -z "$stop_id" ] || [ "$stop_id" = "None" ]; then
      break
    fi
    stop_type="$(echo "$route_resp" | py pending_stop_type)"
    stop_status="$(echo "$route_resp" | py pending_stop_status)"
    log "Runner complete stop $stop_id ($stop_type · $stop_status)"
    if [ "$stop_type" = "LOBBY_DROPOFF" ] || [ "$stop_type" = "PICKI_POINT" ]; then
      if [ "$stop_status" = "PENDING" ]; then
        api PATCH "/runner/route/stops/$stop_id/arrive" "{}" "$run_jar" >/dev/null
      fi
      local lobby handoff_ids oid
      lobby="$(api GET "/runner/route/stops/$stop_id/lobby" "" "$run_jar")"
      handoff_ids="$(echo "$lobby" | py lobby_order_ids)"
      while IFS= read -r oid; do
        [ -z "$oid" ] && continue
        log "Lobby handoff received · $oid"
        api PATCH "/runner/route/stops/$stop_id/lobby/$oid" '{"action":"received"}' "$run_jar" >/dev/null || true
      done <<< "$handoff_ids"
    fi
    api PATCH "/runner/route/stops/$stop_id" '{}' "$run_jar" >/dev/null
    n=$((n + 1))
  done
}

run_laundry_flow() {
  local order_id="$1"
  local prov_jar="$COOKIE_DIR/provider.cookies"
  local run_jar="$COOKIE_DIR/runner.cookies"

  log "Provider accept (no runner on pickup)"
  api PATCH "/provider/orders/$order_id" '{"action":"accept"}' "$prov_jar" >/dev/null

  local st
  st="$(order_status "$order_id")"
  [ "$st" = "PROVIDER_ACCEPTED" ] || fail "Expected PROVIDER_ACCEPTED after accept, got $st"
  ok "Provider accepted — staff schedules pickup via chat"

  if [ "$(runner_pool_has_order "$order_id")" = "True" ]; then
    fail "Runner must not see laundry order during pickup phase"
  fi
  ok "Runner pool empty during pickup (accept)"

  log "Provider collected items from customer"
  api PATCH "/provider/orders/$order_id" '{"action":"collected"}' "$prov_jar" >/dev/null

  st="$(order_status "$order_id")"
  [ "$st" = "AT_SHOP" ] || fail "Expected AT_SHOP after collected, got $st"
  ok "Items at shop — estimated delivery set"

  if [ "$(runner_pool_has_order "$order_id")" = "True" ]; then
    fail "Runner must not see laundry order while at shop / processing"
  fi
  ok "Runner pool empty during processing"

  log "Provider process laundry"
  api PATCH "/provider/orders/$order_id" '{"action":"processing"}' "$prov_jar" >/dev/null
  api PATCH "/provider/orders/$order_id" '{"action":"ready_for_return"}' "$prov_jar" >/dev/null
  api PATCH "/provider/orders/$order_id" '{"action":"find_return_runner"}' "$prov_jar" >/dev/null

  st="$(order_status "$order_id")"
  [ "$st" = "READY_FOR_RETURN" ] || fail "Expected READY_FOR_RETURN, got $st"

  if [ "$(runner_pool_has_order "$order_id")" != "True" ]; then
    fail "Runner pool must include laundry order after find_return_runner"
  fi
  ok "Runner pool shows order only after Tìm runner"

  log "Runner accept return leg"
  api PATCH "/runner/presence" '{"status":"AVAILABLE"}' "$run_jar" >/dev/null
  # Clear stale lobby stops from prior failed runs before claiming.
  complete_all_pending_stops || true
  api PATCH "/runner/orders/$order_id" '{"action":"accept"}' "$run_jar" >/dev/null
  st="$(order_status "$order_id")"
  [ "$st" = "RETURN_RUNNER_ASSIGNED" ] || fail "Expected RETURN_RUNNER_ASSIGNED, got $st"

  log "Runner return route (shop → customer)"
  complete_all_pending_stops

  st="$(order_status "$order_id")"
  # Lobby receive → DELIVERED; laundry return drop may land COMPLETED.
  [ "$st" = "COMPLETED" ] || [ "$st" = "DELIVERED" ] || fail "Expected COMPLETED/DELIVERED, got $st"
  ok "Laundry order $order_id completed (return leg · $st)"
}

main() {
  echo ""
  echo "=== Picki Pilot Laundry E2E · API ==="
  echo ""

  api GET "/health" >/dev/null || fail "API not reachable"
  ok "API health"

  login "$CUSTOMER_PHONE" "customer"
  login "$PROVIDER_PHONE" "provider"
  login "$RUNNER_PHONE" "runner"

  local zone_id loc_id offering_id address_id order_id
  zone_id="$(ensure_customer_zone)"
  loc_id="$(pick_laundry_location)"
  offering_id="$(first_offering "$loc_id")"
  [ -n "$offering_id" ] && [ "$offering_id" != "None" ] || fail "No laundry offering"
  address_id="$(customer_address_id "$zone_id")"
  [ -n "$address_id" ] || fail "No address"

  ok "Zone=$zone_id laundry=$loc_id offering=$offering_id"

  order_id="$(create_laundry_order "$zone_id" "$loc_id" "$offering_id" "$address_id")"
  ok "Created laundry order $order_id"

  run_laundry_flow "$order_id"

  echo ""
  echo "=== ALL PASS ==="
  echo "Laundry order: $order_id (staff pickup → shop → Picki return)"
  echo ""
}

main "$@"
