// ============================================================================
// src/app/api/invoices/stats/route.ts — v1.1 (FIXED)
// ★ رفع خطای Unknown field — فقط فیلدهای موجود در مدل استفاده شده‌اند
// ★ شناسایی چک از طریق فیلد paymentType + relation با جدول Check
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
//  ★ فقط از فیلدهای موجود در مدل Invoice استفاده می‌کند
// ═══════════════════════════════════════════════════════════════
function isCheckInvoice(inv: any): boolean {
  const pt = (inv.paymentType || '').toString().toLowerCase().trim()
  
  // حالت ۱: مستقیم 'check'
  if (pt === 'check' || pt === 'cheque' || pt === 'چک') return true
  if (pt.includes('check')) return true
  
  // حالت ۲: چک‌های مرتبط از جدول Check (اگر relation موجود باشد)
  if (inv.checks && Array.isArray(inv.checks) && inv.checks.length > 0) return true
  
  return false
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/invoices/stats
//  Query params:
//    tenantId (required, via middleware)
//    statusFilter (optional)
//    paymentTypeFilter (optional)
//    search (optional)
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('invoices')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    
    const statusFilter = searchParams.get('statusFilter') || 'ALL'
    const paymentTypeFilter = searchParams.get('paymentTypeFilter') || 'ALL'
    const search = searchParams.get('search') || ''

    // ═══════════════════════════════════════════════════════════
    //  ★ ساخت شرط where — فقط فیلدهای موجود در مدل
    // ═══════════════════════════════════════════════════════════
    const where: any = { tenantId }
    
    // فیلتر وضعیت — فقط از فیلد status استفاده می‌شود
    if (statusFilter !== 'ALL') {
      const statusMap: Record<string, string[]> = {
        'PAID': ['PAID', 'paid', 'Paid'],
        'PENDING': ['PENDING', 'pending', 'Pending'],
        'PARTIAL': ['PARTIAL', 'PARTIALLYPAID', 'partial'],
        'DRAFT': ['DRAFT', 'draft', 'Draft'],
        'CANCELLED': ['CANCELLED', 'cancelled', 'Cancelled'],
      }
      const statuses = statusMap[statusFilter.toUpperCase()] || [statusFilter]
      where.status = { in: statuses }
    }
    
    // فیلتر روش پرداخت
    if (paymentTypeFilter !== 'ALL') {
      where.paymentType = paymentTypeFilter
    }
    
    // فیلتر جستجو
    if (search.trim()) {
      const q = search.trim()
      where.OR = [
        { number: { contains: q } },
        { customer: { firstName: { contains: q } } },
        { customer: { lastName: { contains: q } } },
      ]
    }

    // ═══════════════════════════════════════════════════════════
    //  ★ خواندن فاکتورها — فقط فیلدهای موجود در مدل
    //  ★ تلاش اول: با relation checks (برای شناسایی دقیق چک‌ها)
    //  ★ تلاش دوم: بدون checks (اگر relation موجود نبود)
    // ═══════════════════════════════════════════════════════════
    
    let allInvoices: any[] = []
    
    try {
      // تلاش اول: با relation checks
      allInvoices = await tenantDb.invoice.findMany({
        where,
        select: {
          id: true,
          status: true,
          paymentType: true,
          totalAmount: true,
          paidAmount: true,
          invoiceType: true,
          checks: {
            select: { id: true, status: true },
          },
        },
      })
    } catch (err: any) {
      // تلاش دوم: بدون relation checks (اگر موجود نبود)
      console.warn('[Invoices Stats] Fallback without checks relation:', err?.message?.slice(0, 80))
      allInvoices = await tenantDb.invoice.findMany({
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
    }

    // ═══════════════════════════════════════════════════════════
    //  محاسبه آمار
    // ═══════════════════════════════════════════════════════════
    
    const total = allInvoices.length
    
    // ★ فقط از فیلد status استفاده می‌شود (نه paymentStatus)
    const getEffectiveStatus = (inv: any) => 
      (inv.status || '').toUpperCase()
    
    // آمار وضعیت
    const paid = allInvoices.filter(i => 
      ['PAID', 'PAID'].includes(getEffectiveStatus(i)) || 
      getEffectiveStatus(i) === 'PAID'
    ).length
    
    const pending = allInvoices.filter(i => 
      getEffectiveStatus(i) === 'PENDING' ||
      getEffectiveStatus(i) === 'DRAFT'
    ).length
    
    const partial = allInvoices.filter(i => 
      getEffectiveStatus(i) === 'PARTIAL' || 
      getEffectiveStatus(i) === 'PARTIALLYPAID'
    ).length
    
    // آمار مبالغ
    const totalAmount = allInvoices.reduce(
      (sum, i) => sum + toNumber(i.totalAmount), 0
    )
    const paidAmount = allInvoices.reduce(
      (sum, i) => sum + toNumber(i.paidAmount), 0
    )
    
    // ★ آمار تفکیکی روش‌های پرداخت
    const checkCount = allInvoices.filter(isCheckInvoice).length
    
    const cashCount = allInvoices.filter(i => {
      const pt = (i.paymentType || '').toLowerCase().trim()
      return (pt === 'cash' || pt === 'نقدی') && !isCheckInvoice(i)
    }).length
    
    const cardCount = allInvoices.filter(i => {
      const pt = (i.paymentType || '').toLowerCase().trim()
      return (pt === 'card' || pt === 'pos' || pt === 'کارتخوان') && !isCheckInvoice(i)
    }).length
    
    const creditCount = allInvoices.filter(i => {
      const pt = (i.paymentType || '').toLowerCase().trim()
      return (pt === 'credit' || pt === 'نسیه') && !isCheckInvoice(i)
    }).length
    
    const installmentCount = allInvoices.filter(i => {
      const pt = (i.paymentType || '').toLowerCase().trim()
      return (pt === 'installment' || pt === 'قسطی') && !isCheckInvoice(i)
    }).length

    // ★ لاگ برای دیباگ
    console.log('[Invoices Stats] Computed stats:', {
      total,
      byPaymentType: { cash: cashCount, card: cardCount, credit: creditCount, installment: installmentCount, check: checkCount },
      totalAmount,
      paidAmount,
    })

    return NextResponse.json({
      success: true,
      data: {
        total,
        paid,
        pending,
        partial,
        totalAmount,
        paidAmount,
        byPaymentType: {
          cash: cashCount,
          card: cardCount,
          credit: creditCount,
          installment: installmentCount,
          check: checkCount,
        },
        isFiltered: statusFilter !== 'ALL' || paymentTypeFilter !== 'ALL' || search.trim() !== '',
      },
    })
  } catch (error: any) {
    console.error('[Invoices Stats] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در محاسبه آمار فاکتورها' },
      { status: 500 }
    )
  }
})