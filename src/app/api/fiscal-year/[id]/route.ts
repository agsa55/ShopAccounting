// src/app/api/fiscal-years/[id]/route.ts
// ShopAccounting v6.7 — Fiscal Year Detail API
// ============================================================================
// ★ PATCH: فعال‌سازی یا ویرایش سال مالی
// ★ DELETE: حذف سال مالی (فقط اگه بسته نشده و سند نداره)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  PATCH /api/fiscal-years/[id] — فعال‌سازی یا ویرایش
//  Body: { action: 'activate' | 'update', name?: string }
// ═══════════════════════════════════════════════════════════════

export const PATCH = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const paramsObj = ctx.params && typeof ctx.params?.then === 'function'
      ? await ctx.params
      : ctx.params
    const id = paramsObj?.id

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    const existing = await tenantDb.fiscalYear.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'سال مالی یافت نشد' }, { status: 404 })
    }

    const action = body.action || 'update'

    // ═══════════════════════════════════════════════════════════════
    //  فعال‌سازی
    // ═══════════════════════════════════════════════════════════════
    if (action === 'activate') {
      if (existing.isClosed) {
        return NextResponse.json({
          success: false,
          error: 'سال مالی بسته‌شده قابل فعال‌سازی نیست',
        }, { status: 400 })
      }

      const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

      await txClient.$transaction(async (tx: any) => {
        // ★ غیرفعال کردن همه سال‌های فعال
        await tx.fiscalYear.updateMany({
          where: { tenantId, isActive: true },
          data: { isActive: false },
        })

        // ★ فعال‌سازی سال مورد نظر
        await tx.fiscalYear.update({
          where: { id },
          data: { isActive: true },
        })
      })

      return NextResponse.json({
        success: true,
        message: `سال مالی «${existing.name}» فعال شد`,
      })
    }

    // ═══════════════════════════════════════════════════════════════
    //  ویرایش نام
    // ═══════════════════════════════════════════════════════════════
    if (action === 'update') {
      if (!body.name || body.name.trim().length < 2) {
        return NextResponse.json({
          success: false,
          error: 'نام سال مالی باید حداقل ۲ کاراکتر باشد',
        }, { status: 400 })
      }

      await tenantDb.fiscalYear.update({
        where: { id },
        data: { name: body.name.trim() },
      })

      return NextResponse.json({
        success: true,
        message: 'نام سال مالی به‌روزرسانی شد',
      })
    }

    return NextResponse.json({
      success: false,
      error: 'action نامعتبر است (activate یا update)',
    }, { status: 400 })
  } catch (error: any) {
    console.error('[FiscalYears PATCH] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در به‌روزرسانی',
    }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/fiscal-years/[id] — حذف سال مالی
//  ★ فقط سال‌های بسته‌نشده و بدون سند قابل حذف هستن
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const paramsObj = ctx.params && typeof ctx.params?.then === 'function'
      ? await ctx.params
      : ctx.params
    const id = paramsObj?.id

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    const existing = await tenantDb.fiscalYear.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'سال مالی یافت نشد' }, { status: 404 })
    }

    // ★ سال بسته‌شده قابل حذف نیست
    if (existing.isClosed) {
      return NextResponse.json({
        success: false,
        error: 'سال مالی بسته‌شده قابل حذف نیست',
      }, { status: 400 })
    }

    // ★ بررسی وجود سند
    const jeCount = await tenantDb.journalEntry.count({
      where: { fiscalYearId: id },
    }).catch(() => 0)

    if (jeCount > 0) {
      return NextResponse.json({
        success: false,
        error: `این سال مالی ${jeCount} سند حسابداری دارد و قابل حذف نیست`,
      }, { status: 400 })
    }

    await tenantDb.fiscalYear.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: `سال مالی «${existing.name}» حذف شد`,
    })
  } catch (error: any) {
    console.error('[FiscalYears DELETE] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در حذف',
    }, { status: 500 })
  }
})
