// src/app/api/installments/[id]/pay/route.ts — NEW (v1.0)
// ============================================================================
// ثبت پرداخت قسط به‌صورت دستی (نقدی/کارتخوان/چک)
// ----------------------------------------------------------------------------
// ★ این endpoint برای موارد زیر استفاده می‌شود:
//   - مشتری قسط خود را حضوری به صندوق می‌دهد
//   - مشتری قسط خود را با کارتخوان (POS) می‌دهد
//   - مشتری چک می‌دهد
//
// ★ نحوه کار:
//   ۱. دریافت planId + مبلغ پرداختی + نوع پرداخت
//   ۲. پیدا کردن InstallmentPlan
//   ۳. تخصیص پرداخت به schedules به ترتیب FIFO
//   ۴. به‌روزرسانی فاکتور (paidAmount, remainingAmount, status)
//   ۵. ثبت InvoicePayment
//   ۶. صدور سند حسابداری (Dr صندوق/بانک / Cr مطالبات)
//   ۷. به‌روزرسانی Customer.currentBalance
//   ۸. اگر همه اقساط پرداخت شدند → status='completed'
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

interface PayRequestBody {
  amount: number
  paymentType: 'cash' | 'card' | 'check'
  paymentRef?: string  // شماره پیرو کارتخوان یا شماره چک
  checkId?: string     // اگر پرداخت با چک است
  description?: string
  paymentDate?: string // ISO date string (اختیاری)
}

