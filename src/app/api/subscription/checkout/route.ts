// ============================================================================
// src/app/api/subscription/checkout/route.ts (v9.5 ★★★)
// ShopAccounting — Subscription Checkout API
// ----------------------------------------------------------------------------
// ★★★ v9.5: پشتیبانی کامل از تمدید (renew) و ارتقا (upgrade)
//   - اضافه شدن action: 'renew' برای تمدید پلن
//   - اضافه شدن action: 'upgrade' برای ارتقا پلن
//   - بهبود لاگ‌ها برای debug
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import {
  calculateCheckoutAmount,
  createPendingSubscription,
  buildPaymentMethodMetadata,
  type BillingCycle,
} from '@/lib/subscription-utils'
import { isLifetimeCycle } from '@/lib/plan-limits'
import { isDemoTenant } from '@/lib/demo-utils'

interface CheckoutBody {
  tierName: 'simple' | 'professional' | 'enterprise'
  billingCycle: 'annual' | 'lifetime'
  action?: 'upgrade' | 'renew' | 'new'
}

// ★★★ v9.4.2: تابع هوشمند تشخیص URL پایه
function resolveAppUrl(req: NextRequest): string {
  // ۱. اولویت با متغیر محیطی است اگر مقدار معتبری (غیر از localhost) داشته باشد
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '')
  }

  // ۲. استفاده از هدرهای درخواست برای محیط لوکال یا زمانی که env به درستی ست نشده
  const host = req.headers.get('host')
  if (host) {
    const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1')
    const forwardedProto = req.headers.get('x-forwarded-proto')
    const protocol = forwardedProto || (isLocalHost ? 'http' : 'https')
    return `${protocol}://${host}`
  }

  // ۳. فال‌بک نهایی
  return (envUrl || 'http://localhost:3000').replace(/\/$/, '')
}

