import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================================
// src/app/api/cashier-dashboard/route.ts — v12.0.1
// ★ v12.0.1: رفع مشکل دوبار شمردن فروش نقدی
//   - startOfDayBalance و currentBalance هر دو از یک تابع یکپارچه
//   - محاسبه جریان نقدی امروز از تفاضل دو موجودی
// ★ v12.0.0: پشتیبانی از چند صندوق‌دار (بدون نیاز به شیفت)
//   - موجودی واقعی صندوق: مستقل از صندوق‌دار و زمان
//   - آمار فروش: مختص صندوق‌دار فعلی
// ★ v11.9.11: CashMovements با فیلتر JavaScript + لاگ تشخیصی
// ★ v11.9.10: استفاده از InvoicePayment برای ورودی‌های صندوق (رفع باگ پلن پایه)
// ★ v11.9.8: تشخیص و محاسبه فاکتورهای برگشتی
// ★ v11.9.7: محاسبه موجودی صندوق از تراکنش‌ها
// ★ v11.9.5: دریافت openingBalance از InitialBalance (type=cash)
// ============================================================================

// ═══════════════════════════════════════════════════════════════
// ★ v12.0.1: تابع کمکی برای محاسبه موجودی صندوق تا یک تاریخ مشخص
//   بدون پارامتر قبل از تاریخ = موجودی فعلی واقعی
//   با پارامتر قبل از تاریخ = موجودی ابتدای روز (یا هر لحظه مشخص)
//   همه تراکنش‌ها، همه صندوق‌داران (مناسب برای چند صندوق‌داری)
// ═══════════════════════════════════════════════════════════════
async function calculateCashBalanceAtDate(
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

  // ─── بخش ۱: InvoicePayment ها (همه صندوق‌داران) ───
  try {
    const paymentWhere: any = {
      tenantId,
      paymentType: 'cash',
    }
    
    if (beforeDate) {
      paymentWhere.paidAt = { lt: beforeDate }
    }

    const payments = await (db as any).client.InvoicePayment.findMany({
      where: paymentWhere,
      select: {
        amount: true,
        invoice: {
          select: { invoiceType: true, number: true },
        },
      },
    })

    for (const payment of payments) {
      const amount = Number(payment.amount || 0)
      const invoiceType = (payment.invoice?.invoiceType || 'sale').toLowerCase()

      if (
        invoiceType === 'sale_return' ||
        invoiceType === 'return' ||
        invoiceType === 'برگشتی' ||
        invoiceType === 'return_sale'
      ) {
        // برگشتی = خروجی از صندوق
        paymentOut += amount
      } else {
        paymentIn += amount
      }
    }

    console.log('[cashier-dashboard] 💰 InvoicePayments:', {
      filter: beforeDate ? `before ${beforeDate.toISOString().split('T')[0]}` : 'all-time',
      count: payments.length,
      in: paymentIn,
      out: paymentOut,
    })
  } catch (err) {
    console.warn(
      '[cashier-dashboard] ⚠️ InvoicePayment query failed:',
      (err as any)?.message
    )
  }

  // ─── بخش ۲: CashMovement ها (همه صندوق‌داران) ───
  try {
    const movementWhere: any = { tenantId }
    
    if (beforeDate) {
      movementWhere.createdAt = { lt: beforeDate }
    }

    const movementsRaw = await (db as any).client.CashMovement.findMany({
      where: movementWhere,
    })

    // ★ استفاده از همان لیست نادیده‌ها که در v11.9.11 استفاده شد
      const ignoredTypes = ['opening_balance', 'installment_payment', 'installment']

    const movements = movementsRaw.filter((mov: any) => {
      const tt = (mov.transactionType || '').toLowerCase().trim()
      
      // نادیده گرفتن انواع خاص
      if (ignoredTypes.includes(tt)) return false
      
      // ★ v12.0.2: نادیده گرفتن حرکات مربوط به فاکتور
      // چون اینها در InvoicePayment شمرده می‌شوند و دوبار شمردن می‌شود
      if (mov.invoiceId) return false
      
      return true
    })
    
    for (const mov of movements) {
      const amount = Number(mov.amount || 0)
      const direction = (mov.direction || mov.type || '').toLowerCase()

      if (direction === 'in') {
        movementIn += amount
      } else if (direction === 'out') {
        movementOut += amount
      }
    }

    console.log('[cashier-dashboard] 💰 CashMovements:', {
      filter: beforeDate ? `before ${beforeDate.toISOString().split('T')[0]}` : 'all-time',
      rawCount: movementsRaw.length,
      filteredCount: movements.length,
      in: movementIn,
      out: movementOut,
    })
  } catch (err) {
    console.warn(
      '[cashier-dashboard] ⚠️ CashMovement query failed:',
      (err as any)?.message
    )
  }

  // ─── محاسبه نهایی موجودی ───
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

    // ═══════════════════════════════════════════════════════════════
    // آمار اولیه
    // ═══════════════════════════════════════════════════════════════
    const stats = {
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      installmentSales: 0,
      checkSales: 0,
      totalSales: 0,
      invoicesCount: 0,
      totalCashIn: 0,
      totalCashOut: 0,
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ گرفتن فاکتورهای امروز (فقط فاکتورهای این صندوق‌دار)
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
          invoiceType: true, // ★ v11.9.8: برای تشخیص برگشتی
        },
      })
    } catch (err) {
      console.error('[cashier-dashboard] Invoice query failed:', err)
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.9.8: آمار برگشتی‌ها را جداگانه نگه می‌داریم
    // ═══════════════════════════════════════════════════════════════
    const returnStats = {
      count: 0,
      totalAmount: 0,
    }

    // گروه‌بندی فاکتورها بر اساس نوع پرداخت
    invoices.forEach((inv: any) => {
      const amount = Number(inv.totalAmount || 0)
      const invoiceType = (inv.invoiceType || 'sale').toLowerCase().trim()

      // ★ v11.9.8: فاکتورهای برگشتی را جداگانه مدیریت کن
      if (
        invoiceType === 'sale_return' ||
        invoiceType === 'return' ||
        invoiceType === 'برگشتی' ||
        invoiceType === 'return_sale'
      ) {
        returnStats.count += 1
        returnStats.totalAmount += amount
        console.log('[cashier-dashboard] 🔄 Return invoice detected:', {
          id: inv.id,
          amount,
          invoiceType,
        })
        return // از پردازش عادی صرف‌نظر کن
      }

      // فاکتورهای عادی فروش
      stats.totalSales += amount
      stats.invoicesCount += 1

      const pType = (inv.paymentType || '').toLowerCase()
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
          stats.installmentSales += amount
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
    })

    // ═══════════════════════════════════════════════════════════════
    // ★ دریافت openingBalance از InitialBalance (type = 'cash')
    // ═══════════════════════════════════════════════════════════════
    let openingBalance = 0

    // منبع ۱: CashMovement با opening_balance
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

    // منبع ۲: InitialBalance با type = 'cash' و isPosted = true
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

    // منبع ۳: بدون فیلتر isPosted
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
    // ★ پیدا کردن حساب صندوق (برای سازگاری و گزارش‌دهی)
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
    // ★ v12.0.1: محاسبه موجودی ابتدای روز
    //   = افتتاحیه + تراکنش‌های قبل از امروز
    //   مناسب برای چند صندوق‌داری (همه صندوق‌داران لحاظ می‌شوند)
    // ═══════════════════════════════════════════════════════════════
    const startOfDayData = await calculateCashBalanceAtDate(tenantId, openingBalance, startOfDay)
    const startOfDayBalance = startOfDayData.cashBalance

    console.log('[cashier-dashboard] ✅ startOfDayBalance calculated:', {
      openingBalance,
      paymentInBefore: startOfDayData.paymentIn,
      paymentOutBefore: startOfDayData.paymentOut,
      movementInBefore: startOfDayData.movementIn,
      movementOutBefore: startOfDayData.movementOut,
      startOfDayBalance,
    })

    // ═══════════════════════════════════════════════════════════════
    // ★ v12.0.1: محاسبه موجودی فعلی واقعی
    //   = افتتاحیه + همه تراکنش‌ها (مستقل از صندوق‌دار و زمان)
    //   این مقدار برای همه صندوق‌داران یکسان است
    // ═══════════════════════════════════════════════════════════════
    const currentData = await calculateCashBalanceAtDate(tenantId, openingBalance)
    const currentBalance = currentData.cashBalance

    console.log('[cashier-dashboard] 💰 Current Balance (real, multi-cashier):', {
      openingBalance,
      allTimePaymentIn: currentData.paymentIn,
      allTimePaymentOut: currentData.paymentOut,
      allTimeMovementIn: currentData.movementIn,
      allTimeMovementOut: currentData.movementOut,
      currentBalance,
    })

    // ═══════════════════════════════════════════════════════════════
    // ★ v12.0.1: محاسبه جریان نقدی امروز
    //   = تفاضل موجودی فعلی و موجودی ابتدای روز
    //   این مقدار فقط برای گزارش‌دهی است (در محاسبه موجودی استفاده نمی‌شود)
    // ═══════════════════════════════════════════════════════════════
    const totalCashIn = 
      (currentData.paymentIn - startOfDayData.paymentIn) +
      (currentData.movementIn - startOfDayData.movementIn)
    const totalCashOut = 
      (currentData.paymentOut - startOfDayData.paymentOut) +
      (currentData.movementOut - startOfDayData.movementOut)

    console.log('[cashier-dashboard] 💰 Today cash flow:', {
      totalCashIn,
      totalCashOut,
      netChange: totalCashIn - totalCashOut,
    })

    // ★ به‌روزرسانی stats با داده‌های دقیق
    stats.totalCashIn = totalCashIn
    stats.totalCashOut = totalCashOut

    // ═══════════════════════════════════════════════════════════════
    // ★ لاگ نهایی
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
      creditSales: stats.creditSales,
      installmentSales: stats.installmentSales,
      checkSales: stats.checkSales,
      totalCashIn: stats.totalCashIn,
      totalCashOut: stats.totalCashOut,
    })

    return NextResponse.json({
      success: true,
      summary: {
        cashSales: stats.cashSales,
        cardSales: stats.cardSales,
        creditSales: stats.creditSales,
        installmentSales: stats.installmentSales,
        checkSales: stats.checkSales,
        totalSales: stats.totalSales,
        // ★ v11.9.8: فیلدهای برگشتی
        returns: returnStats.totalAmount,
        returnsCount: returnStats.count,
        netSales: stats.totalSales - returnStats.totalAmount,
        invoicesCount: stats.invoicesCount,
        totalCashIn: stats.totalCashIn,
        totalCashOut: stats.totalCashOut,
        openingBalance,
        startOfDayBalance,
        currentBalance,
        // ★ v12.0.0: فیلدهای جدید برای چند صندوق‌داری
        realCashBalance: currentBalance,
        isMultiCashier: true,
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