'use client'

// ============================================================================
// src/components/shared/plan-banner.tsx
// ShopAccounting — بنر برجسته پلن بالای صفحات
// ============================================================================
// ★ بنر رنگی در بالای هر صفحه که پلن فعلی رو واضح نشون بده
// ★ شامل: نام پلن، سطح، نوع بانک، محدودیت‌ها، دکمه ارتقا
// ★ رنگ‌بندی متفاوت برای هر سطح: خاکستری (پایه)، آبی (حرفه‌ای)، بنفش (سازمانی)
// ============================================================================

import { useStore } from '@/lib/store'
import { resolvePlan, PLANS, getNextPlan, type PlanName } from '@/lib/plan-features'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Crown, Shield, Zap, Building2, Database, Users,
  ShoppingCart, FileText, ArrowLeft, Sparkles,
} from 'lucide-react'

interface PlanBannerProps {
  /** تابع ناوبری به صفحه ارتقا */
  onUpgrade?: () => void
  /** اگه true باشه، بنر جمع‌تر و کم‌رنگ‌تر نمایش داده میشه */
  compact?: boolean
}

const TIER_VISUALS = {
  basic: {
    gradient: 'from-slate-100 via-slate-50 to-white',
    border: 'border-slate-300',
    accentBar: 'bg-slate-500',
    iconBg: 'bg-slate-500',
    icon: Shield,
    titleColor: 'text-slate-900',
    subColor: 'text-slate-600',
    badge: 'bg-slate-200 text-slate-700',
  },
  professional: {
    gradient: 'from-blue-100 via-blue-50 to-white',
    border: 'border-blue-300',
    accentBar: 'bg-blue-500',
    iconBg: 'bg-blue-500',
    icon: Zap,
    titleColor: 'text-blue-900',
    subColor: 'text-blue-700',
    badge: 'bg-blue-200 text-blue-800',
  },
  enterprise: {
    gradient: 'from-purple-100 via-purple-50 to-white',
    border: 'border-purple-300',
    accentBar: 'bg-purple-500',
    iconBg: 'bg-purple-500',
    icon: Building2,
    titleColor: 'text-purple-900',
    subColor: 'text-purple-700',
    badge: 'bg-purple-200 text-purple-800',
  },
}

export function PlanBanner({ onUpgrade, compact = false }: PlanBannerProps) {
  const planName = useStore((s) => s.planName)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const plan = resolvePlan(planName)
  const visual = TIER_VISUALS[plan.tier]
  const Icon = visual.icon
  const nextPlan = getNextPlan(planName)
  const planInfo = PLANS[plan.planName]

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade()
    } else {
      setCurrentView('upgrade-plan')
    }
  }

  if (compact) {
    return (
      <div
        dir="rtl"
        className={`relative overflow-hidden rounded-lg border-2 ${visual.border} bg-gradient-to-l ${visual.gradient} px-3 py-2`}
      >
        <div className={`absolute top-0 right-0 bottom-0 w-1 ${visual.accentBar}`} />
        <div className="flex items-center justify-between gap-3 pr-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${visual.iconBg}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-bold ${visual.titleColor}`}>پلن {plan.label}</span>
                <Badge className={`text-[9px] h-4 px-1 ${visual.badge}`}>{plan.tier === 'basic' ? 'پایه' : plan.tier === 'professional' ? 'حرفه‌ای' : 'سازمانی'}</Badge>
              </div>
              <div className="text-[10px] text-gray-500">
                {plan.isIsolated ? 'بانک اختصاصی' : 'بانک اشتراکی'}
                {plan.isPaid ? ' • پولی' : ' • رایگان'}
              </div>
            </div>
          </div>
          {nextPlan && (
            <Button
              size="sm"
              className="h-7 text-[11px] gap-1 bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              onClick={handleUpgrade}
            >
              <Crown className="w-3 h-3" />
              ارتقا
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      dir="rtl"
      className={`relative overflow-hidden rounded-xl border-2 ${visual.border} bg-gradient-to-l ${visual.gradient} p-4`}
    >
      {/* نوار رنگی سمت راست */}
      <div className={`absolute top-0 right-0 bottom-0 w-1.5 ${visual.accentBar}`} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-3">
        {/* ★ بخش اول: آیکون + نام پلن + توضیحات */}
        <div className="flex items-center gap-3">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-lg ${visual.iconBg}`}>
            <Icon className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`text-lg font-bold ${visual.titleColor}`}>
                پلن {plan.label}
              </h2>
              <Badge className={`text-[10px] h-5 px-2 ${visual.badge}`}>
                {plan.tier === 'basic' ? 'سطح پایه' : plan.tier === 'professional' ? 'سطح حرفه‌ای' : 'سطح سازمانی'}
              </Badge>
              <Badge className={`text-[10px] h-5 px-2 ${plan.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {plan.isPaid ? 'پولی' : 'رایگان'}
              </Badge>
            </div>
            <p className={`text-xs mt-1 ${visual.subColor}`}>
              {plan.isIsolated ? 'بانک اختصاصی' : 'بانک اشتراکی'}
              {planInfo.monthlyPrice > 0 && ` • ${planInfo.monthlyPrice.toLocaleString('fa-IR')} تومان/ماه`}
            </p>
          </div>
        </div>

        {/* ★ بخش دوم: محدودیت‌های پلن */}
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <div className="text-gray-500">نوع بانک</div>
              <div className="font-bold text-gray-700">
                {plan.isIsolated ? 'اختصاصی' : 'اشتراکی'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <div className="text-gray-500">محصول</div>
              <div className="font-bold text-gray-700">
                {planInfo.maxProducts === 0 ? 'نامحدود' : planInfo.maxProducts.toLocaleString('fa-IR')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <div className="text-gray-500">فاکتور/ماه</div>
              <div className="font-bold text-gray-700">
                {planInfo.maxInvoicesPerMonth === 0 ? 'نامحدود' : planInfo.maxInvoicesPerMonth.toLocaleString('fa-IR')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <div className="text-gray-500">کاربر</div>
              <div className="font-bold text-gray-700">
                {planInfo.maxUsers === 0 ? 'نامحدود' : planInfo.maxUsers.toLocaleString('fa-IR')}
              </div>
            </div>
          </div>
        </div>

        {/* ★ بخش سوم: دکمه ارتقا */}
        {nextPlan ? (
          <Button
            className="gap-2 bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md h-10"
            onClick={handleUpgrade}
          >
            <Crown className="w-4 h-4" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-bold">ارتقا به {PLANS[nextPlan].label}</span>
              <span className="text-[9px] opacity-90">
                {PLANS[nextPlan].monthlyPrice === 0
                  ? 'رایگان'
                  : `${PLANS[nextPlan].monthlyPrice.toLocaleString('fa-IR')} ت/ماه`}
              </span>
            </div>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Badge className="gap-1 bg-purple-100 text-purple-700 px-3 py-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            بالاترین پلن
          </Badge>
        )}
      </div>
    </div>
  )
}

export default PlanBanner
