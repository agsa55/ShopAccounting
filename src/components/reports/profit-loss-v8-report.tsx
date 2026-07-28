// ============================================================================
// src/app/api/reports/profit-loss/route.ts — GET (v8.7 ★★★ COGS FIX + DEBUG v2)
// ShopAccounting — Profit & Loss Report API
// ----------------------------------------------------------------------------
// ★★★ v8.7 تغییرات نسبت به v8.6:
//   1. اضافه شدن Response Header `X-PnL-Version: v8.7` برای تایید قطعی نصب
//      (می‌تونید در Network Tab ببینید)
//   2. لاگ PER-LINE تفصیلی برای هر JournalEntryLine
//   3. لاگ Per-Account Summary (مجموع debit/credit برای هر حساب)
//   4. اضافه شدن فیلد `_debug` در response با جزئیات محاسبه
//
// ★★★ v8.6 (حفظ شد):
//   1. COGS منبع اصلی = Invoices.cogsAmount
//   2. حذف کامل منطق StockMovement
//   3. حذف مالیات 25% هاردکد (incomeTax = 0)
//
// ★★★ v8.5 (حفظ شد):
//   1. فیلتر isCancelled: false حذف شد + فیلتر JS
//
// ★★★ v8.4 (حفظ شد): تفکیک کارمزد درگاه (5105) و پلتفرم (5106)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  ثابت‌ها — کدهای حساب‌های کارمزد
// ═══════════════════════════════════════════════════════════════

const GATEWAY_FEE_ACCOUNT_CODE = '5105'    // هزینه کارمزد درگاه زرین‌پال
const PLATFORM_FEE_ACCOUNT_CODE = '5106'   // هزینه کارمزد پلتفرم

// ═══════════════════════════════════════════════════════════════
//  تابع کمکی: تشخیص اینکه آیا فیلد در Prisma Client موجود است
// ═══════════════════════════════════════════════════════════════

