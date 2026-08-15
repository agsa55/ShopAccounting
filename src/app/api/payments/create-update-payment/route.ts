// ============================================================================
// src/app/api/payments/create-update-payment/route.ts
// ★ v1.3: API جدید زرین‌پال (v4) + SQL مستقیم
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'

export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const body = await req.json()
      const { planName, amount, discountPercent, isLifetime } = body

      console.log('[CreatePayment] 📥 Request:', { planName, amount, discountPercent })

      if (!planName || !amount) {
        return NextResponse.json(
          { success: false, error: 'اطلاعات ناقص است' },
          { status: 400 }
        )
      }

      // ── ۱. دریافت تنظیمات درگاه زرین‌پال ─────────────────
      let merchantId = process.env.ZARINPAL_MERCHANT_ID || ''
      let sandboxMode = process.env.ZARINPAL_SANDBOX === 'true'

      try {
        const gateways: any[] = await db.client.$queryRaw`
          SELECT "merchantId", sandbox
          FROM "PaymentGateways"
          WHERE "tenantId" = ${tenantId} AND type = 'zarinpal' AND "isActive" = true
          LIMIT 1
        `
        if (gateways.length > 0 && gateways[0].merchantId) {
          merchantId = gateways[0].merchantId
          sandboxMode = gateways[0].sandbox === true
        }
      } catch {
        // نادیده بگیر
      }

      if (!merchantId) {
        console.error('[CreatePayment] ❌ No merchant ID configured')
        return NextResponse.json(
          { success: false, error: 'درگاه پرداخت پیکربندی نشده است. با پشتیبانی تماس بگیرید.' },
          { status: 500 }
        )
      }

      // ── ۲. تبدیل amount به Number (تومان) ───────────────
      const amountNumber = Number(amount)
      
      if (isNaN(amountNumber) || amountNumber <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ نامعتبر است' },
          { status: 400 }
        )
      }

      // ── ۳. ساخت رکورد با SQL مستقیم ──────────────────────
      const paymentId = randomUUID()
      const description = `به‌روزرسانی سیستم — پلن ${planName}${discountPercent > 0 ? ` (${discountPercent}% تخفیف)` : ''}`

      await db.client.$executeRaw`
        INSERT INTO "OnlinePayments" 
          (id, "tenantId", amount, "gatewayType", status, description, "createdAt", "updatedAt")
        VALUES 
          (${paymentId}, ${tenantId}, ${amountNumber}, 'zarinpal', 'pending', ${description}, NOW(), NOW())
      `

      console.log('[CreatePayment] ✅ Payment created (raw SQL):', paymentId)

      // ── ۴. API جدید زرین‌پال (v4) ────────────────────────
      const baseUrl = sandboxMode
        ? 'https://sandbox.zarinpal.com'
        : 'https://payment.zarinpal.com'

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const callbackUrl = `${appUrl}/api/payments/verify-update-payment?paymentId=${paymentId}`

      console.log('[CreatePayment] 🔄 Calling ZarinPal v4:', {
        merchantId: merchantId.substring(0, 8) + '...',
        amount: amountNumber,
        callbackUrl,
        sandbox: sandboxMode,
      })

      const zarinpalRes = await fetch(`${baseUrl}/pg/v4/payment/request.json`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: amountNumber,
          currency: 'IRR',
          description: `به‌روزرسانی سیستم — ${planName}`,
          callback_url: callbackUrl,
          metadata: {
            plan_name: planName,
            tenant_id: tenantId,
            discount_percent: discountPercent || 0,
          },
        }),
      })

      if (!zarinpalRes.ok) {
        const errorText = await zarinpalRes.text()
        console.error('[CreatePayment] ❌ ZarinPal HTTP error:', zarinpalRes.status, errorText)
        return NextResponse.json(
          { success: false, error: `خطا در ارتباط با درگاه پرداخت (کد ${zarinpalRes.status})` },
          { status: 500 }
        )
      }

      let zarinpalData: any
      try {
        zarinpalData = await zarinpalRes.json()
      } catch (parseErr) {
        console.error('[CreatePayment] ❌ JSON parse error:', parseErr)
        return NextResponse.json(
          { success: false, error: 'پاسخ نامعتبر از درگاه پرداخت' },
          { status: 500 }
        )
      }

      console.log('[CreatePayment] 📦 ZarinPal v4 response:', JSON.stringify(zarinpalData, null, 2))

      // ★ بررسی خطاها
      if (zarinpalData?.errors && Object.keys(zarinpalData.errors).length > 0) {
        console.error('[CreatePayment] ❌ ZarinPal errors:', zarinpalData.errors)
        const errorMessage = zarinpalData.errors?.reason || 'خطای ناشناخته در درگاه پرداخت'
        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 500 }
        )
      }

      // ★ بررسی موفقیت
      if (zarinpalData?.data?.code !== 100) {
        console.error('[CreatePayment] ❌ ZarinPal error code:', zarinpalData?.data?.code)
        return NextResponse.json(
          { success: false, error: zarinpalData?.data?.message || 'خطا در ایجاد تراکنش' },
          { status: 500 }
        )
      }

      const authority = zarinpalData.data.authority

      // ── ۵. ذخیره authority با SQL مستقیم ──────────────────
      await db.client.$executeRaw`
        UPDATE "OnlinePayments" 
        SET authority = ${authority} 
        WHERE id = ${paymentId}
      `

      // ── ۶. ساخت URL پرداخت (v4) ─────────────────────────
      const paymentDomain = sandboxMode
        ? 'https://sandbox.zarinpal.com'
        : 'https://payment.zarinpal.com'
      const paymentUrl = `${paymentDomain}/pg/StartPay/${authority}`

      console.log('[CreatePayment] 🎉 Payment URL ready:', paymentUrl)

      return NextResponse.json({
        success: true,
        data: {
          paymentId,
          authority,
          paymentUrl,
          amount: amountNumber,
        },
      })
    } catch (error: any) {
      console.error('[CreatePayment] 💥 Unexpected error:', error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطای سرور' },
        { status: 500 }
      )
    }
  }
)