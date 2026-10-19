// ============================================================================
// src/app/api/reports/trial-balance/route.ts — GET (v10.2 Opening-Aware Trial Balance)
// ShopAccounting — Trial Balance Report API
// ----------------------------------------------------------------------------
// ★★★ v10.2:
//   - حل اساسی نمایش سند افتتاحیه در سال مالی انتخابی به‌صورت پیش‌فرض
//   - تشخیص گسترده‌تر اسناد افتتاحیه:
//       fiscal_year_open / opening / opening_balance / initial_balance / start_balance
//       + توضیحات含 «افتتاحیه»، «اعتتاحیه»، «گشایش»، «موجودی اولیه»، «مانده اولیه»
//   - پشتیبانی از اسناد legacy با fiscalYearId = null اگر تاریخشان داخل سال مالی باشد
//   - جلوگیری از double counting وقتی سال مالی سند افتتاحیه دارد
//   - اگر سند افتتاحیه نداشت، رفتار قبلی حفظ شود: مانده سنوات قبل اضافه شود
//   - includeOpening پیش‌فرض true
//   - includeLegacyNullFiscalYearEntries پیش‌فرض true
//   - fallback امن برای نبود فیلد isCancelled یا fiscalYearId
//   - fallback امن برای include lines
//   - diagnostics کامل‌تر برای عیب‌یابی frontend/backend
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import {
  getActiveFiscalYear,
  getFiscalYearById,
} from '@/lib/fiscal-year'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const NO_ACTIVE_FISCAL_YEAR_WARNING =
  'سال مالی فعالی تعریف نشده است. گزارش به‌صورت همه سنوات نمایش داده می‌شود و فقط برای بررسی است.'

const DATE_RANGE_OUTSIDE_FISCAL_YEAR_WARNING =
  'بازه تاریخ انتخابی با سال مالی انتخابی هم‌پوشانی ندارد. گزارش خالی نمایش داده شد.'

const POSTED_STATUS_VALUES = [
  'posted',
  'POSTED',
  'Posted',
  'confirmed',
  'Confirmed',
]

const OPENING_SOURCE_TYPES = new Set([
  'fiscal_year_open',
  'fy_open',
  'opening',
  'opening_balance',
  'opening_entry',
  'initial_balance',
  'start_balance',
])

const ACCOUNT_TYPE_GROUPS: Record<
  string,
  { group: string; label: string; order: number }
> = {
  cash: { group: 'asset', label: 'دارایی‌های جاری', order: 1 },
  bank: { group: 'asset', label: 'دارایی‌های جاری', order: 1 },
  receivable: { group: 'asset', label: 'دارایی‌های جاری', order: 1 },
  inventory: { group: 'asset', label: 'دارایی‌های جاری', order: 1 },

  payable: { group: 'liability', label: 'بدهی‌های جاری', order: 2 },
  tax: { group: 'liability', label: 'بدهی‌های جاری', order: 2 },

  equity: { group: 'equity', label: 'حقوق صاحبان سهام', order: 3 },

  revenue: { group: 'revenue', label: 'درآمدها', order: 4 },
  income: { group: 'revenue', label: 'درآمدها', order: 4 },

  cogs: { group: 'expense', label: 'بهای تمام شده', order: 5 },
  expense: { group: 'expense', label: 'هزینه‌های عملیاتی', order: 5 },
  cost: { group: 'expense', label: 'هزینه‌های عملیاتی', order: 5 },
}

