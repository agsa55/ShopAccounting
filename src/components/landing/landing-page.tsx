'use client'

// ============================================================================
// src/components/landing/landing-page.tsx (v4.0 — Premium Redesign)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v4.0: طراحی پریمیوم
//   ★ گرادینت مش متحرک در هیرو + اورب‌های شناور
//   ★ کارت‌های آماری شناور (Floating Stat Cards)
//   ★ بخش نظرات مشتریان + شمارنده آماری انیمیشنی
//   ★ افکت گلو و border گرادینتی روی کارت‌ها
//   ★ اسکرول ریویل با استگر، انیمیشن float، drift
//   ★ فوتر چندستونه حرفه‌ای
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { useAppStore as useStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingCart, Package, Users, CreditCard, BookOpen, BarChart3,
  CheckCircle2, Crown, Zap, Building2, Percent, ChevronDown,
  Star, TrendingUp, ShieldCheck, Clock, ArrowLeft, Sparkles,
} from 'lucide-react'

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fa-IR').format(price)
}

function formatFaNumber(n: number): string {
  return new Intl.NumberFormat('fa-IR').format(n)
}

// ─── Scroll Reveal Hook ──────────────────────────────────────
function useScrollReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.add('sr-hidden')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('sr-visible')
          el.classList.remove('sr-hidden')
        }
      },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return ref
}

// ─── Count-up Hook ───────────────────────────────────────────
function useCountUp(target: number, duration = 2000, start = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, start])
  return value
}

// ═══════════════════════════════════════════════════════════════
//  تعریف پلن‌ها — ۳ پلن بدون رایگان (v9.0)
//  ★★★ v9.0: تغییر ساختار پلن‌ها
//    - ۳ پلن: پایه / پیشرفته / حرفه‌ای  (نام کد: simple / professional / enterprise)
//    - ۲ دوره: سالانه (۳۶۵ روز) / مادام‌العمر (بدون انقضا)
//    - حذف پلن ماهانه
//    - قیمت‌ها (تومان):
//        پایه      سالانه: ۱,۵۹۰,۰۰۰   مادام‌العمر: ۱۶,۰۰۰,۰۰۰
//        پیشرفته   سالانه: ۲,۷۶۰,۰۰۰   مادام‌العمر: ۲۸,۰۰۰,۰۰۰
//        حرفه‌ای   سالانه: ۳,۵۵۰,۰۰۰   مادام‌العمر: ۳۶,۰۰۰,۰۰۰
// ═══════════════════════════════════════════════════════════════

type BillingCycle = 'annual' | 'lifetime'

interface PlanTierDef {
  name: string
  nameFa: string
  description: string
  annualPrice: number
  lifetimePrice: number
  icon: React.ComponentType<{ className?: string }>
  popular?: boolean
  color: string
  bgColor: string
  borderColor: string
  gradient: string
  features: string[]
}

const planTiers: PlanTierDef[] = [
  {
    name: 'simple',
    nameFa: 'پایه',
    description: 'مناسب فروشگاه‌های کوچک و فردی',
    annualPrice: 1_590_000,
    lifetimePrice: 16_000_000,
    icon: Zap,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    gradient: 'from-blue-500 to-cyan-500',
    features: [
      'تا ۲ کاربر',
      'تا ۲۰۰ محصول',
      'تا ۵۰۰ فاکتور',
      'داشبورد مالی',
      'مدیریت اقساط',
    ],
  },
  {
    name: 'professional',
    nameFa: 'پیشرفته',
    description: 'فروشگاه‌های متوسط و در حال رشد',
    annualPrice: 2_760_000,
    lifetimePrice: 28_000_000,
    icon: Crown,
    popular: true,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    gradient: 'from-emerald-500 to-teal-500',
    features: [
      'تا ۵ کاربر',
      'تا ۲,۰۰۰ محصول',
      'تا ۵,۰۰۰ فاکتور',
      'حسابداری دوطرفه',
      'گزارشات مالی',
      'درگاه پرداخت',
      'پشتیبانی اولویت‌دار',
    ],
  },
  {
    name: 'enterprise',
    nameFa: 'حرفه‌ای',
    description: 'کسب‌وکارهای بزرگ و سازمان‌ها',
    annualPrice: 3_550_000,
    lifetimePrice: 36_000_000,
    icon: Building2,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    gradient: 'from-purple-500 to-fuchsia-500',
    features: [
      'کاربر نامحدود',
      'محصول نامحدود',
      'فاکتور نامحدود',
      'تمام امکانات پیشرفته',
      'حسابداری شعب',
      'اتصال سامانه مودیان',
      'پشتیبانی ۲۴/۷ اختصاصی',
    ],
  },
]

