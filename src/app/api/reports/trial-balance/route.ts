// ============================================================================
// src/app/api/reports/trial-balance/route.ts — GET (v8.4 ★★★)
// ShopAccounting — Trial Balance Report API
// ----------------------------------------------------------------------------
// ★★★ v8.4: این API تراز آزمایشی کامل را با قابلیت‌های زیر ارائه می‌دهد:
//
//   ✓ شامل تمام اسناد (دستی، خودکار فاکتور، خودکار پرداخت آنلاین)
//   ✓ فیلتر بر اساس بازه تاریخ
//   ✓ محاسبه مانده (بد/بس) برای هر حساب
//   ✓ تفکیک بر اساس نوع حساب (دارایی، بدهی، درآمد، هزینه)
//   ✓ خروجی مناسب برای Excel و چاپ
//   ✓ بررسی تعادل تراز
//
// ★ پارامترهای Query:
//   - dateFrom: تاریخ شروع (YYYY-MM-DD) — اختیاری
//   - dateTo: تاریخ پایان (YYYY-MM-DD) — پیش‌فرض امروز
//   - includeZero: شامل حساب‌های با مانده صفر (پیش‌فرض: false)
//   - groupByType: گروه‌بندی بر اساس نوع حساب (پیش‌فرض: true)
//
// ★ خروجی:
//   {
//     success: true,
//     data: {
//       isBalanced: boolean,
//       grandDebit: number,
//       grandCredit: number,
//       difference: number,
//       accountCount: number,
//       dateRange: { from, to },
//       groups: [
//         {
//           type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
//           typeLabel: string,
//           subtotalDebit: number,
//           subtotalCredit: number,
//           accounts: [
//             {
//               accountId, accountCode, accountName, accountType,
//               totalDebit, totalCredit, balance, balanceLabel
//             }
//           ]
//         }
//       ],
//       flatRows: [...]  // همان حساب‌ها به‌صورت لیست مسطح
//     }
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  ثابت‌ها — انواع حساب و برچسب فارسی
// ═══════════════════════════════════════════════════════════════

const ACCOUNT_TYPE_GROUPS: Record<string, { group: string; label: string; order: number }> = {
  // دارایی‌ها
  cash:        { group: 'asset',     label: 'دارایی‌های جاری',     order: 1 },
  bank:        { group: 'asset',     label: 'دارایی‌های جاری',     order: 1 },
  receivable:  { group: 'asset',     label: 'دارایی‌های جاری',     order: 1 },
  inventory:   { group: 'asset',     label: 'دارایی‌های جاری',     order: 1 },
  // بدهی‌ها
  payable:     { group: 'liability', label: 'بدهی‌های جاری',       order: 2 },
  tax:         { group: 'liability', label: 'بدهی‌های جاری',       order: 2 },
  // حقوق صاحبان سهام (کد 3xx)
  equity:      { group: 'equity',    label: 'حقوق صاحبان سهام',   order: 3 },
  // درآمدها
  revenue:     { group: 'revenue',   label: 'درآمدها',             order: 4 },
  income:      { group: 'revenue',   label: 'درآمدها',             order: 4 },
  // هزینه‌ها
  cogs:        { group: 'expense',   label: 'بهای تمام شده',       order: 5 },
  expense:     { group: 'expense',   label: 'هزینه‌های عملیاتی',   order: 5 },
  cost:        { group: 'expense',   label: 'هزینه‌های عملیاتی',   order: 5 },
}

const GROUP_LABELS: Record<string, string> = {
  asset:     'دارایی‌ها',
  liability: 'بدهی‌ها',
  equity:    'حقوق صاحبان سهام',
  revenue:   'درآمدها',
  expense:   'هزینه‌ها',
}

