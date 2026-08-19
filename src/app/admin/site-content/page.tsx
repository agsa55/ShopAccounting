'use client'

// ============================================================================
// src/app/admin/site-content/page.tsx
// مدیریت پلن‌ها و قیمت‌ها — با Accordion + نمایش محدودیت‌های واقعی
// ★ v8.0: فقط قیمت مادام‌العمر (حذف قیمت سالانه و تخفیف)
// ★ v7.2: Modern Toggle Switch برای نمایش قیمت
// ★ v7.0: جابجایی ویژگی‌ها (↑↓)
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Save, RefreshCw, Crown, Zap, Building2, Percent, Plus,
  Trash2, Check, AlertCircle, CheckCircle2, RotateCcw,
  ChevronDown, ChevronUp, Wallet, Sparkles, Settings,
  TrendingUp, DollarSign, Eye, Users, Package, FileText,
  Warehouse, CreditCard, Receipt, BookOpen, BarChart3,
  Building, ShieldCheck, Calculator, Network, Printer,
  Edit, X as XIcon, Info, ArrowUp, ArrowDown, EyeOff,
  ToggleLeft, ToggleRight, GripVertical, Infinity as InfinityIcon
} from 'lucide-react'
import { useAdminSiteContent, DEFAULT_SITE_CONTENT, type SiteContent, type PlanTierData } from '@/lib/site-content'
import { PLANS, getPlanFeatures, resolvePlanTier, type PlanFeatureSet } from '@/lib/plan-features'

const formatPrice = (n: number) => new Intl.NumberFormat('fa-IR').format(n)
const toFaNum = (n: number | string) => String(n || 0).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])

// ═══════════════════════════════════════════════════════════════
//  رنگ‌های هر پلن
// ═══════════════════════════════════════════════════════════════
const PLAN_STYLES = {
  simple: {
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
    iconBg: 'bg-gradient-to-br from-blue-500 to-cyan-500',
    Icon: Zap,
  },
  professional: {
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-500',
    Icon: Crown,
  },
  enterprise: {
    gradient: 'from-purple-500 to-fuchsia-500',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    ring: 'ring-purple-200',
    iconBg: 'bg-gradient-to-br from-purple-500 to-fuchsia-500',
    Icon: Building2,
  },
}

function getPlanStyle(name: string) {
  return PLAN_STYLES[name as keyof typeof PLAN_STYLES] || PLAN_STYLES.simple
}

// ═══════════════════════════════════════════════════════════════
//  Helper: دسترسی ایمن به showPrice
// ═══════════════════════════════════════════════════════════════
const getShowPrice = (plan: PlanTierData): boolean => {
  return (plan as any).showPrice || false
}

const setShowPrice = (plan: PlanTierData, value: boolean): PlanTierData => {
  return { ...plan, showPrice: value } as PlanTierData
}