// ═══════════════════════════════════════════════════════════════
//  انیمیشن‌ها
// ═══════════════════════════════════════════════════════════════

const ANIMATION_CSS = `
.sr-hidden {
  opacity: 0;
  transform: translateY(40px) scale(0.95);
  transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.sr-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); }
}
.animate-pulse-glow { animation: pulse-glow 2.5s ease-in-out infinite; }
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up { animation: fade-in-up 0.6s ease-out forwards; }
@keyframes float-y {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-18px); }
}
.animate-float { animation: float-y 6s ease-in-out infinite; }
.animate-float-slow { animation: float-y 9s ease-in-out infinite; }
@keyframes drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(40px, -30px) scale(1.1); }
  66% { transform: translate(-30px, 20px) scale(0.95); }
}
.animate-drift { animation: drift 18s ease-in-out infinite; }
.animate-drift-rev { animation: drift 22s ease-in-out infinite reverse; }
@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.animate-gradient {
  background-size: 200% 200%;
  animation: gradient-shift 8s ease infinite;
}
@keyframes shine {
  0% { transform: translateX(-120%) skewX(-20deg); }
  100% { transform: translateX(220%) skewX(-20deg); }
}
.animate-shine::after {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
  animation: shine 3s ease-in-out infinite;
  pointer-events: none;
}
html { scroll-behavior: smooth; }
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.grad-border {
  position: relative;
  background: white;
  background-clip: padding-box;
}
.grad-border::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(16,185,129,0.5), rgba(20,184,166,0.1), rgba(16,185,129,0.5));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}
.grad-border:hover::before { opacity: 1; }
`

// ─── داده‌های ثابت بخش‌ها ─────────────────────────────────────
const features = [
  { icon: ShoppingCart, title: 'صندوق فروش', desc: 'ثبت سریع فاکتور، مدیریت نقدی و نسیه', color: 'bg-emerald-100 text-emerald-600', grad: 'from-emerald-500 to-teal-500' },
  { icon: Package, title: 'مدیریت محصولات', desc: 'کنترل موجودی، قیمت‌گذاری و دسته‌بندی', color: 'bg-blue-100 text-blue-600', grad: 'from-blue-500 to-cyan-500' },
  { icon: Users, title: 'مشتریان', desc: 'مدیریت مشتریان و گردش حساب', color: 'bg-cyan-100 text-cyan-600', grad: 'from-cyan-500 to-sky-500' },
  { icon: CreditCard, title: 'اقساط', desc: 'مدیریت فروش قسطی و سررسیدها', color: 'bg-amber-100 text-amber-600', grad: 'from-amber-500 to-orange-500' },
  { icon: BookOpen, title: 'حسابداری', desc: 'اسناد خودکار و دستی، تراز آزمایشی', color: 'bg-purple-100 text-purple-600', grad: 'from-purple-500 to-fuchsia-500' },
  { icon: BarChart3, title: 'گزارش‌ها', desc: 'گزارش‌های فروش، سود و زیان، خروجی Excel', color: 'bg-pink-100 text-pink-600', grad: 'from-pink-500 to-rose-500' },
]

