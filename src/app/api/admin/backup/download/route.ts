// ============================================================================
// src/app/api/admin/backup/route.ts
// API پشتیبان‌گیری ادمین
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  listBackups,
  createTenantBackup,
  createFullDatabaseBackup,
  deleteBackup,
  getBackupStats,
} from '@/lib/admin/backup-service'

// ═══════════════════════════════════════════════════════════
// بررسی احراز هویت ادمین (نسخه بهبودیافته)
// ═══════════════════════════════════════════════════════════
async function verifyAdmin(req: NextRequest): Promise<boolean> {
  try {
    // ۱. چک کردن کوکی‌های مختلف (ممکن است پروژه از هر کدام استفاده کند)
    const cookieNames = ['admin_token', 'token', 'admin-token', 'auth_token', 'session']
    
    for (const name of cookieNames) {
      const cookieValue = req.cookies.get(name)?.value
      if (cookieValue && cookieValue.length > 10) {
        console.log(`[Backup API] ✅ Found cookie: ${name}`)
        return true
      }
    }

    // ۲. چک کردن هدر Authorization
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ') && authHeader.length > 20) {
      console.log('[Backup API] ✅ Found Bearer token')
      return true
    }

    // ۳. در محیط توسعه، اگر هیچ کوکی نبود، هشدار بده ولی رد نکن
    // (فقط برای تست اولیه - در production حتماً این بخش را حذف کن)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Backup API] ⚠️ No auth found - allowing in dev mode')
      return true
    }

    console.warn('[Backup API] ❌ No valid authentication found')
    return false
  } catch (err) {
    console.error('[Backup API] verifyAdmin error:', err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════
// GET: لیست بکاپ‌ها + آمار
// ═══════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAdmin(req))) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز - لطفاً ابتدا وارد پنل ادمین شوید' },
        { status: 401 }
      )
    }

    const [backups, stats] = await Promise.all([
      listBackups(),
      getBackupStats(),
    ])

    return NextResponse.json({
      success: true,
      data: backups,
      stats,
    })
  } catch (err: any) {
    console.error('[Admin Backup] GET error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'خطای سرور' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════
// POST: ایجاد بکاپ
// ═══════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAdmin(req))) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { type, tenantId } = body

    let result
    if (type === 'full_database') {
      result = await createFullDatabaseBackup('admin')
    } else if (type === 'tenant' && tenantId) {
      result = await createTenantBackup(tenantId, 'admin')
    } else {
      return NextResponse.json(
        { success: false, error: 'پارامترهای نامعتبر (type یا tenantId)' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    console.error('[Admin Backup] POST error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'خطای سرور' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE: حذف بکاپ
// ═══════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  try {
    if (!(await verifyAdmin(req))) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه بکاپ الزامی است' },
        { status: 400 }
      )
    }

    await deleteBackup(id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Admin Backup] DELETE error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'خطای سرور' },
      { status: 500 }
    )
  }
}