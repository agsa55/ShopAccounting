'use client'

// ============================================================================
// src/app/subscription/renew/page.tsx — (v9.4.1 ★★★)
// ShopAccounting — Subscription Renewal/Upgrade Page
// ----------------------------------------------------------------------------
// ★★★ v9.4.1: تغییرات اساسی
//   - حذف پلن ماهانه — فقط سالانه و مادام‌العمر
//   - تغییر نام پلن‌ها: ساده→پایه، حرفه‌ای→پیشرفته، سازمانی→حرفه‌ای
//   - قیمت‌های جدید:
//       پایه      سالانه: ۱,۵۹۰,۰۰۰   مادام‌العمر: ۱۶,۰۰۰,۰۰۰
//       پیشرفته   سالانه: ۲,۷۶۰,۰۰۰   مادام‌العمر: ۲۸,۰۰۰,۰۰۰
//       حرفه‌ای   سالانه: ۳,۵۵۰,۰۰۰   مادام‌العمر: ۳۶,۰۰۰,۰۰۰
//   - ★★★ هشدار برای کاربران دمو: اطلاعات دمو به پلن جدید منتقل نمی‌شود
//   - ★★★ قوانین ارتقا:
//       پایه → پیشرفته یا حرفه‌ای (در هر دوره)
//       پیشرفته → فقط حرفه‌ای
//       حرفه‌ای → هیچ تنزل‌ای
//       هر پلن سالانه → مادام‌العمر همان سطح
//
// جریان:
//   ۱. وضعیت فعلی اشتراک از API خوانده می‌شود
//   ۲. سه کارت پلن نمایش داده می‌شود (پلن فعلی + گزینه‌های ارتقا)
//   ۳. کاربر پلن و دوره را انتخاب می‌کند
//   ۴. با کلیک روی «پرداخت»، به /api/subscription/checkout POST می‌زنیم
//   ۵. کاربر به paymentUrl زرین‌پال هدایت می‌شود
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Store, Crown, Building2, CheckCircle2, Loader2,
  ArrowLeft, RefreshCw, ArrowUpCircle, CreditCard, AlertCircle,
  Sparkles, Lock, Clock, X, Zap,
} from 'lucide-react'

// ─── Plan Details (v9.4.1: فقط سالانه + مادام‌العمر) ──────────────────
const PLAN_DETAILS = {
  simple: {
    name: 'پایه',
    nameEn: 'Basic',
    icon: Zap,
    color: 'blue',
    annualPrice: 1_590_000,
    lifetimePrice: 16_000_000,
    maxUsers: 2,
    maxProducts: 200,
    maxInvoices: 500,
    description: 'حسابداری پایه، مناسب خرده‌فروش‌های کوچک',
    features: [
      'فروش نقدی (POS)',
      'مدیریت محصولات (تا ۲۰۰ کالا)',
      'فاکتور فروش نقدی',
      'گزارش درآمد/هزینه',
      'گزارش موجودی کالاها',
      'گزارش مالیات بر ارزش افزوده',
      'ورود با OTP',
    ],
  },
  professional: {
    name: 'پیشرفته',
    nameEn: 'Advanced',
    icon: Crown,
    color: 'emerald',
    annualPrice: 2_760_000,
    lifetimePrice: 28_000_000,
    maxUsers: 5,
    maxProducts: 2000,
    maxInvoices: 0,
    description: 'حسابداری دوطرفه کامل، فروش نسیه/قسطی، تراز آزمایشی',
    features: [
      'تمام قابلیت‌های پلن پایه',
      'اسناد دستی حسابداری (دو طرفه)',
      'چارت حساب‌ها + تراز آزمایشی',
      'دفتر کل با فیلتر تاریخ',
      'مدیریت چک‌های دریافتی/پرداختنی',
      'اقساط و نسیه',
      'درگاه پرداخت آنلاین (اختصاصی)',
      'پورتال مشتری با OTP',
      'گزارش‌های پیشرفته (سود/زیان، ترازنامه)',
    ],
  },
  enterprise: {
    name: 'حرفه‌ای',
    nameEn: 'Professional',
    icon: Building2,
    color: 'purple',
    annualPrice: 3_550_000,
    lifetimePrice: 36_000_000,
    maxUsers: 0,
    maxProducts: 0,
    maxInvoices: 0,
    description: 'تمام قابلیت‌ها + حسابداری شعب، اتصال مودیان',
    features: [
      'تمام قابلیت‌های پلن پیشرفته',
      'حسابداری چند شعبه',
      'گزارش‌های تلفیقی شعب',
      'بستن سال مالی',
      'اتصال سامانه مودیان',
      'مدیریت چند صندوق',
      'کاربر و محصول نامحدود',
    ],
  },
} as const

