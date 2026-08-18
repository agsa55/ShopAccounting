'use client'

// ============================================================================
// src/components/invoices/invoices-page.tsx — v9.1.0 (Final)
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { OnlinePaymentButton } from '@/components/invoices/online-payment-button'
import {
  FileText, Search, Trash2, Eye, RefreshCw, Loader2, Lock, Crown,
  ChevronLeft, ShoppingCart, CreditCard, Banknote, CalendarDays, Plus, X,
  AlertTriangle, CheckCircle2, Wallet, Calendar as CalendarIcon, Info,
  Wrench, RotateCcw, WifiOff, TrendingUp, Package, Filter,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { useToast } from '@/hooks/use-toast'
import { InvoicePDFButton } from '@/components/invoices/invoice-pdf-button'
import { PortalLinkButton } from '@/components/invoices/portal-link-button'
import { Label } from '@/components/ui/label'
import {
  getCachedInvoicesPage,
  cacheInvoicesPage,
  addToSyncQueue,
} from '@/lib/offline-db'

// ═══════════════════════════════════════════════════════════════
// KPI Card (الگو از داشبورد)
// ═══════════════════════════════════════════════════════════════

interface KpiCardProps {
  label: string
  value: string
  sublabel: string
  gradient: string
  icon: React.ReactNode
  onClick?: () => void
}

function KpiCard({ label, value, sublabel, gradient, icon, onClick }: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className={`${gradient} rounded-xl p-2.5 sm:p-3 text-white shadow-sm hover:shadow-md transition-all ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">{label}</p>
          <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">
            {value}
          </p>
          <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">
            {sublabel}
          </p>
        </div>
        {icon}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface InvoiceItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
  lineTotal: number
  totalAmount: number
  unitLabel?: string
}

interface InvoicePayment {
  id: string
  amount: number
  method?: string
  paymentType?: string
  reference?: string
  paymentRef?: string
  paidAt: string
}

interface Invoice {
  id: string
  number: string
  invoiceNumber?: string
  tenantId: string
  customerId: string | null
  customerName: string | null
  cashierId: string | null
  cashierName?: string | null
  storeId: string | null
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  status: string
  paymentType: string
  paymentStatus?: string
  finalAmount?: number
  notes?: string | null
  createdAt: string
  updatedAt: string
  items: InvoiceItem[]
  payments: InvoicePayment[]
  installmentPlan?: any | null
  customerPortalToken?: string | null
    checkStatus?: string | null
  checkInfo?: { id: string; status: string; checkNumber: string; bankName: string; dueDate: string } | null
  _isOffline?: boolean
  _offlineAction?: 'create' | 'update' | 'delete'
}

interface InstallmentScheduleItem {
  id: string
  installmentNumber: number
  amount: number
  dueDate: string
  status: string
  paidAmount: number
  paidAt: string | null
  paymentRef: string | null
  paymentType: string | null
  notes: string | null
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function formatCurrency(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '۰ ریال'
  return `${num.toLocaleString('fa-IR')} ریال`
}

function formatCurrencyShort(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '۰'
  return num.toLocaleString('fa-IR')
}

function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '۰'
  return num.toLocaleString('fa-IR')
}

function div(a: number, b: number): number { return Math.floor(a / b) }
function mod(a: number, b: number): number { return a - Math.floor(a / b) * b }

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days = 365 * gy
    + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400)
    - 80 + gd + g_d_m[gm - 1]
  jy += 33 * div(days, 12053)
  days = mod(days, 12053)
  jy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) { jy += div(days - 1, 365); days = mod(days - 1, 365) }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30))
  return [jy, jm, jd]
}

function toFaNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '---'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '---'
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')} - ${toFaNum(hh)}:${toFaNum(mm)}`
  } catch { return '---' }
}

function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '---'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '---'
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
  } catch { return '---' }
}

function getStatusBadge(status: string, paymentStatus?: string, invoiceType?: string) {
  if (invoiceType === 'sale_return')
    return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">برگشتی فروش</Badge>
  if (invoiceType === 'purchase_return')
    return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">برگشتی خرید</Badge>
  const s = (paymentStatus || status)?.toUpperCase()
  if (s === 'PAID')
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">پرداخت شده</Badge>
  if (s === 'CONFIRMED')
    return <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100 text-[10px]">تایید شده</Badge>
  if (s === 'PARTIAL' || s === 'PARTIALLYPAID')
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">پرداخت جزئی</Badge>
  if (s === 'CANCELLED')
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">لغو شده</Badge>
  if (s === 'DRAFT')
    return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-[10px]">پیش‌نویس</Badge>
  if (s === 'PENDING')
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">در انتظار</Badge>
  if (s === 'OVERDUE')
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">سررسید گذشته</Badge>
  return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-[10px]">{paymentStatus || status}</Badge>
}

function getPaymentTypeBadge(paymentType: string) {
  const pt = paymentType?.toLowerCase()
  if (pt === 'cash')
    return <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 text-[10px] gap-1"><Banknote className="w-3 h-3" />نقدی</Badge>
  if (pt === 'card')
    return <Badge className="bg-blue-50 text-blue-600 hover:bg-blue-50 text-[10px] gap-1"><CreditCard className="w-3 h-3" />کارتخوان</Badge>
  if (pt === 'credit')
    return <Badge className="bg-purple-50 text-purple-600 hover:bg-purple-50 text-[10px] gap-1"><CalendarDays className="w-3 h-3" />نسیه</Badge>
  if (pt === 'installment')
    return <Badge className="bg-orange-50 text-orange-600 hover:bg-orange-50 text-[10px] gap-1"><CreditCard className="w-3 h-3" />قسطی</Badge>
  return <Badge className="bg-gray-50 text-gray-600 hover:bg-gray-50 text-[10px]">{paymentType}</Badge>
}

function getCheckStatusBadge(checkStatus: string | null | undefined) {
  if (!checkStatus) return null
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'در جریان', className: 'bg-amber-50 text-amber-600 border border-amber-200' },
    deposited: { label: 'نزد بانک', className: 'bg-blue-50 text-blue-600 border border-blue-200' },
    cleared: { label: 'وصول شد', className: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
    bounced: { label: 'برگشت خورد', className: 'bg-red-50 text-red-600 border border-red-200' },
    returned: { label: 'پس داده شد', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  }
  const info = map[checkStatus] || { label: checkStatus, className: 'bg-gray-50 text-gray-500' }
  return <Badge className={`${info.className} text-[10px] gap-1 hover:${info.className}`}>{info.label}</Badge>
}

// ═══════════════════════════════════════════════════════════════
// Filter Constants
// ═══════════════════════════════════════════════════════════════

type StatusFilterKey = 'ALL' | 'PAID' | 'PENDING' | 'PARTIAL' | 'DRAFT' | 'CANCELLED'
type PaymentTypeFilterKey = 'ALL' | 'cash' | 'card' | 'credit' | 'installment'

// ═══════════════════════════════════════════════════════════════
// ShamsiDatePicker
// ═══════════════════════════════════════════════════════════════

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days = 365 * jy
    + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * div(days, 146097)
  days = mod(days, 146097)
  if (days > 36524) {
    gy += 100 * div(--days, 36524)
    days = mod(days, 36524)
    if (days >= 365) days++
  }
  gy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) { gy += div(days - 1, 365); days = mod(days - 1, 365) }
  let gd = days + 1
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm: number
  for (gm = 0; gm < 13; gm++) { const v = sal_a[gm]; if (gd <= v) break; gd -= v }
  return [gy, gm, gd]
}

function isJalaliLeapYear(jy: number): boolean {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length; const gy = jy + 621; let leapJ = -14
  let jp = breaks[0]; let jump = 0; let n = 0
  for (let i = 1; i < bl; i++) {
    const jm = breaks[i]; jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm
  }
  n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  const leap = mod(mod(n + 1, 33) - 1, 4)
  return leap === 0
}

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

const DATE_PICKER_COLORS = {
  popupBg: '#faf7ff', popupBgSolid: '#ffffff', headerBg: '#ede9fe',
  textPrimary: '#4c1d95', textSecondary: '#7c3aed', textMuted: '#a78bfa',
  textOnAccent: '#ffffff', border: '#e9d5ff', accent: '#7c3aed',
  accentLight: '#ede9fe', accentSoft: '#ddd6fe', todayBorder: '#a78bfa',
  todayText: '#6d28d9',
}

const navBtnStyle: React.CSSProperties = {
  padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent',
  color: DATE_PICKER_COLORS.textSecondary, fontSize: 12, cursor: 'pointer',
  transition: 'background-color 0.1s', lineHeight: 1,
}

