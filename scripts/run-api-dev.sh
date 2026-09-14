#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3000

if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  echo "❌ Port ${PORT} đang bị chiếm. Chạy lại scripts/start-local.sh hoặc:"
  echo "   lsof -ti tcp:${PORT} | xargs kill -9"
  exit 1
fi

cd "$ROOT"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi
export DATABASE_URL="${DATABASE_URL:-postgresql://picki:picki@localhost:5432/picki}"
export SESSION_SECRET="${SESSION_SECRET:-local-dev-secret-16chars}"
export AUTH_OTP_DEV_EXPOSE="${AUTH_OTP_DEV_EXPOSE:-true}"

exec pnpm --filter @picki/api dev
