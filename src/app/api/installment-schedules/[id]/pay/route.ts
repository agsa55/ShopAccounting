// ============================================================================
// src/app/api/installment-schedules/[id]/pay/route.ts — POST (v3.36.6 ★★★)
// ShopAccounting — Register In-Store Payment for a Specific Installment
// ============================================================================
// ★★★ v3.36.6: رفع باگ به‌روزرسانی دیرهنگام مانده مشتری + یکپارچگی tenantDb
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getTenantPlanInfo } from '@/lib/plan-limits'
import { resolvePlanTier } from '@/lib/plan-features'

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

      // ─── ۴. شروع تراکنش اتمیک ───────────────────────────────
      const result = await tenantDb.$transaction(async (tx: any) => {
        
        // ۴.۱. به‌روزرسانی InstallmentSchedule
        const newPaidAmount = alreadyPaid + amount
        const isFullyPaid = newPaidAmount >= fullAmount - 1

        const updatedSchedule = await tx.installmentSchedule.update({
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

        // ۴.۲. ایجاد InvoicePayment
        await tx.invoicePayment.create({
          data: {
            invoiceId,
            amount,
            paymentType: pt,
            paymentRef: paymentRef || null,
            paidAt: paidAtDate,
            tenantId,
          },
        })

        // ۴.۳. به‌روزرسانی Invoice
        const newInvoicePaidAmount = (Number(invoice.paidAmount) || 0) + amount
        const newInvoiceRemaining = Math.max(0, (Number(invoice.totalAmount) || 0) - newInvoicePaidAmount)

        let newInvoiceStatus = invoice.status
        if (newInvoiceRemaining <= 0) {
          newInvoiceStatus = 'paid'
        } else if (newInvoicePaidAmount > 0) {
          newInvoiceStatus = 'partial'
        }

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: newInvoicePaidAmount,
            remainingAmount: newInvoiceRemaining,
            status: newInvoiceStatus,
          },
        })

        // ۴.۴. ★★★ به‌روزرسانی فوری موجودی مشتری (کاهش بدهی به اندازه مبلغ پرداختی)
        if (invoice.customerId && amount > 0) {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: amount } },
          }).catch((custErr: any) => {
            console.warn('[Installment Pay] Failed to update customer balance (non-blocking):', custErr?.message)
          })
        }

        // ۴.۵. به‌روزرسانی InstallmentPlan
        const plan = schedule.plan
        const newPlanPaidInstallments = isFullyPaid
          ? (plan.paidInstallments || 0) + 1
          : plan.paidInstallments || 0
        const newPlanTotalPaid = (Number(plan.totalPaidAmount) || 0) + amount
        const isPlanCompleted = newPlanPaidInstallments >= plan.numberOfInstallments

        let nextDueDate: Date | null = null
        if (!isPlanCompleted) {
          const nextPending = await tx.installmentSchedule.findFirst({
            where: {
              planId: plan.id,
              tenantId,
              status: { in: ['pending', 'partial'] },
              id: { not: schedule.id },
            },
            orderBy: { dueDate: 'asc' },
          })
          nextDueDate = nextPending?.dueDate || null
        }

        await tx.installmentPlan.update({
          where: { id: plan.id },
          data: {
            paidInstallments: newPlanPaidInstallments,
            totalPaidAmount: newPlanTotalPaid,
            nextDueDate,
            status: isPlanCompleted ? 'completed' : 'active',
          },
        })

        // ۴.۶. سند حسابداری خودکار (در صورت پشتیبانی پلن)
        let journalCreated = false
        try {
          const planInfo = await getTenantPlanInfo(tenantId)
          const planTier = resolvePlanTier(planInfo.tierName)

          if (planTier === 'professional' || planTier === 'enterprise') {
            journalCreated = await createAutoJournalEntryForInstallment(
              tx, // ★★★ استفاده از tx برای اطمینان از یکپارچگی تراکنش
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

        return {
          updatedSchedule,
          newInvoicePaidAmount,
          newInvoiceRemaining,
          newInvoiceStatus,
          newPlanPaidInstallments,
          newPlanTotalPaid,
          isPlanCompleted,
          nextDueDate,
          journalCreated,
        }
      })

      // ─── ۵. پاسخ ────────────────────────────────────────────
      return NextResponse.json({
        success: true,
        message: result.updatedSchedule.status === 'paid'
          ? `قسط ${schedule.installmentNumber} به طور کامل پرداخت شد`
          : `پرداخت جزیی برای قسط ${schedule.installmentNumber} ثبت شد`,
        data: {
          schedule: {
            id: result.updatedSchedule.id,
            installmentNumber: result.updatedSchedule.installmentNumber,
            paidAmount: result.updatedSchedule.paidAmount,
            status: result.updatedSchedule.status,
          },
          invoice: {
            id: invoiceId,
            paidAmount: result.newInvoicePaidAmount,
            remainingAmount: result.newInvoiceRemaining,
            status: result.newInvoiceStatus,
          },
          plan: {
            id: schedule.plan.id,
            paidInstallments: result.newPlanPaidInstallments,
            totalPaidAmount: result.newPlanTotalPaid,
            status: result.isPlanCompleted ? 'completed' : 'active',
            nextDueDate: result.nextDueDate,
          },
          journalEntryCreated: result.journalCreated,
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
  tx: any, // ★★★ دریافت tx از تراکنش اصلی
  tenantId: string,
  invoice: any,
  amount: number,
  paymentType: string,
  installmentNumber: number,
  paidAt: Date,
  userId: string | null
) {
  try {
    if (amount <= 0) return false

    let cashAccountId: string | null = null
    let receivablesAccountId: string | null = null

    const accounts = await tx.account.findMany({ where: { tenantId } })
    for (const acc of accounts) {
      const code = (acc.code || '').toLowerCase()
      const type = (acc.type || '').toLowerCase()
      const name = (acc.name || '').toLowerCase()

      if (!cashAccountId && (paymentType === 'cash' ? (type === 'cash' || name.includes('صندوق')) : (type === 'bank' || name.includes('بانک') || code.startsWith('110')))) {
        cashAccountId = acc.id
      }
      if (!receivablesAccountId && (type === 'receivable' || code.startsWith('130') || name.includes('طلب') || name.includes('بدهکار') || name.includes('دریافتنی'))) {
        receivablesAccountId = acc.id
      }
    }

    if (!cashAccountId || !receivablesAccountId) {
      console.warn('[Installment Pay] Skipping journal entry: cash or receivables account not found')
      return false
    }

    const jeCount = await tx.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`
    
    const methodLabel = paymentType === 'cash' ? 'نقدی' : (paymentType === 'card' || paymentType === 'pos' ? 'کارتخوان' : 'بانکی')
    const description = `سند خودکار بابت دریافت قسط ${installmentNumber} فاکتور ${invoice.number} (${methodLabel})`

    await tx.journalEntry.create({
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
        lines: {
          create: [
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
          ],
        },
      },
    })

    console.log('[Installment Pay] Auto journal entry created:', jeNumber)
    return true
  } catch (error: any) {
    console.error('[Installment Pay] Failed to create journal entry:', error?.message)
    return false
  }
}