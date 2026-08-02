// ============================================================================
// src/proxy.ts — Proxy (Middleware) — ShopAccounting (v3.1 ★★★ Next.js 16 Fix)
// ============================================================================
// ★★★ v3.1 تغییرات نسبت به v3.0:
//   ★ حذف export const runtime = 'nodejs'
//     → در Next.js 16 فایل Proxy اجازه Route segment config ندارد
//     → Proxy همیشه روی Node.js اجرا می‌شود (نیازی به اعلام صریح نیست)
//     → این خط عامل خطای بیلد بود:
//       "Route segment config is not allowed in Proxy file"
//   ★ jsonwebtoken بدون اعلام runtime هم روی Node.js به‌درستی کار می‌کند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';  // ★ v3.0: import استاتیک به‌جای require

// ★ v3.1: حذف export const runtime = 'nodejs'
//   در Next.js 16، Proxy همیشه روی Node.js اجرا می‌شود و اعلام runtime
//   نه‌تنها لازم نیست، بلکه غیرمجاز است و بیلد را می‌شکند.

// ─── مسیرهای عمومی API ───────────────────────────────────────────────────────
const PUBLIC_API_PATHS = [
   '/api/health', 
  '/api/auth/login', '/api/auth/verify', '/api/auth/refresh',
  '/api/auth/send-otp', '/api/auth/verify-otp', '/api/auth/otp/send', '/api/auth/otp/verify',
  '/api/tenants/register', '/api/tenants/verify-otp', '/api/tenants/check-subdomain',
  '/api/tenants/resolve', '/api/tenants/register-otp/send', '/api/tenants/register-otp/verify',
  '/api/cron/', '/api/plan-prices', '/api/plan-limits', '/api/plan-tiers',
  '/api/db-diag', '/api/subscription/verify', '/api/subscription/checkout',
  '/api/payments/online/verify', '/api/demo/register', '/api/demo/verify-otp',
  '/api/demo/resend-otp', '/api/demo/cleanup', '/api/demo/recover',
  '/api/demo/recover-verify', '/api/cron/demo-cleanup', '/api/admin/auth/login',
];

const STATIC_BYPASS_PATHS = ['/sw.js', '/manifest.json', '/robots.txt', '/sitemap.xml', '/favicon.ico'];
const STATIC_BYPASS_PREFIXES = ['/icons/', '/fonts/', '/images/', '/_next/', '/.well-known/'];

const RESERVED_PATHS = new Set([
  'auth', 'admin', 'api', '_next', 'static', 'favicon.ico',
  'login', 'register', 'landing', 'dashboard', 'products', 'invoices',
  'employees', 'settings', 'reports', 'accounts', 'store-setting',
  'portal', 'subscription', 'demo',
]);

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/i;
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'shopaccounting.ir';

// ─── Helper Functions ───────────────────────────────────────────────────────

function shouldBypassStatic(pathname: string): boolean {
  if (STATIC_BYPASS_PATHS.includes(pathname)) return true;
  if (STATIC_BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith('/.')) return true;
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.css', '.js', '.map', '.webp', '.avif', '.mp4', '.webm', '.pdf', '.zip', '.json'];
  if (staticExtensions.some(ext => pathname.endsWith(ext))) return true;
  return false;
}

// ★★★ v3.0: تطبیق دقیق — exact match برای مسیرهای بدون / و prefix match برای مسیرهای با /
function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) => {
    if (p.endsWith('/')) {
      // مسیرهایی مثل '/api/cron/' → prefix match
      return pathname.startsWith(p);
    }
    // مسیرهایی مثل '/api/auth/login' → exact match یا زیرمسیر
    return pathname === p || pathname.startsWith(p + '/');
  });
}

function setTenantCookies(response: NextResponse, tenantSlug: string, tenantView?: string) {
  response.cookies.set('tenant-slug', tenantSlug, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  });
  if (tenantView) {
    response.cookies.set('tenant-view', tenantView, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
    });
  }
  response.headers.set('x-tenant-slug', tenantSlug);
  if (tenantView) response.headers.set('x-tenant-view', tenantView);
}

