import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================================
// src/app/api/cashier-dashboard/route.ts — v12.2.3 ★★★
// ★ v12.2.3:
//   - رفع خطای Prisma: مدل CashMovement فیلد direction و type ندارد
//   - تشخیص جهت تراکنش دستی از روی transactionType
//   - محاسبه موجودی صندوق از اسناد حسابداری حساب صندوق
//   - سند افتتاحیه به عنوان موجودی اولیه در نظر گرفته می‌شود
//   - جلوگیری از دوبار شمردن موجودی اولیه در جریان امروز
//   - حفظ محاسبه سود امروز و سود کل صندوق‌دار
// ★ v12.2.2:
//   - رفع قطعی سود منفی: «صندوق فروشگاه» دیگر درآمد فروش حساب نمی‌شود
//   - محاسبه موجودی صندوق از روی اسناد حسابداری حساب صندوق
// ★ v12.1.0: تفکیک پیش‌پرداخت فروش اقساطی
// ★ v12.0.1: رفع مشکل دوبار شمردن فروش نقدی
// ★ v12.0.0: پشتیبانی از چند صندوق‌دار
// ============================================================================

const FA_DIGITS = '۰۱۲۴۵۶۸۹'
const AR_DIGITS = '٠١٢٤٥٦٧٨٩'

function normalizeType(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}

function toEnglishDigits(value: any): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

function isReturnInvoiceType(value: any): boolean {
  const t = normalizeType(value)
  return (
    t === 'sale_return' ||
    t === 'return' ||
    t === 'برگشتی' ||
    t === 'return_sale' ||
    t.includes('return')
  )
}

function isPurchaseInvoiceType(value: any): boolean {
  const t = normalizeType(value)
  return (
    t.includes('purchase') ||
    t === 'buy' ||
    t.includes('خرید')
  )
}

function isSalesRelatedInvoiceType(value: any): boolean {
  return !isPurchaseInvoiceType(value)
}

function isCashLikePaymentType(value: any): boolean {
  const t = normalizeType(toEnglishDigits(value))
  if (!t) return false

  // این‌ها پول نقد داخل صندوق نیستند
  if (
    t.includes('card') ||
    t.includes('کارت') ||
    t.includes('check') ||
    t.includes('چک') ||
    t.includes('cheque') ||
    t.includes('credit') ||
    t.includes('نسیه')
  ) {
    return false
  }

  return (
    t.includes('cash') ||
    t.includes('نقد') ||
    t.includes('installment') ||
    t.includes('قسط') ||
    t.includes('prepay') ||
    t.includes('down') ||
    t.includes('partial') ||
    t.includes('پیش')
  )
}

// ★ v12.2.3: جهت تراکنش دستی را فقط از transactionType استخراج می‌کنیم
function getManualMovementDirection(value: any): 'in' | 'out' | null {
  const t = normalizeType(toEnglishDigits(value))

  if (!t) return null

  // این‌ها تراکنش دستی صندوق نیستند
  if (
    t.includes('opening_balance') ||
    t.includes('initial_balance') ||
    t.includes('installment') ||
    t.includes('قسط')
  ) {
    return null
  }

  // ورودی صندوق
  if (
    t === 'deposit' ||
    t.includes('deposit') ||
    t.includes('واریز') ||
    t.includes('وارد')
  ) {
    return 'in'
  }

  // خروجی صندوق
  if (
    t === 'withdrawal' ||
    t.includes('withdrawal') ||
    t.includes('expense') ||
    t.includes('برداشت') ||
    t.includes('هزینه') ||
    t.includes('خارج')
  ) {
    return 'out'
  }

  return null
}

function isManualCashMovementType(value: any): boolean {
  return getManualMovementDirection(value) !== null
}

