// src/app/api/fiscal-years/route.ts
// ShopAccounting v6.7 — Fiscal Year Management API
// ============================================================================
// ★★★ ویژگی‌ها:
//   ★ GET: لیست سال‌های مالی + سال فعال
//   ★ POST: ایجاد سال مالی جدید (با امکان فعال‌سازی خودکار)
//   ★ PUT: بستن سال فعال (صفر کردن درآمد/هزینه + انتقال سود/زیان به سود انباشته)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/fiscal-years — لیست سال‌های مالی
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

    // ★★★ v8.5: محاسبه تعداد اسناد و پیشرفت برای سال فعال
    let activeYear = activeYearRaw
    if (activeYearRaw) {
      // ★ تعداد اسناد ثبت‌شده در این سال مالی
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

      // ★ محاسبه پیشرفت (درصد زمان سپری‌شده)
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

    return NextResponse.json({
      success: true,
      data: {
        years,
        activeYear,
      },
    })
  } catch (error: any) {
    console.error('[FiscalYears GET] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری سال‌های مالی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/fiscal-years — ایجاد سال مالی جدید
//  Body: { name, startDate, endDate, activate? }
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()
    const { name, startDate, endDate, activate } = body

    if (!name || !startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'نام، تاریخ شروع و پایان الزامی هستند' }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (start >= end) {
      return NextResponse.json({ success: false, error: 'تاریخ شروع باید قبل از تاریخ پایان باشد' }, { status: 400 })
    }

    // ★ بررسی تداخل با سال‌های موجود
    const overlapping = await tenantDb.fiscalYear.findFirst({
      where: {
        tenantId,
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    }).catch(() => null)

    if (overlapping) {
      return NextResponse.json({
        success: false,
        error: `بازه تاریخ با سال مالی «${overlapping.name}» تداخل دارد`,
      }, { status: 400 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      // ★ اگه activate=true، اول همه سال‌های فعال رو غیرفعال کن
      if (activate) {
        await tx.fiscalYear.updateMany({
          where: { tenantId, isActive: true },
          data: { isActive: false },
        }).catch(() => {})
      }

      // ★ ایجاد سال جدید
      const newYear = await tx.fiscalYear.create({
        data: {
          tenantId,
          name: name.trim(),
          startDate: start,
          endDate: end,
          isActive: activate === true,
        },
      })

      return newYear
    })

    console.log(`[FiscalYears POST] سال مالی «${name}» ایجاد شد`)

    return NextResponse.json({
      success: true,
      data: result,
      message: `سال مالی «${name}» با موفقیت ایجاد شد${activate ? ' و فعال شد' : ''}`,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[FiscalYears POST] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در ایجاد سال مالی',
    }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/fiscal-years — بستن سال فعال
//  Body: {} (بدون پارامتر — سال فعال رو می‌بنده)
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★ پیدا کردن سال فعال
    const activeYear = await tenantDb.fiscalYear.findFirst({
      where: { tenantId, isActive: true, isClosed: false },
    }).catch(() => null)

    if (!activeYear) {
      return NextResponse.json({
        success: false,
        error: 'هیچ سال مالی فعالی وجود ندارد',
      }, { status: 400 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      // ═══════════════════════════════════════════════════════════════
      //  مرحله ۱: محاسبه سود/زیان سال
      // ═══════════════════════════════════════════════════════════════
      const journalEntries = await tx.journalEntry.findMany({
        where: {
          tenantId,
          date: { gte: activeYear.startDate, lte: activeYear.endDate },
          status: 'posted',
          isCancelled: false,
        },
        include: { lines: true },
      }).catch(() => [])

      // ★ جمع‌بندی بر اساس نوع account
      let totalRevenue = 0      // درآمد (credit)
      let totalExpense = 0      // هزینه (debit)
      let totalCOGS = 0         // بهای تمام شده (debit)
      let totalOtherIncome = 0  // سایر درآمدها (credit)
      let totalOtherExpense = 0 // سایر هزینه‌ها (debit)

      // ★ گرفتن account‌ها برای دسته‌بندی
      const accountIds = new Set<string>()
      for (const je of journalEntries) {
        for (const line of (je.lines || [])) {
          if (line.accountId) accountIds.add(line.accountId)
        }
      }

      const accounts = accountIds.size > 0 ? await tx.account.findMany({
        where: { id: { in: Array.from(accountIds) } },
      }) : []

      const accountMap = new Map(accounts.map((a: any) => [a.id, a]))

      for (const je of journalEntries) {
        for (const line of (je.lines || [])) {
          const acc = line.accountId ? accountMap.get(line.accountId) : null
          if (!acc) continue

          const accType = (acc.type || '').toLowerCase()
          const accCode = acc.code || ''

          if (accType === 'revenue' || accType === 'income' || accCode.startsWith('4')) {
            if (accCode.startsWith('41')) {
              totalRevenue += Number(line.credit) || 0
            } else {
              totalOtherIncome += Number(line.credit) || 0
            }
          } else if (accType === 'cogs' || accType === 'cost' || accCode.startsWith('51')) {
            totalCOGS += Number(line.debit) || 0
          } else if (accType === 'expense' || accCode.startsWith('5')) {
            totalExpense += Number(line.debit) || 0
          } else if (accCode.startsWith('6') || accCode.startsWith('7')) {
            totalOtherExpense += Number(line.debit) || 0
          }
        }
      }

      const netProfit = totalRevenue + totalOtherIncome - totalCOGS - totalExpense - totalOtherExpense

      // ═══════════════════════════════════════════════════════════════
      //  مرحله ۲: ایجاد سند بستن سال مالی
      // ═══════════════════════════════════════════════════════════════
      let journalEntryId: string | null = null

      // ★ پیدا کردن حساب‌های سود انباشته و سود/زیان
      let retainedEarningsAccountId: string | null = null
      let incomeSummaryAccountId: string | null = null

      for (const acc of accounts) {
        const code = (acc.code || '').toLowerCase()
        const type = (acc.type || '').toLowerCase()
        const name = (acc.name || '').toLowerCase()

        if (!retainedEarningsAccountId && (code.startsWith('31') || type === 'retained' || name.includes('سود انباشته') || name.includes('انباشته'))) {
          retainedEarningsAccountId = acc.id
        }
        if (!incomeSummaryAccountId && (code.startsWith('39') || type === 'income_summary' || name.includes('مجموع درآمد') || name.includes('صفر موقت'))) {
          incomeSummaryAccountId = acc.id
        }
      }

      const jeNumber = `JE-${(await tx.journalEntry.count({ where: { tenantId } }) + 1).toString().padStart(6, '0')}`
      const lines: any[] = []

      // ★ خطوط صفر کردن حساب‌های درآمد و هزینه
      // (این بخش اختیاری است — اگه حساب‌های مناسب پیدا نشن، فقط سند خالی ثبت می‌شه)

      if (lines.length >= 2 || (retainedEarningsAccountId && netProfit !== 0)) {
        // ★ خط انتقال سود/زیان به سود انباشته
        if (netProfit > 0) {
          // سود: بدهکار مجموع درآمد، بستانکار سود انباشته
          if (incomeSummaryAccountId && retainedEarningsAccountId) {
            lines.push({
              accountId: incomeSummaryAccountId,
              debit: netProfit,
              credit: 0,
              description: `بدهکار: انتقال سود سال مالی ${activeYear.name}`,
            })
            lines.push({
              accountId: retainedEarningsAccountId,
              debit: 0,
              credit: netProfit,
              description: `بستانکار: ثبت سود انباشته سال ${activeYear.name}`,
            })
          }
        } else if (netProfit < 0) {
          // زیان: بدهکار سود انباشته، بستانکار مجموع هزینه
          if (retainedEarningsAccountId && incomeSummaryAccountId) {
            lines.push({
              accountId: retainedEarningsAccountId,
              debit: Math.abs(netProfit),
              credit: 0,
              description: `بدهکار: ثبت زیان سال مالی ${activeYear.name}`,
            })
            lines.push({
              accountId: incomeSummaryAccountId,
              debit: 0,
              credit: Math.abs(netProfit),
              description: `بستانکار: انتقال زیان سال ${activeYear.name}`,
            })
          }
        }

        if (lines.length >= 2) {
          const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
          const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

          const je = await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: new Date(),
              description: `سند بستن سال مالی ${activeYear.name}`,
              status: 'posted',
              sourceType: 'fiscal_year_close',
              sourceId: activeYear.id,
              totalDebit,
              totalCredit,
              createdBy: tenant.user?.id || null,
              tenantId,
              fiscalYearId: activeYear.id,
              lines: { create: lines },
            },
          })
          journalEntryId = je.id
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  مرحله ۳: بستن سال
      // ═══════════════════════════════════════════════════════════════
      await tx.fiscalYear.update({
        where: { id: activeYear.id },
        data: {
          isClosed: true,
          closedAt: new Date(),
          closedBy: tenant.user?.id || null,
        },
      })

      return {
        yearName: activeYear.name,
        totalRevenue,
        totalCOGS,
        totalExpense,
        totalOtherIncome,
        totalOtherExpense,
        netProfit,
        journalEntryId,
      }
    })

    console.log(`[FiscalYears PUT] سال مالی «${result.yearName}» بسته شد — سود/زیان: ${result.netProfit}`)

    return NextResponse.json({
      success: true,
      data: result,
      message: `سال مالی «${result.yearName}» با موفقیت بسته شد. سود/زیان خالص: ${result.netProfit.toLocaleString('fa-IR')} ریال`,
    })
  } catch (error: any) {
    console.error('[FiscalYears PUT] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در بستن سال مالی',
    }, { status: 500 })
  }
})
