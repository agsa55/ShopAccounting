'use client'

// ============================================================================
// src/components/tickets/tickets-page.tsx — v8.6
// ----------------------------------------------------------------------------
// صفحه تیکت‌های پشتیبانی — لیست + فیلتر + ایجاد تیکت جدید
// هر سه پلن (ساده/حرفه‌ای/سازمانی) به یک اندازه دسترسی دارند.
// تمام تیکت‌ها به tenant (فروشگاه) کاربر محدود هستند.
// ============================================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore, type AppView } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Ticket as TicketIcon, Plus, Search, Loader2, MessageCircle,
  CheckCircle2, Clock, AlertCircle, XCircle, Filter, ChevronLeft,
  RefreshCw, Inbox, Send,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── تایپ‌ها ────────────────────────────────────────────────────
interface Ticket {
  id: string
  ticketNumber: string
  subject: string
  category: string
  categoryLabel: string
  priority: string
  priorityLabel: string
  status: string
  createdAt: string
  updatedAt: string
  firstResponseAt: string | null
  closedAt: string | null
  messageCount: number
  unreadCount: number
  lastMessage: {
    senderType: string
    senderName: string
    message: string
    createdAt: string
  } | null
  rating: number | null
}

interface Stats {
  total: number
  open: number
  pending: number
  answered: number
  resolved: number
  closed: number
}

// ─── کمک‌تابع‌ها ────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'همین حالا'
  if (diffMin < 60) return `${diffMin} دقیقه پیش`
  if (diffHr < 24) return `${diffHr} ساعت پیش`
  if (diffDay < 7) return `${diffDay} روز پیش`

  // نمایش تاریخ شمسی ساده
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

function formatFullDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ─── رنگ‌بندی وضعیت‌ها ─────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  open: { label: 'باز', color: 'text-blue-700', bg: 'bg-blue-100', icon: AlertCircle },
  pending: { label: 'منتظر پاسخ', color: 'text-amber-700', bg: 'bg-amber-100', icon: Clock },
  answered: { label: 'پاسخ داده شده', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
  resolved: { label: 'حل شده', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
  closed: { label: 'بسته شده', color: 'text-gray-600', bg: 'bg-gray-100', icon: XCircle },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'کم', color: 'text-gray-600', bg: 'bg-gray-100' },
  normal: { label: 'عادی', color: 'text-blue-700', bg: 'bg-blue-100' },
  high: { label: 'بالا', color: 'text-orange-700', bg: 'bg-orange-100' },
  urgent: { label: 'فوری', color: 'text-red-700', bg: 'bg-red-100' },
}

const CATEGORIES = [
  { value: 'general', label: 'عمومی' },
  { value: 'bug', label: 'گزارش باگ' },
  { value: 'feature', label: 'درخواست قابلیت' },
  { value: 'billing', label: 'مالی و اشتراک' },
  { value: 'account', label: 'حساب کاربری' },
  { value: 'accounting', label: 'حسابداری' },
  { value: 'pos', label: 'صندوق فروش' },
  { value: 'inventory', label: 'انبارداری' },
]

