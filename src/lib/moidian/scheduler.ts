// ============================================================================
// src/lib/moidian/scheduler.ts — موتور زمان‌بندی داخلی سامانه مودیان
// ============================================================================
// ★ این فایل جایگزین cron-job خارجی می‌شود.
// ★ در src/instrumentation.ts در هنگام startup سرور راه‌اندازی می‌شود.
// ★ وظایف:
//   ۱. ارسال فاکتورهای PENDING و NULL (جدید) به مودیان
//   ۲. استعلام وضعیت فاکتورهای SUBMITTED
//   ۳. تلاش مجدد برای فاکتورهای FAILED (با محدودیت retry)
//   ۴. مدیریت graceful shutdown
// ★ ویژگی‌ها:
//   - Idempotent: اگر چند instance از Next.js اجرا شوند، مشکلی ایجاد نمی‌کند
//   - Tenant isolation: هر tenant جداگانه پردازش می‌شود
//   - Rate limiting: هر چرخه حداکثر N فاکتور را پردازش می‌کند
//   - لاگ‌گیری دقیق و قابل پایش
// ============================================================================

import { db } from '@/lib/db'
import {
  submitInvoiceToMoidian,
  queryInvoiceStatusInMoidian,
  getMoidianSettings,
} from './index'

// ─── Typings ──────────────────────────────────────────────────

export interface MoidianSchedulerStatus {
  isRunning: boolean
  isProcessing: boolean
  startedAt: Date | null
  lastRunAt: Date | null
  lastRunStats: {
    processedTenants: number
    processedInvoices: number
    errors: number
    durationMs: number
  }
  intervalMs: number
}

interface CycleStats {
  processedTenants: number
  processedInvoices: number
  errors: number
  durationMs: number
}

// ─── کلاس Scheduler ────────────────────────────────────────────

class MoidianScheduler {
  private isRunning = false
  private isProcessing = false
  private interval: NodeJS.Timeout | null = null
  private startedAt: Date | null = null
  private lastRunAt: Date | null = null
  private lastRunStats: CycleStats = {
    processedTenants: 0,
    processedInvoices: 0,
    errors: 0,
    durationMs: 0,
  }

  // ─── تنظیمات (قابل تنظیم) ───────────────────────────────
  private readonly INTERVAL_MS = 5 * 60 * 1000 // ۵ دقیقه
  private readonly INITIAL_DELAY_MS = 30 * 1000 // ۳۰ ثانیه تاخیر اولیه
  private readonly MAX_RETRY = 3 // حداکثر تلاش مجدد
  private readonly BATCH_SIZE = 30 // حداکثر فاکتور در هر چرخه برای هر tenant

  // ══════════════════════════════════════════════════════════
  //  شروع Scheduler
  // ══════════════════════════════════════════════════════════

  start(): void {
    if (this.isRunning) {
      console.log('[MoidianScheduler] ⚠️  Already running')
      return
    }

    // ★ فقط در محیط Node.js اجرا شود (نه Edge)
    if (typeof process === 'undefined' || !process.on) {
      console.log('[MoidianScheduler] ⏭️  Skipped (not Node.js runtime)')
      return
    }

    this.isRunning = true
    this.startedAt = new Date()
    console.log('[MoidianScheduler] 🚀 Starting...')

    // ★ اجرای اولیه با تاخیر (برای اطمینان از آماده بودن دیتابیس)
    setTimeout(() => {
      this.runCycle().catch((err) =>
        console.error('[MoidianScheduler] Initial run error:', err)
      )
    }, this.INITIAL_DELAY_MS)

    // ★ اجرای دوره‌ای
    this.interval = setInterval(() => {
      this.runCycle().catch((err) =>
        console.error('[MoidianScheduler] Periodic run error:', err)
      )
    }, this.INTERVAL_MS)

    // ★ Graceful shutdown
    this.registerShutdownHandlers()

    console.log(
      `[MoidianScheduler] ✅ Started (interval: ${this.INTERVAL_MS / 1000}s, initial delay: ${this.INITIAL_DELAY_MS / 1000}s)`
    )
  }

  // ══════════════════════════════════════════════════════════
  //  توقف Scheduler
  // ══════════════════════════════════════════════════════════

  stop(): void {
    if (!this.isRunning) return

    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.isRunning = false
    console.log('[MoidianScheduler] 🛑 Stopped')
  }

