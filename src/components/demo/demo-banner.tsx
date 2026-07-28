'use client'

// ============================================================================
// src/components/demo/demo-banner.tsx (v9.1 ★★★)
// ShopAccounting — Demo Trial Banner
// ----------------------------------------------------------------------------
// این کامپوننت یک بنر زرد در بالای داشبورد نمایش می‌دهد که نشان می‌دهد:
//   - کاربر در حالت تست دمو است
//   - چند روز/ساعت باقی‌مانده
//   - دکمه «خرید پلن» برای ارتقا
//
// ★ این بنر فقط برای tenant های دمو نمایش داده می‌شود
// ============================================================================

import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Clock, AlertCircle, Sparkles, ArrowLeft, X, Zap,
} from 'lucide-react'

interface DemoStatus {
  isDemo: boolean
  isExpired: boolean
  daysRemaining: number
  hoursRemaining: number
  expiresAt: string | null
  startedAt: string | null
  totalDays: number
}

export function DemoBanner() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  // ─── بررسی وضعیت دمو ────────────────────────────────────────────
  useEffect(() => {
    if (!currentTenant) {
      setLoading(false)
      return
    }

    let mounted = true

    const checkDemoStatus = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const res = await fetch('/api/demo/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (!mounted) return

        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.isDemo) {
            setDemoStatus(data.data)
          } else {
            setDemoStatus(null)
          }
        } else if (res.status === 410) {
          // ★ دمو منقضی شده — باید logout و هدایت به صفحه خرید
          console.log('[DemoBanner] Demo expired — redirecting to landing page')
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token')
            localStorage.removeItem('refreshToken')
            localStorage.removeItem('user')
            // ★ هدایت به صفحه اصلی با پیام
            window.location.href = '/?demo_expired=1'
          }
        }
      } catch (err) {
        // ★ خطا → احتمالاً tenant دمو نیست، بنر را نشان نده
        if (mounted) setDemoStatus(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    checkDemoStatus()

    // ★ هر ۵ دقیقه وضعیت را به‌روزرسانی کن
    const interval = setInterval(checkDemoStatus, 5 * 60 * 1000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [currentTenant])

  // ─── اگر در حال بارگذاری یا دمو نیست ────────────────────────────
  if (loading || !demoStatus || !demoStatus.isDemo) {
    return null
  }

  // ─── اگر کاربر بنر را بسته ───────────────────────────────────────
  if (dismissed) {
    // ★ یک بنر کوچک در گوشه نمایش بده
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setDismissed(false)}
          className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5"
        >
          <Clock className="w-3 h-3" />
          دمو: {demoStatus.daysRemaining} روز
        </button>
      </div>
    )
  }

  // ─── بنر اصلی ───────────────────────────────────────────────────
  const isUrgent = demoStatus.daysRemaining <= 1
  const bgColor = isUrgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
  const textColor = isUrgent ? 'text-red-900' : 'text-amber-900'
  const iconColor = isUrgent ? 'text-red-600' : 'text-amber-600'
  const btnColor = isUrgent ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'

  return (
    <Card className={`${bgColor} border-2 mx-2 sm:mx-3 md:mx-4 lg:mx-6 mt-2`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* ─── آیکون و متن ─── */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg ${isUrgent ? 'bg-red-100' : 'bg-amber-100'} flex items-center justify-center shrink-0`}>
              {isUrgent ? (
                <AlertCircle className={`w-5 h-5 ${iconColor}`} />
              ) : (
                <Clock className={`w-5 h-5 ${iconColor}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <p className={`text-sm font-bold ${textColor}`}>
                  حالت تست دمو
                </p>
                <Badge className={`${isUrgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'} text-[9px]`}>
                  <Sparkles className="w-2.5 h-2.5 ml-0.5" />
                  {demoStatus.totalDays} روز رایگان
                </Badge>
              </div>
              <p className={`text-xs ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
                {isUrgent ? (
                  <>⚠ فقط <span className="font-bold">{demoStatus.hoursRemaining} ساعت</span> تا پایان تست دمو — برای حفظ اطلاعات خود پلن خریداری کنید</>
                ) : (
                  <><span className="font-bold">{demoStatus.daysRemaining} روز</span> تا پایان تست دمو باقی مانده — پس از آن تمام اطلاعات حذف می‌شود</>
                )}
              </p>
            </div>
          </div>

          {/* ─── دکمه‌ها ─── */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className={`${btnColor} text-white h-8 text-xs`}
              onClick={() => setCurrentView('settings')}
            >
              <Zap className="w-3 h-3 ml-1" />
              خرید پلن
              <ArrowLeft className="w-3 h-3 mr-1" />
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 rounded hover:bg-black/5 transition-colors"
              title="بستن"
            >
              <X className={`w-4 h-4 ${iconColor}`} />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
