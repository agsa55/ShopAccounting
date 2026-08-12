'use client'

// ============================================================================
// src/components/settings/subscription-tab.tsx (v2.2)
// ShopAccounting — تب مدیریت اشتراک
// ----------------------------------------------------------------------------
// ★ v2.2: اصلاحات نهایی
//   - منطق فرمت زمان دقیقاً مثل app-shell.tsx (ماه و روز، نه سال)
//   - سقف ۳۶۵ روز برای پلن‌های یک ساله
//   - نمایش تاریخ دقیق انقضا
//   - دکمه‌ها فقط در ۷ روز آخر فعال می‌شوند
//   - پلن‌های پایین‌تر نمایش داده نمی‌شوند
//   - همه عملیات‌ها → redirect به /renewal
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Zap, Crown, Building2, CheckCircle2, Lock, Sparkles,
  Clock, ArrowUpCircle, ArrowLeft, Calendar, AlertTriangle,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
//  ثابت‌ها
// ═══════════════════════════════════════════════════════════════

// ترتیب پلن‌ها (برای جلوگیری از تنزل)
const TIER_ORDER: Record<string, number> = {
  simple: 1,
  professional: 2,
  enterprise: 3,
}

// تعداد روزهای مانده برای فعال شدن دکمه‌ها
const RENEW_ACTIVATION_DAYS = 7

