'use client'

// ============================================================================
// src/app/subscription/result/page.tsx (v9.5.0 ⚡⚡⚡)
// ShopAccounting — Subscription Payment Result Page
// ----------------------------------------------------------------------------
// ⚡ v9.5.0: پشتیبانی از تمدید (renewal) + شمارش معکوس + redirect به dashboard
// ⚡ v9.4.0: نسخه پایه
// ⚡ این صفحه پس از بازگشت از درگاه زرین‌پال نمایش داده می‌شود.
// ⚡ پارامترهای query:
//   - status: success | cancelled | failed | error | apply_failed | already_paid
//   - refId: شناسه پرداخت (در صورت موفقیت)
//   - tenantId: شناسه tenant (در صورت موفقیت)
//   - tierName: نام پلن
//   - billingCycle: دوره (annual/lifetime)
//   - isLifetime: 1 اگر مادام‌العمر
//   - expiresAt: تاریخ انقضا (در صورت موفقیت)
//   - action: new | renew | upgrade (نوع عملیات)
// ============================================================================

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, ArrowLeft,
  ShoppingCart, Clock, Sparkles, Crown, Home, RefreshCw, Zap,
} from 'lucide-react'

type ResultStatus = 'success' | 'cancelled' | 'failed' | 'error' | 'apply_failed' | 'already_paid' | 'loading'

