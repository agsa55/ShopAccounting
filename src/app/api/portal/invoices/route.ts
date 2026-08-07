// ============================================================================
// src/app/api/portal/invoices/route.ts — GET (v3.43 ★★★)
// ShopAccounting — Customer Portal Invoices
// ----------------------------------------------------------------------------
// ★★★ v3.43: استفاده از portalToken به جای JWT
//   - portalToken یک random string است (نه JWT)
//   - مستقیماً از دیتابیس customer را با portalToken پیدا می‌کنیم
//   - ساده‌تر و مطمئن‌تر از JWT verification
// ★★★ v3.36.3: افزودن نام مشتری و نام فروشگاه به پاسخ API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    // ─── دریافت portalToken ─────────────────────────────────────
    // اولویت ۱: Authorization header (Bearer token)
    // اولویت ۲: portal_token از کوکی
    // اولویت ۳: x-portal-token از header (ست شده توسط middleware)
    const authHeader = req.headers.get('authorization')
    let portalToken: string | null = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      portalToken = authHeader.replace('Bearer ', '')
    } else {
      portalToken = req.cookies.get('portal_token')?.value || 
                    req.headers.get('x-portal-token') ||
                    null
    }

    if (!portalToken) {
      console.error('[Portal Invoices] ❌ No portal token found')
      return NextResponse.json({ success: false, error: 'احراز هویت نشده' }, { status: 401 })
    }

    console.log('[Portal Invoices] 🔍 Looking up customer with portalToken:', portalToken.substring(0, 16) + '...')

    // ─── پیدا کردن customer از portalToken ─────────────────────
    // ★★★ v3.43: جستجوی مستقیم در دیتابیس (به جای JWT verification)
    const customer = await db.client.customer.findFirst({
      where: { 
        portalToken,
        isBlacklisted: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
        tenantId: true,
      },
    })

    if (!customer) {
      console.error('[Portal Invoices] ❌ Customer not found for portalToken')
      return NextResponse.json({ success: false, error: 'توکن نامعتبر یا مشتری یافت نشد' }, { status: 401 })
    }

    const customerId = customer.id
    const tenantId = customer.tenantId

    console.log('[Portal Invoices] ✅ Customer found:', {
      customerId,
      tenantId,
      name: `${customer.firstName} ${customer.lastName}`,
    })

    // ─── ۱. ترکیب نام مشتری ──────────────────────────────────
    const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'مشتری گرامی'

    // ─── ۲. دریافت نام فروشگاه ───────────────────────────────
    let storeName = 'فروشگاه'
    try {
      const tenant = await db.client.tenant.findUnique({
        where: { id: tenantId },
        select: { companyName: true },
      })
      if (tenant?.companyName) {
        storeName = tenant.companyName
      } else {
        const storeSetting = await db.client.storeSetting.findFirst({
          where: { tenantId },
          select: { storeName: true },
        })
        if (storeSetting?.storeName) {
          storeName = storeSetting.storeName
        }
      }
    } catch (err: any) {
      console.warn('[Portal Invoices] ⚠️ Failed to get store name:', err?.message)
    }

    // ─── ۳. دریافت فاکتورهای مشتری ─────────────────────────────
    const invoices = await db.client.invoice.findMany({
      where: {
        customerId,
        tenantId,
        OR: [
          { paymentType: 'credit' },
          { paymentType: 'installment' },
          { remainingAmount: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        number: true,
        invoiceDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        status: true,
        paymentType: true,
        items: {
          select: { productName: true, quantity: true, lineTotal: true },
        },
        installmentPlan: {
          include: {
            schedules: { orderBy: { installmentNumber: 'asc' } },
          },
        },
      },
      orderBy: { invoiceDate: 'desc' },
    })

    // ─── ۴. محاسبه خلاصه ──────────────────────────────────────
    const totalDebt = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.remainingAmount) || 0), 0)

    console.log('[Portal Invoices] ✅ Success:', {
      customerId,
      customerName,
      storeName,
      invoiceCount: invoices.length,
      totalDebt,
    })

    return NextResponse.json({
      success: true,
      data: {
        customer: {
          id: customerId,
          name: customerName,
          mobile: customer.mobile || '',
        },
        store: {
          name: storeName,
        },
        customerName,
        storeName,
        invoices,
        summary: {
          totalDebt,
          invoiceCount: invoices.length,
        },
      },
    })
  } catch (error: any) {
    console.error('[Portal Invoices] ❌ Error:', error)
    return NextResponse.json({ success: false, error: 'خطای سرور' }, { status: 500 })
  }
}