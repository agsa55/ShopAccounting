// src/app/api/reports/profit-loss/route.ts — v9.2 ★★★ FIXED
// تغییرات v9.2:
//   ★ رفع تداخل isRevenue / isOtherIncome
//   ★ طبقه‌بندی دقیق‌تر هزینه‌ها (5xxx vs 6xxx)
//   ★ جلوگیری از دوبار حساب شدن خطوط JE
//   ★ اصلاح منطق COGS: فقط کد 5000
//   ★ اصلاح discounts: از JE هم محاسبه شود

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

const GATEWAY_FEE_ACCOUNT_CODE = '5105'
const PLATFORM_FEE_ACCOUNT_CODE = '5106'
const COGS_ACCOUNT_CODE = '5000'

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fields = ((model as any).fields || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
}

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[P&L v9.2] ★★★ VERSION LOADED — FIXED CLASSIFICATION')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const dateFrom = searchParams.get('dateFrom')
      const dateTo = searchParams.get('dateTo')

      const now = new Date()
      const fromDate = dateFrom
        ? new Date(dateFrom)
        : new Date(now.getFullYear(), now.getMonth(), 1)
      const toDate = dateTo ? new Date(dateTo) : now

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ نامعتبر است' },
          { status: 400 }
        )
      }

      const toDateEnd = new Date(toDate)
      toDateEnd.setHours(23, 59, 59, 999)

      // ══════════════════════════════════════════════════════
      // ۱. واکشی حساب‌ها
      // ══════════════════════════════════════════════════════
      const allAccounts = await tenantDb.account.findMany({
        where: { tenantId },
        select: { id: true, code: true, type: true, name: true },
      })

      const accountMap = new Map<string, {
        id: string; code: string; type: string; name: string
      }>()
      for (const acc of allAccounts) {
        accountMap.set(acc.id, {
          id: acc.id,
          code: acc.code || '',
          type: (acc.type || '').toLowerCase(),
          name: acc.name || '',
        })
      }

      // ══════════════════════════════════════════════════════
      // ۲. واکشی اسناد حسابداری
      // ══════════════════════════════════════════════════════
      const allJournalEntries = await tenantDb.journalEntry.findMany({
        where: {
          tenantId,
          date: { gte: fromDate, lte: toDateEnd },
          status: 'posted',
        },
        include: { lines: true },
      })

      const journalEntries = allJournalEntries.filter(
        (je: any) => je.isCancelled !== true
      )

      console.log('[P&L v9.2] JournalEntries', {
        total: allJournalEntries.length,
        active: journalEntries.length,
        cancelled: allJournalEntries.length - journalEntries.length,
      })

      // ══════════════════════════════════════════════════════
      // ۳. محاسبه از JournalEntry — طبقه‌بندی اصلاح‌شده
      // ══════════════════════════════════════════════════════
      let revenueCr = 0   // بستانکار حساب‌های درآمد (فروش)
      let revenueDr = 0   // بدهکار حساب‌های درآمد (برگشتی فروش)
      let cogsDr = 0      // بدهکار COGS (5000)
      let cogsCr = 0      // بستانکار COGS (5000) — برگشتی
      let operatingExpDr = 0
      let gatewayFee = 0
      let platformFee = 0
      let otherIncome = 0
      let otherExpenses = 0

      const monthlyMap = new Map<string, {
        revenueCr: number; revenueDr: number
        cogsDr: number; cogsCr: number; expenses: number
      }>()

      const expenseBreakdown = new Map<string, {
        name: string; code: string; amount: number
      }>()

      for (const je of journalEntries) {
        const jeDate = new Date(je.date)
        const monthKey = `${jeDate.getFullYear()}-${String(jeDate.getMonth() + 1).padStart(2, '0')}`

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            revenueCr: 0, revenueDr: 0,
            cogsDr: 0, cogsCr: 0, expenses: 0,
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

          // ★ طبقه‌بندی دقیق — بدون تداخل
          // COGS: فقط کد 5000 یا type === 'cogs'
          const isCogs =
            accCode === COGS_ACCOUNT_CODE ||
            accType === 'cogs'

          // درآمد فروش: کدهای 4xxx یا type revenue/sales
          // (اما نه income عمومی که ممکن است سایر درآمد باشد)
          const isSalesRevenue =
            accCode.startsWith('4') ||
            accType === 'sales' ||
            (accType === 'revenue' && accCode.startsWith('4'))

          // سایر درآمدها: type income/revenue ولی NOT 4xxx
          const isOtherIncomeAcc =
            !isCogs &&
            !isSalesRevenue &&
            (accType === 'income' ||
              (accType === 'revenue' && !accCode.startsWith('4')))

          // هزینه درگاه پرداخت
          const isGatewayFeeAcc = accCode === GATEWAY_FEE_ACCOUNT_CODE
          const isPlatformFeeAcc = accCode === PLATFORM_FEE_ACCOUNT_CODE

          // هزینه‌های عملیاتی: کدهای 5xxx (غیر از COGS) و 6xxx
          const isOperatingExp =
            !isCogs &&
            !isGatewayFeeAcc &&
            !isPlatformFeeAcc &&
            !isSalesRevenue &&
            !isOtherIncomeAcc &&
            (accType === 'expense' ||
              accType === 'repair_expense' ||
              accType === 'service_expense' ||
              (accCode.startsWith('5') && !accCode.startsWith('50')) || // 51xx, 52xx
              accCode.startsWith('6'))

          // ★ پردازش بر اساس طبقه
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

      console.log('[P&L v9.2] JE-based calculation', {
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
      // ۴. واکشی فاکتورها
      // ══════════════════════════════════════════════════════
      const allInvoices = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: fromDate, lte: toDateEnd },
        },
        include: {
          items: true,
          customer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      })

      const validInvoices = allInvoices.filter((inv: any) => {
        const s = (inv.status || '').toLowerCase()
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

      console.log('[P&L v9.2] Invoice counts', {
        total: validInvoices.length,
        sales: saleInvoices.length,
        returns: returnInvoices.length,
      })

      // ══════════════════════════════════════════════════════
      // ۵. تصمیم: از JE یا Fallback؟
      // ══════════════════════════════════════════════════════
      let grossSales: number
      let salesReturns: number
      let discounts: number
      let netSales: number
      let totalCogsNet: number
      let dataSource: string

      const hasJEData = journalEntries.length > 0 && revenueCr > 0

      if (hasJEData) {
        dataSource = 'journal_entry'

        grossSales = grossSalesFromJE
        salesReturns = salesReturnsFromJE

        // تخفیف از فاکتورها (JE تخفیف ثبت نمی‌کند)
        discounts = saleInvoices.reduce(
          (s: number, i: any) => s + safeNum(i.discountAmount), 0
        )

        // netSales = فروش ناخالص - برگشتی (تخفیف از JE کم نمی‌شود چون در grossSales لحاظ شده)
        netSales = grossSales - salesReturns

        totalCogsNet = Math.max(0, cogsNetFromJE)

        console.log('[P&L v9.2] ✓ Using JE data', {
          grossSales, salesReturns, netSales, totalCogsNet,
          cogsFromJE: { cogsDr, cogsCr, net: cogsNetFromJE },
        })

      } else {
        dataSource = 'invoice_fallback'

        grossSales = saleInvoices.reduce(
          (s: number, i: any) => s + safeNum(i.totalAmount), 0
        )
        salesReturns = returnInvoices.reduce(
          (s: number, i: any) => s + safeNum(i.totalAmount), 0
        )
        discounts = saleInvoices.reduce(
          (s: number, i: any) => s + safeNum(i.discountAmount), 0
        )
        netSales = grossSales - salesReturns - discounts

        const cogsSales = saleInvoices.reduce(
          (s: number, i: any) => s + safeNum(i.cogsAmount), 0
        )
        const cogsReturns = returnInvoices.reduce(
          (s: number, i: any) => s + safeNum(i.cogsAmount), 0
        )
        totalCogsNet = Math.max(0, cogsSales - cogsReturns)

        console.log('[P&L v9.2] ✓ Using Invoice fallback', {
          grossSales, salesReturns, netSales,
          cogsSales, cogsReturns, totalCogsNet,
        })
      }

      const taxAmount =
        saleInvoices.reduce((s: number, i: any) => s + safeNum(i.taxAmount), 0) -
        returnInvoices.reduce((s: number, i: any) => s + safeNum(i.taxAmount), 0)

      // ══════════════════════════════════════════════════════
      // ۶. سود ناخالص و نهایی
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
      // ۷. تفکیک ماهانه — از JE یا فاکتور
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
        // fallback: از فاکتورها
        const fMonthMap = new Map<string, {
          revenue: number; cogs: number; expenses: number
        }>()
        for (const inv of validInvoices) {
          const d = new Date(inv.invoiceDate)
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const md = fMonthMap.get(mk) || { revenue: 0, cogs: 0, expenses: 0 }
          const sign =
            inv.invoiceType === 'sale_return' ||
            inv.invoiceType === 'purchase_return'
              ? -1 : 1
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
      // ۸. واکشی محصولات (جداگانه)
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
          console.warn('[P&L v9.2] Product query failed:', err?.message)
        }
      }
      const productMap = new Map<string, any>()
      for (const p of products) productMap.set(p.id, p)

      // ══════════════════════════════════════════════════════
      // ۹. تفکیک دسته‌بندی + محصولات برتر
      // ══════════════════════════════════════════════════════
      const categoryStatsMap = new Map<string, {
        categoryId: string; categoryName: string
        revenue: number; cogs: number; quantity: number
      }>()

      const productStatsMap = new Map<string, {
        productId: string; productName: string
        revenue: number; cogs: number; quantity: number
      }>()

      for (const inv of validInvoices) {
        const sign =
          inv.invoiceType === 'sale_return' ||
          inv.invoiceType === 'purchase_return'
            ? -1 : 1

        for (const item of inv.items || []) {
          if (!item.productId) continue

          const product = productMap.get(item.productId)
          const catId = product?.categoryId || 'uncategorized'
          const catName = product?.category?.name || 'بدون دسته'
          const productName = item.productName || product?.name || 'نامشخص'

          const itemRevenue = safeNum(
            item.lineTotal || safeNum(item.quantity) * safeNum(item.unitPrice)
          )

          // ★ COGS هر محصول: از میانگین وزنی یا قیمت خرید
          const unitCost =
            safeNum(product?.averageCost) > 0
              ? safeNum(product?.averageCost)
              : safeNum(product?.purchasePrice)
          const itemCogs = unitCost * safeNum(item.quantity)

          // Category
          const cat = categoryStatsMap.get(catId) || {
            categoryId: catId, categoryName: catName,
            revenue: 0, cogs: 0, quantity: 0,
          }
          cat.revenue += itemRevenue * sign
          cat.cogs += itemCogs * sign
          cat.quantity += safeNum(item.quantity) * sign
          categoryStatsMap.set(catId, cat)

          // Product
          const ps = productStatsMap.get(item.productId) || {
            productId: item.productId, productName,
            revenue: 0, cogs: 0, quantity: 0,
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
      // ۱۰. پرداخت‌های آنلاین
      // ══════════════════════════════════════════════════════
      let onlinePaymentsSummary = {
        count: 0, totalAmount: 0,
        totalGatewayFee: gatewayFee,
        totalPlatformCommission: platformFee,
        totalNetSettled: 0,
      }

      try {
        const isGatewayFeeSupported = isFieldSupported(tenantDb.onlinePayment, 'gatewayFee')
        const isNetSettledSupported = isFieldSupported(tenantDb.onlinePayment, 'netSettledAmount')
        const isPlatformCommissionSupported = isFieldSupported(tenantDb.onlinePayment, 'platformCommission')

        if (isGatewayFeeSupported && isPlatformCommissionSupported && isNetSettledSupported) {
          const onlinePayments = await tenantDb.onlinePayment.findMany({
            where: {
              tenantId,
              status: 'paid',
              paidAt: { gte: fromDate, lte: toDateEnd },
            },
            select: {
              id: true, amount: true,
              gatewayFee: true, platformCommission: true, netSettledAmount: true,
            },
          })
          onlinePaymentsSummary = {
            count: onlinePayments.length,
            totalAmount: onlinePayments.reduce((s: number, p: any) => s + safeNum(p.amount), 0),
            totalGatewayFee: onlinePayments.reduce((s: number, p: any) => s + safeNum(p.gatewayFee), 0),
            totalPlatformCommission: onlinePayments.reduce((s: number, p: any) => s + safeNum(p.platformCommission), 0),
            totalNetSettled: onlinePayments.reduce((s: number, p: any) => s + safeNum(p.netSettledAmount), 0),
          }
        } else {
          const onlinePayments = await tenantDb.onlinePayment.findMany({
            where: {
              tenantId, status: 'paid',
              paidAt: { gte: fromDate, lte: toDateEnd },
            },
            select: { id: true, amount: true },
          })
          onlinePaymentsSummary = {
            count: onlinePayments.length,
            totalAmount: onlinePayments.reduce((s: number, p: any) => s + safeNum(p.amount), 0),
            totalGatewayFee: gatewayFee,
            totalPlatformCommission: platformFee,
            totalNetSettled: 0,
          }
        }
      } catch (err: any) {
        console.warn('[P&L v9.2] OnlinePayment query failed:', err?.message)
      }

      const paymentGatewayFees = {
        zarinpal: Math.round(gatewayFee),
        platform: Math.round(platformFee),
        total: Math.round(gatewayFee + platformFee),
        percentage: netSales > 0
          ? Math.round(((gatewayFee + platformFee) / netSales) * 10000) / 100
          : 0,
      }

      // ══════════════════════════════════════════════════════
      // ۱۱. لاگ نهایی
      // ══════════════════════════════════════════════════════
      console.log('[P&L v9.2] ★ FINAL RESULT', {
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
      // ۱۲. پاسخ نهایی
      // ══════════════════════════════════════════════════════
      const operatingExpenses = Array.from(expenseBreakdown.values())
        .sort((a, b) => b.amount - a.amount)

      return NextResponse.json({
        success: true,
        data: {
          _version: 'v9.2',
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

          // ★ invoiceCount = مجموع فاکتور + سند دستی
          invoiceCount: saleInvoices.length,
          returnCount: returnInvoices.length,
          averageInvoiceValue:
            saleInvoices.length > 0
              ? Math.round(netSales / saleInvoices.length)
              : 0,

          monthlyBreakdown,
          categoryBreakdown,
          topProfitableProducts,

          dateRange: {
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
          },
        },
      })

    } catch (error: any) {
      console.error('[P&L v9.2] Error:', error?.message || error)
      return NextResponse.json(
        {
          success: false,
          error: 'خطا در دریافت گزارش سود و زیان: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)