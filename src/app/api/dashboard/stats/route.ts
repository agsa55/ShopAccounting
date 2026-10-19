// ============================================================================
// src/app/api/dashboard/stats/route.ts — GET (v7.0 Fiscal Year Isolation)
// ShopAccounting — Dashboard Stats API
// ----------------------------------------------------------------------------
// ★★★ v7.0:
//   - ایزولاسیون سال مالی
//   - استفاده از tenant.tenantDb به‌جای db.client
//   - fiscalYearId / allYears
//   - clamp بازه‌های زمانی داخل سال مالی
//   - سود JE-based با فیلتر سال مالی
//   - حذف اسناد cancelled / closing / opening از سود
//   - diagnostics
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface DashboardStats {
  todaySales: number
  todayInvoices: number
  monthSales: number
  monthInvoices: number
  overdueInstallments: number
  totalReceivable: number
  lowStockProducts: number
  monthlySales: number
  monthlyProfit: number
}

interface MonthComparison {
  currentMonth: { sales: number; invoices: number; profit: number }
  previousMonth: { sales: number; invoices: number; profit: number }
  salesGrowth: number
  invoicesGrowth: number
  profitGrowth: number
}

interface TopProduct {
  id: string
  name: string
  code: string
  totalQuantity: number
  totalSales: number
  category: string
}

interface TopCustomer {
  id: string
  name: string
  mobile: string
  totalPurchases: number
  invoiceCount: number
  currentBalance: number
}

interface PaymentMethodBreakdown {
  name: string
  label: string
  value: number
  count: number
  color: string
}

// ═══════════════════════════════════════════════════════════════
//  توابع تاریخ شمسی
// ═══════════════════════════════════════════════════════════════

function div(a: number, b: number): number {
  return Math.floor(a / b)
}

function mod(a: number, b: number): number {
  return a - Math.floor(a / b) * b
}

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) {
    jy = 979
    gy -= 1600
  } else {
    jy = 0
    gy -= 621
  }

  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    g_d_m[gm - 1]

  jy += 33 * div(days, 12053)
  days = mod(days, 12053)
  jy += 4 * div(days, 1461)
  days = mod(days, 1461)

  if (days > 365) {
    jy += div(days - 1, 365)
    days = mod(days - 1, 365)
  }

  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30))

  return [jy, jm, jd]
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) {
    gy = 1600
    jy -= 979
  } else {
    gy = 621
  }

  let days =
    365 * jy +
    div(jy, 33) * 8 +
    div(mod(jy, 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)

  gy += 400 * div(days, 146097)
  days = mod(days, 146097)

  if (days > 36524) {
    gy += 100 * div(--days, 36524)
    days = mod(days, 36524)
    if (days >= 365) days++
  }

  gy += 4 * div(days, 1461)
  days = mod(days, 1461)

  if (days > 365) {
    gy += div(days - 1, 365)
    days = mod(days - 1, 365)
  }

  let gd = days + 1
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  let gm: number
  for (gm = 0; gm < 13; gm++) {
    if (gd <= sal_a[gm]) break
    gd -= sal_a[gm]
  }

  return [gy, gm, gd]
}

function getTodayJalali(): { jy: number; jm: number; jd: number } {
  const now = new Date()
  const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return { jy, jm, jd }
}

function getStartOfJalaliMonth(): Date {
  const { jy, jm } = getTodayJalali()
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1)
  return new Date(gy, gm - 1, gd, 0, 0, 0, 0)
}

function getStartOfPreviousJalaliMonth(): Date {
  const { jy, jm } = getTodayJalali()
  let prevJy = jy
  let prevJm = jm - 1

  if (prevJm < 1) {
    prevJm = 12
    prevJy = jy - 1
  }

  const [gy, gm, gd] = jalaliToGregorian(prevJy, prevJm, 1)
  return new Date(gy, gm - 1, gd, 0, 0, 0, 0)
}

function getEndOfPreviousJalaliMonth(): Date {
  return getStartOfJalaliMonth()
}

function getStartOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getDayNameFa(date: Date): string {
  const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
  return days[date.getDay()]
}

function getPersianDateShort(date: Date): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'short' }).format(date)
  } catch {
    return getDayNameFa(date)
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}

const ALL_YEARS_WARNING =
  'این داشبورد همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const POSTED_STATUSES = ['posted', 'POSTED', 'Posted', 'confirmed', 'Confirmed']

