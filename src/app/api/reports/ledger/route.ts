// ============================================================================
// src/app/api/reports/ledger/route.ts — GET (v10.0 Standard Ledger)
// ShopAccounting — General Ledger Report API
// ----------------------------------------------------------------------------
// ★★★ v10.0:
//   - اصلاح استاندارد حسابداری:
//     مانده ابتدای دوره از تمام سنوات/تاریخ‌های قبل محاسبه می‌شود،
//     نه فقط از سال مالی انتخابی.
//   - حرکات دوره بر اساس fiscalYearId / dateRange فیلتر می‌شوند.
//   - پشتیبانی از allYears برای نمای مدیریتی.
//   - بازگشت fiscalYear کامل برای frontend.
//   - fallback امن اگر فیلدهای fiscalYearId / branchId / isCancelled در schema نبود.
//   - حذف وابستگی ناامن به tenantId از query/header.
//   - فقط اسناد posted/confirmed و غیرابطال‌شده.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

const POSTED_STATUSES = [
  'posted',
  'POSTED',
  'Posted',
  'confirmed',
  'Confirmed',
  'CONFIRMED',
]

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const NO_ACTIVE_FISCAL_YEAR_WARNING =
  'سال مالی فعالی تعریف نشده است. گزارش به‌صورت همه سنوات نمایش داده می‌شود و فقط برای بررسی است.'

const CLOSED_FY_WARNING =
  'سال مالی انتخابی بسته شده است. این گزارش فقط برای مشاهده است.'

const DATE_RANGE_OUTSIDE_FISCAL_YEAR_WARNING =
  'بازه تاریخ انتخابی با سال مالی انتخابی هم‌پوشانی ندارد. گزارش خالی نمایش داده شد.'

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function normalizeStatus(value: any): string {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function isPostedStatus(value: any): boolean {
  const status = normalizeStatus(value)
  return status === 'posted' || status === 'confirmed'
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

function formatBalanceLabel(balance: number): string {
  if (Math.abs(balance) < 1) return '—'
  if (balance > 0) {
    return `${roundMoney(balance).toLocaleString('fa-IR')} بد`
  }
  return `${roundMoney(Math.abs(balance)).toLocaleString('fa-IR')} بس`
}

function utcDay(value: any): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate()
      )
    )
  }

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

function parseDateOnlyParam(value: string | null | undefined): Date | null {
  if (!value) return null
  return utcDay(value)
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000)
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

async function safeFindJournalEntries(tenantDb: any, where: any): Promise<any[]> {
  const include = {
    lines: {
      select: {
        accountId: true,
        debit: true,
        credit: true,
      },
    },
  }

  let currentWhere: any = { ...where }
  let order: any = [{ date: 'asc' }, { number: 'asc' }]

  const removableFields = [
    'fiscalYearId',
    'branchId',
    'isCancelled',
    'status',
  ]

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await tenantDb.journalEntry.findMany({
        where: currentWhere,
        include,
        orderBy: order,
      })
    } catch (err: any) {
      const msg = String(err?.message || '')

      // اگر فیلد number در orderBy پشتیبانی نشد
      if (
        (msg.includes('Unknown argument `number`') ||
          msg.includes("'number'")) &&
        Array.isArray(order) &&
        order.length > 1
      ) {
        order = [{ date: 'asc' }]
        continue
      }

      let changed = false

      for (const field of removableFields) {
        if (
          Object.prototype.hasOwnProperty.call(currentWhere, field) &&
          (msg.includes(field) || msg.includes(`\`${field}\``))
        ) {
          delete currentWhere[field]
          changed = true
        }
      }

      if (!changed) {
        throw err
      }
    }
  }

  return []
}

function prepareEntries(
  rawEntries: any[],
  fiscalYearId: string | null,
  fyStart?: Date | null,
  fyEnd?: Date | null
): any[] {
  const filtered = rawEntries.filter((je: any) => {
    if (!je) return false
    if (je.isCancelled === true) return false
    if (!isPostedStatus(je.status)) return false

    if (fiscalYearId) {
      if (je.fiscalYearId) {
        return String(je.fiscalYearId) === String(fiscalYearId)
      }

      // Legacy entries without fiscalYearId:
      // اگر تاریخ داخل بازه سال مالی بود، نگه دار.
      if (fyStart && fyEnd && je.date) {
        const d = utcDay(je.date)
        if (d) {
          return (
            d.getTime() >= fyStart.getTime() &&
            d.getTime() <= fyEnd.getTime()
          )
        }
      }

      // اگر نه fiscalYearId داشت و نه تاریخ قابل تشخیص، برای جلوگیری از حذف ناخواسته نگه دار.
      return true
    }

    return true
  })

  filtered.sort((a: any, b: any) => {
    const da = utcDay(a?.date)?.getTime() || 0
    const db = utcDay(b?.date)?.getTime() || 0

    if (da !== db) return da - db

    return String(a?.number || '').localeCompare(String(b?.number || ''))
  })

  return filtered
}

