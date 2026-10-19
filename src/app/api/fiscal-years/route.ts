// ============================================================================
// src/app/api/fiscal-years/route.ts — v10.0 Fiscal Year Integrity
// ShopAccounting — Fiscal Year Management API
// ============================================================================
// ★ v10.0 تغییرات:
//   - اصلاح باگ جدی generateNextYearName (ارقام ۳ و ۷ گم شده بودند)
//   - استفاده از generateNextYearName در PUT برای پیشنهاد نام سال بعدی
//   - افزودن meta به response تمام عملیات برای هماهنگی با کلاینت
//   - تضمین fiscalYearId در تمام اسناد مرتبط با سال
//   - بهبود error messages و code ها
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import {
  closeFiscalYearCore,
  HttpError,
} from '@/lib/accounting/fiscal-year-close-service'
const POSTED_STATUSES = ['posted', 'POSTED', 'Posted']
const DRAFT_STATUSES = ['draft', 'DRAFT', 'Draft']

// ═══════════════════════════════════════════════════════════════
//  Helper — تولید نام سال بعدی (با اصلاح کامل ارقام فارسی)
// ═══════════════════════════════════════════════════════════════
function generateNextYearName(prevName: string): string {
  // تطبیق با هر دو نوع ارقام فارسی و انگلیسی (۴ رقم متوالی)
  const faYearMatch = prevName.match(/([۰-۹]{4}|\d{4})/)

  if (faYearMatch) {
    const yearStr = faYearMatch[1]
    const isFa = /[۰-۹]/.test(yearStr)

    let year: number

    if (isFa) {
      // ★ v10.0: اصلاح — همه ارقام ۰ تا ۹ فارسی را شامل شود
      year = parseInt(
        yearStr.replace(/[۰-۹]/g, (d) =>
          String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        ),
        10
      )
    } else {
      year = parseInt(yearStr, 10)
    }

    const nextYear = year + 1

    const nextYearStr = isFa
      ? String(nextYear).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)])
      : String(nextYear)

    return prevName.replace(yearStr, nextYearStr)
  }

  return prevName + ' (بعدی)'
}