// ═══════════════════════════════════════════════════════════════
// کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════
export function TicketsPage() {
  const setCurrentView = useStore((s) => s.setCurrentView)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // فیلترها
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // صفحه‌بندی
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // دیالوگ ایجاد
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    subject: '',
    description: '',
    category: 'general',
    priority: 'normal',
  })

  const { toast } = useToast()

  // ─── بارگذاری تیکت‌ها ───────────────────────────────────────
  const loadTickets = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: '10',  // ★★★ v8.6.2: کاهش از 20 به 10 برای صفحه‌بندی زودتر
        })
        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (categoryFilter !== 'all') params.set('category', categoryFilter)
        if (priorityFilter !== 'all') params.set('priority', priorityFilter)
        if (search.trim()) params.set('search', search.trim())

        const res = await fetch(`/api/tickets?${params.toString()}`, {
          headers: getAuthHeaders(),
        })
        const data = await res.json()
        if (data.success) {
          setTickets(data.data || [])
          setStats(data.stats || null)
          setTotal(data.pagination?.total || 0)
          setTotalPages(data.pagination?.totalPages || 1)
        } else {
          toast({
            title: 'خطا',
            description: data.error || 'بارگذاری تیکت‌ها ناموفق بود',
            variant: 'destructive',
          })
        }
      } catch (err) {
        console.error('[TicketsPage] load error:', err)
        toast({
          title: 'خطا',
          description: 'ارتباط با سرور برقرار نشد',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [page, statusFilter, categoryFilter, priorityFilter, search, toast]
  )

  useEffect(() => {
    loadTickets()
    // بارگذاری مجدد هر ۶۰ ثانیه برای دریافت پاسخ‌های جدید ادمین
    const interval = setInterval(() => loadTickets(true), 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, categoryFilter, priorityFilter, search])

  // ─── باز کردن تیکت ──────────────────────────────────────────
  const handleOpenTicket = (ticketId: string) => {
    // ذخیره آی‌دی تیکت انتخاب‌شده در store و سپس تغییر ویو
    useStore.getState().setCurrentView('ticket-detail' as AppView)
    // استفاده از sessionStorage برای انتقال آی‌دی به صفحه جزئیات
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('currentTicketId', ticketId)
    }
  }

  // ─── ارسال تیکت جدید ───────────────────────────────────────
  const handleSubmitTicket = async () => {
    if (form.subject.trim().length < 5) {
      toast({ title: 'توجه', description: 'موضوع حداقل باید ۵ کاراکتر باشد', variant: 'destructive' })
      return
    }
    if (form.description.trim().length < 10) {
      toast({ title: 'توجه', description: 'متن تیکت حداقل باید ۱۰ کاراکتر باشد', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          subject: form.subject.trim(),
          description: form.description.trim(),
          category: form.category,
          priority: form.priority,
        }),
      })
      const data = await res.json()

      if (data.success) {
        // ★★★ v8.6.2: پیام تأیید با مشخصات کامل + شماره تیکت
        const ticketNumber = data.data?.ticketNumber || ''
        toast({
          title: 'تیکت ارسال شد ✓',
          description: `تیکت شما با شماره ${ticketNumber} با موفقیت به پشتیبانی ارسال شد.\nوضعیت: ارسال شده — در انتظار بررسی پشتیبانی.`,
          duration: 6000,
        })
        setForm({ subject: '', description: '', category: 'general', priority: 'normal' })
        setCreateDialogOpen(false)
        setPage(1)  // ★ برگشت به صفحه اول برای دیدن تیکت جدید
        loadTickets(true)
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'ثبت تیکت ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('[TicketsPage] submit error:', err)
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── آمار خلاصه در کارت‌های بالا ─────────────────────────────
  const statsCards = useMemo(() => {
    if (!stats) return []
    return [
      { label: 'همه', count: stats.total, color: 'text-gray-700', bg: 'bg-gray-100', key: 'all' },
      { label: 'باز', count: stats.open, color: 'text-blue-700', bg: 'bg-blue-100', key: 'open' },
      { label: 'منتظر پاسخ', count: stats.pending, color: 'text-amber-700', bg: 'bg-amber-100', key: 'pending' },
      { label: 'پاسخ‌داده‌شده', count: stats.answered, color: 'text-emerald-700', bg: 'bg-emerald-100', key: 'answered' },
      { label: 'بسته‌شده', count: stats.closed, color: 'text-gray-600', bg: 'bg-gray-200', key: 'closed' },
    ]
  }, [stats])

  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 font-fa" dir="rtl">
      {/* ─── هدر صفحه ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <TicketIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">تیکت‌های پشتیبانی</h1>
            <p className="text-xs text-gray-500">مشکلات و درخواست‌های خود را برای تیم پشتیبانی ارسال کنید</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadTickets(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline mr-1">به‌روزرسانی</span>
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Send className="w-4 h-4" />
            <span className="mr-1">ارسال تیکت</span>
          </Button>
        </div>
      </div>

      {/* ─── پنل آماری فشرده (نوار افقی) ─── */}
      {!loading && stats && statsCards.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {statsCards.map((s) => {
            const isActive = statusFilter === (s.key === 'all' ? 'all' : s.key)
            return (
              <button
                key={s.key}
                onClick={() => {
                  setStatusFilter(s.key === 'all' ? 'all' : s.key)
                  setPage(1)
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all border ${
                  isActive
                    ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold ${s.bg} ${s.color}`}>
                  {s.count}
                </span>
                <span className={`text-[11px] ${isActive ? 'text-emerald-700 font-medium' : 'text-gray-600'}`}>
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ─── نوار فیلتر ─── */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="جستجو در موضوع یا شماره تیکت..."
                className="pr-8 text-sm"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="text-sm">
                <Filter className="w-3.5 h-3.5 ml-1 text-gray-400" />
                <SelectValue placeholder="دسته‌بندی" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه دسته‌ها</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priorityFilter}
              onValueChange={(v) => {
                setPriorityFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="اولویت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه اولویت‌ها</SelectItem>
                <SelectItem value="low">کم</SelectItem>
                <SelectItem value="normal">عادی</SelectItem>
                <SelectItem value="high">بالا</SelectItem>
                <SelectItem value="urgent">فوری</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="وضعیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="open">باز</SelectItem>
                <SelectItem value="pending">منتظر پاسخ</SelectItem>
                <SelectItem value="answered">پاسخ داده شده</SelectItem>
                <SelectItem value="resolved">حل شده</SelectItem>
                <SelectItem value="closed">بسته شده</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── لیست تیکت‌ها ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-sm font-medium text-gray-700 mb-1">
              {search || statusFilter !== 'all' || categoryFilter !== 'all' || priorityFilter !== 'all'
                ? 'تیکتی مطابق فیلترها یافت نشد'
                : 'هنوز تیکتی ارسال نکرده‌اید'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              برای ارتباط با تیم پشتیبانی، اولین تیکت خود را ارسال کنید
            </p>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1" />
              ارسال اولین تیکت
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ★★★ v8.6.6: جدول واقعی با HTML table */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {/* هدر جدول */}
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gray-600 whitespace-nowrap">شماره تیکت</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gray-600">موضوع</th>
                      <th className="text-center px-3 py-2 text-[11px] font-bold text-gray-600 whitespace-nowrap">دسته</th>
                      <th className="text-center px-3 py-2 text-[11px] font-bold text-gray-600 whitespace-nowrap">اولویت</th>
                      <th className="text-center px-3 py-2 text-[11px] font-bold text-gray-600 whitespace-nowrap">وضعیت</th>
                      <th className="text-center px-3 py-2 text-[11px] font-bold text-gray-600 whitespace-nowrap">پیام‌ها</th>
                      <th className="text-center px-3 py-2 text-[11px] font-bold text-gray-600 whitespace-nowrap">تاریخ</th>
                    </tr>
                  </thead>
                  {/* بدنه جدول */}
                  <tbody>
                    {tickets.map((t) => {
                      const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open
                      const priCfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.normal
                      const StatusIcon = statusCfg.icon

                      return (
                        <tr
                          key={t.id}
                          onClick={() => handleOpenTicket(t.id)}
                          className="border-b border-gray-100 hover:bg-emerald-50/40 transition-colors group cursor-pointer"
                        >
                          {/* شماره تیکت */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {t.unreadCount > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                              )}
                              <span className="text-[11px] text-gray-500 font-mono" dir="ltr">
                                {t.ticketNumber}
                              </span>
                            </div>
                          </td>
                          {/* موضوع */}
                          <td className="px-3 py-2.5 max-w-xs">
                            <p className="text-xs font-medium text-gray-900 group-hover:text-emerald-700 truncate">
                              {t.subject}
                              {t.rating && <span className="text-[10px] text-amber-500 mr-1">★{t.rating}</span>}
                            </p>
                          </td>
                          {/* دسته */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="text-[10px] text-gray-500">{t.categoryLabel}</span>
                          </td>
                          {/* اولویت */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`inline-block text-[10px] px-2 py-0.5 rounded ${priCfg.bg} ${priCfg.color}`}>
                              {priCfg.label}
                            </span>
                          </td>
                          {/* وضعیت */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {statusCfg.label}
                            </span>
                          </td>
                          {/* تعداد پیام */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
                              <MessageCircle className="w-3 h-3" />
                              {t.messageCount}
                            </span>
                          </td>
                          {/* تاریخ */}
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="text-[10px] text-gray-400">
                              {formatRelativeTime(t.updatedAt)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* صفحه‌بندی */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-xs text-gray-500">
                نمایش {(page - 1) * 10 + 1} تا {Math.min(page * 10, total)} از {total} تیکت
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  قبلی
                </Button>
                <span className="text-xs text-gray-600 px-2">
                  صفحه {page} از {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  بعدی
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════ دیالوگ ایجاد تیکت ═══════════════ */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="font-fa sm:max-w-[560px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TicketIcon className="w-5 h-5 text-emerald-600" />
              ارسال تیکت به پشتیبانی
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* موضوع */}
            <div>
              <Label className="text-xs">
                موضوع <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="mt-1"
                placeholder="مثلاً: خطا در ثبت فاکتور فروش"
                maxLength={500}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                {form.subject.length}/500 کاراکتر
              </p>
            </div>

            {/* دسته‌بندی و اولویت */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">دسته‌بندی</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">اولویت</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">کم</SelectItem>
                    <SelectItem value="normal">عادی</SelectItem>
                    <SelectItem value="high">بالا</SelectItem>
                    <SelectItem value="urgent">فوری</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* توضیحات */}
            <div>
              <Label className="text-xs">
                توضیحات کامل <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 min-h-[140px] resize-y"
                placeholder="مشکل یا درخواست خود را با جزئیات بنویسید. هرچه دقیق‌تر بنویسید، سریع‌تر پاسخ می‌گیرید. مثلاً: روی چه صفحه‌ای بودید، چه کاری انجام دادید، چه پیغامی دیدید..."
                maxLength={10000}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                {form.description.length}/10000 کاراکتر
              </p>
            </div>

            {/* راهنما */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[11px] text-blue-700">
              <p className="font-medium mb-1">💡 راهنمایی برای پاسخ سریع‌تر:</p>
              <ul className="space-y-0.5 list-disc pr-4">
                <li>مشکل را دقیق و مرحله‌به‌مرحله توضیح دهید</li>
                <li>اگر پیام خطایی دیدید، متن آن را کپی کنید</li>
                <li>برای باگ‌ها، اولویت «فوری» را فقط برای موارد بحرانی استفاده کنید</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={submitting}>
              انصراف
            </Button>
            <Button
              onClick={handleSubmitTicket}
              disabled={submitting || form.subject.trim().length < 5 || form.description.trim().length < 10}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-1" />
                  در حال ارسال...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 ml-1" />
                  ارسال تیکت
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
