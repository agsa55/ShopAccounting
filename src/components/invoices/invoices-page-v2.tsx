'use client'

// ============================================================================
// src/components/invoices/invoices-page-v2.tsx — Invoices Page with Plan Gating (v5.1.3 ★★★ Phase 4 — Universal Receive Payment)
// ShopAccounting v25.0 — Multi-tenant SaaS Platform
// ============================================================================
// ★ v25: Plan-based feature gating for delete button
//   ★ canDeleteInvoice → true: show delete button
//   ★ canDeleteInvoice → false: show lock icon with "ارتقا پلن" tooltip
// ★ Fetches invoices from /api/invoices
// ★ Status filter tabs, detail dialog, delete dialog
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { OnlinePaymentButton } from '@/components/invoices/online-payment-button'
import {
  FileText,
  Search,
  Trash2,
  Eye,
  RefreshCw,
  Loader2,
  Lock,
  Crown,
  ChevronLeft,
  ShoppingCart,
  CreditCard,
  Banknote,
  CalendarDays,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  Calendar as CalendarIcon,
  Info,
  Wrench,        // ★★★ v8.7: فاکتور تعمیرات و خدمات
  RotateCcw,     // ★★★ v8.7: برگشتی فاکتور
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'  // ★★★ v8.7
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { useToast } from '@/hooks/use-toast'
// ★★★ v3.32: import دکمه PDF فاکتور
import { InvoicePDFButton } from '@/components/invoices/invoice-pdf-button'
// ★★★ v3.36: import دکمه لینک پورتال مشتری
import { PortalLinkButton } from '@/components/invoices/portal-link-button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ═══════════════════════════════════════════════════════════════
// ★★★ Types — سازگار با خروجی API واقعی ★★★
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
  // ★★★ v3.36: توکن پورتال مشتری برای ساخت لینک
  customerPortalToken?: string | null
}

// ★★★ v3.36.5: تایپ برای InstallmentSchedule (مورد استفاده در UI پرداخت اقساط)
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
// ★★★ Helper Functions ★★★
// ═══════════════════════════════════════════════════════════════

function formatCurrency(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '۰ تومان'
  return `${num.toLocaleString('fa-IR')} تومان`
}

function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '۰'
  return num.toLocaleString('fa-IR')
}

// ★★★ v3.4: تبدیل میلادی به شمسی (الگوریتم استاندارد jalaali-js) ★★★
function div(a: number, b: number): number { return Math.floor(a / b) }
function mod(a: number, b: number): number { return a - Math.floor(a / b) * b }

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days = 365 * gy
    + div(gy2 + 3, 4)
    - div(gy2 + 99, 100)
    + div(gy2 + 399, 400)
    - 80
    + gd
    + g_d_m[gm - 1]
  jy += 33 * div(days, 12053)
  days = mod(days, 12053)
  jy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) {
    jy += div(days - 1, 365)
    days = mod(days - 1, 365)
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30))
  return [jy, jm, jd]
}

// ★ تبدیل اعداد انگلیسی به فارسی
function toFaNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
]

// ★ تاریخ کامل با ساعت
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '---'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '---'
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')} - ${toFaNum(hh)}:${toFaNum(mm)}`
  } catch {
    return '---'
  }
}

// ★★★ v3.4: تاریخ کوتاه شمسی — با سال ۴ رقمی کامل ★★★
function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '---'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '---'
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
  } catch {
    return '---'
  }
}

