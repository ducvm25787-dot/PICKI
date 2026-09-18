import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Pickee Ops",
    template: "%s · Pickee Ops",
  },
  description: "Admin/Ops — pilot Kim Văn Kim Lũ",
  applicationName: "Pickee Ops",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#334155",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
