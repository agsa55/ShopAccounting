// ============================================================================
// src/app/api/backup/download/route.ts — دانلود فایل بکاپ
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const { searchParams } = new URL(req.url)
      const backupId = searchParams.get('id')

      if (!backupId) {
        return NextResponse.json(
          { success: false, error: 'شناسه بکاپ الزامی است' },
          { status: 400 }
        )
      }

      const backup = await db.client.backup.findFirst({
        where: { id: backupId, tenantId: tenant.tenantId },
      })

      if (!backup || !backup.data) {
        return NextResponse.json(
          { success: false, error: 'بکاپ یافت نشد' },
          { status: 404 }
        )
      }

      // تبدیل Base64 به Buffer
      const buffer = Buffer.from(backup.data, 'base64')

      // بازگرداندن به صورت فایل قابل دانلود
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': `attachment; filename="${backup.fileName}"`,
          'Content-Length': buffer.length.toString(),
        },
      })
    } catch (error: any) {
      console.error('[Backup Download] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در دانلود پشتیبان' },
        { status: 500 }
      )
    }
  }
)