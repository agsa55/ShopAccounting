// ============================================================================
// src/app/api/subscription/verify/route.ts (v9.2 ★★★)
// ShopAccounting — Zarinpal Callback Handler for Subscription Payments
// ----------------------------------------------------------------------------
// ★★★ v9.2: رفع خطای Scope متغیر appUrl و اصلاح قطعی ریدایرکت‌ها در دیپلوی
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

export async function GET(req: NextRequest) {
  console.log('[Subscription Verify] Callback received')
  
  // ✅ تعریف appUrl در ابتدای تابع برای اطمینان از دسترسی در تمام بلوک‌ها (رفع خطای TypeScript)
  const appUrl = resolveAppUrl(req)

  try {
    const { searchParams } = new URL(req.url)
    const authority = searchParams.get('Authority')
    const status = searchParams.get('Status')
    const tenantId = searchParams.get('tenantId')

    // ─── ۱. اعتبارسنجی پارامترها ───────────────────────────────────
    if (!authority || !status || !tenantId) {
      console.error('[Subscription Verify] Missing required params:', { authority, status, tenantId })
      return NextResponse.redirect(
        new URL('/subscription/result?status=error&reason=missing_params', appUrl)
      )
    }

    // ─── ۲. اگر کاربر پرداخت را لغو کرده ────────────────────────────
    if (status !== 'OK') {
      console.log('[Subscription Verify] Payment cancelled by user')
      try {
        await db.client.subscriptionPayments.updateMany({
          where: { paymentRef: authority, tenantId },
          data: { status: 'cancelled' },
        })
      } catch (err) {
        console.warn('[Subscription Verify] Failed to mark as cancelled:', err)
      }

      console.log('[Subscription Verify] Cleaning up pending Tenant (payment cancelled):', tenantId)
      await cleanupFailedRegistration(tenantId)

      return NextResponse.redirect(
        new URL(`/subscription/result?status=cancelled&tenantId=${tenantId}`, appUrl)
      )
    }

    // ─── ۳. یافتن رکورد پرداخت ─────────────────────────────────────
    const payment = await db.client.subscriptionPayments.findFirst({
      where: { paymentRef: authority, tenantId },
    })

    if (!payment) {
      console.error('[Subscription Verify] Payment record not found for authority:', authority)
      return NextResponse.redirect(
        new URL('/subscription/result?status=error&reason=not_found', appUrl)
      )
    }

    // ★ اگر قبلاً پرداخت شده، idempotent
    if (payment.isPaid) {
      console.log('[Subscription Verify] Payment already processed:', payment.id)
      const tenant = await db.client.tenant.findUnique({ where: { id: tenantId } })
      const fallbackCycle = tenant?.billingCycle || 'annual'
      const isLifetime = isLifetimeCycle(fallbackCycle)
      return NextResponse.redirect(
        new URL(
          `/subscription/result?status=already_paid&tenantId=${tenantId}&tierName=${tenant?.planName || 'simple'}&billingCycle=${fallbackCycle}${isLifetime ? '&isLifetime=1' : ''}`,
          appUrl
        )
      )
    }

    // ─── ۴. دریافت مرچنت کد از ENV ────────────────────────────────
    const merchantId = process.env.ZARINPAL_MERCHANT_ID
    if (!merchantId) {
      console.error('[Subscription Verify] ZARINPAL_MERCHANT_ID not set')
      return NextResponse.redirect(
        new URL('/subscription/result?status=error&reason=no_merchant', appUrl)
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

        const isLifetime = isLifetimeCycle(result.newBillingCycle)
        const expiresAtParam = isLifetime
          ? ''
          : `&expiresAt=${encodeURIComponent(result.newExpiresAt?.toISOString() || '')}`
        const lifetimeParam = isLifetime ? '&isLifetime=1' : ''

        return NextResponse.redirect(
          new URL(
            `/subscription/result?status=success&refId=${refId}&tenantId=${tenantId}&tierName=${result.newTierName}&billingCycle=${result.newBillingCycle}${expiresAtParam}${lifetimeParam}`,
            appUrl // ✅ استفاده از appUrl
          )
        )
      } else {
        console.error('[Subscription Verify] Failed to apply payment:', result.error)
        return NextResponse.redirect(
          new URL(
            `/subscription/result?status=apply_failed&refId=${refId}&reason=${encodeURIComponent(result.error || 'unknown')}&tenantId=${tenantId}`,
            appUrl // ✅ استفاده از appUrl
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

      console.log('[Subscription Verify] Cleaning up pending Tenant (payment failed):', tenantId)
      await cleanupFailedRegistration(tenantId)

      return NextResponse.redirect(
        new URL(
          `/subscription/result?status=failed&code=${code}&tenantId=${tenantId}`,
          appUrl // ✅ استفاده از appUrl
        )
      )
    }
  } catch (error: any) {
    console.error('[Subscription Verify] Unexpected error:', error)
    return NextResponse.redirect(
      new URL('/subscription/result?status=error&reason=server_error', appUrl) // ✅ استفاده از appUrl
    )
  }
}