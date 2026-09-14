#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.docker/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgresql://picki:picki@localhost:5432/picki}"

echo "=== Picki local demo ==="
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Không tìm thấy Docker."
  echo "   → Cài Docker Desktop: https://www.docker.com/products/docker-desktop/"
  echo "   → Mở Docker Desktop, đợi icon cá voi xanh, chạy lại script này."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker chưa chạy."
  echo "   → Mở Docker Desktop, đợi Ready, chạy lại script này."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "→ pnpm chưa có, dùng npx..."
  PNPM="npx --yes pnpm@9.15.0"
else
  PNPM="pnpm"
fi

echo "→ Cài dependencies (lần đầu có thể hơi lâu)..."
$PNPM install

free_port() {
  local port="$1"
  local attempt=0
  while [ "$attempt" -lt 8 ]; do
    local pids
    pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    if [ -z "$pids" ]; then
      return 0
    fi
    echo "→ Dừng process cũ trên port ${port} (pid: ${pids})..."
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 1
    attempt=$((attempt + 1))
  done
  if lsof -ti "tcp:${port}" >/dev/null 2>&1; then
    echo "❌ Port ${port} vẫn bị chiếm."
    echo "   Chạy: lsof -ti tcp:${port} | xargs kill -9"
    exit 1
  fi
}

free_port 3000
free_port 3001

echo "→ Xóa cache Next.js (.next)..."
rm -rf apps/web/.next

echo "→ Postgres + migrate + seed..."
$PNPM dev:setup

echo ""
echo "→ Bật API (:3000) + Web (:3001)..."
echo "   Chờ 2 dòng: [api] Picki API listening… + [web] ✓ Ready"
echo "   Mở trình duyệt: http://localhost:3001/login"
echo "   Dừng server: Ctrl+C"
echo ""

$PNPM dev
