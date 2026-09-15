// ============================================================================
// src/app/api/subscription/upgrade/route.ts
// ارتقا به پلن بالاتر (با رعایت قوانین ارتقا)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import {
  upgradePlan,
  checkSubscriptionStatus,
} from '@/lib/plan-limits'
import { resolvePlanName, canUpgradePlan, type PlanName } from '@/lib/plan-features'

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const body = await req.json()
      const { tierName, billingCycle } = body

      if (!tierName || !billingCycle) {
        return NextResponse.json(
          { success: false, error: 'پارامترهای tierName و billingCycle الزامی هستند' },
          { status: 400 }
        )
      }

      // بررسی وضعیت فعلی
      const subStatus = await checkSubscriptionStatus(tenantId)
      const currentPlanName = resolvePlanName(subStatus.tierName)
      const currentCycle = subStatus.isLifetime ? 'lifetime' : 'annual'

      // ★★★ FIX: استفاده از canUpgradePlan از plan-features
      const canUpgrade = canUpgradePlan(
        currentPlanName,
        currentCycle,
        tierName as PlanName,
        billingCycle
      )

      if (!canUpgrade) {
        return NextResponse.json(
          {
            success: false,
            error: `ارتقا از ${subStatus.tierNameFa} (${subStatus.isLifetime ? 'مادام‌العمر' : 'سالانه'}) به ${tierName} (${billingCycle === 'lifetime' ? 'مادام‌العمر' : 'سالانه'}) مجاز نیست`,
          },
          { status: 400 }
        )
      }

      // اجرای ارتقا
      const result = await upgradePlan(tenantId, tierName, billingCycle)

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'خطا در ارتقا پلن' },
          { status: 500 }
        )
      }

      // دریافت وضعیت جدید
      const newStatus = await checkSubscriptionStatus(tenantId)

      return NextResponse.json({
        success: true,
        message: `✅ پلن شما با موفقیت به ${newStatus.tierNameFa} (${billingCycle === 'lifetime' ? 'مادام‌العمر' : 'سالانه'}) ارتقا یافت!`,
        data: {
          tierName: newStatus.tierName,
          tierNameFa: newStatus.tierNameFa,
          billingCycle: newStatus.billingCycle,
          expiresAt: newStatus.expiresAt,
          daysRemaining: newStatus.daysRemaining,
          isLifetime: newStatus.isLifetime,
        },
      })
    } catch (error: any) {
      console.error('[Subscription Upgrade] Error:', error?.message)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در ارتقا پلن' },
        { status: 500 }
      )
    }
  }
)