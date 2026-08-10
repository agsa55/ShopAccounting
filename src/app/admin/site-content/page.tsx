'use client'

// ============================================================================
// src/app/admin/site-content/page.tsx
// مدیریت پلن‌ها و قیمت‌ها — با Accordion + نمایش محدودیت‌های واقعی
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Save, RefreshCw, Crown, Zap, Building2, Percent, Plus,
  Trash2, Check, AlertCircle, CheckCircle2, RotateCcw,
  ChevronDown, ChevronUp, Wallet, Sparkles, Settings,
  TrendingUp, DollarSign, Eye, Users, Package, FileText,
  Warehouse, CreditCard, Receipt, BookOpen, BarChart3,
  Building, ShieldCheck, Calculator, Network, Printer,
  Edit, X as XIcon, Info
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
//  Component: نمایش محدودیت‌های واقعی پلن (Read-only)
// ═══════════════════════════════════════════════════════════════
function PlanRealLimitsDisplay({ planName }: { planName: string }) {
  const [expanded, setExpanded] = useState(false)
  
  // دریافت اطلاعات واقعی از plan-features.ts
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

  // دسته‌بندی قابلیت‌ها
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
      {/* دکمه باز/بسته کردن */}
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

      {/* محتوای قابل گسترش */}
      {expanded && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
          
          {/* محدودیت‌های کمی */}
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
      <span className="text-[10px] text-gray-500">فاکتور</span>  {/* ★ تغییر: حذف "/ماه" */}
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

          {/* روش‌های پرداخت */}
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

          {/* قابلیت‌های سیستم */}
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

          {/* توضیحات پلن */}
          <div className="bg-gradient-to-l from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-4">
            <h6 className="text-xs font-black text-gray-800 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-violet-600" />
              توضیحات پلن
            </h6>
            <p className="text-[11px] text-gray-700 leading-relaxed">
              {planInfo.description}
            </p>
          </div>

          {/* هشدار */}
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
              <p className="text-[11px] text-gray-500 mt-0.5">ویرایش قیمت‌ها، تخفیف‌ها و ویژگی‌های پلن‌ها</p>
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
              const discountedPrice = plan.discountPercent > 0
                ? Math.round(plan.annualPrice * (1 - plan.discountPercent / 100))
                : plan.annualPrice

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
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="text-base font-black text-gray-900">{plan.nameFa}</h4>
                        {plan.popular && (
                          <span className="px-1.5 py-0.5 bg-gradient-to-l from-amber-400 to-orange-500 text-white text-[9px] font-black rounded-md shadow-sm">
                            محبوب
                          </span>
                        )}
                        {plan.discountPercent > 0 && (
                          <span className="px-1.5 py-0.5 bg-gradient-to-l from-red-500 to-rose-600 text-white text-[9px] font-black rounded-md shadow-sm flex items-center gap-0.5">
                            <Percent className="w-2 h-2" />
                            {toFaNum(plan.discountPercent)}٪ تخفیف
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {plan.discountPercent > 0 ? (
                          <>
                            <span className="text-xs text-gray-400 line-through">
                              {formatPrice(plan.annualPrice)}
                            </span>
                            <span className={`text-sm font-black ${style.text}`}>
                              {formatPrice(discountedPrice)}
                            </span>
                          </>
                        ) : (
                          <span className={`text-sm font-black ${style.text}`}>
                            {formatPrice(plan.annualPrice)}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">تومان / سال</span>
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

                        {/* قیمت‌ها */}
                        <div className="bg-gradient-to-l from-slate-50 to-white rounded-xl border border-gray-200 p-4 space-y-3">
                          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                            <DollarSign className="w-4 h-4 text-emerald-600" />
                            <h5 className="text-xs font-black text-gray-800">قیمت‌گذاری</h5>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                                <span>قیمت سالانه</span>
                                <span className="text-[9px] text-gray-400 font-normal">تومان</span>
                              </label>
                              <input
                                type="number"
                                value={plan.annualPrice}
                                onChange={e => updatePlan(plan.id, 'annualPrice', Number(e.target.value))}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                                <span>مادام‌العمر</span>
                                <span className="text-[9px] text-gray-400 font-normal">تومان</span>
                              </label>
                              <input
                                type="number"
                                value={plan.lifetimePrice}
                                onChange={e => updatePlan(plan.id, 'lifetimePrice', Number(e.target.value))}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                                <span>درصد تخفیف</span>
                                <span className="text-[9px] text-gray-400 font-normal">فقط سالانه</span>
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={plan.discountPercent}
                                  onChange={e => updatePlan(plan.id, 'discountPercent', Math.max(0, Math.min(100, Number(e.target.value))))}
                                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white pl-10 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition"
                                />
                                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              </div>
                            </div>
                          </div>

                          <div className="bg-gradient-to-l from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <p className="text-[10px] text-emerald-700 font-bold">پیش‌نمایش قیمت سالانه:</p>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-xs">
                              {plan.discountPercent > 0 ? (
                                <>
                                  <span className="line-through text-gray-400 text-sm">
                                    {formatPrice(plan.annualPrice)}
                                  </span>
                                  <span className="font-black text-emerald-700 text-lg">
                                    {formatPrice(discountedPrice)}
                                  </span>
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-[10px] font-black flex items-center gap-0.5">
                                    <Percent className="w-2.5 h-2.5" />
                                    {toFaNum(plan.discountPercent)}٪ تخفیف
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-black text-gray-800 text-lg">{formatPrice(plan.annualPrice)}</span>
                                  <span className="text-gray-500">تومان / سال</span>
                                  <span className="text-[10px] text-gray-400">(بدون تخفیف)</span>
                                </>
                              )}
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

                        {/* ویژگی‌ها */}
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
                          <div className="space-y-1.5">
                            {plan.features.map((feat, i) => (
                              <div key={i} className="flex items-center gap-2 group">
                                <div className={`w-5 h-5 rounded-full ${style.bg} flex items-center justify-center shrink-0`}>
                                  <CheckCircle2 className={`w-3 h-3 ${style.text}`} />
                                </div>
                                <input
                                  value={feat}
                                  onChange={e => updateFeature(plan.id, i, e.target.value)}
                                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-violet-500 outline-none bg-white group-hover:border-gray-300 transition"
                                />
                                <button
                                  onClick={() => deleteFeature(plan.id, i)}
                                  className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ═══════════════════ بخش جدید: نمایش محدودیت‌های واقعی ═══════════════════ */}
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