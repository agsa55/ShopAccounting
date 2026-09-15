'use client'

// ============================================================================
// src/components/fetch-interceptor-loader.tsx — v7.0 ★★★ Offline-First
// ShopAccounting — Client-side Fetch Interceptor + Offline Support
// ----------------------------------------------------------------------------
// ★ v6.0: Offline-First کامل:
//   ۱. Online/Offline detection
//   ۲. GET: Network First → Fallback to IndexedDB
//   ۳. POST/PUT/DELETE: آفلاین → صف sync
//   ۴. Auto-sync on reconnect
// ★ v7.0: اصلاحات:
//   ★ استثنا کردن /api/health از interception (جلوگیری از بن‌بست آفلاین)
//   ★ افزودن connectivity module به‌عنوان منبع اصلی تشخیص آنلاین
//   ★ حفظ backward compat با navigator.onLine
//   ★ نکته: کوکی tenant-slug حالا httpOnly است → getCookie آن را نمی‌خواند
//     ولی مشکلی نیست چون proxy سمت سرور خودش کوکی را می‌خواند
// ============================================================================

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import {
  getCachedProducts,
  getCachedCustomers,
  getCachedCategories,
  addToSyncQueue,
  getSyncQueueCount,
} from '@/lib/offline-db'

// ★ v7.0: ماژول تشخیص اتصال هوشمند
import {
  startConnectivityMonitor,
  onConnectivityChange,
  isOnline as isApiOnline,
  getConnectivityState,
} from '@/lib/connectivity'

// ★ v7.0: مسیرهایی که هرگز نباید intercept شوند
// این مسیرها باید همیشه به سرور واقعی بروند، حتی در حالت آفلاین.
// در غیر این صورت، بن‌بست آفلاین رخ می‌دهد:
//   connectivity پینگ → interceptor بلاک → cache خالی → "آفلاین" → تکرار
const BYPASS_INTERCEPT_PATHS = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/verify',
]

function shouldBypassIntercept(url: string): boolean {
  return BYPASS_INTERCEPT_PATHS.some((p) => url.includes(p))
}

