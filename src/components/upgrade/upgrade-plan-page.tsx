'use client'

// ============================================================================
// src/components/upgrade/upgrade-plan-page.tsx (v9.7 ★★★)
// ShopAccounting — صفحه ارتقای پلن (با دکمه تمدید)
// ============================================================================

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { PLANS, resolvePlan, type PlanName, type PlanTier } from '@/lib/plan-features'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CheckCircle2, Lock, Crown, ChevronLeft, Shield, Zap, Building2,
  Database, Users, ShoppingCart, FileText, BarChart3, Star, RefreshCw,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
//  استایل هر پلن
// ═══════════════════════════════════════════════════════════════

const PLAN_STYLES: Record<PlanName, {
  gradient: string
  border: string
  badge: string
  icon: React.ElementType
  iconBg: string
  buttonClass: string
  featured?: boolean
}> = {
  simple: {
    gradient: 'from-emerald-50 to-white',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: Shield,
    iconBg: 'bg-emerald-100',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  professional: {
    gradient: 'from-blue-50 to-white',
    border: 'border-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    icon: Zap,
    iconBg: 'bg-blue-100',
    buttonClass: 'bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white',
    featured: true,
  },
  enterprise: {
    gradient: 'from-purple-50 to-white',
    border: 'border-purple-300',
    badge: 'bg-purple-100 text-purple-700',
    icon: Building2,
    iconBg: 'bg-purple-100',
    buttonClass: 'bg-gradient-to-l from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white',
  },
}

// ═══════════════════════════════════════════════════════════════
//  قابلیت‌های هر پلن
// ═══════════════════════════════════════════════════════════════

const FEATURE_MATRIX: { key: string; label: string; tiers: PlanTier[] }[] = [
  { key: 'cash', label: 'فروش نقدی', tiers: ['basic', 'professional', 'enterprise'] as PlanTier[] },
  { key: 'card', label: 'کارتخوان', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'credit', label: 'فروش نسیه', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'installment', label: 'فروش قسطی', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'edit_tax', label: 'ویرایش مالیات', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'delete_invoice', label: 'حذف فاکتور', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'print', label: 'چاپ فاکتور', tiers: ['basic', 'professional', 'enterprise'] as PlanTier[] },
  { key: 'simple_report', label: 'گزارش ساده', tiers: ['basic', 'professional', 'enterprise'] as PlanTier[] },
  { key: 'journals', label: 'مشاهده اسناد', tiers: ['basic', 'professional', 'enterprise'] as PlanTier[] },
  { key: 'chart', label: 'چارت حساب‌ها', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'manual_journal', label: 'سند دستی', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'trial_balance', label: 'تراز آزمایشی', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'installments', label: 'مدیریت اقساط', tiers: ['professional', 'enterprise'] as PlanTier[] },
  { key: 'multi_branch', label: 'حسابداری شعب', tiers: ['enterprise'] as PlanTier[] },
  { key: 'consolidated', label: 'گزارش‌های تلفیقی', tiers: ['enterprise'] as PlanTier[] },
  { key: 'close_fiscal', label: 'بستن سال مالی', tiers: ['enterprise'] as PlanTier[] },
  { key: 'moidian', label: 'اتصال سامانه مودیان', tiers: ['enterprise'] as PlanTier[] },
  { key: 'multi_register', label: 'مدیریت چند صندوق', tiers: ['enterprise'] as PlanTier[] },
]

// ═══════════════════════════════════════════════════════════════
//  Page Component
// ═══════════════════════════════════════════════════════════════

export default function UpgradePlanPage() {
  const planName = useStore((s) => s.planName)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const storeName = useStore((s) => s.storeName)

  // ★ State برای وضعیت اشتراک
  const [subscription, setSubscription] = useState<any>(null)

  // ★ بارگذاری وضعیت اشتراک
  useEffect(() => {
    async function fetchSub() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) return
        const res = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success) setSubscription(data.data)
      } catch (err) {
        console.error('Error fetching subscription:', err)
      }
    }
    fetchSub()
  }, [])

  const currentPlan = resolvePlan(planName)
  const currentPlanName = currentPlan.planName

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentView('dashboard')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Crown className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-bold">ارتقای پلن</h1>
        </div>
        <Badge className={`text-xs ${PLAN_STYLES[currentPlanName].badge}`}>
          پلن فعلی: {currentPlan.label}
        </Badge>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* ─── عنوان ──────────────────────────────────────── */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">
            پلن مناسب کسب‌وکار خود را انتخاب کنید
          </h2>
          <p className="text-sm text-gray-500">
            {storeName || 'فروشگاه شما'} — هر پلن قابلیت‌های مخصوص به خود را دارد
          </p>
        </div>

        {/* ─── کارت‌های پلن ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(PLANS) as PlanName[]).map((planKey) => {
            const plan = PLANS[planKey]
            const style = PLAN_STYLES[planKey]
            const Icon = style.icon
            const isCurrent = planKey === currentPlanName

            const canUpgrade = !isCurrent && (
              (currentPlanName === 'simple' && (planKey === 'professional' || planKey === 'enterprise')) ||
              (currentPlanName === 'professional' && planKey === 'enterprise')
            )

            return (
              <Card
                key={planKey}
                className={`relative overflow-hidden transition-all hover:shadow-md ${style.border} ${style.featured ? 'ring-2 ring-blue-400' : ''} ${isCurrent ? 'ring-2 ring-emerald-400' : ''}`}
              >
                {/* برچسب پلن فعلی */}
                {isCurrent && (
                  <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    پلن فعلی شما
                  </div>
                )}

                {/* برچسب پیشنهادی */}
                {style.featured && !isCurrent && (
                  <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    پیشنهادی
                  </div>
                )}

                <CardContent className={`p-5 ${isCurrent || style.featured ? 'pt-8' : ''}`}>
                  {/* آیکون و نام */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg}`}>
                      <Icon className={`w-6 h-6 ${style.iconBg.replace('bg-', 'text-').replace('100', '600')}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{plan.label}</h3>
                      <p className="text-[10px] text-gray-500">{plan.labelEn}</p>
                    </div>
                  </div>

                  {/* قیمت */}
                  <div className="mb-4 space-y-1.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{plan.annualPrice.toLocaleString('fa-IR')}</span>
                      <span className="text-xs text-gray-500">تومان/سالانه</span>
                    </div>
                    {plan.lifetimePrice && plan.lifetimePrice > 0 && (
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-medium text-gray-600">{plan.lifetimePrice.toLocaleString('fa-IR')}</span>
                        <span className="text-[10px] text-gray-400">تومان/مادام‌العمر</span>
                      </div>
                    )}
                  </div>

                  {/* توضیحات */}
                  <p className="text-xs text-gray-600 leading-relaxed mb-4">
                    {plan.description}
                  </p>

                  {/* محدودیت‌ها */}
                  <div className="space-y-1.5 mb-5">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Database className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500">بانک اشتراکی</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Users className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500">
                        {plan.maxUsers === 0 ? 'کاربر نامحدود' : `تا ${plan.maxUsers.toLocaleString('fa-IR')} کاربر`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <ShoppingCart className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500">
                        {plan.maxProducts === 0 ? 'محصول نامحدود' : `تا ${plan.maxProducts.toLocaleString('fa-IR')} محصول`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <FileText className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500">
                        {plan.maxInvoicesPerMonth === 0 ? 'فاکتور نامحدود' : `تا ${plan.maxInvoicesPerMonth.toLocaleString('fa-IR')} فاکتور/ماه`}
                      </span>
                    </div>
                  </div>

                  {/* ★ دکمه‌ها */}
                  {isCurrent ? (
                    <div className="space-y-2">
                      <Button className="w-full gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 cursor-default" disabled>
                        <CheckCircle2 className="w-4 h-4" />
                        پلن فعلی
                      </Button>
                      {subscription?.isExpired && (
                        <Button
                          className="w-full gap-2 bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                          onClick={() => typeof window !== 'undefined' && (window.location.href = '/renewal')}
                        >
                          <RefreshCw className="w-4 h-4" />
                          تمدید اشتراک
                        </Button>
                      )}
                    </div>
                  ) : canUpgrade ? (
                    <Button className={`w-full gap-2 ${style.buttonClass}`}>
                      <Crown className="w-4 h-4" />
                      ارتقا به {plan.label}
                    </Button>
                  ) : (
                    <Button className="w-full gap-2" variant="outline" disabled>
                      <Lock className="w-4 h-4" />
                      ناموجود
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* ─── جدول مقایسه قابلیت‌ها ──────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              مقایسه قابلیت‌ها
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-right px-4 py-2.5 font-medium text-gray-700 w-[200px] sticky right-0 bg-gray-50 z-10">قابلیت</th>
                    <th className="text-center px-3 py-2.5 font-medium text-emerald-600 min-w-[100px]">پایه</th>
                    <th className="text-center px-3 py-2.5 font-medium text-blue-600 bg-blue-50/50 min-w-[100px]">پیشرفته</th>
                    <th className="text-center px-3 py-2.5 font-medium text-purple-600 min-w-[100px]">حرفه‌ای</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_MATRIX.map((feat, idx) => {
                    const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    return (
                      <tr key={feat.key} className={`border-b border-gray-100 ${rowBg}`}>
                        <td className="px-4 py-2 text-gray-700 text-xs sticky right-0 bg-inherit z-10 font-medium">{feat.label}</td>
                        <td className="text-center px-3 py-2">
                          {feat.tiers.includes('basic' as PlanTier) ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="text-center px-3 py-2 bg-blue-50/30">
                          {feat.tiers.includes('professional' as PlanTier) ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="text-center px-3 py-2">
                          {feat.tiers.includes('enterprise' as PlanTier) ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-gray-300 mx-auto" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ─── توضیح ساختار ───────────────────────────────── */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Star className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-bold text-blue-700">نکته مهم</span>
          </div>
          <p className="text-xs text-blue-600 leading-relaxed max-w-lg mx-auto">
            پلن پایه برای فروشگاه‌های کوچک و تازه‌کار عالی است. برای حسابداری دوطرفه کامل، مدیریت انبار پیشرفته و اتصال به سامانه مودیان، به پلن پیشرفته یا حرفه‌ای ارتقا دهید.
          </p>
        </div>
      </div>
    </div>
  )
}