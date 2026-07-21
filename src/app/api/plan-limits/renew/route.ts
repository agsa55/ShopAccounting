// ============================================================================
// src/app/api/plan-limits/renew/route.ts — POST (v3.1)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.1: رفع خطای FK در SubscriptionPayments
//   ★ اگه Subscription وجود نداشت، اول ایجادش می‌کنیم
//   ★ سپس Payment رو به اون وصل می‌کنیم
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import type { BillingCycle } from '@/lib/plan-limits'

export const POST = withTenantAndPermission('settings')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const body = await req.json()
    const { billingCycle } = body

    if (!billingCycle) {
      return NextResponse.json(
        { success: false, error: 'دوره صورت‌حساب الزامی است' },
        { status: 400 }
      )
    }

    if (!['monthly', 'annual'].includes(billingCycle)) {
      return NextResponse.json(
        { success: false, error: 'دوره صورت‌حساب نامعتبر است. مقادیر مجاز: monthly, annual' },
        { status: 400 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه تمدید اشتراک را دارند' },
        { status: 403 }
      )
    }

    const tenantId = tenant.tenantId

    // ★ دریافت اطلاعات tenant فعلی
    const tenantRecord = await db.client.tenant.findUnique({
      where: { id: tenantId },
      include: { planTier: { include: { prices: true } } },
    })

    if (!tenantRecord || !tenantRecord.planTier) {
      return NextResponse.json(
        { success: false, error: 'اشتراک فعلی یافت نشد' },
        { status: 404 }
      )
    }

    // ★ دریافت قیمت برای دوره انتخاب‌شده
    const price = tenantRecord.planTier.prices?.find((p: any) => p.billingCycle === billingCycle)
    if (!price) {
      return NextResponse.json(
        { success: false, error: 'دوره صورت‌حساب برای طرح فعلی نامعتبر است' },
        { status: 400 }
      )
    }

    // ★ محاسبه تاریخ انقضای جدید
    const now = new Date()
    const currentExpiry = tenantRecord.expiresAt ? new Date(tenantRecord.expiresAt) : now
    const startDate = currentExpiry > now ? currentExpiry : now
    const newExpiresAt = new Date(startDate)
    newExpiresAt.setDate(newExpiresAt.getDate() + price.durationDays)

    // ★ بروزرسانی tenant
    await db.client.tenant.update({
      where: { id: tenantId },
      data: {
        billingCycle,
        expiresAt: newExpiresAt,
      },
    })

    // ★★★ v3.1: ایجاد یا به‌روزرسانی رکورد Subscription
    let subscriptionId: string = ''

    try {
      // ★ بررسی آیا Subscription فعلی وجود داره
      let existingSub = await db.client.subscriptions.findFirst({
        where: { tenantId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      })

      if (existingSub) {
        // ★ بروزرسانی Subscription فعلی
        await db.client.subscriptions.update({
          where: { id: existingSub.id },
          data: {
            endDate: newExpiresAt,
            status: 'active',
          },
        })
        subscriptionId = existingSub.id
      } else {
        // ★ ایجاد Subscription جدید
        const newSub = await db.client.subscriptions.create({
          data: {
            id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            tenantId,
            planId: tenantRecord.planTierId?.toString() || 'unknown',
            startDate: now,
            endDate: newExpiresAt,
            status: 'active',
            autoRenew: false,
          },
        })
        subscriptionId = newSub.id
      }

      // ★ حالا می‌تونیم Payment رو ایجاد کنیم
      await db.client.subscriptionPayments.create({
        data: {
          id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          subscriptionId,
          tenantId,
          amount: price.price,
          paymentMethod: 'online',
          status: 'completed',
          isPaid: true,
          paidAt: now,
        },
      })
    } catch (payErr: any) {
      // ★ خطای Payment غیربحرانیه — تمدید انجام شده
      console.warn('[Renew] Payment record failed (non-critical):', payErr.message)
    }

    return NextResponse.json({
      success: true,
      message: 'اشتراک با موفقیت تمدید شد',
      data: {
        newExpiresAt: newExpiresAt.toISOString(),
        billingCycle,
        price: price.price,
      },
    })
  } catch (error: any) {
    console.error('[Renew POST] Error:', error)
    return NextResponse.json(
      { success: false, error: `خطا در تمدید اشتراک: ${error.message}` },
      { status: 500 }
    )
  }
})
