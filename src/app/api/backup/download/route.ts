// ============================================================================
// src/app/api/backup/download/route.ts — GET /api/backup/download (v3.1)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/jwt'

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    const tenantId = user.tenantId
    const { searchParams } = new URL(request.url)
    const backupId = searchParams.get('id')

    if (!backupId) {
      return NextResponse.json(
        { success: false, error: 'شناسه پشتیبان الزامی است' },
        { status: 400 }
      )
    }

    // ★ فقط پشتیبان خودش رو برگردونه
    const backup = await db.client.backup.findFirst({
      where: { id: backupId, tenantId },
    })

    if (!backup || !backup.data) {
      return NextResponse.json(
        { success: false, error: 'پشتیبان یافت نشد' },
        { status: 404 }
      )
    }

    // ★ برگرداندن فایل JSON برای دانلود
    return new NextResponse(backup.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${backup.fileName}"`,
      },
    })
  } catch (error: any) {
    console.error('[Backup/Download] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در دانلود پشتیبان' },
      { status: 500 }
    )
  }
}
