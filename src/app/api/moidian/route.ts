// ============================================================================
// src/app/api/moidian/route.ts — GET (وضعیت اتصال + آمار)
// ============================================================================
// ★ این فایل جایگزین فایل stub قبلی می‌شود.
// ★ عملیات: GET — دریافت وضعیت اتصال و آمار فاکتورهای مودیان
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { getMoidianSettings, getMoidianStats, isUsingFallbackKey } from '@/lib/moidian'

// ═══════════════════════════════════════════════════════════════
//  GET /api/moidian — وضعیت اتصال + آمار
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMoidianIntegration) {
      return NextResponse.json(
        { success: false, error: 'اتصال سامانه مودیان در پلن فعلی شما در دسترس نیست. لطفاً به پلن حرفه‌ای یا سازمانی ارتقا دهید.' },
        { status: 403 }
      )
    }

    const tenantId = tenant.tenantId

    // ★ دریافت تنظیمات (بدون credentials حساس)
    const settings = await getMoidianSettings(tenantId)

    // ★ دریافت آمار فاکتورهای مودیان
    const stats = await getMoidianStats(tenantId)

    return NextResponse.json({
      success: true,
      data: {
        settings,
        stats,
        usingFallbackEncryptionKey: isUsingFallbackKey(),
        message: settings?.isInitialized
          ? `سامانه مودیان متصل است (محیط: ${settings.environment === 'sandbox' ? 'تست' : 'تولید'})`
          : 'سامانه مودیان متصل نیست — برای اتصال، کلیدها را در تنظیمات وارد کنید',
      },
    })
  } catch (error: any) {
    console.error('[Moidian GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت وضعیت مودیان' },
      { status: 500 }
    )
  }
})
