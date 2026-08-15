'use client'

// ============================================================================
// src/components/setup/basic-year-end-wizard.tsx — v3.0 ★★★
// ★ v3.0: حذف redirect به /renewal — reload صفحه برای باز شدن SetupWizard
//   - پلن پایه سال مالی ندارد
//   - فقط سند اختتامیه + افتتاحیه (بدون سال مالی)
//   - بعد از بستن، SetupWizard به صورت خودکار باز می‌شود
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Archive, CalendarDays, TrendingUp, TrendingDown, Scale,
  CheckCircle2, AlertTriangle, Loader2, ChevronLeft, ChevronRight,
  FileText, Sparkles, RefreshCw, Crown, Wallet,
} from 'lucide-react'

type WizardStep = 'summary' | 'closing-preview' | 'new-year' | 'executing' | 'completed'

interface YearSummary {
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
    isLifetime: boolean
    isExpiringSoon: boolean
    isExpired?: boolean
    canClose: boolean
    closeReason: string
  }
  canProceed: boolean
  blockers: string[]
}

interface WizardResult {
  closingEntry: any
  openingEntry?: any
  newYear?: any
  netProfit: number
  isLifetime: boolean
}

interface BasicYearEndWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isLifetime: boolean
  onComplete?: () => void
}

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

