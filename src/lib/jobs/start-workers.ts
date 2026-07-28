/**
 * Job Workers Starter
 * 
 * Starts all background job workers.
 * Can be run as:
 * 1. A separate process: npx tsx src/lib/jobs/start-workers.ts
 * 2. Integrated with Next.js via instrumentation.ts
 * 
 * In production, this is run by PM2 as a separate process (shopaccounting-worker).
 */

import { startInvoiceWorker } from './invoice.job'
import { startNotificationWorker } from './notification.job'
import { jobLogger } from '@/lib/logger'

async function startAllWorkers() {
  jobLogger.info('Starting all background workers...')

  try {
    // Start Invoice Worker
    startInvoiceWorker()
    jobLogger.info('✓ Invoice worker started')

    // Start Notification Worker
    startNotificationWorker()
    jobLogger.info('✓ Notification worker started')

    jobLogger.info('All workers started successfully')

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      jobLogger.info(`Received ${signal}, shutting down workers...`)
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // Keep process alive
    process.stdin.resume()
  } catch (error) {
    jobLogger.error({ error }, 'Failed to start workers')
    process.exit(1)
  }
}

// Auto-start when run directly
startAllWorkers()
