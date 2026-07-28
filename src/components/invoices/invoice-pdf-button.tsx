// ============================================================================
// src/components/invoices/invoice-pdf-button.tsx — v3.32 ★★★
// ShopAccounting — Invoice PDF Download Button
// ============================================================================
// ★★★ v3.32: دکمه دانلود/چاپ PDF فاکتور
//
// این کامپوننت یک دکمه است که فاکتور را در تب جدید باز می‌کند.
// کاربر می‌تواند با Ctrl+P آن را به PDF تبدیل کند.
//
// نحوه استفاده:
//   import { InvoicePDFButton } from '@/components/invoices/invoice-pdf-button'
//   <InvoicePDFButton invoiceId={invoice.id} />
// ============================================================================

'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface InvoicePDFButtonProps {
  invoiceId: string
  invoiceNumber?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  /** اگر true، فقط آیکون نمایش داده شود (بدون متن) */
  iconOnly?: boolean
}

export function InvoicePDFButton({
  invoiceId,
  invoiceNumber,
  variant = 'outline',
  size = 'sm',
  className = '',
  iconOnly = false,
}: InvoicePDFButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleOpenPDF = async () => {
    if (!invoiceId) return
    setLoading(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      // ★ باز کردن در تب جدید
      const url = `/api/invoices/${invoiceId}/pdf`
      // ★ چون API نیاز به Authorization دارد، از fetch استفاده می‌کنیم و سپس blob را نمایش می‌دهیم
      const res = await fetch(url, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })

      if (!res.ok) {
        throw new Error('خطا در دریافت فاکتور')
      }

      const html = await res.text()
      // ★ باز کردن HTML در تب جدید
      const newWindow = window.open('', '_blank')
      if (newWindow) {
        newWindow.document.write(html)
        newWindow.document.close()
      } else {
        // ★ اگر popup block شد
        alert('لطفاً اجازه باز شدن popup را بدهید تا فاکتور نمایش داده شود')
      }
    } catch (err: any) {
      console.error('[InvoicePDFButton] Error:', err)
      alert(err?.message || 'خطا در تولید PDF فاکتور')
    }
    setLoading(false)
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleOpenPDF}
      disabled={loading || !invoiceId}
      className={className}
      title={iconOnly ? 'دانلود/چاپ فاکتور' : undefined}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <FileDown className="w-3.5 h-3.5" />
      )}
      {!iconOnly && (
        <span className="mr-1">PDF</span>
      )}
    </Button>
  )
}

export default InvoicePDFButton
