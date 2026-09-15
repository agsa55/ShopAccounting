// ============================================================================
// src/app/api/subscription/verify/route.ts (v10.0 ★★★)
// ShopAccounting — Zarinpal Callback Handler for Subscription Payments
// ----------------------------------------------------------------------------
// ★ v10.0: حذف ریدایرکت به /subscription/result (که سفید می‌ماند)
//          و ریدایرکت مستقیم به /{subdomain}/dashboard
// ★ v9.2: رفع خطای Scope متغیر appUrl و اصلاح قطعی ریدایرکت‌ها در دیپلوی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applySubscriptionPayment, cleanupFailedRegistration } from '@/lib/subscription-utils'

function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر'
}

// ★★★ تابع هوشمند تشخیص URL پایه (مشابه checkout)
function resolveAppUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '')
  }

  const host = req.headers.get('host')
  if (host) {
    const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1')
    const forwardedProto = req.headers.get('x-forwarded-proto')
    const protocol = forwardedProto || (isLocalHost ? 'http' : 'https')
    return `${protocol}://${host}`
  }

  return (envUrl || 'http://localhost:3000').replace(/\/$/, '')
}

// ═══════════════════════════════════════════════════════════════
//  ★ v10.0: تابع کمکی برای دریافت subDomain یک tenant
//  برای ریدایرکت به /{subdomain}/dashboard استفاده می‌شود
// ═══════════════════════════════════════════════════════════════
async function getTenantSubdomain(tenantId: string): Promise<string> {
  try {
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { subDomain: true },
    })
    return tenant?.subDomain || ''
  } catch (err: any) {
    console.warn('[Subscription Verify] ⚠️ Could not fetch subdomain for tenant:', tenantId, err?.message)
    return ''
  }
}

// ═══════════════════════════════════════════════════════════════
//  ★ v10.0: ساخت URL ریدایرکت به داشبورد با query params
// ═══════════════════════════════════════════════════════════════
function buildDashboardUrl(
  subdomain: string,
  params: Record<string, string | number | null | undefined>
): string {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.set(key, String(value))
    }
  })
  
  const queryString = searchParams.toString()
  const basePath = subdomain ? `/${subdomain}/dashboard` : '/dashboard'
  
  return queryString ? `${basePath}?${queryString}` : basePath
}

