'use client'

// ============================================================================
// src/app/demo/phone/page.tsx — Demo Trial: Phone Input (v9.1 ★★★)
// ShopAccounting — First step of 3-day demo trial
// ----------------------------------------------------------------------------
// این صفحه:
//   ۱. شماره موبایل را از کاربر دریافت می‌کند
//   ۲. آن را به /api/demo/register ارسال می‌کند
//   ۳. در صورت موفقیت → هدایت به /demo/otp با demoSessionId
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ShoppingCart, ArrowLeft, Loader2, Phone, AlertCircle, Sparkles,
  CheckCircle2, Clock, Zap, ShieldCheck,
} from 'lucide-react'

export default function DemoPhonePage() {
  const router = useRouter()
  const [mobile, setMobile] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ─── اعتبارسنجی موبایل ──────────────────────────────────────────
  const validateMobile = (value: string): boolean => {
    const cleaned = value.replace(/[\s\-()]/g, '')
    return /^09\d{9}$/.test(cleaned) || /^\+989\d{9}$/.test(cleaned) || /^989\d{9}$/.test(cleaned)
  }

  const handleMobileChange = (value: string) => {
    // ★ فقط اعداد و + را قبول کن
    const filtered = value.replace(/[^\d+]/g, '')
    setMobile(filtered)
    if (error) setError('')
  }

  // ─── ارسال موبایل ────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('')

    if (!mobile) {
      setError('شماره موبایل الزامی است')
      return
    }

    if (!validateMobile(mobile)) {
      setError('فرمت شماره موبایل نامعتبر است (مثال: 09123456789)')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/demo/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      })

      const data = await res.json()

      if (data.success) {
        // ★ هدایت به صفحه OTP با demoSessionId و mockCode (در محیط dev)
        const params = new URLSearchParams({
          mobile: data.data.mobile,
          sessionId: data.data.demoSessionId,
        })
        if (data.data.devCode) {
          params.set('devCode', data.data.devCode)
        }
        router.push(`/demo/otp?${params.toString()}`)
      } else {
        setError(data.error || 'خطا در ارسال کد تأیید')
      }
    } catch (err) {
      console.error('[Demo Phone] Network error:', err)
      setError('خطا در ارتباط با سرور — لطفاً دوباره تلاش کنید')
    } finally {
      setLoading(false)
    }
  }

  // ─── Enter key ───────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50 px-4 py-8" dir="rtl">
      <div className="w-full max-w-md">
        {/* ─── Header ─── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ShopAccounting</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">شروع تست دمو رایگان</h1>
          <p className="text-sm text-gray-600">
            ۳ روز دسترسی کامل به سیستم حسابداری فروشگاهی — بدون نیاز به پرداخت
          </p>
        </div>

        {/* ─── Demo Info Banner ─── */}
        <Card className="border-emerald-200 bg-emerald-50/50 mb-4">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-900 mb-1">۳ روز تست رایگان</p>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  پس از وارد کردن شماره موبایل و تأیید کد، فروشگاه دمو شما بلافاصله فعال می‌شود.
                  پس از ۳ روز، تمام اطلاعات به‌صورت خودکار حذف خواهد شد.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Features List ─── */}
        <Card className="border-gray-200 mb-4">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">در تست دمو به شما دسترسی دارید:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: ShoppingCart, text: 'صدور فاکتور' },
                { icon: Zap, text: 'صندوق فروش (POS)' },
                { icon: CheckCircle2, text: 'مدیریت محصولات' },
                { icon: ShieldCheck, text: 'گزارش‌های مالی' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                  <f.icon className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ─── Main Card ─── */}
        <Card className="border-gray-200 shadow-xl shadow-gray-200/50">
          <CardContent className="pt-6">
            <div className="space-y-5">
              <div className="text-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">شماره موبایل خود را وارد کنید</h2>
                <p className="text-sm text-gray-500 mt-1">کد تأیید به این شماره ارسال می‌شود</p>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <Label htmlFor="mobile" className="text-sm font-medium flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  شماره موبایل
                </Label>
                <Input
                  id="mobile"
                  type="tel"
                  inputMode="tel"
                  placeholder="09123456789"
                  value={mobile}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="text-left h-12 text-base tracking-wider"
                  dir="ltr"
                  disabled={loading}
                  maxLength={13}
                />
                {error && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleSubmit}
                disabled={loading || !mobile}
                className="w-full h-12 text-sm font-medium bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    در حال ارسال کد...
                  </>
                ) : (
                  <>
                    ارسال کد تأیید
                    <ArrowLeft className="w-4 h-4 mr-1" />
                  </>
                )}
              </Button>

              {/* Back Link */}
              <div className="text-center">
                <button
                  onClick={() => router.push('/')}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                  disabled={loading}
                >
                  بازگشت به صفحه اصلی
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Footer Info ─── */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            با ادامه، شما با{' '}
            <a href="#" className="text-emerald-600 underline">قوانین تست دمو</a>
            {' '}موافقت می‌کنید
          </p>
          <p className="text-xs text-gray-400 mt-2">
            می‌خواهید پلن خریداری کنید؟{' '}
            <button
              onClick={() => router.push('/')}
              className="text-emerald-600 underline font-medium"
            >
              مشاهده پلن‌ها
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
