import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Picki Runner",
    template: "%s · Picki Runner",
  },
  description: "Nhận giao, route và lobby handoff — pilot Kim Văn Kim Lũ",
  applicationName: "Picki Runner",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Picki Runner",
  },
  icons: {
    icon: [
      { url: "/icons/icon-runner-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-runner-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icons/icon-runner.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-runner.png", type: "image/png", sizes: "180x180" },
    ],
  },
  manifest: "/runner/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

export default function RunnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