export const POST = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const paramsObj: any =
      ctx?.params && typeof ctx.params?.then === 'function'
        ? await ctx.params
        : ctx?.params || {}
    const planId = paramsObj?.id

    if (!planId) {
      return NextResponse.json(
        { success: false, error: 'شناسه پلن اقساط الزامی است' },
        { status: 400 }
      )
    }

    const body: PayRequestBody = await req.json()
    const {
      amount,
      paymentType = 'cash',
      paymentRef,
      checkId,
      description,
      paymentDate,
    } = body

    // ★ اعتبارسنجی مبلغ
    const paymentAmount = Number(amount)
    if (!paymentAmount || paymentAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ پرداخت باید بزرگتر از صفر باشد' },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی نوع پرداخت
    if (!['cash', 'card', 'check'].includes(paymentType)) {
      return NextResponse.json(
        { success: false, error: 'نوع پرداخت نامعتبر است (cash, card, check)' },
        { status: 400 }
      )
    }

    // ★★★ اگر پرداخت با چک است، checkId الزامی است
    if (paymentType === 'check' && !checkId) {
      return NextResponse.json(
        { success: false, error: 'برای پرداخت با چک، شناسه چک الزامی است' },
        { status: 400 }
      )
    }

    // ★ پیدا کردن InstallmentPlan
    const plan: any = await tenantDb.installmentPlan.findFirst({
      where: { id: planId, tenantId },
      include: {
        invoice: true,
        schedules: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    })

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'پلن اقساط یافت نشد' },
        { status: 404 }
      )
    }

    if (plan.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'این پلن اقساط قبلاً تکمیل شده است' },
        { status: 400 }
      )
    }

    if (plan.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'این پلن اقساط لغو شده است' },
        { status: 400 }
      )
    }

    // ★ بررسی باقی‌مانده کل پلن
    const totalRemainingInPlan = plan.totalWithInterest - plan.totalPaidAmount
    if (paymentAmount > totalRemainingInPlan) {
      return NextResponse.json(
        {
          success: false,
          error: `مبلغ پرداخت (${paymentAmount.toLocaleString('fa-IR')}) بیشتر از باقی‌مانده پلن (${totalRemainingInPlan.toLocaleString('fa-IR')}) است`,
        },
        { status: 400 }
      )
    }

    // ★★★ گرفتن حساب‌های استاندارد با auto-seed
    await getStandardAccountIds(tenantId).catch(() => ({} as any))
    const accIds = await getStandardAccountIds(tenantId)

    // ★ انتخاب حساب بدهکار بر اساس نوع پرداخت
    let debitAccountId: string | null = null
    let debitAccountLabel = ''

    if (paymentType === 'cash') {
      debitAccountId = accIds.cashAccountId
      debitAccountLabel = 'صندوق'
    } else if (paymentType === 'card') {
      // ★ کارتخوان → پول به بانک می‌رود
      debitAccountId = accIds.bankAccountId || accIds.cashAccountId
      debitAccountLabel = 'بانک (کارتخوان)'
    } else if (paymentType === 'check') {
      // ★ چک دریافتی → 1350
      debitAccountId = accIds.checkReceivableId || accIds.receivablesAccountId
      debitAccountLabel = 'چک‌های دریافتنی'
    }

    // ★ حساب بستانکار: 1310 بدهکاران تجاری (نسیه مشتری)
    const creditAccountId = accIds.tradeReceivableId || accIds.receivablesAccountId

    if (!debitAccountId || !creditAccountId) {
      return NextResponse.json(
        {
          success: false,
          error: 'حساب‌های استاندارد تنظیم نشده‌اند. لطفاً با پشتیبانی تماس بگیرید.',
          debug: {
            debitAccountId,
            creditAccountId,
            paymentType,
          },
        },
        { status: 500 }
      )
    }

    const effectiveDate = paymentDate ? new Date(paymentDate) : new Date()

    // ══════ شروع تراکنش ══════
    const result = await tenantDb.$transaction(async (tx: any) => {
      let remainingPayment = paymentAmount
      let newlyPaidInstallments = 0
      const updatedSchedules: any[] = []
      let nextDueDate: Date | null = null

      // ★ تخصیص پرداخت به schedules به ترتیب FIFO
      for (const schedule of plan.schedules) {
        if (remainingPayment <= 0) break
        if (schedule.status === 'paid') continue

        const scheduleRemaining = schedule.amount - schedule.paidAmount
        if (scheduleRemaining <= 0) continue

        const paymentForThisSchedule = Math.min(remainingPayment, scheduleRemaining)
        const newPaidForSchedule = schedule.paidAmount + paymentForThisSchedule
        const newScheduleStatus = newPaidForSchedule >= schedule.amount ? 'paid' : 'partial'

        const updatedSchedule = await tx.installmentSchedule.update({
          where: { id: schedule.id },
          data: {
            paidAmount: newPaidForSchedule,
            status: newScheduleStatus,
            paidAt: newScheduleStatus === 'paid' ? effectiveDate : schedule.paidAt,
            paymentRef: paymentRef || schedule.paymentRef,
            paymentType: paymentType,
            notes: description || schedule.notes,
          },
        })

        updatedSchedules.push({
          installmentNumber: updatedSchedule.installmentNumber,
          amount: updatedSchedule.amount,
          paidAmount: updatedSchedule.paidAmount,
          status: updatedSchedule.status,
          paymentForThisSchedule,
        })

        if (newScheduleStatus === 'paid') {
          newlyPaidInstallments++
        }

        remainingPayment -= paymentForThisSchedule

        // ★ nextDueDate: اولین schedule که هنوز paid نیست
        if (newScheduleStatus !== 'paid' && !nextDueDate) {
          nextDueDate = schedule.dueDate
        }
      }

      // ★ اگر همه paid شدند، nextDueDate را null کن
      if (remainingPayment === 0) {
        const unpaidRemaining = plan.schedules.filter(
          (s: any) => s.status !== 'paid' && !updatedSchedules.find(us => us.installmentNumber === s.installmentNumber && us.status === 'paid')
        )
        if (unpaidRemaining.length === 0) {
          nextDueDate = null
        }
      }

      // ★ به‌روزرسانی InstallmentPlan
      const newTotalPaid = plan.totalPaidAmount + paymentAmount
      const newPaidInstallments = plan.paidInstallments + newlyPaidInstallments
      const allPaid = newPaidInstallments >= plan.numberOfInstallments

      const updatedPlan = await tx.installmentPlan.update({
        where: { id: plan.id },
        data: {
          paidInstallments: newPaidInstallments,
          totalPaidAmount: newTotalPaid,
          nextDueDate,
          status: allPaid ? 'completed' : 'active',
        },
      })

      // ★ به‌روزرسانی فاکتور
      const invoice = plan.invoice
      const newInvoicePaidAmount = invoice.paidAmount + paymentAmount
      const newInvoiceRemaining = Math.max(0, invoice.totalAmount - newInvoicePaidAmount)
      const newInvoiceStatus = newInvoiceRemaining <= 0 ? 'paid' : 'partial'

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newInvoicePaidAmount,
          remainingAmount: newInvoiceRemaining,
          status: newInvoiceStatus,
        },
      })

      // ★ ثبت InvoicePayment
      await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: paymentAmount,
          paymentType,
          paymentRef: paymentRef || null,
          paidAt: effectiveDate,
          tenantId,
        },
      })

      // ★ به‌روزرسانی Customer.currentBalance
      if (invoice.customerId) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: {
            currentBalance: { decrement: paymentAmount },
            ...(newInvoiceStatus === 'paid' ? { lastPurchaseAt: effectiveDate } : {}),
          },
        }).catch((err: any) =>
          console.warn('[Installment Pay] Customer update failed:', err?.message)
        )
      }

      // ★ صدور سند حسابداری
      try {
        const jeCount = await tx.journalEntry.count({ where: { tenantId } })
        const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

        const lines: any[] = [
          {
            accountId: debitAccountId,
            debit: paymentAmount,
            credit: 0,
            description: `بدهکار: دریافت قسط ${description ? `— ${description}` : ''} — فاکتور ${invoice.number}`,
          },
          {
            accountId: creditAccountId,
            debit: 0,
            credit: paymentAmount,
            description: `بستانکار: تسویه بدهکی مشتری — قسط ${newPaidInstallments}/${plan.numberOfInstallments} فاکتور ${invoice.number}`,
          },
        ]

        // ★ اگر پرداخت با چک است، در description شماره چک را ذکر کن
        if (paymentType === 'check' && paymentRef) {
          lines[0].description += ` — چک شماره ${paymentRef}`
        }

        const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

        await tx.journalEntry.create({
          data: {
            number: jeNumber,
            // ★ تاریخ JE = تاریخ پرداخت
            date: effectiveDate,
            description: `سند خودکار — دریافت قسط فاکتور ${invoice.number}`,
            status: 'posted',
            sourceType: 'installment_payment',
            sourceId: plan.id,
            totalDebit,
            totalCredit,
            createdBy: userId || null,
            tenantId,
            lines: { create: lines },
          },
        })
      } catch (jeErr: any) {
        console.warn('[Installment Pay] Journal entry failed (non-blocking):', jeErr?.message)
      }

      return {
        plan: updatedPlan,
        schedules: updatedSchedules,
        invoice: {
          id: invoice.id,
          number: invoice.number,
          paidAmount: newInvoicePaidAmount,
          remainingAmount: newInvoiceRemaining,
          status: newInvoiceStatus,
        },
        newlyPaidInstallments,
        totalPaidInPlan: newTotalPaid,
        allPaid,
      }
    })

    console.log(`[Installment Pay] ✓ قسط ثبت شد برای پلن ${planId}:`, {
      amount: paymentAmount,
      paymentType,
      newlyPaidInstallments: result.newlyPaidInstallments,
      allPaid: result.allPaid,
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `پرداخت قسط با موفقیت ثبت شد. ${result.newlyPaidInstallments > 0 ? `${result.newlyPaidInstallments.toLocaleString('fa-IR')} قسط به‌طور کامل پرداخت شد.` : ''} ${result.allPaid ? '✓ پلن اقساط تکمیل شد.' : ''}`,
    }, { status: 201 })

  } catch (error: any) {
    console.error('[Installment Pay] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ثبت پرداخت قسط' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  GET /api/installments/[id]/pay — دریافت جزئیات پلن اقساط
//  (برای نمایش در فرم پرداخت)
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const paramsObj: any =
      ctx?.params && typeof ctx.params?.then === 'function'
        ? await ctx.params
        : ctx?.params || {}
    const planId = paramsObj?.id

    if (!planId) {
      return NextResponse.json(
        { success: false, error: 'شناسه پلن اقساط الزامی است' },
        { status: 400 }
      )
    }

    const plan = await tenantDb.installmentPlan.findFirst({
      where: { id: planId, tenantId },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                mobile: true,
                currentBalance: true,
              },
            },
          },
        },
        schedules: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    })

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'پلن اقساط یافت نشد' },
        { status: 404 }
      )
    }

    // ★ محاسبه اطلاعات خلاصه
    const nextDueSchedule = plan.schedules.find(s => s.status !== 'paid')
    const summary = {
      totalAmount: plan.totalAmount,
      downPayment: plan.downPayment,
      totalPaidAmount: plan.totalPaidAmount,
      remainingAmount: plan.totalWithInterest - plan.totalPaidAmount,
      totalWithInterest: plan.totalWithInterest,
      numberOfInstallments: plan.numberOfInstallments,
      paidInstallments: plan.paidInstallments,
      installmentAmount: plan.installmentAmount,
      installmentPeriod: plan.installmentPeriod,
      status: plan.status,
      nextDueDate: nextDueSchedule?.dueDate || null,
      nextDueAmount: nextDueSchedule?.amount || 0,
      nextInstallmentNumber: nextDueSchedule?.installmentNumber || null,
    }

    return NextResponse.json({
      success: true,
      data: {
        plan,
        summary,
      },
    })

  } catch (error: any) {
    console.error('[Installment GET] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری پلن اقساط' },
      { status: 500 }
    )
  }
})
