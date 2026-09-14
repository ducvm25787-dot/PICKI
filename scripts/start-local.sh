#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

for port in 3000 3001; do
  pid="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    echo "→ Dừng process cũ trên port ${port}..."
    kill $pid 2>/dev/null || true
    sleep 1
  fi
done

echo "→ Xóa cache Next.js (.next)..."
rm -rf apps/web/.next

echo "→ Postgres + migrate + seed..."
$PNPM dev:setup

echo ""
echo "→ Bật API (:3000) + Web (:3001)..."
echo "   Mở trình duyệt: http://localhost:3001/login"
echo "   Dừng server: Ctrl+C"
echo ""

$PNPM dev
