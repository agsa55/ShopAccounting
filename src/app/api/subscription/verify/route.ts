// ============================================================================
// src/app/api/subscription/verify/route.ts (v11.0 ★★★)
// ShopAccounting — Zarinpal Callback Handler for Subscription Payments
// ----------------------------------------------------------------------------
// ★ v11.0: پشتیبانی از Authority/authority و Status/status
// ★ v11.0: پشتیبانی از code=100, code=101, code=200
// ★ v11.0: verify به ریال با fallback به تومان برای سازگاری با رکوردهای قدیمی
// ★ v11.0: ثبت/بروزرسانی OnlinePayments
// ★ v11.0: skip cleanup برای context=subscription_update
// ★ v11.0: timeout برای fetch به زرین‌پال
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applySubscriptionPayment, cleanupFailedRegistration } from '@/lib/subscription-utils'
import { isLifetimeCycle } from '@/lib/plan-limits'
import { getZarinpalMerchantId, isZarinpalSandbox } from '@/lib/zarinpal/donation-config'
import { getZarinpalUrls } from '@/lib/zarinpal/tashim'

// ═══════════════════════════════════════════════════════════════
//  fetch با timeout
// ═══════════════════════════════════════════════════════════════
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

// ═══════════════════════════════════════════════════════════════
//  خواندن پارامتر case-insensitive برای پارامترهای محدود زرین‌پال
// ═══════════════════════════════════════════════════════════════
function getParam(url: URL, names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name)
    if (value !== null) return value
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
//  استخراج کد پاسخ زرین‌پال
// ═══════════════════════════════════════════════════════════════
function getResponseCode(payload: any): number {
  const fromData = Number(payload?.data?.code)
  if (Number.isFinite(fromData) && fromData !== 0) return fromData

  const fromErrorsArray = Number(payload?.errors?.[0]?.code)
  if (Number.isFinite(fromErrorsArray) && fromErrorsArray !== 0) return fromErrorsArray

  const fromErrorsObject = Number(payload?.errors?.code)
  if (Number.isFinite(fromErrorsObject) && fromErrorsObject !== 0) return fromErrorsObject

  return 0
}

function isSuccessCode(code: number): boolean {
  return code === 100 || code === 101 || code === 200
}

// ═══════════════════════════════════════════════════════════════
//  استخراج پیام خطا
// ═══════════════════════════════════════════════════════════════
function getErrorMessage(payload: any): string | undefined {
  if (!payload) return undefined

  if (Array.isArray(payload.errors)) {
    return payload.errors[0]?.message
  }

  if (payload.errors?.message) {
    return payload.errors.message
  }

  if (payload.data?.message) {
    return payload.data.message
  }

  return undefined
}

// ═══════════════════════════════════════════════════════════════
//  تشخیص URL پایه
// ═══════════════════════════════════════════════════════════════
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
//  دریافت subDomain
// ═══════════════════════════════════════════════════════════════
async function getTenantSubdomain(tenantId: string): Promise<string> {
  try {
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { subDomain: true },
    })
    return tenant?.subDomain || ''
  } catch (err: any) {
    console.warn('[Subscription Verify v11.0] ⚠️ Could not fetch subdomain for tenant:', tenantId, err?.message)
    return ''
  }
}

// ═══════════════════════════════════════════════════════════════
//  ساخت URL ریدایرکت
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

