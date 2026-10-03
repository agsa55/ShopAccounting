// ============================================================================
// src/app/api/tenants/export-database/route.ts
// API Route: Export / Sell Database — v5.1
//
// قابلیت فروش کل وبسایت:
//   - بکاپ‌گیری از دیتابیس اختصاصی فروشگاه
//   - ثبت اطلاعات فروش (نام خریدار، شماره تماس)
//   - تغییر وضعیت Tenant به "sold"
//   - ایجاد AuditLog
//
// POST /api/tenants/export-database
//
// ★ v5.1:
//   - حذف کامل mssql و SQL Server
//   - سازگار با PostgreSQL / Prisma
//   - استفاده از backup-service داخلی پروژه
//   - رفع خطاهای TypeScript و runtime
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest, isFullAccessRole } from '@/lib/jwt'
import { randomUUID } from 'node:crypto'
import { createTenantBackup } from '@/lib/admin/backup-service'

// ★ این API حتماً باید در Node.js runtime اجرا شود
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // ─── احراز هویت کاربر ───────────────────────────────────────
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'دسترسی غیرمجاز.',
          errorCode: 'UNAUTHORIZED',
        },
        { status: 401 }
      )
    }

    const userRole = (user as any).role

    // فقط نقش‌های کامل مثل Owner / Admin / SuperAdmin
    if (!isFullAccessRole(userRole)) {
      return NextResponse.json(
        {
          success: false,
          error: 'شما مجوز فروش وبسایت را ندارید.',
          errorCode: 'FORBIDDEN',
        },
        { status: 403 }
      )
    }

    // ─── دریافت بدنه درخواست ────────────────────────────────────
    const body = await request.json().catch(() => ({}))

    const soldTo = String(body?.soldTo ?? '').trim()
    const soldToContact = String(body?.soldToContact ?? '').trim()

    if (!soldTo || !soldToContact) {
      return NextResponse.json(
        {
          success: false,
          error: 'نام خریدار و شماره تماس الزامی است.',
        },
        { status: 400 }
      )
    }

    // ─── تعیین tenantId ─────────────────────────────────────────
    // اگر کاربر فروشگاه‌دار بود، tenantId از توکن گرفته می‌شود.
    // اگر ادمین بود و tenantId نداشت، می‌تواند از body بفرستد.
    let tenantId = (user as any).tenantId as string | undefined

    if (!tenantId && body?.tenantId) {
      tenantId = String(body.tenantId).trim()
    }

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'شناسه فروشگاه مشخص نشده است.',
          errorCode: 'NO_TENANT',
        },
        { status: 400 }
      )
    }

    const actingUserId =
      (user as any).userId ||
      (user as any).id ||
      'system'

    // برای جلوگیری از خطاهای TypeScript به دلیل تفاوت schema
    const masterDb = db.master as any

    // ─── بررسی وجود فروشگاه ─────────────────────────────────────
    const tenant = await masterDb.tenant.findUnique({
      where: { id: tenantId },
    })

    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          error: 'فروشگاه یافت نشد.',
        },
        { status: 404 }
      )
    }

    if (String(tenant.status) === 'sold') {
      return NextResponse.json(
        {
          success: false,
          error: 'این فروشگاه قبلاً فروخته شده است.',
        },
        { status: 409 }
      )
    }

    // ─── ایجاد بکاپ از دیتابیس فروشگاه ──────────────────────────
    let backup: Awaited<ReturnType<typeof createTenantBackup>>

    try {
      backup = await createTenantBackup(tenantId, String(actingUserId))
    } catch (backupError: any) {
      console.error(
        '[ExportDatabase] Backup error:',
        backupError?.message || backupError
      )

      return NextResponse.json(
        {
          success: false,
          error: `خطا در بکاپ‌گیری: ${backupError?.message || 'نامشخص'}`,
        },
        { status: 500 }
      )
    }

    // ─── بروزرسانی وضعیت فروشگاه به sold ────────────────────────
    try {
      await masterDb.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'sold',
          soldAt: new Date(),
          soldTo,
          soldToContact,
        },
      })
    } catch (updateError: any) {
      console.error(
        '[ExportDatabase] Tenant update error:',
        updateError?.message || updateError
      )

      return NextResponse.json(
        {
          success: false,
          error:
            'بکاپ ساخته شد اما وضعیت فروشگاه به‌روز نشد. لطفاً فیلدهای status / soldAt / soldTo / soldToContact را در مدل Tenant بررسی کنید.',
          details: updateError?.message,
          backupId: backup.id,
        },
        { status: 500 }
      )
    }

    // ─── بروزرسانی اشتراک (اختیاری و غیرمسدودکننده) ─────────────
    try {
      const subscriptions = await masterDb.subscription.findMany({
        where: { tenantId },
      })

      const activeSubscription = Array.isArray(subscriptions)
        ? subscriptions.find((sub: any) => String(sub?.status) === 'active')
        : null

      if (activeSubscription?.id) {
        await masterDb.subscription.update({
          where: { id: activeSubscription.id },
          data: {
            status: 'sold',
            endDate: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000), // ۱۰۰ سال
          },
        })
      }
    } catch (subscriptionError: any) {
      console.warn(
        '[ExportDatabase] Subscription update skipped:',
        subscriptionError?.message || subscriptionError
      )
    }

    // ─── ثبت AuditLog (اختیاری و غیرمسدودکننده) ─────────────────
    try {
      await masterDb.auditLog.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId: String(actingUserId),
          action: 'tenant.sell_database',
          entityType: 'Tenant',
          entityId: tenantId,
          details: JSON.stringify({
            soldTo,
            soldToContact,
            backupId: backup.id,
            backupFileName: backup.fileName,
            backupSize: backup.fileSize,
            recordCount: backup.recordCount,
          }),
        },
      })
    } catch (auditError: any) {
      console.warn(
        '[ExportDatabase] Audit log skipped:',
        auditError?.message || auditError
      )
    }

    // ─── پاسخ موفقیت ────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: 'فروش وبسایت ثبت شد! بکاپ دیتابیس آماده تحویل است.',
      data: {
        tenantId,
        companyName: tenant.companyName,
        soldTo,
        soldToContact,
        backupId: backup.id,
        backupFileName: backup.fileName,
        backupSize: backup.fileSize,
        recordCount: backup.recordCount,
        durationMs: backup.duration,
        downloadUrl: `/api/admin/backup/download?id=${backup.id}`,
        status: 'sold',
        deliveryNote:
          'فایل بکاپ و دسترسی دیتابیس ظرف ۴۸ ساعت کاری تحویل داده خواهد شد.',
      },
    })
  } catch (error: any) {
    console.error('[ExportDatabase] Error:', error?.message || error)

    return NextResponse.json(
      {
        success: false,
        error: 'خطای داخلی سرور.',
        details:
          process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    )
  }
}