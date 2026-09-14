#!/usr/bin/env bash
# Chạy Next dev — exit 1 nếu port bận (Next mặc định exit 0 khi EADDRINUSE).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3001

if lsof -ti "tcp:${PORT}" >/dev/null 2>&1; then
  echo "❌ Port ${PORT} đang bị chiếm. Chạy lại scripts/start-local.sh hoặc:"
  echo "   lsof -ti tcp:${PORT} | xargs kill -9"
  exit 1
fi

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

cd "$ROOT/apps/web"
echo "Picki Web → http://localhost:${PORT}"
if [ "${NEXT_PUBLIC_ENABLE_PUSH:-}" = "true" ]; then
  echo "   Web Push dev: ON (SW enabled)"
fi
exec ./node_modules/.bin/next dev -p "${PORT}"
