// ============================================================================
// src/lib/tenant-resolver.ts — Tenant Resolver — Server-only (v1.2)
// ShopAccounting v4.0 — Multi-tenant SaaS Platform
// ============================================================================
// ⚠️ این فایل فقط برای Server Components و API Routes قابل استفاده است.
// برای Client Components از tenant-resolver-client.ts استفاده کنید.
//
// توابع قابل استفاده در Server:
//   resolveTenant()            — Server Components (خواندن از cookie)
//   resolveTenantFromHeaders() — API Routes (خواندن از header/cookie)
//   fetchTenantBySlug()        — جستجوی tenant در MasterDB
// ============================================================================

import { db } from './db';
import { cookies } from 'next/headers';

// ============================================================================
// Types
// ============================================================================

export interface ResolvedTenant {
  slug: string;           // زیردامنه (مثلاً "myshop")
  id: string;             // UUID tenant در MasterDB
  companyName: string;    // نام فروشگاه
  planName: string;       // نام پلن
  status: string;         // وضعیت tenant
  isIsolated: boolean;    // آیا DB اختصاصی داره؟
  logoUrl?: string | null;
  tier: string;           // trial, simple, professional, enterprise
  isTrial: boolean;
  daysRemaining: number;
  isExpired: boolean;
}

export interface ResolvedTenantMinimal {
  slug: string;
  found: boolean;
  tenant?: {
    id: string;
    companyName: string;
    planName: string;
    status: string;
    isIsolated: boolean;
  };
}

// ============================================================================
// Server Component Helper
// ============================================================================

/**
 * گرفتن اطلاعات tenant از cookie (برای Server Components)
 *
 * @example
 * import { resolveTenant } from '@/lib/tenant-resolver';
 *
 * export default async function LoginPage() {
 *   const tenantInfo = await resolveTenant();
 *   // ...
 * }
 */
export async function resolveTenant(): Promise<ResolvedTenant | null> {
  try {
    const cookieStore = await cookies();
    const slug = cookieStore.get('tenant-slug')?.value;

    if (!slug) return null;

    return await fetchTenantBySlug(slug);
  } catch (error) {
    console.error('[TenantResolver] Error:', error);
    return null;
  }
}

// ============================================================================
// API Route Helper
// ============================================================================

/**
 * گرفتن tenant slug از header یا cookie (برای API Routes)
 * این تابع توسط proxy.ts تنظیم شده — اول x-tenant-slug header، بعد cookie
 *
 * @example
 * import { resolveTenantFromHeaders } from '@/lib/tenant-resolver';
 *
 * export async function GET(request: NextRequest) {
 *   const tenantInfo = await resolveTenantFromHeaders(request);
 *   if (!tenantInfo) {
 *     return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
 *   }
 *   const tenantId = tenantInfo.id; // UUID
 *   // ...
 * }
 */
export async function resolveTenantFromHeaders(
  request: Request
): Promise<ResolvedTenant | null> {
  try {
    // اول از header بخون (تنظیم شده توسط proxy)
    let slug = request.headers.get('x-tenant-slug');

    // اگر نبود، از cookie بخون
    if (!slug) {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(/tenant-slug=([^;]+)/);
      slug = match ? match[1] : null;
    }

    if (!slug) return null;

    return await fetchTenantBySlug(slug);
  } catch (error) {
    console.error('[TenantResolver] Error:', error);
    return null;
  }
}

// ============================================================================
// Core: Fetch tenant from MasterDB by slug
// ============================================================================

/**
 * جستجوی tenant با slug در MasterDB
 * قابل استفاده هم در Server Components و هم API Routes
 */
export async function fetchTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  // پیدا کردن tenant با subDomain
  const tenant = await db.master.tenant.findFirst({
    where: { subDomain: slug },
    select: {
      id: true,
      subDomain: true,
      companyName: true,
      planName: true,
      status: true,
      isIsolated: true,
      logoUrl: true,
      soldAt: true,
    },
  });

  if (!tenant) return null;

  // گرفتن اطلاعات پلن
  const plan = await db.master.plan.findFirst({
    where: { name: tenant.planName },
    select: {
      tier: true,
      isTrial: true,
      trialDays: true,
      durationDays: true,
    },
  });

  // محاسبه انقضا
  const durationDays = plan
    ? (plan.isTrial ? plan.trialDays : plan.durationDays)
    : 30;
  const soldAt = tenant.soldAt || new Date();
  const expiresAt = new Date(soldAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const daysRemaining = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  return {
    slug: tenant.subDomain,
    id: tenant.id,
    companyName: tenant.companyName,
    planName: tenant.planName,
    status: tenant.status,
    isIsolated: tenant.isIsolated,
    logoUrl: tenant.logoUrl,
    tier: plan?.tier || 'trial',
    isTrial: plan?.isTrial || false,
    daysRemaining: Math.max(0, daysRemaining),
    isExpired: daysRemaining <= 0,
  };
}
