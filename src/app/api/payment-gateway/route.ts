// src/app/api/payment-gateway/route.ts — v8.7
// ============================================================================
// مدیریت درگاه پرداخت اختصاصی هر فروشگاه
// ----------------------------------------------------------------------------
// هر فروشگاه می‌تواند درگاه پرداخت خودش را تنظیم کند:
//   - زرین‌پال (zarinpal): نیاز به merchantId
//   - ای‌دی‌پی (idpay): نیاز به merchantId + apiKey (x-api-key)
//
// ★ این endpoint جایگزین درگاه اشتراکی تسهیم فردا شد (سرویس متوقف شده)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/payment-gateway — دریافت تنظیمات درگاه فعلی فروشگاه
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const gateway = await tenantDb.paymentGateway.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    })

    if (!gateway) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'هنوز درگاه پرداختی تنظیم نشده است',
      })
    }

    // ★ برای امنیت، apiKey رو mask می‌کنیم (فقط ۴ کاراکتر آخر)
    const maskedApiKey = gateway.apiKey
      ? `••••••••${gateway.apiKey.slice(-4)}`
      : null

    return NextResponse.json({
      success: true,
      data: {
        id: gateway.id,
        name: gateway.name,
        type: gateway.type,                // zarinpal | idpay
        merchantId: gateway.merchantId,
        apiKey: maskedApiKey,
        apiKeySet: !!gateway.apiKey,
        terminalCode: gateway.terminalCode,
        callbackUrl: gateway.callbackUrl,
        bankIban: gateway.bankIban,
        bankName: gateway.bankName,
        isActive: gateway.isActive,
        sandbox: gateway.sandbox,
        createdAt: gateway.createdAt,
        updatedAt: gateway.updatedAt,
      },
    })
  } catch (error: any) {
    console.error('[PaymentGateway GET] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری تنظیمات درگاه پرداخت' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/payment-gateway — ایجاد یا به‌روزرسانی درگاه
//  Body: {
//    type: 'zarinpal' | 'idpay',
//    name?,                  // نام نمایشی (پیش‌فرض: «درگاه زرین‌پال» یا «درگاه ای‌دی‌پی»)
//    merchantId,             // کد مرچنت (الزامی)
//    apiKey?,                // کلید API (الزامی برای idpay, اختیاری برای zarinpal)
//    terminalCode?,          // کد ترمینال (اختیاری)
//    bankIban?,              // شماره شبا برای نمایش
//    bankName?,
//    sandbox?,               // حالت تست (پیش‌فرض: false)
//    isActive?,              // فعال/غیرفعال (پیش‌فرض: true)
//  }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const body = await req.json()
    const {
      type = 'zarinpal',
      name,
      merchantId,
      apiKey,
      terminalCode,
      bankIban,
      bankName,
      sandbox = false,
      isActive = true,
    } = body

    // ★ اعتبارسنجی نوع درگاه
    if (!['zarinpal', 'idpay'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'نوع درگاه نامعتبر است. فقط zarinpal یا idpay پشتیبانی می‌شود' },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی merchantId
    if (!merchantId || typeof merchantId !== 'string' || merchantId.trim().length < 4) {
      return NextResponse.json(
        { success: false, error: 'کد مرچنت (Merchant ID) الزامی است' },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی apiKey برای idpay
    if (type === 'idpay' && (!apiKey || apiKey.trim().length < 8)) {
      return NextResponse.json(
        { success: false, error: 'برای درگاه ای‌دی‌پی، کلید API (X-API-Key) الزامی است' },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی شبا (اگه ارائه شده)
    if (bankIban) {
      const ibanRegex = /^IR\d{24}$/
      if (!ibanRegex.test(bankIban.replace(/\s/g, '').toUpperCase())) {
        return NextResponse.json(
          { success: false, error: 'فرمت شبا نامعتبر است. مثال: IR820570012880011411111111' },
          { status: 400 }
        )
      }
    }

    const gatewayName = name || (type === 'zarinpal' ? 'درگاه زرین‌پال' : 'درگاه ای‌دی‌پی')
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/payments/online/verify`

    // ★ پیدا کردن درگاه موجود
    const existing = await tenantDb.paymentGateway.findFirst({
      where: { tenantId },
    })

    let gateway
    if (existing) {
      // ★ به‌روزرسانی
      // اگر apiKey فرستاده نشده (یا mask شده بود)، مقدار قبلی رو نگه دار
      const updateData: any = {
        type,
        name: gatewayName,
        merchantId: merchantId.trim(),
        terminalCode: terminalCode?.trim() || null,
        callbackUrl,
        bankIban: bankIban ? bankIban.replace(/\s/g, '').toUpperCase() : null,
        bankName: bankName?.trim() || null,
        sandbox: !!sandbox,
        isActive: isActive !== false,
      }

      // ★ فقط اگه apiKey واقعی فرستاده شده (نه mask شده) آپدیت کن
      if (apiKey && !apiKey.startsWith('••••')) {
        updateData.apiKey = apiKey.trim()
      }

      gateway = await tenantDb.paymentGateway.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      // ★ ایجاد جدید
      gateway = await tenantDb.paymentGateway.create({
        data: {
          tenantId,
          type,
          name: gatewayName,
          merchantId: merchantId.trim(),
          apiKey: apiKey?.trim() || null,
          terminalCode: terminalCode?.trim() || null,
          callbackUrl,
          bankIban: bankIban ? bankIban.replace(/\s/g, '').toUpperCase() : null,
          bankName: bankName?.trim() || null,
          sandbox: !!sandbox,
          isActive: isActive !== false,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: gateway.id,
        type: gateway.type,
        name: gateway.name,
        merchantId: gateway.merchantId,
        apiKeySet: !!gateway.apiKey,
        isActive: gateway.isActive,
        sandbox: gateway.sandbox,
      },
      message: `درگاه پرداخت ${gatewayName} با موفقیت ${existing ? 'به‌روزرسانی' : 'ایجاد'} شد`,
    })
  } catch (error: any) {
    console.error('[PaymentGateway POST] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ذخیره تنظیمات درگاه پرداخت' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/payment-gateway — غیرفعال‌سازی درگاه
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const existing = await tenantDb.paymentGateway.findFirst({
      where: { tenantId },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'درگاهی برای حذف یافت نشد' },
        { status: 404 }
      )
    }

    // ★ به‌جای حذف، غیرفعال می‌کنیم (تاریخچه حفظ شود)
    await tenantDb.paymentGateway.update({
      where: { id: existing.id },
      data: { isActive: false },
    })

    return NextResponse.json({
      success: true,
      message: 'درگاه پرداخت غیرفعال شد',
    })
  } catch (error: any) {
    console.error('[PaymentGateway DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در غیرفعال‌سازی درگاه' },
      { status: 500 }
    )
  }
})