export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    const tenantId = tenant.tenantId
    console.log('[Subscription Checkout] POST — tenant:', tenantId)

    try {
      const body: CheckoutBody = await req.json()
      const { tierName, billingCycle, action = 'renew' } = body

      console.log('[Subscription Checkout] Request params:', { tierName, billingCycle, action })

      // ─── ۱. اعتبارسنجی ─────────────────────────────────────────
      if (!tierName || !billingCycle) {
        return NextResponse.json(
          { success: false, error: 'نام پلن و دوره الزامی است' },
          { status: 400 }
        )
      }

      const validTiers = ['simple', 'professional', 'enterprise']
      const validCycles: BillingCycle[] = ['annual', 'lifetime']

      if (!validTiers.includes(tierName)) {
        return NextResponse.json(
          { success: false, error: 'پلن نامعتبر است' },
          { status: 400 }
        )
      }

      if (!validCycles.includes(billingCycle as BillingCycle)) {
        return NextResponse.json(
          { success: false, error: 'دوره نامعتبر است' },
          { status: 400 }
        )
      }

      // ─── ۲. بررسی وضعیت Tenant ─────────────────────────────────
      const currentTenant = await db.client.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          status: true,
          subDomain: true,
          companyName: true,
          planName: true,
          billingCycle: true,
          expiresAt: true,
        },
      })

      if (!currentTenant) {
        return NextResponse.json(
          { success: false, error: 'فروشگاه یافت نشد' },
          { status: 404 }
        )
      }

      const isDemo = isDemoTenant(currentTenant)
      console.log(`[Subscription Checkout] Tenant info:`, {
        isDemo,
        status: currentTenant.status,
        currentPlan: currentTenant.planName,
        currentCycle: currentTenant.billingCycle,
        expiresAt: currentTenant.expiresAt,
      })

      // ─── ۳. محاسبه مبلغ ─────────────────────────────────────────
      const amount = calculateCheckoutAmount(tierName, billingCycle as BillingCycle, action)

      if (amount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ پلن نامعتبر است' },
          { status: 400 }
        )
      }

      console.log(`[Subscription Checkout] Amount: ${amount} (tier: ${tierName}, cycle: ${billingCycle}, action: ${action})`)

      // ─── ۴. ایجاد درگاه زرین‌پال ─────────────────────────────────
      const merchantId = process.env.ZARINPAL_MERCHANT_ID
      const isSandbox = process.env.ZARINPAL_SANDBOX === 'true'
      
      // ★★★ استفاده از تابع هوشمند برای دریافت URL صحیح
      const appUrl = resolveAppUrl(req)
      console.log(`[Subscription Checkout] Resolved appUrl: ${appUrl}`)

      if (!merchantId) {
        console.error('[Subscription Checkout] ZARINPAL_MERCHANT_ID not set')
        return NextResponse.json(
          { success: false, error: 'درگاه پرداخت پیکربندی نشده است' },
          { status: 500 }
        )
      }

      // ★ ساخت description بر اساس نوع عملیات
      const cycleLabel = isLifetimeCycle(billingCycle) ? 'مادام‌العمر' : 'سالانه'
      let actionLabel = 'خرید'
      if (action === 'renew') actionLabel = 'تمدید'
      else if (action === 'upgrade') actionLabel = 'ارتقا'
      
      const description = `${actionLabel} پلن ${tierName} (${cycleLabel}) - ${currentTenant.companyName || ''}`

      // ★ Callback URL — پس از پرداخت، کاربر به این آدرس برمی‌گردد
      // پارامتر action را هم ارسال می‌کنیم تا verify بداند چه کاری انجام دهد
      const callbackUrl = `${appUrl}/api/subscription/verify?tenantId=${currentTenant.id}&action=${action}`

      const apiRequestUrl = isSandbox
        ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
        : 'https://api.zarinpal.com/pg/v4/payment/request.json'

      console.log('[Subscription Checkout] Requesting Zarinpal authority...', {
        merchantId: merchantId.substring(0, 6) + '...',
        amount: Math.round(amount),
        callbackUrl,
        sandbox: isSandbox,
      })

      const zarinpalResponse = await fetch(apiRequestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: Math.round(amount),
          description,
          callback_url: callbackUrl,
          metadata: {
            tenant_id: tenantId,
            tier_name: tierName,
            billing_cycle: billingCycle,
            action,
          },
        }),
      })

      const zarinpalData = await zarinpalResponse.json()
      console.log('[Subscription Checkout] Zarinpal response:', zarinpalData)

      const authority = zarinpalData?.data?.authority
      const code = zarinpalData?.data?.code

      if (code !== 100 && code !== 200) {
        console.error('[Subscription Checkout] Zarinpal request failed:', zarinpalData)
        return NextResponse.json(
          { 
            success: false, 
            error: 'خطا در ایجاد درخواست پرداخت',
            details: zarinpalData?.errors || zarinpalData 
          },
          { status: 500 }
        )
      }

      // ─── ۵. ایجاد رکورد pending در دیتابیس ──────────────────────
      const paymentMethod = buildPaymentMethodMetadata(tierName, billingCycle as BillingCycle)
      
      console.log('[Subscription Checkout] Creating pending subscription...')
      const pendingResult = await createPendingSubscription(
        tenantId,
        tierName,
        billingCycle as BillingCycle,
        amount,
        authority
      )

      if (!pendingResult) {
        console.error('[Subscription Checkout] Failed to create pending subscription')
        return NextResponse.json(
          { success: false, error: 'خطا در ایجاد رکورد پرداخت' },
          { status: 500 }
        )
      }

      console.log('[Subscription Checkout] ✓ Pending subscription created:', {
        subscriptionId: pendingResult.subscriptionId,
        paymentId: pendingResult.paymentId,
      })

      // ─── ۶. ساخت URL پرداخت ──────────────────────────────────────
      const paymentUrl = isSandbox
        ? `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
        : `https://www.zarinpal.com/pg/StartPay/${authority}`

      console.log('[Subscription Checkout] ✓ Payment URL created:', paymentUrl)

      // ─── ۷. بازگشت نتیجه ─────────────────────────────────────────
      return NextResponse.json({
        success: true,
        data: {
          authority,
          paymentUrl,
          amount,
          tierName,
          billingCycle,
          action,
          description,
          subscriptionPaymentId: pendingResult.paymentId,
          subscriptionId: pendingResult.subscriptionId,
          isDemo,
        },
        message: `درخواست ${actionLabel} با موفقیت ایجاد شد`,
      })
    } catch (error: any) {
      console.error('[Subscription Checkout] Unexpected error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
        { status: 500 }
      )
    }
  }
)