'use client'

// ============================================================================
// src/components/auth/register-form.tsx (v9.0 ★★★)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v9.0: تغییر ساختار پلن‌ها
//   - ۳ پلن: پایه / پیشرفته / حرفه‌ای  (نام کد: simple / professional / enterprise)
//   - ۲ دوره: سالانه (۳۶۵ روز) / مادام‌العمر (بدون انقضا)
//   - حذف پلن ماهانه
//   - default billingCycle = 'annual' (نه 'monthly')
//
// ★★★ v5.1.5 (Phase 4): بازنویسی کامل با ۳ مرحله
//   ۱. اطلاعات فروشگاه (نام، زیردامنه، نام کاربری، رمز عبور)
//   ۲. تأیید شماره موبایل با OTP (IPPanel)
//   ۳. پرداخت با زرین‌پال (sandbox برای تست)
//   ۴. پس از پرداخت موفق → داشبورد یا صفحه موفقیت
//
// ★★★ v3.1 (قدیمی):
//   ★ حذف مرحله OTP — فعلاً فقط با نام کاربری و رمز عبور ثبت‌نام می‌کردیم
//   ★ اضافه‌شدن فیلد "نام کاربری" (جایگزین ایمیل)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { setAccessToken, setRefreshToken, setStoredUser } from '@/lib/auth-client'
import { getTenantUrl, isDevelopment } from '@/lib/tenant-resolver-client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  ShoppingCart, ArrowRight, ArrowLeft, Loader2, CheckCircle2, Store, Globe,
  Phone, User, Lock, Check, Sparkles, Copy, AlertCircle, RefreshCw, Crown,
} from 'lucide-react'

// ★★★ v5.1.5: ۳ مرحله
const steps = [
  { id: 1, title: 'اطلاعات فروشگاه' },
  { id: 2, title: 'تأیید موبایل' },
  { id: 3, title: 'پرداخت اشتراک' },
]

// ★★★ v9.0: PLAN_INFO با نام‌های جدید و دوره‌های جدید
//   - ۳ پلن: پایه / پیشرفته / حرفه‌ای
//   - ۲ دوره: سالانه / مادام‌العمر
//   - نام کد (tierName) ثابت می‌ماند: simple / professional / enterprise
const PLAN_INFO: Record<string, { title: string; detail: string; isTrial: boolean; tierName: string; billingCycle: string }> = {
  // ★ پلن‌های پایه (default cycle = annual)
  simple:             { title: 'پلن پایه',          detail: 'تا ۲ کاربر و ۲۰۰ محصول',      isTrial: false, tierName: 'simple',       billingCycle: 'annual' },
  professional:       { title: 'پلن پیشرفته',       detail: 'تا ۵ کاربر و ۲,۰۰۰ محصول',   isTrial: false, tierName: 'professional', billingCycle: 'annual' },
  enterprise:         { title: 'پلن حرفه‌ای',       detail: 'کاربر و محصول نامحدود',        isTrial: false, tierName: 'enterprise',   billingCycle: 'annual' },
  // ★ ترکیب پلن + دوره (سالانه)
  simple_annual:      { title: 'پلن پایه سالانه',  detail: 'تا ۲ کاربر و ۲۰۰ محصول',      isTrial: false, tierName: 'simple',       billingCycle: 'annual' },
  professional_annual: { title: 'پلن پیشرفته سالانه', detail: 'تا ۵ کاربر و ۲,۰۰۰ محصول', isTrial: false, tierName: 'professional', billingCycle: 'annual' },
  enterprise_annual:  { title: 'پلن حرفه‌ای سالانه', detail: 'کاربر و محصول نامحدود',     isTrial: false, tierName: 'enterprise',   billingCycle: 'annual' },
  // ★ ترکیب پلن + دوره (مادام‌العمر)
  simple_lifetime:      { title: 'پلن پایه مادام‌العمر',    detail: 'تا ۲ کاربر و ۲۰۰ محصول',      isTrial: false, tierName: 'simple',       billingCycle: 'lifetime' },
  professional_lifetime: { title: 'پلن پیشرفته مادام‌العمر', detail: 'تا ۵ کاربر و ۲,۰۰۰ محصول', isTrial: false, tierName: 'professional', billingCycle: 'lifetime' },
  enterprise_lifetime:  { title: 'پلن حرفه‌ای مادام‌العمر',  detail: 'کاربر و محصول نامحدود',      isTrial: false, tierName: 'enterprise',   billingCycle: 'lifetime' },
  // ★ backward compatibility: پلن‌های قدیمی (ماهانه) → به سالانه تبدیل می‌شوند
  simple_monthly:     { title: 'پلن پایه سالانه',  detail: 'تا ۲ کاربر و ۲۰۰ محصول',      isTrial: false, tierName: 'simple',       billingCycle: 'annual' },
  professional_monthly: { title: 'پلن پیشرفته سالانه', detail: 'تا ۵ کاربر و ۲,۰۰۰ محصول', isTrial: false, tierName: 'professional', billingCycle: 'annual' },
  enterprise_monthly: { title: 'پلن حرفه‌ای سالانه', detail: 'کاربر و محصول نامحدود',     isTrial: false, tierName: 'enterprise',   billingCycle: 'annual' },
  // ★ backward compatibility: پلن‌های قدیمی
  free:               { title: 'پلن پایه',          detail: 'تا ۲ کاربر و ۲۰۰ محصول',      isTrial: false, tierName: 'simple',       billingCycle: 'annual' },
  trial:              { title: 'پلن پایه',          detail: 'تا ۲ کاربر و ۲۰۰ محصول',      isTrial: false, tierName: 'simple',       billingCycle: 'annual' },
}

