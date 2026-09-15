'use client'

// ============================================================================
// src/components/settings/basic-year-end-page.tsx — v3.0 ★★★
// ★ v3.0: حذف redirect به /renewal — همه پلن‌ها مادام‌العمر
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BasicYearEndWizard } from '@/components/setup/basic-year-end-wizard'
import {
  Archive, CalendarDays, AlertTriangle, CheckCircle2, Loader2,
  TrendingUp, TrendingDown, Scale, FileText, Info, Crown,
  Clock, RefreshCw, Play, Wallet,
} from 'lucide-react'

const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

const formatMoney = (n: number): string => {
  return toFaNum(Math.round(n).toLocaleString('en-US'))
}

const isoToJalali = (iso: string | null): string => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('fa-IR')
  } catch {
    return '—'
  }
}

interface YearEndData {
  summary: {
    entryCount: number
    totalEntryCount: number
    firstEntryDate: string | null
    lastEntryDate: string | null
    hasClosingEntry: boolean
    lastClosingDate: string | null
  }
  revenue: number
  expenses: number
  cogs: number
  netProfit: number
  closingPreview: {
    revenues: { name: string; balance: number }[]
    expenses: { name: string; balance: number }[]
  }
  subscription: {
    daysRemaining: number | null
    daysFromStart: number | null
    daysSinceLastClose: number | null    // ★ v3.1: روزهای گذشته از آخرین بستن
    isLifetime: boolean
    isExpiringSoon: boolean
    isExpired?: boolean
    canClose: boolean
    closeReason: string
    nextCloseDate: string | null          // ★ v3.1: تاریخ مجاز بعدی برای بستن
  }
  canProceed: boolean
  blockers: string[]
}

