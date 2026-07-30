// ============================================================================
// src/app/api/subscription/status/route.ts — GET (v9.6.0 ★★★)
// ShopAccounting — Get Current Subscription Status for Client
// ----------------------------------------------------------------------------
// این API وضعیت اشتراک فعلی Tenant را برمی‌گرداند:
//   - daysRemaining, expiresAt, tierName, billingCycle
//   - وضعیت جدید v9.6.0: status, canCreate, canRead, message
//   - قیمت‌ها برای نمایش در صفحه تمدید
//   - گزینه‌های ارتقا
//
// ★★★ v9.0: پشتیبانی از پلن مادام‌العمر (lifetime)
// ★★★ v9.6.0: پشتیبانی از منطق ۳ مرحله‌ای (هشدار، دوره مهلت، فقط خواندنی)
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

      // ★★★ v9.0 & v9.6.0: اگر پلن مادام‌العمر است → وضعیت ثابت و دسترسی کامل
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
          currentPrice: 0,
          upgradeOptions: [],
          // ★★★ v9.6.0: فیلدهای جدید برای مادام‌العمر
          status: 'active',
          canCreate: true,
          canRead: true,
          message: 'اشتراک مادام‌العمر شما فعال است.',
        }

        const response = NextResponse.json({
          success: true,
          data: clientStatus,
        })

        return response
      }

      // ★★★ v9.6.0: برای پلن‌های سالانه — دریافت وضعیت با منطق ۳ مرحله‌ای
      const serverStatus = await checkSubscriptionStatus(tenant.tenantId)
      const clientStatus = await getClientSubscriptionStatus(tenant.tenantId, serverStatus)

      const response = NextResponse.json({
        success: true,
        data: {
          ...clientStatus,
          isLifetime: false,
          // ★★★ v9.6.0: تزریق فیلدهای جدید از serverStatus به پاسخ کلاینت
          status: serverStatus.status,
          canCreate: serverStatus.canCreate,
          canRead: serverStatus.canRead,
          message: serverStatus.message,
        },
      })

      // ★ هدر هشدار انقضا (برای کلاینت‌هایی که fetch می‌خوره یا Middleware)
      if (serverStatus.daysRemaining > 0 && serverStatus.daysRemaining <= 7) {
        // ★★★ v9.6.0: تغییر بازه هشدار به ۷ روز
        response.headers.set('X-Subscription-Days-Remaining', String(serverStatus.daysRemaining))
        response.headers.set('X-Subscription-Warning', `subscription_expiring_in_${serverStatus.daysRemaining}_days`)
      }

      if (serverStatus.isExpired) {
        response.headers.set('X-Subscription-Expired', 'true')
        // اگر در حالت فقط خواندنی است، یک هدر خاص هم اضافه می‌کنیم
        if (serverStatus.status === 'read_only') {
          response.headers.set('X-Subscription-Read-Only', 'true')
        }
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