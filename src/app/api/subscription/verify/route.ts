// ============================================================================
// src/app/api/subscription/verify/route.ts — GET (v9.0 ★★★ Phase 4)
// ShopAccounting — Zarinpal Callback Handler for Subscription Payments
// ----------------------------------------------------------------------------
// این API callback زرین‌پال را دریافت می‌کند و در صورت موفقیت:
//   ۱. تراکنش را verify می‌کند
//   ۲. applySubscriptionPayment را فراخوانی می‌کند که:
//      - SubscriptionPayments را به‌روزرسانی می‌کند (status=paid, refId)
//      - Tenant را به‌روزرسانی می‌کند (expiresAt, planTierId, planName)
//      - Subscriptions را به‌روزرسانی می‌کند (status=active, endDate)
//   ۳. کاربر را به /subscription/result هدایت می‌کند
//
// ★ این مسیر عمومی است (نیاز به توکن ندارد) — در proxy.ts ثبت شده
//   چون زرین‌پال کاربر را بدون توکن به این مسیر برمی‌گرداند
// ★★★ tenantId در query string کدگذاری شده (callback URL)
//   و tierName/billingCycle از paymentMethod رکورد خوانده می‌شوند
//
// ★★★ v9.0: پشتیبانی از پلن مادام‌العمر (lifetime)
//   - اگر billingCycle='lifetime' باشد، expiresAt باید null باشد
//   - در redirect نهایی، پارامتر expiresAt برای lifetime خالی می‌شود
//   - fallback billingCycle از 'monthly' به 'annual' تغییر کرد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applySubscriptionPayment, cleanupFailedRegistration } from '@/lib/subscription-utils'

// ★★★ v9.0: helper محلی برای تشخیص lifetime
function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر'
}

