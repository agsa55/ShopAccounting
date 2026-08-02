import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // ★ بسته‌هایی که نباید توسط Next.js bundle شوند
  serverExternalPackages: ["mssql", "tedious", "bcryptjs", "bcrypt"],

  // ★ v3.1: رفع هشدار NFT (file tracing) برای Prisma Client
  //   مسیر client مطابق لاگ شما: ./src/generated/client/index.js
  //   این باعث می‌شود Turbopack فقط فایل‌های لازم را trace کند، نه کل پروژه را
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/client/**/*"],
  },

  // ⭐ PWA & Service Worker headers
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=604800, immutable",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;