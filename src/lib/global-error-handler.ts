// ============================================================================
// src/lib/global-error-handler.ts — v1.0.0
// ★ Global Error Handler: ثبت خودکار خطاهای JavaScript
// ============================================================================

import { addLog } from './system-logger'

let isInstalled = false

export function installGlobalErrorHandler(): void {
  if (isInstalled || typeof window === 'undefined') return

  // خطاهای JavaScript (uncaught)
 window.addEventListener('error', (event) => {
  addLog('error', `Uncaught Error: ${event.message}`, {
    source: 'frontend',
    metadata: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
    stackTrace: event.error?.stack,
  })
})

  // خطاهای Promise (unhandled rejection)
 window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason?.message || String(reason)

  addLog('error', `Unhandled Promise Rejection: ${message}`, {
    source: 'frontend',
    metadata: {
      reason: reason instanceof Error ? reason.stack : String(reason),
    },
    stackTrace: reason instanceof Error ? reason.stack : undefined,
  })
})

  isInstalled = true
  console.log('[GlobalErrorHandler] ✅ Installed')
}