'use client'

// ============================================================================
// src/components/shared/plan-indicator.tsx
// ShopAccounting — نشانگر پلن فعلی + قابلیت‌های قفل‌شده
// ============================================================================
// ★ نمایش واضح پلن فعلی، سطح دسترسی، و قابلیت‌های در دسترس/قفل‌شده
// ★ استفاده در بالای هر صفحه برای آگاهی کاربر
// ============================================================================

import { useStore } from '@/lib/store'
import { resolvePlan, getPlanInfo, getNextPlan, getNextTier, PLANS, type PlanName } from '@/lib/plan-features'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Crown, Lock, CheckCircle2, ChevronLeft, Database, Users,
  ShoppingCart, FileText, CreditCard, BarChart3, Shield,
  Star, Zap, Building2
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
//  پالت رنگی بر اساس سطح پلن
// ═══════════════════════════════════════════════════════════════

const TIER_STYLES = {
  basic: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: 'text-slate-500',
    accent: 'text-slate-600',
    label: 'پایه',
    iconComponent: Shield,
  },
  professional: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: 'text-blue-600',
    accent: 'text-blue-700',
    label: 'حرفه‌ای',
    iconComponent: Zap,
  },
  enterprise: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: 'text-purple-600',
    accent: 'text-purple-700',
    label: 'سازمانی',
    iconComponent: Building2,
  },
}

// ═══════════════════════════════════════════════════════════════
//  PlanIndicator — کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

interface PlanIndicatorProps {
  /** اگه true باشه، فقط بج هدر رو نشون میده */
  compact?: boolean
  /** اگه true باشه، قابلیت‌های قفل‌شده رو هم نشون میده */
  showLockedFeatures?: boolean
  /** تابع ناوبری به صفحه ارتقا */
  onUpgrade?: () => void
}

