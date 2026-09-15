// ============================================================================
// src/app/api/fiscal-years/basic-close/route.ts
// ★ v4.1: یکسان‌سازی sourceType با 'fiscal_year_close'
// ★ حذف سند افتتاحیه برای پلن پایه
// ★ دلیل: پلن پایه سال مالی ندارد، پس سند افتتاحیه باعث دو برابر شدن مانده
//         حساب‌های دائمی می‌شود. فقط سند اختتامیه (صفر کردن درآمد/هزینه) کافی است.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getStandardAccountIds, ensureDefaultAccounts } from '@/lib/accounts-auto-seed'

export const POST = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    
    // ★★★ حذف newYearName — پلن پایه سال مالی ندارد
    // const body = await req.json()
    // const { newYearName } = body

    // ── ۱. اطمینان از حساب‌ها ────────────────────────────────
    await ensureDefaultAccounts(tenantId)
    const accountIds = await getStandardAccountIds(tenantId)

    // ── ۲. آخرین سند اختتامیه قبلی ────────────────────────
    // ★ v4.1: یکسان‌سازی sourceType با 'fiscal_year_close'
    const existingClose = await tenantDb.journalEntry.findFirst({
      where: { tenantId, sourceType: 'fiscal_year_close', status: 'posted' },
      orderBy: { date: 'desc' },
    })

    // ── ۳. بازیابی اسناد ───────────────────────────────────
    const dateFilter = existingClose ? { gt: existingClose.date } : undefined

    const entries = await tenantDb.journalEntry.findMany({
      where: {
        tenantId,
        status: 'posted',
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      select: { id: true },
    })

    const entryIds = entries.map((e: any) => e.id)

    // ── ۴. بازیابی lines (بدون include) ───────────────────
    const allLines = entryIds.length > 0 ? await tenantDb.journalEntryLine.findMany({
      where: { journalEntryId: { in: entryIds } },
      select: { id: true, accountId: true, debit: true, credit: true },
    }) : []

    // ── ۵. Manual Join: گرفتن accounts ─────────────────────
    const accountIdsFromLines = [...new Set(allLines.map((l: any) => l.accountId).filter(Boolean))]
    let accountsMap = new Map<string, { code: string; name: string; type: string }>()

    if (accountIdsFromLines.length > 0) {
      const accounts = await tenantDb.account.findMany({
        where: { id: { in: accountIdsFromLines } },
        select: { id: true, code: true, name: true, type: true },
      })
      accountsMap = new Map(accounts.map((a: any) => [a.id, { code: a.code, name: a.name, type: a.type || '' }]))
    }

    // ── ۶. محاسبه سود/زیان ──────────────────────────────────
    let totalRevenue = 0
    let totalExpenses = 0
    let totalCogs = 0

    for (const line of allLines) {
      const account = accountsMap.get(line.accountId)
      if (!account) continue

      const code = account.code || ''
      const type = account.type || ''
      const debit = Number(line.debit || 0)
      const credit = Number(line.credit || 0)

      if (code.startsWith('4') || type === 'درآمد') {
        totalRevenue += credit - debit
      } else if (code === '5000' || type === 'بهای_تمام_شده') {
        totalCogs += debit - credit
      } else if (code.startsWith('51') || code.startsWith('52') || type === 'هزینه') {
        totalExpenses += debit - credit
      }
    }

    const netProfit = totalRevenue - totalCogs - totalExpenses

    // ── ۷. اجرا در Transaction ────────────────────────────────
    const result = await tenantDb.$transaction(async (tx: any) => {
      // ── ۷.۱: ساخت lines سند اختتامیه ──────────────────────
      const closingLines: any[] = []
      const accountTotals = new Map<string, { debit: number; credit: number; code: string }>()

      for (const line of allLines) {
        const account = accountsMap.get(line.accountId)
        if (!account) continue

        const code = account.code || ''
        const type = account.type || ''
        const isRevenue = code.startsWith('4') || type === 'درآمد'
        const isExpense = code === '5000' || code.startsWith('51') || code.startsWith('52') || type === 'هزینه' || type === 'بهای_تمام_شده'

        if (!isRevenue && !isExpense) continue

        const existing = accountTotals.get(line.accountId) || { debit: 0, credit: 0, code }
        existing.debit += Number(line.debit || 0)
        existing.credit += Number(line.credit || 0)
        accountTotals.set(line.accountId, existing)
      }

      for (const [accountId, totals] of accountTotals.entries()) {
        const balance = totals.credit - totals.debit
        if (Math.abs(balance) < 0.01) continue

        if (totals.code.startsWith('4')) {
          closingLines.push({
            accountId,
            debit: balance > 0 ? balance : 0,
            credit: balance < 0 ? Math.abs(balance) : 0,
            description: `بستن حساب درآمد — ${totals.code}`,
          })
        } else {
          const expenseBalance = totals.debit - totals.credit
          closingLines.push({
            accountId,
            debit: expenseBalance < 0 ? Math.abs(expenseBalance) : 0,
            credit: expenseBalance > 0 ? expenseBalance : 0,
            description: `بستن حساب هزینه — ${totals.code}`,
          })
        }
      }

      // انتقال سود/زیان به سود انباشته
      if (Math.abs(netProfit) > 0.01 && accountIds.retainedEarningsId) {
        if (netProfit > 0) {
          closingLines.push({
            accountId: accountIds.retainedEarningsId,
            debit: 0,
            credit: netProfit,
            description: 'انتقال سود سال به سود انباشته',
          })
        } else {
          closingLines.push({
            accountId: accountIds.retainedEarningsId,
            debit: Math.abs(netProfit),
            credit: 0,
            description: 'انتقال زیان سال به سود انباشته',
          })
        }
      }

      // ── ۷.۲: صدور سند اختتامیه ────────────────────────────
      let closingEntry: any = null
      if (closingLines.length > 0) {
        const count = await tx.journalEntry.count({ where: { tenantId } })
        const number = `JE-CLOSE-${(count + 1).toString().padStart(6, '0')}`
        const totalDebit = closingLines.reduce((s: number, l: any) => s + l.debit, 0)
        const totalCredit = closingLines.reduce((s: number, l: any) => s + l.credit, 0)

        // ★ v4.1: یکسان‌سازی sourceType با 'fiscal_year_close'
        closingEntry = await tx.journalEntry.create({
          data: {
            number,
            date: new Date(),
            description: `سند اختتامیه — بستن حساب‌های درآمد و هزینه`,
            status: 'posted',
            sourceType: 'fiscal_year_close',
            totalDebit,
            totalCredit,
            tenantId,
            lines: { create: closingLines },
          },
        })
      }

      // ── ۷.۳: پلن پایه — سند افتتاحیه صادر نمی‌شود ────────
      // ★★★ در پلن پایه، سال مالی وجود ندارد.
      // ★★★ سند افتتاحیه باعث دو برابر شدن مانده حساب‌های دائمی می‌شود
      //     چون اسناد قبلی در همان دوره باقی می‌مانند و مانده‌هایشان
      //     با سند افتتاحیه دوباره محاسبه می‌شوند.
      // ★★★ فقط سند اختتامیه برای صفر کردن حساب‌های موقت کافی است.
      // ★★★ مانده حساب‌های دائمی (دارایی، بدهی، سرمایه) خودکار حفظ می‌شود.
      const openingEntry = null

      console.log('[BasicClose] 📦 پلن پایه — سند افتتاحیه صادر نشد (بدون سال مالی)')
      console.log('[BasicClose] 💡 مانده حساب‌های دائمی به‌صورت خودکار حفظ می‌شوند')

      return {
        closingEntry,
        openingEntry: null,
        netProfit,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'حساب با موفقیت بسته شد. مانده حساب‌های دائمی حفظ شده است.',
      data: result,
    })
  } catch (error: any) {
    console.error('[BasicClose] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در بستن حساب' },
      { status: 500 }
    )
  }
})