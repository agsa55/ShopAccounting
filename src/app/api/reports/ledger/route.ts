// ============================================================================
// src/app/api/reports/ledger/route.ts — GET (v8.4 ★★★)
// ShopAccounting — General Ledger Report API
// ----------------------------------------------------------------------------
// ★★★ v8.4: این API دفتر کل یک حساب خاص را با قابلیت‌های زیر ارائه می‌دهد:
//
//   ✓ شامل تمام اسناد (دستی، خودکار فاکتور، خودکار پرداخت آنلاین)
//   ✓ فیلتر بر اساس بازه تاریخ
//   ✓ محاسبه مانده ابتدای دوره (قبل از تاریخ شروع)
//   ✓ محاسبه مانده تجمعی (running balance) برای هر ردیف
//   ✓ خروجی مناسب برای Excel و چاپ
//
// ★ پارامترهای Query:
//   - accountId: شناسه حساب (الزامی)
//   - dateFrom: تاریخ شروع (YYYY-MM-DD) — اختیاری
//   - dateTo: تاریخ پایان (YYYY-MM-DD) — پیش‌فرض امروز
//
// ★ خروجی:
//   {
//     success: true,
//     data: {
//       account: { id, code, name, type },
//       openingBalance: number,  // مانده قبل از تاریخ شروع
//       openingBalanceLabel: string,  // "X بد" یا "Y بس" یا "—"
//       totalDebit: number,  // جمع بدهکار در دوره
//       totalCredit: number,  // جمع بستانکار در دوره
//       closingBalance: number,  // مانده پایان دوره
//       closingBalanceLabel: string,
//       dateRange: { from, to },
//       rows: [
//         {
//           journalEntryId, journalNumber, date, description,
//           lineDescription, sourceType, sourceId,
//           debit, credit, balance  // مانده تجمعی
//         }
//       ]
//     }
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی
// ═══════════════════════════════════════════════════════════════

