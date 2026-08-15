'use client'

// ============================================================================
// src/components/landing/landing-page.tsx (v6.0 — بدون قیمت، فقط شروع رایگان)
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore as useStore } from '@/lib/store'
import {
  ShoppingCart, Package, Users, CreditCard, BookOpen, BarChart3,
  CheckCircle2, Crown, Zap, Building2, ChevronDown,
  Star, TrendingUp, ShieldCheck, Clock, ArrowLeft, Sparkles,
  Menu, X, LogIn,
} from 'lucide-react'
import { useSiteContent } from '@/lib/site-content'

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fa-IR').format(price)
}

function formatFaNumber(n: number): string {
  return new Intl.NumberFormat('fa-IR').format(n)
}

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
//  ★ ساختار UI پلن‌ها
// ═══════════════════════════════════════════════════════════════
interface PlanUIConfig {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  borderColor: string
  gradient: string
}

const PLAN_UI_CONFIG: Record<string, PlanUIConfig> = {
  simple: {
    icon: Zap,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    gradient: 'from-blue-500 to-cyan-500',
  },
  professional: {
    icon: Crown,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    gradient: 'from-emerald-500 to-teal-500',
  },
  enterprise: {
    icon: Building2,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    gradient: 'from-purple-500 to-fuchsia-500',
  },
}

const ANIMATION_CSS = `
.sr-hidden {
  opacity: 0;
  transform: translateY(40px) scale(0.97);
  transition: opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}
.sr-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 123, 235, 0.35); }
  50%       { box-shadow: 0 0 0 16px rgba(124, 123, 235, 0); }
}
.animate-pulse-glow { animation: pulse-glow 2.8s ease-in-out infinite; }

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up { animation: fade-in-up 0.65s ease-out forwards; }

@keyframes float-y {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-16px); }
}
.animate-float      { animation: float-y 6s ease-in-out infinite; }
.animate-float-slow { animation: float-y 9s ease-in-out infinite; }

@keyframes drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(40px, -30px) scale(1.08); }
  66%       { transform: translate(-30px, 20px) scale(0.96); }
}
.animate-drift     { animation: drift 20s ease-in-out infinite; }
.animate-drift-rev { animation: drift 25s ease-in-out infinite reverse; }

@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50%       { background-position: 100% 50%; }
}
.animate-gradient {
  background-size: 200% 200%;
  animation: gradient-shift 8s ease infinite;
}

@keyframes shine {
  0%   { transform: translateX(-120%) skewX(-20deg); }
  100% { transform: translateX(220%) skewX(-20deg); }
}
.animate-shine::after {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
  animation: shine 3.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes spin-slow { to { transform: rotate(360deg); } }
.animate-spin-slow { animation: spin-slow 30s linear infinite; }

@keyframes ticker-rtl {
  0%   { transform: translateX(0); }
  100% { transform: translateX(50%); }
}
.animate-ticker { animation: ticker-rtl 60s linear infinite; }
.animate-ticker:hover { animation-play-state: paused; }

html { scroll-behavior: smooth; }

.glass {
  background: rgba(255,255,255,0.78);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.dot-grid {
  background-image: radial-gradient(circle, rgba(124,123,235,0.12) 1px, transparent 1px);
  background-size: 28px 28px;
}

.noise::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none;
  opacity: 0.5;
}

.mobile-menu-enter {
  animation: fade-in-up 0.25s ease-out forwards;
}

.logo-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 20px;
  background: transparent;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  filter: drop-shadow(0 4px 20px rgba(251, 191, 36, 0.35)) drop-shadow(0 0 15px rgba(124, 123, 235, 0.3));
}
.logo-container:hover {
  transform: scale(1.08) rotate(-2deg);
  filter: drop-shadow(0 8px 30px rgba(251, 191, 36, 0.6)) drop-shadow(0 0 25px rgba(124, 123, 235, 0.5));
}
.logo-img {
  width: 150%;
  height: 150%;
  object-fit: contain;
}

.feature-card:hover .feature-icon {
  transform: scale(1.12) rotate(-4deg);
}
.feature-icon {
  transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
}

.plan-card-popular {
  background: linear-gradient(145deg, #ffffff 0%, #f5f3ff 100%);
}

@media (max-width: 640px) {
  .hero-title { font-size: 2.4rem !important; line-height: 1.25 !important; }
  .hero-sub   { font-size: 1rem !important; }
  .stat-value { font-size: 1.5rem !important; }
}
`

