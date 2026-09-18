import { NextResponse } from "next/server";

const providerManifest = {
  name: "Pickee Provider — Quản lý quán",
  short_name: "Provider",
  description: "Nhận đơn, cập nhật trạng thái quán — pilot Kim Văn Kim Lũ",
  start_url: "/provider",
  scope: "/provider",
  display: "standalone",
  orientation: "portrait",
  background_color: "#f3f0ea",
  theme_color: "#2d6a4f",
  lang: "vi",
  categories: ["business", "food"],
  icons: [
    {
      src: "/icons/icon-provider-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-provider-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-provider-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/icon-provider.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
  ],
} as const;

export function GET() {
  return NextResponse.json(providerManifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