// ★★★ v3.0: حذف 'auth-token' (هیچ‌جا ست نمی‌شود) — فقط کوکی‌های واقعی
function clearTenantCookies(response: NextResponse) {
  ['tenant-slug', 'tenant-view', 'token', 'refreshToken'].forEach(name => {
    response.cookies.set(name, '', { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 0 });
  });
}

function isLocalhost(request: NextRequest): boolean {
  const host = request.headers.get('host') || '';
  return host.includes('localhost') || host.includes('127.0.0.1');
}

function isRootWithLogout(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const logoutParam = request.nextUrl.searchParams.get('logout');
  return pathname === '/' && logoutParam === '1';
}

function addNoCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

// ★★★ v3.0: هدرهای امنیتی — به تمام پاسخ‌های HTML اضافه می‌شود
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

function extractTenantSubdomain(hostname: string): string | null {
  const hostWithoutPort = hostname.split(':')[0];
  if (!hostWithoutPort.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const subdomain = hostWithoutPort.slice(0, hostWithoutPort.length - ROOT_DOMAIN.length - 1);
  if (!subdomain || subdomain === 'www') return null;
  return subdomain;
}

function isValidTenantSlug(slug: string | null | undefined): slug is string {
  if (!slug) return false;
  if (slug.length < 2 || slug.length > 63) return false;
  if (!VALID_SLUG_REGEX.test(slug)) return false;
  if (RESERVED_PATHS.has(slug.toLowerCase())) return false;
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) return false;
  return true;
}

