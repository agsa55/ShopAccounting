// ============================================================================
// src/components/invoices/online-payment-button.tsx — v9.0 ★★★
// ShopAccounting — Online Payment Button
// ============================================================================
// ★★★ v9.0:
//   ✓ تغییر endpoint به /api/payments/online/create (درگاه اختصاصی فروشگاه)
//   ✓ پشتیبانی از portal_token (مشتری) و token (فروشگاه‌دار)
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
      // ★ v9.0: پشتیبانی از توکن پورتال (مشتری) و توکن اصلی (فروشگاه‌دار)
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('portal_token') || localStorage.getItem('token'))
        : null

      // ★ v9.0: تغییر endpoint به create (درگاه اختصاصی فروشگاه)
      const res = await fetch('/api/payments/online/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ invoiceId }),
      })

      const data = await res.json()

      const paymentUrl = data.data?.paymentUrl || data.data?.gatewayUrl
      if (data.success && paymentUrl) {
        // ★ هدایت کاربر به درگاه پرداخت
        window.location.href = paymentUrl
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