type PlanKey = keyof typeof PLAN_DETAILS
type BillingCycle = 'annual' | 'lifetime'

// ─── قوانین ارتقا ──────────────────────────────────────────────────
const TIER_LEVEL: Record<string, number> = { simple: 0, professional: 1, enterprise: 2 }
const CYCLE_LEVEL: Record<string, number> = { annual: 0, lifetime: 1 }

function canUpgrade(currentPlan: string, currentCycle: string, targetPlan: string, targetCycle: BillingCycle): boolean {
  const currentTier = TIER_LEVEL[currentPlan] ?? 0
  const targetTier = TIER_LEVEL[targetPlan] ?? 0

  // ★ اگر سطح هدف پایین‌تر از سطح فعلی باشد → مجاز نیست
  if (targetTier < currentTier) return false

  // ★ اگر سطح هدف برابر با سطح فعلی باشد:
  if (targetTier === currentTier) {
    const currentCycleLevel = CYCLE_LEVEL[currentCycle] ?? 0
    const targetCycleLevel = CYCLE_LEVEL[targetCycle] ?? 0
    // ★ همان پلن و همان دوره → مجاز نیست
    if (currentPlan === targetPlan && currentCycle === targetCycle) return false
    // ★ دوره هدف باید ≥ دوره فعلی باشد
    return targetCycleLevel >= currentCycleLevel
  }

  // ★ اگر سطح هدف بالاتر از سطح فعلی باشد → همیشه مجاز است
  return true
}

