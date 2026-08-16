// ============================================================================
// src/components/auth/login-page.tsx — Login Page (v10.7 - Secure Cleanup)
// ShopAccounting — Unified Single Database Architecture
// ★ v10.7: پاک‌سازی کامل cache در mount برای جلوگیری از نشت داده
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
  const [devOtpCode, setDevOtpCode] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null)

  const storeLogin = useAppStore((s) => s.login)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setSelectedPlanId = useAppStore((s) => s.setSelectedPlanId)
  const setCurrentTenant = useAppStore((s) => s.setCurrentTenant)
  const setPlanName = useAppStore((s) => s.setPlanName)

  // ═══════════════════════════════════════════════════════════════
  // ★ v10.7: پاک‌سازی کامل در mount
  // جلوگیری از نشت داده‌های tenant قبلی
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log('[Login] 🧹 Cleaning up all old auth data...')

    // ۱. پاک کردن کلیدهای مشخص
    const keysToRemove = [
      'token', 'refreshToken', 'user', 'tenant',
      'storeName', 'planName', 'shop-accounting-store',
      'portal_token', 'auth-token',
    ]

    keysToRemove.forEach(key => {
      try { localStorage.removeItem(key) } catch (e) {}
    })

    // ۲. پاک کردن wizard flags و force flags
    Object.keys(localStorage).forEach(key => {
      if (key.includes('wizard') || key.includes('force_') ||
          key.includes('renewal_') || key.includes('basic_renewal')) {
        try { localStorage.removeItem(key) } catch (e) {}
      }
    })

    // ۳. پاک کردن sessionStorage
    try { sessionStorage.clear() } catch (e) {}

    // ۴. ریست store
    useAppStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      currentView: 'login',
    })

    console.log('[Login] ✅ Cleanup complete')

    // ۵. بارگذاری tenant branding از cookie
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

  // ★★★ v3.39: تابع اصلاح‌شده برای هدایت پس از لاگین
  function redirectAfterLogin(subDomain: string, userType?: string, portalToken?: string) {
    console.log('[DEBUG] redirectAfterLogin اجرا شد با', subDomain, 'userType:', userType)

    // تنظیم کوکی tenant-slug (سازگار با local و production)
    const cookieDomain = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocalhost = cookieDomain === 'localhost' || cookieDomain === '127.0.0.1'

    if (isLocalhost) {
      document.cookie = `tenant-slug=${subDomain}; path=/; max-age=2592000; SameSite=Lax`
    } else {
      // در production، domain را تنظیم کن
      document.cookie = `tenant-slug=${subDomain}; path=/; max-age=2592000; SameSite=Lax; domain=.${cookieDomain.split('.').slice(-2).join('.')}`
    }

    // ★★★ v3.39: اگر مشتری است، به پورتال با token هدایت شود
    if (userType === 'portalUser') {
      if (portalToken) {
        const portalPath = `/portal/${portalToken}`
        console.log('[DEBUG] Redirecting customer to', portalPath)

        if (typeof window !== 'undefined') {
          window.location.replace(portalPath)
        }
      } else {
        console.log('[DEBUG] Redirecting customer to /portal (no token, will redirect)')
        if (typeof window !== 'undefined') {
          window.location.replace('/portal')
        }
      }
      return
    }

    // برای StoreUser (پرسنل فروشگاه)
    console.log('[DEBUG] Redirecting staff to /dashboard')
    if (typeof window !== 'undefined') {
      window.location.replace('/dashboard')
    }
  }

  // ★ v10.7: انصراف → هدایت سریع به لاندینگ با reload کامل
  function handleGoToLanding() {
    // پاک کردن پلن انتخابی از store
    setSelectedPlanId(null)
    // هدایت به لاندینگ پیج با reload کامل
    window.location.replace('/')
  }

  async function handleLoginSuccess(data: LoginResponse['data']) {
    if (!data) return
    console.log('[DEBUG] handleLoginSuccess شروع شد', data)

    // ═══════════════════════════════════════════════════════════════
    // ★ v10.7: پاک‌سازی قبل از تنظیم token جدید (جلوگیری از نشت)
    // ═══════════════════════════════════════════════════════════════
    if (typeof window !== 'undefined') {
      console.log('[Login] 🧹 Clearing old tokens before setting new ones...')
      const keysToRemove = [
        'token', 'refreshToken', 'user', 'tenant',
        'storeName', 'planName', 'shop-accounting-store',
        'portal_token',
      ]
      keysToRemove.forEach(key => {
        try { localStorage.removeItem(key) } catch (e) {}
      })
    }

    const isPortalUser = data.user.userType === 'portalUser'
    const portalToken = isPortalUser ? (data.user as any).portalToken : null

    const userObj = {
      id: data.user.id,
      username: isPortalUser
        ? `${(data.user as any).firstName || ''} ${(data.user as any).lastName || ''}`.trim()
        : data.user.username,
      role: isPortalUser ? 'customer' : data.user.role,
      tenantId: data.user.tenantId,
      storeId: (data.user as any).storeId,
      storeName: data.user.storeName || data.tenant?.companyName || '',
      permissions: Array.isArray(data.user.permissions) ? data.user.permissions : [],
      userType: data.user.userType,
      mobile: data.user.mobile,
      customerId: isPortalUser ? data.user.id : undefined,
      firstName: isPortalUser ? (data.user as any).firstName : undefined,
      lastName: isPortalUser ? (data.user as any).lastName : undefined,
      currentBalance: isPortalUser ? (data.user as any).currentBalance : undefined,
      creditLimit: isPortalUser ? (data.user as any).creditLimit : undefined,
      portalToken: portalToken,
    }

    setAccessToken(data.token)

    if (typeof window !== 'undefined') {
      localStorage.setItem('refreshToken', data.refreshToken)

      if (portalToken) {
        localStorage.setItem('portal_token', portalToken)
      }
    }

    setStoredUser(userObj)

    if (data.tenant) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('tenant', JSON.stringify(data.tenant))
        localStorage.setItem('storeName', data.tenant.companyName || '')
        localStorage.setItem('planName', data.tenant.planName || '')
      }
    }

    storeLogin(userObj, data.token, data.refreshToken)

    if (data.tenant) {
      setCurrentTenant(data.tenant)
      setPlanName(data.tenant.planName || '')
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v10.7: بررسی نهایی تطابق token با tenant (Safety Net)
    // ═══════════════════════════════════════════════════════════════
    if (typeof window !== 'undefined' && data.tenant?.id) {
      try {
        const finalToken = localStorage.getItem('token')
        if (finalToken) {
          const payload = JSON.parse(atob(finalToken.split('.')[1]))
          if (payload.tenantId !== data.tenant.id) {
            console.error('[Login] ❌ CRITICAL: Token mismatch after login!')
            console.error('[Login] Expected:', data.tenant.id)
            console.error('[Login] Got:', payload.tenantId)
            setError('خطای امنیتی: عدم تطابق نشست. لطفاً دوباره تلاش کنید.')
            localStorage.clear()
            sessionStorage.clear()
            setLoading(false)
            return
          }
          console.log('[Login] ✅ Token verified for tenant:', data.tenant.id)
        }
      } catch (e) {
        console.warn('[Login] Token verification error:', e)
      }
    }

    // برای portalUser، مستقیم redirect کن
    if (isPortalUser && portalToken) {
      const portalPath = `/portal-view?token=${portalToken}`
      if (typeof window !== 'undefined') {
        window.location.replace(portalPath)
      }
      return
    }

    // ★★★ برای storeUser: قبل از redirect به dashboard، وضعیت را چک کن
    if (typeof window !== 'undefined') {
      try {
        const statusRes = await fetch('/api/setup-wizard/status', {
          headers: { Authorization: `Bearer ${data.token}` },
        })

        if (statusRes.ok) {
          const statusData = await statusRes.json()
          if (statusData.success) {
            const status = statusData.data.status
            const subscription = statusData.data.subscription

            console.log('[DEBUG] Status after login:', status, 'Subscription:', subscription)

            // ★★ اگر سال بسته شده و پلن منقضی است → redirect به /renewal
            if (status === 'locked_after_close') {
              console.log('[DEBUG] 🔒 Locked after close — redirect to /renewal')
              window.location.replace('/renewal?reason=after_login_locked')
              return
            }

            // اگر renewal_setup است ولی پلن هنوز منقضی است → /renewal
            if (status === 'renewal_setup') {
              const isExpired = subscription?.isExpired || subscription?.status === 'read_only'
              if (isExpired && !subscription?.isLifetime) {
                console.log('[DEBUG] 💳 Plan expired — redirect to /renewal')
                window.location.replace('/renewal?reason=after_login_expired')
                return
              }
            }
          }
        }
      } catch (err) {
        console.error('[DEBUG] Error checking status after login:', err)
      }
    }

    // redirect به داشبورد
    const subDomain = data.tenant?.subDomain
    if (subDomain) {
      document.cookie = `tenant-slug=${subDomain}; path=/; max-age=2592000; SameSite=Lax`
      if (typeof window !== 'undefined') {
        window.location.replace('/dashboard')
      }
    }
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
        setLoading(false)
      }
    } catch {
      setError('خطا در اتصال به سرور')
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
        if (data.data?._debugCode) {
          setDevOtpCode(data.data._debugCode)
        } else {
          setDevOtpCode('')
        }
      } else {
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* ★ v10.7: دکمه انصراف بالای صفحه (بهبودیافته) */}
        <button
          type="button"
          onClick={handleGoToLanding}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-600 mb-6 transition-colors group"
        >
          <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>بازگشت به صفحه اصلی</span>
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

               <div className="mt-6 pt-5 border-t border-gray-100 space-y-3">
            {/* ── لینک ثبت‌نام — هدایت به لاندینگ برای انتخاب پلن ── */}
            <p className="text-sm text-gray-500 text-center">
              ثبت‌نام نکرده‌اید؟{' '}
              <button
                type="button"
                className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                onClick={() => {
                  // ★ v10.8: پاک کردن پلن قبلی و هدایت به لاندینگ
                  setSelectedPlanId(null)
                  window.location.replace('/')
                }}
              >
                ثبت‌نام کنید
              </button>
            </p>

            {/* ── ★ v10.7: دکمه انصراف واضح ── */}
            <button
              type="button"
              onClick={handleGoToLanding}
              className="w-full py-2.5 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              انصراف و بازگشت به صفحه اصلی
            </button>
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
          ShopAccounting v10.7 — سیستم حسابداری فروشگاهی
        </p>
      </div>
    </div>
  )
}