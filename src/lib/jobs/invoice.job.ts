/**
 * Invoice Job Worker - ShopAccounting v5.0
 * 
 * ✅ اصلاحات v5.0:
 * - اضافه شدن fallback برای job type نامعتبر (بجای خطا، لاگ و skip)
 * - پشتیبانی از هر دو فرمت job data قدیم (action) و جدید (type)
 * - بهبود مدیریت خطا
 *
 * Processes background jobs for invoice operations:
 * - Stock updates after invoice creation
 * - Customer balance updates
 * - Auto journal entry generation
 * - Low stock notifications
 */

import { Worker, Job } from 'bullmq'
import { QUEUE_NAMES } from '@/lib/queue'
import { processInvoicePostCreation } from '@/lib/services/invoice.service'
import { logJobEvent, jobLogger } from '@/lib/logger'
import type { InvoiceJobData } from '@/lib/queue'

// ============================================
// Worker Configuration
// ============================================

const WORKER_OPTIONS = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
}

// ============================================
// Job Handlers
// ============================================

const jobHandlers: Record<string, (job: Job<InvoiceJobData>) => Promise<void>> = {
  /**
   * Process post-creation tasks for a new invoice
   * This runs AFTER the invoice response is returned to the client
   */
  async 'create'(job: Job<InvoiceJobData>) {
    const { invoiceId, tenantId, payload } = job.data
    jobLogger.info({ jobId: job.id, invoiceId, tenantId }, 'Processing invoice post-creation')

    await processInvoicePostCreation(
      invoiceId,
      tenantId,
      (payload?.items as Array<{ productId?: string | null; quantity: number; productName: string }>) || [],
      payload?.customerId as string | undefined | null,
      payload?.paymentType as string | undefined,
      payload?.invoiceNumber as string | undefined,
      payload?.totalAmount as number | undefined,
      payload?.cashierId as string | undefined | null
    )
  },

  /**
   * Update invoice status (e.g., mark as paid, overdue)
   */
  async 'update-status'(job: Job<InvoiceJobData>) {
    const { invoiceId, tenantId, payload } = job.data
    jobLogger.info({ jobId: job.id, invoiceId, tenantId, newStatus: payload?.status }, 'Updating invoice status')

    const { db } = await import('@/lib/db')
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: payload?.status as string },
    })
  },

  /**
   * Generate journal entry for an existing invoice
   */
  async 'generate-journal-entry'(job: Job<InvoiceJobData>) {
    const { invoiceId, tenantId } = job.data
    jobLogger.info({ jobId: job.id, invoiceId, tenantId }, 'Generating journal entry for invoice')
    // Already handled in processInvoicePostCreation
  },

  /**
   * Update product stock levels
   */
  async 'update-stock'(job: Job<InvoiceJobData>) {
    const { invoiceId, tenantId, payload } = job.data
    jobLogger.info({ jobId: job.id, invoiceId, tenantId }, 'Updating stock for invoice')
    // Stock updates are handled in processInvoicePostCreation
  },
}

// ============================================
// Create and Start Worker
// ============================================

let workerInstance: Worker<InvoiceJobData> | null = null

export function startInvoiceWorker(): Worker<InvoiceJobData> {
  if (workerInstance) return workerInstance

  workerInstance = new Worker<InvoiceJobData>(
    QUEUE_NAMES.INVOICE,
    async (job: Job<InvoiceJobData>) => {
      const startTime = Date.now()
      logJobEvent(QUEUE_NAMES.INVOICE, job.id || 'unknown', 'started')

      try {
        // ✅ اصلاح حیاتی: پشتیبانی از هر دو فرمت قدیم و جدید
        // فرمت جدید: type: 'create' (از invoices/route.ts اصلاح شده)
        // فرمت قدیمی: action: 'process' یا بدون type (از نسخه‌های قبلی)
        let jobType = job.data.type
        
        // ✅ Fallback: اگر type وجود نداشت ولی action بود
        if (!jobType && (job.data as any).action === 'process') {
          jobType = 'create'
          jobLogger.info({ jobId: job.id }, 'Legacy job format detected (action=process), treating as create')
        }

        // ✅ اگر باز هم type مشخص نیست، لاگ بگیر و skip کن (بجای خطا و retry بی‌نهایت)
        if (!jobType) {
          jobLogger.warn({ jobId: job.id, data: job.data }, 'Unknown job type - skipping job')
          logJobEvent(QUEUE_NAMES.INVOICE, job.id || 'unknown', 'completed', Date.now() - startTime, {
            reason: 'missing type field',
            data: JSON.stringify(job.data),
          })
          return  // ✅ بدون خطا برگرد - BullMQ این job رو completed حساب میکنه
        }

        const handler = jobHandlers[jobType]
        if (!handler) {
          jobLogger.warn({ jobId: job.id, jobType }, `Unknown job type: ${jobType} - skipping job`)
          logJobEvent(QUEUE_NAMES.INVOICE, job.id || 'unknown', 'completed', Date.now() - startTime, {
            reason: `unknown type: ${jobType}`,
          })
          return  // ✅ بدون خطا برگرد
        }

        await handler(job)
        logJobEvent(QUEUE_NAMES.INVOICE, job.id || 'unknown', 'completed', Date.now() - startTime)
      } catch (error) {
        logJobEvent(QUEUE_NAMES.INVOICE, job.id || 'unknown', 'failed', Date.now() - startTime, {
          error: (error as Error).message,
        })
        throw error // Re-throw so BullMQ handles retry
      }
    },
    WORKER_OPTIONS
  )

  // Worker event handlers
  workerInstance.on('completed', (job) => {
    jobLogger.debug({ jobId: job.id }, 'Invoice job completed')
  })

  workerInstance.on('failed', (job, err) => {
    jobLogger.error({ jobId: job?.id, error: err.message }, 'Invoice job failed')
  })

  workerInstance.on('error', (err) => {
    jobLogger.error({ error: err.message }, 'Invoice worker error')
  })

  jobLogger.info('Invoice worker started')
  return workerInstance
}

/**
 * Stop the invoice worker gracefully
 */
export async function stopInvoiceWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close()
    workerInstance = null
    jobLogger.info('Invoice worker stopped')
  }
}

export default startInvoiceWorker