export function FetchInterceptorLoader() {
  const router = useRouter()
  const { setOnline, setPendingSyncCount, isOnline } = useAppStore()

  // ─── ۱. Online/Offline Detection ─────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = async () => {
      console.log('[FetchInterceptor] 🟢 آنلاین شد (browser event)')
      setOnline(true)
      
      // ★ شروع همگام‌سازی خودکار
      try {
        const { syncEngine } = await import('@/lib/sync-engine')
        const result = await syncEngine.sync()
        console.log('[FetchInterceptor] همگام‌سازی انجام شد:', result)
      } catch (err) {
        console.error('[FetchInterceptor] خطا در همگام‌سازی:', err)
      }
    }

    const handleOffline = async () => {
      console.log('[FetchInterceptor] 🔴 آفلاین شد (browser event)')
      setOnline(false)
      
      // ★ بروزرسانی تعداد آیتم‌های در صف
      try {
        const count = await getSyncQueueCount()
        setPendingSyncCount(count)
      } catch {}
    }

    // ★ v7.0: شروع مانیتورینگ اتصال هوشمند
    startConnectivityMonitor()

    // ★ v7.0: تنظیم اولیه بر اساس وضعیت واقعی API (نه navigator.onLine)
    const initialState = getConnectivityState()
    setOnline(initialState.isApiReachable)

    // ★ v7.0: گوش دادن به تغییرات connectivity — منبع اصلی
    const unsubConnectivity = onConnectivityChange((state) => {
      setOnline(state.isApiReachable)

      if (state.isApiReachable) {
        console.log('[FetchInterceptor] 🟢 API در دسترس است (connectivity check)')
        // همگام‌سازی خودکار هنگام بازگشت اتصال
        import('@/lib/sync-engine')
          .then(({ syncEngine }) => syncEngine.sync())
          .catch((err) => console.error('[FetchInterceptor] خطا در همگام‌سازی:', err))
      } else {
        console.log('[FetchInterceptor] 🔴 API در دسترس نیست (connectivity check)')
        getSyncQueueCount()
          .then((count) => setPendingSyncCount(count))
          .catch(() => {})
      }
    })

    // ── حفظ backward compat: event‌های مرورگر ──────────────────
    // ★ این listener‌ها به‌عنوان سیگنال کمکی نگه داشته شده‌اند.
    //   مقدار نهایی توسط onConnectivityChange تعیین می‌شود.
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      // ★ v7.0: cleanup connectivity listener
      unsubConnectivity()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline, setPendingSyncCount])

  // ─── ۲. Fetch Interceptor با Offline Support ────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return

    // جلوگیری از double-patch
    if ((window as any).__fetchIntercepted) return
    ;(window as any).__fetchIntercepted = true

    const originalFetch = window.fetch

    const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : (input as URL).toString()
      const isApiRoute = url.includes('/api/') || url.startsWith('/api/')

      // ★ v7.0: مسیرهای حساس هرگز intercept نشوند
      // بدون این استثنا، پینگ /api/health توسط interceptor بلاک می‌شود
      // و سیستم در بن‌بست آفلاین گیر می‌کند.
      if (shouldBypassIntercept(url)) {
        return originalFetch(input as any, init)
      }

      // ★ ۱. آماده‌سازی headers
      const headers = new Headers(init?.headers || {})

      const token = localStorage.getItem('token')
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      // ★ v7.0 نکته: کوکی tenant-slug حالا httpOnly است (از proxy v2.0)
      //   بنابراین getCookie('tenant-slug') همیشه null برمی‌گرداند.
      //   این مشکلی نیست چون proxy سمت سرور خودش کوکی را می‌خواند
      //   و x-tenant-slug را ست می‌کند. ولی کد را برای backward compat نگه می‌داریم.
      const tenantSlug = getCookie('tenant-slug')
      if (tenantSlug && !headers.has('X-Tenant-Slug')) {
        headers.set('X-Tenant-Slug', tenantSlug)
      }

      const newInit: RequestInit = { ...init, headers }
      const method = (newInit.method || 'GET').toUpperCase()

      // ─── ★★★ Offline Handling ★★★ ─────────────────────────────

      // ★ v7.0: استفاده از isApiOnline() به‌جای فقط store
      //   isApiOnline() بر اساس آخرین پینگ واقعی /api/health تصمیم می‌گیرد
      const currentOnline = isApiOnline() && useAppStore.getState().isOnline

      if (!currentOnline && isApiRoute) {
        console.log(`[FetchInterceptor] 🔴 آفلاین — درخواست: ${method} ${url}`)

        // ★ GET: از cache بخوان
        if (method === 'GET') {
          return handleOfflineGet(url)
        }

        // ★ POST/PUT/DELETE/PATCH: به صف اضافه کن
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
          return handleOfflineMutation(url, method, newInit)
        }
      }

      // ─── ★★★ Online Handling ★★★ ──────────────────────────────

      try {
       const response = await originalFetch(input as any, newInit)

        // ★ Cache successful GET responses
        if (response.ok && method === 'GET' && isApiRoute) {
    cacheApiResponse(url, response.clone()).catch((err) => {
      console.warn('[FetchInterceptor] ⚠️ cache failed:', url, err?.message)
    })
  }
        // ★ بررسی خطاهای خاص (401/403)
        if (isApiRoute && (response.status === 401 || response.status === 403)) {
          handleAuthErrors(response.clone(), url)
        }

        return response
      } catch (error: any) {
        console.error('[FetchInterceptor] خطا در fetch:', error)

        // ★ اگه network error بود، از cache بخوان
        if (method === 'GET' && isApiRoute) {
          console.log('[FetchInterceptor] تلاش برای خواندن از cache...')
          return handleOfflineGet(url)
        }

        // ★ اگه mutation بود، به صف اضافه کن
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && isApiRoute) {
          return handleOfflineMutation(url, method, newInit)
        }

        return new Response(
          JSON.stringify({ success: false, error: 'خطای شبکه' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    window.fetch = patchedFetch as typeof window.fetch

    return () => {
      window.fetch = originalFetch
      ;(window as any).__fetchIntercepted = false
    }
  }, [router])

  return null
}

// ─── Offline Handlers ───────────────────────────────────────────

