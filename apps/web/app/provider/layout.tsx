import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Pickee Provider",
    template: "%s · Pickee Provider",
  },
  description: "Quản lý đơn hàng và trạng thái quán — pilot Kim Văn Kim Lũ",
  applicationName: "Pickee Provider",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pickee Provider",
  },
  icons: {
    icon: [
      { url: "/icons/icon-provider-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-provider-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icons/icon-provider.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-provider.png", type: "image/png", sizes: "180x180" },
    ],
  },
  manifest: "/provider/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#2d6a4f",
};

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
