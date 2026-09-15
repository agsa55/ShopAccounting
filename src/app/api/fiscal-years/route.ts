// ============================================================================
// src/app/api/fiscal-years/route.ts — v9.1 ★★★
// ShopAccounting — Fiscal Year Management API
// ============================================================================
// ★★★ v9.1: حذف ساخت سال جدید و سند افتتاحیه از PUT
//   - PUT فقط: بستن + سند اختتامیه
//   - سال جدید توسط SetupWizard (renewal_setup) ساخته می‌شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET — لیست سال‌های مالی + سال فعال
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const years = await tenantDb.fiscalYear.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    }).catch(() => [])

    const activeYearRaw = years.find((y: any) => y.isActive && !y.isClosed) || null

    let activeYear = activeYearRaw
    if (activeYearRaw) {
      let entryCount = 0
      try {
        entryCount = await tenantDb.journalEntry.count({
          where: {
            tenantId,
            date: {
              gte: activeYearRaw.startDate,
              lte: activeYearRaw.endDate,
            },
            status: 'posted',
          },
        }).catch(() => 0)
      } catch {}

      const startMs = new Date(activeYearRaw.startDate).getTime()
      const endMs = new Date(activeYearRaw.endDate).getTime()
      const nowMs = Date.now()
      const totalMs = endMs - startMs
      const elapsedMs = nowMs - startMs
      const progress = Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)))

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
            date: { gte: y.startDate, lte: y.endDate },
            status: 'posted',
          },
        }).catch(() => 0)
      } catch {}

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
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری سال‌های مالی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST — تعریف سال مالی جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canFiscalYearManagement) {
      return NextResponse.json(
        { success: false, error: 'مدیریت سال مالی فقط در پلن حرفه‌ای و سازمانی در دسترس است' },
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

    const overlapping = await tenantDb.fiscalYear.findFirst({
      where: { tenantId, AND: [{ startDate: { lt: end } }, { endDate: { gt: start } }] },
    }).catch(() => null)
    if (overlapping) {
      return NextResponse.json(
        { success: false, error: `بازه سال مالی با سال موجود «${overlapping.name}» هم‌پوشانی دارد` },
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

    if (activate) {
      await tenantDb.fiscalYear.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      }).catch(() => {})
      await tenantDb.fiscalYear.update({
        where: { id: newYear.id },
        data: { isActive: true },
      })
      newYear.isActive = true
    }

    return NextResponse.json({
      success: true,
      data: newYear,
      message: activate
        ? `سال مالی «${newYear.name}» ایجاد و فعال شد`
        : `سال مالی «${newYear.name}» ایجاد شد`,
    })
  } catch (error: any) {
    console.error('[FiscalYears POST] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در ایجاد سال مالی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT — بستن سال فعال + سند اختتامیه (بدون سال جدید)
//  ★ v9.1: فقط بستن + اختتامیه — سال جدید توسط SetupWizard ساخته می‌شود
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canCloseFiscalYear) {
        return NextResponse.json(
          { success: false, error: 'بستن سال مالی فقط در پلن حرفه‌ای و سازمانی در دسترس است' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      const {
        forceClose,
        earlyCloseReason,
        earlyCloseConfirmed,
      } = body

      // ── ۱. یافتن سال فعال ────────────────────────────────────
      const activeYear = await tenantDb.fiscalYear.findFirst({
        where: { tenantId, isActive: true, isClosed: false },
      })

      if (!activeYear) {
        return NextResponse.json(
          { success: false, error: 'هیچ سال مالی فعالی برای بستن وجود ندارد' },
          { status: 400 }
        )
      }

      // ── ۲. محاسبات زمانی و تعیین حالت ───────────────────────
      const now = new Date()
      const startDate = new Date(activeYear.startDate)
      const endDate = new Date(activeYear.endDate)

      const daysUntilEnd = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      const daysPassed = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      const NORMAL_WINDOW_DAYS = 7
      const MIN_DAYS_FOR_EARLY = 180

      let closeMode: 'normal' | 'early' | 'too_early' = 'normal'
      if (daysUntilEnd <= NORMAL_WINDOW_DAYS) {
        closeMode = 'normal'
      } else if (daysPassed >= MIN_DAYS_FOR_EARLY) {
        closeMode = 'early'
      } else {
        closeMode = 'too_early'
      }

      // ── ۳. اعتبارسنجی بر اساس حالت ───────────────────────────
      if (closeMode === 'too_early' && !forceClose) {
        return NextResponse.json(
          {
            success: false,
            error: `بستن سال مالی در این زمان ممکن نیست. فقط ${daysPassed} روز از سال سپری شده است. حداقل ${MIN_DAYS_FOR_EARLY} روز لازم است.`,
            code: 'TOO_EARLY',
          },
          { status: 400 }
        )
      }

      if (closeMode === 'early' && !earlyCloseConfirmed) {
        return NextResponse.json(
          {
            success: false,
            error: 'برای بستن زودهنگام سال مالی، تأیید ویژه لازم است.',
            code: 'EARLY_CLOSE_NOT_CONFIRMED',
          },
          { status: 400 }
        )
      }

      if (closeMode === 'early' && (!earlyCloseReason || earlyCloseReason.trim().length < 10)) {
        return NextResponse.json(
          {
            success: false,
            error: 'برای بستن زودهنگام، دلیل موجه (حداقل ۱۰ کاراکتر) الزامی است.',
            code: 'EARLY_CLOSE_REASON_REQUIRED',
          },
          { status: 400 }
        )
      }

      // ── ۴. بررسی اسناد Draft ──────────────────────────────────
      if (!forceClose) {
        const draftCount = await tenantDb.journalEntry.count({
          where: {
            tenantId,
            status: 'draft',
            date: { gte: activeYear.startDate, lte: activeYear.endDate },
          },
        })
        if (draftCount > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `${draftCount} سند Draft وجود دارد. ابتدا آنها را تأیید یا حذف کنید.`,
              code: 'HAS_DRAFT_ENTRIES',
            },
            { status: 400 }
          )
        }
      }

      // ── ۵. ساخت توضیحات سال ──────────────────────────────────
      let notesText = `بسته شد در ${new Date().toISOString().split('T')[0]}`
      if (closeMode === 'early') {
        notesText += ` — ⚠️ بستن زودهنگام (${daysUntilEnd} روز زودتر) — دلیل: ${earlyCloseReason.trim()}`
      }

      // ── ۶. اجرای تراکنش (فقط بستن + اختتامیه) ───────────────
      const result = await tenantDb.$transaction(async (tx: any) => {
        const { createClosingEntry } = await import('@/lib/accounting/closing-entry')

        // ۶.۱. صدور سند اختتامیه
        const closingResult = await createClosingEntry(
          tx,
          tenantId,
          activeYear.id,
          activeYear.name,
          activeYear.endDate
        )

        if (!closingResult.success) {
          throw new Error(`خطا در ایجاد سند اختتامیه: ${closingResult.error}`)
        }

        // ۶.۲. بستن سال فعلی (بدون ایجاد سال جدید)
        await tx.fiscalYear.update({
          where: { id: activeYear.id },
          data: {
            isClosed: true,
            closedAt: new Date(),
            isActive: false,
            notes: `${notesText} — سود/زیان: ${closingResult.netProfit.toLocaleString('fa-IR')} ریال — سند اختتامیه: ${closingResult.entryNumber}`,
          },
        })

        return {
          closedYear: {
            id: activeYear.id,
            name: activeYear.name,
            startDate: activeYear.startDate,
            endDate: activeYear.endDate,
            closedAt: new Date(),
          },
          closingEntry: {
            number: closingResult.entryNumber,
            totalRevenue: closingResult.totalRevenue,
            totalExpense: closingResult.totalExpense,
            netProfit: closingResult.netProfit,
          },
          closeMode,
          earlyCloseReason: closeMode === 'early' ? earlyCloseReason : null,
        }
      })

      const message = `سال مالی «${activeYear.name}» با موفقیت بسته شد. سند اختتامیه صادر شد.`

      return NextResponse.json({
        success: true,
        data: result,
        message,
      })
    } catch (error: any) {
      console.error('[FiscalYears PUT] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در بستن سال مالی' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  PATCH — عملیات روی یک سال مالی (activate / update)
// ═══════════════════════════════════════════════════════════════

export const PATCH = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canFiscalYearManagement) {
        return NextResponse.json(
          { success: false, error: 'مدیریت سال مالی در پلن فعلی در دسترس نیست' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      // استخراج yearId از URL
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

        await tenantDb.fiscalYear.updateMany({
          where: { tenantId, isActive: true },
          data: { isActive: false },
        }).catch(() => {})

        await tenantDb.fiscalYear.update({
          where: { id: yearId },
          data: { isActive: true },
        })

        return NextResponse.json({
          success: true,
          message: `سال مالی «${year.name}» فعال شد`,
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
//  DELETE — حذف سال مالی (فقط سال‌های خالی و غیرفعال)
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canFiscalYearManagement) {
        return NextResponse.json(
          { success: false, error: 'مدیریت سال مالی در پلن فعلی در دسترس نیست' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      // استخراج yearId از URL
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
          { success: false, error: 'سال فعال قابل حذف نیست. ابتدا سال دیگری را فعال کنید' },
          { status: 400 }
        )
      }

      // بررسی وجود اسناد در این سال
      const entryCount = await tenantDb.journalEntry.count({
        where: {
          tenantId,
          date: { gte: year.startDate, lte: year.endDate },
        },
      })

      if (entryCount > 0) {
        return NextResponse.json(
          { success: false, error: `این سال مالی دارای ${entryCount} سند است و قابل حذف نیست` },
          { status: 400 }
        )
      }

      await tenantDb.fiscalYear.delete({
        where: { id: yearId },
      })

      return NextResponse.json({
        success: true,
        message: `سال مالی «${year.name}» حذف شد`,
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

// ═══════════════════════════════════════════════════════════════
//  Helper — تولید نام سال بعدی (با پشتیبانی ارقام فارسی)
// ═══════════════════════════════════════════════════════════════

function generateNextYearName(prevName: string): string {
  const faYearMatch = prevName.match(/([۰-۹]{4}|\d{4})/)
  if (faYearMatch) {
    const yearStr = faYearMatch[1]
    const isFa = /[۰-۹]/.test(yearStr)
    let year: number
    if (isFa) {
      year = parseInt(
        yearStr.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
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