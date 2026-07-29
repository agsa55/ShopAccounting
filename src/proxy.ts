// ============================================================================
// src/proxy.ts — Proxy (Middleware) — ShopAccounting v23.8
// ★ v23.8: اضافه کردن config.matcher + bypass فایل‌های استاتیک PWA
// ★ v23.8.1: فیکس باگ حلقه رفرش ناشی از /.well-known/appspecific/com.chrome.devtools.json
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

// ─── مسیرهای عمومی API ───────────────────────────────────────────────────────
const PUBLIC_API_PATHS = [
  '/api/auth/login',
  '/api/auth/verify',
  '/api/auth/refresh',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/otp/send',
  '/api/auth/otp/verify',
  '/api/tenants/register',
  '/api/tenants/verify-otp',
  '/api/tenants/check-subdomain',
  '/api/tenants/resolve',
  '/api/tenants/register-otp/send',
  '/api/tenants/register-otp/verify',
  '/api/cron/',
  '/api/plan-prices',
  '/api/plan-limits',
  '/api/plan-tiers',
  '/api/db-diag',
  '/api/subscription/verify',
  '/api/subscription/checkout',
  '/api/payments/online/verify',
  '/api/demo/register',
  '/api/demo/verify-otp',
  '/api/demo/resend-otp',
  '/api/demo/cleanup',
  '/api/demo/recover',
  '/api/demo/recover-verify',
  '/api/cron/demo-cleanup',
  '/api/admin/auth/login',  // ★★★ این خط را اضافه کنید
];

// ★ فایل‌های استاتیک که باید bypass شوند (PWA + fonts + icons)
const STATIC_BYPASS_PATHS = [
  '/sw.js',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
];

const STATIC_BYPASS_PREFIXES = [
  '/icons/',
  '/fonts/',
  '/images/',
  '/_next/',
  '/.well-known/', // ★ فیکس: bypass مسیرهای well-known (مثل درخواست خودکار Chrome DevTools)
];

const RESERVED_PATHS = new Set([
  'auth', 'admin', 'api', '_next', 'static', 'favicon.ico',
  'login', 'register', 'landing', 'dashboard',
  'products', 'invoices', 'employees', 'settings', 'reports',
  'accounts', 'store-setting', 'portal',
  'subscription',
  'demo',
]);

// ★ فیکس: الگوی معتبر برای tenant slug (فقط حروف، عدد و خط تیره — بدون نقطه یا کاراکترهای خاص)
const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/i;

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'shopaccounting.ir';

// ─── Helper: آیا مسیر باید bypass شود؟ ──────────────────────────────────────
function shouldBypassStatic(pathname: string): boolean {
  // فایل‌های دقیق
  if (STATIC_BYPASS_PATHS.includes(pathname)) return true;

  // پیشوندهای استاتیک
  if (STATIC_BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;

  // ★ فیکس: هر مسیری که با نقطه شروع بشه (dot-file/dot-folder مثل .well-known)
  if (pathname.startsWith('/.')) return true;

  // فایل‌های با پسوند استاتیک
  const staticExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
    '.css', '.js', '.map',
    '.webp', '.avif',
    '.mp4', '.webm',
    '.pdf', '.zip',
    '.json', // ★ فیکس: json های استاتیک مثل com.chrome.devtools.json
  ];
  if (staticExtensions.some(ext => pathname.endsWith(ext))) return true;

  return false;
}

// ─── Helper: تنظیم کوکی‌های tenant ──────────────────────────────────────────
function setTenantCookies(
  response: NextResponse,
  tenantSlug: string,
  tenantView?: string
) {
  response.cookies.set('tenant-slug', tenantSlug, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  if (tenantView) {
    response.cookies.set('tenant-view', tenantView, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });
  }
  response.headers.set('x-tenant-slug', tenantSlug);
  if (tenantView) response.headers.set('x-tenant-view', tenantView);
}

// ─── Helper: پاک کردن کوکی‌های tenant ───────────────────────────────────────
function clearTenantCookies(response: NextResponse) {
  const cookiesToClear = [
    'tenant-slug',
    'tenant-view',
    'token',
    'auth-token',
    'refreshToken',
  ];

  cookiesToClear.forEach(name => {
    response.cookies.set(name, '', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 0,
    });
  });
}