// ═══════════════════════════════════════════════════════════════
//  همگام‌سازی رکورد در OnlinePayments با جزئیات مالی
// ═══════════════════════════════════════════════════════════════
async function syncOnlinePayment(params: {
  tenantId: string
  authority: string
  amountToman: number
  status: 'pending' | 'paid' | 'failed' | 'cancelled'
  refId?: string | null
  subscriptionPaymentId?: string | null
  description?: string | null
  feeRial?: number | null
  feeType?: string | null
  cardPan?: string | null
  cardHash?: string | null
  isSandbox?: boolean
  verifyCode?: number | null
verifyMessage?: string | null
autoVerify?: boolean | null
}): Promise<void> {
  try {
    const feeRial = Math.max(0, Math.round(Number(params.feeRial || 0)))
    const grossAmountToman = Math.round(Number(params.amountToman || 0))
    const feeToman = Math.round(feeRial / 10)

    const normalizedFeeType = String(params.feeType || '').toLowerCase().trim()
    const deductFeeFromSettlement =
      !normalizedFeeType ||
      normalizedFeeType === 'merchant' ||
      normalizedFeeType === 'پذیرنده'

    const netAmountToman = deductFeeFromSettlement
      ? Math.max(0, grossAmountToman - feeToman)
      : grossAmountToman

    const existing = await db.client.onlinePayment.findFirst({
      where: {
        authority: params.authority,
        tenantId: params.tenantId,
      },
    })

    const baseData: any = {
      type: 'subscription_update',
      isSandbox: Boolean(params.isSandbox),
      grossAmount: grossAmountToman,
      netAmount: netAmountToman,
      fee: feeToman,
      feeType: params.feeType || null,
      cardPan: params.cardPan || null,
      cardHash: params.cardHash || null,
      verifyCode: params.verifyCode ?? null,
verifyMessage: params.verifyMessage ? String(params.verifyMessage).slice(0, 500) : null,
autoVerify: params.autoVerify ?? null,
    }

    if (existing) {
      const data: any = {
        ...baseData,
        status: params.status,
      }

      if (params.refId) {
        data.refId = String(params.refId)
      }

      if (params.status === 'paid') {
        data.amount = netAmountToman
        data.paidAt = new Date()
        data.verifiedAt = new Date()
        data.settlementStatus = 'pending'
      }

      if (params.subscriptionPaymentId && !existing.gatewayId) {
        data.gatewayId = params.subscriptionPaymentId
      }

      if (params.description && !existing.description) {
        data.description = params.description
      }

      await db.client.onlinePayment.update({
        where: { id: existing.id },
        data,
      })

      console.log(`[Subscription Verify v13.0] ✅ OnlinePayment updated → ${params.status}`)
      return
    }

    await db.client.onlinePayment.create({
      data: {
        tenantId: params.tenantId,
        amount: params.status === 'paid' ? netAmountToman : grossAmountToman,
        authority: params.authority,
        refId: params.refId ? String(params.refId) : null,
        status: params.status,
        gatewayType: 'zarinpal',
        gatewayId: params.subscriptionPaymentId || null,
        description:
          params.description ||
          `[SUBSCRIPTION_UPDATE] authority=${params.authority}`,
        paidAt: params.status === 'paid' ? new Date() : null,
        verifiedAt: params.status === 'paid' ? new Date() : null,
        settlementStatus: params.status === 'paid' ? 'pending' : params.status,
        ...baseData,
      },
    })

    console.log(`[Subscription Verify v13.0] ✅ OnlinePayment created → ${params.status}`)
  } catch (err: any) {
    console.warn('[Subscription Verify v13.0] ⚠️ Failed to sync OnlinePayment:', err?.message)
  }
}
// ═══════════════════════════════════════════════════════════════
//  GET callback
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  console.log('[Subscription Verify v11.0] Callback received')

  const appUrl = resolveAppUrl(req)

  try {
    const { searchParams } = new URL(req.url)

    const authority = getParam(req.nextUrl, ['Authority', 'authority'])
    const statusFromZarinPal = getParam(req.nextUrl, ['Status', 'status'])
    const tenantId = searchParams.get('tenantId') || ''
    const context = searchParams.get('context') || 'registration'
    const orderId = searchParams.get('orderId') || ''

    const skipCleanup = context === 'subscription_update' || context === 'upgrade'

    console.log('[Subscription Verify v11.0] Parsed callback:', {
      authority,
      statusFromZarinPal,
      tenantId,
      context,
      orderId,
      skipCleanup,
    })

    if (!authority || !statusFromZarinPal || !tenantId) {
      console.error('[Subscription Verify v11.0] Missing required params')

      const subdomain = tenantId ? await getTenantSubdomain(tenantId) : ''
      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'missing_params',
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    const subdomain = await getTenantSubdomain(tenantId)

    // ─── کاربر پرداخت را لغو کرده یا Status معتبر نیست ───
    const isSuccessfulStatus = statusFromZarinPal === 'OK' || statusFromZarinPal === 'ok'

    if (!isSuccessfulStatus) {
      console.log('[Subscription Verify v11.0] ❌ Payment cancelled/failed at gateway')

      try {
        await db.client.subscriptionPayments.updateMany({
          where: { paymentRef: authority, tenantId },
          data: { status: 'cancelled' },
        })
      } catch (err) {
        console.warn('[Subscription Verify v11.0] Failed to mark as cancelled:', err)
      }

      await syncOnlinePayment({
        tenantId,
        authority,
        amountToman: 0,
        status: 'cancelled',
        description: orderId ? `Cancelled subscription payment | orderId=${orderId}` : 'Cancelled subscription payment',
      })

      if (!skipCleanup) {
        console.log('[Subscription Verify v11.0] Cleaning up pending Tenant:', tenantId)
        await cleanupFailedRegistration(tenantId)
      }

      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'cancelled',
        reason: statusFromZarinPal,
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── یافتن رکورد پرداخت اشتراک ───
    const payment = await db.client.subscriptionPayments.findFirst({
      where: { paymentRef: authority, tenantId },
    })

    if (!payment) {
      console.error('[Subscription Verify v11.0] Payment record not found for authority:', authority)

      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'not_found',
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    const amountToman = Number(payment.amount)

    if (!Number.isFinite(amountToman) || amountToman <= 0) {
      console.error('[Subscription Verify v11.0] Invalid payment amount:', payment.amount)

      await db.client.subscriptionPayments.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      })

      await syncOnlinePayment({
        tenantId,
        authority,
        amountToman: 0,
        status: 'failed',
        subscriptionPaymentId: payment.id,
        description: 'Invalid amount',
      })

      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'invalid_amount',
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── اگر قبلاً پرداخت شده، idempotent ───
    if (payment.isPaid) {
      console.log('[Subscription Verify v11.0] Payment already processed:', payment.id)

      await syncOnlinePayment({
        tenantId,
        authority,
        amountToman,
        status: 'paid',
        subscriptionPaymentId: payment.id,
        description: orderId ? `Already paid subscription payment | orderId=${orderId}` : 'Already paid subscription payment',
      })

      const tenant = await db.client.tenant.findUnique({ where: { id: tenantId } })
      const fallbackCycle = tenant?.billingCycle || 'annual'

      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'already_paid',
        tierName: tenant?.planName || 'simple',
        billingCycle: fallbackCycle,
        isLifetime: isLifetimeCycle(fallbackCycle) ? '1' : null,
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── دریافت merchant ───
    const merchantId = getZarinpalMerchantId()
    const sandbox = isZarinpalSandbox()
    const urls = getZarinpalUrls(sandbox)

    if (!merchantId) {
      console.error('[Subscription Verify v11.0] Merchant ID is missing')

      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'no_merchant',
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ★ مبلغ ریالی برای verify
    const amountRial = Math.round(amountToman * 10)

    async function callVerify(amount: number) {
      const res = await fetchWithTimeout(
        urls.verify,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            merchant_id: merchantId,
            authority,
            amount,
          }),
          cache: 'no-store',
        },
        15000
      )

      const json = await res.json().catch(() => null)
      return { res, json }
    }

    console.log('[Subscription Verify v11.0] 🔄 Verifying with ZarinPal v4:', {
      merchantId: merchantId.substring(0, 6) + '...',
      authority,
      amountToman,
      amountRial,
      sandbox,
    })

    let verifyResult = await callVerify(amountRial)
    let verifyCode = getResponseCode(verifyResult.json)

    // ★ fallback برای رکوردهای قدیمی که ممکن است با IRT/تومان ایجاد شده باشند
    if (!isSuccessCode(verifyCode) && (verifyCode === 104 || amountRial !== amountToman)) {
      console.warn('[Subscription Verify v11.0] Verify with rial failed, trying toman fallback...', {
        verifyCode,
        amountToman,
        amountRial,
      })

      const fallbackResult = await callVerify(Math.round(amountToman))
      const fallbackCode = getResponseCode(fallbackResult.json)

      if (isSuccessCode(fallbackCode)) {
        verifyResult = fallbackResult
        verifyCode = fallbackCode
      } else if (verifyResult.json && !fallbackResult.json) {
        // اگر fallback پاسخ معتبر نداد، همان اولی را نگه می‌داریم
      } else {
        verifyResult = fallbackResult
        verifyCode = fallbackCode
      }
    }

    const verifyJson = verifyResult.json

    if (!verifyJson) {
      console.error('[Subscription Verify v11.0] Empty verify response:', {
        status: verifyResult.res.status,
      })

      await db.client.subscriptionPayments.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      })

      await syncOnlinePayment({
        tenantId,
        authority,
        amountToman,
        status: 'failed',
        subscriptionPaymentId: payment.id,
        description: 'Empty verify response',
      })

      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'error',
        reason: 'invalid_response',
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    const refId = verifyJson.data?.ref_id ? String(verifyJson.data.ref_id) : null
    const fee = verifyJson.data?.fee || 0
    const feeType = verifyJson.data?.fee_type || 'Merchant'
    const cardPan = verifyJson.data?.card_pan || ''
    const cardHash = verifyJson.data?.card_hash || ''

    console.log('[Subscription Verify v11.0] 📦 Verify response:', {
      code: verifyCode,
      refId,
      fee,
      feeType,
      cardPan: cardPan ? '****' + cardPan.slice(-4) : '',
      hasCardHash: Boolean(cardHash),
    })

    // ─── موفق ───
    if (isSuccessCode(verifyCode)) {
      const result = await applySubscriptionPayment(authority, refId || '', 0)

      if (result.success) {
        console.log('[Subscription Verify v11.0] ✅ Payment applied successfully:', result)

 await syncOnlinePayment({
  tenantId,
  authority,
  amountToman,
  status: 'paid',
  refId,
  subscriptionPaymentId: payment.id,
  feeRial: Number(verifyJson.data?.fee || 0),
  feeType: verifyJson.data?.fee_type
    ? String(verifyJson.data.fee_type)
    : null,
  cardPan: verifyJson.data?.card_pan
    ? String(verifyJson.data.card_pan)
    : null,
  cardHash: verifyJson.data?.card_hash
    ? String(verifyJson.data.card_hash)
    : null,
  verifyCode: Number.isFinite(Number(verifyJson.data?.code))
    ? Number(verifyJson.data?.code)
    : null,
  verifyMessage: String(verifyJson.data?.message || ''),
  autoVerify: false,
  isSandbox: sandbox,
  description: orderId
    ? `[SUBSCRIPTION_UPDATE] paid | orderId=${orderId} | refId=${refId || ''}`
    : `[SUBSCRIPTION_UPDATE] paid | refId=${refId || ''}`,
})

        const isLifetime = isLifetimeCycle(result.newBillingCycle)

        const redirectPath = buildDashboardUrl(subdomain, {
          payment: 'success',
          refId: refId || undefined,
          tierName: result.newTierName,
          billingCycle: result.newBillingCycle,
          isLifetime: isLifetime ? '1' : null,
          expiresAt: !isLifetime && result.newExpiresAt ? result.newExpiresAt.toISOString() : null,
        })

        console.log('[Subscription Verify v11.0] 🚀 Redirecting to dashboard:', redirectPath)
        return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
      }

      console.error('[Subscription Verify v11.0] ❌ Failed to apply payment:', result.error)

      await db.client.subscriptionPayments.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      })

      await syncOnlinePayment({
        tenantId,
        authority,
        amountToman,
        status: 'failed',
        refId,
        subscriptionPaymentId: payment.id,
        description: `Apply failed: ${result.error || 'unknown'}`,
      })

      const redirectPath = buildDashboardUrl(subdomain, {
        payment: 'apply_failed',
        refId: refId || undefined,
        reason: result.error || 'unknown',
      })

      return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
    }

    // ─── ناموفق ───
    const errorMessage = getErrorMessage(verifyJson)

    console.error('[Subscription Verify v11.0] ❌ Verification failed:', {
      code: verifyCode,
      errorMessage,
      verifyJson,
    })

    await db.client.subscriptionPayments.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    })

    await syncOnlinePayment({
      tenantId,
      authority,
      amountToman,
      status: 'failed',
      subscriptionPaymentId: payment.id,
      description: errorMessage || `Verification failed code=${verifyCode}`,
    })

    if (!skipCleanup) {
      console.log('[Subscription Verify v11.0] Cleaning up pending Tenant:', tenantId)
      await cleanupFailedRegistration(tenantId)
    }

    const redirectPath = buildDashboardUrl(subdomain, {
      payment: 'failed',
      code: verifyCode || undefined,
      message: errorMessage || undefined,
    })

    return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
  } catch (error: any) {
    console.error('[Subscription Verify v11.0] 💥 Unexpected error:', error)

    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId') || ''
    const subdomain = tenantId ? await getTenantSubdomain(tenantId) : ''

    const redirectPath = buildDashboardUrl(subdomain, {
      payment: 'error',
      reason: 'server_error',
      message: error?.message || undefined,
    })

    return NextResponse.redirect(new URL(redirectPath, appUrl), 303)
  }
}