  // ══════════════════════════════════════════════════════════
  //  Trigger دستی (برای دکمه UI)
  // ══════════════════════════════════════════════════════════

  async triggerManual(): Promise<CycleStats> {
    console.log('[MoidianScheduler] 🎯 Manual trigger received')
    if (this.isProcessing) {
      console.log('[MoidianScheduler] ⏳ Previous cycle still running, queueing...')
      // صبر می‌کنیم تا چرخه فعلی تمام شود
      while (this.isProcessing) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    await this.runCycle()
    return this.lastRunStats
  }

  // ══════════════════════════════════════════════════════════
  //  وضعیت (برای UI)
  // ══════════════════════════════════════════════════════════

  getStatus(): MoidianSchedulerStatus {
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      startedAt: this.startedAt,
      lastRunAt: this.lastRunAt,
      lastRunStats: { ...this.lastRunStats },
      intervalMs: this.INTERVAL_MS,
    }
  }

  // ══════════════════════════════════════════════════════════
  //  چرخه اصلی پردازش
  // ══════════════════════════════════════════════════════════

  private async runCycle(): Promise<void> {
    if (this.isProcessing) {
      console.log('[MoidianScheduler] ⏭️  Previous cycle still running, skipping...')
      return
    }

    this.isProcessing = true
    const startTime = Date.now()
    const stats: CycleStats = {
      processedTenants: 0,
      processedInvoices: 0,
      errors: 0,
      durationMs: 0,
    }

    try {
      console.log('[MoidianScheduler] 🔄 Starting cycle...')

      // ★ یافتن همه tenants فعال با مودیان پیکربندی‌شده
      const tenants = await db.client.moidianSettings.findMany({
        where: {
          isInitialized: true,
          autoSubmit: true,
          tenant: {
            status: 'active',
          },
        },
        select: {
          tenantId: true,
          environment: true,
        },
      })

      console.log(
        `[MoidianScheduler] 📊 Found ${tenants.length} active tenants with moidian configured`
      )

      // ★ پردازش هر tenant به صورت سری (برای جلوگیری از فشار زیاد به سرور)
      for (const tenantSettings of tenants) {
        try {
          const invoicesProcessed = await this.processTenant(tenantSettings.tenantId)
          stats.processedTenants++
          stats.processedInvoices += invoicesProcessed
        } catch (err: any) {
          stats.errors++
          console.error(
            `[MoidianScheduler] ❌ Error processing tenant ${tenantSettings.tenantId}:`,
            err?.message
          )
        }
      }

      stats.durationMs = Date.now() - startTime
      this.lastRunAt = new Date()
      this.lastRunStats = stats

      console.log(
        `[MoidianScheduler] ✅ Cycle completed in ${stats.durationMs}ms. ` +
          `Tenants: ${stats.processedTenants}, Invoices: ${stats.processedInvoices}, Errors: ${stats.errors}`
      )
    } catch (err: any) {
      stats.errors++
      stats.durationMs = Date.now() - startTime
      this.lastRunStats = stats
      console.error('[MoidianScheduler] ❌ Cycle error:', err?.message)
    } finally {
      this.isProcessing = false
    }
  }

  // ══════════════════════════════════════════════════════════
  //  پردازش یک tenant
  // ══════════════════════════════════════════════════════════

