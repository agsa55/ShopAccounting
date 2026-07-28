// ============================================================================
// src/app/api/portal/invoices/route.ts — GET (v3.36.3 ★★★)
// ShopAccounting — Customer Portal Invoices
// ----------------------------------------------------------------------------
// ★★★ v3.35: دریافت فاکتورها و اقساط مشتری برای پورتال
// ★★★ v3.36.3: افزودن نام مشتری و نام فروشگاه به پاسخ API
//   - customer: { id, name, mobile }
//   - store: { name }
//   تا پورتال بتواند کارت خوش‌آمد‌گویی با نام کامل مشتری نمایش دهد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import jwt from 'jsonwebtoken'

export async function GET(req: NextRequest) {
  try {
    // ★ احراز هویت با JWT پورتال
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'احراز هویت نشده' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'shopaccounting-secret')
    } catch {
      return NextResponse.json({ success: false, error: 'توکن نامعتبر یا منقضی' }, { status: 401 })
    }

    if (decoded.type !== 'portal' || !decoded.customerId || !decoded.tenantId) {
      return NextResponse.json({ success: false, error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    const customerId = decoded.customerId
    const tenantId = decoded.tenantId

    // ─── ۱. دریافت اطلاعات مشتری ─────────────────────────────
    // ★★★ v3.36.3: دریافت نام و موبایل مشتری برای کارت خوش‌آمد‌گویی
    const customer = await db.client.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
      },
    })

    // ★ ترکیب نام و نام خانوادگی
    const customerName = customer
      ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
      : 'مشتری گرامی'

    // ─── ۲. دریافت نام فروشگاه از تنظیمات ────────────────────
    // ★★★ v3.36.3: دریافت نام فروشگاه برای نمایش در هدر پورتال
    let storeName = 'فروشگاه'
    try {
      const storeSetting = await db.client.storeSetting.findFirst({
        where: { tenantId },
        select: { storeName: true },
      })
      if (storeSetting?.storeName) {
        storeName = storeSetting.storeName
      }
    } catch {
      // اگر StoreSetting در دسترس نبود، نام پیش‌فرض استفاده می‌شود
    }

    // ─── ۳. دریافت فاکتورهای مشتری ─────────────────────────────
    const invoices = await db.client.invoice.findMany({
      where: {
        customerId,
        tenantId,
        // فقط فاکتورهایی که بدهی دارند یا نسیه/قسطی هستند
        OR: [
          { paymentType: 'credit' },
          { paymentType: 'installment' },
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

    return NextResponse.json({
      success: true,
      data: {
        // ★★★ v3.36.3: اطلاعات مشتری و فروشگاه
        customer: {
          id: customerId,
          name: customerName,
          mobile: customer?.mobile || '',
        },
        store: {
          name: storeName,
        },
        // ★ برای backward compatibility (در صورت استفاده از فرمت‌های قدیمی)
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
    console.error('[Portal Invoices] Error:', error)
    return NextResponse.json({ success: false, error: 'خطای سرور' }, { status: 500 })
  }
}
