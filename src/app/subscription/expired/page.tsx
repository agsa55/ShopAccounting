'use client'

// ============================================================================
// src/app/subscription/expired/page.tsx — (v5.1 ★★★ Phase 4)
// ShopAccounting — Subscription Expired Page
// ----------------------------------------------------------------------------
// این صفحه وقتی نمایش داده می‌شود که:
//   - API خطای 403 با code=SUBSCRIPTION_EXPIRED برگردانده باشد
//   - یا کاربر دستی به /subscription/expired مراجعه کند
//
// محتوا:
//   - آیکون/هشدار بزرگ «اشتراک منقضی شده»
//   - اطلاعات فروشگاه (نام، پلن قبلی، تاریخ انقضا)
//   - دکمه بزرگ «تمدید اشتراک» → /subscription/renew
//   - توضیح حفظ داده‌ها
// ============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, ShieldCheck, Clock, ArrowLeft } from 'lucide-react'
import { TIER_FA_INFO } from '@/lib/plan-limits'

export default function SubscriptionExpiredPage() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success) {
          setStatus(data.data)
        }
      } catch (err) {
        console.warn('[Expired Page] Failed to fetch status:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

  const tierInfo = status?.tierName ? TIER_FA_INFO[status.tierName] : null
  const expiresAt = status?.expiresAt ? new Date(status.expiresAt) : null

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-100 overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 text-white p-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-3">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold mb-1">اشتراک شما منقضی شده است</h1>
          <p className="text-sm text-red-100">
            برای ادامه استفاده از سیستم، لطفاً اشتراک خود را تمدید کنید
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* اطلاعات اشتراک قبلی */}
          {loading ? (
            <div className="text-center text-gray-500 text-sm">در حال بارگذاری...</div>
          ) : status ? (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">پلن قبلی:</span>
                <span className="text-sm font-bold text-gray-900">
                  {tierInfo?.nameFa || status.tierName || 'نامشخص'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">دوره:</span>
                <span className="text-sm font-bold text-gray-900">
                  {status.billingCycle === 'monthly' ? 'ماهانه' : 'سالیانه'}
                </span>
              </div>
              {expiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">تاریخ انقضا:</span>
                  <span className="text-sm font-bold text-red-600">
                    {expiresAt.toLocaleDateString('fa-IR')}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* اطمینان حفظ داده‌ها */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-emerald-900">داده‌های شما امن است</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                تمام اطلاعات فروشگاه شما (محصولات، فاکتورها، مشتریان) پس از تمدید قابل دسترسی خواهند بود.
              </p>
            </div>
          </div>

          {/* CTA */}
          <Link
            href="/subscription/renew"
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            تمدید اشتراک
          </Link>

          {/* لینک بازگشت */}
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 py-2"
          >
            <ArrowLeft className="w-3 h-3" />
            بازگشت به صفحه اصلی
          </Link>

          {/* توضیحات اضافی */}
          <div className="text-center pt-2 border-t border-gray-100">
            <p className="text-[11px] text-gray-500">
              <Clock className="w-3 h-3 inline ml-1" />
              پشتیبانی: در صورت بروز مشکل، با پشتیبانی فروشگاه تماس بگیرید
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
