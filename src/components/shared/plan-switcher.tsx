'use client'

// ============================================================================
// src/components/shared/plan-switcher.tsx
// ShopAccounting — Debug Widget برای تست سریع پلن‌ها
// ============================================================================
// ★ ویجت شناور در گوشه پایین-راست صفحه
// ★ امکان تعویض سریع پلن بدون نیاز به لاگین مجدد
// ★ نمایش وضعیت فعلی پلن به صورت زنده
// ★ فقط در حالت توسعه (NODE_ENV !== 'production') نمایش داده میشه
// ============================================================================

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { resolvePlan, PLANS, type PlanName } from '@/lib/plan-features'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Crown, Settings2, X, ChevronUp, ChevronDown,
  Shield, Zap, Building2, Database, RefreshCw,
} from 'lucide-react'

const PLAN_ICONS: Record<PlanName, React.ElementType> = {
  free: Shield,
  simple: Shield,
  professional: Zap,
  enterprise: Building2,
}

const PLAN_COLORS: Record<PlanName, string> = {
  free: 'bg-slate-500 hover:bg-slate-600',
  simple: 'bg-emerald-500 hover:bg-emerald-600',
  professional: 'bg-blue-500 hover:bg-blue-600',
  enterprise: 'bg-purple-500 hover:bg-purple-600',
}

const PLAN_BORDER: Record<PlanName, string> = {
  free: 'border-slate-400 ring-slate-200',
  simple: 'border-emerald-400 ring-emerald-200',
  professional: 'border-blue-400 ring-blue-200',
  enterprise: 'border-purple-400 ring-purple-200',
}

export function PlanSwitcher() {
  const [open, setOpen] = useState(false)
  const planName = useStore((s) => s.planName)
  const setPlanName = useStore((s) => s.setPlanName)
  const resolvedPlanName = useStore((s) => s.resolvedPlanName)

  const plan = resolvePlan(planName)
  const PlanIcon = PLAN_ICONS[resolvedPlanName]

  // ★ فقط در حالت توسعه نشون بده
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const switchTo = (name: PlanName) => {
    setPlanName(name)
    // ★ ذخیره در localStorage برای پایداری
    if (typeof window !== 'undefined') {
      localStorage.setItem('debug-planName', name)
    }
    setOpen(false)
  }

  // ★ بازگردانی پلن از localStorage در لود اولیه
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('debug-planName') as PlanName | null
      if (saved && saved !== resolvedPlanName) {
        setPlanName(saved)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed bottom-4 left-4 z-[9999] print:hidden" dir="rtl">
      {/* ★ پنل باز شونده */}
      {open && (
        <div className="mb-2 bg-white rounded-xl shadow-2xl border-2 border-gray-200 overflow-hidden w-80">
          {/* هدر */}
          <div className="bg-gradient-to-l from-gray-900 to-gray-700 p-3 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                <span className="text-sm font-bold">تست پلن</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-white/60 mt-1">
              برای تست سریع، پلن رو عوض کنید
            </p>
          </div>

          {/* پلن فعلی */}
          <div className="p-3 bg-gray-50 border-b">
            <div className="text-[10px] text-gray-500 mb-1">پلن فعلی:</div>
            <div className="flex items-center gap-2">
              <PlanIcon className="w-4 h-4" />
              <span className="font-bold text-sm">{plan.label}</span>
              <Badge className={`text-[9px] h-4 ${plan.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {plan.isPaid ? 'پولی' : 'رایگان'}
              </Badge>
              <Badge className="text-[9px] h-4 bg-gray-100 text-gray-700">
                {plan.isIsolated ? 'اختصاصی' : 'اشتراکی'}
              </Badge>
            </div>
          </div>

          {/* لیست پلن‌ها */}
          <div className="p-2 space-y-1.5">
            {(Object.keys(PLANS) as PlanName[]).map((pn) => {
              const info = PLANS[pn]
              const Icon = PLAN_ICONS[pn]
              const isCurrent = pn === resolvedPlanName
              return (
                <button
                  key={pn}
                  onClick={() => switchTo(pn)}
                  className={`w-full flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all ${
                    isCurrent
                      ? `${PLAN_BORDER[pn]} ring-2 bg-white`
                      : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${PLAN_COLORS[pn]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-right">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-900">{info.label}</span>
                      {isCurrent && (
                        <Badge className="text-[8px] h-3.5 px-1 bg-emerald-100 text-emerald-700">
                          فعلی
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {info.isIsolated ? 'بانک اختصاصی' : 'بانک اشتراکی'} •{' '}
                      {info.monthlyPrice === 0
                        ? 'رایگان'
                        : `${info.monthlyPrice.toLocaleString('fa-IR')} ت`}
                    </div>
                  </div>
                  {isCurrent && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                </button>
              )
            })}
          </div>

          {/* فوتر */}
          <div className="p-2 bg-gray-50 border-t flex items-center justify-between">
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('debug-planName')
                  location.reload()
                }
              }}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700"
            >
              <RefreshCw className="w-3 h-3" />
              ریست
            </button>
            <span className="text-[9px] text-gray-400">
              Store v25.1 • debug
            </span>
          </div>
        </div>
      )}

      {/* ★ دکمه شناور */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-white text-xs font-bold transition-all ${PLAN_COLORS[resolvedPlanName]} ${
          open ? 'scale-95' : 'hover:scale-105'
        }`}
        title="تست پلن — کلیک کنید"
      >
        <PlanIcon className="w-4 h-4" />
        <span>پلن: {plan.label}</span>
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronUp className="w-3 h-3" />
        )}
      </button>
    </div>
  )
}

// ★ آیکون تیک سبز
function CheckCircle2({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
