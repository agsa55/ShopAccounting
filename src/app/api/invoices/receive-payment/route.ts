// ============================================================================
// src/app/api/invoices/receive-payment/route.ts — POST (v5.4.0 ★★★ Installment Fix)
// ShopAccounting — Universal Invoice Payment Receiver
// ----------------------------------------------------------------------------
// ★★★ v5.4.0:
//   - رفع باگ مهم: paidInstallments پلن اقساطی دیگر هنگام پرداخت جزئی صفر نمی‌شود
//   - بهبود پیدا کردن حساب دریافتنی از روی سند فروش
//   - پشتیبانی بهتر از وضعیت‌های posted / POSTED
//   - اصلاح حساب بدهکار برای پرداخت چکی: چک‌های دریافتنی ۱۳۵۰ در اولویت
//   - حفظ رفتار قبلی برای دریافت نقدی/کارتی فاکتورهای نسیه و اقساطی
//
// ★★★ v5.3.0:
//   - استفاده از getStandardAccountIds (auto-seed)
//   - پیدا کردن حساب دریافتنی از روی سند فروش همان فاکتور
//
// این API در همه پلن‌ها (ساده/حرفه‌ای/سازمانی) کار می‌کند و:
//   ۱. رکورد InvoicePayment ایجاد می‌کند
//   ۲. فاکتور را به‌روزرسانی می‌کند (paidAmount, remainingAmount, status)
//   ۳. اگر installmentId پاس شود، قسط مربوطه را به‌روزرسانی می‌کند
//   ۴. سند حسابداری خودکار ایجاد می‌کند
//      - نقدی: بدهکار صندوق، بستانکار حساب دریافتنی
//      - کارت: بدهکار بانک، بستانکار حساب دریافتنی
//      - چک: بدهکار چک‌های دریافتنی، بستانکار حساب دریافتنی
//   ۵. currentBalance مشتری را کاهش می‌دهد (برای فاکتورهای نسیه/قسطی)
//
// Body:
//   {
//     invoiceId: string,
//     amount: number,
//     paymentMethod: 'cash' | 'card' | 'check',
//     paymentRef?: string,
//     paymentDate?: string,
//     notes?: string,
//     installmentId?: string
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'
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

      // ─── . اعتبارسنجی ورودی ─────────────────────────────────────
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

      // ─── . بررسی مبلغ باقیمانده ──────────────────────────────────
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

      // ─── . به‌روزرسانی فاکتور ────────────────────────────────────
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
      if (invoice.customerId) {
        const paymentType = (invoice.paymentType || '').toLowerCase()
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

            if (schedule.plan) {
              const plan = schedule.plan

              // ★ v5.4.0: همیشه تعداد اقساط واقعاً پرداخت‌شده را بشمار
              // قبلاً اگر قسط جزئی پرداخت می‌شد، paidInstallments صفر می‌شد
              const paidInstallmentsCount = await tenantDb.installmentSchedule.count({
                where: {
                  planId: plan.id,
                  tenantId,
                  status: 'paid',
                },
              })

              const newPaidInstallments = paidInstallmentsCount

              const newTotalPaid = await tenantDb.installmentSchedule.aggregate({
                where: { planId: plan.id, tenantId },
                _sum: { paidAmount: true },
              })

              const isPlanCompleted = newPaidInstallments >= plan.numberOfInstallments

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

              console.log('[ReceivePayment] InstallmentPlan updated:', {
                planId: plan.id,
                paidInstallments: newPaidInstallments,
                totalPaidAmount: newTotalPaid._sum.paidAmount || 0,
                isPlanCompleted,
              })
            }

            installmentUpdated = true
            console.log('[ReceivePayment] InstallmentSchedule updated:', installmentId)
          } else {
            console.warn('[ReceivePayment] InstallmentSchedule not found:', installmentId)
          }
        } catch (instErr: any) {
          console.warn('[ReceivePayment] Installment update failed:', instErr?.message)
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
// ★ v5.4.0: پیدا کردن حساب دریافتنی از روی سند فروش همان فاکتور
// ═══════════════════════════════════════════════════════════════
async function resolveReceivableAccountIdFromInvoiceJournal(
  tenantDb: any,
  tenantId: string,
  invoiceId: string
): Promise<string | null> {
  try {
    // ★ بدون فیلتر status در دیتابیس تا با posted / POSTED سازگار باشد
    const entries = await tenantDb.journalEntry.findMany({
      where: {
        tenantId,
        sourceId: invoiceId,
      },
      select: {
        id: true,
        sourceType: true,
        status: true,
        date: true,
      },
      orderBy: {
        date: 'asc',
      },
    })

    if (!entries || entries.length === 0) {
      return null
    }

    // فقط اسناد ثبت‌شده
    const postedEntries = entries.filter((entry: any) => {
      const status = String(entry.status || '').toLowerCase().trim()
      return status === 'posted'
    })

    if (postedEntries.length === 0) {
      return null
    }

    // اسناد پرداخت قبلی را کنار می‌گذاریم تا حساب صندوق/بانک اشتباه گرفته نشود
    const saleEntries = postedEntries.filter((entry: any) => {
      const sourceType = String(entry.sourceType || '').toLowerCase().trim()
      return sourceType !== 'invoice_payment'
    })

    const targetEntries = saleEntries.length > 0 ? saleEntries : postedEntries
    const entryIds = targetEntries.map((entry: any) => entry.id)

    const lines = await tenantDb.journalEntryLine.findMany({
      where: {
        journalEntryId: { in: entryIds },
      },
      select: {
        accountId: true,
        debit: true,
        credit: true,
      },
    })

    // فقط خطوط بدهکار را بررسی می‌کنیم؛ در فروش نسیه/اقساطی حساب دریافتنی بدهکار است
    const debitLines = lines.filter((line: any) => Number(line.debit || 0) > 0)

    if (debitLines.length === 0) {
      return null
    }

    const accountIds = Array.from(
      new Set(debitLines.map((line: any) => line.accountId).filter(Boolean))
    )

    if (accountIds.length === 0) {
      return null
    }

    const accountModel = (tenantDb as any).account || (tenantDb as any).Account

    if (!accountModel) {
      console.warn('[ReceivePayment] Account model not found for receivable resolution')
      return null
    }

    const accounts = await accountModel.findMany({
      where: {
        id: { in: accountIds },
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    })

    const accountMap = new Map<string, any>(
      accounts.map((account: any) => [account.id, account])
    )

    let bestAccountId: string | null = null
    let bestScore = 0

    for (const line of debitLines) {
      const account = accountMap.get(line.accountId)
      if (!account) continue

      const code = String(account.code || '').trim()
      const name = String(account.name || '')
      const type = String(account.type || '')

      let score = 0

      // اولویت دقیق با کد حساب
      if (code === '1300') {
        score = 100
      } else if (code === '1310') {
        score = 90
      } else if (code.startsWith('13')) {
        score = 80
      }

      // اولویت بر اساس نام حساب
      if (
        name.includes('حساب‌های دریافتنی') ||
        name.includes('حساب های دریافتنی') ||
        name.includes('دریافتنی')
      ) {
        score = Math.max(score, 70)
      }

      if (name.includes('بدهکاران تجاری')) {
        score = Math.max(score, 60)
      }

      // اولویت بر اساس نوع حساب
      if (type.includes('دریافتنی')) {
        score = Math.max(score, 50)
      }

      if (score > bestScore) {
        bestScore = score
        bestAccountId = line.accountId
      }
    }

    if (bestAccountId && bestScore >= 50) {
      console.log('[ReceivePayment] ✅ Receivable account resolved from sale journal:', {
        invoiceId,
        accountId: bestAccountId,
        score: bestScore,
      })

      return bestAccountId
    }

    console.log('[ReceivePayment] ℹ️ No receivable account found in sale journal:', {
      invoiceId,
      checkedAccounts: accounts.map((a: any) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
      })),
    })

    return null
  } catch (err: any) {
    console.warn(
      '[ReceivePayment] resolveReceivableAccountIdFromInvoiceJournal failed:',
      err?.message
    )

    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// ★ v5.4.0: پیدا کردن حساب چک‌های دریافتنی برای پرداخت چکی
// ═══════════════════════════════════════════════════════════════
async function resolveCheckReceivableAccountId(
  tenantDb: any,
  tenantId: string,
  accIds: any
): Promise<string | null> {
  try {
    // اگر getStandardAccountIds حساب چک دارد، از همان استفاده کن
    const candidateIds = [
      accIds?.checksReceivableId,
      accIds?.checkReceivableId,
      accIds?.notesReceivableId,
      accIds?.notesReceivableAccountId,
    ].filter(Boolean)

    if (candidateIds.length > 0) {
      return candidateIds[0]
    }

    // در غیر این صورت حساب ۱۳۵۰ یا حاوی کلمه چک را پیدا کن
    const accountModel = (tenantDb as any).account || (tenantDb as any).Account

    if (!accountModel) {
      return null
    }

    const checkAccount = await accountModel.findFirst({
      where: {
        tenantId,
        OR: [
          { code: '1350' },
          { name: { contains: 'چک' } },
        ],
      },
      orderBy: {
        code: 'asc',
      },
      select: {
        id: true,
      },
    })

    return checkAccount?.id || null
  } catch (err: any) {
    console.warn('[ReceivePayment] resolveCheckReceivableAccountId failed:', err?.message)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helper: ایجاد سند حسابداری برای دریافت وجه
//  ★ v5.4.0:
//    - اول حساب دریافتنی از سند فروش همان فاکتور پیدا می‌شود
//    - اگر نبود، از accIds.receivablesAccountId استفاده می‌شود
//    - اگر آن هم نبود، از accIds.tradeReceivableId استفاده می‌شود
//    - برای پرداخت چکی، حساب چک‌های دریافتنی در اولویت است
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
  try {
    // ★ v5.2.0: گرفتن حساب‌های استاندارد با auto-seed
    const accIds = await getStandardAccountIds(tenantId)

    // ★ انتخاب حساب بدهکار بر اساس روش پرداخت
    let debitAccountId: string | null = null
    const isCash = paymentMethod === 'cash'
    const isCard = paymentMethod === 'card'
    const isCheck = paymentMethod === 'check'

    if (isCash) {
      debitAccountId = accIds.cashAccountId
    } else if (isCard) {
      debitAccountId = accIds.bankAccountId || accIds.cashAccountId
    } else if (isCheck) {
      // ★ پرداخت چکی باید چک‌های دریافتنی را بدهکار کند، نه صندوق
      debitAccountId = await resolveCheckReceivableAccountId(tenantDb, tenantId, accIds)

      // اگر حساب چک پیدا نشد، fallback امن
      if (!debitAccountId) {
        debitAccountId = accIds.bankAccountId || accIds.cashAccountId
        console.warn('[ReceivePayment] Check receivable account not found — falling back to bank/cash')
      }
    } else {
      debitAccountId = accIds.cashAccountId
    }

    if (!debitAccountId) {
      console.warn('[ReceivePayment] Debit account not found — skipping journal entry')
      return null
    }

    // ★ v5.3.0/v5.4.0: پیدا کردن حساب دریافتنی از روی سند فروش همان فاکتور
    const saleReceivableAccountId = await resolveReceivableAccountIdFromInvoiceJournal(
      tenantDb,
      tenantId,
      invoice.id
    )

    // ★ fallback امن:
    //   ۱. همان حسابی که فروش با آن بدهکار شده
    //   ۲. حساب استاندارد دریافتنی
    //   ۳. حساب بدهکاران تجاری
    const receivablesAccountId =
      saleReceivableAccountId ||
      accIds.receivablesAccountId ||
      accIds.tradeReceivableId

    if (!receivablesAccountId) {
      console.warn('[ReceivePayment] Accounts Receivable account not found — skipping journal entry')
      return null
    }

    const paymentMethodLabel =
      isCash ? 'نقدی' :
      isCard ? 'کارتخوان/بانکی' :
      isCheck ? 'چک' :
      paymentMethod

    console.log('[ReceivePayment] 🧾 Journal account selection:', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      paymentMethod,
      debitAccountId,
      saleReceivableAccountId: saleReceivableAccountId || null,
      accIdsReceivablesAccountId: accIds.receivablesAccountId || null,
      accIdsTradeReceivableId: accIds.tradeReceivableId || null,
      finalReceivablesAccountId: receivablesAccountId,
    })

    // ★ ایجاد سند حسابداری
    const jeCount = await tenantDb.journalEntry.count({ where: { tenantId } })
    const journalNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`
    const description = `دریافت وجه فاکتور ${invoice.number}${notes ? ' - ' + notes : ''}`

    const entry = await tenantDb.journalEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        number: journalNumber,
        date: paidAt,
        description,
        status: 'posted',
        sourceType: 'invoice_payment',
        sourceId: invoice.id,
        totalDebit: amount,
        totalCredit: amount,
        isCancelled: false,
      },
    })

    // ★ خط ۱: بدهکار — صندوق/بانک/چک‌های دریافتنی
    await tenantDb.journalEntryLine.create({
      data: {
        id: randomUUID(),
        journalEntryId: entry.id,
        accountId: debitAccountId,
        debit: amount,
        credit: 0,
        description: `دریافت ${paymentMethodLabel} - فاکتور ${invoice.number}`,
      },
    })

    // ★ خط ۲: بستانکار — همان حساب دریافتنی فاکتور فروش
    await tenantDb.journalEntryLine.create({
      data: {
        id: randomUUID(),
        journalEntryId: entry.id,
        accountId: receivablesAccountId,
        debit: 0,
        credit: amount,
        description: `تسویه بدهی فاکتور ${invoice.number}`,
      },
    })

    return entry.id
  } catch (err: any) {
    console.error('[ReceivePayment] createJournalEntryForPayment failed:', err?.message)
    return null
  }
}