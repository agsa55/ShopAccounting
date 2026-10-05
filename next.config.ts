// ============================================================================
// next.config.ts — ShopAccounting (v13.2 ★★★ Next.js 16 Compatible)
// ----------------------------------------------------------------------------
// ★ v13.2: حذف eslint از NextConfig برای سازگاری با Next.js 16
// ★ رفع خطای:
//   Object literal may only specify known properties,
//   and 'eslint' does not exist in type 'NextConfig'.
// ============================================================================

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // ★ خروجی standalone برای Docker/Runflare
  output: "standalone",

  // ★ Strict Mode در production
  reactStrictMode: false,

  // ★ حذف هدر Next.js
  poweredByHeader: false,

  // ★ فشرده‌سازی فقط در production
  compress: !isDev,

  // ★ source map مرورگر در production تولید نشود
  productionBrowserSourceMaps: false,

  // ★ خطاهای TypeScript را در build نادیده بگیر
  typescript: {
    ignoreBuildErrors: true,
  },

  // ★ تصاویر بدون بهینه‌سازی سمت سرور
  images: {
    unoptimized: true,
    remotePatterns: [],
  },

  // ★ پکیج‌هایی که نباید توسط bundler پردازش شوند
  serverExternalPackages: [
    "bcryptjs",
    "bcrypt",
    "@prisma/client",
  ],

  // ★ برای standalone، فایل‌های Prisma Client include شوند
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/.prisma/client/**/*",
      "./node_modules/@prisma/client/**/*",
    ],
  },

  // ★ تنظیمات کاهش مصرف RAM در build
  experimental: {
    // محدود کردن workerهای build به ۱ CPU
    cpus: 1,

    // بهینه‌سازی import کتابخانه‌های سنگین
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "zustand",
    ],
  },

  // ★ هدرهای امنیتی و استاتیک
  async headers() {
    const staticCacheControl = isDev
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=31536000, immutable";

    return [
      // ── هدرهای امنیتی عمومی ──
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]),
        ],
      },

      // ── Service Worker ──
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: isDev
              ? "no-cache, no-store, must-revalidate"
              : "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },

      // ── Manifest ──
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
          {
            key: "Cache-Control",
            value: isDev
              ? "no-cache, no-store, must-revalidate"
              : "public, max-age=604800",
          },
        ],
      },

      // ── Icons ──
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: staticCacheControl,
          },
        ],
      },

      // ★ هدر سفارشی برای /_next/static حذف شد.
      // Next.js خودش Cache-Control مناسب برای فایل‌های hashed استاتیک می‌دهد.
    ];
  },
};

export default nextConfig;