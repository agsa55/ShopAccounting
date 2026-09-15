'use client'

// ============================================================================
// src/app/renewal/page.tsx — v1.0
// صفحه تمدید اشتراک (بعد از بستن سال مالی)
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Crown, Shield, Zap, Building2, CheckCircle2, AlertTriangle,
  Loader2, RefreshCw, Sparkles, Clock,Info,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface PlanInfo {
  label: string
  icon: any
  color: string
  annualPrice: number
  lifetimePrice: number
  features: string[]
  featured?: boolean
}

const PLANS: Record<string, PlanInfo> = {
  simple: {
    label: 'پایه',
    icon: Shield,
    color: 'emerald',
    annualPrice: 1_590_000,
    lifetimePrice: 16_000_000,
    features: ['تا ۲ کاربر', '۲۰۰ محصول', '۵۰۰ فاکتور', 'داشبورد مالی'],
  },
  professional: {
    label: 'پیشرفته',
    icon: Zap,
    color: 'blue',
    annualPrice: 2_760_000,
    lifetimePrice: 28_000_000,
    features: ['تا ۵ کاربر', '۲۰۰۰ محصول', 'فاکتور نامحدود', 'حسابداری دوطرفه'],
    featured: true,
  },
  enterprise: {
    label: 'حرفه‌ای',
    icon: Building2,
    color: 'purple',
    annualPrice: 3_550_000,
    lifetimePrice: 36_000_000,
    features: ['کاربر نامحدود', 'محصول نامحدود', 'حسابداری شعب', 'اتصال مودیان'],
  },
}

