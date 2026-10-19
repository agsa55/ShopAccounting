// ============================================================================
// src/app/api/cashier-performance/route.ts — v12.1 Fiscal Year Isolation + Secure Tenant + Timezone Safe
// ShopAccounting — Cashier Performance Report API
// ----------------------------------------------------------------------------
// ★★★ v12.1:
//   - رفع مشکل timezone در ساخت بازه today/week/month
//   - پشتیبانی امن از allYears
//   - اگر سال مالی بسته باشد و period خارج از سال مالی باشد، fallback به کل سال مالی
//   - پشتیبانی از from/to سفارشی برای هماهنگی با date range frontend
//   - فیلتر fiscalYearId روی CashMovement با fallback برای داده‌های قدیمی null
//   - مدیریت amount منفی با Math.abs
//   - تشخیص مقاوم‌تر نوع و جهت تراکنش
//   - افزودن summary و diagnostics کامل
//
// ⚠️ نکته مهم:
//   کامپوننت فعلی CashierPerformanceReport در reports-page.tsx هنوز از invoices
//   محاسبه می‌کند و این API را صدا نمی‌زند. اگر بخواهیم این API منبع رسمی گزارش
//   عملکرد صندوق‌دار شود، باید frontend هم به همین endpoint وصل شود.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import {
  inferCashMovementDirection,
  isFieldSupported,
  normalizeToken,
  resolveEffectiveFiscalYear,
  safeNum,
} from '@/lib/fiscal-year-reporting'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

// ─── Date Helpers ───────────────────────────────────────────────

