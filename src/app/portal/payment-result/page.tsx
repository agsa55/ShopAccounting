// ============================================================================
// src/app/payment-result/page.tsx — Payment Result (v1.0 ★★★)
// ShopAccounting — صفحه نتیجه پرداخت آنلاین
// ============================================================================

'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, AlertCircle, Loader2, ArrowLeft, Wallet, Home } from 'lucide-react'

function PaymentResultContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const status = searchParams.get('status') as 'success' | 'failed' | 'cancelled' | 'error' | 'already_paid'
  const paymentId = searchParams.get('paymentId')
  const refId = searchParams.get('refId')
  const reason = searchParams.get('reason')
  
  const [portalToken, setPortalToken] = useState<string | null>(null)
  
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('portal_token') : null
    if (saved) setPortalToken(saved)
    
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)portal_token=([^;]+)/)
      if (match) setPortalToken(decodeURIComponent(match[1]))
    }
  }, [])

  const handleBackToPortal = () => {
    if (portalToken) {
      router.push(`/portal/${portalToken}`)
    } else {
      router.push('/')
    }
  }

  const config: Record<string, any> = {
    success: {
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      bgIconColor: 'bg-emerald-100',
      title: 'پرداخت با موفقیت انجام شد! 🎉',
      message: 'پرداخت شما با موفقیت ثبت و فاکتور به‌روزرسانی شد. از خرید شما متشکریم.',
      borderColor: 'border-emerald-200',
    },
    already_paid: {
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      bgIconColor: 'bg-emerald-100',
      title: 'این پرداخت قبلاً ثبت شده است',
      message: 'به نظر می‌رسد این تراکنش قبلاً با موفقیت انجام شده است.',
      borderColor: 'border-emerald-200',
    },
    failed: {
      icon: XCircle,
      iconColor: 'text-red-600',
      bgIconColor: 'bg-red-100',
      title: 'پرداخت ناموفق بود',
      message: 'پرداخت شما با خطا مواجه شد. در صورت کسر مبلغ، تا ۷۲ ساعت به حساب شما بازگردانده می‌شود.',
      borderColor: 'border-red-200',
    },
    cancelled: {
      icon: XCircle,
      iconColor: 'text-gray-500',
      bgIconColor: 'bg-gray-100',
      title: 'پرداخت لغو شد',
      message: 'شما پرداخت را لغو کردید. در صورت تمایل می‌توانید دوباره تلاش کنید.',
      borderColor: 'border-gray-200',
    },
    error: {
      icon: AlertCircle,
      iconColor: 'text-orange-600',
      bgIconColor: 'bg-orange-100',
      title: 'خطا در پرداخت',
      message: reason ? `خطا: ${reason}. لطفاً با پشتیبانی تماس بگیرید.` : 'خطایی در پردازش پرداخت رخ داد.',
      borderColor: 'border-orange-200',
    },
  }

  const c = config[status] || config.error
  const Icon = c.icon

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4" dir="rtl">
      <div className="w-full max-w-md">
        <Card className={`${c.borderColor} shadow-xl`}>
          <CardContent className="pt-8 pb-6 px-6">
            <div className="text-center mb-6">
              <div className={`w-20 h-20 rounded-full ${c.bgIconColor} flex items-center justify-center mx-auto mb-4`}>
                <Icon className={`w-12 h-12 ${c.iconColor}`} />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">{c.title}</h1>
              <p className="text-sm text-gray-600 leading-relaxed">{c.message}</p>
            </div>

            {refId && (
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-700">کد پیگیری</span>
                  <span className="text-sm font-mono font-bold text-emerald-900" dir="ltr">{refId}</span>
                </div>
              </div>
            )}

            {paymentId && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">شناسه پرداخت</span>
                  <span className="text-xs font-mono text-gray-500" dir="ltr">
                    {paymentId.substring(0, 8)}...
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Button
                onClick={handleBackToPortal}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Wallet className="w-4 h-4 ml-2" />
                بازگشت به پورتال مشتری
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push('/')}
                className="w-full h-11"
              >
                <Home className="w-4 h-4 ml-2" />
                بازگشت به صفحه اصلی
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          ShopAccounting — سیستم حسابداری فروشگاهی
        </p>
      </div>
    </div>
  )
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">در حال بارگذاری...</p>
        </div>
      </div>
    }>
      <PaymentResultContent />
    </Suspense>
  )
}