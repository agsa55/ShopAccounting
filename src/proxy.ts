// ============================================================================
// src/proxy.ts — Proxy (Middleware) — ShopAccounting (v3.4 ★★★ Auto-Cleanup)
// ============================================================================
// ★★★ v3.4 تغییرات نسبت به v3.3:
//   ★ اضافه شدن Auto-Cleanup خودکار در background
//   ★ هر ۱۰ دقیقه یکبار tenant های منقضی را پاک می‌کند
//   ★ در لندینگ پیج و مسیرهای پرکاربرد چک می‌شود
//   ★ Request کاربر را بلاک نمی‌کند (non-blocking)
// ★★★ v3.3 تغییرات نسبت به v3.2:
//   ★ بهبود کامل محافظت از پنل ادمین
//   ★ جلوگیری از دسترسی به /admin/* بعد از logout
//   ★ اضافه شدن پارامتر ?redirect= برای بازگشت به صفحه قبلی بعد از login
//   ★ اگر کاربر لاگین باشد و به /admin/login برود → redirect به dashboard
//   ★ اضافه شدن addNoCacheHeaders به پاسخ‌های محافظتی (جلوگیری از cache)
//   ★ بررسی دقیق‌تر JWT و پاک کردن cookie در صورت خطا
//   ★ پشتیبانی از هر دو cookie: token و admin_token
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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
  // ★★★ v3.2: مسیرهای API پورتال مشتری (بدون نیاز به توکن فروشگاه‌دار)
  '/api/portal/login', '/api/portal/invoices',
  // ★★★ v3.3: مسیر عمومی محتوای سایت
  '/api/site-content',
];

const STATIC_BYPASS_PATHS = ['/sw.js', '/manifest.json', '/robots.txt', '/sitemap.xml', '/favicon.ico'];
const STATIC_BYPASS_PREFIXES = ['/icons/', '/fonts/', '/images/', '/_next/', '/.well-known/'];

// ★★★ v3.2: اضافه شدن 'portal-view' و 'test-portal' به RESERVED_PATHS
const RESERVED_PATHS = new Set([
  'auth', 'admin', 'api', '_next', 'static', 'favicon.ico',
  'login', 'register', 'landing', 'dashboard', 'products', 'invoices',
  'employees', 'settings', 'reports', 'accounts', 'store-setting',
  'portal', 'portal-view', 'test-portal', 'subscription', 'demo', 'payment-result',
]);

// ★★★ v3.2: مسیرهای پورتال مشتری (بدون نیاز به احراز هویت storeUser)
const CUSTOMER_PORTAL_PATHS = [
  '/portal',
  '/portal-view',
  '/test-portal',
  '/portal/',
];

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/i;
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'shopaccounting.ir';

// ════════════════════════════════════════════════════════════════════════════
// ★★★ v3.4: Auto-Cleanup System (خودکار در background)
// ════════════════════════════════════════════════════════════════════════════
let lastCleanupTime = 0;
let isCleanupRunning = false;

// ★ هر ۱۰ دقیقه یکبار cleanup اجرا شود (۶۰۰,۰۰۰ میلی‌ثانیه)
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// ★ مسیرهایی که باید cleanup در آنها چک شود
const CLEANUP_TRIGGER_PATHS = [
  '/',                    // لندینگ پیج
  '/auth/login',          // صفحه login
  '/auth/register',       // صفحه ثبت‌نام
  '/dashboard',           // داشبورد (برای کاربران لاگین شده)
];

/**
 * ★ اجرای cleanup در background (non-blocking)
 * این تابع request کاربر را بلاک نمی‌کند
 */
function triggerBackgroundCleanup(requestUrl: string): void {
  const now = Date.now();
  
  // اگر ۱۰ دقیقه نگذشته یا cleanup در حال اجراست، skip کن
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS || isCleanupRunning) {
    return;
  }
  
  lastCleanupTime = now;
  isCleanupRunning = true;
  
  // ★ اجرای cleanup در background با setImmediate (غیر بلاک‌کننده)
  setImmediate(async () => {
    try {
      const { cleanupExpiredDemoTenants } = await import('@/lib/demo-cleanup');
      const result = await cleanupExpiredDemoTenants();
      
      if (result.deletedCount > 0) {
        console.log(
          `[AutoCleanup] 🧹 Background cleanup: ${result.deletedCount} tenants, ${result.totalRecordsDeleted} records deleted`
        );
      }
    } catch (err: any) {
      // خطا را فقط لاگ می‌کنیم، نباید request کاربر را تحت تأثیر قرار دهد
      console.error('[AutoCleanup] ❌ Background cleanup error:', err?.message || err);
    } finally {
      isCleanupRunning = false;
    }
  });
}

