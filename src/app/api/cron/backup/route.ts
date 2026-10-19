// ============================================================================
// src/app/api/cron/backup/route.ts
// ★ Endpoint امن برای اجرای زمان‌بندی بکاپ توسط کران‌جاب رانفلر
// ----------------------------------------------------------------------------
// این endpoint باید فقط با هدر زیر اجرا شود:
//   Authorization: Bearer CRON_SECRET
//
// همچنین برای سازگاری با برخی پنل‌ها، هدر زیر هم پذیرفته می‌شود:
//   x-cron-secret: CRON_SECRET
//
// منطق:
//   - اگر CRON_SECRET تنظیم نشده باشد، خطا می‌دهد.
//   - اگر secret درست نباشد، 401 می‌دهد.
//   - اگر درست باشد، runScheduledBackupIfDue() اجرا می‌شود.
//   - خود scheduler بررسی می‌کند که آیا زمان تهران رسیده یا نه.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { runScheduledBackupIfDue } from '@/lib/admin/backup-scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a || ''))
  const bufB = Buffer.from(String(b || ''))

  if (bufA.length !== bufB.length) {
    return false
  }

  try {
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

function extractSecret(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || ''

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }

  const customHeader = req.headers.get('x-cron-secret')
  if (customHeader) {
    return customHeader.trim()
  }

  const query = req.nextUrl.searchParams.get('secret')
  if (query) {
    return query.trim()
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const expectedSecret = String(process.env.CRON_SECRET || '').trim()

    if (!expectedSecret) {
      console.error('[Cron Backup] ❌ CRON_SECRET is not configured.')

      return NextResponse.json(
        {
          success: false,
          error:
            'CRON_SECRET در متغیرهای محیطی تنظیم نشده است. لطفاً آن را در رانفلر/لوکال اضافه کنید.',
          errorCode: 'CRON_SECRET_MISSING',
        },
        { status: 500 }
      )
    }

    const providedSecret = extractSecret(req)

    if (!providedSecret || !safeEqual(providedSecret, expectedSecret)) {
      console.warn('[Cron Backup] ❌ Unauthorized cron request.')

      return NextResponse.json(
        {
          success: false,
          error: 'توکن کران نامعتبر است.',
          errorCode: 'CRON_UNAUTHORIZED',
        },
        { status: 401 }
      )
    }

    console.log('[Cron Backup] ▶️ Cron request authorized. Running scheduler...')

    const result = await runScheduledBackupIfDue({ force: false })

    console.log(
      `[Cron Backup] ✅ Scheduler finished: ran=${result.ran}, status=${result.status}`
    )

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    console.error('[Cron Backup] ❌ Fatal error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'خطای ناشناخته در اجرای کران بکاپ',
        errorCode: 'CRON_EXECUTION_ERROR',
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// اختیاری: GET هم برای تست سریع پذیرفته شود، ولی برای production POST بهتر است.
// اگر می‌خواهی فقط POST مجاز باشد، این بخش را حذف کن.
// ============================================================================
export async function GET(req: NextRequest) {
  return POST(req)
}