// ★ تاریخ بلند شمسی (مثلاً: ۳۱ خرداد ۱۴۰۵)
function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '---'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '---'
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
    return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}`
  } catch {
    return '---'
  }
}

function getStatusBadge(status: string, paymentStatus?: string, invoiceType?: string) {
  // ★★★ v9.9.2: نمایش وضعیت فاکتور برگشتی
  if (invoiceType === 'sale_return') {
    return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">برگشتی فروش</Badge>
  }
  if (invoiceType === 'purchase_return') {
    return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">برگشتی خرید</Badge>
  }
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

// ═══════════════════════════════════════════════════════════════
// ★★★ Status Filter Tabs ★★★
// ═══════════════════════════════════════════════════════════════

const STATUS_TABS = [
  { key: 'ALL', label: 'همه' },
  { key: 'PAID', label: 'پرداخت شده' },
  { key: 'PENDING', label: 'در انتظار' },
  { key: 'PARTIAL', label: 'پرداخت جزئی' },
  { key: 'DRAFT', label: 'پیش‌نویس' },
  { key: 'CANCELLED', label: 'لغو شده' },
] as const

type StatusTabKey = typeof STATUS_TABS[number]['key']

// ═══════════════════════════════════════════════════════════════
// ★★★ v3.4: ShamsiDatePicker — تقویم شمسی برای انتخاب تاریخ پرداخت ★★★
// ═══════════════════════════════════════════════════════════════

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days = 365 * jy
    + div(jy, 33) * 8
    + div(mod(jy, 33) + 3, 4)
    + 78
    + jd
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
  if (days > 365) {
    gy += div(days - 1, 365)
    days = mod(days - 1, 365)
  }
  let gd = days + 1
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm: number
  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm]
    if (gd <= v) break
    gd -= v
  }
  return [gy, gm, gd]
}

function isJalaliLeapYear(jy: number): boolean {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]
  let jump = 0
  let n = 0
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
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
  popupBg: '#faf7ff',
  popupBgSolid: '#ffffff',
  headerBg: '#ede9fe',
  textPrimary: '#4c1d95',
  textSecondary: '#7c3aed',
  textMuted: '#a78bfa',
  textOnAccent: '#ffffff',
  border: '#e9d5ff',
  accent: '#7c3aed',
  accentLight: '#ede9fe',
  accentSoft: '#ddd6fe',
  todayBorder: '#a78bfa',
  todayText: '#6d28d9',
}

const navBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  color: DATE_PICKER_COLORS.textSecondary,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'background-color 0.1s',
  lineHeight: 1,
}

interface ShamsiDatePickerProps {
  value: string  // ISO date string (yyyy-mm-dd) یا خالی
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
        setViewYear(jy)
        setViewMonth(jm)
      }
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }
  const goNextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }
  const goPrevYear = () => setViewYear((y) => y - 1)
  const goNextYear = () => setViewYear((y) => y + 1)

  const pickToday = () => {
    onChange(todayJalali.iso)
    setOpen(false)
  }

  const handleDayClick = (jd: number) => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, jd)
    const isoDate = `${String(gy).padStart(4, '0')}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
    onChange(isoDate)
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: 36,
          padding: '0 10px',
          borderRadius: 6,
          border: `1px solid ${DATE_PICKER_COLORS.border}`,
          backgroundColor: DATE_PICKER_COLORS.popupBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          cursor: 'pointer',
          fontSize: 12,
          transition: 'border-color 0.15s, background-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = DATE_PICKER_COLORS.accent; e.currentTarget.style.backgroundColor = DATE_PICKER_COLORS.accentLight }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = DATE_PICKER_COLORS.border; e.currentTarget.style.backgroundColor = DATE_PICKER_COLORS.popupBg }}
      >
        <CalendarIcon style={{ width: 14, height: 14, color: DATE_PICKER_COLORS.textMuted, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: 'right',
            fontFamily: 'monospace',
            color: displayText ? DATE_PICKER_COLORS.textPrimary : DATE_PICKER_COLORS.textMuted,
            fontSize: 12,
          }}
          dir="ltr"
        >
          {displayText || placeholder}
        </span>
      </button>

      {open && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 40,
            }}
            onClick={() => setOpen(false)}
          />
          <div
            dir="rtl"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 3,
              zIndex: 60,
              width: 220,
              backgroundColor: DATE_PICKER_COLORS.popupBgSolid,
              border: `1px solid ${DATE_PICKER_COLORS.border}`,
              borderRadius: 8,
              boxShadow: '0 8px 24px -4px rgba(124, 58, 237, 0.18), 0 4px 8px -2px rgba(124, 58, 237, 0.1)',
              padding: 7,
            }}
          >
            <div style={{
              background: `linear-gradient(135deg, ${DATE_PICKER_COLORS.headerBg} 0%, ${DATE_PICKER_COLORS.accentSoft} 100%)`,
              margin: -7,
              marginBottom: 5,
              padding: '5px 7px',
              borderRadius: '8px 8px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
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
                <div key={i} style={{
                  textAlign: 'center',
                  fontSize: 9,
                  fontWeight: 600,
                  color: i === 6 ? DATE_PICKER_COLORS.textSecondary : DATE_PICKER_COLORS.textMuted,
                  padding: '1px 0',
                }}>{w}</div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 22 }} />
                const isSelected = selectedJalali &&
                  selectedJalali.jy === viewYear &&
                  selectedJalali.jm === viewMonth &&
                  selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
                const isFriday = i % 7 === 6
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDayClick(d)}
                    style={{
                      height: 22,
                      borderRadius: 4,
                      fontSize: 10,
                      border: isSelected ? 'none' : (isToday ? `1px solid ${DATE_PICKER_COLORS.todayBorder}` : 'none'),
                      backgroundColor: isSelected
                        ? DATE_PICKER_COLORS.accent
                        : (isToday ? DATE_PICKER_COLORS.accentLight : 'transparent'),
                      color: isSelected
                        ? DATE_PICKER_COLORS.textOnAccent
                        : (isToday ? DATE_PICKER_COLORS.todayText : (isFriday ? DATE_PICKER_COLORS.textSecondary : DATE_PICKER_COLORS.textPrimary)),
                      cursor: 'pointer',
                      fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)),
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>

            <div style={{
              marginTop: 5,
              paddingTop: 4,
              borderTop: `1px dashed ${DATE_PICKER_COLORS.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button
                type="button"
                onClick={pickToday}
                style={{
                  fontSize: 9,
                  color: DATE_PICKER_COLORS.accent,
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 9,
                  color: DATE_PICKER_COLORS.textMuted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
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
// ★★★ Main Component ★★★
// ═══════════════════════════════════════════════════════════════

export default function InvoicesPage() {
  // ─── State ────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<StatusTabKey>('ALL')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const router = useRouter()
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // ★★★ v3.3: State for Credit Payment Dialog ★★★
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [invoiceToPay, setInvoiceToPay] = useState<Invoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentRef, setPaymentRef] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  // ★★★ v3.4: تاریخ پرداخت (ISO yyyy-mm-dd) — پیش‌فرض امروز ★★★
  const [paymentDate, setPaymentDate] = useState('')

  // ★★★ v3.36.5: State for Installment Payment Dialog ★★★
  const [installmentPayDialogOpen, setInstallmentPayDialogOpen] = useState(false)
  const [installmentToPay, setInstallmentToPay] = useState<InstallmentScheduleItem | null>(null)
  const [installmentPayInvoice, setInstallmentPayInvoice] = useState<Invoice | null>(null)
  const [installmentPayAmount, setInstallmentPayAmount] = useState('')
  const [installmentPayMethod, setInstallmentPayMethod] = useState('cash')
  const [installmentPayRef, setInstallmentPayRef] = useState('')
  const [installmentPayDate, setInstallmentPayDate] = useState('')
  const [installmentPayNotes, setInstallmentPayNotes] = useState('')
  // ★★★ v5.1.3: state برای مودال دریافت وجه جهانی (کار در همه پلن‌ها)
  const [receivePayDialogOpen, setReceivePayDialogOpen] = useState(false)
  const [receivePayInvoice, setReceivePayInvoice] = useState<Invoice | null>(null)
  const [receivePayInstallment, setReceivePayInstallment] = useState<InstallmentScheduleItem | null>(null)
  const [receivePayAmount, setReceivePayAmount] = useState('')
  const [receivePayMethod, setReceivePayMethod] = useState<'cash' | 'card'>('cash')
  const [receivePayRef, setReceivePayRef] = useState('')
  const [receivePayNotes, setReceivePayNotes] = useState('')
  const [receivePaySubmitting, setReceivePaySubmitting] = useState(false)

  // ★★★ v8.7: State برای فاکتور تعمیرات و خدمات ★★★
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceSubmitting, setServiceSubmitting] = useState(false)
  const [serviceForm, setServiceForm] = useState({
    customerId: '',
    serviceDevice: '',
    serviceWarranty: false,
    paymentType: 'cash',
    description: '',
  })
  const [serviceItems, setServiceItems] = useState<Array<{
    serviceName: string
    description: string
    quantity: number
    unitLabel: string
    unitPrice: number
    discountAmount: number
    taxAmount: number
  }>>([{ serviceName: '', description: '', quantity: 1, unitLabel: 'عدد', unitPrice: 0, discountAmount: 0, taxAmount: 0 }])

  // ★★★ v8.7: State برای برگشتی فاکتور فروش ★★★
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [returnSubmitting, setReturnSubmitting] = useState(false)
  const [invoiceToReturn, setInvoiceToReturn] = useState<Invoice | null>(null)
  const [returnItems, setReturnItems] = useState<Array<{
    invoiceItemId: string
    productName: string
    maxQuantity: number
    quantity: number
    returnReason: string
  }>>([])
  const [returnPaymentType, setReturnPaymentType] = useState<'cash' | 'credit'>('cash')
  const [returnDescription, setReturnDescription] = useState('')
  const [submittingInstallmentPay, setSubmittingInstallmentPay] = useState(false)

  const { toast } = useToast()
  const tenantId = useAppStore((s) => s.tenantId)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v25: Plan Feature Gating ★★★
  // ═══════════════════════════════════════════════════════════════

  const planName = useAppStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ بارگذاری داده‌ها از API ★★★
  // ═══════════════════════════════════════════════════════════════

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '50')
      if (activeTab !== 'ALL') {
        params.set('status', activeTab)
      }

      const res = await fetch(`/api/invoices?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`خطا در دریافت اطلاعات: ${res.status}`)
      }

      const result = await res.json()

      if (result.success) {
        setInvoices(result.data || [])
        setTotalPages(result.pagination?.totalPages || 1)
        setTotalCount(result.pagination?.total || 0)
      } else {
        throw new Error(result.error || 'خطای ناشناخته')
      }
    } catch (err: any) {
      console.error('[InvoicesPage] Load error:', err)
      setError(err.message || 'خطا در بارگذاری اطلاعات')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  // ★ بارگذاری اولیه
  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  // ★ بروزرسانی خودکار هر ۶۰ ثانیه
  useEffect(() => {
    const interval = setInterval(() => {
      loadInvoices()
    }, 60000)
    return () => clearInterval(interval)
  }, [loadInvoices])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ فیلتر و جستجو ★★★
  // ═══════════════════════════════════════════════════════════════

  const filteredInvoices = invoices.filter((inv) => {
    if (!search) return true
    const q = search.toLowerCase()
    const number = (inv.invoiceNumber || inv.number || '').toLowerCase()
    const customer = (inv.customerName || '').toLowerCase()
    return number.includes(q) || customer.includes(q)
  })

  // ★ آمار خلاصه
  const summaryStats = useMemo(() => {
    const total = invoices.length
    // ★★★ v3.2: استفاده از paymentStatus برای تب‌ها
    const getEffectiveStatus = (inv: any) => (inv.paymentStatus || inv.status || '').toUpperCase()
    const paid = invoices.filter((i) => getEffectiveStatus(i) === 'PAID').length
    const pending = invoices.filter((i) => getEffectiveStatus(i) === 'PENDING').length
    const partial = invoices.filter((i) => ['PARTIAL', 'PARTIALLYPAID'].includes(getEffectiveStatus(i))).length
    const totalAmount = invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0)
    const paidAmount = invoices.reduce((sum, i) => sum + (i.paidAmount || 0), 0)
    return { total, paid, pending, partial, totalAmount, paidAmount }
  }, [invoices])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v3.3: ثبت پرداخت فاکتور نسیه ★★★
  // ═══════════════════════════════════════════════════════════════

  const handlePayClick = (invoice: Invoice) => {
    // ★ بررسی پلن
    if (!planFeatures.canAccessCredit) {
      toast({
        title: 'محدودیت پلن',
        description: 'ثبت پرداخت نسیه فقط در پلن حرفه‌ای و سازمانی در دسترس است',
        variant: 'destructive',
      })
      return
    }

    // ★ فقط فاکتورهای نسیه
    const paymentType = (invoice.paymentType || '').toLowerCase()
    if (paymentType !== 'credit') {
      toast({
        title: 'خطا',
        description: 'ثبت پرداخت فقط برای فاکتورهای نسیه مجاز است',
        variant: 'destructive',
      })
      return
    }

    // ★ بررسی وضعیت
    const status = (invoice.paymentStatus || invoice.status || '').toUpperCase()
    if (status === 'PAID') {
      toast({
        title: 'اطلاع',
        description: 'این فاکتور قبلاً به طور کامل پرداخت شده است',
      })
      return
    }

    setInvoiceToPay(invoice)
    // ★ مقدار پیش‌فرض: مبلغ باقیمانده
    const remaining = (invoice.totalAmount || 0) - (invoice.paidAmount || 0)
    setPaymentAmount(String(remaining))
    setPaymentMethod('cash')
    setPaymentRef('')
    // ★★★ v3.4: پیش‌فرض تاریخ پرداخت = امروز
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentDialogOpen(true)
  }

  const handlePayConfirm = async () => {
    if (!invoiceToPay) return

    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) {
      toast({
        title: 'خطا',
        description: 'مبلغ پرداخت باید بزرگتر از صفر باشد',
        variant: 'destructive',
      })
      return
    }

    const remaining = (invoiceToPay.totalAmount || 0) - (invoiceToPay.paidAmount || 0)
    if (amount > remaining + 1) {
      toast({
        title: 'خطا',
        description: `مبلغ پرداخت (${amount.toLocaleString('fa-IR')} تومان) بیش از مبلغ باقیمانده (${remaining.toLocaleString('fa-IR')} تومان) است`,
        variant: 'destructive',
      })
      return
    }

    setSubmittingPayment(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/invoices/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          invoiceId: invoiceToPay.id,
          amount: amount,
          paymentType: paymentMethod,
          paymentRef: paymentRef || undefined,
          // ★★★ v3.4: ارسال تاریخ پرداخت انتخاب‌شده
          paidAt: paymentDate || undefined,
        }),
      })

      const result = await res.json()

      if (result.success) {
        toast({
          title: 'پرداخت ثبت شد',
          description: result.message || 'پرداخت نسیه با موفقیت ثبت شد',
        })
        setPaymentDialogOpen(false)
        setInvoiceToPay(null)
        setPaymentAmount('')
        setPaymentRef('')
        setPaymentDate('')
        // ★ بروزرسانی لیست فاکتورها
        await loadInvoices()
      } else {
        toast({
          title: 'خطا در ثبت پرداخت',
          description: result.error || 'خطای ناشناخته',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: 'خطا در ارتباط با سرور',
        variant: 'destructive',
      })
    } finally {
      setSubmittingPayment(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v3.36.5: ثبت پرداخت حضوری برای یک قسط خاص ★★★
  // ═══════════════════════════════════════════════════════════════

  const handleInstallmentPayClick = (invoice: Invoice, schedule: InstallmentScheduleItem) => {
    // ★ بررسی پلن
    if (!planFeatures.canAccessCredit) {
      toast({
        title: 'محدودیت پلن',
        description: 'ثبت پرداخت قسط فقط در پلن حرفه‌ای و سازمانی در دسترس است',
        variant: 'destructive',
      })
      return
    }

    // ★ بررسی وضعیت قسط
    const status = (schedule.status || '').toLowerCase()
    if (status === 'paid' || status === 'completed') {
      toast({
        title: 'اطلاع',
        description: 'این قسط قبلاً به طور کامل پرداخت شده است',
      })
      return
    }

    setInstallmentPayInvoice(invoice)
    setInstallmentToPay(schedule)
    // ★ پیش‌فرض: مبلغ باقی‌مانده قسط
    const remaining = (schedule.amount || 0) - (schedule.paidAmount || 0)
    setInstallmentPayAmount(String(remaining))
    setInstallmentPayMethod('cash')
    setInstallmentPayRef('')
    setInstallmentPayDate(new Date().toISOString().split('T')[0])
    setInstallmentPayNotes('')
    setInstallmentPayDialogOpen(true)
  }

  const handleInstallmentPayConfirm = async () => {
    if (!installmentToPay || !installmentPayInvoice) return

    const amount = Number(installmentPayAmount)
    if (!amount || amount <= 0) {
      toast({
        title: 'خطا',
        description: 'مبلغ پرداخت باید بزرگتر از صفر باشد',
        variant: 'destructive',
      })
      return
    }

    const remaining = (installmentToPay.amount || 0) - (installmentToPay.paidAmount || 0)
    if (amount > remaining + 1) {
      toast({
        title: 'خطا',
        description: `مبلغ پرداخت بیش از مبلغ باقی‌مانده قسط است (${remaining.toLocaleString('fa-IR')} ریال)`,
        variant: 'destructive',
      })
      return
    }

    if (!installmentPayDate) {
      toast({
        title: 'خطا',
        description: 'تاریخ پرداخت الزامی است',
        variant: 'destructive',
      })
      return
    }

    setSubmittingInstallmentPay(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/installment-schedules/${installmentToPay.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          amount,
          paymentType: installmentPayMethod,
          paymentRef: installmentPayRef || undefined,
          paidAt: installmentPayDate,
          notes: installmentPayNotes || undefined,
        }),
      })

      const result = await res.json()

      if (result.success) {
        toast({
          title: 'پرداخت ثبت شد',
          description: result.message || `قسط ${installmentToPay.installmentNumber} با موفقیت پرداخت شد`,
        })
        setInstallmentPayDialogOpen(false)
        setInstallmentToPay(null)
        setInstallmentPayInvoice(null)
        setInstallmentPayAmount('')
        setInstallmentPayRef('')
        setInstallmentPayNotes('')
        setInstallmentPayDate('')
        // ★ بستن مودال جزئیات هم اگر باز است
        setDetailOpen(false)
        // ★ بروزرسانی لیست فاکتورها
        await loadInvoices()
      } else {
        toast({
          title: 'خطا در ثبت پرداخت',
          description: result.error || 'خطای ناشناخته',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: 'خطا در ارتباط با سرور',
        variant: 'destructive',
      })
    } finally {
      setSubmittingInstallmentPay(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ نمایش جزئیات فاکتور ★★★
  // ═══════════════════════════════════════════════════════════════

  const handleViewDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setDetailOpen(true)
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ حذف فاکتور ★★★
  // ═══════════════════════════════════════════════════════════════

  const handleDeleteClick = (invoice: Invoice) => {
    // ★★★ v9.9.2: فاکتورهای برگشتی در همه پلن‌ها قابل حذف هستند
    const isReturn = (invoice as any).invoiceType === 'sale_return' || (invoice as any).invoiceType === 'purchase_return'
    if (!planFeatures.canDeleteInvoice && !isReturn) return
    setInvoiceToDelete(invoice)
    setDeleteDialogOpen(true)
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v8.7: فاکتور تعمیرات و خدمات ★★★
  // ═══════════════════════════════════════════════════════════════

  const handleAddServiceItem = () => {
    setServiceItems([...serviceItems, {
      serviceName: '', description: '', quantity: 1, unitLabel: 'عدد',
      unitPrice: 0, discountAmount: 0, taxAmount: 0,
    }])
  }

  const handleRemoveServiceItem = (index: number) => {
    if (serviceItems.length === 1) return
    setServiceItems(serviceItems.filter((_, i) => i !== index))
  }

  const handleServiceItemChange = (index: number, field: string, value: any) => {
    const updated = [...serviceItems]
    ;(updated[index] as any)[field] = value
    setServiceItems(updated)
  }

  const handleServiceSubmit = async () => {
    const validItems = serviceItems.filter(i => i.serviceName.trim().length >= 2)
    if (validItems.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک خدمت با نام معتبر الزامی است', variant: 'destructive' })
      return
    }
    const totalAmount = validItems.reduce((sum, i) =>
      sum + (i.quantity * i.unitPrice - i.discountAmount + i.taxAmount), 0)
    if (totalAmount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ کل فاکتور باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }
    if (serviceForm.paymentType === 'credit' && !serviceForm.customerId) {
      toast({ title: 'خطا', description: 'برای فروش نسیه، انتخاب مشتری الزامی است', variant: 'destructive' })
      return
    }

    setServiceSubmitting(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/invoices/service', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          customerId: serviceForm.customerId || undefined,
          serviceDevice: serviceForm.serviceDevice || undefined,
          serviceWarranty: serviceForm.serviceWarranty,
          paymentType: serviceForm.paymentType,
          description: serviceForm.description || undefined,
          items: validItems,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'فاکتور صادر شد ✓', description: data.message })
        setServiceDialogOpen(false)
        setServiceForm({ customerId: '', serviceDevice: '', serviceWarranty: false, paymentType: 'cash', description: '' })
        setServiceItems([{ serviceName: '', description: '', quantity: 1, unitLabel: 'عدد', unitPrice: 0, discountAmount: 0, taxAmount: 0 }])
        loadInvoices()
      } else {
        toast({ title: 'خطا', description: data.error || 'صدور فاکتور ناموفق بود', variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    } finally {
      setServiceSubmitting(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v8.7: برگشتی فاکتور فروش ★★★
  // ═══════════════════════════════════════════════════════════════

  const handleReturnClick = async (invoice: Invoice) => {
    if ((invoice as any).invoiceType === 'service') {
      toast({ title: 'خطا', description: 'فاکتور خدماتی قابل برگشت نیست', variant: 'destructive' })
      return
    }
    if ((invoice as any).invoiceType === 'sale_return') {
      toast({ title: 'خطا', description: 'این فاکتور خودش برگشتی است', variant: 'destructive' })
      return
    }

    setInvoiceToReturn(invoice)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      if (data.success && data.data?.items) {
        setReturnItems(data.data.items.map((item: any) => ({
          invoiceItemId: item.id,
          productName: item.productName,
          maxQuantity: item.quantity,
          quantity: 0,
          returnReason: '',
        })))
      }
    } catch (err) {
      toast({ title: 'خطا', description: 'بارگذاری آیتم‌های فاکتور ناموفق بود', variant: 'destructive' })
    }
    setReturnDialogOpen(true)
  }

  const handleReturnItemChange = (index: number, field: string, value: any) => {
    const updated = [...returnItems]
    if (field === 'quantity') {
      const num = Number(value)
      updated[index].quantity = Math.min(Math.max(0, num), updated[index].maxQuantity)
    } else {
      ;(updated[index] as any)[field] = value
    }
    setReturnItems(updated)
  }

  const handleReturnSubmit = async () => {
    if (!invoiceToReturn) return
    const selectedItems = returnItems.filter(i => i.quantity > 0)
    if (selectedItems.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک آیتم باید برای برگشت انتخاب شود', variant: 'destructive' })
      return
    }

    setReturnSubmitting(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/invoices/${invoiceToReturn.id}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: selectedItems.map(i => ({
            invoiceItemId: i.invoiceItemId,
            quantity: i.quantity,
            returnReason: i.returnReason || undefined,
          })),
          paymentType: returnPaymentType,
          description: returnDescription || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'برگشتی ثبت شد ✓', description: data.message })
        setReturnDialogOpen(false)
        setReturnDescription('')
        setReturnItems([])
        setInvoiceToReturn(null)
        loadInvoices()
      } else {
        toast({ title: 'خطا', description: data.error || 'ثبت برگشتی ناموفق بود', variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    } finally {
      setReturnSubmitting(false)
    }
  }


  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return
    setDeleting(true)

    try {
      const res = await fetch(`/api/invoices?id=${invoiceToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await res.json()

      if (result.success) {
        toast({
          title: 'حذف موفق',
          description: `فاکتور ${invoiceToDelete.invoiceNumber || invoiceToDelete.number} حذف شد`,
        })
        await loadInvoices()
      } else {
        toast({
          title: 'خطا در حذف',
          description: result.error || 'خطای ناشناخته',
        })
      }
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: 'خطا در ارتباط با سرور',
      })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setInvoiceToDelete(null)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Render — Detail Dialog ★★★
  // ═══════════════════════════════════════════════════════════════


  // ★★★ v5.1.3: دریافت وجه جهادی (کار در همه پلن‌ها) ★★★
  // این تابع بدون بررسی canAccessCredit کار می‌کند — برای دریافت مبالغ
  // فاکتورهای نسیه/قسطی که از پلن بالاتر به ساده منتقل شده‌اند
  const handleReceivePaymentClick = (inv: Invoice, installment?: InstallmentScheduleItem | null) => {
    const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)
    if (remaining <= 0) {
      toast({ title: 'خطا', description: 'این فاکتور به طور کامل پرداخت شده است', variant: 'destructive' })
      return
    }
    setReceivePayInvoice(inv)
    setReceivePayInstallment(installment || null)
    // ★ اگر قسط خاصی انتخاب شده، مبلغ پیش‌فرض = مبلغ باقیمانده قسط
    // در غیر این صورت، مبلغ پیش‌فرض = کل باقیمانده فاکتور
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

  // ★★★ v5.1.3: ثبت دریافت وجه ★★★
  const submitReceivePayment = async () => {
    if (!receivePayInvoice) return

    const amount = Number(receivePayAmount)
    if (!amount || amount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ نامعتبر است', variant: 'destructive' })
      return
    }

    const remaining = (receivePayInvoice.totalAmount || 0) - (receivePayInvoice.paidAmount || 0)
    if (amount > remaining + 1) {
      toast({
        title: 'خطا',
        description: `مبلغ (${amount.toLocaleString('fa-IR')} ت) بیش از باقیمانده (${remaining.toLocaleString('fa-IR')} ت) است`,
        variant: 'destructive'
      })
      return
    }

    setReceivePaySubmitting(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/invoices/receive-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          invoiceId: receivePayInvoice.id,
          amount,
          paymentMethod: receivePayMethod,
          paymentRef: receivePayRef || undefined,
          notes: receivePayNotes || undefined,
          installmentId: receivePayInstallment?.id || undefined,
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast({
          title: 'دریافت وجه ثبت شد',
          description: `${amount.toLocaleString('fa-IR')} تومان دریافت شد — فاکتور: ${data.data.newStatus === 'paid' ? 'تسویه کامل' : 'پرداخت جزئی'}`,
        })
        setReceivePayDialogOpen(false)
        setReceivePayInvoice(null)
        setReceivePayInstallment(null)
        // ★ رفرش لیست فاکتورها
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


  // ★★★ v5.1.3: مودال دریافت وجه جهادی ★★★
  const renderReceivePaymentDialog = () => {
    if (!receivePayInvoice) return null

    const remaining = (receivePayInvoice.totalAmount || 0) - (receivePayInvoice.paidAmount || 0)
    const amount = Number(receivePayAmount) || 0
    const newRemainingAfter = Math.max(0, remaining - amount)
    const isInstallmentPayment = !!receivePayInstallment

    return (
      <Dialog open={receivePayDialogOpen} onOpenChange={(open) => {
        setReceivePayDialogOpen(open)
        if (!open) {
          setReceivePayInvoice(null)
          setReceivePayInstallment(null)
        }
      }}>
        <DialogContent className="sm:max-w-[420px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wallet className="w-4 h-4 text-emerald-600" />
              دریافت وجه
            </DialogTitle>
            <DialogDescription className="text-xs">
              فاکتور {receivePayInvoice.number}
              {isInstallmentPayment && receivePayInstallment && (
                <span className="text-purple-600 mr-1">
                  — قسط {receivePayInstallment.installmentNumber.toLocaleString('fa-IR')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* ★ اطلاعات فاکتور */}
            <div className="bg-emerald-50 rounded-lg p-2.5 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">باقیمانده فعلی:</span>
                <span className="font-bold text-emerald-700">{remaining.toLocaleString('fa-IR')} ت</span>
              </div>
              {amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">بعد از دریافت:</span>
                  <span className="font-bold text-gray-700">{newRemainingAfter.toLocaleString('fa-IR')} ت</span>
                </div>
              )}
            </div>

            {/* ★ مبلغ دریافت */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">مبلغ دریافت (تومان) *</Label>
              <Input
                type="number"
                value={receivePayAmount}
                onChange={(e) => setReceivePayAmount(e.target.value)}
                placeholder="مبلغ به تومان"
                className="text-sm"
                dir="ltr"
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setReceivePayAmount(String(remaining))}
                >
                  کل باقیمانده
                </Button>
                {isInstallmentPayment && receivePayInstallment && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] flex-1"
                    onClick={() => {
                      const instRem = (receivePayInstallment.amount || 0) - (receivePayInstallment.paidAmount || 0)
                      setReceivePayAmount(String(instRem))
                    }}
                  >
                    مبلغ این قسط
                  </Button>
                )}
              </div>
            </div>

            {/* ★ روش پرداخت */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">روش پرداخت</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  variant={receivePayMethod === 'cash' ? 'default' : 'outline'}
                  className={`h-8 text-xs ${receivePayMethod === 'cash' ? 'bg-emerald-600' : ''}`}
                  onClick={() => setReceivePayMethod('cash')}
                >
                  نقدی
                </Button>
                <Button
                  size="sm"
                  variant={receivePayMethod === 'card' ? 'default' : 'outline'}
                  className={`h-8 text-xs ${receivePayMethod === 'card' ? 'bg-emerald-600' : ''}`}
                  onClick={() => setReceivePayMethod('card')}
                >
                  کارتخوان
                </Button>
              </div>
              {!planFeatures.canOnlinePayment && (
                <p className="text-[10px] text-gray-400 mt-1">
                  در پلن ساده فقط نقدی و کارتخوان قابل ثبت است
                </p>
              )}
            </div>

            {/* ★ شماره پیگیری (اختیاری) */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">شماره پیگیری / رسید (اختیاری)</Label>
              <Input
                type="text"
                value={receivePayRef}
                onChange={(e) => setReceivePayRef(e.target.value)}
                placeholder="مثلاً: 1234567890"
                className="text-sm"
                dir="ltr"
              />
            </div>

            {/* ★ توضیحات (اختیاری) */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">توضیحات (اختیاری)</Label>
              <Input
                type="text"
                value={receivePayNotes}
                onChange={(e) => setReceivePayNotes(e.target.value)}
                placeholder="توضیحات..."
                className="text-sm"
              />
            </div>

            {/* ★ پیش‌نمایش سند حسابداری */}
            <div className="bg-blue-50 rounded-lg p-2 text-[10px] text-blue-700 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">سند حسابداری خودکار:</p>
                <p>بدهکار: {receivePayMethod === 'cash' ? 'صندوق' : 'بانک'} — بستانکار: حساب‌های دریافتنی</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceivePayDialogOpen(false)}
              disabled={receivePaySubmitting}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={submitReceivePayment}
              disabled={receivePaySubmitting || !receivePayAmount}
            >
              {receivePaySubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  در حال ثبت...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ثبت دریافت
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const renderDetailDialog = () => {
    if (!selectedInvoice) return null

    const inv = selectedInvoice
    const items = inv.items || []
    const payments = inv.payments || []
    const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)

    return (
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-5 h-5 text-emerald-600" />
              جزئیات فاکتور {inv.invoiceNumber || inv.number}
            </DialogTitle>
            <DialogDescription>
              مشاهده کامل اطلاعات فاکتور
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* ★ اطلاعات اصلی */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500">شماره فاکتور</p>
                  <p className="text-sm font-bold font-mono">{inv.invoiceNumber || inv.number}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500">مشتری</p>
                  <p className="text-sm font-bold">{inv.customerName || 'فروش عمومی'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500">وضعیت</p>
                  <div className="mt-1">{getStatusBadge(inv.status, inv.paymentStatus, (inv as any).invoiceType)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500">نوع پرداخت</p>
                  <div className="mt-1">{getPaymentTypeBadge(inv.paymentType)}</div>
                </CardContent>
              </Card>
            </div>

            {/* ★ مبالغ */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-emerald-200">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-gray-500">مبلغ کل</p>
                  <p className="text-sm font-bold text-emerald-600">{formatCurrency(inv.totalAmount)}</p>
                </CardContent>
              </Card>
              <Card className="border-sky-200">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-gray-500">پرداخت شده</p>
                  <p className="text-sm font-bold text-sky-600">{formatCurrency(inv.paidAmount)}</p>
                </CardContent>
              </Card>
              <Card className={remaining > 0 ? 'border-amber-200' : 'border-emerald-200'}>
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-gray-500">باقیمانده</p>
                  <p className={`text-sm font-bold ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(remaining)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ★ آیتم‌های فاکتور */}
            {items.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">آیتم‌های فاکتور</CardTitle>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">محصول</TableHead>
                        <TableHead className="text-xs text-right">تعداد</TableHead>
                        <TableHead className="text-xs text-right">قیمت واحد</TableHead>
                        <TableHead className="text-xs text-right">مبلغ کل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, idx) => (
                        <TableRow key={item.id || idx}>
                          <TableCell className="text-xs">{item.productName}</TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {formatNumber(item.quantity)} {item.unitLabel || ''}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {formatCurrency(item.unitPrice)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold">
                            {formatCurrency(item.totalAmount || item.lineTotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* ★ پرداخت‌ها */}
            {payments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">پرداخت‌ها</CardTitle>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">مبلغ</TableHead>
                        <TableHead className="text-xs">روش</TableHead>
                        <TableHead className="text-xs">تاریخ</TableHead>
                        <TableHead className="text-xs">مرجع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((pay, idx) => {
                        const method = pay.paymentType || pay.method || 'نقدی'
                        const methodLabel =
                          method === 'cash' ? 'نقدی' :
                          method === 'card' || method === 'pos' ? 'کارتخوان' :
                          method === 'bank' ? 'بانکی' :
                          method === 'credit' ? 'نسیه' :
                          method === 'installment' ? 'قسطی' :
                          method
                        return (
                          <TableRow key={pay.id || idx}>
                            <TableCell className="text-xs font-mono">{formatCurrency(pay.amount)}</TableCell>
                            <TableCell className="text-xs">{methodLabel}</TableCell>
                            <TableCell className="text-xs">{formatDate(pay.paidAt)}</TableCell>
                            <TableCell className="text-xs">{pay.paymentRef || pay.reference || '---'}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* ★ تاریخ */}
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
              <span>تاریخ ایجاد: {formatDate(inv.createdAt)}</span>
              <span>آخرین بروزرسانی: {formatDate(inv.updatedAt)}</span>
            </div>

            {/* ★★★ v3.3: اطلاعات نسیه و دکمه ثبت پرداخت ★★★ */}
            {(inv.paymentType || '').toLowerCase() === 'credit' && remaining > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-xs font-bold text-amber-700">این فاکتور نسیه است</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded p-2 border border-amber-100">
                      <p className="text-gray-500">مبلغ کل</p>
                      <p className="font-bold text-gray-700">{formatCurrency(inv.totalAmount)}</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-amber-100">
                      <p className="text-gray-500">پرداخت شده</p>
                      <p className="font-bold text-emerald-600">{formatCurrency(inv.paidAmount)}</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-amber-200 col-span-2">
                      <p className="text-gray-500">باقیمانده (بدهی مشتری)</p>
                      <p className="font-bold text-amber-700 text-base">{formatCurrency(remaining)}</p>
                    </div>
                  </div>
                  {planFeatures.canAccessCredit ? (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                      size="sm"
                      onClick={() => {
                        // ★ بستن دیالوگ جزئیات و باز کردن دیالوگ پرداخت
                        setDetailOpen(false)
                        setTimeout(() => handlePayClick(inv), 200)
                      }}
                    >
                      <Wallet className="w-4 h-4" />
                      ثبت پرداخت نسیه
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-white p-2 rounded border border-amber-200">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>مدیریت کامل نسیه در پلن حرفه‌ای، اما دریافت وجه امکان‌پذیر است</span>
                      </div>
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                        size="sm"
                        onClick={() => handleReceivePaymentClick(inv)}
                      >
                        <Wallet className="w-4 h-4" />
                        دریافت وجه نقدی
                      </Button>
                      <Button
                        className="w-full bg-purple-600 hover:bg-purple-700 gap-1.5"
                        size="sm"
                        variant="outline"
                        onClick={() => router.push('/subscription/renew')}
                      >
                        <Crown className="w-4 h-4" />
                        ارتقا برای مدیریت کامل
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ★★★ v3.3: نمایش تسویه کامل ★★★ */}
            {(inv.paymentType || '').toLowerCase() === 'credit' && remaining <= 0 && (
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs font-bold text-emerald-700">این فاکتور نسیه به طور کامل تسویه شده است</p>
                </CardContent>
              </Card>
            )}

            {/* ★★★ v5.1.2 (Phase 4): هشدار بالای صفحه برای فاکتور قسطی در پلن ساده ★★★ */}
            {(inv.paymentType || '').toLowerCase() === 'installment' && !planFeatures.canAccessInstallments && (() => {
              const remainingInst = (inv.totalAmount || 0) - (inv.paidAmount || 0)
              return (
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-600" />
                      <p className="text-xs font-bold text-orange-700">این فاکتور قسطی است</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white rounded p-2 border border-orange-100">
                        <p className="text-gray-500">مبلغ کل</p>
                        <p className="font-bold text-gray-700">{formatCurrency(inv.totalAmount)}</p>
                      </div>
                      <div className="bg-white rounded p-2 border border-orange-100">
                        <p className="text-gray-500">پرداخت شده</p>
                        <p className="font-bold text-emerald-600">{formatCurrency(inv.paidAmount)}</p>
                      </div>
                      <div className="bg-white rounded p-2 border border-orange-200 col-span-2">
                        <p className="text-gray-500">باقیمانده (بدهی مشتری)</p>
                        <p className="font-bold text-orange-700 text-base">{formatCurrency(remainingInst)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-orange-700 bg-white p-2 rounded border border-orange-200">
                      <Lock className="w-3 h-3 shrink-0" />
                      <span>مدیریت کامل اقساط در پلن حرفه‌ای، اما دریافت وجه امکان‌پذیر است.</span>
                    </div>
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                      size="sm"
                      onClick={() => handleReceivePaymentClick(inv)}
                    >
                      <Wallet className="w-4 h-4" />
                      دریافت وجه نقدی
                    </Button>
                    <Button
                      className="w-full bg-purple-600 hover:bg-purple-700 gap-1.5"
                      size="sm"
                      variant="outline"
                      onClick={() => router.push('/subscription/renew')}
                    >
                      <Crown className="w-4 h-4" />
                      ارتقا برای مدیریت کامل اقساط
                    </Button>
                  </CardContent>
                </Card>
              )
            })()}
            {/* ★★★ v3.36.5: اطلاعات اقساط و دکمه ثبت پرداخت حضوری ★★★ */}
            {(inv.paymentType || '').toLowerCase() === 'installment' && inv.installmentPlan && (() => {
              const schedules: InstallmentScheduleItem[] = (inv.installmentPlan.schedules || []) as InstallmentScheduleItem[]
              const sortedSchedules = [...schedules].sort((a, b) => a.installmentNumber - b.installmentNumber)
              const pendingSchedules = sortedSchedules.filter((s) => {
                const st = (s.status || '').toLowerCase()
                return st === 'pending' || st === 'partial'
              })
              const paidCount = sortedSchedules.length - pendingSchedules.length
              const plan = inv.installmentPlan
              const isCompleted = pendingSchedules.length === 0

              return (
                <Card className="border-purple-200 bg-purple-50/30">
                  <CardContent className="p-3 space-y-2">
                    {/* ★ هدر */}
                    <div className="flex items-center gap-2 pb-1 border-b border-purple-100">
                      <CalendarDays className="w-4 h-4 text-purple-600" />
                      <p className="text-xs font-bold text-purple-700">جدول اقساط</p>
                      <Badge className="bg-purple-100 text-purple-700 text-[10px] mr-auto">
                        {paidCount.toLocaleString('fa-IR')} از {sortedSchedules.length.toLocaleString('fa-IR')} قسط پرداخت شده
                      </Badge>
                    </div>

                    {/* ★ خلاصه پلن */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-white rounded p-2 border border-purple-100">
                        <p className="text-gray-500">تعداد اقساط</p>
                        <p className="font-bold text-gray-700">{(plan.numberOfInstallments || 0).toLocaleString('fa-IR')}</p>
                      </div>
                      <div className="bg-white rounded p-2 border border-purple-100">
                        <p className="text-gray-500">پیش‌پرداخت</p>
                        <p className="font-bold text-gray-700">{formatCurrency(plan.downPayment || 0)}</p>
                      </div>
                      <div className="bg-white rounded p-2 border border-purple-100">
                        <p className="text-gray-500">مبلغ هر قسط</p>
                        <p className="font-bold text-gray-700">{formatCurrency(plan.installmentAmount || 0)}</p>
                      </div>
                    </div>

                    {/* ★ لیست اقساط */}
                    <div className="space-y-1 max-h-[280px] overflow-y-auto">
                      {sortedSchedules.map((inst) => {
                        const status = (inst.status || '').toLowerCase()
                        const isPaid = status === 'paid' || status === 'completed'
                        const isPartial = status === 'partial'
                        const remainingInst = (inst.amount || 0) - (inst.paidAmount || 0)
                        const dueDate = new Date(inst.dueDate)
                        const isOverdue = !isPaid && dueDate < new Date()

                        return (
                          <div
                            key={inst.id}
                            className={`p-2 rounded border ${
                              isPaid
                                ? 'bg-emerald-50 border-emerald-200'
                                : isPartial
                                  ? 'bg-amber-50 border-amber-200'
                                  : isOverdue
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-xs font-bold text-gray-700">
                                    قسط {inst.installmentNumber.toLocaleString('fa-IR')}
                                  </span>
                                  {isPaid && (
                                    <Badge className="bg-emerald-100 text-emerald-700 text-[9px] h-4 px-1">
                                      <CheckCircle2 className="w-2.5 h-2.5 ml-0.5" />پرداخت‌شده
                                    </Badge>
                                  )}
                                  {isPartial && (
                                    <Badge className="bg-amber-100 text-amber-700 text-[9px] h-4 px-1">جزیی</Badge>
                                  )}
                                  {isOverdue && !isPaid && !isPartial && (
                                    <Badge className="bg-red-100 text-red-700 text-[9px] h-4 px-1">سررسید گذشته</Badge>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  سررسید: {formatDateShort(inst.dueDate)}
                                  {inst.paidAt && (
                                    <span className="text-emerald-600 mr-2">
                                      • پرداخت: {formatDateShort(inst.paidAt)}
                                    </span>
                                  )}
                                  {inst.paymentRef && (
                                    <span className="text-gray-400 mr-2" dir="ltr">
                                      • ref: {inst.paymentRef}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-left shrink-0">
                                <p className="text-[11px] font-bold text-gray-700 font-mono">
                                  {formatCurrency(inst.amount || 0)}
                                </p>
                                {isPartial && (
                                  <p className="text-[9px] text-amber-600">
                                    باقیمانده: {formatCurrency(remainingInst)}
                                  </p>
                                )}
                              </div>
                            </div>
                            {/* ★ دکمه ثبت پرداخت حضوری — فقط برای اقساط پرداخت‌نشده */}
                            {!isPaid && planFeatures.canAccessCredit && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={`w-full mt-1.5 h-6 text-[10px] gap-1 ${
                                  isOverdue
                                    ? 'border-red-300 text-red-600 hover:bg-red-50'
                                    : isPartial
                                      ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                      : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                }`}
                                onClick={() => handleInstallmentPayClick(inv, inst)}
                              >
                                <Wallet className="w-3 h-3" />
                                ثبت پرداخت {isPartial ? 'باقیمانده' : 'حضوری'}
                              </Button>
                            )}
                            {!isPaid && !planFeatures.canAccessCredit && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={`w-full mt-1.5 h-6 text-[10px] gap-1 ${
                                  isOverdue
                                    ? 'border-red-300 text-red-600 hover:bg-red-50'
                                    : isPartial
                                      ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                      : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                }`}
                                onClick={() => handleReceivePaymentClick(inv, inst)}
                              >
                                <Wallet className="w-3 h-3" />
                                دریافت {isPartial ? 'باقیمانده' : 'وجه'}
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* ★ پیام تکمیل پلن */}
                    {isCompleted && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100 p-2 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="font-bold">تمام اقساط این فاکتور پرداخت شده است</span>
                      </div>
                    )}

                    {/* ★ راهنما */}
                    {!isCompleted && (
                      <div className="text-[10px] text-purple-600 bg-purple-100/50 p-2 rounded flex items-start gap-1">
                        <Info className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>
                          برای ثبت پرداخت حضوری، روی دکمه «ثبت پرداخت» هر قسط کلیک کنید.
                          مشتری همچنین می‌تواند از پورتال خود به‌صورت آنلاین پرداخت کند.
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })()}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            {/* ★★★ v3.36: دکمه لینک پورتال مشتری — برای فاکتورهای نسیه/قسطی با مشتری */}
            {/* ★★★ v5.1.2: دکمه پورتال فقط در پلن حرفه‌ای و سازمانی (canOnlinePayment) ★★★ */}
            {inv.customerId && planFeatures.canOnlinePayment && (() => {
              const pt = (inv.paymentType || '').toLowerCase()
              if (pt === 'credit' || pt === 'installment') {
                return (
                  <PortalLinkButton
                    customerId={inv.customerId}
                    customerName={inv.customerName}
                    portalToken={inv.customerPortalToken}
                    variant="outline"
                    size="sm"
                    label="لینک پورتال"
                  />
                )
              }
              return null
            })()}
            {/* ★★★ v5.1.2: اگر پورتال در پلن در دسترس نیست، دکمه ارتقا نشان بده ★★★ */}
            {inv.customerId && !planFeatures.canOnlinePayment && (() => {
              const pt = (inv.paymentType || '').toLowerCase()
              if (pt === 'credit' || pt === 'installment') {
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => router.push('/subscription/renew')}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    ارتقا برای فعال‌سازی پورتال
                  </Button>
                )
              }
              return null
            })()}
            {/* ★★★ v3.32: دکمه دانلود/چاپ PDF فاکتور */}
            <InvoicePDFButton
              invoiceId={inv.id}
              invoiceNumber={inv.invoiceNumber || inv.number}
            />
            {/* ★★★ v3.34: دکمه پرداخت آنلاین — فقط برای فاکتورهای با باقی‌مانده */}
            {(() => {
              const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)
              return remaining > 0 ? (
                <OnlinePaymentButton
                  invoiceId={inv.id}
                  amount={remaining}
                />
              ) : null
            })()}
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v3.3: Render — Payment Dialog (ثبت پرداخت نسیه) ★★★
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
      <Dialog open={paymentDialogOpen} onOpenChange={(open) => {
        if (!submittingPayment) setPaymentDialogOpen(open)
      }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wallet className="w-5 h-5 text-emerald-600" />
              ثبت پرداخت نسیه
            </DialogTitle>
            <DialogDescription>
              فاکتور {inv.invoiceNumber || inv.number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {/* ★ اطلاعات فاکتور */}
            <Card className="bg-gray-50/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">مشتری</span>
                  <span className="font-medium">{inv.customerName || 'فروش عمومی'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-gray-500">مبلغ کل</p>
                    <p className="font-bold text-gray-700">{formatCurrency(totalAmount)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">پرداخت شده</p>
                    <p className="font-bold text-emerald-600">{formatCurrency(alreadyPaid)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">باقیمانده</p>
                    <p className="font-bold text-amber-600">{formatCurrency(remaining)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ★ فیلد مبلغ پرداخت */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">مبلغ پرداخت <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="مبلغ به تومان"
                className="text-left font-mono"
                disabled={submittingPayment}
                max={remaining}
                min={1}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setPaymentAmount(String(remaining))}
                  disabled={submittingPayment}
                >
                  پرداخت کامل ({formatCurrency(remaining)})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setPaymentAmount(String(Math.floor(remaining / 2)))}
                  disabled={submittingPayment}
                >
                  نصف مبلغ
                </Button>
              </div>
            </div>

            {/* ★ روش پرداخت */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">روش پرداخت <span className="text-red-500">*</span></Label>
              <Select
                value={paymentMethod}
                onValueChange={setPaymentMethod}
                disabled={submittingPayment}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="انتخاب روش پرداخت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدی (صندوق)</SelectItem>
                  <SelectItem value="card">کارتخوان</SelectItem>
                  <SelectItem value="bank">بانکی (واریز)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ★★★ v3.4: تاریخ پرداخت (تقویم شمسی) ★★★ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">تاریخ پرداخت <span className="text-red-500">*</span></Label>
              <ShamsiDatePicker
                value={paymentDate}
                onChange={setPaymentDate}
                placeholder="انتخاب تاریخ پرداخت"
              />
            </div>

            {/* ★ شماره مرجع */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">شماره مرجع (اختیاری)</Label>
              <Input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="شماره فیش / تراکنش"
                className="text-left font-mono"
                disabled={submittingPayment}
              />
            </div>

            {/* ★ پیش‌نمایش نتیجه */}
            {enteredAmount > 0 && enteredAmount <= remaining + 1 && (
              <div className={`p-2.5 rounded-lg border text-xs ${willBeFullyPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                {willBeFullyPaid ? (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>این فاکتور پس از پرداخت، به طور کامل تسویه می‌شود</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>پس از این پرداخت، مبلغ {formatCurrency(newRemaining)} باقیمانده خواهد ماند</span>
                  </div>
                )}
              </div>
            )}

            {/* ★ هشدار accounting */}
            <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
              <CreditCard className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                با ثبت پرداخت، سند حسابداری خودکار (بدهکار صندوق/بانک، بستانکار حساب‌های دریافتنی) ایجاد می‌شود و بدهی مشتری کاهش می‌یابد.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setPaymentDialogOpen(false)
                setInvoiceToPay(null)
                setPaymentAmount('')
                setPaymentRef('')
                setPaymentDate('')
              }}
              disabled={submittingPayment}
            >
              انصراف
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={handlePayConfirm}
              disabled={submittingPayment || !paymentAmount || Number(paymentAmount) <= 0 || !paymentDate}
            >
              {submittingPayment ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  در حال ثبت...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  ثبت پرداخت
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v3.36.5: Render — Installment Payment Dialog ★★★
  // ═══════════════════════════════════════════════════════════════

  const renderInstallmentPayDialog = () => {
    if (!installmentToPay || !installmentPayInvoice) return null

    const inv = installmentPayInvoice
    const inst = installmentToPay
    const fullAmount = inst.amount || 0
    const alreadyPaid = inst.paidAmount || 0
    const remaining = fullAmount - alreadyPaid
    const enteredAmount = Number(installmentPayAmount) || 0
    const newRemainingForInst = Math.max(0, remaining - enteredAmount)
    const willBeFullyPaid = newRemainingForInst <= 1

    return (
      <Dialog open={installmentPayDialogOpen} onOpenChange={(open) => {
        if (!submittingInstallmentPay) setInstallmentPayDialogOpen(open)
      }}>
        <DialogContent className="sm:max-w-[420px] w-[calc(100%-1.5rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          {/* ★ هدر فشرده */}
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-purple-600" />
                پرداخت قسط {inst.installmentNumber.toLocaleString('fa-IR')}
              </span>
              <button
                type="button"
                onClick={() => !submittingInstallmentPay && setInstallmentPayDialogOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                aria-label="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              فاکتور {inv.invoiceNumber || inv.number} • {inv.customerName || 'فروش عمومی'}
            </DialogDescription>
          </DialogHeader>

          {/* ★ اطلاعات قسط فشرده */}
          <div className="bg-purple-50/50 border border-purple-200 rounded-lg p-2 mb-2">
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              <div className="text-center">
                <p className="text-gray-500 text-[10px]">مبلغ قسط</p>
                <p className="font-bold text-gray-700">{formatCurrency(fullAmount)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-[10px]">پرداخت شده</p>
                <p className="font-bold text-emerald-600">{formatCurrency(alreadyPaid)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-[10px]">باقیمانده</p>
                <p className="font-bold text-purple-600">{formatCurrency(remaining)}</p>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 pt-1.5 mt-1.5 border-t border-purple-100">
              <span>سررسید: {formatDateShort(inst.dueDate)}</span>
              {inst.paymentRef && (
                <span dir="ltr" className="text-gray-400">ref: {inst.paymentRef}</span>
              )}
            </div>
          </div>

          {/* ★ فیلد مبلغ */}
          <div className="space-y-1 mb-2">
            <Label className="text-[11px] font-medium flex items-center justify-between">
              <span>مبلغ پرداخت <span className="text-red-500">*</span></span>
              <span className="text-[10px] text-gray-400">تومان</span>
            </Label>
            <Input
              type="number"
              value={installmentPayAmount}
              onChange={(e) => setInstallmentPayAmount(e.target.value)}
              placeholder="مبلغ پرداخت"
              className="text-left font-mono h-8 text-xs"
              disabled={submittingInstallmentPay}
              max={remaining}
              min={1}
            />
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] flex-1"
                onClick={() => setInstallmentPayAmount(String(remaining))}
                disabled={submittingInstallmentPay}
              >
                پرداخت کامل
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] flex-1"
                onClick={() => setInstallmentPayAmount(String(Math.floor(remaining / 2)))}
                disabled={submittingInstallmentPay}
              >
                نصف مبلغ
              </Button>
            </div>
          </div>

          {/* ★ روش پرداخت + تاریخ (دو ستونه) */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium">روش پرداخت <span className="text-red-500">*</span></Label>
              <Select
                value={installmentPayMethod}
                onValueChange={setInstallmentPayMethod}
                disabled={submittingInstallmentPay}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="روش" />
                </SelectTrigger>
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
              <ShamsiDatePicker
                value={installmentPayDate}
                onChange={setInstallmentPayDate}
                placeholder="انتخاب تاریخ"
              />
            </div>
          </div>

          {/* ★ شماره مرجع + توضیحات (دو ستونه) */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium">شماره مرجع</Label>
              <Input
                type="text"
                value={installmentPayRef}
                onChange={(e) => setInstallmentPayRef(e.target.value)}
                placeholder="فیش / تراکنش"
                className="text-left font-mono h-8 text-xs"
                disabled={submittingInstallmentPay}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium">توضیحات</Label>
              <Input
                type="text"
                value={installmentPayNotes}
                onChange={(e) => setInstallmentPayNotes(e.target.value)}
                placeholder="اختیاری"
                className="h-8 text-xs"
                disabled={submittingInstallmentPay}
              />
            </div>
          </div>

          {/* ★ پیش‌نمایش نتیجه (فشرده) */}
          {enteredAmount > 0 && enteredAmount <= remaining + 1 && (
            <div className={`p-2 rounded-md border text-[11px] mb-2 ${willBeFullyPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              {willBeFullyPaid ? (
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>این قسط به طور کامل تسویه می‌شود</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>باقیمانده قسط: {formatCurrency(newRemainingForInst)}</span>
                </div>
              )}
            </div>
          )}

          {/* ★ دکمه‌های پایین */}
          <DialogFooter className="gap-1.5 pt-1 border-t mt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs flex-1"
              onClick={() => {
                setInstallmentPayDialogOpen(false)
                setInstallmentToPay(null)
                setInstallmentPayInvoice(null)
                setInstallmentPayAmount('')
                setInstallmentPayRef('')
                setInstallmentPayNotes('')
                setInstallmentPayDate('')
              }}
              disabled={submittingInstallmentPay}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 h-8 text-xs flex-1 gap-1"
              onClick={handleInstallmentPayConfirm}
              disabled={submittingInstallmentPay || !installmentPayAmount || Number(installmentPayAmount) <= 0 || !installmentPayDate}
            >
              {submittingInstallmentPay ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  در حال ثبت...
                </>
              ) : (
                <>
                  <Wallet className="w-3.5 h-3.5" />
                  ثبت پرداخت
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Render — Delete Dialog ★★★
  // ═══════════════════════════════════════════════════════════════

  const renderDeleteDialog = () => {
    return (
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600">
              <AlertTriangle className="w-5 h-5" />
              تایید حذف فاکتور
            </DialogTitle>
            <DialogDescription>
              آیا از حذف این فاکتور اطمینان دارید؟ این عمل قابل بازگشت نیست.
            </DialogDescription>
          </DialogHeader>

          {invoiceToDelete && (
            <div className="space-y-3 mt-2">
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">شماره فاکتور</span>
                    <span className="text-sm font-mono font-bold">
                      {invoiceToDelete.invoiceNumber || invoiceToDelete.number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">مشتری</span>
                    <span className="text-sm">{invoiceToDelete.customerName || 'فروش عمومی'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">مبلغ</span>
                    <span className="text-sm font-bold text-red-600">
                      {formatCurrency(invoiceToDelete.totalAmount)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">
                  حذف فاکتور ممکن است بر اسناد حسابداری مرتبط تأثیر بگذارد.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setInvoiceToDelete(null)
              }}
              disabled={deleting}
            >
              انصراف
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 gap-1.5"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  در حال حذف...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  حذف فاکتور
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v8.7: دیالوگ فاکتور تعمیرات و خدمات ★★★
  // ═══════════════════════════════════════════════════════════════
  const renderServiceDialog = () => {
    const totalAmount = serviceItems.reduce((sum, i) =>
      sum + (i.quantity * i.unitPrice - i.discountAmount + i.taxAmount), 0)

    return (
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wrench className="w-5 h-5 text-blue-600" />
              فاکتور تعمیرات و خدمات
            </DialogTitle>
            <DialogDescription className="text-xs">
              صدور فاکتور برای خدمات تعمیراتی و فنی (بدون نیاز به محصول)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* اطلاعات مشتری و دستگاه */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">مشتری (اختیاری)</Label>
                <Input
                  value={serviceForm.customerId}
                  onChange={(e) => setServiceForm({ ...serviceForm, customerId: e.target.value })}
                  placeholder="آی‌دی مشتری (برای نسیه الزامی)"
                  className="text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">نام دستگاه (اختیاری)</Label>
                <Input
                  value={serviceForm.serviceDevice}
                  onChange={(e) => setServiceForm({ ...serviceForm, serviceDevice: e.target.value })}
                  placeholder="مثلاً: یخچال ال‌جی مدل X"
                  className="text-xs mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">نحوه پرداخت</Label>
                <select
                  value={serviceForm.paymentType}
                  onChange={(e) => setServiceForm({ ...serviceForm, paymentType: e.target.value })}
                  className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2"
                >
                  <option value="cash">نقدی</option>
                  <option value="credit">نسیه</option>
                  <option value="card">کارتی</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceForm.serviceWarranty}
                    onChange={(e) => setServiceForm({ ...serviceForm, serviceWarranty: e.target.checked })}
                    className="w-4 h-4"
                  />
                  دارای گارانتی
                </label>
              </div>
            </div>

            {/* لیست خدمات */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">اقلام خدماتی</p>
                <Button size="sm" variant="outline" onClick={handleAddServiceItem} className="h-7 text-xs">
                  <Plus className="w-3 h-3 ml-1" />
                  افزودن خدمت
                </Button>
              </div>

              {serviceItems.map((item, index) => (
                <div key={index} className="bg-white rounded p-2 border border-gray-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-6">{(index + 1).toLocaleString('fa-IR')}</span>
                    <Input
                      value={item.serviceName}
                      onChange={(e) => handleServiceItemChange(index, 'serviceName', e.target.value)}
                      placeholder="نام خدمت (مثلاً: تعمیر موتور یخچال)"
                      className="text-xs h-8 flex-1"
                    />
                    {serviceItems.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveServiceItem(index)}
                        className="h-8 w-8 p-0 text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={item.description}
                    onChange={(e) => handleServiceItemChange(index, 'description', e.target.value)}
                    placeholder="توضیحات جزئیات (اختیاری)"
                    className="text-xs min-h-[40px]"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px]">مقدار</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleServiceItemChange(index, 'quantity', Number(e.target.value))}
                        className="text-xs h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">واحد</Label>
                      <Input
                        value={item.unitLabel}
                        onChange={(e) => handleServiceItemChange(index, 'unitLabel', e.target.value)}
                        placeholder="ساعت/عدد/روز"
                        className="text-xs h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">مبلغ واحد</Label>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleServiceItemChange(index, 'unitPrice', Number(e.target.value))}
                        className="text-xs h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">تخفیف</Label>
                      <Input
                        type="number"
                        value={item.discountAmount}
                        onChange={(e) => handleServiceItemChange(index, 'discountAmount', Number(e.target.value))}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 text-left">
                    جمع خط: {((item.quantity * item.unitPrice) - item.discountAmount + item.taxAmount).toLocaleString('fa-IR')} ریال
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Label className="text-xs">توضیحات کلی (اختیاری)</Label>
              <Textarea
                value={serviceForm.description}
                onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                placeholder="توضیحات بیشتر..."
                className="text-xs mt-1 min-h-[50px]"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700 flex justify-between items-center">
              <span>مبلغ کل فاکتور:</span>
              <span className="font-bold text-sm">{totalAmount.toLocaleString('fa-IR')} ریال</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setServiceDialogOpen(false)} disabled={serviceSubmitting}>
              انصراف
            </Button>
            <Button
              onClick={handleServiceSubmit}
              disabled={serviceSubmitting || totalAmount <= 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {serviceSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-1" />
                  در حال صدور...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4 ml-1" />
                  صدور فاکتور
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v9.5: دیالوگ برگشتی فاکتور فروش — نسخه پایدار ★★★
  // ═══════════════════════════════════════════════════════════════
  const renderReturnDialog = () => {
    const totalReturn = returnItems.reduce((sum, i) => {
      const item = (invoiceToReturn as any)?.items?.find((it: any) => it.id === i.invoiceItemId)
      if (!item) return sum
      const ratio = item.quantity > 0 ? i.quantity / item.quantity : 0
      return sum + (Number(item.lineTotal) || 0) * ratio
    }, 0)

    return (
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              ثبت برگشتی فاکتور فروش
            </DialogTitle>
            <DialogDescription className="text-xs">
              {invoiceToReturn
                ? `فاکتور ${invoiceToReturn.invoiceNumber || invoiceToReturn.number} — انتخاب کالاهای مرجوعی`
                : 'انتخاب کالاهای مرجوعی'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* لیست آیتم‌ها */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right p-2 font-medium">نام کالا</th>
                    <th className="text-center p-2 font-medium">مقدار اصلی</th>
                    <th className="text-center p-2 font-medium">مقدار برگشتی</th>
                    <th className="text-center p-2 font-medium">مبلغ برگشتی</th>
                    <th className="text-right p-2 font-medium">دلیل برگشت</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-400">
                        در حال بارگذاری اقلام فاکتور...
                      </td>
                    </tr>
                  ) : (
                    returnItems.map((item, index) => {
                      const origItem = (invoiceToReturn as any)?.items?.find((it: any) => it.id === item.invoiceItemId)
                      const itemReturnAmount = origItem
                        ? (Number(origItem.lineTotal) || 0) * (origItem.quantity > 0 ? item.quantity / origItem.quantity : 0)
                        : 0
                      return (
                        <tr key={index} className="border-t border-gray-100">
                          <td className="p-2 font-medium text-gray-900">{item.productName || '—'}</td>
                          <td className="p-2 text-center text-gray-500">{item.maxQuantity.toLocaleString('fa-IR')}</td>
                          <td className="p-2 text-center">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleReturnItemChange(index, 'quantity', e.target.value)}
                              min={0}
                              max={item.maxQuantity}
                              className="h-8 text-xs w-20 text-center"
                            />
                          </td>
                          <td className="p-2 text-center font-medium text-amber-700">
                            {itemReturnAmount > 0 ? itemReturnAmount.toLocaleString('fa-IR') : '—'}
                          </td>
                          <td className="p-2">
                            <Input
                              value={item.returnReason}
                              onChange={(e) => handleReturnItemChange(index, 'returnReason', e.target.value)}
                              placeholder="اختیاری"
                              className="h-8 text-xs"
                            />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* نحوه برگشت وجه */}
            <div>
              <Label className="text-xs">نحوه برگشت وجه به مشتری</Label>
              <select
                value={returnPaymentType}
                onChange={(e) => setReturnPaymentType(e.target.value as 'cash' | 'credit')}
                className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2"
              >
                <option value="cash">نقدی (بازپرداخت وجه)</option>
                <option value="credit">کاهش طلب از مشتری (نسیه)</option>
              </select>
            </div>

            <div>
              <Label className="text-xs">توضیحات (اختیاری)</Label>
              <Textarea
                value={returnDescription}
                onChange={(e) => setReturnDescription(e.target.value)}
                placeholder="دلیل کلی برگشت..."
                className="text-xs mt-1 min-h-[50px]"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700 flex justify-between items-center">
              <span>مبلغ کل برگشتی:</span>
              <span className="font-bold text-sm">{totalReturn.toLocaleString('fa-IR')} ریال</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)} disabled={returnSubmitting}>
              انصراف
            </Button>
            <Button
              onClick={handleReturnSubmit}
              disabled={returnSubmitting || returnItems.length === 0 || returnItems.every(i => i.quantity === 0)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {returnSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-1" />
                  در حال ثبت...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 ml-1" />
                  ثبت برگشتی
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }


  // ═══════════════════════════════════════════════════════════════
  // ★★★ Main Render ★★★
  // ═══════════════════════════════════════════════════════════════

  return (
    <TooltipProvider>
      <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">
        {/* ─── Header ─────────────────────────────────────────── */}
        <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 text-white">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h1 className="text-sm sm:text-lg font-bold text-gray-900">فاکتورها</h1>
                <p className="text-[10px] sm:text-xs text-gray-500">
                  {formatNumber(totalCount)} فاکتور
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadInvoices}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                بروزرسانی
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                size="sm"
                onClick={() => setCurrentView('pos')}
              >
                <Plus className="w-3 h-3" />
                فاکتور جدید
              </Button>
              {/* ★★★ v8.7: دکمه فاکتور تعمیرات و خدمات */}
              <Button
                className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                size="sm"
                onClick={() => setServiceDialogOpen(true)}
              >
                <Wrench className="w-3 h-3" />
                <span className="hidden sm:inline">تعمیرات و خدمات</span>
                <span className="sm:hidden">خدمات</span>
              </Button>
            </div>
          </div>
        </header>

        {/* ─── Summary Cards (v9.3 — Compact) ───────────────────── */}
        {/* ★★★ v9.3: کارت‌های آماری فشرده‌تر — فضای کمتر، خوانایی بهتر */}
        <div className="px-3 sm:px-6 pt-2 shrink-0">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <div className="bg-white rounded-md border border-gray-200 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="text-[9px] sm:text-[10px] text-gray-500 leading-tight">فاکتورها</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900 leading-tight mt-0.5">{formatNumber(summaryStats.total)}</p>
            </div>
            <div className="bg-white rounded-md border border-gray-200 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="text-[9px] sm:text-[10px] text-gray-500 leading-tight">مبلغ کل</p>
              <p className="text-[11px] sm:text-sm font-bold text-emerald-600 leading-tight mt-0.5">{formatCurrency(summaryStats.totalAmount)}</p>
            </div>
            <div className="bg-white rounded-md border border-gray-200 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="text-[9px] sm:text-[10px] text-gray-500 leading-tight">پرداخت شده</p>
              <p className="text-[11px] sm:text-sm font-bold text-sky-600 leading-tight mt-0.5">{formatCurrency(summaryStats.paidAmount)}</p>
            </div>
            <div className="bg-white rounded-md border border-gray-200 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="text-[9px] sm:text-[10px] text-gray-500 leading-tight">در انتظار</p>
              <p className="text-[11px] sm:text-sm font-bold text-amber-600 leading-tight mt-0.5">
                {formatCurrency(summaryStats.totalAmount - summaryStats.paidAmount)}
              </p>
            </div>
          </div>
        </div>

        {/* ─── Tabs & Search ──────────────────────────────────── */}
        <div className="px-3 sm:px-6 pt-4 shrink-0 space-y-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key)
                    setPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="جستجو بر اساس شماره فاکتور یا نام مشتری..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ─── Content ────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-3 sm:px-6 py-4">
          {/* Loading State */}
          {loading && invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
              <p className="text-sm text-gray-500">در حال بارگذاری فاکتورها...</p>
            </div>
          )}

          {/* Error State */}
          {error && invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadInvoices} className="gap-1.5">
                <RefreshCw className="w-3 h-3" />
                تلاش مجدد
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredInvoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <FileText className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-1">فاکتوری یافت نشد</p>
              <p className="text-xs text-gray-400">
                {search ? 'عبارت جستجو را تغییر دهید' : 'اولین فاکتور خود را ثبت کنید'}
              </p>
            </div>
          )}

          {/* Invoice Table */}
          {!loading && filteredInvoices.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">شماره</TableHead>
                        <TableHead className="text-xs">مشتری</TableHead>
                        <TableHead className="text-xs text-right">مبلغ کل</TableHead>
                        <TableHead className="text-xs text-right">پرداخت شده</TableHead>
                        <TableHead className="text-xs">نوع پرداخت</TableHead>
                        <TableHead className="text-xs">وضعیت</TableHead>
                        <TableHead className="text-xs">تاریخ</TableHead>
                        <TableHead className="text-xs">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((inv) => {
                        const invNumber = inv.invoiceNumber || inv.number || '---'
                        const isPaid = (inv.paymentStatus || inv.status)?.toUpperCase() === 'PAID'
                        const isCancelled = (inv.paymentStatus || inv.status)?.toUpperCase() === 'CANCELLED'
                        // ★★★ v9.9.1: تشخیص فاکتور برگشتی
                        const isReturn = (inv as any).invoiceType === 'sale_return' || (inv as any).invoiceType === 'purchase_return'

                        return (
                          <TableRow
                            key={inv.id}
                            className={`cursor-pointer hover:bg-gray-50 ${isCancelled ? 'opacity-50' : ''}`}
                            onClick={() => handleViewDetail(inv)}
                          >
                            <TableCell className="text-xs font-mono font-medium">
                              {invNumber}
                            </TableCell>
                            <TableCell className="text-xs">
                              {inv.customerName || (
                                <span className="text-gray-400">فروش عمومی</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {formatCurrency(inv.totalAmount)}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              <span className={isPaid ? 'text-emerald-600' : 'text-amber-600'}>
                                {formatCurrency(inv.paidAmount)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {getPaymentTypeBadge(inv.paymentType)}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(inv.status, inv.paymentStatus, (inv as any).invoiceType)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatDateShort(inv.createdAt)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {/* View Detail Button */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 hover:bg-sky-50 hover:text-sky-600"
                                      onClick={() => handleViewDetail(inv)}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    مشاهده جزئیات
                                  </TooltipContent>
                                </Tooltip>

                                {/* ★★★ v3.3: Pay Button — فقط برای فاکتورهای نسیه با باقیمانده ★★★ */}
                                {(inv.paymentType || '').toLowerCase() === 'credit'
                                  && !isPaid
                                  && !isCancelled
                                  && (inv.totalAmount || 0) - (inv.paidAmount || 0) > 0 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-emerald-50 hover:text-emerald-600"
                                        onClick={() => handlePayClick(inv)}
                                      >
                                        <Wallet className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      ثبت پرداخت نسیه
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {/* ★★★ v8.7: Return Button — برگشتی فروش (فقط برای فاکتورهای sale) */}
                                {(inv as any).invoiceType !== "service" && (inv as any).invoiceType !== "sale_return" && !isCancelled && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-amber-50 hover:text-amber-600"
                                        onClick={() => handleReturnClick(inv)}
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      ثبت برگشتی
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {/* ★★★ v25: Delete Button — Plan Gated ★★★ */}
                                {(planFeatures.canDeleteInvoice || isReturn) ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
                                        onClick={() => handleDeleteClick(inv)}
                                        disabled={(isPaid && !isReturn) || isCancelled}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      {isReturn
                                        ? 'حذف فاکتور برگشتی'
                                        : isPaid
                                        ? 'فاکتور پرداخت‌شده قابل حذف نیست'
                                        : isCancelled
                                        ? 'فاکتور لغو‌شده قابل حذف نیست'
                                        : 'حذف فاکتور'}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className="flex items-center justify-center h-7 w-7 rounded-md text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-not-allowed"
                                        onClick={() => {
                                          toast({
                                            title: 'دسترسی محدود',
                                            description: 'حذف فاکتور فقط در پلن حرفه‌ای و بالاتر در دسترس است',
                                          })
                                        }}
                                      >
                                        <Lock className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      ارتقا پلن
                                    </TooltipContent>
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      صفحه {formatNumber(page)} از {formatNumber(totalPages)} — {formatNumber(totalCount)} فاکتور
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-3 h-3 ml-1" />
                        قبلی
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        بعدی
                        <ChevronLeft className="w-3 h-3 mr-1 rotate-180" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ─── Dialogs ────────────────────────────────────────── */}
        {renderDetailDialog()}
        {renderPaymentDialog()}
        {renderReceivePaymentDialog()}
        {renderInstallmentPayDialog()}
        {renderDeleteDialog()}
        {/* ★★★ v8.7: Dialogs جدید */}
        {renderServiceDialog()}
        {renderReturnDialog()}
      </div>
    </TooltipProvider>
  )
}


