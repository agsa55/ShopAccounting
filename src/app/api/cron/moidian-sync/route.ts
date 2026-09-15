// ============================================================================
// src/app/api/cron/moidian-sync/route.ts — Cron Job همگام‌سازی مودیان (v9.9)
// ============================================================================
// ★ این endpoint توسط cron job (Railway / cron-job.org) صدا زده می‌شود تا
//   وضعیت فاکتورهای ارسال‌شده به مودیان را به‌صورت دوره‌ای استعلام کند.
//
// ★ امنیت: نیاز به CRON_SECRET دارد (در query param یا Authorization header).
//
// ★ زمان‌بندی پیشنهادی: هر ۱۰ دقیقه یک‌بار
//   مثال: GET /api/cron/moidian-sync?secret=<CRON_SECRET>
//
// ★ نکته: مسیر /api/cron/ در proxy.ts جزو مسیرهای عمومی است (بدون auth token)،
//   بنابراین امنیت فقط با CRON_SECRET تأمین می‌شود.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { syncMoidianInvoices } from '@/lib/moidian/sync'

// ★ جلوگیری از cache شدن پاسخ (هر اجرا باید واقعی باشد)
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // ── ۱. بررسی امنیت (CRON_SECRET) ──────────────────────────
    const { searchParams } = new URL(req.url)
    const secretFromQuery = searchParams.get('secret')
    const secretFromHeader = req.headers.get('authorization')?.replace('Bearer ', '')
    const providedSecret = secretFromQuery || secretFromHeader

    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[Moidian Sync Cron] CRON_SECRET is not set')
      return NextResponse.json(
        { success: false, error: 'CRON_SECRET تنظیم نشده است' },
        { status: 500 }
      )
    }

    if (providedSecret !== cronSecret) {
      console.warn('[Moidian Sync Cron] Unauthorized access attempt')
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    // ── ۲. اجرای همگام‌سازی ────────────────────────────────────
    console.log('[Moidian Sync Cron] Starting moidian invoice sync...')
    const startTime = Date.now()

    const stats = await syncMoidianInvoices()

    const durationMs = Date.now() - startTime

    // ── ۳. بازگشت نتیجه ────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: 'همگام‌سازی مودیان انجام شد',
      durationMs,
      stats: {
        tenantsProcessed: stats.tenantsProcessed,
        invoicesChecked: stats.invoicesChecked,
        accepted: stats.accepted,
        rejected: stats.rejected,
        cancelled: stats.cancelled,
        stillPending: stats.stillPending,
        errors: stats.errors,
      },
    })
  } catch (error: any) {
    console.error('[Moidian Sync Cron] Error:', error?.message)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در همگام‌سازی مودیان' },
      { status: 500 }
    )
  }
}