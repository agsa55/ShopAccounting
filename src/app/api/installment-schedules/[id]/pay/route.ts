// ============================================================================
// src/app/api/installment-schedules/[id]/pay/route.ts — POST (v3.36.5 ★★★)
// ShopAccounting — Register In-Store Payment for a Specific Installment
// ----------------------------------------------------------------------------
// ★★★ v3.36.5: ثبت پرداخت حضوری برای یک قسط خاص (نقدی/کارت/بانکی/...)
//
// این API توسط صندوق‌دار در پنل ادمین استفاده می‌شود (نه پورتال مشتری).
// کاربرد: وقتی مشتری حضوری می‌آید و می‌خواهد قسط خاصی را پرداخت کند.
//
// Supported method:
//   POST /api/installment-schedules/{id}/pay
//     body: {
//       amount: number,             // مبلغ پرداخت (می‌تواند کمتر از مبلغ قسط باشد)
//       paymentType: string,        // cash | card | bank | online | check
//       paymentRef?: string,        // مرجع پرداخت (شماره تراکنش کارت، شماره چک، ...)
//       paidAt?: string,            // تاریخ پرداخت (ISO) - اختیاری، پیش‌فرض: now
//       notes?: string,             // توضیحات
//     }
//
// پس از پرداخت موفق:
//   ۱. به‌روزرسانی InstallmentSchedule (paidAmount, status, paidAt, paymentRef, paymentType)
//   ۲. ایجاد InvoicePayment
//   ۳. به‌روزرسانی Invoice (paidAmount, remainingAmount, status)
//   ۴. به‌روزرسانی InstallmentPlan (paidInstallments, totalPaidAmount, nextDueDate, status)
//   ۵. ایجاد سند حسابداری خودکار (در صورت پشتیبانی پلن)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getTenantPlanInfo } from '@/lib/plan-limits'
import { resolvePlanTier } from '@/lib/plan-features'
import { db } from '@/lib/db'

