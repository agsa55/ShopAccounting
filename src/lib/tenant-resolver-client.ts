// ============================================================================
// src/lib/tenant-resolver-client.ts — Client-safe Tenant Helpers (v1.0)
// ShopAccounting v4.0 — Multi-tenant SaaS Platform
// ============================================================================
// فقط توابع قابل استفاده در Client Components
// بدون هیچ import از next/headers یا db
//
// نحوه استفاده:
//   import { getTenantSlugClient, getTenantUrl } from '@/lib/tenant-resolver-client';
// ============================================================================

// ============================================================================
// Client-side: خواندن tenant slug از cookie
// ============================================================================

/**
 * خواندن tenant slug از cookie در client component
 *
 * @example
 * import { getTenantSlugClient } from '@/lib/tenant-resolver-client';
 *
 * const slug = getTenantSlugClient(); // "myshop" یا null
 */
export function getTenantSlugClient(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(/tenant-slug=([^;]+)/);
  return match ? match[1] : null;
}

// ============================================================================
// Client-side: خواندن tenant view از cookie
// ============================================================================

/**
 * خواندن tenant view از cookie در client component
 * این cookie توسط proxy.ts تنظیم میشه: login, register, dashboard, ...
 *
 * @example
 * import { getTenantViewClient } from '@/lib/tenant-resolver-client';
 *
 * const view = getTenantViewClient(); // "login" یا null
 */
export function getTenantViewClient(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(/tenant-view=([^;]+)/);
  return match ? match[1] : null;
}

// ============================================================================
// Client-side: ساخت URL اختصاصی tenant
// ============================================================================

/**
 * ساخت URL اختصاصی tenant بر اساس محیط فعلی
 *
 * @example
 * import { getTenantUrl } from '@/lib/tenant-resolver-client';
 *
 * const url = getTenantUrl('myshop', '/dashboard');
 * // تولید:   https://myshop.shopaccounting.ir/dashboard
 * // توسعه:   http://localhost:3000/myshop/dashboard
 */
export function getTenantUrl(slug: string, path: string = ''): string {
  if (typeof window === 'undefined') {
    // Server-side fallback
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'shopaccounting.ir';
    return `https://${slug}.${rootDomain}${path}`;
  }

  // Client-side: تشخیص محیط از hostname
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://localhost:${window.location.port}/${slug}${path}`;
  }
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'shopaccounting.ir';
  return `https://${slug}.${rootDomain}${path}`;
}

// ============================================================================
// Client-side: بررسی محیط توسعه
// ============================================================================

/**
 * آیا در محیط توسعه (localhost) هستیم؟
 */
export function isDevelopment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

// ============================================================================
// Client-side: دریافت اطلاعات tenant از API
// ============================================================================

export interface TenantBrandingInfo {
  id: string;
  subDomain: string;
  companyName: string;
  planName: string;
  planNameFa: string;
  tier: string;
  isTrial: boolean;
  status: string;
  isIsolated: boolean;
  ownerName?: string;
  logoUrl?: string | null;
}

/**
 * گرفتن اطلاعات tenant از API (برای Client Components)
 *
 * @example
 * import { fetchTenantInfo } from '@/lib/tenant-resolver-client';
 *
 * const info = await fetchTenantInfo('myshop');
 */
export async function fetchTenantInfo(slug: string): Promise<TenantBrandingInfo | null> {
  try {
    const res = await fetch(`/api/tenants/resolve?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();

    if (data.success && data.data) {
      return data.data as TenantBrandingInfo;
    }
    return null;
  } catch {
    return null;
  }
}