const EXCLUDED_SOURCE_TYPES = new Set([
  'fiscal_year_close',
  'fiscal_year_open',
  'closing',
  'opening',
])

const INVALID_INVOICE_STATUS_FILTER = {
  notIn: ['cancelled', 'Cancelled'],
}

const SALE_INVOICE_TYPE_FILTER = {
  notIn: ['sale_return', 'purchase_return'],
}

const RETURN_INVOICE_TYPE_FILTER = {
  in: ['sale_return', 'purchase_return'],
}

function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fields = ((model as any).fields || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
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

// ═══════════════════════════════════════════════════════════════
//  JE-Based Monthly Profit
// ═══════════════════════════════════════════════════════════════

async function computeMonthlyProfit(
  tenantDb: any,
  tenantId: string,
  startDate: Date,
  endDate: Date,
  fiscalYearId: string | null
): Promise<number> {
  try {
    const entriesWhere: any = {
      tenantId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        in: POSTED_STATUSES,
      },
    }

    if (fiscalYearId) {
      entriesWhere.fiscalYearId = fiscalYearId
    }

    const allEntries = await tenantDb.journalEntry.findMany({
      where: entriesWhere,
      include: { lines: true },
    })

    const entries = allEntries.filter((e: any) => {
      if (e.isCancelled === true) return false

      const sourceType = normalizeToken(e.sourceType)
      if (EXCLUDED_SOURCE_TYPES.has(sourceType)) return false

      return true
    })

    const accountsList = await tenantDb.account.findMany({
      where: { tenantId },
      select: { id: true, code: true, type: true, name: true },
    })

    const accountMap = new Map<string, { type: string; code: string; name: string }>()
    for (const a of accountsList) {
      accountMap.set(a.id, {
        type: (a.type || '').toLowerCase(),
        code: a.code || '',
        name: (a.name || '').toLowerCase(),
      })
    }

    let revenueCr = 0
    let revenueDr = 0
    let cogsDr = 0
    let cogsCr = 0
    let expenseDr = 0

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        const acc = line.accountId ? accountMap.get(line.accountId) : null
        if (!acc) continue

        const dr = safeNum(line.debit)
        const cr = safeNum(line.credit)
        const accCode = acc.code
        const accType = acc.type

        const isRevenue =
          accType === 'revenue' ||
          accType === 'sales' ||
          accType === 'income' ||
          accCode.startsWith('4')

        const isCogs = accType === 'cogs' || accCode === '5000'

        const isExpense =
          (accType === 'expense' ||
            accType === 'repair_expense' ||
            accType === 'service_expense' ||
            accCode.startsWith('5') ||
            accCode.startsWith('6')) &&
          !isCogs

        if (isRevenue) {
          revenueCr += cr
          revenueDr += dr
        } else if (isCogs) {
          cogsDr += dr
          cogsCr += cr
        } else if (isExpense && dr > 0) {
          expenseDr += dr
        }
      }
    }

    if (revenueCr > 0 || cogsDr > 0) {
      const netRevenue = revenueCr - revenueDr
      const netCogs = Math.max(0, cogsDr - cogsCr)
      return netRevenue - netCogs - expenseDr
    }

    // Fallback: Invoice + product.averageCost
    const invoiceWhere: any = {
      tenantId,
      invoiceDate: {
        gte: startDate,
        lte: endDate,
      },
      status: INVALID_INVOICE_STATUS_FILTER,
      invoiceType: SALE_INVOICE_TYPE_FILTER,
    }

    if (fiscalYearId) {
      invoiceWhere.fiscalYearId = fiscalYearId
    }

    const invoicesInMonth = await tenantDb.invoice.findMany({
      where: invoiceWhere,
      include: {
        items: {
          select: { productId: true, quantity: true, unitPrice: true },
        },
      },
    })

    if (invoicesInMonth.length === 0) {
      return 0
    }

    const netRevenueFallback = invoicesInMonth.reduce(
      (s: number, inv: any) => s + safeNum(inv.totalAmount) - safeNum(inv.discountAmount),
      0
    )

    const invProductIds = [
      ...new Set(
        invoicesInMonth.flatMap((inv: any) =>
          (inv.items || []).map((i: any) => i.productId).filter(Boolean)
        )
      ),
    ] as string[]

    let fallbackCogs = 0

    if (invProductIds.length > 0) {
      const invProducts = await tenantDb.product.findMany({
        where: { id: { in: invProductIds } },
        select: { id: true, averageCost: true, purchasePrice: true },
      })

      const invProductMap = new Map<string, any>()
      for (const p of invProducts) invProductMap.set(p.id, p)

      for (const inv of invoicesInMonth) {
        for (const item of inv.items || []) {
          if (!item.productId) continue
          const p = invProductMap.get(item.productId)
          if (!p) continue

          const unitCost =
            safeNum(p.averageCost) > 0 ? safeNum(p.averageCost) : safeNum(p.purchasePrice)

          fallbackCogs += unitCost * safeNum(item.quantity)
        }
      }
    }

    return netRevenueFallback - fallbackCogs
  } catch (err: any) {
    console.warn('[Dashboard][Profit v7.0] computeMonthlyProfit FAILED:', err?.message)
    return 0
  }
}

