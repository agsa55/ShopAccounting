// ============================================================================
// src/app/api/payments/online/create/route.ts — v9.0 ★★★
// ShopAccounting — ایجاد پرداخت آنلاین با درگاه اختصاصی فروشگاه
// ============================================================================
// ★★★ v9.0: یکپارچه‌سازی کامل پرداخت آنلاین (جایگزین endpoint تسهیم)
//   ✓ استفاده از درگاه اختصاصی فروشگاه (زرین‌پال یا ای‌دی‌پی)
//   ✓ پشتیبانی کامل از پرداخت قسط‌به‌قسط (installmentId)
//   ✓ اعتبارسنجی کاربر پورتال (امنیت — مشتری فقط فاکتور خودش را پرداخت کند)
//   ✓ سازگار با verify (ذخیره gatewayId)
//   ✓ حذف کامل وابستگی به تسهیم کنسل‌شده
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  console.log('[Online Payment Create v9.0] Handler started, tenantId:', tenant?.tenantId)
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const body = await req.json()
    const { invoiceId, installmentId, amount, description } = body

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فاکتور الزامی است' },
        { status: 400 }
      )
    }

    // ─── ۱. پیدا کردن فاکتور ─────────────────────────────────────
    const invoice: any = await tenantDb.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'فاکتور یافت نشد' },
        { status: 404 }
      )
    }

    // ─── ۲. اعتبارسنجی کاربر پورتال (امنیت) ─────────────────────
    // ★ مشتری فقط می‌تواند فاکتور خودش را پرداخت کند
    if (tenant.isPortalUser) {
      const portalCustomerId = tenant.customerId
      if (!portalCustomerId) {
        return NextResponse.json(
          { success: false, error: 'شناسه مشتری در توکن پورتال یافت نشد', code: 'NO_CUSTOMER_ID' },
          { status: 403 }
        )
      }
      if (invoice.customerId !== portalCustomerId) {
        console.warn('[Online Payment Create] Portal user tried to pay another customer invoice:', {
          portalCustomerId,
          invoiceCustomerId: invoice.customerId,
          invoiceId,
        })
        return NextResponse.json(
          { success: false, error: 'این فاکتور متعلق به شما نیست', code: 'NOT_YOUR_INVOICE' },
          { status: 403 }
        )
      }
      if (tenant.user?.isBlacklisted) {
        return NextResponse.json(
          { success: false, error: 'حساب شما مسدود شده است. با فروشگاه تماس بگیرید.', code: 'CUSTOMER_BLACKLISTED' },
          { status: 403 }
        )
      }
    }

    // ─── ۳. محاسبه مبلغ (قسط خاص یا کل باقی‌مانده) ───────────────
    let paymentAmount = 0
    let paymentDescription = description || `پرداخت فاکتور ${invoice.number}`
    let installmentSchedule: any = null

    if (installmentId) {
      // ★ پرداخت یک قسط خاص
      installmentSchedule = await tenantDb.installmentSchedule.findFirst({
        where: {
          id: installmentId,
          tenantId,
          plan: { invoiceId },
        },
        include: {
          plan: { select: { id: true, installmentAmount: true } },
        },
      })

      if (!installmentSchedule) {
        return NextResponse.json(
          { success: false, error: 'قسط یافت نشد یا به این فاکتور تعلق ندارد' },
          { status: 404 }
        )
      }

      const schedStatus = (installmentSchedule.status || '').toLowerCase()
      if (schedStatus === 'paid' || schedStatus === 'completed') {
        return NextResponse.json(
          { success: false, error: 'این قسط قبلاً پرداخت شده است' },
          { status: 400 }
        )
      }

      const fullAmount = Number(installmentSchedule.amount) || 0
      const alreadyPaid = Number(installmentSchedule.paidAmount) || 0
      paymentAmount = fullAmount - alreadyPaid

      if (paymentAmount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ باقی‌مانده این قسط صفر است' },
          { status: 400 }
        )
      }

      paymentDescription = `پرداخت قسط ${installmentSchedule.installmentNumber} از فاکتور ${invoice.number}`

      console.log('[Online Payment Create] Installment payment:', {
        installmentId,
        installmentNumber: installmentSchedule.installmentNumber,
        fullAmount,
        alreadyPaid,
        amountToPay: paymentAmount,
      })
    } else {
      // ★ پرداخت کل باقی‌مانده فاکتور
      paymentAmount = amount || Number(invoice.remainingAmount) || Number(invoice.totalAmount) || 0
      if (paymentAmount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ پرداخت باید بزرگتر از صفر باشد' },
          { status: 400 }
        )
      }
    }

    // ─── ۴. پیدا کردن درگاه فعال فروشگاه (اختصاصی) ──────────────
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

    // ─── ۵. بررسی پشتیبانی فیلد installmentId (runtime detection) ──
    const isInstallmentIdSupported = (() => {
      try {
        const fieldsRaw = (tenantDb.onlinePayment as any).fields as unknown
        const fields = (fieldsRaw || {}) as Record<string, unknown>
        return 'installmentId' in fields
      } catch {
        return false
      }
    })()

    // ─── ۶. ایجاد رکورد OnlinePayment ────────────────────────────
    const paymentData: any = {
      tenantId,
      invoiceId,
      customerId: invoice.customerId || null,
      amount: paymentAmount,
      status: 'pending',
      gatewayType: gateway.type,
      gatewayId: gateway.id,   // ★ کلید سازگاری با verify
      description: paymentDescription,
    }

    if (installmentId && isInstallmentIdSupported) {
      paymentData.installmentId = installmentId
    } else if (installmentId && !isInstallmentIdSupported) {
      console.warn('[Online Payment Create] installmentId field not in Prisma Client. Run: npx prisma generate')
      paymentData.description = `${paymentData.description} [installmentId: ${installmentId}]`
    }

    const onlinePayment = await tenantDb.onlinePayment.create({
      data: paymentData,
    })

    // ─── ۷. ساخت callback URL (تمیز — بدون placeholder) ──────────
    const callbackUrl = gateway.callbackUrl ||
      `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/payments/online/verify`
    const callbackWithParams = `${callbackUrl}?tenantId=${tenantId}&paymentId=${onlinePayment.id}`

    // ─── ۸. درخواست به درگاه (زرین‌پال یا ای‌دی‌پی) ──────────────
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
          amount: Math.round(paymentAmount),
          description: paymentDescription,
          callback_url: callbackWithParams,
        }),
      })

      const zarinpalData = await zarinpalRes.json()

      if (!zarinpalData?.data || zarinpalData?.data?.code !== 100) {
        console.error('[Online Payment Create] Zarinpal request failed:', zarinpalData)
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
      gatewayUrl = gateway.sandbox
        ? `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
        : `https://www.zarinpal.com/pg/StartPay/${authority}`
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
          desc: paymentDescription,
          callback: callbackWithParams,
        }),
      })

      const idpayData = await idpayRes.json()

      if (!idpayData?.link || idpayData?.error_code) {
        console.error('[Online Payment Create] IDPay request failed:', idpayData)
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

    // ─── ۹. به‌روزرسانی رکورد با authority و gatewayUrl ──────────
    await tenantDb.onlinePayment.update({
      where: { id: onlinePayment.id },
      data: {
        authority,
        gatewayUrl,
      },
    })

    console.log('[Online Payment Create v9.0] Payment URL generated:', gatewayUrl)

    return NextResponse.json({
      success: true,
      data: {
        paymentId: onlinePayment.id,
        paymentUrl: gatewayUrl,
        gatewayUrl,
        gatewayType: gateway.type,
        amount: paymentAmount,
        installmentId: installmentId || null,
      },
      message: installmentId
        ? `کاربر به درگاه پرداخت برای قسط ${installmentSchedule?.installmentNumber || ''} هدایت می‌شود`
        : 'کاربر به درگاه پرداخت هدایت می‌شود',
    })
  } catch (error: any) {
    console.error('[Online Payment Create] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ایجاد پرداخت آنلاین' },
      { status: 500 }
    )
  }
})