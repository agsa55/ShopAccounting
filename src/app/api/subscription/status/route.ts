// ============================================================================
// src/app/api/subscription/status/route.ts — GET (v9.0 ★★★)
// ShopAccounting — Get Current Subscription Status for Client
// ----------------------------------------------------------------------------
// این API وضعیت اشتراک فعلی Tenant را برمی‌گرداند:
//   - daysRemaining, expiresAt, tierName, billingCycle
//   - قیمت‌ها برای نمایش در صفحه تمدید
//   - گزینه‌های ارتقا
//
// ★★★ v9.0: پشتیبانی از پلن مادام‌العمر (lifetime)
//   - اگر billingCycle='lifetime' باشد:
//     • isExpired همیشه false
//     • daysRemaining = -1 (یعنی نامحدود)
//     • expiresAt = null
//     • هدرهای هشدار انقضا ست نمی‌شوند
//
// ★ نیاز به توکن معتبر دارد (withTenantIsolation)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { checkSubscriptionStatus } from '@/lib/plan-limits'
import { getClientSubscriptionStatus } from '@/lib/subscription-utils'
import { db } from '@/lib/db'

// ★★★ v9.0: helper محلی برای تشخیص lifetime
function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر'
}

export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      // ★★★ v9.0: ابتدا tenant را از دیتابیس بخوان تا billingCycle را ببینیم
      const tenantRecord = await db.client.tenant.findUnique({
        where: { id: tenant.tenantId },
        include: { planTier: true },
      })

      const tenantBillingCycle = tenantRecord?.billingCycle || ''
      const isLifetime = isLifetimeCycle(tenantBillingCycle)

      // ★★★ v9.0: اگر پلن مادام‌العمر است → وضعیت ثابت
      if (isLifetime && tenantRecord?.planTier) {
        const clientStatus = {
          isActive: tenantRecord.status !== 'suspended',
          isExpired: false,
          daysRemaining: -1, // -1 = نامحدود
          expiresAt: null,
          tierName: tenantRecord.planTier.name,
          tierNameFa: tenantRecord.planTier.nameFa,
          billingCycle: 'lifetime',
          isLifetime: true,
          // ★ اطلاعات قیمت‌گذاری برای UI (اختیاری)
          currentPrice: 0, // چون قبلاً پرداخت شده
          upgradeOptions: [],
        }

        const response = NextResponse.json({
          success: true,
          data: clientStatus,
        })

        // ★★★ v9.0: برای lifetime، هیچ هدر هشدار انقضایی ست نمی‌شود
        return response
      }

      // ★★★ برای پلن‌های سالانه — منطق قبلی
      const serverStatus = await checkSubscriptionStatus(tenant.tenantId)
      const clientStatus = await getClientSubscriptionStatus(tenant.tenantId, serverStatus)

      // ★ هدر هشدار انقضا (برای کلاینت‌هایی که fetch می‌خوره)
      const response = NextResponse.json({
        success: true,
        data: {
          ...clientStatus,
          isLifetime: false,
        },
      })

      if (clientStatus.daysRemaining > 0 && clientStatus.daysRemaining <= 3) {
        // ★★★ v9.3.2: فقط عدد را در هدر می‌گذاریم (هدرها فقط ASCII پشتیبانی می‌کنند)
        //   کلاینت می‌تواند از این عدد برای ساخت پیام فارسی استفاده کند
        response.headers.set('X-Subscription-Days-Remaining', String(clientStatus.daysRemaining))
        response.headers.set('X-Subscription-Warning', `subscription_expiring_in_${clientStatus.daysRemaining}_days`)
      }

      if (clientStatus.isExpired) {
        response.headers.set('X-Subscription-Expired', 'true')
      }

      return response
    } catch (error: any) {
      console.error('[Subscription Status] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت وضعیت اشتراک' },
        { status: 500 }
      )
    }
  }
)
