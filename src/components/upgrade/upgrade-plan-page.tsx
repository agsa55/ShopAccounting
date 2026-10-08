'use client'

// ============================================================================
// src/components/upgrade/upgrade-plan-page.tsx (v11.3 ★★★)
// ★ v11.3: پرداخت الکترونیکی زرین‌پال + پرداخت کارت‌به‌کارت + ثبت درخواست manual
// ★ v11.3: پشتیبانی از پارامترهای payment=success/cancelled/failed/error
// ★ v11.2: افزودن پرداخت کارت‌به‌کارت + اصلاح نام پلن‌ها + بهبود پیام‌های پرداخت
// ★ v11.1: همسان‌سازی planLabel با helper مشترک getPlanTitle
// ★ v11.0: دریافت ویژگی‌ها و قیمت به‌روزرسانی از Site Content
// ★ v10.4: تشخیص SUBSCRIPTION_EXPIRED از middleware
// ★ v10.4: مخفی کردن "بعداً پرداخت" در حالت قفل
// ★ v10.4: redirect خودکار بعد از پرداخت موفق
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useStore } from '@/lib/store'
import { PLANS, resolvePlan, type PlanName } from '@/lib/plan-features'
import { useSiteContent } from '@/lib/site-content'
import { getPlanTitle } from '@/lib/plan-display'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CheckCircle2,
  ChevronLeft,
  Shield,
  Zap,
  Building2,
  Users,
  ShoppingCart,
  FileText,
  RefreshCw,
  Clock,
  AlertTriangle,
  CreditCard,
  Sparkles,
  X,
  Copy,
  Check,
  Banknote,
  Loader2,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
//  ★ اطلاعات کارت بانکی برای پرداخت کارت‌به‌کارت
// ═══════════════════════════════════════════════════════════════

const SUPPORT_CARD_NUMBER = '6063-7312-9723-0196'
const SUPPORT_CARD_OWNER = 'سید عقیل سادات پور'

// ═══════════════════════════════════════════════════════════════
//  ★ نام‌های محلی و جدید پلن‌ها
//  professional = فروشگاهی
//  enterprise = شرکتی
// ═══════════════════════════════════════════════════════════════

const LOCAL_PLAN_LABELS: Record<PlanName, string> = {
  simple: 'پلن پایه',
  professional: 'پلن فروشگاهی',
  enterprise: 'پلن شرکتی',
}

// ═══════════════════════════════════════════════════════════════
//  استایل هر پلن
// ═══════════════════════════════════════════════════════════════

const PLAN_STYLES: Record<
  PlanName,
  {
    gradient: string
    border: string
    badge: string
    icon: React.ElementType
    iconBg: string
    buttonClass: string
    iconColor: string
    checkColor: string
  }
> = {
  simple: {
    gradient: 'from-emerald-50 to-white',
    border: 'border-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: Shield,
    iconBg: 'bg-emerald-100',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    iconColor: 'text-emerald-600',
    checkColor: 'text-emerald-600',
  },
  professional: {
    gradient: 'from-blue-50 to-white',
    border: 'border-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    icon: Zap,
    iconBg: 'bg-blue-100',
    buttonClass:
      'bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white',
    iconColor: 'text-blue-600',
    checkColor: 'text-blue-600',
  },
  enterprise: {
    gradient: 'from-purple-50 to-white',
    border: 'border-purple-300',
    badge: 'bg-purple-100 text-purple-700',
    icon: Building2,
    iconBg: 'bg-purple-100',
    buttonClass:
      'bg-gradient-to-l from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white',
    iconColor: 'text-purple-600',
    checkColor: 'text-purple-600',
  },
}

