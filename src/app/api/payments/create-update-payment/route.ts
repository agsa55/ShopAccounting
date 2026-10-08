// ============================================================================
// src/app/api/payments/create-update-payment/route.ts (v3.0 ★★★)
// ShopAccounting — Subscription Payment Creation (ZarinPal v4)
// ----------------------------------------------------------------------------
// ★ v3.0: ارسال مبلغ به زرین‌پال به ریال با currency IRR
// ★ v3.0: محاسبه امن مبلغ در سمت سرور
// ★ v3.0: ثبت همزمان رکورد در OnlinePayments برای صفحه تراکنش‌ها
// ★ v3.0: callback با context=subscription_update برای جلوگیری از cleanup خطرناک
// ★ v3.0: timeout برای fetch به زرین‌پال
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { createPendingSubscription } from '@/lib/subscription-utils'
import {
  checkSubscriptionStatus,
  getPlanPrice,
  isLifetimeCycle,
  type BillingCycle,
} from '@/lib/plan-limits'
import {
  getServerPlanBasePrice,
  getServerPlanDiscountPercent,
} from '@/lib/site-content-server'

import {
  getZarinpalMerchantId,
  isZarinpalSandbox,
  getPublicBaseUrl,
} from '@/lib/zarinpal/donation-config'
import { getZarinpalUrls } from '@/lib/zarinpal/tashim'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_PLANS = ['simple', 'professional', 'enterprise']

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
//  ساخت Order ID یکتا
// ═══════════════════════════════════════════════════════════════
function generateOrderId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {}

  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ═══════════════════════════════════════════════════════════════
//  محدود کردن عدد
// ═══════════════════════════════════════════════════════════════
function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

// ═══════════════════════════════════════════════════════════════
//  استخراج پیام خطا از پاسخ زرین‌پال
// ═══════════════════════════════════════════════════════════════
function getZarinpalErrorMessage(payload: any): string | undefined {
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
//  محاسبه امن قیمت در سمت سرور — با اولویت Site Content
// ═══════════════════════════════════════════════════════════════
async function computeServerPricing(
  tenantId: string,
  planName: string,
  billingCycle: BillingCycle,
  requestedDiscountPercent: number
) {
  // ★ اول از Site Content خوانده می‌شود
  const effectiveCycle = billingCycle === 'lifetime' ? 'lifetime' : 'annual'

  let basePrice = getServerPlanBasePrice(planName, effectiveCycle)

  // ★ اگر Site Content قیمت نداشت، fallback به plan-limits
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    basePrice = getPlanPrice(planName, billingCycle)
  }

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return {
      ok: false as const,
      error: 'قیمت این پلن در Site Content یا plan-limits تنظیم نشده است.',
    }
  }

  // ★ تخفیف از Site Content
  const siteDiscount = getServerPlanDiscountPercent(planName)

  // ★ تخفیف زودهنگام بر اساس وضعیت اشتراک
  let earlyDiscount = 0

  try {
    const status = await checkSubscriptionStatus(tenantId)

    if (
      !status.isLifetime &&
      status.daysRemaining > 0 &&
      status.daysRemaining <= 7
    ) {
      earlyDiscount = 30
    }
  } catch (err: any) {
    console.warn('[CreatePayment v3.0] Could not compute subscription discount:', err?.message)
    earlyDiscount = 0
  }

  // ★ سقف تخفیف مجاز سمت سرور
  //   برای جلوگیری از مبلغ صفر یا سوءاستفاده، حداکثر ۹۰٪ مجاز است.
  const allowedDiscount = Math.min(90, Math.max(siteDiscount, earlyDiscount))

  // ★ تخفیف درخواستی کاربر فقط تا سقف مجاز پذیرفته می‌شود
  const discountPercent = Math.round(
    clampNumber(Number(requestedDiscountPercent) || 0, 0, allowedDiscount)
  )

  const amountToman = Math.round(basePrice * (1 - discountPercent / 100))

  if (!Number.isSafeInteger(amountToman) || amountToman <= 0) {
    return {
      ok: false as const,
      error: 'مبلغ محاسبه‌شده نامعتبر است.',
    }
  }

  const cycleLabel = isLifetimeCycle(billingCycle) ? 'مادام‌العمر' : 'سالانه'

  return {
    ok: true as const,
    basePrice,
    discountPercent,
    amountToman,
    cycleLabel,
  }
}

// ═══════════════════════════════════════════════════════════════
//  پاک‌سازی رکوردهای pending در صورت خطا
// ═══════════════════════════════════════════════════════════════
async function cleanupPendingRecords(
  subscriptionId: string,
  paymentId: string,
  authority?: string
): Promise<void> {
  try {
    if (authority) {
      await db.client.onlinePayment.deleteMany({
        where: { authority },
      })
    }

    await db.client.onlinePayment.deleteMany({
      where: { gatewayId: paymentId },
    })

    await db.client.subscriptionPayments.delete({
      where: { id: paymentId },
    })

    await db.client.subscriptions.delete({
      where: { id: subscriptionId },
    })

    console.log('[CreatePayment v3.0] 🧹 Pending records cleaned up')
  } catch (err: any) {
    console.warn('[CreatePayment v3.0] ⚠️ Cleanup failed:', err?.message)
  }
}