export const POST = withTenantAndPermission('pos')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const scheduleId = ctx?.params?.id

      if (!scheduleId) {
        return NextResponse.json(
          { success: false, error: 'شناسه قسط الزامی است' },
          { status: 400 }
        )
      }

      const body = await req.json()
      const { amount: amountRaw, paymentType, paymentRef, paidAt, notes } = body

      // ─── ۱. اعتبارسنجی ورودی‌ها ──────────────────────────────
      const amount = Number(amountRaw) || 0
      if (amount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ پرداخت باید بزرگتر از صفر باشد', code: 'INVALID_AMOUNT' },
          { status: 400 }
        )
      }

      const validPaymentTypes = ['cash', 'card', 'bank', 'online', 'check', 'pos']
      const pt = (paymentType || 'cash').toLowerCase()
      if (!validPaymentTypes.includes(pt)) {
        return NextResponse.json(
          { success: false, error: 'نوع پرداخت نامعتبر است', code: 'INVALID_PAYMENT_TYPE' },
          { status: 400 }
        )
      }

      const paidAtDate = paidAt ? new Date(paidAt) : new Date()
      if (isNaN(paidAtDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ پرداخت نامعتبر است', code: 'INVALID_DATE' },
          { status: 400 }
        )
      }

      // ─── ۲. دریافت قسط از دیتابیس ────────────────────────────
      const schedule = await tenantDb.installmentSchedule.findFirst({
        where: { id: scheduleId, tenantId },
        include: {
          plan: {
            include: {
              invoice: {
                select: {
                  id: true,
                  number: true,
                  totalAmount: true,
                  paidAmount: true,
                  remainingAmount: true,
                  customerId: true,
                  status: true,
                },
              },
            },
          },
        },
      })

      if (!schedule) {
        return NextResponse.json(
          { success: false, error: 'قسط یافت نشد', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }

      if (!schedule.plan || !schedule.plan.invoice) {
        return NextResponse.json(
          { success: false, error: 'فاکتور مرتبط با این قسط یافت نشد', code: 'INVOICE_NOT_FOUND' },
          { status: 404 }
        )
      }

      // ─── ۳. بررسی وضعیت قسط ─────────────────────────────────
      const schedStatus = (schedule.status || '').toLowerCase()
      if (schedStatus === 'paid' || schedStatus === 'completed') {
        return NextResponse.json(
          { success: false, error: 'این قسط قبلاً به طور کامل پرداخت شده است', code: 'ALREADY_PAID' },
          { status: 400 }
        )
      }

      const fullAmount = Number(schedule.amount) || 0
      const alreadyPaid = Number(schedule.paidAmount) || 0
      const remainingForThisInstallment = fullAmount - alreadyPaid

      if (amount > remainingForThisInstallment + 1) {
        // ★ تلورانس ۱ ریال برای خطای گرد کردن
        return NextResponse.json(
          {
            success: false,
            error: `مبلغ پرداخت (${amount.toLocaleString('fa-IR')} ریال) بیش از مبلغ باقی‌مانده این قسط (${remainingForThisInstallment.toLocaleString('fa-IR')} ریال) است`,
            code: 'AMOUNT_EXCEEDS_INSTALLMENT',
          },
          { status: 400 }
        )
      }

      const invoice = schedule.plan.invoice
      const invoiceId = invoice.id

      console.log('[Installment Pay] Registering in-store payment:', {
        scheduleId,
        installmentNumber: schedule.installmentNumber,
        fullAmount,
        alreadyPaid,
        amountToPay: amount,
        paymentType: pt,
      })

      // ─── ۴. به‌روزرسانی InstallmentSchedule ──────────────────
      const newPaidAmount = alreadyPaid + amount
      const isFullyPaid = newPaidAmount >= fullAmount - 1

      const updatedSchedule = await tenantDb.installmentSchedule.update({
        where: { id: schedule.id },
        data: {
          paidAmount: newPaidAmount,
          paidAt: paidAtDate,
          paymentRef: paymentRef || schedule.paymentRef,
          paymentType: pt,
          status: isFullyPaid ? 'paid' : 'partial',
          notes: notes
            ? `${schedule.notes || ''}\n[${paidAtDate.toLocaleString('fa-IR')}] ${notes}`.trim()
            : schedule.notes,
        },
      })

      console.log('[Installment Pay] Schedule updated:', {
        scheduleId,
        newPaidAmount,
        isFullyPaid,
        newStatus: updatedSchedule.status,
      })

      // ─── ۵. ایجاد InvoicePayment ────────────────────────────
      await tenantDb.invoicePayment.create({
        data: {
          invoiceId,
          amount,
          paymentType: pt,
          paymentRef: paymentRef || null,
          paidAt: paidAtDate,
          tenantId,
        },
      })

      // ─── ۶. به‌روزرسانی Invoice ──────────────────────────────
      const newInvoicePaidAmount = (Number(invoice.paidAmount) || 0) + amount
      const newInvoiceRemaining = Math.max(0, (Number(invoice.totalAmount) || 0) - newInvoicePaidAmount)

      // ★ تعیین status جدید فاکتور
      let newInvoiceStatus = invoice.status
      if (newInvoiceRemaining <= 0) {
        newInvoiceStatus = 'paid'
      } else if (newInvoicePaidAmount > 0) {
        newInvoiceStatus = 'partial'
      }

      await tenantDb.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newInvoicePaidAmount,
          remainingAmount: newInvoiceRemaining,
          status: newInvoiceStatus,
        },
      })

      console.log('[Installment Pay] Invoice updated:', {
        invoiceId,
        newPaidAmount: newInvoicePaidAmount,
        newRemaining: newInvoiceRemaining,
        newStatus: newInvoiceStatus,
      })

      // ─── ۷. به‌روزرسانی InstallmentPlan ─────────────────────
      const plan = schedule.plan
      const newPlanPaidInstallments = isFullyPaid
        ? (plan.paidInstallments || 0) + 1
        : plan.paidInstallments || 0
      const newPlanTotalPaid = (Number(plan.totalPaidAmount) || 0) + amount
      const isPlanCompleted = newPlanPaidInstallments >= plan.numberOfInstallments

      // ★ یافتن قسط بعدی (pending با کوچک‌ترین dueDate)
      let nextDueDate: Date | null = null
      if (!isPlanCompleted) {
        const nextPending = await tenantDb.installmentSchedule.findFirst({
          where: {
            planId: plan.id,
            tenantId,
            status: { in: ['pending', 'partial'] },
            id: { not: schedule.id }, // ★ خود این قسط را مستثنی کن
          },
          orderBy: { dueDate: 'asc' },
        })
        nextDueDate = nextPending?.dueDate || null
      }

      await tenantDb.installmentPlan.update({
        where: { id: plan.id },
        data: {
          paidInstallments: newPlanPaidInstallments,
          totalPaidAmount: newPlanTotalPaid,
          nextDueDate,
          status: isPlanCompleted ? 'completed' : 'active',
        },
      })

      console.log('[Installment Pay] Plan updated:', {
        planId: plan.id,
        newPaidInstallments: newPlanPaidInstallments,
        newTotalPaid: newPlanTotalPaid,
        isPlanCompleted,
        nextDueDate,
      })

      // ─── ۸. به‌روزرسانی موجودی مشتری (در صورت تسویه کامل فاکتور) ─
      if (newInvoiceRemaining <= 0 && invoice.customerId) {
        try {
          const customer = await tenantDb.customer.findFirst({
            where: { id: invoice.customerId, tenantId },
            select: { id: true, currentBalance: true },
          })
          if (customer && Number(customer.currentBalance) > 0) {
            // ★ کاهش بدهی مشتری به اندازه مبلغ پرداخت (تا سقف بدهی)
            const newBalance = Math.max(0, Number(customer.currentBalance) - amount)
            await tenantDb.customer.update({
              where: { id: customer.id },
              data: { currentBalance: newBalance },
            })
          }
        } catch (custErr: any) {
          console.warn('[Installment Pay] Failed to update customer balance (non-blocking):', custErr?.message)
        }
      }

      // ─── ۹. سند حسابداری خودکار (در صورت پشتیبانی پلن) ───────
      try {
        const planInfo = await getTenantPlanInfo(tenantId)
        const planTier = resolvePlanTier(planInfo.tierName)

        if (planTier === 'professional' || planTier === 'enterprise') {
          await createAutoJournalEntryForInstallment(
            tenantId,
            invoice,
            amount,
            pt,
            schedule.installmentNumber,
            paidAtDate,
            tenant.user?.id || null
          )
        }
      } catch (jeErr: any) {
        console.warn('[Installment Pay] Auto journal entry failed (non-blocking):', jeErr?.message)
      }

      // ─── ۱۰. پاسخ ────────────────────────────────────────────
      return NextResponse.json({
        success: true,
        message: isFullyPaid
          ? `قسط ${schedule.installmentNumber} به طور کامل پرداخت شد`
          : `پرداخت جزیی برای قسط ${schedule.installmentNumber} ثبت شد`,
        data: {
          schedule: {
            id: updatedSchedule.id,
            installmentNumber: updatedSchedule.installmentNumber,
            paidAmount: updatedSchedule.paidAmount,
            status: updatedSchedule.status,
            paidAt: updatedSchedule.paidAt,
            paymentRef: updatedSchedule.paymentRef,
            paymentType: updatedSchedule.paymentType,
          },
          invoice: {
            id: invoiceId,
            paidAmount: newInvoicePaidAmount,
            remainingAmount: newInvoiceRemaining,
            status: newInvoiceStatus,
          },
          plan: {
            id: plan.id,
            paidInstallments: newPlanPaidInstallments,
            totalPaidAmount: newPlanTotalPaid,
            status: isPlanCompleted ? 'completed' : 'active',
            nextDueDate,
          },
          isInstallmentFullyPaid: isFullyPaid,
          isPlanCompleted,
        },
      })
    } catch (error: any) {
      console.error('[Installment Pay] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در ثبت پرداخت قسط' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  تابع کمکی: ایجاد سند حسابداری خودکار برای پرداخت قسط
// ═══════════════════════════════════════════════════════════════

async function createAutoJournalEntryForInstallment(
  tenantId: string,
  invoice: any,
  amount: number,
  paymentType: string,
  installmentNumber: number,
  paidAt: Date,
  userId: string | null
) {
  try {
    if (amount <= 0) return

    // ★ یافتن حساب‌های مربوطه
    let cashAccountId: string | null = null
    let receivablesAccountId: string | null = null

    try {
      const accounts = await db.client.account.findMany({ where: { tenantId } })
      for (const acc of accounts) {
        const code = (acc.code || '').toLowerCase()
        const type = (acc.type || '').toLowerCase()
        const name = (acc.name || '').toLowerCase()

        if (!cashAccountId && (type === 'cash' || type === 'bank' || code.startsWith('110') || name.includes('صندوق') || name.includes('بانک'))) {
          cashAccountId = acc.id
        }
        if (!receivablesAccountId && (type === 'receivable' || code.startsWith('130') || name.includes('طلب') || name.includes('بدهکار'))) {
          receivablesAccountId = acc.id
        }
      }
    } catch (err: any) {
      console.warn('[Installment Pay] Could not find accounts for journal entry:', err?.message)
    }

    if (!cashAccountId || !receivablesAccountId) {
      console.warn('[Installment Pay] Skipping journal entry: cash or receivables account not found')
      return
    }

    const jeCount = await db.client.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

    const description = `سند خودکار بابت دریافت قسط ${installmentNumber} فاکتور ${invoice.number} (${paymentType})`

    const lines: any[] = [
      {
        accountId: cashAccountId,
        debit: amount,
        credit: 0,
        description: 'بدهکار: بابت دریافت قسط',
      },
      {
        accountId: receivablesAccountId,
        debit: 0,
        credit: amount,
        description: 'بستانکار: بابت تسویه قسط',
      },
    ]

    await db.client.journalEntry.create({
      data: {
        number: jeNumber,
        date: paidAt,
        description,
        status: 'posted',
        sourceType: 'installment_payment',
        sourceId: invoice.id,
        totalDebit: amount,
        totalCredit: amount,
        createdBy: userId,
        tenantId,
        lines: { create: lines },
      },
    })

    console.log('[Installment Pay] Auto journal entry created:', jeNumber)
  } catch (error: any) {
    console.error('[Installment Pay] Failed to create journal entry:', error?.message)
  }
}