export async function GET(req: NextRequest) {
  console.log('[Subscription Verify] Callback received')
  try {
    const { searchParams } = new URL(req.url)
    const authority = searchParams.get('Authority')
    const status = searchParams.get('Status')
    const tenantId = searchParams.get('tenantId')

    // ─── ۱. اعتبارسنجی پارامترها ───────────────────────────────────
    if (!authority || !status || !tenantId) {
      console.error('[Subscription Verify] Missing required params:', { authority, status, tenantId })
      return NextResponse.redirect(
        new URL('/subscription/result?status=error&reason=missing_params', req.url)
      )
    }

    // ─── ۲. اگر کاربر پرداخت را لغو کرده ────────────────────────────
    if (status !== 'OK') {
      console.log('[Subscription Verify] Payment cancelled by user')
      // ★ به‌روزرسانی رکورد به cancelled
      try {
        await db.client.subscriptionPayments.updateMany({
          where: { paymentRef: authority, tenantId },
          data: { status: 'cancelled' },
        })
      } catch (err) {
        console.warn('[Subscription Verify] Failed to mark as cancelled:', err)
      }

      // ★★★ v5.1.11: حذف Tenant اگر در حالت pending_payment است
      //   این کار باعث می‌شود زیردامنه آزاد شود و کاربر بتواند دوباره ثبت‌نام کند
      console.log('[Subscription Verify] Cleaning up pending Tenant (payment cancelled):', tenantId)
      const cleanupResult = await cleanupFailedRegistration(tenantId)
      console.log('[Subscription Verify] Cleanup result:', cleanupResult)

      return NextResponse.redirect(
        new URL(`/subscription/result?status=cancelled&tenantId=${tenantId}`, req.url)
      )
    }

    // ─── ۳. یافتن رکورد پرداخت ─────────────────────────────────────
    const payment = await db.client.subscriptionPayments.findFirst({
      where: { paymentRef: authority, tenantId },
    })

    if (!payment) {
      console.error('[Subscription Verify] Payment record not found for authority:', authority)
      return NextResponse.redirect(
        new URL('/subscription/result?status=error&reason=not_found', req.url)
      )
    }

    // ★ اگر قبلاً پرداخت شده، idempotent
    if (payment.isPaid) {
      console.log('[Subscription Verify] Payment already processed:', payment.id)
      // ★ خواندن اطلاعات tenant برای redirect با اطلاعات کامل
      const tenant = await db.client.tenant.findUnique({ where: { id: tenantId } })
      // ★★★ v9.0: fallback billingCycle از 'monthly' به 'annual' تغییر کرد
      const fallbackCycle = tenant?.billingCycle || 'annual'
      const isLifetime = isLifetimeCycle(fallbackCycle)
      return NextResponse.redirect(
        new URL(
          `/subscription/result?status=already_paid&tenantId=${tenantId}&tierName=${tenant?.planName || 'simple'}&billingCycle=${fallbackCycle}${isLifetime ? '&isLifetime=1' : ''}`,
          req.url
        )
      )
    }

    // ─── ۴. دریافت مرچنت کد از ENV ────────────────────────────────
    const merchantId = process.env.ZARINPAL_MERCHANT_ID
    if (!merchantId) {
      console.error('[Subscription Verify] ZARINPAL_MERCHANT_ID not set')
      return NextResponse.redirect(
        new URL('/subscription/result?status=error&reason=no_merchant', req.url)
      )
    }

    // ─── ۵. ارسال درخواست Verify به زرین‌پال ──────────────────────
    const isSandbox = process.env.ZARINPAL_SANDBOX === 'true'
    const apiVerifyUrl = isSandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
      : 'https://api.zarinpal.com/pg/v4/payment/verify.json'

    console.log('[Subscription Verify] Sending verify to Zarinpal:', {
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
    console.log('[Subscription Verify] Zarinpal verify response:', verifyData)

    const code = verifyData?.data?.code
    const refId = verifyData?.data?.ref_id

    // ★ کدهای موفق: 100 (پرداخت موفق) یا 200 (پرداخت تسهیمی)
    if (code === 100 || code === 200) {
      // ─── ۶. اعمال پرداخت روی Tenant ─────────────────────────────
      const result = await applySubscriptionPayment(authority, refId)

      if (result.success) {
        console.log('[Subscription Verify] Payment applied successfully:', result)

        // ★★★ v9.0: اگر پلن مادام‌العمر است → expiresAt خالی در URL
        const isLifetime = isLifetimeCycle(result.newBillingCycle)
        const expiresAtParam = isLifetime
          ? ''  // ★ برای lifetime، expiresAt خالی
          : `&expiresAt=${encodeURIComponent(result.newExpiresAt?.toISOString() || '')}`
        const lifetimeParam = isLifetime ? '&isLifetime=1' : ''

        return NextResponse.redirect(
          new URL(
            `/subscription/result?status=success&refId=${refId}&tenantId=${tenantId}&tierName=${result.newTierName}&billingCycle=${result.newBillingCycle}${expiresAtParam}${lifetimeParam}`,
            req.url
          )
        )
      } else {
        console.error('[Subscription Verify] Failed to apply payment:', result.error)
        // ★ در این حالت، پرداخت از طرف زرین‌پال موفق بوده ولی در دیتابیس خطا داده
        //   این یک وضعیت اضطراری است — باید لاگ شود و به کاربر اطلاع داده شود
        return NextResponse.redirect(
          new URL(
            `/subscription/result?status=apply_failed&refId=${refId}&reason=${encodeURIComponent(result.error || 'unknown')}&tenantId=${tenantId}`,
            req.url
          )
        )
      }
    } else {
      // ★ پرداخت ناموفق
      console.error('[Subscription Verify] Payment verification failed, code:', code)
      try {
        await db.client.subscriptionPayments.updateMany({
          where: { paymentRef: authority, tenantId },
          data: { status: 'failed' },
        })
      } catch (err) {
        console.warn('[Subscription Verify] Failed to mark as failed:', err)
      }

      // ★★★ v5.1.11: حذف Tenant اگر در حالت pending_payment است
      //   این کار باعث می‌شود زیردامنه آزاد شود و کاربر بتواند دوباره ثبت‌نام کند
      console.log('[Subscription Verify] Cleaning up pending Tenant (payment failed):', tenantId)
      const cleanupResult = await cleanupFailedRegistration(tenantId)
      console.log('[Subscription Verify] Cleanup result:', cleanupResult)

      return NextResponse.redirect(
        new URL(
          `/subscription/result?status=failed&code=${code}&tenantId=${tenantId}`,
          req.url
        )
      )
    }
  } catch (error: any) {
    console.error('[Subscription Verify] Unexpected error:', error)
    return NextResponse.redirect(
      new URL('/subscription/result?status=error&reason=server_error', req.url)
    )
  }
}
