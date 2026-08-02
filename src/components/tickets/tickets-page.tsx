'use client'

// ============================================================================
// src/components/tickets/tickets-page.tsx — v9.7.0 (آفلاین هوشمند)
// ----------------------------------------------------------------------------
// صفحه تیکت‌های پشتیبانی — لیست + فیلتر + ایجاد تیکت جدید + پشتیبانی آفلاین
// ★ v6.4: پشتیبانی کامل آفلاین (نمایش، ایجاد، کش کردن)
// ★ v6.4: کارت موبایل رسپانسیو + ذخیره داده تیکت در sessionStorage
// ★ v9.7.0: جایگزینی navigator.onLine با isApiOnline() از connectivity module
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
  CheckCircle2, Clock, AlertCircle, XCircle, Filter,
  RefreshCw, Inbox, Send, WifiOff, CloudOff
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  cacheTickets, getCachedTickets, cacheTicketStats, getCachedTicketStats,
  setLastSyncTimestamp, getLastSyncTimestamp
} from '@/lib/offline-db'
import { Skeleton } from '@/components/ui/skeleton'

// ★ v9.7.0: ماژول تشخیص اتصال هوشمند
import {
  isOnline as isApiOnline,
  onConnectivityChange,
  startConnectivityMonitor,
} from '@/lib/connectivity'

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
  _isOffline?: boolean // ★ v6.4
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
function toFaNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return ''
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

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
  if (diffMin < 60) return `${toFaNum(diffMin)} دقیقه پیش`
  if (diffHr < 24) return `${toFaNum(diffHr)} ساعت پیش`
  if (diffDay < 7) return `${toFaNum(diffDay)} روز پیش`

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
// ★ v6.4: کامپوننت کارت تیکت برای موبایل
// ═══════════════════════════════════════════════════════════════
function MobileTicketCard({ ticket, onSelect }: { 
  ticket: Ticket
  onSelect: (id: string, ticket: Ticket) => void 
}) {
  const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
  const priCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal
  const StatusIcon = statusCfg.icon

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow active:bg-emerald-50/40 border-gray-100"
      onClick={() => onSelect(ticket.id, ticket)}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${statusCfg.bg}`}>
              <StatusIcon className={`w-4 h-4 ${statusCfg.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-gray-900 truncate">{ticket.subject}</p>
                {ticket._isOffline && <CloudOff className="w-3 h-3 text-amber-500 shrink-0" />}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded ${priCfg.bg} ${priCfg.color}`}>
                  {priCfg.label}
                </span>
                <span className="text-[10px] text-gray-400">{formatRelativeTime(ticket.updatedAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {ticket.unreadCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
            <span className={`inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
        </div>

        {ticket.lastMessage && (
          <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
              {ticket.lastMessage.senderType === 'customer' ? 'شما: ' : 'پشتیبانی: '}
              {ticket.lastMessage.message}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════
export function TicketsPage() {
  const setCurrentView = useStore((s) => s.setCurrentView)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ★ v6.4: وضعیت آفلاین
  const [isOnline, setIsOnline] = useState(true)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

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

  // ─── ★ v9.7.0: تشخیص وضعیت آنلاین/آفلاین (هوشمند) ──────────
  useEffect(() => {
    // شروع مانیتورینگ (اگر قبلاً شروع نشده، no-op)
    startConnectivityMonitor()

    // تنظیم اولیه بر اساس وضعیت واقعی API
    setIsOnline(isApiOnline())

    // listener اصلی: connectivity module
    const unsubConnectivity = onConnectivityChange((state) => {
      setIsOnline(state.isApiReachable)
    })

    // حفظ backward compat: event‌های مرورگر
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      unsubConnectivity()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ─── بارگذاری تیکت‌ها (با پشتیبانی آفلاین) ─────────────────
  const loadTickets = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      else setRefreshing(true)

      // ★ v9.7.0: بررسی واقعی API به‌جای navigator.onLine
      const trulyOnline = isApiOnline()

      // ★ v6.4: بارگذاری از کش در حالت آفلاین
      if (!trulyOnline) {
        try {
          const cachedTickets = await getCachedTickets()
          const cachedStats = await getCachedTicketStats()
          setTickets(cachedTickets.map((t: any) => ({ ...t, _isOffline: true })))
          setStats(cachedStats)
          setTotal(cachedTickets.length)
          setTotalPages(1)
        } catch (err) {
          console.error('[TicketsPage] Offline load error:', err)
        }
        setLoading(false)
        setRefreshing(false)
        return
      }
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: '10',
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

          // ★ v6.4: ذخیره در کش برای استفاده آفلاین
          await cacheTickets(data.data || [])
          if (data.stats) await cacheTicketStats(data.stats)
          const timestamp = Date.now()
          await setLastSyncTimestamp(timestamp)
          setLastSyncTime(timestamp)
        } else {
          throw new Error(data.error || 'بارگذاری تیکت‌ها ناموفق بود')
        }
      } catch (err: any) {
        console.error('[TicketsPage] load error:', err)
        // ★ v6.4: Fallback به کش
        try {
          const cachedTickets = await getCachedTickets()
          const cachedStats = await getCachedTicketStats()
          setTickets(cachedTickets.map((t: any) => ({ ...t, _isOffline: true })))
          setStats(cachedStats)
          setTotal(cachedTickets.length)
          setTotalPages(1)
          toast({
            title: 'حالت آفلاین',
            description: 'داده‌های محلی نمایش داده می‌شوند',
          })
        } catch {
          toast({
            title: 'خطا',
            description: 'ارتباط با سرور برقرار نشد',
            variant: 'destructive',
          })
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    // ★ v9.7.0: حذف isOnline از dependency — از isApiOnline() استفاده می‌شود
    [page, statusFilter, categoryFilter, priorityFilter, search, toast]
  )

  useEffect(() => {
    loadTickets()
    const interval = setInterval(() => {
      // ★ v9.7.0: بررسی واقعی API
      if (isApiOnline()) loadTickets(true)
    }, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, categoryFilter, priorityFilter, search, isOnline])

  // بارگذاری آخرین زمان sync از کش
  useEffect(() => {
    const loadLastSync = async () => {
      const timestamp = await getLastSyncTimestamp()
      if (timestamp) setLastSyncTime(timestamp)
    }
    loadLastSync()
  }, [])

  // ─── باز کردن تیکت ──────────────────────────────────────────
  // ★ v6.4: ذخیره کل داده‌های تیکت در sessionStorage برای دسترسی آنی در حالت آفلاین
  const handleOpenTicket = useCallback((ticketId: string, ticketData?: Ticket) => {
    useStore.getState().setCurrentView('ticket-detail' as AppView)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('currentTicketId', ticketId)
      if (ticketData) {
        sessionStorage.setItem('currentTicketData', JSON.stringify(ticketData))
      }
    }
  }, [])

  // ─── ارسال تیکت جدید (با پشتیبانی آفلاین) ───────────────────
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
    // ★ v9.7.0: بررسی واقعی API
    const trulyOnline = isApiOnline()

    // ★ v6.4: ایجاد تیکت به صورت محلی در حالت آفلاین
    if (!trulyOnline) {
      const newTicket: Ticket = {
        id: `offline_${Date.now()}`,
        ticketNumber: 'در انتظار...',
        subject: form.subject.trim(),
        category: form.category,
        categoryLabel: CATEGORIES.find(c => c.value === form.category)?.label || form.category,
        priority: form.priority,
        priorityLabel: PRIORITY_CONFIG[form.priority]?.label || form.priority,
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firstResponseAt: null,
        closedAt: null,
        messageCount: 1,
        unreadCount: 0,
        rating: null,
        lastMessage: {
          senderType: 'customer',
          senderName: 'شما',
          message: form.description.trim(),
          createdAt: new Date().toISOString(),
        },
        _isOffline: true
      }

      setTickets(prev => [newTicket, ...prev])
      
      try {
        const cachedTickets = await getCachedTickets()
        await cacheTickets([newTicket, ...cachedTickets])
        console.log('[TicketsPage] ✅ Offline ticket saved to IndexedDB')
      } catch (err) {
        console.error('[TicketsPage] Error saving offline ticket to cache:', err)
      }
      
      setForm({ subject: '', description: '', category: 'general', priority: 'normal' })
      setCreateDialogOpen(false)
      
      // ★ اصلاح: ریست کردن فیلترها برای اطمینان از نمایش تیکت جدید
      setStatusFilter('all')
      setCategoryFilter('all')
      setPriorityFilter('all')
      setPage(1)

      toast({
        title: 'ذخیره شد ✓',
        description: 'تیکت به صورت محلی ذخیره شد و پس از اتصال به اینترنت ارسال می‌شود.',
      })
      setSubmitting(false)
      return
    }

    // ★ ارسال آنلاین
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
        const ticketNumber = data.data?.ticketNumber || ''
        toast({
          title: 'تیکت ارسال شد ✓',
          description: `تیکت شما با شماره ${ticketNumber} با موفقیت به پشتیبانی ارسال شد.`,
          duration: 6000,
        })
        setForm({ subject: '', description: '', category: 'general', priority: 'normal' })
        setCreateDialogOpen(false)
        
        // ★ اصلاح کلیدی: ریست کردن فیلترها تا تیکت جدید (که وضعیتش Open است) مخفی نشود
        setStatusFilter('all')
        setCategoryFilter('all')
        setPriorityFilter('all')
        setPage(1)
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
          {!isOnline && (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50 px-1.5">
              <WifiOff className="w-2.5 h-2.5" />
              <span className="hidden sm:inline">آفلاین</span>
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadTickets(true)}
            disabled={refreshing || !isOnline}
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

      {/* ─── بنر آفلاین ─── */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shrink-0">
          <CloudOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1 text-xs text-amber-700">
            <span className="font-bold">حالت آفلاین: </span>
            <span>داده‌های محلی نمایش داده می‌شوند. تیکت‌های جدید پس از اتصال همگام‌سازی می‌شوند.</span>
          </div>
          {lastSyncTime && (
            <span className="text-[10px] text-amber-600 shrink-0 whitespace-nowrap">
              sync: {new Date(lastSyncTime).toLocaleDateString('fa-IR')}
            </span>
          )}
        </div>
      )}

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
                  {toFaNum(s.count)}
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
              <div className={`${mobileSearchOpen ? 'block' : 'hidden sm:block'}`}>
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  autoFocus={mobileSearchOpen}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  onBlur={() => { if (!search && window.innerWidth < 640) setMobileSearchOpen(false) }}
                  placeholder="جستجو در موضوع یا شماره تیکت..."
                  className="pr-8 text-sm"
                />
              </div>
              {!mobileSearchOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMobileSearchOpen(true)}
                  className="h-9 w-full sm:hidden flex items-center justify-center gap-2"
                >
                  <Search className="w-4 h-4" /> جستجو
                </Button>
              )}
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
         <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-3 border-gray-100">
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            </Card>
          ))}
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
          {/* ★ v6.4: نمای کارتی برای موبایل */}
          <div className="md:hidden space-y-2">
            {tickets.map((t) => (
              <MobileTicketCard key={t.id} ticket={t} onSelect={handleOpenTicket} />
            ))}
          </div>

          {/* ★★★ نمای جدولی برای دسکتاپ (با فونت بزرگ‌تر و اعداد فارسی) */}
          <Card className="hidden md:block overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="text-right px-3 py-2 text-xs font-bold text-gray-600 whitespace-nowrap">شماره تیکت</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-gray-600">موضوع</th>
                      <th className="text-center px-3 py-2 text-xs font-bold text-gray-600 whitespace-nowrap">دسته</th>
                      <th className="text-center px-3 py-2 text-xs font-bold text-gray-600 whitespace-nowrap">اولویت</th>
                      <th className="text-center px-3 py-2 text-xs font-bold text-gray-600 whitespace-nowrap">وضعیت</th>
                      <th className="text-center px-3 py-2 text-xs font-bold text-gray-600 whitespace-nowrap">پیام‌ها</th>
                      <th className="text-center px-3 py-2 text-xs font-bold text-gray-600 whitespace-nowrap">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => {
                      const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open
                      const priCfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.normal
                      const StatusIcon = statusCfg.icon

                      return (
                        <tr
                          key={t.id}
                          onClick={() => handleOpenTicket(t.id, t)}
                          className="border-b border-gray-100 hover:bg-emerald-50/40 transition-colors group cursor-pointer"
                        >
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {t.unreadCount > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                              )}
                              <span className="text-sm text-gray-500 font-mono" dir="ltr">
                                {toFaNum(t.ticketNumber)}
                              </span>
                              {t._isOffline && <CloudOff className="w-3 h-3 text-amber-500" />}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 max-w-xs">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-700 truncate">
                              {t.subject}
                              {t.rating && <span className="text-xs text-amber-500 mr-1">★{toFaNum(t.rating)}</span>}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="text-xs text-gray-500">{t.categoryLabel}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`inline-block text-xs px-2 py-0.5 rounded ${priCfg.bg} ${priCfg.color}`}>
                              {priCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="text-xs text-gray-500 inline-flex items-center gap-0.5">
                              <MessageCircle className="w-3.5 h-3.5" />
                              {toFaNum(t.messageCount)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="text-xs text-gray-400">
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
                نمایش {toFaNum((page - 1) * 10 + 1)} تا {toFaNum(Math.min(page * 10, total))} از {toFaNum(total)} تیکت
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
                  صفحه {toFaNum(page)} از {toFaNum(totalPages)}
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

          {!isOnline && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-800">
              <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>شما آفلاین هستید. تیکت به صورت محلی ذخیره شده و پس از اتصال به اینترنت ارسال می‌شود.</p>
            </div>
          )}

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
                {toFaNum(form.subject.length)}/500 کاراکتر
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
                {toFaNum(form.description.length)}/10000 کاراکتر
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
                  {isOnline ? 'ارسال تیکت' : 'ذخیره آفلاین'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}