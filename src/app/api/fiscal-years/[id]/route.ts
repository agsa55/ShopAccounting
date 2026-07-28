// ============================================================================
// src/app/api/fiscal-years/[id]/route.ts — Single Fiscal Year API (v3.26 ★)
// ============================================================================
// ★★★ v3.26: عملیات روی یک سال مالی خاص
//
// Supported methods:
//
//   PATCH  /api/fiscal-years/[id]
//     - فعال‌سازی سال مالی (تنها یک سال فعال در هر لحظه)
//     - ویرایش نام/توضیحات (فقط اگر بسته نشده باشد)
//     - body: { action: 'activate' | 'update', name?, notes? }
//
//   DELETE /api/fiscal-years/[id]
//     - حذف سال مالی (فقط اگر بسته نشده و سند متصل ندارد)
//     - غیرقابل اجرا روی سال فعال یا سال بسته‌شده
//
//   GET    /api/fiscal-years/[id]
//     - دریافت جزئیات سال مالی + آمار اسناد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ═══════════════════════════════════════════════════════════════
//  GET — جزئیات سال مالی
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const id = (ctx.params && typeof (ctx.params as any).then === 'function' ? await ctx.params : (ctx.params || {}))?.id

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه سال مالی الزامی است' },
        { status: 400 }
      )
    }

    const year = await tenantDb.fiscalYear.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { JournalEntries: true } },
      },
    })

    if (!year) {
      return NextResponse.json(
        { success: false, error: 'سال مالی یافت نشد' },
        { status: 404 }
      )
    }

    // آمار اسناد
    const entries = await tenantDb.journalEntry.findMany({
      where: { tenantId, fiscalYearId: id, status: 'posted' },
      select: { totalDebit: true, totalCredit: true, date: true },
    })
    const totalDebit = entries.reduce((s: number, e: any) => s + (e.totalDebit || 0), 0)
    const totalCredit = entries.reduce((s: number, e: any) => s + (e.totalCredit || 0), 0)
    const entryCount = entries.length

    return NextResponse.json({
      success: true,
      data: {
        ...year,
        entryCount,
        totalDebit,
        totalCredit,
        _count: undefined,
      },
    })
  } catch (error: any) {
    console.error('[FiscalYear GET by id] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در دریافت سال مالی' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PATCH — فعال‌سازی یا ویرایش سال مالی
// ═══════════════════════════════════════════════════════════════

export const PATCH = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canFiscalYearManagement) {
      return NextResponse.json(
        { success: false, error: 'مدیریت سال مالی فقط در پلن سازمانی در دسترس است' },
        { status: 403 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه این عملیات را دارند' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const id = (ctx.params && typeof (ctx.params as any).then === 'function' ? await ctx.params : (ctx.params || {}))?.id

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه سال مالی الزامی است' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const action = body.action || 'update'

    const year = await tenantDb.fiscalYear.findFirst({
      where: { id, tenantId },
    })

    if (!year) {
      return NextResponse.json(
        { success: false, error: 'سال مالی یافت نشد' },
        { status: 404 }
      )
    }

    // ─── action: activate ───────────────────────────────────
    if (action === 'activate') {
      if (year.isClosed) {
        return NextResponse.json(
          { success: false, error: 'سال مالی بسته‌شده قابل فعال‌سازی نیست' },
          { status: 400 }
        )
      }

      // غیرفعال‌سازی همه سال‌های فعال فعلی
      await tenantDb.fiscalYear.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      })

      // فعال‌سازی سال مورد نظر
      const updated = await tenantDb.fiscalYear.update({
        where: { id },
        data: { isActive: true },
      })

      // audit log
      try {
        await tenantDb.auditLogs.create({
          data: {
            id: crypto.randomUUID(),
            tenantId,
            userId: tenant.user?.id || null,
            action: 'FISCAL_YEAR_ACTIVATE',
            entityType: 'FiscalYear',
            entityId: id,
            details: JSON.stringify({ name: year.name }),
          },
        })
      } catch (e) {
        console.warn('[FiscalYear PATCH] Audit log failed:', e)
      }

      return NextResponse.json({
        success: true,
        data: updated,
        message: `سال مالی «${year.name}» فعال شد`,
      })
    }

    // ─── action: update (ویرایش نام/توضیحات) ───────────────
    if (action === 'update') {
      if (year.isClosed) {
        return NextResponse.json(
          { success: false, error: 'سال مالی بسته‌شده قابل ویرایش نیست' },
          { status: 400 }
        )
      }

      const updates: any = {}
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length < 2) {
          return NextResponse.json(
            { success: false, error: 'نام سال مالی باید حداقل ۲ کاراکتر باشد' },
            { status: 400 }
          )
        }
        // بررسی نام تکراری (به جز خود رکورد)
        const dup = await tenantDb.fiscalYear.findFirst({
          where: { tenantId, name: body.name.trim(), NOT: { id } },
        })
        if (dup) {
          return NextResponse.json(
            { success: false, error: 'سال مالی با این نام قبلاً ثبت شده است' },
            { status: 400 }
          )
        }
        updates.name = body.name.trim()
      }
      if (body.notes !== undefined) {
        updates.notes = body.notes || null
      }

      const updated = await tenantDb.fiscalYear.update({
        where: { id },
        data: updates,
      })

      return NextResponse.json({
        success: true,
        data: updated,
        message: `سال مالی «${updated.name}» به‌روزرسانی شد`,
      })
    }

    return NextResponse.json(
      { success: false, error: 'action نامعتبر است (activate | update)' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[FiscalYear PATCH] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در به‌روزرسانی سال مالی' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE — حذف سال مالی (فقط اگر باز و بدون سند باشد)
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canFiscalYearManagement) {
      return NextResponse.json(
        { success: false, error: 'مدیریت سال مالی فقط در پلن سازمانی در دسترس است' },
        { status: 403 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه حذف سال مالی را دارند' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const id = (ctx.params && typeof (ctx.params as any).then === 'function' ? await ctx.params : (ctx.params || {}))?.id

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه سال مالی الزامی است' },
        { status: 400 }
      )
    }

    const year = await tenantDb.fiscalYear.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { JournalEntries: true } } },
    })

    if (!year) {
      return NextResponse.json(
        { success: false, error: 'سال مالی یافت نشد' },
        { status: 404 }
      )
    }

    // ★ ممنوعیت‌های حذف
    if (year.isActive) {
      return NextResponse.json(
        { success: false, error: 'سال فعال قابل حذف نیست. ابتدا سال دیگری را فعال کنید' },
        { status: 400 }
      )
    }
    if (year.isClosed) {
      return NextResponse.json(
        { success: false, error: 'سال بسته‌شده قابل حذف نیست (برای حفظ سابقه حسابداری)' },
        { status: 400 }
      )
    }
    if (year._count?.JournalEntries && year._count.JournalEntries > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `این سال مالی دارای ${year._count.JournalEntries} سند است و قابل حذف نیست`,
        },
        { status: 400 }
      )
    }

    await tenantDb.fiscalYear.delete({ where: { id } })

    // audit log
    try {
      await tenantDb.auditLogs.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          userId: tenant.user?.id || null,
          action: 'FISCAL_YEAR_DELETE',
          entityType: 'FiscalYear',
          entityId: id,
          details: JSON.stringify({ name: year.name }),
        },
      })
    } catch (e) {
      console.warn('[FiscalYear DELETE] Audit log failed:', e)
    }

    return NextResponse.json({
      success: true,
      message: `سال مالی «${year.name}» حذف شد`,
    })
  } catch (error: any) {
    console.error('[FiscalYear DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در حذف سال مالی' },
      { status: 500 }
    )
  }
})
