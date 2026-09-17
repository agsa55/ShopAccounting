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

// ★★★ بهبود یافته برای SEO - H1, H2, H3 مناسب و محتوای سئو شده
function SimpleLanding() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setSelectedPlanId = useAppStore((s) => s.setSelectedPlanId)

  return (
    <div className="min-h-screen flex flex-col bg-white" dir="rtl" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">S</div>
            <span className="text-lg font-bold text-gray-900">رهگشا سافت</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-gray-700 hover:text-emerald-600 text-sm">ویژگی‌ها</a>
            <a href="#pricing" className="text-gray-700 hover:text-emerald-600 text-sm">قیمت‌گذاری</a>
            <a href="#faq" className="text-gray-700 hover:text-emerald-600 text-sm">سوالات متداول</a>
            <a href="#contact" className="text-gray-700 hover:text-emerald-600 text-sm">تماس با ما</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentView('login')} className="text-gray-700 hover:text-emerald-600 text-sm">ورود</button>
            <button onClick={() => { setSelectedPlanId('simple'); setCurrentView('register') }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">شروع رایگان</button>
          </div>
        </div>
      </header>
      
      <main className="flex-1">
        {/* Hero Section - H1 اصلی صفحه */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
              نرم افزار حسابداری فروشگاهی <span className="text-emerald-600">هوشمند</span> و <span className="text-emerald-600">رایگان</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed">
              <strong>رهگشا</strong> یک سیستم حسابداری فروشگاهی ابری و تحت وب است که مدیریت فروش، مشتریان، اقساط و انبار را در یک پلتفرم یکپارچه ممکن می‌سازد. شروع در کمتر از ۵ دقیقه با <strong>۳ ماه استفاده کاملاً رایگان</strong>.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button onClick={() => { setSelectedPlanId('simple'); setCurrentView('register') }} className="px-8 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-lg">
                🚀 شروع رایگان ۳ ماهه
              </button>
              <button onClick={() => { setSelectedPlanId('professional'); setCurrentView('register') }} className="px-8 py-3 border-2 border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50">
                شروع با پلن پیشرفته
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-4">✓ بدون نیاز به کارت اعتباری &nbsp; ✓ نصب آسان &nbsp; ✓ پشتیبانی از بارکدخوان</p>
          </div>
        </section>

        {/* Features Section - H2 با کلمات کلیدی */}
        <section id="features" className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-4">
              ویژگی‌های نرم افزار حسابداری فروشگاهی رهگشا
            </h2>
            <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
              مجموعه کاملی از ابزارها برای مدیریت حرفه‌ای فروشگاه شما
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: '🧾',
                  title: 'مدیریت فاکتور فروش و خرید',
                  desc: 'صدور فاکتور الکترونیکی، چاپ فاکتور رسمی و مدیریت کامل فاکتورهای فروش و خرید',
                },
                {
                  icon: '📦',
                  title: 'سیستم انبارداری هوشمند',
                  desc: 'مدیریت موجودی انبار، هشدار کمبود کالا، گزارش گردش کالا و انبارگردانی',
                },
                {
                  icon: '👥',
                  title: 'مدیریت مشتریان (CRM)',
                  desc: 'ثبت اطلاعات مشتریان، تاریخچه خرید، مدیریت اعتبار و پیگیری بدهی‌ها',
                },
                {
                  icon: '💰',
                  title: 'مدیریت اقساط و چک',
                  desc: 'ثبت و پیگیری اقساط، مدیریت چک‌های دریافتی و پرداختی، یادآوری سررسید',
                },
                {
                  icon: '📊',
                  title: 'گزارش‌های مالی جامع',
                  desc: 'گزارش فروش روزانه، سود و زیان، ترازنامه، گزارش موجودی و ده‌ها گزارش کاربردی',
                },
                {
                  icon: '📱',
                  title: 'پشتیبانی از بارکدخوان و آفلاین',
                  desc: 'اسکن سریع بارکد محصولات، حالت آفلاین پیشرفته و همگام‌سازی خودکار',
                },
              ].map((feature, i) => (
                <div key={i} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                  <div className="text-4xl mb-3">{feature.icon}</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              قیمت‌گذاری ساده و منصفانه
            </h2>
            <p className="text-gray-600 mb-12">با پلن رایگان شروع کنید، هر زمان خواستید ارتقا دهید</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <div className="bg-white p-8 rounded-xl border-2 border-gray-200 hover:border-emerald-300 transition-colors">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">پلن ساده</h3>
                <p className="text-emerald-600 text-4xl font-extrabold mb-4">رایگان</p>
                <p className="text-gray-600 mb-6">مناسب فروشگاه‌های کوچک</p>
                <ul className="text-right space-y-2 text-gray-700 mb-6">
                  <li>✓ ۳ ماه استفاده رایگان</li>
                  <li>✓ مدیریت فاکتور فروش</li>
                  <li>✓ سیستم انبارداری</li>
                  <li>✓ گزارش‌های پایه</li>
                </ul>
                <button onClick={() => { setSelectedPlanId('simple'); setCurrentView('register') }} className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                  شروع رایگان
                </button>
              </div>
              <div className="bg-emerald-50 p-8 rounded-xl border-2 border-emerald-500 relative">
                <span className="absolute top-4 right-4 bg-emerald-600 text-white text-xs px-2 py-1 rounded">محبوب</span>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">پلن پیشرفته</h3>
                <p className="text-emerald-600 text-4xl font-extrabold mb-4">حرفه‌ای</p>
                <p className="text-gray-600 mb-6">مناسب فروشگاه‌های متوسط و بزرگ</p>
                <ul className="text-right space-y-2 text-gray-700 mb-6">
                  <li>✓ تمام امکانات پلن ساده</li>
                  <li>✓ مدیریت اقساط پیشرفته</li>
                  <li>✓ گزارش‌های پیشرفته</li>
                  <li>✓ پشتیبانی اولویت‌دار</li>
                  <li>✓ درگاه پرداخت</li>
                </ul>
                <button onClick={() => { setSelectedPlanId('professional'); setCurrentView('register') }} className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                  شروع با پلن پیشرفته
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section - برای Rich Snippets در گوگل */}
        <section id="faq" className="py-20 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">
              سوالات متداول درباره نرم افزار حسابداری رهگشا
            </h2>
            <div className="space-y-4">
              {[
                {
                  q: 'نرم افزار حسابداری رهگشا رایگان است؟',
                  a: 'بله، رهگشا ۳ ماه استفاده کاملاً رایگان ارائه می‌دهد و پس از آن می‌توانید با پرداخت هزینه مقرون به صرفه به استفاده ادامه دهید.',
                },
                {
                  q: 'آیا نرم افزار رهگشا تحت وب است؟',
                  a: 'بله، رهگشا یک نرم افزار حسابداری ابری و تحت وب است که از هر دستگاه و هر مکانی با دسترسی به اینترنت قابل استفاده است.',
                },
                {
                  q: 'رهگشا از بارکدخوان پشتیبانی می‌کند؟',
                  a: 'بله، سیستم رهگشا به طور کامل از انواع بارکدخوان‌ها پشتیبانی می‌کند و می‌توانید محصولات را با اسکن بارکد به سرعت به فاکتور اضافه کنید.',
                },
                {
                  q: 'آیا می‌توانم در حالت آفلاین از رهگشا استفاده کنم؟',
                  a: 'بله، رهگشا دارای حالت آفلاین پیشرفته است که فاکتورها را به صورت محلی ذخیره می‌کند و پس از اتصال اینترنت به طور خودکار با سرور همگام‌سازی می‌شود.',
                },
                {
                  q: 'چگونه می‌توانم با رهگشا شروع کنم؟',
                  a: 'کافی است روی دکمه "شروع رایگان" کلیک کرده و در کمتر از ۵ دقیقه ثبت نام کنید. نیازی به کارت اعتباری نیست.',
                },
              ].map((faq, i) => (
                <div key={i} className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-gray-900 mb-2">{faq.q}</h3>
                  <p className="text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contact" className="py-20">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              تماس با ما
            </h2>
            <p className="text-gray-600 mb-8">تیم پشتیبانی رهگشا آماده پاسخگویی به سوالات شماست</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 p-6 rounded-xl">
                <h3 className="font-bold text-gray-900 mb-2">📧 ایمیل</h3>
                <a href="mailto:info@rahgooshasf.ir" className="text-emerald-600 hover:underline">
                  info@rahgooshasf.ir
                </a>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl">
                <h3 className="font-bold text-gray-900 mb-2">🌐 وب‌سایت</h3>
                <a href="https://rahgooshasf.ir" className="text-emerald-600 hover:underline">
                  rahgooshasf.ir
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="text-white font-bold mb-3">رهگشا سافت</h4>
              <p className="text-sm leading-relaxed">
                نرم افزار حسابداری فروشگاهی ابری و هوشمند برای مدیریت حرفه‌ای فروشگاه شما
              </p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-3">لینک‌های سریع</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white">ویژگی‌ها</a></li>
                <li><a href="#pricing" className="hover:text-white">قیمت‌گذاری</a></li>
                <li><a href="#faq" className="hover:text-white">سوالات متداول</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-3">محصولات</h4>
              <ul className="space-y-2 text-sm">
                <li><span>نرم افزار حسابداری فروشگاهی</span></li>
                <li><span>سیستم انبارداری</span></li>
                <li><span>فاکتور آنلاین</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            © {new Date().getFullYear()} رهگشا سافت | rahgooshasf.ir | تمامی حقوق محفوظ است
          </div>
        </div>
      </footer>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️⚠️ از اینجا به پایین، کد کاملاً دست‌نخورده و بدون تغییر باقی می‌ماند ⚠️⚠️⚠️
// ════════════════════════════════════════════════════════════════════════════

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
  if (typeof window === 'undefined') return
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

  // ★★★ v9.5.6: تشخیص مسیر پورتال در ابتدای رندر (قبل از هر useEffect)
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isPortalRoute = currentPath.startsWith('/portal')
  const isSubscriptionRoute = currentPath.startsWith('/subscription')
  const isPaymentResultRoute = currentPath.startsWith('/payment-result')
    const isPortalViewRoute = currentPath.startsWith('/portal-view')
  const isSpecialRoute = isPortalRoute || isSubscriptionRoute || isPaymentResultRoute

  // ★★★ v9.5.6: اگر مسیر پورتال یا اشتراک است، هیچ کاری نکن
  // فایل‌های مخصوص (portal/[token]/page.tsx, subscription/*/page.tsx) خودشان را مدیریت می‌کنند
  if (isSpecialRoute) {
    console.log('[HomePage] 🚫 Special route detected:', currentPath, '- rendering nothing, letting sub-routes handle it')
    // بازگشت null تا Next.js فایل مربوطه را رندر کند
    return null
  }

  useEffect(() => {
    if (_globalInitDone) return
    _globalInitDone = true

    console.log('[HomePage] Auth check starting')

    // ─── پاک کردن currentView از store (فقط در browser) ──────────
    if (typeof window !== 'undefined') {
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
    }

    const currentPathInner = typeof window !== 'undefined' ? window.location.pathname : '/'
    const isDashboardRoute = currentPathInner.includes('/dashboard')
    
    console.log('[HomePage] Current path:', currentPathInner, 'isDashboard:', isDashboardRoute)

    // ─── بررسی وجود توکن ───────────────────────────────────────────
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

    if (!token) {
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

    // ─── بررسی و تأیید توکن ────────────────────────────────────────
    const doVerify = async () => {
      try {
        const verifyRes = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (verifyRes.ok) {
          const data = await verifyRes.json()
          if (data?.success && data?.user) {
            // ★★★ v9.5.6: اگر portalUser است، currentView را portal نگه دار
            const userType = data?.user?.userType || data?.data?.userType
            if (userType === 'portalUser') {
              console.log('[HomePage] Portal user detected, not setting currentView')
              // currentView را تنظیم نکن - فایل portal/[token] خودش مدیریت می‌کند
              setAuthCheckDone(true)
              return
            }
            
            useAppStore.getState().login(data.user, token)
            if (isDashboardRoute) {
              useAppStore.setState({ currentView: 'dashboard' })
            } else {
              useAppStore.setState({ currentView: 'landing' })
            }
            setAuthCheckDone(true)
            return
          }
        }

        // ─── تلاش برای refresh توکن ───────────────────────────────
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null
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
                
                // ★★★ v9.5.6: اگر portalUser است، currentView را portal نگه دار
                const userType = refreshUser?.userType
                if (userType === 'portalUser') {
                  console.log('[HomePage] Portal user detected after refresh, not setting currentView')
                  setAuthCheckDone(true)
                  return
                }
                
                if (newToken && refreshUser) {
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('token', newToken)
                    localStorage.setItem('refreshToken', newRefresh || '')
                    localStorage.setItem('user', JSON.stringify(refreshUser))
                  }
                  useAppStore.getState().login(refreshUser, newToken, newRefresh)
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

  // ─── نمایش splash screen در هنگام بارگذاری ──────────────────────
  if (!authCheckDone) {
    return <AuthLoadingSplash />
  }

  // ─── رندر AppShell فقط برای storeUser ──────────────────────────
  if (isAuthenticated && user && !['landing', 'login', 'register'].includes(currentView)) {
    // ★★★ v9.5.6: اگر portalUser است، AppShell رندر نکن
    if (user.userType === 'portalUser') {
      console.log('[HomePage] Portal user detected, not rendering AppShell')
      return <AuthLoadingSplash />
    }
    
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

  // پیش‌فرض همیشه لندینگ پیج
  return (
    <Suspense fallback={<AuthLoadingSplash />}>
      <LazyLandingPage />
    </Suspense>
  )
}