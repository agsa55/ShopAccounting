// ============================================================================
// src/app/api/invoices/receive-payment/route.ts — POST (v5.1.3 ★★★ Phase 4)
// ShopAccounting — Universal Invoice Payment Receiver
// ----------------------------------------------------------------------------
// ★★★ این API برای حل مشکل کسب‌وکار ایجاد شده:
//   وقتی کاربر از پلن حرفه‌ای به ساده downgrade می‌کند، فاکتورهای نسیه/قسطی
//   قبلی هنوز باقیمانده دارند. صندوق‌دار باید بتونه این مبالغ رو دریافت کنه.
//
// این API در همه پلن‌ها (ساده/حرفه‌ای/سازمانی) کار می‌کند و:
//   ۱. رکورد InvoicePayment ایجاد می‌کند
//   ۲. فاکتور را به‌روزرسانی می‌کند (paidAmount, remainingAmount, status)
//   ۳. اگر installmentId پاس شود، قسط مربوطه را به‌روزرسانی می‌کند
//   ۴. سند حسابداری خودکار ایجاد می‌کند (بدهکار: صندوق/بانک، بستانکار: حساب‌های دریافتنی)
//   ۵. ★★★ currentBalance مشتری را کاهش می‌دهد (برای فاکتورهای نسیه/قسطی)
//
// Body:
//   {
//     invoiceId: string,
//     amount: number,
//     paymentMethod: 'cash' | 'card' | 'check',
//     paymentRef?: string,         // شماره رسید/پیگیری
//     paymentDate?: string,        // ISO date — پیش‌فرض امروز
//     notes?: string,
//     installmentId?: string       // برای پرداخت قسط خاص
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
//  POST — دریافت وجه برای فاکتور (بدون بررسی پلن)
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('pos')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[ReceivePayment] Handler started, tenantId:', tenant?.tenantId)
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const body = await req.json()
      const {
        invoiceId,
        amount: rawAmount,
        paymentMethod = 'cash',
        paymentRef,
        paymentDate,
        notes,
        installmentId,
      } = body

      // ─── ۱. اعتبارسنجی ورودی ─────────────────────────────────────
      if (!invoiceId) {
        return NextResponse.json(
          { success: false, error: 'شناسه فاکتور الزامی است' },
          { status: 400 }
        )
      }

      const amount = Number(rawAmount)
      if (!amount || isNaN(amount) || amount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ نامعتبر است' },
          { status: 400 }
        )
      }

      const validMethods = ['cash', 'card', 'check', 'Cash', 'Card', 'Check']
      if (!validMethods.includes(paymentMethod)) {
        return NextResponse.json(
          { success: false, error: 'روش پرداخت نامعتبر است' },
          { status: 400 }
        )
      }

      // ─── ۲. یافتن فاکتور ──────────────────────────────────────────
      const invoice = await tenantDb.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: {
          id: true,
          number: true,
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
          status: true,
          customerId: true,
          paymentType: true,
        },
      })

      if (!invoice) {
        return NextResponse.json(
          { success: false, error: 'فاکتور یافت نشد' },
          { status: 404 }
        )
      }

      // ★ بررسی اینکه فاکتور لغو نشده باشد
      const invStatus = (invoice.status || '').toLowerCase()
      if (invStatus === 'cancelled' || invStatus === 'canceled') {
        return NextResponse.json(
          { success: false, error: 'این فاکتور لغو شده است' },
          { status: 400 }
        )
      }

      // ─── ۳. بررسی مبلغ باقیمانده ──────────────────────────────────
      const remaining = Number(invoice.remainingAmount) || 0
      const totalAmount = Number(invoice.totalAmount) || 0
      const currentPaid = Number(invoice.paidAmount) || 0

      if (remaining <= 0) {
        return NextResponse.json(
          { success: false, error: 'این فاکتور قبلاً به طور کامل پرداخت شده است' },
          { status: 400 }
        )
      }

      if (amount > remaining + 1) {
        // ★ تلورانس 1 ریال
        return NextResponse.json(
          {
            success: false,
            error: `مبلغ دریافتی (${amount.toLocaleString('fa-IR')} ریال) بیش از باقیمانده فاکتور (${remaining.toLocaleString('fa-IR')} ریال) است`,
          },
          { status: 400 }
        )
      }

      const paidAt = paymentDate ? new Date(paymentDate) : new Date()
      if (isNaN(paidAt.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ پرداخت نامعتبر است' },
          { status: 400 }
        )
      }

      const normalizedMethod = paymentMethod.toLowerCase()

      console.log('[ReceivePayment] Processing:', {
        invoiceId,
        invoiceNumber: invoice.number,
        amount,
        paymentMethod: normalizedMethod,
        remaining,
        installmentId: installmentId || null,
      })

      // ─── ۴. ایجاد رکورد InvoicePayment ───────────────────────────
      const payment = await tenantDb.invoicePayment.create({
        data: {
          id: randomUUID(),
          invoiceId,
          amount,
          paymentType: normalizedMethod,
          paymentRef: paymentRef || null,
          paidAt,
          tenantId,
        },
      })

      console.log('[ReceivePayment] InvoicePayment created:', payment.id)

      // ─── ۵. به‌روزرسانی فاکتور ────────────────────────────────────
      const newPaidAmount = currentPaid + amount
      const newRemaining = Math.max(0, totalAmount - newPaidAmount)
      const newStatus = newRemaining <= 1 ? 'paid' : 'partial'

      await tenantDb.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemaining,
          status: newStatus,
        },
      })

      console.log('[ReceivePayment] Invoice updated:', {
        newPaidAmount,
        newRemaining,
        newStatus,
      })

      // ★★★ اصلاح اصلی: به‌روزرسانی currentBalance مشتری ★★★
      // این کار باید بعد از به‌روزرسانی فاکتور انجام شود
      if (invoice.customerId) {
        const paymentType = (invoice.paymentType || '').toLowerCase()
        // فقط برای فاکتورهای نسیه یا قسطی، بدهی مشتری را کاهش بده
        if (paymentType === 'credit' || paymentType === 'installment') {
          try {
            await tenantDb.customer.update({
              where: { id: invoice.customerId },
              data: { currentBalance: { decrement: amount } },
            })
            console.log('[ReceivePayment] Customer currentBalance decreased:', {
              customerId: invoice.customerId,
              amount,
            })
          } catch (custErr: any) {
            console.warn('[ReceivePayment] Failed to update customer balance:', custErr?.message)
            // خطا را نادیده می‌گیریم تا پرداخت ثبت شود
          }
        }
      }

      // ─── ۶. به‌روزرسانی قسط (در صورت وجود installmentId) ──────────
      let installmentUpdated = false
      if (installmentId) {
        try {
          const schedule = await tenantDb.installmentSchedule.findFirst({
            where: { id: installmentId, tenantId },
            include: { plan: { select: { id: true, numberOfInstallments: true } } },
          })

          if (schedule) {
            const schedFullAmount = Number(schedule.amount) || 0
            const schedCurrentPaid = Number(schedule.paidAmount) || 0
            const newSchedPaid = schedCurrentPaid + amount
            const isFullyPaid = newSchedPaid >= schedFullAmount - 1

            await tenantDb.installmentSchedule.update({
              where: { id: schedule.id },
              data: {
                paidAmount: newSchedPaid,
                paidAt,
                paymentRef: paymentRef || String(Date.now()),
                paymentType: normalizedMethod,
                status: isFullyPaid ? 'paid' : 'partial',
                notes: `دریافت وجه - کد پیگیری: ${paymentRef || '---'}`,
              },
            })

            // ★ به‌روزرسانی InstallmentPlan
            if (schedule.plan) {
              const plan = schedule.plan
              const newPaidInstallments = isFullyPaid
                ? (await tenantDb.installmentSchedule.count({
                    where: { planId: plan.id, tenantId, status: 'paid' },
                  }))
                : 0

              const newTotalPaid = await tenantDb.installmentSchedule.aggregate({
                where: { planId: plan.id, tenantId },
                _sum: { paidAmount: true },
              })

              const isPlanCompleted = newPaidInstallments >= plan.numberOfInstallments

              // ★ یافتن قسط بعدی
              let nextDueDate: Date | null = null
              if (!isPlanCompleted) {
                const nextPending = await tenantDb.installmentSchedule.findFirst({
                  where: {
                    planId: plan.id,
                    tenantId,
                    status: { in: ['pending', 'partial'] },
                  },
                  orderBy: { dueDate: 'asc' },
                })
                nextDueDate = nextPending?.dueDate || null
              }

              await tenantDb.installmentPlan.update({
                where: { id: plan.id },
                data: {
                  paidInstallments: newPaidInstallments,
                  totalPaidAmount: newTotalPaid._sum.paidAmount || 0,
                  nextDueDate,
                  status: isPlanCompleted ? 'completed' : 'active',
                },
              })
            }

            installmentUpdated = true
            console.log('[ReceivePayment] InstallmentSchedule updated:', installmentId)
          } else {
            console.warn('[ReceivePayment] InstallmentSchedule not found:', installmentId)
          }
        } catch (instErr: any) {
          console.warn('[ReceivePayment] Installment update failed:', instErr?.message)
          // ★ ادامه می‌دهیم — پرداخت ثبت شده
        }
      }

      // ─── ۷. ایجاد سند حسابداری (best-effort) ────────────────────
      let journalEntryId: string | null = null
      try {
        journalEntryId = await createJournalEntryForPayment(
          tenantDb,
          tenantId,
          invoice,
          amount,
          normalizedMethod,
          paidAt,
          notes
        )
        if (journalEntryId) {
          console.log('[ReceivePayment] Journal entry created:', journalEntryId)
        }
      } catch (jeErr: any) {
        console.warn('[ReceivePayment] Journal entry creation failed:', jeErr?.message)
        // ★ ادامه می‌دهیم — پرداخت ثبت شده، فقط سند ایجاد نشد
      }

      // ─── ۸. ثبت در AuditLog ──────────────────────────────────────
      try {
        await tenantDb.auditLogs.create({
          data: {
            id: randomUUID(),
            tenantId,
            userId: tenant.user?.id || null,
            action: 'INVOICE_PAYMENT_RECEIVED',
            entityType: 'Invoice',
            entityId: invoiceId,
            details: `دریافت ${amount.toLocaleString('fa-IR')} ریال - روش: ${normalizedMethod}${installmentId ? ` - قسط: ${installmentId}` : ''}`,
          },
        })
      } catch (auditErr) {
        console.warn('[ReceivePayment] Audit log failed:', auditErr)
      }

      // ─── پاسخ نهایی ──────────────────────────────────────────────
      return NextResponse.json({
        success: true,
        message: 'دریافت وجه با موفقیت ثبت شد',
        data: {
          paymentId: payment.id,
          invoiceId,
          invoiceNumber: invoice.number,
          amount,
          paymentMethod: normalizedMethod,
          newPaidAmount,
          newRemaining,
          newStatus,
          installmentUpdated,
          journalEntryId,
        },
      })
    } catch (error: any) {
      console.error('[ReceivePayment] Error:', error)
      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطای داخلی سرور',
        },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  Helper: ایجاد سند حسابداری برای دریافت وجه
