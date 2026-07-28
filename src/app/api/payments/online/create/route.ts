// src/app/api/payments/online/create/route.ts — v8.7
// ============================================================================
// ایجاد پرداخت آنلاین با درگاه اختصاصی فروشگاه (زرین‌پال یا ای‌دی‌پی)
// ----------------------------------------------------------------------------
// این endpoint:
//   ۱. درگاه فعال فروشگاه را از PaymentGateway پیدا می‌کند
//   ۲. بر اساس نوع درگاه (zarinpal | idpay) درخواست ایجاد تراکنش می‌دهد
//   ۳. رکورد OnlinePayment ایجاد می‌کند
//   ۴. URL درگاه را برای هدایت کاربر برمی‌گرداند
//
// ★ جایگزین درگاه اشتراکی تسهیم فردا (متوقف شده) شد
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  POST /api/payments/online/create
//  Body: {
//    invoiceId,              // آی‌دی فاکتور
//    amount?,                // مبلغ (پیش‌فرض: remainingAmount فاکتور)
//    description?,           // توضیحات
//  }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const body = await req.json()
    const { invoiceId, amount, description } = body

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فاکتور الزامی است' },
        { status: 400 }
      )
    }

    // ★ پیدا کردن فاکتور
    const invoice: any = await tenantDb.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'فاکتور یافت نشد' },
        { status: 404 }
      )
    }

    const paymentAmount = amount || invoice.remainingAmount || invoice.totalAmount
    if (paymentAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ پرداخت باید بزرگتر از صفر باشد' },
        { status: 400 }
      )
    }

    // ★ پیدا کردن درگاه فعال فروشگاه
    const gateway: any = await tenantDb.paymentGateway.findFirst({
      where: { tenantId, isActive: true },
    })

    if (!gateway) {
      return NextResponse.json(
        {
          success: false,
          error: 'درگاه پرداخت فعال نیست. لطفاً در تنظیمات → درگاه پرداخت، درگاه اختصاصی خود را تنظیم کنید',
          code: 'NO_GATEWAY',
        },
        { status: 400 }
      )
    }

    if (!gateway.merchantId) {
      return NextResponse.json(
        { success: false, error: 'کد مرچنت درگاه تنظیم نشده است' },
        { status: 400 }
      )
    }

    // ★ ایجاد رکورد OnlinePayment
    const onlinePayment = await tenantDb.onlinePayment.create({
      data: {
        tenantId,
        invoiceId,
        customerId: invoice.customerId || null,
        amount: paymentAmount,
        status: 'pending',
        gatewayType: gateway.type,
        gatewayId: gateway.id,
        description: description || `پرداخت آنلاین فاکتور ${invoice.number}`,
      },
    })

    // ★ ساخت callback URL (به‌صورت public — نیاز به توکن نداره چون درگاه برمی‌گرده)
    const callbackUrl = gateway.callbackUrl ||
      `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/payments/online/verify`

    const callbackWithParams = `${callbackUrl}?authority={authority}&status={status}&tenantId=${tenantId}&paymentId=${onlinePayment.id}`

    // ★ بر اساس نوع درگاه، درخواست ایجاد تراکنش
    let gatewayUrl: string | null = null
    let authority: string | null = null

    if (gateway.type === 'zarinpal') {
      // ─── زرین‌پال ─────────────────────────────────────────
      const apiUrl = gateway.sandbox
        ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
        : 'https://api.zarinpal.com/pg/v4/payment/request.json'

      const zarinpalRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: gateway.merchantId,
          amount: Math.round(paymentAmount),  // زرین‌پال ریالی
          description: description || `پرداخت فاکتور ${invoice.number}`,
          callback_url: callbackWithParams,
        }),
      })

      const zarinpalData = await zarinpalRes.json()

      if (!zarinpalData?.data || zarinpalData?.data?.code !== 100) {
        console.error('[Online Payment] Zarinpal request failed:', zarinpalData)
        await tenantDb.onlinePayment.update({
          where: { id: onlinePayment.id },
          data: { status: 'failed' },
        })
        return NextResponse.json(
          {
            success: false,
            error: `خطا در ایجاد تراکنش زرین‌پال: ${zarinpalData?.errors?.message || 'کد نامشخص'}`,
            code: 'GATEWAY_ERROR',
          },
          { status: 400 }
        )
      }

      authority = zarinpalData.data.authority
      const startPayUrl = gateway.sandbox
        ? `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
        : `https://www.zarinpal.com/pg/StartPay/${authority}`

      gatewayUrl = startPayUrl
    } else if (gateway.type === 'idpay') {
      // ─── ای‌دی‌پی ──────────────────────────────────────────
      if (!gateway.apiKey) {
        await tenantDb.onlinePayment.update({
          where: { id: onlinePayment.id },
          data: { status: 'failed' },
        })
        return NextResponse.json(
          { success: false, error: 'کلید API ای‌دی‌پی تنظیم نشده است' },
          { status: 400 }
        )
      }

      const apiUrl = gateway.sandbox
        ? 'https://stg.api.idpay.ir/v1.1/payment'
        : 'https://api.idpay.ir/v1.1/payment'

      const idpayRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': gateway.apiKey,
          'X-SANDBOX': gateway.sandbox ? '1' : '0',
        },
        body: JSON.stringify({
          order_id: onlinePayment.id,
          amount: Math.round(paymentAmount),
          name: undefined,
          phone: undefined,
          mail: undefined,
          desc: description || `پرداخت فاکتور ${invoice.number}`,
          callback: callbackWithParams,
        }),
      })

      const idpayData = await idpayRes.json()

      if (!idpayData?.link || idpayData?.error_code) {
        console.error('[Online Payment] IDPay request failed:', idpayData)
        await tenantDb.onlinePayment.update({
          where: { id: onlinePayment.id },
          data: { status: 'failed' },
        })
        return NextResponse.json(
          {
            success: false,
            error: `خطا در ایجاد تراکنش ای‌دی‌پی: ${idpayData?.error_message || 'کد نامشخص'}`,
            code: 'GATEWAY_ERROR',
          },
          { status: 400 }
        )
      }

      gatewayUrl = idpayData.link
      authority = idpayData.id || null
    } else {
      return NextResponse.json(
        { success: false, error: `نوع درگاه پشتیبانی نمی‌شود: ${gateway.type}` },
        { status: 400 }
      )
    }

    // ★ به‌روزرسانی رکورد با authority و gatewayUrl
    await tenantDb.onlinePayment.update({
      where: { id: onlinePayment.id },
      data: {
        authority,
        gatewayUrl,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        paymentId: onlinePayment.id,
        gatewayUrl,
        gatewayType: gateway.type,
        amount: paymentAmount,
      },
      message: 'کاربر به درگاه پرداخت هدایت می‌شود',
    })
  } catch (error: any) {
    console.error('[Online Payment Create] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ایجاد پرداخت آنلاین' },
      { status: 500 }
    )
  }
})