function formatBalanceLabel(balance: number): string {
  if (Math.abs(balance) < 1) return '—'
  if (balance > 0) return `${Math.abs(balance).toLocaleString('fa-IR')} بد`
  return `${Math.abs(balance).toLocaleString('fa-IR')} بس`
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/reports/ledger?accountId=...&dateFrom=...&dateTo=...
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const accountId = searchParams.get('accountId')
      const dateFrom = searchParams.get('dateFrom')
      const dateTo = searchParams.get('dateTo')

      if (!accountId) {
        return NextResponse.json(
          { success: false, error: 'شناسه حساب الزامی است' },
          { status: 400 }
        )
      }

      // ★ دریافت اطلاعات حساب
      const account = await tenantDb.account.findFirst({
        where: { id: accountId, tenantId },
      })

      if (!account) {
        return NextResponse.json(
          { success: false, error: 'حساب یافت نشد' },
          { status: 404 }
        )
      }

      // ★ تنظیم بازه تاریخ
      const now = new Date()
      const toDate = dateTo ? new Date(dateTo) : now
      if (isNaN(toDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ پایان نامعتبر است' },
          { status: 400 }
        )
      }
      const toDateEnd = new Date(toDate)
      toDateEnd.setHours(23, 59, 59, 999)

      const fromDate = dateFrom ? new Date(dateFrom) : null
      if (fromDate && isNaN(fromDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ شروع نامعتبر است' },
          { status: 400 }
        )
      }
      if (fromDate) {
        fromDate.setHours(0, 0, 0, 0)
      }

      console.log('[Ledger] Querying', {
        tenantId,
        accountId,
        accountCode: account.code,
        dateFrom: fromDate?.toISOString(),
        dateTo: toDateEnd.toISOString(),
      })

      // ═══════════════════════════════════════════════════════════════
      //  ۱. محاسبه مانده ابتدای دوره (قبل از fromDate)
      // ═══════════════════════════════════════════════════════════════
      let openingBalance = 0
      if (fromDate) {
        const openingWhere: any = {
          tenantId,
          status: 'posted',
          isCancelled: false,
          date: { lt: fromDate }, // ★ قبل از تاریخ شروع
        }

        const openingEntries = await tenantDb.journalEntry.findMany({
          where: openingWhere,
          include: { lines: true },
        })

        for (const je of openingEntries) {
          for (const line of (je.lines || [])) {
            if (line.accountId === accountId) {
              openingBalance += (Number(line.debit) || 0) - (Number(line.credit) || 0)
            }
          }
        }

        console.log('[Ledger] Opening balance:', openingBalance)
      }

      // ═══════════════════════════════════════════════════════════════
      //  ۲. دریافت اسناد در بازه انتخاب‌شده
      // ═══════════════════════════════════════════════════════════════
      const where: any = {
        tenantId,
        status: 'posted',
        isCancelled: false,
        date: { lte: toDateEnd },
      }
      if (fromDate) {
        where.date.gte = fromDate
      }

      const journalEntries = await tenantDb.journalEntry.findMany({
        where,
        include: { lines: true },
        orderBy: { date: 'asc' },
      })

      console.log('[Ledger] Found', journalEntries.length, 'journal entries in period')

      // ═══════════════════════════════════════════════════════════════
      //  ۳. استخراج ردیف‌های مربوط به این حساب
      // ═══════════════════════════════════════════════════════════════
      const rows: any[] = []
      let totalDebit = 0
      let totalCredit = 0

      for (const je of journalEntries) {
        const lines = je.lines || []
        for (const line of lines) {
          if (line.accountId !== accountId) continue

          const debit = Number(line.debit) || 0
          const credit = Number(line.credit) || 0
          totalDebit += debit
          totalCredit += credit

          rows.push({
            journalEntryId: je.id,
            journalNumber: je.number,
            date: je.date,
            description: je.description,
            lineDescription: line.description,
            sourceType: je.sourceType,
            sourceId: je.sourceId,
            debit,
            credit,
            balance: 0, // بعداً محاسبه می‌شود
          })
        }
      }

      // ★ مرتب‌سازی بر اساس تاریخ (و شماره سند برای ردیف‌های هم‌تاریخ)
      rows.sort((a, b) => {
        const dateA = new Date(a.date).getTime()
        const dateB = new Date(b.date).getTime()
        if (dateA !== dateB) return dateA - dateB
        return (a.journalNumber || '').localeCompare(b.journalNumber || '')
      })

      // ═══════════════════════════════════════════════════════════════
      //  ۴. محاسبه مانده تجمعی (running balance)
      // ═══════════════════════════════════════════════════════════════
      let runningBalance = openingBalance
      for (const row of rows) {
        runningBalance += row.debit - row.credit
        row.balance = runningBalance
        row.balanceLabel = formatBalanceLabel(runningBalance)
      }

      // ═══════════════════════════════════════════════════════════════
      //  ۵. محاسبه مانده پایان دوره
      // ═══════════════════════════════════════════════════════════════
      const closingBalance = openingBalance + totalDebit - totalCredit

      console.log('[Ledger] Computed', {
        rowCount: rows.length,
        openingBalance,
        totalDebit,
        totalCredit,
        closingBalance,
      })

      return NextResponse.json({
        success: true,
        data: {
          account: {
            id: account.id,
            code: account.code,
            name: account.name,
            type: (account.type || '').toLowerCase(),
          },
          openingBalance: Math.round(openingBalance),
          openingBalanceLabel: formatBalanceLabel(openingBalance),
          totalDebit: Math.round(totalDebit),
          totalCredit: Math.round(totalCredit),
          closingBalance: Math.round(closingBalance),
          closingBalanceLabel: formatBalanceLabel(closingBalance),
          dateRange: {
            from: fromDate ? fromDate.toISOString() : null,
            to: toDateEnd.toISOString(),
          },
          rows: rows.map(r => ({
            ...r,
            debit: Math.round(r.debit),
            credit: Math.round(r.credit),
            balance: Math.round(r.balance),
            date: r.date instanceof Date ? r.date.toISOString() : r.date,
          })),
        },
      })
    } catch (error: any) {
      console.error('[Ledger] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت دفتر کل: ' + (error?.message || 'نامشخص') },
        { status: 500 }
      )
    }
  }
)
