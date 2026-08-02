// ============================================================================
// src/lib/connectivity.ts — تشخیص هوشمند وضعیت اتصال (v1.0)
// ============================================================================
// ★ مشکل قبلی: سیستم فقط از navigator.onLine استفاده می‌کرد.
//   این API مرورگر "اتصال به اینترنت" را بررسی می‌کند، نه "اتصال به سرور".
//   در محیط لوکال بدون اینترنت، سرور و PostgreSQL کاملاً در دسترس‌اند
//   ولی navigator.onLine = false بود → سیستم اشتباهاً آفلاین می‌شد.
//
// ★ راه‌حل: پینگ دوره‌ای به /api/health
//   - API در دسترس است → آنلاین (حتی بدون اینترنت)
//   - API در دسترس نیست → آفلاین (حتی با اینترنت)
// ============================================================================

export type ConnectionStatus = 'online' | 'offline' | 'degraded'

export interface ConnectivityState {
  /** وضعیت نهایی: آنلاین، آفلاین، یا کند */
  status: ConnectionStatus
  /** آیا سرور API پاسخ می‌دهد؟ */
  isApiReachable: boolean
  /** آیا مرورگر به اینترنت دسترسی دارد؟ (صرفاً اطلاع‌رسانی) */
  isInternetAvailable: boolean
  /** زمان آخرین بررسی (timestamp) */
  lastCheckTime: number
  /** زمان پاسخ سرور (میلی‌ثانیه) */
  responseTimeMs: number
}

// ─── تنظیمات ────────────────────────────────────────────────────────────────
const HEALTH_ENDPOINT = '/api/health'
const CHECK_INTERVAL_ONLINE_MS = 30_000    // وقتی آنلاین: هر ۳۰ ثانیه
const CHECK_INTERVAL_OFFLINE_MS = 5_000    // وقتی آفلاین: هر ۵ ثانیه (تلاش سریع‌تر)
const PING_TIMEOUT_MS = 5_000              // تایم‌اوت هر پینگ
const DEGRADED_THRESHOLD_MS = 3_000        // بیشتر از این = کند

// ─── State داخلی ─────────────────────────────────────────────────────────────
let currentState: ConnectivityState = {
  status: 'online',
  isApiReachable: true,
  isInternetAvailable: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastCheckTime: 0,
  responseTimeMs: 0,
}

type StatusListener = (state: ConnectivityState) => void
const listeners: Set<StatusListener> = new Set()

// ─── پینگ سرور ──────────────────────────────────────────────────────────────
async function pingServer(): Promise<{
  reachable: boolean
  responseTimeMs: number
  degraded: boolean
}> {
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)

    const response = await fetch(HEALTH_ENDPOINT, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })

    clearTimeout(timeoutId)
    const responseTimeMs = Date.now() - start

    if (!response.ok) {
      return { reachable: false, responseTimeMs, degraded: false }
    }

    const data = await response.json()
    const degraded =
      data.database === 'disconnected' || responseTimeMs > DEGRADED_THRESHOLD_MS

    return { reachable: true, responseTimeMs, degraded }
  } catch {
    // AbortError (تایم‌اوت) یا NetworkError (سرور خاموش)
    return { reachable: false, responseTimeMs: Date.now() - start, degraded: false }
  }
}

// ─── بررسی و به‌روزرسانی وضعیت ─────────────────────────────────────────────
async function checkConnectivity(): Promise<void> {
  const internetAvailable = typeof navigator !== 'undefined' ? navigator.onLine : true
  const { reachable, responseTimeMs, degraded } = await pingServer()

  let newStatus: ConnectionStatus

  if (!reachable) {
    newStatus = 'offline'
  } else if (degraded) {
    newStatus = 'degraded'
  } else {
    newStatus = 'online'
  }

  const prevState = currentState

  currentState = {
    status: newStatus,
    isApiReachable: reachable,
    isInternetAvailable: internetAvailable,
    lastCheckTime: Date.now(),
    responseTimeMs,
  }

  // لاگ فقط هنگام تغییر وضعیت
  if (prevState.status !== newStatus) {
    console.log(
      `[Connectivity] ${prevState.status} → ${newStatus}` +
      ` | API: ${reachable ? '✓' : '✗'}` +
      ` | Internet: ${internetAvailable ? '✓' : '✗'}` +
      ` | ${responseTimeMs}ms`
    )
  }

  // اطلاع‌رسانی به listener‌ها
  listeners.forEach((fn) => {
    try {
      fn({ ...currentState })
    } catch (err) {
      console.warn('[Connectivity] Listener error:', err)
    }
  })
}

// ─── مانیتورینگ دوره‌ای ─────────────────────────────────────────────────────
let intervalId: ReturnType<typeof setInterval> | null = null
let isMonitoring = false

export function startConnectivityMonitor(): void {
  if (isMonitoring) return
  isMonitoring = true

  // بررسی فوری
  checkConnectivity()

  // بررسی دوره‌ای با فاصله متغیر
  const scheduleNext = () => {
    const interval =
      currentState.status === 'offline'
        ? CHECK_INTERVAL_OFFLINE_MS
        : CHECK_INTERVAL_ONLINE_MS

    intervalId = setTimeout(async () => {
      await checkConnectivity()
      scheduleNext()
    }, interval)
  }
  scheduleNext()

  // رویدادهای مرورگر (سیگنال کمکی — نه منبع اصلی)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('[Connectivity] Browser "online" event → rechecking API...')
      checkConnectivity()
    })

    window.addEventListener('offline', () => {
      console.log('[Connectivity] Browser "offline" event → rechecking API...')
      // ★ حتی اگر مرورگر بگوید آفلاین، API لوکال ممکن است در دسترس باشد
      checkConnectivity()
    })
  }

  console.log('[Connectivity] Monitor started')
}

export function stopConnectivityMonitor(): void {
  if (intervalId) {
    clearTimeout(intervalId)
    intervalId = null
  }
  isMonitoring = false
  console.log('[Connectivity] Monitor stopped')
}

// ─── API عمومی (غیر React) ──────────────────────────────────────────────────

/** آیا سرور API در دسترس است؟ (جایگزین navigator.onLine) */
export function isOnline(): boolean {
  return currentState.isApiReachable
}

/** وضعیت فعلی (کپی) */
export function getConnectivityState(): ConnectivityState {
  return { ...currentState }
}

/** ثبت listener — تابع unsubscribe برمی‌گرداند */
export function onConnectivityChange(listener: StatusListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** بررسی فوری (بدون صبر برای interval) */
export async function forceCheck(): Promise<ConnectivityState> {
  await checkConnectivity()
  return { ...currentState }
}

// ─── Hook برای React ────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'

export function useConnectivity() {
  const [state, setState] = useState<ConnectivityState>(getConnectivityState())

  useEffect(() => {
    startConnectivityMonitor()
    const unsubscribe = onConnectivityChange(setState)
    return unsubscribe
  }, [])

  const recheck = useCallback(async () => {
    const newState = await forceCheck()
    setState(newState)
  }, [])

  return { ...state, recheck }
}