  private async processTenant(tenantId: string): Promise<number> {
    let count = 0

    // ── ۱. ارسال فاکتورهای PENDING (و NULL برای فاکتورهای قدیمی) ────
    const pendingInvoices = await db.client.invoice.findMany({
      where: {
        tenantId,
        invoiceType: { in: ['sale', 'sale_return'] }, // فقط فروش (نه service)
        OR: [
          { moidianStatus: 'PENDING' },
          // فاکتورهایی که هنوز به مودیان ارسال نشده‌اند ولی پرداخت شده‌اند
          {
            moidianStatus: null,
            status: { in: ['paid', 'PAID', 'confirmed', 'Confirmed'] },
            totalAmount: { gt: 0 },
          },
        ],
      },
      take: this.BATCH_SIZE,
      select: { id: true, number: true },
      orderBy: { createdAt: 'asc' }, // FIFO
    })

    if (pendingInvoices.length > 0) {
      console.log(
        `[MoidianScheduler] 📤 Tenant ${tenantId.slice(0, 8)}...: ${pendingInvoices.length} pending invoices`
      )
    }

    for (const inv of pendingInvoices) {
      try {
        const result = await submitInvoiceToMoidian(tenantId, inv.id)
        if (result.success) {
          count++
          console.log(
            `[MoidianScheduler] ✅ Invoice ${inv.number} submitted (ref: ${result.referenceId})`
          )
        } else {
          console.warn(
            `[MoidianScheduler] ⚠️  Invoice ${inv.number} failed: ${result.error}`
          )
        }
        // ★ Rate limiting: 500ms بین هر ارسال
        await this.sleep(500)
      } catch (err: any) {
        console.error(
          `[MoidianScheduler] ❌ Error submitting invoice ${inv.id}:`,
          err?.message
        )
      }
    }

    // ── ۲. استعلام وضعیت فاکتورهای SUBMITTED ──────────────────────
    const submittedInvoices = await db.client.invoice.findMany({
      where: {
        tenantId,
        moidianStatus: 'SUBMITTED',
        moidianReferenceId: { not: null },
      },
      take: this.BATCH_SIZE,
      select: { id: true, number: true, moidianReferenceId: true },
      orderBy: { moidianSubmittedAt: 'asc' },
    })

    if (submittedInvoices.length > 0) {
      console.log(
        `[MoidianScheduler] 🔍 Tenant ${tenantId.slice(0, 8)}...: ${submittedInvoices.length} submitted invoices to query`
      )
    }

    for (const inv of submittedInvoices) {
      if (!inv.moidianReferenceId) continue
      try {
        const result = await queryInvoiceStatusInMoidian(
          tenantId,
          inv.moidianReferenceId
        )
        if (result.success) {
          count++
          console.log(
            `[MoidianScheduler] ✅ Invoice ${inv.number} status: ${result.status}`
          )
        }
        await this.sleep(300)
      } catch (err: any) {
        console.error(
          `[MoidianScheduler] ❌ Error querying invoice ${inv.id}:`,
          err?.message
        )
      }
    }

    // ── ۳. تلاش مجدد برای فاکتورهای FAILED ────────────────────────
    const failedInvoices = await db.client.invoice.findMany({
      where: {
        tenantId,
        moidianStatus: 'FAILED',
        moidianRetryCount: { lt: this.MAX_RETRY },
      },
      take: Math.floor(this.BATCH_SIZE / 3), // محدودتر
      select: { id: true, number: true, moidianRetryCount: true },
      orderBy: { createdAt: 'asc' },
    })

    if (failedInvoices.length > 0) {
      console.log(
        `[MoidianScheduler] 🔁 Tenant ${tenantId.slice(0, 8)}...: ${failedInvoices.length} failed invoices to retry`
      )
    }

    for (const inv of failedInvoices) {
      try {
        // ★ بررسی فاصله زمانی بین retry ها (حداقل ۱ ساعت)
        const invoice = await db.client.invoice.findUnique({
          where: { id: inv.id },
          select: { updatedAt: true },
        })
        if (invoice) {
          const hoursSinceUpdate =
            (Date.now() - invoice.updatedAt.getTime()) / (1000 * 60 * 60)
          if (hoursSinceUpdate < 1) continue // کمتر از ۱ ساعت صبر
        }

        const result = await submitInvoiceToMoidian(tenantId, inv.id)
        if (result.success) {
          count++
          console.log(
            `[MoidianScheduler] ✅ Invoice ${inv.number} retry succeeded (attempt #${(inv.moidianRetryCount || 0) + 1})`
          )
        }
        await this.sleep(1000)
      } catch (err: any) {
        console.error(
          `[MoidianScheduler] ❌ Error retrying invoice ${inv.id}:`,
          err?.message
        )
      }
    }

    return count
  }

  // ─── Helpers ────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private registerShutdownHandlers(): void {
    if (typeof process === 'undefined' || !process.on) return

    const shutdown = () => {
      console.log('[MoidianScheduler] 🔌 Shutting down...')
      this.stop()
    }

    // جلوگیری از ثبت تکراری
    if (!(globalThis as any).__moidianSchedulerShutdownRegistered) {
      process.once('SIGTERM', shutdown)
      process.once('SIGINT', shutdown)
      ;(globalThis as any).__moidianSchedulerShutdownRegistered = true
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Singleton Export
// ═══════════════════════════════════════════════════════════════

export const moidianScheduler = new MoidianScheduler()