export function BasicYearEndWizard({ open, onOpenChange, isLifetime, onComplete }: BasicYearEndWizardProps) {
  const { toast } = useToast()

  const [step, setStep] = useState<WizardStep>('summary')
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [summary, setSummary] = useState<YearSummary | null>(null)
  const [newYearName, setNewYearName] = useState('')
  const [result, setResult] = useState<WizardResult | null>(null)
  const [redirectCountdown, setRedirectCountdown] = useState(3)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years/basic-close-preview', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()

      if (data.success && data.data) {
        setSummary(data.data)

        const now = new Date()
        const jalaliYear = now.toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric' })
        setNewYearName(`سال مالی ${jalaliYear}`)
      } else {
        toast({ title: data.error || 'خطا در بارگذاری', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا در ارتباط با سرور', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (open) {
      loadSummary()
      setStep('summary')
      setResult(null)
      setRedirectCountdown(3)
    }
  }, [open, loadSummary])

  // ★★★ حذف redirect به /renewal — همه پلن‌ها مادام‌العمر هستند
  // useEffect قبلی حذف شد

  const executeClose = async () => {
    // ★★★ حذف شرط newYearName چون پلن پایه سال مالی ندارد
    setExecuting(true)
    setStep('executing')

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years/basic-close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}), // ★★★ حذف newYearName
      })
      const data = await res.json()

      if (data.success) {
        setResult(data.data)
        setStep('completed')

        // ★★★ toast موفقیت (مثل fiscal-year-tab)
        toast({
          title: '🎉 حساب با موفقیت بسته شد!',
          description: 'در حال آماده‌سازی ویزارد راه‌اندازی دوره جدید...',
        })
        
        // ★★★ بعد از ۲ ثانیه، Wizard را ببند و صفحه را reload کن
        setTimeout(() => {
          onOpenChange(false)
          
          // ★ بعد از ۵۰۰ms، صفحه را reload کن تا SetupWizard باز شود
          setTimeout(() => {
            console.log('[BasicYearEndWizard] 🔄 Reloading page to trigger setup wizard...')
            window.location.reload()
          }, 500)
        }, 2000)
      } else {
        toast({ title: data.error || 'خطا در بستن حساب', variant: 'destructive' })
        setStep('new-year')
      }
    } catch (err: any) {
      toast({ title: err?.message || 'خطا در ارتباط', variant: 'destructive' })
      setStep('new-year')
    } finally {
      setExecuting(false)
    }
  }

  const allSteps: WizardStep[] = ['summary', 'closing-preview', 'new-year']

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && step !== 'completed') return
      onOpenChange(v)
    }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Archive className="w-4 h-4 text-amber-600" />
            بستن حساب
            <Badge className="bg-purple-100 text-purple-700 text-[9px]">
              <Crown className="w-3 h-3 ml-0.5" />
              مادام‌العمر
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            فرآیند بستن حساب‌های درآمد و هزینه
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {loading && (
          <div className="py-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-2" />
            <p className="text-xs text-gray-500">در حال بارگذاری اطلاعات...</p>
          </div>
        )}

        {/* Step 1: Summary */}
        {!loading && summary && step === 'summary' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-1 mb-2">
              {allSteps.map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full ${i === 0 ? 'bg-amber-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs">۱</span>
              خلاصه دوره مالی
            </h3>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-bold text-amber-900">دوره مالی فعلی</span>
                </div>
                <Badge className="text-[9px] bg-amber-100 text-amber-700">
                  {toFaNum(summary.summary.entryCount)} سند
                </Badge>
              </div>
              <div className="text-[10px] text-amber-700" dir="ltr">
                {isoToJalali(summary.summary.firstEntryDate)} — {isoToJalali(summary.summary.lastEntryDate)}
              </div>
              {summary.summary.hasClosingEntry && (
                <div className="text-[9px] text-blue-700 mt-1">
                  ℹ️ آخرین اختتامیه: {isoToJalali(summary.summary.lastClosingDate)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                <TrendingUp className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <div className="text-[9px] text-gray-500">درآمد</div>
                <div className="text-xs font-bold text-emerald-700">{formatMoney(summary.revenue)}</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                <TrendingDown className="w-4 h-4 text-red-600 mx-auto mb-1" />
                <div className="text-[9px] text-gray-500">هزینه‌ها</div>
                <div className="text-xs font-bold text-red-700">{formatMoney(summary.expenses + summary.cogs)}</div>
              </div>
              <div className={`${summary.netProfit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border rounded p-2 text-center`}>
                <Scale className={`w-4 h-4 mx-auto mb-1 ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                <div className="text-[9px] text-gray-500">
                  {summary.netProfit >= 0 ? 'سود خالص' : 'زیان خالص'}
                </div>
                <div className={`text-xs font-bold ${summary.netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  {formatMoney(Math.abs(summary.netProfit))}
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
                <Wallet className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <div className="text-[9px] text-gray-500">کل اسناد</div>
                <div className="text-xs font-bold text-purple-700">
                  {toFaNum(summary.summary.totalEntryCount)}
                </div>
              </div>
            </div>

            <div className={`p-3 rounded-lg border-2 bg-purple-50 border-purple-200`}>
              <div className="flex items-center gap-2">
                <Crown className={`w-5 h-5 text-purple-600`} />
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-800">
                    ♾️ پلن مادام‌العمر
                  </div>
                  <div className="text-[10px] text-gray-600">
                    پس از بستن، ویزارد راه‌اندازی دوره جدید به‌صورت خودکار باز می‌شود
                  </div>
                </div>
              </div>
            </div>

            {summary.blockers && summary.blockers.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span className="text-xs font-bold text-red-700">موانع:</span>
                </div>
                <ul className="text-[10px] text-red-700 space-y-0.5 pr-5 list-disc">
                  {summary.blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Closing Preview */}
        {!loading && summary && step === 'closing-preview' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-1 mb-2">
              {allSteps.map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full ${i <= 1 ? 'bg-amber-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs">۲</span>
              پیش‌نمایش سند اختتامیه
            </h3>

            <p className="text-[10px] text-gray-600 leading-relaxed">
              سند اختتامیه، حساب‌های موقت (درآمد و هزینه) را صفر کرده و سود/زیان را به حساب «سود انباشته» منتقل می‌کند.
            </p>

            {summary.closingPreview.revenues.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">
                    حساب‌های درآمد که صفر می‌شوند ({summary.closingPreview.revenues.length})
                  </span>
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {summary.closingPreview.revenues.map((r, i) => (
                    <div key={i} className="flex justify-between px-3 py-1.5 text-[11px] border-b border-gray-50 last:border-0">
                      <span className="text-gray-700">{r.name}</span>
                      <span className="font-mono text-emerald-700 font-bold" dir="ltr">
                        {formatMoney(r.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.closingPreview.expenses.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                  <span className="text-xs font-bold text-red-800">
                    حساب‌های هزینه که صفر می‌شوند ({summary.closingPreview.expenses.length})
                  </span>
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {summary.closingPreview.expenses.map((e, i) => (
                    <div key={i} className="flex justify-between px-3 py-1.5 text-[11px] border-b border-gray-50 last:border-0">
                      <span className="text-gray-700">{e.name}</span>
                      <span className="font-mono text-red-700 font-bold" dir="ltr">
                        {formatMoney(e.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`p-3 rounded-lg border-2 ${
              summary.netProfit >= 0
                ? 'bg-blue-50 border-blue-300'
                : 'bg-orange-50 border-orange-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className={`w-5 h-5 ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                  <div>
                    <div className="text-xs font-bold text-gray-800">
                      {summary.netProfit >= 0 ? '💰 سود خالص دوره' : '📉 زیان خالص دوره'}
                    </div>
                    <div className="text-[10px] text-gray-600">
                      به حساب «سود انباشته» منتقل می‌شود
                    </div>
                  </div>
                </div>
                <div className={`text-lg font-black font-mono ${
                  summary.netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'
                }`} dir="ltr">
                  {formatMoney(Math.abs(summary.netProfit))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: New Year / Confirm */}
        {!loading && summary && step === 'new-year' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-1 mb-2">
              {allSteps.map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full ${i <= 2 ? 'bg-amber-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs">۳</span>
              تأیید نهایی
            </h3>

            {/* ★★★ حذف بخش newYearName چون پلن پایه سال مالی ندارد */}
            {/* ★★★ حذف بخش پیام پلن سالانه */}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-gray-800 mb-2">خلاصه عملیات:</div>

              <div className="space-y-1.5 text-[10px]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>صدور سند اختتامیه</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>صفر کردن {summary.closingPreview.revenues.length + summary.closingPreview.expenses.length} حساب درآمد/هزینه</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>انتقال {formatMoney(Math.abs(summary.netProfit))} ریال {summary.netProfit >= 0 ? 'سود' : 'زیان'} به سود انباشته</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-bold">صدور سند افتتاحیه برای دوره جدید</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-[10px] text-blue-800">
                <strong>📋 ادامه فرآیند:</strong> پس از بستن حساب، ویزارد راه‌اندازی دوره جدید به‌صورت خودکار باز می‌شود تا انبارها و سند افتتاحیه را تنظیم کنید.
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded p-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-[10px] text-red-800">
                <strong>هشدار:</strong> این عملیات <u>غیرقابل بازگشت</u> است.
                پس از بستن، حساب‌ها صفر شده و سند اختتامیه غیرقابل حذف است.
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Executing */}
        {step === 'executing' && (
          <div className="py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-amber-500 mx-auto mb-4" />
            <p className="text-base font-bold text-gray-800 mb-2">در حال اجرای فرآیند...</p>
            <p className="text-xs text-gray-500 mb-6">لطفاً صبر کنید. این عملیات ممکن است چند ثانیه طول بکشد.</p>

            <div className="space-y-2 text-[11px] text-gray-600 max-w-xs mx-auto">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-500" />
                <span>محاسبه سود/زیان</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-500" />
                <span>صدور سند اختتامیه</span>
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span>صدور سند افتتاحیه...</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Completed */}
        {!loading && step === 'completed' && result && (
          <div className="space-y-3 py-2">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">
                🎉 حساب با موفقیت بسته شد
              </h3>
              <p className="text-xs text-gray-500">
                سند اختتامیه صادر شد
                {result.newYear && ` و سال «${result.newYear.name}» ایجاد گردید`}
              </p>
              <p className="text-[11px] text-blue-700 mt-2 font-medium">
                در حال آماده‌سازی ویزارد راه‌اندازی دوره جدید...
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2 text-[11px]">
              <div className="font-bold text-emerald-800 pb-1 border-b border-emerald-100">نتایج:</div>

              {result.closingEntry && (
                <div className="flex justify-between">
                  <span>سند اختتامیه:</span>
                  <span className="font-mono text-emerald-700 font-bold">{result.closingEntry.number}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>سود/زیان منتقل شده:</span>
                <span className={`font-mono font-bold ${
                  (result.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {formatMoney(Math.abs(result.netProfit || 0))} ریال
                </span>
              </div>
              {result.openingEntry && (
                <div className="flex justify-between pt-1 border-t border-emerald-100">
                  <span>سند افتتاحیه:</span>
                  <span className="font-mono text-blue-700 font-bold">{result.openingEntry.number}</span>
                </div>
              )}
              {result.newYear && (
                <div className="flex justify-between pt-1 border-t border-emerald-100 font-bold text-emerald-800">
                  <span>سال مالی جدید:</span>
                  <span>{result.newYear.name}</span>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-[10px] text-blue-800">
                <strong>✓ همه چیز آماده است!</strong>
                <br />
                می‌توانید به کار با فاکتورها و اسناد در دوره جدید ادامه دهید.
              </div>
            </div>

            {/* ★★★ حذف بخش redirect به /renewal */}
          </div>
        )}

        {/* Footer */}
        {!loading && step !== 'executing' && step !== 'completed' && summary && (
          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-200">
            {step === 'summary' ? (
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="text-xs h-9"
              >
                انصراف
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  const steps: WizardStep[] = ['summary', 'closing-preview', 'new-year']
                  const idx = steps.indexOf(step)
                  if (idx > 0) setStep(steps[idx - 1])
                }}
                className="text-xs h-9 gap-1"
              >
                <ChevronRight className="w-3 h-3" />
                مرحله قبل
              </Button>
            )}

            {step === 'summary' && (
              <Button
                onClick={() => setStep('closing-preview')}
                disabled={!summary.canProceed}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-9 gap-1"
              >
                مشاهده جزئیات
                <ChevronLeft className="w-3 h-3" />
              </Button>
            )}

            {step === 'closing-preview' && (
              <Button
                onClick={() => setStep('new-year')}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-9 gap-1"
              >
                ادامه
                <ChevronLeft className="w-3 h-3" />
              </Button>
            )}

            {step === 'new-year' && (
              <Button
                onClick={executeClose}
                className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 gap-1.5 font-bold"
              >
                <Archive className="w-4 h-4" />
                تأیید و بستن حساب
              </Button>
            )}
          </div>
        )}

        {step === 'completed' && (
          <div className="flex justify-end mt-4 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              <span>در حال انتقال به ویزارد راه‌اندازی...</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}