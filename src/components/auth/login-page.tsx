// ============================================================================
// src/components/auth/login-page.tsx — Login Page (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0: 'trial' → 'simple' (رایگان حذف شد)
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { Store, Eye, EyeOff, AlertCircle, Loader2, Smartphone, KeyRound, ArrowRight } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { getTenantSlugClient } from '@/lib/tenant-resolver-client'

let setAccessTokenFn: ((token: string) => void) | null = null
let setStoredUserFn: ((user: any) => void) | null = null

try {
  const authClient = require('@/lib/auth-client')
  setAccessTokenFn = authClient.setAccessToken || null
  setStoredUserFn = authClient.setStoredUser || null
} catch { /* auth-client وجود نداره */ }

function setAccessToken(token: string) {
  localStorage.setItem('token', token)
  setAccessTokenFn?.(token)
}

function setStoredUser(user: any) {
  localStorage.setItem('user', JSON.stringify(user))
  setStoredUserFn?.(user)
}

interface TenantBranding { name: string; slug: string }

interface LoginResponse {
  success: boolean
  data?: {
    token: string
    expiresIn: number
    refreshToken: string
    user: {
      id: string
      username: string
      role: string
      mobile: string
      tenantId: string
      userType: string
      permissions: string[]
      storeId?: string
      storeName?: string
    }
    tenant: {
      id: string
      subDomain: string
      companyName: string
      planName: string
      status: string
      isIsolated: boolean
    }
  }
  error?: string
  errorCode?: string
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mobile, setMobile] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'password' | 'otp'>('password')
  const [otpSent, setOtpSent] = useState(false)
  // ★★★ v3.37.4: نمایش کد تست در محیط توسعه
  const [devOtpCode, setDevOtpCode] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null)

  const storeLogin = useAppStore((s) => s.login)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setSelectedPlanId = useAppStore((s) => s.setSelectedPlanId)
  const setCurrentTenant = useAppStore((s) => s.setCurrentTenant)
  const setPlanName = useAppStore((s) => s.setPlanName)

  useEffect(() => {
    // ★★★ v3.1: پاک‌سازی توکن قبلی هنگام ورود به صفحه لاگین
    // این کار از نمایش داده‌های فروشگاه قبلی جلوگیری می‌کنه
    // مخصوصاً در حالت localhost که کوکی‌ها مشترک هستن
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    localStorage.removeItem('tenant')
    localStorage.removeItem('storeName')
    localStorage.removeItem('planName')
    localStorage.removeItem('shop-accounting-store')
    
    // پاک‌سازی state در store
    useAppStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      currentView: 'login',
    })

    const slug = getTenantSlugClient()
    if (slug) {
      fetch(`/api/tenants/resolve?slug=${slug}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setTenantBranding({ name: data.data.companyName, slug: data.data.subDomain })
          }
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setInterval(() => {
      setResendCountdown(prev => prev > 0 ? prev - 1 : 0)
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCountdown])

     function redirectAfterLogin(subDomain: string) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const hostname = window.location.hostname;
    
    // حالت ۱: محیط توسعه (کامپیوتر خودتان)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      window.location.href = `/${subDomain}/dashboard`
      return
    }
    
    // حالت ۲: محیط Production (Railway یا هر سرور دیگر)
    // ⭐ همیشه از NEXT_PUBLIC_APP_URL استفاده کن، نه آدرس فعلی مرورگر
    // این تضمین می‌کند که حتی اگر کاربر از طریق hosts file یا DNS اشتباه
    // وارد شده باشد، به آدرس صحیح Railway هدایت شود
    if (appUrl && appUrl !== 'http://localhost:3000') {
      // حذف اسلش انتهایی اگر وجود داشت
      const cleanAppUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
      window.location.href = `${cleanAppUrl}/${subDomain}/dashboard`
    } else {
      // fallback: مسیر نسبی
      window.location.href = `/${subDomain}/dashboard`
    }
  }

  function handleGoToLanding() { window.location.href = '/' }

  function handleLoginSuccess(data: LoginResponse['data']) {
    if (!data) return

    const userObj = {
      id: data.user.id,
      username: data.user.username,
      role: data.user.role,
      tenantId: data.user.tenantId,
      storeId: data.user.storeId,
      storeName: data.user.storeName || data.tenant?.companyName || '',
      permissions: Array.isArray(data.user.permissions) ? data.user.permissions : [],
      userType: data.user.userType,
      mobile: data.user.mobile,
    }

    setAccessToken(data.token)
    localStorage.setItem('refreshToken', data.refreshToken)

    setStoredUser({
      userId: data.user.id,
      username: data.user.username,
      role: data.user.role,
      mobile: data.user.mobile || null,
      tenantId: data.user.tenantId,
      storeId: data.user.storeId || '',
      storeName: data.user.storeName || data.tenant?.companyName || '',
      permissions: Array.isArray(data.user.permissions) ? data.user.permissions : [],
      isActive: true,
      userType: (data.user.userType as 'storeUser' | 'portalUser') || 'storeUser',
    })

    if (data.tenant) {
      localStorage.setItem('tenant', JSON.stringify(data.tenant))
      localStorage.setItem('storeName', data.tenant.companyName || '')
      localStorage.setItem('planName', data.tenant.planName || '')
    }

    storeLogin(userObj, data.token, data.refreshToken)

    if (data.tenant) {
      setCurrentTenant(data.tenant)
      setPlanName(data.tenant.planName || '')
    }

    const subDomain = data.tenant?.subDomain
    if (subDomain) redirectAfterLogin(subDomain)
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data: LoginResponse = await res.json()

      if (data.success && data.data) {
        handleLoginSuccess(data.data)
      } else {
        setError(data.error || 'خطا در ورود')
      }
    } catch {
      setError('خطا در اتصال به سرور')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault()
    if (!mobile) return
    if (!/^09[0-9]{9}$/.test(mobile)) {
      setError('فرمت شماره موبایل نامعتبر است (مثال: 09121234567)')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, purpose: 'login' }),
      })
      const data = await res.json()
      if (data.success) {
        setOtpSent(true)
        setResendCountdown(60)
        // ★★★ v3.37.4: نمایش کد تست اگر در محیط توسعه هستیم
        if (data.data?._debugCode) {
          setDevOtpCode(data.data._debugCode)
        } else {
          setDevOtpCode('')
        }
      } else {
        // ★ اگر خطا داشت ولی کد تست برگرداند (محیط dev)
        if (data._debugCode) {
          setOtpSent(true)
          setResendCountdown(60)
          setDevOtpCode(data._debugCode)
        } else {
          setError(data.error || 'خطا در ارسال کد')
        }
      }
    } catch {
      setError('خطا در اتصال به سرور')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, code: otpCode, purpose: 'login' }),
      })
      const data: LoginResponse = await res.json()

      if (data.success && data.data) {
        handleLoginSuccess(data.data)
      } else {
        setError(data.error || 'کد تأیید اشتباه است')
      }
    } catch {
      setError('خطا در اتصال به سرور')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendOTP() {
    if (resendCountdown > 0) return
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, purpose: 'login' }),
      })
      const data = await res.json()
      if (data.success) {
        setResendCountdown(60)
        setOtpCode('')
      } else {
        setError(data.error || 'خطا در ارسال مجدد کد')
      }
    } catch {
      setError('خطا در اتصال به سرور')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={handleGoToLanding}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          بازگشت به صفحه اصلی
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-200 mb-4">
            <Store className="w-8 h-8 text-white" />
          </div>
          {tenantBranding ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{tenantBranding.name}</h1>
              <p className="text-gray-500 text-sm">ورود به فروشگاه {tenantBranding.name}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">حسابداری فروشگاهی</h1>
              <p className="text-gray-500 text-sm">وارد حساب کاربری خود شوید</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6 sm:p-8">
          <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => { setActiveTab('password'); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'password' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              رمز عبور
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('otp'); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'otp' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              کد یکبار مصرف
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">نام کاربری</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="نام کاربری خود را وارد کنید"
                  required
                  autoFocus
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">رمز عبور</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all pl-10"
                    placeholder="رمز عبور خود را وارد کنید"
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:shadow-none"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>در حال ورود...</span></>
                ) : 'ورود'}
              </button>
            </form>
          )}

          {activeTab === 'otp' && !otpSent && (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">شماره موبایل</label>
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="09123456789"
                  required
                  dir="ltr"
                  maxLength={11}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">کد ۶ رقمی به این شماره ارسال می‌شود</p>
              </div>

              <button
                type="submit"
                disabled={loading || !mobile || !/^09[0-9]{9}$/.test(mobile)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:shadow-none"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>در حال ارسال...</span></>
                ) : 'ارسال کد تأیید'}
              </button>
            </form>
          )}

          {activeTab === 'otp' && otpSent && (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div className="text-center text-sm text-gray-500 mb-2">
                کد تأیید به شماره <span className="font-medium text-gray-700" dir="ltr">{mobile}</span> ارسال شد
              </div>

              {/* ★★★ v3.37.4: نمایش کد تست در محیط توسعه (وقتی IPPanel در دسترس نیست) */}
              {devOtpCode && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-[11px] text-amber-700 font-bold mb-1">
                    ⚠️ حالت تست (سرویس پیامک در دسترس نیست)
                  </p>
                  <p className="text-[10px] text-amber-600 mb-2">
                    کد تأیید شما:
                  </p>
                  <p className="text-2xl font-bold font-mono text-amber-800 tracking-[0.3em]" dir="ltr">
                    {devOtpCode}
                  </p>
                  <p className="text-[9px] text-amber-500 mt-1">
                    این کد فقط در محیط توسعه نمایش داده می‌شود
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">کد تأیید</label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="------"
                  required
                  dir="ltr"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:shadow-none"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>در حال تأیید...</span></>
                ) : 'تأیید و ورود'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => { setOtpSent(false); setOtpCode(''); setResendCountdown(0) }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  تغییر شماره
                </button>
                {resendCountdown > 0 ? (
                  <span className="text-gray-400">ارسال مجدد در {resendCountdown} ثانیه</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    disabled={loading}
                    className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors disabled:opacity-50"
                  >
                    ارسال مجدد کد
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ★★★ v3.0: 'trial' → 'simple' */}
          <div className="mt-6 pt-5 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              ثبت‌نام نکرده‌اید؟{' '}
              <button
                type="button"
                className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                onClick={() => {
                  setSelectedPlanId('simple')
                  setCurrentView('register')
                }}
              >
                ثبت‌نام کنید
              </button>
            </p>
          </div>

          {tenantBranding && (
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-400">
                آدرس اختصاصی: <span dir="ltr">{tenantBranding.slug}.shopaccounting.ir</span>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          ShopAccounting v3.0 — سیستم حسابداری فروشگاهی
        </p>
      </div>
    </div>
  )
}
