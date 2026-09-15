// ============================================================================
// src/app/api/payments/online/create/route.ts — v9.2 ★★★
// ShopAccounting — ایجاد پرداخت آنلاین با درگاه اختصاصی فروشگاه
// ============================================================================
// ★★★ v9.2 تغییرات:
//   ★ اضافه کردن portalToken به callback URL
//   ★ redirect مستقیم به پورتال مشتری بعد از پرداخت
// ★★★ v9.1 تغییرات:
//   ★ پشتیبانی کامل از Portal User (مشتری)
//   ★ احراز هویت دوگانه: storeUser (با JWT) یا portalUser (با portalToken)
//   ★ مشتری فقط فاکتور خودش را پرداخت کند (امنیت)
//   ★ پشتیبانی کامل از پرداخت قسط‌به‌قسط (installmentId)
//   ★ مبلغ زرین‌پال به تومان (مطابق با API)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════════
// ★ تابع احراز هویت دوگانه (StoreUser یا PortalUser)
// ════════════════════════════════════════════════════════════════════════════
async function resolveUserAndTenant(req: NextRequest): Promise<{
  success: boolean
  tenantId?: string
  customerId?: string
  isPortalUser?: boolean
  isStoreUser?: boolean
  user?: any
  tenantDb?: any
  portalToken?: string | null
  error?: string
  statusCode?: number
}> {
  // ─── اولویت ۱: Authorization header ────────────────────────
  const authHeader = req.headers.get('authorization')
  let token: string | null = null
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '')
  } else {
    // ─── اولویت ۲: portal_token از کوکی ──────────────────────
    token = req.cookies.get('portal_token')?.value || null
  }

  if (!token) {
    return { success: false, error: 'احراز هویت نشده', statusCode: 401 }
  }

  // ─── تلاش ۱: جستجو به عنوان portalToken در دیتابیس ─────────
  const customer = await db.client.customer.findFirst({
    where: { portalToken: token, isBlacklisted: false },
    select: { 
      id: true, 
      tenantId: true, 
      firstName: true, 
      lastName: true,
      mobile: true,
    },
  })

  if (customer) {
    console.log('[Payment Create] ✅ Portal user found:', customer.id)
    return {
      success: true,
      tenantId: customer.tenantId,
      customerId: customer.id,
      isPortalUser: true,
      isStoreUser: false,
      user: customer,
      tenantDb: db.client,
      portalToken: token,  // ★★★ v9.2: برگرداندن portalToken
    }
  }

  // ─── تلاش ۲: بررسی به عنوان JWT (StoreUser) ─────────────────
  try {
    const jwt = require('jsonwebtoken')
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET
    const decoded = jwt.verify(token, secret)
    
    if (decoded && decoded.tenantId) {
      console.log('[Payment Create] ✅ StoreUser found:', decoded.userId)
      return {
        success: true,
        tenantId: decoded.tenantId,
        customerId: undefined,
        isPortalUser: false,
        isStoreUser: true,
        user: decoded,
        tenantDb: db.client,
        portalToken: null,
      }
    }
  } catch (err: any) {
    console.warn('[Payment Create] ⚠️ JWT verification failed:', err?.message)
  }

  return { success: false, error: 'توکن نامعتبر', statusCode: 401 }
}

