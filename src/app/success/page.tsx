'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Sparkles, ArrowLeft, Crown, Store, Infinity } from 'lucide-react'
import { Button } from '@/components/ui/button'

function SuccessContent() {
  const searchParams = useSearchParams()
  const subdomain = searchParams.get('subdomain') || ''
  const planName = searchParams.get('plan') || 'simple'

  const planLabels: Record<string, string> = {
    simple: 'پلن پایه',
    professional: 'پلن پیشرفته',
    enterprise: 'پلن حرفه‌ای',
  }

  // ★ استفاده از window.location.href به جای router.push
  // این کار باعث page reload می‌شود و app-shell.tsx می‌تواند
  // توکن را از localStorage بخواند و user را populate کند
  const goToDashboard = () => {
    console.log('[Success] Navigating to dashboard via full reload...')
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4" dir="rtl">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center border border-emerald-100">
          
          {/* آیکون موفقیت */}
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-emerald-400 rounded-full blur-xl opacity-30 animate-pulse" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-xl">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-black text-gray-900 mb-2">
            🎉 ثبت‌نام با موفقیت انجام شد!
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            حساب شما ایجاد شد. از تمام امکانات پلن انتخابی استفاده کنید.
          </p>

          {/* اطلاعات حساب */}
          <div className="bg-gradient-to-bl from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-5 mb-6 space-y-3 text-right">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-violet-600" />
                <span className="text-sm text-gray-600">زیردامنه:</span>
              </div>
              <span className="font-bold text-gray-900" dir="ltr">{subdomain || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-violet-600" />
                <span className="text-sm text-gray-600">پلن:</span>
              </div>
              <span className="font-bold text-violet-700">
                {planLabels[planName] || 'پلن پایه'}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-dashed border-violet-200">
              <div className="flex items-center gap-2">
                <Infinity className="w-4 h-4 text-purple-600" />
                <span className="text-sm text-gray-600">مدت اعتبار:</span>
              </div>
              <span className="font-black text-purple-700">مادام‌العمر</span>
            </div>
          </div>

          {/* مزایا */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-right">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-bold text-amber-900">مزایای حساب شما:</span>
            </div>
            <ul className="space-y-1 text-xs text-amber-800">
              <li>✓ دسترسی کامل به تمام امکانات {planLabels[planName] || 'پلن'}</li>
              <li>✓ پشتیبانی کامل و رایگان</li>
              <li>✓ بدون نیاز به کارت بانکی</li>
              <li>✓ ذخیره‌سازی ابری امن</li>
            </ul>
          </div>

          {/* دکمه ورود */}
          <Button
            onClick={goToDashboard}
            className="w-full h-12 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold gap-2 text-base"
          >
            ورود به داشبورد
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <p className="text-center text-xs text-gray-400 mt-4">
            با کلیک روی دکمه بالا وارد داشبورد می‌شوید
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          در صورت مشکل، با پشتیبانی تماس بگیرید
        </p>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 animate-pulse" />
          </div>
          <p className="text-sm text-gray-500">در حال بارگذاری...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}