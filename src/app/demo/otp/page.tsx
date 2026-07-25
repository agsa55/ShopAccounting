'use client'

// ============================================================================
// src/app/demo/otp/page.tsx — Demo Trial: OTP Verification (v9.1 ⚡⚡⚡)
// ShopAccounting — Second step of 3-day demo trial
// ----------------------------------------------------------------------------
// شرح صفحه:
//   ۱. بعد OTP از کاربر را از کاربر دریافت می‌کند
//   ۲. آن را به /api/demo/verify-otp ارسال می‌کند
//   ۳. در صورت موفقیت → ذخیره جوکن‌ها + هدایت به /demo/success
//   ۴. در صورت خطا → نمایش پیام + امکان درخواست مجدد کد
// ============================================================================

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  ShoppingCart, ArrowRight, ArrowLeft, Loader2, CheckCircle2, Phone,
  AlertCircle, RefreshCw, Sparkles, Clock,
} from 'lucide-react'
import { setAccessToken, setRefreshToken, setStoredUser } from '@/lib/auth-client'

// ═══════════════════════════════════════════════════════════════════════════
// کامپوننت اصلی با useSearchParams
// ═══════════════════════════════════════════════════════════════════════════
function OtpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const mobile = searchParams.get('mobile') || ''
  const sessionId = searchParams.get('sessionId') || ''
  const devCode = searchParams.get('devCode') // ⚡ فقط در محیط development

  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(60)
  const [resending, setResending] = useState(false)
  const [mockCode, setMockCode] = useState<string | null>(devCode)

  // ─── بررسی پارامترهای URL ───────────────────────────────────────────────
  useEffect(() => {
    if (!mobile || !sessionId) {
      console.error('[Demo OTP] Missing mobile or sessionId')
      router.push('/demo/phone')
      return
    }
  }, [mobile, sessionId, router])

  // ─── Countdown برای resend ───────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // ─── تایید OTP ───────────────────────────────────────────────────────────
  const handleVerify = async () => {
    setError('')

    if (otpCode.length !== 6) {
      setError('کد باید ۶ رقم باشد')
      return
    }

    if (!mobile || !sessionId) {
      setError('اطلاعات موبایل ناقص است. لطفاً دوباره شروع کنید.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/demo/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile,
          code: otpCode,
          demoSessionId: sessionId,
        }),
      })

      const data = await res.json()

      if (data.success) {
        // ⚡ ذخیره جوکن‌ها در localStorage
        if (typeof window !== 'undefined') {
          setAccessToken(data.data.accessToken)
          if (data.data.refreshToken) setRefreshToken(data.data.refreshToken)
          if (data.data.user) setStoredUser(data.data.user)

          // ⚡ ذخیره اطلاعات دمو برای نمایش در صفحه success
          sessionStorage.setItem('demo_success_data', JSON.stringify({
            username: data.data.user.username,
            password: data.data.user.demoPassword,
            subdomain: data.data.tenant.subDomain,
            companyName: data.data.tenant.companyName,
            expiresAt: data.data.tenant.expiresAt,
            daysRemaining: data.data.tenant.daysRemaining,
          }))
        }

        // ⚡ هدایت به صفحه success
        router.push('/demo/success')
      } else {
        setError(data.error || 'کد نامعتبر است')

        // ⚡ اگر موبایل منقضی شده → بازگشت به صفحه phone
        if (res.status === 410) {
          setTimeout(() => router.push('/demo/phone'), 2000)
        }
      }
    } catch (err) {
      console.error('[Demo OTP] Network error:', err)
      setError('خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }

  // ─── ارسال مجدد کد ───────────────────────────────────────────────────────
  const handleResend = async () => {
    if (cooldown > 0) return

    setError('')
    setResending(true)
    try {
      const res = await fetch('/api/demo/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile,
          demoSessionId: sessionId,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setCooldown(60)
        setMockCode(data.data.devCode || null)
        setOtpCode('')
        // ⚡ نمایش پیام موفقیت کوتاه
        setError('')
      } else {
        setError(data.error || 'خطا در ارسال مجدد کد')
        if (data.data?.cooldownRemaining) {
          setCooldown(data.data.cooldownRemaining)
        }
      }
    } catch (err) {
      console.error('[Demo OTP] Resend error:', err)
      setError('خطا در ارتباط با سرور')
    } finally {
      setResending(false)
    }
  }

  // ─── Enter key ───────────────────────────────────────────────────────────
  const handleOtpComplete = (value: string) => {
    setOtpCode(value)
    if (error) setError('')
    // ⚡ اگر ۶ رقم وارد شد، خودکار verify کن
    if (value.length === 6) {
      setTimeout(() => handleVerify(), 200)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50 px-4 py-8" dir="rtl">
      <div className="w-full max-w-md">
        {/* ─── Header ─── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ShopAccounting</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">تایید شماره موبایل</h1>
          <p className="text-sm text-gray-600">
            کد ۶ رقمی ارسال شده به شماره زیر را وارد کنید
          </p>
        </div>

        {/* ─── Mobile Display ─── */}
        <Card className="border-emerald-200 bg-emerald-50/50 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-900" dir="ltr">{mobile}</span>
              </div>
              <button
                onClick={() => router.push('/demo/phone')}
                className="text-xs text-emerald-600 underline hover:text-emerald-700"
              >
                تغییر شماره
              </button>
            </div>
          </CardContent>
        </Card>

        {/* ─── Mock Code Display (dev mode) ─── */}
        {mockCode && (
          <Card className="border-amber-200 bg-amber-50/50 mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-900">حالت تست (Development)</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    کد تایید شما: <span className="font-bold tracking-wider" dir="ltr">{mockCode}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Main Card ─── */}
        <Card className="border-gray-200 shadow-xl shadow-gray-200/50">
          <CardContent className="pt-6">
            <div className="space-y-5">
              <div className="text-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">کد تایید را وارد کنید</h2>
                <p className="text-sm text-gray-500 mt-1">۶ رقم</p>
              </div>

              {/* OTP Input */}
              <div className="flex justify-center" dir="ltr">
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={handleOtpComplete}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center flex items-center justify-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              )}

              {/* Verify Button */}
              <Button
                onClick={handleVerify}
                disabled={loading || otpCode.length !== 6}
                className="w-full h-12 text-sm font-medium bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    در حال تایید...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 ml-2" />
                    تایید و شروع تست دمو
                  </>
                )}
              </Button>

              {/* Resend Code */}
              <div className="text-center pt-2">
                {cooldown > 0 ? (
                  <p className="text-xs text-gray-500">
                    ارسال مجدد کد تا{' '}
                    <span className="font-bold text-gray-700">{cooldown}</span>
                    {' '}ثانیه دیگر
                  </p>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={resending}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 mx-auto"
                  >
                    {resending ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        در حال ارسال...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        ارسال مجدد کد
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Back */}
              <div className="text-center pt-2 border-t border-gray-100">
                <button
                  onClick={() => router.push('/demo/phone')}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mx-auto"
                  disabled={loading}
                >
                  <ArrowRight className="w-3 h-3" />
                  بازگشت و تغییر شماره
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Demo Info ─── */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1.5">
            <Clock className="w-3 h-3 text-emerald-500" />
            <span>پس از تایید، ۳ روز دسترسی کامل خواهید داشت</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Wrapper با Suspense (برای رفع خطای useSearchParams)
// ═══════════════════════════════════════════════════════════════════════════
export default function DemoOtpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg mx-auto mb-3">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
          <p className="text-sm text-gray-600">در حال بارگذاری...</p>
        </div>
      </div>
    }>
      <OtpContent />
    </Suspense>
  )
}