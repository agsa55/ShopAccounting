// ============================================================================
// src/proxy.ts — Proxy (Middleware) — ShopAccounting (Fixed Infinite Loop)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

// ─── مسیرهای عمومی API ───────────────────────────────────────────────────────
const PUBLIC_API_PATHS = [
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

function setTenantCookies(response: NextResponse, tenantSlug: string, tenantView?: string) {
  response.cookies.set('tenant-slug', tenantSlug, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  if (tenantView) {
    response.cookies.set('tenant-view', tenantView, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 });
  }
  response.headers.set('x-tenant-slug', tenantSlug);
  if (tenantView) response.headers.set('x-tenant-view', tenantView);
}

function clearTenantCookies(response: NextResponse) {
  ['tenant-slug', 'tenant-view', 'token', 'auth-token', 'refreshToken'].forEach(name => {
    response.cookies.set(name, '', { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 0 });
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

// ════════════════════════════════════════════════════════════════════════════
// ★ Middleware اصلی (اصلاح‌شده برای جلوگیری از حلقه بی‌نهایت)
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

  // ── ۳. ★★★ نجات‌بخش: خروج زودهنگام برای صفحات عمومی (لندینگ و Auth) ─────
  // این بخش حیاتی است. اگر کاربر در صفحه اصلی یا لاگین است، میدل‌ور نباید 
  // سعی کند او را بر اساس کوکی به مسیر دیگری بفرستد. این کار حلقه بی‌نهایت را می‌شکند.
  if (pathname === '/' || pathname.startsWith('/auth/')) {
    const response = NextResponse.next();
    // پاک کردن اجباری کوکی tenant-slug در صفحات عمومی برای اطمینان از عدم تداخل
    response.cookies.set('tenant-slug', '', { path: '/', maxAge: 0 });
    response.cookies.set('tenant-view', '', { path: '/', maxAge: 0 });
    return response;
  }

  // ── ۴. تشخیص Tenant (فقط برای مسیرهای غیر عمومی اجرا می‌شود) ─────────────
  let tenantSlugFromUrl: string | null = null;
  let tenantView: string | null = null;
  let rewriteUrl: URL | null = null;
  const hostname = request.headers.get('host') || '';

  // الف) تشخیص از طریق ساب‌دامین
  if (hostname !== 'localhost:3000' && hostname !== 'localhost:3001' && hostname !== ROOT_DOMAIN && hostname !== `www.${ROOT_DOMAIN}`) {
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];
      if (subdomain && subdomain !== 'www') {
        if (subdomain === 'admin') return NextResponse.next();
        tenantSlugFromUrl = subdomain;
      }
    }
  }

  // ب) تشخیص از طریق مسیر (Path-based)
  if (!tenantSlugFromUrl) {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];

    if (firstSegment && VALID_SLUG_REGEX.test(firstSegment) && !RESERVED_PATHS.has(firstSegment) && !firstSegment.startsWith('api')) {
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

  // ج) فال‌بک به کوکی (فقط برای API Routes امن است)
  if (!effectiveTenantSlug && isApiRoute) {
    effectiveTenantSlug = request.cookies.get('tenant-slug')?.value || null;
  }

  if (!tenantView && tenantSlugFromUrl) {
    tenantView = request.cookies.get('tenant-view')?.value || null;
  }

  // ── ۵. مدیریت مسیرهای API ─────────────────────────────────────────────────
  if (isApiRoute) {
    if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
      const response = NextResponse.next();
      if (effectiveTenantSlug) response.headers.set('x-tenant-slug', effectiveTenantSlug);
      return response;
    }

    const authHeader = request.headers.get('authorization');
    const tokenFromHeader = authHeader?.replace('Bearer ', '') || undefined;
    const tokenFromCookie = request.cookies.get('token')?.value;
    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
      return NextResponse.json({ success: false, error: 'دسترسی غیرمجاز.', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }

    const response = NextResponse.next();
    if (!authHeader && tokenFromCookie) response.headers.set('x-authorization', `Bearer ${tokenFromCookie}`);
    if (effectiveTenantSlug) response.headers.set('x-tenant-slug', effectiveTenantSlug);
    return response;
  }

  // ── ۶. مدیریت صفحات Tenant ────────────────────────────────────────────────
  if (effectiveTenantSlug) {
    const response = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();
    setTenantCookies(response, effectiveTenantSlug, tenantView || undefined);
    return response;
  }

  // ── ۷. محافظت از پنل ادمین ────────────────────────────────────────────────
  if (pathname.startsWith('/admin/')) {
    if (pathname === '/admin/login') return NextResponse.next(); // اجازه ورود به صفحه لاگین ادمین

    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;

      if (decoded.userType !== 'admin' && decoded.role !== 'SuperAdmin') {
        return NextResponse.redirect(new URL('/', request.url));
      }
      
      const response = NextResponse.next();
      response.headers.set('x-authorization', `Bearer ${token}`);
      return response;
    } catch (e: any) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // ── ۸. فال‌بک نهایی برای هر مسیر دیگری (مثل /dashboard) ───────────────────
  const fallbackResponse = NextResponse.next();
  // نکته: اینجا کوکی tenant-slug را پاک نمی‌کنیم تا فرانت‌اند (React) بتواند 
  // از طریق آن بفهمد کاربر متعلق به کدام فروشگاه است و داده‌ها را لود کند.
  addNoCacheHeaders(fallbackResponse);
  return fallbackResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|sw\\.js|manifest\\.json|favicon\\.ico|robots\\.txt|sitemap\\.xml|\\.well-known|icons/|fonts/|images/).*)',
  ],
};