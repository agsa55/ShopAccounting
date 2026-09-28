// ============================================================================
// src/lib/zarinpal/donation-config.ts
// ★ تنظیمات مشترک پرداخت حمایتی با زرین‌پال
// ★ پشتیبانی از Sandbox و Production
// ★ Merchant ID فقط سمت سرور خوانده می‌شود
// ============================================================================

import type { NextRequest } from 'next/server'

export function isZarinpalSandbox(): boolean {
  return String(process.env.ZARINPAL_SANDBOX || '').toLowerCase() === 'true'
}

/**
 * ★ انتخاب مرچنت مناسب:
 *
 * اگر sandbox فعال باشد:
 *   1. ZARINPAL_SANDBOX_MERCHANT_ID
 *   2. در غیر این صورت ZARINPAL_MERCHANT_ID
 *
 * اگر sandbox غیرفعال باشد:
 *   فقط ZARINPAL_MERCHANT_ID
 */
export function getZarinpalMerchantId(): string | null {
  const sandboxMerchantId = process.env.ZARINPAL_SANDBOX_MERCHANT_ID?.trim()
  const mainMerchantId = process.env.ZARINPAL_MERCHANT_ID?.trim()

  if (isZarinpalSandbox()) {
    return sandboxMerchantId || mainMerchantId || null
  }

  return mainMerchantId || null
}

/**
 * ★ ساخت base URL برای callback
 *
 * اولویت:
 * 1. SITE_URL
 * 2. NEXT_PUBLIC_APP_URL
 * 3. req.nextUrl.origin
 * 4. localhost:3000
 */
export function getPublicBaseUrl(req?: NextRequest): string {
  const siteUrl = process.env.SITE_URL?.trim()
  if (siteUrl) return siteUrl.replace(/\/$/, '')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) return appUrl.replace(/\/$/, '')

  if (req) {
    const origin = req.nextUrl.origin
    if (origin) return origin
  }

  return 'http://localhost:3000'
}