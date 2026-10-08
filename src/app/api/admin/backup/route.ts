// ============================================================================
// src/app/api/admin/backup/route.ts
// API پشتیبان‌گیری ادمین — نسخه اصلاح‌شده برای بکاپ فایل‌محور
// ----------------------------------------------------------------------------
// تغییرات مهم:
// 1. GET همیشه storage_type را برمی‌گرداند تا UI بداند بکاپ client است یا db.
// 2. POST فقط برای بازیابی از بکاپ‌های قدیمی داخل دیتابیس استفاده می‌شود.
// 3. ساخت بکاپ از این route غیرفعال است؛ بکاپ دستی جدید باید از
//    /api/admin/backup/create استفاده کند تا فایل روی سیستم کاربر ذخیره شود.
// 4. بکاپ کامل دیتابیس از این route غیرفعال است؛ برای بکاپ کامل از رانفلر استفاده شود.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  listBackups,
  deleteBackup,
  getBackupStats,
  restoreBackup,
} from '@/lib/admin/backup-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ============================================================================
// Helpers
// ============================================================================

function normalizeBackupRecord(backup: any) {
  return {
    ...backup,
    storage_type: backup?.storage_type || backup?.storageType || 'db',
  }
}

function isClientBackupErrorMessage(message: string): boolean {
  const msg = String(message || '')

  return (
    msg.includes('در دیتابیس ذخیره نشده') ||
    msg.includes('روی سیستم شما ذخیره شده') ||
    msg.includes('client') ||
    msg.includes('Client') ||
    msg.includes('CLIENT')
  )
}

// ============================================================================
// GET: لیست بکاپ‌ها + آمار
// ============================================================================
export async function GET(request: NextRequest) {
  console.log('[Admin Backup] 📥 GET request received')

  try {
    const [backups, stats] = await Promise.all([
      listBackups(),
      getBackupStats(),
    ])

    const normalizedBackups = backups.map(normalizeBackupRecord)

    console.log(`[Admin Backup] ✅ Found ${normalizedBackups.length} backups`)

    return NextResponse.json({
      success: true,
      data: normalizedBackups,
      stats,
    })
  } catch (error: any) {
    console.error('[Admin Backup] ❌ GET ERROR:', error?.message || error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطا در دریافت لیست بکاپ‌ها',
        details:
          process.env.NODE_ENV === 'development'
            ? error?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// POST:
// - بازیابی از بکاپ‌های قدیمی داخل دیتابیس
// - ساخت بکاپ از این route غیرفعال است
// ============================================================================
export async function POST(request: NextRequest) {
  console.log('[Admin Backup] 📥 POST request received')

  try {
    const body = await request.json().catch(() => ({}))
    const { type, tenantId, action, backupId } = body

    // ==========================================================================
    // حالت ۱: بازیابی از بکاپ
    // ==========================================================================
    if (action === 'restore' && backupId) {
      console.log(
        `[Admin Backup] 🔄 Restore requested for backup: ${backupId}`
      )

      try {
        const result = await restoreBackup(String(backupId))

        console.log(
          `[Admin Backup] ✅ Restore completed: ${result?.restoredCount ?? 0} records`
        )

        return NextResponse.json({
          success: true,
          data: result,
        })
      } catch (error: any) {
        const message = error?.message || 'خطا در بازیابی'

        console.error('[Admin Backup] ❌ Restore ERROR:', message)

        const isClientBackupIssue = isClientBackupErrorMessage(message)

        return NextResponse.json(
          {
            success: false,
            error: isClientBackupIssue
              ? 'این بکاپ روی سیستم شما ذخیره شده است. برای بازیابی، فایل JSON بکاپ را از سیستم خود انتخاب کنید.'
              : message,
            errorCode: isClientBackupIssue
              ? 'CLIENT_BACKUP_REQUIRES_FILE'
              : undefined,
            details:
              process.env.NODE_ENV === 'development'
                ? error?.stack
                : undefined,
          },
          {
            status: isClientBackupIssue ? 400 : 500,
          }
        )
      }
    }

    // ==========================================================================
    // حالت ۲: ساخت بکاپ از این route غیرفعال است
    // ==========================================================================
    if (type === 'tenant') {
      console.warn(
        '[Admin Backup] ⛔ Legacy tenant DB backup creation is disabled.'
      )

      return NextResponse.json(
        {
          success: false,
          error:
            'ساخت بکاپ فروشگاه از این API غیرفعال است. برای بکاپ دستی فایل‌محور از /api/admin/backup/create استفاده کنید.',
          errorCode: 'LEGACY_DB_BACKUP_DISABLED',
        },
        { status: 410 }
      )
    }

    if (type === 'full_database') {
      console.warn(
        '[Admin Backup] ⛔ Full database backup creation is disabled.'
      )

      return NextResponse.json(
        {
          success: false,
          error:
            'بکاپ کامل دیتابیس از این API غیرفعال است. برای بکاپ کامل بانک از پنل رانفلر استفاده کنید.',
          errorCode: 'FULL_DB_BACKUP_DISABLED',
        },
        { status: 410 }
      )
    }

    // ==========================================================================
    // حالت نامعتبر
    // ==========================================================================
    return NextResponse.json(
      {
        success: false,
        error:
          'پارامترهای نامعتبر. فقط action=restore با backupId پشتیبانی می‌شود.',
        errorCode: 'INVALID_REQUEST',
      },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[Admin Backup] ❌ POST ERROR:', error?.message || error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطای ناشناخته در عملیات POST',
        details:
          process.env.NODE_ENV === 'development'
            ? error?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// DELETE: حذف رکورد بکاپ
// URL: /api/admin/backup?id=...
// ============================================================================
export async function DELETE(request: NextRequest) {
  console.log('[Admin Backup] 📥 DELETE request received')

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'شناسه بکاپ الزامی است',
          errorCode: 'MISSING_BACKUP_ID',
        },
        { status: 400 }
      )
    }

    console.log(`[Admin Backup] 🗑️ Deleting backup metadata: ${id}`)

    await deleteBackup(id)

    console.log('[Admin Backup] ✅ Backup metadata deleted successfully')

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error('[Admin Backup] ❌ DELETE ERROR:', error?.message || error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطا در حذف بکاپ',
        details:
          process.env.NODE_ENV === 'development'
            ? error?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}