/**
 * Structured Logging with Pino
 * 
 * Provides structured JSON logging for:
 * - API request/response logging
 * - Error tracking
 * - Performance monitoring
 * - Audit logging
 * - Business event logging
 * 
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info({ tenantId, userId }, 'User logged in')
 *   logger.error({ err, invoiceId }, 'Failed to create invoice')
 */

import pino, { Logger, LoggerOptions } from 'pino'

// ============================================
// Configuration
// ============================================

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const SERVICE_NAME = process.env.SERVICE_NAME || 'shopaccounting-api'

// ============================================
// Logger Options
// ============================================

const loggerOptions: LoggerOptions = {
  level: LOG_LEVEL,
  name: SERVICE_NAME,
  
  // Base fields included in every log entry
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'localhost',
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Custom log formatting
  formatters: {
    level(label) {
      return { level: label }
    },
    bindings(bindings) {
      return {
        pid: bindings.pid,
        host: bindings.hostname,
      }
    },
    log(object) {
      return object
    },
  },

  // Timestamp format - ISO 8601
  timestamp: pino.stdTimeFunctions.isoTime,

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'passwordHash',
      '*.password',
      '*.passwordHash',
      'authorization',
      'cookie',
      '*.apiKey',
      '*.secret',
      '*.token',
    ],
    censor: '[REDACTED]',
  },

  // Pretty print in development
  transport: IS_PRODUCTION
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname,nodeEnv',
          singleLine: true,
        },
      },
}

// ============================================
// Create Logger Instance
// ============================================

export const logger: Logger = pino(loggerOptions)

// ============================================
// Child Loggers for Different Contexts
// ============================================

/** Logger for API request/response */
export const apiLogger = logger.child({ component: 'api' })

/** Logger for database operations */
export const dbLogger = logger.child({ component: 'database' })

/** Logger for Redis/cache operations */
export const cacheLogger = logger.child({ component: 'cache' })

/** Logger for background jobs */
export const jobLogger = logger.child({ component: 'job' })

/** Logger for authentication */
export const authLogger = logger.child({ component: 'auth' })

/** Logger for RBAC / permission checks */
export const rbacLogger = logger.child({ component: 'rbac' })

/** Logger for business events (invoice created, payment received, etc.) */
export const businessLogger = logger.child({ component: 'business' })

/** Logger for tenant isolation */
export const tenantLogger = logger.child({ component: 'tenant' })

/** Logger for sync operations */
export const syncLogger = logger.child({ component: 'sync' })

// ============================================
// Logging Helper Functions
// ============================================

/**
 * Log an API request
 */
export function logApiRequest(method: string, path: string, metadata?: Record<string, unknown>) {
  apiLogger.info({
    method,
    path,
    ...metadata,
    type: 'api_request',
  }, `${method} ${path}`)
}

/**
 * Log an API response
 */
export function logApiResponse(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  metadata?: Record<string, unknown>
) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
  apiLogger[level]({
    method,
    path,
    statusCode,
    durationMs,
    ...metadata,
    type: 'api_response',
  }, `${method} ${path} ${statusCode} (${durationMs}ms)`)
}

/**
 * Log a database query
 */
export function logDbQuery(operation: string, model: string, durationMs: number, metadata?: Record<string, unknown>) {
  const level = durationMs > 1000 ? 'warn' : 'debug'
  dbLogger[level]({
    operation,
    model,
    durationMs,
    ...metadata,
    type: 'db_query',
  }, `${operation} ${model} (${durationMs}ms)`)
}

/**
 * Log a business event (for audit trail)
 */
export function logBusinessEvent(
  event: string,
  tenantId: string,
  userId: string,
  metadata?: Record<string, unknown>
) {
  businessLogger.info({
    event,
    tenantId,
    userId,
    ...metadata,
    type: 'business_event',
  }, `Business event: ${event}`)
}

/**
 * Log a tenant isolation violation attempt
 */
export function logTenantViolation(
  tenantId: string,
  userId: string,
  attemptedTenantId: string,
  resource: string,
  metadata?: Record<string, unknown>
) {
  tenantLogger.error({
    tenantId,
    userId,
    attemptedTenantId,
    resource,
    ...metadata,
    type: 'tenant_violation',
  }, `Tenant isolation violation: user ${userId} attempted to access ${resource} of tenant ${attemptedTenantId}`)
}

/**
 * Log a job lifecycle event
 */
export function logJobEvent(
  queueName: string,
  jobId: string,
  event: 'started' | 'completed' | 'failed' | 'retried',
  durationMs?: number,
  metadata?: Record<string, unknown>
) {
  const level = event === 'failed' ? 'error' : 'info'
  jobLogger[level]({
    queueName,
    jobId,
    event,
    durationMs,
    ...metadata,
    type: 'job_event',
  }, `Job ${jobId} in ${queueName}: ${event}${durationMs ? ` (${durationMs}ms)` : ''}`)
}

// ============================================
// Performance Timer Helper
// ============================================

export class PerformanceTimer {
  private startTime: number
  private label: string

  constructor(label: string) {
    this.label = label
    this.startTime = performance.now()
  }

  /** Return elapsed time in milliseconds without logging */
  elapsed(): number {
    return Math.round(performance.now() - this.startTime)
  }

  /** Log the elapsed time and return it */
  end(metadata?: Record<string, unknown>): number {
    const durationMs = this.elapsed()
    apiLogger.debug({
      label: this.label,
      durationMs,
      ...metadata,
      type: 'performance',
    }, `${this.label}: ${durationMs}ms`)
    return durationMs
  }
}

export default logger
