'use client'

// ============================================================================
// src/components/portal/installment-pay-button.tsx — v9.0 ★★★
// ----------------------------------------------------------------------------
// ★ دکمه پرداخت آنلاین برای یک قسط خاص (نه کل فاکتور)
// ★★★ v9.0: تغییر endpoint به /api/payments/online/create (درگاه اختصاصی فروشگاه)
// ============================================================================

import { useState } from 'react'
import { CreditCard, Loader2, Lock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface InstallmentPayButtonProps {
  invoiceId: string
  installmentId: string
  installmentNumber: number
  amount: number
  dueDate: string
  canPay?: boolean
  disabledReason?: string
   variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  label?: string
}

export function InstallmentPayButton({
  invoiceId,
  installmentId,
  installmentNumber,
  amount,
  dueDate,
  canPay = true,
  disabledReason,
  variant = 'default',
  size = 'sm',
  className = '',
  label,
}: InstallmentPayButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (!canPay || loading) return

    setLoading(true)
    setError(null)

    try {
      // ★ دریافت portal_token (در صورت وجود در پورتال)
      const portalToken = typeof window !== 'undefined'
        ? localStorage.getItem('portal_token')
        : null

      // ★ v9.0: تغییر endpoint به create (درگاه اختصاصی فروشگاه)
      const res = await fetch('/api/payments/online/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(portalToken ? { Authorization: `Bearer ${portalToken}` } : {}),
        },
        body: JSON.stringify({ invoiceId, installmentId }),
      })

      const data = await res.json()

      const paymentUrl = data.data?.paymentUrl || data.data?.gatewayUrl
      if (data.success && paymentUrl) {
        // ★ redirect به درگاه پرداخت
        window.location.href = paymentUrl
      } else {
        setError(data.error || 'خطا در ایجاد درخواست پرداخت')
        setLoading(false)
      }
    } catch (err: any) {
      console.error('[InstallmentPayButton] Error:', err)
      setError('خطا در ارتباط با سرور')
      setLoading(false)
    }
  }

  // ★ اگر قسط قابل پرداخت نیست
  if (!canPay) {
    return (
      <div
        className="inline-flex items-center gap-1 text-[10px] text-gray-400 px-2 py-1 rounded"
        title={disabledReason}
      >
        <Lock className="w-3 h-3" />
        {disabledReason || 'غیرفعال'}
      </div>
    )
  }

  // ★ اگر در حال loading
  if (loading) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled
        className={`gap-1 ${className}`}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        در حال اتصال به درگاه...
      </Button>
    )
  }

  // ★ اگر خطا
  if (error) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="destructive"
          size={size}
          onClick={handleClick}
          className={`gap-1 ${className}`}
        >
          <AlertCircle className="w-3 h-3" />
          تلاش مجدد
        </Button>
        <span className="text-[9px] text-red-500">{error}</span>
      </div>
    )
  }

  // ★ حالت عادی
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={`gap-1 ${className}`}
    >
      <CreditCard className="w-3 h-3" />
      {label || `پرداخت قسط ${installmentNumber}`}
    </Button>
  )
}