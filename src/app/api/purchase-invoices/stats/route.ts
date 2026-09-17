// ============================================================================
// src/app/api/purchase-invoices/stats/route.ts — v1.0
// ★ API آمار کلی فاکتورهای خرید (مستقل از صفحه‌بندی)
// ★ آمار تفکیکی بر اساس روش پرداخت و نوع فاکتور
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  Helper: تبدیل Decimal به number
// ═══════════════════════════════════════════════════════════════
function toNumber(val: any): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return val
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

// ═══════════════════════════════════════════════════════════════
//  Helper: شناسایی هوشمند چک
// ═══════════════════════════════════════════════════════════════
function isCheckInvoice(inv: any): boolean {
  const pt = (inv.paymentType || '').toString().toLowerCase().trim()
  if (pt === 'check' || pt === 'cheque' || pt === 'چک') return true
  if (pt.includes('check')) return true
  if (inv.checks && Array.isArray(inv.checks) && inv.checks.length > 0) return true
  return false
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/purchase-invoices/stats
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('purchase_invoices')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    
    const invoiceTypeFilter = searchParams.get('invoiceTypeFilter') || 'all'
    const statusFilter = searchParams.get('statusFilter') || 'all'
    const paymentTypeFilter = searchParams.get('paymentTypeFilter') || 'all'
    const search = searchParams.get('search') || ''

    const where: any = { tenantId }
    
    // فیلتر نوع فاکتور
    if (invoiceTypeFilter !== 'all') {
      if (invoiceTypeFilter === 'purchase') {
        // خرید عادی: invoiceType خالی یا purchase
        where.OR = [
          { invoiceType: null },
          { invoiceType: 'purchase' },
        ]
      } else {
        where.invoiceType = invoiceTypeFilter
      }
    }
    
    // فیلتر وضعیت
    if (statusFilter !== 'all') {
      where.status = statusFilter
    }
    
    // فیلتر روش پرداخت
    if (paymentTypeFilter !== 'all') {
      where.paymentType = paymentTypeFilter
    }
    
    // فیلتر جستجو
    if (search.trim()) {
      const q = search.trim()
      where.AND = where.AND || []
      where.AND.push({
        OR: [
          { number: { contains: q } },
          { supplier: { name: { contains: q } } },
        ],
      })
    }

    // خواندن فاکتورها — فقط فیلدهای موجود در مدل
    let allInvoices: any[] = []
    
    try {
      allInvoices = await tenantDb.purchaseInvoice.findMany({
        where,
        select: {
          id: true,
          status: true,
          paymentType: true,
          totalAmount: true,
          paidAmount: true,
          invoiceType: true,
        },
      })
    } catch (err: any) {
      console.error('[Purchase Stats] Query error:', err?.message)
      // Fallback: تلاش بدون فیلدهای مشکوک
      try {
        allInvoices = await tenantDb.purchaseInvoice.findMany({
          where: { tenantId },
          select: {
            id: true,
            status: true,
            paymentType: true,
            totalAmount: true,
            paidAmount: true,
            invoiceType: true,
          },
        })
      } catch (err2: any) {
        return NextResponse.json(
          { success: false, error: 'خطا در خواندن فاکتورها: ' + err2?.message },
          { status: 500 }
        )
      }
    }

    const total = allInvoices.length
    
    // آمار مبالغ
    const totalAmount = allInvoices.reduce(
      (sum, i) => sum + toNumber(i.totalAmount), 0
    )
    const paidAmount = allInvoices.reduce(
      (sum, i) => sum + toNumber(i.paidAmount), 0
    )
    
    // ═══════════════════════════════════════════════════════════
    //  آمار بر اساس روش پرداخت (خرید نقدی، نسیه، چک)
    // ═══════════════════════════════════════════════════════════
    const checkCount = allInvoices.filter(isCheckInvoice).length
    
    const cashPurchaseCount = allInvoices.filter(i => {
      const pt = (i.paymentType || '').toLowerCase().trim()
      return (pt === 'cash' || pt === 'نقدی') && !isCheckInvoice(i)
    }).length
    
    const creditPurchaseCount = allInvoices.filter(i => {
      const pt = (i.paymentType || '').toLowerCase().trim()
      return (pt === 'credit' || pt === 'نسیه') && !isCheckInvoice(i)
    }).length
    
    // ═══════════════════════════════════════════════════════════
    //  آمار بر اساس نوع فاکتور (خرید، برگشت، خدمات، تعمیرات)
    // ═══════════════════════════════════════════════════════════
    const serviceCount = allInvoices.filter(i => 
      (i.invoiceType || '').toLowerCase() === 'service'
    ).length
    
    const repairCount = allInvoices.filter(i => 
      (i.invoiceType || '').toLowerCase() === 'repair'
    ).length
    
    const purchaseReturnCount = allInvoices.filter(i => 
      (i.invoiceType || '').toLowerCase() === 'purchase_return'
    ).length
    
    const purchaseCount = allInvoices.filter(i => {
      const t = (i.invoiceType || '').toLowerCase()
      return !t || t === 'purchase'
    }).length

    // لاگ برای دیباگ
    console.log('[Purchase Stats] Computed:', {
      total,
      byPaymentType: { cash: cashPurchaseCount, credit: creditPurchaseCount, check: checkCount },
      byInvoiceType: { purchase: purchaseCount, service: serviceCount, repair: repairCount, purchaseReturn: purchaseReturnCount },
    })

    return NextResponse.json({
      success: true,
      data: {
        total,
        totalAmount,
        paidAmount,
        byPaymentType: {
          cash: cashPurchaseCount,
          credit: creditPurchaseCount,
          check: checkCount,
        },
        byInvoiceType: {
          purchase: purchaseCount,
          purchaseReturn: purchaseReturnCount,
          service: serviceCount,
          repair: repairCount,
        },
        isFiltered: invoiceTypeFilter !== 'all' || statusFilter !== 'all' || paymentTypeFilter !== 'all' || search.trim() !== '',
      },
    })
  } catch (error: any) {
    console.error('[Purchase Stats] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در محاسبه آمار فاکتورهای خرید' },
      { status: 500 }
    )
  }
})