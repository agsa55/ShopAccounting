import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    // آمار اولیه
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

    // ★ گرفتن همه فاکتورهای امروز
    let invoices: any[] = []
    try {
      invoices = await (db as any).client.Invoice.findMany({
        where: {
          tenantId,
          cashierId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: { not: 'cancelled' },
        },
        select: {
          id: true,
          paymentType: true,
          totalAmount: true,
          paidAmount: true,
        },
      })
    } catch (err) {
      console.error('[cashier-dashboard] Invoice query failed:', err)
    }

    // گروه‌بندی فاکتورها بر اساس نوع پرداخت
    invoices.forEach((inv: any) => {
      const amount = Number(inv.totalAmount || 0)
      stats.totalSales += amount
      stats.invoicesCount += 1

      const pType = (inv.paymentType || '').toLowerCase()
      switch (pType) {
        case 'cash':
          stats.cashSales += amount
          break
        case 'card':
        case 'pos':
          stats.cardSales += amount
          break
        case 'credit':
          stats.creditSales += amount
          break
        case 'installment':
          stats.installmentSales += amount
          break
        case 'check':
          stats.checkSales += amount
          break
        default:
          // اگر paymentType مشخص نبود، پیش‌فرض نقدی
          stats.cashSales += amount
      }
    })

    // ★ گرفتن تراکنش‌های نقدی امروز (اختیاری - اگر جدول وجود داشت)
    try {
      const cashMovements = await (db as any).client.CashMovement.findMany({
        where: {
          cashierId,
          tenantId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      })

      cashMovements.forEach((mov: any) => {
        const amount = Number(mov.amount || 0)
        if (mov.direction === 'in' || mov.type === 'in') {
          stats.totalCashIn += amount
        } else if (mov.direction === 'out' || mov.type === 'out') {
          stats.totalCashOut += amount
        }
      })
    } catch (err) {
      // جدول CashMovement وجود ندارد یا خطا داد - بدون خطا ادامه بده
      console.warn('[cashier-dashboard] CashMovement table not available:', (err as any)?.message)
    }

    // ★ گرفتن موجودی اولیه (اختیاری)
    let openingBalance = 0
    let startOfDayBalance = 0
    
    try {
      const opening = await (db as any).client.CashMovement.findFirst({
        where: {
          cashierId,
          tenantId,
          transactionType: 'opening_balance',
        },
        orderBy: { createdAt: 'desc' },
      })
      openingBalance = Number(opening?.amount || 0)

      const lastClosing = await (db as any).client.CashMovement.findFirst({
        where: {
          cashierId,
          tenantId,
          transactionType: 'closing_balance',
          createdAt: { lt: startOfDay },
        },
        orderBy: { createdAt: 'desc' },
      })
      startOfDayBalance = Number(lastClosing?.amount || 0)
    } catch (err) {
      console.warn('[cashier-dashboard] Balance query failed:', (err as any)?.message)
    }

    return NextResponse.json({
      success: true,
      summary: {
        // آمار فاکتورها
        cashSales: stats.cashSales,
        cardSales: stats.cardSales,
        creditSales: stats.creditSales,
        installmentSales: stats.installmentSales,
        checkSales: stats.checkSales,
        totalSales: stats.totalSales,
        invoicesCount: stats.invoicesCount,
        
        // آمار نقدی
        totalCashIn: stats.totalCashIn,
        totalCashOut: stats.totalCashOut,
        
        // موجودی‌ها
        openingBalance,
        startOfDayBalance,
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