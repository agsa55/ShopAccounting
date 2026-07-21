// ============================================================================
// src/app/api/moidian/setup/route.ts — نسخه نهایی (بدون اعتبارسنجی سختگیرانه)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { saveMoidianSettings, deleteMoidianSettings, testMoidianConnection, getMoidianSettings } from '@/lib/moidian'

// ═══════════════════════════════════════════════════════════════
//  POST /api/moidian/setup — ذخیره credentials مودیان
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMoidianIntegration) {
      return NextResponse.json(
        { success: false, error: 'اتصال سامانه مودیان در پلن فعلی شما در دسترس نیست' },
        { status: 403 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه پیکربندی مودیان را دارند' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { fiscalId, economicCode, clientId, clientSecret, privateKey, environment, autoSubmit, testConnection } = body

    // ★ اعتبارسنجی اولیه
    if (!fiscalId || !/^\d{11}$/.test(fiscalId)) {
      return NextResponse.json({ success: false, error: 'شناسه مالیاتی باید ۱۱ رقم باشد' }, { status: 400 })
    }
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'شناسه کلاینت الزامی است' }, { status: 400 })
    }
    if (!clientSecret) {
      return NextResponse.json({ success: false, error: 'رمز کلاینت الزامی است' }, { status: 400 })
    }

    // ★★★ فقط طول را چک می‌کنیم — اعتبارسنجی واقعی هنگام استفاده از کلید انجام می‌شود
    if (!privateKey || privateKey.trim().length < 50) {
      return NextResponse.json({
        success: false,
        error: `کلید خصوصی خیلی کوتاه است (طول: ${privateKey?.length || 0}). لطفاً کل کامل PEM را کپی کنید.`
      }, { status: 400 })
    }

    if (!['sandbox', 'production'].includes(environment)) {
      return NextResponse.json({ success: false, error: 'محیط باید sandbox یا production باشد' }, { status: 400 })
    }

    // ★ ذخیره تنظیمات
    const result = await saveMoidianSettings(tenant.tenantId, {
      fiscalId,
      economicCode,
      clientId,
      clientSecret,
      privateKey,
      environment,
      autoSubmit: autoSubmit ?? true,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    // ★ در صورت درخواست، تست اتصال
    let testResult = null
    if (testConnection) {
      testResult = await testMoidianConnection(tenant.tenantId)
    }

    return NextResponse.json({
      success: true,
      data: await getMoidianSettings(tenant.tenantId),
      testResult,
      message: 'تنظیمات مودیان با موفقیت ذخیره شد',
    })
  } catch (error: any) {
    console.error('[Moidian Setup POST] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ذخیره تنظیمات' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  GET /api/moidian/setup — دریافت تنظیمات (بدون credentials)
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMoidianIntegration) {
      return NextResponse.json(
        { success: false, error: 'اتصال سامانه مودیان در پلن فعلی شما در دسترس نیست' },
        { status: 403 }
      )
    }

    const settings = await getMoidianSettings(tenant.tenantId)
    return NextResponse.json({ success: true, data: settings })
  } catch (error: any) {
    console.error('[Moidian Setup GET] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در دریافت تنظیمات' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/moidian/setup — حذف تنظیمات مودیان
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه حذف تنظیمات مودیان را دارند' },
        { status: 403 }
      )
    }

    const result = await deleteMoidianSettings(tenant.tenantId)
    if (!result.success) {
      return NextResponse.json({ success: false, error: 'خطا در حذف تنظیمات' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'تنظیمات مودیان حذف شد' })
  } catch (error: any) {
    console.error('[Moidian Setup DELETE] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در حذف تنظیمات' }, { status: 500 })
  }
})
