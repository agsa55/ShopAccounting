// ============================================================================
// src/app/api/dashboard/stats/route.ts — GET (v6.0 ★★★ JE-BASED PROFIT)
// ShopAccounting — Unified Single Database Architecture
// ----------------------------------------------------------------------------
// ★★★ v6.0 — JE-BASED PROFIT:
//   - محاسبه سود از JournalEntry (دقیق‌ترین منبع)
//   - درآمد = Cr. 4xxx - Dr. 4xxx (برگشتی)
//   - COGS = Dr. 5000 - Cr. 5000 (برگشتی)
//   - هزینه = Dr. 5xxx (غیر 5000)
//   - Fallback: اگه JE نبود، از Invoice + product.averageCost
//   - safeNum() اضافه شد برای جلوگیری از NaN
// ============================================================================

import { NextResponse, NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/jwt'

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
  id: string; name: string; code: string
  totalQuantity: number; totalSales: number; category: string
}

interface TopCustomer {
  id: string; name: string; mobile: string
  totalPurchases: number; invoiceCount: number; currentBalance: number
}

interface PaymentMethodBreakdown {
  name: string; label: string; value: number; count: number; color: string
}

// ═══════════════════════════════════════════════════════════════
//  توابع تاریخ شمسی
// ═══════════════════════════════════════════════════════════════

function div(a: number, b: number): number { return Math.floor(a / b) }
function mod(a: number, b: number): number { return a - Math.floor(a / b) * b }

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * div(days, 12053)
  days = mod(days, 12053)
  jy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) { jy += div(days - 1, 365); days = mod(days - 1, 365) }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30))
  return [jy, jm, jd]
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days = 365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * div(days, 146097)
  days = mod(days, 146097)
  if (days > 36524) { gy += 100 * div(--days, 36524); days = mod(days, 36524); if (days >= 365) days++ }
  gy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) { gy += div(days - 1, 365); days = mod(days - 1, 365) }
  let gd = days + 1
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm: number
  for (gm = 0; gm < 13; gm++) { if (gd <= sal_a[gm]) break; gd -= sal_a[gm] }
  return [gy, gm, gd]
}

