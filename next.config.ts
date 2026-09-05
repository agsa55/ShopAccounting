import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "standalone",
  
  typescript: {
    ignoreBuildErrors: true,
  },
  
  reactStrictMode: false,
  
  // ★ بهینه‌سازی تصاویر
  images: {
    unoptimized: true,
    remotePatterns: [],
  },
  
  // ★ بسته‌های external
  serverExternalPackages: ["mssql", "tedious", "bcryptjs", "bcrypt"],
  
  // ★ Prisma Client
  outputFileTracingIncludes: {
    "/api/**": ["./src/generated/client/**/*"],
  },
  
  // ★ فشرده‌سازی (فقط production)
  compress: !isDev,
  
  // ★ Headers
  async headers() {
    // ★ v11.4: Cache-Control متفاوت برای dev و prod
    const staticCacheControl = isDev
      ? "no-cache, no-store, must-revalidate"  // ← در dev: هر بار چک کن
      : "public, max-age=31536000, immutable"; // ← در prod: کش طولانی

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
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
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
      
      // ── فایل‌های استاتیک Next.js (★ اصلاح شده v11.4) ──
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: staticCacheControl,  // ★ در dev: no-cache, در prod: immutable
          },
        ],
      },
    ];
  },
};

export default nextConfig;