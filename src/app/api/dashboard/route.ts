// ============================================================================
// src/app/api/dashboard/route.ts — GET /api/dashboard (v3.1)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.1:
//   ★ baseWhere همیشه { tenantId } — حذف isIsolated
//   ★ فیلتر tenantId روی تمام query ها
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('dashboard')(async (request: NextRequest, _context: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★★★ v3.1: همیشه با tenantId فیلتر بشه
    const baseWhere = { tenantId }

    // ─── بازه‌های تاریخی ───
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)

    // ─── فروش امروز ───
    let todaySales = 0
    let todayInvoiceCount = 0
    let todayCash = 0
    let todayOnline = 0

    try {
      const todayInvoices = await tenantDb.invoice.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['Cancelled', 'cancelled'] },
          invoiceDate: { gte: todayStart, lte: todayEnd },
        },
      })

      todaySales = todayInvoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0)
      todayInvoiceCount = todayInvoices.length
      todayCash = todayInvoices
        .filter((inv: any) => inv.paymentType === 'cash' || inv.paymentType === 'Cash')
        .reduce((sum: number, inv: any) => sum + (inv.paidAmount || 0), 0)
      todayOnline = todayInvoices
        .filter((inv: any) => inv.paymentType === 'card' || inv.paymentType === 'Card' || inv.paymentType === 'Mixed')
        .reduce((sum: number, inv: any) => sum + (inv.paidAmount || 0), 0)
    } catch (err: any) {
      console.warn('[Dashboard] Today sales query error:', err?.message)
    }

    // ─── فروش ماهانه ───
    let monthSales = 0
    let monthInvoiceCount = 0

    try {
      const monthInvoices = await tenantDb.invoice.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['Cancelled', 'cancelled'] },
          invoiceDate: { gte: monthStart, lte: monthEnd },
        },
      })

      monthSales = monthInvoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0)
      monthInvoiceCount = monthInvoices.length
    } catch (err: any) {
      console.warn('[Dashboard] Monthly sales query error:', err?.message)
    }

    // ─── تعداد مشتریان ───
    let totalCustomers = 0
    try {
      totalCustomers = await tenantDb.customer.count({ where: baseWhere })
    } catch { /* ignore */ }

    // ─── موجودی کم و ناموجود ───
    let lowStockProducts = 0
    let outOfStockProducts = 0
    let lowStockProductList: any[] = []

    try {
      const allProducts = await tenantDb.product.findMany({
        where: { ...baseWhere, isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          currentStock: true,
          minStock: true,
          salePrice: true,
        },
      })

      const lowItems = allProducts.filter((p: any) => p.currentStock > 0 && p.currentStock < (p.minStock || 5))
      const outItems = allProducts.filter((p: any) => p.currentStock <= 0)
      lowStockProducts = lowItems.length
      outOfStockProducts = outItems.length
      lowStockProductList = [...lowItems.slice(0, 5), ...outItems.slice(0, 3)]
    } catch { /* ignore */ }

    // ─── طلب‌کاری ───
    let totalReceivable = 0

    try {
      const receivableInvoices = await tenantDb.invoice.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['Cancelled', 'cancelled'] },
          remainingAmount: { gt: 0 },
        },
        select: { remainingAmount: true },
      })

      totalReceivable = receivableInvoices.reduce((sum: number, inv: any) => sum + (inv.remainingAmount || 0), 0)
    } catch { /* ignore */ }

    // ─── آخرین فاکتورها ───
    let recentInvoices: any[] = []

    try {
      recentInvoices = await tenantDb.invoice.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['Cancelled', 'cancelled'] },
        },
        take: 5,
        orderBy: { invoiceDate: 'desc' },
        include: {
          customer: {
            select: { id: true, firstName: true, lastName: true, mobile: true },
          },
        },
      })

      recentInvoices = recentInvoices.map((inv: any) => ({
        id: inv.id,
        number: inv.number,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        remainingAmount: inv.remainingAmount,
        status: inv.status,
        paymentType: inv.paymentType,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customer
          ? `${inv.customer.firstName} ${inv.customer.lastName}`
          : null,
      }))
    } catch (err: any) {
      console.warn('[Dashboard] Recent invoices query error:', err?.message)
    }

    // ─── فروش روزانه ۷ روز اخیر ───
    let dailySales: { date: string; sales: number }[] = []

    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      const lastWeekInvoices = await tenantDb.invoice.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['Cancelled', 'cancelled'] },
          invoiceDate: { gte: sevenDaysAgo },
        },
        select: { invoiceDate: true, totalAmount: true },
      })

      const dailySalesMap = new Map<string, number>()
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        dailySalesMap.set(key, 0)
      }

      for (const inv of lastWeekInvoices) {
        const d = new Date(inv.invoiceDate)
        const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (dailySalesMap.has(key)) {
          dailySalesMap.set(key, (dailySalesMap.get(key) || 0) + (inv.totalAmount || 0))
        }
      }

      dailySales = Array.from(dailySalesMap.entries()).map(([date, sales]) => ({
        date,
        sales: Math.round(sales),
      }))
    } catch (err: any) {
      console.warn('[Dashboard] Daily sales query error:', err?.message)
    }

    // ─── فروش بر اساس دسته‌بندی ───
    let categorySales: { name: string; value: number }[] = []

    try {
      const monthInvoicesWithItems = await tenantDb.invoice.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['Cancelled', 'cancelled'] },
          invoiceDate: { gte: monthStart },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      })

      const categorySalesMap = new Map<string, number>()
      for (const inv of monthInvoicesWithItems) {
        for (const item of inv.items) {
          const catName = (item as any).product?.category?.name || 'سایر'
          categorySalesMap.set(catName, (categorySalesMap.get(catName) || 0) + (item.lineTotal || 0))
        }
      }

      categorySales = Array.from(categorySalesMap.entries())
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    } catch (err: any) {
      console.warn('[Dashboard] Category sales query error:', err?.message)
    }

    return NextResponse.json({
      success: true,
      data: {
        todaySales,
        todayInvoices: todayInvoiceCount,
        todayCash,
        todayOnline,
        todayPOS: 0,
        monthSales,
        monthInvoices: monthInvoiceCount,
        lowStockProducts,
        outOfStockProducts,
        totalCustomers,
        totalReceivable,
        recentInvoices,
        lowStockProductList,
        dailySales,
        categorySales,
      },
    })
  } catch (error: any) {
    console.error('[Dashboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
})