function isJalaliLeap(jy: number): boolean {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length
  let leapJ = -14
  let jp = breaks[0]
  let jm = 0, jump = 0, n = 0
  for (let i = 1; i < bl; i++) {
    jm = breaks[i]; jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const gy = jy + 621
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  const leap = mod(mod(n + 1, 33) - 1, 4)
  return (leap === -1 ? 4 : leap) === 0
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
  let prevJy = jy, prevJm = jm - 1
  if (prevJm < 1) { prevJm = 12; prevJy = jy - 1 }
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
//  ★ v6.0: safeNum — جلوگیری از NaN در همه محاسبات
// ═══════════════════════════════════════════════════════════════
function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ v6.0: computeMonthlyProfit — JE-Based
// ═══════════════════════════════════════════════════════════════
async function computeMonthlyProfit(
  tenantDb: any,
  tenantId: string,
  startOfMonth: Date,
  now: Date
): Promise<number> {
  try {
    // ─── واکشی اسناد حسابداری ──────────────────────────────
    const allMonthEntries = await tenantDb.journalEntry.findMany({
      where: {
        tenantId,
        date: { gte: startOfMonth, lte: now },
        status: 'posted',
      },
      include: { lines: true },
    })

    // فیلتر isCancelled در JS (SQL Server NULL issue)
    const monthEntries = allMonthEntries.filter(
      (e: any) => e.isCancelled !== true
    )

    // ─── واکشی حساب‌ها ─────────────────────────────────────
    const accountsList = await tenantDb.account.findMany({
      where: { tenantId },
      select: { id: true, code: true, type: true, name: true },
    })

    const accountMap = new Map<string, {
      type: string; code: string; name: string
    }>()
    for (const a of accountsList) {
      accountMap.set(a.id, {
        type: (a.type || '').toLowerCase(),
        code: a.code || '',
        name: (a.name || '').toLowerCase(),
      })
    }

    // ─── پردازش خطوط سند ───────────────────────────────────
    let revenueCr = 0   // Cr. 4xxx → فروش ناخالص
    let revenueDr = 0   // Dr. 4xxx → برگشت از فروش
    let cogsDr = 0      // Dr. 5000 → COGS فروش
    let cogsCr = 0      // Cr. 5000 → COGS برگشتی
    let expenseDr = 0   // Dr. 5xxx (غیر 5000) + 6xxx → هزینه

    const perLineLog: any[] = []

    for (const entry of monthEntries) {
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
          perLineLog.push({
            je: entry.number, code: accCode,
            name: acc.name, dr, cr,
            classification: 'REVENUE',
            runningNet: revenueCr - revenueDr,
          })
        } else if (isCogs) {
          cogsDr += dr
          cogsCr += cr
          perLineLog.push({
            je: entry.number, code: accCode,
            name: acc.name, dr, cr,
            classification: 'COGS',
            runningNet: cogsDr - cogsCr,
          })
        } else if (isExpense && dr > 0) {
          expenseDr += dr
          perLineLog.push({
            je: entry.number, code: accCode,
            name: acc.name, dr, cr,
            classification: 'EXPENSE',
            runningExpense: expenseDr,
          })
        } else {
          perLineLog.push({
            je: entry.number, code: accCode,
            name: acc.name, dr, cr,
            classification: 'OTHER',
          })
        }
      }
    }

    console.log('[Dashboard][Profit v6.0] JE breakdown', {
      tenantId,
      dateRange: { start: startOfMonth.toISOString(), end: now.toISOString() },
      totalEntries: allMonthEntries.length,
      activeEntries: monthEntries.length,
      revenueCr,
      revenueDr,
      netRevenue: revenueCr - revenueDr,
      cogsDr,
      cogsCr,
      netCogs: cogsDr - cogsCr,
      expenseDr,
      profit: (revenueCr - revenueDr) - Math.max(0, cogsDr - cogsCr) - expenseDr,
    })

    console.log('[Dashboard][Profit v6.0] ★★★ PER-LINE BREAKDOWN ★★★')
    for (const l of perLineLog) {
      console.log('  ', JSON.stringify(l))
    }

    // ─── اگه JE داده داشت برگردون ──────────────────────────
    if (revenueCr > 0 || cogsDr > 0) {
      const netRevenue = revenueCr - revenueDr
      const netCogs = Math.max(0, cogsDr - cogsCr)
      const profit = netRevenue - netCogs - expenseDr

      console.log('[Dashboard][Profit v6.0] ✓ JE-based profit', {
        netRevenue, netCogs, expenseDr, profit,
      })
      return profit
    }

    // ─── Fallback: از Invoice + product.averageCost ─────────
    console.warn('[Dashboard][Profit v6.0] No JE revenue/COGS found — Invoice fallback')

    const invoicesInMonth = await tenantDb.invoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: startOfMonth, lte: now },
        status: { notIn: ['cancelled', 'Cancelled'] },
        invoiceType: { notIn: ['sale_return', 'purchase_return'] },
      },
      include: {
        items: {
          select: { productId: true, quantity: true, unitPrice: true },
        },
      },
    })

    if (invoicesInMonth.length === 0) {
      console.log('[Dashboard][Profit v6.0] No invoices → profit = 0')
      return 0
    }

    const netRevenueFallback = invoicesInMonth.reduce(
      (s: number, inv: any) =>
        s + safeNum(inv.totalAmount) - safeNum(inv.discountAmount),
      0
    )

    // COGS از product.averageCost
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
        for (const item of (inv.items || [])) {
          if (!item.productId) continue
          const p = invProductMap.get(item.productId)
          if (!p) continue
          const unitCost =
            safeNum(p.averageCost) > 0
              ? safeNum(p.averageCost)
              : safeNum(p.purchasePrice)
          fallbackCogs += unitCost * safeNum(item.quantity)
        }
      }
    }

    const fallbackProfit = netRevenueFallback - fallbackCogs
    console.log('[Dashboard][Profit v6.0] ✓ Invoice fallback', {
      netRevenueFallback,
      fallbackCogs,
      fallbackProfit,
    })
    return fallbackProfit

  } catch (err: any) {
    console.warn('[Dashboard][Profit v6.0] computeMonthlyProfit FAILED:', err?.message)
    return 0
  }
}

