'use client'

// ============================================================================
// src/components/settings/settings-subscription-page.tsx (v9.6.2 ★★★)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v9.6.2:
//   ★ نمایش ۳ دکمه در کارت پلن فعال (پلن فعلی، تمدید سالانه، ارتقا به مادام‌العمر)
//   ★ رفع خطای TypeScript در مقایسه نام پلن‌ها
//   ★ هماهنگی کامل با APIهای جدید renew و upgrade
// ============================================================================

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import {
  resolvePlan, PLANS, getNextPlan,
  type PlanName, type PlanTier,
} from '@/lib/plan-features'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CheckCircle2, Lock, Crown, ChevronLeft, Zap, Building2,
  Database, Users, ShoppingCart, FileText, CreditCard,
  BarChart3, Sparkles, Calculator, BookOpen, Scale, Server, TrendingUp, 
  Clock, AlertTriangle, RefreshCw,
} from 'lucide-react'

const PLAN_ICONS: Record<PlanName, React.ElementType> = {
  simple: Zap,
  professional: Crown,
  enterprise: Building2,
}

const PLAN_COLORS: Record<PlanName, {
  gradient: string
  border: string
  badge: string
  iconBg: string
  iconColor: string
  titleColor: string
  buttonClass: string
  featured?: boolean
}> = {
  simple: {
    gradient: 'from-emerald-50 to-white',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-900',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  professional: {
    gradient: 'from-blue-50 to-white',
    border: 'border-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-900',
    buttonClass: 'bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white',
    featured: true,
  },
  enterprise: {
    gradient: 'from-purple-50 to-white',
    border: 'border-purple-300',
    badge: 'bg-purple-100 text-purple-700',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    titleColor: 'text-purple-900',
    buttonClass: 'bg-gradient-to-l from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white',
  },
}

const FEATURE_LIST = [
  { key: 'cash', label: 'فروش نقدی', icon: ShoppingCart, tiers: ['basic', 'professional', 'enterprise'] as PlanTier[] },
  { key: 'card', label: 'کارتخوان', icon: CreditCard, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'credit', label: 'فروش نسیه', icon: CreditCard, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'installment', label: 'فروش قسطی', icon: FileText, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'edit_tax', label: 'ویرایش مالیات', icon: FileText, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'delete_invoice', label: 'حذف فاکتور', icon: FileText, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'simple_report', label: 'گزارش ساده', icon: BarChart3, tiers: ['basic', 'professional', 'enterprise'] as PlanTier[] },
  { key: 'journals', label: 'مشاهده اسناد', icon: FileText, tiers: ['basic', 'professional', 'enterprise'] as PlanTier[] },
  { key: 'chart', label: 'چارت حساب‌ها', icon: BookOpen, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'manual_journal', label: 'سند دستی', icon: Calculator, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'trial_balance', label: 'تراز آزمایشی', icon: Scale, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'installments', label: 'مدیریت اقساط', icon: CreditCard, tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'multi_branch', label: 'حسابداری شعب', icon: Building2, tiers: ['enterprise'] as PlanTier[] },
  { key: 'consolidated', label: 'گزارش‌های تلفیقی', icon: TrendingUp, tiers: ['enterprise'] as PlanTier[] },
  { key: 'close_fiscal', label: 'بستن سال مالی', icon: FileText, tiers: ['enterprise'] as PlanTier[] },
  { key: 'moidian', label: 'اتصال سامانه مودیان', icon: Database, tiers: ['enterprise'] as PlanTier[] },
  { key: 'multi_register', label: 'مدیریت چند صندوق', icon: Server, tiers: ['enterprise'] as PlanTier[] },
] as const

interface SubscriptionStatus {
  status: 'active' | 'warning' | 'grace_period' | 'read_only' | 'expired'
  daysRemaining: number
  isLifetime?: boolean
  message: string
  tierName?: string
  tierNameFa?: string
}