// ═══════════════════════════════════════════════════════════════
// ★ محاسبه سود از روی اسناد حسابداری
// ═══════════════════════════════════════════════════════════════
async function calculateProfitForInvoiceIds(
  tenantId: string,
  invoiceIds: string[]
): Promise<{
  revenue: number
  cogs: number
  profit: number
}> {
  if (!invoiceIds || invoiceIds.length === 0) {
    return { revenue: 0, cogs: 0, profit: 0 }
  }

  try {
    const journalEntries = await (db as any).client.JournalEntry.findMany({
      where: {
        tenantId,
        sourceId: { in: invoiceIds },
        status: 'posted',
      },
      select: {
        id: true,
        sourceId: true,
      },
    })

    if (!journalEntries || journalEntries.length === 0) {
      console.log('[cashier-dashboard] 💹 No journal entries found for profit calculation')
      return { revenue: 0, cogs: 0, profit: 0 }
    }

    const journalIds = journalEntries.map((je: any) => je.id)

    const lines = await (db as any).client.JournalEntryLine.findMany({
      where: {
        journalEntryId: { in: journalIds },
      },
      select: {
        journalEntryId: true,
        accountId: true,
        debit: true,
        credit: true,
      },
    })

    if (!lines || lines.length === 0) {
      return { revenue: 0, cogs: 0, profit: 0 }
    }

    const accountIds = Array.from(
      new Set(lines.map((l: any) => l.accountId).filter(Boolean))
    )

    let accounts: any[] = []
    if (accountIds.length > 0) {
      accounts = await (db as any).client.Account.findMany({
        where: {
          id: { in: accountIds },
        },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      })
    }

    const accountMap = new Map<string, any>(
      accounts.map((a: any) => [a.id, a])
    )

    console.log('[cashier-dashboard] 💹 Accounts used in profit calculation:', accounts.map((a: any) => ({
      code: a.code,
      name: a.name,
      type: a.type,
    })))

    let revenue = 0
    let cogs = 0

    const forbiddenRevenueNames = [
      'بهای',
      'صندوق',
      'بانک',
      'موجودی',
      'دریافتنی',
      'پرداختنی',
      'چک',
      'خرید',
    ]

    for (const line of lines) {
      const acc = accountMap.get(line.accountId)
      if (!acc) continue

      const code = toEnglishDigits(String(acc.code || ''))
      const name = String(acc.name || '')
      const type = normalizeType(String(acc.type || ''))

      const debit = Number(line.debit || 0)
      const credit = Number(line.credit || 0)

      // ★ اول بهای تمام شده را تشخیص بده
      const isCogsAccount =
        code.startsWith('50') ||
        type.includes('cogs') ||
        type.includes('بهای') ||
        name.includes('بهای تمام شده')

      // ★ درآمد فروش فقط اگر بهای تمام شده نباشد و نامش شبیه حساب صندوق/بانک نباشد
      const looksLikeRevenueName =
        name.includes('فروش') &&
        !forbiddenRevenueNames.some((forbidden) => name.includes(forbidden))

      const isRevenueAccount =
        !isCogsAccount &&
        (
          code.startsWith('41') ||
          type.includes('income') ||
          type.includes('revenue') ||
          type.includes('درآمد') ||
          looksLikeRevenueName
        )

      if (isRevenueAccount) {
        // فروش معمولاً بستانکار است، برگشتی فروش بدهکار
        revenue += credit - debit
      }

      if (isCogsAccount) {
        // بهای تمام شده معمولاً بدهکار است، برگشتی بستانکار
        cogs += debit - credit
      }
    }

    const profit = revenue - cogs

    console.log('[cashier-dashboard] 💹 Profit calculation result:', {
      invoiceCount: invoiceIds.length,
      journalCount: journalEntries.length,
      revenue,
      cogs,
      profit,
    })

    return {
      revenue,
      cogs,
      profit,
    }
  } catch (err) {
    console.warn('[cashier-dashboard] ⚠️ Profit calculation failed:', err)
    return { revenue: 0, cogs: 0, profit: 0 }
  }
}

