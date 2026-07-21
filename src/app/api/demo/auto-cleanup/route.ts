// ============================================================================
// src/app/api/demo/auto-cleanup/route.ts (v9.3.0 ★★★)
// ShopAccounting — Silent Auto-Cleanup Trigger
// ----------------------------------------------------------------------------
// ★★★ این API به‌صورت silent در background اجرا می‌شود هنگام لود داشبورد.
//
// ★ نحوه کار:
//   ۱. هنگام لود داشبورد، یک درخواست silent به این endpoint ارسال می‌شود
//   ۲. این endpoint بررسی می‌کند آیا زمان پاکسازی فرا رسیده (هر ۱ ساعت)
//   ۳. اگر بله، پاکسازی را اجرا می‌کند
//   ۴. response فوری برمی‌گردد (کاربر صبر نمی‌کند)
//
// ★ این روش به‌خصوص مفید است اگر cron job خارجی تنظیم نشده باشد.
//
// ★ نیاز به توکن معتبر دارد (withTenantIsolation)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { cleanupExpiredDemoTenants, getDemoCleanupStats, shouldRunCleanup, markCleanupRun } from '@/lib/demo-cleanup'
import { CLEANUP_INTERVAL_MS, ENABLE_AUTO_CLEANUP_ON_DASHBOARD } from '@/lib/cleanup-config'

// ★★★ جلوگیری از اجرای همزمان
let isAutoCleanupRunning = false

export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    // ★ اگر auto-cleanup در داشبورد غیرفعال است، skip کن
    if (!ENABLE_AUTO_CLEANUP_ON_DASHBOARD) {
      return NextResponse.json({
        success: true,
        message: 'Auto-cleanup disabled',
        data: { skipped: true, reason: 'disabled' },
      })
    }

    // ★ بررسی آیا زمان پاکسازی فرا رسیده؟
    if (!shouldRunCleanup(CLEANUP_INTERVAL_MS)) {
      return NextResponse.json({
        success: true,
        message: 'Not yet time for cleanup',
        data: { skipped: true, reason: 'too_soon' },
      })
    }

    // ★ جلوگیری از اجرای همزمان
    if (isAutoCleanupRunning) {
      return NextResponse.json({
        success: true,
        message: 'Cleanup already running',
        data: { skipped: true, reason: 'already_running' },
      })
    }

    // ★ شروع پاکسازی در background
    // ★★★ مهم: response را فوری برمی‌گردانیم تا کاربر صبر نکند
    //   پاکسازی در background ادامه می‌یابد

    isAutoCleanupRunning = true

    // ★★★ اجرای پاکسازی به‌صورت async (بدون await)
    //   این کار باعث می‌شود response فوری برگردد
    cleanupExpiredDemoTenants()
      .then((result) => {
        console.log(`[AutoCleanup] ✅ Background cleanup completed: ${result.deletedCount} tenants deleted`)
      })
      .catch((error) => {
        console.error('[AutoCleanup] Background cleanup error:', error)
      })
      .finally(() => {
        isAutoCleanupRunning = false
        markCleanupRun()
      })

    // ★ response فوری
    return NextResponse.json({
      success: true,
      message: 'Cleanup started in background',
      data: {
        started: true,
        timestamp: new Date().toISOString(),
      },
    })
  }
)

// ★ GET برای دریافت آمار (بدون اجرای cleanup)
export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const stats = await getDemoCleanupStats()
      return NextResponse.json({
        success: true,
        data: {
          stats,
          lastCleanupTime: new Date(Date.now() - CLEANUP_INTERVAL_MS).toISOString(), // ★ approximate
          nextCleanupIn: CLEANUP_INTERVAL_MS,
        },
      })
    } catch (error: any) {
      console.error('[AutoCleanup] Stats error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت آمار' },
        { status: 500 }
      )
    }
  }
)
