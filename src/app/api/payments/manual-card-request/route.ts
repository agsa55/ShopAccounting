// ============================================================================
// src/app/api/payments/manual-card-request/route.ts (v1.0 ★★★)
// ShopAccounting — Manual Card-to-Card Payment Request for Subscription Update
// ----------------------------------------------------------------------------
// ★ این API یک رکورد در OnlinePayments با وضعیت waiting_review ایجاد می‌کند.
// ★ پرداخت خودکار فعال نمی‌شود؛ پشتیبانی باید رسید را بررسی و تأیید کند.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_PLANS = ['simple', 'professional', 'enterprise']
const MANUAL_TAG = '[MANUAL_CARD_SUBSCRIPTION_UPDATE]'

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
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
  const effectiveCycle = billingCycle === 'lifetime' ? 'lifetime' : 'annual'

  let basePrice = getServerPlanBasePrice(planName, effectiveCycle)

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    basePrice = getPlanPrice(planName, billingCycle)
  }

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return {
      ok: false as const,
      error: 'قیمت این پلن در Site Content یا plan-limits تنظیم نشده است.',
    }
  }

  const siteDiscount = getServerPlanDiscountPercent(planName)

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
    console.warn('[ManualCardRequest] Could not compute subscription discount:', err?.message)
    earlyDiscount = 0
  }

  const allowedDiscount = Math.min(90, Math.max(siteDiscount, earlyDiscount))

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
export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const body = await req.json().catch(() => ({}))

      const planName = String(body.planName || '').trim()
      const requestedDiscountPercent = Number(body.discountPercent) || 0
      const requestedBillingCycle = body.billingCycle
      const requestedIsLifetime = body.isLifetime

      if (!ALLOWED_PLANS.includes(planName)) {
        return NextResponse.json(
          { success: false, error: 'پلن انتخابی نامعتبر است.' },
          { status: 400 }
        )
      }

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

      // ★ اگر درخواست pending قبلی وجود دارد، همان را برگردان
      const existing = await db.client.onlinePayment.findFirst({
        where: {
          tenantId,
          status: 'waiting_review',
          gatewayType: 'manual_card',
          description: {
            contains: MANUAL_TAG,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (existing) {
        return NextResponse.json({
          success: true,
          data: {
            paymentId: existing.id,
            amountToman: Number(existing.amount),
            status: existing.status,
            existing: true,
          },
          message: 'درخواست پرداخت کارت‌به‌کارت شما قبلاً ثبت شده و در انتظار تأیید پشتیبانی است.',
        })
      }

      const description =
        `${MANUAL_TAG} به‌روزرسانی پلن ${planName} (${pricing.cycleLabel}) | ` +
        `discount=${pricing.discountPercent}% | amount=${amountToman} تومان`

 const created = await db.client.onlinePayment.create({
  data: {
    tenantId,
    type: 'manual_card',
    isSandbox: false,

    amount: amountToman,
    grossAmount: amountToman,
    netAmount: amountToman,
    fee: 0,

    authority: null,
    refId: null,
    status: 'waiting_review',
    gatewayType: 'manual_card',
    gatewayId: null,
    gatewayUrl: null,
    description,
    paidAt: null,
    verifiedAt: null,
    settlementStatus: 'pending',
  },
})

      console.log('[ManualCardRequest] ✅ Manual payment request created:', created.id)

      return NextResponse.json({
        success: true,
        data: {
          paymentId: created.id,
          amountToman,
          status: created.status,
          existing: false,
        },
        message: 'درخواست پرداخت کارت‌به‌کارت ثبت شد. لطفاً رسید را در تیکت پشتیبانی ارسال کنید.',
      })
    } catch (error: any) {
      console.error('[ManualCardRequest] 💥 Unexpected error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطای سرور در ثبت درخواست پرداخت کارت‌به‌کارت',
        },
        { status: 500 }
      )
    }
  }
)