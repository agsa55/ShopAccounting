'use client'

// ============================================================================
// src/components/accounting/recurring-journals-manager.tsx (v5.3 ★★★ Phase 4)
// ShopAccounting — Recurring Journals Manager
// ----------------------------------------------------------------------------
// این کامپوننت مدیریت اسناد تکرارشونده را انجام می‌دهد:
//   - لیست الگوهای موجود
//   - ایجاد الگوی جدید
//   - فعال/غیرفعال کردن
//   - حذف الگو
//   - اجرای دستی (force)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Plus, RefreshCw, Trash2, Play, Repeat, Calendar, Loader2, AlertCircle,
  CheckCircle2, Power, Edit, Clock,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface RecurringLine {
  accountId: string
  accountName?: string
  accountCode?: string
  debit: number
  credit: number
  description?: string
}

interface RecurringJournal {
  id: string
  title: string
  description: string | null
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  monthOfYear: number | null
  startDate: string
  endDate: string | null
  nextExecutionDate: string
  lastExecutedAt: string | null
  isActive: boolean
  autoPost: boolean
  lines: RecurringLine[]
  generatedCount: number
  createdAt: string
}

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface RecurringJournalsManagerProps {
  /** حساب‌ها از کامپوننت والد پاس داده می‌شوند (بدون fetch مجدد) */
  accounts?: Account[]
}

// ─── Helpers ──────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'هفتگی',
  monthly: 'ماهانه',
  quarterly: 'فصلی',
  yearly: 'سالانه',
}

const DAY_OF_WEEK_LABELS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
const MONTH_LABELS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

function formatAmount(n: number): string {
  return (n || 0).toLocaleString('fa-IR')
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '---'
  try {
    return new Date(dateStr).toLocaleDateString('fa-IR')
  } catch {
    return dateStr
  }
}

function getScheduleDescription(rj: RecurringJournal): string {
  switch (rj.frequency) {
    case 'weekly':
      return `هر ${DAY_OF_WEEK_LABELS[rj.dayOfWeek || 1]}`
    case 'monthly':
      return `روز ${(rj.dayOfMonth || 1).toLocaleString('fa-IR')} هر ماه`
    case 'quarterly':
      return `روز ${(rj.dayOfMonth || 1).toLocaleString('fa-IR')} هر ۳ ماه`
    case 'yearly':
      return `${MONTH_LABELS[(rj.monthOfYear || 1) - 1]} روز ${(rj.dayOfMonth || 1).toLocaleString('fa-IR')}`
    default:
      return rj.frequency
  }
}

// ─── Component ────────────────────────────────────────────────

