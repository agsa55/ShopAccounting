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
          stats.cashSales += amount
      }
    })

    // ★ گرفتن تراکنش‌های نقدی امروز
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
      console.warn('[cashier-dashboard] CashMovement table not available:', (err as any)?.message)
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.9.5: دریافت موجودی اولیه از InitialBalance با type = 'cash'
    // ═══════════════════════════════════════════════════════════════
    let openingBalance = 0
    let startOfDayBalance = 0
    
    // ─── منبع ۱: جدول CashMovement با opening_balance ───
    try {
      const opening = await (db as any).client.CashMovement.findFirst({
        where: {
          cashierId,
          tenantId,
          transactionType: 'opening_balance',
        },
        orderBy: { createdAt: 'desc' },
      })
      if (opening) {
        openingBalance = Number(opening?.amount || 0)
        console.log('[cashier-dashboard] ✅ openingBalance from CashMovement:', openingBalance)
      }
    } catch (err) {
      console.warn('[cashier-dashboard] CashMovement opening_balance query failed:', (err as any)?.message)
    }

    // ─── منبع ۲: جدول InitialBalance با type = 'cash' ───
    if (openingBalance === 0) {
      try {
        // ★ v11.9.5: فیلتر بر اساس type = 'cash'
        // می‌تواند چند رکورد با type='cash' وجود داشته باشد، همه را جمع می‌کنیم
        const cashBalances = await (db as any).client.InitialBalance.findMany({
          where: {
            tenantId,
            type: 'cash',
            isPosted: true, // فقط سندهای posted
          },
          orderBy: { createdAt: 'desc' },
        })
        
        console.log('[cashier-dashboard] 🔍 InitialBalance with type=cash found:', cashBalances.length)
        
        if (cashBalances && cashBalances.length > 0) {
          // مجموع همه رکوردهای نقدی
          openingBalance = cashBalances.reduce((sum: number, record: any) => {
            return sum + Number(record.amount || 0)
          }, 0)
          
          console.log('[cashier-dashboard] ✅ openingBalance from InitialBalance (type=cash):', openingBalance)
          console.log('[cashier-dashboard] 📋 Cash records:', cashBalances.map((r: any) => ({
            id: r.id,
            title: r.title,
            amount: r.amount,
            type: r.type,
            isPosted: r.isPosted,
          })))
        }
      } catch (err) {
        console.warn('[cashier-dashboard] InitialBalance query failed:', (err as any)?.message)
      }
    }

    // ─── منبع ۳: اگر posted نبود، بدون فیلتر isPosted امتحان کن ───
    if (openingBalance === 0) {
      try {
        const cashBalances = await (db as any).client.InitialBalance.findMany({
          where: {
            tenantId,
            type: 'cash',
          },
          orderBy: { createdAt: 'desc' },
        })
        
        console.log('[cashier-dashboard] 🔍 InitialBalance (any status) with type=cash:', cashBalances.length)
        
        if (cashBalances && cashBalances.length > 0) {
          openingBalance = cashBalances.reduce((sum: number, record: any) => {
            return sum + Number(record.amount || 0)
          }, 0)
          
          console.log('[cashier-dashboard] ✅ openingBalance from InitialBalance (no isPosted filter):', openingBalance)
        }
      } catch (err) {
        console.warn('[cashier-dashboard] InitialBalance (no filter) query failed:', (err as any)?.message)
      }
    }

    // ─── منبع ۴: همه type ها را بخوان و cash را پیدا کن ───
    if (openingBalance === 0) {
      try {
        const allBalances = await (db as any).client.InitialBalance.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        })
        
        console.log('[cashier-dashboard] 🔍 All InitialBalances:', allBalances.length)
        console.log('[cashier-dashboard] 📋 All records:', allBalances.map((r: any) => ({
          type: r.type,
          title: r.title,
          amount: r.amount,
        })))
        
        const cashBalances = allBalances.filter((r: any) => 
          r.type === 'cash' || r.type === 'صندوق' || r.type?.toLowerCase().includes('cash')
        )
        
        if (cashBalances.length > 0) {
          openingBalance = cashBalances.reduce((sum: number, record: any) => {
            return sum + Number(record.amount || 0)
          }, 0)
          console.log('[cashier-dashboard] ✅ openingBalance from all records (filtered):', openingBalance)
        }
      } catch (err) {
        console.warn('[cashier-dashboard] All InitialBalances query failed:', (err as any)?.message)
      }
    }

    // ─── محاسبه startOfDayBalance ───
    try {
      const lastClosing = await (db as any).client.CashMovement.findFirst({
        where: {
          cashierId,
          tenantId,
          transactionType: 'closing_balance',
          createdAt: { lt: startOfDay },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (lastClosing) {
        startOfDayBalance = Number(lastClosing.amount || 0)
      } else if (openingBalance > 0) {
        startOfDayBalance = openingBalance
      }
    } catch (err) {
      console.warn('[cashier-dashboard] closing_balance query failed:', (err as any)?.message)
    }

    // ★ لاگ نهایی
    console.log('[cashier-dashboard] 📊 Final summary:', {
      tenantId,
      cashierId,
      date,
      openingBalance,
      startOfDayBalance,
      totalSales: stats.totalSales,
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
        invoicesCount: stats.invoicesCount,
        totalCashIn: stats.totalCashIn,
        totalCashOut: stats.totalCashOut,
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