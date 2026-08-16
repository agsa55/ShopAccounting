// ============================================================================
// src/app/success/page.tsx — Success Page (v10.8 - Suspense Fixed)
// ★ نمایش پیام موفقیت ثبت‌نام + پاک‌سازی نهایی + redirect به dashboard
// ★ v10.8: اصلاح Suspense boundary برای Next.js 14+ build
// ============================================================================

'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
// کامپوننت داخلی — استفاده از useSearchParams داخل Suspense
// ═══════════════════════════════════════════════════════════════
function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [countdown, setCountdown] = useState(3)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    // ═══════════════════════════════════════════════════════════════
    // ★ v10.7: پاک‌سازی نهایی و تأیید tenantId
    // ═══════════════════════════════════════════════════════════════
    const tenantIdFromUrl = searchParams.get('tenantId')
    const subdomain = searchParams.get('subdomain')
    const plan = searchParams.get('plan')

    console.log('[Success] 🎉 Registration success page loaded')
    console.log('[Success] Params:', { tenantIdFromUrl, subdomain, plan })

    if (typeof window !== 'undefined') {
      try {
        const token = localStorage.getItem('token')
        if (token && tenantIdFromUrl) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]))

            if (payload.tenantId !== tenantIdFromUrl) {
              console.error('[Success] ❌ Token mismatch! Clearing corrupted data...')
              console.error('[Success] Token has:', payload.tenantId)
              console.error('[Success] URL expects:', tenantIdFromUrl)

              const keysToRemove = [
                'token', 'refreshToken', 'user', 'tenant',
                'storeName', 'planName', 'shop-accounting-store',
                'portal_token',
              ]
              keysToRemove.forEach(key => {
                try { localStorage.removeItem(key) } catch {}
              })

              Object.keys(localStorage).forEach(key => {
                if (key.includes('wizard') || key.includes('force_') || key.includes('renewal_')) {
                  try { localStorage.removeItem(key) } catch {}
                }
              })

              try { sessionStorage.clear() } catch {}

              document.cookie.split(';').forEach(c => {
                const name = c.split('=')[0].trim()
                if (['tenant-slug', 'tenant-view', 'auth-token'].includes(name)) {
                  try {
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
                  } catch {}
                }
              })

              setTimeout(() => {
                window.location.href = '/auth/login?error=token_mismatch'
              }, 1000)
              return
            } else {
              console.log('[Success] ✅ Token matches tenantId:', tenantIdFromUrl)
              setVerified(true)
            }
          } catch (err) {
            console.warn('[Success] Token parse error:', err)
          }
        } else {
          console.warn('[Success] No token or tenantId found')
          setVerified(true) // در صورت نبود token، اجازه redirect بده
        }
      } catch (err) {
        console.warn('[Success] Verification error:', err)
        setVerified(true)
      }
    }

    // countdown و redirect
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          console.log('[Success] 🚀 Redirecting to dashboard...')
          router.replace('/dashboard')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [router, searchParams])

  const handleGoToDashboard = () => {
    console.log('[Success] 🚀 Manual redirect to dashboard')
    router.replace('/dashboard')
  }

  const planLabel = (() => {
    const p = searchParams.get('plan')
    if (p === 'simple') return 'پایه'
    if (p === 'professional') return 'پیشرفته'
    if (p === 'enterprise') return 'حرفه‌ای'
    return '-'
  })()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4" dir="rtl">
      <div className="text-center space-y-6 max-w-md w-full">
        {/* آیکون موفقیت */}
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-emerald-400 rounded-full blur-2xl opacity-30 animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-2xl">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
        </div>

        {/* عنوان و توضیح */}
        <div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">
            ثبت‌نام موفق! 🎉
          </h1>
          <p className="text-gray-600 leading-relaxed">
            فروشگاه شما با موفقیت ایجاد شد.
            <br />
            در حال انتقال به داشبورد...
          </p>
        </div>

        {/* اطلاعات فروشگاه */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-emerald-100 text-right space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">زیردامنه:</span>
            <span className="text-sm font-bold text-gray-900" dir="ltr">
              {searchParams.get('subdomain') || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">پلن:</span>
            <span className="text-sm font-bold text-emerald-600">
              {planLabel}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">وضعیت:</span>
            <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
              {verified ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تأیید شده
                </>
              ) : (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  در حال بررسی
                </>
              )}
            </span>
          </div>
        </div>

        {/* شمارش معکوس */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-emerald-100">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
            <span className="text-sm font-bold text-gray-700">
              {countdown.toLocaleString('fa-IR')} ثانیه تا ورود به داشبورد
            </span>
          </div>

          <button
            onClick={handleGoToDashboard}
            disabled={!verified}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            ورود فوری به داشبورد
          </button>
        </div>

        {/* پیام زیرین */}
        <p className="text-xs text-gray-400">
          فروشگاه شما به مدت ۳ ماه به صورت رایگان فعال است
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// کامپوننت Loading — نمایش در زمان بارگذاری Suspense
// ═══════════════════════════════════════════════════════════════
function SuccessLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4" dir="rtl">
      <div className="text-center space-y-4">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-emerald-400 rounded-full blur-2xl opacity-30 animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-2xl">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          </div>
        </div>
        <p className="text-gray-600 text-sm">در حال بارگذاری...</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Page Component — با Suspense Boundary
// ═══════════════════════════════════════════════════════════════
export default function SuccessPage() {
  return (
    <Suspense fallback={<SuccessLoading />}>
      <SuccessContent />
    </Suspense>
  )
}