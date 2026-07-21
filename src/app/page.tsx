'use client'

import { useEffect, useState, lazy, Suspense } from 'react'
import { useAppStore } from '@/lib/store'

// ============================================================================
// ★ ماژول-لول فلگ
// ============================================================================
let _globalInitDone = false

function AuthLoadingSplash() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50" dir="rtl">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">در حال بارگذاری...</p>
      </div>
    </div>
  )
}

function SimpleLanding() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setSelectedPlanId = useAppStore((s) => s.setSelectedPlanId)

  return (
    <div className="min-h-screen flex flex-col bg-white" dir="rtl" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">S</div>
            <span className="text-lg font-bold text-gray-900">ShopAccounting</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentView('login')} className="text-gray-700 hover:text-emerald-600 text-sm">ورود</button>
            <button onClick={() => { setSelectedPlanId('simple'); setCurrentView('register') }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">شروع کنید</button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <h1 className="text-4xl font-extrabold text-gray-900 leading-tight mb-6">
              حسابداری فروشگاهی <span className="text-emerald-600">هوشمند</span>
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
              مدیریت فروش، مشتریان و اقساط در یک پلتفرم. شروع در کمتر از ۵ دقیقه.
            </p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => { setSelectedPlanId('simple'); setCurrentView('register') }} className="px-8 py-3 bg-emerald-600 text-white rounded-lg">شروع کنید</button>
              <button onClick={() => { setSelectedPlanId('professional'); setCurrentView('register') }} className="px-8 py-3 border border-emerald-300 text-emerald-700 rounded-lg">شروع با پلن پیشرفته</button>
            </div>
          </div>
        </section>
      </main>
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">ShopAccounting v9.5.0</div>
      </footer>
    </div>
  )
}

const LazyLandingPage = lazy(() =>
  import('@/components/landing/landing-page').catch(() => ({ default: SimpleLanding }))
)
const LazyAppShell = lazy(() =>
  import('@/components/app-shell').catch(() => ({ default: SimpleLanding }))
)
const LazyLoginPage = lazy(() =>
  import('@/components/auth/login-page').catch(() => ({ default: SimpleLanding }))
)
const LazyRegisterForm = lazy(() =>
  import('@/components/auth/register-form').catch(() => ({ default: SimpleLanding }))
)

function clearAuthData() {
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
  localStorage.removeItem('storeName')
  localStorage.removeItem('tenant')
  localStorage.removeItem('planName')
  useAppStore.setState({
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null,
    currentView: 'landing',
  })
}

export default function HomePage() {
  const currentView = useAppStore((s) => s.currentView)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const user = useAppStore((s) => s.user)

  const [authCheckDone, setAuthCheckDone] = useState(false)

  useEffect(() => {
    if (_globalInitDone) return
    _globalInitDone = true

    console.log('[HomePage] Auth check starting')

    try {
      const raw = localStorage.getItem('shop-accounting-store')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && 'currentView' in parsed) {
          delete parsed.currentView
          localStorage.setItem('shop-accounting-store', JSON.stringify(parsed))
        }
      }
    } catch {}

    // ★★★ v9.5.3: تشخیص مسیر فعلی از URL
    //   اگر URL شامل /dashboard باشد → کاربر می‌خواهد به داشبورد برود
    //   اگر URL فقط / باشد → لندینگ پیج نمایش داده شود
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/'
    const isDashboardRoute = currentPath.includes('/dashboard')
    console.log('[HomePage] Current path:', currentPath, 'isDashboard:', isDashboardRoute)

    const token = localStorage.getItem('token')

    if (!token) {
      // ★★★ v9.5.3: اگر توکن نیست و مسیر dashboard است → login صفحه
      if (isDashboardRoute) {
        useAppStore.setState({ currentView: 'login' })
      } else {
        useAppStore.setState({ currentView: 'landing' })
      }
      if (useAppStore.getState().isAuthenticated) {
        useAppStore.setState({ isAuthenticated: false, user: null, token: null, refreshToken: null })
      }
      setAuthCheckDone(true)
      return
    }

    const doVerify = async () => {
      try {
        const verifyRes = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (verifyRes.ok) {
          const data = await verifyRes.json()
          if (data?.success && data?.user) {
            useAppStore.getState().login(data.user, token)
            // ★★★ v9.5.3: اگر مسیر dashboard است → داشبورد، در غیر این صورت → لندینگ
            if (isDashboardRoute) {
              useAppStore.setState({ currentView: 'dashboard' })
            } else {
              useAppStore.setState({ currentView: 'landing' })
            }
            setAuthCheckDone(true)
            return
          }
        }

        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          try {
            const refreshRes = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            })

            if (refreshRes.ok) {
              const refreshData = await refreshRes.json()
              if (refreshData?.success && refreshData?.data) {
                const { token: newToken, refreshToken: newRefresh, user: refreshUser } = refreshData.data
                if (newToken && refreshUser) {
                  localStorage.setItem('token', newToken)
                  localStorage.setItem('refreshToken', newRefresh || '')
                  localStorage.setItem('user', JSON.stringify(refreshUser))
                  useAppStore.getState().login(refreshUser, newToken, newRefresh)
                  // ★★★ v9.5.3: اگر مسیر dashboard است → داشبورد، در غیر این صورت → لندینگ
                  if (isDashboardRoute) {
                    useAppStore.setState({ currentView: 'dashboard' })
                  } else {
                    useAppStore.setState({ currentView: 'landing' })
                  }
                  setAuthCheckDone(true)
                  return
                }
              }
            }
          } catch { /* */ }
        }

        clearAuthData()
        setAuthCheckDone(true)
      } catch {
        clearAuthData()
        setAuthCheckDone(true)
      }
    }

    doVerify()
  }, [])

  if (!authCheckDone) {
    return <AuthLoadingSplash />
  }

  // ★★★ v9.5.4: رندر AppShell برای تمام صفحات داخل برنامه (به‌جز landing, login, register)
  // این شامل dashboard, pos, products, invoices, accounting و... می‌شود
  if (isAuthenticated && user && !['landing', 'login', 'register'].includes(currentView)) {
    return (
      <Suspense fallback={<AuthLoadingSplash />}>
        <LazyAppShell />
      </Suspense>
    )
  }

  if (currentView === 'register') {
    return (
      <Suspense fallback={<AuthLoadingSplash />}>
        <LazyRegisterForm />
      </Suspense>
    )
  }

  if (currentView === 'login') {
    return (
      <Suspense fallback={<AuthLoadingSplash />}>
        <LazyLoginPage />
      </Suspense>
    )
  }

  // ★★★ v9.5.4: پیش‌فرض همیشه لندینگ پیج
  return (
    <Suspense fallback={<AuthLoadingSplash />}>
      <LazyLandingPage />
    </Suspense>
  )
}
