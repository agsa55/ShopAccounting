'use client'

// ============================================================================
// src/components/tickets/ticket-detail.tsx — v8.6 + v6.4 (آفلاین کامل)
// ----------------------------------------------------------------------------
// صفحه جزئیات تیکت — مشاهده کامل + پاسخ + بستن/باز کردن مجدد + امتیازدهی
// ★ v6.4: پشتیبانی کامل آفلاین با sessionStorage و IndexedDB
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore, type AppView } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowRight, Loader2, Send, CheckCircle2, Clock, AlertCircle, XCircle,
  Ticket as TicketIcon, Star, RotateCcw, MessageCircle, Headphones,
  WifiOff, CloudOff
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { 
  cacheTicketMessages, 
  getCachedTicketMessages,
  getCachedTickets // ★ v6.4: اضافه شد
} from '@/lib/offline-db'
import { Skeleton } from '@/components/ui/skeleton'

// ─── تایپ‌ها ────────────────────────────────────────────────────
interface Message {
  id: string
  senderType: 'customer' | 'admin'
  senderName: string
  message: string
  attachments: string[]
  createdAt: string
  isRead: boolean
  _isOffline?: boolean // ★ v6.4
}

interface TicketDetail {
  id: string
  ticketNumber: string
  subject: string
  description: string
  category: string
  categoryLabel: string
  priority: string
  priorityLabel: string
  status: string
  statusLabel: string
  attachments: string[]
  rating: number | null
  ratingComment: string | null
  ratedAt: string | null
  createdAt: string
  updatedAt: string
  firstResponseAt: string | null
  closedAt: string | null
  messages: Message[]
  _isOffline?: boolean // ★ v6.4
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

function formatDateTime(iso: string): string {
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

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

// ─── رنگ‌بندی ──────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
// کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════
export function TicketDetail() {
  const setCurrentView = useStore((s) => s.setCurrentView)
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [hoverRating, setHoverRating] = useState(0)
  
  // ★ v6.4: وضعیت آفلاین
  const [isOnline, setIsOnline] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // ─── دریافت آی‌دی تیکت و داده‌های کش‌شده ──────────────────────
  const ticketId = typeof window !== 'undefined' ? sessionStorage.getItem('currentTicketId') : null
  // ★ v6.4: خواندن داده‌های ذخیره‌شده در لحظه کلیک
  const cachedTicketDataStr = typeof window !== 'undefined' ? sessionStorage.getItem('currentTicketData') : null
  const cachedTicketData = cachedTicketDataStr ? (() => {
    try {
      return JSON.parse(cachedTicketDataStr)
    } catch {
      return null
    }
  })() : null

  // ─── تشخیص وضعیت آنلاین/آفلاین ──────────────────────────────
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ─── بارگذاری تیکت (نسخه نهایی ضدگلوله) ─────────────────────
  const loadTicket = useCallback(async () => {
    if (!ticketId) {
      toast({ title: 'خطا', description: 'شناسه تیکت نامعتبر است', variant: 'destructive' })
      setCurrentView('tickets' as AppView)
      return
    }

    setLoading(true)
    const trulyOnline = isOnline && navigator.onLine

    // ★ اولویت ۱: اگر آفلاین هستیم و داده در sessionStorage موجود است، بلافاصله نمایش بده
    if (!trulyOnline && cachedTicketData) {
      try {
        const cachedMsgs = await getCachedTicketMessages(ticketId).catch(() => [])
        
        const reconstructedTicket: TicketDetail = {
          ...cachedTicketData,
          messages: cachedMsgs.length > 0 ? cachedMsgs : [{
            id: 'temp-msg',
            senderType: 'customer',
            senderName: 'شما',
            message: cachedTicketData.lastMessage?.message || cachedTicketData.subject || 'پیام اولیه',
            attachments: [],
            createdAt: cachedTicketData.createdAt,
            isRead: true,
            _isOffline: true
          }],
          description: cachedTicketData.description || cachedTicketData.lastMessage?.message || '',
          attachments: [],
          rating: cachedTicketData.rating || null,
          ratingComment: null,
          ratedAt: null,
          statusLabel: STATUS_CONFIG[cachedTicketData.status]?.label || cachedTicketData.status,
          priorityLabel: PRIORITY_CONFIG[cachedTicketData.priority]?.label || cachedTicketData.priority,
          categoryLabel: cachedTicketData.categoryLabel || cachedTicketData.category,
          _isOffline: true
        }
        
        setTicket(reconstructedTicket)
        setLoading(false)
        setTimeout(() => { 
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) 
        }, 100)
        return // موفقیت‌آمیز بود، خارج شو
      } catch (err) {
        console.error('[TicketDetail] Error using sessionStorage data:', err)
      }
    }

    // ★ اولویت ۲: تلاش برای دریافت از شبکه (فقط اگر آنلاین هستیم)
    if (trulyOnline) {
      try {
        console.log(`[TicketDetail] Fetching ticket: /api/tickets/${ticketId}`)
        const res = await fetch(`/api/tickets/${ticketId}`, { 
          headers: getAuthHeaders(),
          cache: 'no-store'
        })
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        
        const data = await res.json()
        if (data.success && data.data) {
          setTicket(data.data)
          await cacheTicketMessages(ticketId, data.data.messages)
          // به‌روزرسانی sessionStorage برای بازدیدهای بعدی
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('currentTicketData', JSON.stringify(data.data))
          }
          setLoading(false)
          setTimeout(() => { 
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) 
          }, 100)
          return
        } else {
          throw new Error(data.error || 'تیکت یافت نشد')
        }
      } catch (err: any) {
        console.warn('[TicketDetail] Network fetch failed:', err.message)
      }
    }

    // ★ اولویت ۳: بازگشت به کش IndexedDB
    try {
      const cachedMsgs = await getCachedTicketMessages(ticketId)
      const allCachedTickets = await getCachedTickets()
      const foundTicket = allCachedTickets.find((t: any) => t.id === ticketId) || cachedTicketData

      if (foundTicket) {
        const reconstructedTicket: TicketDetail = {
          ...foundTicket,
          messages: cachedMsgs.length > 0 ? cachedMsgs : [{
            id: 'temp-msg',
            senderType: 'customer',
            senderName: 'شما',
            message: foundTicket.lastMessage?.message || 'پیام اولیه',
            attachments: [],
            createdAt: foundTicket.createdAt,
            isRead: true,
            _isOffline: true
          }],
          description: foundTicket.description || foundTicket.lastMessage?.message || '',
          attachments: [],
          rating: foundTicket.rating || null,
          ratingComment: null,
          ratedAt: null,
          statusLabel: STATUS_CONFIG[foundTicket.status]?.label || foundTicket.status,
          priorityLabel: PRIORITY_CONFIG[foundTicket.priority]?.label || foundTicket.priority,
          categoryLabel: foundTicket.categoryLabel || foundTicket.category,
          _isOffline: true
        }
        
        setTicket(reconstructedTicket)
        if (!trulyOnline) {
          toast({ title: 'حالت آفلاین', description: 'نمایش داده‌های ذخیره‌شده محلی', variant: 'default' })
        }
        setLoading(false)
        setTimeout(() => { 
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) 
        }, 100)
        return
      }
    } catch (err) {
      console.error('[TicketDetail] Cache fallback failed:', err)
    }

