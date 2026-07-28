// ============================================================================
// src/app/portal/payment-result/page.tsx — v3.36.2 ★★★
// ----------------------------------------------------------------------------
// ★ صفحه نمایش نتیجه پرداخت آنلاین پس از بازگشت از درگاه زرین‌پال
// ★ کاربر پس از پرداخت (یا لغو) به این صفحه هدایت می‌شود
// ★ نمایش: موفقیت / لغو / خطا / تکراری
// ★ دکمه بازگشت به پورتال مشتری
// ============================================================================

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Home, RefreshCw,
} from 'lucide-react'

function PaymentResultContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const status = searchParams.get('status') // success | cancelled | failed | already_paid | error
  const invoiceId = searchParams.get('invoiceId')
  const refId = searchParams.get('refId')
  const code = searchParams.get('code')
  const installmentId = searchParams.get('installmentId')
  const reason = searchParams.get('reason')

  // ★ تلاش برای یافتن portal token برای بازگشت به پورتال
  const [portalToken, setPortalToken] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('portal_token')
    if (saved) {
      setPortalToken(saved)
    }
    // ★ همچنین ممکن است token در کوکی باشد
    const match = document.cookie.match(/(?:^|;\s*)portal_token=([^;]+)/)
    if (match) {
      setPortalToken(decodeURIComponent(match[1]))
    }
  }, [])

  const handleBackToPortal = () => {
    if (portalToken) {
      router.push(`/portal/${portalToken}`)
    } else {
      // ★ اگر توکن نبود، به صفحه اصلی
      router.push('/')
    }
  }

  // ★ نمایش بر اساس status
  const config = (() => {
    switch (status) {
      case 'success':
        return {
          icon: CheckCircle2,
          iconColor: 'text-emerald-600',
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          title: 'پرداخت با موفقیت انجام شد',
          message: installmentId
            ? 'قسط موردنظر با موفقیت پرداخت شد. از صبوری شما متشکریم.'
            : 'فاکتور با موفقیت پرداخت شد. از خرید شما متشکریم.',
          showRefId: true,
        }
      case 'already_paid':
        return {
          icon: AlertCircle,
          iconColor: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          title: 'این پرداخت قبلاً ثبت شده است',
          message: 'به نظر می‌رسد این تراکنش قبلاً با موفقیت انجام شده است.',
          showRefId: !!refId,
        }
      case 'cancelled':
        return {
          icon: XCircle,
          iconColor: 'text-gray-500',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          title: 'پرداخت لغو شد',
          message: 'شما پرداخت را لغو کردید. در صورت تمایل می‌توانید دوباره تلاش کنید.',
          showRefId: false,
        }
      case 'failed':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          title: 'پرداخت ناموفق بود',
          message: code
            ? `پرداخت با کد خطای ${code} ناموفق بود. در صورت کسر مبلغ، تا ۲۴ ساعت برگشت داده می‌شود.`
            : 'پرداخت ناموفق بود. لطفاً دوباره تلاش کنید.',
          showRefId: false,
        }
      case 'error':
      default:
        return {
          icon: AlertCircle,
          iconColor: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          title: 'خطا در پردازش پرداخت',
          message: reason
            ? `خطا: ${reason}. لطفاً با پشتیبانی تماس بگیرید.`
            : 'خطای ناشناخته در پردازش پرداخت. لطفاً با پشتیبانی تماس بگیرید.',
          showRefId: false,
        }
    }
  })()

  const Icon = config.icon

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <Card className={`w-full max-w-md shadow-xl ${config.border}`}>
        <CardHeader className="text-center pb-4">
          <div className={`w-16 h-16 ${config.bg} rounded-full flex items-center justify-center mx-auto mb-3`}>
            <Icon className={`w-8 h-8 ${config.iconColor}`} />
          </div>
          <CardTitle className="text-lg text-gray-800">{config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 text-center leading-relaxed">
            {config.message}
          </p>

          {/* ★ نمایش کد پیگیری */}
          {config.showRefId && refId && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
              <p className="text-[10px] text-gray-500 mb-1">کد پیگیری پرداخت:</p>
              <p className="text-base font-bold font-mono text-emerald-700" dir="ltr">
                {refId}
              </p>
            </div>
          )}

          {/* ★ نمایش شناسه فاکتور (در صورت موجود بودن) */}
          {invoiceId && (
            <div className="text-[10px] text-gray-400 text-center">
              شناسه فاکتور: <span className="font-mono">{invoiceId.slice(0, 8)}...</span>
              {installmentId && (
                <span className="mr-2">
                  | قسط: <span className="font-mono">{installmentId.slice(0, 8)}...</span>
                </span>
              )}
            </div>
          )}

          {/* ★ دکمه‌ها */}
          <div className="space-y-2">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={handleBackToPortal}
            >
              <Home className="w-4 h-4 ml-1" />
              بازگشت به پورتال مشتری
            </Button>

            {status === 'failed' || status === 'cancelled' ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleBackToPortal}
              >
                <RefreshCw className="w-4 h-4 ml-1" />
                تلاش مجدد
              </Button>
            ) : null}
          </div>

          {/* ★ توضیحات اضافی */}
          <div className="text-[10px] text-gray-400 text-center pt-2 border-t border-gray-100">
            در صورت存在问题، با پشتیبانی فروشگاه تماس بگیرید
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" dir="rtl">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  )
}
