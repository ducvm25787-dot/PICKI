#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgresql://picki:picki@localhost:5432/picki}"
cd "$ROOT"
bash scripts/pnpm.sh --filter @picki/db seed:geo-pins
