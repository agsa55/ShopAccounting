// ============================================================================
// src/app/api/demo/status/route.ts — GET (v9.1 ★★★)
// ShopAccounting — Demo Status Check
// ----------------------------------------------------------------------------
// این API وضعیت دمو tenant فعلی را برمی‌گرداند.
//   - آیا tenant دمو است؟
//   - چند روز/ساعت باقی‌مانده؟
//   - آیا منقضی شده؟
//
// ★ نیاز به توکن معتبر دارد (withTenantIsolation)
// ★ اگر tenant منقضی شده باشد → خودکار حذف می‌شود و خطای 410 برمی‌گردد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getDemoInfo, isDemoExpired, cleanupDemoTenant, DEMO_DURATION_DAYS } from '@/lib/demo-utils'

export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      // ★ خواندن tenant کامل از دیتابیس
      const tenantRecord = await db.client.tenant.findUnique({
        where: { id: tenant.tenantId },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          soldAt: true,
          subDomain: true,
          companyName: true,
          planName: true,
          billingCycle: true,
        },
      })

      if (!tenantRecord) {
        return NextResponse.json(
          { success: false, error: 'فروشگاه یافت نشد' },
          { status: 404 }
        )
      }

      // ★ اگر tenant دمو نیست
      if (tenantRecord.status !== 'demo' && tenantRecord.status !== 'demo_pending') {
        return NextResponse.json({
          success: true,
          data: {
            isDemo: false,
            isExpired: false,
            daysRemaining: 0,
            hoursRemaining: 0,
            expiresAt: null,
            startedAt: null,
          },
        })
      }

      // ★ اگر دمو منقضی شده → حذف خودکار
      if (isDemoExpired(tenantRecord)) {
        console.log('[Demo Status] Demo expired, auto-cleaning up:', tenantRecord.id)
        await cleanupDemoTenant(tenantRecord.id)

        return NextResponse.json(
          {
            success: false,
            error: 'مدت تست دمو شما به پایان رسیده است. لطفاً یکی از پلن‌ها را خریداری کنید.',
            errorCode: 'DEMO_EXPIRED',
          },
          { status: 410 }
        )
      }

      // ★ محاسبه اطلاعات دمو
      const demoInfo = getDemoInfo(tenantRecord)

      // ★ هدر هشدار برای کلاینت‌ها
      const response = NextResponse.json({
        success: true,
        data: {
          ...demoInfo,
          subdomain: tenantRecord.subDomain,
          companyName: tenantRecord.companyName,
          planName: tenantRecord.planName,
          billingCycle: tenantRecord.billingCycle,
          totalDays: DEMO_DURATION_DAYS,
          // ★ تبدیل dates به ISO string
          expiresAt: demoInfo.expiresAt ? demoInfo.expiresAt.toISOString() : null,
          startedAt: demoInfo.startedAt ? demoInfo.startedAt.toISOString() : null,
        },
      })

      // ★ هدر هشدار انقضا
      if (demoInfo.daysRemaining > 0 && demoInfo.daysRemaining <= 1) {
        // ★★★ v9.3.2: فقط عدد را در هدر می‌گذاریم (هدرها فقط ASCII پشتیبانی می‌کنند)
        response.headers.set('X-Demo-Days-Remaining', String(demoInfo.daysRemaining))
        response.headers.set('X-Demo-Warning', `demo_expiring_in_${demoInfo.daysRemaining}_days`)
      }

      return response
    } catch (error: any) {
      console.error('[Demo Status] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در بررسی وضعیت دمو' },
        { status: 500 }
      )
    }
  }
)
