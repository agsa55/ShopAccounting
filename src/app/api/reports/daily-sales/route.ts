// ============================================================================
// src/app/api/reports/daily-sales/route.ts — v2.1 Fiscal Year Isolation + Secure Tenant
// ShopAccounting — Daily Sales Report API
// ----------------------------------------------------------------------------
// ★★★ v2.1:
//   - حذف فاکتورهای خرید از گزارش فروش روزانه
//   - لحاظ فاکتورهای برگشتی فروش با علامت منفی
//   - پشتیبانی از فاکتورهای قدیمی بدون fiscalYearId ولی داخل سال مالی
//   - رفع مشکل timezone در parse تاریخ‌ها
//   - رفع دوبار شمارش در paymentType=mixed
//   - افزودن diagnostics کامل‌تر
//   - حفظ ایزولاسیون سال مالی
//
// ★★★ v2.0:
//   - رفع مشکل امنیتی: tenantId دیگر از query param خوانده نمی‌شود
//   - استفاده از withTenantAndPermission
//   - ایزولاسیون سال مالی
//   - پیش‌فرض: سال مالی فعال
//   - fiscalYearId: سال مالی انتخابی
//   - allYears=true: همه سال‌ها فقط برای بررسی مدیریتی
//   - clamp بازه تاریخ داخل سال مالی
//   - گروه‌بندی تاریخ بر اساس زمان تهران
//   - پشتیبانی از paymentTypeهای cash, credit, card, installment, check, mixed
//   - diagnostics برای عیب‌یابی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}

function isInvalidInvoiceStatus(value: any): boolean {
  const status = normalizeToken(value)
  return status === 'cancelled' || status === 'canceled' || status === 'void'
}

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function parseDateBound(value: any, endOfDay = false): Date | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    return isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  if (isNaN(d.getTime())) return null

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

function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fields = ((model as any).fields || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
}

function tehranDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return tehranDateKey(d)
}

function isPurchaseInvoiceType(value: any): boolean {
  const t = normalizeToken(value)
  return t.includes('purchase')
}

function isSaleReturnInvoiceType(value: any): boolean {
  const t = normalizeToken(value)
  return t === 'sale_return' || (t.includes('sale') && t.includes('return'))
}