function classifyAccount(account: any): { group: string; label: string; order: number } {
  const accType = (account.type || '').toLowerCase()
  const accCode = account.code || ''

  // ★ اگر نوع حساب در جدول موجود است
  if (ACCOUNT_TYPE_GROUPS[accType]) {
    return ACCOUNT_TYPE_GROUPS[accType]
  }

  // ★ fallback بر اساس کد حساب
  if (accCode.startsWith('1')) return { group: 'asset',     label: 'دارایی‌ها',             order: 1 }
  if (accCode.startsWith('2')) return { group: 'liability', label: 'بدهی‌ها',               order: 2 }
  if (accCode.startsWith('3')) return { group: 'equity',    label: 'حقوق صاحبان سهام',     order: 3 }
  if (accCode.startsWith('4')) return { group: 'revenue',   label: 'درآمدها',               order: 4 }
  if (accCode.startsWith('5') || accCode.startsWith('6') || accCode.startsWith('7')) {
    return { group: 'expense', label: 'هزینه‌ها', order: 5 }
  }

  return { group: 'other', label: 'سایر', order: 6 }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/reports/trial-balance
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const dateFrom = searchParams.get('dateFrom')
      const dateTo = searchParams.get('dateTo')
      const includeZero = searchParams.get('includeZero') === 'true'
      const groupByType = searchParams.get('groupByType') !== 'false' // پیش‌فرض true

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

      console.log('[TrialBalance] Querying', {
        tenantId,
        dateFrom: fromDate?.toISOString(),
        dateTo: toDateEnd.toISOString(),
        includeZero,
        groupByType,
      })

      // ═══════════════════════════════════════════════════════════════
      //  ۱. دریافت تمام اسناد حسابداری در بازه
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

      console.log('[TrialBalance] Found', journalEntries.length, 'journal entries')

      // ═══════════════════════════════════════════════════════════════
      //  ۲. دریافت تمام حساب‌ها (برای نام و کد)
      // ═══════════════════════════════════════════════════════════════
      const accounts = await tenantDb.account.findMany({
        where: { tenantId, isActive: true },
      })
      const accountMap = new Map(accounts.map(a => [a.id, a]))

      // ═══════════════════════════════════════════════════════════════
      //  ۳. تجمیع مبالغ بر اساس حساب
      // ═══════════════════════════════════════════════════════════════
      const accountBalances = new Map<
        string,
        {
          accountId: string
          accountCode: string
          accountName: string
          accountType: string
          totalDebit: number
          totalCredit: number
        }
      >()

      for (const je of journalEntries) {
        const lines = je.lines || []
        for (const line of lines) {
          if (!line.accountId) continue

          const acc = accountMap.get(line.accountId)
          if (!acc) continue // ★ حساب حذف‌شده یا غیرفعال را نادیده بگیر

          const key = line.accountId
          if (!accountBalances.has(key)) {
            accountBalances.set(key, {
              accountId: line.accountId,
              accountCode: acc.code || '—',
              accountName: acc.name || 'نامشخص',
              accountType: (acc.type || '').toLowerCase(),
              totalDebit: 0,
              totalCredit: 0,
            })
          }

          const row = accountBalances.get(key)!
          row.totalDebit += Number(line.debit) || 0
          row.totalCredit += Number(line.credit) || 0
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  ۴. محاسبه مانده و فیلتر
      // ═══════════════════════════════════════════════════════════════
      const flatRows = Array.from(accountBalances.values())
        .map(row => {
          const balance = row.totalDebit - row.totalCredit
          const balanceLabel = balance > 0
            ? `${Math.abs(balance).toLocaleString('fa-IR')} بد`
            : balance < 0
              ? `${Math.abs(balance).toLocaleString('fa-IR')} بس`
              : '—'
          return {
            ...row,
            balance,
            balanceLabel,
            classification: classifyAccount(row),
          }
        })
        .filter(row => {
          // ★ فیلتر حساب‌های صفر
          if (!includeZero && Math.abs(row.balance) < 1 && row.totalDebit === 0 && row.totalCredit === 0) {
            return false
          }
          return true
        })
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode))

      // ═══════════════════════════════════════════════════════════════
      //  ۵. گروه‌بندی بر اساس نوع (اگر groupByType=true)
      // ═══════════════════════════════════════════════════════════════
      let groups: any[] = []
      if (groupByType) {
        const groupMap = new Map<string, any>()
        for (const row of flatRows) {
          const groupKey = row.classification.group
          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, {
              type: groupKey,
              typeLabel: GROUP_LABELS[groupKey] || row.classification.label,
              order: row.classification.order,
              subtotalDebit: 0,
              subtotalCredit: 0,
              accounts: [],
            })
          }
          const g = groupMap.get(groupKey)!
          g.subtotalDebit += row.totalDebit
          g.subtotalCredit += row.totalCredit
          g.accounts.push(row)
        }
        groups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order)
      }

      // ═══════════════════════════════════════════════════════════════
      //  ۶. محاسبه جمع کل و بررسی تعادل
      // ═══════════════════════════════════════════════════════════════
      const grandDebit = flatRows.reduce((s, r) => s + r.totalDebit, 0)
      const grandCredit = flatRows.reduce((s, r) => s + r.totalCredit, 0)
      const difference = grandDebit - grandCredit
      const isBalanced = Math.abs(difference) < 1

      console.log('[TrialBalance] Computed', {
        accountCount: flatRows.length,
        grandDebit,
        grandCredit,
        difference,
        isBalanced,
      })

      return NextResponse.json({
        success: true,
        data: {
          isBalanced,
          grandDebit: Math.round(grandDebit),
          grandCredit: Math.round(grandCredit),
          difference: Math.round(difference),
          accountCount: flatRows.length,
          dateRange: {
            from: fromDate ? fromDate.toISOString() : null,
            to: toDateEnd.toISOString(),
          },
          groups,
          flatRows: flatRows.map(r => ({
            accountId: r.accountId,
            accountCode: r.accountCode,
            accountName: r.accountName,
            accountType: r.accountType,
            totalDebit: Math.round(r.totalDebit),
            totalCredit: Math.round(r.totalCredit),
            balance: Math.round(r.balance),
            balanceLabel: r.balanceLabel,
            group: r.classification.group,
          })),
        },
      })
    } catch (error: any) {
      console.error('[TrialBalance] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت تراز آزمایشی: ' + (error?.message || 'نامشخص') },
        { status: 500 }
      )
    }
  }
)