// ═══════════════════════════════════════════════════════════════
//  POST: ایجاد پرداخت به‌روزرسانی اشتراک
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const body = await req.json().catch(() => ({}))

      const planName = String(body.planName || '').trim()
      const requestedDiscountPercent = Number(body.discountPercent) || 0
      const requestedBillingCycle = body.billingCycle
      const requestedIsLifetime = body.isLifetime

      console.log('[CreatePayment v3.0] 📥 Request:', {
        tenantId,
        planName,
        requestedDiscountPercent,
        requestedBillingCycle,
        requestedIsLifetime,
      })

      if (!ALLOWED_PLANS.includes(planName)) {
        return NextResponse.json(
          { success: false, error: 'پلن انتخابی نامعتبر است.' },
          { status: 400 }
        )
      }

      // ★ پیش‌فرض فعلی پروژه: مادام‌العمر
      const effectiveBillingCycle: BillingCycle =
        requestedBillingCycle === 'annual'
          ? 'annual'
          : requestedIsLifetime === false
          ? 'annual'
          : 'lifetime'

      const pricing = await computeServerPricing(
        tenantId,
        planName,
        effectiveBillingCycle,
        requestedDiscountPercent
      )

      if (!pricing.ok) {
        return NextResponse.json(
          { success: false, error: pricing.error },
          { status: 400 }
        )
      }

      const amountToman = pricing.amountToman

      if (!Number.isSafeInteger(amountToman) || amountToman <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ محاسبه‌شده نامعتبر است.' },
          { status: 400 }
        )
      }

      // ★ زرین‌پال مبلغ را به ریال می‌گیرد
      const amountRial = amountToman * 10

      if (!Number.isSafeInteger(amountRial) || amountRial <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ ریالی محاسبه‌شده نامعتبر است.' },
          { status: 400 }
        )
      }

      const merchantId = getZarinpalMerchantId()
      const sandbox = isZarinpalSandbox()
      const urls = getZarinpalUrls(sandbox)

      if (!merchantId) {
        console.error('[CreatePayment v3.0] ❌ Merchant ID is missing')
        return NextResponse.json(
          {
            success: false,
            error: sandbox
              ? 'مرچنت سندباکس یا اصلی زرین‌پال تنظیم نشده است.'
              : 'مرچنت واقعی زرین‌پال تنظیم نشده است.',
          },
          { status: 500 }
        )
      }

      const orderId = generateOrderId()
      const baseUrl = getPublicBaseUrl(req)

      const callbackUrl =
        `${baseUrl}/api/subscription/verify` +
        `?tenantId=${encodeURIComponent(tenantId)}` +
        `&context=subscription_update` +
        `&orderId=${encodeURIComponent(orderId)}`

      const description = `[SUBSCRIPTION_UPDATE] به‌روزرسانی پلن ${planName} (${pricing.cycleLabel})`

      // ── . ایجاد رکورد pending در Subscriptions و SubscriptionPayments ──
      const pending = await createPendingSubscription(
        tenantId,
        planName,
        effectiveBillingCycle,
        amountToman,
        `temp_${orderId}`
      )

      if (!pending) {
        console.error('[CreatePayment v3.0] ❌ Failed to create pending subscription')
        return NextResponse.json(
          { success: false, error: 'خطا در ایجاد تراکنش اولیه' },
          { status: 500 }
        )
      }

      console.log('[CreatePayment v3.0] ✅ Pending subscription created:', pending)

      // ── . ساخت body درخواست زرین‌پال ──
      const requestBody: any = {
        merchant_id: merchantId,
        amount: amountRial,
        currency: 'IRR',
        description,
        callback_url: callbackUrl,
      }

      // ── . metadata فقط در صورت وجود مقادیر معتبر ──
      try {
        const tenantDetails = await db.client.tenant.findUnique({
          where: { id: tenantId },
          select: { ownerMobile: true, ownerEmail: true },
        })

        const metadata: any = {}

        if (
          tenantDetails?.ownerMobile &&
          typeof tenantDetails.ownerMobile === 'string' &&
          tenantDetails.ownerMobile.trim()
        ) {
          metadata.mobile = tenantDetails.ownerMobile.trim()
        }

        if (
          tenantDetails?.ownerEmail &&
          typeof tenantDetails.ownerEmail === 'string' &&
          tenantDetails.ownerEmail.trim()
        ) {
          metadata.email = tenantDetails.ownerEmail.trim()
        }

        if (Object.keys(metadata).length > 0) {
          requestBody.metadata = metadata
          console.log('[CreatePayment v3.0] 📱 Adding metadata:', metadata)
        } else {
          console.log('[CreatePayment v3.0] ℹ️ No metadata sent')
        }
      } catch (metaErr: any) {
        console.warn('[CreatePayment v3.0] ⚠️ Could not fetch tenant details for metadata:', metaErr?.message)
      }

      console.log('[CreatePayment v3.0] 🔄 Calling ZarinPal v4:', {
        url: urls.request,
        sandbox,
        amountToman,
        amountRial,
        currency: 'IRR',
        callbackUrl,
        orderId,
      })

      // ── ۴. ارسال درخواست به زرین‌پال ──
      let zarinpalRes: Response
      try {
        zarinpalRes = await fetchWithTimeout(
          urls.request,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(requestBody),
            cache: 'no-store',
          },
          15000
        )
      } catch (err: any) {
        const isTimeout = err?.name === 'AbortError'

        console.error('[CreatePayment v3.0] ❌ Fetch error:', {
          isTimeout,
          message: err?.message,
        })

        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)

        return NextResponse.json(
          {
            success: false,
            error: isTimeout
              ? 'اتصال به زرین‌پال به timeout خورد. لطفاً دوباره تلاش کنید.'
              : 'خطا در ارتباط با سرویس زرین‌پال. لطفاً دوباره تلاش کنید.',
          },
          { status: 502 }
        )
      }

      const zarinpalJson = await zarinpalRes.json().catch(() => null)
      const zarinpalErrorMessage = getZarinpalErrorMessage(zarinpalJson)

      if (!zarinpalRes.ok) {
        console.error('[CreatePayment v3.0] ❌ ZarinPal HTTP error:', {
          status: zarinpalRes.status,
          json: zarinpalJson,
        })

        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)

        return NextResponse.json(
          {
            success: false,
            error: zarinpalErrorMessage || `خطا در ارتباط با درگاه پرداخت (کد ${zarinpalRes.status})`,
            zarinpalStatus: zarinpalRes.status,
            zarinpalResponse: zarinpalJson,
          },
          { status: 400 }
        )
      }

      if (!zarinpalJson) {
        console.error('[CreatePayment v3.0] ❌ Empty response from ZarinPal')

        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)

        return NextResponse.json(
          { success: false, error: 'پاسخ نامعتبر از درگاه پرداخت' },
          { status: 502 }
        )
      }

      console.log('[CreatePayment v3.0] 📦 ZarinPal v4 response:', JSON.stringify(zarinpalJson, null, 2))

      const code = zarinpalJson.data?.code
      const authority = zarinpalJson.data?.authority

      if ((code === 100 || code === 101) && authority) {
        // ── ۵. آپدیت رکورد pending با authority واقعی ──
        try {
          await db.client.subscriptionPayments.update({
            where: { id: pending.paymentId },
            data: {
              paymentRef: authority,
            },
          })
          console.log('[CreatePayment v3.0] ✅ Payment record updated with authority:', authority)
        } catch (updateErr: any) {
          console.error('[CreatePayment v3.0] ⚠️ Failed to update paymentRef:', updateErr?.message)
        }

        // ── ۶. ثبت در OnlinePayments برای صفحه تراکنش‌ها ──
        try {
      await db.client.onlinePayment.create({
  data: {
    tenantId,
    type: 'subscription_update',
    isSandbox: sandbox,

    amount: amountToman,
    grossAmount: amountToman,
    netAmount: amountToman,
    fee: 0,

    authority,
    status: 'pending',
    gatewayType: 'zarinpal',
    gatewayId: pending.paymentId,
    description: `${description} | orderId=${orderId} | discount=${pricing.discountPercent}%`,
    paidAt: null,
    verifiedAt: null,
    settlementStatus: 'pending',
  },
})
          console.log('[CreatePayment v3.0] ✅ OnlinePayment record created')
        } catch (onlineErr: any) {
          console.warn('[CreatePayment v3.0] ⚠️ Failed to create OnlinePayment record:', onlineErr?.message)
        }

        const startPayDomain = sandbox
          ? 'https://sandbox.zarinpal.com'
          : 'https://www.zarinpal.com'

        const paymentUrl = `${startPayDomain}/pg/StartPay/${authority}`

        console.log('[CreatePayment v3.0] 🎉 Payment URL ready:', paymentUrl)

        return NextResponse.json({
          success: true,
          data: {
            paymentId: pending.paymentId,
            subscriptionId: pending.subscriptionId,
            authority,
            paymentUrl,
            amountToman,
            amountRial,
            currency: 'IRR',
            tierName: planName,
            billingCycle: effectiveBillingCycle,
            discountPercent: pricing.discountPercent,
            orderId,
            sandbox,
          },
        })
      }

      console.warn('[CreatePayment v3.0] ❌ ZarinPal request failed:', zarinpalJson)

      await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)

      return NextResponse.json(
        {
          success: false,
          error: zarinpalErrorMessage || 'ایجاد تراکنش در زرین‌پال ناموفق بود.',
          code,
        },
        { status: 400 }
      )
    } catch (error: any) {
      console.error('[CreatePayment v3.0] 💥 Unexpected error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطای سرور',
        },
        { status: 500 }
      )
    }
  }
)