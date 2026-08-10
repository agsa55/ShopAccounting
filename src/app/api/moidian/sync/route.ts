// ============================================================================
// src/app/api/moidian/sync/route.ts — POST: Trigger دستی Scheduler
// ============================================================================
// ★ این endpoint به مدیر اجازه می‌دهد چرخه پردازش را به صورت دستی اجرا کند.
// ★ فقط برای Manager/Admin در دسترس است.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { moidianScheduler } from '@/lib/moidian/scheduler'

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canMoidianIntegration) {
        return NextResponse.json(
          {
            success: false,
            error: 'اتصال سامانه مودیان در پلن فعلی شما در دسترس نیست',
          },
          { status: 403 }
        )
      }

      if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
        return NextResponse.json(
          {
            success: false,
            error: 'فقط مدیران اجازه اجرای همگام‌سازی را دارند',
          },
          { status: 403 }
        )
      }

      // ★ اجرای trigger (فقط tenant فعلی را پردازش می‌کند)
      const stats = await moidianScheduler.triggerManual()

      return NextResponse.json({
        success: true,
        message: 'همگام‌سازی با موفقیت انجام شد',
        data: stats,
      })
    } catch (error: any) {
      console.error('[Moidian Sync] Error:', error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در اجرای همگام‌سازی' },
        { status: 500 }
      )
    }
  }
)