// ═══════════════════════════════════════════════════════════════
//  ★ v11.0: ویژگی‌های پیش‌فرض (fallback اگر Site Content نبود)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_FEATURES: Record<PlanName, string[]> = {
  simple: [
    'فروش نقدی و صدور فاکتور',
    'مدیریت کالاها و مشتریان',
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
    'تمام قابلیت‌های پلن فروشگاهی',
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

type PaymentMessage = {
  type: 'success' | 'error' | 'info'
  text: string
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function formatFaNumber(n: number): string {
  return (n || 0).toLocaleString('fa-IR')
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

  // ★ v11.2: وضعیت پیام‌های پرداخت
  const [paymentMessage, setPaymentMessage] = useState<PaymentMessage | null>(null)

  // ★ v11.2: وضعیت کارت‌به‌کارت
  const [cardPaymentOpen, setCardPaymentOpen] = useState(false)
  const [copiedCard, setCopiedCard] = useState(false)
  const [manualLoading, setManualLoading] = useState(false)

  // ★ v11.0: دریافت محتوای سایت
  const { content: siteContent } = useSiteContent()

  const currentPlan = resolvePlan(planName)
  const currentPlanName = currentPlan.planName
  const style = PLAN_STYLES[currentPlanName]
  const Icon = style.icon

  // ★ v11.2: نام پلن با اولویت نام‌های جدید محلی
  const planLabel =
    LOCAL_PLAN_LABELS[currentPlanName] ||
    getPlanTitle(siteContent, currentPlanName, currentPlan.label)

  // ═══════════════════════════════════════════════════════════════
  // ★ v11.0: استخراج اطلاعات پلن از Site Content
  // ═══════════════════════════════════════════════════════════════
  const planContent = useMemo(() => {
    if (!siteContent?.plans) return null
    return siteContent.plans.find((p) => p.name === currentPlanName) || null
  }, [siteContent, currentPlanName])

  // ویژگی‌های پلن از Site Content (با fallback)
  const planFeatures = useMemo(() => {
    if (planContent?.features && planContent.features.length > 0) {
      return planContent.features
    }
    return DEFAULT_FEATURES[currentPlanName]
  }, [planContent, currentPlanName])

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
      if (planContent.lifetimePrice && planContent.lifetimePrice > 0)
        return planContent.lifetimePrice
    }
    return planData?.lifetimePrice || planData?.annualPrice || 0
  }, [planContent, planData])

  const discountPercent = updateStatus?.discountPercent || 0
  const discountedPrice = Math.round(baseUpdatePrice * (1 - discountPercent / 100))
  const savings = baseUpdatePrice - discountedPrice

  const fetchUpdateStatus = useCallback(async () => {
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null
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
  }, [])

  // ★ بارگذاری وضعیت به‌روزرسانی
  useEffect(() => {
    fetchUpdateStatus()
  }, [fetchUpdateStatus])

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

  // ★ v10.4 / v11.3: تشخیص پارامترهای URL بعد از بازگشت از درگاه پرداخت
  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)

    const success = url.searchParams.get('success')
    const error = url.searchParams.get('error')
    const duplicate = url.searchParams.get('duplicate')

    const payment = url.searchParams.get('payment')
    const refId = url.searchParams.get('refId') || url.searchParams.get('ref_id')
    const message = url.searchParams.get('message')
    const reason = url.searchParams.get('reason')
    const code = url.searchParams.get('code')

    let hasHandled = false

    const isSuccess = payment === 'success' || payment === 'already_paid' || success === '1'

    if (isSuccess) {
      hasHandled = true
      console.log('[UpgradePage] 🎉 Payment successful — refreshing status...')

      let successText =
        payment === 'already_paid'
          ? 'این پرداخت قبلاً تأیید شده بود.'
          : 'پرداخت با موفقیت انجام شد.'

      if (refId) {
        successText += ` کد تراکنش: ${refId}`
      }

      if (duplicate === '1') {
        successText += ' — این تراکنش قبلاً تأیید شده بود.'
      }

      setPaymentMessage({
        type: 'success',
        text: successText,
      })

      setTimeout(async () => {
        setLoading(true)
        await fetchUpdateStatus()

        // اگر قفل باز شد، به داشبورد برو
        // برای اطمینان، یک بار دیگر وضعیت را چک می‌کنیم
        try {
          const token = localStorage.getItem('token')
          if (!token) return

          const res = await fetch('/api/subscription/update-status?_t=' + Date.now(), {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          })

          let newData: any = null

          if (res.status === 403) {
            try {
              newData = await res.json()
            } catch {}
          } else {
            newData = await res.json()
          }

          if (newData?.success && newData.data) {
            setUpdateStatus(newData.data)

            if (!newData.data.isLocked && newData.data.daysUntilUpdate === -1) {
              console.log(
                '[UpgradePage] 🔓 Lock released — redirecting to dashboard in 2s'
              )
              setTimeout(() => {
                setCurrentView('dashboard')
              }, 2000)
            }
          }
        } catch (err) {
          console.error('[UpgradePage] Refresh error:', err)
        } finally {
          setLoading(false)
        }
      }, 1000)
    }

    if (payment === 'cancelled') {
      hasHandled = true
      setPaymentMessage({
        type: 'info',
        text: message
          ? `پرداخت لغو شد: ${message}`
          : 'پرداخت لغو شد. در صورت تمایل می‌توانید دوباره تلاش کنید.',
      })
    }

    if (
      payment === 'failed' ||
      payment === 'error' ||
      payment === 'apply_failed' ||
      error
    ) {
      hasHandled = true

      const parts: string[] = []

      if (message) parts.push(message)
      if (reason) parts.push(`دلیل: ${reason}`)
      if (code) parts.push(`کد: ${code}`)
      if (error) parts.push(String(error))

      setPaymentMessage({
        type: 'error',
        text: parts.length
          ? `خطا در پرداخت: ${parts.join(' — ')}`
          : 'پرداخت ناموفق بود. لطفاً دوباره تلاش کنید یا از پرداخت کارت‌به‌کارت استفاده کنید.',
      })
    }

    if (hasHandled) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchUpdateStatus, setCurrentView])

  // ★ شروع پرداخت الکترونیکی
  const handlePayment = async () => {
    if (processing) return

    setProcessing(true)
    setPaymentMessage(null)

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setPaymentMessage({
          type: 'error',
          text: 'لطفاً ابتدا وارد شوید.',
        })
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
        return
      }

      setPaymentMessage({
        type: 'error',
        text: data.error || 'خطا در ایجاد تراکنش.',
      })
    } catch (err: any) {
      console.error('[Payment] Error:', err)
      setPaymentMessage({
        type: 'error',
        text: 'خطا در ارتباط با درگاه پرداخت.',
      })
    } finally {
      setProcessing(false)
    }
  }

  // ★ ثبت درخواست پرداخت کارت‌به‌کارت
  const handleManualCardRequest = async () => {
    if (manualLoading) return

    setManualLoading(true)
    setPaymentMessage(null)

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setPaymentMessage({
          type: 'error',
          text: 'لطفاً ابتدا وارد شوید.',
        })
        return
      }

      const res = await fetch('/api/payments/manual-card-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planName: currentPlanName,
          discountPercent,
          isLifetime: true,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setCardPaymentOpen(true)
        setPaymentMessage({
          type: 'info',
          text:
            data.message ||
            'درخواست پرداخت کارت‌به‌کارت ثبت شد. لطفاً رسید را در تیکت پشتیبانی ارسال کنید.',
        })
      } else {
        setPaymentMessage({
          type: 'error',
          text: data.error || 'خطا در ثبت درخواست پرداخت کارت‌به‌کارت.',
        })
      }
    } catch (err: any) {
      console.error('[ManualCardRequest] Error:', err)
      setPaymentMessage({
        type: 'error',
        text: 'خطا در ارتباط با سرور.',
      })
    } finally {
      setManualLoading(false)
    }
  }

  // ★ کپی شماره کارت
  const copyCardNumber = async () => {
    const rawCard = SUPPORT_CARD_NUMBER.replace(/[^\d]/g, '')

    try {
      await navigator.clipboard.writeText(rawCard)
      setCopiedCard(true)
      setPaymentMessage({
        type: 'info',
        text: 'شماره کارت کپی شد. لطفاً مبلغ دقیق را واریز کرده و رسید را در تیکت ارسال کنید.',
      })
      setTimeout(() => setCopiedCard(false), 2500)
    } catch {
      setPaymentMessage({
        type: 'info',
        text: 'کپی خودکار انجام نشد. لطفاً شماره کارت را دستی کپی کنید.',
      })
    }
  }

  // ★ کپی کامل اطلاعات پرداخت کارت‌به‌کارت
  const copyPaymentInfo = async () => {
    const lines = [
      `مبلغ به‌روزرسانی: ${formatFaNumber(discountedPrice)} تومان`,
      `شماره کارت: ${SUPPORT_CARD_NUMBER}`,
      `به نام: ${SUPPORT_CARD_OWNER}`,
      `فروشگاه: ${storeName || '—'}`,
      `پلن: ${planLabel}`,
    ]

    const text = lines.join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setPaymentMessage({
        type: 'info',
        text: 'اطلاعات پرداخت کپی شد. لطفاً پس از واریز، رسید را در تیکت ارسال کنید.',
      })
    } catch {
      setPaymentMessage({
        type: 'info',
        text: 'کپی خودکار انجام نشد. لطفاً اطلاعات را دستی یادداشت کنید.',
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

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
        <Badge className={`text-xs ${style.badge}`}>{planLabel}</Badge>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* ─── پیام پرداخت ─────────────────────────────────── */}
        {paymentMessage && (
          <Alert
            className={
              paymentMessage.type === 'success'
                ? 'border-emerald-300 bg-emerald-50'
                : paymentMessage.type === 'error'
                ? 'border-red-300 bg-red-50'
                : 'border-blue-300 bg-blue-50'
            }
          >
            {paymentMessage.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : paymentMessage.type === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            ) : (
              <Sparkles className="h-5 w-5 text-blue-600" />
            )}

            <AlertDescription
              className={
                paymentMessage.type === 'success'
                  ? 'text-sm text-emerald-900'
                  : paymentMessage.type === 'error'
                  ? 'text-sm text-red-900'
                  : 'text-sm text-blue-900'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <p className="leading-relaxed">{paymentMessage.text}</p>
                <button
                  type="button"
                  onClick={() => setPaymentMessage(null)}
                  className="shrink-0 rounded-lg p-1 hover:bg-black/5 transition-colors"
                  aria-label="بستن پیام"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* ─── پیام وضعیت ─────────────────────────────────── */}
        {!loading && updateStatus && (
          <>
            {updateStatus.isLocked ? (
              <Alert className="border-red-300 bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <AlertDescription className="text-sm text-red-900">
                  <div className="font-bold mb-1">🔒 سیستم قفل شده است</div>
                  <p className="text-xs leading-relaxed">
                    برای ادامه استفاده از سیستم و دسترسی به تمام قابلیت‌ها، لطفاً هزینه
                    به‌روزرسانی را پرداخت کنید.
                  </p>
                </AlertDescription>
              </Alert>
            ) : updateStatus.daysUntilUpdate <= 3 && updateStatus.daysUntilUpdate > 0 ? (
              <Alert className="border-orange-300 bg-orange-50">
                <Clock className="h-5 w-5 text-orange-600" />
                <AlertDescription className="text-sm text-orange-900">
                  <div className="font-bold mb-1">
                    ⏰{' '}
                    {updateStatus.daysUntilUpdate === 1
                      ? 'فردا'
                      : `${formatFaNumber(updateStatus.daysUntilUpdate)} روز دیگر`}{' '}
                    سیستم نیاز به به‌روزرسانی دارد
                  </div>
                  <p className="text-xs leading-relaxed">
                    برای جلوگیری از قطع دسترسی، الان به‌روزرسانی کنید و از تخفیف ویژه
                    بهره‌مند شوید.
                  </p>
                </AlertDescription>
              </Alert>
            ) : updateStatus.daysUntilUpdate <= 7 ? (
              <Alert className="border-blue-200 bg-blue-50">
                <RefreshCw className="h-5 w-5 text-blue-600" />
                <AlertDescription className="text-sm text-blue-900">
                  <div className="font-bold mb-1">به‌روزرسانی زودهنگام با تخفیف ویژه</div>
                  <p className="text-xs leading-relaxed">
                    {formatFaNumber(updateStatus.daysUntilUpdate)} روز تا به‌روزرسانی بعدی.
                    با پرداخت زودهنگام، تخفیف ویژه دریافت کنید.
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
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${style.iconBg}`}
                >
                  <Icon className={`w-8 h-8 ${style.iconColor}`} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{planLabel}</h2>
                  <p className="text-sm text-gray-600">{storeName || 'فروشگاه شما'}</p>
                </div>
              </div>
              <Badge className={`${style.badge} text-sm px-3 py-1`}>پلن فعلی</Badge>
            </div>

            {/* توضیح */}
            <div className="bg-white/60 backdrop-blur rounded-lg p-3 mb-6">
              <p className="text-xs text-gray-700 leading-relaxed">
                💡 این به‌روزرسانی مخصوص <strong>{planLabel}</strong> می‌باشد. با پرداخت
                هزینه پشتیبانی، عملکرد سیستم به‌روزتر و بهتر می‌شود.
              </p>
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
                <span className="text-sm font-bold text-gray-900">هزینه به‌روزرسانی</span>
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
                        {formatFaNumber(baseUpdatePrice)} تومان
                      </span>
                      <Badge className="bg-red-100 text-red-700 text-xs px-2 py-1">
                        {formatFaNumber(discountPercent)}٪ تخفیف
                        {discountPercent === 30 ? ' زودهنگام' : ' ویژه'}
                      </Badge>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-3xl sm:text-4xl font-black text-gray-900">
                          {formatFaNumber(discountedPrice)}
                        </span>
                        <span className="text-sm text-gray-600 mr-2">تومان</span>
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] text-gray-500">صرفه‌جویی شما:</div>
                        <div className="text-sm font-bold text-emerald-600">
                          {formatFaNumber(savings)} تومان
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl sm:text-4xl font-black text-gray-900">
                        {formatFaNumber(baseUpdatePrice)}
                      </span>
                      <span className="text-sm text-gray-600 mr-2">تومان</span>
                    </div>
                    <span className="text-xs text-gray-500">پرداخت یک‌باره</span>
                  </div>
                )}
              </div>

              {/* دکمه پرداخت الکترونیکی */}
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
                    پرداخت الکترونیکی و به‌روزرسانی سیستم
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

              {/* ═══════════════════════════════════════════════
                  ★ v11.3: پرداخت کارت‌به‌کارت
              ═══════════════════════════════════════════════ */}
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/20">
                    <Banknote className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-black text-amber-900">
                      پرداخت با کارت‌به‌کارت
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800/90">
                      اگر ترجیح می‌دهید به‌صورت مستقیم به کارت بانکی واریز کنید، می‌توانید
                      مبلغ به‌روزرسانی را به شماره کارت زیر واریز کرده و پس از ثبت درخواست،
                      رسید پرداخت را از طریق تیکت پشتیبانی ارسال کنید.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCardPaymentOpen((v) => !v)}
                        className="h-8 rounded-xl border-amber-300 bg-white/70 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        {cardPaymentOpen ? 'بستن اطلاعات کارت' : 'مشاهده اطلاعات کارت'}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={copyCardNumber}
                        className="h-8 rounded-xl text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        {copiedCard ? (
                          <>
                            <Check className="ml-1 h-3.5 w-3.5 text-emerald-600" />
                            کپی شد
                          </>
                        ) : (
                          <>
                            <Copy className="ml-1 h-3.5 w-3.5" />
                            کپی شماره کارت
                          </>
                        )}
                      </Button>
                    </div>

                    {cardPaymentOpen && (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-amber-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-gray-600">
                              مبلغ قابل پرداخت
                            </span>
                            <span className="text-sm font-black text-gray-900">
                              {formatFaNumber(discountedPrice)} تومان
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-gray-600">
                              شماره کارت
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={copyCardNumber}
                              className="h-6 rounded-lg px-2 text-[10px] font-bold text-amber-700 hover:bg-amber-50"
                            >
                              {copiedCard ? (
                                <>
                                  <Check className="ml-1 h-3 w-3 text-emerald-600" />
                                  کپی شد
                                </>
                              ) : (
                                <>
                                  <Copy className="ml-1 h-3 w-3" />
                                  کپی
                                </>
                              )}
                            </Button>
                          </div>

                          <p
                            dir="ltr"
                            className="text-center font-mono text-sm font-black tracking-wider text-gray-800"
                          >
                            {SUPPORT_CARD_NUMBER}
                          </p>
                          <p className="mt-1 text-center text-[10px] text-gray-500">
                            به نام: {SUPPORT_CARD_OWNER}
                          </p>
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <p className="text-[11px] font-bold text-blue-900 mb-2">
                            مراحل پرداخت کارت‌به‌کارت:
                          </p>
                          <ol className="space-y-1.5 text-[11px] leading-relaxed text-blue-900/90 list-decimal list-inside">
                            <li>مبلغ دقیق {formatFaNumber(discountedPrice)} تومان را به کارت بالا واریز کنید.</li>
                            <li>دکمه «ثبت درخواست پرداخت کارت‌به‌کارت» را بزنید تا درخواست شما ثبت شود.</li>
                            <li>از رسید پرداخت اسکرین‌شات یا عکس بگیرید.</li>
                            <li>به بخش تیکت پشتیبانی بروید و رسید را ارسال کنید.</li>
                            <li>پس از بررسی و تأیید پشتیبانی، سیستم شما فعال می‌شود.</li>
                          </ol>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleManualCardRequest}
                            disabled={manualLoading || baseUpdatePrice <= 0}
                            className="h-9 rounded-xl bg-gradient-to-l from-amber-500 to-orange-500 text-xs font-black text-white shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 disabled:opacity-60"
                          >
                            {manualLoading ? (
                              <>
                                <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
                                در حال ثبت درخواست...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="ml-1 h-3.5 w-3.5" />
                                ثبت درخواست پرداخت کارت‌به‌کارت
                              </>
                            )}
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={copyPaymentInfo}
                            className="h-9 rounded-xl border-amber-300 bg-white text-xs font-bold text-amber-800 hover:bg-amber-50"
                          >
                            <Copy className="ml-1 h-3.5 w-3.5" />
                            کپی اطلاعات کامل پرداخت
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setCurrentView('tickets')}
                            className="h-9 rounded-xl bg-white border border-blue-300 text-xs font-bold text-blue-700 hover:bg-blue-50"
                          >
                            <FileText className="ml-1 h-3.5 w-3.5" />
                            ارسال رسید در تیکت
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ قابلیت‌ها (از Site Content) ═══ */}
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${style.checkColor}`} />
                قابلیت‌های {planLabel}
                {planContent?.features && (
                  <span className="text-[10px] text-gray-400 font-normal">
                    (از صفحه تولید محتوا)
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {planFeatures.map((feat, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2"
                  >
                    <CheckCircle2 className={`w-4 h-4 ${style.checkColor} shrink-0`} />
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
                  {planData?.maxUsers === 0
                    ? 'نامحدود'
                    : `${formatFaNumber(planData?.maxUsers || 2)} نفر`}
                </div>
              </div>
              <div className="bg-white/60 rounded-lg p-3 text-center">
                <ShoppingCart className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">محصول</div>
                <div className="text-xs font-bold text-gray-800">
                  {planData?.maxProducts === 0
                    ? 'نامحدود'
                    : formatFaNumber(planData?.maxProducts || 100)}
                </div>
              </div>
              <div className="bg-white/60 rounded-lg p-3 text-center">
                <FileText className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <div className="text-[10px] text-gray-500">فاکتور</div>
                <div className="text-xs font-bold text-gray-800">
                  {(currentPlan as any).maxInvoicesPerMonth === 0
                    ? 'نامحدود'
                    : formatFaNumber((currentPlan as any).maxInvoicesPerMonth || 0)}
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
                برای راحتی شما، فقط به‌روزرسانی پلن فعلی نمایش داده می‌شود. اگر می‌خواهید به
                پلن بالاتر ارتقا دهید، با پشتیبانی تماس بگیرید.
              </p>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span>آیا پس از پرداخت، سیستم بلافاصله فعال می‌شود؟</span>
                <ChevronLeft className="w-4 h-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                بله، در پرداخت الکترونیکی پس از تأیید درگاه، سیستم معمولاً بلافاصله فعال
                می‌شود. در پرداخت کارت‌به‌کارت پس از بررسی رسید توسط پشتیبانی فعال می‌گردد.
              </p>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span>مادام‌العمر یعنی چه؟</span>
                <ChevronLeft className="w-4 h-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                با خرید مادام‌العمر، فقط یک‌بار پرداخت می‌کنید و دیگر نیازی به تمدید سالانه
                نیست. سیستم برای همیشه فعال خواهد بود.
              </p>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span>داده‌های من پس از به‌روزرسانی حفظ می‌شوند؟</span>
                <ChevronLeft className="w-4 h-4 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                بله، تمام داده‌های شما شامل فاکتورها، مشتریان، کالاها و اسناد حسابداری
                کاملاً حفظ می‌شوند.
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