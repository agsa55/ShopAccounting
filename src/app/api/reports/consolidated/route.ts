// ============================================================================
// src/app/api/reports/consolidated/route.ts — GET (v4.1 Fiscal Year Isolation + Legacy Safe)
// ShopAccounting — Consolidated Reports for Multi-Branch
// ----------------------------------------------------------------------------
// ★★★ v4.1:
//   - رفع مشکل timezone در parse تاریخ‌ها
//   - پشتیبانی امن از فاکتورهای قدیمی بدون fiscalYearId ولی داخل سال مالی
//   - پشتیبانی امن از اسناد قدیمی بدون fiscalYearId ولی داخل سال مالی
//   - fallback امن برای نبود فیلد isCancelled
//   - fallback امن برای include lines
//   - محاسبه اقساط cross-year بر اساس سررسید اقساط
//   - diagnostics کامل‌تر
//   - هماهنگ با frontend گزارش‌های سال‌مالی‌محور
//
// ★★★ v4.0:
//   - ایزولاسیون کامل سال مالی
//   - پیش‌فرض: سال مالی فعال
//   - fiscalYearId: سال مالی انتخابی
//   - allYears=true: همه سال‌ها فقط برای بررسی مدیریتی
//   - clamp بازه تاریخ داخل سال مالی
//   - فاکتورها بر اساس fiscalYearId فیلتر می‌شوند
//   - اسناد حسابداری فقط posted/confirmed و غیرcancelled
//   - حذف اسناد اختتامیه/افتتاحیه از سود تلفیقی
//   - محاسبه مانده دریافتنی از فاکتورهای باقی‌مانده‌دار همان سال مالی
//   - پشتیبانی از InstallmentPlan در صورت وجود فیلد fiscalYearId
//
// ★★★ v3.18:
//   - گزارش تلفیقی فروش، سود/زیان، و اقساط همه شعب
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import {
  isFieldSupported,
  normalizeToken,
  resolveEffectiveFiscalYear,
  safeNum,
} from '@/lib/fiscal-year-reporting'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const POSTED_STATUSES = ['posted', 'POSTED', 'Posted', 'confirmed', 'Confirmed']

const EXCLUDED_SOURCE_TYPES = new Set([
  'fiscal_year_close',
  'fiscal_year_open',
  'closing',
  'opening',
])

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

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
  'sales',
  // فارسی
  'درآمد',
  'فروش',
])

const EXPENSE_TYPES = new Set([
  'expense',
  'cogs',
  'repair_expense',
  'service_expense',
  'cost-of-goods-sold',
  'cost_of_goods_sold',
  // فارسی
  'هزینه',
  'بهای تمام شده',
  'بهای تمام‌شده',
  'بها تمام',
])

// ─── Date Helpers ─────────────────────────────────────────────

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

function toLocalISODate(d: Date | null | undefined): string | null {
  if (!d) return null
  if (Number.isNaN(d.getTime())) return null

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

function dateInRange(d: Date | null, from: Date | null, to: Date | null): boolean {
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

// ─── Account Helpers ──────────────────────────────────────────

function normalizeAccountName(value: any): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\u200c/g, ' ')
    .trim()
}

function classifyConsolidatedAccount(acc: {
  code?: string | null
  name?: string | null
  type?: string | null
}): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other' {
  const type = normalizeToken(acc.type)
  const code = String(acc.code || '')
  const name = normalizeAccountName(acc.name)

  if (ASSET_TYPES.has(type)) return 'asset'
  if (LIABILITY_TYPES.has(type)) return 'liability'
  if (EQUITY_TYPES.has(type)) return 'equity'
  if (REVENUE_TYPES.has(type)) return 'revenue'
  if (EXPENSE_TYPES.has(type)) return 'expense'

  const firstDigit = code.charAt(0)

  if (firstDigit === '1') return 'asset'
  if (firstDigit === '2') return 'liability'
  if (firstDigit === '3') return 'equity'
  if (firstDigit === '4') return 'revenue'
  if (firstDigit === '5' || firstDigit === '6' || firstDigit === '7') {
    return 'expense'
  }

  if (
    name.includes('هزینه') ||
    name.includes('بهای تمام') ||
    name.includes('بها تمام')
  ) {
    return 'expense'
  }

  if (
    name.includes('درآمد') ||
    (name.includes('فروش') && !name.includes('فروشگاه'))
  ) {
    return 'revenue'
  }

  return 'other'
}

