#!/usr/bin/env bash
# Dùng pnpm global nếu có; không thì npx pnpm (không cần cài pnpm).
set -euo pipefail
if command -v pnpm >/dev/null 2>&1; then
  exec pnpm "$@"
fi
exec npx --yes pnpm@9.15.0 "$@"