// ═══════════════════════════════════════════════════════════════
// ★ v12.2.3: موجودی صندوق از اسناد حسابداری
// ═══════════════════════════════════════════════════════════════
async function getJournalCashBalance(
  tenantId: string,
  cashAccountId: string,
  beforeDate?: Date,
  excludeInitialBalance = false
): Promise<number> {
  const entryWhere: any = {
    tenantId,
    status: 'posted',
  }

  if (beforeDate) {
    entryWhere.date = { lt: beforeDate }
  }

  if (excludeInitialBalance) {
    entryWhere.sourceType = { not: 'initial_balance' }
  }

  const entries = await (db as any).client.JournalEntry.findMany({
    where: entryWhere,
    select: { id: true },
  })

  if (!entries || entries.length === 0) return 0

  const entryIds = entries.map((e: any) => e.id)

  const lines = await (db as any).client.JournalEntryLine.findMany({
    where: {
      journalEntryId: { in: entryIds },
      accountId: cashAccountId,
    },
    select: {
      debit: true,
      credit: true,
    },
  })

  return lines.reduce((sum: number, line: any) => {
    return sum + Number(line.debit || 0) - Number(line.credit || 0)
  }, 0)
}

async function getJournalCashFlow(
  tenantId: string,
  cashAccountId: string,
  startDate: Date,
  endDateExclusive: Date,
  excludeInitialBalance = false
): Promise<{ inflow: number; outflow: number }> {
  const entryWhere: any = {
    tenantId,
    status: 'posted',
    date: {
      gte: startDate,
      lt: endDateExclusive,
    },
  }

  if (excludeInitialBalance) {
    entryWhere.sourceType = { not: 'initial_balance' }
  }

  const entries = await (db as any).client.JournalEntry.findMany({
    where: entryWhere,
    select: { id: true },
  })

  if (!entries || entries.length === 0) {
    return { inflow: 0, outflow: 0 }
  }

  const entryIds = entries.map((e: any) => e.id)

  const lines = await (db as any).client.JournalEntryLine.findMany({
    where: {
      journalEntryId: { in: entryIds },
      accountId: cashAccountId,
    },
    select: {
      debit: true,
      credit: true,
    },
  })

  let inflow = 0
  let outflow = 0

  for (const line of lines) {
    inflow += Number(line.debit || 0)
    outflow += Number(line.credit || 0)
  }

  return { inflow, outflow }
}

// ═══════════════════════════════════════════════════════════════
// ★ v12.2.3: تراکنش‌های دستی صندوق
//   فقط از transactionType استفاده می‌کنیم، نه direction/type
// ═══════════════════════════════════════════════════════════════
async function getManualCashBalance(
  tenantId: string,
  beforeDate?: Date
): Promise<{ balance: number; inflow: number; outflow: number }> {
  const movements = await (db as any).client.CashMovement.findMany({
    where: { tenantId },
    select: {
      amount: true,
      transactionType: true,
      createdAt: true,
      invoiceId: true,
    },
  })

  let inflow = 0
  let outflow = 0

  for (const mov of movements) {
    // حرکات مرتبط با فاکتور معمولاً از مسیر InvoicePayment/Journal شمرده شده‌اند
    if (mov.invoiceId) continue

    const direction = getManualMovementDirection(mov.transactionType)
    if (!direction) continue

    if (beforeDate) {
      const createdAt = mov.createdAt ? new Date(mov.createdAt) : null
      if (createdAt && createdAt >= beforeDate) continue
    }

    const amount = Number(mov.amount || 0)
    if (!amount) continue

    if (direction === 'in') {
      inflow += amount
    } else {
      outflow += amount
    }
  }

  return {
    balance: inflow - outflow,
    inflow,
    outflow,
  }
}

async function getManualCashFlow(
  tenantId: string,
  startDate: Date,
  endDateExclusive: Date
): Promise<{ inflow: number; outflow: number }> {
  const movements = await (db as any).client.CashMovement.findMany({
    where: { tenantId },
    select: {
      amount: true,
      transactionType: true,
      createdAt: true,
      invoiceId: true,
    },
  })

  let inflow = 0
  let outflow = 0

  for (const mov of movements) {
    if (mov.invoiceId) continue

    const direction = getManualMovementDirection(mov.transactionType)
    if (!direction) continue

    const createdAt = mov.createdAt ? new Date(mov.createdAt) : null
    if (!createdAt) continue
    if (createdAt < startDate || createdAt >= endDateExclusive) continue

    const amount = Number(mov.amount || 0)
    if (!amount) continue

    if (direction === 'in') {
      inflow += amount
    } else {
      outflow += amount
    }
  }

  return { inflow, outflow }
}

