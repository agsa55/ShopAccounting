'use client'

// ============================================================================
// src/components/settings/fiscal-year-tab.tsx
// ShopAccounting — تب مدیریت سال مالی
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { useToast } from '@/hooks/use-toast'
import {
  todayISO, gregorianISOToJalali, isoToJalaliFa,
} from '@/lib/jalali-utils'
import { PersianDatePicker } from '@/components/ui/persian-date-picker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  CalendarDays, Calendar, Loader2, CheckCircle2, RefreshCw, Plus, PlayCircle,
  Archive, Clock, Pencil, Trash2, Info, AlertTriangle, Save,
} from 'lucide-react'

export function FiscalYearTab() {
  const planName = useAppStore((s) => s.planName)
  const features = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const { toast } = useToast()

  const [years, setYears] = useState<any[]>([])
  const [activeYear, setActiveYear] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formStartISO, setFormStartISO] = useState<string | null>(null)
  const [formEndISO, setFormEndISO] = useState<string | null>(null)
  const [formActivate, setFormActivate] = useState(true)
  const [formSaving, setFormSaving] = useState(false)

  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeLoading, setCloseLoading] = useState(false)
  const [closeResult, setCloseResult] = useState<any>(null)

  const [editingYear, setEditingYear] = useState<any>(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const loadYears = useCallback(async () => {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
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
        const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
        const toFa = (n: number) => String(n).replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
        setFormName(`سال مالی ${toFa(jToday[0])}`)
      }
    }
  }, [formOpen, formStartISO])

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
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
        alert(data.message)
        setFormOpen(false)
        setFormName('')
        setFormStartISO(null)
        setFormEndISO(null)
        setFormActivate(true)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در ایجاد سال مالی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setFormSaving(false)
  }

  const handleActivate = async (yearId: string, yearName: string) => {
    if (!confirm(`آیا از فعال‌سازی سال مالی «${yearName}» مطمئن هستید؟ سال فعلی غیرفعال خواهد شد.`)) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
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
        alert(data.message)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در فعال‌سازی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
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
        alert(data.message)
        setEditingYear(null)
        setEditName('')
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در به‌روزرسانی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setEditSaving(false)
  }

  const handleDelete = async (yearId: string, yearName: string) => {
    if (!confirm(`آیا از حذف سال مالی «${yearName}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`)) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fiscal-years/${yearId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در حذف')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
  }

  const handleCloseConfirm = async () => {
    setCloseLoading(true)
    setCloseResult(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setCloseResult(data.data)
        alert(data.message)
        setCloseDialogOpen(false)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در بستن سال مالی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setCloseLoading(false)
  }

  if (!features.canFiscalYearManagement && !features.canCloseFiscalYear) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-6 text-center">
          <CalendarDays className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-2">مدیریت سال مالی</h3>
          <p className="text-xs text-gray-500 mb-4">
            تعریف، فعال‌سازی و بستن سال‌های مالی فقط در پلن سازمانی در دسترس است. این قابلیت برای نگهداری تاریخچه حسابداری دوره‌ای و گزارش‌گیری صحیح ضروری است.
          </p>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => useAppStore.getState().setCurrentView('settings-subscription' as any)}>
            ارتقا به پلن سازمانی
          </Button>
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
              title="به‌روزرسانی"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-1">
          {loading && !activeYear ? (
            <div className="py-3 text-center">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500 mx-auto" />
              <p className="text-[10px] text-gray-400 mt-1">در حال بارگذاری...</p>
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
                      {(activeYear.progress || 0).toLocaleString('fa-IR')}٪
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-emerald-100">
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">تعداد اسناد</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(activeYear.entryCount || 0).toLocaleString('fa-IR')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">مدت سال</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(() => {
                      const start = new Date(activeYear.startDate).getTime()
                      const end = new Date(activeYear.endDate).getTime()
                      const days = Math.round((end - start) / (1000 * 60 * 60 * 24))
                      return days.toLocaleString('fa-IR') + ' روز'
                    })()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">روزهای باقی‌مانده</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(() => {
                      const end = new Date(activeYear.endDate).getTime()
                      const now = Date.now()
                      const days = Math.max(0, Math.round((end - now) / (1000 * 60 * 60 * 24)))
                      return days.toLocaleString('fa-IR') + ' روز'
                    })()}
                  </div>
                </div>
              </div>
              {features.canCloseFiscalYear && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 text-[11px] h-7 w-full mt-1"
                  onClick={() => {
                    if (activeYear) {
                      const startDate = new Date(activeYear.startDate)
                      const now = new Date()
                      const daysPassed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                      if (daysPassed < 365) {
                        const remaining = 365 - daysPassed
                        toast({
                          title: 'بستن سال مالی ممکن نیست',
                          description: `هنوز سال مالی به اتمام نرسیده است. ${remaining.toLocaleString('fa-IR')} روز تا پایان سال مالی باقی مانده است.`,
                          variant: 'destructive',
                        })
                        return
                      }
                    }
                    setCloseResult(null)
                    setCloseDialogOpen(true)
                  }}
                >
                  <Archive className="w-3 h-3 ml-1" />
                  بستن این سال مالی
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
                {years.length.toLocaleString('fa-IR')} سال
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
                            {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'ذخیره'}
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
                              <Badge className="text-[9px] bg-emerald-100 text-emerald-700">فعال</Badge>
                            )}
                            {y.isClosed && (
                              <Badge className="text-[9px] bg-gray-200 text-gray-600">بسته‌شده</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[9px] text-gray-500" dir="ltr">
                            <span>{isoToJalaliFa(y.startDate)} — {isoToJalaliFa(y.endDate)}</span>
                          </div>
                          {y.isClosed && y.closedAt && (
                            <div className="text-[9px] text-gray-400 mt-0.5">
                              <Clock className="w-2.5 h-2.5 inline ml-0.5" />
                              بسته شد: {isoToJalaliFa(y.closedAt.toISOString ? y.closedAt.toISOString() : y.closedAt)}
                            </div>
                          )}
                          {y.notes && (
                            <div className="text-[9px] text-gray-400 mt-0.5 truncate">
                              <Info className="w-2.5 h-2.5 inline ml-0.5" />
                              {y.notes}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {y.entryCount > 0 && (
                      <Badge className="text-[9px] bg-blue-50 text-blue-600" title="تعداد اسناد">
                        {y.entryCount.toLocaleString('fa-IR')} سند
                      </Badge>
                    )}
                    {features.canFiscalYearManagement && !y.isClosed && !y.isActive && editingYear?.id !== y.id && (
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
                    {features.canFiscalYearManagement && !y.isClosed && y.isActive && editingYear?.id !== y.id && (
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
                <strong className="text-blue-700">سال فعال:</strong> تمام اسناد حسابداری جدید به این سال متصل می‌شوند. در هر لحظه فقط یک سال فعال می‌تواند وجود داشته باشد.
              </p>
              <p>
                <strong className="text-gray-700">سال بسته‌شده:</strong> قابل ویرایش یا حذف نیست. برای حفظ سابقه حسابداری، سال‌های بسته‌شده دائمی هستند.
              </p>
              <p>
                <strong className="text-emerald-700">بستن سال:</strong> تمام حساب‌های درآمد و هزینه صفر شده، سود/زیان به حساب سود انباشته منتقل می‌شود، و سال جدید به‌صورت خودکار ایجاد و فعال می‌شود.
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
              سال مالی دوره‌ای است که اسناد حسابداری در آن ثبت می‌شوند. در هر لحظه فقط یک سال فعال می‌تواند وجود داشته باشد.
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
              <p className="text-[9px] text-gray-400 mt-0.5">
                اسفند ۳۰ روز است (۲۹ در سال غیر کبیسه)
              </p>
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
                <div className="flex justify-between">
                  <span>تاریخ شروع (میلادی):</span>
                  <span className="font-mono" dir="ltr">{formStartISO}</span>
                </div>
                <div className="flex justify-between">
                  <span>تاریخ پایان (میلادی):</span>
                  <span className="font-mono" dir="ltr">{formEndISO}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-200">
                  <span>مدت سال:</span>
                  <span className="font-mono">
                    {(() => {
                      const start = new Date(formStartISO)
                      const end = new Date(formEndISO)
                      const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
                      return days.toLocaleString('fa-IR') + ' روز'
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

      {/* دیالوگ تأیید بستن سال */}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              تأیید بستن سال مالی
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-relaxed">
              {activeYear ? (
                <>
                  در حال بستن سال مالی «<strong>{activeYear.name}</strong>» هستید.
                  <br />
                  این عملیات غیرقابل بازگشت است و:
                  <br />
                  • تمام حساب‌های درآمد و هزینه صفر می‌شوند
                  <br />
                  • سود/زیان به حساب سود انباشته منتقل می‌شود
                  <br />
                  • سند بستن سال مالی ایجاد می‌شود
                  <br />
                  • سال جدید با تاریخ شروع = روز بعد از پایان این سال ایجاد و فعال می‌شود
                  <br /><br />
                  <strong className="text-red-600">توصیه:</strong> قبل از بستن سال، حتماً از سیستم پشتیبان بگیرید.
                </>
              ) : (
                'سال فعالی برای بستن وجود ندارد.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {closeResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-[10px] space-y-1 my-2">
              <div className="font-bold text-emerald-700 pb-1 border-b border-emerald-100">نتیجه بستن سال:</div>
              <div className="flex justify-between">
                <span>درآمد کل:</span>
                <span className="font-mono text-emerald-600">
                  {(closeResult.totalRevenue || 0).toLocaleString('fa-IR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>هزینه کل:</span>
                <span className="font-mono text-red-600">
                  {(closeResult.totalExpense || 0).toLocaleString('fa-IR')}
                </span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-emerald-100">
                <span>سود/زیان خالص:</span>
                <span className={`font-mono ${(closeResult.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {(closeResult.netProfit || 0).toLocaleString('fa-IR')}
                </span>
              </div>
              {closeResult.newYear && (
                <div className="pt-1 border-t border-emerald-100 text-emerald-700">
                  ✓ سال جدید «{closeResult.newYear.name}» ایجاد و فعال شد
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="text-xs h-8">انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseConfirm}
              disabled={closeLoading || !activeYear}
              className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
            >
              {closeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Archive className="w-3.5 h-3.5 ml-1" />}
              بستن سال مالی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}