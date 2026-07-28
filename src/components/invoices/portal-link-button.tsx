'use client'

// ============================================================================
// src/components/invoices/portal-link-button.tsx — Portal Link Helper (v3.36)
// ----------------------------------------------------------------------------
// ★ دکمه «لینک پورتال» که در مودال فاکتورها و در جدول مشتریان استفاده می‌شود.
// ★ وقتی کلیک شود:
//   - اگر invoice پاس داده شد: از customerPortalToken مستقیم استفاده می‌کند (بدون API)
//   - اگر فقط customerId پاس داده شد: POST /api/customers/portal-link را صدا می‌زند
//   - توکن در دیتابیس نباشد → خودش تولید می‌کند
// ★ دیالوگ نمایش لینک + QR Code (با کپی/باز کردن در تب جدید + اشتراک‌گذاری)
// ============================================================================

import { useState, useMemo } from 'react'
import {
  Link2,
  Copy,
  ExternalLink,
  QrCode,
  Loader2,
  CheckCircle2,
  Share2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface PortalLinkButtonProps {
  customerId: string | null
  customerName?: string | null
  /** اگر از قبل توکن داریم (مثلاً از روی invoice.customerPortalToken) اینجا پاس بده */
  portalToken?: string | null
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'sm' | 'default' | 'lg' | 'icon'
  className?: string
  /** متن دکمه */
  label?: string
}

export function PortalLinkButton({
  customerId,
  customerName,
  portalToken,
  variant = 'outline',
  size = 'sm',
  className = '',
  label = 'لینک پورتال',
}: PortalLinkButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<string | null>(portalToken || null)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  // ★ اگر customerId نباشد، دکمه غیرفعال
  const canUse = !!customerId

  // ★ URL کامل — بر اساس میزبان فعلی + token
  const fullUrl = useMemo(() => {
    if (!token) return ''
    if (typeof window === 'undefined') return `/portal/${token}`
    const origin = window.location.origin
    return `${origin}/portal/${token}`
  }, [token])

  const handleClick = async () => {
    if (!canUse) {
      toast({
        title: 'امکان پذیر نیست',
        description: 'این فاکتور مشتری ندارد',
        variant: 'destructive',
      })
      return
    }

    // اگر توکن را از قبل داریم، مستقیم دیالوگ را باز کن
    if (token) {
      setOpen(true)
      return
    }

    // در غیر این صورت، از API بگیر
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/customers/portal-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ customerId }),
      })

      const json = await res.json()
      if (json.success) {
        setToken(json.data.portalToken)
        setOpen(true)
      } else {
        toast({
          title: 'خطا',
          description: json.error || 'خطا در دریافت لینک پورتال',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: 'خطا در ارتباط با سرور',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!fullUrl) return
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      toast({ title: 'کپی شد', description: 'لینک پورتال در کلیپ‌بورد کپی شد' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback برای مرورگرهای قدیمی
      const ta = document.createElement('textarea')
      ta.value = fullUrl
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenInNewTab = () => {
    if (!fullUrl) return
    window.open(fullUrl, '_blank', 'noopener,noreferrer')
  }

  const handleShare = async () => {
    if (!fullUrl) return
    // ★ Web Share API (موبایل)
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: 'لینک پورتال مشتری',
          text: `پورتال مشتری ${customerName || ''}`,
          url: fullUrl,
        })
      } catch {
        // کاربر لغو کرد — نادیده
      }
    } else {
      handleCopy()
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={!canUse || loading}
        className={`gap-1 ${className}`}
        title={!canUse ? 'این فاکتور مشتری ندارد' : 'نمایش لینک پورتال مشتری'}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Link2 className="w-3.5 h-3.5" />
        )}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Link2 className="w-4 h-4 text-emerald-600" />
              لینک پورتال مشتری
            </DialogTitle>
            <DialogDescription className="text-xs">
              {customerName ? `مشتری: ${customerName}` : 'این لینک را برای مشتری ارسال کنید تا فاکتورهایش را ببیند و آنلاین پرداخت کند'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* ★ QR Code — با Google Charts API (بدون dependency) */}
            {fullUrl && (
              <div className="flex justify-center p-3 bg-white rounded-lg border border-slate-200">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(fullUrl)}`}
                  alt="QR Code"
                  width={160}
                  height={160}
                  className="rounded"
                />
              </div>
            )}

            {/* ★ نمایش URL قابل انتخاب */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-500 mb-1">لینک پورتال:</p>
              <p
                dir="ltr"
                className="text-[11px] font-mono text-slate-700 break-all select-all text-left"
              >
                {fullUrl || 'در حال بارگذاری...'}
              </p>
            </div>

            {/* ★ توضیحات */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-[11px] text-emerald-700 leading-relaxed">
              <p className="font-bold mb-0.5">راهنمای استفاده:</p>
              <ul className="list-disc pr-4 space-y-0.5 text-emerald-600">
                <li>این لینک را برای مشتری پیامک یا ارسال کنید</li>
                <li>مشتری با موبایل خود وارد پورتال می‌شود</li>
                <li>فاکتورهای نسیه/قسطی + پرداخت آنلاین</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-1"
            >
              <Share2 className="w-3.5 h-3.5" />
              اشتراک‌گذاری
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInNewTab}
              className="gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              باز کردن
            </Button>
            <Button
              size="sm"
              onClick={handleCopy}
              className="bg-emerald-600 hover:bg-emerald-700 gap-1"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  کپی شد
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  کپی لینک
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
