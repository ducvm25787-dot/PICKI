import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Picki Provider",
    template: "%s · Picki Provider",
  },
  description: "Quản lý đơn hàng và trạng thái quán — pilot Kim Văn Kim Lũ",
  applicationName: "Picki Provider",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Picki Provider",
  },
  icons: {
    icon: [{ url: "/icons/icon-provider.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-provider.svg", type: "image/svg+xml" }],
  },
  manifest: "/provider/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#2d6a4f",
};

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