// ═══════════════════════════════════════════════════════════════
//  Main API
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'دسترسی غیرمجاز' }, { status: 401 })
    }

    const tenantId = user.tenantId
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'شناسه فروشگاه نامشخص' }, { status: 400 })
    }

    const tenantDb = db.client
    const startOfToday = getStartOfToday()
    const startOfMonth = getStartOfJalaliMonth()
    const startOfPreviousMonth = getStartOfPreviousJalaliMonth()
    const endOfPreviousMonth = getEndOfPreviousJalaliMonth()
    const now = new Date()

    // ─── ۱. آمار فروش امروز ─────────────────────────────────
    let todaySales = 0, todayInvoices = 0
    try {
      const todayData: any = await tenantDb.invoice.aggregate({
        where: {
          tenantId,
          invoiceDate: { gte: startOfToday },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        _sum: { totalAmount: true },
        _count: true,
      })
      todaySales = safeNum(todayData?._sum?.totalAmount)
      todayInvoices = safeNum(todayData?._count)
    } catch (err: any) {
      console.warn('[Dashboard] todaySales query failed:', err?.message)
    }

    // ─── ۲. آمار فروش ماه شمسی ──────────────────────────────
    let monthSales = 0, monthInvoices = 0
    try {
      const monthData: any = await tenantDb.invoice.aggregate({
        where: {
          tenantId,
          invoiceDate: { gte: startOfMonth },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        _sum: { totalAmount: true },
        _count: true,
      })
      monthSales = safeNum(monthData?._sum?.totalAmount)
      monthInvoices = safeNum(monthData?._count)
// ★ کسر برگشتی‌ها برای نمایش فروش خالص
  const returnData: any = await tenantDb.invoice.aggregate({
    where: {
      tenantId,
      invoiceDate: { gte: startOfMonth },
      status: { notIn: ['cancelled', 'Cancelled'] },
      invoiceType: { in: ['sale_return', 'purchase_return'] },
    },
    _sum: { totalAmount: true },
  })
  const monthReturns = safeNum(returnData?._sum?.totalAmount)
  monthSales = monthSales - monthReturns  // ← فروش خالص

    } catch (err: any) {
      console.warn('[Dashboard] monthSales query failed:', err?.message)
    }

    // ─── ۳. اقساط سررسید شده ────────────────────────────────
    let overdueInstallmentsCount = 0, totalReceivable = 0
    try {
      const activePlans = await tenantDb.installmentPlan.findMany({
        where: {
          tenantId,
          status: { in: ['active', 'Active', 'overdue', 'Overdue'] },
        },
        include: {
          schedules: {
            where: {
              tenantId,
              status: { in: ['pending', 'Pending', 'overdue', 'Overdue'] },
              dueDate: { lt: now },
            },
          },
        },
      })
      for (const plan of activePlans) {
        overdueInstallmentsCount += (plan.schedules || []).length
        for (const s of (plan.schedules || [])) {
          totalReceivable += safeNum(s.amount)
        }
      }
      try {
        const remainingSum = await tenantDb.installmentPlan.aggregate({
          where: {
            tenantId,
            status: { in: ['active', 'Active', 'overdue', 'Overdue'] },
          },
          _sum: { remainingAmount: true },
        })
        if (overdueInstallmentsCount === 0 && remainingSum?._sum?.remainingAmount) {
          totalReceivable = safeNum(remainingSum._sum.remainingAmount)
        }
      } catch { /* ignore */ }
    } catch (err: any) {
      console.warn('[Dashboard] overdueInstallments query failed:', err?.message)
    }

    // ─── ۴. محصولات با موجودی بحرانی ────────────────────────
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
      console.warn('[Dashboard] lowStockProducts query failed:', err?.message)
    }

    // ─── ۵. ۵ فاکتور اخیر ───────────────────────────────────
    let recentInvoices: any[] = []
    try {
      const invoices: any = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
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
      console.warn('[Dashboard] recentInvoices query failed:', err?.message)
    }

    // ─── ۶. فروش ۷ روز اخیر ─────────────────────────────────
    let dailySales: any[] = []
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      const last7DaysInvoices: any = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: sevenDaysAgo },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        select: { invoiceDate: true, totalAmount: true },
      })

      const salesByDay = new Map<string, number>()
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        d.setHours(0, 0, 0, 0)
        salesByDay.set(d.toISOString().split('T')[0], 0)
      }
      for (const inv of last7DaysInvoices) {
        const dayKey = inv.invoiceDate.toISOString().split('T')[0]
        if (salesByDay.has(dayKey)) {
          salesByDay.set(dayKey, salesByDay.get(dayKey)! + safeNum(inv.totalAmount))
        }
      }
      dailySales = Array.from(salesByDay.entries()).map(([key, sales]) => ({
        date: getDayNameFa(new Date(key)),
        sales,
      }))
    } catch (err: any) {
      console.warn('[Dashboard] dailySales query failed:', err?.message)
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        dailySales.push({ date: getDayNameFa(d), sales: 0 })
      }
    }

    // ─── ۶.۲. فروش ۳۰ روز اخیر ──────────────────────────────
    let dailySales30: any[] = []
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
      thirtyDaysAgo.setHours(0, 0, 0, 0)

      const last30DaysInvoices: any = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: thirtyDaysAgo },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        select: { invoiceDate: true, totalAmount: true },
      })

      const salesByDay30 = new Map<string, number>()
      for (let i = 29; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        d.setHours(0, 0, 0, 0)
        salesByDay30.set(d.toISOString().split('T')[0], 0)
      }
      for (const inv of last30DaysInvoices) {
        const dayKey = inv.invoiceDate.toISOString().split('T')[0]
        if (salesByDay30.has(dayKey)) {
          salesByDay30.set(dayKey, salesByDay30.get(dayKey)! + safeNum(inv.totalAmount))
        }
      }
      dailySales30 = Array.from(salesByDay30.entries()).map(([key, sales]) => ({
        date: getPersianDateShort(new Date(key)),
        sales,
      }))
    } catch (err: any) {
      console.warn('[Dashboard] dailySales30 query failed:', err?.message)
    }

    // ─── ۷. توزیع فروش بر اساس دسته‌بندی ─────────────────────
    let categorySales: any[] = []
    try {
      const categoriesMap = new Map<string, string>()
      try {
        const categories = await tenantDb.category.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        })
        for (const c of categories) categoriesMap.set(c.id, c.name)
      } catch { /* ignore */ }

      const allInvoices: any = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: startOfMonth },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        select: { items: { select: { productId: true, lineTotal: true } } },
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
        } catch { /* ignore */ }
      }

      const salesByCategory = new Map<string, number>()
      let totalCatSales = 0
      for (const inv of allInvoices) {
        for (const item of inv.items || []) {
          const catId = item.productId
            ? (productToCategory.get(item.productId) || 'unknown')
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
      } else {
        categorySales = [{ name: 'سایر', value: 100 }]
      }
    } catch (err: any) {
      console.warn('[Dashboard] categorySales query failed:', err?.message)
      categorySales = [{ name: 'سایر', value: 100 }]
    }

    // ─── ۸. محاسبه سود ماه جاری ─────────────────────────────
    const monthlyProfit = await computeMonthlyProfit(
      tenantDb, tenantId, startOfMonth, now
    )

    // ─── ۹. محصولات کم موجودی (لیست) ────────────────────────
    let lowStockProductsList: any[] = []
    try {
      const categoriesMap = new Map<string, string>()
      try {
        const cats = await tenantDb.category.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        })
        for (const c of cats) categoriesMap.set(c.id, c.name)
      } catch { /* ignore */ }

      const unitsMap = new Map<string, string>()
      try {
        const units = await tenantDb.unit.findMany({
          where: { tenantId },
          select: { id: true, nameFa: true, name: true },
        })
        for (const u of units) unitsMap.set(u.id, u.nameFa || u.name || 'عدد')
      } catch { /* ignore */ }

      const allActiveProducts = await tenantDb.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true, code: true, name: true,
          categoryId: true, currentStock: true,
          minStock: true, unitId: true,
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
      console.warn('[Dashboard] lowStockProductsList query failed:', err?.message)
    }

    // ─── ۱۰. مقایسه دوره‌ای ──────────────────────────────────
    let monthComparison: MonthComparison = {
      currentMonth: { sales: 0, invoices: 0, profit: 0 },
      previousMonth: { sales: 0, invoices: 0, profit: 0 },
      salesGrowth: 0, invoicesGrowth: 0, profitGrowth: 0,
    }
    try {
      const currentMonthData: any = await tenantDb.invoice.aggregate({
        where: {
          tenantId,
          invoiceDate: { gte: startOfMonth },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        _sum: { totalAmount: true },
        _count: true,
      })
      const previousMonthData: any = await tenantDb.invoice.aggregate({
        where: {
          tenantId,
          invoiceDate: { gte: startOfPreviousMonth, lt: endOfPreviousMonth },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        _sum: { totalAmount: true },
        _count: true,
      })

      const currentSales = safeNum(currentMonthData?._sum?.totalAmount)
      const previousSales = safeNum(previousMonthData?._sum?.totalAmount)
      const currentInvCount = safeNum(currentMonthData?._count)
      const previousInvCount = safeNum(previousMonthData?._count)

      const previousProfit = await computeMonthlyProfit(
        tenantDb, tenantId, startOfPreviousMonth, endOfPreviousMonth
      )

      const salesGrowth = previousSales > 0
        ? Math.round(((currentSales - previousSales) / previousSales) * 100)
        : currentSales > 0 ? 100 : 0

      const invoicesGrowth = previousInvCount > 0
        ? Math.round(((currentInvCount - previousInvCount) / previousInvCount) * 100)
        : currentInvCount > 0 ? 100 : 0

      const profitGrowth = previousProfit !== 0
        ? Math.round(((monthlyProfit - previousProfit) / Math.abs(previousProfit)) * 100)
        : monthlyProfit > 0 ? 100 : 0

      monthComparison = {
        currentMonth: { sales: currentSales, invoices: currentInvCount, profit: monthlyProfit },
        previousMonth: { sales: previousSales, invoices: previousInvCount, profit: previousProfit },
        salesGrowth, invoicesGrowth, profitGrowth,
      }
    } catch (err: any) {
      console.warn('[Dashboard] monthComparison failed:', err?.message)
    }

    // ─── ۱۱. پرفروش‌ترین محصولات ─────────────────────────────
    let topProducts: TopProduct[] = []
    try {
      const categoriesMap = new Map<string, string>()
      try {
        const cats = await tenantDb.category.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        })
        for (const c of cats) categoriesMap.set(c.id, c.name)
      } catch { /* ignore */ }

      const invoicesWithItems: any = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: startOfMonth },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
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
    } catch (err: any) {
      console.warn('[Dashboard] topProducts failed:', err?.message)
    }

    // ─── ۱۲. بهترین مشتریان ──────────────────────────────────
    let topCustomers: TopCustomer[] = []
    try {
      const customerStats: any = await tenantDb.invoice.groupBy({
        by: ['customerId'],
        where: {
          tenantId,
          customerId: { not: null },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
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
            id: true, firstName: true, lastName: true,
            mobile: true, currentBalance: true,
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
      console.warn('[Dashboard] topCustomers failed:', err?.message)
    }

    // ─── ۱۳. توزیع روش‌های پرداخت ────────────────────────────
    let paymentMethods: PaymentMethodBreakdown[] = []
    try {
      const methodStats: any = await tenantDb.invoice.groupBy({
        by: ['paymentType'],
        where: {
          tenantId,
          invoiceDate: { gte: startOfMonth },
          status: { notIn: ['cancelled', 'Cancelled'] },
          invoiceType: { notIn: ['sale_return', 'purchase_return'] },
        },
        _sum: { totalAmount: true },
        _count: true,
      })

      const methodLabels: Record<string, { label: string; color: string }> = {
        Cash:        { label: 'نقدی',   color: '#10b981' },
        Card:        { label: 'کارتی',  color: '#3b82f6' },
        Credit:      { label: 'نسیه',   color: '#f59e0b' },
        Installment: { label: 'قسطی',   color: '#8b5cf6' },
        Check:       { label: 'چک',     color: '#ec4899' },
        Online:      { label: 'آنلاین', color: '#06b6d4' },
        Mixed:       { label: 'ترکیبی', color: '#64748b' },
      }

      const totalMethodSales = methodStats.reduce(
        (sum: number, m: any) => sum + safeNum(m?._sum?.totalAmount),
        0
      )

      paymentMethods = methodStats
        .filter((m: any) => m.paymentType)
        .map((m: any) => {
          const labels = methodLabels[m.paymentType] || {
            label: m.paymentType,
            color: '#64748b',
          }
          const value = totalMethodSales > 0
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

      if (paymentMethods.length === 0) {
        paymentMethods = [{ name: 'Cash', label: 'نقدی', value: 100, count: 0, color: '#10b981' }]
      }
    } catch (err: any) {
      console.warn('[Dashboard] paymentMethods failed:', err?.message)
      paymentMethods = [{ name: 'Cash', label: 'نقدی', value: 100, count: 0, color: '#10b981' }]
    }

    // ─── ساخت response نهایی ─────────────────────────────────
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

    console.log('[Dashboard] Stats fetched (v6.0 — JE-Based Profit)', {
      tenantId,
      durationMs: Date.now() - startTime,
      stats,
      analytics: {
        monthComparison: !!monthComparison,
        topProducts: topProducts.length,
        topCustomers: topCustomers.length,
        paymentMethods: paymentMethods.length,
        dailySales30: dailySales30.length,
      },
    })

    return NextResponse.json({
      success: true,
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
      },
    })

  } catch (error: any) {
    console.error('[Dashboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور', details: error?.message },
      { status: 500 }
    )
  }
}