// src/app/api/fiscal-years/route.ts — v8.5 ★★★
// ShopAccounting — Fiscal Year Management API
// ============================================================================
// ★★★ v8.5: محاسبه تعداد اسناد بر اساس بازه تاریخ (نه relation)
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

    // ★★★ v8.5: محاسبه تعداد اسناد و پیشرفت برای سال فعال (بر اساس بازه تاریخ)
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

    // ★ محاسبه entryCount برای همه سال‌ها
    // ★★★ v8.5.1: اضافه شدن type annotation برای رفع خطای TS2345
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
//  PUT — بستن سال فعال + ایجاد خودکار سال جدید
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
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

    const activeYear = await tenantDb.fiscalYear.findFirst({
      where: { tenantId, isActive: true, isClosed: false },
    })

    if (!activeYear) {
      return NextResponse.json(
        { success: false, error: 'هیچ سال مالی فعالی برای بستن وجود ندارد' },
        { status: 400 }
      )
    }

    // ★★★ v8.8: بررسی اینکه ۳۶۵ روز از شروع سال مالی گذشته باشد
    const startDate = activeYear.startDate
    const endDate = activeYear.endDate
    const now = new Date()

    // محاسبه تعداد روزهای گذشته از شروع سال
    const daysPassed = Math.floor((now.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))

    if (daysPassed < 365) {
      const remainingDays = 365 - daysPassed
      return NextResponse.json(
        {
          success: false,
          error: `هنوز زمان بستن سال مالی نرسیده است. ${remainingDays.toLocaleString('fa-IR')} روز تا پایان سال مالی باقی مانده است. بستن سال مالی فقط پس از گذشت ۳۶۵ روز امکان‌پذیر است.`,
          code: 'YEAR_NOT_COMPLETED',
          data: { daysPassed, remainingDays, startDate, endDate },
        },
        { status: 400 }
      )
    }

    // ★ محاسبه سود/زیان
    const entries = await tenantDb.journalEntry.findMany({
      where: { tenantId, status: 'posted', date: { gte: startDate, lte: endDate } },
      include: { lines: true },
    })

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

    const revenueBalances = new Map<string, number>()
    const expenseBalances = new Map<string, number>()

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        const acc = accountMap.get(line.accountId || '')
        if (!acc) continue

        const isRevenue = acc.type === 'revenue' || acc.type === 'sales' || acc.code.startsWith('4') || acc.name.includes('فروش') || acc.name.includes('درآمد')
        const isExpense = acc.type === 'expense' || acc.type === 'cogs' || acc.type === 'cost' || acc.code.startsWith('5') || acc.name.includes('هزینه') || acc.name.includes('بها تمام')

        if (isRevenue) {
          const current = revenueBalances.get(line.accountId!) || 0
          revenueBalances.set(line.accountId!, current + (line.credit || 0) - (line.debit || 0))
        } else if (isExpense) {
          const current = expenseBalances.get(line.accountId!) || 0
          expenseBalances.set(line.accountId!, current + (line.debit || 0) - (line.credit || 0))
        }
      }
    }

    const totalRevenue = Array.from(revenueBalances.values()).reduce((s, v) => s + v, 0)
    const totalExpense = Array.from(expenseBalances.values()).reduce((s, v) => s + v, 0)
    const netProfit = totalRevenue - totalExpense

    let retainedEarningsAccountId: string | null = null
    for (const [accId, acc] of accountMap) {
      if (acc.type === 'equity' || acc.code.startsWith('3') || acc.name.includes('سود انباشته') || acc.name.includes('انباشته')) {
        retainedEarningsAccountId = accId
        break
      }
    }

    const jeCount = await tenantDb.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-CLOSE-${(jeCount + 1).toString().padStart(6, '0')}`

    const closingLines: any[] = []

    for (const [accId, balance] of revenueBalances) {
      if (Math.abs(balance) > 0.001) {
        closingLines.push({
          accountId: accId,
          debit: balance > 0 ? balance : 0,
          credit: balance < 0 ? Math.abs(balance) : 0,
          description: 'بستن حساب درآمد',
        })
      }
    }

    for (const [accId, balance] of expenseBalances) {
      if (Math.abs(balance) > 0.001) {
        closingLines.push({
          accountId: accId,
          debit: balance < 0 ? Math.abs(balance) : 0,
          credit: balance > 0 ? balance : 0,
          description: 'بستن حساب هزینه',
        })
      }
    }

    if (retainedEarningsAccountId && Math.abs(netProfit) > 0.001) {
      if (netProfit > 0) {
        closingLines.push({ accountId: retainedEarningsAccountId, debit: 0, credit: netProfit, description: 'انتقال سود به سود انباشته' })
      } else {
        closingLines.push({ accountId: retainedEarningsAccountId, debit: Math.abs(netProfit), credit: 0, description: 'انتقال زیان به سود انباشته' })
      }
    }

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
          description: `سند بستن سال مالی ${activeYear.name}`,
          status: 'posted',
          sourceType: 'fiscal_year_close',
          totalDebit,
          totalCredit,
          tenantId,
          lines: { create: closingLines },
        },
      })
      closingEntryNumber = createdEntry.number
      closingLinesCount = closingLines.length
    }

    await tenantDb.fiscalYear.update({
      where: { id: activeYear.id },
      data: {
        isClosed: true,
        closedAt: new Date(),
        isActive: false,
        notes: `بسته شد در ${new Date().toISOString().split('T')[0]} — سود/زیان: ${netProfit.toLocaleString('fa-IR')} ریال`,
      },
    })

    // ★ ایجاد سال جدید
    const newStartDate = new Date(endDate)
    newStartDate.setDate(newStartDate.getDate() + 1)
    const newEndDate = new Date(newStartDate)
    newEndDate.setDate(newEndDate.getDate() + 364)

    const newYearName = body.newYearName?.trim() || generateNextYearName(activeYear.name)

    const newYear = await tenantDb.fiscalYear.create({
      data: {
        tenantId,
        name: newYearName,
        startDate: newStartDate,
        endDate: newEndDate,
        isActive: true,
        isClosed: false,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        closedYear: { id: activeYear.id, name: activeYear.name },
        newYear: { id: newYear.id, name: newYear.name },
        totalRevenue,
        totalExpense,
        netProfit,
        closingEntryNumber,
        closingLinesCount,
      },
      message: `سال مالی «${activeYear.name}» بسته شد — ${netProfit >= 0 ? 'سود' : 'زیان'}: ${Math.abs(netProfit).toLocaleString('fa-IR')} ریال. سال جدید «${newYearName}» ایجاد و فعال شد.`,
    })
  } catch (error: any) {
    console.error('[FiscalYears PUT] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در بستن سال مالی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  Helper
// ═══════════════════════════════════════════════════════════════

function generateNextYearName(prevName: string): string {
  const faYearMatch = prevName.match(/(\d{4})/)
  if (faYearMatch) {
    const yearStr = faYearMatch[1]
    const isFa = /[۰-۹]/.test(yearStr)
    let year: number
    if (isFa) {
      year = parseInt(yearStr.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 10)
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