export default function SubscriptionRenewPage() {
  const router = useRouter()
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('simple')
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('annual')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  // ★★★ v9.4.1: تشخیص tenant دمو
  const [isDemo, setIsDemo] = useState(false)
  const [showDemoWarning, setShowDemoWarning] = useState(false)

  // ─── Load current subscription status ───────────────────────────
  useEffect(() => {
    const fetchStatus = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success && data.data) {
          setStatus(data.data)
          // ★ پیش‌فرض: همان پلن فعلی را برای تمدید انتخاب کن
          if (data.data.tierName && data.data.tierName in PLAN_DETAILS) {
            setSelectedPlan(data.data.tierName as PlanKey)
          }
          if (data.data.billingCycle === 'lifetime') {
            setSelectedCycle('lifetime')
          } else {
            setSelectedCycle('annual')
          }
        }

        // ★★★ v9.4.1: تشخیص tenant دمو
        const trialRes = await fetch('/api/tenants/trial-check', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const trialData = await trialRes.json()
        if (trialData.success && trialData.data) {
          const tenantId = trialData.data.tenantId || ''
          if (tenantId.startsWith('demo-') || trialData.data.status === 'demo' || trialData.data.isDemo) {
            setIsDemo(true)
          }
        }
      } catch (err) {
        console.warn('[Renew Page] Failed to fetch status:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

  // ─── Submit checkout ─────────────────────────────────────────────
  const handleCheckout = async () => {
    setError('')

    // ★★★ v9.4.1: اگر tenant دمو است، هشدار نمایش بده
    if (isDemo && !showDemoWarning) {
      setShowDemoWarning(true)
      return
    }

    setSubmitting(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (!token) {
        setError('ابتدا وارد حساب کاربری خود شوید')
        setSubmitting(false)
        return
      }

      // ★ تشخیص action: اگر پلن بالاتر از فعلی است → upgrade، در غیر این صورت renew
      // ★★★ v9.4.1: اگر دمو است → 'new' (tenant جدید)
      const currentTierOrder = ['simple', 'professional', 'enterprise']
      const currentIdx = status?.tierName ? currentTierOrder.indexOf(status.tierName) : -1
      const newIdx = currentTierOrder.indexOf(selectedPlan)
      const action: 'upgrade' | 'renew' | 'new' =
        isDemo ? 'new' :
        currentIdx >= 0 && newIdx > currentIdx ? 'upgrade' :
        currentIdx === newIdx ? 'renew' : 'new'

      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tierName: selectedPlan,
          billingCycle: selectedCycle,
          action,
        }),
      })

      const data = await res.json()

      if (data.success && data.data?.paymentUrl) {
        // ★ هدایت به درگاه زرین‌پال
        window.location.href = data.data.paymentUrl
      } else {
        setError(data.error || 'خطا در ایجاد درخواست پرداخت')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setSubmitting(false)
      setShowDemoWarning(false)
    }
  }

  // ─── Helper functions ────────────────────────────────────────────
  const formatPrice = (n: number) => n.toLocaleString('fa-IR')

  const currentTierOrder = ['simple', 'professional', 'enterprise']
  const currentIdx = status?.tierName ? currentTierOrder.indexOf(status.tierName) : -1

  const isCurrentPlan = (planKey: PlanKey) => status?.tierName === planKey
  const isUpgrade = (planKey: PlanKey) => {
    const newIdx = currentTierOrder.indexOf(planKey)
    return currentIdx >= 0 && newIdx > currentIdx
  }
  const isDowngrade = (planKey: PlanKey) => {
    const newIdx = currentTierOrder.indexOf(planKey)
    return currentIdx >= 0 && newIdx < currentIdx
  }

  // ★★★ v9.4.1: بررسی مجاز بودن انتخاب فعلی
  const currentBillingCycle = status?.billingCycle === 'lifetime' ? 'lifetime' : 'annual'
  const isCurrentSelectionAllowed = canUpgrade(
    status?.tierName || 'simple',
    currentBillingCycle,
    selectedPlan,
    selectedCycle
  )

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">در حال بارگذاری...</p>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        {/* ─── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {isDemo ? 'خرید پلن' : status?.isExpired ? 'تمدید اشتراک' : 'تمدید یا ارتقای اشتراک'}
              </h1>
              <p className="text-xs text-gray-500">
                {status?.tierName
                  ? `پلن فعلی: ${PLAN_DETAILS[status.tierName as PlanKey]?.name || status.tierName}`
                  : 'بدون اشتراک فعال'}
                {status?.expiresAt && !status?.isExpired && (
                  <span className="mr-2">
                    • انقضا: {new Date(status.expiresAt).toLocaleDateString('fa-IR')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            بازگشت
          </Link>
        </div>

        {/* ─── بنر هشدار دمو ───────────────────────────────────────── */}
        {isDemo && (
          <div className="mb-4 bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">شما در حالت تست دمو هستید</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                با خرید پلن، یک <strong>فروشگاه جدید</strong> برای شما ایجاد می‌شود و اطلاعات تست دمو شما <strong>حذف خواهد شد</strong>.
                اطلاعات تست دمو به پلن جدید منتقل نمی‌شود.
              </p>
            </div>
          </div>
        )}

        {/* ─── Expired Warning ────────────────────────────────────── */}
        {status?.isExpired && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-900">اشتراک شما منقضی شده است</p>
              <p className="text-xs text-red-700 mt-0.5">
                برای ادامه استفاده از سیستم، یکی از پلن‌های زیر را انتخاب و پرداخت کنید.
              </p>
            </div>
          </div>
        )}

        {/* ─── Billing Cycle Selector (v9.4.1: سالانه + مادام‌العمر) ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
          <div className="flex items-center justify-center gap-1 p-1 bg-gray-100 rounded-lg max-w-xs mx-auto">
            <button
              type="button"
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                selectedCycle === 'annual'
                  ? 'bg-white text-emerald-700 shadow-sm font-bold'
                  : 'text-gray-500'
              }`}
              onClick={() => setSelectedCycle('annual')}
            >
              سالانه
              <span className="text-[10px] text-emerald-600 mr-1">(۳۶۵ روز)</span>
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                selectedCycle === 'lifetime'
                  ? 'bg-white text-amber-700 shadow-sm font-bold'
                  : 'text-gray-500'
              }`}
              onClick={() => setSelectedCycle('lifetime')}
            >
              مادام‌العمر
              <span className="text-[10px] text-amber-600 mr-1">(بدون انقضا)</span>
            </button>
          </div>
        </div>

        {/* ─── Plan Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {(['simple', 'professional', 'enterprise'] as PlanKey[]).map((planKey) => {
            const plan = PLAN_DETAILS[planKey]
            const Icon = plan.icon
            const isSelected = selectedPlan === planKey
            const isCurrent = isCurrentPlan(planKey)
            const upgrade = isUpgrade(planKey)
            const downgrade = isDowngrade(planKey)

            // ★★★ v9.4.1: بررسی مجاز بودن این پلن با دوره انتخاب‌شده
            const allowed = canUpgrade(
              status?.tierName || 'simple',
              currentBillingCycle,
              planKey,
              selectedCycle
            )

            return (
              <div
                key={planKey}
                className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                  isSelected
                    ? `border-${plan.color}-500 shadow-md cursor-pointer`
                    : allowed
                      ? 'border-gray-200 hover:border-gray-300 cursor-pointer'
                      : 'border-gray-200 opacity-60 cursor-not-allowed'
                }`}
                onClick={() => allowed && setSelectedPlan(planKey)}
              >
                {/* Badge پلن فعلی */}
                {isCurrent && (
                  <div className={`bg-${plan.color}-500 text-white text-center text-[10px] font-bold py-1`}>
                    پلن فعلی شما
                  </div>
                )}

                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-lg bg-${plan.color}-100 flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 text-${plan.color}-600`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-[10px] text-gray-400">{plan.nameEn}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-center py-2">
                    <div className="text-2xl font-bold text-gray-900">
                      {formatPrice(selectedCycle === 'annual' ? plan.annualPrice : plan.lifetimePrice)}
                    </div>
                    <div className="text-xs text-gray-500">
                      تومان / {selectedCycle === 'annual' ? 'سال' : 'یکبار'}
                    </div>
                    {selectedCycle === 'annual' && (
                      <div className="text-[10px] text-emerald-600 mt-1">
                        معادل {formatPrice(Math.round(plan.annualPrice / 12))} ت/ماه
                      </div>
                    )}
                    {selectedCycle === 'lifetime' && (
                      <div className="text-[10px] text-amber-600 mt-1 flex items-center justify-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        بدون تاریخ انقضا
                      </div>
                    )}
                  </div>

                  {/* Specs */}
                  <div className="space-y-1 text-[11px] pb-2 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">کاربران:</span>
                      <span className="font-bold text-gray-700">
                        {plan.maxUsers === 0 ? 'نامحدود' : formatPrice(plan.maxUsers)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">محصولات:</span>
                      <span className="font-bold text-gray-700">
                        {plan.maxProducts === 0 ? 'نامحدود' : formatPrice(plan.maxProducts)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">فاکتور/سال:</span>
                      <span className="font-bold text-gray-700">
                        {plan.maxInvoices === 0 ? 'نامحدود' : formatPrice(plan.maxInvoices)}
                      </span>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-1">
                    {plan.features.slice(0, 5).map((feature, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {plan.features.length > 5 && (
                      <li className="text-[10px] text-gray-400 pr-4">
                        + {formatPrice(plan.features.length - 5)} مورد دیگر
                      </li>
                    )}
                  </ul>

                  {/* Action Label */}
                  {isCurrent ? (
                    <div className="text-center text-[11px] text-gray-500 italic">
                      پلن فعلی شما — برای تمدید انتخاب کنید
                    </div>
                  ) : upgrade ? (
                    <div className="text-center text-[11px] text-emerald-600 font-bold">
                      <ArrowUpCircle className="w-3.5 h-3.5 inline ml-1" />
                      ارتقا
                    </div>
                  ) : downgrade ? (
                    <div className="text-center text-[11px] text-amber-600 flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3" />
                      تنزل مجاز نیست
                    </div>
                  ) : null}

                  {/* ★★★ v9.4.1: badge غیرمجاز */}
                  {!allowed && !isCurrent && (
                    <div className="text-center text-[10px] text-gray-400 flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3" />
                      قابل انتخاب نیست
                    </div>
                  )}
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className={`absolute top-2 left-2 w-5 h-5 bg-${plan.color}-500 rounded-full flex items-center justify-center`}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ─── Checkout Summary ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">خلاصه پرداخت</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">پلن انتخابی:</span>
              <span className="font-bold text-gray-900">
                {PLAN_DETAILS[selectedPlan].name}
                {isCurrentPlan(selectedPlan) && (
                  <span className="text-[10px] text-emerald-600 mr-1">(تمدید)</span>
                )}
                {isUpgrade(selectedPlan) && (
                  <span className="text-[10px] text-emerald-600 mr-1">(ارتقا)</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">دوره:</span>
              <span className="font-bold text-gray-900 flex items-center gap-1">
                {selectedCycle === 'annual' ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-emerald-500" />
                    سالانه (۳۶۵ روز)
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    مادام‌العمر (بدون انقضا)
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">مبلغ قابل پرداخت:</span>
              <span className="font-bold text-emerald-700 text-lg">
                {formatPrice(selectedCycle === 'annual' ? PLAN_DETAILS[selectedPlan].annualPrice : PLAN_DETAILS[selectedPlan].lifetimePrice)}
                <span className="text-xs text-gray-500 mr-1">تومان</span>
              </span>
            </div>
            {isDemo && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                <p className="text-[11px] text-amber-700 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  با خرید، یک فروشگاه جدید ایجاد می‌شود و اطلاعات دمو حذف خواهد شد
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Error Display ──────────────────────────────────────── */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* ─── Action Button ─────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleCheckout}
          disabled={submitting || !isCurrentSelectionAllowed}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              در حال ایجاد درخواست پرداخت...
            </>
          ) : !isCurrentSelectionAllowed ? (
            <>
              <Lock className="w-4 h-4" />
              این انتخاب مجاز نیست
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              پرداخت با زرین‌پال
            </>
          )}
        </button>

        {/* ─── Trust Indicators ──────────────────────────────────── */}
        <div className="mt-6 text-center text-[11px] text-gray-500">
          <p>🔒 پرداخت امن از طریق درگاه زرین‌پال</p>
          <p className="mt-1">
            {isDemo
              ? 'پس از خرید، یک فروشگاه جدید با زیردامنه جدید برای شما ایجاد می‌شود'
              : 'تمام اطلاعات فروشگاه شما پس از تمدید قابل دسترسی خواهد بود'}
          </p>
        </div>
      </div>

      {/* ═══ Modal هشدار دمو ═══ */}
      {showDemoWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  هشدار مهم
                </h3>
                <button
                  onClick={() => setShowDemoWarning(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-900 leading-relaxed">
                  شما در حالت تست دمو هستید. با خرید پلن{' '}
                  <strong>{PLAN_DETAILS[selectedPlan].name}</strong> ({selectedCycle === 'lifetime' ? 'مادام‌العمر' : 'سالانه'}):
                </p>
              </div>

              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>اطلاعات تست دمو شما (محصولات، فاکتورها، مشتریان) <strong>حذف خواهد شد</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>این اطلاعات به پلن جدید <strong>منتقل نمی‌شود</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>یک <strong>فروشگاه جدید</strong> با زیردامنه جدید برای شما ایجاد می‌شود</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>پلن جدید بلافاصله پس از پرداخت فعال می‌شود</span>
                </li>
              </ul>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  💡 <strong>نکته:</strong> اگر اطلاعاتی در دمو دارید که می‌خواهید نگه دارید، لطفاً قبل از خرید آن‌ها را دستی ذخیره کنید.
                </p>
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => setShowDemoWarning(false)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                انصراف
              </button>
              <button
                onClick={handleCheckout}
                disabled={submitting}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-lg font-medium"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'متوجه شدم، ادامه پرداخت'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
