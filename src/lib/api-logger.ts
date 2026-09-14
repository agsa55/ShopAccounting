// ============================================================================
// src/lib/api-logger.ts — v2.1.0
// ★ API Interceptor هوشمند با لاگ‌گیری دقیق برای دیباگ
// ----------------------------------------------------------------------------
// ★ v2.1.0: لاگ‌های موفقیت فقط در کنسول (جلوگیری از شلوغی)
// ★ v2.1.0: هشدار برای پاسخ‌های کند (بیش از ۱ ثانیه)
// ★ v2.1.0: تشخیص هوشمند نوع خطای شبکه
// ★ v2.0.0: context کامل (network, auth, page, browser)
// ★ v1.0.0: نسخه اولیه
// ============================================================================

import { addLog } from './system-logger'

type FetchType = typeof fetch

let isInitialized = false
let originalFetch: FetchType | null = null

// ═══════════════════════════════════════════════════════════════
// تنظیمات
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // آستانه هشدار کندی (میلی‌ثانیه)
  SLOW_THRESHOLD: 1000,
  
  // حداکثر طول بدنه خطا برای ذخیره در لاگ
  MAX_ERROR_BODY_LENGTH: 1000,
  
  // timeout برای بررسی reachability سرور
  SERVER_CHECK_TIMEOUT: 3000,
  
  // مسیرهایی که نباید لاگ شوند (داخلی)
  INTERNAL_PATHS: [
    '/api/system-logs',
    '/api/subscription/update-status',
    '/api/tenants/trial-check',
    '/_next/',
    '/api/health',
    'favicon.ico',
    'manifest.json',
  ],
}

// ═══════════════════════════════════════════════════════════════
// توابع کمکی برای جمع‌آوری context
// ═══════════════════════════════════════════════════════════════

/**
 * وضعیت شبکه مرورگر
 */
function getNetworkStatus() {
  if (typeof navigator === 'undefined') return null
  
  const connection = (navigator as any).connection
  
  return {
    onLine: navigator.onLine,
    connectionType: connection?.effectiveType || 'unknown',
    downlink: connection?.downlink ?? null,
    rtt: connection?.rtt ?? null,
  }
}

/**
 * وضعیت احراز هویت کاربر
 */
function getAuthStatus() {
  if (typeof localStorage === 'undefined') return null
  
  try {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    
    let user: any = null
    try {
      user = userStr ? JSON.parse(userStr) : null
    } catch {}
    
    return {
      hasToken: !!token,
      tokenLength: token?.length || 0,
      userId: user?.id || null,
      userName: user?.username || null,
      userRole: user?.role || null,
      tenantId: user?.tenantId || null,
    }
  } catch {
    return null
  }
}

/**
 * اطلاعات صفحه فعلی
 */
function getPageContext() {
  if (typeof window === 'undefined') return null
  
  try {
    return {
      url: window.location.href,
      pathname: window.location.pathname,
      referrer: document.referrer || null,
      timeSinceLoad: Math.round(performance.now()),
    }
  } catch {
    return null
  }
}

/**
 * اطلاعات مرورگر و سیستم
 */
function getBrowserInfo() {
  if (typeof navigator === 'undefined') return null
  
  try {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      screenWidth: window.screen?.width ?? null,
      screenHeight: window.screen?.height ?? null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  } catch {
    return null
  }
}

/**
 * گرفتن خطاهای اخیر (برای تشخیص الگو)
 */
function getRecentErrors(limit = 3): string[] {
  try {
    const raw = localStorage.getItem('shop_system_logs')
    if (!raw) return []
    
    const logs = JSON.parse(raw) as any[]
    return logs
      .filter((log) => log.level === 'error' && log.source === 'api')
      .slice(0, limit)
      .map((log) => `${log.timestamp}: ${log.message}`)
  } catch {
    return []
  }
}

/**
 * بررسی سریع در دسترس بودن سرور
 */
async function checkServerReachable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.SERVER_CHECK_TIMEOUT)
    
    await originalFetch!.call(window, '/api/health', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    })
    
    clearTimeout(timeoutId)
    return true
  } catch {
    return false
  }
}

/**
 * تشخیص نوع خطا
 */
function detectErrorType(error: any, serverReachable: boolean): string {
  if (error?.name === 'AbortError') return 'timeout'
  
  const message = error?.message || ''
  
  if (message.includes('Failed to fetch')) {
    return serverReachable ? 'CORS/Auth Issue' : 'Network/Server Down'
  }
  
  if (message.includes('NetworkError')) return 'Network Error'
  if (message.includes('timeout')) return 'Timeout'
  if (message.includes('CORS')) return 'CORS Issue'
  
  return 'Unknown'
}

/**
 * بررسی اینکه آیا مسیر داخلی است
 */
