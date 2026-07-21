// ============================================================================
// src/lib/zarinpal/settlement.ts — v8.6 ★★★
// ShopAccounting — Zarinpal Settlement Status Helper
// ----------------------------------------------------------------------------
// ★★★ v8.6: این ماژول توابع کمکی برای بررسی و به‌روزرسانی وضعیت تسویه
//   پرداخت‌های آنلاین را فراهم می‌کند.
//
// ★ منطق تسویه:
//   ۱) بلافاصله بعد از verify: settlementStatus = 'pending'
//   ۲) پس از ۲۴ ساعت: بررسی با API inquiry زرین‌پال
//      - اگر موفق → settlementStatus = 'settled', settlementDate = now
//      - اگر ناموفق → settlementStatus = 'pending' (هنوز صبر می‌کنیم)
//   ۳) پس از ۷۲ ساعت: اگر هنوز pending → settlementStatus = 'delayed'
//   ۴) پس از ۷ روز: اگر هنوز pending/delayed → settlementStatus = 'failed'
//
// ★ نکته: زرین‌پال API واقعی برای بررسی تسویه endpoint مستقلی ندارد.
//   ما از API inquiry (بررسی وضعیت تراکنش) استفاده می‌کنیم تا تأیید کنیم
//   پرداخت هنوز معتبر است. تسویه واقعی در پنل زرین‌پال انجام می‌شود.
// ============================================================================

import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  ثابت‌ها — زمان‌بندی تسویه
// ═══════════════════════════════════════════════════════════════

const SETTLEMENT_DELAY_HOURS = 24       // پس از ۲۴ ساعت، بررسی با inquiry
const SETTLEMENT_DELAYED_HOURS = 72     // پس از ۷۲ ساعت، علامت‌گذاری به‌عنوان delayed
const SETTLEMENT_FAILED_DAYS = 7        // پس از ۷ روز، علامت‌گذاری به‌عنوان failed

// ═══════════════════════════════════════════════════════════════
//  تایپ‌ها
// ═══════════════════════════════════════════════════════════════

export type SettlementStatus = 'pending' | 'settled' | 'delayed' | 'failed' | 'partial'

export interface SettlementCheckResult {
  paymentId: string
  tenantId: string
  invoiceId: string
  refId: string
  amount: number
  paidAt: Date
  hoursSincePaid: number
  previousStatus: string
  newStatus: SettlementStatus
  shouldNotify: boolean
  inquiryResult?: {
    valid: boolean
    code?: number
    message?: string
  }
}

export interface SettlementSyncStats {
  totalChecked: number
  settled: number
  delayed: number
  failed: number
  stillPending: number
  errors: number
  details: SettlementCheckResult[]
}

// ═══════════════════════════════════════════════════════════════
//  تابع کمکی: تشخیص اینکه آیا فیلد در Prisma Client موجود است
// ═══════════════════════════════════════════════════════════════

function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fieldsRaw = (model as any).fields as unknown
    const fields = (fieldsRaw || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
}

// ═══════════════════════════════════════════════════════════════
//  getPendingSettlements — یافتن پرداخت‌های نیازمند بررسی تسویه
// ═══════════════════════════════════════════════════════════════

export async function getPendingSettlements(): Promise<any[]> {
  const isSettlementStatusSupported = isFieldSupported(db.client.onlinePayment, 'settlementStatus')

  if (!isSettlementStatusSupported) {
    console.warn('[Settlement] settlementStatus field not supported, skipping')
    return []
  }

  // ★ پیدا کردن پرداخت‌های paid که settlementStatus در حالت غیر settled است
  const payments = await db.client.onlinePayment.findMany({
    where: {
      status: 'paid',
      settlementStatus: { not: 'settled' },
      paidAt: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      invoiceId: true,
      amount: true,
      refId: true,
      authority: true,
      paidAt: true,
      settlementStatus: true,
      gatewayType: true,
    },
  })

  console.log(`[Settlement] Found ${payments.length} payments with pending/delayed/failed settlement`)

  return payments
}

// ═══════════════════════════════════════════════════════════════
//  inquiryZarinpalTransaction — بررسی وضعیت تراکنش با API زرین‌پال
// ----------------------------------------------------------------------------
//  ★ این تابع از API inquiry زرین‌پال استفاده می‌کند تا تأیید کند
//    تراکنش هنوز معتبر است (یعنی پول از مشتری کسر شده).
//  ★ نکته: این API وضعیت تسویه به شبا را برنمی‌گرداند، ولی تأیید می‌کند
//    که تراکنش معتبر است.
// ═══════════════════════════════════════════════════════════════

