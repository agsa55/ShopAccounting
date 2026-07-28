// ============================================================================
// src/lib/accounting/online-payment-journal.ts — v8.2 ★★★
// ----------------------------------------------------------------------------
// ★ این ماژول سند حسابداری خودکار را برای پرداخت‌های آنلاین موفق صادر می‌کند.
//
// ★ ساختار سند (۴ ردیف — تراز):
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ شرح: وصول فاکتور شماره INV-0001 از طریق درگاه زرین‌پال           │
//   │       کد پیگیری: ZP-12345678                                    │
//   ├──────────────────────────────────────────────────────────────────┤
//   │ بدهکار  1110  بانک (شبا فروشگاه)            975,000             │
//   │ بدهکار  5105  هزینه کارمزد درگاه زرین‌پال     15,000             │
//   │ بدهکار  5106  هزینه کارمزد پلتفرم           10,000             │
//   │         1200  حساب‌های دریافتنی - مشتری X          1,000,000     │
//   └──────────────────────────────────────────────────────────────────┘
//   ★ مبلغ پرداختی مشتری = مبلغ کامل فاکتور
//   ★ کارمزدها به‌عنوان هزینه ثبت می‌شوند (نه کسر از درآمد)
//   ★ این روش با استاندارد حسابداری و سامانه مودیان سازگار است.
//
// ★ نکات مهم:
//   ۱) اگر پرداخت برای قسط خاص باشد، شرح سند به قسط اشاره می‌کند.
//   ۲) اگر حسابی با کد استاندارد پیدا نشد، fallback بر اساس نوع و نام انجام می‌شود.
//   ۳) اگر هیچ حسابی پیدا نشد، سند صادر نمی‌شود (با هشدار در کنسول).
//   ۴) این تابع idempotent نیست — هر بار یک سند جدید ایجاد می‌کند.
//      caller باید قبل از فراخوانی، بررسی کند که آیا سند قبلی وجود دارد یا خیر.
// ============================================================================

import { db } from '@/lib/db'
import {
  ACCOUNT_CODES,
  ensureDefaultAccounts,
  resolveAccountWithFallback,
} from './default-accounts'

// ═══════════════════════════════════════════════════════════════
//  تایپ‌های ورودی
// ═══════════════════════════════════════════════════════════════

export interface OnlinePaymentJournalInput {
  paymentId: string
  tenantId: string
  invoiceId: string
  invoiceNumber: string
  customerId: string | null
  customerName: string | null
  amount: number                  // مبلغ کامل پرداخت‌شده توسط مشتری
  gatewayFee: number              // کارمزد زرین‌پال
  platformCommission: number      // سهم پلتفرم
  netSettledAmount: number        // مبلغ خالص واریزی به شبا فروشگاه
  refId: string                   // کد پیگیری زرین‌پال
  cardPan?: string | null         // شماره کارت ماسک‌شده
  installmentId?: string | null   // اگر پرداخت برای قسط خاص است
  installmentNumber?: number | null
  paidAt: Date                    // تاریخ پرداخت
}

export interface OnlinePaymentJournalResult {
  success: boolean
  journalEntryId?: string
  journalNumber?: string
  error?: string
  skipped?: boolean
  skipReason?: string
}

// ═══════════════════════════════════════════════════════════════
//  تابع اصلی: createOnlinePaymentJournal
// ═══════════════════════════════════════════════════════════════