function isInternalPath(url: string): boolean {
  return CONFIG.INTERNAL_PATHS.some((path) => url.includes(path))
}

// ═══════════════════════════════════════════════════════════════
// نصب API Interceptor
// ═══════════════════════════════════════════════════════════════

export function installApiLogger(): void {
  if (isInitialized || typeof window === 'undefined') return

  originalFetch = window.fetch
  isInitialized = true

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // استخراج URL و متد
    const url = typeof input === 'string' 
      ? input 
      : input instanceof URL 
        ? input.toString() 
        : input.url
    
    const method = init?.method || 'GET'
    const startTime = Date.now()

    // رد کردن مسیرهای داخلی
    if (isInternalPath(url)) {
      return originalFetch!.call(window, input, init)
    }

    // جمع‌آوری context
    const network = getNetworkStatus()
    const auth = getAuthStatus()
    const page = getPageContext()

    try {
      // ارسال درخواست
      const response = await originalFetch!.call(window, input, init)
      const duration = Date.now() - startTime

      // ═══ پاسخ موفق ═══
      if (response.ok) {
        // ★ فقط اگر پاسخ کند بود، هشدار بده
        if (duration > CONFIG.SLOW_THRESHOLD) {
          addLog('warn', `API Slow Response: ${method} ${url} (${duration}ms)`, {
            source: 'api',
            metadata: {
              method,
              url,
              status: response.status,
              duration,
              threshold: CONFIG.SLOW_THRESHOLD,
            },
          })
        } else {
          // در غیر این صورت، فقط در کنسول مرورگر لاگ کن
          console.log(`[API] ✅ ${method} ${url} (${duration}ms)`)
        }
        
        return response
      }

        // ═══ پاسخ خطا (4xx, 5xx) ═══
      let errorBody = ''
      let errorJson: any = null
      
      try {
        const cloned = response.clone()
        errorBody = await cloned.text()
        try {
          errorJson = JSON.parse(errorBody)
        } catch {}
      } catch {}

      const isServerError = response.status >= 500
      
      // ★ v2.2.0: تشخیص خطاهای محدودیت پلن
      const isPlanLimitError = response.status === 403 && 
        errorJson?.error && 
        (errorJson.error.includes('پلن') || 
         errorJson.error.includes('plan') ||
         errorJson.error.includes('ارتقا') ||
         errorJson.error.includes('upgrade'))

      let logLevel: 'error' | 'warn' | 'info'
      let logTitle: string

      if (isPlanLimitError) {
        // ★ خطای محدودیت پلن: فقط info (سیستم درست کار می‌کند)
        logLevel = 'info'
        logTitle = `محدودیت پلن: ${method} ${url}`
        
        // Dispatch event برای نمایش مودال ارتقا
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('plan-limit-error', {
            detail: {
              url,
              method,
              message: errorJson.error,
              endpoint: url.split('?')[0],
            },
          }))
        }
      } else if (isServerError) {
        logLevel = 'error'
        logTitle = `API Server Error: ${method} ${url} → ${response.status}`
      } else {
        logLevel = 'warn'
        logTitle = `API Client Error: ${method} ${url} → ${response.status}`
      }

      addLog(logLevel, logTitle, {
        source: 'api',
        metadata: {
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          duration,
          responseBody: errorBody.substring(0, CONFIG.MAX_ERROR_BODY_LENGTH),
          isPlanLimit: isPlanLimitError,
          network,
          auth,
          page,
        },
      })

      return response
      } catch (error: any) {
      const duration = Date.now() - startTime
      
      // بررسی در دسترس بودن سرور
      const serverReachable = await checkServerReachable()
      
      // تشخیص نوع خطا
      const errorType = detectErrorType(error, serverReachable)

      // ★ لاگ کامل خطای شبکه با تمام جزئیات
      addLog('error', `API Network Error: ${method} ${url}`, {
        source: 'api',
        metadata: {
          method,
          url,
          duration,
          errorType,
          errorMessage: error?.message || 'Unknown error',
          errorName: error?.name || 'Unknown',
          serverReachable,
          network,
          auth,
          page,
          browser: getBrowserInfo(),
          previousErrors: getRecentErrors(),
        },
        stackTrace: error?.stack,
      })

      throw error
    }
  }

  console.log('[ApiLogger] ✅ v2.1.0 installed - لاگ‌گیری هوشمند فعال شد')
}

// ═══════════════════════════════════════════════════════════════
// حذف API Interceptor
// ═══════════════════════════════════════════════════════════════

export function uninstallApiLogger(): void {
  if (!isInitialized || !originalFetch) return

  window.fetch = originalFetch
  isInitialized = false
  originalFetch = null

  console.log('[ApiLogger] 🗑️ API Interceptor removed')
}