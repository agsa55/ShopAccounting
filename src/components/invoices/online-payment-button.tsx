// ============================================================================
// src/components/invoices/online-payment-button.tsx — v3.33 ★★★
// ShopAccounting — Online Payment Button
// ============================================================================
// ★★★ v3.33: دکمه پرداخت آنلاین فاکتور
//
// این کامپوننت یک دکمه است که کاربر را به درگاه پرداخت هدایت می‌کند.
//
// نحوه استفاده:
//   import { OnlinePaymentButton } from '@/components/invoices/online-payment-button'
//   <OnlinePaymentButton invoiceId={invoice.id} amount={invoice.remainingAmount} />
// ============================================================================

'use client'

import { useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OnlinePaymentButtonProps {
  invoiceId: string
  amount: number
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  /** اگر true، فقط آیکون نمایش داده شود */
  iconOnly?: boolean
}

export function OnlinePaymentButton({
  invoiceId,
  amount,
  variant = 'default',
  size = 'sm',
  className = '',
  iconOnly = false,
}: OnlinePaymentButtonProps) {
  const [loading, setLoading] = useState(false)

  const handlePayment = async () => {
    if (!invoiceId || amount <= 0) return
    setLoading(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/payments/online/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ invoiceId }),
      })

      const data = await res.json()

      if (data.success && data.data.paymentUrl) {
        // ★ هدایت کاربر به درگاه پرداخت
        window.location.href = data.data.paymentUrl
      } else {
        alert(data.error || 'خطا در ایجاد لینک پرداخت')
      }
    } catch (err: any) {
      console.error('[OnlinePaymentButton] Error:', err)
      alert(err?.message || 'خطا در ارتباط با سرور')
    }
    setLoading(false)
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handlePayment}
      disabled={loading || !invoiceId || amount <= 0}
      className={className}
      title={iconOnly ? 'پرداخت آنلاین' : undefined}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <CreditCard className="w-3.5 h-3.5" />
      )}
      {!iconOnly && (
        <span className="mr-1">پرداخت آنلاین</span>
      )}
    </Button>
  )
}

export default OnlinePaymentButton
