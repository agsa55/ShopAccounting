// ============================================================================
// src/app/api/plan-limits/upgrade/route.ts
// ShopAccounting v2 — Plan Upgrade API (+ Auto Migration)
// ============================================================================
// ★ POST: ارتقای طرح اشتراک
// ★ اگر از رایگان به پولی ارتقا → needsMigration = true
// ★ فرانتند بعد از ارتقا، خودکار مهاجرت رو انجام میده
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { PLAN_LIMITS, parseLegacyPlanName } from '@/lib/plan-limits'

// ═══════════════════════════════════════════════════════════════
//  POST /api/plan-limits/upgrade — ارتقای طرح
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('subscription')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const body = await req.json()
    const { newTierId, billingCycle } = body

    if (!newTierId || !billingCycle) {
      return NextResponse.json(
        { success: false, error: 'شناسه طرح و دوره صورت‌حساب الزامی است' },
        { status: 400 }
      )
    }

    // ★ فقط مدیران
    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه ارتقای طرح را دارند' },
        { status: 403 }
      )
    }

    const tenantId = tenant.tenantId

    // دریافت اطلاعات tenant فعلی
    const tenantRecord = await db.master.tenant.findUnique({
      where: { id: tenantId },
      include: { planTier: true },
    })

    if (!tenantRecord) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      )
    }

    // دریافت اطلاعات پلن جدید
    const newTier = await db.master.planTier.findUnique({
      where: { id: Number(newTierId) },
      include: { prices: true },
    })

    if (!newTier) {
      return NextResponse.json(
        { success: false, error: 'طرح انتخاب شده یافت نشد' },
        { status: 404 }
      )
    }

    // بررسی: آیا ارتقا از رایگان به پولی؟
    const oldTierName = tenantRecord.planTier?.name || 'free'
    const wasFree = oldTierName === 'free'
    const nowPaid = newTier.name !== 'free'

    // دریافت قیمت
    const price = newTier.prices?.find((p: any) => p.billingCycle === billingCycle)
    if (!price) {
      return NextResponse.json(
        { success: false, error: 'دوره صورت‌حساب نامعتبر است' },
        { status: 400 }
      )
    }

    // محاسبه تاریخ انقضا
    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + price.durationDays)

    // ═══════════════════════════════════════════════════════════
    //  بروزرسانی اشتراک در دیتابیس
    // ═══════════════════════════════════════════════════════════

    // بروزرسانی فیلدهای Tenant
    await db.master.tenant.update({
      where: { id: tenantId },
      data: {
        planTierId: newTier.id,
        planName: newTier.name,
        isTrial: newTier.isTrial,
        trialEndsAt: newTier.isTrial ? expiresAt : null,
      },
    })

    // ایجاد یا بروزرسانی اشتراک
    const existingSub = await db.master.subscription.findFirst({
      where: { tenantId, isActive: true },
    })

    if (existingSub) {
      await db.master.subscription.update({
        where: { id: existingSub.id },
        data: {
          planTierId: newTier.id,
          billingCycle,
          expiresAt,
          isActive: true,
          startedAt: now,
        },
      })
    } else {
      await db.master.subscription.create({
        data: {
          tenantId,
          planTierId: newTier.id,
          billingCycle,
          expiresAt,
          isActive: true,
          startedAt: now,
        },
      })
    }

    // ایجاد رکورد پرداخت
    await db.master.subscriptionPayment.create({
      data: {
        tenantId,
        amount: price.price,
        billingCycle,
        planTierId: newTier.id,
        status: 'completed', // در نسخه واقعی، باید از درگاه پرداخت تأیید شود
        paidAt: now,
      },
    })

    // ★ آیا مهاجرت نیاز است؟ (از رایگان به پولی)
    const needsMigration = wasFree && nowPaid && !tenantRecord.isIsolated

    return NextResponse.json({
      success: true,
      message: 'طرح اشتراک با موفقیت ارتقا یافت',
      data: {
        newTierName: newTier.name,
        newTierNameFa: newTier.nameFa,
        billingCycle,
        expiresAt: expiresAt.toISOString(),
        needsMigration,
      },
    })
  } catch (error: any) {
    console.error('[Upgrade POST] Error:', error)
    return NextResponse.json(
      { success: false, error: `خطا در ارتقای طرح: ${error.message}` },
      { status: 500 }
    )
  }
})
