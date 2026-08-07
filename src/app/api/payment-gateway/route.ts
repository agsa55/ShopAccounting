// src/app/api/payment-gateway/route.ts — v8.8 ★★★
// ============================================================================
// مدیریت درگاه پرداخت اختصاصی هر فروشگاه
// ----------------------------------------------------------------------------
// ★★★ v8.8 تغییرات:
//   ★ GET: برگرداندن همه درگاه‌های tenant (آرایه) به جای فقط یکی
//   ★ POST: پشتیبانی از upsert بر اساس type (zarinpal و idpay مستقل)
//   ★ DELETE: غیرفعال‌سازی بر اساس type (نه همه درگاه‌ها)
//   ★ پشتیبانی از callbackUrl از سمت client
//   ★ فقط یکی از درگاه‌ها می‌تواند فعال باشد (به‌روزرسانی خودکار)
//
// ★★★ v8.7 (حفظ شد):
//   - پشتیبانی از zarinpal و idpay
//   - Mask کردن apiKey برای امنیت
//   - اعتبارسنجی شبا
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/payment-gateway — دریافت همه درگاه‌های فروشگاه
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    console.log('[PaymentGateway GET] Loading gateways for tenant:', tenantId)

    // ★★★ v8.8: برگرداندن همه درگاه‌ها (نه فقط آخرین)
    const gateways = await tenantDb.paymentGateway.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    })

    console.log('[PaymentGateway GET] Found gateways:', gateways.length)
    console.log('[PaymentGateway GET] Gateway details:', gateways.map((g: any) => ({
      id: g.id,
      type: g.type,
      merchantId: g.merchantId?.substring(0, 8) + '...',
      hasApiKey: !!g.apiKey,
      isActive: g.isActive,
      sandbox: g.sandbox,
    })))

    // ★ Mask کردن apiKey برای امنیت
    const maskedGateways = gateways.map((gw: any) => ({
      id: gw.id,
      name: gw.name,
      type: gw.type,
      merchantId: gw.merchantId,
      apiKey: gw.apiKey ? `••••••••${gw.apiKey.slice(-4)}` : null,
      apiKeySet: !!gw.apiKey,
      terminalCode: gw.terminalCode,
      callbackUrl: gw.callbackUrl,
      bankIban: gw.bankIban,
      bankName: gw.bankName,
      isActive: gw.isActive,
      sandbox: gw.sandbox,
      createdAt: gw.createdAt,
      updatedAt: gw.updatedAt,
    }))

    return NextResponse.json({
      success: true,
      data: maskedGateways,  // ★★★ v8.8: آرایه به جای یک رکورد
      message: gateways.length === 0 ? 'هنوز درگاه پرداختی تنظیم نشده است' : undefined,
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
      callbackUrl,  // ★★★ v8.8: از سمت client دریافت می‌شود
    } = body

    console.log('[PaymentGateway POST] Request:', {
      tenantId,
      type,
      merchantId: merchantId?.substring(0, 8) + '...',
      hasApiKey: !!apiKey,
      apiKeyMasked: apiKey?.startsWith('••••'),
      sandbox,
      isActive,
      callbackUrl,
    })

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
    if (type === 'idpay' && (!apiKey || apiKey.startsWith('••••') || apiKey.trim().length < 8)) {
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
    
    // ★★★ v8.8: اولویت با callbackUrl از client، سپس env
    const finalCallbackUrl = callbackUrl || 
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/online/verify`

    // ★★★ v8.8: پیدا کردن درگاه موجود بر اساس type (نه tenantId تنها)
    const existing = await tenantDb.paymentGateway.findFirst({
      where: { tenantId, type },
    })

    let gateway
    if (existing) {
      // ★ به‌روزرسانی
      const updateData: any = {
        name: gatewayName,
        merchantId: merchantId.trim(),
        terminalCode: terminalCode?.trim() || null,
        callbackUrl: finalCallbackUrl,
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

      console.log('[PaymentGateway POST] Updated gateway:', gateway.id)
    } else {
      // ★ ایجاد جدید
      gateway = await tenantDb.paymentGateway.create({
        data: {
          tenantId,
          type,
          name: gatewayName,
          merchantId: merchantId.trim(),
          apiKey: apiKey && !apiKey.startsWith('••••') ? apiKey.trim() : null,
          terminalCode: terminalCode?.trim() || null,
          callbackUrl: finalCallbackUrl,
          bankIban: bankIban ? bankIban.replace(/\s/g, '').toUpperCase() : null,
          bankName: bankName?.trim() || null,
          sandbox: !!sandbox,
          isActive: isActive !== false,
        },
      })

      console.log('[PaymentGateway POST] Created new gateway:', gateway.id)
    }

    // ★★★ v8.8: اگر این درگاه فعال شد، بقیه درگاه‌های tenant را غیرفعال کن
    if (isActive) {
      await tenantDb.paymentGateway.updateMany({
        where: { 
          tenantId, 
          isActive: true,
          id: { not: gateway.id },
        },
        data: { isActive: false },
      })
      console.log('[PaymentGateway POST] Deactivated other gateways')
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
        callbackUrl: gateway.callbackUrl,
      },
      message: `درگاه پرداخت ${gatewayName} با موفقیت ${existing ? 'به‌روزرسانی' : 'ایجاد'} شد`,
    })
  } catch (error: any) {
    console.error('[PaymentGateway POST] Error:', error?.message || error)
    console.error('[PaymentGateway POST] Stack:', error?.stack)
    return NextResponse.json(
      { success: false, error: 'خطا در ذخیره تنظیمات درگاه پرداخت' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/payment-gateway — غیرفعال‌سازی درگاه
//  Query param: ?type=zarinpal یا ?type=idpay
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')

    console.log('[PaymentGateway DELETE] Request:', { tenantId, type })

    if (!type || !['zarinpal', 'idpay'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'نوع درگاه الزامی است (zarinpal یا idpay)' },
        { status: 400 }
      )
    }

    // ★★★ v8.8: پیدا کردن درگاه بر اساس type
    const existing = await tenantDb.paymentGateway.findFirst({
      where: { tenantId, type },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'درگاهی برای غیرفعال‌سازی یافت نشد' },
        { status: 404 }
      )
    }

    // ★ غیرفعال‌سازی
    await tenantDb.paymentGateway.update({
      where: { id: existing.id },
      data: { isActive: false },
    })

    console.log('[PaymentGateway DELETE] Deactivated gateway:', existing.id)

    return NextResponse.json({
      success: true,
      message: `درگاه ${type === 'zarinpal' ? 'زرین‌پال' : 'ای‌دی‌پی'} غیرفعال شد`,
    })
  } catch (error: any) {
    console.error('[PaymentGateway DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در غیرفعال‌سازی درگاه' },
      { status: 500 }
    )
  }
})