'use client'

// ============================================================================
// src/components/upgrade/upgrade-plan-page.tsx (v11.0 ★★★)
// ★ v11.0: دریافت ویژگی‌ها و قیمت به‌روزرسانی از Site Content
// ★ v10.4: تشخیص SUBSCRIPTION_EXPIRED از middleware
// ★ v10.4: مخفی کردن "بعداً پرداخت" در حالت قفل
// ★ v10.4: redirect خودکار بعد از پرداخت موفق
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { PLANS, resolvePlan, type PlanName } from '@/lib/plan-features'
import { useSiteContent } from '@/lib/site-content'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CheckCircle2, Crown, ChevronLeft, Shield, Zap, Building2,
  Database, Users, ShoppingCart, FileText, RefreshCw, Clock,
  AlertTriangle, CreditCard, Sparkles, Infinity, X,
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
  accentColor: string
}> = {
  simple: {
    gradient: 'from-emerald-50 to-white',
    border: 'border-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: Shield,
    iconBg: 'bg-emerald-100',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    accentColor: 'emerald',
  },
  professional: {
    gradient: 'from-blue-50 to-white',
    border: 'border-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    icon: Zap,
    iconBg: 'bg-blue-100',
    buttonClass: 'bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white',
    accentColor: 'blue',
  },
  enterprise: {
    gradient: 'from-purple-50 to-white',
    border: 'border-purple-300',
    badge: 'bg-purple-100 text-purple-700',
    icon: Building2,
    iconBg: 'bg-purple-100',
    buttonClass: 'bg-gradient-to-l from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white',
    accentColor: 'purple',
  },
}

// ═══════════════════════════════════════════════════════════════
//  ★ v11.0: ویژگی‌های پیش‌فرض (fallback اگر Site Content نبود)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_FEATURES: Record<PlanName, string[]> = {
  simple: [
    'فروش نقدی و صدور فاکتور',
    'مدیریت محصولات و مشتریان',
    'گزارش‌های پایه فروش و سود',
    'پشتیبانی ۲۴/۷',
    'ذخیره‌سازی ابری امن',
  ],
  professional: [
    'تمام قابلیت‌های پلن پایه',
    'حسابداری دوطرفه کامل',
    'فروش نسیه و قسطی',
    'کارتخوان و پرداخت کارتی',
    'گزارش‌های پیشرفته مالی',
    'تراز آزمایشی و چارت حساب‌ها',
    'سند حسابداری دستی',
  ],
  enterprise: [
    'تمام قابلیت‌های پلن پیشرفته',
    'اتصال به سامانه مودیان',
    'حسابداری شعب و تلفیقی',
    'مدیریت چند صندوق',
    'بستن سال مالی هوشمند',
    'گزارش‌های سازمانی',
    'پشتیبانی اختصاصی',
  ],
}

// ═══════════════════════════════════════════════════════════════
//  نوع داده وضعیت به‌روزرسانی
// ═══════════════════════════════════════════════════════════════

interface UpdateStatus {
  status: 'active' | 'needs_update' | 'locked'
  daysUntilUpdate: number
  needsUpdate: boolean
  isLocked: boolean
  canCreate: boolean
  discountPercent: number
  message: string
}

// ═══════════════════════════════════════════════════════════════
//  Page Component
// ═══════════════════════════════════════════════════════════════

