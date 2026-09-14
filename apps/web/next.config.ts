import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:3000";
    return [
      {
        source: "/v1/:path*",
        destination: `${target}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
