// ============================================================================
// src/app/api/payments/create-update-payment/route.ts (v2.0 ★★★)
// ShopAccounting — Subscription Payment Creation (ZarinPal v4)
// ----------------------------------------------------------------------------
// ★ v2.0: بازنویسی کامل برای سازگاری با /api/subscription/verify
// ★ v2.0: استفاده از subscription-utils برای ایجاد رکورد صحیح
// ★ v2.0: اصلاح Currency (IRT = تومان) و URL های v4 جدید
// ★ v2.0: Callback URL صحیح: /api/subscription/verify
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import {
  createPendingSubscription,
  buildPaymentMethodMetadata,
  type BillingCycle,
} from '@/lib/subscription-utils'
import { isLifetimeCycle } from '@/lib/plan-limits'

export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const body = await req.json()
      const { planName, amount, discountPercent, isLifetime, billingCycle } = body

      console.log('[CreatePayment v2.0] 📥 Request:', {
        tenantId,
        planName,
        amount,
        discountPercent,
        isLifetime,
        billingCycle,
      })

      // ── ۱. اعتبارسنجی ورودی‌ها ─────────────────────────────
      if (!planName || !amount) {
        return NextResponse.json(
          { success: false, error: 'اطلاعات ناقص است (planName یا amount)' },
          { status: 400 }
        )
      }

      const amountNumber = Number(amount)
      if (isNaN(amountNumber) || amountNumber <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ نامعتبر است' },
          { status: 400 }
        )
      }

      // ── ۲. تعیین billingCycle (پیش‌فرض: lifetime) ──────────
      // ★ v2.0: چون همه پلن‌ها مادام‌العمر هستند، پیش‌فرض lifetime است
      const effectiveBillingCycle: BillingCycle =
        billingCycle === 'annual' ? 'annual' :
        isLifetime === false ? 'annual' :
        'lifetime'

      console.log('[CreatePayment v2.0] 📋 Effective billing cycle:', effectiveBillingCycle)

      // ── ۳. دریافت مرچنت کد از ENV (Platform Gateway) ─────
      const merchantId = process.env.ZARINPAL_MERCHANT_ID || ''
      const sandboxMode = process.env.ZARINPAL_SANDBOX === 'true'

      if (!merchantId) {
        console.error('[CreatePayment v2.0] ❌ ZARINPAL_MERCHANT_ID not set in .env')
        return NextResponse.json(
          { success: false, error: 'درگاه پرداخت پلتفرم پیکربندی نشده است. با پشتیبانی تماس بگیرید.' },
          { status: 500 }
        )
      }

      console.log('[CreatePayment v2.0] 🔑 Using platform merchant:', {
        merchantId: merchantId.substring(0, 8) + '...',
        sandbox: sandboxMode,
      })

      // ── ۴. ایجاد رکورد در SubscriptionPayments ──────────
      // ★ v2.0: از subscription-utils استفاده می‌کنیم
      //   این تابع:
      //     - PlanTier را پیدا/ایجاد می‌کند
      //     - Plans را پیدا/ایجاد می‌کند
      //     - Subscriptions (status=pending) می‌سازد
      //     - SubscriptionPayments (status=pending) با paymentMethod metadata می‌سازد
      const pending = await createPendingSubscription(
        tenantId,
        planName,
        effectiveBillingCycle,
        amountNumber,
        'temp_authority' // ★ موقت — بعد از دریافت از زرین‌پال آپدیت می‌شود
      )

      if (!pending) {
        console.error('[CreatePayment v2.0] ❌ Failed to create pending subscription')
        return NextResponse.json(
          { success: false, error: 'خطا در ایجاد تراکنش اولیه' },
          { status: 500 }
        )
      }

      console.log('[CreatePayment v2.0] ✅ Pending subscription created:', pending)

      // ── ۵. دریافت authority از زرین‌پال (v4) ─────────────
      const apiRequestUrl = sandboxMode
        ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
        : 'https://api.zarinpal.com/pg/v4/payment/request.json'

      // ★ v2.0: Callback URL صحیح — با tenantId در query
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
      const callbackUrl = `${appUrl}/api/subscription/verify?tenantId=${encodeURIComponent(tenantId)}`

      // ★ v2.0: IRT = تومان (چون مبالغ UI به تومان هستند)
      const currency = 'IRT'

        const cycleLabel = isLifetimeCycle(effectiveBillingCycle) ? 'مادام‌العمر' : 'سالانه'
      const description = `به‌روزرسانی سیستم ShopAccounting — پلن ${planName} (${cycleLabel})${discountPercent > 0 ? ` - ${discountPercent}% تخفیف` : ''}`

      console.log('[CreatePayment v2.1] 🔄 Calling ZarinPal v4:', {
        url: apiRequestUrl,
        merchantId: merchantId.substring(0, 8) + '...',
        amount: amountNumber,
        currency,
        callbackUrl,
      })

      // ★ v2.1: ساخت body بدون metadata (زرین‌پال فیلدهای خالی/undefined را رد می‌کند)
      // ★ tierName و billingCycle از قبل در paymentMethod ذخیره شده‌اند
      const requestBody: any = {
        merchant_id: merchantId,
        amount: amountNumber,
        currency,
        description,
        callback_url: callbackUrl,
      }

      // ★ v2.1: فقط در صورت وجود اطلاعات معتبر، metadata را اضافه کن
      try {
        const tenantDetails = await db.client.tenant.findUnique({
          where: { id: tenantId },
          select: { ownerMobile: true, ownerEmail: true },
        })

        const metadata: any = {}
        if (tenantDetails?.ownerMobile && typeof tenantDetails.ownerMobile === 'string' && tenantDetails.ownerMobile.trim()) {
          metadata.mobile = tenantDetails.ownerMobile.trim()
        }
        if (tenantDetails?.ownerEmail && typeof tenantDetails.ownerEmail === 'string' && tenantDetails.ownerEmail.trim()) {
          metadata.email = tenantDetails.ownerEmail.trim()
        }

        if (Object.keys(metadata).length > 0) {
          requestBody.metadata = metadata
          console.log('[CreatePayment v2.1] 📱 Adding metadata:', metadata)
        } else {
          console.log('[CreatePayment v2.1] ℹ️ No metadata (mobile/email not available)')
        }
      } catch (metaErr: any) {
        console.warn('[CreatePayment v2.1] ⚠️ Could not fetch tenant details for metadata:', metaErr?.message)
        // ادامه بده بدون metadata
      }

      const zarinpalRes = await fetch(apiRequestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!zarinpalRes.ok) {
        const errorText = await zarinpalRes.text()
        console.error('[CreatePayment v2.0] ❌ ZarinPal HTTP error:', zarinpalRes.status, errorText)

        // پاک کردن رکورد pending در صورت خطا
        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)

        return NextResponse.json(
          { success: false, error: `خطا در ارتباط با درگاه پرداخت (کد ${zarinpalRes.status})` },
          { status: 500 }
        )
      }

      let zarinpalData: any
      try {
        zarinpalData = await zarinpalRes.json()
      } catch (parseErr) {
        console.error('[CreatePayment v2.0] ❌ JSON parse error:', parseErr)
        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)
        return NextResponse.json(
          { success: false, error: 'پاسخ نامعتبر از درگاه پرداخت' },
          { status: 500 }
        )
      }

      console.log('[CreatePayment v2.0] 📦 ZarinPal v4 response:', JSON.stringify(zarinpalData, null, 2))

      // ── ۶. بررسی خطاها در پاسخ زرین‌پال ───────────────────
      if (zarinpalData?.errors && Array.isArray(zarinpalData.errors) && zarinpalData.errors.length > 0) {
        console.error('[CreatePayment v2.0] ❌ ZarinPal errors:', zarinpalData.errors)
        const firstError = zarinpalData.errors[0]
        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)
        return NextResponse.json(
          { success: false, error: firstError?.message || 'خطای ناشناخته از زرین‌پال' },
          { status: 500 }
        )
      }

      // v4 موفق: code === 100
      if (zarinpalData?.data?.code !== 100) {
        console.error('[CreatePayment v2.0] ❌ ZarinPal error code:', zarinpalData?.data?.code)
        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)
        return NextResponse.json(
          { success: false, error: zarinpalData?.data?.message || 'خطا در ایجاد تراکنش' },
          { status: 500 }
        )
      }

      const authority = zarinpalData.data.authority

      if (!authority) {
        console.error('[CreatePayment v2.0] ❌ No authority in response')
        await cleanupPendingRecords(pending.subscriptionId, pending.paymentId)
        return NextResponse.json(
          { success: false, error: 'authority از زرین‌پال دریافت نشد' },
          { status: 500 }
        )
      }

      // ── ۷. آپدیت رکورد با authority واقعی ────────────────
      try {
        await db.client.subscriptionPayments.update({
          where: { id: pending.paymentId },
          data: { paymentRef: authority },
        })
        console.log('[CreatePayment v2.0] ✅ Payment record updated with authority:', authority)
      } catch (updateErr: any) {
        console.error('[CreatePayment v2.0] ⚠️ Failed to update paymentRef:', updateErr?.message)
      }

      // ── ۸. ساخت URL پرداخت (v4 جدید) ─────────────────────
      // ★ v2.0: طبق مستندات v4، URL صحیح این است
      const startPayDomain = sandboxMode
        ? 'https://sandbox.zarinpal.com'
        : 'https://www.zarinpal.com'

      const paymentUrl = `${startPayDomain}/pg/StartPay/${authority}`

      console.log('[CreatePayment v2.0] 🎉 Payment URL ready:', paymentUrl)

      // ── ۹. پاسخ موفق به کلاینت ────────────────────────────
      return NextResponse.json({
        success: true,
        data: {
          paymentId: pending.paymentId,
          subscriptionId: pending.subscriptionId,
          authority,
          paymentUrl,
          amount: amountNumber,
          currency,
          tierName: planName,
          billingCycle: effectiveBillingCycle,
        },
      })
    } catch (error: any) {
      console.error('[CreatePayment v2.0] 💥 Unexpected error:', error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطای سرور' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  تابع کمکی: پاک کردن رکوردهای pending در صورت خطا
// ═══════════════════════════════════════════════════════════════

async function cleanupPendingRecords(
  subscriptionId: string,
  paymentId: string
): Promise<void> {
  try {
    await db.client.subscriptionPayments.delete({ where: { id: paymentId } })
    await db.client.subscriptions.delete({ where: { id: subscriptionId } })
    console.log('[CreatePayment v2.0] 🧹 Pending records cleaned up')
  } catch (err: any) {
    console.warn('[CreatePayment v2.0] ⚠️ Cleanup failed:', err?.message)
  }
}