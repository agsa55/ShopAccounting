'use client'

// ============================================================================
// src/components/settings/fiscal-year-tab.tsx — v4.0 ★★★
// ★ v4.0: حذف ساخت سال جدید و سند افتتاحیه
//   - فقط بستن سال + سند اختتامیه
//   - سال جدید توسط SetupWizard ساخته می‌شود
//   - ۳ مرحله: prerequisites → closing-preview → confirm
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { useToast } from '@/hooks/use-toast'
import {
  todayISO,
  gregorianISOToJalali,
  isoToJalaliFa,
} from '@/lib/jalali-utils'
import { PersianDatePicker } from '@/components/ui/persian-date-picker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  CalendarDays,
  Calendar,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Plus,
  PlayCircle,
  Archive,
  Clock,
  Pencil,
  Trash2,
  Info,
  AlertTriangle,
  Save,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertCircle,
  XCircle,
  Check,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

type WizardStep =
  | 'prerequisites'
  | 'closing-preview'
  | 'confirm'
  | 'executing'
  | 'completed'

interface PreCheckData {
  activeYear: any
  canProceed: boolean
  warnings: string[]
  blockers: string[]
  closingPreview: any
  openingPreview: any
  closeMode: 'normal' | 'early' | 'too_early'
  closeModeReason: string
}

// ─── Helpers ────────────────────────────────────────────────────

const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