// اطلاعات پلن‌ها
const PLANS_INFO: Record<string, {
  label: string
  icon: any
  color: 'emerald' | 'blue' | 'purple'
  annualPrice: number
  lifetimePrice: number
  features: string[]
  featured?: boolean
}> = {
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

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی (دقیقاً مثل app-shell.tsx)
// ═══════════════════════════════════════════════════════════════

/**
 * فرمت زمان باقی‌مانده — منطق یکسان با app-shell.tsx
 * پلن‌ها یک ساله هستند، پس فقط "ماه و روز" نمایش داده می‌شود
 */
function formatRemainingTime(days: number, hours: number = 0): string {
  if (days === -1) return 'مادام‌العمر';
  if (days <= 0 && hours <= 0) return 'منقضی شده';

  // ★ اگر تقریباً یک سال کامل است (۳۶۰ روز به بالا)
  if (days >= 360) return '۱ سال کامل';

  // زیر ۳۰ روز: روز + ساعت
  if (days < 30) {
    const dStr = days > 0 ? `${days.toLocaleString('fa-IR')} روز` : '';
    const hStr = hours > 0 ? `${hours.toLocaleString('fa-IR')} ساعت` : '';
    if (dStr && hStr) return `${dStr} و ${hStr}`;
    return dStr || hStr || 'کمتر از ۱ ساعت';
  }

  // ۳۰ روز به بالا: ماه + روز
  const months = Math.floor(days / 30);
  const remainingDays = days % 30;

  const mStr = months > 0 ? `${months.toLocaleString('fa-IR')} ماه` : '';
  const dStr = remainingDays > 0 ? `${remainingDays.toLocaleString('fa-IR')} روز` : '';

  if (mStr && dStr) return `${mStr} و ${dStr}`;
  return mStr || dStr;
}

/**
 * فرمت تاریخ انقضا به شمسی
 */
function formatExpiryDate(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  try {
    return new Date(expiresAt).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

export function SubscriptionTab() {
  const router = useRouter()
  const rawPlanName = useStore((s) => s.planName)
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // ── دریافت وضعیت اشتراک از API ──
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

  // ── محاسبه دقیق daysRemaining (با سقف یک سال) ──
  const daysRemaining = useMemo(() => {
    if (!status) return 0;

    // مادام‌العمر
    if (status.isLifetime) return -1;

    // از API بخوان
    let days = 0;
    if (typeof status.daysRemaining === 'number') {
      days = status.daysRemaining;
    } else if (status.expiresAt) {
      // Fallback: محاسبه از expiresAt
      const expiresMs = new Date(status.expiresAt).getTime();
      const nowMs = Date.now();
      days = Math.max(0, Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24)));
    }

    // ★ پلن‌ها یک ساله هستند، پس حداکثر ۳۶۵ روز نمایش بده
    // اگر بیشتر بود (چند دوره تمدید)، فقط یک دوره را نشان می‌دهیم
    return Math.min(days, 365);
  }, [status]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  // ── Error ──
  if (!status) {
    return (
      <div className="text-center py-10 text-gray-500">
        <Lock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p>لطفاً یک بار از حساب خارج و دوباره وارد شوید</p>
      </div>
    )
  }

  // ── نرمال‌سازی نام پلن فعلی ──
  const currentTierName = (() => {
    const n = String(status.tierName || rawPlanName || 'simple').toLowerCase()
    if (n === 'basic') return 'simple'
    if (['simple', 'professional', 'enterprise'].includes(n)) return n
    return 'simple'
  })()

  const currentTierOrder = TIER_ORDER[currentTierName] || 1
  const isLifetime = status.isLifetime === true
  const isExpired = daysRemaining <= 0 && !isLifetime

  // ── فرمت زمان باقی‌مانده (با تابع کمکی) ──
  const displayRemaining = isLifetime
    ? 'مادام‌العمر'
    : formatRemainingTime(daysRemaining);

  // ★ منطق کلیدی: آیا کاربر اجازه انجام هرگونه عملیات دارد؟
  // فقط وقتی: مادام‌العمر نیست + (منقضی شده یا کمتر از ۷ روز مانده)
  const canActivateActions = !isLifetime && (isExpired || daysRemaining <= RENEW_ACTIVATION_DAYS)

  // ── محاسبه روزهای باقی‌مانده تا فعال‌سازی دکمه‌ها ──
  const daysUntilActivation = Math.max(0, daysRemaining - RENEW_ACTIVATION_DAYS)

  // ── پلن‌های قابل نمایش (فقط فعلی + بالاتر) ──
  const visiblePlans = (Object.keys(PLANS_INFO) as Array<keyof typeof PLANS_INFO>).filter(
    (tier) => (TIER_ORDER[tier] || 0) >= currentTierOrder
  )

  // ── redirect به صفحه تمدید ──
  const goToRenewalPage = () => router.push('/renewal')

  return (
    <div className="space-y-6" dir="rtl">
      {/* ═══ کارت وضعیت فعلی ═══ */}
      <Card className={`border-2 ${
        isLifetime ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50'
        : isExpired ? 'border-red-200 bg-red-50/30'
        : 'border-emerald-200 bg-emerald-50/30'
      }`}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isLifetime ? 'bg-emerald-100'
                : isExpired ? 'bg-red-100'
                : 'bg-emerald-100'
              }`}>
                {isLifetime ? <Sparkles className="w-5 h-5 text-emerald-600" />
                : isExpired ? <AlertTriangle className="w-5 h-5 text-red-600" />
                : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              </div>
              <div>
                <CardTitle className="text-lg">
                  پلن فعلی: {PLANS_INFO[currentTierName]?.label || 'پایه'}
                </CardTitle>
                <CardDescription className="mt-1">
                  {isLifetime ? 'اشتراک مادام‌العمر شما فعال است'
                  : isExpired ? '⚠️ اشتراک شما منقضی شده — لطفاً تمدید کنید'
                  : `${displayRemaining} تا پایان اشتراک باقی مانده است`}
                </CardDescription>
              </div>
            </div>
            <Badge className={
              isLifetime ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
              : isExpired ? 'bg-red-100 text-red-700 border-red-200'
              : daysRemaining <= RENEW_ACTIVATION_DAYS ? 'bg-amber-100 text-amber-700 border-amber-200'
              : 'bg-blue-100 text-blue-700 border-blue-200'
            }>
              {isLifetime ? '♾️ مادام‌العمر' : isExpired ? '⚠️ منقضی' : '✅ فعال'}
            </Badge>
          </div>

          {/* نوار زمان باقی‌مانده (فقط برای غیر مادام‌العمر) */}
          {!isLifetime && (
            <div className="mt-4">
              {/* خط اول: زمان باقی‌مانده */}
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  زمان باقی‌مانده
                </span>
                <span className="font-bold text-sm text-gray-800">
                  {displayRemaining}
                </span>
              </div>

              {/* خط دوم: تاریخ دقیق انقضا */}
              {formatExpiryDate(status.expiresAt) && (
                <div className="flex items-center justify-end text-[10px] text-gray-500 mb-2 gap-1">
                  <Clock className="w-3 h-3" />
                  <span>تاریخ انقضا:</span>
                  <span className="font-bold text-gray-700">
                    {formatExpiryDate(status.expiresAt)}
                  </span>
                </div>
              )}

              {/* نوار پیشرفت (بر اساس یک سال) */}
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isExpired ? 'bg-red-500'
                    : daysRemaining <= RENEW_ACTIVATION_DAYS ? 'bg-amber-500'
                    : daysRemaining <= 30 ? 'bg-blue-500'
                    : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${Math.max(0, Math.min(100, (daysRemaining / 365) * 100))}%`,
                  }}
                />
              </div>

              {/* پیام تا فعال‌سازی دکمه‌ها */}
              {!canActivateActions && !isExpired && (
                <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                  <Clock className="w-3 h-3 text-blue-500 shrink-0" />
                  <span>
                    دکمه‌های تمدید و ارتقا{' '}
                    <strong className="text-blue-700">
                      {daysUntilActivation.toLocaleString('fa-IR')} روز دیگر
                    </strong>{' '}
                    فعال می‌شوند
                  </span>
                </p>
              )}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* ═══ هشدار برای پلن منقضی یا نزدیک اتمام ═══ */}
      {(isExpired || (!isLifetime && daysRemaining <= RENEW_ACTIVATION_DAYS && daysRemaining > 0)) && (
        <Card className="border-amber-300 bg-gradient-to-l from-amber-50 to-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800">
                {isExpired ? 'اشتراک شما منقضی شده' : `${daysRemaining.toLocaleString('fa-IR')} روز تا پایان اشتراک`}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                برای ادامه استفاده از خدمات، اشتراک خود را تمدید یا ارتقا دهید.
              </p>
            </div>
            <Button
              onClick={goToRenewalPage}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shrink-0"
            >
              تمدید / ارتقا
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ کارت‌های پلن‌ها ═══ */}
      <div>
        <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Crown className="w-4 h-4 text-emerald-600" />
          مدیریت پلن‌ها
        </h3>
        <div className={`grid grid-cols-1 gap-4 ${
          visiblePlans.length === 1 ? 'md:grid-cols-1 max-w-md'
          : visiblePlans.length === 2 ? 'md:grid-cols-2'
          : 'md:grid-cols-3'
        }`}>
          {visiblePlans.map((pn) => {
            const info = PLANS_INFO[pn]
            const Icon = info.icon
            const isCurrent = pn === currentTierName
            const isHigher = (TIER_ORDER[pn] || 0) > currentTierOrder

            const colorClasses: Record<string, any> = {
              emerald: {
                border: 'border-emerald-200',
                iconBg: 'bg-emerald-100',
                iconColor: 'text-emerald-600',
                button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
                ring: 'ring-emerald-400',
              },
              blue: {
                border: 'border-blue-300',
                iconBg: 'bg-blue-100',
                iconColor: 'text-blue-600',
                button: 'bg-blue-600 hover:bg-blue-700 text-white',
                ring: 'ring-blue-400',
              },
              purple: {
                border: 'border-purple-300',
                iconBg: 'bg-purple-100',
                iconColor: 'text-purple-600',
                button: 'bg-purple-600 hover:bg-purple-700 text-white',
                ring: 'ring-purple-400',
              },
            }
            const colors = colorClasses[info.color]

            return (
              <Card
                key={pn}
                className={`relative overflow-hidden transition-all hover:shadow-md ${colors.border} ${
                  isCurrent ? `ring-2 ${colors.ring}` : ''
                } ${info.featured && !isCurrent ? 'ring-2 ring-blue-400' : ''}`}
              >
                {/* برچسب بالا */}
                {isCurrent && (
                  <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    پلن فعلی شما
                  </div>
                )}
                {info.featured && !isCurrent && (
                  <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    پیشنهادی
                  </div>
                )}
                {isHigher && !info.featured && (
                  <div className="absolute top-0 left-0 right-0 bg-purple-500 text-white text-center text-[10px] font-bold py-1 z-10">
                    ارتقا
                  </div>
                )}

                <CardContent className={`p-5 ${isCurrent || info.featured || isHigher ? 'pt-8' : ''}`}>
                  {/* هدر کارت */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colors.iconBg}`}>
                      <Icon className={`w-6 h-6 ${colors.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{info.label}</h3>
                      <p className="text-[10px] text-gray-500">{pn}</p>
                    </div>
                  </div>

                  {/* قیمت‌ها */}
                  <div className="mb-4 space-y-1.5 pb-4 border-b border-gray-100">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">
                        {info.annualPrice.toLocaleString('fa-IR')}
                      </span>
                      <span className="text-xs text-gray-500">تومان/سالانه</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-medium text-gray-600">
                        {info.lifetimePrice.toLocaleString('fa-IR')}
                      </span>
                      <span className="text-[10px] text-gray-400">تومان/مادام‌العمر</span>
                    </div>
                  </div>

                  {/* ویژگی‌ها */}
                  <div className="space-y-1.5 mb-5 text-[11px]">
                    {info.features.map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-gray-600">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        {feat}
                      </div>
                    ))}
                  </div>

                  {/* دکمه‌ها */}
                  <div className="space-y-2">
                    {isCurrent ? (
                      <>
                        {/* ═══ پلن فعلی ═══ */}
                        <Button
                          className="w-full gap-2 bg-gray-100 text-gray-600 hover:bg-gray-100 cursor-default"
                          disabled
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          پلن فعلی شما
                        </Button>

                        {!isLifetime && (
                          <>
                            {/* دکمه تمدید سالانه */}
                            <Button
                              className={`w-full gap-2 ${
                                canActivateActions
                                  ? colors.button
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-100 cursor-not-allowed'
                              }`}
                              onClick={goToRenewalPage}
                              disabled={!canActivateActions}
                              title={canActivateActions ? 'تمدید برای یک سال دیگر' : `تمدید ${daysUntilActivation.toLocaleString('fa-IR')} روز دیگر فعال می‌شود`}
                            >
                              <Clock className="w-4 h-4" />
                              {canActivateActions
                                ? 'تمدید یک سال دیگر'
                                : `تمدید (${daysUntilActivation.toLocaleString('fa-IR')} روز مانده)`}
                            </Button>

                            {/* دکمه مادام‌العمر */}
                            <Button
                              variant="outline"
                              className={`w-full gap-2 ${
                                canActivateActions
                                  ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                  : 'border-gray-200 text-gray-400 hover:bg-white cursor-not-allowed'
                              }`}
                              onClick={goToRenewalPage}
                              disabled={!canActivateActions}
                              title={canActivateActions ? 'ارتقا به مادام‌العمر' : `ارتقا ${daysUntilActivation.toLocaleString('fa-IR')} روز دیگر فعال می‌شود`}
                            >
                              <Sparkles className="w-4 h-4" />
                              {canActivateActions ? 'ارتقا به مادام‌العمر' : `مادام‌العمر (${daysUntilActivation.toLocaleString('fa-IR')} روز مانده)`}
                            </Button>
                          </>
                        )}

                        {isLifetime && (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                            <Sparkles className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                            <p className="text-xs font-bold text-emerald-700">
                              اشتراک مادام‌العمر فعال است
                            </p>
                            <p className="text-[10px] text-emerald-600 mt-0.5">
                              نیازی به تمدید نیست 🎉
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* ═══ پلن‌های بالاتر (برای ارتقا) ═══ */}
                        <Button
                          className={`w-full gap-2 ${
                            canActivateActions
                              ? colors.button
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-100 cursor-not-allowed'
                          }`}
                          onClick={goToRenewalPage}
                          disabled={!canActivateActions}
                          title={canActivateActions ? `ارتقا به ${info.label} سالانه` : `ارتقا ${daysUntilActivation.toLocaleString('fa-IR')} روز دیگر فعال می‌شود`}
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                          {canActivateActions
                            ? `ارتقا به ${info.label} (سالانه)`
                            : `سالانه (${daysUntilActivation.toLocaleString('fa-IR')} روز مانده)`}
                        </Button>

                        <Button
                          variant="outline"
                          className={`w-full gap-2 ${
                            canActivateActions
                              ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                              : 'border-gray-200 text-gray-400 hover:bg-white cursor-not-allowed'
                          }`}
                          onClick={goToRenewalPage}
                          disabled={!canActivateActions}
                          title={canActivateActions ? `ارتقا به ${info.label} مادام‌العمر` : `ارتقا ${daysUntilActivation.toLocaleString('fa-IR')} روز دیگر فعال می‌شود`}
                        >
                          <Sparkles className="w-4 h-4" />
                          {canActivateActions
                            ? `ارتقا به ${info.label} (مادام‌العمر)`
                            : `مادام‌العمر (${daysUntilActivation.toLocaleString('fa-IR')} روز مانده)`}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* یادآوری درباره پلن‌های حذف‌شده */}
        {currentTierOrder > 1 && (
          <p className="text-[11px] text-gray-500 mt-4 text-center flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3" />
            پلن‌های پایین‌تر در دسترس نیستند — برای تنزل با پشتیبانی تماس بگیرید
          </p>
        )}
      </div>
    </div>
  )
}