function isValidTenantView(view: string | null | undefined): view is string {
  if (!view) return false;
  if (view.length > 100) return false;
  if (!/^[a-z0-9\-/]+$/i.test(view)) return false;
  if (view.includes('..')) return false;
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// ★ میدل‌ور اصلی
// ════════════════════════════════════════════════════════════════════════════
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl;

  // ── ۱. Bypass فایل‌های استاتیک ──────────────────────────────────────────────
  if (shouldBypassStatic(pathname)) {
    return NextResponse.next();
  }

  // ── ۲. مدیریت Logout ──────────────────────────────────────────────────────
  if (pathname === '/api/auth/logout') {
    const response = NextResponse.json({ success: true, message: 'logged out' });
    clearTenantCookies(response);
    return response;
  }

  if (isRootWithLogout(request)) {
    const cleanUrl = new URL('/', request.url);
    const response = NextResponse.redirect(cleanUrl);
    clearTenantCookies(response);
    addNoCacheHeaders(response);
    return response;
  }

  // ── ۳. خروج زودهنگام برای صفحات عمومی (لندینگ و Auth) ─────────────────────
  // ★★★ v3.0: فقط وقتی کوکی tenant وجود داشته باشد پاک می‌شود (نه هر درخواست)
  if (pathname === '/' || pathname.startsWith('/auth/')) {
    const response = NextResponse.next();
    addSecurityHeaders(response);

    const hasTenantCookie = request.cookies.get('tenant-slug')?.value;
    const hasTenantView = request.cookies.get('tenant-view')?.value;

    if (hasTenantCookie) {
      response.cookies.set('tenant-slug', '', { path: '/', maxAge: 0, httpOnly: true });
    }
    if (hasTenantView) {
      response.cookies.set('tenant-view', '', { path: '/', maxAge: 0, httpOnly: true });
    }

    return response;
  }

  // ── ۴. تشخیص Tenant ───────────────────────────────────────────────────────
  let tenantSlugFromUrl: string | null = null;
  let tenantView: string | null = null;
  let rewriteUrl: URL | null = null;
  const hostname = request.headers.get('host') || '';

  // الف) تشخیص از طریق ساب‌دامین
  if (!isLocalhost(request)) {
    const subdomain = extractTenantSubdomain(hostname);
    if (subdomain) {
      // ساب‌دامین admin → مستقیم عبور کن (پنل ادمین)
      if (subdomain === 'admin') {
        const response = NextResponse.next();
        addSecurityHeaders(response);
        return response;
      }
      if (isValidTenantSlug(subdomain)) {
        tenantSlugFromUrl = subdomain;
      }
    }
  }

  // ب) تشخیص از طریق مسیر (Path-based)
  if (!tenantSlugFromUrl) {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];

    // ★★★ v3.0: حذف چک اضافی startsWith('api') — RESERVED_PATHS خودش 'api' دارد
    if (firstSegment && VALID_SLUG_REGEX.test(firstSegment) && !RESERVED_PATHS.has(firstSegment)) {
      if (isValidTenantSlug(firstSegment)) {
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
  }

  const isApiRoute = pathname.startsWith('/api/');
  let effectiveTenantSlug: string | null = tenantSlugFromUrl;

  // ج) فال‌بک به کوکی (فقط برای API Routes)
  if (!effectiveTenantSlug && isApiRoute) {
    const cookieSlug = request.cookies.get('tenant-slug')?.value || null;
    if (isValidTenantSlug(cookieSlug)) {
      effectiveTenantSlug = cookieSlug;
    }
  }

  if (!tenantView && tenantSlugFromUrl) {
    const cookieView = request.cookies.get('tenant-view')?.value || null;
    if (isValidTenantView(cookieView)) {
      tenantView = cookieView;
    }
  }

  // ── ۵. مدیریت مسیرهای API ─────────────────────────────────────────────────
  if (isApiRoute) {
    // ★★★ v3.0: تطبیق دقیق به‌جای startsWith کور
    if (isPublicApiPath(pathname)) {
      const response = NextResponse.next();
      if (effectiveTenantSlug) response.headers.set('x-tenant-slug', effectiveTenantSlug);
      return response;
    }

    const authHeader = request.headers.get('authorization');
    const tokenFromHeader = authHeader?.replace('Bearer ', '') || undefined;
    const tokenFromCookie = request.cookies.get('token')?.value;
    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز.', errorCode: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const response = NextResponse.next();
    if (!authHeader && tokenFromCookie) {
      response.headers.set('x-authorization', `Bearer ${tokenFromCookie}`);
    }
    if (effectiveTenantSlug) response.headers.set('x-tenant-slug', effectiveTenantSlug);
    return response;
  }

  // ── ۶. مدیریت صفحات Tenant ────────────────────────────────────────────────
  if (effectiveTenantSlug) {
    const response = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();
    addSecurityHeaders(response);

    if (tenantSlugFromUrl) {
      setTenantCookies(response, effectiveTenantSlug, tenantView || undefined);
    }
    return response;
  }

  // ── ۷. محافظت از پنل ادمین ────────────────────────────────────────────────
  if (pathname.startsWith('/admin/')) {
    if (pathname === '/admin/login') {
      const response = NextResponse.next();
      addSecurityHeaders(response);
      return response;
    }

    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    try {
      // ★★★ v3.0: import استاتیک به‌جای require — دیگر نیازی به try-catch برای require نیست
      const secret = process.env.JWT_ACCESS_SECRET;
      if (!secret) {
        console.error('[Proxy] JWT_ACCESS_SECRET is not set!');
        return NextResponse.redirect(new URL('/admin/login', request.url));
      }

      const decoded = jwt.verify(token, secret) as any;

      // ★★★ v3.0: بررسی جامع‌تر نقش ادمین
      const isAdmin = decoded.userType === 'admin'
        || decoded.role === 'SuperAdmin'
        || decoded.role === 'Admin';

      if (!isAdmin) {
        return NextResponse.redirect(new URL('/', request.url));
      }

      const response = NextResponse.next();
      addSecurityHeaders(response);
      response.headers.set('x-authorization', `Bearer ${token}`);
      return response;
    } catch (e: any) {
      // توکن منقضی یا نامعتبر
      console.warn('[Proxy] Admin token verification failed:', e?.message);
      const redirectResponse = NextResponse.redirect(new URL('/admin/login', request.url));
      // پاک‌سازی کوکی نامعتبر
      redirectResponse.cookies.set('token', '', { path: '/', httpOnly: true, maxAge: 0 });
      return redirectResponse;
    }
  }

  // ── ۸. فال‌بک نهایی برای مسیرهای SPA ──────────────────────────────────────
  const fallbackResponse = NextResponse.rewrite(new URL('/', request.url));
  addNoCacheHeaders(fallbackResponse);
  addSecurityHeaders(fallbackResponse);
  return fallbackResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|sw\\.js|manifest\\.json|favicon\\.ico|robots\\.txt|sitemap\\.xml|\\.well-known|icons/|fonts/|images/).*)',
  ],
};