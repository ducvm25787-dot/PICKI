import { NextResponse } from "next/server";

const runnerManifest = {
  name: "Picki Runner — Giao hàng Zone",
  short_name: "Runner",
  description: "Nhận giao, route stops, lobby handoff — pilot Kim Văn Kim Lũ",
  start_url: "/runner",
  scope: "/runner",
  display: "standalone",
  orientation: "portrait",
  background_color: "#f7f5f2",
  theme_color: "#1d4ed8",
  lang: "vi",
  categories: ["business", "navigation"],
  icons: [
    {
      src: "/icons/icon-runner-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-runner-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-runner-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/icon-runner.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
  ],
} as const;

export function GET() {
  return NextResponse.json(runnerManifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