// ═══════════════════════════════════════════════════════════════
//  Main API
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('dashboard')(
  async (request: NextRequest, _context: any, tenant: any) => {
    const startTime = Date.now()

    console.log('[Dashboard Stats v7.0] ★★★ VERSION LOADED — FISCAL YEAR ISOLATION')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(request.url)

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null

      if (!allYears) {
        try {
          fy = await resolveEffectiveFiscalYear(tenantDb, tenantId, fiscalYearIdParam || null)
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
              code: fiscalYearIdParam ? 'INVALID_FISCAL_YEAR' : 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      const now = new Date()
      const startOfToday = getStartOfToday()
      const endOfToday = new Date(now)
      endOfToday.setHours(23, 59, 59, 999)

      const startOfMonth = getStartOfJalaliMonth()
      const startOfPreviousMonth = getStartOfPreviousJalaliMonth()
      const endOfPreviousMonth = getEndOfPreviousJalaliMonth()

      function clampRange(from: Date | null, to: Date | null) {
        if (!fy) {
          return { from, to, valid: true }
        }

        const fyStart = new Date(fy.startDate)
        const fyEnd = new Date(fy.endDate)

        fyStart.setHours(0, 0, 0, 0)
        fyEnd.setHours(23, 59, 59, 999)

        const f = from ? new Date(Math.max(from.getTime(), fyStart.getTime())) : new Date(fyStart)
        const t = to ? new Date(Math.min(to.getTime(), fyEnd.getTime())) : new Date(fyEnd)

        f.setHours(0, 0, 0, 0)
        t.setHours(23, 59, 59, 999)

        return {
          from: f,
          to: t,
          valid: f.getTime() <= t.getTime(),
        }
      }

      const todayRange = clampRange(startOfToday, endOfToday)
      const monthRange = clampRange(startOfMonth, endOfToday)
      const previousMonthRange = clampRange(startOfPreviousMonth, endOfPreviousMonth)

      const sevenDaysAgo = new Date(now)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      const last7Range = clampRange(sevenDaysAgo, endOfToday)

      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
      thirtyDaysAgo.setHours(0, 0, 0, 0)
      const last30Range = clampRange(thirtyDaysAgo, endOfToday)

      function invWhere(extra: any = {}): any {
        const w: any = { tenantId, ...extra }
        if (effectiveFiscalYearId) {
          w.fiscalYearId = effectiveFiscalYearId
        }
        return w
      }

      // ─── ۱. فروش امروز ─────────────────────────────────────
      let todaySales = 0
      let todayInvoices = 0

      if (todayRange.valid && todayRange.from && todayRange.to) {
        try {
          const todayData: any = await tenantDb.invoice.aggregate({
            where: invWhere({
              invoiceDate: {
                gte: todayRange.from,
                lte: todayRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            _sum: { totalAmount: true },
            _count: true,
          })

          todaySales = safeNum(todayData?._sum?.totalAmount)
          todayInvoices = safeNum(todayData?._count)
        } catch (err: any) {
          console.warn('[Dashboard v7.0] todaySales query failed:', err?.message)
        }
      }

      // ─── ۲. فروش ماه شمسی ──────────────────────────────────
      let monthSales = 0
      let monthInvoices = 0

      if (monthRange.valid && monthRange.from && monthRange.to) {
        try {
          const monthData: any = await tenantDb.invoice.aggregate({
            where: invWhere({
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            _sum: { totalAmount: true },
            _count: true,
          })

          monthSales = safeNum(monthData?._sum?.totalAmount)
          monthInvoices = safeNum(monthData?._count)

          const returnData: any = await tenantDb.invoice.aggregate({
            where: invWhere({
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: RETURN_INVOICE_TYPE_FILTER,
            }),
            _sum: { totalAmount: true },
          })

          const monthReturns = safeNum(returnData?._sum?.totalAmount)
          monthSales = monthSales - monthReturns
        } catch (err: any) {
          console.warn('[Dashboard v7.0] monthSales query failed:', err?.message)
        }
      }

      // ─── ۳. مانده فاکتورها ─────────────────────────────────
      let invoiceOutstandingDebt = 0

      try {
        const outstandingAgg: any = await tenantDb.invoice.aggregate({
          where: invWhere({
            remainingAmount: { gt: 0 },
            status: INVALID_INVOICE_STATUS_FILTER,
          }),
          _sum: { remainingAmount: true },
        })

        invoiceOutstandingDebt = safeNum(outstandingAgg?._sum?.remainingAmount)
      } catch (err: any) {
        console.warn('[Dashboard v7.0] invoiceOutstandingDebt query failed:', err?.message)
      }

      // ─── ۴. اقساط سررسید شده / مانده اقساط ─────────────────
      let overdueInstallmentsCount = 0
      let installmentRemaining = 0
      let installmentScopeNote: string | null = null

      try {
        const hasFiscalYearIdOnInstallmentPlan = isFieldSupported(
          tenantDb.installmentPlan,
          'fiscalYearId'
        )

        if (effectiveFiscalYearId && !hasFiscalYearIdOnInstallmentPlan) {
          installmentScopeNote =
            'InstallmentPlan فاقد فیلد fiscalYearId است؛ برای جلوگیری از قاطی شدن سال‌های مالی، اقساط در داشبورد سال‌محور لحاظ نشد.'
        } else {
          const planWhere: any = {
            tenantId,
            status: {
              in: ['active', 'Active', 'overdue', 'Overdue'],
            },
          }

          if (effectiveFiscalYearId) {
            planWhere.fiscalYearId = effectiveFiscalYearId
          }

          const activePlans = await tenantDb.installmentPlan.findMany({
            where: planWhere,
            include: {
              schedules: {
                where: {
                  tenantId,
                  status: {
                    in: ['pending', 'Pending', 'overdue', 'Overdue'],
                  },
                  dueDate: {
                    lt: now,
                  },
                },
              },
            },
          })

          for (const plan of activePlans) {
            overdueInstallmentsCount += (plan.schedules || []).length
          }

          const remainingSum: any = await tenantDb.installmentPlan.aggregate({
            where: planWhere,
            _sum: { remainingAmount: true },
          })

          installmentRemaining = safeNum(remainingSum?._sum?.remainingAmount)
        }
      } catch (err: any) {
        console.warn('[Dashboard v7.0] installments query failed:', err?.message)
        installmentScopeNote = 'خطا در دریافت اقساط؛ مانده اقساط صفر لحاظ شد.'
      }

      const totalReceivable = invoiceOutstandingDebt + installmentRemaining

      // ─── ۵. کالاهای کم‌موجود / ناموجود ──────────────────────
      let lowStockProductsCount = 0

      try {
        const activeProducts = await tenantDb.product.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, currentStock: true, minStock: true },
        })

        lowStockProductsCount = activeProducts.filter((p: any) => {
          const cs = safeNum(p.currentStock)
          const ms = safeNum(p.minStock)
          return ms > 0 ? cs <= ms : cs <= 0
        }).length
      } catch (err: any) {
        console.warn('[Dashboard v7.0] lowStockProducts query failed:', err?.message)
      }

      // ─── ۶. آخرین فاکتورها ─────────────────────────────────
      let recentInvoices: any[] = []

      try {
        const invoices: any = await tenantDb.invoice.findMany({
          where: invWhere({
            status: INVALID_INVOICE_STATUS_FILTER,
            invoiceType: SALE_INVOICE_TYPE_FILTER,
          }),
          orderBy: { invoiceDate: 'desc' },
          take: 5,
          include: {
            customer: { select: { firstName: true, lastName: true } },
          },
        })

        recentInvoices = invoices.map((inv: any) => ({
          id: inv.id,
          number: inv.number,
          invoiceDate: inv.invoiceDate.toISOString(),
          customerName: inv.customer
            ? `${inv.customer.firstName} ${inv.customer.lastName}`.trim()
            : 'فروش عمومی',
          totalAmount: safeNum(inv.totalAmount),
          paymentType: inv.paymentType || 'Cash',
          status: inv.status || 'Draft',
        }))
      } catch (err: any) {
        console.warn('[Dashboard v7.0] recentInvoices query failed:', err?.message)
      }

      // ─── ۷. فروش ۷ روز اخیر ───────────────────────────────
      let dailySales: any[] = []

      try {
        const salesByDay = new Map<string, number>()

        for (let i = 6; i >= 0; i--) {
          const d = new Date(now)
          d.setDate(d.getDate() - i)
          d.setHours(0, 0, 0, 0)
          salesByDay.set(d.toISOString().split('T')[0], 0)
        }

        if (last7Range.valid && last7Range.from && last7Range.to) {
          const last7Invoices: any = await tenantDb.invoice.findMany({
            where: invWhere({
              invoiceDate: {
                gte: last7Range.from,
                lte: last7Range.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            select: { invoiceDate: true, totalAmount: true },
          })

          for (const inv of last7Invoices) {
            const dayKey = inv.invoiceDate.toISOString().split('T')[0]
            if (salesByDay.has(dayKey)) {
              salesByDay.set(dayKey, salesByDay.get(dayKey)! + safeNum(inv.totalAmount))
            }
          }
        }

        dailySales = Array.from(salesByDay.entries()).map(([key, sales]) => ({
          date: getDayNameFa(new Date(key)),
          sales,
        }))
      } catch (err: any) {
        console.warn('[Dashboard v7.0] dailySales query failed:', err?.message)

        for (let i = 6; i >= 0; i--) {
          const d = new Date(now)
          d.setDate(d.getDate() - i)
          dailySales.push({ date: getDayNameFa(d), sales: 0 })
        }
      }

      // ─── ۸. فروش ۳۰ روز اخیر ──────────────────────────────
      let dailySales30: any[] = []

      try {
        const salesByDay30 = new Map<string, number>()

        for (let i = 29; i >= 0; i--) {
          const d = new Date(now)
          d.setDate(d.getDate() - i)
          d.setHours(0, 0, 0, 0)
          salesByDay30.set(d.toISOString().split('T')[0], 0)
        }

        if (last30Range.valid && last30Range.from && last30Range.to) {
          const last30Invoices: any = await tenantDb.invoice.findMany({
            where: invWhere({
              invoiceDate: {
                gte: last30Range.from,
                lte: last30Range.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            select: { invoiceDate: true, totalAmount: true },
          })

          for (const inv of last30Invoices) {
            const dayKey = inv.invoiceDate.toISOString().split('T')[0]
            if (salesByDay30.has(dayKey)) {
              salesByDay30.set(dayKey, salesByDay30.get(dayKey)! + safeNum(inv.totalAmount))
            }
          }
        }

        dailySales30 = Array.from(salesByDay30.entries()).map(([key, sales]) => ({
          date: getPersianDateShort(new Date(key)),
          sales,
        }))
      } catch (err: any) {
        console.warn('[Dashboard v7.0] dailySales30 query failed:', err?.message)
      }

      // ─── . توزیع فروش بر اساس دسته‌بندی ───────────────────
      let categorySales: any[] = []

      try {
        const categoriesMap = new Map<string, string>()

        try {
          const categories = await tenantDb.category.findMany({
            where: { tenantId },
            select: { id: true, name: true },
          })

          for (const c of categories) categoriesMap.set(c.id, c.name)
        } catch {
          /* ignore */
        }

        if (monthRange.valid && monthRange.from && monthRange.to) {
          const allInvoices: any = await tenantDb.invoice.findMany({
            where: invWhere({
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            select: {
              items: { select: { productId: true, lineTotal: true } },
            },
          })

          const productIds = new Set<string>()

          for (const inv of allInvoices) {
            for (const item of inv.items || []) {
              if (item.productId) productIds.add(item.productId)
            }
          }

          const productToCategory = new Map<string, string>()

          if (productIds.size > 0) {
            try {
              const products = await tenantDb.product.findMany({
                where: { id: { in: Array.from(productIds) }, tenantId },
                select: { id: true, categoryId: true },
              })

              for (const p of products) {
                productToCategory.set(p.id, p.categoryId || 'unknown')
              }
            } catch {
              /* ignore */
            }
          }

          const salesByCategory = new Map<string, number>()
          let totalCatSales = 0

          for (const inv of allInvoices) {
            for (const item of inv.items || []) {
              const catId = item.productId
                ? productToCategory.get(item.productId) || 'unknown'
                : 'unknown'

              const catName = categoriesMap.get(catId) || 'سایر'
              const lt = safeNum(item.lineTotal)

              salesByCategory.set(catName, (salesByCategory.get(catName) || 0) + lt)
              totalCatSales += lt
            }
          }

          if (totalCatSales > 0) {
            categorySales = Array.from(salesByCategory.entries())
              .map(([name, value]) => ({
                name,
                value: Math.round((value / totalCatSales) * 100),
              }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
          }
        }

        if (categorySales.length === 0) {
          categorySales = [{ name: 'سایر', value: 100 }]
        }
      } catch (err: any) {
        console.warn('[Dashboard v7.0] categorySales query failed:', err?.message)
        categorySales = [{ name: 'سایر', value: 100 }]
      }

      // ─── ۱۰. سود ماه جاری ──────────────────────────────────
      let monthlyProfit = 0

      if (monthRange.valid && monthRange.from && monthRange.to) {
        monthlyProfit = await computeMonthlyProfit(
          tenantDb,
          tenantId,
          monthRange.from,
          monthRange.to,
          effectiveFiscalYearId
        )
      }

      // ─── ۱. لیست کالاهای کم‌موجود ─────────────────────────
      let lowStockProductsList: any[] = []

      try {
        const categoriesMap = new Map<string, string>()

        try {
          const cats = await tenantDb.category.findMany({
            where: { tenantId },
            select: { id: true, name: true },
          })

          for (const c of cats) categoriesMap.set(c.id, c.name)
        } catch {
          /* ignore */
        }

        const unitsMap = new Map<string, string>()

        try {
          const units = await tenantDb.unit.findMany({
            where: { tenantId },
            select: { id: true, nameFa: true, name: true },
          })

          for (const u of units) unitsMap.set(u.id, u.nameFa || u.name || 'عدد')
        } catch {
          /* ignore */
        }

        const allActiveProducts = await tenantDb.product.findMany({
          where: { tenantId, isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            categoryId: true,
            currentStock: true,
            minStock: true,
            unitId: true,
          },
        })

        const lowStock = allActiveProducts.filter((p: any) => {
          const cs = safeNum(p.currentStock)
          const ms = safeNum(p.minStock)
          return ms > 0 ? cs <= ms : cs <= 0
        })

        lowStockProductsList = lowStock
          .sort((a: any, b: any) => safeNum(a.currentStock) - safeNum(b.currentStock))
          .slice(0, 10)
          .map((p: any) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            category: categoriesMap.get(p.categoryId || '') || 'سایر',
            currentStock: safeNum(p.currentStock),
            minStock: safeNum(p.minStock),
            unit: unitsMap.get(p.unitId || '') || 'عدد',
          }))
      } catch (err: any) {
        console.warn('[Dashboard v7.0] lowStockProductsList query failed:', err?.message)
      }

      // ─── ۱۲. مقایسه دوره‌ای ────────────────────────────────
      let monthComparison: MonthComparison = {
        currentMonth: { sales: 0, invoices: 0, profit: 0 },
        previousMonth: { sales: 0, invoices: 0, profit: 0 },
        salesGrowth: 0,
        invoicesGrowth: 0,
        profitGrowth: 0,
      }

      try {
        const currentSales = monthSales
        const currentInvCount = monthInvoices
        const currentProfit = monthlyProfit

        let previousSales = 0
        let previousInvCount = 0
        let previousProfit = 0

        if (previousMonthRange.valid && previousMonthRange.from && previousMonthRange.to) {
          const previousMonthData: any = await tenantDb.invoice.aggregate({
            where: invWhere({
              invoiceDate: {
                gte: previousMonthRange.from,
                lt: previousMonthRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            _sum: { totalAmount: true },
            _count: true,
          })

          const previousReturnData: any = await tenantDb.invoice.aggregate({
            where: invWhere({
              invoiceDate: {
                gte: previousMonthRange.from,
                lt: previousMonthRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: RETURN_INVOICE_TYPE_FILTER,
            }),
            _sum: { totalAmount: true },
          })

          previousSales =
            safeNum(previousMonthData?._sum?.totalAmount) -
            safeNum(previousReturnData?._sum?.totalAmount)

          previousInvCount = safeNum(previousMonthData?._count)

          previousProfit = await computeMonthlyProfit(
            tenantDb,
            tenantId,
            previousMonthRange.from,
            previousMonthRange.to,
            effectiveFiscalYearId
          )
        }

        const salesGrowth =
          previousSales > 0
            ? Math.round(((currentSales - previousSales) / previousSales) * 100)
            : currentSales > 0
              ? 100
              : 0

        const invoicesGrowth =
          previousInvCount > 0
            ? Math.round(((currentInvCount - previousInvCount) / previousInvCount) * 100)
            : currentInvCount > 0
              ? 100
              : 0

        const profitGrowth =
          previousProfit !== 0
            ? Math.round(((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100)
            : currentProfit > 0
              ? 100
              : 0

        monthComparison = {
          currentMonth: { sales: currentSales, invoices: currentInvCount, profit: currentProfit },
          previousMonth: { sales: previousSales, invoices: previousInvCount, profit: previousProfit },
          salesGrowth,
          invoicesGrowth,
          profitGrowth,
        }
      } catch (err: any) {
        console.warn('[Dashboard v7.0] monthComparison failed:', err?.message)
      }

      // ─── ۱۳. پرفروش‌ترین کالاها ────────────────────────────
      let topProducts: TopProduct[] = []

      try {
        const categoriesMap = new Map<string, string>()

        try {
          const cats = await tenantDb.category.findMany({
            where: { tenantId },
            select: { id: true, name: true },
          })

          for (const c of cats) categoriesMap.set(c.id, c.name)
        } catch {
          /* ignore */
        }

        if (monthRange.valid && monthRange.from && monthRange.to) {
          const invoicesWithItems: any = await tenantDb.invoice.findMany({
            where: invWhere({
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            select: {
              items: {
                select: { productId: true, quantity: true, lineTotal: true },
              },
            },
          })

          const productStats = new Map<string, { quantity: number; sales: number }>()

          for (const inv of invoicesWithItems) {
            for (const item of inv.items || []) {
              if (!item.productId) continue

              const existing = productStats.get(item.productId) || { quantity: 0, sales: 0 }
              existing.quantity += safeNum(item.quantity)
              existing.sales += safeNum(item.lineTotal)
              productStats.set(item.productId, existing)
            }
          }

          const productIds = Array.from(productStats.keys())

          if (productIds.length > 0) {
            const products = await tenantDb.product.findMany({
              where: { id: { in: productIds }, tenantId },
              select: { id: true, name: true, code: true, categoryId: true },
            })

            topProducts = products
              .map((p: any) => {
                const stats = productStats.get(p.id)!
                return {
                  id: p.id,
                  name: p.name,
                  code: p.code || '',
                  totalQuantity: stats.quantity,
                  totalSales: stats.sales,
                  category: categoriesMap.get(p.categoryId || '') || 'سایر',
                }
              })
              .sort((a: TopProduct, b: TopProduct) => b.totalSales - a.totalSales)
              .slice(0, 5)
          }
        }
      } catch (err: any) {
        console.warn('[Dashboard v7.0] topProducts failed:', err?.message)
      }

      // ─── ۱۴. بهترین مشتریان ────────────────────────────────
      let topCustomers: TopCustomer[] = []

      try {
        const customerStats: any = await tenantDb.invoice.groupBy({
          by: ['customerId'],
          where: invWhere({
            customerId: { not: null },
            status: INVALID_INVOICE_STATUS_FILTER,
            invoiceType: SALE_INVOICE_TYPE_FILTER,
          }),
          _sum: { totalAmount: true },
          _count: true,
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: 5,
        })

        if (customerStats.length > 0) {
          const customerIds = customerStats
            .map((c: any) => c.customerId)
            .filter(Boolean) as string[]

          const customers = await tenantDb.customer.findMany({
            where: { id: { in: customerIds }, tenantId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mobile: true,
              currentBalance: true,
            },
          })

          const customerMap = new Map(customers.map((c: any) => [c.id, c]))

          topCustomers = customerStats
            .filter((cs: any) => cs.customerId && customerMap.has(cs.customerId))
            .map((cs: any) => {
              const c = customerMap.get(cs.customerId as string)! as any
              return {
                id: c.id,
                name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'بدون نام',
                mobile: c.mobile || '',
                totalPurchases: safeNum(cs?._sum?.totalAmount),
                invoiceCount: safeNum(cs?._count),
                currentBalance: safeNum(c.currentBalance),
              }
            })
        }
      } catch (err: any) {
        console.warn('[Dashboard v7.0] topCustomers failed:', err?.message)
      }

      // ─── ۱۵. توزیع روش‌های پرداخت ──────────────────────────
      let paymentMethods: PaymentMethodBreakdown[] = []

      try {
        if (monthRange.valid && monthRange.from && monthRange.to) {
          const methodStats: any = await tenantDb.invoice.groupBy({
            by: ['paymentType'],
            where: invWhere({
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
            }),
            _sum: { totalAmount: true },
            _count: true,
          })

          const methodLabels: Record<string, { label: string; color: string }> = {
            cash: { label: 'نقدی', color: '#10b981' },
            card: { label: 'کارتی', color: '#3b82f6' },
            credit: { label: 'نسیه', color: '#f59e0b' },
            installment: { label: 'قسطی', color: '#8b5cf6' },
            check: { label: 'چک', color: '#ec4899' },
            online: { label: 'آنلاین', color: '#06b6d4' },
            mixed: { label: 'ترکیبی', color: '#64748b' },
          }

          const totalMethodSales = methodStats.reduce(
            (sum: number, m: any) => sum + safeNum(m?._sum?.totalAmount),
            0
          )

          paymentMethods = methodStats
            .filter((m: any) => m.paymentType)
            .map((m: any) => {
              const key = normalizeToken(m.paymentType)
              const labels = methodLabels[key] || {
                label: m.paymentType,
                color: '#64748b',
              }

              const value =
                totalMethodSales > 0
                  ? Math.round((safeNum(m?._sum?.totalAmount) / totalMethodSales) * 100)
                  : 0

              return {
                name: m.paymentType,
                label: labels.label,
                value,
                count: safeNum(m._count),
                color: labels.color,
              }
            })
            .sort((a: PaymentMethodBreakdown, b: PaymentMethodBreakdown) => b.value - a.value)
        }

        if (paymentMethods.length === 0) {
          paymentMethods = [{ name: 'cash', label: 'نقدی', value: 100, count: 0, color: '#10b981' }]
        }
      } catch (err: any) {
        console.warn('[Dashboard v7.0] paymentMethods failed:', err?.message)
        paymentMethods = [{ name: 'cash', label: 'نقدی', value: 100, count: 0, color: '#10b981' }]
      }

      const stats: DashboardStats = {
        todaySales,
        todayInvoices,
        monthSales,
        monthInvoices,
        overdueInstallments: overdueInstallmentsCount,
        totalReceivable,
        lowStockProducts: lowStockProductsCount,
        monthlySales: monthSales,
        monthlyProfit,
      }

      console.log('[Dashboard v7.0] Stats fetched', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        durationMs: Date.now() - startTime,
        stats,
        invoiceOutstandingDebt,
        installmentRemaining,
        installmentScopeNote,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          stats,
          recentInvoices,
          overdueInstallments: [],
          lowStockProducts: lowStockProductsList,
          dailySales,
          categorySales,
          dailySales30,
          monthComparison,
          topProducts,
          topCustomers,
          paymentMethods,
          fiscalYearRange: fy
            ? {
                from: fy.startDate,
                to: fy.endDate,
              }
            : null,
          receivables: {
            invoiceOutstandingDebt,
            installmentRemaining,
            totalReceivable,
            installmentScopeNote,
          },
          diagnostics: {
            fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
            requestedFiscalYearId: fiscalYearIdParam || null,
            allYearsRequested: allYears,
            todayRangeValid: todayRange.valid,
            monthRangeValid: monthRange.valid,
            previousMonthRangeValid: previousMonthRange.valid,
            last7RangeValid: last7Range.valid,
            last30RangeValid: last30Range.valid,
            installmentsFiscalScoped: installmentScopeNote ? false : Boolean(effectiveFiscalYearId || allYears),
          },
        },
      })
    } catch (error: any) {
      console.error('[Dashboard v7.0] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطای داخلی سرور',
          details: error?.message,
        },
        { status: 500 }
      )
    }
  }
)