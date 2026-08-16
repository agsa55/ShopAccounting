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
  Zap, Crown, Building2, Sparkles,
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

// ★ v10.3: تنظیمات UI برای نمایش پلن در بالای فرم
const PLAN_UI: Record<string, { 
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  bgColor: string
  textColor: string
  borderColor: string
  iconBg: string
}> = {
  simple: {
    icon: Zap,
    gradient: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    iconBg: 'bg-blue-100',
  },
  professional: {
    icon: Crown,
    gradient: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    iconBg: 'bg-emerald-100',
  },
  enterprise: {
    icon: Building2,
    gradient: 'from-purple-500 to-fuchsia-600',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    iconBg: 'bg-purple-100',
  },
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

    // ★ v10.4: State های بررسی تکراری بودن
  const [storeNameAvailable, setStoreNameAvailable] = useState<boolean | null>(null)
  const [storeNameChecking, setStoreNameChecking] = useState(false)
  const [storeNameReason, setStoreNameReason] = useState('')

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameReason, setUsernameReason] = useState('')

  const [subdomainReason, setSubdomainReason] = useState('')

  const storeNameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const subdomainCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ★ v10.4: بررسی زیردامنه (بهبودیافته)
  const checkSubdomain = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setSubdomainAvailable(null)
      setSubdomainChecking(false)
      setSubdomainReason('')
      return
    }
    setSubdomainChecking(true)
    setSubdomainAvailable(null)
    try {
  const res = await fetch(`/api/tenants/check-availability?subdomain=${encodeURIComponent(value)}`, {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  cache: 'no-store',
})
      if (res.ok) {
        const data = await res.json()
        const info = data.data?.subdomain
        setSubdomainAvailable(info?.available ?? false)
        setSubdomainReason(info?.reason || '')
      } else {
        setSubdomainAvailable(false)
        setSubdomainReason('خطا در بررسی')
      }
    } catch {
      setSubdomainAvailable(false)
      setSubdomainReason('خطا در ارتباط با سرور')
    } finally {
      setSubdomainChecking(false)
    }
  }, [])

  // ★ v10.4: بررسی نام فروشگاه
  const checkStoreName = useCallback(async (value: string) => {
    if (!value || value.length < 2) {
      setStoreNameAvailable(null)
      setStoreNameChecking(false)
      setStoreNameReason('')
      return
    }
    setStoreNameChecking(true)
    setStoreNameAvailable(null)
    try {
      const res = await fetch(`/api/tenants/check-availability?storeName=${encodeURIComponent(value)}`)
      if (res.ok) {
        const data = await res.json()
        const info = data.data?.storeName
        setStoreNameAvailable(info?.available ?? false)
        setStoreNameReason(info?.reason || '')
      } else {
        setStoreNameAvailable(false)
        setStoreNameReason('خطا در بررسی')
      }
    } catch {
      setStoreNameAvailable(false)
      setStoreNameReason('خطا در ارتباط با سرور')
    } finally {
      setStoreNameChecking(false)
    }
  }, [])

  // ★ v10.4: بررسی نام کاربری
  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameAvailable(null)
      setUsernameChecking(false)
      setUsernameReason('')
      return
    }
    setUsernameChecking(true)
    setUsernameAvailable(null)
    try {
      const res = await fetch(`/api/tenants/check-availability?username=${encodeURIComponent(value)}`)
      if (res.ok) {
        const data = await res.json()
        const info = data.data?.username
        setUsernameAvailable(info?.available ?? false)
        setUsernameReason(info?.reason || '')
      } else {
        setUsernameAvailable(false)
        setUsernameReason('خطا در بررسی')
      }
    } catch {
      setUsernameAvailable(false)
      setUsernameReason('خطا در ارتباط با سرور')
    } finally {
      setUsernameChecking(false)
    }
  }, [])

  const handleSubdomainChange = useCallback((value: string) => {
    setSubdomain(value)
    if (subdomainCheckRef.current) clearTimeout(subdomainCheckRef.current)
    subdomainCheckRef.current = setTimeout(() => checkSubdomain(value), 500)
  }, [checkSubdomain])

    // ★ v10.4: handler های جدید با debounce
  const handleStoreNameChange = useCallback((value: string) => {
    setStoreName(value)
    if (storeNameCheckRef.current) clearTimeout(storeNameCheckRef.current)
    storeNameCheckRef.current = setTimeout(() => checkStoreName(value), 500)
  }, [checkStoreName])

  const handleUsernameChange = useCallback((value: string) => {
    const cleaned = value.toLowerCase().replace(/\s/g, '')
    setUsername(cleaned)
    if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current)
    usernameCheckRef.current = setTimeout(() => checkUsername(cleaned), 500)
  }, [checkUsername])

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

      // ═══════════════════════════════════════════════════════════════
      // ★ v10.7: پاک‌سازی کامل قبل از تنظیم token جدید
      // جلوگیری از نشت داده‌های tenant قبلی (مشکل بحرانی)
      // ═══════════════════════════════════════════════════════════════
      if (typeof window !== 'undefined') {
        console.log('[Register] 🧹 Starting complete cache cleanup...')
        
        // ۱. پاک کردن کلیدهای مشخص
        const keysToRemove = [
          'token', 'refreshToken', 'user', 'tenant',
          'storeName', 'planName', 'shop-accounting-store',
          'portal_token', 'auth-token',
        ]

        keysToRemove.forEach(key => {
          try { localStorage.removeItem(key) } catch (e) {}
        })

        // ۲. پاک کردن همه key های wizard و subscription و force
        Object.keys(localStorage).forEach(key => {
          if (key.includes('wizard') || key.includes('force_') || 
              key.includes('renewal_') || key.includes('basic_renewal')) {
            try { localStorage.removeItem(key) } catch (e) {}
          }
        })

        // ۳. پاک کردن sessionStorage
        try { sessionStorage.clear() } catch (e) {}

        // ۴. پاک کردن cookie های tenant
        document.cookie.split(';').forEach(c => {
          const name = c.split('=')[0].trim()
          if (['tenant-slug', 'tenant-view', 'auth-token'].includes(name)) {
            try {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
            } catch (e) {}
          }
        })

        console.log('[Register] ✅ Cache cleaned successfully')

        // ۵. تنظیم tenant-slug جدید در cookie
        if (tenant?.subDomain) {
          const isLocalhost = window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1'
          const cookieStr = isLocalhost
            ? `tenant-slug=${tenant.subDomain}; path=/; max-age=2592000; SameSite=Lax`
            : `tenant-slug=${tenant.subDomain}; path=/; max-age=2592000; SameSite=Lax; domain=.${window.location.hostname.split('.').slice(-2).join('.')}`
          try {
            document.cookie = cookieStr
            console.log('[Register] ✅ tenant-slug cookie set:', tenant.subDomain)
          } catch (e) {
            console.warn('[Register] Cookie set failed:', e)
          }
        }

        // ۶. حالا token های جدید را تنظیم کن
        setAccessToken(accessToken || regData.data.token)
        if (refreshToken) setRefreshToken(refreshToken)
        if (user) setStoredUser(user)

        // ۷. ذخیره tenant جدید در localStorage
        if (tenant) {
          localStorage.setItem('tenant', JSON.stringify(tenant))
          localStorage.setItem('storeName', tenant.companyName || '')
          localStorage.setItem('planName', tenant.planName || '')
        }

        // ۸. علامت‌گذاری wizard برای اولین ورود
        if (tenant?.id) {
          const forceWizardKey = `force_wizard_${tenant.id}`
          localStorage.setItem(forceWizardKey, 'true')
          console.log('[Register] 🎯 Wizard force flag set for tenant:', tenant.id)
        }

        // ۹. بررسی نهایی — تأیید تطابق
        const finalToken = localStorage.getItem('token')
        if (finalToken && tenant?.id) {
          try {
            const payload = JSON.parse(atob(finalToken.split('.')[1]))
            if (payload.tenantId !== tenant.id) {
              console.error('[Register] ❌ CRITICAL: Token mismatch after registration!')
              console.error('[Register] Expected:', tenant.id)
              console.error('[Register] Got:', payload.tenantId)
              // پاک‌سازی فوری و redirect به login
              localStorage.clear()
              sessionStorage.clear()
              window.location.href = '/auth/login?error=registration_mismatch'
              return
            } else {
              console.log('[Register] ✅ Token verified:', tenant.id)
            }
          } catch (e) {
            console.warn('[Register] Token verification error:', e)
          }
        }
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
  
  // ★ v10.5: انصراف → هدایت به لاندینگ با reload کامل
  // window.location.replace به جای router.replace استفاده می‌شود چون:
  // 1. صفحه را کامل reload می‌کند (جلوگیری از صفحه سفید)
  // 2. همه state های React پاک می‌شوند
  // 3. تاریخچه مرورگر آلوده نمی‌شود (Back به فرم برنمی‌گردد)
  const handleCancel = () => {
    // پاک کردن پلن انتخابی از store
    setSelectedPlanId(null)
    // هدایت به لاندینگ پیج با reload کامل
    window.location.replace('/')
  }

   const canGoNext = useCallback(() => {
    if (currentStep === 1) {
      return !!(
        storeName.trim().length >= 2 &&
        storeNameAvailable === true &&
        !storeNameChecking &&
        subdomain.trim().length >= 3 &&
        subdomainAvailable === true && 
        !subdomainChecking &&
        username.trim().length >= 3 &&
        usernameAvailable === true &&
        !usernameChecking &&
        mobile.trim().length === 11 &&
        password.length >= 4
      )
    }
    return false
  }, [
    currentStep, 
    storeName, storeNameAvailable, storeNameChecking,
    subdomain, subdomainAvailable, subdomainChecking, 
    username, usernameAvailable, usernameChecking,
    mobile, password
  ])

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
        
        {/* ═══════════════════════════════════════════════════════════
            ★ v10.3: Plan Selection Badge — نمایش پلن انتخابی
            ═══════════════════════════════════════════════════════════ */}
        {(() => {
          const ui = PLAN_UI[planName] || PLAN_UI.simple
          const PlanIcon = ui.icon
          return (
            <div className={`mb-4 rounded-2xl border-2 ${ui.borderColor} ${ui.bgColor} p-4 shadow-sm`}>
              <div className="flex items-center gap-3">
                {/* آیکون پلن با gradient */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ui.gradient} flex items-center justify-center shadow-md shrink-0`}>
                  <PlanIcon className="w-6 h-6 text-white" />
                </div>
                
                {/* اطلاعات پلن */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles className={`w-3.5 h-3.5 ${ui.textColor}`} />
                    <span className={`text-[10px] font-bold ${ui.textColor} uppercase tracking-wide`}>
                      پلن انتخابی شما
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-gray-900">
                    {planInfo.title}
                  </h3>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    ۳ ماه استفاده رایگان — سپس فعال‌سازی مادام‌العمر
                  </p>
                </div>
              </div>
              
              {/* مزایای کلیدی */}
              <div className="mt-3 pt-3 border-t border-gray-200/60 grid grid-cols-3 gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${ui.textColor} shrink-0`} />
                  <span className="text-[10px] text-gray-600 leading-tight">بدون کارت بانکی</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${ui.textColor} shrink-0`} />
                  <span className="text-[10px] text-gray-600 leading-tight">راه‌اندازی فوری</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${ui.textColor} shrink-0`} />
                  <span className="text-[10px] text-gray-600 leading-tight">پشتیبانی کامل</span>
                </div>
              </div>
            </div>
          )
        })()}

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
                    {/* ═══ Step 1 ═══ */}
            {currentStep === 1 && (
              <div className="space-y-3">
                {/* ── نام فروشگاه ── */}
                <div className="space-y-1">
                  <Label htmlFor="storeName" className="text-xs font-medium flex items-center gap-1">
                    <Store className="w-3 h-3" />
                    نام فروشگاه
                  </Label>
                  <div className="relative">
                    <Input
                      id="storeName"
                      placeholder="مثال: فروشگاه اروندان"
                      value={storeName}
                      onChange={(e) => handleStoreNameChange(e.target.value)}
                      className={`h-9 text-sm pr-9 ${
                        storeNameAvailable === true ? 'border-emerald-400' :
                        storeNameAvailable === false ? 'border-red-400' : ''
                      }`}
                    />
                    {storeNameChecking && (
                      <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                    )}
                    {storeNameAvailable === true && !storeNameChecking && (
                      <Check className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
                    )}
                    {storeNameAvailable === false && !storeNameChecking && (
                      <AlertCircle className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                  {storeNameReason && (
                    <p className={`text-[10px] flex items-center gap-1 ${
                      storeNameAvailable ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {storeNameAvailable ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {storeNameReason}
                    </p>
                  )}
                </div>

                {/* ── زیردامنه ── */}
                <div className="space-y-1">
                  <Label htmlFor="subdomain" className="text-xs font-medium flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    زیردامنه
                  </Label>
                  <div className="flex items-center gap-0">
                    <div className="relative flex-1">
                      <Input
                        id="subdomain"
                        placeholder="myshop"
                        value={subdomain}
                        onChange={(e) => handleSubdomainChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        className={`text-left rounded-l-none h-9 text-sm pl-9 ${
                          subdomainAvailable === true ? 'border-emerald-400' :
                          subdomainAvailable === false ? 'border-red-400' : ''
                        }`}
                        dir="ltr"
                      />
                      {subdomainChecking && (
                        <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                      )}
                      {subdomainAvailable === true && !subdomainChecking && (
                        <Check className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
                      )}
                      {subdomainAvailable === false && !subdomainChecking && (
                        <AlertCircle className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-500" />
                      )}
                    </div>
                    <div className="h-9 px-2 bg-gray-100 border border-r-0 border-input rounded-l-md flex items-center text-xs text-gray-500 whitespace-nowrap">
                      .shopaccounting.ir
                    </div>
                  </div>
                  {subdomainReason && (
                    <p className={`text-[10px] flex items-center gap-1 ${
                      subdomainAvailable ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {subdomainAvailable ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {subdomainReason}
                    </p>
                  )}
                </div>

              {/* ── نام کاربری ── */}
<div className="space-y-1">
  <Label htmlFor="username" className="text-xs font-medium flex items-center gap-1">
    <User className="w-3 h-3" />
    نام کاربری
  </Label>
  <div className="relative">
    <Input
      id="username"
      placeholder="مثال: admin_shop"
      value={username}
      onChange={(e) => handleUsernameChange(e.target.value)}
      className={`h-9 text-sm pr-9 ${
        usernameAvailable === true ? 'border-emerald-400' :
        usernameAvailable === false ? 'border-red-400' : ''
      }`}
      dir="ltr"
    />
    {usernameChecking && (
      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
    )}
    {usernameAvailable === true && !usernameChecking && (
      <Check className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
    )}
    {usernameAvailable === false && !usernameChecking && (
      <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-500" />
    )}
  </div>
  {usernameReason && (
    <p className={`text-[10px] flex items-center gap-1 ${
      usernameAvailable ? 'text-emerald-600' : 'text-red-500'
    }`}>
      {usernameAvailable ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {usernameReason}
    </p>
  )}
  <p className="text-[9px] text-gray-400">
    فقط حروف انگلیسی کوچک، اعداد و _ (حداقل ۳ کاراکتر)
  </p>
</div>

                {/* ── شماره موبایل ── */}
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
                  <p className="text-[9px] text-gray-400">
                    شماره ۱۱ رقمی شروع شده با ۰۹
                  </p>
                </div>

                {/* ── رمز عبور ── */}
                <div className="space-y-1">
                  <Label htmlFor="password" className="text-xs font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    رمز عبور
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="رمز عبور قوی انتخاب کنید"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`h-9 text-sm ${
                      password.length >= 8 ? 'border-emerald-400' :
                      password.length >= 4 ? 'border-amber-400' :
                      password.length > 0 ? 'border-red-400' : ''
                    }`}
                    dir="ltr"
                  />
                  <div className="space-y-1">
                    <p className="text-[9px] text-gray-500 leading-relaxed">
                      <span className="font-bold">حداقل ۴ کاراکتر</span> — برای امنیت بیشتر، حداقل ۸ کاراکتر شامل حروف و اعداد پیشنهاد می‌شود.
                    </p>
                    {/* نشانگر قدرت رمز */}
                    {password.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              password.length < 4 ? 'bg-red-500 w-1/4' :
                              password.length < 6 ? 'bg-orange-500 w-1/2' :
                              password.length < 8 ? 'bg-amber-500 w-3/4' :
                              'bg-emerald-500 w-full'
                            }`}
                          />
                        </div>
                        <span className={`text-[9px] font-bold whitespace-nowrap ${
                          password.length < 4 ? 'text-red-600' :
                          password.length < 6 ? 'text-orange-600' :
                          password.length < 8 ? 'text-amber-600' :
                          'text-emerald-600'
                        }`}>
                          {password.length < 4 ? 'ضعیف' :
                           password.length < 6 ? 'متوسط' :
                           password.length < 8 ? 'خوب' :
                           'قوی'}
                        </span>
                      </div>
                    )}
                  </div>
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