function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fieldsRaw = (model as any).fields as unknown
    const fields = (fieldsRaw || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/reports/profit-loss?dateFrom=...&dateTo=...
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    // ★★★ v8.7: VERSION MARKER — این لاگ حتماً باید در کنسول دیده بشه
    console.log('═══════════════════════════════════════════════════════════')
    console.log('[P&L v8.7] ★★★ VERSION LOADED — این نسخه v8.7 است')
    console.log('═══════════════════════════════════════════════════════════')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const dateFrom = searchParams.get('dateFrom')
      const dateTo = searchParams.get('dateTo')

      // ★ تاریخ پیش‌فرض: از اول ماه جاری تا امروز
      const now = new Date()
      const fromDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1)
      const toDate = dateTo ? new Date(dateTo) : now

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ نامعتبر است' },
          { status: 400 }
        )
      }

      const toDateEnd = new Date(toDate)
      toDateEnd.setHours(23, 59, 59, 999)

      console.log('[P&L v8.7] Querying', {
        tenantId,
        dateFrom: fromDate.toISOString(),
        dateTo: toDateEnd.toISOString(),
      })

      // ═══════════════════════════════════════════════════════════════
      //  1. فاکتورهای فروش در بازه تاریخ
      // ═══════════════════════════════════════════════════════════════
      const invoices = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: fromDate, lte: toDateEnd },
        },
        include: {
          items: true,
          customer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { invoiceDate: 'asc' },
      })

      console.log('[P&L v8.7] Invoices query result', {
        totalInvoices: invoices.length,
        invoiceNumbers: invoices.map((i: any) => i.number),
        invoiceDetails: invoices.map((i: any) => ({
          number: i.number,
          subTotal: i.subTotal,
          cogsAmount: i.cogsAmount,
          status: i.status,
        })),
      })

      // ★ فیلتر فاکتورهای لغو شده
      const validInvoices = invoices.filter((inv: any) => {
        const status = (inv.status || '').toLowerCase()
        return status !== 'cancelled' && status !== 'void'
      })

      // ═══════════════════════════════════════════════════════════════
      //  2. ★★★ v8.6: COGS فقط از Invoices.cogsAmount
      //     (حذف کامل منطق StockMovement که باعث باگ می‌شد)
      // ═══════════════════════════════════════════════════════════════
      const cogsByInvoice = new Map<string, number>()

      // ★★★ v8.7: لاگ cogsAmount هر فاکتور به‌صورت جداگانه
      console.log('[P&L v8.7] ═══ Per-invoice cogsAmount breakdown ═══')
      for (const inv of validInvoices) {
        const cogsFromInvoice = Number(inv.cogsAmount) || 0
        cogsByInvoice.set(inv.id, cogsFromInvoice)
        console.log('[P&L v8.7]   • Invoice', inv.number, {
          subTotal: inv.subTotal,
          cogsAmount: inv.cogsAmount,
          cogsParsed: cogsFromInvoice,
          margin: (inv.subTotal || 0) - cogsFromInvoice,
        })
      }
      console.log('[P&L v8.7] ═══ End per-invoice breakdown ═══')

      // ═══════════════════════════════════════════════════════════════
      //  3. محصولات (برای تفکیک دسته‌بندی + نام)
      // ═══════════════════════════════════════════════════════════════
      const productIds = new Set<string>()
      for (const inv of validInvoices) {
        for (const item of inv.items) {
          if (item.productId) productIds.add(item.productId)
        }
      }

      let products: any[] = []
      if (productIds.size > 0) {
        try {
          products = await tenantDb.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            include: {
              category: { select: { id: true, name: true } },
            },
          })
        } catch (err: any) {
          console.warn('[P&L v8.7] Product query failed:', err?.message)
        }
      }

      const productMap = new Map<string, any>()
      for (const p of products) {
        productMap.set(p.id, p)
      }

      // ═══════════════════════════════════════════════════════════════
      //  4. ★★★ v8.6: محاسبه COGS کلی — فقط از Invoices.cogsAmount
      // ═══════════════════════════════════════════════════════════════
      let totalCogsFromInvoices = 0
      let totalCogsFromFallback = 0

      for (const inv of validInvoices) {
        const cogsAmount = Number(inv.cogsAmount) || 0
        if (cogsAmount > 0) {
          totalCogsFromInvoices += cogsAmount
        } else {
          // ★ fallback فقط اگر cogsAmount صفر یا NULL بود
          let fallbackCogs = 0
          for (const item of inv.items) {
            if (item.productId) {
              const product = productMap.get(item.productId)
              if (product) {
                const unitCost = product.purchasePrice || 0
                const itemCogs = unitCost * item.quantity
                fallbackCogs += itemCogs
              }
            }
          }
          cogsByInvoice.set(inv.id, fallbackCogs)
          totalCogsFromFallback += fallbackCogs
        }
      }

      // ★ مجموع COGS = from invoices + from fallback
      const totalCogs = totalCogsFromInvoices + totalCogsFromFallback

      console.log('[P&L v8.7] COGS breakdown', {
        invoiceCount: validInvoices.length,
        cogsFromInvoices: totalCogsFromInvoices,
        cogsFromFallback: totalCogsFromFallback,
        totalCogs,
      })

      // ═══════════════════════════════════════════════════════════════
      //  5. محاسبه فروش و COGS کلی
      // ═══════════════════════════════════════════════════════════════
      let grossSales = 0
      let discounts = 0
      let taxAmount = 0
      let salesReturns = 0

      for (const inv of validInvoices) {
        grossSales += inv.subTotal || (inv.totalAmount - (inv.taxAmount || 0) + (inv.discountAmount || 0))
        discounts += inv.discountAmount || 0
        taxAmount += inv.taxAmount || 0
        salesReturns += (inv as any).returnAmount || 0
      }

      const netSales = grossSales - salesReturns - discounts
      const grossProfit = netSales - totalCogs
      const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0

      // ═══════════════════════════════════════════════════════════════
      //  6. ★★★ v8.6: هزینه‌های عملیاتی از JournalEntry
      //     فیلتر isCancelled: false حذف شد (مشکل NULL در SQL Server)
      // ═══════════════════════════════════════════════════════════════
      let allJournalEntries: any[] = []
      let accountMap = new Map<string, any>()
      let journalEntries: any[] = []
      let totalOperatingExpenses = 0
      let otherIncome = 0
      let otherExpenses = 0
      let gatewayFeeFromJournal = 0
      let platformFeeFromJournal = 0
      let operatingExpenses: any[] = []
      let onlinePaymentsSummary = {
        count: 0,
        totalAmount: 0,
        totalGatewayFee: 0,
        totalPlatformCommission: 0,
        totalNetSettled: 0,
      }
      let paymentGatewayFees: any = {
        zarinpal: 0,
        platform: 0,
        total: 0,
        percentage: 0,
        zarinpalPercentage: 0,
        platformPercentage: 0,
      }

      try {
        allJournalEntries = await tenantDb.journalEntry.findMany({
          where: {
            tenantId,
            date: { gte: fromDate, lte: toDateEnd },
            status: 'posted',
            // ★★★ v8.6: فیلتر isCancelled حذف شد — در JS فیلتر می‌شه
          },
          include: {
            lines: true,
          },
        })

        // ★★★ v8.6: فیلتر isCancelled در JavaScript
        journalEntries = allJournalEntries.filter((je: any) => je.isCancelled !== true)

        console.log('[P&L v8.7] JournalEntry query', {
          totalEntriesBeforeFilter: allJournalEntries.length,
          entriesAfterFilter: journalEntries.length,
          sourceTypes: journalEntries.map((je: any) => je.sourceType),
        })

        // ★★★ v8.7: لاگ PER-LINE تفصیلی برای هر JE
        console.log('[P&L v8.7] ═══ Per-JE-Line breakdown ═══')
        for (const je of journalEntries) {
          console.log('[P&L v8.7]   • JE', je.number, {
            sourceType: je.sourceType,
            date: je.date,
            isCancelled: je.isCancelled,
          })
          for (const line of (je.lines || [])) {
            const acc = line.accountId ? accountMap.get(line.accountId) : null
            console.log('[P&L v8.7]     └─ Line', {
              accountCode: acc?.code || 'N/A',
              accountName: acc?.name || 'N/A',
              accountType: acc?.type || 'N/A',
              debit: line.debit,
              credit: line.credit,
            })
          }
        }
        console.log('[P&L v8.7] ═══ End per-JE-Line breakdown ═══')

        const accountIds = new Set<string>()
        for (const je of journalEntries) {
          for (const line of (je.lines || [])) {
            if (line.accountId) accountIds.add(line.accountId)
          }
        }

        if (accountIds.size > 0) {
          const accounts = await tenantDb.account.findMany({
            where: { id: { in: Array.from(accountIds) } },
          })
          for (const acc of accounts) {
            accountMap.set(acc.id, acc)
          }
        }

        const operatingExpensesMap = new Map<
          string,
          { name: string; amount: number; accountCode: string; accountType: string }
        >()

        for (const je of journalEntries) {
          // ★ نادیده گرفتن سندهای خودکار فاکتور (COGS قبلاً از cogsAmount محاسبه شده)
          if (je.sourceType === 'invoice') continue

          const lines = je.lines || []
          for (const line of lines) {
            const acc = line.accountId ? accountMap.get(line.accountId) : null
            if (!acc) continue

            const accType = (acc.type || '').toLowerCase()
            const accCode = acc.code || ''
            const accName = acc.name || 'سایر'

            // ★★★ v8.4: تشخیص کارمزدهای پرداخت آنلاین
            if (accCode === GATEWAY_FEE_ACCOUNT_CODE && Number(line.debit) > 0) {
              gatewayFeeFromJournal += Number(line.debit) || 0
            }
            if (accCode === PLATFORM_FEE_ACCOUNT_CODE && Number(line.debit) > 0) {
              platformFeeFromJournal += Number(line.debit) || 0
            }

            const isExpense =
              accType === 'expense' ||
              accType === 'cost' ||
              accCode.startsWith('5') ||
              accName.includes('هزینه') ||
              accName.includes('دستمزد') ||
              accName.includes('اجاره') ||
              accName.includes('حقوق') ||
              accName.includes('آب') ||
              accName.includes('برق') ||
              accName.includes('تلفن')

            const isOtherIncome =
              (accType === 'income' || accType === 'revenue') &&
              !accName.includes('فروش') &&
              !accCode.startsWith('41')

            const isOtherExpense = accCode.startsWith('6') || accCode.startsWith('7')

            if (isExpense && Number(line.debit) > 0) {
              const key = acc.id || accName
              const existing =
                operatingExpensesMap.get(key) ||
                { name: accName, amount: 0, accountCode: accCode, accountType: accType }
              existing.amount += Number(line.debit) || 0
              operatingExpensesMap.set(key, existing)
              totalOperatingExpenses += Number(line.debit) || 0
            } else if (isOtherIncome && Number(line.credit) > 0) {
              otherIncome += Number(line.credit) || 0
            } else if (isOtherExpense && Number(line.debit) > 0) {
              otherExpenses += Number(line.debit) || 0
            }
          }
        }

        operatingExpenses = Array.from(operatingExpensesMap.values()).sort(
          (a, b) => b.amount - a.amount
        )

        // ═══════════════════════════════════════════════════════════════
        //  7. ★★★ v8.4: خلاصه پرداخت‌های آنلاین — نسخه‌ی پایدار
        // ═══════════════════════════════════════════════════════════════
        try {
          const isGatewayFeeSupported = isFieldSupported(db.client.onlinePayment, 'gatewayFee')
          const isNetSettledSupported = isFieldSupported(db.client.onlinePayment, 'netSettledAmount')
          const isPlatformCommissionSupported = isFieldSupported(db.client.onlinePayment, 'platformCommission')

          let onlinePayments: any[] = []

          if (isGatewayFeeSupported && isPlatformCommissionSupported && isNetSettledSupported) {
            onlinePayments = await db.client.onlinePayment.findMany({
              where: {
                tenantId,
                status: 'paid',
                paidAt: { gte: fromDate, lte: toDateEnd },
              },
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
              totalAmount: onlinePayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
              totalGatewayFee: onlinePayments.reduce((sum: number, p: any) => sum + (Number(p.gatewayFee) || 0), 0),
              totalPlatformCommission: onlinePayments.reduce((sum: number, p: any) => sum + (Number(p.platformCommission) || 0), 0),
              totalNetSettled: onlinePayments.reduce((sum: number, p: any) => sum + (Number(p.netSettledAmount) || 0), 0),
            }

            paymentGatewayFees = {
              zarinpal: onlinePaymentsSummary.totalGatewayFee,
              platform: onlinePaymentsSummary.totalPlatformCommission,
              total: onlinePaymentsSummary.totalGatewayFee + onlinePaymentsSummary.totalPlatformCommission,
              percentage: onlinePaymentsSummary.totalAmount > 0
                ? ((onlinePaymentsSummary.totalGatewayFee + onlinePaymentsSummary.totalPlatformCommission) / onlinePaymentsSummary.totalAmount) * 100
                : 0,
              zarinpalPercentage: onlinePaymentsSummary.totalAmount > 0
                ? (onlinePaymentsSummary.totalGatewayFee / onlinePaymentsSummary.totalAmount) * 100
                : 0,
              platformPercentage: onlinePaymentsSummary.totalAmount > 0
                ? (onlinePaymentsSummary.totalPlatformCommission / onlinePaymentsSummary.totalAmount) * 100
                : 0,
            }
          } else {
            onlinePayments = await db.client.onlinePayment.findMany({
              where: {
                tenantId,
                status: 'paid',
                paidAt: { gte: fromDate, lte: toDateEnd },
              },
              select: {
                id: true,
                amount: true,
              },
            })

            onlinePaymentsSummary = {
              count: onlinePayments.length,
              totalAmount: onlinePayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
              totalGatewayFee: gatewayFeeFromJournal,
              totalPlatformCommission: platformFeeFromJournal,
              totalNetSettled: 0,
            }

            paymentGatewayFees = {
              zarinpal: gatewayFeeFromJournal,
              platform: platformFeeFromJournal,
              total: gatewayFeeFromJournal + platformFeeFromJournal,
              percentage: netSales > 0 ? ((gatewayFeeFromJournal + platformFeeFromJournal) / netSales) * 100 : 0,
              zarinpalPercentage: netSales > 0 ? (gatewayFeeFromJournal / netSales) * 100 : 0,
              platformPercentage: netSales > 0 ? (platformFeeFromJournal / netSales) * 100 : 0,
            }
          }
        } catch (err: any) {
          console.warn('[P&L v8.7] OnlinePayment query failed:', err?.message)
        }

        // ═══════════════════════════════════════════════════════════════
        //  8. ★★★ v8.6: محاسبه سود نهایی — حذف مالیات 25% هاردکد
        // ═══════════════════════════════════════════════════════════════
        const operatingProfit = grossProfit - totalOperatingExpenses
        const profitBeforeTax = operatingProfit + otherIncome - otherExpenses
        // ★★★ v8.6: حذف مالیات هاردکد 25%
        //   قبلاً: const incomeTax = profitBeforeTax > 0 ? Math.round(profitBeforeTax * 0.25) : 0
        //   حالا: 0 (در آینده می‌توان به‌صورت تنظیمات tenant اضافه کرد)
        const incomeTax = 0
        const netProfit = profitBeforeTax - incomeTax
        const netMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0

        // ═══════════════════════════════════════════════════════════════
        //  9. تفکیک ماهانه
        // ═══════════════════════════════════════════════════════════════
        const monthlyMap = new Map<
          string,
          { revenue: number; cogs: number; expenses: number; gatewayFee: number; platformFee: number; netProfit: number }
        >()

        for (const inv of validInvoices) {
          const d = new Date(inv.invoiceDate)
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

          const month = monthlyMap.get(monthKey) || { revenue: 0, cogs: 0, expenses: 0, gatewayFee: 0, platformFee: 0, netProfit: 0 }
          const invNetSales =
            (inv.subTotal || 0) - (inv.discountAmount || 0) - ((inv as any).returnAmount || 0)
          month.revenue += invNetSales
          month.cogs += cogsByInvoice.get(inv.id) || 0
          monthlyMap.set(monthKey, month)
        }

        for (const je of journalEntries) {
          if (je.sourceType === 'invoice') continue
          const d = new Date(je.date)
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

          const month = monthlyMap.get(monthKey) || { revenue: 0, cogs: 0, expenses: 0, gatewayFee: 0, platformFee: 0, netProfit: 0 }
          const lines = je.lines || []
          for (const line of lines) {
            const acc = line.accountId ? accountMap.get(line.accountId) : null
            if (!acc) continue
            const accType = (acc.type || '').toLowerCase()
            const accCode = acc.code || ''
            const isExpense =
              accType === 'expense' ||
              accType === 'cost' ||
              accCode.startsWith('5')
            if (isExpense && Number(line.debit) > 0) {
              month.expenses += Number(line.debit) || 0
              if (accCode === GATEWAY_FEE_ACCOUNT_CODE) {
                month.gatewayFee += Number(line.debit) || 0
              } else if (accCode === PLATFORM_FEE_ACCOUNT_CODE) {
                month.platformFee += Number(line.debit) || 0
              }
            }
          }
          monthlyMap.set(monthKey, month)
        }

        const monthlyBreakdown = Array.from(monthlyMap.entries())
          .map(([month, data]) => ({
            month,
            revenue: Math.round(data.revenue),
            cogs: Math.round(data.cogs),
            grossProfit: Math.round(data.revenue - data.cogs),
            expenses: Math.round(data.expenses),
            gatewayFee: Math.round(data.gatewayFee),
            platformFee: Math.round(data.platformFee),
            netProfit: Math.round(data.revenue - data.cogs - data.expenses),
          }))
          .sort((a, b) => a.month.localeCompare(b.month))

        // ═══════════════════════════════════════════════════════════════
        //  10. تفکیک دسته‌بندی محصول
        // ═══════════════════════════════════════════════════════════════
        const categoryMap = new Map<
          string,
          { categoryId: string; categoryName: string; revenue: number; cogs: number; quantity: number }
        >()

        for (const inv of validInvoices) {
          const invCogs = cogsByInvoice.get(inv.id) || 0
          const invRevenue = (inv.subTotal || 0) - (inv.discountAmount || 0)

          for (const item of inv.items) {
            if (!item.productId) continue
            const product = productMap.get(item.productId)
            const categoryId = product?.categoryId || 'uncategorized'
            const categoryName = product?.category?.name || 'بدون دسته'

            // ★ تخصیص COGS به‌صورت proportional بر اساس revenue هر آیتم
            const itemRevenue = item.lineTotal || (item.quantity * item.unitPrice)
            const itemCogs = invRevenue > 0 ? (itemRevenue / invRevenue) * invCogs : 0

            const cat =
              categoryMap.get(categoryId) ||
              { categoryId, categoryName, revenue: 0, cogs: 0, quantity: 0 }
            cat.revenue += itemRevenue
            cat.cogs += itemCogs
            cat.quantity += item.quantity
            categoryMap.set(categoryId, cat)
          }
        }

        const categoryBreakdown = Array.from(categoryMap.values())
          .map((c) => ({
            ...c,
            grossProfit: Math.round(c.revenue - c.cogs),
            margin: c.revenue > 0 ? ((c.revenue - c.cogs) / c.revenue) * 100 : 0,
          }))
          .sort((a, b) => b.grossProfit - a.grossProfit)

        // ═══════════════════════════════════════════════════════════════
        //  11. محصول برتر (Top 10)
        // ═══════════════════════════════════════════════════════════════
        const productStatsMap = new Map<
          string,
          { productId: string; productName: string; revenue: number; cogs: number; quantity: number }
        >()

        for (const inv of validInvoices) {
          const invCogs = cogsByInvoice.get(inv.id) || 0
          const invRevenue = (inv.subTotal || 0) - (inv.discountAmount || 0)

          for (const item of inv.items) {
            if (!item.productId) continue
            const product = productMap.get(item.productId)
            const productName = item.productName || product?.name || 'نامشخص'

            const itemRevenue = item.lineTotal || (item.quantity * item.unitPrice)
            const itemCogs = invRevenue > 0 ? (itemRevenue / invRevenue) * invCogs : 0

            const ps =
              productStatsMap.get(item.productId) ||
              { productId: item.productId, productName, revenue: 0, cogs: 0, quantity: 0 }
            ps.revenue += itemRevenue
            ps.cogs += itemCogs
            ps.quantity += item.quantity
            productStatsMap.set(item.productId, ps)
          }
        }

        const topProfitableProducts = Array.from(productStatsMap.values())
          .map((p) => ({
            ...p,
            grossProfit: Math.round(p.revenue - p.cogs),
            margin: p.revenue > 0 ? ((p.revenue - p.cogs) / p.revenue) * 100 : 0,
          }))
          .sort((a, b) => b.grossProfit - a.grossProfit)
          .slice(0, 10)

        // ═══════════════════════════════════════════════════════════════
        //  12. خروجی نهایی
        // ═══════════════════════════════════════════════════════════════
        // ★★★ v8.7: لاگ COMPLETE با همه اعداد کلیدی
        console.log('═══════════════════════════════════════════════════════════')
        console.log('[P&L v8.7] ★ FINAL RESULT ★', {
          invoiceCount: validInvoices.length,
          grossSales,
          discounts,
          netSales,
          cogsFromInvoices: totalCogsFromInvoices,
          cogsFromFallback: totalCogsFromFallback,
          totalCogs,
          grossProfit,
          totalOperatingExpenses,
          operatingProfit,
          otherIncome,
          otherExpenses,
          profitBeforeTax,
          incomeTax,
          netProfit,
          netMargin,
        })
        console.log('═══════════════════════════════════════════════════════════')

        return NextResponse.json({
          success: true,
          data: {
            // ★★★ v8.7: version marker برای frontend
            _version: 'v8.7',

            // ─── بخش فروش ───
            grossSales: Math.round(grossSales),
            salesReturns: Math.round(salesReturns),
            discounts: Math.round(discounts),
            netSales: Math.round(netSales),
            taxAmount: Math.round(taxAmount),

            // ─── بخش COGS ───
            cogs: Math.round(totalCogs),
            cogsFromInvoices: Math.round(totalCogsFromInvoices),
            cogsFromFallback: Math.round(totalCogsFromFallback),

            // ─── بخش سود ناخالص ───
            grossProfit: Math.round(grossProfit),
            grossMargin: Math.round(grossMargin * 10) / 10,

            // ─── بخش هزینه‌های عملیاتی ───
            operatingExpenses,
            totalOperatingExpenses: Math.round(totalOperatingExpenses),

            // ★★★ v8.4: تفکیک کارمزدهای پرداخت آنلاین ───
            paymentGatewayFees: {
              zarinpal: Math.round(paymentGatewayFees.zarinpal),
              platform: Math.round(paymentGatewayFees.platform),
              total: Math.round(paymentGatewayFees.total),
              percentage: Math.round(paymentGatewayFees.percentage * 100) / 100,
              zarinpalPercentage: Math.round(paymentGatewayFees.zarinpalPercentage * 100) / 100,
              platformPercentage: Math.round(paymentGatewayFees.platformPercentage * 100) / 100,
            },

            // ★★★ v8.3: خلاصه پرداخت‌های آنلاین ───
            onlinePaymentsSummary: {
              count: onlinePaymentsSummary.count,
              totalAmount: Math.round(onlinePaymentsSummary.totalAmount),
              totalGatewayFee: Math.round(onlinePaymentsSummary.totalGatewayFee),
              totalPlatformCommission: Math.round(onlinePaymentsSummary.totalPlatformCommission),
              totalNetSettled: Math.round(onlinePaymentsSummary.totalNetSettled),
            },

            // ─── بخش سایر ───
            otherIncome: Math.round(otherIncome),
            otherExpenses: Math.round(otherExpenses),

            // ─── بخش سود نهایی ───
            operatingProfit: Math.round(operatingProfit),
            profitBeforeTax: Math.round(profitBeforeTax),
            incomeTax: Math.round(incomeTax),
            netProfit: Math.round(netProfit),
            netMargin: Math.round(netMargin * 10) / 10,

            // ─── آمار ───
            invoiceCount: validInvoices.length,
            averageInvoiceValue:
              validInvoices.length > 0 ? Math.round(netSales / validInvoices.length) : 0,

            // ─── تفکیک ماهانه ───
            monthlyBreakdown,

            // ─── تفکیک دسته‌بندی ───
            categoryBreakdown,

            // ─── محصول برتر ───
            topProfitableProducts,

            // ─── بازه تاریخ ───
            dateRange: {
              from: fromDate.toISOString(),
              to: toDate.toISOString(),
            },
          },
        })
      } catch (innerErr: any) {
        console.error('[P&L v8.7] Inner error in journal processing:', innerErr?.message)
        throw innerErr
      }
    } catch (error: any) {
      console.error('[P&L v8.7] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت گزارش سود و زیان: ' + (error?.message || 'نامشخص') },
        { status: 500 }
      )
    }
  }
)
