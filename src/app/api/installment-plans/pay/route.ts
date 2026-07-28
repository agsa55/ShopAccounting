// ============================================================================
// src/app/api/installment-plans/pay/route.ts — PUT (v3.3 — IMPROVED)
// ShopAccounting v3.3 — Multi-tenant SaaS Platform
// ============================================================================
// ★★★ v3.3 تغییرات:
//   ★ اضافه: کاهش currentBalance مشتری هنگام پرداخت قسط
//   ★ اضافه: دریافت paymentType و paymentRef از کلاینت
//   ★ اضافه: اعتبارسنجی مبلغ پرداخت
//   ★ اضافه: Plan Gating (فقط حرفه‌ای/سازمانی)
//   ★ بهبود: استفاده از transaction اتمیک
//   ★ بهبود: ساختار پاسخ استاندارد
//
// ★ عملیات:
//   1. اعتبارسنجی قسط (وجود دارد، پرداخت نشده)
//   2. اعتبارسنجی مبلغ پرداخت
//   3. بروزرسانی قسط (status=paid, paidAmount, paidAt, paymentRef, paymentType)
//   4. بروزرسانی طرح قسطی (paidInstallments, totalPaidAmount, status, nextDueDate)
//   5. بروزرسانی فاکتور (paidAmount, remainingAmount, status)
//   6. کاهش currentBalance مشتری
//   7. ایجاد سند حسابداری خودکار
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ═══════════════════════════════════════════════════════════════
//  PUT /api/installment-plans/pay — پرداخت قسط
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const { scheduleId, paidAmount, paymentType, paymentRef, notes, paidAt } = body

    // ─── ۱. اعتبارسنجی ورودی‌ها ───────────────────────────────
    if (!scheduleId) {
      return NextResponse.json(
        { success: false, error: 'شناسه قسط الزامی است', code: 'SCHEDULE_ID_REQUIRED' },
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

    // ─── ۲. Plan Gating ──────────────────────────────────────
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canAccessInstallments) {
      return NextResponse.json(
        {
          success: false,
          error: 'مدیریت اقساط فقط در پلن حرفه‌ای و سازمانی در دسترس است',
          code: 'PLAN_FEATURE_RESTRICTED',
        },
        { status: 403 }
      )
    }

    // ─── ۳. یافتن قسط ────────────────────────────────────────
    const schedule = await tenantDb.installmentSchedule.findFirst({
      where: { id: scheduleId, tenantId },
    })

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'قسط یافت نشد', code: 'SCHEDULE_NOT_FOUND' },
        { status: 404 }
      )
    }

    if (schedule.status?.toUpperCase() === 'PAID') {
      return NextResponse.json(
        { success: false, error: 'این قسط قبلاً پرداخت شده است', code: 'ALREADY_PAID' },
        { status: 400 }
      )
    }

    // ★ اگه مبلغ پرداخت ارسال نشده، مبلغ قسط رو استفاده کن
    const actualPaidAmount = Number(paidAmount) || schedule.amount

    if (actualPaidAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ پرداخت باید بزرگتر از صفر باشد', code: 'INVALID_AMOUNT' },
        { status: 400 }
      )
    }

    if (actualPaidAmount > schedule.amount + 1) {
      return NextResponse.json(
        {
          success: false,
          error: `مبلغ پرداخت (${actualPaidAmount.toLocaleString('fa-IR')} تومان) بیش از مبلغ قسط (${schedule.amount.toLocaleString('fa-IR')} تومان) است`,
          code: 'AMOUNT_EXCEEDS_SCHEDULE',
        },
        { status: 400 }
      )
    }

    // ─── ۴. یافتن طرح قسطی و فاکتور و مشتری ────────────────────
    const plan = await tenantDb.installmentPlan.findFirst({
      where: { id: schedule.planId, tenantId },
      include: { invoice: { include: { customer: true } } },
    })

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'طرح قسطی یافت نشد', code: 'PLAN_NOT_FOUND' },
        { status: 404 }
      )
    }

    // ─── ۵. شروع تراکنش اتمیک ───────────────────────────────
    const result = await tenantDb.$transaction(async (tx: any) => {
      // ★ ۵.۱ — بروزرسانی قسط
      const updatedSchedule = await tx.installmentSchedule.update({
        where: { id: scheduleId },
        data: {
          status: 'paid',
          paidAmount: actualPaidAmount,
          // ★★★ v3.4: پذیرش تاریخ پرداخت از کلاینت
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          paymentRef: paymentRef || null,
          paymentType: finalPaymentType,
          notes: notes || null,
        },
      })

      // ★ ۵.۲ — شمارش اقساط پرداخت شده
      const paidSchedules = await tx.installmentSchedule.findMany({
        where: { planId: plan.id, status: 'paid' },
      })
      const newPaidCount = paidSchedules.length
      const newTotalPaid = (plan.totalPaidAmount || 0) + actualPaidAmount

      // ★ ۵.۳ — یافتن قسط بعدی
      const nextUnpaid = await tx.installmentSchedule.findFirst({
        where: { planId: plan.id, status: { not: 'paid' } },
        orderBy: { installmentNumber: 'asc' },
      })

      const totalSchedules = await tx.installmentSchedule.count({
        where: { planId: plan.id },
      })

      const isCompleted = newPaidCount >= totalSchedules

      // ★ ۵.۴ — بروزرسانی طرح قسطی
      const updatedPlan = await tx.installmentPlan.update({
        where: { id: plan.id },
        data: {
          paidInstallments: newPaidCount,
          totalPaidAmount: newTotalPaid,
          status: isCompleted ? 'completed' : plan.status,
          nextDueDate: nextUnpaid?.dueDate || null,
        },
      })

      // ★ ۵.۵ — بروزرسانی فاکتور
      let updatedInvoice = null
      if (plan.invoice) {
        const invoice = plan.invoice
        const newInvoicePaid = (invoice.paidAmount || 0) + actualPaidAmount
        const newInvoiceRemaining = Math.max(0, invoice.totalAmount - newInvoicePaid)
        const newInvoiceStatus = newInvoiceRemaining <= 1 ? 'paid' : (newInvoicePaid > 0 ? 'partial' : invoice.status)

        updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newInvoicePaid,
            remainingAmount: newInvoiceRemaining,
            status: newInvoiceStatus,
          },
        })
      }

      // ★ ۵.۶ — کاهش currentBalance مشتری
      let customerUpdated = false
      if (plan.customerId) {
        try {
          await tx.customer.update({
            where: { id: plan.customerId },
            data: { currentBalance: { decrement: actualPaidAmount } },
          })
          customerUpdated = true
        } catch (custErr: any) {
          console.warn('[InstallmentPay] Failed to update customer balance:', custErr?.message)
        }
      }

      // ★ ۵.۷ — ایجاد سند حسابداری خودکار
      let journalCreated = false
      try {
        journalCreated = await createInstallmentPaymentJournal(
          tx, tenantId, plan, schedule, actualPaidAmount, finalPaymentType
        )
      } catch (jeErr: any) {
        console.warn('[InstallmentPay] Auto journal entry failed (non-blocking):', jeErr?.message)
      }

      return {
        schedule: updatedSchedule,
        plan: updatedPlan,
        invoice: updatedInvoice,
        customerUpdated,
        journalCreated,
        isCompleted,
        newPaidCount,
        totalSchedules,
      }
    })

    console.log('[InstallmentPay] Installment paid successfully:', {
      scheduleId, planId: plan.id, paidAmount: actualPaidAmount,
      newPaidCount: result.newPaidCount, totalSchedules: result.totalSchedules,
      isCompleted: result.isCompleted, customerUpdated: result.customerUpdated,
      journalCreated: result.journalCreated,
    })

    return NextResponse.json({
      success: true,
      message: result.isCompleted
        ? 'قسط آخر پرداخت شد. طرح قسطی به اتمام رسید.'
        : 'قسط با موفقیت پرداخت شد',
      data: {
        scheduleId,
        planId: plan.id,
        paidAmount: actualPaidAmount,
        newPaidCount: result.newPaidCount,
        totalSchedules: result.totalSchedules,
        isCompleted: result.isCompleted,
        customerBalanceUpdated: result.customerUpdated,
        journalEntryCreated: result.journalCreated,
      },
    })
  } catch (error: any) {
    console.error('[InstallmentPay] PUT error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در پرداخت قسط' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  Helper: ایجاد سند حسابداری برای پرداخت قسط
// ═══════════════════════════════════════════════════════════════

async function createInstallmentPaymentJournal(
  tx: any,
  tenantId: string,
  plan: any,
  schedule: any,
  paidAmount: number,
  paymentType: string
): Promise<boolean> {
  try {
    let cashAccountId: string | null = null
    let receivablesAccountId: string | null = null

    const accounts = await tx.account.findMany({ where: { tenantId } })

    for (const acc of accounts) {
      const code = (acc.code || '').toLowerCase()
      const type = (acc.type || '').toLowerCase()
      const name = (acc.name || '').toLowerCase()

      if (!cashAccountId) {
        if (paymentType === 'cash' && (type === 'cash' || name.includes('صندوق'))) {
          cashAccountId = acc.id
        } else if (paymentType === 'card' || paymentType === 'pos' || paymentType === 'bank') {
          if (type === 'bank' || name.includes('بانک') || code.startsWith('1102')) {
            cashAccountId = acc.id
          }
        }
        if (!cashAccountId && (type === 'cash' || type === 'bank' || code.startsWith('110'))) {
          cashAccountId = acc.id
        }
      }

      if (!receivablesAccountId && (type === 'receivable' || code.startsWith('130') || name.includes('طلب') || name.includes('دریافتنی'))) {
        receivablesAccountId = acc.id
      }
    }

    if (!cashAccountId || !receivablesAccountId) {
      console.warn('[InstallmentPay] Could not find required accounts for journal entry')
      return false
    }

    const jeCount = await tx.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

    const paymentTypeLabel: Record<string, string> = {
      cash: 'نقدی',
      card: 'کارتخوان',
      bank: 'بانکی',
      pos: 'کارتخوان',
    }
    const methodLabel = paymentTypeLabel[paymentType] || 'نقدی'

    await tx.journalEntry.create({
      data: {
        number: jeNumber,
        date: new Date(),
        description: `سند خودکار: واریز قسط شماره ${schedule.installmentNumber} از فاکتور ${plan.invoice?.number || ''} (${methodLabel})`,
        status: 'posted',
        sourceType: 'installment',
        sourceId: schedule.id,
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
              description: `بدهکار: واریز قسط (${methodLabel})`,
            },
            {
              accountId: receivablesAccountId,
              debit: 0,
              credit: paidAmount,
              description: `بستانکار: تسویه حساب دریافتنی — قسط ${schedule.installmentNumber}`,
            },
          ],
        },
      },
    })

    console.log('[InstallmentPay] Journal entry created:', { jeNumber, scheduleId: schedule.id })
    return true
  } catch (error: any) {
    console.warn('[InstallmentPay] Journal entry failed:', error?.message)
    return false
  }
}