/**
 * ★ بررسی اینکه آیا مسیر فعلی باید cleanup را trigger کند
 */
function shouldTriggerCleanup(pathname: string): boolean {
  return CLEANUP_TRIGGER_PATHS.some(path => pathname === path);
}
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// ★★★ v3.3: نام کوکی‌های ادمین
// ════════════════════════════════════════════════════════════════════════════
const ADMIN_COOKIE_NAMES = ['token', 'admin_token', 'admin-token'];

// ─── Helper Functions ───────────────────────────────────────────────────────

function shouldBypassStatic(pathname: string): boolean {
  if (STATIC_BYPASS_PATHS.includes(pathname)) return true;
  if (STATIC_BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith('/.')) return true;
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.css', '.js', '.map', '.webp', '.avif', '.mp4', '.webm', '.pdf', '.zip', '.json'];
  if (staticExtensions.some(ext => pathname.endsWith(ext))) return true;
  return false;
}

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) => {
    if (p.endsWith('/')) {
      return pathname.startsWith(p);
    }
    return pathname === p || pathname.startsWith(p + '/');
  });
}

function isCustomerPortalPath(pathname: string): boolean {
  return CUSTOMER_PORTAL_PATHS.some(path =>
    pathname === path || pathname.startsWith(path + '/') || pathname.startsWith(path + '?')
  );
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

function clearTenantCookies(response: NextResponse) {
  ['tenant-slug', 'tenant-view', 'token', 'refreshToken'].forEach(name => {
    response.cookies.set(name, '', { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 0 });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ★★★ v3.3: پاک کردن کوکی‌های ادمین (همه نام‌های ممکن)
// ════════════════════════════════════════════════════════════════════════════
function clearAdminCookies(response: NextResponse) {
  ADMIN_COOKIE_NAMES.forEach(name => {
    response.cookies.set(name, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      expires: new Date(0),
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ★★★ v3.3: دریافت توکن ادمین از کوکی (با پشتیبانی از چند نام)
// ════════════════════════════════════════════════════════════════════════════
function getAdminToken(request: NextRequest): string | undefined {
  for (const name of ADMIN_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

// ════════════════════════════════════════════════════════════════════════════
// ★★★ v3.3: بررسی اینکه مسیر متعلق به پنل ادمین است یا خیر
// ════════════════════════════════════════════════════════════════════════════
function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

// ════════════════════════════════════════════════════════════════════════════
// ★★★ v3.3: Redirect به صفحه login ادمین با حفظ مسیر قبلی
// ════════════════════════════════════════════════════════════════════════════
function redirectToAdminLogin(request: NextRequest, originalPath: string): NextResponse {
  const loginUrl = new URL('/admin/login', request.url);
  // فقط اگر مسیر قبلی login نباشد، آن را به عنوان redirect اضافه کن
  if (originalPath && originalPath !== '/admin/login' && originalPath !== '/admin') {
    loginUrl.searchParams.set('redirect', originalPath);
  }
  const response = NextResponse.redirect(loginUrl);
  // پاک کردن کوکی‌های نامعتبر ادمین
  clearAdminCookies(response);
  addNoCacheHeaders(response);
  addSecurityHeaders(response);
  return response;
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

  // ══════════════════════════════════════════════════════════════════════════
  // ★★★ v3.4: اجرای Auto-Cleanup در background (non-blocking)
  // این بخش هیچ تأخیری در پاسخ به کاربر ایجاد نمی‌کند
  // ══════════════════════════════════════════════════════════════════════════
  if (shouldTriggerCleanup(pathname)) {
    triggerBackgroundCleanup(request.url);
  }

  // ── ۲. مدیریت Logout ──────────────────────────────────────────────────────
  if (pathname === '/api/auth/logout') {
    const response = NextResponse.json({ success: true, message: 'logged out' });
    clearTenantCookies(response);
    return response;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ★★★ v3.3: مسیر logout ادمین — پاک کردن کامل کوکی‌های ادمین
  // ══════════════════════════════════════════════════════════════════════════
  if (pathname === '/api/admin/auth/logout') {
    console.log('[Proxy] 🚪 Admin logout requested');
    const response = NextResponse.json({ success: true, message: 'admin logged out' });
    clearAdminCookies(response);
    addNoCacheHeaders(response);
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

  // ══════════════════════════════════════════════════════════════════════════
  // ★★★ v3.2: بخش اختصاصی پورتال مشتری (Customer Portal)
  // ══════════════════════════════════════════════════════════════════════════
  if (isCustomerPortalPath(pathname)) {
    console.log('[Proxy] 🚪 Customer portal path detected, passing through:', pathname);
    const response = NextResponse.next();
    addSecurityHeaders(response);

    const portalTokenFromCookie = request.cookies.get('portal_token')?.value;
    if (portalTokenFromCookie) {
      response.headers.set('x-portal-token', portalTokenFromCookie);
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── ۷. محافظت از پنل ادمین (بهبود یافته v3.3) ────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (isAdminPath(pathname)) {
    // ── صفحه login ادمین ──
    if (pathname === '/admin/login') {
      const adminToken = getAdminToken(request);

      // ★★★ v3.3: اگر کاربر از قبل لاگین بود → redirect به dashboard
      if (adminToken) {
        try {
          const secret = process.env.JWT_ACCESS_SECRET;
          if (secret) {
            const decoded = jwt.verify(adminToken, secret) as any;
            const isAdmin = decoded.userType === 'admin'
              || decoded.role === 'SuperAdmin'
              || decoded.role === 'Admin';

            if (isAdmin) {
              console.log('[Proxy] ✅ Admin already logged in, redirecting to dashboard');
              const dashboardUrl = new URL('/admin/dashboard', request.url);
              // اگر پارامتر redirect داشت، به همان مسیر برو
              const redirectTo = request.nextUrl.searchParams.get('redirect');
              if (redirectTo && redirectTo.startsWith('/admin/')) {
                const targetUrl = new URL(redirectTo, request.url);
                const response = NextResponse.redirect(targetUrl);
                addNoCacheHeaders(response);
                addSecurityHeaders(response);
                return response;
              }
              const response = NextResponse.redirect(dashboardUrl);
              addNoCacheHeaders(response);
              addSecurityHeaders(response);
              return response;
            }
          }
        } catch (e) {
          // توکن نامعتبر است، اجازه بده به صفحه login برود
          console.warn('[Proxy] ⚠️ Invalid admin token on /admin/login, clearing cookie');
          const response = NextResponse.next();
          clearAdminCookies(response);
          addSecurityHeaders(response);
          return response;
        }
      }

      // کاربر لاگین نیست، اجازه بده صفحه login را ببیند
      const response = NextResponse.next();
      addNoCacheHeaders(response);
      addSecurityHeaders(response);
      return response;
    }

    // ── سایر مسیرهای ادمین (/admin/dashboard, /admin/tenants, ...) ──
    const adminToken = getAdminToken(request);

    // ★★★ v3.3: اگر توکن وجود نداشت → redirect به login
    if (!adminToken) {
      console.warn(`[Proxy] 🔒 No admin token for ${pathname}, redirecting to login`);
      return redirectToAdminLogin(request, pathname);
    }

    // ── اعتبارسنجی JWT ──
    try {
      const secret = process.env.JWT_ACCESS_SECRET;

      if (!secret) {
        console.error('[Proxy] ❌ JWT_ACCESS_SECRET is not set in environment!');
        return redirectToAdminLogin(request, pathname);
      }

      const decoded = jwt.verify(adminToken, secret) as any;

      // بررسی نقش ادمین
      const isAdmin = decoded.userType === 'admin'
        || decoded.role === 'SuperAdmin'
        || decoded.role === 'Admin';

      if (!isAdmin) {
        console.warn(`[Proxy] ⛔ User is not admin (role: ${decoded.role}), redirecting to home`);
        const homeUrl = new URL('/', request.url);
        const response = NextResponse.redirect(homeUrl);
        clearAdminCookies(response);
        addNoCacheHeaders(response);
        addSecurityHeaders(response);
        return response;
      }

      // ✅ توکن معتبر است، اجازه دسترسی بده
      const response = NextResponse.next();
      addNoCacheHeaders(response);
      addSecurityHeaders(response);
      response.headers.set('x-authorization', `Bearer ${adminToken}`);
      response.headers.set('x-admin-id', decoded.userId || decoded.id || '');
      return response;

    } catch (e: any) {
      // توکن نامعتبر، منقضی شده یا تغییر کرده
      console.warn(`[Proxy] 🔒 Admin token verification failed for ${pathname}:`, e?.message);
      return redirectToAdminLogin(request, pathname);
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