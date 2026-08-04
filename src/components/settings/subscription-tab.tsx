'use client'

// ============================================================================
// src/components/settings/subscription-tab.tsx
// ShopAccounting — تب مدیریت اشتراک
// ============================================================================

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Zap, Crown, Building2, CheckCircle2, Lock, RefreshCw, Sparkles,
} from 'lucide-react'

export function SubscriptionTab() {
  const rawPlanName = useStore((s) => s.planName)
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
          setStatus(data.data)
        }
      } catch (err) {
        console.error('Failed to fetch subscription status', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStatus()
  }, [])

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

  const handleUpgrade = async (tierName: string, billingCycle: 'annual' | 'lifetime') => {
    setUpgrading(`${tierName}-${billingCycle}`)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tierName, billingCycle }),
      })
      const data = await res.json()
      if (data.success) {
        const cycleLabel = billingCycle === 'lifetime' ? 'مادام‌العمر' : 'سالانه'
        alert(`✅ پلن شما با موفقیت به ${cycleLabel} ارتقا یافت!`)
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
  }

  if (!status) {
    return (
      <div className="text-center py-10 text-gray-500">
        <Lock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p>لطفاً یک بار از حساب خارج و دوباره وارد شوید (خطای احراز هویت)</p>
      </div>
    )
  }

  const normalizedCurrent = (String(rawPlanName).toLowerCase() === 'basic' || String(rawPlanName).toLowerCase() === 'simple') ? 'simple' : String(rawPlanName)

  const PLANS_INFO = {
    simple: {
      label: 'پایه',
      icon: Zap,
      color: 'emerald',
      annualPrice: 1_590_000,
      lifetimePrice: 16_000_000,
      features: ['تا ۲ کاربر', '۲۰۰ محصول', '۵۰۰ فاکتور', 'داشبورد مالی'],
    },
    professional: {
      label: 'پیشرفته',
      icon: Crown,
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

  return (
    <div className="space-y-6">
      <Card className={`border-2 ${status.isLifetime ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'}`}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {status.isLifetime ? <Sparkles className="w-5 h-5 text-emerald-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              <div>
                <CardTitle className="text-lg">پلن فعلی: {status.tierNameFa || 'پایه'}</CardTitle>
                <CardDescription className="mt-1">{status.message}</CardDescription>
              </div>
            </div>
            <Badge className={status.isLifetime ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}>
              {status.isLifetime ? 'مادام‌العمر' : 'فعال'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div>
        <h3 className="text-base font-bold text-gray-800 mb-3">مدیریت اشتراک</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(PLANS_INFO) as any[]).map((pn: any) => {
            const info = PLANS_INFO[pn]
            const Icon = info.icon
            const isCurrent = pn === normalizedCurrent

            const colorClasses: any = {
              emerald: { border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', button: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
              blue: { border: 'border-blue-300', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', button: 'bg-blue-600 hover:bg-blue-700 text-white' },
              purple: { border: 'border-purple-300', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', button: 'bg-purple-600 hover:bg-purple-700 text-white' },
            }[info.color]

            return (
              <Card key={pn} className={`relative overflow-hidden transition-all hover:shadow-md ${colorClasses.border} ${isCurrent ? 'ring-2 ring-emerald-400' : ''} ${info.featured ? 'ring-2 ring-blue-400' : ''}`}>
                {isCurrent && <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-center text-[10px] font-bold py-1 z-10">پلن فعلی</div>}
                {info.featured && !isCurrent && <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-center text-[10px] font-bold py-1 z-10">پیشنهادی</div>}

                <CardContent className={`p-5 ${isCurrent || info.featured ? 'pt-8' : ''}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClasses.iconBg}`}>
                      <Icon className={`w-6 h-6 ${colorClasses.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{info.label}</h3>
                      <p className="text-[10px] text-gray-500">{pn}</p>
                    </div>
                  </div>

                  <div className="mb-4 space-y-1.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{info.annualPrice.toLocaleString('fa-IR')}</span>
                      <span className="text-xs text-gray-500">تومان/سالانه</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-medium text-gray-600">{info.lifetimePrice.toLocaleString('fa-IR')}</span>
                      <span className="text-[10px] text-gray-400">تومان/مادام‌العمر</span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-4 text-[11px]">
                    {info.features.map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-gray-600">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        {feat}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {isCurrent ? (
                      <>
                        <Button className="w-full gap-2 bg-gray-100 text-gray-600 hover:bg-gray-100 cursor-default" disabled>
                          <CheckCircle2 className="w-4 h-4" />
                          پلن فعلی شما
                        </Button>
                        <Button
                          className={`w-full gap-2 ${colorClasses.button}`}
                          onClick={handleRenewAnnual}
                          disabled={renewing || status.isLifetime}
                        >
                          {renewing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          {status.isLifetime ? 'تمدید (مادام‌العمر فعال)' : 'تمدید یک سال دیگر'}
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => handleUpgrade(pn, 'lifetime')}
                          disabled={upgrading === `${pn}-lifetime` || status.isLifetime}
                        >
                          {upgrading === `${pn}-lifetime` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {status.isLifetime ? 'مادام‌العمر فعال' : 'ارتقا به مادام‌العمر'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button className={`w-full gap-2 ${colorClasses.button}`} onClick={() => handleUpgrade(pn, 'annual')} disabled={upgrading === `${pn}-annual`}>
                          {upgrading === `${pn}-annual` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                          ارتقا به {info.label} (سالانه)
                        </Button>
                        <Button variant="outline" className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleUpgrade(pn, 'lifetime')} disabled={upgrading === `${pn}-lifetime`}>
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
  )
}