// ============================================================================
// src/app/api/invoices/pay/route.ts — POST / GET (v3.3 — NEW)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.3 — ایجاد endpoint جدید برای ثبت پرداخت فاکتور نسیه
//
// عملیات:
//   1. اعتبارسنجی فاکتور (paymentType=credit, status != paid)
//   2. اعتبارسنجی مبلغ پرداخت (<= remainingAmount)
//   3. ایجاد رکورد در InvoicePayment
//   4. بروزرسانی paidAmount و remainingAmount فاکتور
//   5. تغییر status فاکتور (paid | partial)
//   6. کاهش currentBalance مشتری (به اندازه مبلغ پرداخت)
//   7. ایجاد سند حسابداری خودکار:
//      - بدهکار: صندوق/بانک
//      - بستانکار: حساب‌های دریافتنی (مشتری)
//
// Plan Gating:
//   - فقط پلن‌های حرفه‌ای و سازمانی (canAccessCredit)
//   - اگه پلن ساده باشه → 403 forbidden
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ═══════════════════════════════════════════════════════════════
//  POST /api/invoices/pay — ثبت پرداخت فاکتور نسیه
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

    const validPaymentTypes = ['cash', 'card', 'bank', 'pos']
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

    // ─── ۴. بررسی نوع فاکتور ─────────────────────────────────
    const invoicePaymentType = (invoice.paymentType || 'cash').toLowerCase()
    if (invoicePaymentType !== 'credit') {
      return NextResponse.json(
        {
          success: false,
          error: 'این فاکتور نسیه نیست. ثبت پرداخت فقط برای فاکتورهای نسیه مجاز است.',
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
      // ★ ۱ تومان تلورانس برای خطای گرد کردن
      return NextResponse.json(
        {
          success: false,
          error: `مبلغ پرداخت (${paidAmount.toLocaleString('fa-IR')} تومان) بیش از مبلغ باقیمانده (${remainingAmount.toLocaleString('fa-IR')} تومان) است`,
          code: 'AMOUNT_EXCEEDS_REMAINING',
        },
        { status: 400 }
      )
    }

    // ─── ۷. شروع تراکنش اتمیک ───────────────────────────────
    // ★ همه عملیات در یک تراکنش — اگه هرکدوم شکست خورد، همه rollback می‌شن
    const result = await tenantDb.$transaction(async (tx: any) => {
      // ★ ۷.۱ — ایجاد رکورد پرداخت
      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: paidAmount,
          paymentType: finalPaymentType,
          paymentRef: paymentRef || null,
          // ★★★ v3.4: پذیرش تاریخ پرداخت از کلاینت (اگه ارسال نشه، تاریخ جاری استفاده می‌شه)
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          tenantId,
        },
      })

      // ★ ۷.۲ — محاسبه مقادیر جدید
      const newPaidAmount = currentPaid + paidAmount
      const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount)
      const newStatus = newRemainingAmount <= 1 ? 'paid' : 'partial'

      // ★ ۷.۳ — بروزرسانی فاکتور
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
        },
      })

      // ★ ۷.۴ — کاهش currentBalance مشتری
      let customerUpdated = false
      if (invoice.customerId) {
        try {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: {
              currentBalance: { decrement: paidAmount },
            },
          })
          customerUpdated = true
        } catch (custErr: any) {
          console.warn('[InvoicesPay] Failed to update customer balance:', custErr?.message)
          // ★ ادامه میدیم — حتی اگه بروزرسانی مشتری شکست بخوره، پرداخت ثبت بشه
        }
      }

      // ★ ۷.۵ — ایجاد سند حسابداری خودکار
      let journalCreated = false
      try {
        journalCreated = await createCreditPaymentJournal(
          tx, tenantId, invoice, payment, paidAmount, finalPaymentType
        )
      } catch (jeErr: any) {
        console.warn('[InvoicesPay] Auto journal entry failed (non-blocking):', jeErr?.message)
      }

      return {
        payment,
        invoice: updatedInvoice,
        customerUpdated,
        journalCreated,
        newStatus,
        newPaidAmount,
        newRemainingAmount,
      }
    })

    console.log('[InvoicesPay] Payment recorded successfully:', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      paidAmount,
      newStatus: result.newStatus,
      customerUpdated: result.customerUpdated,
      journalCreated: result.journalCreated,
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
        customerBalanceUpdated: result.customerUpdated,
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

// ═══════════════════════════════════════════════════════════════
//  Helper: ایجاد سند حسابداری برای پرداخت نسیه
// ═══════════════════════════════════════════════════════════════

async function createCreditPaymentJournal(
  tx: any,
  tenantId: string,
  invoice: any,
  payment: any,
  paidAmount: number,
  paymentType: string
): Promise<boolean> {
  try {
    // ★ یافتن حساب‌های مناسب
    let cashAccountId: string | null = null
    let receivablesAccountId: string | null = null

    const accounts = await tx.account.findMany({ where: { tenantId } })

    for (const acc of accounts) {
      const code = (acc.code || '').toLowerCase()
      const type = (acc.type || '').toLowerCase()
      const name = (acc.name || '').toLowerCase()

      // ★ برای کارتخوان/بانک، حساب بانک رو پیدا کن
      if (!cashAccountId) {
        if (paymentType === 'cash' && (type === 'cash' || name.includes('صندوق'))) {
          cashAccountId = acc.id
        } else if (paymentType === 'card' || paymentType === 'pos' || paymentType === 'bank') {
          if (type === 'bank' || name.includes('بانک') || code.startsWith('1102')) {
            cashAccountId = acc.id
          }
        }
        // ★ fallback: هر حساب cash/bank
        if (!cashAccountId && (type === 'cash' || type === 'bank' || code.startsWith('110'))) {
          cashAccountId = acc.id
        }
      }

      if (!receivablesAccountId && (type === 'receivable' || code.startsWith('130') || name.includes('طلب') || name.includes('دریافتنی'))) {
        receivablesAccountId = acc.id
      }
    }

    if (!cashAccountId || !receivablesAccountId) {
      console.warn('[InvoicesPay] Could not find required accounts for journal entry', {
        cashAccountId, receivablesAccountId,
      })
      return false
    }

    // ★ شماره سند
    const jeCount = await tx.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

    const paymentTypeLabel: Record<string, string> = {
      cash: 'نقدی',
      card: 'کارتخوان',
      bank: 'بانکی',
      pos: 'کارتخوان',
    }
    const methodLabel = paymentTypeLabel[paymentType] || 'نقدی'

    // ★ ایجاد سند
    await tx.journalEntry.create({
      data: {
        number: jeNumber,
        date: new Date(),
        description: `سند خودکار: دریافت نسیه فاکتور ${invoice.number} (${methodLabel})`,
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
              description: `بدهکار: واریز نسیه فاکتور ${invoice.number} (${methodLabel})`,
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

    console.log('[InvoicesPay] Journal entry created:', {
      jeNumber, invoiceId: invoice.id, paidAmount,
    })
    return true
  } catch (error: any) {
    console.error('[InvoicesPay] Journal entry creation failed:', error?.message)
    return false
  }
}
