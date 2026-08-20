// ============================================================================
// src/app/api/invoices/pay/route.ts — POST / GET (v3.7.0 — Account Fix + Check Support)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.7.0 تغییرات:
//   ★ استفاده از getStandardAccountIds (auto-seed) به‌جای جستجوی دستی
//   ★ پشتیبانی از فاکتورهای check و installment (علاوه بر credit)
//   ★ افزودن 'check' به validPaymentTypes
//
// ★★★ v3.6 (حفظ شد): قفل امنیتی برای رد کردن فاکتورهای نامعتبر
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

// ═══════════════════════════════════════════════════════════════
//  POST /api/invoices/pay — ثبت پرداخت فاکتور نسیه/قسطی/چک
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const { invoiceId, amount, paymentType, paymentRef, notes, paidAt } = body

    // ─── ۱. اعتبارسنجی ورودی‌ها ───────────────────────────────
    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فاکتور الزامی است', code: 'INVOICE_ID_REQUIRED' },
        { status: 400 }
      )
    }

    const paidAmount = Number(amount)
    if (!paidAmount || paidAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ پرداخت باید بزرگتر از صفر باشد', code: 'INVALID_AMOUNT' },
        { status: 400 }
      )
    }

    // ★ v3.7.0: افزودن 'check' به validPaymentTypes
    const validPaymentTypes = ['cash', 'card', 'bank', 'pos', 'check']
    const finalPaymentType = (paymentType || 'cash').toLowerCase()
    if (!validPaymentTypes.includes(finalPaymentType)) {
      return NextResponse.json(
        { success: false, error: 'روش پرداخت نامعتبر است', code: 'INVALID_PAYMENT_TYPE' },
        { status: 400 }
      )
    }

    // ─── ۲. بررسی پلن — فقط حرفه‌ای/سازمانی می‌تونن نسیه رو تسویه کنن ───
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canAccessCredit) {
      return NextResponse.json(
        {
          success: false,
          error: 'ثبت پرداخت برای فاکتور نسیه فقط در پلن حرفه‌ای و سازمانی در دسترس است',
          code: 'PLAN_FEATURE_RESTRICTED',
        },
        { status: 403 }
      )
    }

    // ─── ۳. یافتن فاکتور ─────────────────────────────────────
    const invoice = await tenantDb.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        customer: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'فاکتور یافت نشد', code: 'INVOICE_NOT_FOUND' },
        { status: 404 }
      )
    }

    // ─── ۴. بررسی نوع فاکتور (قفل امنیتی) ─────────────────────────────────
    const invoicePaymentType = (invoice.paymentType || 'cash').toLowerCase()
    
    // ★ v3.7.0: اجازه پرداخت برای credit، check و installment
    if (invoicePaymentType !== 'credit' && invoicePaymentType !== 'check' && invoicePaymentType !== 'installment') {
      return NextResponse.json(
        {
          success: false,
          error: 'این فاکتور نقدی پرداخت شده یا نوع آن قابل تسویه از اینجا نیست',
          code: 'NOT_CREDIT_INVOICE',
        },
        { status: 400 }
      )
    }

    // ─── ۵. بررسی وضعیت فاکتور ───────────────────────────────
    const currentStatus = (invoice.status || '').toLowerCase()
    if (currentStatus === 'paid') {
      return NextResponse.json(
        { success: false, error: 'این فاکتور قبلاً به طور کامل پرداخت شده است', code: 'ALREADY_PAID' },
        { status: 400 }
      )
    }

    // ─── ۶. بررسی مبلغ پرداخت ─────────────────────────────────
    const totalAmount = invoice.totalAmount || 0
    const currentPaid = invoice.paidAmount || 0
    const remainingAmount = invoice.remainingAmount || (totalAmount - currentPaid)

    if (paidAmount > remainingAmount + 1) {
      return NextResponse.json(
        {
          success: false,
          error: `مبلغ پرداخت (${paidAmount.toLocaleString('fa-IR')} ریال) بیش از مبلغ باقیمانده (${remainingAmount.toLocaleString('fa-IR')} ریال) است`,
          code: 'AMOUNT_EXCEEDS_REMAINING',
        },
        { status: 400 }
      )
    }

    const paymentDate = paidAt ? new Date(paidAt) : new Date()

    // ─── ۷. شروع تراکنش اتمیک ───────────────────────────────
    const result = await tenantDb.$transaction(async (tx: any) => {
      // ★ ۷.۱ — ایجاد رکورد پرداخت
      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: paidAmount,
          paymentType: finalPaymentType,
          paymentRef: paymentRef || null,
          paidAt: paymentDate,
          tenantId,
        },
      })

      // ★ ۷.۲ — محاسبه مقادیر جدید
      const newPaidAmount = currentPaid + paidAmount
      const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount)
      const newStatus = newRemainingAmount <= 1 ? 'paid' : 'partial'

      // ★ ۷.۳ — بروزرسانی فاکتور
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
        },
      })

      // ★ ۷.۴ — کاهش currentBalance مشتری (بلافاصله به اندازه مبلغ پرداختی)
      if (invoice.customerId) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: {
            currentBalance: { decrement: paidAmount },
          },
        }).catch((custErr: any) => {
          console.warn('[InvoicesPay] Failed to update customer balance:', custErr?.message)
        })
      }

      // ★ ۷.۵ — ایجاد سند حسابداری خودکار
      // ★ v3.7.0: استفاده از getStandardAccountIds
      let journalCreated = false
      try {
        const accIds = await getStandardAccountIds(tenantId)
        
        let cashAccountId: string | null = null
        if (finalPaymentType === 'cash') {
          cashAccountId = accIds.cashAccountId
        } else if (finalPaymentType === 'card' || finalPaymentType === 'bank' || finalPaymentType === 'pos') {
          cashAccountId = accIds.bankAccountId || accIds.cashAccountId
        } else {
          cashAccountId = accIds.cashAccountId
        }
        
        const receivablesAccountId = accIds.tradeReceivableId || accIds.receivablesAccountId

        if (cashAccountId && receivablesAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`
          const methodLabel = finalPaymentType === 'cash' ? 'نقدی' : finalPaymentType === 'check' ? 'چک' : 'کارتخوان/بانکی'

          await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: paymentDate,
              description: `سند خودکار: دریافت وجه فاکتور ${invoice.number} (${methodLabel})`,
              status: 'posted',
              sourceType: 'invoice_payment',
              sourceId: payment.id,
              totalDebit: paidAmount,
              totalCredit: paidAmount,
              createdBy: null,
              tenantId,
              lines: {
                create: [
                  {
                    accountId: cashAccountId,
                    debit: paidAmount,
                    credit: 0,
                    description: `بدهکار: واریز وجه فاکتور ${invoice.number}`,
                  },
                  {
                    accountId: receivablesAccountId,
                    debit: 0,
                    credit: paidAmount,
                    description: `بستانکار: تسویه حساب دریافتنی فاکتور ${invoice.number}`,
                  },
                ],
              },
            },
          })
          journalCreated = true
        }
      } catch (jeErr: any) {
        console.warn('[InvoicesPay] Auto journal entry failed (non-blocking):', jeErr?.message)
      }

      return { payment, newStatus, newPaidAmount, newRemainingAmount, journalCreated }
    })

    // ─── ۸. پاسخ موفقیت ──────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: result.newStatus === 'paid'
        ? 'فاکتور با موفقیت به طور کامل تسویه شد'
        : 'پرداخت با موفقیت ثبت شد. فاکتور همچنان دارای مبلغ باقیمانده است.',
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        paymentId: result.payment.id,
        paidAmount: paidAmount,
        totalPaid: result.newPaidAmount,
        remainingAmount: result.newRemainingAmount,
        status: result.newStatus,
        journalEntryCreated: result.journalCreated,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[InvoicesPay] POST error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ثبت پرداخت' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  GET /api/invoices/pay?invoiceId=... — تاریخچه پرداخت‌های فاکتور
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فاکتور الزامی است' },
        { status: 400 }
      )
    }

    const invoice = await tenantDb.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        id: true, number: true, totalAmount: true, paidAmount: true,
        remainingAmount: true, status: true, paymentType: true,
        customerId: true,
        customer: { select: { id: true, firstName: true, lastName: true, currentBalance: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'فاکتور یافت نشد' },
        { status: 404 }
      )
    }

    const payments = await tenantDb.invoicePayment.findMany({
      where: { invoiceId, tenantId },
      orderBy: { paidAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        invoice: {
          id: invoice.id,
          number: invoice.number,
          totalAmount: invoice.totalAmount,
          paidAmount: invoice.paidAmount,
          remainingAmount: invoice.remainingAmount,
          status: invoice.status,
          paymentType: invoice.paymentType,
          customer: invoice.customer ? {
            id: invoice.customer.id,
            name: `${invoice.customer.firstName || ''} ${invoice.customer.lastName || ''}`.trim(),
            currentBalance: invoice.customer.currentBalance,
          } : null,
        },
        payments: payments.map((p: any) => ({
          id: p.id,
          amount: p.amount,
          paymentType: p.paymentType,
          paymentRef: p.paymentRef,
          paidAt: p.paidAt,
        })),
      },
    })
  } catch (error: any) {
    console.error('[InvoicesPay] GET error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری پرداخت‌ها' },
      { status: 500 }
    )
  }
})