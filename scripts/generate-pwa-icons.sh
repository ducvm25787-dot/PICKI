#!/usr/bin/env bash
# Rasterize apps/web/public/icons/*.svg → PNG (192/512 + apple-touch 180).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICON_DIR="$ROOT/apps/web/public/icons"
RESVG_DIR="${PICKI_RESVG_DIR:-/tmp/picki-resvg}"
SCRIPT="$RESVG_DIR/render-icons.mjs"

if [ ! -d "$RESVG_DIR/node_modules/@resvg/resvg-js" ]; then
  mkdir -p "$RESVG_DIR"
  (cd "$RESVG_DIR" && npm init -y >/dev/null 2>&1 && npm install @resvg/resvg-js@2.6.2)
fi

cat > "$SCRIPT" <<'EOF'
import { createRequire } from "module";
import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

const require = createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js");
const dir = process.env.PICKI_ICON_DIR;
if (!dir) {
  console.error("PICKI_ICON_DIR required");
  process.exit(1);
}

const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["icon.svg", "apple-touch-icon.png", 180],
  ["icon-maskable.svg", "icon-maskable-512.png", 512],
  ["icon-provider.svg", "icon-provider-192.png", 192],
  ["icon-provider.svg", "icon-provider-512.png", 512],
  ["icon-provider.svg", "apple-touch-icon-provider.png", 180],
  ["icon-provider-maskable.svg", "icon-provider-maskable-512.png", 512],
  ["icon-runner.svg", "icon-runner-192.png", 192],
  ["icon-runner.svg", "icon-runner-512.png", 512],
  ["icon-runner.svg", "apple-touch-icon-runner.png", 180],
  ["icon-runner-maskable.svg", "icon-runner-maskable-512.png", 512],
];

for (const [src, out, size] of jobs) {
  const svg = readFileSync(join(dir, src));
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(join(dir, out), png);
  console.log("✓", out);
}

copyFileSync(join(dir, "apple-touch-icon.png"), join(dir, "..", "apple-touch-icon.png"));
copyFileSync(join(dir, "icon-192.png"), join(dir, "..", "favicon.png"));
console.log("✓ public/apple-touch-icon.png · public/favicon.png");
EOF

PICKI_ICON_DIR="$ICON_DIR" NODE_PATH="$RESVG_DIR/node_modules" node "$SCRIPT"