const features = [
  {
    icon: ShoppingCart,
    title: 'صندوق فروش',
    desc: 'ثبت سریع فاکتور، مدیریت نقدی و نسیه با رابطی روان',
    grad: 'from-violet-500 to-purple-600',
  },
  {
    icon: Package,
    title: 'مدیریت محصولات',
    desc: 'کنترل موجودی، قیمت‌گذاری و دسته‌بندی هوشمند',
    grad: 'from-blue-500 to-indigo-600',
  },
  {
    icon: Users,
    title: 'مشتریان',
    desc: 'مدیریت مشتریان، گردش حساب و تاریخچه خرید',
    grad: 'from-cyan-500 to-sky-500',
  },
  {
    icon: CreditCard,
    title: 'اقساط',
    desc: 'مدیریت فروش قسطی، سررسیدها و یادآوری‌ها',
    grad: 'from-amber-500 to-orange-500',
  },
  {
    icon: BookOpen,
    title: 'حسابداری',
    desc: 'اسناد خودکار و دستی، تراز آزمایشی دقیق',
    grad: 'from-purple-500 to-fuchsia-600',
  },
  {
    icon: BarChart3,
    title: 'گزارش‌ها',
    desc: 'گزارش فروش، سود و زیان، خروجی Excel حرفه‌ای',
    grad: 'from-pink-500 to-rose-500',
  },
]

const stats = [
  { value: 12000,   suffix: '+',  label: 'فروشگاه فعال',    icon: Building2  },
  { value: 8500000, suffix: '+',  label: 'فاکتور صادر شده', icon: ShoppingCart, compact: true },
  { value: 99,      suffix: '٪', label: 'رضایت مشتریان',   icon: Star       },
  { value: 24,      suffix: '/7', label: 'پشتیبانی آنلاین', icon: Clock      },
]

const testimonials = [
  {
    name: 'محمد رضایی',
    role: 'صاحب فروشگاه لوازم خانگی',
    text: 'بعد از استفاده از حسابداری فروشگاهی رهگشا، سرعت صدور فاکتورم ۳ برابر شده و مدیریت اقساطم کاملاً شفاف شده.',
    avatar: 'م',
    color: 'from-violet-500 to-purple-600',
    rating: 5,
  },
  {
    name: 'فاطمه حسینی',
    role: 'مدیر فروشگاه پوشاک',
    text: 'گزارش‌های مالی دقیق و داشبورد عالی. حالا می‌تونم تصمیمات فروشم رو بر اساس داده واقعی بگیرم.',
    avatar: 'ف',
    color: 'from-fuchsia-500 to-pink-600',
    rating: 5,
  },
  {
    name: 'علی کریمی',
    role: 'مدیر عامل فروشگاه زنجیره‌ای',
    text: 'پلن سازمانی برای مدیریت چند شعبه ما فوق‌العاده است. پشتیبانی سریع و کاملاً حرفه‌ای.',
    avatar: 'ع',
    color: 'from-blue-500 to-indigo-600',
    rating: 5,
  },
]

const trustBadges = [
  { icon: ShieldCheck, label: 'پرداخت امن ۱۰۰٪' },
  { icon: CheckCircle2, label: 'بدون هزینه پنهان' },
  { icon: Clock, label: 'راه‌اندازی زیر ۵ دقیقه' },
  { icon: Star, label: 'پشتیبانی ۲۴/۷' },
]

const tickerItems = [
  'مدیریت هوشمند فروش',
  'استفاده از سیستم بصورت افلاین',
  'مدیریت طرف حساب',
  'مدیریت نسیه و اقساط',
  'پرداخت از درگاه الکترونیک بصورت غیر حضوری و از طریق موبایل',
  'مدیریت انبارها،انتقال بین انبارها و انبارگردانی',
  'مدیریت شعب',
  'حسابداری کاملا پیشرفته',
  'چک های پرداختی و دریافتنی',
  'سال مالی',
  'سند افتتاحیه و اختتامیه',
  'دارایی های ثابت',
  'اسناد تکرار شدنی',
  'گزارشات متنوع',
]