export function PlanIndicator({ compact = false, showLockedFeatures = true, onUpgrade }: PlanIndicatorProps) {
  const planName = useStore((s) => s.planName)
  const plan = resolvePlan(planName)

  const style = TIER_STYLES[plan.tier]
  const TierIcon = style.iconComponent
  const nextPlan = getNextPlan(planName)
  const nextTier = getNextTier(plan.tier)

  // ★ قابلیت‌های قفل‌شده
  const lockedFeatures = getLockedFeatures(plan.tier)

  if (compact) {
    return (
      <Badge className={`gap-1 text-[10px] px-2 py-0.5 h-5 ${style.badge} border cursor-pointer`}
        onClick={onUpgrade}
        title={`${plan.label} — کلیک برای ارتقا`}
      >
        <TierIcon className="w-3 h-3" />
        {plan.label}
        {nextPlan && <Crown className="w-2.5 h-2.5 opacity-60" />}
      </Badge>
    )
  }

  return (
    <div className={`rounded-lg border-2 ${style.border} ${style.bg} p-3`} dir="rtl">
      <div className="flex items-center justify-between">
        {/* ★ بخش اول: نام و سطح پلن */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${style.badge}`}>
            <TierIcon className={`w-5 h-5 ${style.icon}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900">پلن {plan.label}</span>
              <Badge className={`text-[9px] px-1.5 py-0 h-4 ${plan.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {plan.isPaid ? 'پولی' : 'رایگان'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
              <Database className="w-3 h-3" />
              <span>{plan.isIsolated ? 'بانک اختصاصی' : 'بانک اشتراکی'}</span>
            </div>
          </div>
        </div>

        {/* ★ بخش دوم: دکمه ارتقا */}
        {nextPlan && onUpgrade && (
          <Button
            size="sm"
            className="gap-1.5 h-8 text-xs bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
            onClick={onUpgrade}
          >
            <Crown className="w-3.5 h-3.5" />
            ارتقا به {PLANS[nextPlan].label}
          </Button>
        )}
      </div>

      {/* ★ بخش سوم: قابلیت‌های قفل‌شده */}
      {showLockedFeatures && lockedFeatures.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200/60">
          <div className="flex items-center gap-1.5 mb-2">
            <Lock className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-medium text-amber-600">
              قابلیت‌های قفل‌شده ({lockedFeatures.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lockedFeatures.slice(0, 6).map((feat) => (
              <div
                key={feat.key}
                className="flex items-center gap-1 text-[10px] text-gray-500 bg-white/60 rounded px-1.5 py-0.5 border border-gray-200/50"
              >
                <Lock className="w-2.5 h-2.5 text-amber-400" />
                {feat.label}
              </div>
            ))}
            {lockedFeatures.length > 6 && (
              <div className="text-[10px] text-gray-400 px-1.5 py-0.5">
                +{lockedFeatures.length - 6} مورد دیگر
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  LockedFeatureGate — قفل روی قابلیت خاص با نمایش واضح
// ═══════════════════════════════════════════════════════════════

interface LockedFeatureGateProps {
  /** آیا کاربر دسترسی داره؟ */
  hasAccess: boolean
  /** نام قابلیت فارسی */
  featureLabel: string
  /** آیکون قابلیت */
  icon?: React.ReactNode
  /** پیام ارتقا */
  upgradeMessage?: string
  /** تابع ناوبری */
  onUpgrade?: () => void
  /** محتوای فرزند — فقط اگه دسترسی داشته باشه نشون داده میشه */
  children: React.ReactNode
}

export function LockedFeatureGate({
  hasAccess,
  featureLabel,
  icon,
  upgradeMessage,
  onUpgrade,
  children,
}: LockedFeatureGateProps) {
  if (hasAccess) return <>{children}</>

  return (
    <div className="relative rounded-lg border-2 border-dashed border-amber-200 bg-amber-50/30 p-4" dir="rtl">
      {/* ★ اورلی قفل */}
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-3">
          {icon || <Lock className="w-7 h-7 text-amber-500" />}
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-1">{featureLabel}</h3>
        <p className="text-xs text-gray-500 mb-3 max-w-xs">
          {upgradeMessage || 'این قابلیت در پلن بالاتر در دسترس است'}
        </p>
        {onUpgrade && (
          <Button
            size="sm"
            className="gap-1.5 h-8 text-xs bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            onClick={onUpgrade}
          >
            <Crown className="w-3.5 h-3.5" />
            ارتقا پلن
          </Button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Helper — لیست قابلیت‌های قفل‌شده
// ═══════════════════════════════════════════════════════════════

function getLockedFeatures(tier: 'basic' | 'professional' | 'enterprise'): { key: string; label: string }[] {
  const ALL_FEATURES: Record<string, { label: string; tiers: ('basic' | 'professional' | 'enterprise')[] }> = {
    canCardTerminal: { label: 'کارتخوان', tiers: ['professional', 'enterprise'] },
    canCreditSale: { label: 'فروش نسیه', tiers: ['professional', 'enterprise'] },
    canInstallment: { label: 'فروش قسطی', tiers: ['professional', 'enterprise'] },
    canEditTax: { label: 'ویرایش مالیات', tiers: ['professional', 'enterprise'] },
    canDeleteInvoice: { label: 'حذف فاکتور', tiers: ['professional', 'enterprise'] },
    canChartOfAccounts: { label: 'چارت حساب‌ها', tiers: ['professional', 'enterprise'] },
    canManualJournal: { label: 'سند دستی', tiers: ['professional', 'enterprise'] },
    canTrialBalance: { label: 'تراز آزمایشی', tiers: ['professional', 'enterprise'] },
    canGeneralLedger: { label: 'دفتر کل', tiers: ['professional', 'enterprise'] },
    canJournalBook: { label: 'دفتر روزنامه', tiers: ['professional', 'enterprise'] },
    canInstallments: { label: 'مدیریت اقساط', tiers: ['professional', 'enterprise'] },
    canMultiBranch: { label: 'حسابداری شعب', tiers: ['enterprise'] },
    canConsolidated: { label: 'گزارش‌های تلفیقی', tiers: ['enterprise'] },
    canCloseFiscal: { label: 'بستن سال مالی', tiers: ['enterprise'] },
    canMoidian: { label: 'اتصال سامانه مودیان', tiers: ['enterprise'] },
    canMultiRegister: { label: 'چند صندوق', tiers: ['enterprise'] },
  }

  return Object.entries(ALL_FEATURES)
    .filter(([, info]) => !info.tiers.includes(tier))
    .map(([key, info]) => ({ key, label: info.label }))
}

// ═══════════════════════════════════════════════════════════════
//  TabLock — قفل روی تب با نمایش نام تب + آیکون قفل
// ═══════════════════════════════════════════════════════════════

interface TabLockProps {
  featureLabel: string
  onUpgrade?: () => void
}

export function TabLock({ featureLabel, onUpgrade }: TabLockProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" dir="rtl">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-amber-500" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{featureLabel}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        این قابلیت در پلن بالاتر در دسترس است
      </p>
      {onUpgrade && (
        <Button
          className="gap-2 bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
          onClick={onUpgrade}
        >
          <Crown className="h-4 w-4" />
          ارتقا پلن
        </Button>
      )}
    </div>
  )
}
