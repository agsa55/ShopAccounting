import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const tenantId = searchParams.get('tenantId') || 'demo'

    // Default to last 7 days if no dates provided
    const endDate = to ? new Date(to) : new Date()
    const startDate = from ? new Date(from) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)

    endDate.setHours(23, 59, 59, 999)
    startDate.setHours(0, 0, 0, 0)

    const invoices = await db.invoice.findMany({
      where: {
        tenantId,
        status: { notIn: ['Cancelled'] },
        invoiceDate: { gte: startDate, lte: endDate },
      },
      include: {
        customer: true,
        payments: true,
      },
      orderBy: { invoiceDate: 'asc' },
    })

    // Group by date
    const dailyMap = new Map<string, {
      date: string
      cash: number
      credit: number
      card: number
      installment: number
      total: number
      invoiceCount: number
    }>()

    // Initialize all dates in range
    const current = new Date(startDate)
    while (current <= endDate) {
      const key = current.toISOString().split('T')[0]
      dailyMap.set(key, {
        date: key,
        cash: 0,
        credit: 0,
        card: 0,
        installment: 0,
        total: 0,
        invoiceCount: 0,
      })
      current.setDate(current.getDate() + 1)
    }

    // Aggregate
    for (const inv of invoices) {
      const key = new Date(inv.invoiceDate).toISOString().split('T')[0]
      const day = dailyMap.get(key)
      if (day) {
        day.total += inv.totalAmount
        day.invoiceCount++

        switch (inv.paymentType) {
          case 'Cash':
            day.cash += inv.totalAmount
            break
          case 'Credit':
            day.credit += inv.totalAmount
            break
          case 'Card':
            day.card += inv.totalAmount
            break
          case 'Installment':
            day.installment += inv.totalAmount
            break
          case 'Mixed':
            day.cash += inv.paidAmount
            day.credit += inv.remainingAmount
            break
        }
      }
    }

    const dailyData = Array.from(dailyMap.values())

    // Calculate totals
    const totals = {
      cash: dailyData.reduce((sum, d) => sum + d.cash, 0),
      credit: dailyData.reduce((sum, d) => sum + d.credit, 0),
      card: dailyData.reduce((sum, d) => sum + d.card, 0),
      installment: dailyData.reduce((sum, d) => sum + d.installment, 0),
      total: dailyData.reduce((sum, d) => sum + d.total, 0),
      invoiceCount: dailyData.reduce((sum, d) => sum + d.invoiceCount, 0),
    }

    return NextResponse.json({
      success: true,
      data: {
        daily: dailyData,
        totals,
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
      },
    })
  } catch (error) {
    console.error('Daily sales report error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