function startOfDay(value: Date): Date {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(value: Date): Date {
  const d = new Date(value)
  d.setHours(23, 59, 59, 999)
  return d
}

function addDays(value: Date, days: number): Date {
  const d = new Date(value)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(value: Date, months: number): Date {
  const d = new Date(value)
  const day = d.getDate()

  d.setDate(1)
  d.setMonth(d.getMonth() + months)

  const lastDayOfTargetMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0
  ).getDate()

  d.setDate(Math.min(day, lastDayOfTargetMonth))
  return d
}

function parseDateBound(value: any, end = false): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null

    const d = new Date(value.getTime())
    if (end) {
      d.setHours(23, 59, 59, 999)
    } else {
      d.setHours(0, 0, 0, 0)
    }
    return d
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${end ? '23:59:59.999' : '00:00:00'}`)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null

  if (end) {
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

// ─── Transaction Helpers ────────────────────────────────────────

function getTransactionType(m: any): string {
  return normalizeToken(
    m?.transactionType ||
      m?.type ||
      m?.movementType ||
      m?.category ||
      ''
  )
}

function resolveDirection(m: any, type: string): 'in' | 'out' | 'neutral' {
  let inferred: any = null

  try {
    inferred = inferCashMovementDirection(m)
  } catch {
    inferred = null
  }

  const normalizedInferred = normalizeToken(inferred)

  if (
    normalizedInferred === 'in' ||
    normalizedInferred === 'incoming' ||
    normalizedInferred === 'credit' ||
    normalizedInferred === 'deposit' ||
    normalizedInferred === 'receipt'
  ) {
    return 'in'
  }

  if (
    normalizedInferred === 'out' ||
    normalizedInferred === 'outgoing' ||
    normalizedInferred === 'debit' ||
    normalizedInferred === 'withdrawal' ||
    normalizedInferred === 'payment'
  ) {
    return 'out'
  }

  const rawDirection = normalizeToken(
    m?.direction ||
      m?.movementDirection ||
      m?.entryDirection ||
      m?.cashDirection ||
      ''
  )

  if (
    rawDirection === 'in' ||
    rawDirection === 'incoming' ||
    rawDirection === 'credit' ||
    rawDirection === 'deposit' ||
    rawDirection === 'receipt' ||
    rawDirection === 'positive'
  ) {
    return 'in'
  }

  if (
    rawDirection === 'out' ||
    rawDirection === 'outgoing' ||
    rawDirection === 'debit' ||
    rawDirection === 'withdrawal' ||
    rawDirection === 'negative' ||
    rawDirection === 'payment_sent'
  ) {
    return 'out'
  }

  if (
    type === 'sale' ||
    type === 'sales' ||
    type === 'sell' ||
    type === 'installment' ||
    type === 'installments' ||
    type === 'deposit' ||
    type === 'check' ||
    type === 'cheque' ||
    type === 'service' ||
    type === 'repair' ||
    type === 'income' ||
    type === 'revenue'
  ) {
    return 'in'
  }

  if (
    type === 'purchase' ||
    type === 'buy' ||
    type === 'expense' ||
    type === 'cost' ||
    type === 'withdrawal' ||
    type === 'withdraw' ||
    type === 'refund_out' ||
    type === 'payment_sent'
  ) {
    return 'out'
  }

  return 'neutral'
}

function createEmptySummary() {
  return {
    totalCashiers: 0,
    transactionCount: 0,
    totalAmount: 0,
    totalSales: 0,
    totalPurchases: 0,
    totalServices: 0,
    totalInstallments: 0,
    totalChecks: 0,
    totalWithdrawals: 0,
    totalDeposits: 0,
    totalExpenses: 0,
    totalRefunds: 0,
    totalOther: 0,
    totalCashIn: 0,
    totalCashOut: 0,
    netCash: 0,
  }
}

export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      console.log(
        '[CashierPerformance v12.1] ★★★ VERSION LOADED — FISCAL + TIMEZONE SAFE'
      )

      if (!tenantDb?.cashMovement) {
        return NextResponse.json({
          success: true,
          fiscalYearId: null,
          fiscalYearName: null,
          allYears: false,
          data: [],
          cashiers: [],
          summary: createEmptySummary(),
          period: {
            type: 'today',
            source: 'model-missing',
            startDate: null,
            endDate: null,
            valid: false,
          },
          diagnostics: {
            modelMissing: true,
            message: 'مدل CashMovement در tenantDb موجود نیست.',
          },
        })
      }

      const { searchParams } = new URL(req.url)

      const period = normalizeToken(searchParams.get('period')) || 'today'
      const cashierIdFilter =
        (searchParams.get('cashierId') || '').trim() || null

      const requestedFromRaw =
        searchParams.get('from') || searchParams.get('dateFrom') || null
      const requestedToRaw =
        searchParams.get('to') || searchParams.get('dateTo') || null

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null
      let fyBounds: { start: Date; end: Date } | null = null

      // ═══════════════════════════════════════════════════════════════
      // ۱. تعیین سال مالی مؤثر
      // ═══════════════════════════════════════════════════════════════
      if (!allYears) {
        try {
          fy = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam || null
          )

          effectiveFiscalYearId = fy.id
          fyBounds = fiscalBounds(fy)

          if (!fyBounds) {
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

      // ═══════════════════════════════════════════════════════════════
      // ۲. ساخت بازه اولیه از period یا from/to سفارشی
      // ═══════════════════════════════════════════════════════════════
      let rangeFrom: Date | null = null
      let rangeTo: Date | null = null
      let rangeSource: 'custom' | 'period' | 'fiscal-year-default' = 'period'

      const hasCustomDateRange = Boolean(requestedFromRaw || requestedToRaw)

      if (hasCustomDateRange) {
        rangeSource = 'custom'

        if (requestedFromRaw) {
          rangeFrom = parseDateBound(requestedFromRaw, false)
          if (!rangeFrom) {
            return NextResponse.json(
              {
                success: false,
                error: 'تاریخ شروع نامعتبر است.',
                code: 'INVALID_FROM_DATE',
              },
              { status: 400 }
            )
          }
        }

        if (requestedToRaw) {
          rangeTo = parseDateBound(requestedToRaw, true)
          if (!rangeTo) {
            return NextResponse.json(
              {
                success: false,
                error: 'تاریخ پایان نامعتبر است.',
                code: 'INVALID_TO_DATE',
              },
              { status: 400 }
            )
          }
        }

        if (!rangeFrom && rangeTo) {
          rangeFrom = startOfDay(rangeTo)
        }

        if (!rangeTo && rangeFrom) {
          rangeTo = endOfDay(rangeFrom)
        }

        if (!rangeFrom || !rangeTo) {
          const now = new Date()
          rangeFrom = startOfDay(now)
          rangeTo = endOfDay(now)
        }
      } else {
        const now = new Date()

        if (period === 'week') {
          // ۷ روز اخیر شامل امروز
          rangeFrom = startOfDay(addDays(now, -6))
          rangeTo = endOfDay(now)
        } else if (period === 'month') {
          // یک ماه اخیر از همین روز ماه قبل تا امروز
          rangeFrom = startOfDay(addMonths(now, -1))
          rangeTo = endOfDay(now)
        } else if (period === 'year') {
          // یک سال اخیر
          rangeFrom = startOfDay(addMonths(now, -12))
          rangeTo = endOfDay(now)
        } else {
          // today
          rangeFrom = startOfDay(now)
          rangeTo = endOfDay(now)
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // ۳. clamp به سال مالی اگر فعال باشد
      // ═══════════════════════════════════════════════════════════════
      if (fyBounds && rangeFrom && rangeTo) {
        if (hasCustomDateRange) {
          if (rangeFrom < fyBounds.start) {
            rangeFrom = new Date(fyBounds.start)
          }

          if (rangeTo > fyBounds.end) {
            rangeTo = new Date(fyBounds.end)
          }
        } else {
          // اگر period پیش‌فرض خارج از سال مالی بود، مثلاً سال مالی بسته است
          // و period=today ارسال شده، به‌جای返回 داده خالی، کل سال مالی را نشان می‌دهیم.
          if (rangeTo < fyBounds.start || rangeFrom > fyBounds.end) {
            rangeFrom = new Date(fyBounds.start)
            rangeTo = new Date(fyBounds.end)
            rangeSource = 'fiscal-year-default'
          } else {
            if (rangeFrom < fyBounds.start) {
              rangeFrom = new Date(fyBounds.start)
            }

            if (rangeTo > fyBounds.end) {
              rangeTo = new Date(fyBounds.end)
            }
          }
        }
      }

      const rangeValid = Boolean(
        rangeFrom && rangeTo && rangeFrom.getTime() <= rangeTo.getTime()
      )

      // ═══════════════════════════════════════════════════════════════
      // ۴. ساخت where clause
      // ═══════════════════════════════════════════════════════════════
      const hasCashMovementFiscalYearId = isFieldSupported(
        tenantDb.cashMovement,
        'fiscalYearId'
      )

      const baseWhere: any = { tenantId }

      if (cashierIdFilter) {
        baseWhere.cashierId = cashierIdFilter
      }

      if (rangeValid && rangeFrom && rangeTo) {
        baseWhere.createdAt = {
          gte: rangeFrom,
          lte: rangeTo,
        }
      }

      const canUseFiscalField = Boolean(
        effectiveFiscalYearId && hasCashMovementFiscalYearId
      )

      let movements: any[] = []
 let fiscalFilterMode:
  | 'none'
  | 'date-range-only'
  | 'or-legacy-null'
  | 'strict-fiscal-year-id'
  | 'skipped-invalid-range'
  | 'no-fiscal-filter' = 'none'
      const queryMovements = async (useLegacyNullOr: boolean) => {
        const where: any = { ...baseWhere }

        if (canUseFiscalField) {
          if (useLegacyNullOr) {
            // سازگاری با داده‌های قدیمی که fiscalYearId ندارند ولی تاریخشان داخل سال مالی است
            where.AND = [
              {
                OR: [
                  { fiscalYearId: effectiveFiscalYearId },
                  { fiscalYearId: null },
                ],
              },
            ]
          } else {
            where.fiscalYearId = effectiveFiscalYearId
          }
        }

        try {
          return await tenantDb.cashMovement.findMany({
            where,
            include: {
              cashier: {
                select: {
                  id: true,
                  username: true,
                  mobile: true,
                },
              },
            },
            take: 10000,
          })
        } catch (includeErr: any) {
          console.warn(
            '[CashierPerformance v12.1] include cashier failed, fallback to plain query:',
            includeErr?.message
          )

          return await tenantDb.cashMovement.findMany({
            where,
            take: 10000,
          })
        }
      }

      if (!rangeValid) {
        fiscalFilterMode = 'skipped-invalid-range'
        movements = []
      } else if (canUseFiscalField) {
        try {
          movements = await queryMovements(true)
          fiscalFilterMode = 'or-legacy-null'
        } catch (orErr: any) {
          console.warn(
            '[CashierPerformance v12.1] OR legacy-null fiscal filter failed, falling back to strict fiscalYearId:',
            orErr?.message
          )

          movements = await queryMovements(false)
          fiscalFilterMode = 'strict-fiscal-year-id'
        }
      } else {
        movements = await queryMovements(false)
        fiscalFilterMode = effectiveFiscalYearId
          ? 'date-range-only'
          : 'no-fiscal-filter'
      }

      // ═══════════════════════════════════════════════════════════════
      // ۵. تجمیع آمار به تفکیک صندوق‌دار
      // ═══════════════════════════════════════════════════════════════
      const cashierStats: Record<string, any> = {}

      for (const m of movements) {
        const amount = Math.abs(safeNum(m.amount))
        if (amount === 0) continue

        const cashierId = m.cashierId || 'unknown'
        const type = getTransactionType(m)
        const direction = resolveDirection(m, type)

        if (!cashierStats[cashierId]) {
          cashierStats[cashierId] = {
            cashierId,
            cashierName:
              (m as any).cashier?.username ||
              (cashierId !== 'unknown'
                ? `کاربر ${String(cashierId).substring(0, 8)}...`
                : 'نامشخص'),
            cashierMobile: (m as any).cashier?.mobile || '',

            transactionCount: 0,
            totalAmount: 0,

            totalSales: 0,
            totalPurchases: 0,
            totalServices: 0,
            totalInstallments: 0,
            totalChecks: 0,
            totalWithdrawals: 0,
            totalDeposits: 0,
            totalExpenses: 0,
            totalRefunds: 0,
            totalOther: 0,

            totalCashIn: 0,
            totalCashOut: 0,
            netCash: 0,
          }
        }

        const stats = cashierStats[cashierId]

        stats.transactionCount += 1
        stats.totalAmount += amount

        if (
          type === 'sale' ||
          type === 'sales' ||
          type === 'sell'
        ) {
          stats.totalSales += amount
        } else if (type === 'purchase' || type === 'buy') {
          stats.totalPurchases += amount
        } else if (type === 'service' || type === 'repair') {
          stats.totalServices += amount
        } else if (type === 'installment' || type === 'installments') {
          stats.totalInstallments += amount
        } else if (type === 'check' || type === 'cheque') {
          stats.totalChecks += amount
        } else if (type === 'withdrawal' || type === 'withdraw') {
          stats.totalWithdrawals += amount
        } else if (type === 'deposit') {
          stats.totalDeposits += amount
        } else if (type === 'expense' || type === 'cost') {
          stats.totalExpenses += amount
        } else if (type === 'refund' || type === 'return') {
          stats.totalRefunds += amount
        } else {
          stats.totalOther += amount
        }

        if (direction === 'in') {
          stats.totalCashIn += amount
        } else if (direction === 'out') {
          stats.totalCashOut += amount
        }
      }

      const result = Object.values(cashierStats)
        .map((s: any) => ({
          ...s,
          netCash: safeNum(s.totalCashIn) - safeNum(s.totalCashOut),
          avgTransactionAmount:
            safeNum(s.transactionCount) > 0
              ? Math.round(safeNum(s.totalAmount) / safeNum(s.transactionCount))
              : 0,
        }))
        .sort((a: any, b: any) => {
          if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales
          return b.totalAmount - a.totalAmount
        })

      const summary = result.reduce(
        (acc: any, s: any) => {
          acc.totalCashiers += 1
          acc.transactionCount += safeNum(s.transactionCount)
          acc.totalAmount += safeNum(s.totalAmount)

          acc.totalSales += safeNum(s.totalSales)
          acc.totalPurchases += safeNum(s.totalPurchases)
          acc.totalServices += safeNum(s.totalServices)
          acc.totalInstallments += safeNum(s.totalInstallments)
          acc.totalChecks += safeNum(s.totalChecks)
          acc.totalWithdrawals += safeNum(s.totalWithdrawals)
          acc.totalDeposits += safeNum(s.totalDeposits)
          acc.totalExpenses += safeNum(s.totalExpenses)
          acc.totalRefunds += safeNum(s.totalRefunds)
          acc.totalOther += safeNum(s.totalOther)

          acc.totalCashIn += safeNum(s.totalCashIn)
          acc.totalCashOut += safeNum(s.totalCashOut)
          acc.netCash += safeNum(s.netCash)

          return acc
        },
        createEmptySummary()
      )

      console.log('[CashierPerformance v12.1] Final Result', {
        tenantId,
        period,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        rangeSource,
        hasCustomDateRange,
        startDate: toLocalISODate(rangeFrom),
        endDate: toLocalISODate(rangeTo),
        rangeValid,
        fiscalFilterMode,
        movementCount: movements.length,
        cashierCount: result.length,
        summary,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,

        // برای سازگاری با مصرف‌کننده‌های مختلف
        data: result,
        cashiers: result,

        summary,

        period: {
          type: period,
          source: rangeSource,
          startDate: toLocalISODate(rangeFrom),
          endDate: toLocalISODate(rangeTo),
          startISO: rangeFrom ? rangeFrom.toISOString() : null,
          endISO: rangeTo ? rangeTo.toISOString() : null,
          valid: rangeValid,
        },

        diagnostics: {
          fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
          requestedFiscalYearId: fiscalYearIdParam || null,
          allYearsRequested: allYears,
          hasCashMovementFiscalYearId,
          fiscalFilterMode,
          requestedPeriod: period,
          hasCustomDateRange,
          cashierIdFilter,
          movementCount: movements.length,
          cashierCount: result.length,
          rangeSource,
        },
      })
    } catch (error: any) {
      console.error('[CashierPerformance v12.1] GET error:', error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت گزارش عملکرد صندوق‌دار: ' +
            (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)