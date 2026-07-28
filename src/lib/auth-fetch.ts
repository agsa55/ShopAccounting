// ============================================================================
// src/lib/auth-fetch.ts — Authenticated Fetch Helper (v1.0)
// ----------------------------------------------------------------------------
// این تابع fetch معمولی رو با Authorization header از localStorage ترکیب می‌کنه
// تا در کامپوننت‌های client-side استفاده بشه.
// ★ این فایل فقط در سمت کلاینت کار می‌کنه (client-side only)
// ============================================================================

interface AuthFetchOptions extends RequestInit {
  /** اگر true باشد و 401 دریافت کنیم، کاربر به صفحه ورود هدایت می‌شود — پیش‌فرض true */
  redirectToLoginOn401?: boolean
}

/**
 * fetch با Authorization header خودکار از localStorage
 *
 * @example
 * const res = await authFetch('/api/dashboard/stats')
 * const data = await res.json()
 */
export async function authFetch(
  input: RequestInfo | URL,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const { redirectToLoginOn401 = true, headers: customHeaders, ...rest } = options

  // ★ ساخت headers با Authorization
  const headers = new Headers(customHeaders || {})

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    // ★ افزودن X-Tenant-Slug از cookie (در صورت وجود)
    const tenantSlug = getCookie('tenant-slug')
    if (tenantSlug && !headers.has('X-Tenant-Slug')) {
      headers.set('X-Tenant-Slug', tenantSlug)
    }
  }

  const response = await fetch(input as any, {
    ...rest,
    headers,
  })

  // ★ هندل 401 — هدایت به صفحه ورود
  if (response.status === 401 && redirectToLoginOn401 && typeof window !== 'undefined') {
    const currentPath = window.location.pathname
    // ★ جلوگیری از redirect loop
    if (!currentPath.startsWith('/auth/') && !currentPath.startsWith('/subscription/')) {
      // ★ پاک کردن توکن نامعتبر
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      // ★ هدایت به صفحه اصلی (که صفحه ورود رو نشون می‌ده)
      window.location.href = '/'
    }
  }

  return response
}

// ─── Helper: خواندن cookie ─────────────────────────────────────────────
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

export default authFetch
