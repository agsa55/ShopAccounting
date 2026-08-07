// ============================================================================
// src/app/api/subscription/checkout/route.ts (v9.4.1 ★★★)
// ShopAccounting — Subscription Checkout API
// ----------------------------------------------------------------------------
// ★★★ v9.4.1: FIX — ساخت پویای appUrl از روی هدرهای درخواست
//   قبلاً: appUrl فقط از process.env.NEXT_PUBLIC_APP_URL خوانده می‌شد و اگر
//   این env var ست نشده بود (یا هنوز مقدار لوکال داشت)، callback زرین‌پال
//   همیشه به http://localhost:3000 اشاره می‌کرد — حتی روی سرور دیپلوی‌شده.
//   حالا appUrl ابتدا از هدرهای خودِ درخواست (host + x-forwarded-proto) ساخته
//   می‌شود؛ یعنی چه در لوکال (localhost:3000) چه روی Railway (دامنه‌ی موقت یا
//   دامنه‌ی نهایی بعداً) بدون نیاز به تنظیم دستی env var درست کار می‌کند.
//   NEXT_PUBLIC_APP_URL همچنان به‌عنوان fallback نگه داشته شده (برای مواردی
//   که هدر host در دسترس نباشد).
//
// ★★★ v9.4.0: پشتیبانی از حالت دمو
//   - اگر tenant فعلی دمو است و می‌خواهد پلن بخرد:
//     • action='new' → یک tenant جدید ایجاد می‌کند (نه upgrade)
//     • tenant دمو بعد از پرداخت موفق حذف نمی‌شود (ممکن است کاربر بخواهد برگردد)
//     • اطلاعات دمو به tenant جدید منتقل نمی‌شود
//   - اگر tenant عادی است (active):
//     • action='upgrade' → همان tenant ارتقا می‌یابد
//     • اطلاعات حفظ می‌شود
//
// ★ نیاز به توکن معتبر دارد (withTenantIsolation)
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

// ★★★ v9.4.1: ساخت پویای base URL از روی هدرهای درخواست
//   این تابع در لوکال (host=localhost:3000) و در هر محیط دیپلوی‌شده‌ای
//   (host=دامنه‌ی واقعی سرو‌کننده‌ی درخواست) به‌درستی کار می‌کند، بدون
//   نیاز به تنظیم دستی هیچ env var ای.
function resolveAppUrl(req: NextRequest): string {
  const host = req.headers.get('host')

  if (host) {
    const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1')
    // ★ Railway و اکثر پلتفرم‌های میزبانی، هدر x-forwarded-proto را برای
    //   ترافیک HTTPS پشت پراکسی ست می‌کنند
    const forwardedProto = req.headers.get('x-forwarded-proto')
    const protocol = forwardedProto || (isLocalHost ? 'http' : 'https')
    return `${protocol}://${host}`
  }

  // ★ fallback نهایی — اگر به هر دلیلی هدر host در دسترس نبود
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[Subscription Checkout] POST — tenant:', tenant.tenantId)

    try {
      const body: CheckoutBody = await req.json()
      const { tierName, billingCycle, action = 'renew' } = body

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

      // ★★★ v9.4.0: بررسی اینکه آیا tenant فعلی دمو است
      const currentTenant = await db.client.tenant.findUnique({
        where: { id: tenant.tenantId },
        select: {
          id: true,
          status: true,
          subDomain: true,
          companyName: true,
          planName: true,
          billingCycle: true,
        },
      })

      if (!currentTenant) {
        return NextResponse.json(
          { success: false, error: 'فروشگاه یافت نشد' },
          { status: 404 }
        )
      }

      const isDemo = isDemoTenant(currentTenant)
      console.log(`[Subscription Checkout] Tenant isDemo: ${isDemo}, status: ${currentTenant.status}`)

      // ─── ۲. محاسبه مبلغ ─────────────────────────────────────────
      const amount = calculateCheckoutAmount(tierName, billingCycle as BillingCycle, action)

      if (amount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ پلن نامعتبر است' },
          { status: 400 }
        )
      }

      console.log(`[Subscription Checkout] Amount: ${amount} (tier: ${tierName}, cycle: ${billingCycle})`)

      // ─── ۳. ایجاد درگاه زرین‌پال ─────────────────────────────────
      const merchantId = process.env.ZARINPAL_MERCHANT_ID
      const isSandbox = process.env.ZARINPAL_SANDBOX === 'true'
      // ★★★ v9.4.1: appUrl حالا پویا از روی هدرهای درخواست ساخته می‌شود
      const appUrl = resolveAppUrl(req)
      console.log(`[Subscription Checkout] Resolved appUrl: ${appUrl}`)

      if (!merchantId) {
        console.error('[Subscription Checkout] ZARINPAL_MERCHANT_ID not set')
        return NextResponse.json(
          { success: false, error: 'درگاه پرداخت پیکربندی نشده است' },
          { status: 500 }
        )
      }

      // ★ توضیح پرداخت
      const cycleLabel = isLifetimeCycle(billingCycle) ? 'مادام‌العمر' : 'سالانه'
      const description = `خرید پلن ${tierName} (${cycleLabel}) - ${currentTenant.companyName || ''}`

      // ★ Callback URL — پس از پرداخت، کاربر به این آدرس برمی‌گردد
      const callbackUrl = `${appUrl}/api/subscription/verify?tenantId=${currentTenant.id}`

      // ★ ایجاد تراکنش در زرین‌پال
      const apiRequestUrl = isSandbox
        ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
        : 'https://api.zarinpal.com/pg/v4/payment/request.json'

      console.log('[Subscription Checkout] Requesting Zarinpal authority...')

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
        }),
      })

      const zarinpalData = await zarinpalResponse.json()
      console.log('[Subscription Checkout] Zarinpal response:', zarinpalData)

      const authority = zarinpalData?.data?.authority
      const code = zarinpalData?.data?.code

      // ★ کدهای موفق: 100 (ایجاد موفق) یا 200 (پرداخت تسهیمی)
      if (code !== 100 && code !== 200) {
        console.error('[Subscription Checkout] Zarinpal request failed:', zarinpalData)
        return NextResponse.json(
          { success: false, error: 'خطا در ایجاد درخواست پرداخت' },
          { status: 500 }
        )
      }

      // ─── ۴. ایجاد رکورد pending در دیتابیس ──────────────────────
      const paymentMethod = buildPaymentMethodMetadata(tierName, billingCycle as BillingCycle)
      const pendingResult = await createPendingSubscription(
        currentTenant.id,
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

      console.log('[Subscription Checkout] ✓ Pending subscription created:', pendingResult.subscriptionId)

      // ─── ۵. ساخت URL پرداخت ──────────────────────────────────────
      const paymentUrl = isSandbox
        ? `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
        : `https://www.zarinpal.com/pg/StartPay/${authority}`

      // ─── ۶. بازگشت نتیجه ─────────────────────────────────────────
      return NextResponse.json({
        success: true,
        data: {
          authority,
          paymentUrl,
          amount,
          tierName,
          billingCycle,
          description,
          subscriptionPaymentId: pendingResult.paymentId,
          isDemo,  // ★★★ اطلاع به کلاینت که tenant دمو است
        },
      })
    } catch (error: any) {
      console.error('[Subscription Checkout] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
        { status: 500 }
      )
    }
  }
)
