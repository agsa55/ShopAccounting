'use client'

// ============================================================================
// src/app/demo/success/page.tsx — Demo Trial: Success (v9.1 ★★★)
// ShopAccounting — Final step: show credentials + redirect to dashboard
// ----------------------------------------------------------------------------
// این صفحه:
//   ۱. اطلاعات دمو (نام کاربری، رمز عبور، زیردامنه) را نمایش می‌دهد
//   ۲. یک شمارش معکوس ۳ ثانیه‌ای نمایش می‌دهد
//   ۳. سپس کاربر را به داشبورد فروشگاه دمو هدایت می‌کند
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2, ArrowLeft, Copy, Check, Sparkles, Clock,
  User, Lock, Globe, AlertCircle, Zap,
} from 'lucide-react'
import { getTenantUrl, isDevelopment } from '@/lib/tenant-resolver-client'

interface DemoSuccessData {
  username: string
  password: string
  subdomain: string
  companyName: string
  expiresAt: string
  daysRemaining: number
}

export default function DemoSuccessPage() {
  const router = useRouter()
  const [data, setData] = useState<DemoSuccessData | null>(null)
  const [countdown, setCountdown] = useState(5)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const hasRedirected = useRef(false)

  // ─── خواندن اطلاعات دمو از sessionStorage ─────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    const stored = sessionStorage.getItem('demo_success_data')
    if (!stored) {
      console.error('[Demo Success] No demo data found')
      router.push('/demo/phone')
      return
    }

    try {
      const parsed = JSON.parse(stored) as DemoSuccessData
      setData(parsed)
    } catch (err) {
      console.error('[Demo Success] Failed to parse demo data:', err)
      router.push('/demo/phone')
    }
  }, [router])

  // ─── شمارش معکوس و هدایت خودکار ──────────────────────────────────
  useEffect(() => {
    if (!data || hasRedirected.current) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // ★ هدایت به داشبورد
          hasRedirected.current = true
          redirectToDashboard()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // ─── هدایت به داشبورد ────────────────────────────────────────────
  const redirectToDashboard = () => {
    if (!data) return

    // ★ هدایت به URL فروشگاه
    const dashboardUrl = getTenantUrl(data.subdomain)
    console.log('[Demo Success] Redirecting to:', dashboardUrl)
    window.location.href = dashboardUrl
  }

  // ─── کپی کردن ────────────────────────────────────────────────────
  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    }).catch(() => {
      // ★ fallback
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  // ─── اگر اطلاعات بارگذاری نشده ──────────────────────────────────
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">در حال بارگذاری...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50 px-4 py-8" dir="rtl">
      <div className="w-full max-w-md">
        {/* ─── Header ─── */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200 mx-auto mb-4 animate-pulse-glow">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">تست دمو شما فعال شد! 🎉</h1>
          <p className="text-sm text-gray-600">
            فروشگاه دمو شما با موفقیت ایجاد شد
          </p>
        </div>

        {/* ─── Demo Banner ─── */}
        <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50 to-teal-50 mb-4">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-emerald-900 mb-1">
                  {data.daysRemaining} روز دسترسی کامل
                </p>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  پس از پایان {data.daysRemaining} روز، تمام اطلاعات فروشگاه دمو به‌صورت خودکار حذف خواهد شد.
                  برای ادامه استفاده، لطفاً یکی از پلن‌ها را خریداری کنید.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Credentials Card ─── */}
        <Card className="border-gray-200 shadow-xl shadow-gray-200/50 mb-4">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-base font-semibold text-gray-900 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  اطلاعات ورود به فروشگاه دمو
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  این اطلاعات را ذخیره کنید — برای ورود مجدد به آن‌ها نیاز خواهید داشت
                </p>
              </div>

              {/* Company Name */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">نام فروشگاه</p>
                <p className="text-sm font-medium text-gray-900">{data.companyName}</p>
              </div>

              {/* Username */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <User className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-gray-500">نام کاربری</p>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate" dir="ltr">{data.username}</p>
                  </div>
                  <button
                    onClick={() => handleCopy(data.username, 'username')}
                    className="shrink-0 ml-2 p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="کپی"
                  >
                    {copiedField === 'username' ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Password */}
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <Lock className="w-3 h-3 text-amber-500" />
                      <p className="text-xs text-amber-700">رمز عبور (موقت)</p>
                    </div>
                    <p className="text-sm font-medium text-amber-900 truncate font-mono" dir="ltr">{data.password}</p>
                  </div>
                  <button
                    onClick={() => handleCopy(data.password, 'password')}
                    className="shrink-0 ml-2 p-1.5 rounded hover:bg-amber-100 transition-colors"
                    title="کپی"
                  >
                    {copiedField === 'password' ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-amber-500" />
                    )}
                  </button>
                </div>
              </div>

              {/* Subdomain */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <Globe className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-gray-500">آدرس فروشگاه</p>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate" dir="ltr">
                      {data.subdomain}.shopaccounting.ir
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(`${data.subdomain}.shopaccounting.ir`, 'subdomain')}
                    className="shrink-0 ml-2 p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="کپی"
                  >
                    {copiedField === 'subdomain' ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Auto Redirect Notice ─── */}
        <Card className="border-emerald-200 bg-emerald-50/30 mb-4">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-600">
                هدایت خودکار به داشبورد...
              </p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-emerald-600">{countdown}</span>
                <Button
                  onClick={redirectToDashboard}
                  size="sm"
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ورود به داشبورد
                  <ArrowLeft className="w-3 h-3 mr-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Quick Tips ─── */}
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              برای شروع سریع:
            </p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <span>از منوی «محصولات»، چند محصول نمونه اضافه کنید</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <span>از «صندوق فروش» یک فاکتور测试 صادر کنید</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <span>از «گزارش‌ها» وضعیت فروش خود را ببینید</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* ─── Important Notice ─── */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
            <AlertCircle className="w-3 h-3" />
            پس از پایان {data.daysRemaining} روز، تمام اطلاعات حذف می‌شود
          </p>
        </div>
      </div>

      {/* Animation CSS */}
      <style jsx>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); }
        }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
