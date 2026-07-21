'use client'

// ============================================================================
// src/components/fetch-interceptor-loader.tsx — (v5.1 ★★★ Phase 4)
// ShopAccounting — Client-side Fetch Interceptor
// ----------------------------------------------------------------------------
// این کامپوننت invisible است (هیچ UI رندر نمی‌کند) ولی در سمت کلاینت:
//   ۱. fetch سراسری را monkey-patch می‌کند تا:
//      - هدر Authorization را به‌طور خودکار از localStorage اضافه کند
//      - هدر X-Tenant-Slug را از cookie بخواند و اضافه کند
//   ۲. پاسخ‌های ۴۰۳ با code === 'SUBSCRIPTION_EXPIRED' را تشخیص می‌دهد
//      و کاربر را به /subscription/expired هدایت می‌کند
//   ۳. پاسخ‌های ۴۰۱ را تشخیص می‌دهد و کاربر را به صفحه ورود هدایت می‌کند
//
// ★ این کامپوننت در layout.tsx مونت می‌شود و فقط در سمت کلاینت فعال است
// ============================================================================

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function FetchInterceptorLoader() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ★ جلوگیری از double-patch در StrictMode
    if ((window as any).__fetchIntercepted) return
    ;(window as any).__fetchIntercepted = true

    const originalFetch = window.fetch

    const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // ★ ۱. آماده‌سازی headers
      const headers = new Headers(init?.headers || {})

      // اضافه کردن Authorization از localStorage
      const token = localStorage.getItem('token')
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      // اضافه کردن X-Tenant-Slug از cookie
      const tenantSlug = getCookie('tenant-slug')
      if (tenantSlug && !headers.has('X-Tenant-Slug')) {
        headers.set('X-Tenant-Slug', tenantSlug)
      }

      const newInit: RequestInit = { ...init, headers }

      // ★ ۲. اجرای fetch اصلی
      const response = await originalFetch(input as any, newInit)

      // ★ ۳. بررسی پاسخ برای خطاهای خاص
      //   فقط روی API routes و فقط روی خطاهای 401/403
      const url = typeof input === 'string' ? input : (input as URL).toString()
      const isApiRoute = url.includes('/api/') || url.startsWith('/api/')

      if (isApiRoute && (response.status === 401 || response.status === 403)) {
        // ★ کلون response تا بتوانیم body را بخوانیم بدون اینکه的消费 آن را مسدود کنیم
        try {
          const cloned = response.clone()
          const data = await cloned.json().catch(() => null)

          if (data?.code === 'SUBSCRIPTION_EXPIRED') {
            console.warn('[FetchInterceptor] Subscription expired — redirecting to /subscription/expired')
            // ★ جلوگیری از redirect چندباره
            if (!window.location.pathname.startsWith('/subscription/')) {
              window.location.href = '/subscription/expired'
            }
            return response
          }

          if (data?.code === 'PORTAL_PERMISSION_DENIED') {
            console.warn('[FetchInterceptor] Portal permission denied')
            // ★ برای کاربر پورتال، خطا را به caller برگردان تا خودش مدیریت کند
            return response
          }

          // ★ ۴۰۱ عمومی → هدایت به ورود (با حفظ مسیر فعلی برای بازگشت)
          if (response.status === 401 && !url.includes('/api/auth/') && !url.includes('/api/subscription/')) {
            // ★ فقط اگر در صفحه داخلی هستیم، هدایت کن
            const currentPath = window.location.pathname
            if (!currentPath.startsWith('/auth/') && !currentPath.startsWith('/portal/') && !currentPath.startsWith('/subscription/')) {
              console.warn('[FetchInterceptor] 401 unauthorized — redirecting to login')
              // ★ فقط یک‌بار هدایت کن
              if (!window.location.search.includes('redirect=')) {
                const returnUrl = encodeURIComponent(currentPath)
                window.location.href = `/?redirect=${returnUrl}`
              }
            }
          }
        } catch (err) {
          // ★ اگر نتوانستیم body را parse کنیم، مشکلی نیست — response اصلی را برگردان
        }
      }

      return response
    }

    window.fetch = patchedFetch as typeof window.fetch

    return () => {
      // ★ revert در unmount (برای HMR)
      window.fetch = originalFetch
      ;(window as any).__fetchIntercepted = false
    }
  }, [router])

  // ★ این کامپوننت هیچ UI رندر نمی‌کند
  return null
}

// ─── Helper: خواندن cookie ─────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

export default FetchInterceptorLoader