// ════════════════════════════════════════════════════════════════════════════
// ★ POST /api/payments/online/create
// ════════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    // ─── احراز هویت ──────────────────────────────────────────
    const auth = await resolveUserAndTenant(req)
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.statusCode || 401 }
      )
    }

    const { tenantId, customerId, isPortalUser, tenantDb, portalToken } = auth

    console.log('[Online Payment Create v9.2] Handler started:', {
      tenantId,
      customerId,
      isPortalUser,
      hasPortalToken: !!portalToken,
    })

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
    if (isPortalUser) {
      if (!customerId) {
        return NextResponse.json(
          { success: false, error: 'شناسه مشتری یافت نشد', code: 'NO_CUSTOMER_ID' },
          { status: 403 }
        )
      }
      if (invoice.customerId !== customerId) {
        console.warn('[Online Payment Create] ❌ Portal user tried to pay another customer invoice:', {
          customerId,
          invoiceCustomerId: invoice.customerId,
          invoiceId,
        })
        return NextResponse.json(
          { success: false, error: 'این فاکتور متعلق به شما نیست', code: 'NOT_YOUR_INVOICE' },
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

    // ─── ۴. پیدا کردن درگاه فعال فروشگاه ─────────────────────────
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

    console.log('[Online Payment Create] ✅ Gateway found:', gateway.type, 'sandbox:', gateway.sandbox)

    // ─── ۵. بررسی پشتیبانی فیلد installmentId ────────────────────
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
      gatewayId: gateway.id,
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

    console.log('[Online Payment Create] ✅ OnlinePayment record created:', onlinePayment.id)

    // ─── ۷. ساخت callback URL ────────────────────────────────────
    // ★★★ v9.2: اضافه کردن portalToken به callback URL
    const callbackUrl = gateway.callbackUrl ||
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/online/verify`
    
    let callbackWithParams = `${callbackUrl}?tenantId=${tenantId}&paymentId=${onlinePayment.id}`
    
    // ★ اگر portalUser است، portalToken را به callback اضافه کن
    if (isPortalUser && portalToken) {
      callbackWithParams += `&portalToken=${portalToken}`
      console.log('[Online Payment Create] 🔑 Added portalToken to callback URL')
    }

    // ─── ۸. درخواست به درگاه (زرین‌پال یا ای‌دی‌پی) ──────────────
    let gatewayUrl: string | null = null
    let authority: string | null = null

    if (gateway.type === 'zarinpal') {
      // ═══════════════════════════════════════════════════════
      // زرین‌پال
      // ═══════════════════════════════════════════════════════
      const apiUrl = gateway.sandbox
        ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
        : 'https://api.zarinpal.com/pg/v4/payment/request.json'

      // تبدیل مبلغ به تومان (زرین‌پال تومان می‌پذیرد)
      const amountInToman = Math.round(paymentAmount / 10)

      console.log('[Online Payment Create] 🔄 Calling Zarinpal API:', {
        url: apiUrl,
        amount: amountInToman,
        sandbox: gateway.sandbox,
      })

      const zarinpalRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: gateway.merchantId,
          amount: amountInToman,
          description: paymentDescription,
          callback_url: callbackWithParams,
        }),
      })

      const zarinpalData = await zarinpalRes.json()
      console.log('[Online Payment Create] 📥 Zarinpal response:', zarinpalData)

      if (!zarinpalData?.data || zarinpalData?.data?.code !== 100) {
        console.error('[Online Payment Create] ❌ Zarinpal request failed:', zarinpalData)
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
      // ═══════════════════════════════════════════════════════
      // ای‌دی‌پی
      // ═══════════════════════════════════════════════════════
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

      // ای‌دی‌پی ریال می‌پذیرد
      const amountInRial = Math.round(paymentAmount)

      console.log('[Online Payment Create] 🔄 Calling IDPay API:', {
        url: apiUrl,
        amount: amountInRial,
        sandbox: gateway.sandbox,
      })

      const idpayRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': gateway.apiKey,
          'X-SANDBOX': gateway.sandbox ? '1' : '0',
        },
        body: JSON.stringify({
          order_id: onlinePayment.id,
          amount: amountInRial,
          desc: paymentDescription,
          callback: callbackWithParams,
        }),
      })

      const idpayData = await idpayRes.json()
      console.log('[Online Payment Create] 📥 IDPay response:', idpayData)

      if (!idpayData?.link || idpayData?.error_code) {
        console.error('[Online Payment Create] ❌ IDPay request failed:', idpayData)
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

    console.log('[Online Payment Create v9.2] ✅ Success:', {
      paymentId: onlinePayment.id,
      authority,
      gatewayUrl: gatewayUrl?.substring(0, 50) + '...',
      portalTokenInCallback: isPortalUser && !!portalToken,
    })

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
    console.error('[Online Payment Create] ❌ Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ایجاد پرداخت آنلاین' },
      { status: 500 }
    )
  }
}