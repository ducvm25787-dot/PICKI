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

echo "→ Seed Late Night (Bán khuya) · Phở Gà Kim Văn"
"$TSX" packages/db/src/seed-late-night-kvl.ts