async function resolveEffectiveFiscalYear(
  tenantDb: any,
  tenantId: string,
  fiscalYearIdParam: string | null
): Promise<any> {
  if (fiscalYearIdParam) {
    const fy = await tenantDb.fiscalYear.findFirst({
      where: {
        id: fiscalYearIdParam,
        tenantId,
      },
    })

    if (!fy) {
      throw new Error('سال مالی انتخابی یافت نشد.')
    }

    return fy
  }

  const fy = await tenantDb.fiscalYear.findFirst({
    where: {
      tenantId,
      isActive: true,
      isClosed: false,
    },
    orderBy: {
      startDate: 'desc',
    },
  })

  if (!fy) {
    throw new Error('سال مالی فعالی برای این فروشگاه تعریف نشده است.')
  }

  return fy
}

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    console.log('[DailySales v2.1] ★★★ VERSION LOADED — SECURE TENANT + FISCAL YEAR ISOLATION + RETURN AWARE')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const fromParam = searchParams.get('from') || searchParams.get('dateFrom')
      const toParam = searchParams.get('to') || searchParams.get('dateTo')

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null

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
      let fromDate: Date | null = parseDateBound(fromParam, false)
      let toDate: Date | null = parseDateBound(toParam, true)

      if (fromParam && !fromDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ شروع نامعتبر است' },
          { status: 400 }
        )
      }

      if (toParam && !toDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ پایان نامعتبر است' },
          { status: 400 }
        )
      }

      if (effectiveFiscalYearId && fy) {
        const fyStart = parseDateBound(fy.startDate, false)
        const fyEnd = parseDateBound(fy.endDate, true)

        if (!fyStart || !fyEnd) {
          return NextResponse.json(
            {
              success: false,
              error: 'تاریخ‌های سال مالی انتخابی نامعتبر است.',
              code: 'INVALID_FISCAL_YEAR_DATES',
            },
            { status: 400 }
          )
        }

        if (!fromDate) fromDate = new Date(fyStart)
        if (!toDate) toDate = new Date(fyEnd)

        if (fromDate < fyStart) fromDate = new Date(fyStart)
        if (toDate > fyEnd) toDate = new Date(fyEnd)

        fromDate.setHours(0, 0, 0, 0)
        toDate.setHours(23, 59, 59, 999)

        if (fromDate > toDate) {
          return NextResponse.json(
            {
              success: false,
              error: `بازه تاریخ انتخابی با سال مالی «${fy.name}» هم‌پوشانی ندارد.`,
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

      console.log('[DailySales v2.1] Effective query context', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        dateFrom: fromDate ? toLocalISODate(fromDate) : null,
        dateTo: toDate ? toLocalISODate(toDate) : null,
      })

      // ══════════════════════════════════════════════════════
      // ۳. واکشی فاکتورها
      // ══════════════════════════════════════════════════════
      const invoiceWhere: any = {
        tenantId,
      }

      if (Object.keys(dateWhere).length > 0) {
        invoiceWhere.invoiceDate = dateWhere
      }

      const invoiceHasFiscalYearId = isFieldSupported(
        tenantDb.invoice,
        'fiscalYearId'
      )

      if (effectiveFiscalYearId && invoiceHasFiscalYearId) {
        invoiceWhere.AND = [
          {
            OR: [
              // فاکتورهای متصل به سال مالی انتخابی
              { fiscalYearId: effectiveFiscalYearId },

              // فاکتورهای قدیمی بدون fiscalYearId؛
              // چون invoiceDate داخل بازه سال مالی clamp شده، فقط همان دوره دیده می‌شوند.
              { fiscalYearId: null },
            ],
          },
        ]
      }

      const rawInvoices = await tenantDb.invoice.findMany({
        where: invoiceWhere,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          invoiceDate: 'asc',
        },
      })

      // ══════════════════════════════════════════════════════
      // ۴. طبقه‌بندی فاکتورها
      // ══════════════════════════════════════════════════════
      const saleInvoices: any[] = []
      const returnInvoices: any[] = []
      const ignoredInvoices: any[] = []

      const paymentTypeCounts: Record<string, number> = {}
      const statusCounts: Record<string, number> = {}
      const fiscalYearIdCounts: Record<string, number> = {}
      const invoiceTypeCounts: Record<string, number> = {}
      const ignoredInvoiceTypeCounts: Record<string, number> = {}

      for (const inv of rawInvoices) {
        const typeKey = normalizeToken(inv.invoiceType) || 'NULL'
        const statusKey = normalizeToken(inv.status) || 'NULL'
        const paymentKey = normalizeToken(inv.paymentType) || 'NULL'
        const fyKey = inv.fiscalYearId || 'NULL'

        invoiceTypeCounts[typeKey] = (invoiceTypeCounts[typeKey] || 0) + 1
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1
        paymentTypeCounts[paymentKey] = (paymentTypeCounts[paymentKey] || 0) + 1
        fiscalYearIdCounts[fyKey] = (fiscalYearIdCounts[fyKey] || 0) + 1

        if (isInvalidInvoiceStatus(inv.status)) {
          ignoredInvoices.push(inv)
          ignoredInvoiceTypeCounts[typeKey] =
            (ignoredInvoiceTypeCounts[typeKey] || 0) + 1
          continue
        }

        // فاکتور خرید جزو فروش روزانه نیست.
        if (isPurchaseInvoiceType(inv.invoiceType)) {
          ignoredInvoices.push(inv)
          ignoredInvoiceTypeCounts[typeKey] =
            (ignoredInvoiceTypeCounts[typeKey] || 0) + 1
          continue
        }

        if (isSaleReturnInvoiceType(inv.invoiceType)) {
          returnInvoices.push(inv)
          continue
        }

        saleInvoices.push(inv)
      }

      // ══════════════════════════════════════════════════════
      // ۵. گروه‌بندی روزانه
      // ══════════════════════════════════════════════════════
      const dailyMap = new Map<string, any>()

      function ensureDay(key: string) {
        if (!dailyMap.has(key)) {
          dailyMap.set(key, {
            date: key,
            cash: 0,
            credit: 0,
            card: 0,
            installment: 0,
            check: 0,
            mixed: 0,
            other: 0,
            total: 0,
            invoiceCount: 0,
          })
        }

        return dailyMap.get(key)!
      }

      // اگر بازه تاریخ مشخص است، همه روزهای بازه را مقداردهی اولیه کن
      if (fromDate && toDate) {
        let key = tehranDateKey(fromDate)
        const endKey = tehranDateKey(toDate)
        let guard = 0

        while (key <= endKey && guard < 10000) {
          ensureDay(key)
          key = addDaysToKey(key, 1)
          guard++
        }
      }

      function addInvoiceToDay(inv: any, sign: 1 | -1) {
        const invDate = new Date(inv.invoiceDate)
        const key = tehranDateKey(invDate)
        const day = ensureDay(key)

        const rawTotal = safeNum(inv.totalAmount)
        const total = sign * Math.abs(rawTotal)

        day.total += total
        day.invoiceCount += 1

        const paymentType = normalizeToken(inv.paymentType)

        switch (paymentType) {
          case 'cash':
            day.cash += total
            break

          case 'credit':
            day.credit += total
            break

          case 'card':
            day.card += total
            break

          case 'installment':
            day.installment += total
            break

          case 'check':
            day.check += total
            break

          case 'mixed':
            // ★ v2.1: mixed فقط یک‌بار شمارش می‌شود تا جمع دسته‌بندی‌ها با total نخورد.
            day.mixed += total
            break

          default:
            day.other += total
            break
        }
      }

      for (const inv of saleInvoices) {
        addInvoiceToDay(inv, 1)
      }

      for (const inv of returnInvoices) {
        addInvoiceToDay(inv, -1)
      }

      const dailyData = Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      )

      const totals = dailyData.reduce(
        (sum, d) => ({
          cash: sum.cash + d.cash,
          credit: sum.credit + d.credit,
          card: sum.card + d.card,
          installment: sum.installment + d.installment,
          check: sum.check + d.check,
          mixed: sum.mixed + d.mixed,
          other: sum.other + d.other,
          total: sum.total + d.total,
          invoiceCount: sum.invoiceCount + d.invoiceCount,
        }),
        {
          cash: 0,
          credit: 0,
          card: 0,
          installment: 0,
          check: 0,
          mixed: 0,
          other: 0,
          total: 0,
          invoiceCount: 0,
        }
      )

      console.log('[DailySales v2.1] Summary', {
        fiscalYearId: effectiveFiscalYearId,
        allYears,
        rawInvoiceCount: rawInvoices.length,
        saleInvoiceCount: saleInvoices.length,
        returnInvoiceCount: returnInvoices.length,
        ignoredInvoiceCount: ignoredInvoices.length,
        totals,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          daily: dailyData,
          totals,

          from: fromDate ? tehranDateKey(fromDate) : null,
          to: toDate ? tehranDateKey(toDate) : null,

          dateRange: {
            from: fromDate ? toLocalISODate(fromDate) : null,
            to: toDate ? toLocalISODate(toDate) : null,
          },

          fiscalYearRange: fy
            ? {
                from: fy.startDate,
                to: fy.endDate,
              }
            : null,

          diagnostics: {
            rawInvoiceCount: rawInvoices.length,
            validInvoiceCount: saleInvoices.length + returnInvoices.length,
            saleInvoiceCount: saleInvoices.length,
            returnInvoiceCount: returnInvoices.length,
            ignoredInvoiceCount: ignoredInvoices.length,

            paymentTypeCounts,
            statusCounts,
            fiscalYearIdCounts,
            invoiceTypeCounts,
            ignoredInvoiceTypeCounts,
          },
        },
      })
    } catch (error: any) {
      console.error('[DailySales v2.1] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت گزارش فروش روزانه: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)