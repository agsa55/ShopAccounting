// ============================================================================
// src/app/api/admin/backup/route.ts
// API پشتیبان‌گیری ادمین — نسخه نهایی با قابلیت بازیابی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  listBackups,
  createTenantBackup,
  createFullDatabaseBackup,
  deleteBackup,
  getBackupStats,
  restoreBackup,
} from '@/lib/admin/backup-service'

// ═══════════════════════════════════════════════════════════
// GET: لیست بکاپ‌ها + آمار
// ═══════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  console.log('[Admin Backup] 📥 GET request received')

  try {
    const [backups, stats] = await Promise.all([
      listBackups(),
      getBackupStats(),
    ])

    console.log(`[Admin Backup] ✅ Found ${backups.length} backups`)

    return NextResponse.json({
      success: true,
      data: backups,
      stats,
    })
  } catch (error: any) {
    console.error('[Admin Backup] ❌ GET ERROR:', error.message)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════
// POST: ایجاد بکاپ یا بازیابی
// 
// حالت ۱ - ایجاد بکاپ:
//   Body: { type: 'tenant', tenantId: '...' }
//   Body: { type: 'full_database' }
// 
// حالت ۲ - بازیابی:
//   Body: { action: 'restore', backupId: '...' }
// ═══════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  console.log('[Admin Backup] 📥 POST request received')

  try {
    const body = await request.json().catch(() => ({}))
    const { type, tenantId, action, backupId } = body

    // ─── حالت ۱: بازیابی از بکاپ ───
    if (action === 'restore' && backupId) {
      console.log(`[Admin Backup] 🔄 Restore requested for backup: ${backupId}`)

      try {
        const result = await restoreBackup(backupId)

        console.log(`[Admin Backup] ✅ Restore completed: ${result.restoredCount} records`)

        return NextResponse.json({ success: true, data: result })
      } catch (error: any) {
        console.error('[Admin Backup] ❌ Restore ERROR:', error.message)
        return NextResponse.json(
          {
            success: false,
            error: error.message || 'خطا در بازیابی',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          },
          { status: 500 }
        )
      }
    }

    // ─── حالت ۲: ایجاد بکاپ کامل دیتابیس ───
    let result
    if (type === 'full_database') {
      console.log('[Admin Backup] 🔄 Creating full database backup...')
      result = await createFullDatabaseBackup('admin')
    }
    // ─── حالت ۳: ایجاد بکاپ فروشگاه ───
    else if (type === 'tenant' && tenantId) {
      console.log(`[Admin Backup] 🔄 Creating tenant backup for: ${tenantId}`)
      result = await createTenantBackup(tenantId, 'admin')
    }
    // ─── حالت نامعتبر ───
    else {
      return NextResponse.json(
        { success: false, error: 'پارامترهای نامعتبر (type/tenantId یا action/backupId الزامی است)' },
        { status: 400 }
      )
    }

    console.log('[Admin Backup] ✅ Backup created successfully:', result)
    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('[Admin Backup] ❌ POST ERROR:', error.message)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE: حذف بکاپ
// URL: /api/admin/backup?id=...
// ═══════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  console.log('[Admin Backup] 📥 DELETE request received')

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه بکاپ الزامی است' },
        { status: 400 }
      )
    }

    console.log(`[Admin Backup] 🗑️ Deleting backup: ${id}`)
    await deleteBackup(id)
    console.log('[Admin Backup] ✅ Backup deleted successfully')

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Admin Backup] ❌ DELETE ERROR:', error.message)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}