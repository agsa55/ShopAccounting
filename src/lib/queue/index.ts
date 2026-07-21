/**
 * BullMQ Job Queue Configuration
 * 
 * Background job processing for heavy operations:
 * - Invoice creation (journal entries, stock updates)
 * - Bulk data import/export
 * - Report generation
 * - Notification dispatch
 * - Database backup
 * - Sync operations
 * 
 * Usage:
 *   import { invoiceQueue } from '@/lib/queue'
 *   await invoiceQueue.add('create-invoice', { invoiceId: '...', tenantId: '...' })
 */

import { Queue, Worker, QueueScheduler, Job, QueueEvents } from 'bullmq'
import { getRedisClient } from '@/lib/redis'

// ============================================
// Queue Connection Options
// ============================================

const QUEUE_CONNECTION = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
}

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 100 },    // Keep last 100 completed jobs
  removeOnFail: { count: 500 },        // Keep last 500 failed jobs
  attempts: 3,                          // Retry up to 3 times
  backoff: {
    type: 'exponential' as const,
    delay: 1000,                        // Start with 1s, then 2s, 4s...
  },
}

// ============================================
// Queue Names
// ============================================

export const QUEUE_NAMES = {
  INVOICE: 'invoice-processing',
  NOTIFICATION: 'notification-dispatch',
  REPORT: 'report-generation',
  SYNC: 'data-sync',
  BACKUP: 'database-backup',
  CLEANUP: 'cleanup-tasks',
} as const

// ============================================
// Invoice Queue
// ============================================

let invoiceQueueInstance: Queue | null = null

export async function getInvoiceQueue(): Promise<Queue> {
  if (!invoiceQueueInstance) {
    await getRedisClient() // Ensure Redis is connected
    invoiceQueueInstance = new Queue(QUEUE_NAMES.INVOICE, {
      connection: QUEUE_CONNECTION,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return invoiceQueueInstance
}

// ============================================
// Notification Queue
// ============================================

let notificationQueueInstance: Queue | null = null

export async function getNotificationQueue(): Promise<Queue> {
  if (!notificationQueueInstance) {
    await getRedisClient()
    notificationQueueInstance = new Queue(QUEUE_NAMES.NOTIFICATION, {
      connection: QUEUE_CONNECTION,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 5, // More retries for notifications
      },
    })
  }
  return notificationQueueInstance
}

// ============================================
// Report Queue
// ============================================

let reportQueueInstance: Queue | null = null

export async function getReportQueue(): Promise<Queue> {
  if (!reportQueueInstance) {
    await getRedisClient()
    reportQueueInstance = new Queue(QUEUE_NAMES.REPORT, {
      connection: QUEUE_CONNECTION,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        timeout: 300000, // 5 minutes for reports
      },
    })
  }
  return reportQueueInstance
}

// ============================================
// Sync Queue
// ============================================

let syncQueueInstance: Queue | null = null

export async function getSyncQueue(): Promise<Queue> {
  if (!syncQueueInstance) {
    await getRedisClient()
    syncQueueInstance = new Queue(QUEUE_NAMES.SYNC, {
      connection: QUEUE_CONNECTION,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 10, // Many retries for sync operations
        backoff: {
          type: 'exponential' as const,
          delay: 5000, // Start with 5s for sync
        },
      },
    })
  }
  return syncQueueInstance
}

// ============================================
// Backup Queue
// ============================================

let backupQueueInstance: Queue | null = null

export async function getBackupQueue(): Promise<Queue> {
  if (!backupQueueInstance) {
    await getRedisClient()
    backupQueueInstance = new Queue(QUEUE_NAMES.BACKUP, {
      connection: QUEUE_CONNECTION,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        timeout: 600000, // 10 minutes for backup
        attempts: 2,
      },
    })
  }
  return backupQueueInstance
}

// ============================================
// Job Type Definitions
// ============================================

export interface InvoiceJobData {
  type: 'create' | 'update-status' | 'generate-journal-entry' | 'update-stock'
  invoiceId: string
  tenantId: string
  payload?: Record<string, unknown>
}

export interface NotificationJobData {
  type: 'low-stock' | 'installment-due' | 'invoice-overdue' | 'general'
  tenantId: string
  userId?: string
  title: string
  message: string
  entityType?: string
  entityId?: string
}

export interface ReportJobData {
  type: 'sales-summary' | 'customer-balance' | 'product-movement' | 'financial'
  tenantId: string
  dateFrom: string
  dateTo: string
  requestedBy: string
  format?: 'pdf' | 'excel'
}

export interface SyncJobData {
  type: 'upload-pending' | 'resolve-conflict' | 'full-sync'
  tenantId: string
  payload?: Record<string, unknown>
}

export interface BackupJobData {
  type: 'full' | 'incremental'
  tenantId: string
  destination?: string
}

// ============================================
// Queue Status Helper
// ============================================

export async function getQueueStatus(queueName: string): Promise<{
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}> {
  try {
    const client = await getRedisClient()
    const queue = new Queue(queueName, { connection: QUEUE_CONNECTION })
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ])

    return { waiting, active, completed, failed, delayed }
  } catch (error) {
    console.error(`[Queue] Failed to get status for ${queueName}:`, error)
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
  }
}

export async function getAllQueuesStatus(): Promise<Record<string, Awaited<ReturnType<typeof getQueueStatus>>>> {
  const statuses = await Promise.all([
    getQueueStatus(QUEUE_NAMES.INVOICE),
    getQueueStatus(QUEUE_NAMES.NOTIFICATION),
    getQueueStatus(QUEUE_NAMES.REPORT),
    getQueueStatus(QUEUE_NAMES.SYNC),
    getQueueStatus(QUEUE_NAMES.BACKUP),
  ])

  return {
    [QUEUE_NAMES.INVOICE]: statuses[0],
    [QUEUE_NAMES.NOTIFICATION]: statuses[1],
    [QUEUE_NAMES.REPORT]: statuses[2],
    [QUEUE_NAMES.SYNC]: statuses[3],
    [QUEUE_NAMES.BACKUP]: statuses[4],
  }
}

// ============================================
// Graceful Shutdown
// ============================================

export async function closeAllQueues(): Promise<void> {
  const queues = [invoiceQueueInstance, notificationQueueInstance, reportQueueInstance, syncQueueInstance, backupQueueInstance]
  
  await Promise.allSettled(
    queues.filter(Boolean).map(queue => queue!.close())
  )
  
  invoiceQueueInstance = null
  notificationQueueInstance = null
  reportQueueInstance = null
  syncQueueInstance = null
  backupQueueInstance = null
  
  console.log('[Queue] All queues closed')
}