export default function RenewalPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentPlan = useAppStore((s) => s.planName) || 'simple'

  const [selectedPlan, setSelectedPlan] = useState<string>(currentPlan || 'professional')
  const [billingCycle, setBillingCycle] = useState<'annual' | 'lifetime'>('annual')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [subscription, setSubscription] = useState<any>(null)

  useEffect(() => {
    async function checkStatus() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) {
          router.push('/login?redirect=/renewal')
          return
        }

        const res = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()

        if (data.success) {
          setSubscription(data.data)
          setSelectedPlan(data.data.tierName || currentPlan || 'professional')
        }
      } catch (err) {
        console.error('Error checking subscription:', err)
      } finally {
        setChecking(false)
      }
    }
    checkStatus()
  }, [currentPlan, router])

    const handleRenew = async () => {
    // بررسی قانونی بودن انتخاب پلن
    const check = canSelectPlan(selectedPlan)
    if (!check.allowed) {
      toast({
        title: 'انتخاب غیرمجاز',
        description: check.reason || 'این پلن قابل انتخاب نیست',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (!token) {
        toast({
          title: 'نشست منقضی شده',
          description: 'لطفاً دوباره وارد شوید',
          variant: 'destructive',
        })
        setLoading(false)
        router.push('/login?redirect=/renewal')
        return
      }

      // ★ استفاده از API مشترک checkout (مشابه ثبت‌نام)
      // action: 'renew' برای تمدید
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tierName: selectedPlan,
          billingCycle,
          action: 'renew', // ★ به جای 'new' برای ثبت‌نام
        }),
      })

      const data = await res.json()

      if (data.success && data.data?.paymentUrl) {
        toast({
          title: '🚀 در حال انتقال به درگاه پرداخت...',
          description: 'لطفاً پرداخت را در صفحه زرین‌پال تکمیل کنید.',
        })

        // ★ هدایت به درگاه زرین‌پال (دقیقاً مشابه ثبت‌نام)
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = data.data.paymentUrl
          }
        }, 800)
      } else {
        toast({
          title: 'خطا در ایجاد پرداخت',
          description: data.error || 'لطفاً دوباره تلاش کنید',
          variant: 'destructive',
        })
        setLoading(false)
      }
    } catch (err: any) {
      console.error('[Renewal] Error:', err)
      toast({
        title: 'خطا در ارتباط با سرور',
        description: err?.message || 'لطفاً دوباره تلاش کنید',
        variant: 'destructive',
      })
      setLoading(false)
    }
  }
  const getCurrentPrice = () => {
    const plan = PLANS[selectedPlan]
    if (!plan) return 0
    return billingCycle === 'lifetime' ? plan.lifetimePrice : plan.annualPrice
  }

    // ★ منطق محدودیت پلن
  const canSelectPlan = (targetPlan: string): { allowed: boolean; reason?: string } => {
    const planOrder: Record<string, number> = {
      simple: 1,
      professional: 2,
      enterprise: 3,
    }

    const currentOrder = planOrder[currentPlan] || 1
    const targetOrder = planOrder[targetPlan] || 1

    // اگر پلن فعلی بالاتر از هدف باشد → تنزل (غیرمجاز)
    if (targetOrder < currentOrder) {
      return {
        allowed: false,
        reason: 'تنزل پلن امکان‌پذیر نیست. برای تغییر به پلن پایین‌تر با پشتیبانی تماس بگیرید.',
      }
    }

    return { allowed: true }
  }

  const isUpgrade = (targetPlan: string): boolean => {
    const planOrder: Record<string, number> = {
      simple: 1,
      professional: 2,
      enterprise: 3,
    }
    return (planOrder[targetPlan] || 1) > (planOrder[currentPlan] || 1)
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm text-gray-500">در حال بررسی وضعیت اشتراک...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      {/* هدر */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">تمدید اشتراک</h1>
              <p className="text-xs text-gray-500">ادامه استفاده از خدمات فروشگاه</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="text-xs"
          >
            بازگشت به داشبورد
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* پیام وضعیت */}
        {subscription?.isExpired && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-800 mb-1">
                اشتراک شما منقضی شده است
              </h3>
              <p className="text-xs text-red-700">
                برای ادامه استفاده از خدمات و ایجاد سال مالی جدید، لطفاً اشتراک خود را تمدید کنید.
              </p>
            </div>
          </div>
        )}

        {!subscription?.isExpired && subscription?.daysRemaining > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-800 mb-1">
                اشتراک شما در {subscription.daysRemaining} روز آینده منقضی می‌شود
              </h3>
              <p className="text-xs text-amber-700">
                برای جلوگیری از قطعی سرویس، اشتراک خود را تمدید کنید.
              </p>
            </div>
          </div>
        )}

        {/* عنوان */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">
            پلن اشتراک خود را انتخاب کنید
          </h2>
          <p className="text-sm text-gray-500">
            پلن فعلی: <strong>{PLANS[selectedPlan]?.label || 'نامشخص'}</strong>
          </p>
        </div>

        {/* کارت‌های پلن */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.keys(PLANS).map(planKey => {
            const plan = PLANS[planKey]
            const Icon = plan.icon
            const isSelected = selectedPlan === planKey
            const isFeatured = plan.featured === true
            const isCurrentPlan = planKey === currentPlan
            const selectionCheck = canSelectPlan(planKey)
            const isUpgradePlan = isUpgrade(planKey)

            // اگر پلن غیرمجاز است، استایل غیرفعال داشته باشد
            const isDisabled = !selectionCheck.allowed

            const colorClasses: any = {
              emerald: {
                border: isDisabled ? 'border-gray-200' : 'border-emerald-300',
                bg: isDisabled ? 'bg-gray-50' : 'bg-emerald-50',
                text: isDisabled ? 'text-gray-400' : 'text-emerald-700',
                button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
                ring: 'ring-emerald-500',
              },
              blue: {
                border: isDisabled ? 'border-gray-200' : 'border-blue-300',
                bg: isDisabled ? 'bg-gray-50' : 'bg-blue-50',
                text: isDisabled ? 'text-gray-400' : 'text-blue-700',
                button: 'bg-blue-600 hover:bg-blue-700 text-white',
                ring: 'ring-blue-500',
              },
              purple: {
                border: isDisabled ? 'border-gray-200' : 'border-purple-300',
                bg: isDisabled ? 'bg-gray-50' : 'bg-purple-50',
                text: isDisabled ? 'text-gray-400' : 'text-purple-700',
                button: 'bg-purple-600 hover:bg-purple-700 text-white',
                ring: 'ring-purple-500',
              },
            }[plan.color]

            return (
              <Card
                key={planKey}
                onClick={() => {
                  if (!isDisabled) setSelectedPlan(planKey)
                }}
                className={`relative transition-all ${colorClasses.border} ${
                  isSelected && !isDisabled ? `ring-2 ${colorClasses.ring}` : ''
                } ${isFeatured && !isDisabled ? 'shadow-lg' : ''} ${
                  isDisabled
                    ? 'opacity-60 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-md'
                }`}
              >
                {/* برچسب پلن فعلی */}
                {isCurrentPlan && (
                  <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    پلن فعلی شما
                  </div>
                )}

                {/* برچسب پیشنهادی */}
                {isFeatured && !isCurrentPlan && !isDisabled && (
                  <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    پیشنهادی
                  </div>
                )}

                {/* برچسب ارتقا */}
                {isUpgradePlan && !isCurrentPlan && (
                  <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    ارتقا
                  </div>
                )}

                <CardContent className={`p-5 ${(isFeatured || isCurrentPlan || isUpgradePlan) && !isDisabled ? 'pt-8' : ''}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg ${colorClasses.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${colorClasses.text}`} />
                    </div>
                    <h3 className={`font-bold text-base ${isDisabled ? 'text-gray-400' : ''}`}>
                      {plan.label}
                    </h3>
                  </div>

                  <div className="space-y-1 mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-xl font-bold ${isDisabled ? 'text-gray-400' : ''}`}>
                        {plan.annualPrice.toLocaleString('fa-IR')}
                      </span>
                      <span className="text-xs text-gray-500">تومان/سالانه</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-600'}`}>
                        {plan.lifetimePrice.toLocaleString('fa-IR')}
                      </span>
                      <span className="text-[10px] text-gray-400">تومان/مادام‌العمر</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className={`w-3 h-3 shrink-0 ${isDisabled ? 'text-gray-300' : 'text-emerald-500'}`} />
                        <span className={isDisabled ? 'text-gray-400' : 'text-gray-600'}>{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* پیام غیرمجاز بودن */}
                  {isDisabled && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 text-[10px] text-red-700 text-center">
                      ⛔ {selectionCheck.reason}
                    </div>
                  )}

                  <div className={`h-2 rounded-full ${
                    isSelected && !isDisabled ? colorClasses.button : 
                    isDisabled ? 'bg-gray-200' : 'bg-gray-200'
                  }`} />
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* انتخاب دوره تمدید */}
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              دوره تمدید
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <label
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                billingCycle === 'annual'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="cycle"
                  checked={billingCycle === 'annual'}
                  onChange={() => setBillingCycle('annual')}
                  className="w-4 h-4 text-emerald-600"
                />
                <div>
                  <div className="text-sm font-bold">تمدید سالانه</div>
                  <div className="text-[10px] text-gray-500">۳۶۵ روز دسترسی</div>
                </div>
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-emerald-700">
                  {PLANS[selectedPlan]?.annualPrice.toLocaleString('fa-IR') || '—'}
                </div>
                <div className="text-[10px] text-gray-500">تومان</div>
              </div>
            </label>

            <label
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                billingCycle === 'lifetime'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="cycle"
                  checked={billingCycle === 'lifetime'}
                  onChange={() => setBillingCycle('lifetime')}
                  className="w-4 h-4 text-purple-600"
                />
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    تمدید مادام‌العمر
                    <Badge className="bg-purple-100 text-purple-700 text-[9px]">
                      <Sparkles className="w-2.5 h-2.5 ml-0.5" />
                      بهترین انتخاب
                    </Badge>
                  </div>
                  <div className="text-[10px] text-gray-500">یک بار پرداخت، برای همیشه</div>
                </div>
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-purple-700">
                  {PLANS[selectedPlan]?.lifetimePrice.toLocaleString('fa-IR') || '—'}
                </div>
                <div className="text-[10px] text-gray-500">تومان</div>
              </div>
            </label>
          </CardContent>
        </Card>

        {/* خلاصه و دکمه پرداخت */}
            {/* خلاصه و دکمه پرداخت */}
        <Card className="border-emerald-300 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-5">
            <div className="space-y-3">
              {/* نوع عملیات */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">نوع عملیات:</span>
                <Badge className={isUpgrade(selectedPlan) ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}>
                  {isUpgrade(selectedPlan) ? '🚀 ارتقا' : '🔄 تمدید'}
                </Badge>
              </div>

              {/* پلن انتخابی */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">پلن انتخابی:</span>
                <span className="font-bold">{PLANS[selectedPlan]?.label || '—'}</span>
              </div>

              {/* دوره تمدید */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">دوره تمدید:</span>
                <span className="font-bold">
                  {billingCycle === 'lifetime' ? 'مادام‌العمر' : 'سالانه'}
                </span>
              </div>

              {/* مبلغ */}
              <div className="flex items-center justify-between pt-3 border-t border-emerald-200">
                <span className="text-base font-bold">مبلغ قابل پرداخت:</span>
                <span className="text-2xl font-bold text-emerald-700">
                  {getCurrentPrice().toLocaleString('fa-IR')}{' '}
                  <span className="text-xs text-gray-500">تومان</span>
                </span>
              </div>

              {/* دکمه پرداخت */}
              <Button
                className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700 text-white gap-2 mt-3"
                onClick={handleRenew}
                disabled={loading || !canSelectPlan(selectedPlan).allowed}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    در حال انتقال به درگاه پرداخت...
                  </>
                ) : (
                  <>
                    <Crown className="w-5 h-5" />
                    {isUpgrade(selectedPlan) ? 'ارتقا و پرداخت' : 'پرداخت و تمدید اشتراک'}
                  </>
                )}
              </Button>

              {/* پیام غیرمجاز بودن */}
              {!canSelectPlan(selectedPlan).allowed && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-center">
                  <p className="text-[11px] text-red-700 flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    {canSelectPlan(selectedPlan).reason}
                  </p>
                </div>
              )}

              {/* پیام امنیتی */}
              <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-200">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <p className="text-[10px] text-gray-500">
                  پرداخت از طریق درگاه امن زرین‌پال انجام می‌شود
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}