'use client'

import { useState } from 'react'
import { useAppStore, AppView } from '@/lib/store'
import {
  ArrowRight, Check, Crown, Zap, Building2, Gem, CreditCard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

/* ------------------------------------------------------------------ */
/*  Plan tier definitions                                             */
/* ------------------------------------------------------------------ */

interface PlanTier {
  id: string
  name: string
  nameFa: string
  price: string
  period: string
  features: string[]
  icon: React.ComponentType<{ className?: string }>
  color: string
  popular?: boolean
}

const PLAN_TIERS: PlanTier[] = [
  {
    id: 'simple_monthly',
    name: 'Simple',
    nameFa: 'ساده - ماهانه',
    price: '۹۹,۰۰۰',
    period: 'ماهانه',
    features: [
      'مدیریت محصولات و دسته‌بندی',
      'صدور فاکتور فروش',
      'مدیریت مشتریان',
      'گزارش فروش ساده',
      'پشتیبانی ایمیل',
    ],
    icon: Zap,
    color: 'blue',
  },
  {
    id: 'simple_quarterly',
    name: 'Simple Quarterly',
    nameFa: 'ساده - سه‌ماهه',
    price: '۲۴۹,۰۰۰',
    period: 'سه‌ماهه',
    features: [
      'همه امکانات طرح ساده',
      'تخفیف ۱۵٪ نسبت به ماهانه',
      'اقساط مشتریان',
      'پشتیبانی تلفنی',
    ],
    icon: Zap,
    color: 'blue',
  },
  {
    id: 'professional_monthly',
    name: 'Professional',
    nameFa: 'حرفه‌ای - ماهانه',
    price: '۲۹۹,۰۰۰',
    period: 'ماهانه',
    features: [
      'همه امکانات طرح ساده',
      'حسابداری کامل دوبل',
      'مدیریت اقساط پیشرفته',
      'گزارشات مالی',
      'دسترسی چند کاربره',
      'پشتیبانی اولویت‌دار',
    ],
    icon: Crown,
    color: 'purple',
    popular: true,
  },
  {
    id: 'professional_quarterly',
    name: 'Professional Quarterly',
    nameFa: 'حرفه‌ای - سه‌ماهه',
    price: '۷۴۹,۰۰۰',
    period: 'سه‌ماهه',
    features: [
      'همه امکانات طرح حرفه‌ای',
      'تخفیف ۱۵٪ نسبت به ماهانه',
      'درگاه پرداخت',
      'API دسترسی',
    ],
    icon: Crown,
    color: 'purple',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    nameFa: 'سازمانی',
    price: 'تماس بگیرید',
    period: 'سفارشی',
    features: [
      'همه امکانات طرح حرفه‌ای',
      'دیتابیس اختصاصی',
      'یکپارچگی با سیستم‌های دیگر',
      'SLA ۹۹.۹٪',
      'مدیریت نقش و دسترسی پیشرفته',
      'پشتیبانی ۲۴/۷',
    ],
    icon: Building2,
    color: 'green',
  },
  {
    id: 'full_purchase',
    name: 'Full Purchase',
    nameFa: 'خرید کامل',
    price: '۹,۹۹۹,۰۰۰',
    period: 'یک‌بار',
    features: [
      'همه امکانات برای همیشه',
      'بدون اشتراک ماهانه',
      'آپدیت یک سال رایگان',
      'پشتیبانی یک سال رایگان',
      'نصب روی سرور شخصی',
    ],
    icon: Gem,
    color: 'emerald',
  },
]

const COLOR_MAPS: Record<string, { bg: string; border: string; text: string; ring: string; badge: string }> = {
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    ring: 'ring-blue-400',
    badge: 'bg-blue-100 text-blue-800',
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    ring: 'ring-purple-400',
    badge: 'bg-purple-100 text-purple-800',
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    ring: 'ring-green-400',
    badge: 'bg-green-100 text-green-800',
  },
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    ring: 'ring-emerald-400',
    badge: 'bg-emerald-100 text-emerald-800',
  },
}

/* ================================================================== */
/*  UpgradePlanPage                                                   */
/* ================================================================== */

export default function UpgradePlanPage() {
  const { currentTenant, setCurrentView } = useAppStore()
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const currentPlan = currentTenant?.planName || 'trial'

  const handleUpgrade = async (planId: string) => {
    setSelectedPlan(planId)
    setLoading(true)
    setMessage(null)

    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('access_token='))
        ?.split('=')[1]

      const res = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planName: planId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'خطا در ارتقای طرح' })
        return
      }

      setMessage({ type: 'success', text: 'طرح شما با موفقیت ارتقا یافت!' })
    } catch {
      setMessage({ type: 'error', text: 'خطا در اتصال به سرور' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentView('dashboard' as AppView)}
          className="shrink-0"
        >
          <ArrowRight className="size-4" />
        </Button>
        <div>
          <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Crown className="size-5 text-amber-500" />
            ارتقای طرح اشتراک
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            طرح مناسب کسب‌وکار خود را انتخاب کنید
          </p>
        </div>
      </div>

      {/* Current plan info */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="py-3 flex items-center gap-2">
          <CreditCard className="size-4 text-amber-600" />
          <span className="text-sm">
            طرح فعلی: <strong>{currentPlan === 'trial' ? 'آزمایشی' : currentPlan}</strong>
          </span>
        </CardContent>
      </Card>

      {/* Message */}
      {message && (
        <Card className={message.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="py-3">
            <p className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {message.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLAN_TIERS.map((plan) => {
          const colors = COLOR_MAPS[plan.color] || COLOR_MAPS.blue
          const Icon = plan.icon
          const isCurrentPlan = currentPlan === plan.id

          return (
            <Card
              key={plan.id}
              className={`relative transition-all ${
                plan.popular
                  ? `border-2 ${colors.border} shadow-md ring-1 ${colors.ring}`
                  : 'hover:shadow-md hover:border-gray-300'
              } ${isCurrentPlan ? 'opacity-60' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className={`${colors.badge} text-[10px]`}>
                    محبوب‌ترین
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center ${colors.text}`}>
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">{plan.nameFa}</CardTitle>
                    <CardDescription className="text-[10px]">{plan.period}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pb-3">
                <div className="mb-3">
                  <span className="text-xl font-bold">{plan.price}</span>
                  {plan.period !== 'سفارشی' && plan.period !== 'یک‌بار' && (
                    <span className="text-xs text-muted-foreground ms-1">تومان / {plan.period}</span>
                  )}
                </div>

                <Separator className="mb-3" />

                <ul className="space-y-1.5">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="size-3 text-emerald-500 mt-0.5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.popular ? 'default' : 'outline'}
                  size="sm"
                  disabled={(loading && selectedPlan === plan.id) || isCurrentPlan}
                  onClick={() => handleUpgrade(plan.id)}
                >
                  {isCurrentPlan ? 'طرح فعلی' : loading && selectedPlan === plan.id ? (
                    <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'انتخاب طرح'
                  )}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
