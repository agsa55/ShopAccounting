// ============================================================================
// src/app/api/reports/profit-loss/route.ts — v10.2 Fiscal Year Isolation + Correct P&L Logic
// ShopAccounting — Profit & Loss Report API
// ----------------------------------------------------------------------------
// ★★★ v10.0:
//   - ایزولاسیون کامل سال مالی
//   - پیش‌فرض: سال مالی فعال
//   - fiscalYearId: سال مالی انتخابی
//   - allYears=true: همه سال‌ها فقط برای بررسی مدیریتی
//   - clamp بازه تاریخ داخل سال مالی
//   - رد بازه تاریخ کاملاً خارج از سال مالی
//   - فقط اسناد posted/confirmed
//   - حذف اسناد cancelled
//   - حذف اسناد اختتامیه/افتتاحیه از گزارش سود و زیان
//
// ★★★ v9.2:
//   - رفع تداخل isRevenue / isOtherIncome
//   - طبقه‌بندی دقیق‌تر هزینه‌ها
//   - جلوگیری از دوبار حساب شدن خطوط JE
//   - اصلاح منطق COGS
//   - اصلاح discounts
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const GATEWAY_FEE_ACCOUNT_CODE = '5105'
const PLATFORM_FEE_ACCOUNT_CODE = '5106'
const COGS_ACCOUNT_CODE = '5000'
const SALES_REVENUE_PREFIXES = ['41', '42', '43']
const OTHER_INCOME_PREFIXES = ['44', '49']
const POSTED_STATUSES = ['posted', 'POSTED', 'Posted', 'confirmed', 'Confirmed']

