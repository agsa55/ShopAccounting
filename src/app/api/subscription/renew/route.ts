// ============================================================================
// src/app/api/subscription/renew/route.ts
// تمدید اشتراک فعلی (سالانه یا مادام‌العمر)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { renewSubscription, checkSubscriptionStatus } from '@/lib/plan-limits'

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const body = await req.json().catch(() => ({}))
      const billingCycle = body.billingCycle || 'annual'

      // بررسی وضعیت فعلی
      const subStatus = await checkSubscriptionStatus(tenantId)

      if (subStatus.isLifetime) {
        return NextResponse.json(
          { success: false, error: 'اشتراک مادام‌العمر نیازی به تمدید ندارد' },
          { status: 400 }
        )
      }

      // تمدید اشتراک
      const result = await renewSubscription(tenantId, billingCycle)

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'خطا در تمدید اشتراک' },
          { status: 500 }
        )
      }

      // دریافت وضعیت جدید
      const newStatus = await checkSubscriptionStatus(tenantId)

      return NextResponse.json({
        success: true,
        message: billingCycle === 'lifetime'
          ? '✅ اشتراک شما به مادام‌العمر ارتقا یافت!'
          : '✅ اشتراک شما برای یک سال دیگر تمدید شد!',
        data: {
          billingCycle: newStatus.billingCycle,
          expiresAt: newStatus.expiresAt,
          daysRemaining: newStatus.daysRemaining,
          isLifetime: newStatus.isLifetime,
        },
      })
    } catch (error: any) {
      console.error('[Subscription Renew] Error:', error?.message)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در تمدید اشتراک' },
        { status: 500 }
      )
    }
  }
)