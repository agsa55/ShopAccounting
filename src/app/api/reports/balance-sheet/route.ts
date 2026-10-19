// ============================================================================
// src/app/api/reports/balance-sheet/route.ts — v4.2 Fiscal Year Isolation + Syntax Fixed + Robust
// ShopAccounting — Balance Sheet Report API
// ----------------------------------------------------------------------------
// ★★★ v4.2:
//   - رفع کامل خطاهای syntax نسخه قبلی
//   - حذف تعریف‌های تکراری توابع
//   - استفاده از helperهای مشترک از fiscal-year-reporting
//   - timezone-safe parsing برای asOf و fiscal year bounds
//   - fallback امن برای نبود فیلد isCancelled در JournalEntry
//   - fallback امن برای include lines
//   - پشتیبانی از حساب‌های uncategorized برای جلوگیری از نامتوازنی مصنوعی
//   - افزودن سود/زیان دوره به حقوق صاحبان سهام
//   - diagnostics کامل‌تر
//
// ★★★ v4.0:
//   - ایزولاسیون کامل سال مالی
//   - پیش‌فرض: سال مالی فعال
//   - fiscalYearId: سال مالی انتخابی
//   - allYears=true: همه سال‌ها فقط برای بررسی مدیریتی
//   - clamp تاریخ asOf داخل سال مالی
//   - فقط اسناد posted/confirmed
//   - حذف اسناد cancelled
//   - برگرداندن fiscalYearId / fiscalYearName / fiscalYearRange
//
// ★★★ v3.31:
//   - فیکس محاسبه مانده صندوق منفی
//   - اضافه کردن سود دوره به حقوق صاحبان سهام
//   - حذف درآمد/هزینه از ترازنامه
//   - ابطال سند با Reversal Entry
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import {
  normalizeToken,
  resolveEffectiveFiscalYear,
  safeNum,
} from '@/lib/fiscal-year-reporting'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const POSTED_STATUSES = ['posted', 'POSTED', 'Posted', 'confirmed', 'Confirmed']

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

// ─── Account Type Buckets ────────────────────────────────────

const ASSET_TYPES = new Set([
  'asset',
  'cash',
  'bank',
  'receivable',
  'inventory',
  'fixed-asset',
  'fixed_asset',
  'prepaid',
  'contra_asset',
  // فارسی
  'صندوق',
  'بانک',
  'دریافتنی',
  'موجودی',
  'دارایی',
])

const LIABILITY_TYPES = new Set([
  'liability',
  'payable',
  'loan',
  'tax',
  'tax-payable',
  'tax_payable',
  'accrued',
  'unearned',
  // فارسی
  'بدهی',
  'پرداختنی',
  'وام',
  'مالیات',
])

const EQUITY_TYPES = new Set([
  'equity',
  'capital',
  'retained-earnings',
  'retained_earnings',
  'owners-equity',
  'owners_equity',
  // فارسی
  'حقوق',
  'سرمایه',
  'انباشته',
])

const REVENUE_TYPES = new Set([
  'revenue',
  'service-revenue',
  'service_revenue',
  'income',
  // فارسی
  'درآمد',
  'فروش',
])

const EXPENSE_TYPES = new Set([
  'expense',
  'cogs',
  'repair_expense',
  'cost-of-goods-sold',
  'cost_of_goods_sold',
  // فارسی
  'هزینه',
  'بهای',
])

// ─── Helpers ─────────────────────────────────────────────────

function categorizeAccount(acc: {
  code: string
  name: string
  type: string
}): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other' {
  const type = normalizeToken(acc.type)
  const code = acc.code || ''
  const name = normalizeToken(acc.name)
  const firstDigit = code.charAt(0)

  if (ASSET_TYPES.has(type)) return 'asset'
  if (LIABILITY_TYPES.has(type)) return 'liability'
  if (EQUITY_TYPES.has(type)) return 'equity'
  if (REVENUE_TYPES.has(type)) return 'revenue'
  if (EXPENSE_TYPES.has(type)) return 'expense'

  if (firstDigit === '1') return 'asset'
  if (firstDigit === '2') return 'liability'
  if (firstDigit === '3') return 'equity'
  if (firstDigit === '4') return 'revenue'
  if (firstDigit === '5' || firstDigit === '6' || firstDigit === '7') {
    return 'expense'
  }

  if (
    name.includes('صندوق') ||
    name.includes('بانک') ||
    name.includes('موجودی') ||
    name.includes('دریافتنی') ||
    name.includes('تجهیزات') ||
    name.includes('دارایی')
  ) {
    return 'asset'
  }

  if (
    name.includes('پرداختنی') ||
    name.includes('وام') ||
    name.includes('بدهی') ||
    name.includes('بستانکار')
  ) {
    return 'liability'
  }

  if (name.includes('سرمایه') || name.includes('انباشته')) {
    return 'equity'
  }

  if (name.includes('درآمد') || name.includes('فروش')) {
    return 'revenue'
  }

  if (name.includes('هزینه') || name.includes('بهای تمام')) {
    return 'expense'
  }

  return 'other'
}

