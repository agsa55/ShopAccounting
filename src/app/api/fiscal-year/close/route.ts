// ============================================================================
// src/app/api/fiscal-years/route.ts — Fiscal Year CRUD API (v3.26 ★★★)
// ============================================================================
// ★★★ v3.26: مدیریت کامل سال مالی
//
// Supported methods:
//
//   GET  /api/fiscal-years
//     - لیست تمام سال‌های مالی Tenant (مرتب بر اساس startDate نزولی)
//     - شامل سال فعال (active) و سال‌های بسته‌شده
//     - خروجی: { success: true, data: { years: [...], activeYear: {...} | null } }
//
//   POST /api/fiscal-years
//     - تعریف سال مالی جدید
//     - body: { name, startDate (ISO), endDate (ISO), activate?: boolean }
//     - اعتبارسنجی: عدم هم‌پوشانی با سال‌های موجود
//     - اگر activate=true، سال فعلی غیرفعال و سال جدید فعال می‌شود
//     - نیاز به پلن سازمانی (canFiscalYearManagement)
//
//   PUT  /api/fiscal-years
//     - بستن سال فعال فعلی + ایجاد خودکار سال جدید
//     - body: { newYearName?: string, newYearStartDate?: ISO, newYearEndDate?: ISO }
//     - عملیات:
//         ۱. یافتن سال فعال فعلی
//         ۲. محاسبه سود/زیان (همان منطق fiscal-year/close/route.ts)
//         ۳. ایجاد سند بستن حساب‌های درآمد/هزینه
//         ۴. علامت‌گذاری سال به‌عنوان بسته‌شده
//         ۵. غیرفعال‌سازی سال فعلی
//         ۶. ایجاد سال جدید با تاریخ شروع = روز بعد از پایان سال بسته‌شده
//         ۷. تنظیم سال جدید به‌عنوان فعال
//     - نیاز به پلن سازمانی (canCloseFiscalYear)
//
// تمام عملیات با withTenantAndPermission محافظت می‌شوند.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

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
      include: {
        _count: {
          select: { JournalEntries: true },
        },
      },
    })

    const activeYear = years.find((y: any) => y.isActive && !y.isClosed) || null

    // محاسبه پیشرفت سال فعال (درصد روزهای گذشته)
    const enrichedYears = years.map((y: any) => {
      let progress = 0
      if (y.startDate && y.endDate) {
        const start = new Date(y.startDate).getTime()
        const end = new Date(y.endDate).getTime()
        const now = Date.now()
        if (now < start) progress = 0
        else if (now > end) progress = 100
        else progress = Math.round(((now - start) / (end - start)) * 100)
      }
      return {
        ...y,
        progress,
        entryCount: y._count?.JournalEntries || 0,
        _count: undefined,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        years: enrichedYears,
        activeYear: activeYear
          ? {
              ...activeYear,
              entryCount: activeYear._count?.JournalEntries || 0,
              _count: undefined,
            }
          : null,
      },
    })
  } catch (error: any) {
    console.error('[FiscalYears GET] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در دریافت سال‌های مالی' },
      { status: 500 }
    )
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
        { success: false, error: 'مدیریت سال مالی فقط در پلن سازمانی در دسترس است' },
        { status: 403 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه تعریف سال مالی را دارند' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const { name, startDate, endDate, activate } = body

    // ─── اعتبارسنجی ────────────────────────────────────────────
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
    // حداقل ۱ ماه، حداکثر ۲ سال
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays < 28) {
      return NextResponse.json(
        { success: false, error: 'طول سال مالی باید حداقل ۲۸ روز باشد' },
        { status: 400 }
      )
    }
    if (diffDays > 731) {
      return NextResponse.json(
        { success: false, error: 'طول سال مالی نباید بیش از ۲ سال باشد' },
        { status: 400 }
      )
    }

    // ─── بررسی عدم هم‌پوشانی ───────────────────────────────────
    const overlapping = await tenantDb.fiscalYear.findFirst({
      where: {
        tenantId,
        AND: [
          { startDate: { lt: end } },
          { endDate: { gt: start } },
        ],
      },
    })
    if (overlapping) {
      return NextResponse.json(
        {
          success: false,
          error: `بازه سال مالی با سال موجود «${overlapping.name}» هم‌پوشانی دارد`,
        },
        { status: 400 }
      )
    }

    // ─── بررسی نام تکراری ──────────────────────────────────────
    const existingWithName = await tenantDb.fiscalYear.findFirst({
      where: { tenantId, name: name.trim() },
    })
    if (existingWithName) {
      return NextResponse.json(
        { success: false, error: 'سال مالی با این نام قبلاً ثبت شده است' },
        { status: 400 }
      )
    }

    // ─── ایجاد سال مالی ────────────────────────────────────────
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

    // ─── فعال‌سازی (در صورت درخواست) ──────────────────────────
    if (activate) {
      // ابتدا غیرفعال‌سازی همه سال‌های فعال فعلی
      await tenantDb.fiscalYear.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      })
      // فعال‌سازی سال جدید
      await tenantDb.fiscalYear.update({
        where: { id: newYear.id },
        data: { isActive: true },
      })
      newYear.isActive = true
    }

    console.log('[FiscalYears POST] Created:', {
      tenantId,
      yearId: newYear.id,
      name: newYear.name,
      activated: !!activate,
    })

    return NextResponse.json({
      success: true,
      data: newYear,
      message: activate
        ? `سال مالی «${newYear.name}» ایجاد و فعال شد`
        : `سال مالی «${newYear.name}» ایجاد شد`,
    })
  } catch (error: any) {
    console.error('[FiscalYears POST] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ایجاد سال مالی' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT — بستن سال فعال + ایجاد خودکار سال جدید
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canCloseFiscalYear) {
      return NextResponse.json(
        { success: false, error: 'بستن سال مالی فقط در پلن سازمانی در دسترس است' },
        { status: 403 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه بستن سال مالی را دارند' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    // ─── ۱. یافتن سال فعال ─────────────────────────────────────
    const activeYear = await tenantDb.fiscalYear.findFirst({
      where: { tenantId, isActive: true, isClosed: false },
    })

    if (!activeYear) {
      return NextResponse.json(
        { success: false, error: 'هیچ سال مالی فعالی برای بستن وجود ندارد' },
        { status: 400 }
      )
    }

    const startDate = activeYear.startDate
    const endDate = activeYear.endDate

    // ─── ۲. دریافت تمام اسناد سال جاری ────────────────────────
    const entries = await tenantDb.journalEntry.findMany({
      where: {
        tenantId,
        status: 'posted',
        date: { gte: startDate, lte: endDate },
      },
      include: { lines: true },
    })

    // ─── ۳. دریافت حساب‌ها ───────────────────────────────────
    const accountsList = await tenantDb.account.findMany({
      where: { tenantId },
      select: { id: true, code: true, type: true, name: true },
    })

    const accountMap = new Map<string, { type: string; code: string; name: string }>()
    for (const a of accountsList) {
      accountMap.set(a.id, {
        type: (a.type || '').toLowerCase(),
        code: a.code || '',
        name: (a.name || '').toLowerCase(),
      })
    }

    // ─── ۴. محاسبه مانده درآمد و هزینه ──────────────────────
    const revenueBalances = new Map<string, number>()
    const expenseBalances = new Map<string, number>()

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        const acc = accountMap.get(line.accountId || '')
        if (!acc) continue

        const isRevenue =
          acc.type === 'revenue' ||
          acc.type === 'sales' ||
          acc.code.startsWith('4') ||
          acc.name.includes('فروش') ||
          acc.name.includes('درآمد')
        const isExpense =
          acc.type === 'expense' ||
          acc.type === 'cogs' ||
          acc.type === 'cost' ||
          acc.code.startsWith('5') ||
          acc.name.includes('هزینه') ||
          acc.name.includes('بها تمام')

        if (isRevenue) {
          const current = revenueBalances.get(line.accountId!) || 0
          revenueBalances.set(line.accountId!, current + (line.credit || 0) - (line.debit || 0))
        } else if (isExpense) {
          const current = expenseBalances.get(line.accountId!) || 0
          expenseBalances.set(line.accountId!, current + (line.debit || 0) - (line.credit || 0))
        }
      }
    }

    // ─── ۵. محاسبه سود/زیان ─────────────────────────────────
    const totalRevenue = Array.from(revenueBalances.values()).reduce((s, v) => s + v, 0)
    const totalExpense = Array.from(expenseBalances.values()).reduce((s, v) => s + v, 0)
    const netProfit = totalRevenue - totalExpense

    // ─── ۶. پیدا کردن حساب سود انباشته ───────────────────────
    let retainedEarningsAccountId: string | null = null
    for (const [accId, acc] of accountMap) {
      if (
        acc.type === 'equity' ||
        acc.code.startsWith('3') ||
        acc.name.includes('سود انباشته') ||
        acc.name.includes('انباشته')
      ) {
        retainedEarningsAccountId = accId
        break
      }
    }

    // ─── ۷. ایجاد سند بستن سال مالی ─────────────────────────
    const jeCount = await tenantDb.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-CLOSE-${(jeCount + 1).toString().padStart(6, '0')}`

    const closingLines: any[] = []

    // ★ صفر کردن حساب‌های درآمد (بدهکار)
    for (const [accId, balance] of revenueBalances) {
      if (Math.abs(balance) > 0.001) {
        closingLines.push({
          accountId: accId,
          debit: balance > 0 ? balance : 0,
          credit: balance < 0 ? Math.abs(balance) : 0,
          description: 'بستن حساب درآمد — انتقال به سود انباشته',
        })
      }
    }

    // ★ صفر کردن حساب‌های هزینه (بستانکار)
    for (const [accId, balance] of expenseBalances) {
      if (Math.abs(balance) > 0.001) {
        closingLines.push({
          accountId: accId,
          debit: balance < 0 ? Math.abs(balance) : 0,
          credit: balance > 0 ? balance : 0,
          description: 'بستن حساب هزینه — انتقال به سود انباشته',
        })
      }
    }

    // ★ ثبت سود/زیان در حساب سود انباشته
    if (retainedEarningsAccountId && Math.abs(netProfit) > 0.001) {
      if (netProfit > 0) {
        closingLines.push({
          accountId: retainedEarningsAccountId,
          debit: 0,
          credit: netProfit,
          description: 'انتقال سود سال مالی به سود انباشته',
        })
      } else {
        closingLines.push({
          accountId: retainedEarningsAccountId,
          debit: Math.abs(netProfit),
          credit: 0,
          description: 'انتقال زیان سال مالی به سود انباشته',
        })
      }
    }

    // ★ ایجاد سند (به سال مالی فعلی وصل می‌شود)
    const totalDebit = closingLines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = closingLines.reduce((s, l) => s + l.credit, 0)

    let closingEntryNumber = jeNumber
    let closingLinesCount = 0

    if (closingLines.length >= 2) {
      const createdEntry = await tenantDb.journalEntry.create({
        data: {
          number: jeNumber,
          fiscalYearId: activeYear.id,
          date: endDate,
          description: `سند بستن سال مالی ${activeYear.name} (${startDate.toISOString().split('T')[0]} تا ${endDate.toISOString().split('T')[0]})`,
          status: 'posted',
          sourceType: 'fiscal_year_close',
          totalDebit,
          totalCredit,
          createdBy: tenant.user?.id || null,
          tenantId,
          lines: { create: closingLines },
        },
      })
      closingEntryNumber = createdEntry.number
      closingLinesCount = closingLines.length
    }

    // ─── ۸. علامت‌گذاری سال به‌عنوان بسته‌شده ─────────────────
    await tenantDb.fiscalYear.update({
      where: { id: activeYear.id },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedBy: tenant.user?.id || null,
        isActive: false,
        notes:
          (activeYear.notes ? activeYear.notes + ' | ' : '') +
          `بسته شد در ${new Date().toISOString().split('T')[0]} — ` +
          `سود/زیان: ${netProfit.toLocaleString('fa-IR')} ریال`,
      },
    })

    // ─── ۹. ایجاد خودکار سال جدید ─────────────────────────────
    // تاریخ شروع سال جدید = روز بعد از پایان سال بسته‌شده
    const newStartDate = new Date(endDate)
    newStartDate.setDate(newStartDate.getDate() + 1)

    // تاریخ پایان پیش‌فرض = ۳۶۵ روز بعد (سال کامل)
    const newEndDate = new Date(newStartDate)
    newEndDate.setDate(newEndDate.getDate() + 364)

    const newYearName = body.newYearName?.trim() || generateNextYearName(activeYear.name)

    // ★ بررسی نام تکراری
    const existingNew = await tenantDb.fiscalYear.findFirst({
      where: { tenantId, name: newYearName },
    })
    const finalNewName = existingNew ? `${newYearName} (${new Date().getFullYear()})` : newYearName

    const newYear = await tenantDb.fiscalYear.create({
      data: {
        tenantId,
        name: finalNewName,
        startDate: newStartDate,
        endDate: newEndDate,
        isActive: true,
        isClosed: false,
      },
    })

    // ─── ۱۰. لاگ audit ───────────────────────────────────────
    try {
      await tenantDb.auditLogs.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          userId: tenant.user?.id || null,
          action: 'FISCAL_YEAR_CLOSE',
          entityType: 'FiscalYear',
          entityId: activeYear.id,
          details: JSON.stringify({
            closedYearName: activeYear.name,
            newYearName: finalNewName,
            netProfit,
            closingEntryNumber,
          }),
        },
      })
    } catch (auditErr) {
      console.warn('[FiscalYears PUT] Audit log failed:', auditErr)
    }

    console.log('[FiscalYears PUT] Closed:', {
      tenantId,
      closedYear: activeYear.name,
      newYear: finalNewName,
      netProfit,
    })

    return NextResponse.json({
      success: true,
      data: {
        closedYear: {
          id: activeYear.id,
          name: activeYear.name,
          startDate: activeYear.startDate,
          endDate: activeYear.endDate,
        },
        newYear: {
          id: newYear.id,
          name: newYear.name,
          startDate: newYear.startDate,
          endDate: newYear.endDate,
        },
        totalRevenue,
        totalExpense,
        netProfit,
        closingEntryNumber,
        closingLinesCount,
      },
      message:
        netProfit >= 0
          ? `سال مالی «${activeYear.name}» بسته شد — سود خالص: ${netProfit.toLocaleString('fa-IR')} ریال. سال جدید «${finalNewName}» ایجاد و فعال شد.`
          : `سال مالی «${activeYear.name}» بسته شد — زیان خالص: ${Math.abs(netProfit).toLocaleString('fa-IR')} ریال. سال جدید «${finalNewName}» ایجاد و فعال شد.`,
    })
  } catch (error: any) {
    console.error('[FiscalYears PUT] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در بستن سال مالی' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی
// ═══════════════════════════════════════════════════════════════

// تولید نام سال جدید بر اساس نام سال قبلی
// مثلاً: «سال مالی ۱۴۰۳» → «سال مالی ۱۴۰۴»
//        «سال مالی ۲۰۲۴» → «سال مالی ۲۰۲۵»
//        «سال مالی دوم ۱۴۰۳» → «سال مالی ۱۴۰۴»
function generateNextYearName(prevName: string): string {
  // ★ الگوی سال شمسی یا میلادی
  const faYearMatch = prevName.match(/(\d{4})/)
  if (faYearMatch) {
    const yearStr = faYearMatch[1]
    // تشخیص فارسی یا لاتین
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

    // ★ ساخت نام جدید — فقط عدد را عوض کن
    return prevName.replace(yearStr, nextYearStr)
  }
  // fallback
  return prevName + ' (بعدی)'
}
