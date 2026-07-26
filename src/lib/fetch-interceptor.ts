/**
 * Fetch Interceptor — ShopAccounting v5.0
 *
 * اضافه کردن خودکار هدر Authorization به تمام درخواست‌های fetch
 * این فایل باید در ابتدای برنامه لود بشه
 *
 * فایل: src/lib/fetch-interceptor.ts
 */

const ORIGINAL_FETCH = typeof window !== 'undefined' ? window.fetch : null

/**
 * فعال‌سازی interceptor
 * بعد از فراخوانی این تابع، تمام fetchها خودکار هدر Authorization می‌گیرن
 */
export function setupFetchInterceptor() {
  if (typeof window === 'undefined') return
  if ((window as any).__fetchInterceptorActive) return

  const originalFetch = window.fetch

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // فقط درخواست‌های به API خودمون رو تغییر بده
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url

    const isApiCall = url.startsWith('/api/') || url.includes('/api/')
    const isAuthLogin = url.includes('/api/auth/login')
    const isAuthRefresh = url.includes('/api/auth/refresh')
    const isPublicApi =
      url.includes('/api/tenants/register') ||
      url.includes('/api/tenants/verify-otp') ||
      url.includes('/api/tenants/check-subdomain') ||
      url.includes('/api/cron/')

    if (isApiCall && !isAuthLogin && !isAuthRefresh && !isPublicApi) {
      const token = localStorage.getItem('token')

      if (token) {
        // هدر Authorization رو اضافه کن
        const headers = new Headers(init?.headers || {})

        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`)
        }

        // اگر Content-Type نبود و body هم نبود، اضافه نکن
        init = {
          ...init,
          headers,
        }
      }
    }

    // درخواست اصلی رو بفرست
    const response = await originalFetch.call(window, input, init)

    // اگر 401 گرفت و توکن داشتیم، یک بار تلاش برای تمدید
    if (response.status === 401 && isApiCall && !isAuthLogin && !isAuthRefresh) {
      const token = localStorage.getItem('token')
      const refreshToken = localStorage.getItem('refreshToken')

      if (refreshToken) {
        try {
          const refreshRes = await originalFetch.call(window, '/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          })

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json()
            if (refreshData.success && refreshData.data?.token) {
              // توکن جدید رو ذخیره کن
              localStorage.setItem('token', refreshData.data.token)
              document.cookie = `token=${refreshData.data.token}; path=/; max-age=${24 * 60 * 60}; SameSite=Lax`

              // درخواست اصلی رو دوباره با توکن جدید بفرست
              const newHeaders = new Headers(init?.headers || {})
              newHeaders.set('Authorization', `Bearer ${refreshData.data.token}`)

              return originalFetch.call(window, input, {
                ...init,
                headers: newHeaders,
              })
            }
          }
        } catch {
          // تمدید ناموفق
        }
      }

      // ★ فیکس: به‌جای window.location.reload() که حلقه ایجاد می‌کنه،
      // فقط پاکسازی می‌کنیم و redirect می‌دهیم
      // reload() در صورت 401 باعث می‌شد صفحه مدام رفرش بشه
      // چون هر بار reload → fetch → 401 → reload → ...
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('tenant')
      localStorage.removeItem('storeName')
      localStorage.removeItem('planName')
      document.cookie = 'token=; path=/; max-age=0'

      // ★ فیکس: فقط اگه در صفحه لاگین نیستیم، redirect کن (نه reload)
      // redirect به جای reload چون reload حلقه ایجاد می‌کنه
      if (!window.location.pathname.startsWith('/auth/')) {
        // ★ از href استفاده می‌کنیم نه reload — این یه navigation کامل انجام میده
        // و حلقه‌ای ایجاد نمی‌کنه چون توکن پاک شده و دیگه API call نمی‌شه
        window.location.href = `/?logout=1&t=${Date.now()}`
      }
    }

    return response
  }

  ;(window as any).__fetchInterceptorActive = true
}

/**
 * غیرفعال‌سازی interceptor
 */
export function teardownFetchInterceptor() {
  if (typeof window === 'undefined') return
  if (ORIGINAL_FETCH) {
    window.fetch = ORIGINAL_FETCH
  }
  ;(window as any).__fetchInterceptorActive = false
}