function normalizeStatus(value: any): string {
  return normalizeToken(value)
}

function parseDateBound(value: any, endOfDay = false): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null

    const d = new Date(value.getTime())
    if (endOfDay) {
      d.setHours(23, 59, 59, 999)
    } else {
      d.setHours(0, 0, 0, 0)
    }
    return d
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null

  if (endOfDay) {
    d.setHours(23, 59, 59, 999)
  } else {
    d.setHours(0, 0, 0, 0)
  }

  return d
}

function toLocalISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fiscalBounds(fy: any) {
  if (!fy || !fy.startDate || !fy.endDate) return null

  const start = parseDateBound(fy.startDate, false)
  const end = parseDateBound(fy.endDate, true)

  if (!start || !end) return null

  return { start, end }
}

function isOpeningBalanceEntry(je: any): boolean {
  const sourceType = normalizeToken(je?.sourceType)
  const description = normalizeToken(
    je?.description || je?.memo || je?.narration || ''
  )

  return (
    sourceType === 'opening_balance' ||
    sourceType === 'opening' ||
    sourceType === 'initial_balance' ||
    description.includes('opening') ||
    description.includes('گشایش') ||
    description.includes('اعتتاحیه') ||
    description.includes('موجودی اولیه')
  )
}

async function fetchAccounts(tenantDb: any, tenantId: string) {
  try {
    return await tenantDb.account.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    })
  } catch (err: any) {
    console.warn(
      '[BalanceSheet v4.2] account.select type failed, retrying without type:',
      err?.message
    )

    try {
      return await tenantDb.account.findMany({
        where: { tenantId, isActive: true },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
        },
      })
    } catch (err2: any) {
      console.warn(
        '[BalanceSheet v4.2] account.isActive failed, retrying with tenantId only:',
        err2?.message
      )

      return await tenantDb.account.findMany({
        where: { tenantId },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
        },
      })
    }
  }
}

async function fetchPostedEntries(tenantDb: any, tenantId: string, asOf: Date) {
  const baseWhere: any = {
    tenantId,
    status: {
      in: POSTED_STATUSES,
    },
    date: {
      lte: asOf,
    },
  }

  const includeLines = {
    lines: {
      select: {
        accountId: true,
        debit: true,
        credit: true,
      },
    },
  }

  // ۱. تلاش با فیلد isCancelled
  try {
    return await tenantDb.journalEntry.findMany({
      where: {
        ...baseWhere,
        isCancelled: {
          not: true,
        },
      },
      include: includeLines,
    })
  } catch (err: any) {
    console.warn(
      '[BalanceSheet v4.2] isCancelled filter failed, retrying without it:',
      err?.message
    )
  }

  // ۲. تلاش بدون isCancelled ولی با include lines
  try {
    return await tenantDb.journalEntry.findMany({
      where: baseWhere,
      include: includeLines,
    })
  } catch (err: any) {
    console.warn(
      '[BalanceSheet v4.2] include lines failed, retrying plain entries:',
      err?.message
    )
  }

  // ۳. Fallback: entries بدون include، سپس تلاش برای گرفتن خطوط جداگانه
  const entries = await tenantDb.journalEntry.findMany({
    where: baseWhere,
  })

  const ids = entries
    .map((e: any) => e?.id)
    .filter(Boolean)
    .map(String)

  const linesByEntry = new Map<string, any[]>()

  if (ids.length > 0) {
    // تلاش اول: journalLine.journalEntryId
    try {
      const lines = await tenantDb.journalLine.findMany({
        where: {
          journalEntryId: {
            in: ids,
          },
        },
        select: {
          journalEntryId: true,
          accountId: true,
          debit: true,
          credit: true,
        },
      })

      for (const line of lines) {
        const key = String(line.journalEntryId || '')
        if (!key) continue

        if (!linesByEntry.has(key)) linesByEntry.set(key, [])
        linesByEntry.get(key)!.push(line)
      }
    } catch (err: any) {
      console.warn(
        '[BalanceSheet v4.2] journalLine.journalEntryId fallback failed, trying entryId:',
        err?.message
      )

      // تلاش دوم: journalLine.entryId
      try {
        const lines = await tenantDb.journalLine.findMany({
          where: {
            entryId: {
              in: ids,
            },
          },
          select: {
            entryId: true,
            accountId: true,
            debit: true,
            credit: true,
          },
        })

        for (const line of lines) {
          const key = String(line.entryId || '')
          if (!key) continue

          if (!linesByEntry.has(key)) linesByEntry.set(key, [])
          linesByEntry.get(key)!.push(line)
        }
      } catch (err2: any) {
        console.warn(
          '[BalanceSheet v4.2] Could not load journal lines manually:',
          err2?.message
        )
      }
    }
  }

  return entries.map((e: any) => ({
    ...e,
    lines: linesByEntry.get(String(e.id)) || [],
  }))
}