// ═══════════════════════════════════════════════════════════════

async function createJournalEntryForPayment(
  tenantDb: any,
  tenantId: string,
  invoice: any,
  amount: number,
  paymentMethod: string,
  paidAt: Date,
  notes?: string
): Promise<string | null> {
  // ★ ۱. یافتن حساب صندوق یا بانک
  const isCash = paymentMethod === 'cash'
  const accountKeyword = isCash ? ['صندوق', 'نقد'] : ['بانک', 'حساب بانکی']

  let cashAccount: any = null

  // ★ تلاش اول: جستجو بر اساس نام
  for (const kw of accountKeyword) {
    cashAccount = await tenantDb.account.findFirst({
      where: {
        tenantId,
        type: 'asset',
        name: { contains: kw },
      },
    })
    if (cashAccount) break
  }

  // ★ تلاش دوم: جستجو بر اساس کد (10xx برای صندوق/بانک)
  if (!cashAccount) {
    cashAccount = await tenantDb.account.findFirst({
      where: {
        tenantId,
        type: 'asset',
        code: { startsWith: '10' },
      },
    })
  }

  if (!cashAccount) {
    console.warn('[ReceivePayment] Cash/Bank account not found — skipping journal entry')
    return null
  }

  // ★ ۲. یافتن حساب‌های دریافتنی (مشتریان)
  let arAccount: any = null

  // ★ تلاش اول: جستجو بر اساس نام
  const arKeywords = ['دریافتنی', 'مشتری', 'حساب مشتری']
  for (const kw of arKeywords) {
    arAccount = await tenantDb.account.findFirst({
      where: {
        tenantId,
        type: 'asset',
        name: { contains: kw },
      },
    })
    if (arAccount) break
  }

  // ★ تلاش دوم: جستجو بر اساس کد (11xx برای دریافتنی‌ها)
  if (!arAccount) {
    arAccount = await tenantDb.account.findFirst({
      where: {
        tenantId,
        type: 'asset',
        code: { startsWith: '11' },
      },
    })
  }

  if (!arAccount) {
    console.warn('[ReceivePayment] Accounts Receivable account not found — skipping journal entry')
    return null
  }

  // ★ ۳. ایجاد سند حسابداری
  const journalNumber = `RP-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const description = `دریافت وجه فاکتور ${invoice.number}${notes ? ' - ' + notes : ''}`

  const entry = await tenantDb.journalEntry.create({
    data: {
      id: randomUUID(),
      tenantId,
      number: journalNumber,
      date: paidAt,
      description,
      status: 'posted',
      referenceType: 'Invoice',
      referenceId: invoice.id,
      isCancelled: false,
    },
  })

  // ★ ۴. ایجاد ردیف‌های سند (debit cash, credit A/R)
  await tenantDb.journalEntryLine.create({
    data: {
      id: randomUUID(),
      journalEntryId: entry.id,
      tenantId,
      accountId: cashAccount.id,
      debit: amount,
      credit: 0,
      description: `دریافت ${isCash ? 'نقدی' : 'بانکی'} - فاکتور ${invoice.number}`,
    },
  })

  await tenantDb.journalEntryLine.create({
    data: {
      id: randomUUID(),
      journalEntryId: entry.id,
      tenantId,
      accountId: arAccount.id,
      debit: 0,
      credit: amount,
      description: `تسویه بدهی فاکتور ${invoice.number}`,
    },
  })

  return entry.id
}