const stats = [
  { value: 12000, suffix: '+', label: 'فروشگاه فعال', icon: Building2 },
  { value: 8500000, suffix: '+', label: 'فاکتور صادر شده', icon: ShoppingCart, compact: true },
  { value: 99, suffix: '٪', label: 'رضایت مشتریان', icon: Star },
  { value: 24, suffix: '/7', label: 'پشتیبانی', icon: Clock },
]

const testimonials = [
  {
    name: 'محمد رضایی',
    role: 'صاحب فروشگاه لوازم خانگی',
    text: 'بعد از استفاده از ShopAccounting، سرعت صدور فاکتورم ۳ برابر شده و مدیریت اقساطم کاملاً شفاف شده.',
    avatar: 'م',
    color: 'bg-emerald-500',
  },
  {
    name: 'فاطمه حسینی',
    role: 'مدیر فروشگاه پوشاک',
    text: 'گزارش‌های مالی دقیق و داشبورد عالی. حالا می‌تونم تصمیمات فروشم رو بر اساس داده واقعی بگیرم.',
    avatar: 'ف',
    color: 'bg-purple-500',
  },
  {
    name: 'علی کریمی',
    role: 'مدیر عامل فروشگاه زنجیره‌ای',
    text: 'پلن سازمانی برای مدیریت چند شعبه ما فوق‌العاده است. پشتیبانی سریع و حرفه‌ای.',
    avatar: 'ع',
    color: 'bg-blue-500',
  },
]

// ═══════════════════════════════════════════════════════════════
//  Landing Page Component
// ═══════════════════════════════════════════════════════════════