export async function inquiryZarinpalTransaction(
  merchantId: string,
  authority: string,
  amount: number
): Promise<{ valid: boolean; code?: number; message?: string }> {
  const isSandbox = process.env.ZARINPAL_SANDBOX === 'true'
  const inquiryUrl = isSandbox
    ? 'https://sandbox.zarinpal.com/pg/v4/payment/inquiry.json'
    : 'https://api.zarinpal.com/pg/v4/payment/inquiry.json'

  try {
    const response = await fetch(inquiryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        authority,
        amount: Math.round(amount),
      }),
    })

    const data = await response.json()

    console.log('[Settlement] Inquiry response:', data)

    // ★ کد ۱۰۰ یا ۲۰۰ = تراکنش معتبر
    if (data?.data?.code === 100 || data?.data?.code === 200) {
      return { valid: true, code: data.data.code }
    }

    return {
      valid: false,
      code: data?.data?.code,
      message: data?.errors?.[0]?.message || 'تراکنش نامعتبر است',
    }
  } catch (err: any) {
    console.error('[Settlement] Inquiry failed:', err?.message)
    return { valid: false, message: err?.message || 'خطا در ارتباط با زرین‌پال' }
  }
}

// ═══════════════════════════════════════════════════════════════
//  determineSettlementStatus — تعیین وضعیت تسویه بر اساس زمان
// ═══════════════════════════════════════════════════════════════

export function determineSettlementStatus(
  paidAt: Date,
  inquiryValid: boolean
): { status: SettlementStatus; shouldNotify: boolean } {
  const now = new Date()
  const hoursSincePaid = (now.getTime() - paidAt.getTime()) / (1000 * 60 * 60)
  const daysSincePaid = hoursSincePaid / 24

  // ★ اگر تراکنش نامعتبر است → failed
  if (!inquiryValid) {
    return { status: 'failed', shouldNotify: true }
  }

  // ★ پس از ۷ روز → failed (نباید اینقدر طول بکشد)
  if (daysSincePaid >= SETTLEMENT_FAILED_DAYS) {
    return { status: 'failed', shouldNotify: true }
  }

  // ★ پس از ۷۲ ساعت → delayed (هشدار)
  if (hoursSincePaid >= SETTLEMENT_DELAYED_HOURS) {
    return { status: 'delayed', shouldNotify: true }
  }

  // ★ پس از ۲۴ ساعت → settled (اگر inquiry معتبر است)
  if (hoursSincePaid >= SETTLEMENT_DELAY_HOURS) {
    return { status: 'settled', shouldNotify: false }
  }

  // ★ کمتر از ۲۴ ساعت → still pending
  return { status: 'pending', shouldNotify: false }
}

// ═══════════════════════════════════════════════════════════════
//  updateSettlementStatus — به‌روزرسانی وضعیت تسویه در دیتابیس
// ═══════════════════════════════════════════════════════════════