const BILLING_CYCLE_FA: Record<string, string> = {
  annual: 'سالانه',
  lifetime: 'مادام‌العمر',
  // ★ backward compatibility
  monthly: 'سالانه',
}

export default function RegisterForm() {
  const { setCurrentView, login, selectedPlanId, setSelectedPlanId, selectedBillingCycle, setSelectedBillingCycle } = useAppStore()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const compositeKey = selectedBillingCycle ? `${selectedPlanId}_${selectedBillingCycle}` : ''
  const planName = compositeKey && PLAN_INFO[compositeKey]
    ? compositeKey
    : (selectedPlanId || 'simple')

  const planInfo = PLAN_INFO[planName] || PLAN_INFO.simple

  const effectiveTierName = planInfo.tierName || 'simple'
  const effectiveBillingCycle = selectedBillingCycle || planInfo.billingCycle || 'annual'

  // ─── فیلدهای فرم ──────────────────────────────────────────────
  const [storeName, setStoreName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [username, setUsername] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [subdomainChecking, setSubdomainChecking] = useState(false)

  // ★★★ v5.1.5: state برای OTP
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [mobileVerified, setMobileVerified] = useState(false)
  const [mockOtpCode, setMockOtpCode] = useState<string | null>(null) // برای نمایش در mock mode

  // ★★★ v5.1.5: state برای پرداخت
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [registrationData, setRegistrationData] = useState<{
    accessToken?: string
    refreshToken?: string
    user?: any
    tenant?: any
  } | null>(null)

  const [successProgress, setSuccessProgress] = useState(0)
  const [copied, setCopied] = useState(false)
  const [registrationFailed, setRegistrationFailed] = useState(false)

  const regResultRef = useRef<{
    accessToken?: string
    refreshToken?: string
    user?: any
    tenant?: any
  } | null>(null)

  const subdomainCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── بررسی زیردامنه ───────────────────────────────────────────
  const checkSubdomain = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setSubdomainAvailable(null)
      setSubdomainChecking(false)
      return
    }
    setSubdomainChecking(true)
    setSubdomainAvailable(null)
    try {
      const res = await fetch(`/api/tenants/check-subdomain?subdomain=${encodeURIComponent(value)}`)
      if (res.ok) {
        const data = await res.json()
        setSubdomainAvailable(data.available === true)
      } else {
        const reserved = ['admin', 'test', 'shop', 'api', 'auth', 'www', 'mail', 'ftp', 'cdn']
        setSubdomainAvailable(!reserved.includes(value.toLowerCase()))
      }
    } catch {
      const reserved = ['admin', 'test', 'shop', 'api', 'auth', 'www', 'mail', 'ftp', 'cdn']
      setSubdomainAvailable(!reserved.includes(value.toLowerCase()))
    } finally {
      setSubdomainChecking(false)
    }
  }, [])

  const handleSubdomainChange = useCallback((value: string) => {
    setSubdomain(value)
    if (subdomainCheckRef.current) clearTimeout(subdomainCheckRef.current)
    subdomainCheckRef.current = setTimeout(() => checkSubdomain(value), 500)
  }, [checkSubdomain])

  // ─── ارسال OTP ────────────────────────────────────────────────
  const handleSendOtp = async () => {
    setError('')
    if (!mobile || mobile.length < 11) {
      setError('شماره موبایل نامعتبر است')
      return
    }

    setOtpSending(true)
    try {
      const res = await fetch('/api/tenants/register-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      })

      const data = await res.json()

      if (data.success) {
        setOtpSent(true)
        setOtpCooldown(60)
        // ★ در mock mode، کد را نمایش بده
        if (data.data?.mockMode && data.data?.devCode) {
          setMockOtpCode(data.data.devCode)
        } else {
          setMockOtpCode(null)
        }
      } else {
        setError(data.error || 'خطا در ارسال کد')
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور')
    } finally {
      setOtpSending(false)
    }
  }

  // ─── Countdown برای OTP ───────────────────────────────────────
  useEffect(() => {
    if (otpCooldown <= 0) return
    const timer = setInterval(() => {
      setOtpCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [otpCooldown])

  // ─── تأیید OTP ────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    setError('')
    if (otpCode.length !== 6) {
      setError('کد باید ۶ رقم باشد')
      return
    }

    setOtpVerifying(true)
    try {
      const res = await fetch('/api/tenants/register-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, code: otpCode }),
      })

      const data = await res.json()

      if (data.success) {
        setMobileVerified(true)
        // ★ رفتن به مرحله ۳ (پرداخت)
        setTimeout(() => setCurrentStep(3), 1000)
      } else {
        setError(data.error || 'کد نامعتبر است')
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور')
    } finally {
      setOtpVerifying(false)
    }
  }

  // ─── ثبت‌نام + Checkout ───────────────────────────────────────
  const handleRegisterAndCheckout = async () => {
    setError('')
    setCheckoutLoading(true)

    try {
      // ★ ۱. ثبت‌نام Tenant
      const regRes = await fetch('/api/tenants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: storeName,
          subDomain: subdomain,
          ownerName: storeName,
          ownerMobile: mobile,
          username,
          password,
          planTierName: effectiveTierName,
          billingCycle: effectiveBillingCycle,
          planName,
        }),
      })

      if (!regRes.ok) {
        let errorMsg = 'خطا در ثبت‌نام فروشگاه'
        try {
          const errData = await regRes.json()
          errorMsg = errData.error || errorMsg
        } catch { /* */ }
        setError(errorMsg)
        setCheckoutLoading(false)
        return
      }

      const regData = await regRes.json()
      if (!regData.success) {
        setError(regData.error || 'خطا در ثبت‌نام')
        setCheckoutLoading(false)
        return
      }

      const { accessToken, refreshToken, user, tenant } = regData.data
      regResultRef.current = { accessToken: accessToken || regData.data.token, refreshToken, user, tenant }
      setRegistrationData(regResultRef.current)

      // ★ ذخیره توکن در localStorage (برای فراخوانی checkout)
      if (typeof window !== 'undefined') {
        setAccessToken(accessToken || regData.data.token)
        if (refreshToken) setRefreshToken(refreshToken)
        if (user) setStoredUser(user)
      }

      // ★ ۲. checkout با زرین‌پال
      const token = accessToken || regData.data.token
      const checkoutRes = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tierName: effectiveTierName,
          billingCycle: effectiveBillingCycle,
          action: 'new',
        }),
      })

      const checkoutData = await checkoutRes.json()

      if (checkoutData.success && checkoutData.data?.paymentUrl) {
        // ★ هدایت به درگاه زرین‌پال
        window.location.href = checkoutData.data.paymentUrl
      } else {
        // ★ اگر checkout خطا داد، ولی Tenant ایجاد شده — کاربر می‌تواند بعداً پرداخت کند
        setError(checkoutData.error || 'خطا در ایجاد درخواست پرداخت. فروشگاه ایجاد شد ولی پرداخت ناموفق بود.')
        // ★ رفتن به مرحله موفقیت (بدون پرداخت)
        setCurrentStep(3)
      }
    } catch (err) {
      console.error('[Register] Network error:', err)
      setError('خطا در ارتباط با سرور — لطفاً دوباره تلاش کنید')
      setRegistrationFailed(true)
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleBack = () => {
    setError('')
    setRegistrationFailed(false)
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const handleCancel = () => { window.location.href = '/' }

  // ─── canGoNext ────────────────────────────────────────────────
  const canGoNext = useCallback(() => {
    switch (currentStep) {
      case 1:
        return !!(
          storeName.trim() &&
          subdomain.trim() && subdomain.trim().length >= 3 &&
          subdomainAvailable !== false && !subdomainChecking &&
          username.trim() && username.trim().length >= 3 &&
          mobile.trim() && mobile.trim().length >= 10 &&
          password.length >= 4
        )
      case 2:
        return mobileVerified
      default:
        return false
    }
  }, [currentStep, storeName, subdomain, subdomainAvailable, subdomainChecking, username, mobile, password, mobileVerified])

  // ─── هندل مرحله بعد ──────────────────────────────────────────
  const handleNext = async () => {
    setError('')

    if (currentStep === 1) {
      // ★ از مرحله ۱ به ۲ — ارسال خودکار OTP
      setCurrentStep(2)
      // ★ ارسال OTP خودکار
      setTimeout(() => handleSendOtp(), 300)
      return
    }

    if (currentStep === 2) {
      // ★ تأیید OTP
      if (!mobileVerified) {
        await handleVerifyOtp()
      }
      return
    }
  }

  const handleCopyUrl = () => {
    const url = getTenantUrl(subdomain)
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleGoToLogin = () => {
    if (typeof window !== 'undefined') {
      const loginUrl = getTenantUrl(subdomain, '/login')
      window.location.href = loginUrl
    }
  }

  const progressValue = ((currentStep - 1) / (steps.length - 1)) * 100
  const tenantProdUrl = `${subdomain}.shopaccounting.ir`
  const tenantDevUrl = `localhost:3000/${subdomain}`
  const isLocalDev = isDevelopment()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50 px-4 py-8" dir="rtl">
      <div className="w-full max-w-lg">
        {/* ─── Header ─── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ShopAccounting</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">ثبت‌نام فروشگاه جدید</h1>
          <p className="text-sm text-emerald-600 mt-1 flex items-center justify-center gap-1">
            <Sparkles className="w-4 h-4" />
            شروع فوری در کمتر از ۲ دقیقه
          </p>
          {/* ★ نمایش پلن انتخاب‌شده */}
          <div className="mt-3 inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">
              پلن انتخابی: {planInfo.title} - {BILLING_CYCLE_FA[effectiveBillingCycle] || effectiveBillingCycle}
            </span>
          </div>
        </div>

        {/* ─── Progress ─── */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {steps.map((step) => (
              <div key={step.id} className={`flex items-center gap-1 text-xs ${step.id <= currentStep ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                {step.id < currentStep ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className={`w-6 h-6 rounded-full text-[10px] flex items-center justify-center transition-all ${
                    step.id === currentStep ? 'bg-emerald-600 text-white shadow-md' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step.id}
                  </span>
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </div>
            ))}
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>

        {/* ─── Card ─── */}
        <Card className="border-gray-200 shadow-xl shadow-gray-200/50">
          <CardContent className="pt-6">
            {/* ═══ Step 1: Store Info ═══ */}
            {currentStep === 1 && (
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">اطلاعات فروشگاه</h2>
                  <p className="text-sm text-gray-500">اطلاعات فروشگاه و حساب کاربری خود را وارد کنید</p>
                </div>

                {/* نام فروشگاه */}
                <div className="space-y-2">
                  <Label htmlFor="storeName" className="text-sm font-medium flex items-center gap-1">
                    <Store className="w-3.5 h-3.5" />
                    نام فروشگاه
                  </Label>
                  <Input
                    id="storeName"
                    placeholder="مثال: فروشگاه اروندان"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="h-10"
                  />
                </div>

                {/* زیردامنه */}
                <div className="space-y-2">
                  <Label htmlFor="subdomain" className="text-sm font-medium flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    زیردامنه (آدرس اختصاصی فروشگاه)
                  </Label>
                  <div className="flex items-center gap-0">
                    <Input
                      id="subdomain"
                      placeholder="myshop"
                      value={subdomain}
                      onChange={(e) => handleSubdomainChange(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                      className="text-left rounded-l-none h-10"
                      dir="ltr"
                    />
                    <div className="h-10 px-3 bg-gray-100 border border-r-0 border-input rounded-l-md flex items-center text-sm text-gray-500 whitespace-nowrap">
                      .shopaccounting.ir
                    </div>
                  </div>
                  {subdomainChecking && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      در حال بررسی...
                    </p>
                  )}
                  {subdomainAvailable === true && !subdomainChecking && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> این زیردامنه آزاد است
                    </p>
                  )}
                  {subdomainAvailable === false && !subdomainChecking && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> این زیردامنه قبلاً ثبت شده است
                    </p>
                  )}
                </div>

                {/* نام کاربری */}
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    نام کاربری
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="مثال: admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    className="h-10"
                    dir="ltr"
                  />
                  <p className="text-xs text-gray-400">این نام برای ورود به سیستم استفاده می‌شود</p>
                </div>

                {/* شماره موبایل */}
                <div className="space-y-2">
                  <Label htmlFor="mobile" className="text-sm font-medium flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    شماره موبایل
                  </Label>
                  <Input
                    id="mobile"
                    type="tel"
                    placeholder="09123456789"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    className="h-10"
                    dir="ltr"
                    maxLength={11}
                  />
                  <p className="text-xs text-gray-400">کد تأیید به این شماره ارسال می‌شود</p>
                </div>

                {/* رمز عبور */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    رمز عبور
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="حداقل ۴ کاراکتر"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10"
                    dir="ltr"
                  />
                </div>

                {/* خطا */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* دکمه‌ها */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleCancel} className="flex-1 h-10">
                    انصراف
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={!canGoNext() || loading}
                    className="flex-1 h-10 gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    مرحله بعد
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ═══ Step 2: OTP Verification ═══ */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">تأیید شماره موبایل</h2>
                  <p className="text-sm text-gray-500">کد ۶ رقمی ارسال شده به شماره موبایل خود را وارد کنید</p>
                </div>

                {/* نمایش شماره موبایل */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-gray-700">شماره موبایل:</span>
                    <span className="text-sm font-bold text-gray-900" dir="ltr">{mobile}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-emerald-600"
                    onClick={() => { setCurrentStep(1); setOtpSent(false); setMobileVerified(false); setOtpCode('') }}
                  >
                    ویرایش
                  </Button>
                </div>

                {/* ★ نمایش کد تست در mock mode */}
                {mockOtpCode && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-900">حالت تست — کد تأیید:</p>
                      <p className="text-lg font-bold text-amber-700 font-mono tracking-widest" dir="ltr">{mockOtpCode}</p>
                    </div>
                  </div>
                )}

                {/* ورودی کد OTP */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">کد تأیید ۶ رقمی</Label>
                  <div className="flex justify-center" dir="ltr">
                    <InputOTP
                      value={otpCode}
                      onChange={(value) => setOtpCode(value)}
                      maxLength={6}
                      disabled={mobileVerified}
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
                </div>

                {/* دکمه ارسال مجدد */}
                {!mobileVerified && (
                  <div className="text-center">
                    {otpCooldown > 0 ? (
                      <p className="text-xs text-gray-400">
                        ارسال مجدد کد تا {otpCooldown.toLocaleString('fa-IR')} ثانیه دیگر
                      </p>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSendOtp}
                        disabled={otpSending}
                        className="text-xs text-emerald-600 gap-1"
                      >
                        {otpSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        ارسال مجدد کد
                      </Button>
                    )}
                  </div>
                )}

                {/* تأیید موفق */}
                {mobileVerified && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <p className="text-sm font-bold text-emerald-700">شماره موبایل تأیید شد!</p>
                  </div>
                )}

                {/* خطا */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* دکمه‌ها */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleBack} className="flex-1 h-10">
                    بازگشت
                  </Button>
                  {!mobileVerified ? (
                    <Button
                      onClick={handleVerifyOtp}
                      disabled={otpCode.length !== 6 || otpVerifying}
                      className="flex-1 h-10 gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {otpVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      تأیید کد
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setCurrentStep(3)}
                      className="flex-1 h-10 gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      ادامه به پرداخت
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ═══ Step 3: Payment ═══ */}
            {currentStep === 3 && (
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">پرداخت اشتراک</h2>
                  <p className="text-sm text-gray-500">برای فعال‌سازی فروشگاه خود، پرداخت را تکمیل کنید</p>
                </div>

                {/* خلاصه سفارش */}
                <div className="bg-gradient-to-bl from-emerald-50 to-teal-50 rounded-xl p-5 space-y-3 border border-emerald-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">نام فروشگاه:</span>
                    <span className="font-medium text-gray-900">{storeName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">نام کاربری:</span>
                    <span className="font-medium text-gray-900" dir="ltr">{username}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">شماره موبایل:</span>
                    <span className="font-medium text-gray-900" dir="ltr">{mobile}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">آدرس فروشگاه:</span>
                    <span className="font-medium text-emerald-600" dir="ltr">
                      {isLocalDev ? tenantDevUrl : tenantProdUrl}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-emerald-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">پلن انتخابی:</span>
                      <span className="font-bold text-emerald-700">{planInfo.title}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-gray-500">دوره:</span>
                      <span className="font-bold text-gray-900">{BILLING_CYCLE_FA[effectiveBillingCycle]}</span>
                    </div>
                  </div>
                </div>

                {/* خطا */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* دکمه پرداخت */}
                <div className="space-y-2">
                  <Button
                    onClick={handleRegisterAndCheckout}
                    disabled={checkoutLoading}
                    className="w-full h-12 gap-2 bg-emerald-600 hover:bg-emerald-700 text-base"
                  >
                    {checkoutLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        در حال ایجاد درخواست پرداخت...
                      </>
                    ) : (
                      <>
                        <Crown className="w-5 h-5" />
                        پرداخت با زرین‌پال
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-gray-400">
                    🔒 پرداخت امن از طریق درگاه زرین‌پال
                  </p>
                </div>

                {/* دکمه بازگشت */}
                <Button variant="ghost" onClick={handleBack} className="w-full h-10 text-xs">
                  بازگشت به مرحله قبل
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          ShopAccounting v5.1.5 — سیستم حسابداری فروشگاهی
        </p>
      </div>
    </div>
  )
}