async function handleOfflineGet(url: string): Promise<Response> {
  try {
    let cachedData: any = null

    if (url.includes('/api/products')) {
      cachedData = await getCachedProducts()
      if (cachedData && cachedData.length > 0) {
        return new Response(
          JSON.stringify({ success: true, data: cachedData, offline: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    else if (url.includes('/api/customers')) {
      cachedData = await getCachedCustomers()
      if (cachedData && cachedData.length > 0) {
        return new Response(
          JSON.stringify({ success: true, data: cachedData, offline: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    else if (url.includes('/api/categories')) {
      cachedData = await getCachedCategories()
      if (cachedData && cachedData.length > 0) {
        return new Response(
          JSON.stringify({ success: true, data: cachedData, offline: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // ★ اضافه شد: invoices
   // ★ اضافه شد: invoices
else if (
  url.includes('/api/invoices') &&
  !url.includes('/pay') &&
  !url.includes('/return') &&
  !url.includes('/receive-payment') &&
  !url.includes('/service')
) {
  try {
    const { getCachedInvoicesPage } = await import('@/lib/offline-db')

    const urlObj = new URL(url, 'http://localhost')
    const status = urlObj.searchParams.get('status') || 'ALL'
    const page = parseInt(urlObj.searchParams.get('page') || '1', 10)

    const cached = await getCachedInvoicesPage(status, page)

    if (cached?.invoices && cached.invoices.length > 0) {
      console.log(`[FetchInterceptor] ✅ invoices از cache — ${cached.invoices.length} فاکتور`)
      return new Response(
        JSON.stringify({
          success: true,
          data: cached.invoices,
          pagination: {
            totalPages: cached.totalPages,
            total: cached.total,
            page,
            limit: 50,
          },
          offline: true,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // ★ اگر با status خاص پیدا نشد، از ALL فیلتر کن
    if (status !== 'ALL') {
      const cachedAll = await getCachedInvoicesPage('ALL', page)
      if (cachedAll?.invoices && cachedAll.invoices.length > 0) {
        const filtered = cachedAll.invoices.filter((inv: any) => {
          const invStatus = (inv.paymentStatus || inv.status || '').toUpperCase()
          return invStatus === status
        })

        if (filtered.length > 0) {
          console.log(`[FetchInterceptor] ✅ invoices از cache (ALL→filter) — ${filtered.length} فاکتور`)
          return new Response(
            JSON.stringify({
              success: true,
              data: filtered,
              pagination: {
                totalPages: 1,
                total: filtered.length,
                page: 1,
                limit: 50,
              },
              offline: true,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
    }
  } catch (err: any) {
    console.warn('[FetchInterceptor] خطا در خواندن cache فاکتورها:', err?.message)
  }
}

    // ★ cache خالی یا URL ناشناخته
    console.warn('[FetchInterceptor] ⚠️ cache خالی است:', url)
    return new Response(
      JSON.stringify({
        success: true,
        data: [],
        offline: true,
        message: 'اطلاعات ذخیره‌شده‌ای وجود ندارد',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[FetchInterceptor] خطا در خواندن cache:', error)
    return new Response(
      JSON.stringify({ success: true, data: [], offline: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

async function handleOfflineMutation(
  url: string,
  method: string,
  init: RequestInit
): Promise<Response> {
  try {
    const body = init.body ? JSON.parse(init.body as string) : {}

    await addToSyncQueue('api-call', {
      method,
      url,
      body,
    })

    const count = await getSyncQueueCount()
    useAppStore.getState().setPendingSyncCount(count)

    console.log(`[FetchInterceptor] ✅ به صف همگام‌سازی اضافه شد — ${method} ${url}`)

    return new Response(
      JSON.stringify({
        success: true,
        offline: true,
        message: 'درخواست در صف همگام‌سازی قرار گرفت',
        pendingCount: count,
      }),
      {
        status: 202, // Accepted
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[FetchInterceptor] خطا در اضافه کردن به صف:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'خطا در ذخیره درخواست',
        offline: true,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

// ─── Cache API Response ─────────────────────────────────────────

// ─── Cache API Response ─────────────────────────────────────────

async function cacheApiResponse(url: string, response: Response) {
  try {
    // ★ ابتدا clone کنیم تا بتوانیم چندبار json بخوانیم
    const clonedResponse = response.clone()
    const data = await clonedResponse.json()

    // ★★★ DEBUG: لاگ برای invoices
    const isInvoiceUrl = url.includes('/api/invoices') &&
      !url.includes('/pay') &&
      !url.includes('/return') &&
      !url.includes('/receive-payment') &&
      !url.includes('/service')

    if (isInvoiceUrl) {
      console.log('[cacheApiResponse] 🔵 Invoice URL detected:', url)
      console.log('[cacheApiResponse] Response data:', {
        success: data.success,
        dataType: typeof data.data,
        isArray: Array.isArray(data.data),
        dataLength: data.data?.length,
        hasPagination: !!data.pagination,
      })
    }

    // ★ Plan cache — بدون تغییر
    if (url.includes('/api/tenants/trial-check') && data.success) {
      const { cachePlan } = await import('@/lib/offline-db')
      const planName = data.data?.planName || data.data?.tierName
      if (planName) {
        await cachePlan({
          planName,
          daysRemaining: data.data?.daysRemaining || 0,
          isExpired: data.data?.isExpired || false,
          cached_at: Date.now(),
        })
        console.log('[FetchInterceptor] ✅ Plan cached:', planName)
      }
    }

    // ★★★ Invoices cache — اصلاح شده
    if (isInvoiceUrl) {
      if (!data.success) {
        console.warn('[cacheApiResponse] ❌ Invoices: data.success = false')
        return
      }

      const invoices = data.data || []

      if (!Array.isArray(invoices)) {
        console.warn('[cacheApiResponse] ❌ data.data is not an array:', typeof invoices)
        return
      }

      if (invoices.length === 0) {
        console.warn('[cacheApiResponse] ⚠️ Invoices array is empty')
        // ★ حتی اگر خالی باشد، کش کن — یعنی "هیچ فاکتوری نیست"
      }

      const { cacheInvoicesPage } = await import('@/lib/offline-db')
      const pagination = data.pagination || {}

      try {
        const urlObj = new URL(url, 'http://localhost')
        const status = urlObj.searchParams.get('status') || 'ALL'
        const page = parseInt(urlObj.searchParams.get('page') || '1', 10)

        await cacheInvoicesPage(
          invoices,
          pagination.totalPages || 1,
          pagination.total || invoices.length,
          status,
          page
        )

        console.log(
          `[FetchInterceptor] ✅ ${invoices.length} invoices cached (status=${status}, page=${page})`
        )
      } catch (err: any) {
        console.error('[cacheApiResponse] ❌ Failed to cache invoices:', err?.message)
      }
    }

    // ★ Categories cache — بدون تغییر
    if (url.includes('/api/categories') && data.success) {
      const { cacheCategories: cacheCats } = await import('@/lib/offline-db')
      const cats = Array.isArray(data.data)
        ? data.data
        : data.data?.categories ?? []

      if (cats.length > 0) {
        await cacheCats(cats)
        console.log(`[FetchInterceptor] ✅ ${cats.length} categories cached`)
      }
    }

    // ★ Products cache — بدون تغییر
    if (url.includes('/api/products') && data.success) {
      const { cacheProducts } = await import('@/lib/offline-db')
      const items = Array.isArray(data.data)
        ? data.data
        : data.data?.products ?? data.data?.items ?? []

      if (items.length > 0) {
        await cacheProducts(items)
        console.log(`[FetchInterceptor] ✅ ${items.length} products cached`)
      }
    }

    // ★ Customers cache — بدون تغییر
    if (url.includes('/api/customers') && data.success) {
      const { cacheCustomers } = await import('@/lib/offline-db')
      const items = Array.isArray(data.data)
        ? data.data
        : data.data?.customers ?? []

      if (items.length > 0) {
        await cacheCustomers(items)
        console.log(`[FetchInterceptor] ✅ ${items.length} customers cached`)
      }
    }
  } catch (err: any) {
    console.error('[cacheApiResponse] ❌ Error:', err?.message)
  }
}
// ─── Handle Auth Errors ─────────────────────────────────────────

async function handleAuthErrors(response: Response, url: string) {
  try {
    const data = await response.json()

    if (data?.code === 'SUBSCRIPTION_EXPIRED') {
      console.warn('[FetchInterceptor] اشتراک منقضی شده')
      if (!window.location.pathname.startsWith('/subscription/')) {
        window.location.href = '/subscription/expired'
      }
      return
    }

    if (response.status === 401 && !url.includes('/api/auth/')) {
      console.warn('[FetchInterceptor] 401 unauthorized')
      const currentPath = window.location.pathname
      if (!currentPath.startsWith('/auth/') && !currentPath.startsWith('/subscription/')) {
        const returnUrl = encodeURIComponent(currentPath)
        window.location.href = `/?redirect=${returnUrl}`
      }
    }
  } catch {}
}

// ─── Helper: Cookie ──────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

export default FetchInterceptorLoader