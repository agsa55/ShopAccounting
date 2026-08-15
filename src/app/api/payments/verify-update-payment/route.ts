// ============================================================================
// src/app/api/payments/verify-update-payment/route.ts
// ★ v1.4: API جدید زرین‌پال (v4) + SQL مستقیم
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const paymentId = searchParams.get('paymentId')
  const authority = searchParams.get('Authority')
  const status = searchParams.get('Status')

  console.log('[VerifyPayment] 📥 Callback received:', { paymentId, authority, status })

  if (!paymentId || !authority) {
    console.warn('[VerifyPayment] ❌ Missing params')
    return NextResponse.redirect(`${APP_URL}/upgrade?error=missing_params`)
  }

  try {
    // ── ۱. بازیابی رکورد پرداخت (با SQL مستقیم) ─────────
    const payments: any[] = await db.client.$queryRaw`
      SELECT id, "tenantId", amount, status, authority
      FROM "OnlinePayments"
      WHERE id = ${paymentId}
      LIMIT 1
    `

    if (!payments || payments.length === 0) {
      console.warn('[VerifyPayment] ❌ Payment not found:', paymentId)
      return NextResponse.redirect(`${APP_URL}/upgrade?error=payment_not_found`)
    }

    const payment = payments[0]
    const paymentTenantId = payment.tenantId
    const paymentAmount = Number(payment.amount)
    const paymentStatus = payment.status

    if (paymentStatus === 'paid') {
      console.log('[VerifyPayment] ✅ Already paid, redirecting to success')
      return NextResponse.redirect(`${APP_URL}/upgrade?success=1&duplicate=1`)
    }

    // ── ۲. بررسی وضعیت از زرین‌پال ───────────────────────
    if (status === 'NOK') {
      console.warn('[VerifyPayment] ❌ User cancelled (NOK)')
      await db.client.$executeRaw`
        UPDATE "OnlinePayments" SET status = 'cancelled' WHERE id = ${paymentId}
      `
      return NextResponse.redirect(`${APP_URL}/upgrade?error=payment_cancelled`)
    }

    // ── ۳. بازیابی Merchant ID ───────────────────────────
    const gateways: any[] = await db.client.$queryRaw`
      SELECT "merchantId", sandbox
      FROM "PaymentGateways"
      WHERE "tenantId" = ${paymentTenantId} 
        AND type = 'zarinpal' 
        AND "isActive" = true
      LIMIT 1
    `

    let merchantId = process.env.ZARINPAL_MERCHANT_ID || ''
    let sandboxMode = process.env.ZARINPAL_SANDBOX === 'true'

    if (gateways && gateways.length > 0 && gateways[0].merchantId) {
      merchantId = gateways[0].merchantId
      sandboxMode = gateways[0].sandbox === true
    }

    if (!merchantId) {
      console.error('[VerifyPayment] ❌ No merchant ID configured')
      return NextResponse.redirect(`${APP_URL}/upgrade?error=merchant_not_configured`)
    }

    // ── ۴. API جدید زرین‌پال (v4) - Verify ───────────────
    const baseUrl = sandboxMode
      ? 'https://sandbox.zarinpal.com'
      : 'https://payment.zarinpal.com'

    console.log('[VerifyPayment] 🔄 Verifying with ZarinPal v4:', {
      merchantId: merchantId.substring(0, 8) + '...',
      authority,
      amount: paymentAmount,
      sandbox: sandboxMode,
    })

    const verifyRes = await fetch(`${baseUrl}/pg/v4/payment/verify.json`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: paymentAmount,
        authority: authority,
      }),
    })

    if (!verifyRes.ok) {
      const errorText = await verifyRes.text()
      console.error('[VerifyPayment] ❌ ZarinPal HTTP error:', verifyRes.status, errorText)
      await db.client.$executeRaw`
        UPDATE "OnlinePayments" SET status = 'failed' WHERE id = ${paymentId}
      `
      return NextResponse.redirect(`${APP_URL}/upgrade?error=zarinpal_http_error`)
    }

    let verifyData: any
    try {
      verifyData = await verifyRes.json()
    } catch (parseErr) {
      console.error('[VerifyPayment] ❌ JSON parse error:', parseErr)
      return NextResponse.redirect(`${APP_URL}/upgrade?error=invalid_response`)
    }

    console.log('[VerifyPayment] 📦 ZarinPal v4 response:', JSON.stringify(verifyData, null, 2))

    // ★ بررسی خطاها
    if (verifyData?.errors && Object.keys(verifyData.errors).length > 0) {
      console.warn('[VerifyPayment] ❌ Verification errors:', verifyData.errors)
      await db.client.$executeRaw`
        UPDATE "OnlinePayments" SET status = 'failed' WHERE id = ${paymentId}
      `
      return NextResponse.redirect(
        `${APP_URL}/upgrade?error=verify_failed&msg=${encodeURIComponent(verifyData.errors?.reason || 'verification_failed')}`
      )
    }

    // ★ بررسی موفقیت (code: 100 = موفق، 101 = قبلاً verify شده)
    const statusCode = verifyData?.data?.code
    if (statusCode !== 100 && statusCode !== 101) {
      console.warn('[VerifyPayment] ❌ Verification failed, code:', statusCode)
      await db.client.$executeRaw`
        UPDATE "OnlinePayments" SET status = 'failed' WHERE id = ${paymentId}
      `
      return NextResponse.redirect(
        `${APP_URL}/upgrade?error=verify_failed&code=${statusCode || 0}`
      )
    }

    // ── ۵. موفقیت! فعال‌سازی اشتراک مادام‌العمر ─────────
    const refId = verifyData?.data?.ref_id?.toString() || ''

    console.log('[VerifyPayment] ✅ Payment successful! RefID:', refId)

    // به‌روزرسانی رکورد پرداخت
    await db.client.$executeRaw`
      UPDATE "OnlinePayments" 
      SET 
        status = 'paid',
        "refId" = ${refId},
        "paidAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${paymentId}
    `

    // فعال‌سازی مادام‌العمر برای tenant
    await db.client.$executeRaw`
      UPDATE "Tenants"
      SET 
        "isPaid" = true,
        "paidAt" = NOW(),
        "billingCycle" = 'lifetime',
        "expiresAt" = NULL,
        "updatedAt" = NOW()
      WHERE id = ${paymentTenantId}
    `

    console.log('[VerifyPayment] 🎉 Tenant activated as lifetime:', paymentTenantId)

    // ── ۶. Redirect به صفحه موفقیت ──────────────────────
    return NextResponse.redirect(`${APP_URL}/upgrade?success=1&refId=${refId}`)
  } catch (error: any) {
    console.error('[VerifyPayment] 💥 Unexpected error:', error)
    return NextResponse.redirect(`${APP_URL}/upgrade?error=server_error`)
  }
}