// ═══════════════════════════════════════════════════════════════
//  ★ v7.3: Modern Toggle Switch - اصلاح شده برای RTL
// ═══════════════════════════════════════════════════════════════
function ModernToggle({
  checked,
  onChange,
  activeIcon: ActiveIcon = Eye,
  inactiveIcon: InactiveIcon = EyeOff,
  activeColor = 'from-indigo-500 to-blue-500',
  activeLabel = 'فعال',
  inactiveLabel = 'غیرفعال',
}: {
  checked: boolean
  onChange: () => void
  activeIcon?: React.ComponentType<{ className?: string }>
  inactiveIcon?: React.ComponentType<{ className?: string }>
  activeColor?: string
  activeLabel?: string
  inactiveLabel?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onChange}
        className={`
          relative inline-flex items-center rounded-full
          transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          focus:outline-none focus:ring-2 focus:ring-offset-2
          shrink-0 cursor-pointer
          ${checked
            ? `bg-gradient-to-r ${activeColor} focus:ring-indigo-500 shadow-lg shadow-indigo-500/40`
            : 'bg-gray-300 focus:ring-gray-400 shadow-inner'
          }
        `}
        style={{ width: '60px', height: '32px' }}
        aria-pressed={checked}
      >
        <span className="absolute inset-0 flex items-center justify-between px-2.5 pointer-events-none">
          <span className={`transition-opacity duration-300 ${checked ? 'opacity-100' : 'opacity-0'}`}>
            <ActiveIcon className="w-3 h-3 text-white/70" />
          </span>
          <span className={`transition-opacity duration-300 ${!checked ? 'opacity-100' : 'opacity-0'}`}>
            <InactiveIcon className="w-3 h-3 text-gray-500" />
          </span>
        </span>

        <span
          className={`
            absolute top-1/2 -translate-y-1/2
            inline-flex items-center justify-center
            rounded-full bg-white
            transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
            shadow-lg
            ${checked ? 'right-[3px]' : 'left-[3px]'}
          `}
          style={{ width: '26px', height: '26px' }}
        >
          {checked ? (
            <ActiveIcon className="w-3.5 h-3.5 text-indigo-600" />
          ) : (
            <InactiveIcon className="w-3.5 h-3.5 text-gray-400" />
          )}
        </span>
      </button>

      <span
        className={`
          text-[11px] font-black transition-all duration-300
          ${checked ? 'text-indigo-700' : 'text-gray-500'}
        `}
      >
        {checked ? activeLabel : inactiveLabel}
      </span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Component: نمایش محدودیت‌های واقعی پلن (Read-only)
// ═══════════════════════════════════════════════════════════════
function PlanRealLimitsDisplay({ planName }: { planName: string }) {
  const [expanded, setExpanded] = useState(false)

  const planInfo = PLANS[planName as keyof typeof PLANS]
  const tier = resolvePlanTier(planName)
  const features = getPlanFeatures(tier)
  const style = getPlanStyle(planName)

  if (!planInfo || !features) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <AlertCircle className="w-4 h-4 inline-block ml-2" />
        اطلاعات پلن یافت نشد
      </div>
    )
  }

  const capabilityGroups = [
    {
      title: 'فروش و فاکتور',
      icon: Receipt,
      items: [
        { label: 'ویرایش مالیات', value: features.canEditTax },
        { label: 'حذف فاکتور', value: features.canDeleteInvoice },
        { label: 'چاپ فاکتور', value: features.canPrintInvoice },
        { label: 'درگاه پرداخت آنلاین', value: features.canOnlinePayment },
      ]
    },
    {
      title: 'حسابداری',
      icon: BookOpen,
      items: [
        { label: 'گزارش ساده درآمد/هزینه', value: features.canViewSimpleReport },
        { label: 'مشاهده اسناد حسابداری', value: features.canViewJournals },
        { label: 'چارت حساب‌ها', value: features.canViewAccounts },
        { label: 'ایجاد سند دستی', value: features.canCreateJournal },
        { label: 'ایجاد حساب جدید', value: features.canCreateAccount },
        { label: 'تراز آزمایشی', value: features.canTrialBalance },
        { label: 'دفتر کل', value: features.canGeneralLedger },
        { label: 'دفتر روزنامه', value: features.canJournalBook },
      ]
    },
    {
      title: 'فروش اعتباری',
      icon: CreditCard,
      items: [
        { label: 'مدیریت اقساط', value: features.canAccessInstallments },
        { label: 'فروش نسیه', value: features.canAccessCredit },
      ]
    },
    {
      title: 'انبارداری',
      icon: Warehouse,
      items: [
        { label: 'فاکتور خرید و تامین‌کنندگان', value: features.canPurchaseInvoice },
        { label: 'چند انباری', value: features.canMultiWarehouse },
        { label: 'انتقال بین انبارها', value: features.canStockTransfer },
        { label: 'انبارگردانی', value: features.canStockCount },
      ]
    },
    {
      title: 'پیشرفته',
      icon: ShieldCheck,
      items: [
        { label: 'حسابداری شعب', value: features.canMultiBranch },
        { label: 'گزارش‌های تلفیقی', value: features.canConsolidatedReports },
        { label: 'بستن سال مالی', value: features.canCloseFiscalYear },
        { label: 'مدیریت سال مالی', value: features.canFiscalYearManagement },
        { label: 'اتصال سامانه مودیان', value: features.canMoidianIntegration },
        { label: 'چند صندوق فروش', value: features.canMultiCashRegister },
      ]
    },
  ]

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
          expanded
            ? `${style.bg} ${style.border}`
            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <Info className={`w-4 h-4 ${expanded ? style.text : 'text-gray-500'}`} />
          <span className="text-xs font-bold text-gray-800">
            مشاهده محدودیت‌های واقعی پلن (از فایل plan-features.ts)
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[10px] text-gray-500">کاربران</span>
              </div>
              <p className="text-sm font-black text-gray-900">
                {planInfo.maxUsers === 0 ? '♾️ نامحدود' : toFaNum(planInfo.maxUsers)}
              </p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[10px] text-gray-500">محصولات</span>
              </div>
              <p className="text-sm font-black text-gray-900">
                {planInfo.maxProducts === 0 ? '♾️ نامحدود' : toFaNum(planInfo.maxProducts)}
              </p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-[10px] text-gray-500">فاکتور</span>
              </div>
              <p className="text-sm font-black text-gray-900">
                {planInfo.maxInvoicesPerMonth === 0 ? '♾️ نامحدود' : toFaNum(planInfo.maxInvoicesPerMonth)}
              </p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <Warehouse className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[10px] text-gray-500">انبارها</span>
              </div>
              <p className="text-sm font-black text-gray-900">
                {features.maxWarehouses === 0 ? '♾️ نامحدود' : toFaNum(features.maxWarehouses)}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-l from-slate-50 to-white rounded-xl border border-gray-200 p-4">
            <h6 className="text-xs font-black text-gray-800 mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              روش‌های پرداخت مجاز
            </h6>
            <div className="flex flex-wrap gap-2">
              {features.posPaymentTypes.map((type) => (
                <span
                  key={type}
                  className={`px-2.5 py-1 ${style.bg} ${style.text} rounded-lg text-[11px] font-bold`}
                >
                  {type === 'cash' && '💵 نقدی'}
                  {type === 'card' && '💳 کارتی'}
                  {type === 'credit' && '📝 نسیه'}
                  {type === 'installment' && '📊 اقساطی'}
                  {type === 'check' && '📄 چک'}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h6 className="text-xs font-black text-gray-800 flex items-center gap-2">
              <Settings className="w-4 h-4 text-violet-600" />
              قابلیت‌های سیستم
            </h6>

            {capabilityGroups.map((group, idx) => {
              const GroupIcon = group.icon
              return (
                <div
                  key={idx}
                  className="bg-white rounded-xl border border-gray-200 p-4 space-y-2"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg ${style.bg} flex items-center justify-center`}>
                      <GroupIcon className={`w-4 h-4 ${style.text}`} />
                    </div>
                    <h6 className="text-[11px] font-black text-gray-800">{group.title}</h6>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {group.items.map((item, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 p-2 rounded-lg ${
                          item.value ? 'bg-emerald-50' : 'bg-red-50'
                        }`}
                      >
                        {item.value ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XIcon className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="text-[11px] text-gray-700">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-gradient-to-l from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-4">
            <h6 className="text-xs font-black text-gray-800 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-violet-600" />
              توضیحات پلن
            </h6>
            <p className="text-[11px] text-gray-700 leading-relaxed">
              {planInfo.description}
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[10px] text-amber-800 leading-relaxed">
                <p className="font-bold mb-1">توجه:</p>
                <p>
                  این اطلاعات از فایل <code className="bg-amber-100 px-1 rounded">src/lib/plan-features.ts</code> خوانده شده‌اند و
                  فقط برای <strong>نمایش</strong> هستند. برای تغییر محدودیت‌های واقعی، باید فایل مذکور را ویرایش کنید.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminSiteContentPage() {
  const { content, setContent, loading, saving, error, saveContent } = useAdminSiteContent()
  const [showSuccess, setShowSuccess] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const [expandedPlans, setExpandedPlans] = useState<string[]>([])

  const togglePlan = (planId: string) => {
    setExpandedPlans(prev =>
      prev.includes(planId)
        ? prev.filter(id => id !== planId)
        : [...prev, planId]
    )
  }

  const expandAll = () => {
    setExpandedPlans(content.plans.map(p => p.id))
  }

  const collapseAll = () => {
    setExpandedPlans([])
  }

  const updatePlans = (plans: PlanTierData[]) => {
    setContent({ ...content, plans })
    setHasChanges(true)
  }

  const updatePlan = (id: string, field: keyof PlanTierData, value: any) => {
    updatePlans(content.plans.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const addFeature = (planId: string) => {
    const plan = content.plans.find(p => p.id === planId)
    if (!plan) return
    updatePlan(planId, 'features', [...plan.features, 'ویژگی جدید'])
  }

  const updateFeature = (planId: string, idx: number, value: string) => {
    const plan = content.plans.find(p => p.id === planId)
    if (!plan) return
    const features = [...plan.features]
    features[idx] = value
    updatePlan(planId, 'features', features)
  }

  const deleteFeature = (planId: string, idx: number) => {
    const plan = content.plans.find(p => p.id === planId)
    if (!plan) return
    updatePlan(planId, 'features', plan.features.filter((_, i) => i !== idx))
  }

  // ═══════════════════════════════════════════════════════════
  // ★ v7.0: جابجایی ویژگی‌ها به بالا و پایین
  // ═══════════════════════════════════════════════════════════
  const moveFeatureUp = (planId: string, idx: number) => {
    if (idx === 0) return
    const plan = content.plans.find(p => p.id === planId)
    if (!plan) return
    const features = [...plan.features]
    ;[features[idx - 1], features[idx]] = [features[idx], features[idx - 1]]
    updatePlan(planId, 'features', features)
  }

  const moveFeatureDown = (planId: string, idx: number) => {
    const plan = content.plans.find(p => p.id === planId)
    if (!plan || idx === plan.features.length - 1) return
    const features = [...plan.features]
    ;[features[idx], features[idx + 1]] = [features[idx + 1], features[idx]]
    updatePlan(planId, 'features', features)
  }

  // ═══════════════════════════════════════════════════════════
  // ★ v7.1: تغییر وضعیت نمایش قیمت
  // ═══════════════════════════════════════════════════════════
  const toggleShowPrice = (planId: string) => {
    const plan = content.plans.find(p => p.id === planId)
    if (!plan) return
    const currentShowPrice = getShowPrice(plan)
    const updatedPlan = setShowPrice(plan, !currentShowPrice)
    updatePlans(content.plans.map(p => p.id === planId ? updatedPlan : p))
  }

  const handleSave = async () => {
    const ok = await saveContent(content)
    if (ok) {
      setShowSuccess(true)
      setHasChanges(false)
      setTimeout(() => setShowSuccess(false), 3000)
    }
  }

  const handleReset = () => {
    if (confirm('بازگردانی به مقادیر پیش‌فرض؟')) {
      setContent(DEFAULT_SITE_CONTENT)
      setHasChanges(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">در حال بارگذاری محتوا...</p>
        </div>
      </div>
    )
  }

  const allExpanded = expandedPlans.length === content.plans.length && content.plans.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ═══════════════════ HEADER ═══════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                مدیریت <span className="bg-gradient-to-l from-violet-600 to-purple-600 bg-clip-text text-transparent">پلن‌ها و قیمت‌ها</span>
              </h1>
              <p className="text-[11px] text-gray-500 mt-0.5">ویرایش قیمت مادام‌العمر و ویژگی‌های پلن‌ها</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasChanges && (
              <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                تغییرات ذخیره نشده
              </span>
            )}
            <button onClick={handleReset} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all text-xs font-medium shadow-sm">
              <RotateCcw className="w-3.5 h-3.5" />
              پیش‌فرض
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-violet-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-violet-300 transition-all text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
            </button>
          </div>
        </div>

        {/* ═══════════════════ ALERTS ═══════════════════ */}
        {showSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <p className="text-sm font-bold text-emerald-800">تغییرات با موفقیت ذخیره شد و در لاندینگ پیج اعمال خواهد شد.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm font-bold text-red-800">{error}</p>
          </div>
        )}

        {/* ═══════════════════ PLANS EDITOR ═══════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          <div className="p-5 border-b border-gray-100 bg-gradient-to-l from-slate-50 to-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                <Crown className="w-4.5 h-4.5 text-violet-600" style={{ width: '18px', height: '18px' }} />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">پلن‌های اشتراک</h3>
                <p className="text-[11px] text-gray-500">
                  {toFaNum(content.plans.length)} پلن —
                  <span className="text-violet-600 font-bold mr-1">
                    {toFaNum(expandedPlans.length)} باز
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={allExpanded ? collapseAll : expandAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-[11px] font-bold shadow-sm"
              >
                {allExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    بستن همه
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    باز کردن همه
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {content.plans.map((plan) => {
              const isExpanded = expandedPlans.includes(plan.id)
              const style = getPlanStyle(plan.name)
              const PlanIcon = style.Icon
              const showPrice = getShowPrice(plan)

              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                    isExpanded
                      ? `${style.border} shadow-lg shadow-${style.gradient.split('-')[1]}-100/50`
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  <button
                    onClick={() => togglePlan(plan.id)}
                    className={`w-full p-4 flex items-center gap-3 transition-all ${
                      isExpanded ? `${style.bg}` : 'bg-white hover:bg-gray-50/50'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl ${style.iconBg} flex items-center justify-center shadow-lg shrink-0`}>
                      <PlanIcon className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h4 className="text-base font-black text-gray-900">{plan.nameFa}</h4>
                        {plan.popular && (
                          <span className="px-1.5 py-0.5 bg-gradient-to-l from-amber-400 to-orange-500 text-white text-[9px] font-black rounded-md shadow-sm">
                            محبوب
                          </span>
                        )}
                        {/* ★ v8.0: نشانگر وضعیت نمایش قیمت */}
                        {showPrice ? (
                          <span className="px-1.5 py-0.5 bg-gradient-to-l from-indigo-500 to-blue-500 text-white text-[9px] font-black rounded-md shadow-sm flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" />
                            قیمت فعال
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[9px] font-black rounded-md flex items-center gap-0.5">
                            <EyeOff className="w-2.5 h-2.5" />
                            بدون قیمت
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* ★ v8.0: فقط قیمت مادام‌العمر */}
                        <span className={`text-sm font-black ${style.text} flex items-center gap-1`}>
                          <InfinityIcon className="w-3.5 h-3.5" />
                          {formatPrice(plan.lifetimePrice)}
                        </span>
                        <span className="text-[10px] text-gray-400">تومان / مادام‌العمر</span>
                        <span className="text-gray-300">•</span>
                        <span className="text-[10px] text-gray-500">
                          {toFaNum(plan.features.length)} ویژگی
                        </span>
                      </div>
                    </div>

                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ${
                      isExpanded
                        ? `${style.bg} ${style.text}`
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      <ChevronDown
                        className={`w-5 h-5 transition-transform duration-300 ${
                          isExpanded ? 'rotate-180' : 'rotate-0'
                        }`}
                      />
                    </div>
                  </button>

                  <div
                    className={`grid transition-all duration-500 ease-in-out ${
                      isExpanded
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="p-5 pt-0 space-y-4 border-t border-gray-100">

                        <div className="pt-4">
                          <p className="text-xs text-gray-600 leading-relaxed">{plan.description}</p>
                        </div>

                        {/* ═══════════════════════════════════════════════════
                            ★ v7.2: Toggle نمایش قیمت در لندینگ پیج
                        ═══════════════════════════════════════════════════ */}
                        <div
                          className={`
                            relative rounded-2xl border-2 p-4 transition-all duration-500 overflow-hidden
                            ${showPrice
                              ? 'bg-gradient-to-br from-indigo-50 via-blue-50 to-violet-50 border-indigo-300 shadow-md shadow-indigo-100'
                              : 'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200'
                            }
                          `}
                        >
                          {showPrice && (
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-400/20 rounded-full blur-2xl pointer-events-none" />
                          )}

                          <div className="relative flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div
                                className={`
                                  relative w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                                  transition-all duration-500
                                  ${showPrice
                                    ? 'bg-gradient-to-br from-indigo-500 via-blue-500 to-violet-500 shadow-lg shadow-indigo-300/50'
                                    : 'bg-gray-200 shadow-inner'
                                  }
                                `}
                              >
                                {showPrice ? (
                                  <>
                                    <Eye className="w-5 h-5 text-white relative z-10" />
                                    <span className="absolute inset-0 rounded-xl bg-indigo-400 animate-ping opacity-20" />
                                  </>
                                ) : (
                                  <EyeOff className="w-5 h-5 text-gray-500" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="text-sm font-black text-gray-900">
                                    نمایش قیمت در لندینگ پیج
                                  </span>
                                  <span
                                    className={`
                                      px-2 py-0.5 rounded-md text-[10px] font-black
                                      transition-all duration-300
                                      ${showPrice
                                        ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm'
                                        : 'bg-gray-200 text-gray-600'
                                      }
                                    `}
                                  >
                                    {showPrice ? '🟢 ON' : '⚪ OFF'}
                                  </span>
                                </div>
                                <p className={`text-[11px] leading-relaxed transition-colors duration-300 ${
                                  showPrice ? 'text-indigo-700' : 'text-gray-500'
                                }`}>
                                  {showPrice
                                    ? '💰 قیمت این پلن در صفحه اصلی سایت به کاربران نمایش داده می‌شود.'
                                    : '🔒 قیمت مخفی است و فقط دکمه «شروع رایگان» نمایش داده می‌شود.'}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0">
                              <ModernToggle
                                checked={showPrice}
                                onChange={() => toggleShowPrice(plan.id)}
                                activeLabel="✓ فعال"
                                inactiveLabel="✗ غیرفعال"
                              />
                            </div>
                          </div>

                          <div className={`
                            absolute bottom-0 left-0 right-0 h-1 transition-all duration-500
                            ${showPrice
                              ? 'bg-gradient-to-r from-indigo-500 via-blue-500 to-violet-500 opacity-100'
                              : 'bg-gray-300 opacity-30'
                            }
                          `} />
                        </div>

                        {/* ═══════════════════════════════════════════════════
                            ★ v8.0: قیمت‌گذاری — فقط مادام‌العمر
                        ═══════════════════════════════════════════════════ */}
                     {/* ═══════════════════════════════════════════════════
    ★ v9.0: قیمت‌گذاری — مادام‌العمر + به‌روزرسانی
═══════════════════════════════════════════════════ */}
<div className="bg-gradient-to-l from-slate-50 to-white rounded-xl border border-gray-200 p-4 space-y-3">
  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
    <DollarSign className="w-4 h-4 text-emerald-600" />
    <h5 className="text-xs font-black text-gray-800">قیمت‌گذاری</h5>
    <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-[9px] font-bold flex items-center gap-1">
      <InfinityIcon className="w-3 h-3" />
      فقط مادام‌العمر
    </span>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    {/* قیمت مادام‌العمر */}
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <InfinityIcon className="w-3.5 h-3.5 text-violet-600" />
          قیمت مادام‌العمر
        </span>
        <span className="text-[9px] text-gray-400 font-normal">تومان</span>
      </label>
      <input
        type="number"
        value={plan.lifetimePrice}
        onChange={e => updatePlan(plan.id, 'lifetimePrice', Number(e.target.value))}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition"
        placeholder="مثلاً: 4500000"
      />
      <p className="text-[9px] text-gray-400">💎 قیمت ثبت‌نام اولیه در لندینگ پیج</p>
    </div>

    {/* ★ v9.0: قیمت به‌روزرسانی */}
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
          قیمت به‌روزرسانی
        </span>
        <span className="text-[9px] text-gray-400 font-normal">تومان</span>
      </label>
      <input
        type="number"
        value={(plan as any).updatePrice || 0}
        onChange={e => {
          const newPrice = Number(e.target.value)
          const updatedPlan = { ...plan, updatePrice: newPrice } as PlanTierData
          updatePlans(content.plans.map(p => p.id === plan.id ? updatedPlan : p))
        }}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition"
        placeholder="مثلاً: 900000"
      />
      <p className="text-[9px] text-gray-400">🔄 هزینه تمدید در صفحه به‌روزرسانی</p>
    </div>

    {/* پیش‌نمایش */}
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5 text-emerald-600" />
        پیش‌نمایش
      </label>
      <div className="space-y-1.5">
        {/* پیش‌نمایش قیمت مادام‌العمر */}
        <div className="px-2 py-1.5 bg-gradient-to-l from-violet-50 to-purple-50 border border-violet-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-violet-600 font-bold">مادام‌العمر</span>
            <span className="text-xs font-black text-violet-700">
              {formatPrice(plan.lifetimePrice)}
            </span>
          </div>
        </div>
        {/* پیش‌نمایش قیمت به‌روزرسانی */}
        <div className="px-2 py-1.5 bg-gradient-to-l from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-amber-700 font-bold">به‌روزرسانی</span>
            <span className="text-xs font-black text-amber-700">
              {formatPrice((plan as any).updatePrice || 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* راهنما */}
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
    <div className="flex items-start gap-2">
      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
      <div className="text-[10px] text-blue-800 leading-relaxed">
        <p className="font-bold mb-0.5">💡 تفاوت دو قیمت:</p>
        <p>
          <strong className="text-violet-700">مادام‌العمر:</strong> قیمتی که کاربر در لندینگ پیج هنگام ثبت‌نام اولیه پرداخت می‌کند.
          <br />
          <strong className="text-amber-700">به‌روزرسانی:</strong> هزینه‌ای که کاربر در صفحه «به‌روزرسانی سیستم» برای تمدید پشتیبانی پرداخت می‌کند.
          {showPrice ? ' هر دو قیمت فعال هستند.' : ' قیمت‌ها فعلاً در لندینگ پیج مخفی هستند.'}
        </p>
      </div>
    </div>
  </div>
</div>

                        {/* گزینه محبوب */}
                        <div className="flex items-center gap-3 p-3 bg-gray-50/50 rounded-xl border border-gray-200">
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={plan.popular || false}
                              onChange={e => updatePlan(plan.id, 'popular', e.target.checked)}
                              className="w-4 h-4 text-violet-600 rounded focus:ring-violet-500"
                            />
                            <Sparkles className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-bold text-gray-700">پلن محبوب (نمایش با هایلایت ویژه)</span>
                          </label>
                        </div>

                        {/* ═══════════════════════════════════════════════════
                            ★ v7.0: ویژگی‌ها با قابلیت جابجایی ↑↓
                        ═══════════════════════════════════════════════════ */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <h5 className="text-xs font-black text-gray-800">ویژگی‌های پلن</h5>
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-bold">
                                {toFaNum(plan.features.length)}
                              </span>
                            </div>
                            <button
                              onClick={() => addFeature(plan.id)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-[11px] font-bold transition"
                            >
                              <Plus className="w-3 h-3" />
                              افزودن
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                            <GripVertical className="w-3 h-3 text-blue-500" />
                            <span className="text-[9px] text-blue-600 font-medium">
                              با دکمه‌های ↑ و ↓ ترتیب ویژگی‌ها را تغییر دهید — ترتیب در لندینگ پیج اعمال می‌شود
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {plan.features.map((feat, i) => (
                              <div key={i} className="flex items-center gap-2 group">
                                <div className={`w-5 h-5 rounded-full ${style.bg} flex items-center justify-center shrink-0`}>
                                  <span className={`text-[9px] font-black ${style.text}`}>{toFaNum(i + 1)}</span>
                                </div>

                                <input
                                  value={feat}
                                  onChange={e => updateFeature(plan.id, i, e.target.value)}
                                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-violet-500 outline-none bg-white group-hover:border-gray-300 transition"
                                />

                                <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => moveFeatureUp(plan.id, i)}
                                    disabled={i === 0}
                                    className="p-1 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded transition disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                    title="جابجایی به بالا"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => moveFeatureDown(plan.id, i)}
                                    disabled={i === plan.features.length - 1}
                                    className="p-1 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded transition disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                    title="جابجایی به پایین"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <button
                                  onClick={() => deleteFeature(plan.id, i)}
                                  className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition opacity-0 group-hover:opacity-100"
                                  title="حذف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <PlanRealLimitsDisplay planName={plan.name} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="text-center text-[9px] text-gray-400 pt-3">
          <p>مدیریت محتوای سایت — نسخه {toFaNum('10.0.0')}</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-in { animation: fade-in 0.2s ease-out; }

        @keyframes slide-in-from-top {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .slide-in-from-top-2 { animation: slide-in-from-top 0.2s ease-out; }
      `}</style>
    </div>
  )
}