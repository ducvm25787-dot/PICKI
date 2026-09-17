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

if [ "${BF_SEED_DEMO:-}" = "1" ] || [ "${BF_SEED_DEMO:-}" = "true" ]; then
  echo "→ Seed Breakfast Preorder (PHỞ GÀ KIM VĂN) · DEMO menu + receiving"
else
  echo "→ Seed Breakfast Preorder (PHỞ GÀ KIM VĂN) · blank reset (UI recreate)"
  echo "  Tip: BF_SEED_DEMO=1 để đăng menu mẫu + mở nhận đơn (cutoff 23:30)"
fi
"$TSX" packages/db/src/seed-breakfast-kvl.ts