export default function LandingPage() {
  const router = useRouter()
  const setSelectedPlanId = useStore((s) => s.setSelectedPlanId)

  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState<number | null>(null)

  const pricingRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const [statsStarted, setStatsStarted] = useState(false)
  
  const { content: siteContent } = useSiteContent()
  
  // ★ ساخت لیست پلن‌ها — بدون قیمت
  const displayPlans = (siteContent.plans || []).map(plan => {
    const ui = PLAN_UI_CONFIG[plan.name] || PLAN_UI_CONFIG.simple
    return {
      name: plan.name,
      nameFa: plan.nameFa,
      description: plan.description,
      popular: plan.popular || false,
      features: plan.features || [],
      icon: ui.icon,
      color: ui.color,
      bgColor: ui.bgColor,
      borderColor: ui.borderColor,
      gradient: ui.gradient,
    }
  })

  useEffect(() => {
    const id = 'landing-animations-v6'
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

  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsStarted(true); obs.disconnect() } },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMobileMenuOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ★ انتخاب پلن و رفتن به ثبت‌نام
  const handlePlanSelect = (tierName: string) => {
    if (setSelectedPlanId) setSelectedPlanId(tierName)
    router.push(`/auth/register?plan=${tierName}`)
  }

   // ★ v6.1: شروع رایگان → هدایت به بخش پلن‌ها (کاربر خودش پلن را انتخاب می‌کند)
  const handleStartFree = () => {
    setMobileMenuOpen(false)
    pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const scrollToPricing = () => {
    setMobileMenuOpen(false)
    pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const heroRef = useScrollReveal()
  const featuresRef = useScrollReveal()
  const pricingCardRefs = [useScrollReveal(), useScrollReveal(), useScrollReveal()]
  const testimonialsRef = useScrollReveal()
  const ctaRef = useScrollReveal()

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden" dir="rtl">

      {/* ═══════════════════════════ HEADER ═══════════════════════════ */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'glass border-b border-white/60 shadow-lg shadow-black/5'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 sm:h-24 flex items-center justify-between gap-3">

          <a href="#" className="shrink-0 group" aria-label="صفحه اصلی">
            <div className="logo-container w-16 h-16 sm:w-20 sm:h-20">
              <img src="/logo.jpeg" alt="رهگشا" className="logo-img" />
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'امکانات', href: '#features' },
              { label: 'پلن‌ها', action: scrollToPricing },
              { label: 'نظرات', href: '#testimonials' },
            ].map((item) =>
              item.href ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="px-4 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded-lg transition-all font-bold"
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="px-4 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded-lg transition-all font-bold"
                >
                  {item.label}
                </button>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/auth/login')}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-medium border rounded-xl transition-all duration-300 ${
                scrolled
                  ? 'text-gray-900 border-gray-200 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50'
                  : 'text-amber-400 border-amber-400/40 hover:text-amber-300 hover:border-amber-300 hover:bg-amber-400/10'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>ورود</span>
            </button>

                      <button
              onClick={handleStartFree}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-gradient-to-l from-amber-500 to-orange-500 rounded-xl hover:shadow-lg hover:shadow-amber-200/60 hover:scale-105 transition-all whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              انتخاب پلن
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="منو"
              className="md:hidden p-2 text-amber-400 hover:bg-amber-400/10 rounded-xl transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* ★ Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass border-t border-white/60 mobile-menu-enter">
            <nav className="px-4 py-4 space-y-1">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-violet-50 hover:text-violet-700 rounded-xl transition-colors text-sm font-medium"
              >
                <Sparkles className="w-4 h-4 text-violet-500" />
                امکانات
              </a>
              <button
                onClick={scrollToPricing}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-violet-50 hover:text-violet-700 rounded-xl transition-colors text-sm font-medium text-right"
              >
                <BarChart3 className="w-4 h-4 text-violet-500" />
                پلن‌ها
              </button>
              <a
                href="#testimonials"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-violet-50 hover:text-violet-700 rounded-xl transition-colors text-sm font-medium"
              >
                <Star className="w-4 h-4 text-violet-500" />
                نظرات مشتریان
              </a>
              <div className="pt-2 border-t border-gray-100 mt-2 space-y-2">
                <button
                  onClick={() => { router.push('/auth/login'); setMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-gray-900 bg-gray-100 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all"
                >
                  <LogIn className="w-4 h-4" />
                  ورود به حساب
                </button>
                              <button
                  onClick={handleStartFree}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white bg-gradient-to-l from-amber-500 to-orange-500 rounded-xl font-bold text-sm hover:shadow-lg transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  انتخاب پلن
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ═══════════════════════════ HERO ══════════════════════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-violet-950 to-purple-950" />
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="absolute inset-0 noise" />

        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[120px] animate-drift pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] animate-drift-rev pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none" />

        <div ref={heroRef} className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          <div className="space-y-7 text-center lg:text-right order-2 lg:order-1">
            <div className="inline-flex animate-fade-in-up">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-bold backdrop-blur-sm relative overflow-hidden animate-shine">
                <Sparkles className="w-3.5 h-3.5" />
                سیستم حسابداری فروشگاهی هوشمند رهگشا
              </span>
            </div>

            <h1
              className="hero-title font-black leading-tight text-white animate-fade-in-up"
              style={{ fontSize: 'clamp(1.2rem, 5vw, 2.8rem)', animationDelay: '0.1s' }}
            >
              حسابداری فروشگاهی ابری رهگشا
              <br />
              <span className="bg-gradient-to-l from-violet-400 via-purple-300 to-fuchsia-400 bg-clip-text text-transparent animate-gradient">
                ساده، سریع، هوشمند
              </span>
            </h1>

            <p
              className="hero-sub text-gray-300 max-w-lg mx-auto lg:mx-0 leading-relaxed animate-fade-in-up"
              style={{ fontSize: 'clamp(0.95rem, 2vw, 1.15rem)', animationDelay: '0.2s' }}
            >
              مدیریت فروش، مشتریان، اقساط و حسابداری در یک پلتفرم یکپارچه.
              از صدور فاکتور تا گزارش مالی — همه‌چیز در یک‌جا.
            </p>

            {/* ★ دکمه‌های Hero */}
            <div
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start animate-fade-in-up pt-2"
              style={{ animationDelay: '0.3s' }}
            >
                          <button
                onClick={handleStartFree}
                className="group relative px-7 py-4 bg-gradient-to-l from-amber-500 to-orange-500 text-white rounded-2xl font-bold text-base hover:shadow-2xl hover:shadow-amber-500/30 hover:scale-105 transition-all animate-pulse-glow flex items-center justify-center gap-2.5 overflow-hidden"
              >
                <Sparkles className="w-5 h-5" />
                انتخاب پلن و شروع رایگان
                <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
              </button>
              <button
                onClick={scrollToPricing}
                className="px-7 py-4 border border-white/20 text-white hover:bg-white/10 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 backdrop-blur-sm"
              >
                مشاهده پلن‌ها
                <ChevronDown className="w-5 h-5 animate-bounce" />
              </button>
            </div>

            <div
              className="flex flex-wrap gap-4 justify-center lg:justify-start pt-2 animate-fade-in-up"
              style={{ animationDelay: '0.45s' }}
            >
              {trustBadges.map((b, i) => (
                <div key={i} className="flex items-center gap-1.5 text-gray-400 text-xs">
                  <b.icon className="w-3.5 h-3.5 text-violet-400" />
                  {b.label}
                </div>
              ))}
            </div>
          </div>

          {/* ★ Hero Visual */}
          <div className="relative order-1 lg:order-2 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[420px]">
              <div className="animate-float relative z-10">
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-violet-900/50 border border-white/10">
                  <div className="bg-gradient-to-l from-violet-600 to-purple-700 px-5 py-4">
                    <div className="flex items-center justify-between text-white">
                      <div>
                        <p className="text-xs text-violet-200">فروش امروز</p>
                        <p className="text-2xl font-black">{formatPrice(4_850_000)} تومان</p>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-sm font-bold">۲۳٪+</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-5">
                    <div className="flex items-end gap-1.5 h-28 mb-5">
                      {[38, 62, 48, 80, 55, 92, 70, 85, 60, 95].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t-lg bg-gradient-to-t from-violet-500 to-purple-400 opacity-80 hover:opacity-100 transition-opacity"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'فاکتور', val: '۱٬۲۴۸', color: 'bg-violet-50 text-violet-700' },
                        { label: 'مشتری', val: '۸۶۲', color: 'bg-blue-50 text-blue-700' },
                        { label: 'اقساط', val: '۳۴۰', color: 'bg-amber-50 text-amber-700' },
                      ].map((s) => (
                        <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
                          <p className="text-xs opacity-60 mb-0.5">{s.label}</p>
                          <p className="font-black text-base">{s.val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 -left-6 sm:-left-10 z-20 animate-float-slow w-44 sm:w-52">
                <div className="rounded-2xl bg-white shadow-xl shadow-black/10 border border-gray-100 p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">اقساط فعال</p>
                    <p className="text-sm font-black text-gray-900">۳۴۰ میلیون</p>
                  </div>
                </div>
              </div>

              <div className="absolute -top-4 -right-4 sm:-right-8 z-20 animate-float w-36 sm:w-44" style={{ animationDelay: '1.2s' }}>
                <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-xl shadow-violet-400/30 p-3.5 text-white">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                    <span className="text-[10px] font-medium opacity-80">رضایت مشتری</span>
                  </div>
                  <p className="text-2xl font-black">۹۹٪</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-500 animate-bounce">
          <span className="text-xs">اسکرول کنید</span>
          <ChevronDown className="w-4 h-4" />
        </div>
      </section>

      {/* ═══════════════════════════ TICKER ════════════════════════════ */}
      <div className="bg-violet-600 py-3 overflow-hidden border-y border-violet-500" dir="ltr">
        <div className="flex animate-ticker whitespace-nowrap select-none">
          {[...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-3 px-6 text-white text-sm font-medium shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════ STATS ═════════════════════════════ */}
      <section ref={statsRef} className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((s, i) => (
              <StatItem key={i} stat={s} start={statsStarted} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ FEATURES ══════════════════════════ */}
      <section id="features" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-gray-50 scroll-mt-20">
        <div ref={featuresRef} className="max-w-6xl mx-auto">

          <div className="text-center mb-14 sm:mb-20 space-y-4">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-100 text-violet-700 rounded-full text-xs font-bold border border-violet-200">
              <Zap className="w-3.5 h-3.5" />
              امکانات کامل
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 leading-tight">
              همه چیز برای
              <span className="bg-gradient-to-l from-violet-600 to-purple-500 bg-clip-text text-transparent"> مدیریت فروشگاه</span>
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base sm:text-lg leading-relaxed">
              یک پلتفرم یکپارچه با تمام ابزارهایی که برای رشد کسب‌وکارتان نیاز دارید
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="feature-card bg-white rounded-2xl p-6 cursor-pointer border border-gray-100 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-100/50 hover:-translate-y-1.5 transition-all duration-300"
                onMouseEnter={() => setActiveFeature(i)}
                onMouseLeave={() => setActiveFeature(null)}
              >
                <div className={`feature-icon w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.grad} flex items-center justify-center mb-5 shadow-lg`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>

                <h3 className="text-base font-black text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>

                <div className={`mt-4 h-0.5 rounded-full bg-gradient-to-l ${feature.grad} transition-all duration-500 ${activeFeature === i ? 'w-full' : 'w-8'}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ PLANS (بدون قیمت) ═════════════════ */}
      <section ref={pricingRef} className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto">

          <div className="text-center mb-12 sm:mb-16 space-y-4">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-100 text-violet-700 rounded-full text-xs font-bold border border-violet-200">
              <Crown className="w-3.5 h-3.5" />
              پلن‌های ما
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 leading-tight">
              پلن مناسب
              <span className="bg-gradient-to-l from-violet-600 to-purple-500 bg-clip-text text-transparent"> کسب‌وکار شما</span>
            </h2>
            <p className="text-gray-500 text-base sm:text-lg">
              پلن متناسب با نیاز خود را انتخاب کنید. ۳ ماه استفاده رایگان، بدون نیاز به کارت بانکی.
            </p>
          </div>

          {/* ★ کارت‌های پلن — بدون قیمت */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
            {displayPlans.map((plan, idx) => {
              return (
                <div
                  key={plan.name}
                  ref={pricingCardRefs[idx]}
                  className={`sr-hidden flex flex-col transition-transform duration-300 ${plan.popular ? 'md:-mt-4 md:mb-0' : ''}`}
                >
                  <div
                    className={`relative flex flex-col h-full rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl
                      ${plan.popular
                        ? 'plan-card-popular border-2 border-violet-400 shadow-xl shadow-violet-200/50 animate-pulse-glow'
                        : 'bg-white border border-gray-200 shadow-sm hover:border-violet-200'
                      }`}
                  >
                    {plan.popular && (
                      <div className="absolute top-0 inset-x-0 flex justify-center">
                        <div className="inline-flex items-center gap-1.5 px-5 py-1.5 bg-gradient-to-l from-violet-600 to-purple-600 text-white text-xs font-black rounded-b-2xl shadow-lg">
                          <Crown className="w-3 h-3" />
                          محبوب‌ترین انتخاب
                        </div>
                      </div>
                    )}

                    <div className={`p-6 sm:p-7 ${plan.popular ? 'pt-10' : 'pt-6'}`}>
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-4 shadow-lg`}>
                        <plan.icon className="w-7 h-7 text-white" />
                      </div>

                      <h3 className="text-xl font-black text-gray-900 mb-1">{plan.nameFa}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{plan.description}</p>
                    </div>

                    <div className={`mx-6 h-px ${plan.popular ? 'bg-violet-100' : 'bg-gray-100'}`} />

                    {/* ★ ویژگی‌ها */}
                    <div className="p-6 sm:p-7 flex-1 space-y-3">
                      {(plan.features || []).map((feature, i) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            plan.popular ? 'bg-violet-100' : plan.bgColor
                          }`}>
                            <CheckCircle2 className={`w-3.5 h-3.5 ${plan.popular ? 'text-violet-600' : plan.color}`} />
                          </div>
                          <span className="text-gray-700 leading-relaxed">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <div className="p-6 sm:p-7 pt-0">
                      <button
                        onClick={() => handlePlanSelect(plan.name)}
                        className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:scale-[1.02] ${
                          plan.popular
                            ? 'bg-gradient-to-l from-violet-600 to-purple-600 text-white shadow-md shadow-violet-200'
                            : plan.name === 'simple'
                              ? 'bg-gradient-to-l from-blue-600 to-indigo-600 text-white'
                              : 'bg-gradient-to-l from-purple-600 to-fuchsia-600 text-white'
                        }`}
                      >
                        شروع رایگان با {plan.nameFa}
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="text-center mt-10 sm:mt-14 space-y-2">
            <p className="text-sm text-gray-400">۳ ماه استفاده رایگان — بدون نیاز به کارت بانکی — ارتقا در هر زمان</p>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              پشتیبانی کامل در دوره رایگان
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ TESTIMONIALS ══════════════════════ */}
      <section id="testimonials" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-gray-50 scroll-mt-20">
        <div ref={testimonialsRef} className="max-w-6xl mx-auto">

          <div className="text-center mb-14 sm:mb-20 space-y-4">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-100 text-violet-700 rounded-full text-xs font-bold border border-violet-200">
              <Star className="w-3.5 h-3.5 fill-current" />
              نظرات مشتریان
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 leading-tight">
              مورد اعتماد
              <span className="bg-gradient-to-l from-violet-600 to-purple-500 bg-clip-text text-transparent"> هزاران فروشگاه</span>
            </h2>
            <p className="text-gray-500 text-base sm:text-lg">ببینید کسب و کارهای موفق درباره حسابداری فروشگاهی رهگشا چه می گویند</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-100/40 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex gap-1 mb-5">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                <p className="text-gray-700 text-sm leading-relaxed mb-6">
                  <span className="text-violet-400 font-bold text-lg">«</span>
                  {t.text}
                  <span className="text-violet-400 font-bold text-lg">»</span>
                </p>

                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${t.color} flex items-center justify-center text-white font-black text-base shrink-0 shadow-lg`}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-black text-gray-900 text-sm">{t.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ CTA FINAL ═════════════════════════ */}
      <section className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-violet-950 to-purple-950" />
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px] pointer-events-none animate-drift" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-purple-600/20 rounded-full blur-[100px] pointer-events-none animate-drift-rev" />

        <div ref={ctaRef} className="sr-hidden relative max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-full text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            شروع کنید — هیچ‌چیزی برای از دست دادن وجود ندارد
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
            آماده تحول در
            <br />
            <span className="bg-gradient-to-l from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              مدیریت فروشگاهتان هستید؟
            </span>
          </h2>

          <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            همین الان ثبت‌نام کنید و ۳ ماه رایگان از تمام امکانات استفاده کنید.
            بدون نیاز به کارت بانکی.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                       <button
              onClick={handleStartFree}
              className="group px-8 sm:px-10 py-4 bg-gradient-to-l from-amber-500 to-orange-500 text-white rounded-2xl font-black text-base sm:text-lg hover:shadow-2xl hover:shadow-amber-500/30 hover:scale-105 transition-all flex items-center justify-center gap-3"
            >
              <Sparkles className="w-5 h-5" />
              انتخاب پلن و شروع رایگان
            </button>
            <button
              onClick={() => router.push('/auth/login')}
              className="px-8 sm:px-10 py-4 border border-white/20 text-white hover:bg-white/10 rounded-2xl font-bold text-base sm:text-lg transition-all flex items-center justify-center gap-3 backdrop-blur-sm"
            >
              <LogIn className="w-5 h-5" />
              ورود به حساب کاربری
            </button>
          </div>

          <div className="flex flex-wrap justify-center gap-6 pt-4">
            {trustBadges.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-gray-500 text-xs">
                <b.icon className="w-3.5 h-3.5 text-violet-400" />
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ FOOTER ════════════════════════════ */}
      <footer className="bg-gray-950 text-gray-500 pt-16 sm:pt-20 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-10 mb-12 sm:mb-16">

            <div className="col-span-2 sm:col-span-1 space-y-4">
              <div className="flex items-center gap-3">
                <a href="#" className="shrink-0 group" aria-label="صفحه اصلی">
                  <div className="logo-container w-14 h-14 sm:w-16 sm:h-16">
                    <img src="/logo.jpeg" alt="رهگشا" className="logo-img" />
                  </div>
                </a>
                <div>
                  <span className="text-white font-black text-base block">رهگشا</span>
                  <span className="text-[10px] text-violet-400">حسابداری هوشمند فروشگاهی</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-gray-500">
                سیستم حسابداری فروشگاهی هوشمند و یکپارچه برای مدیریت کامل کسب‌وکار شما.
              </p>
            </div>

            {[
              {
                title: 'محصول',
                links: [
                  { label: 'امکانات', href: '#features' },
                  { label: 'پلن‌ها', action: scrollToPricing },
                  { label: 'نظرات', href: '#testimonials' },
                ],
              },
              {
                title: 'پشتیبانی',
                links: [
                  { label: 'راهنمای استفاده', href: '#' },
                  { label: 'تماس با ما', href: '#' },
                  { label: 'سوالات متداول', href: '#' },
                ],
              },
              {
                title: 'شرکت',
                links: [
                  { label: 'درباره ما', href: '#' },
                  { label: 'قوانین و مقررات', href: '#' },
                  { label: 'حریم خصوصی', href: '#' },
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-white font-black text-sm mb-4">{col.title}</h4>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {'href' in link ? (
                        <a href={link.href} className="text-sm hover:text-violet-400 transition-colors">
                          {link.label}
                        </a>
                      ) : (
                        <button onClick={link.action} className="text-sm hover:text-violet-400 transition-colors">
                          {link.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <p>رهگشا v6.0 — سیستم حسابداری فروشگاهی هوشمند</p>
            <p>© ۱۴۰۴ تمام حقوق محفوظ است.</p>
          </div>
        </div>
      </footer>

    </div>
  )
}

function StatItem({
  stat,
  start,
}: {
  stat: {
    value: number
    suffix: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    compact?: boolean
  }
  start: boolean
}) {
  const value = useCountUp(stat.value, 2200, start)
  const display = stat.compact
    ? value >= 1_000_000
      ? formatFaNumber(Math.round(value / 1_000_000)) + ' میلیون'
      : formatFaNumber(value)
    : formatFaNumber(value)

  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 text-center hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100/40 transition-all duration-300 group">
      <div className="absolute -top-6 -right-6 w-20 h-20 bg-violet-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="relative">
        <div className="w-11 h-11 mx-auto rounded-2xl bg-violet-50 flex items-center justify-center mb-3 group-hover:bg-violet-100 transition-colors">
          <stat.icon className="w-5 h-5 text-violet-600" />
        </div>
        <div className="stat-value text-2xl sm:text-3xl font-black text-gray-900">
          {display}
          <span className="text-violet-600">{stat.suffix}</span>
        </div>
        <p className="text-xs sm:text-sm text-gray-500 mt-1.5 font-medium">{stat.label}</p>
      </div>
    </div>
  )
}