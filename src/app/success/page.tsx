// ============================================================================
// src/app/success/page.tsx — Success Page (v11.1 - Fixed JWT Decode)
// ★ v11.1: اصلاح atob با پشتیبانی از Base64URL (رفع خطای InvalidCharacterError)
// ★ v10.9.5: اصلاح redirect با window.location.replace (حل مشکل React)
// ★ v10.8: Suspense boundary برای Next.js 14+
// ============================================================================

'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'

// ★ v11.1: تابع کمکی برای decode JWT با پشتیبانی از Base64URL
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    
    // تبدیل Base64URL به Base64 استاندارد
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    
    // اضافه کردن padding اگر لازم باشد
    const pad = base64.length % 4
    if (pad) {
      base64 += '='.repeat(4 - pad)
    }
    
    return JSON.parse(atob(base64))
  } catch (err) {
    console.warn('[Success] JWT decode failed:', err)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// کامپوننت داخلی — استفاده از useSearchParams داخل Suspense
// ═══════════════════════════════════════════════════════════════
function SuccessContent() {
  const searchParams = useSearchParams()
  const [countdown, setCountdown] = useState(3)
  const [verified, setVerified] = useState(false)
  const redirectTriggered = useRef(false)

  useEffect(() => {
    const tenantIdFromUrl = searchParams.get('tenantId')
    const subdomain = searchParams.get('subdomain')
    const plan = searchParams.get('plan')

    console.log('[Success] 🎉 Registration success page loaded')
    console.log('[Success] Params:', { tenantIdFromUrl, subdomain, plan })

    if (typeof window !== 'undefined') {
      try {
        // ★ v11.1: تلاش برای خواندن token از چند کلید مختلف
        const token = localStorage.getItem('token') || localStorage.getItem('accessToken')
        
        if (token && tenantIdFromUrl) {
          const payload = decodeJwtPayload(token)

          if (payload && payload.tenantId && payload.tenantId !== tenantIdFromUrl) {
            console.error('[Success] ❌ Token mismatch! Clearing...', {
              tokenTenant: payload.tenantId,
              urlTenant: tenantIdFromUrl
            })
            const keysToRemove = [
              'token', 'refreshToken', 'user', 'tenant',
              'storeName', 'planName', 'shop-accounting-store',
              'portal_token',
            ]
            keysToRemove.forEach(key => {
              try { localStorage.removeItem(key) } catch {}
            })
            Object.keys(localStorage).forEach(key => {
              if (key.includes('wizard') || key.includes('force_')) {
                try { localStorage.removeItem(key) } catch {}
              }
            })
            try { sessionStorage.clear() } catch {}
            setTimeout(() => {
              window.location.href = '/auth/login?error=token_mismatch'
            }, 1000)
            return
          } else if (payload && payload.tenantId) {
            console.log('[Success] ✅ Token matches tenantId:', tenantIdFromUrl)
            setVerified(true)
          } else {
            // اگر payload نداشتیم ولی token هست، فرض می‌کنیم درست است
            console.log('[Success] ⚠️ Token present but could not decode payload, assuming valid')
            setVerified(true)
          }
        } else {
          setVerified(true)
        }
      } catch (err) {
        console.warn('[Success] Verification error:', err)
        setVerified(true)
      }
    }
  }, [searchParams])

  // ★ v10.9.5: Countdown جداگانه — بدون مشکل React
  useEffect(() => {
    if (countdown <= 0) {
      // وقتی countdown به 0 رسید، redirect کن
      if (!redirectTriggered.current) {
        redirectTriggered.current = true
        console.log('[Success] 🚀 Redirecting to dashboard...')
        // ★ استفاده از window.location.replace به جای router.replace
        window.location.replace('/dashboard')
      }
      return
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown])

  const handleGoToDashboard = () => {
    console.log('[Success] 🚀 Manual redirect to dashboard')
    window.location.replace('/dashboard')
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
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-emerald-400 rounded-full blur-2xl opacity-30 animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-2xl">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
        </div>

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

        <div className="bg-white rounded-2xl shadow-lg p-6 border border-emerald-100">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
            <span className="text-sm font-bold text-gray-700">
              {countdown.toLocaleString('fa-IR')} ثانیه تا ورود به داشبورد
            </span>
          </div>

          <button
            onClick={handleGoToDashboard}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            ورود فوری به داشبورد
          </button>
        </div>

        <p className="text-xs text-gray-400">
          فروشگاه شما به مدت ۳ ماه به صورت رایگان فعال است
        </p>
      </div>
    </div>
  )
}

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

export default function SuccessPage() {
  return (
    <Suspense fallback={<SuccessLoading />}>
      <SuccessContent />
    </Suspense>
  )
}