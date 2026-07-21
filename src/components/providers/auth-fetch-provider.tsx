/**
 * AuthFetchProvider - ShopAccounting v4.4
 *
 * ✅ این کامپوننت تمام درخواست‌های fetch را intercept کرده
 *    و به طور خودکار Authorization: Bearer <token> را اضافه می‌کند.
 *
 * مشکل: صفحات مختلف (دسته‌بندی، محصولات، مشتریان، فاکتورها، کارکنان)
 *        بدون Authorization هدر درخواست می‌فرستند → 401
 *
 * راه‌حل: با intercept کردن global fetch، تمام درخواست‌های /api/
 *         به طور خودکار توکن JWT دریافت می‌کنند.
 *
 * استفاده: این Provider را در root layout قرار دهید
 */

'use client'

import { useEffect } from 'react'
import { getAccessToken } from '@/lib/auth-client'

export function AuthFetchProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      // دریافت توکن در زمان درخواست (نه در زمان initialization)
      const token = getAccessToken()

      // فقط برای درخواست‌های API داخلی
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input)

      if (token && (url.startsWith('/api/') || url.includes('/api/'))) {
        // ساخت هدرهای جدید
        const existingHeaders = init?.headers
        let headers: Headers

        if (existingHeaders instanceof Headers) {
          headers = new Headers(existingHeaders)
        } else if (Array.isArray(existingHeaders)) {
          headers = new Headers()
          existingHeaders.forEach(([key, value]) => headers.set(key, value))
        } else if (existingHeaders && typeof existingHeaders === 'object') {
          headers = new Headers()
          Object.entries(existingHeaders).forEach(([key, value]) => {
            if (typeof value === 'string') headers.set(key, value)
          })
        } else {
          headers = new Headers()
        }

        // اضافه کردن Authorization فقط اگر وجود ندارد
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`)
        }

        init = { ...init, headers }
      }

      return originalFetch.call(window, input, init)
    }

    // Cleanup: بازگرداندن fetch اصلی هنگام unmount
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return <>{children}</>
}
