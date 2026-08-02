// ============================================================================
// src/lib/moidian/sync.ts — همگام‌سازی وضعیت فاکتورهای مودیان (v9.9)
// ============================================================================
// ★ این ماژول وضعیت فاکتورهای ارسال‌شده به مودیان را به‌صورت دوره‌ای استعلام
//   می‌کند و وضعیت آن‌ها را از SUBMITTED/PENDING به ACCEPTED/REJECTED/... به‌روز
//   می‌کند.
//
// ★ این تابع توسط cron job (/api/cron/moidian-sync) صدا زده می‌شود.
//
// ★ منطق:
//   ۱. پیدا کردن همه tenant هایی که مودیان آن‌ها فعال است (isInitialized)
//   ۲. برای هر tenant، یافتن فاکتورهای در وضعیت غیرنهایی
//   ۳. استعلام وضعیت هر فاکتور از مودیان (queryInvoiceStatusInMoidian)
//   ۴. به‌روزرسانی وضعیت + آمار (توسط queryInvoiceStatusInMoidian انجام می‌شود)
// ============================================================================

import { db } from '@/lib/db'
import { queryInvoiceStatusInMoidian } from './index'

// ─── Typings ──────────────────────────────────────────────────

export interface MoidianSyncStats {
  tenantsProcessed: number
  invoicesChecked: number
  accepted: number
  rejected: number
  cancelled: number
  stillPending: number
  errors: number
  details: Array<{
    tenantId: string
    invoiceId: string
    referenceId: string
    previousStatus: string
    newStatus: string
    success: boolean
    error?: string
  }>
}

// ─── ثابت‌ها ──────────────────────────────────────────────────

// ★ وضعیت‌هایی که هنوز به حالت نهایی نرسیده‌اند و نیاز به استعلام دارند
const PENDING_STATUSES = ['SUBMITTED', 'PENDING']

// ★ حداکثر تعداد فاکتور برای استعلام در هر tenant (جلوگیری از timeout)
const MAX_INVOICES_PER_TENANT = 50

// ★ حداقل زمان سپری‌شده از ارسال قبل از استعلام (فرصت پردازش به مودیان)
const MIN_AGE_BEFORE_CHECK_MS = 2 * 60 * 1000 // ۲ دقیقه

// ─── تابع اصلی همگام‌سازی ─────────────────────────────────────

export async function syncMoidianInvoices(): Promise<MoidianSyncStats> {
  const stats: MoidianSyncStats = {
    tenantsProcessed: 0,
    invoicesChecked: 0,
    accepted: 0,
    rejected: 0,
    cancelled: 0,
    stillPending: 0,
    errors: 0,
    details: [],
  }

  try {
    // ۱. پیدا کردن همه tenant هایی که مودیان آن‌ها فعال است
    const activeSettings = await db.client.moidianSettings.findMany({
      where: { isInitialized: true },
      select: { tenantId: true },
    })

    console.log(`[Moidian Sync] Found ${activeSettings.length} tenants with active moidian`)

    // ★ فقط فاکتورهایی که حداقل ۲ دقیقه از ارسالشان گذشته باشد
    const checkBefore = new Date(Date.now() - MIN_AGE_BEFORE_CHECK_MS)

    // ۲. برای هر tenant، فاکتورهای نیازمند استعلام را پردازش کن
    for (const setting of activeSettings) {
      const tenantId = setting.tenantId
      stats.tenantsProcessed++

      try {
        // پیدا کردن فاکتورهایی که در وضعیت غیرنهایی هستند
        const invoices = await db.client.invoice.findMany({
          where: {
            tenantId,
            moidianStatus: { in: PENDING_STATUSES },
            moidianReferenceId: { not: null },
            // ★ حداقل ۲ دقیقه از ارسال گذشته باشد (یا submittedAt null باشد)
            OR: [
              { moidianSubmittedAt: { lt: checkBefore } },
              { moidianSubmittedAt: null },
            ],
          },
          select: {
            id: true,
            number: true,
            moidianReferenceId: true,
            moidianStatus: true,
          },
          take: MAX_INVOICES_PER_TENANT,
          orderBy: { moidianSubmittedAt: 'asc' }, // قدیمی‌ترها اول
        })

        if (invoices.length === 0) continue

        console.log(`[Moidian Sync] Tenant ${tenantId}: ${invoices.length} invoices to check`)

        // ۳. استعلام وضعیت هر فاکتور
        for (const invoice of invoices) {
          stats.invoicesChecked++
          const referenceId = invoice.moidianReferenceId as string
          const previousStatus = invoice.moidianStatus || 'PENDING'

          try {
            // ★ این تابع خودش وضعیت را در DB به‌روز می‌کند
            //   و آمار totalAccepted/totalRejected را increment می‌کند
            const result = await queryInvoiceStatusInMoidian(tenantId, referenceId)

            if (result.success && result.status) {
              const newStatus = result.status

              // آمار بر اساس وضعیت جدید
              switch (newStatus) {
                case 'ACCEPTED':
                  stats.accepted++
                  break
                case 'REJECTED':
                case 'FAILED':
                  stats.rejected++
                  break
                case 'CANCELLED':
                  stats.cancelled++
                  break
                default:
                  // هنوز در انتظار (SUBMITTED/PENDING)
                  stats.stillPending++
              }

              stats.details.push({
                tenantId,
                invoiceId: invoice.id,
                referenceId,
                previousStatus,
                newStatus,
                success: true,
              })

              console.log(`[Moidian Sync] Invoice ${invoice.number}: ${previousStatus} → ${newStatus}`)
            } else {
              stats.errors++
              stats.details.push({
                tenantId,
                invoiceId: invoice.id,
                referenceId,
                previousStatus,
                newStatus: previousStatus,
                success: false,
                error: result.error,
              })
            }
          } catch (err: any) {
            stats.errors++
            console.error(`[Moidian Sync] Error querying invoice ${invoice.id}:`, err?.message)
            stats.details.push({
              tenantId,
              invoiceId: invoice.id,
              referenceId,
              previousStatus,
              newStatus: previousStatus,
              success: false,
              error: err?.message,
            })
          }
        }
      } catch (err: any) {
        stats.errors++
        console.error(`[Moidian Sync] Error processing tenant ${tenantId}:`, err?.message)
      }
    }

    console.log('[Moidian Sync] Completed:', {
      tenants: stats.tenantsProcessed,
      checked: stats.invoicesChecked,
      accepted: stats.accepted,
      rejected: stats.rejected,
      cancelled: stats.cancelled,
      pending: stats.stillPending,
      errors: stats.errors,
    })

    return stats
  } catch (err: any) {
    console.error('[Moidian Sync] Fatal error:', err?.message)
    stats.errors++
    return stats
  }
}