export default function LandingPage() {
  const setCurrentView = useStore((s) => s.setCurrentView)
  const setSelectedPlanId = useStore((s) => s.setSelectedPlanId)
  const setSelectedBillingCycle = useStore((s) => s.setSelectedBillingCycle)
  const [globalBilling, setGlobalBilling] = useState<BillingCycle>('annual')
  const [scrolled, setScrolled] = useState(false)

  // ★★★ v9.5.2: بررسی وضعیت ورود کاربر
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const user = useStore((s) => s.user)

  // ★★★ v9.5.2: هدایت به داشبورد اگر کاربر وارد شده
  const goToDashboard = () => {
    if (typeof window !== 'undefined') {
      // ★ بررسی tenant slug از cookie یا localStorage
      const slug = document.cookie.match(/tenant-slug=([^;]+)/)?.[1]
      if (slug) {
        window.location.href = `/${slug}/dashboard`
      } else {
        // ★ fallback: تنظیم currentView روی dashboard
        setCurrentView('dashboard' as any)
      }
    }
  }

  const pricingRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const [statsStarted, setStatsStarted] = useState(false)

  useEffect(() => {
    const id = 'landing-animations'
    if (!document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = ANIMATION_CSS
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // شروع شمارنده آمار وقتی به دید رسید
  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsStarted(true)
          obs.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const handlePlanSelect = (tierName: string) => {
    if (setSelectedPlanId) setSelectedPlanId(tierName)
    if (setSelectedBillingCycle) setSelectedBillingCycle(globalBilling)
    setCurrentView('register')
  }

  // ★★★ v9.1: هدایت به صفحه تست دمو
  const handleStartDemo = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/demo/phone'
    }
  }

  const scrollToPricing = () => {
    pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const heroRef = useScrollReveal()
  const featuresRef = useScrollReveal()
  const pricingCardRefs = [useScrollReveal(), useScrollReveal(), useScrollReveal()]
  const testimonialsRef = useScrollReveal()

  // ★★★ v9.0: فقط دو دوره — annual و lifetime (حذف monthly)
  const getPriceForCycle = (plan: PlanTierDef, cycle: BillingCycle): number =>
    cycle === 'lifetime' ? plan.lifetimePrice : plan.annualPrice

  // ★★★ v9.0: تخفیف مادام‌العمر نسبت به ۱۰ سال اشتراک سالانه
  // (صرفاً برای نمایش — مادام‌العمر در واقع بدون انقضا است)
  const getLifetimeSavings = (plan: PlanTierDef): number => {
    const tenYearAnnual = plan.annualPrice * 10
    if (tenYearAnnual === 0) return 0
    return Math.round((1 - plan.lifetimePrice / tenYearAnnual) * 100)
  }

  return (
    <div className="min-h-screen bg-white text-gray-900" dir="rtl">
      {/* ─── Header ─── */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled ? 'glass shadow-sm border-b border-gray-100' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-emerald-200">
              S
            </div>
            <span className="text-lg font-bold text-gray-900">ShopAccounting</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#features" className="hover:text-emerald-600 transition-colors">امکانات</a>
            <button onClick={scrollToPricing} className="hover:text-emerald-600 transition-colors">پلن‌ها</button>
            <a href="#testimonials" className="hover:text-emerald-600 transition-colors">نظرات</a>
          </nav>
          <div className="flex items-center gap-3">
            {/* ★★★ v9.5.2: اگر کاربر وارد شده، دکمه «ورود به داشبورد» */}
            {isAuthenticated && user ? (
              <button
                onClick={goToDashboard}
                className="px-4 py-2 bg-gradient-to-l from-emerald-600 to-teal-600 text-white rounded-lg hover:shadow-lg hover:shadow-emerald-200 text-sm font-medium transition-all flex items-center gap-1.5"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                ورود به داشبورد
              </button>
            ) : (
              <>
                <button
                  onClick={() => setCurrentView('login')}
                  className="text-gray-700 hover:text-emerald-600 text-sm font-medium transition-colors"
                >
                  ورود
                </button>
                {/* ★★★ v9.1: دکمه «شروع تست دمو» در هدر */}
                <button
                  onClick={handleStartDemo}
                  className="px-4 py-2 bg-gradient-to-l from-amber-500 to-orange-500 text-white rounded-lg hover:shadow-lg hover:shadow-amber-200 text-sm font-medium transition-all"
                >
                  شروع تست دمو
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden pt-16 pb-32 px-4">
        {/* پس‌زمینه گرادینت مش */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-teal-50" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-10 -right-20 w-96 h-96 bg-emerald-300/30 rounded-full blur-3xl animate-drift" />
          <div className="absolute top-40 -left-20 w-96 h-96 bg-teal-300/30 rounded-full blur-3xl animate-drift-rev" />
          <div className="absolute -bottom-20 right-1/3 w-80 h-80 bg-cyan-200/30 rounded-full blur-3xl animate-drift" />
        </div>

        <div ref={heroRef} className="relative max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {/* متن هیرو */}
          <div className="text-center md:text-right">
            <div className="inline-flex animate-fade-in-up">
              <Badge className="mb-6 bg-emerald-100 text-emerald-700 border-emerald-200 animate-shine relative overflow-hidden">
                <Sparkles className="w-3.5 h-3.5 ml-1" />
                سیستم حسابداری فروشگاهی هوشمند
              </Badge>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-[1.2] mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              حسابداری فروشگاهی
              <br />
              <span className="bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-transparent animate-gradient">
                ساده و هوشمند
              </span>
            </h1>
            <p className="text-lg text-gray-600 max-w-xl mx-auto md:mx-0 mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              مدیریت فروش، مشتریان، اقساط و حسابداری در یک پلتفرم یکپارچه. شروع در کمتر از ۵ دقیقه.
            </p>
            <div className="flex gap-4 justify-center md:justify-start flex-wrap animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              {/* ★★★ v9.1: دکمه اصلی «شروع تست دمو» */}
              <button
                onClick={handleStartDemo}
                className="px-8 py-3.5 bg-gradient-to-l from-amber-500 to-orange-500 text-white rounded-xl hover:shadow-xl hover:shadow-amber-300/50 text-lg font-medium transition-all animate-pulse-glow flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                شروع تست دمو (۳ روز رایگان)
              </button>
              <button
                onClick={scrollToPricing}
                className="px-8 py-3.5 border-2 border-emerald-300 text-emerald-700 bg-white/70 rounded-xl hover:bg-emerald-50 text-lg font-medium transition-all flex items-center gap-2"
              >
                مشاهده پلن‌ها
                <ChevronDown className="w-5 h-5 animate-bounce" />
              </button>
            </div>

            {/* نشان‌های اعتماد */}
            <div className="flex gap-6 justify-center md:justify-start mt-10 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                پرداخت امن
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                بدون هزینه پنهان
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4 text-emerald-600" />
                راه‌اندازی سریع
              </div>
            </div>
          </div>

          {/* کارت‌های شناور داشبورد */}
          <div className="relative hidden md:block h-[440px]">
            {/* کارت اصلی داشبورد */}
            <div className="absolute inset-0 animate-float">
              <Card className="grad-border border-0 shadow-2xl rounded-3xl overflow-hidden">
                <div className="bg-gradient-to-l from-emerald-600 to-teal-600 p-5">
                  <div className="flex items-center justify-between text-white">
                    <span className="font-bold">داشبورد فروش</span>
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <CardContent className="p-5">
                  <p className="text-xs text-gray-500 mb-1">فروش امروز</p>
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-3xl font-extrabold text-gray-900">{formatPrice(4850000)}</span>
                    <span className="text-sm text-emerald-600 font-medium mb-1">۲۳٪+</span>
                  </div>
                  {/* نمودار میله‌ای ساده */}
                  <div className="flex items-end gap-1.5 h-24 mb-4">
                    {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-400 to-teal-400"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">فاکتورها</p>
                      <p className="text-lg font-bold text-emerald-700">۱٬۲۴۸</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">مشتریان</p>
                      <p className="text-lg font-bold text-blue-700">۸۶۲</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* کارت شناور اقساط */}
            <div className="absolute -bottom-4 -left-8 w-56 animate-float-slow">
              <Card className="shadow-xl rounded-2xl border-0">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <CreditCard className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">اقساط فعال</p>
                    <p className="text-lg font-bold text-gray-900">۳۴۰ میلیون</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* کارت شناور رشد */}
            <div className="absolute -top-2 -right-6 w-48 animate-float" style={{ animationDelay: '1s' }}>
              <Card className="shadow-xl rounded-2xl border-0 bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="w-4 h-4 fill-white" />
                    <span className="text-xs font-medium opacity-90">رضایت مشتری</span>
                  </div>
                  <p className="text-2xl font-extrabold">۹۹٪</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats Section ─── */}
      <section ref={statsRef} className="relative -mt-10 px-4">
        <div className="max-w-6xl mx-auto">
          <Card className="border-0 shadow-xl rounded-3xl bg-white">
            <CardContent className="grid grid-cols-2 md:grid-cols-4 divide-x divide-x-reverse divide-gray-100">
              {stats.map((s, i) => (
                <StatItem key={i} stat={s} start={statsStarted} />
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="features" className="py-24 px-4 bg-gray-50 scroll-mt-16">
        <div ref={featuresRef} className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-emerald-100 text-emerald-700 border-emerald-200">امکانات</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              همه چیز برای مدیریت{' '}
              <span className="bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-transparent">فروشگاه شما</span>
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">یک پلتفرم کامل با تمام ابزارهایی که برای رشد کسب‌وکارتان نیاز دارید</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card
                key={i}
                className="grad-border group border-0 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <CardContent className="pt-7">
                  <div className={`w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section ref={pricingRef} className="py-24 px-4 bg-white scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-emerald-100 text-emerald-700 border-emerald-200">قیمت‌گذاری</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              پلن مناسب{' '}
              <span className="bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-transparent">کسب‌وکار شما</span>
            </h2>
            <p className="text-gray-600">پلن متناسب با نیاز خود را انتخاب کنید. ارتقا در هر زمان.</p>
          </div>

          {/* ★★★ v9.0: Billing Cycle Toggle — سالانه / مادام‌العمر */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex bg-gray-100 rounded-xl p-1 relative">
              {(['annual', 'lifetime'] as const).map((cycle) => (
                <button
                  key={cycle}
                  onClick={() => setGlobalBilling(cycle)}
                  className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    globalBilling === cycle
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {cycle === 'annual' ? 'سالانه' : 'مادام‌العمر'}
                  {cycle === 'lifetime' && (
                    <Badge className="mr-2 bg-amber-100 text-amber-700 text-[9px]">تخفیف ویژه</Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {planTiers.map((plan, idx) => {
              const price = getPriceForCycle(plan, globalBilling)
              const savings = getLifetimeSavings(plan)
              return (
                <div
                  key={plan.name}
                  ref={pricingCardRefs[idx]}
                  className={`sr-hidden transition-transform duration-300 hover:-translate-y-2 ${
                    plan.popular ? 'md:scale-105' : ''
                  }`}
                >
                  <Card
                    className={`relative overflow-visible transition-all hover:shadow-2xl ${
                      plan.popular
                        ? 'border-emerald-400 border-2 shadow-xl shadow-emerald-100 animate-pulse-glow'
                        : `border-gray-200 shadow-sm ${plan.borderColor}`
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                        <Badge className="bg-gradient-to-l from-emerald-600 to-teal-600 text-white px-4 py-1.5 shadow-md">
                          <Crown className="w-3.5 h-3.5 ml-1" />
                          محبوب‌ترین
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-4 pt-7">
                      <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-3 shadow-lg`}>
                        <plan.icon className="w-8 h-8 text-white" />
                      </div>
                      <CardTitle className="text-xl text-gray-900">{plan.nameFa}</CardTitle>
                      <CardDescription className="text-sm text-gray-500 mt-1">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                      <div className="mb-6">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-4xl font-extrabold text-gray-900">
                            {formatPrice(price)}
                          </span>
                          <span className="text-sm text-gray-500 font-medium">تومان</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {globalBilling === 'lifetime' ? 'یکبار پرداخت — مادام‌العمر' : 'در سال'}
                        </p>
                        {globalBilling === 'lifetime' && savings > 0 && (
                          <Badge className="mt-2 bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                            <Percent className="w-3 h-3 ml-1" />
                            تا {formatPrice(savings)}٪ تخفیف
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-3 text-right mb-6">
                        {plan.features.map((feature, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <div className={`w-5 h-5 rounded-full ${plan.bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                              <CheckCircle2 className={`w-3.5 h-3.5 ${plan.color}`} />
                            </div>
                            <span className="text-gray-700">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="pb-7">
                      <Button
                        onClick={() => handlePlanSelect(plan.name)}
                        className={`w-full h-11 text-sm font-medium transition-all bg-gradient-to-l hover:shadow-lg ${
                          plan.popular
                            ? 'from-emerald-600 to-teal-600 text-white shadow-emerald-200'
                            : plan.name === 'simple'
                              ? 'from-blue-600 to-cyan-600 text-white shadow-blue-200'
                              : 'from-purple-600 to-fuchsia-600 text-white shadow-purple-200'
                        }`}
                      >
                        انتخاب پلن {plan.nameFa}
                        <ArrowLeft className="w-4 h-4 mr-1" />
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              )
            })}
          </div>

          <p className="text-center text-sm text-gray-500 mt-12">
            بدون هزینه پنهان. ارتقا یا تنزل در هر زمان. پرداخت آنلاین امن.
          </p>
        </div>
      </section>

      {/* ─── Testimonials Section ─── */}
      <section id="testimonials" className="py-24 px-4 bg-gray-50 scroll-mt-16">
        <div ref={testimonialsRef} className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-4 bg-emerald-100 text-emerald-700 border-emerald-200">نظرات مشتریان</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              مورد اعتماد{' '}
              <span className="bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-transparent">هزاران فروشگاه</span>
            </h2>
            <p className="text-gray-600">ببینید مشتریان ما چه می‌گویند</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Card key={i} className="border-0 shadow-sm hover:shadow-xl transition-shadow duration-300">
                <CardContent className="pt-7">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-6 text-sm">«{t.text}»</p>
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full ${t.color} flex items-center justify-center text-white font-bold`}>
                      {t.avatar}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-emerald-600 via-teal-600 to-emerald-700 animate-gradient" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-drift" />
          <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-drift-rev" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">آماده شروع هستید؟</h2>
          <p className="text-emerald-50 mb-8 text-lg">
            با تست دمو ۳ روزه، بدون پرداخت، سیستم را از نزدیک بشناسید
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            {/* ★★★ v9.1: دکمه اصلی CTA — شروع تست دمو */}
            <button
              onClick={handleStartDemo}
              className="px-10 py-4 bg-white text-amber-700 rounded-xl hover:shadow-2xl hover:scale-105 text-lg font-bold transition-all flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              شروع تست دمو (۳ روز رایگان)
            </button>
            {/* ★★★ v9.1: دکمه ثانویه — خرید پلن */}
            <button
              onClick={scrollToPricing}
              className="px-10 py-4 bg-emerald-700/30 border-2 border-white/30 text-white rounded-xl hover:bg-emerald-700/50 text-lg font-bold transition-all"
            >
              مشاهده و خرید پلن‌ها
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="bg-gray-900 text-gray-400 pt-16 pb-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {/* برند */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
                  S
                </div>
                <span className="text-lg font-bold text-white">ShopAccounting</span>
              </div>
              <p className="text-sm leading-relaxed">
                سیستم حسابداری فروشگاهی هوشمند و یکپارچه برای مدیریت تمامی امور مالی کسب‌وکار شما.
              </p>
            </div>
            {/* لینک‌ها */}
            <div>
              <h4 className="text-white font-bold mb-4 text-sm">محصول</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#features" className="hover:text-emerald-400 transition-colors">امکانات</a></li>
                <li><button onClick={scrollToPricing} className="hover:text-emerald-400 transition-colors">پلن‌ها</button></li>
                <li><a href="#testimonials" className="hover:text-emerald-400 transition-colors">نظرات</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4 text-sm">پشتیبانی</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-emerald-400 transition-colors">راهنما</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">تماس با ما</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">سوالات متداول</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4 text-sm">شرکت</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-emerald-400 transition-colors">درباره ما</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">قوانین و مقررات</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">حریم خصوصی</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm">
            <p>ShopAccounting v4.0 — سیستم حسابداری فروشگاهی</p>
            <p className="text-xs">© ۱۴۰۴ تمام حقوق محفوظ است.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت آیتم آماری با شمارنده انیمیشنی
// ═══════════════════════════════════════════════════════════════
function StatItem({
  stat,
  start,
}: {
  stat: { value: number; suffix: string; label: string; icon: React.ComponentType<{ className?: string }>; compact?: boolean }
  start: boolean
}) {
  const value = useCountUp(stat.value, 2000, start)
  const display = stat.compact
    ? value >= 1000000
      ? formatFaNumber(Math.round(value / 1000000)) + ' میلیون'
      : formatFaNumber(value)
    : formatFaNumber(value)

  return (
    <div className="text-center p-5">
      <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
        <stat.icon className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="text-2xl md:text-3xl font-extrabold text-gray-900">
        {display}
        <span className="text-emerald-600">{stat.suffix}</span>
      </div>
      <p className="text-xs md:text-sm text-gray-500 mt-1">{stat.label}</p>
    </div>
  )
}