// ─── Helper: آیا localhost است؟ ──────────────────────────────────────────────
function isLocalhost(request: NextRequest): boolean {
  const host = request.headers.get('host') || '';
  return host.includes('localhost') || host.includes('127.0.0.1');
}

// ─── Helper: آیا درخواست logout با پارامتر است؟ ─────────────────────────────
function isRootWithLogout(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const logoutParam = request.nextUrl.searchParams.get('logout');
  return pathname === '/' && logoutParam === '1';
}

// ─── Helper: No-Cache headers ────────────────────────────────────────────────
function addNoCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

// ════════════════════════════════════════════════════════════════════════════
// ★ Middleware اصلی
// ════════════════════════════════════════════════════════════════════════════
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl;

  // ── ★ ۱. Bypass فایل‌های استاتیک PWA (مهم‌ترین بخش) ──────────────────────
  // sw.js، manifest.json، آیکون‌ها، فونت‌ها و .well-known باید سریع و بدون پردازش سرو شوند
  if (shouldBypassStatic(pathname)) {
    return NextResponse.next();
  }

  // ── ۲. مسیر /api/auth/logout — پاک کردن کوکی‌ها ──────────────────────────
  if (pathname === '/api/auth/logout') {
    const response = NextResponse.json({ success: true, message: 'logged out' });
    clearTenantCookies(response);
    return response;
  }

  // ── ۳. Logout redirect — پاک کردن کوکی‌ها و redirect به / ─────────────────
  if (isRootWithLogout(request)) {
    const cleanUrl = new URL('/', request.url);
    const response = NextResponse.redirect(cleanUrl);
    clearTenantCookies(response);
    addNoCacheHeaders(response);
    return response;
  }

  // ── ۴. تشخیص tenant ──────────────────────────────────────────────────────
  let tenantSlugFromUrl: string | null = null;
  let tenantView: string | null = null;
  let rewriteUrl: URL | null = null;

  const hostname = request.headers.get('host') || '';

  // ★ Subdomain detection
  if (
    hostname !== 'localhost:3000' &&
    hostname !== 'localhost:3001' &&
    hostname !== ROOT_DOMAIN &&
    hostname !== `www.${ROOT_DOMAIN}`
  ) {
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];
      if (subdomain && subdomain !== 'www') {
        if (subdomain === 'admin') return NextResponse.next();
        tenantSlugFromUrl = subdomain;
      }
    }
  }

  // ★ Path-based tenant detection
  if (!tenantSlugFromUrl && pathname !== '/') {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];

    if (
      firstSegment &&
      VALID_SLUG_REGEX.test(firstSegment) && // ★ فیکس: فقط الگوی معتبر slug قبول میشه (مسیرهایی مثل .well-known رد میشن)
      !RESERVED_PATHS.has(firstSegment) &&
      !firstSegment.startsWith('api')
    ) {
      tenantSlugFromUrl = firstSegment;
      const rest = segments.slice(1).join('/');

      if (!rest) tenantView = null;
      else if (rest === 'login') tenantView = 'login';
      else if (rest === 'register') tenantView = 'register';
      else tenantView = rest;

      if (tenantView === 'register') {
        rewriteUrl = new URL('/auth/register', url);
      } else {
        rewriteUrl = new URL('/', url);
      }
    }
  }

  const isApiRoute = pathname.startsWith('/api/');
  let effectiveTenantSlug: string | null = tenantSlugFromUrl;

  if (!effectiveTenantSlug && isApiRoute) {
    effectiveTenantSlug = request.cookies.get('tenant-slug')?.value || null;
  }

  if (!tenantView && tenantSlugFromUrl) {
    tenantView = request.cookies.get('tenant-view')?.value || null;
  }

  // ── ۵. API Routes ─────────────────────────────────────────────────────────
  if (isApiRoute) {
    // ★ Public API paths — بدون نیاز به توکن
    if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
      const response = NextResponse.next();
      if (effectiveTenantSlug) {
        response.headers.set('x-tenant-slug', effectiveTenantSlug);
      }
      return response;
    }

    // ★ Protected API paths — نیاز به توکن
    const authHeader = request.headers.get('authorization');
    const tokenFromHeader = authHeader?.replace('Bearer ', '') || undefined;
    const tokenFromCookie = request.cookies.get('token')?.value;
    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'دسترسی غیرمجاز.',
          errorCode: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    const response = NextResponse.next();
    if (!authHeader && tokenFromCookie) {
      response.headers.set('x-authorization', `Bearer ${tokenFromCookie}`);
    }
    if (effectiveTenantSlug) {
      response.headers.set('x-tenant-slug', effectiveTenantSlug);
    }
    return response;
  }

  // ── ۶. Auth Pages ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/auth/')) {
    const token = request.cookies.get('token')?.value;
    if (token && effectiveTenantSlug) {
      if (isLocalhost(request)) {
        return NextResponse.redirect(
          new URL(`/${effectiveTenantSlug}`, request.url)
        );
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
    const response = NextResponse.next();
    if (effectiveTenantSlug) {
      setTenantCookies(response, effectiveTenantSlug, tenantView || undefined);
    }
    return response;
  }

  // ── ۷. Tenant Pages ───────────────────────────────────────────────────────
  if (effectiveTenantSlug) {
    const response = rewriteUrl
      ? NextResponse.rewrite(rewriteUrl)
      : NextResponse.next();
    setTenantCookies(response, effectiveTenantSlug, tenantView || undefined);
    return response;
  }

    // ── ۹. Admin UI Protection ──────────────────────────────────────────────────
   // ── ۹. Admin UI Protection ──────────────────────────────────────────────────
  if (pathname.startsWith('/admin/') && pathname !== '/admin/login') {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      console.log('[Middleware] ❌ Admin redirect: No token found in cookies');
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    try {
      const jwt = require('jsonwebtoken');
      // ★★★ استفاده از ! برای اطمینان از وجود Secret
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;

      if (decoded.userType !== 'admin' && decoded.role !== 'SuperAdmin') {
        console.log('[Middleware] ❌ Admin redirect: Invalid role ->', decoded.userType, decoded.role);
        return NextResponse.redirect(new URL('/', request.url));
      }

      console.log('[Middleware] ✅ Admin access granted for user:', decoded.username);
      
      // ارسال توکن به سرور برای استفاده احتمالی در APIها
      const response = NextResponse.next();
      response.headers.set('x-authorization', `Bearer ${token}`);
      return response;

    } catch (e: any) {
      // ★★★ این لاگ دقیقاً به ما می‌گوید چرا توکن رد شده است
      console.error('[Middleware] ❌ Admin redirect: JWT Verify Failed ->', e.message);
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // ── ۸. Landing Page ───────────────────────────────────────────────────────
  const landingResponse = NextResponse.next();
  clearTenantCookies(landingResponse);
  addNoCacheHeaders(landingResponse);
  return landingResponse;
}

// ════════════════════════════════════════════════════════════════════════════
// ★★★ config.matcher — مهم‌ترین بخش برای عملکرد PWA
// ════════════════════════════════════════════════════════════════════════════
export const config = {
  matcher: [
    /*
     * همه مسیرها به‌جز:
     * - _next/static  (فایل‌های استاتیک Next.js)
     * - _next/image   (بهینه‌سازی تصاویر Next.js)
     * - _next/webpack-hmr (Hot Module Replacement)
     * - فایل‌های با پسوند استاتیک (تصاویر، فونت‌ها، ...)
     * - .well-known (درخواست‌های خودکار مرورگر مثل Chrome DevTools)
     *
     * ★ sw.js و manifest.json باید اینجا exclude شوند
     * تا مستقیم از public/ سرو شوند (بدون middleware)
     */
    '/((?!_next/static|_next/image|_next/webpack-hmr|sw\\.js|manifest\\.json|favicon\\.ico|robots\\.txt|sitemap\\.xml|\\.well-known|icons/|fonts/|images/).*)',
  ],
};