export function BasicYearEndPage() {
  const planName = useAppStore((s) => s.planName)
  const currentTenant = useAppStore((s) => s.currentTenant)
  const billingCycle = useAppStore((s) => s.selectedBillingCycle)
  const { toast } = useToast()

  const [data, setData] = useState<YearEndData | null>(null)
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const isBasicPlan = (() => {
    const name = (planName || currentTenant?.planName || currentTenant?.planTierName || '').toLowerCase().trim()
    return name === 'simple' || name === 'basic' || name === '' || name.includes('پایه')
  })()

  const isLifetime = true // ★★★ همه پلن‌ها مادام‌العمر هستند

  // ─── بارگذاری داده‌ها ─────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isBasicPlan) {
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMsg('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

      const res = await fetch('/api/fiscal-years/basic-close-preview', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })

      if (!res.ok) {
        setErrorMsg(`خطای سرور (${res.status})`)
        setLoading(false)
        return
      }

      const result = await res.json()
      console.log('[BasicYearEndPage] API result:', result)

      if (result.success && result.data) {
        setData(result.data)
      } else {
        setErrorMsg(result.error || 'خطا در بارگذاری اطلاعات')
      }
    } catch (err: any) {
      console.error('[BasicYearEndPage] Error:', err)
      setErrorMsg(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }, [isBasicPlan])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  // ─── پلن پایه نیست ─────────────────────────────────────────
  if (!isBasicPlan) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-8 text-center">
            <Crown className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900 mb-2">مدیریت سال مالی</h3>
            <p className="text-xs text-gray-600 mb-4">
              مدیریت کامل سال مالی در پلن‌های پیشرفته و حرفه‌ای در دسترس است.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4" dir="rtl">

      {/* ═══ هدر ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Archive className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">بستن حساب و پایان دوره مالی</h1>
            <p className="text-xs text-gray-500">مدیریت پایان دوره مالی و شروع دوره جدید</p>
          </div>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="gap-1"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          بروزرسانی
        </Button>
      </div>

      {/* ═══ کارت راهنما ═══ */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 space-y-2 leading-relaxed">
              <p className="font-bold">📌 راهنمای بستن حساب</p>
              <p>بستن حساب، آخرین مرحله در هر دوره مالی است. با بستن حساب:</p>
              <ul className="list-disc list-inside space-y-1 pr-2 text-[11px]">
                <li>حساب‌های درآمد و هزینه صفر شده و <strong>سود/زیان</strong> محاسبه می‌شود</li>
                <li>سود/زیان به حساب «سود انباشته» منتقل می‌شود</li>
                <li><strong>سند اختتامیه</strong> صادر می‌شود</li>
                <li className="text-emerald-700 font-bold">
                  ✅ پس از بستن، ویزارد راه‌اندازی دوره جدید به‌صورت خودکار باز می‌شود
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Loading ═══ */}
      {loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500">در حال بارگذاری...</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ خطا ═══ */}
      {!loading && errorMsg && (
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-red-800 mb-2">{errorMsg}</h3>
            <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)} className="gap-1 mt-2">
              <RefreshCw className="w-3.5 h-3.5" />
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ داده‌ها موجود است ═══ */}
      {!loading && !errorMsg && data && (
        <>
                {/* ─── وضعیت اشتراک + محدودیت سالی یک‌بار ─── */}
          <Card className={`border-2 ${
            data.subscription.canClose
              ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-amber-300 bg-amber-50/30'
          }`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    data.subscription.canClose ? 'bg-emerald-100' : 'bg-amber-100'
                  }`}>
                    {data.subscription.canClose
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      : <Clock className="w-5 h-5 text-amber-600" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      {data.subscription.canClose
                        ? '♾️ مجاز به بستن حساب'
                        : '⏰ هنوز زمان بستن فرا نرسیده'
                      }
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {data.subscription.canClose
                        ? data.subscription.closeReason
                        : data.subscription.closeReason
                      }
                    </p>
                  </div>
                </div>
                <Badge className={
                  data.subscription.canClose
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }>
                  {data.subscription.canClose ? 'مجاز' : 'غیرمجاز'}
                </Badge>
              </div>

              {/* ★★★ نمایش شمارش معکوس برای بستن بعدی */}
         {!data.subscription.canClose && (data.subscription.daysRemaining ?? 0) > 0 && (
                <div className="mt-3 p-3 bg-amber-100/50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-800">
                      {toFaNum(data.subscription.daysRemaining)} روز تا مجاز شدن بستن حساب
                    </span>
                  </div>
              {data.subscription.nextCloseDate && (
  <p className="text-[10px] text-amber-700">
    تاریخ مجاز بعدی: {isoToJalali(data.subscription.nextCloseDate)}
  </p>
)}
{data.subscription.daysSinceLastClose != null && data.subscription.daysSinceLastClose > 0 && (
  <p className="text-[10px] text-amber-600 mt-1">
    آخرین بستن: {toFaNum(data.subscription.daysSinceLastClose)} روز پیش
  </p>
)}
                </div>
              )}
            </CardContent>
          </Card>
          {/* ─── خلاصه مالی ─── */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-amber-600" />
                  خلاصه مالی دوره
                </CardTitle>
                <Badge className="bg-gray-100 text-gray-600">
                  {toFaNum(data.summary.entryCount)} سند
                </Badge>
              </div>
              <CardDescription className="text-xs">
                از {isoToJalali(data.summary.firstEntryDate)} تا {isoToJalali(data.summary.lastEntryDate)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* آمار */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                  <div className="text-[10px] text-gray-500">درآمد</div>
                  <div className="text-sm font-bold text-emerald-700 font-mono" dir="ltr">
                    {formatMoney(data.revenue)}
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <TrendingDown className="w-5 h-5 text-red-600 mx-auto mb-1" />
                  <div className="text-[10px] text-gray-500">هزینه‌ها</div>
                  <div className="text-sm font-bold text-red-700 font-mono" dir="ltr">
                    {formatMoney(data.expenses + data.cogs)}
                  </div>
                </div>
                <div className={`rounded-lg p-3 text-center border ${
                  data.netProfit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
                }`}>
                  <Scale className={`w-5 h-5 mx-auto mb-1 ${data.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                  <div className="text-[10px] text-gray-500">
                    {data.netProfit >= 0 ? 'سود خالص' : 'زیان خالص'}
                  </div>
                  <div className={`text-sm font-bold font-mono ${
                    data.netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'
                  }`} dir="ltr">
                    {formatMoney(Math.abs(data.netProfit))}
                  </div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                  <FileText className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                  <div className="text-[10px] text-gray-500">کل اسناد</div>
                  <div className="text-lg font-bold text-purple-700">
                    {toFaNum(data.summary.totalEntryCount)}
                  </div>
                </div>
              </div>

              {/* هشدار اختتامیه قبلی */}
              {data.summary.hasClosingEntry && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-xs text-blue-800">
                    قبلاً یک سند اختتامیه در تاریخ {isoToJalali(data.summary.lastClosingDate)} صادر شده.
                    محاسبات بالا فقط اسناد بعد از آن تاریخ را شامل می‌شود.
                  </AlertDescription>
                </Alert>
              )}

              {/* موانع */}
              {data.blockers.length > 0 && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-xs text-red-800">
                    <strong>موانع:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {data.blockers.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* ═══ پیام محدودیت زمانی (۴ روز) — حذف شد چون مادام‌العمر است ═══ */}

              {/* ═══ پیام مادام‌العمر ═══ */}
              <Alert className="border-purple-200 bg-purple-50 mt-3">
                <Crown className="h-5 w-5 text-purple-600" />
                <AlertDescription className="text-xs text-purple-900">
                  <div className="font-bold">♾️ پلن مادام‌العمر</div>
                  <p>شما هر زمان می‌توانید حساب را ببندید. پس از بستن، ویزارد راه‌اندازی دوره جدید به‌صورت خودکار باز می‌شود.</p>
                </AlertDescription>
              </Alert>

              {/* ═══ دکمه بستن حساب ═══ */}
              <div className="pt-4 border-t border-gray-200">
                <Button
                  onClick={() => setWizardOpen(true)}
                  disabled={!data.canProceed}
                  className={`w-full h-12 text-sm font-bold gap-2 ${
                    data.canProceed
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Archive className="w-5 h-5" />
                  {data.canProceed
                    ? 'شروع فرآیند بستن حساب'
                    : 'ابتدا موانع را برطرف کنید'}
                </Button>
                {!data.canProceed && data.blockers.length > 0 && (
                  <p className="text-[10px] text-red-600 text-center mt-2">
                    ابتدا موانع بالا را برطرف کنید
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ═══ مراحل ═══ */}
      <Card className="border-purple-200 bg-purple-50/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Play className="w-4 h-4 text-purple-600" />
            مراحل بستن حساب
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { step: '۱', title: 'بررسی پیش‌نیازها', desc: 'بررسی اسناد پیش‌نویس و تراز حساب‌ها' },
              { step: '۲', title: 'پیش‌نمایش سند اختتامیه', desc: 'مشاهده حساب‌هایی که صفر می‌شوند' },
              { step: '۳', title: 'تأیید نهایی', desc: 'تأیید و اجرای عملیات' },
              { step: '۴', title: 'اجرا و راه‌اندازی', desc: 'صدور سند اختتامیه + افتتاحیه + باز شدن ویزارد راه‌اندازی' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-purple-100">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 font-bold text-sm">
                  {item.step}
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-800">{item.title}</span>
                  <p className="text-[10px] text-gray-600 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Wizard ═══ */}
      {wizardOpen && data && (
        <BasicYearEndWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          isLifetime={isLifetime}
          onComplete={() => {
            setWizardOpen(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}