export default function UpgradePlanPage() {
  const planName = useStore((s) => s.planName)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const storeName = useStore((s) => s.storeName)

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  // ★ v11.0: دریافت محتوای سایت
  const { content: siteContent } = useSiteContent()

  const currentPlan = resolvePlan(planName)
  const currentPlanName = currentPlan.planName
  const style = PLAN_STYLES[currentPlanName]
  const Icon = style.icon

  // ═══════════════════════════════════════════════════════════════
  // ★ v11.0: استخراج اطلاعات پلن از Site Content
  // ═══════════════════════════════════════════════════════════════
  const planContent = useMemo(() => {
    if (!siteContent?.plans) return null
    return siteContent.plans.find(p => p.name === currentPlanName) || null
  }, [siteContent, currentPlanName])

  // ویژگی‌های پلن از Site Content (با fallback)
  const planFeatures = useMemo(() => {
    if (planContent?.features && planContent.features.length > 0) {
      return planContent.features
    }
    return DEFAULT_FEATURES[currentPlanName]
  }, [planContent, currentPlanName])

  // نام فارسی پلن از Site Content (با fallback)
  const planLabel = planContent?.nameFa || currentPlan.label

  // توضیحات پلن از Site Content
  const planDescription = planContent?.description || ''

  // ═══════════════════════════════════════════════════════════════
  // ★ v11.0: محاسبه قیمت به‌روزرسانی از Site Content
  // ═══════════════════════════════════════════════════════════════
  const planData: any = PLANS[currentPlanName]
  
  // اولویت: updatePrice از Site Content > lifetimePrice از Site Content > مقدار hardcoded
  const baseUpdatePrice = useMemo(() => {
    if (planContent) {
      const updatePrice = (planContent as any).updatePrice
      if (updatePrice && updatePrice > 0) return updatePrice
      if (planContent.lifetimePrice && planContent.lifetimePrice > 0) return planContent.lifetimePrice
    }
    return planData?.lifetimePrice || planData?.annualPrice || 0
  }, [planContent, planData])

  const discountPercent = updateStatus?.discountPercent || 0
  const discountedPrice = Math.round(baseUpdatePrice * (1 - discountPercent / 100))
  const savings = baseUpdatePrice - discountedPrice

  // ★ بارگذاری وضعیت به‌روزرسانی
  // ★ v10.4: تشخیص SUBSCRIPTION_EXPIRED از middleware (403)
  useEffect(() => {
    async function fetchStatus() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) {
          setLoading(false)
          return
        }
        
        const res = await fetch('/api/subscription/update-status?_t=' + Date.now(), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        
        // ★ v10.4: تشخیص قفل از middleware (پاسخ 403)
        if (res.status === 403) {
          try {
            const errData = await res.json()
            if (errData.code === 'SUBSCRIPTION_EXPIRED') {
              console.log('[UpgradePage] 🔒 SUBSCRIPTION_EXPIRED from middleware')
              setUpdateStatus({
                status: 'locked',
                daysUntilUpdate: 0,
                needsUpdate: true,
                isLocked: true,
                canCreate: false,
                discountPercent: 0,
                message: 'سیستم قفل شده است',
              })
              setLoading(false)
              return
            }
          } catch {}
        }
        
        const data = await res.json()
        
        // ★ v10.4: تشخیص قفل از success: false با SUBSCRIPTION_EXPIRED
        if (!data.success && data.code === 'SUBSCRIPTION_EXPIRED') {
          console.log('[UpgradePage] 🔒 SUBSCRIPTION_EXPIRED in response')
          setUpdateStatus({
            status: 'locked',
            daysUntilUpdate: 0,
            needsUpdate: true,
            isLocked: true,
            canCreate: false,
            discountPercent: 0,
            message: 'سیستم قفل شده است',
          })
          setLoading(false)
          return
        }
        
        if (data.success && data.data) {
          setUpdateStatus(data.data)
        }
      } catch (err) {
        console.error('[UpgradePage] Error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStatus()
  }, [])

  // ★ شمارش معکوس (در صورت نیاز)
  useEffect(() => {
    if (!updateStatus || updateStatus.daysUntilUpdate <= 0) return

    const updateCountdown = () => {
      setCountdown({
        days: updateStatus.daysUntilUpdate,
        hours: 0,
        minutes: 0,
        seconds: 0,
      })
    }

    updateCountdown()
  }, [updateStatus])

  // ★ v10.4: تشخیص پارامترهای URL بعد از بازگشت از درگاه پرداخت
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const url = new URL(window.location.href)
    const success = url.searchParams.get('success')
    const error = url.searchParams.get('error')
    const duplicate = url.searchParams.get('duplicate')
    
    if (success === '1') {
      console.log('[UpgradePage] 🎉 Payment successful — refreshing status...')
      
      window.history.replaceState({}, '', window.location.pathname)
      
      if (duplicate === '1') {
        console.log('[UpgradePage] ⚠️ Duplicate payment detected')
      }
      
      setTimeout(async () => {
        setLoading(true)
        try {
          const token = localStorage.getItem('token')
          if (token) {
            const res = await fetch('/api/subscription/update-status?_t=' + Date.now(), {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
            })
            
            let newData: any = null
            
            if (res.status === 403) {
              try {
                newData = await res.json()
                if (newData.code === 'SUBSCRIPTION_EXPIRED') {
                  setUpdateStatus({
                    status: 'locked',
                    daysUntilUpdate: 0,
                    needsUpdate: true,
                    isLocked: true,
                    canCreate: false,
                    discountPercent: 0,
                    message: 'سیستم قفل شده است',
                  })
                  setLoading(false)
                  return
                }
              } catch {}
            } else {
              newData = await res.json()
            }
            
            if (newData?.success && newData.data) {
              setUpdateStatus(newData.data)
              
              if (!newData.data.isLocked && newData.data.daysUntilUpdate === -1) {
                console.log('[UpgradePage] 🔓 Lock released — redirecting to dashboard in 2s')
                setTimeout(() => {
                  setCurrentView('dashboard')
                }, 2000)
              }
            }
          }
        } catch (err) {
          console.error('[UpgradePage] Refresh error:', err)
        } finally {
          setLoading(false)
        }
      }, 1000)
    }
    
    if (error) {
      console.warn('[UpgradePage] ⚠️ Payment error:', error)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ★ شروع پرداخت
  const handlePayment = async () => {
    setProcessing(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        alert('لطفاً ابتدا وارد شوید')
        return
      }

      const res = await fetch('/api/payments/create-update-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planName: currentPlanName,
          amount: discountedPrice,
          discountPercent,
          isLifetime: true,
        }),
      })

      const data = await res.json()

      if (data.success && data.data?.paymentUrl) {
        window.location.href = data.data.paymentUrl
      } else {
        alert(data.error || 'خطا در ایجاد تراکنش')
      }
    } catch (err: any) {
      console.error('[Payment] Error:', err)
      alert('خطا در ارتباط با درگاه پرداخت')
    } finally {
      setProcessing(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentView('dashboard')}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <RefreshCw className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-bold">به‌روزرسانی سیستم</h1>
        </div>
        <Badge className={`text-xs ${style.badge}`}>
          {planLabel}
        </Badge>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* ─── پیام وضعیت ─────────────────────────────────── */}
        {!loading && updateStatus && (
          <>
            {updateStatus.isLocked ? (
              <Alert className="border-red-300 bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <AlertDescription className="text-sm text-red-900">
                  <div className="font-bold mb-1">🔒 سیستم قفل شده است</div>
                  <p className="text-xs leading-relaxed">
                    برای ادامه استفاده از سیستم و دسترسی به تمام قابلیت‌ها، لطفاً هزینه به‌روزرسانی را پرداخت کنید.
                  </p>
                </AlertDescription>
              </Alert>
            ) : updateStatus.daysUntilUpdate <= 3 && updateStatus.daysUntilUpdate > 0 ? (
              <Alert className="border-orange-300 bg-orange-50">
                <Clock className="h-5 w-5 text-orange-600" />
                <AlertDescription className="text-sm text-orange-900">
                  <div className="font-bold mb-1">
                    ⏰ {updateStatus.daysUntilUpdate === 1 ? 'فردا' : `${updateStatus.daysUntilUpdate} روز دیگر`} سیستم نیاز به به‌روزرسانی دارد
                  </div>
                  <p className="text-xs leading-relaxed">
                    برای جلوگیری از قطع دسترسی، الان به‌روزرسانی کنید و از تخفیف ویژه بهره‌مند شوید.
                  </p>
                </AlertDescription>
              </Alert>
            ) : updateStatus.daysUntilUpdate <= 7 ? (
              <Alert className="border-blue-200 bg-blue-50">
                <RefreshCw className="h-5 w-5 text-blue-600" />
                <AlertDescription className="text-sm text-blue-900">
                  <div className="font-bold mb-1">به‌روزرسانی زودهنگام با تخفیف ویژه</div>
                  <p className="text-xs leading-relaxed">
                    {updateStatus.daysUntilUpdate} روز تا به‌روزرسانی بعدی. با پرداخت زودهنگام، تخفیف ویژه دریافت کنید.
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}

        {/* ─── کارت اصلی پلن ─────────────────────────────── */}
        <Card className={`overflow-hidden border-2 ${style.border} shadow-lg`}>
          <div className={`bg-gradient-to-l ${style.gradient} p-6 sm:p-8`}>
            {/* آیکون و نام */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${style.iconBg}`}>
                  <Icon className={`w-8 h-8 text-${style.accentColor}-600`} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    {planLabel}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {storeName || 'فروشگاه شما'}
                  </p>
                </div>
              </div>
              <Badge className={`${style.badge} text-sm px-3 py-1`}>
                پلن فعلی
              </Badge>
            </div>

            {/* توضیح */}
            <div className="bg-white/60 backdrop-blur rounded-lg p-3 mb-6">
              <p className="text-xs text-gray-700 leading-relaxed">
                💡 این به‌روزرسانی مخصوص پلن <strong>{planLabel}</strong> می‌باشد.
                با پرداخت هزینه پشتیبانی، عملکرد سیستم به‌روزتر و بهتر می‌شود.
              </p>
              {/* ★ v11.0: نمایش توضیحات پلن از Site Content */}
              {planDescription && (
                <p className="text-[11px] text-gray-600 leading-relaxed mt-1.5 pt-1.5 border-t border-gray-200/50">
                  {planDescription}
                </p>
              )}
            </div>

            {/* ═══ بخش قیمت ═══ */}
            <div className="bg-white rounded-2xl p-6 shadow-md mb-6">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-bold text-gray-900">
                  هزینه به‌روزرسانی
                </span>
                <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                  تمدید پشتیبانی و به‌روزرسانی
                </Badge>
              </div>

              {/* قیمت اصلی و تخفیف‌دار */}
              <div className="space-y-3">
                {discountPercent > 0 ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-gray-500 line-through">
                        {baseUpdatePrice.toLocaleString('fa-IR')} تومان
                      </span>
                      <Badge className="bg-red-100 text-red-700 text-xs px-2 py-1">
                        {discountPercent}٪ تخفیف
                        {discountPercent === 30 ? ' زودهنگام' : ' ویژه'}
                      </Badge>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-3xl sm:text-4xl font-black text-gray-900">
                          {discountedPrice.toLocaleString('fa-IR')}
                        </span>
                        <span className="text-sm text-gray-600 mr-2">تومان</span>
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] text-gray-500">صرفه‌جویی شما:</div>
                        <div className="text-sm font-bold text-emerald-600">
                          {savings.toLocaleString('fa-IR')} تومان
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl sm:text-4xl font-black text-gray-900">
                        {baseUpdatePrice.toLocaleString('fa-IR')}
                      </span>
                      <span className="text-sm text-gray-600 mr-2">تومان</span>
                    </div>
                    <span className="text-xs text-gray-500">پرداخت یک‌باره</span>
                  </div>
                )}
              </div>

              {/* دکمه پرداخت */}
              <Button
                onClick={handlePayment}
                disabled={processing || baseUpdatePrice <= 0}
                className={`w-full h-14 mt-6 text-base font-bold gap-2 shadow-lg ${style.buttonClass}`}
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    در حال انتقال به درگاه...
                  </>
                ) : baseUpdatePrice <= 0 ? (
                  <>
                    <AlertTriangle className="w-5 h-5" />
                    قیمت به‌روزرسانی تنظیم نشده
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    پرداخت و به‌روزرسانی سیستم
                  </>
                )}
              </Button>

              {/* اطلاعات امنیتی */}
              <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-gray-500">
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  <span>پرداخت امن</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>درگاه زرین‌پال</span>
                </div>
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>فعال‌سازی فوری</span>
                </div>
              </div>
            </div>

            {/* ═══ قابلیت‌ها (از Site Content) ═══ */}
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 text-${style.accentColor}-600`} />
                قابلیت‌های {planLabel}
                {planContent?.features && (
                  <span className="text-[10px] text-gray-400 font-normal">
                    (از صفحه تولید محتوا)
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {planFeatures.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
                    <CheckCircle2 className={`w-4 h-4 text-${style.accentColor}-600 shrink-0`} />
                    <span className="text-xs text-gray-700">{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ محدودیت‌ها ═══ */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-white/60 rounded-lg p-3 text-center">
                <Users className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">کاربر</div>
                <div className="text-xs font-bold text-gray-800">
                  {planData?.maxUsers === 0 ? 'نامحدود' : `${(planData?.maxUsers || 2).toLocaleString('fa-IR')} نفر`}
                </div>
              </div>
              <div className="bg-white/60 rounded-lg p-3 text-center">
                <ShoppingCart className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">محصول</div>
                <div className="text-xs font-bold text-gray-800">
                  {planData?.maxProducts === 0 ? 'نامحدود' : `${(planData?.maxProducts || 100).toLocaleString('fa-IR')}`}
                </div>
              </div>
              <div className="bg-white/60 rounded-lg p-3 text-center">
                <FileText className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">فاکتور</div>
                <div className="text-xs font-bold text-gray-800">
                  {(currentPlan as any).maxInvoicesPerMonth === 0 ? 'نامحدود' : `${((currentPlan as any).maxInvoicesPerMonth || 0).toLocaleString('fa-IR')}`}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ─── سوالات متداول ─────────────────────────────── */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="font-bold text-gray-900 mb-3">سوالات متداول</h3>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span>چرا فقط یک پلن نمایش داده می‌شود؟</span>
                <ChevronLeft className="w-4 h-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                برای راحتی شما، فقط به‌روزرسانی پلن فعلی نمایش داده می‌شود. اگر می‌خواهید به پلن بالاتر ارتقا دهید،
                با پشتیبانی تماس بگیرید.
              </p>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span>آیا پس از پرداخت، سیستم بلافاصله فعال می‌شود؟</span>
                <ChevronLeft className="w-4 h-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                بله، پس از پرداخت موفق، سیستم بلافاصله و بدون نیاز به اقدام اضافی فعال می‌شود.
              </p>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span>مادام‌العمر یعنی چه؟</span>
                <ChevronLeft className="w-4 h-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                با خرید مادام‌العمر، فقط یک‌بار پرداخت می‌کنید و دیگر نیازی به تمدید سالانه نیست.
                سیستم برای همیشه فعال خواهد بود.
              </p>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span>داده‌های من پس از به‌روزرسانی حفظ می‌شوند؟</span>
                <ChevronLeft className="w-4 h-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                بله، تمام داده‌های شما شامل فاکتورها، مشتریان، محصولات و اسناد حسابداری کاملاً حفظ می‌شوند.
              </p>
            </details>
          </CardContent>
        </Card>

        {/* ─── لینک‌های پشتیبانی ─────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <button
            onClick={() => setCurrentView('tickets')}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
          >
            <span>💬</span>
            <span>ارتباط با پشتیبانی</span>
          </button>

          {!updateStatus?.isLocked && (
            <>
              <span className="hidden sm:inline text-gray-300">|</span>
              <button
                onClick={() => setCurrentView('dashboard')}
                className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                <span>بعداً پرداخت می‌کنم</span>
              </button>
            </>
          )}

          {updateStatus?.isLocked && (
            <>
              <span className="hidden sm:inline text-gray-300">|</span>
              <span className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                برای ادامه استفاده، باید به‌روزرسانی کنید
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}