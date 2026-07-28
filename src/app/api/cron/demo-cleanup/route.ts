// ============================================================================
// src/app/api/cron/demo-cleanup/route.ts (v9.3.0 ★★★)
// ShopAccounting — Cron Job: Auto Cleanup Expired Demo Tenants
// ----------------------------------------------------------------------------
// ★★★ این API هر ساعت توسط cron job خارجی صدا زده می‌شود تا:
//   ۱. tenant های demo منقضی شده (بیش از ۷۲ ساعت) را حذف کند
//   ۲. tenant های demo_pending که بیش از ۳۰ دقیقه طول کشیده‌اند را حذف کند
//
// ★★★ امنیت: این API نیاز به CRON_SECRET در هدر دارد
//   Header: x-cron-secret: <CRON_SECRET از env>
//
// ★ نحوه تنظیم cron job:
//
//   Linux (crontab):
//     0 * * * * curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/demo-cleanup
//
//   Windows Task Scheduler:
//     هر ساعت اجرا کند: curl -X POST -H "x-cron-secret: my-cron-secret" http://localhost:3000/api/cron/demo-cleanup
//
//   Vercel Cron Jobs (vercel.json):
//     {
//       "crons": [
//         { "path": "/api/cron/demo-cleanup", "schedule": "0 * * * *" }
//       ]
//     }
//
// ★ این مسیر عمومی است (نیاز به توکن ندارد) ولی نیاز به CRON_SECRET دارد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredDemoTenants, getDemoCleanupStats } from '@/lib/demo-cleanup'
import { SET_CLEANUP_COUNT_HEADER } from '@/lib/cleanup-config'

// ★★★ جلوگیری از اجرای همزمان چند cleanup
let isCleanupRunning = false

export async function POST(request: NextRequest) {
  console.log('[Cron DemoCleanup] POST /api/cron/demo-cleanup')

  // ★ ۱. بررسی CRON_SECRET
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get('x-cron-secret')

  if (!cronSecret) {
    console.error('[Cron DemoCleanup] CRON_SECRET not configured in env')
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET در محیط تنظیم نشده است' },
      { status: 500 }
    )
  }

  if (providedSecret !== cronSecret) {
    console.error('[Cron DemoCleanup] Invalid CRON_SECRET')
    return NextResponse.json(
      { success: false, error: 'دسترسی غیرمجاز' },
      { status: 401 }
    )
  }

  // ★ ۲. جلوگیری از اجرای همزمان
  if (isCleanupRunning) {
    console.log('[Cron DemoCleanup] Cleanup already running, skipping...')
    return NextResponse.json({
      success: true,
      message: 'Cleanup already running',
      data: { skipped: true },
    })
  }

  // ★ ۳. اجرای cleanup
  isCleanupRunning = true
  const startTime = Date.now()

  try {
    // ★ گرفتن آمار قبل از cleanup
    const statsBefore = await getDemoCleanupStats()

    console.log('[Cron DemoCleanup] Stats before cleanup:', statsBefore)

    // ★ اگر هیچ دموی منقضی شده‌ای نیست، skip کن
    if (statsBefore.expiredDemoTenants === 0 && statsBefore.pendingTimeoutTenants === 0) {
      console.log('[Cron DemoCleanup] No expired demos to clean up. Skipping.')
      isCleanupRunning = false
      return NextResponse.json({
        success: true,
        message: 'No expired demos to clean up',
        data: {
          skipped: true,
          stats: statsBefore,
        },
      })
    }

    // ★ اجرای cleanup
    const result = await cleanupExpiredDemoTenants()

    // ★ گرفتن آمار بعد از cleanup
    const statsAfter = await getDemoCleanupStats()

    const elapsedMs = Date.now() - startTime
    console.log(`[Cron DemoCleanup] ✅ Cleanup completed in ${elapsedMs}ms`)
    console.log(`[Cron DemoCleanup] Deleted ${result.deletedCount} tenants, ${result.totalRecordsDeleted} records`)

    const response = NextResponse.json({
      success: result.success,
      data: {
        ...result,
        elapsedMs,
        statsBefore,
        statsAfter,
      },
    })

    // ★ تنظیم هدر برای کلاینت
    if (SET_CLEANUP_COUNT_HEADER) {
      response.headers.set('X-Cleanup-Count', String(result.deletedCount))
      response.headers.set('X-Cleanup-Records', String(result.totalRecordsDeleted))
    }

    return response
  } catch (error: any) {
    console.error('[Cron DemoCleanup] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  } finally {
    isCleanupRunning = false
  }
}

// ★ همچنین GET برای تست دستی (با CRON_SECRET در query)
export async function GET(request: NextRequest) {
  console.log('[Cron DemoCleanup] GET /api/cron/demo-cleanup (manual trigger)')

  const cronSecret = process.env.CRON_SECRET
  const providedSecret = new URL(request.url).searchParams.get('secret')

  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET در محیط تنظیم نشده است' },
      { status: 500 }
    )
  }

  if (providedSecret !== cronSecret) {
    return NextResponse.json(
      { success: false, error: 'دسترسی غیرمجاز' },
      { status: 401 }
    )
  }

  // ★ فقط آمار برگردان (بدون اجرای cleanup)
  const statsOnly = new URL(request.url).searchParams.get('stats') === 'true'

  if (statsOnly) {
    const stats = await getDemoCleanupStats()
    return NextResponse.json({
      success: true,
      data: { stats },
    })
  }

  // ★ اجرای cleanup
  if (isCleanupRunning) {
    return NextResponse.json({
      success: true,
      message: 'Cleanup already running',
      data: { skipped: true },
    })
  }

  isCleanupRunning = true
  const startTime = Date.now()

  try {
    const statsBefore = await getDemoCleanupStats()
    const result = await cleanupExpiredDemoTenants()
    const statsAfter = await getDemoCleanupStats()
    const elapsedMs = Date.now() - startTime

    console.log(`[Cron DemoCleanup] ✅ Manual cleanup completed in ${elapsedMs}ms`)

    return NextResponse.json({
      success: result.success,
      data: {
        ...result,
        elapsedMs,
        statsBefore,
        statsAfter,
      },
    })
  } catch (error: any) {
    console.error('[Cron DemoCleanup] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  } finally {
    isCleanupRunning = false
  }
}
