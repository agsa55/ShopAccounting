// ============================================================================
// src/app/api/cron/settlement-sync/route.ts — GET/POST (v8.6 ★★★)
// ShopAccounting — Cron Job: Sync Zarinpal Settlements
// ----------------------------------------------------------------------------
// ★★★ v8.6: این API توسط یک cron job ساعتی صدا زده می‌شود و وضعیت تسویه
//   پرداخت‌های آنلاین را به‌روزرسانی می‌کند.
//
// ★ محافظت:
//   - هدر X-Cron-Secret یا query param ?secret=CRON_SECRET
//
// ★ منطق:
//   ۱) پیدا کردن تمام پرداخت‌های paid که settlementStatus != 'settled'
//   ۲) برای هر پرداخت:
//      a. اگر کمتر از ۲۴ ساعت از paidAt گذشته → skip
//      b. اگر بین ۲۴-۷۲ ساعت گذشته → inquiry + (settle یا pending)
//      c. اگر بین ۷۲ ساعت تا ۷ روز → delayed
//      d. اگر بیشتر از ۷ روز → failed
//   ۳) گزارش نهایی
//
// ★ نحوه راه‌اندازی cron job:
//   - در سرور Linux: crontab -e
//     0 * * * * curl -H "X-Cron-Secret: YOUR_SECRET" http://localhost:3000/api/cron/settlement-sync
//   - در Vercel: vercel.json با schedules
//   - در Windows Task Scheduler: هر ساعت
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { syncSettlements } from '@/lib/zarinpal/settlement'

export async function GET(req: NextRequest) {
  return handleCron(req)
}

export async function POST(req: NextRequest) {
  return handleCron(req)
}

async function handleCron(req: NextRequest) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  [Cron Settlement Sync] STARTED at', new Date().toISOString(), '  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  // ─── ۱. بررسی secret ──────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Cron Settlement] CRON_SECRET not set')
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 500 }
    )
  }

  const secretFromHeader = req.headers.get('x-cron-secret')
  const { searchParams } = new URL(req.url)
  const secretFromQuery = searchParams.get('secret')

  if (secretFromHeader !== cronSecret && secretFromQuery !== cronSecret) {
    console.warn('[Cron Settlement] Unauthorized access attempt')
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const startTime = Date.now()

  try {
    // ─── ۲. اجرای همگام‌سازی ────────────────────────────────────
    const stats = await syncSettlements()

    const durationMs = Date.now() - startTime
    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  [Cron Settlement Sync] COMPLETED in', durationMs, 'ms')
    console.log('║  Stats:', JSON.stringify({
      totalChecked: stats.totalChecked,
      settled: stats.settled,
      delayed: stats.delayed,
      failed: stats.failed,
      stillPending: stats.stillPending,
      errors: stats.errors,
    }))
    console.log('╚══════════════════════════════════════════════════════════════╝\n')

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        durationMs,
        executedAt: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[Cron Settlement] Fatal error:', error)
    const durationMs = Date.now() - startTime
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Internal server error',
        durationMs,
        executedAt: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