// ─── Status Helpers ───────────────────────────────────────────

function normalizeStatus(value: any): string {
  return normalizeToken(value)
}

function isInvalidInvoiceStatus(value: any): boolean {
  const status = normalizeStatus(value)
  return status === 'cancelled' || status === 'canceled' || status === 'void'
}

function isPostedOrConfirmed(value: any): boolean {
  const status = normalizeStatus(value)
  return status === 'posted' || status === 'confirmed'
}

// ─── Fiscal Scope Helpers ─────────────────────────────────────

function invoiceMatchesFiscal(
  inv: any,
  effectiveFiscalYearId: string | null,
  bounds: { start: Date; end: Date } | null,
  hasInvoiceFiscalField: boolean
): boolean {
  if (!effectiveFiscalYearId || !bounds) return true

  if (hasInvoiceFiscalField && inv?.fiscalYearId === effectiveFiscalYearId) {
    return true
  }

  const invDate = parseDateBound(inv?.invoiceDate, false)

  if (!hasInvoiceFiscalField || !inv?.fiscalYearId) {
    return dateInRange(invDate, bounds.start, bounds.end)
  }

  return false
}

function journalMatchesFiscal(
  je: any,
  effectiveFiscalYearId: string | null,
  bounds: { start: Date; end: Date } | null,
  hasJeFiscalField: boolean
): boolean {
  if (!effectiveFiscalYearId || !bounds) return true

  if (hasJeFiscalField && je?.fiscalYearId === effectiveFiscalYearId) {
    return true
  }

  const jeDate = parseDateBound(je?.date || je?.entryDate || je?.createdAt, false)

  if (!hasJeFiscalField || !je?.fiscalYearId) {
    return dateInRange(jeDate, bounds.start, bounds.end)
  }

  return false
}

function planMatchesFiscal(
  plan: any,
  invoice: any,
  effectiveFiscalYearId: string | null,
  bounds: { start: Date; end: Date } | null,
  hasPlanFiscalField: boolean
): boolean {
  if (!effectiveFiscalYearId || !bounds) return true

  if (hasPlanFiscalField && plan?.fiscalYearId === effectiveFiscalYearId) {
    return true
  }

  if (invoice?.fiscalYearId === effectiveFiscalYearId) {
    return true
  }

  const invDate = parseDateBound(invoice?.invoiceDate, false)

  if (!invoice?.fiscalYearId && dateInRange(invDate, bounds.start, bounds.end)) {
    return true
  }

  const created = parseDateBound(plan?.createdAt, false)

  if (!invoice && dateInRange(created, bounds.start, bounds.end)) {
    return true
  }

  if (Array.isArray(plan?.schedules)) {
    for (const schedule of plan.schedules) {
      if (schedule?.fiscalYearId === effectiveFiscalYearId) {
        return true
      }

      const due = parseDateBound(schedule?.dueDate, false)

      if (dateInRange(due, bounds.start, bounds.end)) {
        return true
      }
    }
  }

  return false
}

// ─── Journal Fetch Helper ─────────────────────────────────────

async function fetchJournalEntries(tenantDb: any, baseWhere: any): Promise<any[]> {
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
      '[Consolidated v4.1] isCancelled filter failed, retrying without it:',
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
      '[Consolidated v4.1] include lines failed, retrying plain entries:',
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
        '[Consolidated v4.1] journalLine.journalEntryId fallback failed, trying entryId:',
        err?.message
      )

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
          '[Consolidated v4.1] Could not load journal lines manually:',
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

