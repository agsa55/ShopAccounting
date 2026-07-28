// ============================================================================
// src/proxy.ts — Proxy (Middleware) — ShopAccounting v23.4 (Next.js 16)
// ============================================================================
// ★★★ v23.4 (v9.2.1): اضافه شدن مسیرهای بازیابی دمو
//   - /api/demo/recover
//   - /api/demo/recover-verify
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

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
  '/api/payments/online/verify',
  // ★★★ v9.1: مسیرهای تست دمو
  '/api/demo/register',
  '/api/demo/verify-otp',
  '/api/demo/resend-otp',
  '/api/demo/cleanup',
  // ★★★ v9.2.1: مسیرهای بازیابی دمو
  '/api/demo/recover',
  '/api/demo/recover-verify',
];

const RESERVED_PATHS = new Set([
  'auth', 'admin', 'api', '_next', 'static', 'favicon.ico',
  'login', 'register', 'landing', 'dashboard',
  'products', 'invoices', 'employees', 'settings', 'reports',
  'accounts', 'store-setting', 'portal',
  'subscription',
  'demo',  // ★★★ v9.1: مسیرهای تست دمو
]);

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'shopaccounting.ir';

function setTenantCookies(response: NextResponse, tenantSlug: string, tenantView?: string) {
  response.cookies.set('tenant-slug', tenantSlug, {
    path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30,
  });
  if (tenantView) {
    response.cookies.set('tenant-view', tenantView, {
      path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24,
    });
  }
  response.headers.set('x-tenant-slug', tenantSlug);
  if (tenantView) response.headers.set('x-tenant-view', tenantView);
}

function clearTenantCookies(response: NextResponse) {
  response.cookies.set('tenant-slug', '', { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 0 });
  response.cookies.set('tenant-view', '', { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 0 });
}

function isLocalhost(request: NextRequest): boolean {
  const host = request.headers.get('host') || '';
  return host.startsWith('localhost');
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    const existingSlug = request.cookies.get('tenant-slug')?.value;
    if (existingSlug) {
      const response = NextResponse.next();
      response.headers.set('x-tenant-slug', existingSlug);
      return response;
    }
    return NextResponse.next();
  }

  let tenantSlugFromUrl: string | null = null;
  let tenantView: string | null = null;
  let rewriteUrl: URL | null = null;

  const hostname = request.headers.get('host') || '';

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

  if (!tenantSlugFromUrl && pathname !== '/') {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];

    if (firstSegment && !RESERVED_PATHS.has(firstSegment) && !firstSegment.startsWith('api')) {
      tenantSlugFromUrl = firstSegment;
      const rest = segments.slice(1).join('/');

      if (!rest) tenantView = null;
      else if (rest === 'login') tenantView = 'login';
      else if (rest === 'register') tenantView = 'register';
      else tenantView = rest;

      if (tenantView === 'register') rewriteUrl = new URL('/auth/register', url);
      else rewriteUrl = new URL('/', url);
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

  if (pathname.startsWith('/auth/')) {
    const token = request.cookies.get('token')?.value;
    if (token && effectiveTenantSlug) {
      if (isLocalhost(request)) return NextResponse.redirect(new URL(`/${effectiveTenantSlug}`, request.url));
      return NextResponse.redirect(new URL('/', request.url));
    }
    const response = NextResponse.next();
    if (effectiveTenantSlug) setTenantCookies(response, effectiveTenantSlug, tenantView || undefined);
    return response;
  }

  if (effectiveTenantSlug) {
    const response = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();
    setTenantCookies(response, effectiveTenantSlug, tenantView || undefined);
    return response;
  }

  const landingResponse = NextResponse.next();
  clearTenantCookies(landingResponse);
  return landingResponse;
}