export async function updateSettlementStatus(
  paymentId: string,
  newStatus: SettlementStatus,
  inquiryCode?: number
): Promise<void> {
  const isSettlementFieldsSupported = isFieldSupported(db.client.onlinePayment, 'settlementDate')

  const updateData: any = {
    settlementStatus: newStatus,
  }

  if (isSettlementFieldsSupported) {
    if (newStatus === 'settled') {
      updateData.settlementDate = new Date()
      // ★ کد پیگیری تسویه (در صورت وجود از inquiry استفاده می‌کنیم)
      updateData.settlementReferenceId = inquiryCode ? `INQ-${inquiryCode}` : null
    }
  }

  try {
    await db.client.onlinePayment.update({
      where: { id: paymentId },
      data: updateData,
    })
    console.log(`[Settlement] ✅ Updated payment ${paymentId} → ${newStatus}`)
  } catch (err: any) {
    console.error(`[Settlement] Failed to update payment ${paymentId}:`, err?.message)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
//  syncSettlements — تابع اصلی همگام‌سازی تسویه‌ها
// ----------------------------------------------------------------------------
//  ★ این تابع توسط cron job صدا زده می‌شود.
//  ★ برای هر پرداخت pending:
//    ۱) اگر کمتر از ۲۴ ساعت گذشته → skip
//    ۲) اگر بین ۲۴-۷۲ ساعت گذشته → inquiry + settle
//    ۳) اگر بین ۷۲ ساعت تا ۷ روز → mark as delayed
//    ۴) اگر بیشتر از ۷ روز → mark as failed
// ═══════════════════════════════════════════════════════════════

export async function syncSettlements(): Promise<SettlementSyncStats> {
  const stats: SettlementSyncStats = {
    totalChecked: 0,
    settled: 0,
    delayed: 0,
    failed: 0,
    stillPending: 0,
    errors: 0,
    details: [],
  }

  const merchantId = process.env.ZARINPAL_MERCHANT_ID
  if (!merchantId) {
    console.error('[Settlement] ZARINPAL_MERCHANT_ID not set')
    stats.errors++
    return stats
  }

  const payments = await getPendingSettlements()
  stats.totalChecked = payments.length

  if (payments.length === 0) {
    console.log('[Settlement] No pending settlements to process')
    return stats
  }

  for (const payment of payments) {
    try {
      const paidAt = new Date(payment.paidAt)
      const hoursSincePaid = (Date.now() - paidAt.getTime()) / (1000 * 60 * 60)

      // ★ اگر کمتر از ۲۴ ساعت گذشته، skip (هنوز زود است)
      if (hoursSincePaid < SETTLEMENT_DELAY_HOURS) {
        console.log(`[Settlement] Payment ${payment.id}: ${hoursSincePaid.toFixed(1)}h since paid, skipping (too early)`)
        stats.stillPending++
        continue
      }

      // ★ بررسی با API inquiry (فقط اگر authority موجود است)
      let inquiryValid = true // ★ پیش‌فرض: معتبر
      let inquiryCode: number | undefined

      if (payment.authority && payment.gatewayType === 'zarinpal') {
        const inquiryResult = await inquiryZarinpalTransaction(
          merchantId,
          payment.authority,
          Number(payment.amount) || 0
        )
        inquiryValid = inquiryResult.valid
        inquiryCode = inquiryResult.code
      }

      // ★ تعیین وضعیت جدید
      const { status: newStatus, shouldNotify } = determineSettlementStatus(paidAt, inquiryValid)

      // ★ اگر وضعیت تغییر کرده، به‌روزرسانی کن
      if (newStatus !== payment.settlementStatus) {
        await updateSettlementStatus(payment.id, newStatus, inquiryCode)

        switch (newStatus) {
          case 'settled': stats.settled++; break
          case 'delayed': stats.delayed++; break
          case 'failed': stats.failed++; break
          case 'pending': stats.stillPending++; break
        }

        stats.details.push({
          paymentId: payment.id,
          tenantId: payment.tenantId,
          invoiceId: payment.invoiceId,
          refId: payment.refId || '',
          amount: Number(payment.amount) || 0,
          paidAt,
          hoursSincePaid,
          previousStatus: payment.settlementStatus || 'pending',
          newStatus,
          shouldNotify,
          inquiryResult: inquiryValid ? { valid: true, code: inquiryCode } : { valid: false },
        })
      } else {
        stats.stillPending++
      }
    } catch (err: any) {
      console.error(`[Settlement] Error processing payment ${payment.id}:`, err?.message)
      stats.errors++
    }
  }

  console.log('[Settlement] Sync completed:', {
    total: stats.totalChecked,
    settled: stats.settled,
    delayed: stats.delayed,
    failed: stats.failed,
    pending: stats.stillPending,
    errors: stats.errors,
  })

  return stats
}

// ═══════════════════════════════════════════════════════════════
//  getSettlementSummary — خلاصه تسویه‌ها برای یک tenant
// ═══════════════════════════════════════════════════════════════

export async function getSettlementSummary(tenantId: string): Promise<{
  total: number
  settled: number
  pending: number
  delayed: number
  failed: number
  totalAmount: number
  settledAmount: number
  pendingAmount: number
}> {
  const isSettlementStatusSupported = isFieldSupported(db.client.onlinePayment, 'settlementStatus')

  if (!isSettlementStatusSupported) {
    return {
      total: 0, settled: 0, pending: 0, delayed: 0, failed: 0,
      totalAmount: 0, settledAmount: 0, pendingAmount: 0,
    }
  }

  const payments = await db.client.onlinePayment.findMany({
    where: { tenantId, status: 'paid' },
    select: {
      amount: true,
      settlementStatus: true,
    },
  })

  const summary = {
    total: payments.length,
    settled: 0,
    pending: 0,
    delayed: 0,
    failed: 0,
    totalAmount: 0,
    settledAmount: 0,
    pendingAmount: 0,
  }

  for (const p of payments) {
    const amount = Number(p.amount) || 0
    summary.totalAmount += amount

    switch (p.settlementStatus) {
      case 'settled':
        summary.settled++
        summary.settledAmount += amount
        break
      case 'pending':
        summary.pending++
        summary.pendingAmount += amount
        break
      case 'delayed':
        summary.delayed++
        summary.pendingAmount += amount
        break
      case 'failed':
        summary.failed++
        summary.pendingAmount += amount
        break
      default:
        summary.pending++
        summary.pendingAmount += amount
    }
  }

  return summary
}
