'use client'

// ============================================================================
// src/components/tickets/ticket-detail.tsx — v9.8.0 ★★★
// ----------------------------------------------------------------------------
// ★ v6.4: پشتیبانی کامل آفلاین با sessionStorage و IndexedDB
// ★ v9.7.0: جایگزینی navigator.onLine با isApiOnline()
// ★ v9.8.0: طراحی حرفه‌ای چت — اسکرولبار سفارشی، حباب‌های مدرن،
//           پاسخ چسبیده به انتهای چت، هدر گرادیانت، انیمیشن
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
  WifiOff, CloudOff, User, ShieldCheck
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { 
  cacheTicketMessages, 
  getCachedTicketMessages,
  getCachedTickets
} from '@/lib/offline-db'
import { Skeleton } from '@/components/ui/skeleton'

// ★ v9.7.0: ماژول تشخیص اتصال هوشمند
import {
  isOnline as isApiOnline,
  onConnectivityChange,
  startConnectivityMonitor,
} from '@/lib/connectivity'

// ─── تایپ‌ها ────────────────────────────────────────────────────
interface Message {
  id: string
  senderType: 'customer' | 'admin'
  senderName: string
  message: string
  attachments: string[]
  createdAt: string
  isRead: boolean
  _isOffline?: boolean
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
  _isOffline?: boolean
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
// ★ v9.8.0: استایل اسکرولبار سفارشی (تزریق یک‌بار)
// ═══════════════════════════════════════════════════════════════
function ChatScrollbarStyles() {
  return (
    <style jsx global>{`
      .chat-scroll::-webkit-scrollbar {
        width: 5px;
      }
      .chat-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .chat-scroll::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 10px;
      }
      .chat-scroll::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
      }
      .chat-scroll {
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 transparent;
      }
      @keyframes msgSlideIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .msg-animate {
        animation: msgSlideIn 0.25s ease-out;
      }
    `}</style>
  )
}

// ═══════════════════════════════════════════════════════════════
// ★ v9.8.0: حباب پیام حرفه‌ای
// ═══════════════════════════════════════════════════════════════
function ChatBubble({ message, isFirst }: { message: Message; isFirst: boolean }) {
  const isMe = message.senderType === 'customer'

  return (
    <div className={`flex gap-2.5 msg-animate ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* ── آواتار ── */}
      <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ring-2 ring-white ${
            isMe
              ? 'bg-gradient-to-br from-emerald-400 to-emerald-600'
              : 'bg-gradient-to-br from-blue-400 to-blue-600'
          }`}
        >
          {isMe ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <Headphones className="w-4 h-4 text-white" />
          )}
        </div>
      </div>

      {/* ── محتوای پیام ── */}
      <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
        {/* نام + زمان */}
        <div className={`flex items-center gap-1.5 mb-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] font-semibold text-gray-600">
            {isMe ? 'شما' : message.senderName}
          </span>
          {!isMe && (
            <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">
              <ShieldCheck className="w-2.5 h-2.5" />
              پشتیبانی
            </span>
          )}
          <span className="text-[9px] text-gray-400">{formatTime(message.createdAt)}</span>
          {message._isOffline && <CloudOff className="w-3 h-3 text-amber-500" />}
        </div>

        {/* حباب */}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
            isFirst
              ? isMe
                ? 'bg-emerald-50 text-gray-800 border border-emerald-200 rounded-tr-md'
                : 'bg-blue-50 text-gray-800 border border-blue-200 rounded-tl-md'
              : isMe
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-tr-md'
                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-md'
          }`}
        >
          {message.message}
        </div>

        {/* پیوست‌ها */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.attachments.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
              >
                📎 پیوست {toFaNum(i + 1)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
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
  
  const [isOnline, setIsOnline] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const ticketId = typeof window !== 'undefined' ? sessionStorage.getItem('currentTicketId') : null
  const cachedTicketDataStr = typeof window !== 'undefined' ? sessionStorage.getItem('currentTicketData') : null
  const cachedTicketData = cachedTicketDataStr ? (() => {
    try {
      return JSON.parse(cachedTicketDataStr)
    } catch {
      return null
    }
  })() : null

  // ─── ★ v9.7.0: تشخیص وضعیت آنلاین/آفلاین (هوشمند) ──────────
  useEffect(() => {
    startConnectivityMonitor()
    setIsOnline(isApiOnline())

    const unsubConnectivity = onConnectivityChange((state) => {
      setIsOnline(state.isApiReachable)
    })

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

  // ─── ★ v9.8.0: اسکرول خودکار به پایین ──────────────────────
  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        })
      }
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
    }, 100)
  }, [])

  // ─── بارگذاری تیکت ─────────────────────────────────────────
  const loadTicket = useCallback(async () => {
    if (!ticketId) {
      toast({ title: 'خطا', description: 'شناسه تیکت نامعتبر است', variant: 'destructive' })
      setCurrentView('tickets' as AppView)
      return
    }

    setLoading(true)
    const trulyOnline = isApiOnline()

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
        scrollToBottom(false)
        return
      } catch (err) {
        console.error('[TicketDetail] Error using sessionStorage data:', err)
      }
    }

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
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('currentTicketData', JSON.stringify(data.data))
          }
          setLoading(false)
          scrollToBottom(false)
          return
        } else {
          throw new Error(data.error || 'تیکت یافت نشد')
        }
      } catch (err: any) {
        console.warn('[TicketDetail] Network fetch failed:', err.message)
      }
    }

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
        scrollToBottom(false)
        return
      }
    } catch (err) {
      console.error('[TicketDetail] Cache fallback failed:', err)
    }

    console.error('[TicketDetail] All loading methods failed')
    toast({ 
      title: 'خطا در بارگذاری', 
      description: 'اطلاعات تیکت در دسترس نیست.', 
      variant: 'destructive' 
    })
    setLoading(false)
    setTicket(null)
  }, [ticketId, cachedTicketData, setCurrentView, toast, scrollToBottom])

  useEffect(() => {
    loadTicket()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  // ─── ارسال پاسخ ────────────────────────────────────────────
  const handleSendReply = async () => {
    if (!ticket || reply.trim().length < 2) return

    setSubmitting(true)
    const trulyOnline = isApiOnline()

    if (!trulyOnline) {
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
      scrollToBottom()
      setSubmitting(false)
      return
    }

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
        scrollToBottom()
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
    const trulyOnline = isApiOnline()

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
    const trulyOnline = isApiOnline()

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
    const trulyOnline = isApiOnline()

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

  // ─── Loading Skeleton ──────────────────────────────────────
  if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 font-fa max-w-4xl mx-auto" dir="rtl">
        <ChatScrollbarStyles />
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
        <ChatScrollbarStyles />
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
      <ChatScrollbarStyles />

      {/* ═══════════════ ★ v9.8.0: هدر حرفه‌ای ═══════════════ */}
         {/* ═══════════════ هدر یاسی ملایم ═══════════════ */}
           {/* ═══════════════ هدر فشرده یاسی ═══════════════ */}
      <div className="rounded-xl bg-gradient-to-l from-violet-50 via-purple-50 to-indigo-50 border border-violet-200/60 shadow-sm">
        <div className="px-2.5 py-1.5 sm:px-3 sm:py-2">
          {/* ردیف اول: بازگشت + شماره + موضوع + بج‌ها — همه در یک خط */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('tickets' as AppView)}
              className="text-violet-600 hover:text-violet-800 hover:bg-violet-100 h-6 w-6 p-0 shrink-0"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>

            <span className="text-[10px] text-violet-400 font-mono shrink-0" dir="ltr">
              #{toFaNum(ticket.ticketNumber)}
            </span>

            <span className="w-px h-3.5 bg-violet-200 shrink-0" />

            {/* موضوع — در یک خط با truncate */}
            <h1 className="flex-1 min-w-0 text-xs sm:text-sm font-bold text-gray-800 truncate">
              {ticket.subject}
            </h1>

            <div className="flex items-center gap-1 shrink-0">
              {ticket._isOffline && (
                <span className="hidden sm:inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  <CloudOff className="w-2.5 h-2.5" /> آفلاین
                </span>
              )}
              <span className={`inline-flex items-center gap-0.5 text-[9px] px-2 py-0.5 rounded-full font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                <StatusIcon className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">{statusCfg.label}</span>
              </span>
              <span className={`hidden sm:inline text-[9px] px-2 py-0.5 rounded-full font-medium ${priCfg.bg} ${priCfg.color}`}>
                {priCfg.label}
              </span>
            </div>
          </div>

          {/* ردیف دوم: متادیتا — فقط یک خط کوچک */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] text-violet-500/70 mt-1 pr-[30px]">
            <span className="inline-flex items-center gap-0.5">
              <TicketIcon className="w-2.5 h-2.5" />
              {ticket.categoryLabel}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {formatDateTime(ticket.createdAt)}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle className="w-2.5 h-2.5" />
              {toFaNum(ticket.messages.length)} پیام
            </span>
            {ticket.firstResponseAt && (
              <span className="hidden md:inline-flex items-center gap-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" />
                پاسخ: {formatDateTime(ticket.firstResponseAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════ ★ v9.8.0: کارت چت یکپارچه ═══════════════ */}
      <Card className="overflow-hidden border-gray-200 shadow-md rounded-2xl">
        {/* ── هدر چت ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-violet-50/60 border-b border-violet-100">
          <div className="flex items-center gap-2">
           <MessageCircle className="w-4 h-4 text-violet-600" />
<span className="text-xs font-bold text-violet-800">گفتگو</span>
<span className="text-[10px] text-violet-400 bg-violet-100 px-1.5 py-0.5 rounded-full">
              {toFaNum(ticket.messages.length)} پیام
            </span>
          </div>
          {!isClosed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCloseDialogOpen(true)}
              className="text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
            >
              <XCircle className="w-3.5 h-3.5 ml-1" />
              بستن تیکت
            </Button>
          )}
        </div>

        {/* ── بنر آفلاین ── */}
        {!isOnline && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-800">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>حالت آفلاین: پیام‌ها ذخیره محلی شده و پس از اتصال ارسال می‌شوند.</span>
          </div>
        )}

        {/* ── ★ v9.8.0: محوطه پیام‌ها با اسکرولبار سفارشی ── */}
        <div
          ref={chatContainerRef}
 className="chat-scroll overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100"
          style={{ height: '420px', maxHeight: '50vh' }}
        >
          {ticket.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <MessageCircle className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400 font-medium">هنوز پیامی وجود ندارد</p>
              <p className="text-xs text-gray-300 mt-1">اولین پیام خود را در کادر زیر بنویسید</p>
            </div>
          ) : (
            ticket.messages.map((m, idx) => (
              <ChatBubble key={m.id} message={m} isFirst={idx === 0} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── ★ v9.8.0: نوار پاسخ (چسبیده به انتهای چت) ── */}
        {!isClosed ? (
<div className="border-t border-violet-100 bg-violet-50/40 p-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="پاسخ خود را بنویسید..."
                  className="min-h-[48px] max-h-[120px] resize-y text-sm rounded-xl border-gray-200 focus:border-emerald-400 focus:ring-emerald-100 pr-3 pl-10 py-2.5"
                  maxLength={5000}
                />
                <span className="absolute bottom-2 left-3 text-[9px] text-gray-300 pointer-events-none">
                  {toFaNum(reply.length)}/{toFaNum(5000)}
                </span>
              </div>
              <Button
                onClick={handleSendReply}
                disabled={submitting || reply.trim().length < 2}
                className="bg-emerald-600 hover:bg-emerald-700 rounded-xl h-[48px] w-[48px] p-0 shrink-0 shadow-sm"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 -rotate-180" />}
              </Button>
            </div>
            <p className="text-[9px] text-gray-400 mt-1.5 text-center">
              Enter برای ارسال • Shift+Enter برای خط جدید
            </p>
          </div>
        ) : (
          /* ── نوار تیکت بسته ── */
          <div className="border-t border-violet-100 bg-violet-50/40 p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <XCircle className="w-4 h-4" />
                <span>
                  این تیکت بسته شده است
                  {ticket.closedAt && (
                    <span className="mr-1 text-gray-400">• {formatDateTime(ticket.closedAt)}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {canRate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRatingDialogOpen(true)}
                    className="text-amber-600 border-amber-300 hover:bg-amber-50 rounded-lg text-xs"
                  >
                    <Star className="w-3.5 h-3.5 ml-1" />
                    امتیازدهی
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReopen}
                  className="rounded-lg text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 ml-1" />
                  باز کردن مجدد
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ─── نمایش امتیاز ثبت‌شده ─── */}
      {ticket.rating && (
        <Card className="border-amber-200 bg-gradient-to-l from-amber-50 to-white rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-5 h-5 ${
                      n <= ticket.rating!
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-gray-200 fill-gray-100'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm font-bold text-amber-700">
                {toFaNum(ticket.rating)} از ۵
              </span>
            </div>
            {ticket.ratingComment && (
              <p className="text-xs text-amber-800 mt-2 italic leading-relaxed">
                «{ticket.ratingComment}»
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════ دیالوگ تأیید بستن ═══════════════ */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="font-fa sm:max-w-[400px] rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              بستن تیکت
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 leading-relaxed">
            آیا از بستن تیکت <span className="font-mono font-bold" dir="ltr">#{toFaNum(ticket.ticketNumber)}</span> مطمئن هستید؟
            <br />
            <span className="text-xs text-gray-400 mt-1 block">
              پس از بستن، در صورت نیاز می‌توانید تیکت را مجدداً باز کنید.
            </span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)} className="rounded-lg">
              انصراف
            </Button>
            <Button variant="destructive" onClick={handleClose} className="rounded-lg">
              بستن تیکت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ دیالوگ امتیازدهی ═══════════════ */}
      <Dialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
        <DialogContent className="font-fa sm:max-w-[420px] rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-500" />
              </div>
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
                className="min-h-[80px] text-sm rounded-xl"
                maxLength={500}
              />
              <p className="text-[10px] text-gray-400 mt-1">{toFaNum(ratingComment.length)}/500</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatingDialogOpen(false)} className="rounded-lg">
              بعداً
            </Button>
            <Button
              onClick={handleSubmitRating}
              disabled={rating < 1}
              className="bg-amber-500 hover:bg-amber-600 text-white rounded-lg"
            >
              ثبت امتیاز
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}