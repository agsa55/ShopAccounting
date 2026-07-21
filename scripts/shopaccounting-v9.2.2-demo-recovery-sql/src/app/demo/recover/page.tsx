'use client'

// ============================================================================
// src/app/demo/recover/page.tsx — Demo Login Recovery (v9.2.1 ★★★)
// ShopAccounting — Recover access to a demo tenant
// ----------------------------------------------------------------------------
// این صفحه به کاربرانی که نام کاربری/رمز عبور دمو خود را فراموش کرده‌اند
// اجازه می‌دهد از طریق شماره موبایل و OTP، دوباره به دمو خود دسترسی پیدا کنند.
//
// مراحل:
//   ۱. وارد کردن شماره موبایل
//   ۲. دریافت کد OTP
//   ۳. (اختیاری) تنظیم رمز عبور جدید
//   ۴. هدایت به داشبورد دمو
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  ShoppingCart, ArrowLeft, ArrowRight, Loader2, CheckCircle2, Phone,
  AlertCircle, RefreshCw, Sparkles, Clock, Lock, Key, User, Globe,
} from 'lucide-react'
import { setAccessToken, setRefreshToken, setStoredUser } from '@/lib/auth-client'
import { getTenantUrl } from '@/lib/tenant-resolver-client'

type Step = 'phone' | 'otp' | 'password' | 'success'