// ═══════════════════════════════════════════════════════════════
// ★ Fallback: اگر حساب صندوق پیدا نشد
// ═══════════════════════════════════════════════════════════════
async function calculateCashBalanceFallback(
  tenantId: string,
  openingBalance: number,
  beforeDate?: Date
): Promise<{
  cashBalance: number
  paymentIn: number
  paymentOut: number
  movementIn: number
  movementOut: number
}> {
  let paymentIn = 0
  let paymentOut = 0
  let movementIn = 0
  let movementOut = 0

  try {
    const payments = await (db as any).client.InvoicePayment.findMany({
      where: { tenantId },
      select: {
        amount: true,
        paymentType: true,
        paidAt: true,
        createdAt: true,
        invoice: {
          select: {
            invoiceType: true,
          },
        },
      },
    })

    for (const payment of payments) {
      const paidDateValue = payment.paidAt || payment.createdAt
      const paidDate = paidDateValue ? new Date(paidDateValue) : null

      if (beforeDate && paidDate && paidDate >= beforeDate) {
        continue
      }

      if (!isCashLikePaymentType(payment.paymentType)) continue

      const amount = Number(payment.amount || 0)
      if (!amount) continue

      const invoiceType = normalizeType(payment.invoice?.invoiceType)

      if (isPurchaseInvoiceType(invoiceType)) {
        paymentOut += amount
      } else if (isReturnInvoiceType(invoiceType)) {
        paymentOut += amount
      } else {
        paymentIn += amount
      }
    }
  } catch (err) {
    console.warn('[cashier-dashboard] ⚠️ Fallback InvoicePayment query failed:', (err as any)?.message)
  }

  try {
    const movements = await (db as any).client.CashMovement.findMany({
      where: { tenantId },
      select: {
        amount: true,
        transactionType: true,
        createdAt: true,
        invoiceId: true,
      },
    })

    for (const mov of movements) {
      if (mov.invoiceId) continue

      const direction = getManualMovementDirection(mov.transactionType)
      if (!direction) continue

      if (beforeDate) {
        const createdAt = mov.createdAt ? new Date(mov.createdAt) : null
        if (createdAt && createdAt >= beforeDate) continue
      }

      const amount = Number(mov.amount || 0)
      if (!amount) continue

      if (direction === 'in') {
        movementIn += amount
      } else {
        movementOut += amount
      }
    }
  } catch (err) {
    console.warn('[cashier-dashboard] ⚠️ Fallback CashMovement query failed:', (err as any)?.message)
  }

  const cashBalance =
    openingBalance +
    paymentIn -
    paymentOut +
    movementIn -
    movementOut

  return {
    cashBalance,
    paymentIn,
    paymentOut,
    movementIn,
    movementOut,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cashierId = searchParams.get('cashierId')
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const tenantId = searchParams.get('tenantId')

    if (!cashierId || !tenantId) {
      return NextResponse.json(
        { success: false, error: 'cashierId and tenantId are required' },
        { status: 400 }
      )
    }

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const tomorrow = new Date(startOfDay)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // ═══════════════════════════════════════════════════════════════
    // آمار اولیه
    // ═══════════════════════════════════════════════════════════════
    const stats = {
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      installmentSales: 0,
      installmentPrepaid: 0,
      installmentRemaining: 0,
      checkSales: 0,
      totalSales: 0,
      invoicesCount: 0,
      totalCashIn: 0,
      totalCashOut: 0,
    }

    // ═══════════════════════════════════════════════════════════════
    // گرفتن فاکتورهای امروز (فقط فاکتورهای این صندوق‌دار)
    // ═══════════════════════════════════════════════════════════════
    let invoices: any[] = []
    try {
      invoices = await (db as any).client.Invoice.findMany({
        where: {
          tenantId,
          cashierId,
          createdAt: { gte: startOfDay, lte: endOfDay },
          status: { not: 'cancelled' },
        },
        select: {
          id: true,
          paymentType: true,
          totalAmount: true,
          paidAmount: true,
          invoiceType: true,
        },
      })
    } catch (err) {
      console.error('[cashier-dashboard] Invoice query failed:', err)
    }

    const returnStats = {
      count: 0,
      totalAmount: 0,
    }

    const todaySalesInvoiceIds: string[] = []

    // ═══════════════════════════════════════════════════════════════
    // گروه‌بندی فاکتورها
    // ═══════════════════════════════════════════════════════════════
    invoices.forEach((inv: any) => {
      const amount = Number(inv.totalAmount || 0)
      const paidAmount = Number(inv.paidAmount || 0)
      const invoiceType = normalizeType(inv.invoiceType)

      if (isReturnInvoiceType(invoiceType)) {
        returnStats.count += 1
        returnStats.totalAmount += amount

        if (inv.id) todaySalesInvoiceIds.push(inv.id)

        console.log('[cashier-dashboard] 🔄 Return invoice detected:', {
          id: inv.id,
          amount,
          invoiceType,
        })
        return
      }

      if (isPurchaseInvoiceType(invoiceType)) {
        return
      }

      stats.totalSales += amount
      stats.invoicesCount += 1

      if (inv.id) todaySalesInvoiceIds.push(inv.id)

      const pType = normalizeType(inv.paymentType)

      switch (pType) {
        case 'cash':
        case 'نقدی':
          stats.cashSales += amount
          break
        case 'card':
        case 'pos':
        case 'کارتخوان':
          stats.cardSales += amount
          break
        case 'credit':
        case 'نسیه':
          stats.creditSales += amount
          break
        case 'installment':
        case 'قسطی':
        case 'اقساطی':
          stats.installmentPrepaid += paidAmount
          stats.installmentRemaining += amount - paidAmount
          stats.cashSales += paidAmount
          stats.installmentSales += amount - paidAmount

          console.log('[cashier-dashboard] 📅 Installment invoice split:', {
            id: inv.id,
            totalAmount: amount,
            prepaid: paidAmount,
            remaining: amount - paidAmount,
          })
          break
        case 'check':
        case 'cheque':
        case 'چک':
          stats.checkSales += amount
          break
        default:
          stats.cashSales += amount
      }
    })

    console.log('[cashier-dashboard] 📊 Invoice stats:', {
      totalSales: stats.totalSales,
      returns: returnStats.totalAmount,
      returnsCount: returnStats.count,
      netSales: stats.totalSales - returnStats.totalAmount,
      cashSales: stats.cashSales,
      installmentPrepaid: stats.installmentPrepaid,
      installmentRemaining: stats.installmentRemaining,
      creditSales: stats.creditSales,
      checkSales: stats.checkSales,
    })

    // ═══════════════════════════════════════════════════════════════
    // ★ محاسبه سود امروز و سود کل صندوق‌دار
    // ═══════════════════════════════════════════════════════════════
    let profitToday = { revenue: 0, cogs: 0, profit: 0 }
    let profitTotal = { revenue: 0, cogs: 0, profit: 0 }

    try {
      profitToday = await calculateProfitForInvoiceIds(
        tenantId,
        todaySalesInvoiceIds
      )

      const allCashierInvoices = await (db as any).client.Invoice.findMany({
        where: {
          tenantId,
          cashierId,
          status: { not: 'cancelled' },
        },
        select: {
          id: true,
          invoiceType: true,
        },
      })

      const allSalesInvoiceIds = allCashierInvoices
        .filter((inv: any) => isSalesRelatedInvoiceType(inv.invoiceType))
        .map((inv: any) => inv.id)
        .filter(Boolean)

      profitTotal = await calculateProfitForInvoiceIds(
        tenantId,
        allSalesInvoiceIds
      )

      console.log('[cashier-dashboard] 💹 Profit:', {
        profitToday,
        profitTotal,
      })
    } catch (err) {
      console.warn('[cashier-dashboard] ⚠️ Profit query failed:', err)
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ پیدا کردن حساب صندوق
    // ═══════════════════════════════════════════════════════════════
    let cashAccountId: string | null = null

    try {
      const cashAccount = await (db as any).client.Account.findFirst({
        where: {
          tenantId,
          OR: [
            { code: { startsWith: '101' } },
            { name: { contains: 'صندوق' } },
            { code: '1010' },
          ],
        },
        orderBy: { code: 'asc' },
      })

      if (cashAccount) {
        cashAccountId = cashAccount.id
        console.log('[cashier-dashboard] 💰 Cash account found:', {
          id: cashAccount.id,
          code: cashAccount.code,
          name: cashAccount.name,
        })
      } else {
        console.warn('[cashier-dashboard] ⚠️ Cash account not found')
      }
    } catch (err) {
      console.warn('[cashier-dashboard] ⚠️ Cash account query failed:', (err as any)?.message)
    }

    // ═══════════════════════════════════════════════════════════════
    // دریافت openingBalance برای نمایش
    // ═══════════════════════════════════════════════════════════════
    let openingBalance = 0

    try {
      const opening = await (db as any).client.CashMovement.findFirst({
        where: { cashierId, tenantId, transactionType: 'opening_balance' },
        orderBy: { createdAt: 'desc' },
      })
      if (opening) {
        openingBalance = Number(opening?.amount || 0)
        console.log('[cashier-dashboard] ✅ openingBalance from CashMovement:', openingBalance)
      }
    } catch (err) {
      console.warn(
        '[cashier-dashboard] CashMovement opening_balance query failed:',
        (err as any)?.message
      )
    }

    if (openingBalance === 0) {
      try {
        const cashBalances = await (db as any).client.InitialBalance.findMany({
          where: { tenantId, type: 'cash', isPosted: true },
          orderBy: { createdAt: 'desc' },
        })

        console.log('[cashier-dashboard] 🔍 InitialBalance with type=cash found:', cashBalances.length)

        if (cashBalances && cashBalances.length > 0) {
          openingBalance = cashBalances.reduce((sum: number, record: any) => {
            return sum + Number(record.amount || 0)
          }, 0)
          console.log('[cashier-dashboard] ✅ openingBalance from InitialBalance (type=cash):', openingBalance)
        }
      } catch (err) {
        console.warn('[cashier-dashboard] InitialBalance query failed:', (err as any)?.message)
      }
    }

    if (openingBalance === 0) {
      try {
        const cashBalances = await (db as any).client.InitialBalance.findMany({
          where: { tenantId, type: 'cash' },
          orderBy: { createdAt: 'desc' },
        })

        if (cashBalances && cashBalances.length > 0) {
          openingBalance = cashBalances.reduce((sum: number, record: any) => {
            return sum + Number(record.amount || 0)
          }, 0)
          console.log('[cashier-dashboard] ✅ openingBalance from InitialBalance (no filter):', openingBalance)
        }
      } catch (err) {
        console.warn('[cashier-dashboard] InitialBalance (no filter) query failed:', (err as any)?.message)
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v12.2.3: محاسبه موجودی صندوق
    //   اصلی: از اسناد حسابداری حساب صندوق
    //   مکمل: تراکنش‌های دستی واریز/برداشت/هزینه
    //   افتتاحیه: از InitialBalance به عنوان موجودی اولیه اضافه می‌شود
    //   و اسناد initial_balance از عملیات امروز مستثنی می‌شوند
    // ═══════════════════════════════════════════════════════════════
    let startOfDayBalance = 0
    let currentBalance = 0
    let totalCashIn = 0
    let totalCashOut = 0

    if (cashAccountId) {
      const [
        journalOpsAll,
        journalOpsBefore,
        manualAll,
        manualBefore,
        journalTodayFlow,
        manualTodayFlow,
      ] = await Promise.all([
        getJournalCashBalance(tenantId, cashAccountId, undefined, true),
        getJournalCashBalance(tenantId, cashAccountId, startOfDay, true),
        getManualCashBalance(tenantId, undefined),
        getManualCashBalance(tenantId, startOfDay),
        getJournalCashFlow(tenantId, cashAccountId, startOfDay, tomorrow, true),
        getManualCashFlow(tenantId, startOfDay, tomorrow),
      ])

      currentBalance = openingBalance + journalOpsAll + manualAll.balance
      startOfDayBalance = openingBalance + journalOpsBefore + manualBefore.balance

      totalCashIn = journalTodayFlow.inflow + manualTodayFlow.inflow
      totalCashOut = journalTodayFlow.outflow + manualTodayFlow.outflow

      console.log('[cashier-dashboard] 🧾 Journal-based cash balance:', {
        cashAccountId,
        openingBalance,
        journalOpsAll,
        journalOpsBefore,
        manualAllBalance: manualAll.balance,
        manualBeforeBalance: manualBefore.balance,
        startOfDayBalance,
        currentBalance,
        totalCashIn,
        totalCashOut,
      })
    } else {
      const startFallback = await calculateCashBalanceFallback(
        tenantId,
        openingBalance,
        startOfDay
      )
      const currentFallback = await calculateCashBalanceFallback(
        tenantId,
        openingBalance
      )

      startOfDayBalance = startFallback.cashBalance
      currentBalance = currentFallback.cashBalance

      totalCashIn =
        (currentFallback.paymentIn - startFallback.paymentIn) +
        (currentFallback.movementIn - startFallback.movementIn)

      totalCashOut =
        (currentFallback.paymentOut - startFallback.paymentOut) +
        (currentFallback.movementOut - startFallback.movementOut)

      console.log('[cashier-dashboard] ⚠️ Using fallback cash balance:', {
        openingBalance,
        startOfDayBalance,
        currentBalance,
        totalCashIn,
        totalCashOut,
      })
    }

    // اگر افتتاحیه از منابع قبلی پیدا نشد ولی موجودی ابتدای روز داشتیم، برای نمایش استفاده کن
    if (openingBalance === 0 && startOfDayBalance > 0) {
      openingBalance = startOfDayBalance
      console.log('[cashier-dashboard] ✅ openingBalance fallback to startOfDayBalance:', openingBalance)
    }

    stats.totalCashIn = totalCashIn
    stats.totalCashOut = totalCashOut

    // ═══════════════════════════════════════════════════════════════
    // لاگ نهایی
    // ═══════════════════════════════════════════════════════════════
    console.log('[cashier-dashboard] 📊 Final summary:', {
      tenantId,
      cashierId,
      date,
      openingBalance,
      startOfDayBalance,
      currentBalance,
      totalSales: stats.totalSales,
      returns: returnStats.totalAmount,
      returnsCount: returnStats.count,
      netSales: stats.totalSales - returnStats.totalAmount,
      cashSales: stats.cashSales,
      cardSales: stats.cardSales,
      creditSales: stats.creditSales,
      installmentSales: stats.installmentSales,
      installmentPrepaid: stats.installmentPrepaid,
      installmentRemaining: stats.installmentRemaining,
      checkSales: stats.checkSales,
      totalCashIn: stats.totalCashIn,
      totalCashOut: stats.totalCashOut,
      profitToday: profitToday.profit,
      profitTotal: profitTotal.profit,
    })

    return NextResponse.json({
      success: true,
      summary: {
        cashSales: stats.cashSales,
        cardSales: stats.cardSales,
        creditSales: stats.creditSales,
        installmentSales: stats.installmentSales,
        installmentPrepaid: stats.installmentPrepaid,
        installmentRemaining: stats.installmentRemaining,
        checkSales: stats.checkSales,
        totalSales: stats.totalSales,
        returns: returnStats.totalAmount,
        returnsCount: returnStats.count,
        netSales: stats.totalSales - returnStats.totalAmount,
        invoicesCount: stats.invoicesCount,
        totalCashIn: stats.totalCashIn,
        totalCashOut: stats.totalCashOut,
        openingBalance,
        startOfDayBalance,
        currentBalance,
        realCashBalance: currentBalance,
        isMultiCashier: true,

        revenueToday: profitToday.revenue,
        cogsToday: profitToday.cogs,
        profitToday: profitToday.profit,

        revenueTotal: profitTotal.revenue,
        cogsTotal: profitTotal.cogs,
        profitTotal: profitTotal.profit,
      },
    })
  } catch (error: any) {
    console.error('[API] cashier-dashboard error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}