export const GET = withTenantAndPermission('reports')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    console.log(
      '[Consolidated v4.1] ★★★ VERSION LOADED — FISCAL + LEGACY SAFE + CROSS-YEAR INSTALLMENTS'
    )

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const planName =
        tenant.planTierName ||
        tenant.plan?.name ||
        tenant.planName ||
        'basic'

      const features = getFeaturesByPlanName(planName)

      if (!(features as any).canConsolidatedReports) {
        return NextResponse.json(
          {
            success: false,
            error: 'گزارش‌های تلفیقی فقط در پلن سازمانی در دسترس است',
          },
          { status: 403 }
        )
      }

      const { searchParams } = new URL(req.url)

      const startDateParam = searchParams.get('startDate')
      const endDateParam = searchParams.get('endDate')
      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null
      let bounds: { start: Date; end: Date } | null = null

      // ══════════════════════════════════════════════════════
      // ۱. تعیین سال مالی مؤثر
      // ══════════════════════════════════════════════════════
      if (!allYears) {
        try {
          fy = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam || null
          )

          effectiveFiscalYearId = fy.id
          bounds = fiscalBounds(fy)

          if (!bounds) {
            throw new Error('تاریخ شروع یا پایان سال مالی نامعتبر است.')
          }
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

      // ══════════════════════════════════════════════════════
      // ۲. تنظیم بازه تاریخ
      // ══════════════════════════════════════════════════════
      let fromDate: Date | null = startDateParam
        ? parseDateBound(startDateParam, false)
        : null

      let toDate: Date | null = endDateParam
        ? parseDateBound(endDateParam, true)
        : null

      if (startDateParam && !fromDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ شروع نامعتبر است' },
          { status: 400 }
        )
      }

      if (endDateParam && !toDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ پایان نامعتبر است' },
          { status: 400 }
        )
      }

      if (bounds) {
        if (!fromDate) fromDate = new Date(bounds.start)
        if (!toDate) toDate = new Date(bounds.end)

        if (fromDate < bounds.start) fromDate = new Date(bounds.start)
        if (toDate > bounds.end) toDate = new Date(bounds.end)

        fromDate.setHours(0, 0, 0, 0)
        toDate.setHours(23, 59, 59, 999)

        if (fromDate > toDate) {
          return NextResponse.json(
            {
              success: false,
              error: `بازه تاریخ انتخابی با سال مالی «${fy?.name || ''}» هم‌پوشانی ندارد.`,
              code: 'DATE_RANGE_OUTSIDE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      } else {
        if (fromDate) fromDate.setHours(0, 0, 0, 0)
        if (toDate) toDate.setHours(23, 59, 59, 999)

        if (fromDate && toDate && fromDate > toDate) {
          return NextResponse.json(
            {
              success: false,
              error: 'تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد',
            },
            { status: 400 }
          )
        }
      }

      const dateWhere: any = {}

      if (fromDate) dateWhere.gte = fromDate
      if (toDate) dateWhere.lte = toDate

      console.log('[Consolidated v4.1] Effective query context', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        dateFrom: toLocalISODate(fromDate),
        dateTo: toLocalISODate(toDate),
      })

      // ══════════════════════════════════════════════════════
      // ۳. واکشی فاکتورها
      // ══════════════════════════════════════════════════════
      const hasInvoiceFiscal = isFieldSupported(
        tenantDb.invoice,
        'fiscalYearId'
      )

      const invoiceAnd: any[] = []

      if (Object.keys(dateWhere).length > 0) {
        invoiceAnd.push({ invoiceDate: dateWhere })
      }

      if (effectiveFiscalYearId && hasInvoiceFiscal && bounds) {
        invoiceAnd.push({
          OR: [
            { fiscalYearId: effectiveFiscalYearId },
            {
              fiscalYearId: null,
              invoiceDate: {
                gte: bounds.start,
                lte: bounds.end,
              },
            },
          ],
        })
      }

      const invoiceWhere: any = { tenantId }

      if (invoiceAnd.length > 0) {
        invoiceWhere.AND = invoiceAnd
      }

      let rawInvoices: any[] = []

      try {
        rawInvoices = await tenantDb.invoice.findMany({
          where: invoiceWhere,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            remainingAmount: true,
            status: true,
            invoiceDate: true,
            fiscalYearId: true,
            cashier: {
              select: {
                storeId: true,
              },
            },
          },
        })
      } catch (invoiceErr: any) {
        console.warn(
          '[Consolidated v4.1] invoice.cashier select failed, retrying without cashier:',
          invoiceErr?.message
        )

        rawInvoices = await tenantDb.invoice.findMany({
          where: invoiceWhere,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            remainingAmount: true,
            status: true,
            invoiceDate: true,
            fiscalYearId: true,
          },
        })
      }

      const validInvoices = rawInvoices.filter((inv: any) => {
        if (isInvalidInvoiceStatus(inv.status)) return false

        return invoiceMatchesFiscal(
          inv,
          effectiveFiscalYearId,
          bounds,
          hasInvoiceFiscal
        )
      })

      const totalInvoices = validInvoices.length

      const totalSales = validInvoices.reduce(
        (sum: number, inv: any) => sum + safeNum(inv.totalAmount),
        0
      )

      const invoiceOutstandingDebt = validInvoices.reduce(
        (sum: number, inv: any) => sum + safeNum(inv.remainingAmount),
        0
      )

      console.log('[Consolidated v4.1] Invoice summary', {
        rawInvoiceCount: rawInvoices.length,
        validInvoiceCount: validInvoices.length,
        totalSales,
        invoiceOutstandingDebt,
      })

      // ══════════════════════════════════════════════════════
      // ۴. آمار شعب
      // ══════════════════════════════════════════════════════
      const branchMap = new Map<
        string,
        {
          branchId: string
          branchName: string
          invoiceCount: number
          totalSales: number
        }
      >()

      branchMap.set('main', {
        branchId: 'main',
        branchName: 'شعبه اصلی',
        invoiceCount: 0,
        totalSales: 0,
      })

      for (const inv of validInvoices) {
        const storeId = (inv as any).cashier?.storeId || null
        const key = storeId || 'main'

        const current = branchMap.get(key) || {
          branchId: key,
          branchName: 'شعبه بدون نام',
          invoiceCount: 0,
          totalSales: 0,
        }

        current.invoiceCount += 1
        current.totalSales += safeNum(inv.totalAmount)

        branchMap.set(key, current)
      }

      const storeNameMap = new Map<string, string>()

      try {
        const storeUsers = await tenantDb.storeUser.findMany({
          where: {
            tenantId,
            storeId: { not: null },
          },
          select: {
            storeId: true,
            storeName: true,
          },
        })

        for (const su of storeUsers) {
          if (su.storeId && !storeNameMap.has(su.storeId)) {
            storeNameMap.set(su.storeId, su.storeName || 'شعبه بدون نام')
          }
        }
      } catch (err: any) {
        console.warn(
          '[Consolidated v4.1] StoreUser query failed:',
          err?.message
        )
      }

      for (const [key, branch] of branchMap.entries()) {
        if (key !== 'main' && storeNameMap.has(key)) {
          branch.branchName = storeNameMap.get(key) || branch.branchName
        }
      }

      const branchStats = Array.from(branchMap.values()).sort((a, b) => {
        if (a.branchId === 'main') return -1
        if (b.branchId === 'main') return 1
        return b.totalSales - a.totalSales
      })

      // ══════════════════════════════════════════════════════
      // ۵. سود/زیان از اسناد حسابداری
      // ══════════════════════════════════════════════════════
      let totalRevenue = 0
      let totalExpense = 0
      let rawJournalEntryCount = 0
      let activeJournalEntryCount = 0

      const hasJeFiscal = isFieldSupported(
        tenantDb.journalEntry,
        'fiscalYearId'
      )

      try {
        const entriesAnd: any[] = []

        if (Object.keys(dateWhere).length > 0) {
          entriesAnd.push({ date: dateWhere })
        }

        if (effectiveFiscalYearId && hasJeFiscal && bounds) {
          entriesAnd.push({
            OR: [
              { fiscalYearId: effectiveFiscalYearId },
              {
                fiscalYearId: null,
                date: {
                  gte: bounds.start,
                  lte: bounds.end,
                },
              },
            ],
          })
        }

        const entriesWhere: any = {
          tenantId,
          status: {
            in: POSTED_STATUSES,
          },
        }

        if (entriesAnd.length > 0) {
          entriesWhere.AND = entriesAnd
        }

        const rawEntries = await fetchJournalEntries(tenantDb, entriesWhere)

        rawJournalEntryCount = rawEntries.length

        const entries = rawEntries.filter((entry: any) => {
          if (entry?.isCancelled === true) return false
          if (!isPostedOrConfirmed(entry?.status)) return false

          const sourceType = normalizeToken(entry?.sourceType)
          if (EXCLUDED_SOURCE_TYPES.has(sourceType)) return false

          return journalMatchesFiscal(
            entry,
            effectiveFiscalYearId,
            bounds,
            hasJeFiscal
          )
        })

        activeJournalEntryCount = entries.length

        let accountsList: any[] = []

        try {
          accountsList = await tenantDb.account.findMany({
            where: { tenantId },
            select: {
              id: true,
              code: true,
              type: true,
              name: true,
            },
          })
        } catch (accErr: any) {
          console.warn(
            '[Consolidated v4.1] account.type select failed, retrying without type:',
            accErr?.message
          )

          try {
            accountsList = await tenantDb.account.findMany({
              where: { tenantId },
              select: {
                id: true,
                code: true,
                name: true,
              },
            })
          } catch (accErr2: any) {
            console.warn(
              '[Consolidated v4.1] account query failed completely:',
              accErr2?.message
            )

            accountsList = []
          }
        }

        const accountTypeMap = new Map<
          string,
          { type: string; code: string; name: string }
        >()

        for (const a of accountsList) {
          accountTypeMap.set(a.id, {
            type: normalizeToken(a.type),
            code: a.code || '',
            name: normalizeAccountName(a.name),
          })
        }

        for (const entry of entries) {
          for (const line of entry.lines || []) {
            const acc = accountTypeMap.get(line.accountId || '')
            if (!acc) continue

            const category = classifyConsolidatedAccount(acc)

            if (category === 'revenue') {
              totalRevenue += safeNum(line.credit) - safeNum(line.debit)
            } else if (category === 'expense') {
              totalExpense += safeNum(line.debit) - safeNum(line.credit)
            }
          }
        }
      } catch (err: any) {
        console.error(
          '[Consolidated v4.1] Profit calculation failed:',
          err?.message || err
        )
      }

      const totalProfit = totalRevenue - totalExpense

      console.log('[Consolidated v4.1] Journal summary', {
        rawJournalEntryCount,
        activeJournalEntryCount,
        totalRevenue,
        totalExpense,
        totalProfit,
      })

      // ══════════════════════════════════════════════════════
      // ۶. اقساط / InstallmentPlan — Cross-Year Safe
      // ══════════════════════════════════════════════════════
      let installmentRemaining = 0
      let receivableScopeNote: string | null = null

      const hasPlanFiscal = isFieldSupported(
        tenantDb.installmentPlan,
        'fiscalYearId'
      )

      const hasScheduleFiscal = isFieldSupported(
        tenantDb.installmentSchedule,
        'fiscalYearId'
      )

      try {
        let plans: any[] = []

        try {
          plans = await tenantDb.installmentPlan.findMany({
            where: { tenantId },
            include: {
              schedules: {
                select: {
                  id: true,
                  dueDate: true,
                  amount: true,
                  paidAmount: true,
                  status: true,
                  fiscalYearId: hasScheduleFiscal ? true : false,
                },
              },
              invoice: {
                select: {
                  id: true,
                  invoiceDate: true,
                  fiscalYearId: hasInvoiceFiscal ? true : false,
                },
              },
            },
            take: 10000,
          })
        } catch (includeErr: any) {
          console.warn(
            '[Consolidated v4.1] installmentPlan include schedules+invoice failed, trying schedules only:',
            includeErr?.message
          )

          try {
            plans = await tenantDb.installmentPlan.findMany({
              where: { tenantId },
              include: {
                schedules: {
                  select: {
                    id: true,
                    dueDate: true,
                    amount: true,
                    paidAmount: true,
                    status: true,
                    fiscalYearId: hasScheduleFiscal ? true : false,
                  },
                },
              },
              take: 10000,
            })
          } catch (includeErr2: any) {
            console.warn(
              '[Consolidated v4.1] installmentPlan include schedules failed, falling back to plain plans:',
              includeErr2?.message
            )

            plans = await tenantDb.installmentPlan.findMany({
              where: { tenantId },
              take: 10000,
            })
          }
        }

        for (const plan of plans) {
          const planStatus = normalizeToken(plan.status)

          if (
            planStatus === 'cancelled' ||
            planStatus === 'canceled' ||
            planStatus === 'void'
          ) {
            continue
          }

          if (
            effectiveFiscalYearId &&
            bounds &&
            !planMatchesFiscal(
              plan,
              plan.invoice,
              effectiveFiscalYearId,
              bounds,
              hasPlanFiscal
            )
          ) {
            continue
          }

          const schedules = Array.isArray(plan.schedules) ? plan.schedules : []

          for (const s of schedules) {
            const st = normalizeToken(s.status)

            if (st === 'paid') continue

            const due = parseDateBound(s.dueDate, false)
            if (!due) continue

            // ★ برای گزارش دوره‌ای، فقط اقساط سررسید شده داخل بازه مؤثر لحاظ می‌شوند
            if (fromDate && due < fromDate) continue
            if (toDate && due > toDate) continue

            installmentRemaining += Math.max(
              0,
              safeNum(s.amount) - safeNum(s.paidAmount)
            )
          }
        }
      } catch (err: any) {
        console.warn(
          '[Consolidated v4.1] InstallmentPlan query failed:',
          err?.message
        )

        installmentRemaining = 0
        receivableScopeNote =
          'خطا در دریافت مانده اقساط؛ فقط مانده فاکتورها لحاظ شد.'
      }

      const totalReceivable = invoiceOutstandingDebt + installmentRemaining

      // ══════════════════════════════════════════════════════
      // ۷. پاسخ نهایی
      // ══════════════════════════════════════════════════════
      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          summary: {
            totalInvoices,
            totalSales: Math.round(totalSales),
            totalRevenue: Math.round(totalRevenue),
            totalExpense: Math.round(totalExpense),
            totalProfit: Math.round(totalProfit),
            totalReceivable: Math.round(totalReceivable),
            invoiceOutstandingDebt: Math.round(invoiceOutstandingDebt),
            installmentRemaining: Math.round(installmentRemaining),
            receivableScopeNote,
          },
          branchStats: branchStats.map((b) => ({
            ...b,
            totalSales: Math.round(b.totalSales),
          })),
          dateRange: {
            from: toLocalISODate(fromDate),
            to: toLocalISODate(toDate),
          },
          fiscalYearRange: bounds
            ? {
                from: toLocalISODate(bounds.start),
                to: toLocalISODate(bounds.end),
              }
            : fy
            ? {
                from: fy.startDate,
                to: fy.endDate,
              }
            : null,
          diagnostics: {
            rawInvoiceCount: rawInvoices.length,
            validInvoiceCount: validInvoices.length,
            rawJournalEntryCount,
            activeJournalEntryCount,
            hasInvoiceFiscal,
            hasJeFiscal,
            hasPlanFiscal,
            hasScheduleFiscal,
            installmentRemaining,
            invoiceOutstandingDebt,
            scopeMethod: 'fiscal-or-legacy-date-v4.1',
          },
        },
      })
    } catch (error: any) {
      console.error('[Consolidated v4.1] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در گزارش تلفیقی: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)