export async function GET(req: NextRequest) {
  console.log('[Subscription Verify v10.0] Callback received')
  
  // ✅ تعریف appUrl در ابتدای تابع برای اطمینان از دسترسی در تمام بلوک‌ها
  const appUrl = resolveAppUrl(req)

  try {
    const { searchParams } = new URL(req.url)
    const authority = searchParams.get('Authority')
    const status = searchParams.get('Status')
    const tenantId = searchParams.get('tenantId')

    // ─── ۱. اعتبارسنجی پارامترها ───────────────────────────────────
    if (!authority || !status || !tenantId) {
      console.error('[Subscription Verify v10.0] Missing required params:', { authority, status, tenantId })
      
      // ★ v10.0: ریدایرکت به داشبورد با پیام خطا (نه به صفحه result)
      const subdomain = tenantId ? await getTenantSubdomain(tenantId) : ''
      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'missing_params',
      })
      
      console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── ۲. دریافت subDomain برای استفاده در تمام ریدایرکت‌ها ─────
    const subdomain = await getTenantSubdomain(tenantId)
    console.log('[Subscription Verify v10.0] 🏠 Tenant subdomain:', subdomain || '(empty - using root)')

    // ─── ۳. اگر کاربر پرداخت را لغو کرده ────────────────────────────
    const isSuccessful = status === 'OK' || status === 'ok'
    if (!isSuccessful) {
      console.log('[Subscription Verify v10.0] ❌ Payment cancelled by user (Status=' + status + ')')
      try {
        await db.client.subscriptionPayments.updateMany({
          where: { paymentRef: authority, tenantId },
          data: { status: 'cancelled' },
        })
      } catch (err) {
        console.warn('[Subscription Verify v10.0] Failed to mark as cancelled:', err)
      }

      console.log('[Subscription Verify v10.0] Cleaning up pending Tenant:', tenantId)
      await cleanupFailedRegistration(tenantId)

      // ★ v10.0: ریدایرکت مستقیم به داشبورد با پیام لغو
      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'cancelled',
      })
      
      console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── ۴. یافتن رکورد پرداخت ─────────────────────────────────────
    const payment = await db.client.subscriptionPayments.findFirst({
      where: { paymentRef: authority, tenantId },
    })

    if (!payment) {
      console.error('[Subscription Verify v10.0] Payment record not found for authority:', authority)
      
      // ★ v10.0: ریدایرکت به داشبورد با پیام خطا
      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'not_found',
      })
      
      console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ★ اگر قبلاً پرداخت شده، idempotent
    if (payment.isPaid) {
      console.log('[Subscription Verify v10.0] Payment already processed:', payment.id)
      const tenant = await db.client.tenant.findUnique({ where: { id: tenantId } })
      const fallbackCycle = tenant?.billingCycle || 'annual'
      
      // ★ v10.0: ریدایرکت به داشبورد با پیام already_paid
      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'already_paid',
        tierName: tenant?.planName || 'simple',
        billingCycle: fallbackCycle,
        isLifetime: isLifetimeCycle(fallbackCycle) ? '1' : null,
      })
      
      console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── ۵. دریافت مرچنت کد از ENV ────────────────────────────────
    const merchantId = process.env.ZARINPAL_MERCHANT_ID
    if (!merchantId) {
      console.error('[Subscription Verify v10.0] ZARINPAL_MERCHANT_ID not set')
      
      // ★ v10.0: ریدایرکت به داشبورد با پیام خطا
      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'no_merchant',
      })
      
      console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── ۶. ارسال درخواست Verify به زرین‌پال ──────────────────────
    const isSandbox = process.env.ZARINPAL_SANDBOX === 'true'
    const apiVerifyUrl = isSandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
      : 'https://api.zarinpal.com/pg/v4/payment/verify.json'

    console.log('[Subscription Verify v10.0] Sending verify to Zarinpal:', {
      merchantId: merchantId.substring(0, 6) + '...',
      amount: payment.amount,
      sandbox: isSandbox,
    })

    const verifyResponse = await fetch(apiVerifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        authority,
        amount: Math.round(Number(payment.amount)),
      }),
    })

    const verifyData = await verifyResponse.json()
    console.log('[Subscription Verify v10.0] Zarinpal verify response:', verifyData)

    const code = verifyData?.data?.code
    const refId = verifyData?.data?.ref_id

    // ★ v2.0: استخراج اطلاعات اضافی برای گزارش
    const fee = verifyData?.data?.fee || 0
    const feeType = verifyData?.data?.fee_type || 'Merchant'
    const cardPan = verifyData?.data?.card_pan || ''

    console.log('[Subscription Verify v10.0] 📊 Transaction details:', {
      code, refId, fee, feeType, cardPan: cardPan ? '****' + cardPan.slice(-4) : ''
    })

    // ★ کدهای موفق: 100 (پرداخت موفق) یا 200 (پرداخت تسهیمی)
    if (code === 100 || code === 200) {
      // ─── ۷. اعمال پرداخت روی Tenant ─────────────────────────────
      // ★★★ v9.4: استخراج discountPercent از SubscriptionPayments
      let discountPercent = 0
      try {
        const paymentDetails = await db.client.subscriptionPayments.findFirst({
          where: { paymentRef: authority, tenantId },
          select: { amount: true },
        })
        discountPercent = 0
      } catch (err) {
        console.warn('[Subscription Verify v10.0] Could not fetch payment details:', err)
      }

      const result = await applySubscriptionPayment(authority, refId, discountPercent)

      if (result.success) {
        console.log('[Subscription Verify v10.0] ✅ Payment applied successfully:', result)

        const isLifetime = isLifetimeCycle(result.newBillingCycle)
        
        // ★ v10.0: ریدایرکت مستقیم به داشبورد (بدون صفحه result)
        const redirectPath = buildDashboardUrl(subdomain, {
          payment: 'success',
          refId: String(refId),
          tierName: result.newTierName,
          billingCycle: result.newBillingCycle,
          isLifetime: isLifetime ? '1' : null,
          expiresAt: (!isLifetime && result.newExpiresAt) ? result.newExpiresAt.toISOString() : null,
        })
        
        console.log('[Subscription Verify v10.0] 🚀 Redirecting to dashboard:', redirectPath)
        return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
      } else {
        console.error('[Subscription Verify v10.0] ❌ Failed to apply payment:', result.error)
        
        // ★ v10.0: ریدایرکت به داشبورد با پیام apply_failed
        const redirectPath = buildDashboardUrl(subdomain, {
          payment: 'apply_failed',
          refId: String(refId),
          reason: result.error || 'unknown',
        })
        
        console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
        return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
      }
    } else {
      // ★ پرداخت ناموفق
      console.error('[Subscription Verify v10.0] Payment verification failed, code:', code)
      try {
        await db.client.subscriptionPayments.updateMany({
          where: { paymentRef: authority, tenantId },
          data: { status: 'failed' },
        })
      } catch (err) {
        console.warn('[Subscription Verify v10.0] Failed to mark as failed:', err)
      }

      console.log('[Subscription Verify v10.0] Cleaning up pending Tenant:', tenantId)
      await cleanupFailedRegistration(tenantId)

      // ★ v10.0: ریدایرکت مستقیم به داشبورد با پیام failed
      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'failed',
        code: String(code),
      })
      
      console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }
  } catch (error: any) {
    console.error('[Subscription Verify v10.0] Unexpected error:', error)
    
    // ★ v10.0: در صورت خطای کلی، ریدایرکت به داشبورد با پیام error
    // تلاش برای یافتن tenantId از URL
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId') || ''
    const subdomain = tenantId ? await getTenantSubdomain(tenantId) : ''
    
    const redirectPath = buildDashboardUrl(subdomain, {
      payment: 'error',
      reason: 'server_error',
    })
    
    console.log('[Subscription Verify v10.0] 🚀 Redirecting to:', redirectPath)
    return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
  }
}