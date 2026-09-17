#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgresql://picki:picki@localhost:5432/picki}"
TSX="$ROOT/packages/db/node_modules/.bin/tsx"

if [ ! -x "$TSX" ]; then
  echo "❌ Chưa có tsx — chạy trước: bash scripts/install-deps.sh"
  exit 1
fi

if [ "${FD_SEED_DEMO:-}" = "1" ] || [ "${FD_SEED_DEMO:-}" = "true" ]; then
  echo "→ Seed Family Dinner (BẾP NHÀ LAN) · DEMO menu + receiving"
else
  echo "→ Seed Family Dinner (BẾP NHÀ LAN) · blank reset (UI recreate)"
  echo "  Tip: FD_SEED_DEMO=1 để đăng menu mẫu + mở nhận đơn (cutoff 23:59)"
fi
"$TSX" packages/db/src/seed-family-dinner-kvl.ts