function emptyLedgerResponse({
  account,
  fiscalYearId,
  fiscalYearName,
  fiscalYear,
  allYears,
  warning,
  fromDate,
  toDate,
  fiscalYearRange,
}: {
  account: any
  fiscalYearId: string | null
  fiscalYearName: string | null
  fiscalYear: any
  allYears: boolean
  warning: string | null
  fromDate: Date | null
  toDate: Date | null
  fiscalYearRange: { from: string; to: string } | null
}) {
  return NextResponse.json({
    success: true,
    fiscalYearId,
    fiscalYearName,
    fiscalYear,
    allYears,
    warning,
    data: {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: String(account.type || '').toLowerCase(),
      },
      openingBalance: 0,
      openingBalanceLabel: '—',
      totalDebit: 0,
      totalCredit: 0,
      closingBalance: 0,
      closingBalanceLabel: '—',
      dateRange: {
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
      },
      fiscalYearRange,
      rows: [],
    },
  })
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/reports/ledger
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const accountId = (searchParams.get('accountId') || '').trim()
      const dateFromParam = searchParams.get('dateFrom')
      const dateToParam = searchParams.get('dateTo')
      const branchIdParam = (searchParams.get('branchId') || '').trim() || null

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      let allYears = searchParams.get('allYears') === 'true'

      if (!accountId) {
        return NextResponse.json(
          { success: false, error: 'شناسه حساب الزامی است' },
          { status: 400 }
        )
      }

      // ═════════════════════════════════════════════════════════
      //  ۱. دریافت حساب
      // ═════════════════════════════════════════════════════════
      const account = await tenantDb.account.findFirst({
        where: { id: accountId, tenantId },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      })

      if (!account) {
        return NextResponse.json(
          { success: false, error: 'حساب یافت نشد' },
          { status: 404 }
        )
      }

      // ═════════════════════════════════════════════════════════
      //  ۲. تعیین سال مالی مؤثر
      // ═════════════════════════════════════════════════════════
      let fy: any = null
      let effectiveFiscalYearId: string | null = null
      let warning: string | null = null

      if (allYears) {
        warning = ALL_YEARS_WARNING
      } else if (fiscalYearIdParam) {
        fy = await tenantDb.fiscalYear.findFirst({
          where: {
            id: fiscalYearIdParam,
            tenantId,
          },
        })

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

        effectiveFiscalYearId = fy.id

        if (fy.isClosed) {
          warning = CLOSED_FY_WARNING
        }
      } else {
        fy = await tenantDb.fiscalYear.findFirst({
          where: {
            tenantId,
            isActive: true,
            isClosed: false,
          },
          orderBy: {
            startDate: 'desc',
          },
        })

        if (fy) {
          effectiveFiscalYearId = fy.id

          if (fy.isClosed) {
            warning = CLOSED_FY_WARNING
          }
        } else {
          allYears = true
          warning = NO_ACTIVE_FISCAL_YEAR_WARNING
        }
      }

      const fiscalYearPayload = buildFiscalYearPayload(fy)

      // ═════════════════════════════════════════════════════════
      //  ۳. نرمال‌سازی بازه تاریخ
      // ═════════════════════════════════════════════════════════
      let fromDate = parseDateOnlyParam(dateFromParam)
      let toDate = parseDateOnlyParam(dateToParam)

      let fyStart: Date | null = null
      let fyEnd: Date | null = null
      let fiscalYearRange: { from: string; to: string } | null = null

      if (fy) {
        fyStart = utcDay(fy.startDate)
        fyEnd = utcDay(fy.endDate)

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
        return emptyLedgerResponse({
          account,
          fiscalYearId: effectiveFiscalYearId,
          fiscalYearName: fy?.name || null,
          fiscalYear: fiscalYearPayload,
          allYears,
          warning: DATE_RANGE_OUTSIDE_FISCAL_YEAR_WARNING,
          fromDate,
          toDate,
          fiscalYearRange,
        })
      }

      const toDateExclusive = toDate ? addUtcDays(toDate, 1) : null

      console.log('[Ledger v10] Query context', {
        tenantId,
        accountId,
        accountCode: account.code,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        branchId: branchIdParam,
        fromDate: fromDate?.toISOString() || null,
        toDate: toDate?.toISOString() || null,
      })

      // ═════════════════════════════════════════════════════════
      //  ۴. محاسبه مانده ابتدای دوره
      //     ★ نکته مهم: opening هرگز با fiscalYearId فیلتر نمی‌شود.
      // ═════════════════════════════════════════════════════════
      let openingBalance = 0

      if (fromDate) {
        const openingWhere: any = {
          tenantId,
          status: {
            in: POSTED_STATUSES,
          },
          isCancelled: {
            not: true,
          },
          date: {
            lt: fromDate,
          },
        }

        if (branchIdParam) {
          openingWhere.branchId = branchIdParam
        }

        const openingRaw = await safeFindJournalEntries(
          tenantDb,
          openingWhere
        )

        const openingEntries = prepareEntries(openingRaw, null)

        for (const je of openingEntries) {
          const lines = je.lines || []

          for (const line of lines) {
            if (String(line.accountId || '') === accountId) {
              openingBalance +=
                (Number(line.debit) || 0) - (Number(line.credit) || 0)
            }
          }
        }
      }

      // ═════════════════════════════════════════════════════════
      //  ۵. دریافت اسناد دوره
      // ═════════════════════════════════════════════════════════
      const periodWhere: any = {
        tenantId,
        status: {
          in: POSTED_STATUSES,
        },
        isCancelled: {
          not: true,
        },
      }

      if (fromDate || toDateExclusive) {
        const dateWhere: any = {}

        if (fromDate) dateWhere.gte = fromDate
        if (toDateExclusive) dateWhere.lt = toDateExclusive

        periodWhere.date = dateWhere
      }

      if (branchIdParam) {
        periodWhere.branchId = branchIdParam
      }

      const periodRaw = await safeFindJournalEntries(
        tenantDb,
        periodWhere
      )

      const periodEntries = prepareEntries(
        periodRaw,
        effectiveFiscalYearId,
        fyStart,
        fyEnd
      )

      console.log('[Ledger v10] Entries fetched', {
        periodRaw: periodRaw.length,
        periodFiltered: periodEntries.length,
      })

      // ═════════════════════════════════════════════════════════
      //  ۶. ساخت ردیف‌های دفتر کل
      // ═════════════════════════════════════════════════════════
      const rows: any[] = []
      let totalDebit = 0
      let totalCredit = 0
      let runningBalance = openingBalance

      for (const je of periodEntries) {
        const lines = je.lines || []

        for (const line of lines) {
          if (String(line.accountId || '') !== accountId) continue

          const debit = Number(line.debit) || 0
          const credit = Number(line.credit) || 0

          totalDebit += debit
          totalCredit += credit

          runningBalance += debit - credit

          rows.push({
            journalEntryId: je.id,
            journalNumber: je.number,
            date: utcDay(je.date)?.toISOString() || je.date,
            description: je.description,
            lineDescription: line.description || null,
            sourceType: je.sourceType || null,
            sourceId: je.sourceId || null,
            fiscalYearId: je.fiscalYearId || effectiveFiscalYearId || null,
            debit: roundMoney(debit),
            credit: roundMoney(credit),
            balance: roundMoney(runningBalance),
            balanceLabel: formatBalanceLabel(runningBalance),
          })
        }
      }

      const closingBalance = openingBalance + totalDebit - totalCredit

      console.log('[Ledger v10] Computed', {
        rowCount: rows.length,
        openingBalance: roundMoney(openingBalance),
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
        closingBalance: roundMoney(closingBalance),
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        fiscalYear: fiscalYearPayload,
        allYears,
        warning,
        data: {
          account: {
            id: account.id,
            code: account.code,
            name: account.name,
            type: String(account.type || '').toLowerCase(),
          },
          openingBalance: roundMoney(openingBalance),
          openingBalanceLabel: formatBalanceLabel(openingBalance),
          totalDebit: roundMoney(totalDebit),
          totalCredit: roundMoney(totalCredit),
          closingBalance: roundMoney(closingBalance),
          closingBalanceLabel: formatBalanceLabel(closingBalance),
          dateRange: {
            from: fromDate ? fromDate.toISOString() : null,
            to: toDate ? toDate.toISOString() : null,
          },
          fiscalYearRange,
          rows,
        },
      })
    } catch (error: any) {
      console.error('[Ledger v10] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت دفتر کل: ' + (error?.message || 'نامشخص'),
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)