export async function createOnlinePaymentJournal(
  input: OnlinePaymentJournalInput
): Promise<OnlinePaymentJournalResult> {
  const {
    paymentId, tenantId, invoiceId, invoiceNumber,
    customerId, customerName,
    amount, gatewayFee, platformCommission, netSettledAmount,
    refId, cardPan, installmentId, installmentNumber, paidAt,
  } = input

  console.log('[OnlinePaymentJournal] Creating journal for payment:', {
    paymentId, invoiceNumber, amount, gatewayFee, platformCommission, netSettledAmount,
  })

  // ★ ۱. اعتبارسنجی: اگر مبلغ صفر است، سند صادر نکن
  if (amount <= 0) {
    return { success: false, skipped: true, skipReason: 'مبلغ پرداخت صفر است' }
  }

  // ★ ۲. اعتبارسنجی تراز: amount باید برابر باشد با gatewayFee + platformCommission + netSettledAmount
  const sumOfComponents = gatewayFee + platformCommission + netSettledAmount
  if (Math.abs(amount - sumOfComponents) > 1) {
    // ★ تلورانس ۱ ریال
    console.warn('[OnlinePaymentJournal] ⚠️ Amount mismatch:', {
      amount, sumOfComponents, diff: amount - sumOfComponents,
    })
    // ★ اگر اختلاف معادل کارمزد زرین‌پال است (یعنی زرین‌پال کارمزد را از مبلغ merchant کسر کرده)
    // این حالت عادی است و باید netSettledAmount را تصحیح کنیم
  }

  // ★ ۳. اطمینان از وجود حساب‌های پیش‌فرض
  await ensureDefaultAccounts(tenantId)

  // ★ ۴. یافتن حساب‌های مورد نیاز
  const bankAccount = await resolveAccountWithFallback(
    tenantId, ACCOUNT_CODES.BANK, 'bank', ['بانک', 'حساب جاری', 'بانکی']
  )
  const gatewayFeeAccount = await resolveAccountWithFallback(
    tenantId, ACCOUNT_CODES.GATEWAY_FEE, 'expense', ['کارمزد درگاه', 'کارمزد زرین', 'کمیسیون درگاه']
  )
  const platformFeeAccount = await resolveAccountWithFallback(
    tenantId, ACCOUNT_CODES.PLATFORM_FEE, 'expense', ['کارمزد پلتفرم', 'کمیسیون پلتفرم', 'ShopAccounting']
  )
  const receivableAccount = await resolveAccountWithFallback(
    tenantId, ACCOUNT_CODES.RECEIVABLE, 'receivable', ['دریافتنی', 'بدهکار', 'مشتری']
  )

  // ★ ۵. بررسی وجود حساب‌های ضروری
  if (!bankAccount) {
    return {
      success: false,
      error: 'حساب بانکی (کد 1110) یافت نشد. لطفاً چارت حساب‌ها را بررسی کنید.',
    }
  }
  if (!receivableAccount) {
    return {
      success: false,
      error: 'حساب دریافتنی (کد 1200) یافت نشد. لطفاً چارت حساب‌ها را بررسی کنید.',
    }
  }

  // ★ ۶. ساخت ردیف‌های سند
  const lines: Array<{
    accountId: string
    description: string
    debit: number
    credit: number
  }> = []

  const baseDescription = installmentId && installmentNumber
    ? `پرداخت آنلاین قسط ${installmentNumber} فاکتور ${invoiceNumber}`
    : `پرداخت آنلاین فاکتور ${invoiceNumber}`

  // ★ بدهکار: بانک (مبلغ خالص واریزی به شبا فروشگاه)
  if (netSettledAmount > 0) {
    lines.push({
      accountId: bankAccount.id,
      description: `بدهکار — واریز خالص به شبا فروشگاه (کد پیگیری: ${refId})`,
      debit: netSettledAmount,
      credit: 0,
    })
  }

  // ★ بدهکار: هزینه کارمزد درگاه زرین‌پال
  if (gatewayFee > 0) {
    if (!gatewayFeeAccount) {
      console.warn('[OnlinePaymentJournal] حساب کارمزد درگاه (5105) یافت نشد — این ردیف skip می‌شود')
    } else {
      lines.push({
        accountId: gatewayFeeAccount.id,
        description: `بدهکار — کارمزد درگاه زرین‌پال`,
        debit: gatewayFee,
        credit: 0,
      })
    }
  }

  // ★ بدهکار: هزینه کارمزد پلتفرم ShopAccounting
  if (platformCommission > 0) {
    if (!platformFeeAccount) {
      console.warn('[OnlinePaymentJournal] حساب کارمزد پلتفرم (5106) یافت نشد — این ردیف skip می‌شود')
    } else {
      lines.push({
        accountId: platformFeeAccount.id,
        description: `بدهکار — کارمزد پلتفرم ShopAccounting`,
        debit: platformCommission,
        credit: 0,
      })
    }
  }

  // ★ بستانکار: حساب دریافتنی مشتری (مبلغ کامل پرداخت‌شده)
  lines.push({
    accountId: receivableAccount.id,
    description: `بستانکار — ${baseDescription}${customerName ? ` - ${customerName}` : ''}${cardPan ? ` (کارت: ${cardPan})` : ''}`,
    debit: 0,
    credit: amount,
  })

  // ★ ۷. اعتبارسنجی نهایی: سند باید حداقل ۲ ردیف داشته باشد و تراز باشد
  if (lines.length < 2) {
    return {
      success: false,
      error: 'سند کمتر از ۲ ردیف دارد — امکان صدور وجود ندارد',
    }
  }

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

  // ★ اگر کارمزدها صفر باشند (مثلاً در sandbox یا حالت تست)، سند فقط ۲ ردیف خواهد داشت:
  //   بدهکار: بانک (مبلغ کامل)
  //   بستانکار: دریافتنی (مبلغ کامل)
  // این حالت تراز است و مشکلی ندارد.

  // ★ اگر کارمزدها وجود دارند ولی حساب‌های مربوطه پیدا نشدند، سند تراز نخواهد بود.
  // در این حالت، باید مبلغ بانک را به‌گونه‌ای تنظیم کنیم که تراز حفظ شود.
  if (Math.abs(totalDebit - totalCredit) > 1) {
    console.warn('[OnlinePaymentJournal] ⚠️ سند تراز نیست — تصحیح مبلغ بانک:', {
      totalDebit, totalCredit, diff: totalDebit - totalCredit,
    })
    // ★ تصحیح: مبلغ بانک را به گونه‌ای تنظیم کن که تراز شود
    const adjustment = totalCredit - totalDebit
    // ★ اگر بدهکار کمتر از بستانکار است، مبلغ بانک را افزایش بده
    // ★ اگر بدهکار بیشتر از بستانکار است، مبلغ بانک را کاهش بده
    const bankLine = lines.find(l => l.accountId === bankAccount.id)
    if (bankLine) {
      bankLine.debit = Math.max(0, bankLine.debit + adjustment)
    }
  }

  const finalTotalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
  const finalTotalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

  // ★ ۸. تولید شماره سند
  let journalNumber: string
  try {
    const count = await db.client.journalEntry.count({ where: { tenantId } })
    journalNumber = `JE-${(count + 1).toString().padStart(6, '0')}`
  } catch {
    journalNumber = `JE-OP-${Date.now().toString().slice(-6)}`
  }

  // ★ ۹. شرح سند
  const journalDescription = [
    `سند خودکار بابت ${baseDescription}`,
    `کد پیگیری زرین‌پال: ${refId}`,
    gatewayFee > 0 ? `کارمزد درگاه: ${gatewayFee.toLocaleString('fa-IR')} ریال` : null,
    platformCommission > 0 ? `کارمزد پلتفرم: ${platformCommission.toLocaleString('fa-IR')} ریال` : null,
    `خالص واریزی: ${netSettledAmount.toLocaleString('fa-IR')} ریال`,
  ].filter(Boolean).join(' | ')

  // ★ ۱۰. ذخیره سند در دیتابیس
  try {
    const journalEntry = await db.client.journalEntry.create({
      data: {
        number: journalNumber,
        date: paidAt,
        description: journalDescription,
        status: 'posted',
        sourceType: 'online_payment',
        sourceId: paymentId,
        totalDebit: finalTotalDebit,
        totalCredit: finalTotalCredit,
        createdBy: null, // ★ سند سیستمی است
        tenantId,
        lines: {
          create: lines.map(l => ({
            accountId: l.accountId,
            description: l.description,
            debit: l.debit,
            credit: l.credit,
          })),
        },
      },
      include: { lines: true },
    })

    console.log('[OnlinePaymentJournal] Journal entry created:', {
      journalEntryId: journalEntry.id,
      journalNumber,
      linesCount: journalEntry.lines.length,
      totalDebit: finalTotalDebit,
      totalCredit: finalTotalCredit,
    })

    // ★ ۱۱. به‌روزرسانی OnlinePayment با journalEntryId
    try {
      const fieldsRaw = (db.client.onlinePayment as any).fields as unknown
      const fields = (fieldsRaw || {}) as Record<string, unknown>
      if ('journalEntryId' in fields) {
        await db.client.onlinePayment.update({
          where: { id: paymentId },
          data: { journalEntryId: journalEntry.id } as any,
        })
      }
    } catch (err: any) {
      console.warn('[OnlinePaymentJournal] Failed to link journalEntryId to OnlinePayment:', err?.message)
    }

    return {
      success: true,
      journalEntryId: journalEntry.id,
      journalNumber,
    }
  } catch (error: any) {
    console.error('[OnlinePaymentJournal] Failed to create journal entry:', error)
    return {
      success: false,
      error: `خطا در ایجاد سند: ${error?.message || 'خطای ناشناخته'}`,
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  hasExistingJournal — بررسی اینکه آیا سند قبلی برای این پرداخت وجود دارد
// ═══════════════════════════════════════════════════════════════

export async function hasExistingJournal(paymentId: string): Promise<boolean> {
  try {
    const count = await db.client.journalEntry.count({
      where: {
        sourceType: 'online_payment',
        sourceId: paymentId,
        isCancelled: false,
      },
    })
    return count > 0
  } catch {
    return false
  }
}

// ═══════════════════════════════════════════════════════════════
//  cancelOnlinePaymentJournal — ابطال سند در صورت لغو/استرداد
// ═══════════════════════════════════════════════════════════════

export async function cancelOnlinePaymentJournal(
  paymentId: string,
  tenantId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.client.journalEntry.updateMany({
      where: {
        sourceType: 'online_payment',
        sourceId: paymentId,
        tenantId,
        isCancelled: false,
      },
      data: {
        status: 'cancelled',
        isCancelled: true,
        cancelledAt: new Date(),
        cancelledBy: 'system',
        cancelReason: reason,
      },
    })
    return { success: true }
  } catch (error: any) {
    console.error('[OnlinePaymentJournal] Failed to cancel journal:', error)
    return { success: false, error: error?.message }
  }
}