const EXCLUDED_SOURCE_TYPES = new Set([
  'fiscal_year_close',
  'fiscal_year_open',
  'closing',
  'opening',
])

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function normalizeStatus(value: any): string {
  return String(value || '').toLowerCase().trim()
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

function isClosingOrOpeningEntry(je: any): boolean {
  const sourceType = normalizeStatus(je.sourceType)

  if (EXCLUDED_SOURCE_TYPES.has(sourceType)) return true

  const description = normalizeStatus(
    je.description || je.memo || je.narration || je.note || ''
  )

  return (
    description.includes('closing') ||
    description.includes('opening') ||
    description.includes('اختتام') ||
    description.includes('افتتاح') ||
    description.includes('بستن سال') ||
    description.includes('گشایش') ||
    description.includes('موجودی اولیه')
  )
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

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[P&L v10.1] ★★★ VERSION LOADED — FISCAL YEAR ISOLATION + LEGACY NULL SAFE')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const dateFromParam = searchParams.get('dateFrom') || searchParams.get('from')
      const dateToParam = searchParams.get('dateTo') || searchParams.get('to')
      const branchId = searchParams.get('branchId')

      // ★ v10.0: پارامترهای سال مالی
      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'
let fy: any = null
let effectiveFiscalYearId: string | null = null
let fyStart: Date | null = null
let fyEnd: Date | null = null

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

    fyStart = parseDateBound(fy.startDate, false)
    fyEnd = parseDateBound(fy.endDate, true)

    if (!fyStart || !fyEnd) {
      throw new Error('تاریخ‌های سال مالی انتخابی نامعتبر است.')
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
let fromDate: Date | null = parseDateBound(dateFromParam, false)
let toDate: Date | null = parseDateBound(dateToParam, true)
let toDateEnd: Date | null = null

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

if (effectiveFiscalYearId && fyStart && fyEnd) {
  if (!fromDate) fromDate = new Date(fyStart)
  if (!toDate) toDate = new Date(fyEnd)

  // ★ clamp تاریخ‌ها داخل سال مالی
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

  toDateEnd = new Date(toDate)
} else {
  // ★ allYears=true:
  // اگر تاریخ داده نشد، اصلاً فیلتر زمانی اعمال نمی‌شود.
  if (fromDate) fromDate.setHours(0, 0, 0, 0)

  if (toDate) {
    toDate.setHours(23, 59, 59, 999)
    toDateEnd = new Date(toDate)
  }
}

const dateWhere: any = {}

if (fromDate) dateWhere.gte = fromDate
if (toDateEnd) dateWhere.lte = toDateEnd

console.log('[P&L v10.2] Effective query context', {
  tenantId,
  fiscalYearId: effectiveFiscalYearId,
  fiscalYearName: fy?.name || null,
  allYears,
  branchId: branchId || null,
  dateFrom: fromDate ? toLocalISODate(fromDate) : null,
  dateTo: toDateEnd ? toLocalISODate(toDateEnd) : null,
})

      // ══════════════════════════════════════════════════════
      // ۳. واکشی حساب‌ها
      // ══════════════════════════════════════════════════════
      const allAccounts = await tenantDb.account.findMany({
        where: { tenantId },
        select: { id: true, code: true, type: true, name: true },
      })

      const accountMap = new Map<
        string,
        { id: string; code: string; type: string; name: string }
      >()

      for (const acc of allAccounts) {
        accountMap.set(acc.id, {
          id: acc.id,
          code: acc.code || '',
          type: (acc.type || '').toLowerCase(),
          name: acc.name || '',
        })
      }

      // ══════════════════════════════════════════════════════
      // ۴. واکشی اسناد حسابداری
      // ══════════════════════════════════════════════════════
      const journalWhere: any = {
        tenantId,
        status: {
          in: POSTED_STATUSES,
        },
      }

   if (branchId && isFieldSupported(tenantDb.journalEntry, 'branchId')) {
  journalWhere.branchId = branchId
} else if (branchId) {
  console.warn(
    '[P&L v10.2] JournalEntry.branchId is not supported; branch filter ignored.'
  )
}

      if (Object.keys(dateWhere).length > 0) {
        journalWhere.date = dateWhere
      }

        const journalHasFiscalYearId = isFieldSupported(
        tenantDb.journalEntry,
        'fiscalYearId'
      )

      if (effectiveFiscalYearId && journalHasFiscalYearId) {
        journalWhere.AND = [
          {
            OR: [
              // اسناد متصل به سال مالی انتخابی
              { fiscalYearId: effectiveFiscalYearId },

              // اسناد قدیمی بدون fiscalYearId؛
              // چون dateWhere داخل بازه سال مالی clamp شده، فقط همان دوره دیده می‌شوند.
              { fiscalYearId: null },
            ],
          },
        ]
      }
      const allJournalEntries = await tenantDb.journalEntry.findMany({
        where: journalWhere,
        include: { lines: true },
      })

      const journalEntries = allJournalEntries.filter((je: any) => {
        if (je.isCancelled === true) return false

        const status = normalizeStatus(je.status)
        if (status !== 'posted' && status !== 'confirmed') return false

        if (isClosingOrOpeningEntry(je)) return false

        return true
      })
      console.log('[P&L v10.1] JournalEntries', {
        total: allJournalEntries.length,
        active: journalEntries.length,
        filteredOut: allJournalEntries.length - journalEntries.length,
      })

      // ══════════════════════════════════════════════════════
      // ۵. محاسبه از JournalEntry — طبقه‌بندی اصلاح‌شده
      // ══════════════════════════════════════════════════════
      let revenueCr = 0
      let revenueDr = 0
      let cogsDr = 0
      let cogsCr = 0
      let operatingExpDr = 0
      let gatewayFee = 0
      let platformFee = 0
      let otherIncome = 0
      let otherExpenses = 0

      const monthlyMap = new Map<
        string,
        {
          revenueCr: number
          revenueDr: number
          cogsDr: number
          cogsCr: number
          expenses: number
        }
      >()

      const expenseBreakdown = new Map<
        string,
        {
          name: string
          code: string
          amount: number
        }
      >()

      for (const je of journalEntries) {
        const jeDate = new Date(je.date)
        const monthKey = `${jeDate.getFullYear()}-${String(
          jeDate.getMonth() + 1
        ).padStart(2, '0')}`

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            revenueCr: 0,
            revenueDr: 0,
            cogsDr: 0,
            cogsCr: 0,
            expenses: 0,
          })
        }

        const monthData = monthlyMap.get(monthKey)!

        for (const line of je.lines || []) {
          const acc = line.accountId ? accountMap.get(line.accountId) : null
          if (!acc) continue

          const dr = safeNum(line.debit)
          const cr = safeNum(line.credit)
          const accCode = acc.code
          const accType = acc.type

    const isCogs =
  accCode === COGS_ACCOUNT_CODE || accType === 'cogs'

const isGatewayFeeAcc = accCode === GATEWAY_FEE_ACCOUNT_CODE
const isPlatformFeeAcc = accCode === PLATFORM_FEE_ACCOUNT_CODE

const isSalesRevenuePrefix = SALES_REVENUE_PREFIXES.some((prefix) =>
  accCode.startsWith(prefix)
)

const isOtherIncomePrefix = OTHER_INCOME_PREFIXES.some((prefix) =>
  accCode.startsWith(prefix)
)

const isSalesRevenue =
  !isCogs &&
  !isGatewayFeeAcc &&
  !isPlatformFeeAcc &&
  (
    isSalesRevenuePrefix ||
    accType === 'sales' ||
    (accType === 'revenue' &&
      accCode.startsWith('4') &&
      !isOtherIncomePrefix)
  )

const isOtherIncomeAcc =
  !isCogs &&
  !isSalesRevenue &&
  !isGatewayFeeAcc &&
  !isPlatformFeeAcc &&
  (
    isOtherIncomePrefix ||
    accType === 'income' ||
    (accType === 'revenue' &&
      accCode.startsWith('4') &&
      !isSalesRevenuePrefix)
  )

const isOperatingExp =
  !isCogs &&
  !isGatewayFeeAcc &&
  !isPlatformFeeAcc &&
  !isSalesRevenue &&
  !isOtherIncomeAcc &&
  (
    accType === 'expense' ||
    accType === 'repair_expense' ||
    accType === 'service_expense' ||
    (accCode.startsWith('5') && !accCode.startsWith('50')) ||
    accCode.startsWith('6')
  )

          if (isCogs) {
            cogsDr += dr
            cogsCr += cr
            monthData.cogsDr += dr
            monthData.cogsCr += cr
          } else if (isSalesRevenue) {
            revenueCr += cr
            revenueDr += dr
            monthData.revenueCr += cr
            monthData.revenueDr += dr
          } else if (isGatewayFeeAcc && dr > 0) {
            gatewayFee += dr
            monthData.expenses += dr
          } else if (isPlatformFeeAcc && dr > 0) {
            platformFee += dr
            monthData.expenses += dr
          } else if (isOperatingExp && dr > 0) {
            operatingExpDr += dr
            monthData.expenses += dr

            const existing = expenseBreakdown.get(acc.id) || {
              name: acc.name,
              code: accCode,
              amount: 0,
            }

            existing.amount += dr
            expenseBreakdown.set(acc.id, existing)
          } else if (isOtherIncomeAcc && cr > 0) {
            otherIncome += cr
          } else if (isOtherIncomeAcc && dr > 0) {
            otherExpenses += dr
          }
        }
      }

      const grossSalesFromJE = revenueCr
      const salesReturnsFromJE = revenueDr
      const cogsNetFromJE = cogsDr - cogsCr

        console.log('[P&L v10.1] JE-based calculation', {
        revenueCr,
        revenueDr,
        cogsDr,
        cogsCr,
        cogsNetFromJE,
        operatingExpDr,
        gatewayFee,
        platformFee,
        otherIncome,
        otherExpenses,
      })

      // ══════════════════════════════════════════════════════
      // ۶. واکشی فاکتورها
      // ══════════════════════════════════════════════════════
      const invoiceWhere: any = {
        tenantId,
      }

    if (branchId && isFieldSupported(tenantDb.invoice, 'branchId')) {
  invoiceWhere.branchId = branchId
} else if (branchId) {
  console.warn(
    '[P&L v10.2] Invoice.branchId is not supported; branch filter ignored.'
  )
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
      const allInvoices = await tenantDb.invoice.findMany({
        where: invoiceWhere,
        include: {
          items: true,
          customer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      })

      const validInvoices = allInvoices.filter((inv: any) => {
        const s = normalizeStatus(inv.status)
        return s !== 'cancelled' && s !== 'void'
      })

      const saleInvoices = validInvoices.filter(
        (inv: any) =>
          inv.invoiceType !== 'sale_return' &&
          inv.invoiceType !== 'purchase_return'
      )

      const returnInvoices = validInvoices.filter(
        (inv: any) =>
          inv.invoiceType === 'sale_return' ||
          inv.invoiceType === 'purchase_return'
      )
      const saleDiscounts = saleInvoices.reduce(
        (s: number, i: any) => s + safeNum(i.discountAmount),
        0
      )

      const returnDiscounts = returnInvoices.reduce(
        (s: number, i: any) => s + safeNum(i.discountAmount),
        0
      )

      const netDiscounts = saleDiscounts - returnDiscounts

      console.log('[P&L v10.1] Invoice counts', {
        total: validInvoices.length,
        sales: saleInvoices.length,
        returns: returnInvoices.length,
        saleDiscounts,
        returnDiscounts,
        netDiscounts,
      })

  // ══════════════════════════════════════════════════════
// ۷. تصمیم: از JE یا Fallback؟
// ══════════════════════════════════════════════════════
let grossSales = 0
let salesReturns = 0
let discounts = 0
let netSales = 0
let totalCogsNet = 0
let dataSource: 'journal_entry' | 'invoice_fallback' = 'invoice_fallback'

const hasJEData = journalEntries.length > 0 && revenueCr > 0

if (hasJEData) {
  dataSource = 'journal_entry'

  discounts = netDiscounts

  grossSales = grossSalesFromJE
  salesReturns = salesReturnsFromJE

  netSales = grossSales - salesReturns - discounts

  totalCogsNet = Math.max(0, cogsNetFromJE)

  console.log('[P&L v10.2] ✓ Using JE data', {
    grossSales,
    salesReturns,
    discounts,
    netSales,
    totalCogsNet,
    cogsFromJE: { cogsDr, cogsCr, net: cogsNetFromJE },
  })
} else {
  dataSource = 'invoice_fallback'

  discounts = netDiscounts

  grossSales = saleInvoices.reduce(
    (s: number, i: any) => s + safeNum(i.totalAmount),
    0
  )

  salesReturns = returnInvoices.reduce(
    (s: number, i: any) => s + safeNum(i.totalAmount),
    0
  )

  netSales = grossSales - salesReturns - discounts

  const cogsSales = saleInvoices.reduce(
    (s: number, i: any) => s + safeNum(i.cogsAmount),
    0
  )

  const cogsReturns = returnInvoices.reduce(
    (s: number, i: any) => s + safeNum(i.cogsAmount),
    0
  )

  totalCogsNet = Math.max(0, cogsSales - cogsReturns)

  console.log('[P&L v10.2] ✓ Using Invoice fallback', {
    grossSales,
    salesReturns,
    discounts,
    netSales,
    cogsSales,
    cogsReturns,
    totalCogsNet,
  })
}
      const taxAmount =
        saleInvoices.reduce((s: number, i: any) => s + safeNum(i.taxAmount), 0) -
        returnInvoices.reduce((s: number, i: any) => s + safeNum(i.taxAmount), 0)

      // ══════════════════════════════════════════════════════
      // ۸. سود ناخالص و نهایی
      // ══════════════════════════════════════════════════════
      const grossProfit = netSales - totalCogsNet
      const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0

      const totalOperatingExpenses = operatingExpDr + gatewayFee + platformFee
      const operatingProfit = grossProfit - totalOperatingExpenses
      const profitBeforeTax = operatingProfit + otherIncome - otherExpenses
      const incomeTax = 0
      const netProfit = profitBeforeTax - incomeTax
      const netMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0

      // ══════════════════════════════════════════════════════
      // ۹. تفکیک ماهانه — از JE یا فاکتور
      // ══════════════════════════════════════════════════════
      let monthlyBreakdown: any[]

      if (hasJEData) {
        monthlyBreakdown = Array.from(monthlyMap.entries())
          .map(([month, d]) => {
            const rev = d.revenueCr - d.revenueDr
            const cogs = Math.max(0, d.cogsDr - d.cogsCr)
            const gp = rev - cogs

            return {
              month,
              revenue: Math.round(rev),
              cogs: Math.round(cogs),
              grossProfit: Math.round(gp),
              expenses: Math.round(d.expenses),
              netProfit: Math.round(gp - d.expenses),
            }
          })
          .sort((a, b) => a.month.localeCompare(b.month))
      } else {
        const fMonthMap = new Map<
          string,
          {
            revenue: number
            cogs: number
            expenses: number
          }
        >()

        for (const inv of validInvoices) {
          const d = new Date(inv.invoiceDate)
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            '0'
          )}`

          const md = fMonthMap.get(mk) || {
            revenue: 0,
            cogs: 0,
            expenses: 0,
          }

          const sign =
            inv.invoiceType === 'sale_return' ||
            inv.invoiceType === 'purchase_return'
              ? -1
              : 1

          md.revenue += safeNum(inv.totalAmount) * sign
          md.cogs += safeNum(inv.cogsAmount) * sign

          fMonthMap.set(mk, md)
        }

        monthlyBreakdown = Array.from(fMonthMap.entries())
          .map(([month, d]) => {
            const gp = d.revenue - d.cogs

            return {
              month,
              revenue: Math.round(d.revenue),
              cogs: Math.round(Math.max(0, d.cogs)),
              grossProfit: Math.round(gp),
              expenses: 0,
              netProfit: Math.round(gp),
            }
          })
          .sort((a, b) => a.month.localeCompare(b.month))
      }

      // ══════════════════════════════════════════════════════
      // ۱۰. واکشی کالاها
      // ══════════════════════════════════════════════════════
      const productIds = new Set<string>()

      for (const inv of validInvoices) {
        for (const item of inv.items || []) {
          if (item.productId) productIds.add(item.productId)
        }
      }

      let products: any[] = []

      if (productIds.size > 0) {
        try {
          products = await tenantDb.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            include: { category: { select: { id: true, name: true } } },
          })
        } catch (err: any) {
          console.warn('[P&L v10.0] Product query failed:', err?.message)
        }
      }

      const productMap = new Map<string, any>()

      for (const p of products) productMap.set(p.id, p)

      // ══════════════════════════════════════════════════════
      // ۱۱. تفکیک دسته‌بندی + کالاها برتر
      // ══════════════════════════════════════════════════════
      const categoryStatsMap = new Map<
        string,
        {
          categoryId: string
          categoryName: string
          revenue: number
          cogs: number
          quantity: number
        }
      >()

      const productStatsMap = new Map<
        string,
        {
          productId: string
          productName: string
          revenue: number
          cogs: number
          quantity: number
        }
      >()

      for (const inv of validInvoices) {
        const sign =
          inv.invoiceType === 'sale_return' ||
          inv.invoiceType === 'purchase_return'
            ? -1
            : 1

        for (const item of inv.items || []) {
          if (!item.productId) continue

          const product = productMap.get(item.productId)
          const catId = product?.categoryId || 'uncategorized'
          const catName = product?.category?.name || 'بدون دسته'
          const productName = item.productName || product?.name || 'نامشخص'

          const itemRevenue = safeNum(
            item.lineTotal || safeNum(item.quantity) * safeNum(item.unitPrice)
          )

          const unitCost =
            safeNum(product?.averageCost) > 0
              ? safeNum(product?.averageCost)
              : safeNum(product?.purchasePrice)

          const itemCogs = unitCost * safeNum(item.quantity)

          const cat = categoryStatsMap.get(catId) || {
            categoryId: catId,
            categoryName: catName,
            revenue: 0,
            cogs: 0,
            quantity: 0,
          }

          cat.revenue += itemRevenue * sign
          cat.cogs += itemCogs * sign
          cat.quantity += safeNum(item.quantity) * sign

          categoryStatsMap.set(catId, cat)

          const ps = productStatsMap.get(item.productId) || {
            productId: item.productId,
            productName,
            revenue: 0,
            cogs: 0,
            quantity: 0,
          }

          ps.revenue += itemRevenue * sign
          ps.cogs += itemCogs * sign
          ps.quantity += safeNum(item.quantity) * sign

          productStatsMap.set(item.productId, ps)
        }
      }

      const categoryBreakdown = Array.from(categoryStatsMap.values())
        .map((c) => ({
          ...c,
          revenue: Math.round(c.revenue),
          cogs: Math.round(Math.max(0, c.cogs)),
          quantity: Math.round(c.quantity * 10) / 10,
          grossProfit: Math.round(c.revenue - Math.max(0, c.cogs)),
          margin:
            c.revenue > 0
              ? Math.round(((c.revenue - c.cogs) / c.revenue) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.grossProfit - a.grossProfit)

      const topProfitableProducts = Array.from(productStatsMap.values())
        .map((p) => ({
          ...p,
          revenue: Math.round(p.revenue),
          cogs: Math.round(Math.max(0, p.cogs)),
          quantity: Math.round(p.quantity * 10) / 10,
          grossProfit: Math.round(p.revenue - Math.max(0, p.cogs)),
          margin:
            p.revenue > 0
              ? Math.round(((p.revenue - p.cogs) / p.revenue) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.grossProfit - a.grossProfit)
        .slice(0, 10)

      // ══════════════════════════════════════════════════════
      // ۱۲. پرداخت‌های آنلاین
      // ★ فعلاً OnlinePayment فیلد fiscalYearId ندارد.
      //   بنابراین فقط بر اساس بازه تاریخ فیلتر می‌شود.
      // ══════════════════════════════════════════════════════
      let onlinePaymentsSummary = {
        count: 0,
        totalAmount: 0,
        totalGatewayFee: gatewayFee,
        totalPlatformCommission: platformFee,
        totalNetSettled: 0,
      }

      try {
        const onlineWhere: any = {
          tenantId,
          status: 'paid',
        }

        if (Object.keys(dateWhere).length > 0) {
          onlineWhere.paidAt = dateWhere
        }

        const isGatewayFeeSupported = isFieldSupported(
          tenantDb.onlinePayment,
          'gatewayFee'
        )

        const isNetSettledSupported = isFieldSupported(
          tenantDb.onlinePayment,
          'netSettledAmount'
        )

        const isPlatformCommissionSupported = isFieldSupported(
          tenantDb.onlinePayment,
          'platformCommission'
        )

        if (
          isGatewayFeeSupported &&
          isPlatformCommissionSupported &&
          isNetSettledSupported
        ) {
          const onlinePayments = await tenantDb.onlinePayment.findMany({
            where: onlineWhere,
            select: {
              id: true,
              amount: true,
              gatewayFee: true,
              platformCommission: true,
              netSettledAmount: true,
            },
          })

          onlinePaymentsSummary = {
            count: onlinePayments.length,
            totalAmount: onlinePayments.reduce(
              (s: number, p: any) => s + safeNum(p.amount),
              0
            ),
            totalGatewayFee: onlinePayments.reduce(
              (s: number, p: any) => s + safeNum(p.gatewayFee),
              0
            ),
            totalPlatformCommission: onlinePayments.reduce(
              (s: number, p: any) => s + safeNum(p.platformCommission),
              0
            ),
            totalNetSettled: onlinePayments.reduce(
              (s: number, p: any) => s + safeNum(p.netSettledAmount),
              0
            ),
          }
        } else {
          const onlinePayments = await tenantDb.onlinePayment.findMany({
            where: onlineWhere,
            select: { id: true, amount: true },
          })

          onlinePaymentsSummary = {
            count: onlinePayments.length,
            totalAmount: onlinePayments.reduce(
              (s: number, p: any) => s + safeNum(p.amount),
              0
            ),
            totalGatewayFee: gatewayFee,
            totalPlatformCommission: platformFee,
            totalNetSettled: 0,
          }
        }
      } catch (err: any) {
        console.warn('[P&L v10.0] OnlinePayment query failed:', err?.message)
      }

      const paymentGatewayFees = {
        zarinpal: Math.round(gatewayFee),
        platform: Math.round(platformFee),
        total: Math.round(gatewayFee + platformFee),
        percentage:
          netSales > 0
            ? Math.round(((gatewayFee + platformFee) / netSales) * 10000) / 100
            : 0,
      }

      // ══════════════════════════════════════════════════════
      // ۱۳. لاگ نهایی
      // ══════════════════════════════════════════════════════
         console.log('[P&L v10.1] ★ FINAL RESULT', {
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        dataSource,
        grossSales: Math.round(grossSales),
        salesReturns: Math.round(salesReturns),
        netSales: Math.round(netSales),
        cogs: Math.round(totalCogsNet),
        cogsDr: Math.round(cogsDr),
        cogsCr: Math.round(cogsCr),
        grossProfit: Math.round(grossProfit),
        grossMargin: grossMargin.toFixed(1) + '%',
        totalOperatingExpenses: Math.round(totalOperatingExpenses),
        operatingProfit: Math.round(operatingProfit),
        netProfit: Math.round(netProfit),
        invoiceCount: saleInvoices.length,
        returnCount: returnInvoices.length,
      })

      // ══════════════════════════════════════════════════════
      // ۱۴. پاسخ نهایی
      // ══════════════════════════════════════════════════════
      const operatingExpenses = Array.from(expenseBreakdown.values()).sort(
        (a, b) => b.amount - a.amount
      )

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears
          ? 'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'
          : undefined,
        data: {
                   _version: 'v10.1',
          _dataSource: dataSource,

          grossSales: Math.round(grossSales),
          salesReturns: Math.round(salesReturns),
          discounts: Math.round(discounts),
          netSales: Math.round(netSales),
          taxAmount: Math.round(taxAmount),

          cogs: Math.round(totalCogsNet),
          cogsFromSales: Math.round(cogsDr),
          cogsFromReturns: Math.round(cogsCr),

          grossProfit: Math.round(grossProfit),
          grossMargin: Math.round(grossMargin * 10) / 10,

          operatingExpenses,
          totalOperatingExpenses: Math.round(totalOperatingExpenses),

          paymentGatewayFees,
          onlinePaymentsSummary,

          otherIncome: Math.round(otherIncome),
          otherExpenses: Math.round(otherExpenses),

          operatingProfit: Math.round(operatingProfit),
          profitBeforeTax: Math.round(profitBeforeTax),
          incomeTax: Math.round(incomeTax),
          netProfit: Math.round(netProfit),
          netMargin: Math.round(netMargin * 10) / 10,

          invoiceCount: saleInvoices.length,
          returnCount: returnInvoices.length,
          averageInvoiceValue:
            saleInvoices.length > 0
              ? Math.round(netSales / saleInvoices.length)
              : 0,

          monthlyBreakdown,
          categoryBreakdown,
          topProfitableProducts,

              diagnostics: {
            rawJournalEntryCount: allJournalEntries.length,
            activeJournalEntryCount: journalEntries.length,
            rawInvoiceCount: allInvoices.length,
            validInvoiceCount: validInvoices.length,
            saleInvoiceCount: saleInvoices.length,
            returnInvoiceCount: returnInvoices.length,
            journalFiscalYearIdCounts: (allJournalEntries as any[]).reduce(
              (acc: Record<string, number>, je: any) => {
                const key = je.fiscalYearId || 'NULL'
                acc[key] = (acc[key] || 0) + 1
                return acc
              },
              {} as Record<string, number>
            ),
            invoiceFiscalYearIdCounts: (allInvoices as any[]).reduce(
              (acc: Record<string, number>, inv: any) => {
                const key = inv.fiscalYearId || 'NULL'
                acc[key] = (acc[key] || 0) + 1
                return acc
              },
              {} as Record<string, number>
            ),
          },

          dateRange: {
            from: fromDate ? toLocalISODate(fromDate) : null,
            to: toDateEnd ? toLocalISODate(toDateEnd) : null,
          },

    fiscalYearRange:
  fyStart && fyEnd
    ? {
        from: toLocalISODate(fyStart),
        to: toLocalISODate(fyEnd),
      }
    : null,
        },
      })
    } catch (error: any) {
      console.error('[P&L v10.0] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت گزارش سود و زیان: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)