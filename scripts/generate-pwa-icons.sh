#!/usr/bin/env bash
# Build PWA PNGs from Pickee brand symbol (cream tile) + keep role SVGs via resvg.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRAND="$ROOT/apps/web/public/brand"
ICON_DIR="$ROOT/apps/web/public/icons"
PUB="$ROOT/apps/web/public"
RESVG_DIR="${PICKI_RESVG_DIR:-/tmp/picki-resvg}"

if [ ! -f "$BRAND/symbol.png" ]; then
  echo "❌ Missing $BRAND/symbol.png — place Pickee symbol first"
  exit 1
fi

if [ ! -d "$RESVG_DIR/node_modules/sharp" ]; then
  mkdir -p "$RESVG_DIR"
  (cd "$RESVG_DIR" && npm init -y >/dev/null 2>&1 && npm install sharp@0.33.5 --no-fund --no-audit)
fi

# Also ensure resvg for provider/runner SVG→PNG if those SVGs exist
if [ ! -d "$RESVG_DIR/node_modules/@resvg/resvg-js" ]; then
  (cd "$RESVG_DIR" && npm install @resvg/resvg-js@2.6.2 --no-fund --no-audit)
fi

NODE_PATH="$RESVG_DIR/node_modules" node <<EOF
const sharp = require("sharp");
const { readFileSync, writeFileSync, copyFileSync, existsSync } = require("fs");
const { join } = require("path");
const { Resvg } = require("@resvg/resvg-js");

const brand = "$BRAND";
const icons = "$ICON_DIR";
const pub = "$PUB";

async function makeAppIcon(size, out, pad = 0.18) {
  const inner = Math.round(size * (1 - pad * 2));
  const symbol = await sharp(join(brand, "symbol.png"))
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const radius = Math.round(size * 0.22);
  const svg = Buffer.from(
    \`<svg xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}">
      <rect width="\${size}" height="\${size}" rx="\${radius}" fill="#f3f0ea"/>
    </svg>\`,
  );
  await sharp(svg).composite([{ input: symbol, gravity: "center" }]).png().toFile(out);
  console.log("✓", out.split("/").pop());
}

(async () => {
  await makeAppIcon(192, join(icons, "icon-192.png"));
  await makeAppIcon(512, join(icons, "icon-512.png"));
  await makeAppIcon(180, join(icons, "apple-touch-icon.png"), 0.16);
  await makeAppIcon(512, join(icons, "icon-maskable-512.png"), 0.22);
  copyFileSync(join(icons, "apple-touch-icon.png"), join(pub, "apple-touch-icon.png"));
  copyFileSync(join(icons, "icon-192.png"), join(pub, "favicon.png"));

  const jobs = [
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
    const p = join(icons, src);
    if (!existsSync(p)) continue;
    const png = new Resvg(readFileSync(p), { fitTo: { mode: "width", value: size } }).render().asPng();
    writeFileSync(join(icons, out), png);
    console.log("✓", out);
  }
  console.log("✓ favicon + apple-touch");
})().catch((e) => { console.error(e); process.exit(1); });
EOF
