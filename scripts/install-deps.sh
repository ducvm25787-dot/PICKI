#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Cài dependencies (dùng npx pnpm nếu máy chưa có pnpm)..."
bash "$ROOT/scripts/pnpm.sh" install
echo "✓ Xong."
