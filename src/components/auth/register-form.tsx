'use client'

// ============================================================================
// src/components/auth/register-form.tsx (v10.2 — Compact + Free Trial)
// ★ فرم جمع‌وجور، بدون عنوان‌های اضافی
// ★ ارسال startFreeTrial: true به سرور
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { setAccessToken, setRefreshToken, setStoredUser } from '@/lib/auth-client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  ShoppingCart, ArrowLeft, Loader2, CheckCircle2, Store, Globe,
  Phone, User, Lock, Check, AlertCircle, RefreshCw,
} from 'lucide-react'

const steps = [
  { id: 1, title: 'اطلاعات فروشگاه' },
  { id: 2, title: 'تأیید موبایل' },
]

const PLAN_INFO: Record<string, { title: string; tierName: string }> = {
  simple:        { title: 'پلن پایه',    tierName: 'simple' },
  professional:  { title: 'پلن پیشرفته', tierName: 'professional' },
  enterprise:    { title: 'پلن حرفه‌ای', tierName: 'enterprise' },
  demo:          { title: 'پلن پایه',    tierName: 'simple' },
  free:          { title: 'پلن پایه',    tierName: 'simple' },
  trial:         { title: 'پلن پایه',    tierName: 'simple' },
}

export default function RegisterForm() {
  const { selectedPlanId, setSelectedPlanId } = useAppStore()
  const router = useRouter()
  
  const [currentStep, setCurrentStep] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const planParam = urlParams.get('plan')
      if (planParam && PLAN_INFO[planParam]) {
        setSelectedPlanId(planParam)
      } else if (!planParam) {
        setSelectedPlanId('simple')
      }
    }
  }, [setSelectedPlanId])

  const planName = selectedPlanId || 'simple'
  const planInfo = PLAN_INFO[planName] || PLAN_INFO.simple
  const effectiveTierName = planInfo.tierName || 'simple'

  const [storeName, setStoreName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [username, setUsername] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [subdomainChecking, setSubdomainChecking] = useState(false)

  const [otpCode, setOtpCode] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [mobileVerified, setMobileVerified] = useState(false)
  const [mockOtpCode, setMockOtpCode] = useState<string | null>(null)

  const [activating, setActivating] = useState(false)

  const subdomainCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        setOtpCooldown(60)
        if (data.data?.mockMode && data.data?.devCode) {
          setMockOtpCode(data.data.devCode)
        } else {
          setMockOtpCode(null)
        }
      } else {
        setError(data.error || 'خطا در ارسال کد')
      }
    } catch {
      setError('خطا در ارتباط با سرور')
    } finally {
      setOtpSending(false)
    }
  }

  useEffect(() => {
    if (otpCooldown <= 0) return
    const timer = setInterval(() => {
      setOtpCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [otpCooldown])

  const handleVerifyOtpAndRegister = async () => {
    setError('')
    if (otpCode.length !== 6) {
      setError('کد باید ۶ رقم باشد')
      return
    }

    setOtpVerifying(true)
    try {
      const verifyRes = await fetch('/api/tenants/register-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, code: otpCode }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyData.success) {
        setError(verifyData.error || 'کد نامعتبر است')
        setOtpVerifying(false)
        return
      }

      setMobileVerified(true)
      setOtpVerifying(false)
      setActivating(true)

      // ★ ثبت‌نام با startFreeTrial: true
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
          billingCycle: 'annual',    // ★ annual (نه trial)
          planName: planName,
          startFreeTrial: true,      // ★ علامت شروع دوره ۹۰ روزه رایگان
          mobileVerified: true,
        }),
      })

      if (!regRes.ok) {
        let errorMsg = 'خطا در ثبت‌نام'
        try {
          const errData = await regRes.json()
          errorMsg = errData.error || errorMsg
        } catch {}
        setError(errorMsg)
        setActivating(false)
        return
      }

      const regData = await regRes.json()
      if (!regData.success) {
        setError(regData.error || 'خطا در ثبت‌نام')
        setActivating(false)
        return
      }

      const { accessToken, refreshToken, user, tenant } = regData.data

      if (typeof window !== 'undefined') {
        setAccessToken(accessToken || regData.data.token)
        if (refreshToken) setRefreshToken(refreshToken)
        if (user) setStoredUser(user)
      }

      // ★ Redirect به صفحه موفقیت
    router.push(`/success?subdomain=${subdomain}&plan=${planName}&tenantId=${tenant?.id || ''}`)
    } catch (err) {
      console.error('[Register] Error:', err)
      setError('خطا در ارتباط با سرور')
      setOtpVerifying(false)
      setActivating(false)
    }
  }

  const handleBack = () => {
    setError('')
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }
  
  const handleCancel = () => router.replace('/')

  const canGoNext = useCallback(() => {
    if (currentStep === 1) {
      return !!(
        storeName.trim() &&
        subdomain.trim() && subdomain.trim().length >= 3 &&
        subdomainAvailable !== false && !subdomainChecking &&
        username.trim() && username.trim().length >= 3 &&
        mobile.trim() && mobile.trim().length >= 10 &&
        password.length >= 4
      )
    }
    return false
  }, [currentStep, storeName, subdomain, subdomainAvailable, subdomainChecking, username, mobile, password])

  const handleNext = async () => {
    setError('')
    if (currentStep === 1) {
      setCurrentStep(2)
      setTimeout(() => handleSendOtp(), 300)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50 px-4 py-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* ─── Header فشرده ─── */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shadow">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-gray-900">ثبت‌نام فروشگاه</span>
          </div>
        </div>

        {/* ─── Steps ساده ─── */}
        <div className="mb-4 flex justify-center gap-6">
          {steps.map((step) => (
            <div key={step.id} className={`flex items-center gap-1.5 text-xs ${step.id <= currentStep ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
              {step.id < currentStep ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${
                  step.id === currentStep ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step.id}
                </span>
              )}
              <span>{step.title}</span>
            </div>
          ))}
        </div>

        <Card className="border-gray-200 shadow-lg">
          <CardContent className="pt-4 pb-4">
            {/* ═══ Step 1 ═══ */}
            {currentStep === 1 && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="storeName" className="text-xs font-medium flex items-center gap-1">
                    <Store className="w-3 h-3" />
                    نام فروشگاه
                  </Label>
                  <Input
                    id="storeName"
                    placeholder="مثال: فروشگاه اروندان"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="subdomain" className="text-xs font-medium flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    زیردامنه
                  </Label>
                  <div className="flex items-center gap-0">
                    <Input
                      id="subdomain"
                      placeholder="myshop"
                      value={subdomain}
                      onChange={(e) => handleSubdomainChange(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                      className="text-left rounded-l-none h-9 text-sm"
                      dir="ltr"
                    />
                    <div className="h-9 px-2 bg-gray-100 border border-r-0 border-input rounded-l-md flex items-center text-xs text-gray-500 whitespace-nowrap">
                      .shopaccounting.ir
                    </div>
                  </div>
                  {subdomainChecking && (
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> بررسی...
                    </p>
                  )}
                  {subdomainAvailable === true && !subdomainChecking && (
                    <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                      <Check className="w-3 h-3" /> آزاد است
                    </p>
                  )}
                  {subdomainAvailable === false && !subdomainChecking && (
                    <p className="text-[10px] text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> قبلاً ثبت شده
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="username" className="text-xs font-medium flex items-center gap-1">
                    <User className="w-3 h-3" />
                    نام کاربری
                  </Label>
                  <Input
                    id="username"
                    placeholder="مثال: admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    className="h-9 text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="mobile" className="text-xs font-medium flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    شماره موبایل
                  </Label>
                  <Input
                    id="mobile"
                    type="tel"
                    placeholder="09123456789"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    className="h-9 text-sm"
                    dir="ltr"
                    maxLength={11}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="password" className="text-xs font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    رمز عبور
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="حداقل ۴ کاراکتر"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 text-sm"
                    dir="ltr"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" onClick={handleCancel} className="flex-1 h-9 text-xs">
                    انصراف
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={!canGoNext()}
                    className="flex-1 h-9 gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
                  >
                    ادامه
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* ═══ Step 2 ═══ */}
            {currentStep === 2 && (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs text-gray-700">شماره:</span>
                    <span className="text-xs font-bold text-gray-900" dir="ltr">{mobile}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 text-emerald-600 px-2"
                    onClick={() => { setCurrentStep(1); setMobileVerified(false); setOtpCode('') }}
                  >
                    ویرایش
                  </Button>
                </div>

                {mockOtpCode && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-amber-900">کد تست:</p>
                      <p className="text-sm font-bold text-amber-700 font-mono" dir="ltr">{mockOtpCode}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-medium">کد تأیید ۶ رقمی</Label>
                  <div className="flex justify-center" dir="ltr">
                    <InputOTP
                      value={otpCode}
                      onChange={(value) => setOtpCode(value)}
                      maxLength={6}
                      disabled={mobileVerified || activating}
                    >
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                {!mobileVerified && (
                  <div className="text-center">
                    {otpCooldown > 0 ? (
                      <p className="text-[10px] text-gray-400">
                        ارسال مجدد تا {otpCooldown.toLocaleString('fa-IR')} ثانیه دیگر
                      </p>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSendOtp}
                        disabled={otpSending}
                        className="text-[10px] text-emerald-600 gap-1 h-6"
                      >
                        {otpSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        ارسال مجدد
                      </Button>
                    )}
                  </div>
                )}

                {mobileVerified && !activating && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700">موبایل تأیید شد</span>
                    </div>
                    <div className="text-[11px] text-emerald-700 space-y-0.5 pr-6">
                      <div>• فروشگاه <b>{storeName}</b> ایجاد می‌شود</div>
                      <div>• دسترسی کامل به پلن <b>{planInfo.title}</b></div>
                      <div>• پشتیبانی و به‌روزرسانی فعال</div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" onClick={handleBack} disabled={activating} className="flex-1 h-9 text-xs">
                    بازگشت
                  </Button>
                  <Button
                    onClick={handleVerifyOtpAndRegister}
                    disabled={otpCode.length !== 6 || otpVerifying || activating}
                    className="flex-1 h-9 gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
                  >
                    {(otpVerifying || activating) ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    {activating ? 'در حال فعال‌سازی...' : otpVerifying ? 'در حال تأیید...' : 'تأیید و ثبت‌نام'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-gray-400 mt-3">
          رهگشا — سیستم حسابداری فروشگاهی
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ★ Loading Overlay — نمایش در حال ساخت حساب
          ★ این overlay روی تمام صفحه قرار می‌گیرد و از نمایش
          ★ هرگونه UI موقتی قبل از redirect جلوگیری می‌کند
          ═══════════════════════════════════════════════════════════ */}
      {(activating || otpVerifying) && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center" dir="rtl">
          <div className="text-center space-y-5 max-w-md px-6 w-full">
            
            {/* آیکون انیمیشن‌دار */}
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-emerald-400 rounded-full blur-2xl opacity-30 animate-pulse" />
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-2xl">
                <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            </div>

            {/* عنوان و توضیح */}
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-2">
                {otpVerifying && !activating ? 'در حال تأیید کد...' : 'در حال ساخت فروشگاه شما...'}
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                {otpVerifying && !activating 
                  ? 'لطفاً چند لحظه صبر کنید.'
                  : <>فروشگاه <b className="text-gray-700">{storeName}</b> با پلن <b className="text-gray-700">{planInfo.title}</b> در حال ایجاد است.</>
                }
              </p>
            </div>

            {/* Progress Steps */}
            <div className="bg-white rounded-2xl shadow-lg p-4 space-y-2.5 text-right border border-emerald-100">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="text-xs">اطلاعات فروشگاه ثبت شد</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="text-xs">شماره موبایل تأیید شد</span>
              </div>
              <div className="flex items-center gap-2 text-violet-600">
                <div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-xs font-semibold">
                  {otpVerifying && !activating ? 'در حال تأیید کد...' : `فعال‌سازی پلن ${planInfo.title}...`}
                </span>
              </div>
            </div>

            {/* پیام اطمینان‌بخش */}
            <p className="text-[11px] text-gray-400">
              لطفاً صفحه را نبندید. این فرآیند چند لحظه طول می‌کشد.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}