export function RecurringJournalsManager({ accounts: propAccounts }: RecurringJournalsManagerProps = {}) {
  const [templates, setTemplates] = useState<RecurringJournal[]>([])
  // ★★★ v5.3.2: استفاده از accounts از prop والد (اگر موجود باشد)
  //   اگر prop پاس داده نشد، خودمان fetch می‌کنیم
  const [fetchedAccounts, setFetchedAccounts] = useState<Account[]>([])
  const accounts = propAccounts || fetchedAccounts
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ★ state مودال ایجاد
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ★ state فرم
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formFrequency, setFormFrequency] = useState('monthly')
  const [formDayOfMonth, setFormDayOfMonth] = useState(1)
  const [formDayOfWeek, setFormDayOfWeek] = useState(1)
  const [formMonthOfYear, setFormMonthOfYear] = useState(1)
  const [formAutoPost, setFormAutoPost] = useState(true)
  const [formLines, setFormLines] = useState<RecurringLine[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ])

  // ★ state حذف
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ★ state اجرای دستی
  const [running, setRunning] = useState(false)

  // ─── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      // ★★★ v5.3.2: اگر accounts از prop والد آمده، فقط templates را fetch کن
      const templatesRes = await fetch('/api/recurring-journals?includeInactive=true', { headers })
      const templatesData = await templatesRes.json()

      if (templatesData.success) {
        setTemplates(templatesData.data || [])
      }

      // ★ اگر propAccounts موجود نیست، accounts را خودمان fetch کن
      if (!propAccounts || propAccounts.length === 0) {
        try {
          const accountsRes = await fetch('/api/accounts', { headers })
          const accountsData = await accountsRes.json()

          if (accountsData.success) {
            const accList =
              accountsData.data?.accounts ||
              accountsData.data ||
              accountsData.accounts ||
              []
            const formatted = Array.isArray(accList)
              ? accList.map((a: any) => ({
                  id: a.id,
                  code: a.code || '',
                  name: a.name || '',
                  type: a.type || 'asset',
                }))
              : []
            setFetchedAccounts(formatted)
            console.log('[RecurringJournalsManager] Fetched accounts:', formatted.length)
          }
        } catch (accErr) {
          console.warn('[RecurringJournalsManager] Failed to fetch accounts:', accErr)
        }
      } else {
        console.log('[RecurringJournalsManager] Using propAccounts:', propAccounts.length)
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری')
    } finally {
      setLoading(false)
    }
  }, [propAccounts])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    setError('')
    setSuccess('')

    if (!formTitle.trim()) {
      setError('عنوان الزامی است')
      return
    }

    // ★ اعتبارسنجی lines
    const validLines = formLines.filter(l => l.accountId)
    if (validLines.length < 2) {
      setError('حداقل دو ردیف با حساب مشخص الزامی است')
      return
    }

    const totalDebit = validLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
    const totalCredit = validLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      setError(`سند تراز نیست. بدهکار: ${formatAmount(totalDebit)}، بستانکار: ${formatAmount(totalCredit)}`)
      return
    }

    setSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const body = {
        title: formTitle,
        description: formDescription,
        frequency: formFrequency,
        dayOfMonth: formFrequency !== 'weekly' ? formDayOfMonth : null,
        dayOfWeek: formFrequency === 'weekly' ? formDayOfWeek : null,
        monthOfYear: formFrequency === 'yearly' ? formMonthOfYear : null,
        lines: validLines,
        autoPost: formAutoPost,
      }

      const url = editingId
        ? `/api/recurring-journals/${editingId}`
        : '/api/recurring-journals'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (data.success) {
        setSuccess(editingId ? 'الگو به‌روزرسانی شد' : 'الگوی جدید ایجاد شد')
        setTimeout(() => setSuccess(''), 3000)
        setDialogOpen(false)
        setEditingId(null)
        resetForm()
        loadData()
      } else {
        setError(data.error || 'خطا در ذخیره')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setSaving(false)
    }
  }

  // ─── Edit ───────────────────────────────────────────────────
  const handleEdit = (rj: RecurringJournal) => {
    setEditingId(rj.id)
    setFormTitle(rj.title)
    setFormDescription(rj.description || '')
    setFormFrequency(rj.frequency)
    setFormDayOfMonth(rj.dayOfMonth || 1)
    setFormDayOfWeek(rj.dayOfWeek || 1)
    setFormMonthOfYear(rj.monthOfYear || 1)
    setFormAutoPost(rj.autoPost)
    setFormLines(rj.lines.length >= 2 ? rj.lines : [
      ...rj.lines,
      { accountId: '', debit: 0, credit: 0, description: '' },
    ])
    setDialogOpen(true)
  }

  // ─── Toggle active ──────────────────────────────────────────
  const handleToggleActive = async (rj: RecurringJournal) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      await fetch(`/api/recurring-journals/${rj.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ isActive: !rj.isActive }),
      })
      loadData()
    } catch (err: any) {
      setError(err?.message || 'خطا در تغییر وضعیت')
    }
  }

  // ─── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      await fetch(`/api/recurring-journals/${deleteId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      setDeleteId(null)
      loadData()
      setSuccess('الگو حذف شد')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err?.message || 'خطا در حذف')
    }
  }

  // ─── Force run ──────────────────────────────────────────────
  const handleForceRun = async () => {
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/cron/recurring-journals?secret=' + process.env.NEXT_PUBLIC_CRON_SECRET + '&force=true')
      const data = await res.json()
      if (data.success) {
        setSuccess(`${data.data.entriesCreated} سند ایجاد شد`)
        setTimeout(() => setSuccess(''), 5000)
        loadData()
      } else {
        setError(data.error || 'خطا در اجرای کرون جاب')
      }
    } catch {
      setError('برای تست، لینک کرون جاب را مستقیم در مرورگر باز کنید')
    } finally {
      setRunning(false)
    }
  }

  // ─── Helpers ────────────────────────────────────────────────
  const resetForm = () => {
    setFormTitle('')
    setFormDescription('')
    setFormFrequency('monthly')
    setFormDayOfMonth(1)
    setFormDayOfWeek(1)
    setFormMonthOfYear(1)
    setFormAutoPost(true)
    setFormLines([
      { accountId: '', debit: 0, credit: 0, description: '' },
      { accountId: '', debit: 0, credit: 0, description: '' },
    ])
  }

  const addLine = () => {
    setFormLines([...formLines, { accountId: '', debit: 0, credit: 0, description: '' }])
  }

  const removeLine = (index: number) => {
    if (formLines.length <= 2) return
    setFormLines(formLines.filter((_, i) => i !== index))
  }

  const updateLine = (index: number, field: string, value: any) => {
    const updated = [...formLines]
    ;(updated[index] as any)[field] = value
    setFormLines(updated)
  }

  const totalDebit = formLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
  const totalCredit = formLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* ★ Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-emerald-600" />
            اسناد تکرارشونده
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            هزینه‌های ثابت دوره‌ای (اجاره، حقوق، بیمه و ...) به‌صورت خودکار ثبت می‌شوند
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceRun}
            disabled={running}
            className="gap-1.5 text-xs"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            اجرای دستی
          </Button>
          <Button
            size="sm"
            onClick={() => { resetForm(); setEditingId(null); setDialogOpen(true) }}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            الگوی جدید
          </Button>
        </div>
      </div>

      {/* ★ Messages */}
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {success}
        </div>
      )}

      {/* ★ لیست الگوها */}
      {templates.length === 0 ? (
        <Card className="border-gray-200">
          <CardContent className="py-12 text-center">
            <Repeat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">هنوز الگوی تکرارشونده‌ای تعریف نشده</p>
            <p className="text-xs text-gray-400">با کلیک روی «الگوی جدید» اولین الگوی خود را ایجاد کنید</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map((rj) => (
            <Card
              key={rj.id}
              className={`border ${rj.isActive ? 'border-emerald-200' : 'border-gray-200 opacity-60'}`}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-gray-900 truncate">{rj.title}</h3>
                      <Badge className={
                        rj.isActive
                          ? 'bg-emerald-100 text-emerald-700 text-[9px]'
                          : 'bg-gray-100 text-gray-500 text-[9px]'
                      }>
                        {rj.isActive ? 'فعال' : 'غیرفعال'}
                      </Badge>
                      <Badge className="bg-blue-50 text-blue-600 text-[9px]">
                        {FREQUENCY_LABELS[rj.frequency] || rj.frequency}
                      </Badge>
                      {rj.generatedCount > 0 && (
                        <Badge className="bg-purple-50 text-purple-600 text-[9px]">
                          {rj.generatedCount.toLocaleString('fa-IR')} سند تولیدشده
                        </Badge>
                      )}
                    </div>
                    {rj.description && (
                      <p className="text-xs text-gray-500 mb-1">{rj.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {getScheduleDescription(rj)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        اجرای بعدی: {formatDate(rj.nextExecutionDate)}
                      </span>
                      {rj.lastExecutedAt && (
                        <span>آخرین اجرا: {formatDate(rj.lastExecutedAt)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleToggleActive(rj)}
                      title={rj.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                    >
                      <Power className={`w-3.5 h-3.5 ${rj.isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleEdit(rj)}
                      title="ویرایش"
                    >
                      <Edit className="w-3.5 h-3.5 text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setDeleteId(rj.id)}
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* ★ خطوط سند */}
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="space-y-1">
                    {rj.lines.map((line, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[10px] py-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-gray-400">{line.accountCode || '---'}</span>
                          <span className="text-gray-600 truncate">{line.accountName || 'حساب نامشخص'}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {line.debit > 0 && (
                            <span className="text-blue-600 font-mono">بدهکار: {formatAmount(line.debit)}</span>
                          )}
                          {line.credit > 0 && (
                            <span className="text-emerald-600 font-mono">بستانکار: {formatAmount(line.credit)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ★ مودال ایجاد/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); resetForm() } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Repeat className="w-4 h-4 text-emerald-600" />
              {editingId ? 'ویرایش الگوی تکرارشونده' : 'الگوی تکرارشونده جدید'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              الگویی برای تولید خودکار سند حسابداری در دوره‌های مشخص تعریف کنید
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* عنوان */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">عنوان *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="مثلاً: اجاره مغازه"
                className="h-9"
              />
            </div>

            {/* توضیحات */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">توضیحات سند</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="توضیحاتی که در سند تولیدشده ثبت می‌شود"
                className="text-xs min-h-[50px]"
              />
            </div>

            {/* دوره تکرار */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">دوره تکرار</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">هفتگی</SelectItem>
                    <SelectItem value="monthly">ماهانه</SelectItem>
                    <SelectItem value="quarterly">فصلی (هر ۳ ماه)</SelectItem>
                    <SelectItem value="yearly">سالانه</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* روز هفته (برای weekly) */}
              {formFrequency === 'weekly' && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">روز هفته</Label>
                  <Select value={String(formDayOfWeek)} onValueChange={(v) => setFormDayOfWeek(parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OF_WEEK_LABELS.map((day, idx) => (
                        <SelectItem key={idx} value={String(idx)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* روز ماه (برای monthly/quarterly/yearly) */}
              {formFrequency !== 'weekly' && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">روز ماه (۱-۳۱)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={formDayOfMonth}
                    onChange={(e) => setFormDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                    className="h-9"
                  />
                </div>
              )}

              {/* ماه سال (برای yearly) */}
              {formFrequency === 'yearly' && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">ماه سال</Label>
                  <Select value={String(formMonthOfYear)} onValueChange={(v) => setFormMonthOfYear(parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABELS.map((month, idx) => (
                        <SelectItem key={idx} value={String(idx + 1)}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* ثبت خودکار */}
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs font-medium">ثبت خودکار (posted)</p>
                <p className="text-[10px] text-gray-500">اگر خاموش باشد، سند به‌صورت پیش‌نویس ایجاد می‌شود</p>
              </div>
              <Switch checked={formAutoPost} onCheckedChange={setFormAutoPost} />
            </div>

            {/* خطوط سند */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">ردیف‌های سند</Label>
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={addLine}>
                  <Plus className="w-3 h-3" />
                  افزودن ردیف
                </Button>
              </div>

              <div className="space-y-1.5">
                {formLines.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                    {/* انتخاب حساب */}
                    <div className="flex-1 min-w-0">
                      <Select
                        value={line.accountId}
                        onValueChange={(v) => updateLine(idx, 'accountId', v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="انتخاب حساب" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              <span className="font-mono text-[10px]">{acc.code}</span>
                              {' — '}
                              <span className="text-xs">{acc.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* بدهکار */}
                    <div className="w-24">
                      <Input
                        type="number"
                        placeholder="بدهکار"
                        value={line.debit || ''}
                        onChange={(e) => updateLine(idx, 'debit', Number(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* بستانکار */}
                    <div className="w-24">
                      <Input
                        type="number"
                        placeholder="بستانکار"
                        value={line.credit || ''}
                        onChange={(e) => updateLine(idx, 'credit', Number(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* حذف */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => removeLine(idx)}
                      disabled={formLines.length <= 2}
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* جمع‌بندی */}
              <div className="flex items-center justify-between p-2 bg-gray-100 rounded text-xs">
                <span className="text-gray-500">جمع کل:</span>
                <div className="flex items-center gap-3">
                  <span className="text-blue-600 font-mono">بدهکار: {formatAmount(totalDebit)}</span>
                  <span className="text-emerald-600 font-mono">بستانکار: {formatAmount(totalCredit)}</span>
                  <Badge className={
                    isBalanced
                      ? 'bg-emerald-100 text-emerald-700 text-[9px]'
                      : 'bg-red-100 text-red-700 text-[9px]'
                  }>
                    {isBalanced ? '✓ تراز' : '✗ نامتعادل'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); setEditingId(null); resetForm() }}>
              انصراف
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !isBalanced}
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editingId ? 'به‌روزرسانی' : 'ایجاد الگو'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ مودال تأیید حذف */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">حذف الگوی تکرارشونده</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              آیا از حذف این الگو مطمئن هستید؟ اسناد قبلی که از این الگو تولید شده‌اند حذف نخواهند شد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="text-xs bg-red-600 hover:bg-red-700"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default RecurringJournalsManager