export function FiscalYearTab() {
  const planName = useAppStore((s) => s.planName)
  const tenantId = useAppStore((s) => s.tenantId)
  const features = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const { toast } = useToast()

  const [years, setYears] = useState<any[]>([])
  const [activeYear, setActiveYear] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Form for new year
  const [formOpen, setFormOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formStartISO, setFormStartISO] = useState<string | null>(null)
  const [formEndISO, setFormEndISO] = useState<string | null>(null)
  const [formActivate, setFormActivate] = useState(true)
  const [formSaving, setFormSaving] = useState(false)

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>('prerequisites')
  const [wizardLoading, setWizardLoading] = useState(false)
  const [preCheckData, setPreCheckData] = useState<PreCheckData | null>(null)
  const [wizardResult, setWizardResult] = useState<any>(null)
  const [executing, setExecuting] = useState(false)
  const [earlyCloseReason, setEarlyCloseReason] = useState('')
  const [earlyCloseConfirmed, setEarlyCloseConfirmed] = useState(false)

  // Edit state
  const [editingYear, setEditingYear] = useState<any>(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // ─── Load Years ──────────────────────────────────────────────

  const loadYears = useCallback(async () => {
    setLoading(true)
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setYears(data.data.years || [])
          setActiveYear(data.data.activeYear || null)
        }
      }
    } catch (err) {
      console.error('[FiscalYearTab] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (features.canFiscalYearManagement || features.canCloseFiscalYear) {
      loadYears()
    }
  }, [features.canFiscalYearManagement, features.canCloseFiscalYear, loadYears, refreshKey])

  useEffect(() => {
    if (formOpen && !formStartISO) {
      const isoToday = todayISO()
      setFormStartISO(isoToday)
      const d = new Date(isoToday)
      d.setDate(d.getDate() + 364)
      const endIso = d.toISOString().slice(0, 10)
      setFormEndISO(endIso)
      const jToday = gregorianISOToJalali(isoToday)
      if (jToday) {
        setFormName(`سال مالی ${toFaNum(jToday[0])}`)
      }
    }
  }, [formOpen, formStartISO])

  // ─── Actions ─────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim() || formName.trim().length < 2) {
      alert('نام سال مالی باید حداقل ۲ کاراکتر باشد')
      return
    }
    if (!formStartISO || !formEndISO) {
      alert('تاریخ شروع و پایان الزامی هستند')
      return
    }
    if (formStartISO >= formEndISO) {
      alert('تاریخ شروع باید قبل از تاریخ پایان باشد')
      return
    }

    setFormSaving(true)
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: formName.trim(),
          startDate: formStartISO,
          endDate: formEndISO,
          activate: formActivate,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: data.message })
        setFormOpen(false)
        setFormName('')
        setFormStartISO(null)
        setFormEndISO(null)
        setFormActivate(true)
        setRefreshKey((k) => k + 1)
      } else {
        toast({ title: data.error || 'خطا در ایجاد سال مالی', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'خطا در ارتباط با سرور', variant: 'destructive' })
    }
    setFormSaving(false)
  }

  const handleActivate = async (yearId: string, yearName: string) => {
    if (!confirm(`آیا از فعال‌سازی سال مالی «${yearName}» مطمئن هستید؟ سال فعلی غیرفعال خواهد شد.`))
      return
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fiscal-years/${yearId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'activate' }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: data.message })
        setRefreshKey((k) => k + 1)
      } else {
        toast({ title: data.error || 'خطا در فعال‌سازی', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'خطا در ارتباط با سرور', variant: 'destructive' })
    }
  }

  const handleEditSave = async () => {
    if (!editingYear) return
    if (!editName.trim() || editName.trim().length < 2) {
      alert('نام سال مالی باید حداقل ۲ کاراکتر باشد')
      return
    }
    setEditSaving(true)
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fiscal-years/${editingYear.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'update', name: editName.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: data.message })
        setEditingYear(null)
        setEditName('')
        setRefreshKey((k) => k + 1)
      } else {
        toast({ title: data.error || 'خطا در به‌روزرسانی', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'خطا در ارتباط با سرور', variant: 'destructive' })
    }
    setEditSaving(false)
  }

  const handleDelete = async (yearId: string, yearName: string) => {
    if (!confirm(`آیا از حذف سال مالی «${yearName}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`))
      return
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fiscal-years/${yearId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: data.message })
        setRefreshKey((k) => k + 1)
      } else {
        toast({ title: data.error || 'خطا در حذف', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'خطا در ارتباط با سرور', variant: 'destructive' })
    }
  }

  // ─── Wizard: Open and Run Pre-Check ──────────────────────────

  const openWizard = async () => {
    setWizardOpen(true)
    setWizardStep('prerequisites')
    setWizardLoading(true)
    setPreCheckData(null)
    setWizardResult(null)
    setEarlyCloseReason('')
    setEarlyCloseConfirmed(false)

    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years/pre-close-check', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()

      if (data.success) {
        setPreCheckData(data.data)
      } else {
        toast({ title: data.error || 'خطا در بررسی', variant: 'destructive' })
        setWizardOpen(false)
      }
    } catch (err: any) {
      toast({ title: 'خطا در ارتباط با سرور', variant: 'destructive' })
      setWizardOpen(false)
    } finally {
      setWizardLoading(false)
    }
  }

  // ─── Wizard: Execute Close ───────────────────────────────────

  const executeClose = async () => {
    if (!preCheckData) return

    setExecuting(true)
    setWizardStep('executing')

    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null

      const body: any = {
        forceClose: false,
      }

      if (preCheckData.closeMode === 'early') {
        body.earlyCloseReason = earlyCloseReason.trim()
        body.earlyCloseConfirmed = true
      }

      const res = await fetch('/api/fiscal-years', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (data.success) {
        setWizardResult(data.data)
        setWizardStep('completed')
        setRefreshKey((k) => k + 1)
        toast({
          title: '🎉 سال مالی با موفقیت بسته شد!',
          description: 'در حال آماده‌سازی ویزارد راه‌اندازی سال جدید...',
        })
        
        // ★ بعد از ۲ ثانیه، Wizard بستن را ببند
      // ★ بعد از ۲ ثانیه، Wizard بستن را ببند و صفحه را reload کن
setTimeout(() => {
  setWizardOpen(false)
  
  // ★ بعد از ۵۰۰ms، صفحه را reload کن تا SetupWizard به صورت خودکار باز شود
  setTimeout(() => {
    console.log('[FiscalYearTab] 🔄 Reloading page to trigger setup wizard...')
    window.location.reload()
  }, 500)
}, 2000)
      } else {
        toast({ title: data.error || 'خطا در بستن سال مالی', variant: 'destructive' })
        setWizardStep('confirm')
      }
    } catch (err: any) {
      toast({ title: err?.message || 'خطا در ارتباط', variant: 'destructive' })
      setWizardStep('confirm')
    } finally {
      setExecuting(false)
    }
  }

  // ─── Wizard: Steps (۳ مرحله اصلی) ──────────────────────────

  const wizardSteps: WizardStep[] = [
    'prerequisites',
    'closing-preview',
    'confirm',
  ]

  const goToNextStep = () => {
    const currentIndex = wizardSteps.indexOf(wizardStep)
    if (currentIndex < wizardSteps.length - 1) {
      setWizardStep(wizardSteps[currentIndex + 1])
    }
  }

  const goToPrevStep = () => {
    const currentIndex = wizardSteps.indexOf(wizardStep)
    if (currentIndex > 0) {
      setWizardStep(wizardSteps[currentIndex - 1])
    }
  }

  const canGoNext = (): boolean => {
    if (!preCheckData) return false

    switch (wizardStep) {
      case 'prerequisites':
        if (preCheckData.closeMode === 'too_early') return false
        if (preCheckData.closeMode === 'early') {
          return (
            earlyCloseReason.trim().length >= 10 &&
            earlyCloseConfirmed &&
            preCheckData.canProceed
          )
        }
        return preCheckData.canProceed
      case 'closing-preview':
        return true
      case 'confirm':
        return true
      default:
        return false
    }
  }

  // ─── Render ──────────────────────────────────────────────────

  if (!features.canFiscalYearManagement && !features.canCloseFiscalYear) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-6 text-center">
          <CalendarDays className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-2">مدیریت سال مالی</h3>
          <p className="text-xs text-gray-500 mb-4">
            تعریف، فعال‌سازی و بستن سال‌های مالی فقط در پلن پیشرفته و حرفه‌ای در دسترس است.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* کارت سال فعال */}
      <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50/50 to-transparent">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
              سال مالی فعال
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] border-emerald-300 text-emerald-600 hover:bg-emerald-50"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-1">
          {loading && !activeYear ? (
            <div className="py-3 text-center">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500 mx-auto" />
            </div>
          ) : activeYear ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">{activeYear.name}</p>
                  <p className="text-[10px] text-gray-500" dir="ltr">
                    {isoToJalaliFa(activeYear.startDate)} — {isoToJalaliFa(activeYear.endDate)}
                  </p>
                </div>
                {activeYear.progress !== undefined && (
                  <div className="text-left">
                    <div className="text-[10px] text-gray-500 mb-0.5">پیشرفت</div>
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${activeYear.progress}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-emerald-600 mt-0.5 font-mono">
                      {toFaNum(activeYear.progress || 0)}٪
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-emerald-100">
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">تعداد اسناد</div>
                  <div className="text-xs font-bold text-gray-700">
                    {toFaNum(activeYear.entryCount || 0)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">مدت سال</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(() => {
                      const start = new Date(activeYear.startDate).getTime()
                      const end = new Date(activeYear.endDate).getTime()
                      const days = Math.round((end - start) / (1000 * 60 * 60 * 24))
                      return toFaNum(days) + ' روز'
                    })()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">روزهای باقی‌مانده</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(() => {
                      const end = new Date(activeYear.endDate).getTime()
                      const now = Date.now()
                      const days = Math.max(
                        0,
                        Math.round((end - now) / (1000 * 60 * 60 * 24))
                      )
                      return toFaNum(days) + ' روز'
                    })()}
                  </div>
                </div>
              </div>

              {features.canCloseFiscalYear && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 text-[11px] h-8 w-full mt-1 gap-1.5"
                  onClick={openWizard}
                >
                  <Archive className="w-3.5 h-3.5" />
                  بستن سال مالی
                </Button>
              )}
            </div>
          ) : (
            <div className="py-3 text-center">
              <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-[11px] text-gray-600 mb-2">هیچ سال مالی فعالی وجود ندارد</p>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] h-7"
                onClick={() => setFormOpen(true)}
              >
                <Plus className="w-3 h-3 ml-1" />
                تعریف سال اول
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* لیست همه سال‌ها */}
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              همه سال‌های مالی
              <Badge className="text-[9px] bg-blue-100 text-blue-700 mr-1">
                {toFaNum(years.length)} سال
              </Badge>
            </CardTitle>
            {features.canFiscalYearManagement && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] border-blue-300 text-blue-600 hover:bg-blue-50"
                onClick={() => setFormOpen(true)}
              >
                <Plus className="w-3 h-3 ml-1" />
                سال جدید
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-1">
          {loading && years.length === 0 ? (
            <div className="py-3 text-center">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
            </div>
          ) : years.length === 0 ? (
            <p className="text-[11px] text-gray-400 py-3 text-center">
              هنوز سال مالی تعریف نشده است
            </p>
          ) : (
            <div className="space-y-1" dir="rtl">
              {years.map((y) => (
                <div
                  key={y.id}
                  className={`flex items-center justify-between px-2 py-1.5 rounded border ${
                    y.isActive
                      ? 'bg-emerald-50 border-emerald-200'
                      : y.isClosed
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {y.isActive ? (
                      <PlayCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : y.isClosed ? (
                      <Archive className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      {editingYear?.id === y.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-6 text-xs"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-6 px-2 bg-emerald-600 text-white"
                            onClick={handleEditSave}
                            disabled={editSaving}
                          >
                            {editSaving ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'ذخیره'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => setEditingYear(null)}
                          >
                            انصراف
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-medium text-gray-800 truncate">
                              {y.name}
                            </span>
                            {y.isActive && (
                              <Badge className="text-[9px] bg-emerald-100 text-emerald-700">
                                فعال
                              </Badge>
                            )}
                            {y.isClosed && (
                              <Badge className="text-[9px] bg-gray-200 text-gray-600">
                                بسته‌شده
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[9px] text-gray-500" dir="ltr">
                            <span>
                              {isoToJalaliFa(y.startDate)} — {isoToJalaliFa(y.endDate)}
                            </span>
                          </div>
                          {y.isClosed && y.closedAt && (
                            <div className="text-[9px] text-gray-400 mt-0.5">
                              <Clock className="w-2.5 h-2.5 inline ml-0.5" />
                              بسته شد:{' '}
                              {isoToJalaliFa(
                                y.closedAt.toISOString
                                  ? y.closedAt.toISOString()
                                  : y.closedAt
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {y.entryCount > 0 && (
                      <Badge className="text-[9px] bg-blue-50 text-blue-600" title="تعداد اسناد">
                        {toFaNum(y.entryCount)} سند
                      </Badge>
                    )}
                    {features.canFiscalYearManagement &&
                      !y.isClosed &&
                      !y.isActive &&
                      editingYear?.id !== y.id && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50"
                            onClick={() => handleActivate(y.id, y.name)}
                            title="فعال‌سازی"
                          >
                            <PlayCircle className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-100"
                            onClick={() => {
                              setEditingYear(y)
                              setEditName(y.name)
                            }}
                            title="ویرایش نام"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                            onClick={() => handleDelete(y.id, y.name)}
                            title="حذف"
                            disabled={y.entryCount > 0}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    {features.canFiscalYearManagement &&
                      !y.isClosed &&
                      y.isActive &&
                      editingYear?.id !== y.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-100"
                          onClick={() => {
                            setEditingYear(y)
                            setEditName(y.name)
                          }}
                          title="ویرایش نام"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* راهنما */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-2.5">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-[10px] text-gray-600 leading-relaxed space-y-1">
              <p>
                <strong className="text-blue-700">سال فعال:</strong> تمام اسناد حسابداری جدید به این
                سال متصل می‌شوند. در هر لحظه فقط یک سال فعال می‌تواند وجود داشته باشد.
              </p>
              <p>
                <strong className="text-gray-700">سال بسته‌شده:</strong> قابل ویرایش یا حذف نیست.
                برای حفظ سابقه حسابداری، سال‌های بسته‌شده دائمی هستند.
              </p>
              <p>
                <strong className="text-emerald-700">بستن سال:</strong> سند اختتامیه صادر می‌شود،
                حساب‌های موقت صفر شده و سود/زیان به سود انباشته منتقل می‌شود. سپس ویزارد راه‌اندازی سال جدید باز می‌شود.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* دیالوگ تعریف سال جدید */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[480px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-emerald-600" />
              تعریف سال مالی جدید
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              سال مالی دوره‌ای است که اسناد حسابداری در آن ثبت می‌شوند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">نام سال مالی *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثلاً: سال مالی ۱۴۰۳"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <PersianDatePicker
                value={formStartISO}
                onChange={setFormStartISO}
                placeholder="انتخاب تاریخ شروع"
                label="تاریخ شروع (شمسی) *"
                maxDate={formEndISO || undefined}
              />
            </div>
            <div>
              <PersianDatePicker
                value={formEndISO}
                onChange={setFormEndISO}
                placeholder="انتخاب تاریخ پایان"
                label="تاریخ پایان (شمسی) *"
                minDate={formStartISO || undefined}
              />
            </div>
            <div className="flex items-center justify-between bg-emerald-50/50 border border-emerald-200 rounded p-2">
              <div>
                <Label className="text-[11px] text-emerald-700">فعال‌سازی به‌عنوان سال جاری</Label>
                <p className="text-[9px] text-gray-500">سال فعلی غیرفعال و این سال فعال می‌شود</p>
              </div>
              <Switch checked={formActivate} onCheckedChange={setFormActivate} />
            </div>
            {formStartISO && formEndISO && (
              <div className="bg-gray-50 rounded p-2 text-[10px] text-gray-600 space-y-0.5">
                <div className="flex justify-between">
                  <span>تاریخ شروع (شمسی):</span>
                  <span className="font-mono" dir="ltr">
                    {isoToJalaliFa(formStartISO)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>تاریخ پایان (شمسی):</span>
                  <span className="font-mono" dir="ltr">
                    {isoToJalaliFa(formEndISO)}
                  </span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-200">
                  <span>مدت سال:</span>
                  <span className="font-mono">
                    {(() => {
                      const start = new Date(formStartISO)
                      const end = new Date(formEndISO)
                      const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
                      return toFaNum(days) + ' روز'
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="text-xs h-8">
              انصراف
            </Button>
            <Button
              onClick={handleSave}
              disabled={formSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            >
              {formSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 ml-1" />}
              ایجاد سال مالی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  ★★★ Wizard بستن سال مالی (نسخه v4.0 — ۳ مرحله)             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Archive className="w-4 h-4 text-red-600" />
              بستن سال مالی
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              فرآیند: بررسی پیش‌نیازها → پیش‌نمایش سند اختتامیه → تأیید و اجرا
            </DialogDescription>
          </DialogHeader>

          {/* Loading */}
          {wizardLoading && (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-gray-500">در حال بررسی پیش‌نیازها...</p>
            </div>
          )}

          {/* ─── مرحله ۱: پیش‌نیازها ─── */}
          {!wizardLoading && preCheckData && wizardStep === 'prerequisites' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-1 mb-2">
                {wizardSteps.map((s, i) => (
                  <div
                    key={s}
                    className={`flex-1 h-1 rounded-full ${
                      wizardSteps.indexOf(wizardStep) >= i
                        ? 'bg-emerald-500'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>

              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">۱</span>
                بررسی پیش‌نیازها
              </h3>

              {preCheckData.closeMode === 'normal' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="text-xs text-emerald-800">
                    <strong>🟢 {preCheckData.closeModeReason}</strong>
                    <p className="text-[10px] mt-0.5">می‌توانید به‌صورت عادی سال مالی را ببندید.</p>
                  </div>
                </div>
              )}

              {preCheckData.closeMode === 'early' && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900">
                      <strong>🟡 بستن زودهنگام سال مالی</strong>
                      <p className="text-[10px] mt-1 leading-relaxed">
                        شما {toFaNum(preCheckData.activeYear.daysUntilEnd)} روز زودتر از پایان سال مالی اقدام به بستن آن کرده‌اید.
                        این عملیات ممکن است گزارش‌های مالی سال را ناقص کند.
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] font-bold text-amber-800">
                      دلیل بستن زودهنگام (حداقل ۱۰ کاراکتر) *
                    </Label>
                    <textarea
                      value={earlyCloseReason}
                      onChange={(e) => setEarlyCloseReason(e.target.value)}
                      placeholder="مثلاً: فروش کسب‌وکار، تغییر شغل، انحلال شرکت، مهاجرت..."
                      className="w-full mt-1 p-2 text-xs border border-amber-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                      rows={2}
                      dir="rtl"
                    />
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[9px] text-gray-500">
                        {toFaNum(earlyCloseReason.trim().length)} کاراکتر
                      </span>
                      {earlyCloseReason.trim().length < 10 && (
                        <span className="text-[9px] text-red-600">
                          حداقل ۱۰ کاراکتر لازم است
                        </span>
                      )}
                    </div>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={earlyCloseConfirmed}
                      onChange={(e) => setEarlyCloseConfirmed(e.target.checked)}
                      className="w-3.5 h-3.5 mt-0.5 text-amber-600"
                    />
                    <span className="text-[10px] text-amber-800">
                      تأیید می‌کنم که از عواقب بستن زودهنگام آگاه هستم و این عملیات غیرقابل بازگشت است.
                    </span>
                  </label>
                </div>
              )}

              {preCheckData.closeMode === 'too_early' && (
                <div className="bg-red-50 border-2 border-red-300 rounded p-3 flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-900">
                    <strong>🔴 بستن سال مالی در این زمان ممکن نیست</strong>
                    <p className="text-[10px] mt-1 leading-relaxed">
                      {preCheckData.closeModeReason}
                      <br />
                      <br />
                      در شرایط بسیار خاص (مثل انحلال شرکت)، با پشتیبانی تماس بگیرید.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-800">{preCheckData.activeYear.name}</span>
                  <Badge className={`text-[9px] ${preCheckData.activeYear.isYearEnded ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {preCheckData.activeYear.isYearEnded ? 'به پایان رسیده' : `${toFaNum(preCheckData.activeYear.daysUntilEnd)} روز مانده`}
                  </Badge>
                </div>
                <div className="text-[10px] text-gray-600" dir="ltr">
                  {isoToJalaliFa(preCheckData.activeYear.startDate)} — {isoToJalaliFa(preCheckData.activeYear.endDate)}
                </div>
              </div>

              <div className="space-y-1.5">
                <CheckItem
                  ok={preCheckData.activeYear.isYearEnded || preCheckData.activeYear.daysUntilEnd <= 7}
                  label={preCheckData.activeYear.isYearEnded
                    ? 'سال مالی به پایان رسیده است'
                    : `${toFaNum(preCheckData.activeYear.daysUntilEnd)} روز تا پایان سال مالی باقی مانده`}
                  warning={!preCheckData.activeYear.isYearEnded && preCheckData.activeYear.daysUntilEnd <= 7}
                />

                <CheckItem
                  ok={preCheckData.blockers.every(b => !b.includes('Draft'))}
                  label={preCheckData.closingPreview.draftEntriesCount === 0
                    ? 'هیچ سند پیش‌نویس (Draft) وجود ندارد'
                    : `${toFaNum(preCheckData.closingPreview.draftEntriesCount)} سند Draft باید تأیید شوند`}
                  error={preCheckData.closingPreview.draftEntriesCount > 0}
                />

                <CheckItem
                  ok={preCheckData.openingPreview.isBalanced}
                  label={preCheckData.openingPreview.isBalanced
                    ? 'حساب‌ها تراز هستند'
                    : `اختلاف ${toFaNum(preCheckData.openingPreview.difference)} ریال در حساب‌ها`}
                  warning={!preCheckData.openingPreview.isBalanced}
                />
              </div>

              {preCheckData.blockers.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-xs font-bold text-red-700">موانع (قبل از ادامه رفع کنید):</span>
                  </div>
                  <ul className="text-[10px] text-red-700 space-y-0.5 pr-5 list-disc">
                    {preCheckData.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preCheckData.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-xs font-bold text-amber-700">هشدارها:</span>
                  </div>
                  <ul className="text-[10px] text-amber-700 space-y-0.5 pr-5 list-disc">
                    {preCheckData.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ─── مرحله ۲: پیش‌نمایش اختتامیه ─── */}
          {!wizardLoading && preCheckData && wizardStep === 'closing-preview' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-1 mb-2">
                {wizardSteps.map((s, i) => (
                  <div
                    key={s}
                    className={`flex-1 h-1 rounded-full ${
                      wizardSteps.indexOf(wizardStep) >= i
                        ? 'bg-emerald-500'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>

              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">۲</span>
                پیش‌نمایش سند اختتامیه
              </h3>

              <p className="text-[10px] text-gray-600">
                سند اختتامیه حساب‌های موقت (درآمد و هزینه) را صفر کرده و سود/زیان را به حساب سود انباشته منتقل می‌کند.
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                  <TrendingUp className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                  <div className="text-[9px] text-gray-500">کل درآمد</div>
                  <div className="text-xs font-bold text-emerald-700">
                    {toFaNum(Math.round(preCheckData.closingPreview.totalRevenue).toLocaleString('en-US'))}
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                  <TrendingDown className="w-4 h-4 text-red-600 mx-auto mb-1" />
                  <div className="text-[9px] text-gray-500">کل هزینه</div>
                  <div className="text-xs font-bold text-red-700">
                    {toFaNum(Math.round(preCheckData.closingPreview.totalExpense).toLocaleString('en-US'))}
                  </div>
                </div>
                <div className={`${preCheckData.closingPreview.netProfit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border rounded p-2 text-center`}>
                  <Scale className={`w-4 h-4 mx-auto mb-1 ${preCheckData.closingPreview.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                  <div className="text-[9px] text-gray-500">
                    {preCheckData.closingPreview.netProfit >= 0 ? 'سود خالص' : 'زیان خالص'}
                  </div>
                  <div className={`text-xs font-bold ${preCheckData.closingPreview.netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    {toFaNum(Math.round(Math.abs(preCheckData.closingPreview.netProfit)).toLocaleString('en-US'))}
                  </div>
                </div>
              </div>

              {preCheckData.closingPreview.revenues.length > 0 && (
                <div className="bg-white border border-gray-200 rounded">
                  <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                    <span className="text-[10px] font-bold text-emerald-800">
                      حساب‌های درآمد ({toFaNum(preCheckData.closingPreview.revenues.length)})
                    </span>
                  </div>
                  <div className="max-h-24 overflow-y-auto">
                    {preCheckData.closingPreview.revenues.slice(0, 10).map((r: any) => (
                      <div key={r.accountId} className="flex justify-between px-3 py-1 text-[10px] border-b border-gray-50">
                        <span className="text-gray-700 truncate">{r.name}</span>
                        <span className="font-mono text-emerald-700" dir="ltr">
                          {toFaNum(Math.round(r.balance).toLocaleString('en-US'))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preCheckData.closingPreview.expenses.length > 0 && (
                <div className="bg-white border border-gray-200 rounded">
                  <div className="px-3 py-1.5 bg-red-50 border-b border-red-100 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-600" />
                    <span className="text-[10px] font-bold text-red-800">
                      حساب‌های هزینه ({toFaNum(preCheckData.closingPreview.expenses.length)})
                    </span>
                  </div>
                  <div className="max-h-24 overflow-y-auto">
                    {preCheckData.closingPreview.expenses.slice(0, 10).map((e: any) => (
                      <div key={e.accountId} className="flex justify-between px-3 py-1 text-[10px] border-b border-gray-50">
                        <span className="text-gray-700 truncate">{e.name}</span>
                        <span className="font-mono text-red-700" dir="ltr">
                          {toFaNum(Math.round(e.balance).toLocaleString('en-US'))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-purple-50 border border-purple-200 rounded p-2 text-[10px] text-purple-800">
                <strong>انتقال به حساب «{preCheckData.closingPreview.retainedEarningsAccountName}»:</strong>{' '}
                {preCheckData.closingPreview.netProfit >= 0 ? 'سود' : 'زیان'}{' '}
                <span className="font-bold font-mono" dir="ltr">
                  {toFaNum(Math.round(Math.abs(preCheckData.closingPreview.netProfit)).toLocaleString('en-US'))} ریال
                </span>
              </div>
            </div>
          )}

          {/* ─── مرحله ۳: تأیید نهایی ─── */}
          {!wizardLoading && preCheckData && wizardStep === 'confirm' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-1 mb-2">
                {wizardSteps.map((s, i) => (
                  <div
                    key={s}
                    className={`flex-1 h-1 rounded-full ${
                      wizardSteps.indexOf(wizardStep) >= i
                        ? 'bg-emerald-500'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>

              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                  ۳
                </span>
                تأیید نهایی
              </h3>

              {/* خلاصه عملیات */}
              <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
                <div className="text-xs font-bold text-gray-800 mb-2">خلاصه عملیات:</div>

                <div className="space-y-1.5 text-[10px]">
                  <div className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>بستن سال مالی «{preCheckData.activeYear.name}»</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>
                      صدور سند اختتامیه (سود/زیان: {toFaNum(Math.round(Math.abs(preCheckData.closingPreview.netProfit)).toLocaleString('en-US'))} ریال)
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[10px] text-blue-800">
                  <strong>📋 ادامه فرآیند:</strong> پس از بستن سال مالی، ویزارد راه‌اندازی سال جدید به‌صورت خودکار باز می‌شود تا سال جدید، انبارها و سند افتتاحیه را تنظیم کنید.
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[10px] text-amber-800">
                  <strong>توجه:</strong> این عملیات غیرقابل بازگشت است. پس از تأیید، سال مالی بسته شده و قابل بازگشایی نیست.
                </div>
              </div>
            </div>
          )}

          {/* ─── مرحله در حال اجرا ─── */}
          {wizardStep === 'executing' && (
            <div className="py-12 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-800 mb-1">در حال اجرای فرآیند...</p>
              <p className="text-[10px] text-gray-500">لطفاً صبر کنید. این عملیات ممکن است چند ثانیه طول بکشد.</p>
              <div className="mt-4 space-y-1 text-[10px] text-gray-500">
                <div className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                  <span>صدور سند اختتامیه</span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                  <span>بستن سال مالی</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── مرحله تکمیل ─── */}
          {!wizardLoading && wizardStep === 'completed' && wizardResult && (
            <div className="space-y-3 py-2">
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-gray-800 mb-1">
                  🎉 بستن سال مالی با موفقیت انجام شد
                </h3>
                <p className="text-xs text-gray-500">
                  سال «{wizardResult.closedYear.name}» بسته شد و سند اختتامیه صادر گردید.
                </p>
                <p className="text-[11px] text-blue-700 mt-2 font-medium">
                  در حال آماده‌سازی ویزارد راه‌اندازی سال جدید...
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded p-3 space-y-2 text-[10px]">
                <div className="font-bold text-emerald-800 pb-1 border-b border-emerald-100">نتایج عملیات:</div>

                <div className="flex justify-between">
                  <span>سند اختتامیه:</span>
                  <span className="font-mono text-emerald-700">{wizardResult.closingEntry.number}</span>
                </div>
                <div className="flex justify-between">
                  <span>کل درآمد:</span>
                  <span className="font-mono text-emerald-600">
                    {toFaNum(Math.round(wizardResult.closingEntry.totalRevenue).toLocaleString('en-US'))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>کل هزینه:</span>
                  <span className="font-mono text-red-600">
                    {toFaNum(Math.round(wizardResult.closingEntry.totalExpense).toLocaleString('en-US'))}
                  </span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-emerald-100">
                  <span>
                    {wizardResult.closingEntry.netProfit >= 0 ? 'سود خالص:' : 'زیان خالص:'}
                  </span>
                  <span className={wizardResult.closingEntry.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                    {toFaNum(Math.round(Math.abs(wizardResult.closingEntry.netProfit)).toLocaleString('en-US'))} ریال
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          {!wizardLoading && wizardStep !== 'executing' && wizardStep !== 'completed' && preCheckData && (
            <DialogFooter className="gap-2 mt-3 pt-2 border-t border-gray-200">
              {wizardStep !== 'prerequisites' && (
                <Button
                  variant="outline"
                  onClick={goToPrevStep}
                  className="text-xs h-8 gap-1"
                >
                  <ChevronRight className="w-3 h-3" />
                  مرحله قبل
                </Button>
              )}

              {wizardStep !== 'confirm' && (
                <Button
                  onClick={goToNextStep}
                  disabled={!canGoNext()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1"
                >
                  مرحله بعد
                  <ChevronLeft className="w-3 h-3" />
                </Button>
              )}

              {wizardStep === 'confirm' && (
                <Button
                  onClick={executeClose}
                  disabled={executing}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" />
                  تأیید و بستن سال مالی
                </Button>
              )}
            </DialogFooter>
          )}

          {wizardStep === 'completed' && (
            <DialogFooter className="gap-2 mt-3 pt-2 border-t border-gray-200">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>در حال انتقال به ویزارد راه‌اندازی...</span>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت کمکی CheckItem
// ═══════════════════════════════════════════════════════════════

function CheckItem({ ok, label, warning, error }: {
  ok: boolean
  label: string
  warning?: boolean
  error?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded text-xs ${
      error ? 'bg-red-50 text-red-700' :
      warning ? 'bg-amber-50 text-amber-700' :
      ok ? 'bg-emerald-50 text-emerald-700' :
      'bg-gray-50 text-gray-600'
    }`}>
      {error ? (
        <XCircle className="w-3.5 h-3.5 shrink-0" />
      ) : warning ? (
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      ) : ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      )}
      <span>{label}</span>
    </div>
  )
}