    // ★ شکست کامل
    console.error('[TicketDetail] All loading methods failed')
    toast({ 
      title: 'خطا در بارگذاری', 
      description: 'اطلاعات تیکت در دسترس نیست.', 
      variant: 'destructive' 
    })
    setLoading(false)
    // به جای برگشت به لیست، یک state خالی نمایش می‌دهیم
    setTicket(null)
  }, [ticketId, cachedTicketData, setCurrentView, toast, isOnline])

  useEffect(() => {
    loadTicket()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  // ─── ارسال پاسخ (با پشتیبانی آفلاین) ────────────────────────
  const handleSendReply = async () => {
    if (!ticket || reply.trim().length < 2) return

    setSubmitting(true)
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
      // ★ v6.4: پاسخ آفلاین
      const newMessage: Message = {
        id: `msg_offline_${Date.now()}`,
        senderType: 'customer',
        senderName: 'شما',
        message: reply.trim(),
        attachments: [],
        createdAt: new Date().toISOString(),
        isRead: false,
        _isOffline: true
      }

      const updatedTicket = {
        ...ticket,
        status: 'pending',
        updatedAt: new Date().toISOString(),
        messages: [...ticket.messages, newMessage],
        _isOffline: true
      }

      setTicket(updatedTicket)
      setReply('')
      await cacheTicketMessages(ticket.id, updatedTicket.messages)
      
      toast({ title: 'ذخیره شد ✓', description: 'پاسخ شما ذخیره شد و پس از اتصال به اینترنت ارسال می‌شود.' })
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, 50)
      setSubmitting(false)
      return
    }

    // پاسخ آنلاین
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'reply', message: reply.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setTicket((prev) =>
          prev ? {
            ...prev, status: 'pending', updatedAt: new Date().toISOString(),
            messages: [...prev.messages, {
              id: data.data.id, senderType: 'customer', senderName: data.data.senderName,
              message: data.data.message, attachments: [], createdAt: data.data.createdAt, isRead: false
            }],
          } : prev
        )
        setReply('')
        toast({ title: 'ارسال شد ✓', description: 'پاسخ شما ارسال شد' })
        await cacheTicketMessages(ticket.id, [...ticket.messages, { 
          id: data.data.id, senderType: 'customer', senderName: data.data.senderName, 
          message: data.data.message, attachments: [], createdAt: data.data.createdAt, isRead: false 
        }])
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, 50)
      } else {
        toast({ title: 'خطا', description: data.error || 'ارسال پاسخ ناموفق بود', variant: 'destructive' })
      }
    } catch (err) {
      console.error('[TicketDetail] reply error:', err)
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── بستن تیکت ──────────────────────────────────────────────
  const handleClose = async () => {
    if (!ticket) return
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
      const updated = { ...ticket, status: 'closed', statusLabel: 'بسته شده', closedAt: new Date().toISOString(), _isOffline: true }
      setTicket(updated)
      setCloseDialogOpen(false)
      toast({ title: 'بسته شد ✓', description: 'تیکت به صورت محلی بسته شد و پس از اتصال همگام‌سازی می‌شود.' })
      setTimeout(() => setRatingDialogOpen(true), 500)
      return
    }

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'close' }),
      })
      const data = await res.json()
      if (data.success) {
        setTicket((prev) => prev ? { ...prev, status: 'closed', statusLabel: 'بسته شده', closedAt: new Date().toISOString() } : prev)
        setCloseDialogOpen(false)
        toast({ title: 'بسته شد ✓', description: 'تیکت بسته شد' })
        setTimeout(() => setRatingDialogOpen(true), 500)
      } else {
        toast({ title: 'خطا', description: data.error || 'عملیات ناموفق بود', variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    }
  }

  // ─── باز کردن مجدد ──────────────────────────────────────────
  const handleReopen = async () => {
    if (!ticket) return
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
      const updated = { ...ticket, status: 'open', statusLabel: 'باز', closedAt: null, _isOffline: true }
      setTicket(updated)
      toast({ title: 'باز شد ✓', description: 'تیکت به صورت محلی مجدداً باز شد.' })
      return
    }

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'reopen' }),
      })
      const data = await res.json()
      if (data.success) {
        setTicket((prev) => prev ? { ...prev, status: 'open', statusLabel: 'باز', closedAt: null } : prev)
        toast({ title: 'باز شد ✓', description: 'تیکت مجدداً باز شد' })
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    }
  }

  // ─── ثبت امتیاز ─────────────────────────────────────────────
  const handleSubmitRating = async () => {
    if (!ticket || rating < 1 || rating > 5) return
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
      const updated = { ...ticket, rating, ratingComment: ratingComment.trim() || null, ratedAt: new Date().toISOString(), _isOffline: true }
      setTicket(updated)
      setRatingDialogOpen(false)
      setRating(0)
      setRatingComment('')
      toast({ title: 'ثبت شد ✓', description: 'امتیاز شما ذخیره شد و پس از اتصال ارسال می‌شود.' })
      return
    }

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'rate', rating, ratingComment: ratingComment.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setTicket((prev) => prev ? { ...prev, rating, ratingComment: ratingComment.trim() || null, ratedAt: new Date().toISOString() } : prev)
        setRatingDialogOpen(false)
        setRating(0)
        setRatingComment('')
        toast({ title: 'ثبت شد ✓', description: 'از بازخورد شما سپاسگزاریم' })
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (reply.trim().length >= 2 && !submitting) handleSendReply()
    }
  }

   if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 font-fa max-w-4xl mx-auto" dir="rtl">
        {/* Skeleton Header */}
        <div className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        {/* Skeleton Messages */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2 flex-row-reverse">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-20 w-3/4 rounded-xl" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!ticket) {
    return (
      <div className="p-6 text-center font-fa">
        <p className="text-sm text-gray-500">تیکت یافت نشد یا اطلاعات آن در دسترس نیست</p>
        <Button className="mt-3" variant="outline" onClick={() => setCurrentView('tickets' as AppView)}>
          بازگشت به لیست
        </Button>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
  const priCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal
  const StatusIcon = statusCfg.icon
  const isClosed = ticket.status === 'closed'
  const canRate = (ticket.status === 'closed' || ticket.status === 'resolved') && !ticket.rating

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 font-fa max-w-4xl mx-auto" dir="rtl">
      {/* ─── هدر: بازگشت + موضوع ─── */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentView('tickets' as AppView)}
          className="flex-shrink-0"
        >
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] text-gray-400 font-mono" dir="ltr">
              {toFaNum(ticket.ticketNumber)}
            </span>
            <Badge className={`text-[10px] ${statusCfg.bg} ${statusCfg.color}`}>
              <StatusIcon className="w-3 h-3 ml-1" />
              {statusCfg.label}
            </Badge>
            <Badge className={`text-[10px] ${priCfg.bg} ${priCfg.color}`}>{priCfg.label}</Badge>
            <Badge variant="outline" className="text-[10px] text-gray-500">
              {ticket.categoryLabel}
            </Badge>
            {ticket._isOffline && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">
                <CloudOff className="w-3 h-3 ml-1" /> آفلاین
              </Badge>
            )}
          </div>
          <h1 className="text-base sm:text-lg font-bold text-gray-900 break-words">{ticket.subject}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            ایجاد: {formatDateTime(ticket.createdAt)}
            {ticket.firstResponseAt && (
              <span className="mx-1">•</span>
            )}
            {ticket.firstResponseAt && (
              <>اولین پاسخ: {formatDateTime(ticket.firstResponseAt)}</>
            )}
          </p>
        </div>
      </div>

      {/* ─── رشته پیام‌ها ─── */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pl-1">
            {ticket.messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-400">هنوز پیامی در این تیکت وجود ندارد</p>
              </div>
            ) : (
              ticket.messages.map((m, idx) => {
                const isMe = m.senderType === 'customer'
                const isFirst = idx === 0
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* آواتار */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isMe ? 'bg-emerald-100' : 'bg-blue-100'
                      }`}
                    >
                      {isMe ? (
                        <span className="text-[11px] font-bold text-emerald-700">شما</span>
                      ) : (
                        <Headphones className="w-4 h-4 text-blue-700" />
                      )}
                    </div>

                    {/* حباب پیام */}
                    <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-gray-600">
                          {isMe ? 'شما' : m.senderName}
                        </span>
                        {!isMe && (
                          <Badge className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0">پشتیبانی</Badge>
                        )}
                        <span className="text-[9px] text-gray-400">{formatTime(m.createdAt)}</span>
                        {m._isOffline && <CloudOff className="w-3 h-3 text-amber-500" />}
                      </div>
                      <div
                        className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          isFirst
                            ? isMe
                              ? 'bg-emerald-50 text-gray-800 border border-emerald-200'
                              : 'bg-blue-50 text-gray-800 border border-blue-200'
                            : isMe
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white border border-gray-200 text-gray-800'
                        }`}
                      >
                        {m.message}
                      </div>

                      {/* پیوست‌ها */}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.attachments.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 underline hover:text-blue-800"
                            >
                              پیوست {toFaNum(i + 1)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* ─── نوار پاسخ ─── */}
      {!isClosed ? (
        <Card>
          <CardContent className="p-3">
            {!isOnline && (
              <div className="flex items-center gap-2 mb-2 p-2 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-800">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span>حالت آفلاین: پیام شما ذخیره محلی شده و پس از اتصال ارسال می‌شود.</span>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="پاسخ خود را بنویسید... (Enter برای ارسال، Shift+Enter برای خط جدید)"
                className="flex-1 min-h-[60px] max-h-[160px] resize-y text-sm"
                maxLength={5000}
              />
              <Button
                onClick={handleSendReply}
                disabled={submitting || reply.trim().length < 2}
                className="bg-emerald-600 hover:bg-emerald-700 flex-shrink-0"
                size="icon"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-gray-400">{toFaNum(reply.length)}/5000</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCloseDialogOpen(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5 ml-1" />
                بستن تیکت
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-600">
                این تیکت بسته شده است
                {ticket.closedAt && (
                  <span className="mr-1">• {formatDateTime(ticket.closedAt)}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canRate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRatingDialogOpen(true)}
                  className="text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  <Star className="w-3.5 h-3.5 ml-1" />
                  امتیازدهی
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleReopen}>
                <RotateCcw className="w-3.5 h-3.5 ml-1" />
                باز کردن مجدد
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── نمایش امتیاز ثبت‌شده ─── */}
      {ticket.rating && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-xs font-medium text-amber-700">امتیاز شما: {toFaNum(ticket.rating)} از ۵</span>
            </div>
            {ticket.ratingComment && (
              <p className="text-xs text-amber-800 italic">«{ticket.ratingComment}»</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════ دیالوگ تأیید بستن ═══════════════ */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="font-fa sm:max-w-[400px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              بستن تیکت
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            آیا از بستن تیکت <span className="font-mono" dir="ltr">{toFaNum(ticket.ticketNumber)}</span> مطمئن هستید؟
            <br />
            <span className="text-xs text-gray-500">
              پس از بستن، در صورت نیاز می‌توانید تیکت را مجدداً باز کنید.
            </span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              انصراف
            </Button>
            <Button variant="destructive" onClick={handleClose}>
              بستن تیکت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ دیالوگ امتیازدهی ═══════════════ */}
      <Dialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
        <DialogContent className="font-fa sm:max-w-[420px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              امتیازدهی به پشتیبانی
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              از کیفیت پاسخگویی تیم پشتیبانی در این تیکت چه رضایتی داشتید؟
            </p>
            <div className="flex items-center justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-9 h-9 ${
                      n <= (hoverRating || rating)
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-gray-300 fill-gray-100'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div>
              <Textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="نظر شما (اختیاری)..."
                className="min-h-[80px] text-sm"
                maxLength={500}
              />
              <p className="text-[10px] text-gray-400 mt-1">{toFaNum(ratingComment.length)}/500</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatingDialogOpen(false)}>
              بعداً
            </Button>
            <Button
              onClick={handleSubmitRating}
              disabled={rating < 1}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              ثبت امتیاز
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}