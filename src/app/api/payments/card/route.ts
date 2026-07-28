// src/app/api/payments/card/route.ts
// ShopAccounting v8.0 — Card Payments API
// ============================================================================
// GET  /api/payments/card          — لیست پرداخت‌های کارتی
// POST /api/payments/card          — ثبت پرداخت کارتی جدید
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  GET — لیست پرداخت‌های کارتی
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const { searchParams } = new URL(req.url)
    const posDeviceId = searchParams.get('posDeviceId')
    const invoiceId = searchParams.get('invoiceId')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

    const where: any = { tenantId }
    if (posDeviceId) where.posDeviceId = posDeviceId
    if (invoiceId) where.invoiceId = invoiceId
    if (status) where.status = status

    const payments = await tenantDb.cardPayment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      take: limit,
      include: {
        posDevice: {
          select: { id: true, name: true, terminalType: true, brand: true },
        },
      },
    }).catch(() => [])

    // ★ محاسبه خلاصه
    const summary = {
      total: payments.length,
      successful: payments.filter((p: any) => p.status === 'successful').length,
      failed: payments.filter((p: any) => p.status === 'failed').length,
      totalAmount: payments
        .filter((p: any) => p.status === 'successful')
        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
    }

    return NextResponse.json({
      success: true,
      data: payments,
      summary,
    })
  } catch (error: any) {
    console.error('[CardPayment GET] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری پرداخت‌های کارتی' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST — ثبت پرداخت کارتی جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const body = await req.json()

    // ★ Validation
    if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ پرداخت الزامی است و باید بزرگ‌تر از صفر باشد' },
        { status: 400 }
      )
    }

    // ★ اگه posDeviceId داده شده، بررسی مالکیت
    if (body.posDeviceId) {
      const device = await tenantDb.posDevice.findFirst({
        where: { id: body.posDeviceId, tenantId },
      })
      if (!device) {
        return NextResponse.json(
          { success: false, error: 'دستگاه POS یافت نشد' },
          { status: 404 }
        )
      }
    }

    // ★ اگه invoiceId داده شده، بررسی مالکیت
    if (body.invoiceId) {
      const invoice = await tenantDb.invoice.findFirst({
        where: { id: body.invoiceId, tenantId },
      })
      if (!invoice) {
        return NextResponse.json(
          { success: false, error: 'فاکتور یافت نشد' },
          { status: 404 }
        )
      }
    }

    // ★ اعتبارسنجی شماره پیرو (اگه موفق بوده)
    //   حداقل طول بسته به نوع کد مرجع (v8.1)
    const validRefTypes = ['rrn', 'unique_code', 'trace', 'terminal', 'auth_code', 'stan', 'other']
    const refType = validRefTypes.includes(body.referenceType) ? body.referenceType : 'rrn'
    const minLenByType: Record<string, number> = {
      rrn: 6, unique_code: 6, trace: 4, terminal: 5, auth_code: 4, stan: 4, other: 4
    }
    const minLen = minLenByType[refType] || 6

    if (body.status === 'successful' && (!body.referenceNumber || body.referenceNumber.length < minLen)) {
      const typeNames: Record<string, string> = {
        rrn: 'شماره پیرو', unique_code: 'کد یکتا', trace: 'کد پیگیری',
        terminal: 'شماره پایانه', auth_code: 'کد تأیید', stan: 'شماره تراکنش', other: 'کد مرجع'
      }
      return NextResponse.json(
        { success: false, error: `برای پرداخت موفق، ${typeNames[refType]} (حداقل ${minLen} رقم) الزامی است` },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی ۴ رقم آخر کارت (اگه داده شده)
    if (body.cardNumber && !/^\d{1,4}$/.test(String(body.cardNumber))) {
      return NextResponse.json(
        { success: false, error: '۴ رقم آخر کارت باید عدد باشد' },
        { status: 400 }
      )
    }

    const payment = await tenantDb.cardPayment.create({
      data: {
        amount: body.amount,
        invoiceId: body.invoiceId || null,
        referenceNumber: body.referenceNumber || null,
        referenceType: body.referenceType || 'rrn',
        traceNumber: body.traceNumber || null,
        cardNumber: body.cardNumber ? String(body.cardNumber).slice(-4) : null,
        cardType: body.cardType || 'unknown',
        status: body.status || 'successful',
        posDeviceId: body.posDeviceId || null,
        shaparakVerified: body.shaparakVerified || false,
        shaparakVerifyError: body.shaparakVerifyError || null,
        description: body.description || null,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        tenantId,
      },
      include: {
        posDevice: {
          select: { id: true, name: true, terminalType: true, brand: true },
        },
      },
    })

    // ★ اگه invoiceId داده شده و پرداخت موفق بود، مبلغ پرداختی فاکتور رو به‌روز کن
    if (body.invoiceId && body.status === 'successful') {
      try {
        const invoice = await tenantDb.invoice.findUnique({
          where: { id: body.invoiceId },
        })
        if (invoice) {
          const newPaidAmount = (invoice.paidAmount || 0) + body.amount
          const newRemaining = Math.max(0, (invoice.totalAmount || 0) - newPaidAmount)
          await tenantDb.invoice.update({
            where: { id: body.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              remainingAmount: newRemaining,
              status: newRemaining <= 0 ? 'paid' : 'partial',
            },
          })
        }
      } catch (err) {
        console.warn('[CardPayment POST] Failed to update invoice:', err)
      }
    }

    return NextResponse.json({
      success: true,
      data: payment,
      message: 'پرداخت کارتی با موفقیت ثبت شد',
    })
  } catch (error: any) {
    console.error('[CardPayment POST] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: `خطا در ثبت پرداخت: ${error?.message || error}` },
      { status: 500 }
    )
  }
})