export default function SettingsSubscriptionPage() {
  const planNameFromStore = useStore((s) => s.planName)
  const setPlanName = useStore((s) => s.setPlanName)
  const setCurrentView = useStore((s) => s.setCurrentView)

  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null)
  const [renewing, setRenewing] = useState(false)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success && data.data) {
          setSubStatus(data.data)
        }
      } catch (err) {
        console.error('Failed to fetch subscription status', err)
      }
    }
    fetchStatus()
  }, [])

  const plan = resolvePlan(planNameFromStore)
  const planInfo = PLANS[plan.planName]
  const currentPlanName = plan.planName

  // ★★★ تابع تمدید سالانه
  const handleRenewAnnual = async () => {
    setRenewing(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/subscription/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billingCycle: 'annual' }),
      })
      const data = await res.json()
      if (data.success) {
        alert('✅ اشتراک شما با موفقیت برای یک سال دیگر تمدید شد!')
        window.location.reload()
      } else {
        alert('❌ خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err) {
      alert('❌ خطا در ارتباط با سرور')
    } finally {
      setRenewing(false)
    }
  }

  // ★★★ تابع ارتقا به پلن بالاتر یا مادام‌العمر
  const handleUpgrade = async (pn: PlanName, billingCycle: 'annual' | 'lifetime') => {
    setUpgrading(`${pn}-${billingCycle}`)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tierName: pn, billingCycle }),
      })
      const data = await res.json()
      if (data.success) {
        const cycleLabel = billingCycle === 'lifetime' ? 'مادام‌العمر' : 'سالانه'
        alert(`✅ پلن شما با موفقیت به ${PLANS[pn].label} (${cycleLabel}) ارتقا یافت!`)
        window.location.reload()
      } else {
        alert('❌ خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err) {
      alert('❌ خطا در ارتباط با سرور')
    } finally {
      setUpgrading(null)
    }
  }

  const getStatusBadge = () => {
    if (!subStatus) return <Badge className="bg-gray-100 text-gray-700">در حال بارگذاری...</Badge>
    if (subStatus.isLifetime) return <Badge className="bg-emerald-100 text-emerald-700">مادام‌العمر</Badge>
    if (subStatus.status === 'active') return <Badge className="bg-emerald-100 text-emerald-700">فعال</Badge>
    if (subStatus.status === 'warning') return <Badge className="bg-amber-100 text-amber-700">نیاز به تمدید</Badge>
    if (subStatus.status === 'grace_period') return <Badge className="bg-orange-100 text-orange-700">دوره مهلت</Badge>
    return <Badge className="bg-red-100 text-red-700">فقط خواندنی / منقضی</Badge>
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      {/* هدر */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentView('settings')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Crown className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-bold">اشتراک و پلن</h1>
        </div>
        {getStatusBadge()}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ★ کارت وضعیت و پلن فعلی */}
        <Card className={`border-2 ${PLAN_COLORS[currentPlanName].border} bg-gradient-to-l ${PLAN_COLORS[currentPlanName].gradient}`}>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${PLAN_COLORS[currentPlanName].iconBg}`}>
                  {(() => {
                    const Icon = PLAN_ICONS[currentPlanName]
                    return <Icon className={`w-8 h-8 ${PLAN_COLORS[currentPlanName].iconColor}`} />
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className={`text-xl font-bold ${PLAN_COLORS[currentPlanName].titleColor}`}>
                      پلن {plan.label}
                    </h2>
                    <Badge className={PLAN_COLORS[currentPlanName].badge}>
                      {currentPlanName === 'simple' ? 'سطح پایه' : currentPlanName === 'professional' ? 'سطح پیشرفته' : 'سطح حرفه‌ای'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{planInfo.description}</p>
                  
                  {subStatus && !subStatus.isLifetime && (
                    <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium ${
                      subStatus.status === 'warning' ? 'text-amber-700' : 
                      subStatus.status === 'grace_period' ? 'text-orange-700' : 
                      subStatus.status === 'read_only' || subStatus.status === 'expired' ? 'text-red-700' : 'text-emerald-700'
                    }`}>
                      {subStatus.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {subStatus.status === 'grace_period' && <Clock className="w-3.5 h-3.5" />}
                      {(subStatus.status === 'read_only' || subStatus.status === 'expired') && <Lock className="w-3.5 h-3.5" />}
                      <span>{subStatus.message}</span>
                    </div>
                  )}
                  {subStatus?.isLifetime && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-emerald-700">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>اشتراک مادام‌العمر (بدون تاریخ انقضا)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* محدودیت‌ها */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-gray-200/60">
              <div className="text-center">
                <Database className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">نوع بانک</div>
                <div className="text-xs font-bold text-gray-700">مشترک</div>
              </div>
              <div className="text-center">
                <ShoppingCart className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">محصول</div>
                <div className="text-xs font-bold text-gray-700">
                  {planInfo.maxProducts === 0 ? 'نامحدود' : planInfo.maxProducts.toLocaleString('fa-IR')}
                </div>
              </div>
              <div className="text-center">
                <FileText className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">فاکتور/ماه</div>
                <div className="text-xs font-bold text-gray-700">
                  {planInfo.maxInvoicesPerMonth === 0 ? 'نامحدود' : planInfo.maxInvoicesPerMonth.toLocaleString('fa-IR')}
                </div>
              </div>
              <div className="text-center">
                <Users className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">کاربر</div>
                <div className="text-xs font-bold text-gray-700">
                  {planInfo.maxUsers === 0 ? 'نامحدود' : planInfo.maxUsers.toLocaleString('fa-IR')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ★ قابلیت‌های فعال پلن فعلی */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              قابلیت‌های فعال پلن {plan.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {FEATURE_LIST.map((feat) => {
                const Icon = feat.icon
                const isActive = feat.tiers.includes(plan.tier)
                return (
                  <div key={feat.key} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${isActive ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700' : 'border-gray-200 bg-gray-50/50 text-gray-400'}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 truncate">{feat.label}</span>
                    {isActive ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* ★★★ کارت‌های پلن با ۳ دکمه در پلن فعال */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">مدیریت اشتراک</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(Object.keys(PLANS) as PlanName[]).map((pn) => {
              const info = PLANS[pn]
              const style = PLAN_COLORS[pn]
              const Icon = PLAN_ICONS[pn]
              
              // ★★★ منطق قطعی و بدون خطای TypeScript برای تشخیص پلن فعلی
              const isCurrent = pn === currentPlanName || (pn === 'simple' && String(planNameFromStore).toLowerCase() === 'basic')
              
              const isLifetime = subStatus?.isLifetime

              return (
                <Card key={pn} className={`relative overflow-hidden transition-all hover:shadow-md ${style.border} ${style.featured ? 'ring-2 ring-blue-400' : ''} ${isCurrent ? 'ring-2 ring-emerald-400' : ''}`}>
                  {isCurrent && (
                    <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-center text-[10px] font-bold py-1 z-10">
                      پلن فعلی
                    </div>
                  )}
                  {style.featured && !isCurrent && (
                    <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-center text-[10px] font-bold py-1 z-10">
                      پیشنهادی
                    </div>
                  )}

                  <CardContent className={`p-5 ${isCurrent || style.featured ? 'pt-8' : ''}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg}`}>
                        <Icon className={`w-6 h-6 ${style.iconColor}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">{info.label}</h3>
                        <p className="text-[10px] text-gray-500">{info.labelEn}</p>
                      </div>
                    </div>

                    <div className="mb-4 space-y-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold">{info.annualPrice.toLocaleString('fa-IR')}</span>
                        <span className="text-xs text-gray-500">تومان/سالانه</span>
                      </div>
                      {info.lifetimePrice && info.lifetimePrice > 0 && (
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-medium text-gray-600">{info.lifetimePrice.toLocaleString('fa-IR')}</span>
                          <span className="text-[10px] text-gray-400">تومان/مادام‌العمر</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 mb-4 text-[11px]">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Database className="w-3 h-3 text-gray-400" />
                        بانک مشترک
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Users className="w-3 h-3 text-gray-400" />
                        {info.maxUsers === 0 ? 'کاربر نامحدود' : `تا ${info.maxUsers.toLocaleString('fa-IR')} کاربر`}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <ShoppingCart className="w-3 h-3 text-gray-400" />
                        {info.maxProducts === 0 ? 'محصول نامحدود' : `تا ${info.maxProducts.toLocaleString('fa-IR')} محصول`}
                      </div>
                    </div>

                    {/* ★★★ دکمه‌های عملیات - ۳ دکمه برای پلن فعال */}
                    <div className="space-y-2">
                      {isCurrent ? (
                        <>
                          {/* دکمه ۱: نشانگر پلن فعال */}
                          <Button className="w-full gap-2 bg-gray-100 text-gray-600 hover:bg-gray-100 cursor-default" disabled>
                            <CheckCircle2 className="w-4 h-4" />
                            پلن فعلی شما
                          </Button>
                          
                          {/* دکمه ۲: تمدید یک سال دیگر */}
                          <Button
                            className={`w-full gap-2 ${style.buttonClass}`}
                            onClick={handleRenewAnnual}
                            disabled={renewing || isLifetime}
                          >
                            {renewing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {isLifetime ? 'تمدید (مادام‌العمر فعال)' : 'تمدید یک سال دیگر'}
                          </Button>
                          
                          {/* دکمه ۳: ارتقا به مادام‌العمر */}
                          <Button
                            variant="outline"
                            className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => handleUpgrade(pn, 'lifetime')}
                            disabled={upgrading === `${pn}-lifetime` || isLifetime}
                          >
                            {upgrading === `${pn}-lifetime` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isLifetime ? 'مادام‌العمر فعال' : 'ارتقا به مادام‌العمر'}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            className={`w-full gap-2 ${style.buttonClass}`}
                            onClick={() => handleUpgrade(pn, 'annual')}
                            disabled={upgrading === `${pn}-annual`}
                          >
                            {upgrading === `${pn}-annual` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                            ارتقا به {info.label} (سالانه)
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => handleUpgrade(pn, 'lifetime')}
                            disabled={upgrading === `${pn}-lifetime`}
                          >
                            {upgrading === `${pn}-lifetime` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            ارتقا به {info.label} (مادام‌العمر)
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}