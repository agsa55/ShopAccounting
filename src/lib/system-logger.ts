// ============================================================================
// src/lib/system-logger.ts — v1.0.0
// ★ سیستم لاگ‌گیری روزانه با پاکسازی خودکار
// ============================================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export type LogSource = 'frontend' | 'backend' | 'api' | 'user'

export interface SystemLog {
  id: string
  timestamp: string
  level: LogLevel
  source: LogSource
  message: string
  metadata?: Record<string, any>
  stackTrace?: string
}

const STORAGE_KEY = 'shop_system_logs'
const MAX_LOGS = 500
const RETENTION_HOURS = 24 // فقط ۲۴ ساعت

// ═══════════════════════════════════════════════════════════════
// توابع کمکی
// ═══════════════════════════════════════════════════════════════

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function getRetentionCutoff(): Date {
  return new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000)
}

// ═══════════════════════════════════════════════════════════════
// خواندن لاگ‌ها
// ═══════════════════════════════════════════════════════════════

export function getLogs(): SystemLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    
    const logs = JSON.parse(raw) as SystemLog[]
    const cutoff = getRetentionCutoff()
    
    // فیلتر لاگ‌های معتبر (کمتر از ۲۴ ساعت)
    return logs.filter(log => new Date(log.timestamp) >= cutoff)
  } catch (error) {
    console.error('[SystemLogger] Failed to read logs:', error)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════
// ذخیره لاگ جدید
// ═══════════════════════════════════════════════════════════════

export function addLog(
  level: LogLevel,
  message: string,
  options: {
    source?: LogSource
    metadata?: Record<string, any>
    stackTrace?: string
  } = {}
): void {
  try {
    const newLog: SystemLog = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      level,
      source: options.source || 'frontend',
      message,
      metadata: options.metadata,
      stackTrace: options.stackTrace,
    }

    const logs = getLogs()
    
    // اضافه کردن به ابتدای آرایه
    logs.unshift(newLog)
    
    // محدود کردن تعداد
    const trimmed = logs.slice(0, MAX_LOGS)
    
    // ذخیره
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    
    // لاگ در کنسول برای دیباگ
    console.log(`[SystemLogger] ${level.toUpperCase()}: ${message}`, options.metadata || '')
  } catch (error) {
    console.error('[SystemLogger] Failed to add log:', error)
  }
}

// ═══════════════════════════════════════════════════════════════
// پاکسازی خودکار لاگ‌های قدیمی
// ═══════════════════════════════════════════════════════════════

export function cleanupLogs(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    
    const logs = JSON.parse(raw) as SystemLog[]
    const cutoff = getRetentionCutoff()
    const now = Date.now()
    
    console.log(`[SystemLogger] 🔍 بررسی ${logs.length} لاگ برای پاکسازی...`)
    console.log(`[SystemLogger] ⏰ زمان فعلی: ${new Date(now).toISOString()}`)
    console.log(`[SystemLogger] ⏰ زمان cutoff: ${cutoff.toISOString()} (۲۴ ساعت قبل)`)
    
    // ★ فیلتر دقیق‌تر با استفاده از timestamp عددی
    const filtered = logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime()
      
      // اگر timestamp نامعتبر باشد، نگه داریم
      if (isNaN(logTime)) {
        console.warn(`[SystemLogger] ⚠️ timestamp نامعتبر: ${log.timestamp}`)
        return true
      }
      
      // ★ فقط لاگ‌هایی که واقعاً قدیمی‌تر از ۲۴ ساعت هستند حذف شوند
      const isOld = logTime < cutoff.getTime()
      
      if (isOld) {
        console.log(`[SystemLogger] 🗑️ حذف لاگ قدیمی: ${log.message.substring(0, 50)}...`)
      }
      
      return !isOld
    })
    
    const removedCount = logs.length - filtered.length
    
    // فقط اگر چیزی حذف شد، ذخیره کن
    if (removedCount > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
      console.log(`[SystemLogger] ✅ ${removedCount} لاگ قدیمی حذف شد`)
    } else {
      console.log(`[SystemLogger] ✓ هیچ لاگ قدیمی‌ای یافت نشد`)
    }
    
    return removedCount
  } catch (error) {
    console.error('[SystemLogger] ❌ Cleanup failed:', error)
    return 0
  }
}

// ═══════════════════════════════════════════════════════════════
// پاکسازی کامل (برای ریست)
// ═══════════════════════════════════════════════════════════════

export function clearAllLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('[SystemLogger] All logs cleared')
  } catch (error) {
    console.error('[SystemLogger] Clear failed:', error)
  }
}

// ═══════════════════════════════════════════════════════════════
// فرمت لاگ برای کپی
// ═══════════════════════════════════════════════════════════════

export function formatLogForCopy(log: SystemLog): string {
  const time = new Date(log.timestamp).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  
  let result = `[${time}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`
  
  if (log.metadata && Object.keys(log.metadata).length > 0) {
    result += `\n  Metadata: ${JSON.stringify(log.metadata, null, 2).replace(/\n/g, '\n  ')}`
  }
  
  if (log.stackTrace) {
    result += `\n  Stack: ${log.stackTrace}`
  }
  
  return result
}

export function formatLogsForCopy(logs: SystemLog[]): string {
  return logs.map(formatLogForCopy).join('\n\n')
}

// ═══════════════════════════════════════════════════════════════
// Logger API (شبیه به کنسول)
// ═══════════════════════════════════════════════════════════════

export const logger = {
  info: (message: string, metadata?: Record<string, any>) =>
    addLog('info', message, { source: 'frontend', metadata }),

  warn: (message: string, metadata?: Record<string, any>) =>
    addLog('warn', message, { source: 'frontend', metadata }),

  error: (message: string, error?: Error, metadata?: Record<string, any>) =>
    addLog('error', message, { source: 'frontend', metadata, stackTrace: error?.stack }),

  debug: (message: string, metadata?: Record<string, any>) =>
    addLog('debug', message, { source: 'frontend', metadata }),

  user: (message: string, metadata?: Record<string, any>) =>
    addLog('info', message, { source: 'user', metadata }),

  api: (message: string, metadata?: Record<string, any>) =>
    addLog('info', message, { source: 'api', metadata }),
}