interface ShamsiDatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function ShamsiDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ' }: ShamsiDatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayText = useMemo(() => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return ''
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
  }, [value])

  const todayJalali = useMemo(() => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return { jy, jm, jd, iso: now.toISOString().split('T')[0] }
  }, [])

  const initial = useMemo(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        const [jy, jm] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
        return { jy, jm }
      }
    }
    return { jy: todayJalali.jy, jm: todayJalali.jm }
  }, [value, todayJalali])

  const [viewYear, setViewYear] = useState<number>(initial.jy)
  const [viewMonth, setViewMonth] = useState<number>(initial.jm)

  useEffect(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        const [jy, jm] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
        setViewYear(jy); setViewMonth(jm)
      }
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const daysCount = daysInJalaliMonth(viewYear, viewMonth)
  const firstDayOffset = useMemo(() => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, 1)
    const jsDay = new Date(gy, gm - 1, gd).getDay()
    return (jsDay + 1) % 7
  }, [viewYear, viewMonth])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedJalali = useMemo(() => {
    if (!value) return null
    const d = new Date(value)
    if (isNaN(d.getTime())) return null
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return { jy, jm, jd }
  }, [value])

  const goPrevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const goNextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  const goPrevYear = () => setViewYear(y => y - 1)
  const goNextYear = () => setViewYear(y => y + 1)
  const pickToday = () => { onChange(todayJalali.iso); setOpen(false) }
  const handleDayClick = (jd: number) => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, jd)
    const isoDate = `${String(gy).padStart(4, '0')}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
    onChange(isoDate); setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', height: 36, padding: '0 10px', borderRadius: 6,
          border: `1px solid ${DATE_PICKER_COLORS.border}`,
          backgroundColor: DATE_PICKER_COLORS.popupBg,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, cursor: 'pointer', fontSize: 12, transition: 'border-color 0.15s, background-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = DATE_PICKER_COLORS.accent; e.currentTarget.style.backgroundColor = DATE_PICKER_COLORS.accentLight }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = DATE_PICKER_COLORS.border; e.currentTarget.style.backgroundColor = DATE_PICKER_COLORS.popupBg }}
      >
        <CalendarIcon style={{ width: 14, height: 14, color: DATE_PICKER_COLORS.textMuted, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'right', fontFamily: 'monospace', color: displayText ? DATE_PICKER_COLORS.textPrimary : DATE_PICKER_COLORS.textMuted, fontSize: 12 }} dir="ltr">
          {displayText || placeholder}
        </span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div dir="rtl" style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 3, zIndex: 60, width: 220,
            backgroundColor: DATE_PICKER_COLORS.popupBgSolid,
            border: `1px solid ${DATE_PICKER_COLORS.border}`,
            borderRadius: 8, boxShadow: '0 8px 24px -4px rgba(124,58,237,0.18), 0 4px 8px -2px rgba(124,58,237,0.1)', padding: 7,
          }}>
            <div style={{
              background: `linear-gradient(135deg, ${DATE_PICKER_COLORS.headerBg} 0%, ${DATE_PICKER_COLORS.accentSoft} 100%)`,
              margin: -7, marginBottom: 5, padding: '5px 7px', borderRadius: '8px 8px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button type="button" onClick={goPrevYear} title="سال قبل" style={navBtnStyle}>«</button>
              <button type="button" onClick={goPrevMonth} title="ماه قبل" style={navBtnStyle}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: DATE_PICKER_COLORS.textPrimary }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button type="button" onClick={goNextMonth} title="ماه بعد" style={navBtnStyle}>›</button>
              <button type="button" onClick={goNextYear} title="سال بعد" style={navBtnStyle}>»</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: i === 6 ? DATE_PICKER_COLORS.textSecondary : DATE_PICKER_COLORS.textMuted, padding: '1px 0' }}>{w}</div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 22 }} />
                const isSelected = selectedJalali && selectedJalali.jy === viewYear && selectedJalali.jm === viewMonth && selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
                const isFriday = i % 7 === 6
                return (
                  <button key={i} type="button" onClick={() => handleDayClick(d)} style={{
                    height: 22, borderRadius: 4, fontSize: 10,
                    border: isSelected ? 'none' : (isToday ? `1px solid ${DATE_PICKER_COLORS.todayBorder}` : 'none'),
                    backgroundColor: isSelected ? DATE_PICKER_COLORS.accent : (isToday ? DATE_PICKER_COLORS.accentLight : 'transparent'),
                    color: isSelected ? DATE_PICKER_COLORS.textOnAccent : (isToday ? DATE_PICKER_COLORS.todayText : (isFriday ? DATE_PICKER_COLORS.textSecondary : DATE_PICKER_COLORS.textPrimary)),
                    cursor: 'pointer', fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)), padding: 0, lineHeight: 1,
                  }}>
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop: 5, paddingTop: 4, borderTop: `1px dashed ${DATE_PICKER_COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={pickToday} style={{ fontSize: 9, color: DATE_PICKER_COLORS.accent, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 9, color: DATE_PICKER_COLORS.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                بستن ✕
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MobileInvoiceCard
// ═══════════════════════════════════════════════════════════════

function MobileInvoiceCard({
  inv, planFeatures, onView, onPay, onReturn, onDelete, onToast,
}: {
  inv: Invoice
  planFeatures: any
  onView: (inv: Invoice) => void
  onPay: (inv: Invoice) => void
  onReturn: (inv: Invoice) => void
  onDelete: (inv: Invoice) => void
  onToast: (msg: string) => void
}) {
  const invNumber = inv.invoiceNumber || inv.number || '---'
  const isPaid = (inv.paymentStatus || inv.status)?.toUpperCase() === 'PAID'
  const isCancelled = (inv.paymentStatus || inv.status)?.toUpperCase() === 'CANCELLED'
  const isReturn = (inv as any).invoiceType === 'sale_return' || (inv as any).invoiceType === 'purchase_return'
  const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)
  const hasCreditRemaining = (inv.paymentType || '').toLowerCase() === 'credit' && !isPaid && !isCancelled && remaining > 0

  return (
    <Card
      className={`border shadow-none cursor-pointer transition-colors active:bg-gray-50 ${isCancelled ? 'opacity-60' : ''} ${(inv as any)._isOffline ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200 bg-white'}`}
      onClick={() => onView(inv)}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`font-mono font-bold text-sm truncate ${inv._offlineAction === 'delete' ? 'text-red-600 line-through' : 'text-gray-900'}`}>
              {invNumber}
            </span>
            {inv._isOffline && (
              <Badge variant="outline" className={`text-[9px] px-1 h-4 shrink-0 ${inv._offlineAction === 'delete' ? 'border-red-300 text-red-600' : 'border-amber-300 text-amber-600'}`}>
                {inv._offlineAction === 'delete' ? 'حذف در صف' : 'آفلاین'}
              </Badge>
            )}
          </div>
          {getStatusBadge(inv.status, inv.paymentStatus, (inv as any).invoiceType)}
        </div>

        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs text-gray-600 truncate flex-1">
            {inv.customerName || <span className="text-gray-400">فروش عمومی</span>}
          </span>
      <div className="flex items-center gap-1">
  {getPaymentTypeBadge(inv.paymentType)}
  {inv.paymentType?.toLowerCase() === 'check' && getCheckStatusBadge((inv as any).checkStatus)}
</div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <div className="bg-gray-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">کل</p>
            <p className="text-[10px] font-bold text-gray-700 leading-tight mt-0.5">
              {formatNumber(inv.totalAmount)} <span className="text-[9px] text-gray-500 font-normal">ریال</span>
            </p>
          </div>
          <div className="bg-emerald-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">پرداخت</p>
            <p className="text-[10px] font-bold text-emerald-600 leading-tight mt-0.5">
              {formatNumber(inv.paidAmount)} <span className="text-[9px] text-gray-500 font-normal">ریال</span>
            </p>
          </div>
          <div className={`rounded p-1.5 text-center ${remaining > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className="text-[9px] text-gray-400 leading-tight">باقی</p>
            <p className={`text-[10px] font-bold leading-tight mt-0.5 ${remaining > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {formatNumber(remaining)} <span className="text-[9px] text-gray-500 font-normal">ریال</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-[10px] text-gray-400">{formatDateShort(inv.createdAt)}</span>
          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-sky-50 hover:text-sky-600" onClick={() => onView(inv)}>
              <Eye className="w-3.5 h-3.5" />
            </Button>
            {hasCreditRemaining && (
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-600" onClick={() => onPay(inv)}>
                <Wallet className="w-3.5 h-3.5" />
              </Button>
            )}
            {(inv as any).invoiceType !== 'service' && !isReturn && !isCancelled && (
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-amber-50 hover:text-amber-600" onClick={() => onReturn(inv)}>
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            )}
            {(planFeatures.canDeleteInvoice || isReturn) ? (
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(inv)}
                disabled={(isPaid && !isReturn) || isCancelled || inv._offlineAction === 'delete'}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-300"
                onClick={() => onToast('حذف فاکتور فقط در پلن حرفه‌ای در دسترس است')}>
                <Lock className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('ALL')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<PaymentTypeFilterKey>('ALL')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const router = useRouter()
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [isOfflineData, setIsOfflineData] = useState(false)

  // Credit Payment
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [invoiceToPay, setInvoiceToPay] = useState<Invoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentRef, setPaymentRef] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [paymentDate, setPaymentDate] = useState('')

  // Installment Payment
  const [installmentPayDialogOpen, setInstallmentPayDialogOpen] = useState(false)
  const [installmentToPay, setInstallmentToPay] = useState<InstallmentScheduleItem | null>(null)
  const [installmentPayInvoice, setInstallmentPayInvoice] = useState<Invoice | null>(null)
  const [installmentPayAmount, setInstallmentPayAmount] = useState('')
  const [installmentPayMethod, setInstallmentPayMethod] = useState('cash')
  const [installmentPayRef, setInstallmentPayRef] = useState('')
  const [installmentPayDate, setInstallmentPayDate] = useState('')
  const [installmentPayNotes, setInstallmentPayNotes] = useState('')
  const [submittingInstallmentPay, setSubmittingInstallmentPay] = useState(false)

  // Receive Payment
  const [receivePayDialogOpen, setReceivePayDialogOpen] = useState(false)
  const [receivePayInvoice, setReceivePayInvoice] = useState<Invoice | null>(null)
  const [receivePayInstallment, setReceivePayInstallment] = useState<InstallmentScheduleItem | null>(null)
  const [receivePayAmount, setReceivePayAmount] = useState('')
  const [receivePayMethod, setReceivePayMethod] = useState<'cash' | 'card'>('cash')
  const [receivePayRef, setReceivePayRef] = useState('')
  const [receivePayNotes, setReceivePayNotes] = useState('')
  const [receivePaySubmitting, setReceivePaySubmitting] = useState(false)

  // Return Invoice
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [returnSubmitting, setReturnSubmitting] = useState(false)
  const [invoiceToReturn, setInvoiceToReturn] = useState<Invoice | null>(null)
  const [returnItems, setReturnItems] = useState<Array<{
    invoiceItemId: string; productName: string; maxQuantity: number; quantity: number; returnReason: string
  }>>([])
  const [returnPaymentType, setReturnPaymentType] = useState<'cash' | 'credit'>('cash')
  const [returnDescription, setReturnDescription] = useState('')

  const { toast } = useToast()
  const tenantId = useAppStore((s) => s.tenantId)
  const isOnline = useAppStore((s) => s.isOnline)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const planName = useAppStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])

  // ═══════════════════════════════════════════════════════════════
  // loadInvoices
  // ═══════════════════════════════════════════════════════════════

  const loadInvoices = useCallback(async () => {
    if (!tenantId) { setLoading(false); setError('tenantId یافت نشد'); setInvoices([]); return }
    if (invoices.length === 0) setLoading(true)
    setError(null)

    if (!isOnline) {
      try {
        const statusKey = statusFilter === 'ALL' ? 'all' : statusFilter.toLowerCase()
        const cached = await getCachedInvoicesPage(statusKey, page)
        if (cached && cached.invoices.length > 0) {
          const marked = cached.invoices.map((inv: any) => ({ ...inv, _isOffline: true }))
          setInvoices(marked)
          setTotalPages(cached.totalPages || 1)
          setTotalCount(cached.total || marked.length)
          setIsOfflineData(true)
        } else {
          setInvoices([])
          setError('داده‌ای در حافظه یافت نشد. پس از اتصال به اینترنت، صفحه را بروز کنید.')
        }
      } catch (e) {
        setInvoices([]); setError('خطا در خواندن داده‌های ذخیره‌شده')
      } finally { setLoading(false) }
      return
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '10')
      params.set('tenantId', tenantId)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/invoices?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const result = await res.json()

      if (result.success) {
        const data = result.data || []
        setInvoices(data)
        setTotalPages(result.pagination?.totalPages || 1)
        setTotalCount(result.pagination?.total || data.length)
        setIsOfflineData(false)
        setError(null)
        try {
          const statusKey = statusFilter === 'ALL' ? 'all' : statusFilter.toLowerCase()
          await cacheInvoicesPage(data, result.pagination?.totalPages || 1, result.pagination?.total || data.length, statusKey, page)
        } catch (e) { }
        setLoading(false)
        return
      }
      throw new Error(result.error || 'خطای ناشناخته')
    } catch (err: any) {
      try {
        const statusKey = statusFilter === 'ALL' ? 'all' : statusFilter.toLowerCase()
        const cached = await getCachedInvoicesPage(statusKey, page)
        if (cached && cached.invoices.length > 0) {
          const marked = cached.invoices.map((inv: any) => ({ ...inv, _isOffline: true }))
          setInvoices(marked)
          setTotalPages(cached.totalPages || 1)
          setTotalCount(cached.total || marked.length)
          setIsOfflineData(true)
        } else {
          setInvoices([]); setError(err?.message || 'خطا در بارگذاری فاکتورها')
        }
      } catch (e) {
        setInvoices([]); setError(err?.message || 'خطا در بارگذاری فاکتورها')
      }
      setLoading(false)
    }
  }, [page, statusFilter, tenantId, isOnline, invoices.length])

  useEffect(() => { loadInvoices() }, [loadInvoices])

  useEffect(() => {
    if (isOnline && isOfflineData) loadInvoices()
  }, [isOnline])

  useEffect(() => {
    if (!isOnline) return
    const interval = setInterval(() => { loadInvoices() }, 60000)
    return () => clearInterval(interval)
  }, [loadInvoices, isOnline])

  // ★ ریست صفحه هنگام تغییر فیلتر
  useEffect(() => { setPage(1) }, [statusFilter, paymentTypeFilter])

  // ═══════════════════════════════════════════════════════════════
  // فیلتر کلاینت‌ساید
  // ═══════════════════════════════════════════════════════════════

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (search) {
        const q = search.toLowerCase()
        const number = (inv.invoiceNumber || inv.number || '').toLowerCase()
        const customer = (inv.customerName || '').toLowerCase()
        if (!number.includes(q) && !customer.includes(q)) return false
      }
      if (statusFilter !== 'ALL') {
        const s = (inv.paymentStatus || inv.status || '').toUpperCase()
        if (s !== statusFilter) return false
      }
      if (paymentTypeFilter !== 'ALL') {
        const pt = (inv.paymentType || '').toLowerCase()
        if (pt !== paymentTypeFilter) return false
      }
      return true
    })
  }, [invoices, search, statusFilter, paymentTypeFilter])

  const summaryStats = useMemo(() => {
    const total = invoices.length
    const getEffectiveStatus = (inv: any) => (inv.paymentStatus || inv.status || '').toUpperCase()
    const paid = invoices.filter(i => getEffectiveStatus(i) === 'PAID').length
    const pending = invoices.filter(i => getEffectiveStatus(i) === 'PENDING').length
    const partial = invoices.filter(i => ['PARTIAL', 'PARTIALLYPAID'].includes(getEffectiveStatus(i))).length
    const totalAmount = invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0)
    const paidAmount = invoices.reduce((sum, i) => sum + (i.paidAmount || 0), 0)
    return { total, paid, pending, partial, totalAmount, paidAmount }
  }, [invoices])
    // ═══════════════════════════════════════════════════════════════
  // Credit Payment Handler
  // ═══════════════════════════════════════════════════════════════

  const handlePayClick = (invoice: Invoice) => {
    if (!planFeatures.canAccessCredit) {
      toast({ title: 'محدودیت پلن', description: 'ثبت پرداخت نسیه فقط در پلن حرفه‌ای و سازمانی در دسترس است', variant: 'destructive' })
      return
    }
    const paymentType = (invoice.paymentType || '').toLowerCase()
    if (paymentType !== 'credit') {
      toast({ title: 'خطا', description: 'ثبت پرداخت فقط برای فاکتورهای نسیه مجاز است', variant: 'destructive' })
      return
    }
    const status = (invoice.paymentStatus || invoice.status || '').toUpperCase()
    if (status === 'PAID') {
      toast({ title: 'اطلاع', description: 'این فاکتور قبلاً به طور کامل پرداخت شده است' })
      return
    }
    setInvoiceToPay(invoice)
    const remaining = (invoice.totalAmount || 0) - (invoice.paidAmount || 0)
    setPaymentAmount(String(remaining))
    setPaymentMethod('cash')
    setPaymentRef('')
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentDialogOpen(true)
  }

  const handlePayConfirm = async () => {
    if (!isOnline) {
      toast({ title: 'عدم دسترسی', description: 'ثبت پرداخت نیاز به اتصال اینترنت برای صدور سند حسابداری دارد.', variant: 'destructive' })
      return
    }
    if (!invoiceToPay) return
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ پرداخت باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }
    const remaining = (invoiceToPay.totalAmount || 0) - (invoiceToPay.paidAmount || 0)
    if (amount > remaining + 1) {
      toast({ title: 'خطا', description: `مبلغ پرداخت بیش از مبلغ باقیمانده است`, variant: 'destructive' })
      return
    }
    setSubmittingPayment(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/invoices/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ invoiceId: invoiceToPay.id, amount, paymentType: paymentMethod, paymentRef: paymentRef || undefined, paidAt: paymentDate || undefined }),
      })
      const result = await res.json()
      if (result.success) {
        toast({ title: 'پرداخت ثبت شد', description: result.message || 'پرداخت نسیه با موفقیت ثبت شد' })
        setPaymentDialogOpen(false)
        setInvoiceToPay(null)
        setPaymentAmount('')
        setPaymentRef('')
        setPaymentDate('')
        await loadInvoices()
      } else {
        toast({ title: 'خطا در ثبت پرداخت', description: result.error || 'خطای ناشناخته', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور', variant: 'destructive' })
    } finally {
      setSubmittingPayment(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Installment Payment Handler
  // ═══════════════════════════════════════════════════════════════

  const handleInstallmentPayClick = (invoice: Invoice, schedule: InstallmentScheduleItem) => {
    if (!planFeatures.canAccessCredit) {
      toast({ title: 'محدودیت پلن', description: 'ثبت پرداخت قسط فقط در پلن حرفه‌ای و سازمانی در دسترس است', variant: 'destructive' })
      return
    }
    const status = (schedule.status || '').toLowerCase()
    if (status === 'paid' || status === 'completed') {
      toast({ title: 'اطلاع', description: 'این قسط قبلاً به طور کامل پرداخت شده است' })
      return
    }
    setInstallmentPayInvoice(invoice)
    setInstallmentToPay(schedule)
    const remaining = (schedule.amount || 0) - (schedule.paidAmount || 0)
    setInstallmentPayAmount(String(remaining))
    setInstallmentPayMethod('cash')
    setInstallmentPayRef('')
    setInstallmentPayDate(new Date().toISOString().split('T')[0])
    setInstallmentPayNotes('')
    setInstallmentPayDialogOpen(true)
  }

  const handleInstallmentPayConfirm = async () => {
    if (!isOnline) {
      toast({ title: 'عدم دسترسی', description: 'ثبت پرداخت قسط نیاز به اتصال اینترنت دارد.', variant: 'destructive' })
      return
    }
    if (!installmentToPay || !installmentPayInvoice) return
    const amount = Number(installmentPayAmount)
    if (!amount || amount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ پرداخت باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }
    const remaining = (installmentToPay.amount || 0) - (installmentToPay.paidAmount || 0)
    if (amount > remaining + 1) {
      toast({ title: 'خطا', description: `مبلغ پرداخت بیش از مبلغ باقی‌مانده قسط است`, variant: 'destructive' })
      return
    }
    if (!installmentPayDate) {
      toast({ title: 'خطا', description: 'تاریخ پرداخت الزامی است', variant: 'destructive' })
      return
    }
    setSubmittingInstallmentPay(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/installment-schedules/${installmentToPay.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount, paymentType: installmentPayMethod, paymentRef: installmentPayRef || undefined, paidAt: installmentPayDate, notes: installmentPayNotes || undefined }),
      })
      const result = await res.json()
      if (result.success) {
        toast({ title: 'پرداخت ثبت شد', description: `قسط ${installmentToPay.installmentNumber} با موفقیت پرداخت شد` })
        setInstallmentPayDialogOpen(false)
        setInstallmentToPay(null)
        setInstallmentPayInvoice(null)
        setInstallmentPayAmount('')
        setInstallmentPayRef('')
        setInstallmentPayNotes('')
        setInstallmentPayDate('')
        setDetailOpen(false)
        await loadInvoices()
      } else {
        toast({ title: 'خطا در ثبت پرداخت', description: result.error || 'خطای ناشناخته', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور', variant: 'destructive' })
    } finally {
      setSubmittingInstallmentPay(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Receive Payment (Universal)
  // ═══════════════════════════════════════════════════════════════

  const handleReceivePaymentClick = (inv: Invoice, installment?: InstallmentScheduleItem | null) => {
    const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)
    if (remaining <= 0) {
      toast({ title: 'خطا', description: 'این فاکتور به طور کامل پرداخت شده است', variant: 'destructive' })
      return
    }
    setReceivePayInvoice(inv)
    setReceivePayInstallment(installment || null)
    if (installment) {
      const instRemaining = (installment.amount || 0) - (installment.paidAmount || 0)
      setReceivePayAmount(String(instRemaining))
    } else {
      setReceivePayAmount(String(remaining))
    }
    setReceivePayMethod('cash')
    setReceivePayRef('')
    setReceivePayNotes('')
    setReceivePayDialogOpen(true)
  }

  const submitReceivePayment = async () => {
    if (!isOnline) {
      toast({ title: 'عدم دسترسی', description: 'ثبت دریافت وجه نیاز به اتصال اینترنت دارد.', variant: 'destructive' })
      return
    }
    if (!receivePayInvoice) return
    const amount = Number(receivePayAmount)
    if (!amount || amount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ نامعتبر است', variant: 'destructive' })
      return
    }
    const remaining = (receivePayInvoice.totalAmount || 0) - (receivePayInvoice.paidAmount || 0)
    if (amount > remaining + 1) {
      toast({ title: 'خطا', description: `مبلغ بیش از باقیمانده است`, variant: 'destructive' })
      return
    }
    setReceivePaySubmitting(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/invoices/receive-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          invoiceId: receivePayInvoice.id, amount, paymentMethod: receivePayMethod,
          paymentRef: receivePayRef || undefined, notes: receivePayNotes || undefined,
          installmentId: receivePayInstallment?.id || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'دریافت وجه ثبت شد', description: `${amount.toLocaleString('fa-IR')} تومان دریافت شد` })
        setReceivePayDialogOpen(false)
        setReceivePayInvoice(null)
        setReceivePayInstallment(null)
        loadInvoices()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ثبت دریافت', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message || 'خطا در ارتباط با سرور', variant: 'destructive' })
    } finally {
      setReceivePaySubmitting(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // View Detail / Delete
  // ═══════════════════════════════════════════════════════════════

  const handleViewDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setDetailOpen(true)
  }

  const handleDeleteClick = (invoice: Invoice) => {
    const isReturn = (invoice as any).invoiceType === 'sale_return' || (invoice as any).invoiceType === 'purchase_return'
    if (!planFeatures.canDeleteInvoice && !isReturn) return
    setInvoiceToDelete(invoice)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return
    setDeleting(true)

    if (!isOnline) {
      const updated = invoices.map(inv =>
        inv.id === invoiceToDelete.id ? { ...inv, _isOffline: true, _offlineAction: 'delete' as const } : inv
      )
      setInvoices(updated)
      try {
        await addToSyncQueue('invoice_delete', {
          method: 'DELETE',
          url: `/api/invoices?id=${invoiceToDelete.id}`,
          body: { id: invoiceToDelete.id }
        })
        toast({ title: 'حذف در صف', description: 'فاکتور پس از اتصال به اینترنت حذف خواهد شد.' })
      } catch (err) {
        toast({ title: 'خطا', description: 'خطا در ذخیره عملیات حذف', variant: 'destructive' })
      }
      setDeleting(false)
      setDeleteDialogOpen(false)
      setInvoiceToDelete(null)
      return
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/invoices?id=${invoiceToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const result = await res.json()
      if (result.success) {
        toast({ title: 'حذف موفق', description: `فاکتور ${invoiceToDelete.invoiceNumber || invoiceToDelete.number} حذف شد` })
        await loadInvoices()
      } else {
        toast({ title: 'خطا در حذف', description: result.error || 'خطای ناشناخته' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setInvoiceToDelete(null)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Return Invoice Handlers
  // ═══════════════════════════════════════════════════════════════

  const handleReturnClick = async (invoice: Invoice) => {
    const invoiceType = (invoice as any).invoiceType?.toLowerCase() || 'sale'
    if (invoiceType === 'service') {
      toast({ title: 'خطا', description: 'فاکتور خدماتی قابل برگشت نیست', variant: 'destructive' })
      return
    }
    if (invoiceType === 'sale_return') {
      toast({ title: 'خطا', description: 'این فاکتور خودش برگشتی است', variant: 'destructive' })
      return
    }
    setInvoiceToReturn(invoice)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const data = await res.json()
      if (data.success && data.data?.items && Array.isArray(data.data.items) && data.data.items.length > 0) {
        const formattedItems = data.data.items.map((item: any) => ({
          invoiceItemId: item.id || '',
          productName: item.productName || 'کالا نامشخص',
          maxQuantity: item.quantity || 0,
          quantity: 0,
          returnReason: '',
        }))
        setReturnItems(formattedItems)
      } else {
        toast({ title: 'هشدار', description: 'این فاکتور آیتمی برای برگشت ندارد', variant: 'destructive' })
        return
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: `بارگذاری آیتم‌های فاکتور ناموفق بود: ${err.message}`, variant: 'destructive' })
      return
    }
    setReturnDialogOpen(true)
  }

  const handleReturnItemChange = (index: number, field: string, value: any) => {
    const updated = [...returnItems]
    if (field === 'quantity') {
      const num = Number(value)
      updated[index].quantity = Math.min(Math.max(0, num), updated[index].maxQuantity)
    } else {
      (updated[index] as any)[field] = value
    }
    setReturnItems(updated)
  }

  const handleReturnSubmit = async () => {
    if (!isOnline) {
      toast({ title: 'عدم دسترسی', description: 'ثبت برگشتی نیاز به اتصال اینترنت برای به‌روزرسانی موجودی انبار دارد.', variant: 'destructive' })
      return
    }
    if (!invoiceToReturn) return
    const selectedItems = returnItems.filter(i => i.quantity > 0)
    if (selectedItems.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک آیتم باید برای برگشت انتخاب شود', variant: 'destructive' })
      return
    }
    setReturnSubmitting(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const requestBody = {
        items: selectedItems.map(i => ({ invoiceItemId: i.invoiceItemId, quantity: i.quantity, returnReason: i.returnReason || undefined })),
        paymentType: returnPaymentType,
        description: returnDescription || undefined,
      }
      const res = await fetch(`/api/invoices/${invoiceToReturn.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'برگشتی ثبت شد ✓', description: data.message || `فاکتور برگشتی ${data.data?.number} ثبت شد` })
        setReturnDialogOpen(false)
        setReturnDescription('')
        setReturnItems([])
        setInvoiceToReturn(null)
        loadInvoices()
      } else {
        toast({ title: 'خطا', description: data.error || 'ثبت برگشتی ناموفق بود', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message || 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    } finally {
      setReturnSubmitting(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Render: Detail Dialog (Compact)
  // ═══════════════════════════════════════════════════════════════

  const renderDetailDialog = () => {
    if (!selectedInvoice) return null
    const inv = selectedInvoice
    const items = inv.items || []
    const payments = inv.payments || []
    const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)

    return (
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-xl p-0 gap-0" dir="rtl">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base m-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <span className="font-bold block truncate">فاکتور {inv.invoiceNumber || inv.number}</span>
                <span className="text-[10px] text-gray-500 block leading-tight">{formatDate(inv.createdAt)}</span>
              </div>
            </DialogTitle>
            <DialogClose className="rounded-full h-7 w-7 flex items-center justify-center hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors shrink-0">
              <X className="h-4 w-4" />
            </DialogClose>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'مشتری', value: <span className="text-xs font-medium truncate block">{inv.customerName || 'فروش عمومی'}</span> },
             { label: 'وضعیت', value: <div className="flex items-center gap-1 flex-wrap">{getStatusBadge(inv.status, inv.paymentStatus, (inv as any).invoiceType)}{getPaymentTypeBadge(inv.paymentType)}{inv.paymentType?.toLowerCase() === 'check' && getCheckStatusBadge((inv as any).checkStatus)}</div> },
              ].map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-gray-400 mb-0.5">{item.label}</p>
                  {item.value}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                <p className="text-[9px] text-emerald-700 font-medium">مبلغ کل</p>
                <p className="text-xs font-bold text-emerald-700 mt-0.5">{formatCurrencyShort(inv.totalAmount)}</p>
                <p className="text-[9px] text-emerald-600">ریال</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-2 text-center border border-sky-100">
                <p className="text-[9px] text-sky-700 font-medium">پرداخت</p>
                <p className="text-xs font-bold text-sky-700 mt-0.5">{formatCurrencyShort(inv.paidAmount)}</p>
                <p className="text-[9px] text-sky-600">ریال</p>
              </div>
              <div className={`rounded-lg p-2 text-center border ${remaining > 0 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <p className={`text-[9px] font-medium ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>باقی</p>
                <p className={`text-xs font-bold mt-0.5 ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatCurrencyShort(remaining)}</p>
                <p className={`text-[9px] ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>ریال</p>
              </div>
            </div>

            {items.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                  <p className="text-[10px] font-semibold text-gray-600">آیتم‌های فاکتور ({toFaNum(items.length)})</p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                        <TableHead className="text-[10px] h-7 py-1">کالا</TableHead>
                        <TableHead className="text-[10px] h-7 py-1 text-right">تعداد</TableHead>
                        <TableHead className="text-[10px] h-7 py-1 text-right hidden sm:table-cell">قیمت</TableHead>
                        <TableHead className="text-[10px] h-7 py-1 text-right">جمع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, idx) => (
                        <TableRow key={item.id || idx}>
                          <TableCell className="text-[10px] py-1.5">{item.productName}</TableCell>
                          <TableCell className="text-[10px] py-1.5 text-right font-mono">{formatNumber(item.quantity)} {item.unitLabel || ''}</TableCell>
                          <TableCell className="text-[10px] py-1.5 text-right font-mono hidden sm:table-cell">{formatCurrencyShort(item.unitPrice)}</TableCell>
                          <TableCell className="text-[10px] py-1.5 text-right font-mono font-bold">{formatCurrencyShort(item.totalAmount || item.lineTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {payments.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                  <p className="text-[10px] font-semibold text-gray-600">پرداخت‌ها ({toFaNum(payments.length)})</p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                        <TableHead className="text-[10px] h-7 py-1">مبلغ</TableHead>
                        <TableHead className="text-[10px] h-7 py-1">روش</TableHead>
                        <TableHead className="text-[10px] h-7 py-1">تاریخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((pay, idx) => {
                        const method = pay.paymentType || pay.method || 'cash'
                        const methodLabel = method === 'cash' ? 'نقدی' : method === 'card' || method === 'pos' ? 'کارتخوان' : method === 'bank' ? 'بانکی' : method === 'credit' ? 'نسیه' : method === 'installment' ? 'قسطی' : method
                        return (
                          <TableRow key={pay.id || idx}>
                            <TableCell className="text-[10px] py-1.5 font-mono">{formatCurrencyShort(pay.amount)}</TableCell>
                            <TableCell className="text-[10px] py-1.5">{methodLabel}</TableCell>
                            <TableCell className="text-[10px] py-1.5">{formatDateShort(pay.paidAt)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {inv.installmentPlan && Array.isArray((inv as any).installmentPlan?.schedule) && (inv as any).installmentPlan.schedule.length > 0 && (
              <div className="border border-purple-200 rounded-lg overflow-hidden">
                <div className="bg-purple-50 px-3 py-1.5 border-b border-purple-200">
                  <p className="text-[10px] font-semibold text-purple-700">برنامه اقساط</p>
                </div>
                <div className="divide-y divide-purple-100 max-h-40 overflow-y-auto">
                  {(inv as any).installmentPlan.schedule.map((s: InstallmentScheduleItem) => (
                    <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-purple-700">قسط {toFaNum(s.installmentNumber)}</span>
                        <span className="text-gray-500">{formatDateShort(s.dueDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium">{formatCurrencyShort(s.amount)}</span>
                        <Badge className={`text-[8px] px-1 h-4 ${s.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {s.status === 'paid' ? 'پرداخت' : 'معوق'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-2.5 flex items-center gap-2 flex-wrap">
            {(() => {
              const rem = (inv.totalAmount || 0) - (inv.paidAmount || 0)
              if (rem > 0 && (inv.paymentType === 'credit' || inv.paymentType === 'installment')) {
                return (
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 px-3 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => { setDetailOpen(false); handleReceivePaymentClick(inv) }}>
                    <Wallet className="w-3.5 h-3.5" />ثبت پرداخت
                  </Button>
                )
              }
              return null
            })()}
            {inv.customerId && planFeatures.canOnlinePayment && (inv.paymentType === 'credit' || inv.paymentType === 'installment') && (
              <PortalLinkButton customerId={inv.customerId} customerName={inv.customerName} portalToken={inv.customerPortalToken} variant="outline" size="sm" label="پورتال" />
            )}
            <InvoicePDFButton invoiceId={inv.id} invoiceNumber={inv.invoiceNumber || inv.number} />
                      {/* ★★★ v9.1: دکمه پرداخت الکترونیک فقط برای پلن‌های دارای درگاه پرداخت */}
            {planFeatures.canOnlinePayment && (() => {
              const rem = (inv.totalAmount || 0) - (inv.paidAmount || 0)
              return rem > 0 ? <OnlinePaymentButton invoiceId={inv.id} amount={rem} /> : null
            })()}
            <Button variant="ghost" size="sm" onClick={() => setDetailOpen(false)} className="mr-auto h-8 px-3 text-xs">
              بستن
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Render: Payment Dialog (نسیه)
  // ═══════════════════════════════════════════════════════════════

  const renderPaymentDialog = () => {
    if (!invoiceToPay) return null
    const inv = invoiceToPay
    const totalAmount = inv.totalAmount || 0
    const alreadyPaid = inv.paidAmount || 0
    const remaining = totalAmount - alreadyPaid
    const enteredAmount = Number(paymentAmount) || 0
    const newRemaining = Math.max(0, remaining - enteredAmount)
    const willBeFullyPaid = newRemaining <= 1

    return (
      <Dialog open={paymentDialogOpen} onOpenChange={(open) => { if (!submittingPayment) setPaymentDialogOpen(open) }}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-full sm:max-w-md rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />ثبت پرداخت نسیه
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">فاکتور {inv.invoiceNumber || inv.number}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <Card className="bg-gray-50/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between text-xs"><span className="text-gray-500">مشتری</span><span className="font-medium">{inv.customerName || 'فروش عمومی'}</span></div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { label: 'مبلغ کل', value: formatCurrency(totalAmount), color: 'text-gray-700' },
                    { label: 'پرداخت شده', value: formatCurrency(alreadyPaid), color: 'text-emerald-600' },
                    { label: 'باقیمانده', value: formatCurrency(remaining), color: 'text-amber-600' },
                  ].map((item, i) => (
                    <div key={i} className="text-center"><p className="text-gray-500">{item.label}</p><p className={`font-bold ${item.color}`}>{item.value}</p></div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">مبلغ پرداخت <span className="text-red-500">*</span></Label>
              <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="مبلغ به تومان" className="text-left font-mono" disabled={submittingPayment} />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setPaymentAmount(String(remaining))} disabled={submittingPayment}>پرداخت کامل</Button>
                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setPaymentAmount(String(Math.floor(remaining / 2)))} disabled={submittingPayment}>نصف مبلغ</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">روش پرداخت <span className="text-red-500">*</span></Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={submittingPayment}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="انتخاب روش پرداخت" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدی (صندوق)</SelectItem>
                  <SelectItem value="card">کارتخوان</SelectItem>
                  <SelectItem value="bank">بانکی (واریز)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">تاریخ پرداخت <span className="text-red-500">*</span></Label>
              <ShamsiDatePicker value={paymentDate} onChange={setPaymentDate} placeholder="انتخاب تاریخ پرداخت" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">شماره مرجع (اختیاری)</Label>
              <Input type="text" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="شماره فیش / تراکنش" className="text-left font-mono" disabled={submittingPayment} />
            </div>

            {enteredAmount > 0 && enteredAmount <= remaining + 1 && (
              <div className={`p-2.5 rounded-lg border text-xs ${willBeFullyPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                {willBeFullyPaid ? (
                  <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="w-4 h-4 shrink-0" />این فاکتور پس از پرداخت، به طور کامل تسویه می‌شود</div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-700"><AlertTriangle className="w-4 h-4 shrink-0" />پس از این پرداخت، {formatCurrency(newRemaining)} باقیمانده خواهد ماند</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1"
              onClick={() => { setPaymentDialogOpen(false); setInvoiceToPay(null); setPaymentAmount(''); setPaymentRef(''); setPaymentDate('') }}
              disabled={submittingPayment}>انصراف</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={handlePayConfirm}
              disabled={submittingPayment || !paymentAmount || Number(paymentAmount) <= 0 || !paymentDate}>
              {submittingPayment ? <><Loader2 className="w-4 h-4 animate-spin" />در حال ثبت...</> : <><Wallet className="w-4 h-4" />ثبت پرداخت</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Render: Installment Payment Dialog
  // ═══════════════════════════════════════════════════════════════

  const renderInstallmentPayDialog = () => {
    if (!installmentToPay || !installmentPayInvoice) return null
    const inst = installmentToPay
    const fullAmount = inst.amount || 0
    const alreadyPaid = inst.paidAmount || 0
    const remaining = fullAmount - alreadyPaid
    const enteredAmount = Number(installmentPayAmount) || 0
    const newRemainingForInst = Math.max(0, remaining - enteredAmount)
    const willBeFullyPaid = newRemainingForInst <= 1

    return (
      <Dialog open={installmentPayDialogOpen} onOpenChange={(open) => { if (!submittingInstallmentPay) setInstallmentPayDialogOpen(open) }}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-full sm:max-w-sm max-h-[92vh] overflow-y-auto rounded-xl" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Wallet className="w-4 h-4 text-purple-600" />پرداخت قسط {inst.installmentNumber.toLocaleString('fa-IR')}
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              فاکتور {installmentPayInvoice.invoiceNumber || installmentPayInvoice.number} • {installmentPayInvoice.customerName || 'فروش عمومی'}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-purple-50/50 border border-purple-200 rounded-lg p-2 mb-2">
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              {[
                { label: 'مبلغ قسط', value: formatCurrency(fullAmount), color: 'text-gray-700' },
                { label: 'پرداخت شده', value: formatCurrency(alreadyPaid), color: 'text-emerald-600' },
                { label: 'باقیمانده', value: formatCurrency(remaining), color: 'text-purple-600' },
              ].map((item, i) => (
                <div key={i} className="text-center"><p className="text-gray-500 text-[10px]">{item.label}</p><p className={`font-bold ${item.color}`}>{item.value}</p></div>
              ))}
            </div>
            <div className="text-[10px] text-gray-500 pt-1.5 mt-1.5 border-t border-purple-100">سررسید: {formatDateShort(inst.dueDate)}</div>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium">مبلغ پرداخت <span className="text-red-500">*</span></Label>
              <Input type="number" value={installmentPayAmount} onChange={e => setInstallmentPayAmount(e.target.value)} placeholder="مبلغ پرداخت" className="text-left font-mono h-8 text-xs" disabled={submittingInstallmentPay} />
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setInstallmentPayAmount(String(remaining))} disabled={submittingInstallmentPay}>پرداخت کامل</Button>
                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setInstallmentPayAmount(String(Math.floor(remaining / 2)))} disabled={submittingInstallmentPay}>نصف مبلغ</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">روش پرداخت <span className="text-red-500">*</span></Label>
                <Select value={installmentPayMethod} onValueChange={setInstallmentPayMethod} disabled={submittingInstallmentPay}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="روش" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدی</SelectItem>
                    <SelectItem value="card">کارتخوان</SelectItem>
                    <SelectItem value="bank">بانکی</SelectItem>
                    <SelectItem value="check">چک</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">تاریخ <span className="text-red-500">*</span></Label>
                <ShamsiDatePicker value={installmentPayDate} onChange={setInstallmentPayDate} placeholder="انتخاب تاریخ" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">شماره مرجع</Label>
                <Input type="text" value={installmentPayRef} onChange={e => setInstallmentPayRef(e.target.value)} placeholder="فیش / تراکنش" className="text-left font-mono h-8 text-xs" disabled={submittingInstallmentPay} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">توضیحات</Label>
                <Input type="text" value={installmentPayNotes} onChange={e => setInstallmentPayNotes(e.target.value)} placeholder="اختیاری" className="h-8 text-xs" disabled={submittingInstallmentPay} />
              </div>
            </div>

            {enteredAmount > 0 && enteredAmount <= remaining + 1 && (
              <div className={`p-2 rounded-md border text-[11px] ${willBeFullyPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                {willBeFullyPaid ? (
                  <div className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />این قسط به طور کامل تسویه می‌شود</div>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />باقیمانده قسط: {formatCurrency(newRemainingForInst)}</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-1.5 pt-1 border-t mt-1">
            <Button variant="outline" size="sm" className="h-8 text-xs flex-1"
              onClick={() => { setInstallmentPayDialogOpen(false); setInstallmentToPay(null); setInstallmentPayInvoice(null); setInstallmentPayAmount(''); setInstallmentPayRef(''); setInstallmentPayNotes(''); setInstallmentPayDate('') }}
              disabled={submittingInstallmentPay}>انصراف</Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 h-8 text-xs flex-1 gap-1"
              onClick={handleInstallmentPayConfirm}
              disabled={submittingInstallmentPay || !installmentPayAmount || Number(installmentPayAmount) <= 0 || !installmentPayDate}>
              {submittingInstallmentPay ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />در حال ثبت...</> : <><Wallet className="w-3.5 h-3.5" />ثبت پرداخت</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Render: Receive Payment Dialog
  // ═══════════════════════════════════════════════════════════════

  const renderReceivePaymentDialog = () => {
    if (!receivePayInvoice) return null
    const remaining = (receivePayInvoice.totalAmount || 0) - (receivePayInvoice.paidAmount || 0)
    const amount = Number(receivePayAmount) || 0
    const isInstallmentPayment = !!receivePayInstallment

    return (
      <Dialog open={receivePayDialogOpen} onOpenChange={(open) => { setReceivePayDialogOpen(open); if (!open) { setReceivePayInvoice(null); setReceivePayInstallment(null) } }}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-full sm:max-w-sm rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Wallet className="w-4 h-4 text-emerald-600" />دریافت وجه
            </DialogTitle>
            <DialogDescription className="text-xs">
              فاکتور {receivePayInvoice.number}
              {isInstallmentPayment && receivePayInstallment && (
                <span className="text-purple-600 mr-1">— قسط {receivePayInstallment.installmentNumber.toLocaleString('fa-IR')}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="bg-emerald-50 rounded-lg p-2.5 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">باقیمانده فعلی:</span>
                <span className="font-bold text-emerald-700">{remaining.toLocaleString('fa-IR')} ت</span>
              </div>
              {amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">بعد از دریافت:</span>
                  <span className="font-bold text-gray-700">{Math.max(0, remaining - amount).toLocaleString('fa-IR')} ت</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">مبلغ دریافت (تومان) *</Label>
              <Input type="number" value={receivePayAmount} onChange={e => setReceivePayAmount(e.target.value)} placeholder="مبلغ به تومان" className="text-sm" dir="ltr" />
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={() => setReceivePayAmount(String(remaining))}>کل باقیمانده</Button>
                {isInstallmentPayment && receivePayInstallment && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={() => setReceivePayAmount(String((receivePayInstallment.amount || 0) - (receivePayInstallment.paidAmount || 0)))}>مبلغ این قسط</Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">روش پرداخت</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant={receivePayMethod === 'cash' ? 'default' : 'outline'} className={`h-8 text-xs ${receivePayMethod === 'cash' ? 'bg-emerald-600' : ''}`} onClick={() => setReceivePayMethod('cash')}>نقدی</Button>
                <Button size="sm" variant={receivePayMethod === 'card' ? 'default' : 'outline'} className={`h-8 text-xs ${receivePayMethod === 'card' ? 'bg-emerald-600' : ''}`} onClick={() => setReceivePayMethod('card')}>کارتخوان</Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">شماره پیگیری (اختیاری)</Label>
              <Input type="text" value={receivePayRef} onChange={e => setReceivePayRef(e.target.value)} placeholder="1234567890" className="text-sm" dir="ltr" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">توضیحات (اختیاری)</Label>
              <Input type="text" value={receivePayNotes} onChange={e => setReceivePayNotes(e.target.value)} placeholder="توضیحات..." className="text-sm" />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setReceivePayDialogOpen(false)} disabled={receivePaySubmitting}>انصراف</Button>
            <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={submitReceivePayment} disabled={receivePaySubmitting || !receivePayAmount}>
              {receivePaySubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />در حال ثبت...</> : <><CheckCircle2 className="w-3.5 h-3.5" />ثبت دریافت</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Render: Delete Dialog
  // ═══════════════════════════════════════════════════════════════

  const renderDeleteDialog = () => (
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-full sm:max-w-md rounded-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base text-red-600">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />تایید حذف فاکتور
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {invoiceToDelete?._isOffline
              ? 'این فاکتور آفلاین است. با تأیید، از حافظه محلی حذف و از صف همگام‌سازی خارج می‌شود.'
              : !isOnline
                ? 'شما آفلاین هستید. این فاکتور برای حذف در صف قرار می‌گیرد و پس از اتصال به اینترنت حذف واقعی انجام می‌شود.'
                : 'آیا از حذف این فاکتور اطمینان دارید؟ این عمل قابل بازگشت نیست.'}
          </DialogDescription>
        </DialogHeader>

        {invoiceToDelete && (
          <div className="space-y-3 mt-2">
            <Card>
              <CardContent className="p-3 space-y-2">
                {[
                  { label: 'شماره فاکتور', value: <span className="font-mono font-bold">{invoiceToDelete.invoiceNumber || invoiceToDelete.number}</span> },
                  { label: 'مشتری', value: invoiceToDelete.customerName || 'فروش عمومی' },
                  { label: 'مبلغ', value: <span className="font-bold text-red-600">{formatCurrency(invoiceToDelete.totalAmount)}</span> },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between text-xs sm:text-sm"><span className="text-gray-500">{item.label}</span><span>{item.value}</span></div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { setDeleteDialogOpen(false); setInvoiceToDelete(null) }} disabled={deleting}>انصراف</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 gap-1.5" onClick={handleDeleteConfirm} disabled={deleting}>
            {deleting ? <><Loader2 className="w-4 h-4 animate-spin" />در حال پردازش...</> : <><Trash2 className="w-4 h-4" />{!isOnline && !invoiceToDelete?._isOffline ? 'ثبت در صف حذف' : 'حذف فاکتور'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // ═══════════════════════════════════════════════════════════════
  // Render: Return Dialog
  // ═══════════════════════════════════════════════════════════════

  const renderReturnDialog = () => {
    const totalReturn = returnItems.reduce((sum, retItem) => {
      const origItem = (invoiceToReturn as any)?.items?.find((it: any) => it.id === retItem.invoiceItemId)
      if (!origItem) return sum
      const ratio = (origItem.quantity || 0) > 0 ? retItem.quantity / origItem.quantity : 0
      return sum + (Number(origItem.lineTotal) || 0) * ratio
    }, 0)
    const hasSelectedItems = returnItems.some(item => item.quantity > 0)

    return (
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="w-[calc(100%-0.5rem)] sm:w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />ثبت برگشتی فاکتور فروش
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {invoiceToReturn ? `فاکتور ${invoiceToReturn.invoiceNumber || invoiceToReturn.number} — ${invoiceToReturn.customerName || 'مشتری'}` : 'انتخاب کالاهای مرجوعی'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {returnItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                <p className="text-sm text-gray-600 text-center">این فاکتور آیتمی برای برگشت ندارد</p>
              </div>
            ) : (
              <>
                <div className="sm:hidden space-y-2">
                  {returnItems.map((retItem, index) => {
                    const origItem = (invoiceToReturn as any)?.items?.find((it: any) => it.id === retItem.invoiceItemId)
                    if (!origItem) return null
                    const ratio = (origItem.quantity || 0) > 0 ? retItem.quantity / origItem.quantity : 0
                    const itemReturnAmount = (Number(origItem.lineTotal) || 0) * ratio
                    return (
                      <Card key={index} className={`border ${retItem.quantity > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-gray-900">{retItem.productName}</span>
                            <span className="text-xs text-gray-500">موجودی: {(origItem.quantity || 0).toLocaleString('fa-IR')}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">مقدار برگشتی</Label>
                              <Input type="number" value={retItem.quantity} onChange={e => handleReturnItemChange(index, 'quantity', e.target.value)} min={0} max={origItem.quantity || 0} className="h-8 text-xs text-center" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">دلیل برگشت</Label>
                              <Input value={retItem.returnReason} onChange={e => handleReturnItemChange(index, 'returnReason', e.target.value)} placeholder="معیوب / ..." className="h-8 text-xs" />
                            </div>
                          </div>
                          {itemReturnAmount > 0 && <div className="text-xs text-amber-700 font-bold text-left">مبلغ برگشتی: {itemReturnAmount.toLocaleString('fa-IR')}</div>}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                <div className="hidden sm:block border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-purple-50 border-b border-gray-200">
                        <tr>
                          <th className="text-right p-3 font-medium">نام کالا</th>
                          <th className="text-center p-3 font-medium">موجودی</th>
                          <th className="text-center p-3 font-medium min-w-[100px]">مقدار برگشتی</th>
                          <th className="text-center p-3 font-medium">قیمت واحد</th>
                          <th className="text-center p-3 font-medium">مبلغ برگشتی</th>
                          <th className="text-right p-3 font-medium">دلیل برگشت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnItems.map((retItem, index) => {
                          const origItem = (invoiceToReturn as any)?.items?.find((it: any) => it.id === retItem.invoiceItemId)
                          if (!origItem) return (
                            <tr key={index} className="border-t border-gray-100 bg-red-50">
                              <td colSpan={6} className="p-3 text-center text-red-600 text-xs">آیتم یافت نشد</td>
                            </tr>
                          )
                          const ratio = (origItem.quantity || 0) > 0 ? retItem.quantity / origItem.quantity : 0
                          const itemReturnAmount = (Number(origItem.lineTotal) || 0) * ratio
                          return (
                            <tr key={index} className={`border-t border-gray-100 hover:bg-gray-50 ${retItem.quantity > 0 ? 'bg-amber-50/30' : ''}`}>
                              <td className="p-3 font-medium text-gray-900">{retItem.productName}</td>
                              <td className="p-3 text-center text-gray-600">{(origItem.quantity || 0).toLocaleString('fa-IR')}</td>
                              <td className="p-3">
                                <Input type="number" value={retItem.quantity} onChange={e => handleReturnItemChange(index, 'quantity', e.target.value)} min={0} max={origItem.quantity || 0} className="h-8 text-xs w-full text-center" placeholder="0" />
                              </td>
                              <td className="p-3 text-center font-mono text-gray-600">{(origItem.unitPrice || 0).toLocaleString('fa-IR')}</td>
                              <td className={`p-3 text-center font-bold font-mono ${itemReturnAmount > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{itemReturnAmount > 0 ? itemReturnAmount.toLocaleString('fa-IR') : '—'}</td>
                              <td className="p-3">
                                <Input value={retItem.returnReason} onChange={e => handleReturnItemChange(index, 'returnReason', e.target.value)} placeholder="معیوب / ..." className="h-8 text-xs" />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">نحوه برگشت وجه</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={returnPaymentType === 'cash' ? 'default' : 'outline'} size="sm" className={`h-9 text-xs ${returnPaymentType === 'cash' ? 'bg-emerald-600' : ''}`} onClick={() => setReturnPaymentType('cash')}>نقدی (بازپرداخت)</Button>
                    <Button type="button" variant={returnPaymentType === 'credit' ? 'default' : 'outline'} size="sm" className={`h-9 text-xs ${returnPaymentType === 'credit' ? 'bg-emerald-600' : ''}`} onClick={() => setReturnPaymentType('credit')}>نسیه (کاهش طلب)</Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">توضیحات (اختیاری)</Label>
                  <Textarea value={returnDescription} onChange={e => setReturnDescription(e.target.value)} placeholder="دلیل کلی برگشت..." className="text-xs min-h-[50px]" />
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-900">مبلغ کل برگشتی:</span>
                    <span className="text-sm font-bold text-amber-700">{totalReturn.toLocaleString('fa-IR')} ریال</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1"
              onClick={() => { setReturnDialogOpen(false); setReturnItems([]); setInvoiceToReturn(null); setReturnDescription('') }}
              disabled={returnSubmitting}>انصراف</Button>
            <Button
              onClick={handleReturnSubmit}
              disabled={returnSubmitting || returnItems.length === 0 || !hasSelectedItems || totalReturn <= 0}
              className="flex-1 bg-amber-600 hover:bg-amber-700 gap-1.5">
              {returnSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />در حال ثبت...</> : <><RotateCcw className="w-4 h-4" />ثبت برگشتی</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <TooltipProvider>
      <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">

        {/* ─── Header ─────────────────────────────────────────── */}
        <header className="bg-white border-b border-gray-200 px-3 sm:px-5 lg:px-6 py-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-xl bg-emerald-600 text-white shrink-0">
                <FileText className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 leading-tight">فاکتورها</h1>
                <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">
                  {formatNumber(totalCount)} فاکتور
                  {isOfflineData && <span className="text-amber-600 mr-1">(کش‌شده)</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {!isOnline && (
                <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50 px-1.5">
                  <WifiOff className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">آفلاین</span>
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={loadInvoices} disabled={loading} className="h-8 sm:h-9 px-2 sm:px-3 gap-1 text-xs sm:text-sm">
                <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">بروزرسانی</span>
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1 h-8 sm:h-9 px-2 sm:px-3 lg:px-4 text-xs sm:text-sm"
                size="sm"
                onClick={() => setCurrentView('pos')}
              >
                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">فاکتور جدید</span>
                <span className="sm:hidden">جدید</span>
              </Button>
            </div>
          </div>
        </header>

        {/* ─── Summary KPI Cards ─────────────────────── */}
        <div className="px-3 sm:px-5 lg:px-6 pt-2 shrink-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
            <KpiCard
              label="کل فاکتورها"
              value={toFaNum(summaryStats.total)}
              sublabel="مورد"
              gradient="bg-gradient-to-br from-gray-500 to-gray-600"
              icon={<div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-white" /></div>}
              onClick={() => setStatusFilter('ALL')}
            />
            <KpiCard
              label="مبلغ کل"
              value={formatCurrencyShort(summaryStats.totalAmount)}
              sublabel="ریال"
              gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
              icon={<div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center"><Wallet className="w-3.5 h-3.5 text-white" /></div>}
            />
            <KpiCard
              label="پرداخت شده"
              value={formatCurrencyShort(summaryStats.paidAmount)}
              sublabel={`${toFaNum(summaryStats.paid)} فاکتور`}
              gradient="bg-gradient-to-br from-sky-500 to-sky-600"
              icon={<div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center"><CheckCircle2 className="w-3.5 h-3.5 text-white" /></div>}
              onClick={() => setStatusFilter('PAID')}
            />
            <KpiCard
              label="در انتظار"
              value={formatCurrencyShort(summaryStats.totalAmount - summaryStats.paidAmount)}
              sublabel={`${toFaNum(summaryStats.pending + summaryStats.partial)} فاکتور`}
              gradient="bg-gradient-to-br from-amber-500 to-amber-600"
              icon={<div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center"><CalendarDays className="w-3.5 h-3.5 text-white" /></div>}
              onClick={() => setStatusFilter('PENDING')}
            />
          </div>
        </div>

        {/* ─── Search + Filter ComboBoxes ─────────────── */}
        <div className="px-3 sm:px-5 lg:px-6 pt-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
              <Input
                placeholder="جستجو..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9 pl-8 h-9 text-xs sm:text-sm bg-white"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilterKey)}>
              <SelectTrigger className="w-[100px] sm:w-[130px] h-9 text-[10px] sm:text-xs shrink-0 bg-white">
                <div className="flex items-center gap-1">
                  <Filter className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 shrink-0" />
                  <SelectValue placeholder="وضعیت" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه</SelectItem>
                <SelectItem value="PAID">پرداخت شده</SelectItem>
                <SelectItem value="PENDING">در انتظار</SelectItem>
                <SelectItem value="PARTIAL">پرداخت جزئی</SelectItem>
                <SelectItem value="DRAFT">پیش‌نویس</SelectItem>
                <SelectItem value="CANCELLED">لغو شده</SelectItem>
              </SelectContent>
            </Select>

            <Select value={paymentTypeFilter} onValueChange={(v) => setPaymentTypeFilter(v as PaymentTypeFilterKey)}>
              <SelectTrigger className="w-[100px] sm:w-[130px] h-9 text-[10px] sm:text-xs shrink-0 bg-white">
                <div className="flex items-center gap-1">
                  <CreditCard className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 shrink-0" />
                  <SelectValue placeholder="روش پرداخت" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه روش‌ها</SelectItem>
                <SelectItem value="cash">نقدی</SelectItem>
                <SelectItem value="card">کارتخوان</SelectItem>
                <SelectItem value="credit">نسیه</SelectItem>
                <SelectItem value="installment">قسطی</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ─── Content ────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-3 sm:px-5 lg:px-6 py-3">
          {(!isOnline || isOfflineData) && (
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg mb-3 text-xs border ${!isOnline ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
              <WifiOff className={`w-4 h-4 shrink-0 ${!isOnline ? 'text-amber-600' : 'text-blue-500'}`} />
              <div className="flex-1">
                {!isOnline ? (
                  <><span className="font-bold">حالت آفلاین — </span>{invoices.length > 0 ? `نمایش ${formatNumber(invoices.length)} فاکتور از حافظه دستگاه` : 'اتصال به اینترنت برقرار نیست'}</>
                ) : (
                  <><span className="font-bold">داده‌های ذخیره‌شده — </span>نمایش فاکتورهای کش‌شده</>
                )}
              </div>
            </div>
          )}

          {loading && invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
              <p className="text-sm text-gray-500">در حال بارگذاری فاکتورها...</p>
            </div>
          )}

          {error && invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadInvoices} className="gap-1.5">
                <RefreshCw className="w-3 h-3" />تلاش مجدد
              </Button>
            </div>
          )}

          {!loading && !error && filteredInvoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <FileText className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-1">فاکتوری یافت نشد</p>
              <p className="text-xs text-gray-400">{search ? 'عبارت جستجو را تغییر دهید' : 'اولین فاکتور خود را ثبت کنید'}</p>
            </div>
          )}

          {!loading && filteredInvoices.length > 0 && (
            <>
              <div className="md:hidden space-y-2">
                {filteredInvoices.map((inv) => (
                  <MobileInvoiceCard
                    key={inv.id} inv={inv} planFeatures={planFeatures}
                    onView={handleViewDetail} onPay={handlePayClick}
                    onReturn={handleReturnClick} onDelete={handleDeleteClick}
                    onToast={(msg) => toast({ title: 'دسترسی محدود', description: msg })}
                  />
                ))}
              </div>

              <div className="hidden md:block">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto" dir="rtl">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/80">
                            <TableHead className="text-right text-xs font-semibold">شماره</TableHead>
                            <TableHead className="text-right text-xs font-semibold">مشتری</TableHead>
                            <TableHead className="text-xs font-semibold text-right">مبلغ کل</TableHead>
                            <TableHead className="text-xs font-semibold text-right hidden lg:table-cell">پرداخت شده</TableHead>
                            <TableHead className="text-right text-xs font-semibold hidden xl:table-cell">نوع پرداخت</TableHead>
                            <TableHead className="text-right text-xs font-semibold">وضعیت</TableHead>
                            <TableHead className="text-right text-xs font-semibold hidden lg:table-cell">تاریخ</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-center">عملیات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredInvoices.map((inv) => {
                            const invNumber = toFaNum(inv.invoiceNumber || inv.number || '---')
                            const isPaid = (inv.paymentStatus || inv.status)?.toUpperCase() === 'PAID'
                            const isCancelled = (inv.paymentStatus || inv.status)?.toUpperCase() === 'CANCELLED'
                            const isReturn = (inv as any).invoiceType === 'sale_return' || (inv as any).invoiceType === 'purchase_return'
                            const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)

                            return (
                              <TableRow
                                key={inv.id}
                                className={`cursor-pointer hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-50' : ''} ${inv._isOffline ? (inv._offlineAction === 'delete' ? 'bg-red-50/20 border-red-200' : 'bg-amber-50/20 border-amber-200') : ''}`}
                                onClick={() => handleViewDetail(inv)}
                              >
                                <TableCell className="text-xs font-mono font-medium">
                                  <div className="flex items-center gap-1">
                                    <span className={inv._offlineAction === 'delete' ? 'text-red-600 line-through' : ''}>{invNumber}</span>
                                    {inv._isOffline && (
                                      <Badge variant="outline" className={`text-[9px] px-1 h-4 ${inv._offlineAction === 'delete' ? 'border-red-300 text-red-600' : 'border-amber-300 text-amber-600'}`}>
                                        {inv._offlineAction === 'delete' ? 'حذف در صف' : 'آفلاین'}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs max-w-[120px] lg:max-w-none">
                                  <span className="truncate block">{inv.customerName || <span className="text-gray-400">فروش عمومی</span>}</span>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono">
                                  {formatNumber(inv.totalAmount)} <span className="text-[10px] text-gray-500 font-normal">ریال</span>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono hidden lg:table-cell">
                                  <span className={isPaid ? 'text-emerald-600' : 'text-amber-600'}>
                                    {formatNumber(inv.paidAmount)} <span className="text-[10px] text-gray-500 font-normal">ریال</span>
                                  </span>
                                </TableCell>
                          <TableCell className="hidden xl:table-cell">
  <div className="flex items-center gap-1 flex-wrap">
    {getPaymentTypeBadge(inv.paymentType)}
    {inv.paymentType?.toLowerCase() === 'check' && getCheckStatusBadge((inv as any).checkStatus)}
  </div>
</TableCell>
                                <TableCell>{getStatusBadge(inv.status, inv.paymentStatus, (inv as any).invoiceType)}</TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">{formatDateShort(inv.createdAt)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center gap-0.5" onClick={e => e.stopPropagation()}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-sky-50 hover:text-sky-600" onClick={() => handleViewDetail(inv)}>
                                          <Eye className="w-3.5 h-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">مشاهده جزئیات</TooltipContent>
                                    </Tooltip>

                                    {(inv.paymentType || '').toLowerCase() === 'credit' && !isPaid && !isCancelled && remaining > 0 && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-600" onClick={() => handlePayClick(inv)}>
                                            <Wallet className="w-3.5 h-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">ثبت پرداخت نسیه</TooltipContent>
                                      </Tooltip>
                                    )}

                                    {(inv as any).invoiceType !== 'service' && !isReturn && !isCancelled && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-amber-50 hover:text-amber-600" onClick={() => handleReturnClick(inv)}>
                                            <RotateCcw className="w-3.5 h-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">ثبت برگشتی</TooltipContent>
                                      </Tooltip>
                                    )}

                                    {(planFeatures.canDeleteInvoice || isReturn) ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                                            onClick={() => handleDeleteClick(inv)}
                                            disabled={(isPaid && !isReturn) || isCancelled || inv._offlineAction === 'delete'}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">حذف فاکتور</TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button className="flex items-center justify-center h-7 w-7 rounded-md text-gray-300"
                                            onClick={() => toast({ title: 'دسترسی محدود', description: 'حذف فاکتور فقط در پلن حرفه‌ای در دسترس است' })}>
                                            <Lock className="w-3.5 h-3.5" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">ارتقا پلن</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-gray-100 gap-2">
                        <p className="text-xs text-gray-500 order-2 sm:order-1">
                          صفحه {formatNumber(page)} از {formatNumber(totalPages)} — {formatNumber(totalCount)} فاکتور
                        </p>
                        <div className="flex items-center gap-1 order-1 sm:order-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                            <ChevronRight className="w-3 h-3" />قبلی
                          </Button>
                          <span className="text-xs text-gray-400 px-1">{page} / {totalPages}</span>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                            بعدی<ChevronRight className="w-3 h-3 rotate-180" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {totalPages > 1 && (
                <div className="md:hidden flex items-center justify-between mt-3 px-1">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft className="w-3 h-3" />قبلی
                  </Button>
                  <span className="text-xs text-gray-500">{formatNumber(page)} از {formatNumber(totalPages)}</span>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                    بعدی<ChevronLeft className="w-3 h-3 rotate-180" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {renderDetailDialog()}
        {renderPaymentDialog()}
        {renderReceivePaymentDialog()}
        {renderInstallmentPayDialog()}
        {renderDeleteDialog()}
        {renderReturnDialog()}

      </div>
    </TooltipProvider>
  )
}