function buildEmptyResponse(asOfISO: string, fiscalYearRange: any) {
  return {
    asOf: asOfISO,
    fiscalYearRange,

    assets: {
      accounts: [],
      total: 0,
    },
    liabilities: {
      accounts: [],
      total: 0,
    },
    equity: {
      accounts: [],
      total: 0,
    },
    uncategorized: {
      accounts: [],
      total: 0,
    },

    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalLiabilitiesAndEquity: 0,
    isBalanced: true,
    difference: 0,
    netIncome: 0,
    retainedEarnings: 0,

    accountCount: 0,
    entryCount: 0,

    diagnostics: {
      balanceMode: 'empty',
      rawEntries: 0,
      activeEntries: 0,
      periodEntries: 0,
      balanceSourceEntries: 0,
      hasOpeningBalanceEntries: false,
      fiscalYearIdCounts: {},
    },
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET — ترازنامه
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    console.log(
      '[BalanceSheet v4.2] ★★★ VERSION LOADED — FISCAL YEAR ISOLATION + SYNTAX FIXED'
    )

    try {
      const planName =
        tenant.planTierName ||
        tenant.plan?.name ||
        tenant.planName ||
        'basic'

      const features = getFeaturesByPlanName(planName)

      if (!(features as any).canViewAccounts) {
        return NextResponse.json(
          {
            success: false,
            error:
              'ترازنامه فقط در پلن حرفه‌ای و سازمانی در دسترس است',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(request.url)

      const asOfParam = searchParams.get('asOf')
      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null

      // ═══════════════════════════════════════════════════════════
      //  ۱. تعیین سال مالی مؤثر
      // ═══════════════════════════════════════════════════════════
      if (!allYears) {
        try {
          fy = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam || null
          )

          effectiveFiscalYearId = fy.id
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              error:
                err?.message ||
                (fiscalYearIdParam
                  ? 'سال مالی انتخابی یافت نشد.'
                  : 'سال مالی فعالی برای این فروشگاه تعریف نشده است.'),
              code: fiscalYearIdParam
                ? 'INVALID_FISCAL_YEAR'
                : 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      const bounds = fy ? fiscalBounds(fy) : null
      let fyStart = bounds?.start || null
      let fyEnd = bounds?.end || null

      // ═══════════════════════════════════════════════════════════
      //  ۲. تعیین تاریخ asOf
      // ═══════════════════════════════════════════════════════════
      let asOf: Date

      if (asOfParam) {
        const parsedAsOf = parseDateBound(asOfParam, true)

        if (!parsedAsOf) {
          return NextResponse.json(
            { success: false, error: 'تاریخ asOf نامعتبر است' },
            { status: 400 }
          )
        }

        asOf = parsedAsOf
      } else {
        asOf = fyEnd ? new Date(fyEnd) : new Date()
        asOf.setHours(23, 59, 59, 999)
      }

      // ★ clamp تاریخ asOf داخل سال مالی
      if (fyStart && asOf < fyStart) {
        asOf = new Date(fyStart)
        asOf.setHours(23, 59, 59, 999)
      }

      if (fyEnd && asOf > fyEnd) {
        asOf = new Date(fyEnd)
        asOf.setHours(23, 59, 59, 999)
      }

      const asOfISO = toLocalISODate(asOf)

      const fiscalYearRange =
        fy && fyStart && fyEnd
          ? {
              from: toLocalISODate(fyStart),
              to: toLocalISODate(fyEnd),
            }
          : fy
          ? {
              from: fy.startDate,
              to: fy.endDate,
            }
          : null

      console.log('[BalanceSheet v4.2] Effective query context', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        asOf: asOf.toISOString(),
        asOfISO,
        fiscalYearRange,
      })

      // ─── ۳. حساب‌های فعال ──────────────────────────────────
      const accounts = await fetchAccounts(tenantDb, tenantId)

      if (accounts.length === 0) {
        return NextResponse.json({
          success: true,
          fiscalYearId: effectiveFiscalYearId,
          fiscalYearName: fy?.name || null,
          allYears,
          warning: allYears ? ALL_YEARS_WARNING : undefined,
          data: buildEmptyResponse(asOfISO, fiscalYearRange),
        })
      }

      // ─── ۴. اسناد posted/confirmed تا asOf ────────────────
      const rawEntries = await fetchPostedEntries(tenantDb, tenantId, asOf)

      const activeEntries = rawEntries.filter((je: any) => {
        if (je?.isCancelled === true) return false

        const status = normalizeStatus(je?.status)
        return status === 'posted' || status === 'confirmed'
      })

      // ─── ۵. اسناد دوره مالی انتخابی ───────────────────────
      const periodEntries =
        effectiveFiscalYearId && fyStart && fyEnd
          ? activeEntries.filter((je: any) => {
              if (je.fiscalYearId === effectiveFiscalYearId) return true

              if (!je.fiscalYearId) {
                const jeDate = parseDateBound(je.date, false)
                if (!jeDate) return false
                return jeDate >= fyStart && jeDate <= asOf
              }

              return false
            })
          : activeEntries

      const hasOpeningBalanceEntries =
        periodEntries.some(isOpeningBalanceEntry)

      // اگر opening balance journal وجود داشته باشد، مانده‌ها فقط از همان سال مالی محاسبه می‌شوند.
      // در غیر این صورت، ترازنامه cumulative تا asOf است.
      const balanceSourceEntries = hasOpeningBalanceEntries
        ? periodEntries
        : activeEntries

      const balanceMode = allYears
        ? 'all-years'
        : hasOpeningBalanceEntries
        ? 'fiscal-year-only'
        : 'cumulative-to-asOf'

      console.log('[BalanceSheet v4.2] Entries context', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        allYears,
        asOf: asOfISO,
        rawEntries: rawEntries.length,
        activeEntries: activeEntries.length,
        periodEntries: periodEntries.length,
        balanceSourceEntries: balanceSourceEntries.length,
        hasOpeningBalanceEntries,
        balanceMode,
      })

      // ─── ۶. محاسبه مانده حساب‌های ترازنامه‌ای ──────────────
      const balances = new Map<string, { debit: number; credit: number }>()

      for (const acc of accounts) {
        balances.set(acc.id, { debit: 0, credit: 0 })
      }

      for (const entry of balanceSourceEntries) {
        for (const line of entry.lines || []) {
          if (!line.accountId) continue

          const b = balances.get(line.accountId)
          if (!b) continue

          b.debit += safeNum(line.debit)
          b.credit += safeNum(line.credit)
        }
      }

      // ─── .۱ محاسبه درآمد/هزینه فقط برای دوره مالی انتخابی ─
      const periodBalances = new Map<
        string,
        { debit: number; credit: number }
      >()

      for (const acc of accounts) {
        periodBalances.set(acc.id, { debit: 0, credit: 0 })
      }

      for (const entry of periodEntries) {
        for (const line of entry.lines || []) {
          if (!line.accountId) continue

          const b = periodBalances.get(line.accountId)
          if (!b) continue

          b.debit += safeNum(line.debit)
          b.credit += safeNum(line.credit)
        }
      }

      // ─── ۷. دسته‌بندی ─────────────────────────────────────
      const assetsList: any[] = []
      const liabilitiesList: any[] = []
      const equityList: any[] = []
      const uncategorizedList: any[] = []

      let totalRevenue = 0
      let totalExpense = 0

      for (const acc of accounts) {
        const cat = categorizeAccount({
          code: acc.code || '',
          name: acc.name || '',
          type: acc.type || '',
        })

        const b = balances.get(acc.id) || { debit: 0, credit: 0 }
        const p = periodBalances.get(acc.id) || { debit: 0, credit: 0 }

        let netBalance = 0

        if (cat === 'asset') {
          netBalance = b.debit - b.credit

          if (Math.abs(netBalance) < 0.01) continue

          assetsList.push({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            debit: b.debit,
            credit: b.credit,
            balance: netBalance,
          })
        } else if (cat === 'liability') {
          netBalance = b.credit - b.debit

          if (Math.abs(netBalance) < 0.01) continue

          liabilitiesList.push({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            debit: b.debit,
            credit: b.credit,
            balance: netBalance,
          })
        } else if (cat === 'equity') {
          netBalance = b.credit - b.debit

          if (Math.abs(netBalance) < 0.01) continue

          equityList.push({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            debit: b.debit,
            credit: b.credit,
            balance: netBalance,
          })
        } else if (cat === 'revenue') {
          totalRevenue += p.credit - p.debit
        } else if (cat === 'expense') {
          totalExpense += p.debit - p.credit
        } else {
          // ★ حساب‌های نامشخص را نادیده نمی‌گیریم؛ با رویه حقوق صاحبان سهام جمع می‌کنیم
          netBalance = b.credit - b.debit

          if (Math.abs(netBalance) < 0.01) continue

          uncategorizedList.push({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type || 'other',
            debit: b.debit,
            credit: b.credit,
            balance: netBalance,
            isUncategorized: true,
          })
        }
      }

      // ─── . سود دوره (Net Income) ─────────────────────────
      const netIncome = totalRevenue - totalExpense

      console.log('[BalanceSheet v4.2] netIncome:', {
        fiscalYearId: effectiveFiscalYearId,
        totalRevenue,
        totalExpense,
        netIncome,
      })

      // ─── ۹. محاسبه جمع‌ها ──────────────────────────────────
      const totalAssets = assetsList.reduce((s, a) => s + a.balance, 0)
      const totalLiabilities = liabilitiesList.reduce(
        (s, a) => s + a.balance,
        0
      )
      const totalEquityBase = equityList.reduce((s, a) => s + a.balance, 0)
      const totalUncategorized = uncategorizedList.reduce(
        (s, a) => s + a.balance,
        0
      )

      // ★ حقوق صاحبان سهام = سرمایه + سود انباشته + سود دوره + حساب‌های نامشخص
      const totalEquity =
        totalEquityBase + netIncome + totalUncategorized

      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
      const difference = totalAssets - totalLiabilitiesAndEquity
      const isBalanced = Math.abs(difference) < 1 // تلرانس ۱ ریال

      console.log('[BalanceSheet v4.2] Summary:', {
        fiscalYearId: effectiveFiscalYearId,
        balanceMode,
        totalAssets,
        totalLiabilities,
        totalEquityBase,
        netIncome,
        totalUncategorized,
        totalEquity,
        totalLiabilitiesAndEquity,
        difference,
        isBalanced,
      })

      // ─── ۱۰. خروجی ─────────────────────────────────────────
      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          asOf: asOfISO,
          fiscalYearRange,

          assets: {
            accounts: assetsList,
            total: totalAssets,
          },
          liabilities: {
            accounts: liabilitiesList,
            total: totalLiabilities,
          },
          equity: {
            accounts: [
              ...equityList,
              ...(Math.abs(netIncome) > 0.01
                ? [
                    {
                      id: 'net-income',
                      code: '3100',
                      name: 'سود (زیان) دوره',
                      type: 'equity',
                      balance: netIncome,
                      isCalculated: true,
                    },
                  ]
                : []),
              ...uncategorizedList,
            ],
            total: totalEquity,
          },
          uncategorized: {
            accounts: uncategorizedList,
            total: totalUncategorized,
          },

          totalAssets,
          totalLiabilities,
          totalEquity,
          totalLiabilitiesAndEquity,
          isBalanced,
          difference,
          netIncome,
          retainedEarnings: netIncome,

          accountCount: accounts.length,
          entryCount: balanceSourceEntries.length,

          diagnostics: {
            balanceMode,
            rawEntries: rawEntries.length,
            activeEntries: activeEntries.length,
            periodEntries: periodEntries.length,
            balanceSourceEntries: balanceSourceEntries.length,
            hasOpeningBalanceEntries,
            totalRevenue,
            totalExpense,
            totalUncategorized,
            fiscalYearIdCounts: (activeEntries as any[]).reduce(
              (acc: Record<string, number>, je: any) => {
                const key = String(je.fiscalYearId || 'NULL')
                acc[key] = (acc[key] || 0) + 1
                return acc
              },
              {} as Record<string, number>
            ),
          },
        },
      })
    } catch (error: any) {
      console.error('[BalanceSheet v4.2] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در محاسبه ترازنامه',
        },
        { status: 500 }
      )
    }
  }
)