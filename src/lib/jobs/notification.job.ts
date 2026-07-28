/**
 * Notification Job Worker
 * 
 * Processes notification dispatch jobs:
 * - Low stock alerts
 * - Installment due reminders
 * - Invoice overdue notices
 * - General notifications
 */

import { Worker, Job } from 'bullmq'
import { QUEUE_NAMES } from '@/lib/queue'
import { logJobEvent, jobLogger } from '@/lib/logger'
import type { NotificationJobData } from '@/lib/queue'

// ============================================
// Worker Configuration
// ============================================

const WORKER_OPTIONS = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  concurrency: 10,      // Process up to 10 notifications concurrently
  limiter: {
    max: 20,
    duration: 1000,     // 20 notifications per second
  },
}

// ============================================
// Job Handlers
// ============================================

async function createNotification(job: Job<NotificationJobData>) {
  const { db } = await import('@/lib/db')
  const { type, tenantId, userId, title, message, entityType, entityId } = job.data

  // Create notification in database
  await db.notification.create({
    data: {
      userId: userId || null,
      title,
      message,
      type,
      isRead: false,
      tenantId,
    },
  })

  jobLogger.info({
    jobId: job.id,
    type,
    tenantId,
    userId,
  }, `Notification created: ${type} - ${title}`)

  // TODO: Send push notification via WebSocket
  // TODO: Send SMS for critical notifications
  // TODO: Send email for summary notifications
}

// ============================================
// Create and Start Worker
// ============================================

let workerInstance: Worker<NotificationJobData> | null = null

export function startNotificationWorker(): Worker<NotificationJobData> {
  if (workerInstance) return workerInstance

  workerInstance = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATION,
    async (job: Job<NotificationJobData>) => {
      const startTime = Date.now()
      logJobEvent(QUEUE_NAMES.NOTIFICATION, job.id || 'unknown', 'started')

      try {
        await createNotification(job)
        logJobEvent(QUEUE_NAMES.NOTIFICATION, job.id || 'unknown', 'completed', Date.now() - startTime)
      } catch (error) {
        logJobEvent(QUEUE_NAMES.NOTIFICATION, job.id || 'unknown', 'failed', Date.now() - startTime, {
          error: (error as Error).message,
        })
        throw error
      }
    },
    WORKER_OPTIONS
  )

  workerInstance.on('failed', (job, err) => {
    jobLogger.error({ jobId: job?.id, error: err.message }, 'Notification job failed')
  })

  jobLogger.info('Notification worker started')
  return workerInstance
}

export async function stopNotificationWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close()
    workerInstance = null
    jobLogger.info('Notification worker stopped')
  }
}

export default startNotificationWorker