const GROUP_LABELS: Record<string, string> = {
  asset: 'دارایی‌ها',
  liability: 'بدهی‌ها',
  equity: 'حقوق صاحبان سهام',
  revenue: 'درآمدها',
  expense: 'هزینه‌ها',
  other: 'سایر',
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

function normalizeToken(value: any): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null

  const s = String(value).trim()
  if (!s) return null

  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    const y = Number(match[1])
    const m = Number(match[2])
    const d = Number(match[3])

    if (m < 1 || m > 12 || d < 1 || d > 31) return null

    return new Date(Date.UTC(y, m - 1, d))
  }

  const date = new Date(s)
  if (Number.isNaN(date.getTime())) return null

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function truncateUtcDay(value: any): Date | null {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function isOpeningEntry(je: any): boolean {
  const sourceType = normalizeToken(je?.sourceType)

  if (OPENING_SOURCE_TYPES.has(sourceType)) return true

  const description = normalizeToken(
    je?.description || je?.memo || je?.narration || ''
  )

  return (
    description.includes('opening') ||
    description.includes('افتتاحیه') ||
    description.includes('اعتتاحیه') ||
    description.includes('گشایش') ||
    description.includes('موجودی اولیه') ||
    description.includes('مانده اولیه')
  )
}

function classifyAccount(account: {
  code?: string | null
  name?: string | null
  type?: string | null
}): { group: string; label: string; order: number } {
  const accType = String(account.type || '').toLowerCase().trim()
  const accCode = String(account.code || '').trim()

  if (ACCOUNT_TYPE_GROUPS[accType]) {
    return ACCOUNT_TYPE_GROUPS[accType]
  }

  if (accCode.startsWith('1')) {
    return { group: 'asset', label: 'دارایی‌ها', order: 1 }
  }

  if (accCode.startsWith('2')) {
    return { group: 'liability', label: 'بدهی‌ها', order: 2 }
  }

  if (accCode.startsWith('3')) {
    return { group: 'equity', label: 'حقوق صاحبان سهام', order: 3 }
  }

  if (accCode.startsWith('4')) {
    return { group: 'revenue', label: 'درآمدها', order: 4 }
  }

  if (
    accCode.startsWith('5') ||
    accCode.startsWith('6') ||
    accCode.startsWith('7')
  ) {
    return { group: 'expense', label: 'هزینه‌ها', order: 5 }
  }

  return { group: 'other', label: 'سایر', order: 6 }
}

function shouldIncludeEntry(entry: any): boolean {
  if (entry?.isCancelled === true) return false

  const status = String(entry?.status || '')
    .toLowerCase()
    .trim()

  return status === 'posted' || status === 'confirmed'
}

function isInSelectedFiscalScope(
  je: any,
  selectedFiscalYearId: string,
  fyStart: Date | null,
  fyEnd: Date | null,
  includeOpening: boolean,
  includeLegacyNullFiscalYearEntries: boolean
): boolean {
  // اگر صراحتاً اسناد افتتاحیه حذف خواسته شده باشند، حتی با fiscalYearId هم شامل نشوند.
  if (!includeOpening && isOpeningEntry(je)) return false

  const jeFiscalYearId = je?.fiscalYearId ? String(je.fiscalYearId) : null
  const jeDate = truncateUtcDay(je?.date)

  const dateInFiscalYear =
    fyStart && fyEnd && jeDate
      ? jeDate >= fyStart && jeDate <= fyEnd
      : true

  // ۱. تگ دقیق سال مالی انتخابی
  if (jeFiscalYearId === String(selectedFiscalYearId)) return true

  // ۲. اسناد legacy بدون fiscalYearId ولی داخل بازهٔ همان سال مالی
  if (
    includeLegacyNullFiscalYearEntries &&
    !jeFiscalYearId &&
    dateInFiscalYear
  ) {
    return true
  }

  // ۳. اسناد افتتاحیه که ممکن است fiscalYearId نداشته باشند یا نادرست tagging شده باشند،
  //    ولی تاریخشان داخل همان سال مالی است.
  if (includeOpening && isOpeningEntry(je) && dateInFiscalYear) {
    return true
  }

  return false
}

async function fetchPostedEntriesUpTo(
  tenantDb: any,
  tenantId: string,
  toDateExclusive: Date | null
): Promise<any[]> {
  const baseWhere: any = {
    tenantId,
    status: {
      in: POSTED_STATUS_VALUES,
    },
  }

  if (toDateExclusive) {
    baseWhere.date = {
      lt: toDateExclusive,
    }
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

  const orderBy = { date: 'asc' as const }

  // ۱. تلاش با isCancelled
  try {
    return await tenantDb.journalEntry.findMany({
      where: {
        ...baseWhere,
        isCancelled: {
          not: true,
        },
      },
      include: includeLines,
      orderBy,
    })
  } catch (err: any) {
    console.warn(
      '[TrialBalance v10.2] isCancelled filter failed, retrying without it:',
      err?.message
    )
  }

  // ۲. تلاش بدون isCancelled ولی با include lines
  try {
    return await tenantDb.journalEntry.findMany({
      where: baseWhere,
      include: includeLines,
      orderBy,
    })
  } catch (err: any) {
    console.warn(
      '[TrialBalance v10.2] include lines failed, retrying plain entries:',
      err?.message
    )
  }

  // ۳. Fallback: entries بدون include، سپس خطوط جداگانه
  const entries = await tenantDb.journalEntry.findMany({
    where: baseWhere,
    orderBy,
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
        '[TrialBalance v10.2] journalLine.journalEntryId fallback failed, trying entryId:',
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
          '[TrialBalance v10.2] Could not load journal lines manually:',
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

function buildFiscalYearPayload(fy: any) {
  if (!fy) return null

  return {
    id: fy.id || null,
    name: fy.name || null,
    startDate: fy.startDate || null,
    endDate: fy.endDate || null,
    isActive: Boolean(fy.isActive),
    isClosed: Boolean(fy.isClosed),
  }
}

function makeEmptyResponse({
  mode,
  fiscalYearId,
  fiscalYearName,
  fiscalYear,
  allYears,
  warning,
  fromDate,
  toDate,
  fiscalYearRange,
  includeOpening,
  includeLegacyNullFiscalYearEntries,
}: {
  mode: 'balance' | 'movement'
  fiscalYearId: string | null
  fiscalYearName: string | null
  fiscalYear: any
  allYears: boolean
  warning: string | null
  fromDate: Date | null
  toDate: Date | null
  fiscalYearRange: { from: string; to: string } | null
  includeOpening: boolean
  includeLegacyNullFiscalYearEntries: boolean
}) {
  return NextResponse.json({
    success: true,
    mode,
    fiscalYearId,
    fiscalYearName,
    fiscalYear,
    allYears,
    warning,
    includeOpening,
    includeLegacyNullFiscalYearEntries,
    data: {
      mode,
      isBalanced: true,
      grandDebit: 0,
      grandCredit: 0,
      difference: 0,
      accountCount: 0,
      dateRange: {
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
      },
      fiscalYearRange,
      groups: [],
      flatRows: [],
    },
  })
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/reports/trial-balance
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log(
      '[TrialBalance v10.2] ★★★ VERSION LOADED — OPENING-AWARE TRIAL BALANCE'
    )

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const dateFromParam = searchParams.get('dateFrom')
      const dateToParam = searchParams.get('dateTo')
      const includeZero = searchParams.get('includeZero') === 'true'
      const groupByType = searchParams.get('groupByType') !== 'false'

      const modeParam = searchParams.get('mode')
      const mode: 'balance' | 'movement' =
        modeParam === 'movement' ? 'movement' : 'balance'

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      let allYears = searchParams.get('allYears') === 'true'

      // ★ v10.2: پیش‌فرض نمایش اسناد افتتاحیه فعال است.
      const includeOpening = searchParams.get('includeOpening') !== 'false'
      const includeLegacyNullFiscalYearEntries =
        searchParams.get('includeLegacyNullFiscalYearEntries') !== 'false'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null
      let baseWarning: string | null = null

      // ═════════════════════════════════════════════════════════
      //  ۱. تعیین سال مالی مؤثر
      // ═════════════════════════════════════════════════════════
      if (!allYears) {
        if (fiscalYearIdParam) {
          try {
            fy = await getFiscalYearById(
              tenantDb,
              tenantId,
              fiscalYearIdParam
            )
          } catch (err: any) {
            return NextResponse.json(
              {
                success: false,
                error:
                  err?.message || 'سال مالی انتخابی یافت نشد.',
                code: 'INVALID_FISCAL_YEAR',
              },
              { status: 400 }
            )
          }

          if (!fy) {
            return NextResponse.json(
              {
                success: false,
                error: 'سال مالی انتخابی یافت نشد.',
                code: 'INVALID_FISCAL_YEAR',
              },
              { status: 400 }
            )
          }
        } else {
          try {
            fy = await getActiveFiscalYear(tenantDb, tenantId)
          } catch {
            allYears = true
            baseWarning = NO_ACTIVE_FISCAL_YEAR_WARNING
          }
        }

        if (fy) {
          effectiveFiscalYearId = fy.id || null
        }
      }

      const fiscalYearPayload = buildFiscalYearPayload(fy)

      // ═════════════════════════════════════════════════════════
      //  ۲. نرمال‌سازی تاریخ‌ها
      // ═════════════════════════════════════════════════════════
      let fromDate = dateFromParam ? parseDateOnly(dateFromParam) : null
      let toDate = dateToParam ? parseDateOnly(dateToParam) : null

      if (dateFromParam && !fromDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ شروع نامعتبر است' },
          { status: 400 }
        )
      }

      if (dateToParam && !toDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ پایان نامعتبر است' },
          { status: 400 }
        )
      }

      let fiscalYearRange: { from: string; to: string } | null = null
      let fyStart: Date | null = null
      let fyEnd: Date | null = null

      if (fy) {
        fyStart = truncateUtcDay(fy.startDate)
        fyEnd = truncateUtcDay(fy.endDate)

        if (fyStart && fyEnd) {
          fiscalYearRange = {
            from: fyStart.toISOString(),
            to: fyEnd.toISOString(),
          }

          if (!fromDate) fromDate = fyStart
          if (!toDate) toDate = fyEnd

          if (fromDate && fromDate < fyStart) fromDate = fyStart
          if (toDate && toDate > fyEnd) toDate = fyEnd
        }
      }

      if (fromDate && toDate && fromDate > toDate) {
        return makeEmptyResponse({
          mode,
          fiscalYearId: effectiveFiscalYearId,
          fiscalYearName: fy?.name || null,
          fiscalYear: fiscalYearPayload,
          allYears,
          warning: DATE_RANGE_OUTSIDE_FISCAL_YEAR_WARNING,
          fromDate,
          toDate,
          fiscalYearRange,
          includeOpening,
          includeLegacyNullFiscalYearEntries,
        })
      }

      const toDateExclusive = toDate
        ? new Date(toDate.getTime() + 86400000)
        : null

      console.log('[TrialBalance v10.2] Query context', {
        tenantId,
        mode,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        fromDate: fromDate?.toISOString() || null,
        toDate: toDate?.toISOString() || null,
        includeZero,
        groupByType,
        includeOpening,
        includeLegacyNullFiscalYearEntries,
      })

      // ═════════════════════════════════════════════════════════
      //  ۳. دریافت حساب‌ها
      //     ★ همه حساب‌ها، حتی غیرفعال، چون ممکن است مانده داشته باشند
      // ═════════════════════════════════════════════════════════
      const accountsRaw = await tenantDb.account.findMany({
        where: { tenantId },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          isActive: true,
        },
      })

      const accounts = (accountsRaw || []) as any[]

      const accountMap = new Map<string, any>(
        accounts.map((a: any) => [String(a?.id || ''), a])
      )

      // ═════════════════════════════════════════════════════════
      //  ۴. دریافت همه اسناد posted/confirmed تا toDate
      //     ★ سپس در JS scope سال مالی اعمال می‌شود تا اسناد افتتاحیه legacy هم دیده شوند.
      // ═════════════════════════════════════════════════════════
      const allEntries = await fetchPostedEntriesUpTo(
        tenantDb,
        tenantId,
        toDateExclusive
      )

      const fiscalScopedEntries = effectiveFiscalYearId
        ? allEntries.filter((je: any) =>
            isInSelectedFiscalScope(
              je,
              effectiveFiscalYearId!,
              fyStart,
              fyEnd,
              includeOpening,
              includeLegacyNullFiscalYearEntries
            )
          )
        : allEntries

      const hasFiscalYearOpeningEntry =
        includeOpening &&
        Boolean(effectiveFiscalYearId) &&
        fiscalScopedEntries.some((je: any) => isOpeningEntry(je))

      console.log('[TrialBalance v10.2] Scope detection', {
        effectiveFiscalYearId,
        allEntries: allEntries.length,
        fiscalScopedEntries: fiscalScopedEntries.length,
        hasFiscalYearOpeningEntry,
        includeOpening,
        includeLegacyNullFiscalYearEntries,
      })

      // ─── حرکات داخل بازه ─────────────────────────────────────
      const movementSourceEntries = fiscalScopedEntries.filter((je: any) => {
        const d = truncateUtcDay(je?.date)
        if (!d) return false

        if (fromDate && d < fromDate) return false
        if (toDateExclusive && d >= toDateExclusive) return false

        return true
      })

      // ─── مانده افتتاحیه قبل از fromDate ──────────────────────
      // ★ فقط در حالت balance نیاز است
      const needOpening = mode === 'balance' && Boolean(fromDate)

      let openingEntries: any[] = []

      let openingScope:
        | 'none'
        | 'same_fiscal_year_only'
        | 'all_prior_periods'
        | 'all_periods' = 'none'

      if (needOpening && fromDate) {
        if (hasFiscalYearOpeningEntry) {
          // اگر سال مالی سند افتتاحیه دارد، فقط همان سال مالی لحاظ شود.
          // در غیر این صورت double counting رخ می‌دهد.
          openingScope = 'same_fiscal_year_only'

          openingEntries = fiscalScopedEntries.filter((je: any) => {
            const d = truncateUtcDay(je?.date)
            return Boolean(d) && d! < fromDate!
          })
        } else {
          // اگر سند افتتاحیه‌ای وجود ندارد، برای حفظ سازگاری با داده‌های قدیمی،
          // مانده سنوات قبل از allEntries محاسبه می‌شود.
          openingScope = effectiveFiscalYearId
            ? 'all_prior_periods'
            : 'all_periods'

          openingEntries = allEntries.filter((je: any) => {
            const d = truncateUtcDay(je?.date)
            return Boolean(d) && d! < fromDate!
          })
        }
      }

      console.log('[TrialBalance v10.2] Opening scope', {
        openingScope,
        needOpening,
        fromDate: fromDate?.toISOString() || null,
        openingEntries: openingEntries.length,
        movementEntries: movementSourceEntries.length,
      })

      // ═════════════════════════════════════════════════════════
      //  ۵. تجمیع مانده افتتاحیه
      // ═════════════════════════════════════════════════════════
      const openingNetMap = new Map<string, number>()

      for (const je of openingEntries) {
        if (!shouldIncludeEntry(je)) continue

        const lines = je?.lines || []

        for (const line of lines) {
          const accountId = String(line?.accountId || '').trim()
          if (!accountId) continue

          const acc = accountMap.get(accountId)
          if (!acc) continue

          const debit = Number(line?.debit || 0)
          const credit = Number(line?.credit || 0)

          openingNetMap.set(
            accountId,
            (openingNetMap.get(accountId) || 0) + debit - credit
          )
        }
      }

      // ═════════════════════════════════════════════════════════
      //  ۶. تجمیع حرکات دوره
      // ═════════════════════════════════════════════════════════
      const movementMap = new Map<
        string,
        { debit: number; credit: number }
      >()

      for (const je of movementSourceEntries) {
        if (!shouldIncludeEntry(je)) continue

        const lines = je?.lines || []

        for (const line of lines) {
          const accountId = String(line?.accountId || '').trim()
          if (!accountId) continue

          const acc = accountMap.get(accountId)
          if (!acc) continue

          const debit = Number(line?.debit || 0)
          const credit = Number(line?.credit || 0)

          if (!movementMap.has(accountId)) {
            movementMap.set(accountId, { debit: 0, credit: 0 })
          }

          const row = movementMap.get(accountId)!
          row.debit += debit
          row.credit += credit
        }
      }

      // ═════════════════════════════════════════════════════════
      //  ۷. ساخت ردیف‌ها
      // ═════════════════════════════════════════════════════════
      const allAccountIds = new Set<string>([
        ...openingNetMap.keys(),
        ...movementMap.keys(),
      ])

      // ★ اگر includeZero=true باشد، همه حساب‌های چارت هم اضافه می‌شوند
      if (includeZero) {
        for (const acc of accounts) {
          const id = String(acc?.id || '').trim()
          if (id) allAccountIds.add(id)
        }
      }

      interface InternalRow {
        accountId: string
        accountCode: string
        accountName: string
        accountType: string
        openingBalance: number
        movementDebit: number
        movementCredit: number
        closingBalance: number
        totalDebit: number
        totalCredit: number
        balance: number
        balanceLabel: string
        classification: { group: string; label: string; order: number }
      }

      const rawRows: InternalRow[] = []

      for (const accountId of allAccountIds) {
        const acc = accountMap.get(accountId)
        if (!acc) continue

        const openingBalance =
          mode === 'balance' ? openingNetMap.get(accountId) || 0 : 0

        const movement = movementMap.get(accountId) || {
          debit: 0,
          credit: 0,
        }

        const movementDebit = movement.debit
        const movementCredit = movement.credit

        const closingBalance =
          openingBalance + movementDebit - movementCredit

        let totalDebit = 0
        let totalCredit = 0
        let balance = 0

        if (mode === 'movement') {
          // رفتار قبلی: فقط حرکات دوره
          totalDebit = movementDebit
          totalCredit = movementCredit
          balance = movementDebit - movementCredit
        } else {
          // تراز آزمایشی استاندارد: مانده پایان دوره در ستون بدهکار/بستانکار
          if (closingBalance > 0) {
            totalDebit = closingBalance
            totalCredit = 0
          } else if (closingBalance < 0) {
            totalDebit = 0
            totalCredit = Math.abs(closingBalance)
          } else {
            totalDebit = 0
            totalCredit = 0
          }

          balance = closingBalance
        }

        const balanceLabel =
          balance > 0
            ? `${roundMoney(balance).toLocaleString('fa-IR')} بد`
            : balance < 0
            ? `${roundMoney(Math.abs(balance)).toLocaleString('fa-IR')} بس`
            : '—'

        rawRows.push({
          accountId,
          accountCode: String(acc.code || '—'),
          accountName: String(acc.name || 'نامشخص'),
          accountType: String(acc.type || '').toLowerCase(),
          openingBalance,
          movementDebit,
          movementCredit,
          closingBalance,
          totalDebit,
          totalCredit,
          balance,
          balanceLabel,
          classification: classifyAccount(acc),
        })
      }

      // ═════════════════════════════════════════════════════════
      //  ۸. فیلتر حساب‌های صفر
      // ═════════════════════════════════════════════════════════
      let filteredRows = rawRows

      if (!includeZero) {
        filteredRows = rawRows.filter((row) => {
          const hasOpening = Math.abs(row.openingBalance) >= 1
          const hasMovementDebit = Math.abs(row.movementDebit) >= 1
          const hasMovementCredit = Math.abs(row.movementCredit) >= 1
          const hasClosing = Math.abs(row.closingBalance) >= 1
          const hasDisplayedBalance = Math.abs(row.balance) >= 1

          return (
            hasOpening ||
            hasMovementDebit ||
            hasMovementCredit ||
            hasClosing ||
            hasDisplayedBalance
          )
        })
      }

      filteredRows.sort((a, b) =>
        String(a.accountCode || '').localeCompare(
          String(b.accountCode || ''),
          undefined,
          { numeric: true }
        )
      )

      // ═════════════════════════════════════════════════════════
      //  ۹. ساخت خروجی نهایی با round
      // ═════════════════════════════════════════════════════════
      const flatRows = filteredRows.map((row) => ({
        accountId: row.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountType: row.accountType,
        openingBalance: roundMoney(row.openingBalance),
        movementDebit: roundMoney(row.movementDebit),
        movementCredit: roundMoney(row.movementCredit),
        closingBalance: roundMoney(row.closingBalance),
        totalDebit: roundMoney(row.totalDebit),
        totalCredit: roundMoney(row.totalCredit),
        balance: roundMoney(row.balance),
        balanceLabel: row.balanceLabel,
        group: row.classification.group,
        typeLabel: row.classification.label,
      }))

      // ═════════════════════════════════════════════════════════
      //  ۱۰. گروه‌بندی
      // ═════════════════════════════════════════════════════════
      let groups: any[] = []

      if (groupByType) {
        const groupMap = new Map<
          string,
          {
            type: string
            typeLabel: string
            order: number
            subtotalDebit: number
            subtotalCredit: number
            accounts: any[]
          }
        >()

        for (const row of flatRows) {
          const classification = classifyAccount({
            code: row.accountCode,
            name: row.accountName,
            type: row.accountType,
          })

          const groupKey = classification.group

          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, {
              type: groupKey,
              typeLabel:
                GROUP_LABELS[groupKey] || classification.label,
              order: classification.order,
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

        groups = Array.from(groupMap.values())
          .map((g) => ({
            ...g,
            subtotalDebit: roundMoney(g.subtotalDebit),
            subtotalCredit: roundMoney(g.subtotalCredit),
          }))
          .sort((a, b) => a.order - b.order)
      }

      // ═════════════════════════════════════════════════════════
      //  ۱۱. جمع کل و تعادل
      // ═════════════════════════════════════════════════════════
      const grandDebit = flatRows.reduce((s, r) => s + r.totalDebit, 0)
      const grandCredit = flatRows.reduce((s, r) => s + r.totalCredit, 0)
      const difference = grandDebit - grandCredit
      const isBalanced = Math.abs(difference) < 1

      let warning = baseWarning

      if (allYears) {
        warning = warning || ALL_YEARS_WARNING
      }

      console.log('[TrialBalance v10.2] Computed', {
        mode,
        fiscalYearId: effectiveFiscalYearId,
        hasFiscalYearOpeningEntry,
        openingScope,
        accountCount: flatRows.length,
        grandDebit,
        grandCredit,
        difference,
        isBalanced,
      })

      return NextResponse.json({
        success: true,
        mode,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        fiscalYear: fiscalYearPayload,
        allYears,
        warning,
        includeOpening,
        includeLegacyNullFiscalYearEntries,
        hasFiscalYearOpeningEntry,
        openingScope,
        diagnostics: {
          allEntries: allEntries.length,
          fiscalScopedEntries: fiscalScopedEntries.length,
          movementEntries: movementSourceEntries.length,
          openingEntries: openingEntries.length,
          openingNetAccounts: openingNetMap.size,
          movementAccounts: movementMap.size,
        },
        data: {
          mode,
          isBalanced,
          grandDebit: roundMoney(grandDebit),
          grandCredit: roundMoney(grandCredit),
          difference: roundMoney(difference),
          accountCount: flatRows.length,
          dateRange: {
            from: fromDate ? fromDate.toISOString() : null,
            to: toDate ? toDate.toISOString() : null,
          },
          fiscalYearRange,
          groups,
          flatRows,
        },
      })
    } catch (error: any) {
      console.error('[TrialBalance v10.2] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت تراز آزمایشی: ' +
            (error?.message || 'نامشخص'),
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)