export default function DemoRecoverPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('phone')
  const [mobile, setMobile] = useState('')
  const [recoverySessionId, setRecoverySessionId] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [useCustomPassword, setUseCustomPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [mockCode, setMockCode] = useState<string | null>(null)
  const [successData, setSuccessData] = useState<any>(null)
  const [countdown, setCountdown] = useState(5)

  // ─── Countdown برای resend OTP ──────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // ─── Countdown برای هدایت خودکار ────────────────────────────────
  useEffect(() => {
    if (step !== 'success' || countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          redirectToDashboard()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, countdown])

  // ─── اعتبارسنجی موبایل ──────────────────────────────────────────
  const validateMobile = (value: string): boolean => {
    const cleaned = value.replace(/[\s\-()]/g, '')
    return /^09\d{9}$/.test(cleaned) || /^\+989\d{9}$/.test(cleaned) || /^989\d{9}$/.test(cleaned)
  }

  const handleMobileChange = (value: string) => {
    const filtered = value.replace(/[^\d+]/g, '')
    setMobile(filtered)
    if (error) setError('')
  }

  // ─── مرحله ۱: ارسال موبایل ──────────────────────────────────────
  const handleSubmitPhone = async () => {
    setError('')

    if (!mobile) {
      setError('شماره موبایل الزامی است')
      return
    }

    if (!validateMobile(mobile)) {
      setError('فرمت شماره موبایل نامعتبر است (مثال: 09123456789)')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/demo/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      })

      const data = await res.json()

      if (data.success) {
        setRecoverySessionId(data.data.recoverySessionId)
        setSubdomain(data.data.subdomain)
        setMockCode(data.data.devCode || null)
        setStep('otp')
        setCooldown(60)
      } else {
        setError(data.error || 'خطا در ارسال کد تأیید')
      }
    } catch (err) {
      console.error('[Demo Recover] Network error:', err)
      setError('خطا در ارتباط با سرور — لطفاً دوباره تلاش کنید')
    } finally {
      setLoading(false)
    }
  }

  // ─── مرحله ۲: تأیید OTP ─────────────────────────────────────────
  const handleVerifyOtp = async (codeToVerify?: string) => {
    setError('')

    const codeValue = codeToVerify || otpCode
    if (codeValue.length !== 6) {
      setError('کد باید ۶ رقم باشد')
      return
    }

    setLoading(true)
    try {
      // ★ در این مرحله فقط OTP را تأیید نمی‌کنیم — مستقیم به مرحله بعد می‌رویم
      //   کاربر می‌تواند رمز عبور جدید تنظیم کند یا رمز تصادفی بگیرد
      setOtpCode(codeValue)
      setStep('password')
    } finally {
      setLoading(false)
    }
  }

  // ─── مرحله ۳: تنظیم رمز عبور (یا رمز تصادفی) ────────────────────
  const handleSetPassword = async () => {
    setError('')

    if (useCustomPassword) {
      if (newPassword.length < 4) {
        setError('رمز عبور باید حداقل ۴ کاراکتر باشد')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('رمز عبور و تکرار آن یکسان نیستند')
        return
      }
    }

    setLoading(true)
    try {
      const res = await fetch('/api/demo/recover-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile,
          code: otpCode,
          recoverySessionId,
          newPassword: useCustomPassword ? newPassword : undefined,
        }),
      })

      const data = await res.json()

      if (data.success) {
        // ★ ذخیره توکن‌ها
        if (typeof window !== 'undefined') {
          setAccessToken(data.data.accessToken)
          if (data.data.refreshToken) setRefreshToken(data.data.refreshToken)
          if (data.data.user) setStoredUser(data.data.user)
        }

        setSuccessData(data.data)
        setStep('success')
        setCountdown(5)
      } else {
        setError(data.error || 'کد نامعتبر است')
        if (res.status === 410) {
          // ★ دمو منقضی شده → بازگشت به صفحه شروع
          setTimeout(() => router.push('/demo/phone'), 2000)
        }
      }
    } catch (err) {
      console.error('[Demo Recover] Network error:', err)
      setError('خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }

  // ─── ارسال مجدد OTP ──────────────────────────────────────────────
  const handleResend = async () => {
    if (cooldown > 0) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/demo/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      })
      const data = await res.json()
      if (data.success) {
        setCooldown(60)
        setMockCode(data.data.devCode || null)
        setOtpCode('')
      } else {
        setError(data.error || 'خطا در ارسال مجدد کد')
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }

  // ─── هدایت به داشبورد ────────────────────────────────────────────
  const redirectToDashboard = () => {
    if (!successData?.tenant?.subDomain) return
    const dashboardUrl = getTenantUrl(successData.tenant.subDomain)
    window.location.href = dashboardUrl
  }

  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-amber-50 via-white to-orange-50 px-4 py-8" dir="rtl">
      <div className="w-full max-w-md">
        {/* ─── Header ─── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-200">
              <Key className="w-7 h-7 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ShopAccounting</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">بازیابی ورود به دمو</h1>
          <p className="text-sm text-gray-600">
            نام کاربری یا رمز عبور دمو خود را فراموش کرده‌اید؟ اینجا بازیابی کنید.
          </p>
        </div>

        {/* ─── Step Indicator ─── */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[
            { num: 1, label: 'موبایل', active: step === 'phone' },
            { num: 2, label: 'کد تأیید', active: step === 'otp' },
            { num: 3, label: 'رمز عبور', active: step === 'password' },
            { num: 4, label: 'ورود', active: step === 'success' },
          ].map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s.active
                  ? 'bg-amber-600 text-white shadow-md'
                  : i < ['phone', 'otp', 'password', 'success'].indexOf(step)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-200 text-gray-400'
              }`}>
                {i < ['phone', 'otp', 'password', 'success'].indexOf(step) ? '✓' : s.num}
              </div>
              {i < 3 && <div className="w-8 h-0.5 bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* ═══ Step 1: Phone ═══ */}
        {step === 'phone' && (
          <Card className="border-gray-200 shadow-xl shadow-gray-200/50">
            <CardContent className="pt-6">
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">شماره موبایل دمو خود را وارد کنید</h2>
                  <p className="text-sm text-gray-500 mt-1">همان شماره‌ای که با آن دمو ثبت کرده‌اید</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mobile" className="text-sm font-medium flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    شماره موبایل
                  </Label>
                  <Input
                    id="mobile"
                    type="tel"
                    inputMode="tel"
                    placeholder="09123456789"
                    value={mobile}
                    onChange={(e) => handleMobileChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmitPhone()}
                    className="text-left h-12 text-base tracking-wider"
                    dir="ltr"
                    disabled={loading}
                    maxLength={13}
                  />
                  {error && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {error}
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleSubmitPhone}
                  disabled={loading || !mobile}
                  className="w-full h-12 text-sm font-medium bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      در حال ارسال کد...
                    </>
                  ) : (
                    <>
                      ارسال کد بازیابی
                      <ArrowLeft className="w-4 h-4 mr-1" />
                    </>
                  )}
                </Button>

                <div className="text-center pt-2 border-t border-gray-100">
                  <button
                    onClick={() => router.push('/demo/phone')}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mx-auto"
                  >
                    <ArrowRight className="w-3 h-3" />
                    شروع تست دمو جدید
                  </button>
                  <button
                    onClick={() => router.push('/')}
                    className="text-xs text-gray-400 hover:text-gray-600 block mx-auto mt-2"
                  >
                    بازگشت به صفحه اصلی
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══ Step 2: OTP ═══ */}
        {step === 'otp' && (
          <Card className="border-gray-200 shadow-xl shadow-gray-200/50">
            <CardContent className="pt-6">
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">کد تأیید را وارد کنید</h2>
                  <p className="text-sm text-gray-500 mt-1">کد ۶ رقمی ارسال شده به شماره زیر</p>
                  <p className="text-sm font-medium text-amber-700 mt-2" dir="ltr">{mobile}</p>
                </div>

                {mockCode && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-amber-700">حالت تست — کد شما:</p>
                    <p className="text-lg font-bold text-amber-900 tracking-wider" dir="ltr">{mockCode}</p>
                  </div>
                )}

                <div className="flex justify-center" dir="ltr">
                  <InputOTP
                    maxLength={6}
                    value={otpCode}
                    onChange={(value) => {
                      setOtpCode(value)
                      if (error) setError('')
                      if (value.length === 6) {
                        setTimeout(() => handleVerifyOtp(value), 200)
                      }
                    }}
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

                <Button
                  onClick={() => handleVerifyOtp()}
                  disabled={loading || otpCode.length !== 6}
                  className="w-full h-12 text-sm font-medium bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأیید و ادامه'}
                </Button>

                <div className="text-center pt-2">
                  {cooldown > 0 ? (
                    <p className="text-xs text-gray-500">
                      ارسال مجدد کد تا <span className="font-bold">{cooldown}</span> ثانیه دیگر
                    </p>
                  ) : (
                    <button
                      onClick={handleResend}
                      disabled={loading}
                      className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 mx-auto"
                    >
                      <RefreshCw className="w-3 h-3" />
                      ارسال مجدد کد
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setStep('phone')}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mx-auto"
                >
                  <ArrowRight className="w-3 h-3" />
                  تغییر شماره
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══ Step 3: Password ═══ */}
        {step === 'password' && (
          <Card className="border-gray-200 shadow-xl shadow-gray-200/50">
            <CardContent className="pt-6">
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">تنظیم رمز عبور جدید</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {useCustomPassword
                      ? 'رمز عبور جدید خود را وارد کنید'
                      : 'یک رمز عبور تصادفی برای شما تولید خواهد شد'}
                  </p>
                </div>

                {/* Toggle: رمز تصادفی یا دلخواه */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    onClick={() => setUseCustomPassword(false)}
                    className={`flex-1 py-2 text-xs rounded-md transition-colors ${
                      !useCustomPassword ? 'bg-white text-amber-700 shadow-sm font-bold' : 'text-gray-500'
                    }`}
                  >
                    🔮 رمز تصادفی
                  </button>
                  <button
                    onClick={() => setUseCustomPassword(true)}
                    className={`flex-1 py-2 text-xs rounded-md transition-colors ${
                      useCustomPassword ? 'bg-white text-amber-700 shadow-sm font-bold' : 'text-gray-500'
                    }`}
                  >
                    ✏️ رمز دلخواه
                  </button>
                </div>

                {useCustomPassword && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        رمز عبور جدید
                      </Label>
                      <Input
                        type="password"
                        placeholder="حداقل ۴ کاراکتر"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-11"
                        dir="ltr"
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        تکرار رمز عبور
                      </Label>
                      <Input
                        type="password"
                        placeholder="تکرار رمز عبور"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-11"
                        dir="ltr"
                        disabled={loading}
                      />
                    </div>
                  </div>
                )}

                {!useCustomPassword && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                    <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm text-amber-800">
                      یک رمز عبور تصادفی برای شما تولید خواهد شد و در صفحه بعد نمایش داده می‌شود.
                    </p>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-500 text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </p>
                )}

                <Button
                  onClick={handleSetPassword}
                  disabled={loading || (useCustomPassword && (!newPassword || !confirmPassword))}
                  className="w-full h-12 text-sm font-medium bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      در حال بازیابی...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 ml-2" />
                      بازیابی و ورود به دمو
                    </>
                  )}
                </Button>

                <button
                  onClick={() => setStep('otp')}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mx-auto"
                >
                  <ArrowRight className="w-3 h-3" />
                  بازگشت
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══ Step 4: Success ═══ */}
        {step === 'success' && successData && (
          <Card className="border-emerald-200 shadow-xl shadow-emerald-200/50">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200 mx-auto mb-4">
                    <CheckCircle2 className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">ورود بازیابی شد! 🎉</h2>
                  <p className="text-sm text-gray-600">به دمو خود برگشتید</p>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-bold text-emerald-900">
                      {successData.tenant.daysRemaining} روز تا پایان دمو
                    </p>
                  </div>
                  <p className="text-xs text-emerald-700">
                    پس از پایان این مدت، تمام اطلاعات حذف خواهد شد.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-1 mb-1">
                      <User className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-gray-500">نام کاربری</p>
                    </div>
                    <p className="text-sm font-medium text-gray-900" dir="ltr">{successData.user.username}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <div className="flex items-center gap-1 mb-1">
                      <Lock className="w-3 h-3 text-amber-500" />
                      <p className="text-xs text-amber-700">رمز عبور جدید</p>
                    </div>
                    <p className="text-sm font-medium text-amber-900 font-mono" dir="ltr">{successData.user.demoPassword}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-1 mb-1">
                      <Globe className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-gray-500">آدرس فروشگاه</p>
                    </div>
                    <p className="text-sm font-medium text-gray-900" dir="ltr">
                      {successData.tenant.subDomain}.shopaccounting.ir
                    </p>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                  <p className="text-xs text-gray-600">هدایت خودکار...</p>
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Footer ─── */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            می‌خواهید دمو جدید بزنید؟{' '}
            <button
              onClick={() => router.push('/demo/phone')}
              className="text-amber-600 underline font-medium"
            >
              شروع تست دمو
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