// ═══════════════════════════════════════════════════════════════════════════
// کامپوننت اصلی با useSearchParams
// ═══════════════════════════════════════════════════════════════════════════
function ResultContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [status, setStatus] = useState<ResultStatus>('loading')
  const [data, setData] = useState<any>({})
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const statusParam = searchParams.get('status') as ResultStatus
    setStatus(statusParam || 'error')

    setData({
      refId: searchParams.get('refId'),
      tenantId: searchParams.get('tenantId'),
      tierName: searchParams.get('tierName'),
      billingCycle: searchParams.get('billingCycle'),
      isLifetime: searchParams.get('isLifetime') === '1',
      expiresAt: searchParams.get('expiresAt'),
      action: searchParams.get('action') || 'new', // ★ v9.5: نوع عملیات
    })
  }, [searchParams])

  // ⚡ v9.5: شمارش معکوس و redirect خودکار به dashboard
  useEffect(() => {
    if (status !== 'success' && status !== 'already_paid') return

    // پاک کردن کش wizard برای باز شدن Wizard تمدید
    if (typeof window !== 'undefined') {
      Object.keys(localStorage).forEach(key => {
        if (key.includes('wizard') || key.includes('setup')) {
          localStorage.removeItem(key)
        }
      })
    }

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          // ⚡ redirect به dashboard (نه لندینگ پیج!)
          router.push('/dashboard')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [status, router])

  // ─── اگر در حال بارگذاری ─────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">در حال بارگذاری...</p>
        </div>
      </div>
    )
  }

  // ⚡ v9.5: تشخیص نوع عملیات برای نمایش پیام مناسب
  const isRenewal = data.action === 'renew'
  const isUpgrade = data.action === 'upgrade'

  // ─── پیکربندی بر اساس status ─────────────────────────────────────────────
  const config = {
    success: {
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      bgIconColor: 'bg-emerald-100',
      title: isRenewal 
        ? '🎉 تمدید با موفقیت انجام شد!' 
        : isUpgrade 
        ? '🚀 ارتقا با موفقیت انجام شد!' 
        : '🎉 پرداخت با موفقیت انجام شد!',
      message: isRenewal
        ? 'اشتراک شما با موفقیت تمدید شد. در حال انتقال به داشبورد...'
        : isUpgrade
        ? 'پلن شما با موفقیت ارتقا یافت. در حال انتقال به داشبورد...'
        : 'اشتراک شما با موفقیت فعال شد. در حال انتقال به داشبورد...',
      showDetails: true,
    },
    cancelled: {
      icon: XCircle,
      iconColor: 'text-gray-500',
      bgIconColor: 'bg-gray-100',
      title: 'پرداخت لغو شد',
      message: 'شما پرداخت را لغو کردید. در صورت تمایل می‌توانید دوباره تلاش کنید.',
      showDetails: false,
    },
    failed: {
      icon: XCircle,
      iconColor: 'text-red-600',
      bgIconColor: 'bg-red-100',
      title: 'پرداخت ناموفق',
      message: 'پرداخت شما ناموفق بود. در صورت کسر مبلغ، تا ۲۴ ساعت برگردانده می‌شود.',
      showDetails: false,
    },
    error: {
      icon: AlertCircle,
      iconColor: 'text-red-600',
      bgIconColor: 'bg-red-100',
      title: 'خطا',
      message: 'خطایی رخ داده است. لطفاً با پشتیبانی تماس بگیرید.',
      showDetails: false,
    },
    apply_failed: {
      icon: AlertCircle,
      iconColor: 'text-orange-600',
      bgIconColor: 'bg-orange-100',
      title: 'پرداخت موفق، فعال‌سازی ناموفق',
      message: 'پرداخت شما موفق بود اما در فعال‌سازی اشتراک خطایی رخ داد. لطفاً با پشتیبانی تماس بگیرید.',
      showDetails: true,
    },
    already_paid: {
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      bgIconColor: 'bg-emerald-100',
      title: 'این پرداخت قبلاً پردازش شده',
      message: 'این تراکنش قبلاً پردازش شده است. در حال انتقال به داشبورد...',
      showDetails: true,
    },
  }

  const c = config[status] || config.error
  const Icon = c.icon

  // ─── نام پلن فارسی ─────────────────────────────────────────────────────────
  const tierNameFa = (() => {
    const t = (data.tierName || '').toLowerCase()
    if (t.includes('professional') || t.includes('پیشرفته')) return 'پیشرفته'
    if (t.includes('enterprise') || t.includes('حرفه') || t.includes('سازمانی')) return 'حرفه‌ای'
    return 'پایه'
  })()

  // ⚡ v9.5: برچسب نوع عملیات
  const actionBadge = isRenewal 
    ? { label: 'تمدید', icon: RefreshCw, color: 'bg-blue-100 text-blue-700' }
    : isUpgrade
    ? { label: 'ارتقا', icon: Zap, color: 'bg-amber-100 text-amber-700' }
    : { label: 'ثبت‌نام', icon: ShoppingCart, color: 'bg-emerald-100 text-emerald-700' }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4" dir="rtl">
      <div className="w-full max-w-md">
        <Card className="border-gray-200 shadow-xl">
          <CardContent className="pt-8 pb-6 px-6">
            {/* ─── Icon ─── */}
            <div className="text-center mb-6">
              <div className={`w-20 h-20 rounded-full ${c.bgIconColor} flex items-center justify-center mx-auto mb-4`}>
                <Icon className={`w-12 h-12 ${c.iconColor}`} />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">{c.title}</h1>
              <p className="text-sm text-gray-600">{c.message}</p>
              
              {/* ⚡ v9.5: برچسب نوع عملیات */}
              {c.showDetails && (
                <Badge className={`${actionBadge.color} mt-3`}>
                  <actionBadge.icon className="w-3 h-3 ml-1" />
                  {actionBadge.label}
                </Badge>
              )}
            </div>

            {/* ─── Details (فقط در صورت موفقیت) ─── */}
            {c.showDetails && data.tierName && (
              <div className="space-y-3 mb-6">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">پلن {isRenewal ? 'تمدید شده' : isUpgrade ? 'جدید' : 'خریداری شده'}</span>
                    <span className="text-sm font-bold text-gray-900 flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                      {tierNameFa}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">دوره اشتراک</span>
                    <span className="text-sm font-bold text-gray-900 flex items-center gap-1">
                      {data.isLifetime ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          مادام‌العمر
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-emerald-500" />
                          سالانه (۳۶۵ روز)
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {data.refId && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">شناسه پرداخت</span>
                      <span className="text-sm font-mono text-gray-700" dir="ltr">{data.refId}</span>
                    </div>
                  </div>
                )}

                {data.expiresAt && !data.isLifetime && (
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-emerald-600">تاریخ انقضا</span>
                      <span className="text-sm font-medium text-emerald-800" dir="ltr">
                        {new Date(data.expiresAt).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                  </div>
                )}

                {data.isLifetime && (
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-800">
                        اشتراک مادام‌العمر شما بدون تاریخ انقضا فعال است.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ⚡ v9.5: شمارش معکوس برای redirect خودکار */}
            {(status === 'success' || status === 'already_paid') && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-center gap-2 text-sm text-blue-800">
                  <Clock className="w-4 h-4" />
                  <span>
                    انتقال به داشبورد در{' '}
                    <strong className="text-lg">{countdown}</strong> ثانیه...
                  </span>
                </div>
                {(isRenewal || data.action === 'renew') && (
                  <p className="text-xs text-blue-600 mt-2 text-center">
                    🧙 Wizard راه‌اندازی سال مالی جدید به‌صورت خودکار باز می‌شود
                  </p>
                )}
              </div>
            )}

            {/* ─── Actions ─── */}
            <div className="space-y-2">
              {status === 'success' || status === 'already_paid' ? (
                <Button
                  onClick={() => {
                    // ⚡ v9.5: redirect مستقیم به dashboard (نه لندینگ!)
                    router.push('/dashboard')
                  }}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Home className="w-4 h-4 ml-2" />
                  ورود فوری به داشبورد
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    // ⚡ v9.5: بازگشت به صفحه مناسب بر اساس نوع عملیات
                    if (isRenewal) {
                      router.push('/renewal')
                    } else {
                      router.push('/auth/register')
                    }
                  }}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  تلاش مجدد
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => router.push('/')}
                className="w-full h-11"
              >
                <ArrowLeft className="w-4 h-4 ml-2" />
                بازگشت به صفحه اصلی
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          ShopAccounting v9.5.0 — سیستم حسابداری فروشگاهی
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Wrapper با Suspense (برای رفع خطای useSearchParams)
// ═══════════════════════════════════════════════════════════════════════════
export default function SubscriptionResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">در حال بارگذاری...</p>
        </div>
      </div>
    }>
      <ResultContent />
    </Suspense>
  )
}