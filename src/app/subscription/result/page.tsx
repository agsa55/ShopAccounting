'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// ═══════════════════════════════════════════════════════════════
//  ★ v10.1: نسخه بسیار ساده بدون وابستگی به shadcn/ui
//  فقط HTML خالص + Tailwind CSS
// ═══════════════════════════════════════════════════════════════

function ResultContent() {
  const searchParams = useSearchParams()
  const [countdown, setCountdown] = useState(3)
  const [redirectUrl, setRedirectUrl] = useState('/')

  useEffect(() => {
    console.log('[ResultPage] 🚀 Component mounted')
    console.log('[ResultPage] 📊 URL params:', window.location.search)

    // محاسبه URL ریدایرکت
    const slug = localStorage.getItem('tenant-slug') || localStorage.getItem('tenantSlug')
    const url = slug ? `/${slug}/dashboard` : '/'
    setRedirectUrl(url)
    console.log('[ResultPage] 🎯 Redirect URL:', url)

    // شمارش معکوس
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          console.log('[ResultPage] 🚀 Redirecting now to:', url)
          window.location.href = url
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      clearInterval(timer)
      console.log('[ResultPage] 🧹 Cleanup')
    }
  }, [])

  const status = searchParams.get('status') || 'success'
  const tierName = searchParams.get('tierName') || 'enterprise'
  const isLifetime = searchParams.get('isLifetime') === '1'
  const refId = searchParams.get('refId') || ''

  const isSuccess = status === 'success' || status === 'already_paid'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        
        {/* آیکون */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-5xl">✅</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isSuccess ? '🎉 پرداخت موفق!' : '❌ پرداخت ناموفق'}
          </h1>
          <p className="text-gray-600">
            {isSuccess 
              ? 'اشتراک شما با موفقیت فعال شد' 
              : 'مشکلی در پرداخت پیش آمد'}
          </p>
        </div>

        {/* جزئیات */}
        {isSuccess && (
          <div className="space-y-3 mb-6">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">پلن</span>
                <span className="text-sm font-bold text-gray-900">
                  {tierName === 'enterprise' ? 'حرفه‌ای' : tierName === 'professional' ? 'پیشرفته' : 'پایه'}
                </span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">دوره</span>
                <span className="text-sm font-bold text-gray-900">
                  {isLifetime ? '✨ مادام‌العمر' : '📅 سالانه'}
                </span>
              </div>
            </div>

            {refId && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">شناسه پرداخت</span>
                  <span className="text-sm font-mono text-gray-700" dir="ltr">{refId}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* شمارش معکوس */}
        {isSuccess && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-center">
            <p className="text-blue-800 text-sm">
              انتقال به داشبورد در <strong className="text-xl">{countdown}</strong> ثانیه...
            </p>
          </div>
        )}

        {/* دکمه‌ها */}
        <div className="space-y-3">
          {isSuccess && (
            <button
              onClick={() => {
                console.log('[ResultPage] 🚀 Manual redirect to:', redirectUrl)
                window.location.href = redirectUrl
              }}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors"
            >
              🏠 ورود فوری به داشبورد
            </button>
          )}

          {!isSuccess && (
            <button
              onClick={() => window.history.back()}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors"
            >
              🔄 تلاش مجدد
            </button>
          )}

          <button
            onClick={() => window.location.href = '/'}
            className="w-full h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors"
          >
            ← بازگشت به صفحه اصلی
          </button>
        </div>

        {/* فوتر */}
        <p className="text-center text-xs text-gray-400 mt-6">
          ShopAccounting — سیستم حسابداری فروشگاهی
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Error Boundary برای گرفتن خطاها
// ═══════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    console.error('[ErrorBoundary] 💥 Caught error:', error)
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] 📋 Error info:', errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md">
            <div className="text-center">
              <span className="text-6xl mb-4 block">⚠️</span>
              <h1 className="text-xl font-bold text-red-600 mb-2">خطا در رندر صفحه</h1>
              <p className="text-gray-600 mb-4">{this.state.error?.message}</p>
              <button
                onClick={() => {
                  const slug = localStorage.getItem('tenant-slug') || localStorage.getItem('tenantSlug')
                  window.location.href = slug ? `/${slug}/dashboard` : '/'
                }}
                className="w-full h-12 bg-emerald-600 text-white font-bold rounded-lg"
              >
                🏠 رفتن به داشبورد
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

import React from 'react'

// ═══════════════════════════════════════════════════════════════
//  Main export
// ═══════════════════════════════════════════════════════════════
export default function SubscriptionResultPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">در حال بارگذاری...</p>
          </div>
        </div>
      }>
        <ResultContent />
      </Suspense>
    </ErrorBoundary>
  )
}