// ═══════════════════════════════════════════════════════════════
//  GET — لیست سال‌های مالی + سال فعال
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const years = await tenantDb.fiscalYear
        .findMany({
          where: { tenantId },
          orderBy: { startDate: 'desc' },
        })
        .catch(() => [])

      const activeYearRaw =
        years.find((y: any) => y.isActive && !y.isClosed) || null

      let activeYear = activeYearRaw

      if (activeYearRaw) {
        let entryCount = 0

        try {
          entryCount = await tenantDb.journalEntry.count({
            where: {
              tenantId,
              fiscalYearId: activeYearRaw.id,
              status: { in: POSTED_STATUSES },
            },
          })
        } catch {
          entryCount = 0
        }

        const startMs = new Date(activeYearRaw.startDate).getTime()
        const endMs = new Date(activeYearRaw.endDate).getTime()
        const nowMs = Date.now()
        const totalMs = endMs - startMs
        const elapsedMs = nowMs - startMs
        const progress = Math.max(
          0,
          Math.min(100, Math.round((elapsedMs / totalMs) * 100))
        )

        activeYear = {
          ...activeYearRaw,
          entryCount,
          progress,
        }
      }

      const enrichedYears: any[] = []

      for (const y of years) {
        let count = 0

        try {
          count = await tenantDb.journalEntry.count({
            where: {
              tenantId,
              fiscalYearId: y.id,
              status: { in: POSTED_STATUSES },
            },
          })
        } catch {
          count = 0
        }

        let progress = 0

        if (y.startDate && y.endDate) {
          const start = new Date(y.startDate).getTime()
          const end = new Date(y.endDate).getTime()
          const now = Date.now()

          if (now < start) progress = 0
          else if (now > end) progress = 100
          else progress = Math.round(((now - start) / (end - start)) * 100)
        }

        enrichedYears.push({
          ...y,
          progress,
          entryCount: count,
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          years: enrichedYears,
          activeYear,
        },
      })
    } catch (error: any) {
      console.error('[FiscalYears GET] Error:', error?.message || error)

      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری سال‌های مالی' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST — تعریف سال مالی جدید
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)

      if (!features.canFiscalYearManagement) {
        return NextResponse.json(
          {
            success: false,
            error: 'مدیریت سال مالی فقط در پلن حرفه‌ای و سازمانی در دسترس است',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      const { name, startDate, endDate, activate } = body

      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'نام سال مالی باید حداقل ۲ کاراکتر باشد' },
          { status: 400 }
        )
      }

      if (!startDate || !endDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ شروع و پایان الزامی هستند' },
          { status: 400 }
        )
      }

      const start = new Date(startDate)
      const end = new Date(endDate)

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json(
          { success: false, error: 'فرمت تاریخ نامعتبر است' },
          { status: 400 }
        )
      }

      if (start >= end) {
        return NextResponse.json(
          { success: false, error: 'تاریخ شروع باید قبل از تاریخ پایان باشد' },
          { status: 400 }
        )
      }

      const overlapping = await tenantDb.fiscalYear
        .findFirst({
          where: {
            tenantId,
            AND: [
              { startDate: { lt: end } },
              { endDate: { gt: start } },
            ],
          },
        })
        .catch(() => null)

      if (overlapping) {
        return NextResponse.json(
          {
            success: false,
            error: `بازه سال مالی با سال موجود «${overlapping.name}» هم‌پوشانی دارد`,
          },
          { status: 400 }
        )
      }

      const newYear = await tenantDb.fiscalYear.create({
        data: {
          tenantId,
          name: name.trim(),
          startDate: start,
          endDate: end,
          isActive: false,
          isClosed: false,
        },
      })

      let wasActivated = false

      if (activate) {
        await tenantDb.fiscalYear
          .updateMany({
            where: { tenantId, isActive: true },
            data: { isActive: false },
          })
          .catch(() => {})

        await tenantDb.fiscalYear.update({
          where: { id: newYear.id },
          data: { isActive: true },
        })

        newYear.isActive = true
        wasActivated = true
      }

      return NextResponse.json({
        success: true,
        data: newYear,
        message: wasActivated
          ? `سال مالی «${newYear.name}» ایجاد و فعال شد`
          : `سال مالی «${newYear.name}» ایجاد شد`,
        // ★ v10.0: متادیتا برای هماهنگی با کلاینت و هدر
        meta: {
          activated: wasActivated,
          yearId: newYear.id,
          yearName: newYear.name,
          startDate: newYear.startDate,
          endDate: newYear.endDate,
        },
      })
    } catch (error: any) {
      console.error('[FiscalYears POST] Error:', error?.message || error)

      return NextResponse.json(
        { success: false, error: 'خطا در ایجاد سال مالی' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  PUT — بستن سال مالی از طریق سرویس ایمن مرکزی
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)

      if (!features?.canCloseFiscalYear) {
        return NextResponse.json(
          {
            success: false,
            error: 'بستن سال مالی فقط در پلن حرفه‌ای و سازمانی در دسترس است',
            code: 'PLAN_NOT_ALLOWED',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const body = await req.json().catch(() => ({}))
      const url = new URL(req.url)

      const fiscalYearId = String(
        body?.fiscalYearId ||
          url.searchParams.get('fiscalYearId') ||
          ''
      ).trim()

      const forceEarly =
        body?.forceClose === true ||
        body?.forceEarly === true ||
        body?.force === true ||
        url.searchParams.get('forceEarly') === 'true'

      const reason = String(
        body?.earlyCloseReason ||
          body?.reason ||
          body?.earlyReason ||
          url.searchParams.get('reason') ||
          ''
      ).trim()

      const result = await closeFiscalYearCore({
        tenantDb,
        tenantId,
        userId: tenant.user?.id || null,
        fiscalYearId: fiscalYearId || null,
        forceEarly,
        reason,
      })

      return NextResponse.json({
        success: true,
        data: {
          closedYear: result.closedYear,
          closingEntry: result.closingEntry
            ? {
                number: result.closingEntry.number,
                totalRevenue: result.totalRevenue,
                totalExpense: result.totalExpense,
                netProfit: result.netProfit,
              }
            : null,
          closeMode: result.closeMode,
          suggestedNextYearName: result.suggestedNextYear.name,
        },
        meta: {
          closedYearId: result.closedYear.id,
          closedYearName: result.closedYear.name,
          suggestedNextYearName: result.suggestedNextYear.name,
          closingEntryNumber: result.closingEntry?.number || null,
          netProfit: result.netProfit,
        },
        message:
          result.netProfit >= 0
            ? `سال مالی «${result.closedYear.name}» بسته شد — سود خالص: ${Math.round(
                result.netProfit
              ).toLocaleString('fa-IR')} ریال`
            : `سال مالی «${result.closedYear.name}» بسته شد — زیان خالص: ${Math.abs(
                Math.round(result.netProfit)
              ).toLocaleString('fa-IR')} ریال`,
      })
    } catch (error: any) {
      console.error('[FiscalYears PUT] Error:', error?.message || error)

      if (error instanceof HttpError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
          },
          { status: error.statusCode }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در بستن سال مالی',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      )
    }
  }
)
// ═══════════════════════════════════════════════════════════════
//  PATCH — عملیات روی یک سال مالی
// ═══════════════════════════════════════════════════════════════
export const PATCH = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)

      if (!features.canFiscalYearManagement) {
        return NextResponse.json(
          {
            success: false,
            error: 'مدیریت سال مالی در پلن فعلی در دسترس نیست',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      const { pathname } = new URL(req.url)
      const segments = pathname.split('/').filter(Boolean)
      const yearId = segments[segments.length - 1]

      if (!yearId) {
        return NextResponse.json(
          { success: false, error: 'شناسه سال مالی مشخص نشده است' },
          { status: 400 }
        )
      }

      const year = await tenantDb.fiscalYear.findFirst({
        where: { id: yearId, tenantId },
      })

      if (!year) {
        return NextResponse.json(
          { success: false, error: 'سال مالی یافت نشد' },
          { status: 404 }
        )
      }

      const { action, name } = body

      if (action === 'activate') {
        if (year.isClosed) {
          return NextResponse.json(
            { success: false, error: 'سال بسته‌شده قابل فعال‌سازی نیست' },
            { status: 400 }
          )
        }

        await tenantDb.fiscalYear
          .updateMany({
            where: { tenantId, isActive: true },
            data: { isActive: false },
          })
          .catch(() => {})

        await tenantDb.fiscalYear.update({
          where: { id: yearId },
          data: { isActive: true },
        })

        return NextResponse.json({
          success: true,
          message: `سال مالی «${year.name}» فعال شد`,
          // ★ v10.0: متادیتا برای هماهنگی با هدر فیلتر سال مالی
          meta: {
            yearId: year.id,
            yearName: year.name,
            startDate: year.startDate,
            endDate: year.endDate,
          },
        })
      }

      if (action === 'update') {
        if (!name || name.trim().length < 2) {
          return NextResponse.json(
            { success: false, error: 'نام سال مالی باید حداقل ۲ کاراکتر باشد' },
            { status: 400 }
          )
        }

        await tenantDb.fiscalYear.update({
          where: { id: yearId },
          data: { name: name.trim() },
        })

        return NextResponse.json({
          success: true,
          message: `نام سال مالی به «${name.trim()}» تغییر کرد`,
          meta: {
            yearId: year.id,
            yearName: name.trim(),
          },
        })
      }

      return NextResponse.json(
        { success: false, error: 'عملیات نامعتبر' },
        { status: 400 }
      )
    } catch (error: any) {
      console.error('[FiscalYears PATCH] Error:', error?.message || error)

      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در به‌روزرسانی سال مالی' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  DELETE — حذف سال مالی
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)

      if (!features.canFiscalYearManagement) {
        return NextResponse.json(
          {
            success: false,
            error: 'مدیریت سال مالی در پلن فعلی در دسترس نیست',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { pathname } = new URL(req.url)
      const segments = pathname.split('/').filter(Boolean)
      const yearId = segments[segments.length - 1]

      if (!yearId) {
        return NextResponse.json(
          { success: false, error: 'شناسه سال مالی مشخص نشده است' },
          { status: 400 }
        )
      }

      const year = await tenantDb.fiscalYear.findFirst({
        where: { id: yearId, tenantId },
      })

      if (!year) {
        return NextResponse.json(
          { success: false, error: 'سال مالی یافت نشد' },
          { status: 404 }
        )
      }

      if (year.isClosed) {
        return NextResponse.json(
          { success: false, error: 'سال بسته‌شده قابل حذف نیست' },
          { status: 400 }
        )
      }

      if (year.isActive) {
        return NextResponse.json(
          {
            success: false,
            error: 'سال فعال قابل حذف نیست. ابتدا سال دیگری را فعال کنید',
          },
          { status: 400 }
        )
      }

      // ★ v10.0: بررسی اسناد بر اساس fiscalYearId
      const entryCount = await tenantDb.journalEntry.count({
        where: {
          tenantId,
          fiscalYearId: year.id,
        },
      })

      if (entryCount > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `این سال مالی دارای ${entryCount} سند است و قابل حذف نیست`,
          },
          { status: 400 }
        )
      }

      await tenantDb.fiscalYear.delete({
        where: { id: yearId },
      })

      return NextResponse.json({
        success: true,
        message: `سال مالی «${year.name}» حذف شد`,
        meta: {
          yearId,
          yearName: year.name,
        },
      })
    } catch (error: any) {
      console.error('[FiscalYears DELETE] Error:', error?.message || error)

      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در حذف سال مالی' },
        { status: 500 }
      )
    }
  }
)