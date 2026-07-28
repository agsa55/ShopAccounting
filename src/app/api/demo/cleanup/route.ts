// ============================================================================
// src/app/api/demo/cleanup/route.ts — POST (v9.1 ★★★)
// ShopAccounting — Demo Cleanup Cron Job
// ----------------------------------------------------------------------------
// این API باید توسط cron job به‌صورت دوره‌ای (مثلاً هر ساعت) صدا زده شود
// تا tenant های دمو منقضی شده را حذف کند.
//
// ★★★ امنیت: این API نیاز به CRON_SECRET در هدر دارد
//   Header: x-cron-secret: <CRON_SECRET از env>
//
// ★ نحوه تنظیم cron job:
//   - Linux: crontab -e → 0 * * * * curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/demo/cleanup
//   - Windows Task Scheduler → هر ساعت اجرا کند
//   - Vercel Cron Jobs → در vercel.json تعریف کنید
//
// ★ این مسیر عمومی است (نیاز به توکن ندارد) ولی نیاز به CRON_SECRET دارد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredDemoTenants } from '@/lib/demo-utils'

export async function POST(request: NextRequest) {
  console.log('[Demo Cleanup] POST /api/demo/cleanup')

  try {
    // ─── ۱. بررسی CRON_SECRET ───────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get('x-cron-secret')

    if (!cronSecret) {
      console.error('[Demo Cleanup] CRON_SECRET not configured in env')
      return NextResponse.json(
        { success: false, error: 'CRON_SECRET در محیط تنظیم نشده است' },
        { status: 500 }
      )
    }

    if (providedSecret !== cronSecret) {
      console.error('[Demo Cleanup] Invalid CRON_SECRET')
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    // ─── ۲. اجرای cleanup ──────────────────────────────────────────
    const startTime = Date.now()
    const result = await cleanupExpiredDemoTenants()
    const elapsedMs = Date.now() - startTime

    console.log(`[Demo Cleanup] ✅ Cleanup completed in ${elapsedMs}ms`)
    console.log(`[Demo Cleanup] Deleted ${result.deletedCount} demo tenants`)

    if (result.details.length > 0) {
      console.log('[Demo Cleanup] Details:')
      for (const d of result.details) {
        console.log(`  - ${d.tenantId} (${d.subDomain}): ${d.reason}`)
      }
    }

    return NextResponse.json({
      success: result.success,
      data: {
        deletedCount: result.deletedCount,
        details: result.details,
        elapsedMs,
      },
    })
  } catch (error: any) {
    console.error('[Demo Cleanup] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  }
}

// ★ همچنین GET برای تست دستی (با CRON_SECRET در query)
export async function GET(request: NextRequest) {
  console.log('[Demo Cleanup] GET /api/demo/cleanup (manual trigger)')

  try {
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

    const startTime = Date.now()
    const result = await cleanupExpiredDemoTenants()
    const elapsedMs = Date.now() - startTime

    console.log(`[Demo Cleanup] ✅ Manual cleanup completed in ${elapsedMs}ms`)
    console.log(`[Demo Cleanup] Deleted ${result.deletedCount} demo tenants`)

    return NextResponse.json({
      success: result.success,
      data: {
        deletedCount: result.deletedCount,
        details: result.details,
        elapsedMs,
      },
    })
  } catch (error: any) {
    console.error('[Demo Cleanup] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  }
}
