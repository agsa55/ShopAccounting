'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { 
  CreditCard, Search, CheckCircle2, Clock, AlertTriangle, RefreshCw, 
  Loader2, Banknote, Lock, Crown, Wallet, Calendar as CalendarIcon, 
  WifiOff, CloudOff, Upload, Eye, EyeOff, ArrowLeft, TrendingUp,
  FileText, Users,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { useToast } from '@/hooks/use-toast'
import {
  cacheInstallmentPlans,
  cacheInstallmentSchedules,
  cacheInstallmentSummary,
  getCachedInstallmentPlans,
  getCachedInstallmentSchedules,
  getCachedInstallmentSummary,
  setLastSyncTimestamp,
  getLastSyncTimestamp,
} from '@/lib/offline-db'

// ═══════════════════════════════════════════════════════════════
// ★★★ Types ★★★
// ═══════════════════════════════════════════════════════════════

interface ScheduleItem {
  id: string
  installmentNumber: number
  amount: number
  dueDate: string
  status: string
  paidAmount: number
  paidAt: string | null
  paymentRef: string | null
  notes: string | null
}

interface PlanItem {
  id: string
  invoiceId: string
  invoiceNumber: string
  customerId: string | null
  customerName: string
  totalAmount: number
  downPayment: number
  remainingAmount: number
  interestRate: number
  totalWithInterest: number
  numberOfInstallments: number
  installmentAmount: number
  installmentPeriod: string
  status: string
  paidInstallments: number
  totalPaidAmount: number
  nextDueDate: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  schedules: ScheduleItem[]
  totalInstallments: number
  paidCount: number
  overdueCount: number
  progressPct: number
}

interface SummaryData {
  totalPlans: number
  activePlans: number
  completedPlans: number
  overduePlans: number
  totalRemaining: number
  totalOverdueInstallments: number
}

interface CreditInvoice {
  id: string
  number: string
  invoiceNumber?: string
  customerId: string | null
  customerName: string | null
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  status: string
  paymentStatus?: string
  paymentType: string
  invoiceDate?: string
  createdAt: string
  items?: any[]
  payments?: any[]
}

// ═══════════════════════════════════════════════════════════════
// ★★★ Helper Functions ★★★
// ═══════════════════════════════════════════════════════════════

function formatCurrency(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '۰ ریال'
  return `${num.toLocaleString('fa-IR')} ریال`
}

function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '۰'
  return num.toLocaleString('fa-IR')
}

function formatDate(dateStr: string | null | undefined): string {
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

function getPeriodLabel(period: string | null | undefined): string {
  if (!period) return '۳۰ روز'
  const map: Record<string, string> = {
    monthly: '۳۰ روز',
    biweekly: '۱۴ روز',
    weekly: '۷ روز',
  }
  return map[period.toLowerCase()] || period
}

// ═══════════════════════════════════════════════════════════════
// ★★★ Jalali Date Functions ★★★
// ═══════════════════════════════════════════════════════════════

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

function toFaNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
]

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

  const goPrevMonth = () => viewMonth === 1 ? (setViewMonth(12), setViewYear((y) => y - 1)) : setViewMonth((m) => m - 1)
  const goNextMonth = () => viewMonth === 12 ? (setViewMonth(1), setViewYear((y) => y + 1)) : setViewMonth((m) => m + 1)
  const goPrevYear = () => setViewYear((y) => y - 1)
  const goNextYear = () => setViewYear((y) => y + 1)

  const pickToday = () => { onChange(todayJalali.iso); setOpen(false) }
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
        <span style={{ flex: 1, textAlign: 'right', fontFamily: 'monospace', color: displayText ? DATE_PICKER_COLORS.textPrimary : DATE_PICKER_COLORS.textMuted, fontSize: 12 }} dir="ltr">
          {displayText || placeholder}
        </span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
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
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDayClick(d)}
                    style={{
                      height: 22,
                      borderRadius: 4,
                      fontSize: 10,
                      border: isSelected ? 'none' : (isToday ? `1px solid ${DATE_PICKER_COLORS.todayBorder}` : 'none'),
                      backgroundColor: isSelected ? DATE_PICKER_COLORS.accent : (isToday ? DATE_PICKER_COLORS.accentLight : 'transparent'),
                      color: isSelected ? DATE_PICKER_COLORS.textOnAccent : (isToday ? DATE_PICKER_COLORS.todayText : (isFriday ? DATE_PICKER_COLORS.textSecondary : DATE_PICKER_COLORS.textPrimary)),
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

function getStatusBadge(status: string) {
  const s = status?.toLowerCase()
  if (s === 'active') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">فعال</Badge>
  if (s === 'completed') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">تکمیل‌شده</Badge>
  if (s === 'defaulted' || s === 'overdue') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">سررسید گذشته</Badge>
  if (s === 'cancelled') return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-[10px]">لغو شده</Badge>
  return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-[10px]">{status}</Badge>
}

function getInstallmentStatusBadge(status: string) {
  const s = status?.toLowerCase()
  if (s === 'paid') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">پرداخت شده</Badge>
  if (s === 'overdue') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">سررسید گذشته</Badge>
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">در انتظار</Badge>
}

function getCreditStatusBadge(status: string, paymentStatus?: string) {
  const s = (paymentStatus || status || '').toUpperCase()
  if (s === 'PAID') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">تسویه شده</Badge>
  if (s === 'PARTIAL' || s === 'PARTIALLYPAID') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">پرداخت جزئی</Badge>
  if (s === 'CANCELLED') return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-[10px]">لغو شده</Badge>
  return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px]">نسیه باز</Badge>
}

function isOverdue(schedule: ScheduleItem): boolean {
  if (schedule.status?.toLowerCase() === 'paid') return false
  try {
    return new Date(schedule.dueDate) < new Date()
  } catch {
    return false
  }
}

// ═══════════════════════════════════════════════════════════════
// ★★★ Mobile Installment Card ★★★
// ═══════════════════════════════════════════════════════════════

interface MobileInstallmentCardProps {
  plan: PlanItem
  onSelectPlan: (plan: PlanItem) => void
}

function MobileInstallmentCard({ plan, onSelectPlan }: MobileInstallmentCardProps) {
  const paidCount = plan.paidCount ?? plan.schedules.filter(s => s.status?.toLowerCase() === 'paid').length
  const totalCount = plan.totalInstallments || plan.schedules.length
  const progressPct = plan.progressPct ?? (totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0)
  const planOverdueItems = plan.schedules.filter(s => isOverdue(s))

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow active:bg-purple-50"
      onClick={() => onSelectPlan(plan)}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
              planOverdueItems.length > 0 ? 'bg-red-100' : plan.status === 'completed' ? 'bg-emerald-100' : 'bg-blue-100'
            }`}>
              {planOverdueItems.length > 0 ? (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              ) : plan.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Clock className="w-4 h-4 text-blue-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">{plan.customerName}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                فاکتور {plan.invoiceNumber}
              </p>
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-600 mb-2 bg-gray-50 rounded px-2 py-1">
          {formatNumber(paidCount)}/{formatNumber(totalCount)} قسط
        </div>

        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs text-gray-500">مانده:</span>
          <span className="text-sm font-bold text-gray-900">{formatCurrency(plan.remainingAmount || plan.totalAmount)}</span>
        </div>

        <div className="bg-gray-100 rounded-full h-2 overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${
              plan.status === 'completed' ? 'bg-emerald-500' : planOverdueItems.length > 0 ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          {getStatusBadge(plan.status)}
          <span className="text-[10px] text-gray-400">{progressPct}%</span>
        </div>

        {planOverdueItems.length > 0 && (
          <div className="mt-2 flex items-center gap-1 px-2 py-1.5 bg-red-50 rounded-lg border border-red-100">
            <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
            <p className="text-[10px] text-red-700 font-medium">
              {formatNumber(planOverdueItems.length)} قسط معوق
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// ★★★ Mobile Credit Card ★★★
// ═══════════════════════════════════════════════════════════════

interface MobileCreditCardProps {
  invoice: CreditInvoice
  onPay: (invoice: CreditInvoice) => void
}

function MobileCreditCard({ invoice, onPay }: MobileCreditCardProps) {
  const remaining = (invoice.totalAmount || 0) - (invoice.paidAmount || 0)
  const progressPct = invoice.totalAmount > 0 
    ? Math.round((invoice.paidAmount / invoice.totalAmount) * 100) 
    : 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 shrink-0">
              <Wallet className="w-4 h-4 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">{invoice.customerName || 'فروش عمومی'}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                فاکتور {invoice.invoiceNumber || invoice.number}
              </p>
            </div>
          </div>
          {getCreditStatusBadge(invoice.status, invoice.paymentStatus)}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <div className="bg-gray-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">کل</p>
            <p className="text-[10px] font-bold text-gray-700 leading-tight mt-0.5">
              {formatNumber(invoice.totalAmount)}
            </p>
          </div>
          <div className="bg-emerald-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">پرداخت</p>
            <p className="text-[10px] font-bold text-emerald-600 leading-tight mt-0.5">
              {formatNumber(invoice.paidAmount)}
            </p>
          </div>
          <div className="bg-amber-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">باقی</p>
            <p className="text-[10px] font-bold text-amber-600 leading-tight mt-0.5">
              {formatNumber(remaining)}
            </p>
          </div>
        </div>

        <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-purple-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-[10px] text-gray-400">{formatDateShort(invoice.createdAt)}</span>
          {remaining > 0 && (
            <Button
              size="sm"
              className="h-7 text-[10px] gap-1 bg-purple-600 hover:bg-purple-700"
              onClick={(e) => { e.stopPropagation(); onPay(invoice) }}
            >
              <Banknote className="w-3 h-3" />
              پرداخت
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// ★★★ Main Component ★★★
// ═══════════════════════════════════════════════════════════════

export default function InstallmentsPage() {
  // ★★★ تب فعال
  const [activeTab, setActiveTab] = useState<'installments' | 'credit'>('installments')

  // States تب اقساط
  const [search, setSearch] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null)
  const [plans, setPlans] = useState<PlanItem[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payingScheduleId, setPayingScheduleId] = useState<string | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSchedule, setPayingSchedule] = useState<ScheduleItem | null>(null)
  const [payNotes, setPayNotes] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  // ★★★ States تب نسیه
  const [creditSearch, setCreditSearch] = useState('')
  const [creditInvoices, setCreditInvoices] = useState<CreditInvoice[]>([])
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)
  const [creditPayDialogOpen, setCreditPayDialogOpen] = useState(false)
  const [creditInvoiceToPay, setCreditInvoiceToPay] = useState<CreditInvoice | null>(null)
  const [creditPayAmount, setCreditPayAmount] = useState('')
  const [creditPayMethod, setCreditPayMethod] = useState('cash')
  const [creditPayRef, setCreditPayRef] = useState('')
  const [creditPayDate, setCreditPayDate] = useState('')
  const [creditPaySubmitting, setCreditPaySubmitting] = useState(false)
  const [creditSummary, setCreditSummary] = useState({
    totalInvoices: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalRemaining: 0,
  })

  const { toast } = useToast()
  const tenantId = useStore((s) => s.tenantId)
  const planName = useStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const setCurrentView = useStore((s) => s.setCurrentView)

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Online Status Detection ★★★
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true) }
    const handleOffline = () => { setIsOnline(false) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ بارگذاری داده‌های اقساط ★★★
  // ═══════════════════════════════════════════════════════════════

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
      try {
        const cachedPlans = await getCachedInstallmentPlans()
        const cachedSummary = await getCachedInstallmentSummary()
        
        const markedPlans = cachedPlans.map((p: any) => ({ ...p, _isOffline: true }))
        
        setPlans(markedPlans)
        setSummary(cachedSummary)
        
        if (cachedPlans.length === 0) {
          setError('هیچ طرح قسطی در حافظه محلی یافت نشد. لطفاً یک‌بار آنلاین شوید.')
        }
      } catch (err) {
        console.error('[InstallmentsPage] Offline load error:', err)
        setError('خطا در بارگذاری داده‌های محلی')
      }
      setLoading(false)
      return
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/installment-plans', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!res.ok) {
        throw new Error(`خطا در دریافت اطلاعات: ${res.status}`)
      }

      const result = await res.json()

      if (result.success) {
        const plansData = result.data || []
        const summaryData = result.summary || null

        await cacheInstallmentPlans(plansData)
        if (summaryData) {
          await cacheInstallmentSummary(summaryData)
        }

        setPlans(plansData)
        setSummary(summaryData)

        const timestamp = Date.now()
        await setLastSyncTimestamp(timestamp)
        setLastSyncTime(timestamp)

        setError(null)
      } else {
        throw new Error(result.error || 'خطای ناشناخته')
      }
    } catch (err: any) {
      console.error('[InstallmentsPage] Load error:', err)
      
      try {
        const cachedPlans = await getCachedInstallmentPlans()
        const cachedSummary = await getCachedInstallmentSummary()
        const markedPlans = cachedPlans.map((p: any) => ({ ...p, _isOffline: true }))
        setPlans(markedPlans)
        setSummary(cachedSummary)
        setError('خطا در دریافت از سرور. داده‌های محلی نمایش داده می‌شوند.')
      } catch {
        setError(err.message || 'خطا در بارگذاری اطلاعات')
        setPlans([])
      }
    } finally {
      setLoading(false)
    }
  }, [isOnline])

  useEffect(() => {
    if (activeTab === 'installments') {
      loadData()
    }
  }, [loadData, activeTab])

  useEffect(() => {
    if (!isOnline) return
    
    const interval = setInterval(() => {
      if (activeTab === 'installments') {
        loadData()
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [loadData, isOnline, activeTab])

  useEffect(() => {
    const loadLastSync = async () => {
      const timestamp = await getLastSyncTimestamp()
      if (timestamp) {
        setLastSyncTime(timestamp)
      }
    }
    loadLastSync()
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ بارگذاری داده‌های نسیه ★★★
  // ═══════════════════════════════════════════════════════════════

   const loadCreditData = useCallback(async () => {
    setCreditLoading(true)
    setCreditError(null)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      
      // دریافت همه فاکتورها (فیلتر دقیق در سمت کلاینت انجام می‌شود)
      const res = await fetch('/api/invoices?limit=500', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!res.ok) {
        throw new Error(`خطا در دریافت اطلاعات: ${res.status}`)
      }

      const result = await res.json()

      if (result.success) {
        const allInvoices = result.data || []
        
        // ★★★ اصلاح نهایی: فقط فاکتورهای "نسیه" (credit) که باز هستند را نمایش بده
        const openCreditInvoices = allInvoices.filter((inv: any) => {
          const pType = (inv.paymentType || '').toLowerCase()
          const status = (inv.paymentStatus || inv.status || '').toUpperCase()
          
          // ۱. نوع پرداخت حتماً باید نسیه (credit) باشد (قسطی نباید اینجا باشد)
          const isCreditOnly = pType === 'credit'
          
          // ۲. وضعیت فاکتور نباید تسویه شده یا لغو شده باشد
          const isOpen = status !== 'PAID' && status !== 'CANCELLED'
          
          // ۳. اطمینان از اینکه هنوز مبلغی باقی مانده است
          const hasRemaining = (inv.totalAmount || 0) > (inv.paidAmount || 0)
          
          return isCreditOnly && isOpen && hasRemaining
        })

        console.log('[InstallmentsPage] Credit invoices loaded:', {
          total: allInvoices.length,
          filtered: openCreditInvoices.length,
          sample: openCreditInvoices.slice(0, 3).map((inv: any) => ({
            number: inv.number,
            paymentType: inv.paymentType,
            status: inv.status,
            paymentStatus: inv.paymentStatus,
            total: inv.totalAmount,
            paid: inv.paidAmount,
          })),
        })

        setCreditInvoices(openCreditInvoices)

        const totalAmount = openCreditInvoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0)
        const totalPaid = openCreditInvoices.reduce((sum: number, inv: any) => sum + (inv.paidAmount || 0), 0)
        
        setCreditSummary({
          totalInvoices: openCreditInvoices.length,
          totalAmount,
          totalPaid,
          totalRemaining: totalAmount - totalPaid,
        })
      } else {
        throw new Error(result.error || 'خطای ناشناخته')
      }
    } catch (err: any) {
      console.error('[InstallmentsPage] Credit load error:', err)
      setCreditError(err.message || 'خطا در بارگذاری فاکتورهای نسیه')
      setCreditInvoices([])
    } finally {
      setCreditLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'credit') {
      loadCreditData()
    }
  }, [loadCreditData, activeTab])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Filtering اقساط ★★★
  // ═══════════════════════════════════════════════════════════════

  let filteredPlans = plans.filter((plan) =>
    plan.customerName.includes(search) || plan.invoiceNumber.toLowerCase().includes(search.toLowerCase())
  )

  if (showOnlyOverdue) {
    filteredPlans = filteredPlans.filter((plan) =>
      plan.schedules.some((s) => isOverdue(s))
    )
  }

  const overdueCount = plans.reduce((sum, plan) => {
    return sum + plan.schedules.filter(s => isOverdue(s)).length
  }, 0)

  const totalRemaining = plans.reduce((sum, plan) => sum + (plan.remainingAmount || 0), 0)

  // ★★★ محاسبه آمار دقیق اقساط
  const summaryStats = useMemo(() => {
    let totalInstallmentsCount = 0
    let paidInstallmentsCount = 0
    let remainingInstallmentsCount = 0
    let totalPaidAmount = 0
    let totalRemainingAmount = 0
    let overdueInstallmentsCount = 0
    let overdueAmount = 0

    plans.forEach((plan: any) => {
      const pCount = plan.paidCount || 0
      const tCount = plan.totalInstallments || 0
      const remCount = Math.max(0, tCount - pCount)
      const pAmount = Number(plan.totalPaidAmount) || 0
      const remAmount = Number(plan.remainingAmount) || 0
      
      totalInstallmentsCount += tCount
      paidInstallmentsCount += pCount
      remainingInstallmentsCount += remCount
      totalPaidAmount += pAmount
      totalRemainingAmount += remAmount

      const overdueSchedules = plan.schedules.filter((s: any) => {
        if (s.status?.toLowerCase() === 'paid') return false
        return new Date(s.dueDate) < new Date()
      })
      
      overdueInstallmentsCount += overdueSchedules.length
      const planOverdueAmount = overdueSchedules.reduce((sum: number, s: any) => {
        return sum + (Number(s.amount) - Number(s.paidAmount || 0))
      }, 0)
      overdueAmount += planOverdueAmount
    })

    return {
      totalInstallmentsCount,
      paidInstallmentsCount,
      remainingInstallmentsCount,
      totalPaidAmount,
      totalRemainingAmount,
      overdueInstallmentsCount,
      overdueAmount,
    }
  }, [plans])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Filtering نسیه ★★★
  // ═══════════════════════════════════════════════════════════════

  const filteredCreditInvoices = useMemo(() => {
    if (!creditSearch) return creditInvoices
    const q = creditSearch.toLowerCase()
    return creditInvoices.filter((inv) => {
      const number = (inv.invoiceNumber || inv.number || '').toLowerCase()
      const customer = (inv.customerName || '').toLowerCase()
      return number.includes(q) || customer.includes(q)
    })
  }, [creditInvoices, creditSearch])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Pay Installment (اقساط) ★★★
  // ═══════════════════════════════════════════════════════════════

  const handlePayClick = (schedule: ScheduleItem) => {
    if (schedule.status?.toLowerCase() === 'paid') return
    setPayingSchedule(schedule)
    setPayNotes('')
    setPayRef('')
    setPayMethod('cash')
    setPayAmount(String(schedule.amount))
    setPayDate(new Date().toISOString().split('T')[0])
    setPayDialogOpen(true)
  }

  const handlePayConfirm = async () => {
    if (!payingSchedule) return

    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      toast({
        title: 'خطا',
        description: 'مبلغ پرداخت باید بزرگتر از صفر باشد',
        variant: 'destructive',
      })
      return
    }

    if (amount > payingSchedule.amount + 1) {
      toast({
        title: 'خطا',
        description: `مبلغ پرداخت نمی‌تواند بیش از مبلغ قسط (${formatCurrency(payingSchedule.amount)}) باشد`,
        variant: 'destructive',
      })
      return
    }

    if (!isOnline) {
      toast({
        title: 'خطا',
        description: 'پرداخت قسط نیاز به اتصال اینترنت دارد',
        variant: 'destructive',
      })
      return
    }

    setPayingScheduleId(payingSchedule.id)
    setPayDialogOpen(false)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/installment-schedules/${payingSchedule.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          amount: amount,
          paymentType: payMethod,
          paymentRef: payRef || undefined,
          notes: payNotes || undefined,
          paidAt: payDate || undefined,
        }),
      })

      const result = await res.json()

      if (result.success) {
        toast({
          title: 'پرداخت موفق ✓',
          description: result.message || `قسط شماره ${formatNumber(payingSchedule.installmentNumber)} با مبلغ ${formatCurrency(amount)} پرداخت شد`,
        })

        await loadData()

        if (selectedPlan) {
          const res = await fetch(`/api/installment-plans?id=${selectedPlan.id}`)
          const result = await res.json()
          if (result.success && result.data) setSelectedPlan(result.data)
        }
      } else {
        toast({
          title: 'خطا در پرداخت',
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
      setPayingScheduleId(null)
      setPayingSchedule(null)
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
      setPayDate('')
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Pay Credit (نسیه) ★★★
  // ═══════════════════════════════════════════════════════════════

  const handleCreditPayClick = (invoice: CreditInvoice) => {
    const remaining = (invoice.totalAmount || 0) - (invoice.paidAmount || 0)
    if (remaining <= 0) {
      toast({ title: 'اطلاع', description: 'این فاکتور قبلاً تسویه شده است' })
      return
    }
    setCreditInvoiceToPay(invoice)
    setCreditPayAmount(String(remaining))
    setCreditPayMethod('cash')
    setCreditPayRef('')
    setCreditPayDate(new Date().toISOString().split('T')[0])
    setCreditPayDialogOpen(true)
  }

  const handleCreditPayConfirm = async () => {
    if (!creditInvoiceToPay) return

    const amount = Number(creditPayAmount)
    if (!amount || amount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ پرداخت باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }

    const remaining = (creditInvoiceToPay.totalAmount || 0) - (creditInvoiceToPay.paidAmount || 0)
    if (amount > remaining + 1) {
      toast({ title: 'خطا', description: 'مبلغ بیش از باقیمانده فاکتور است', variant: 'destructive' })
      return
    }

    if (!isOnline) {
      toast({ title: 'خطا', description: 'ثبت پرداخت نیاز به اتصال اینترنت دارد', variant: 'destructive' })
      return
    }

    setCreditPaySubmitting(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/invoices/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          invoiceId: creditInvoiceToPay.id,
          amount,
          paymentType: creditPayMethod,
          paymentRef: creditPayRef || undefined,
          paidAt: creditPayDate || undefined,
        }),
      })

      const result = await res.json()

      if (result.success) {
        toast({
          title: 'پرداخت ثبت شد ✓',
          description: result.message || `پرداخت ${formatCurrency(amount)} با موفقیت ثبت شد`,
        })
        setCreditPayDialogOpen(false)
        setCreditInvoiceToPay(null)
        setCreditPayAmount('')
        setCreditPayRef('')
        setCreditPayDate('')
        loadCreditData()
      } else {
        toast({
          title: 'خطا در ثبت پرداخت',
          description: result.error || 'خطای ناشناخته',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور', variant: 'destructive' })
    } finally {
      setCreditPaySubmitting(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Feature Gate ★★★
  // ═══════════════════════════════════════════════════════════════

  if (!planFeatures.canAccessInstallments) {
    return (
      <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <Card className="w-full max-w-md border-0 shadow-lg">
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-50 mx-auto mb-4 sm:mb-6">
                <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">دسترسی محدود</h2>
              <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 leading-relaxed">
                مدیریت اقساط و نسیه فقط در پلن حرفه‌ای و بالاتر در دسترس است
              </p>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-2 w-full"
                onClick={() => setCurrentView('upgrade-plan')}
              >
                <Crown className="w-4 h-4" />
                ارتقا پلن
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Plan Details View (اقساط) ★★★
  // ═══════════════════════════════════════════════════════════════

  if (selectedPlan && activeTab === 'installments') {
    const installments = selectedPlan.schedules || []
    const paidCount = selectedPlan.paidCount ?? selectedPlan.schedules.filter(s => s.status?.toLowerCase() === 'paid').length
    const totalCount = selectedPlan.totalInstallments || installments.length
    const progressPct = selectedPlan.progressPct ?? (totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0)
    const overdueItems = installments.filter(s => isOverdue(s))

    return (
      <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">
        <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0 sticky top-0 z-40">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button 
                onClick={() => setSelectedPlan(null)}
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg hover:bg-gray-100 text-gray-600 shrink-0"
              >
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-gray-900 truncate">جزئیات اقساط</h1>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">{selectedPlan.customerName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {!isOnline && (
                <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden sm:inline">آفلاین</span>
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setIsSyncing(true)
                  await loadData()
                  setIsSyncing(false)
                }}
                disabled={isSyncing || !isOnline}
                className="h-8 text-xs"
              >
                {isSyncing ? (
                  <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 ml-1" />
                )}
                <span className="hidden sm:inline">بروزرسانی</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 truncate">مبلغ کل</p>
                <p className="text-sm sm:text-base font-bold text-white truncate">{formatCurrency(selectedPlan.totalAmount)}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 truncate">پرداخت شده</p>
                <p className="text-sm sm:text-base font-bold text-white truncate">{formatCurrency(selectedPlan.totalPaidAmount)}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 truncate">باقیمانده</p>
                <p className="text-sm sm:text-base font-bold text-white truncate">{formatCurrency(selectedPlan.remainingAmount)}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 truncate">پیشرفت</p>
                <p className="text-sm sm:text-base font-bold text-white truncate">{progressPct}%</p>
              </div>
            </div>
          </div>

          <div className="md:hidden space-y-2">
            {installments.length === 0 ? (
              <Card className="bg-white">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-400">هنوز قسط ثبت نشده است</p>
                </CardContent>
              </Card>
            ) : (
              installments.map((ins) => {
                const overdue = isOverdue(ins)
                const isPaid = ins.status?.toLowerCase() === 'paid'
                const isPaying = payingScheduleId === ins.id

                return (
                  <Card key={ins.id} className={`bg-white ${overdue && !isPaid ? 'border-red-200' : ''}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">قسط {formatNumber(ins.installmentNumber)}</span>
                        {overdue && !isPaid ? (
                          <Badge className="bg-red-100 text-red-700 text-[9px]">سررسید گذشته</Badge>
                        ) : (
                          getInstallmentStatusBadge(ins.status)
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div className="bg-gray-50 rounded p-1.5 text-center">
                          <p className="text-gray-400">مبلغ</p>
                          <p className="font-bold mt-0.5">{formatCurrency(ins.amount)}</p>
                        </div>
                        <div className="bg-blue-50 rounded p-1.5 text-center">
                          <p className="text-gray-400">سررسید</p>
                          <p className="font-bold mt-0.5">{formatDateShort(ins.dueDate)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded p-1.5 text-center">
                          <p className="text-gray-400">پرداخت</p>
                          <p className="font-bold mt-0.5 text-emerald-600">{formatDateShort(ins.paidAt)}</p>
                        </div>
                      </div>

                      {isPaid ? (
                        <div className="flex items-center justify-center gap-2 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs text-emerald-700 font-medium">پرداخت شده</span>
                        </div>
                      ) : isPaying ? (
                        <Button disabled className="w-full h-8 text-xs">
                          <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                          در حال ثبت...
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handlePayClick(ins)}
                          className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1"
                        >
                          <Banknote className="w-3 h-3" />
                          پرداخت کنید
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          <div className="hidden md:block">
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">لیست اقساط</CardTitle>
                    <CardDescription className="text-xs">
                      {formatNumber(selectedPlan.numberOfInstallments || totalCount)} قسطه — سررسید هر {getPeriodLabel(selectedPlan.installmentPeriod)}
                    </CardDescription>
                  </div>
                  {overdueItems.length > 0 && (
                    <Badge className="bg-red-100 text-red-700 text-[10px]">
                      {formatNumber(overdueItems.length)} قسط معوق
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs">شماره</TableHead>
                        <TableHead className="text-xs text-right">مبلغ</TableHead>
                        <TableHead className="text-xs">سررسید</TableHead>
                        <TableHead className="text-xs">تاریخ پرداخت</TableHead>
                        <TableHead className="text-xs">وضعیت</TableHead>
                        <TableHead className="text-xs">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installments.map((ins) => {
                        const overdue = isOverdue(ins)
                        const isPaid = ins.status?.toLowerCase() === 'paid'
                        const isPaying = payingScheduleId === ins.id

                        return (
                          <TableRow key={ins.id} className={`hover:bg-purple-50/30 ${overdue ? 'bg-red-50/30' : ''}`}>
                            <TableCell className="text-xs font-mono">{formatNumber(ins.installmentNumber)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{formatCurrency(ins.amount)}</TableCell>
                            <TableCell className="text-xs">{formatDateShort(ins.dueDate)}</TableCell>
                            <TableCell className="text-xs">{formatDateShort(ins.paidAt)}</TableCell>
                            <TableCell>
                              {overdue && !isPaid
                                ? <Badge className="bg-red-100 text-red-700 text-[10px]">سررسید گذشته</Badge>
                                : getInstallmentStatusBadge(ins.status)
                              }
                            </TableCell>
                            <TableCell className="text-center">
                              {isPaid ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : isPaying ? (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
                              ) : (
                                <Button
                                  size="sm"
                                  className="h-7 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => handlePayClick(ins)}
                                >
                                  <Banknote className="w-3 h-3" />
                                  پرداخت
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
          <DialogContent dir="rtl" className="w-[calc(100%-1rem)] sm:w-full sm:max-w-md rounded-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                پرداخت قسط
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                قسط شماره {formatNumber(payingSchedule?.installmentNumber)} از {formatNumber(selectedPlan?.numberOfInstallments)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Card className="bg-gray-50/50 border-0">
                <CardContent className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500 text-[10px]">سررسید</p>
                      <p className="font-medium">{formatDate(payingSchedule?.dueDate)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[10px]">مشتری</p>
                      <p className="font-medium truncate">{selectedPlan?.customerName || '---'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[10px]">فاکتور</p>
                      <p className="font-mono text-[10px]">{selectedPlan?.invoiceNumber || '---'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[10px]">مبلغ قسط</p>
                      <p className="font-bold text-amber-700 text-xs">{formatCurrency(payingSchedule?.amount)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {!isOnline && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-800">
                  <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>برای ثبت پرداخت و صدور سند حسابداری، باید به اینترنت متصل باشید.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">مبلغ پرداخت <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="مبلغ به ریال"
                  className="text-left font-mono text-xs h-9"
                  max={payingSchedule?.amount}
                  min={1}
                  disabled={!isOnline}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">روش پرداخت <span className="text-red-500">*</span></Label>
                <Select value={payMethod} onValueChange={setPayMethod} disabled={!isOnline}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="انتخاب روش پرداخت" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدی (صندوق)</SelectItem>
                    <SelectItem value="card">کارتخوان</SelectItem>
                    <SelectItem value="bank">بانکی (واریز)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">تاریخ پرداخت <span className="text-red-500">*</span></Label>
                <ShamsiDatePicker
                  value={payDate}
                  onChange={setPayDate}
                  placeholder="انتخاب تاریخ پرداخت"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">شماره مرجع (اختیاری)</Label>
                <Input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="شماره فیش / تراکنش"
                  className="text-left font-mono text-xs h-9"
                  disabled={!isOnline}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">یادداشت (اختیاری)</Label>
                <Input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="توضیحات پرداخت..."
                  className="text-xs h-9"
                  disabled={!isOnline}
                />
              </div>

              {isOnline && (
                <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100 text-[10px] text-blue-700">
                  <CreditCard className="w-3 h-3 shrink-0 mt-0.5" />
                  <p>با ثبت پرداخت، سند حسابداری و بدهی مشتری بروزرسانی می‌شوند.</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 flex-row pt-2 border-t">
              <Button variant="outline" onClick={() => setPayDialogOpen(false)} className="h-9 text-xs flex-1">
                انصراف
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 h-9 text-xs flex-1 gap-1.5"
                onClick={handlePayConfirm}
                disabled={!isOnline || !payAmount || Number(payAmount) <= 0 || !payDate}
              >
                {!isOnline ? (
                  <><WifiOff className="w-3.5 h-3.5" />عدم دسترسی</>
                ) : (
                  <><Wallet className="w-3.5 h-3.5" />تأیید پرداخت</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Main Layout with Tabs ★★★
  // ═══════════════════════════════════════════════════════════════

  return (
    <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">
      {/* ─── Header با تب‌ها ─────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-5 lg:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-xl bg-emerald-600 text-white shrink-0">
              <CreditCard className="w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 leading-tight">اقساط و نسیه</h1>
              <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">
                {activeTab === 'installments' 
                  ? `${formatNumber(plans.length)} طرح قسطی` 
                  : `${formatNumber(creditInvoices.length)} فاکتور نسیه باز`}
              </p>
            </div>
          </div>

          {/* تب‌ها */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 order-3 sm:order-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('installments')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'installments'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>اقساط</span>
                {plans.length > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    activeTab === 'installments' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {formatNumber(plans.length)}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('credit')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'credit'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                <span>نسیه</span>
                {creditInvoices.length > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    activeTab === 'credit' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {formatNumber(creditInvoices.length)}
                  </span>
                )}
              </span>
            </button>
          </div>

          {/* دکمه‌های اقدام */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 order-2 sm:order-3">
            {!isOnline && (
              <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50 px-1.5">
                <WifiOff className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">آفلاین</span>
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setIsSyncing(true)
                if (activeTab === 'installments') {
                  await loadData()
                } else {
                  await loadCreditData()
                }
                setIsSyncing(false)
              }}
              disabled={isSyncing || !isOnline}
              className="h-8 sm:h-9 px-2 sm:px-3 gap-1 text-xs sm:text-sm"
            >
              <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">بروزرسانی</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── محتوای تب اقساط ─────────────────────────────────── */}
      {activeTab === 'installments' && (
        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4">
          {/* Loading State */}
          {loading && plans.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
              <p className="text-sm text-gray-500">در حال بارگذاری...</p>
            </div>
          )}

          {/* Error State */}
          {error && plans.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
              <p className="text-sm text-red-600 mb-2">{error}</p>
              {isOnline && (
                <Button variant="outline" size="sm" onClick={loadData}>
                  تلاش مجدد
                </Button>
              )}
            </div>
          )}

          {!loading || plans.length > 0 ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">اقساط پرداخت‌شده</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatNumber(summaryStats.paidInstallmentsCount)} قسط
                    </p>
                    <p className="text-[10px] text-white/70 truncate">
                      {formatCurrency(summaryStats.totalPaidAmount)}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">اقساط باقیمانده</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatNumber(summaryStats.remainingInstallmentsCount)} قسط
                    </p>
                    <p className="text-[10px] text-white/70 truncate">
                      {formatCurrency(summaryStats.totalRemainingAmount)}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">اقساط معوق</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatNumber(summaryStats.overdueInstallmentsCount)} قسط
                    </p>
                    <p className="text-[10px] text-white/70 truncate">
                      {formatCurrency(summaryStats.overdueAmount)}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">مجموع کل اقساط</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatNumber(summaryStats.totalInstallmentsCount)} قسط
                    </p>
                    <p className="text-[10px] text-white/70 truncate">
                      در {formatNumber(plans.length)} طرح
                    </p>
                  </div>
                </div>
              </div>

              {/* Search + Filter */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1 w-full">
                  <div className={`${mobileSearchOpen ? 'block' : 'hidden sm:block'}`}>
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                      autoFocus={mobileSearchOpen}
                      type="text"
                      placeholder="جستجو مشتری یا شماره فاکتور..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onBlur={() => { if (!search && window.innerWidth < 640) setMobileSearchOpen(false) }}
                      className="w-full pr-9 pl-3 h-9 sm:h-10 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  {!mobileSearchOpen && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setMobileSearchOpen(true)}
                      className="h-9 w-full sm:hidden flex items-center justify-center gap-2"
                    >
                      <Search className="w-4 h-4" />
                      جستجو
                    </Button>
                  )}
                </div>

                <Button
                  variant={showOnlyOverdue ? "destructive" : "outline"}
                  onClick={() => setShowOnlyOverdue(!showOnlyOverdue)}
                  className={`flex items-center justify-center gap-1.5 h-9 sm:h-10 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    showOnlyOverdue ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>فقط معوق</span>
                  {overdueCount > 0 && (
                    <span className={`text-[9px] rounded-full px-1.5 py-0.5 ${
                      showOnlyOverdue ? 'bg-white text-red-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {formatNumber(overdueCount)}
                    </span>
                  )}
                </Button>
              </div>

              {/* Plans List - Mobile */}
              <div className="md:hidden space-y-2">
                {filteredPlans.length === 0 ? (
                  <Card className="bg-white">
                    <CardContent className="p-6 text-center">
                      <p className="text-xs text-gray-400">
                        {search ? 'طرح قسطی با این مشخصات یافت نشد' : 'هنوز طرح قسطی ثبت نشده است'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredPlans.map((plan) => (
                    <MobileInstallmentCard
                      key={plan.id}
                      plan={plan}
                      onSelectPlan={setSelectedPlan}
                    />
                  ))
                )}
              </div>

              {/* Plans Table - Desktop */}
              <div className="hidden md:block">
                <Card className="bg-white">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      {filteredPlans.length === 0 ? (
                        <div className="p-8 text-center text-sm text-gray-400">
                          {search ? 'طرح قسطی با این مشخصات یافت نشد' : 'هنوز طرح قسطی ثبت نشده است'}
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/80">
                              <TableHead className="text-xs">مشتری</TableHead>
                              <TableHead className="text-xs">فاکتور</TableHead>
                              <TableHead className="text-xs text-right">مبلغ کل</TableHead>
                              <TableHead className="text-xs text-right">باقیمانده</TableHead>
                              <TableHead className="text-xs">اقساط</TableHead>
                              <TableHead className="text-xs">وضعیت</TableHead>
                              <TableHead className="text-xs">پیشرفت</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredPlans.map((plan) => {
                              const paidCount = plan.paidCount ?? plan.schedules.filter(s => s.status?.toLowerCase() === 'paid').length
                              const totalCount = plan.totalInstallments || plan.schedules.length
                              const progressPct = plan.progressPct ?? (totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0)
                              const planOverdueItems = plan.schedules.filter(s => isOverdue(s))

                              return (
                                <TableRow
                                  key={plan.id}
                                  className="hover:bg-purple-50/30 cursor-pointer transition-colors"
                                  onClick={() => setSelectedPlan(plan)}
                                >
                                  <TableCell className="text-xs font-medium">{plan.customerName}</TableCell>
                                  <TableCell className="text-xs font-mono">{plan.invoiceNumber}</TableCell>
                                  <TableCell className="text-xs text-right">{formatCurrency(plan.totalAmount)}</TableCell>
                                  <TableCell className="text-xs text-right font-bold text-amber-600">{formatCurrency(plan.remainingAmount)}</TableCell>
                                  <TableCell className="text-xs">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-[10px]">
                                      {formatNumber(paidCount)}/{formatNumber(totalCount)}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    {planOverdueItems.length > 0 ? (
                                      <Badge className="bg-red-100 text-red-700 text-[10px]">
                                        {formatNumber(planOverdueItems.length)} معوق
                                      </Badge>
                                    ) : (
                                      getStatusBadge(plan.status)
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${
                                            plan.status === 'completed' ? 'bg-emerald-500' : planOverdueItems.length > 0 ? 'bg-red-500' : 'bg-blue-500'
                                          }`}
                                          style={{ width: `${progressPct}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] text-gray-400 min-w-[30px]">{progressPct}%</span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ─── محتوای تب نسیه ─────────────────────────────────── */}
      {activeTab === 'credit' && (
        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4">
          {/* Loading State */}
          {creditLoading && creditInvoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-3" />
              <p className="text-sm text-gray-500">در حال بارگذاری فاکتورهای نسیه...</p>
            </div>
          )}

          {/* Error State */}
          {creditError && creditInvoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
              <p className="text-sm text-red-600 mb-2">{creditError}</p>
              <Button variant="outline" size="sm" onClick={loadCreditData}>
                تلاش مجدد
              </Button>
            </div>
          )}

          {!creditLoading || creditInvoices.length > 0 ? (
            <>
              {/* Summary Cards نسیه */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">فاکتورهای نسیه</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatNumber(creditSummary.totalInvoices)} فاکتور
                    </p>
                    <p className="text-[10px] text-white/70 truncate">باز و در انتظار</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">مبلغ کل نسیه</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatCurrency(creditSummary.totalAmount)}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">دریافت شده</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatCurrency(creditSummary.totalPaid)}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="shrink-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-white/80 truncate">مانده طلب</p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {formatCurrency(creditSummary.totalRemaining)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="جستجو مشتری یا شماره فاکتور نسیه..."
                  value={creditSearch}
                  onChange={(e) => setCreditSearch(e.target.value)}
                  className="w-full pr-9 pl-3 h-9 sm:h-10 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-purple-400"
                />
              </div>

              {/* Credit List - Mobile */}
              <div className="md:hidden space-y-2">
                {filteredCreditInvoices.length === 0 ? (
                  <Card className="bg-white">
                    <CardContent className="p-6 text-center">
                      <p className="text-xs text-gray-400">
                        {creditSearch ? 'فاکتور نسیه‌ای با این مشخصات یافت نشد' : 'هیچ فاکتور نسیه بازی وجود ندارد'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredCreditInvoices.map((inv) => (
                    <MobileCreditCard
                      key={inv.id}
                      invoice={inv}
                      onPay={handleCreditPayClick}
                    />
                  ))
                )}
              </div>

              {/* Credit Table - Desktop */}
              <div className="hidden md:block">
                <Card className="bg-white">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      {filteredCreditInvoices.length === 0 ? (
                        <div className="p-8 text-center text-sm text-gray-400">
                          {creditSearch ? 'فاکتور نسیه‌ای با این مشخصات یافت نشد' : 'هیچ فاکتور نسیه بازی وجود ندارد'}
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/80">
                              <TableHead className="text-xs">مشتری</TableHead>
                              <TableHead className="text-xs">فاکتور</TableHead>
                              <TableHead className="text-xs text-right">مبلغ کل</TableHead>
                              <TableHead className="text-xs text-right">پرداخت شده</TableHead>
                              <TableHead className="text-xs text-right">باقیمانده</TableHead>
                              <TableHead className="text-xs">وضعیت</TableHead>
                              <TableHead className="text-xs">تاریخ</TableHead>
                              <TableHead className="text-xs text-center">عملیات</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredCreditInvoices.map((inv) => {
                              const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0)
                              return (
                                <TableRow key={inv.id} className="hover:bg-purple-50/30 transition-colors">
                                  <TableCell className="text-xs font-medium">{inv.customerName || 'فروش عمومی'}</TableCell>
                                  <TableCell className="text-xs font-mono">{inv.invoiceNumber || inv.number}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">{formatCurrency(inv.totalAmount)}</TableCell>
                                  <TableCell className="text-xs text-right font-mono text-emerald-600">{formatCurrency(inv.paidAmount)}</TableCell>
                                  <TableCell className="text-xs text-right font-mono font-bold text-amber-600">{formatCurrency(remaining)}</TableCell>
                                  <TableCell>{getCreditStatusBadge(inv.status, inv.paymentStatus)}</TableCell>
                                  <TableCell className="text-xs">{formatDateShort(inv.createdAt)}</TableCell>
                                  <TableCell className="text-center">
                                    {remaining > 0 ? (
                                      <Button
                                        size="sm"
                                        className="h-7 text-[10px] gap-1 bg-purple-600 hover:bg-purple-700"
                                        onClick={() => handleCreditPayClick(inv)}
                                      >
                                        <Banknote className="w-3 h-3" />
                                        پرداخت
                                      </Button>
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ─── Dialog پرداخت نسیه ─────────────────────────────── */}
      <Dialog open={creditPayDialogOpen} onOpenChange={(open) => {
        if (!creditPaySubmitting) setCreditPayDialogOpen(open)
        if (!open) {
          setCreditInvoiceToPay(null)
          setCreditPayAmount('')
          setCreditPayRef('')
          setCreditPayDate('')
        }
      }}>
        <DialogContent dir="rtl" className="w-[calc(100%-1rem)] sm:w-full sm:max-w-md rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              پرداخت فاکتور نسیه
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              فاکتور {creditInvoiceToPay?.invoiceNumber || creditInvoiceToPay?.number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Card className="bg-gray-50/50 border-0">
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">مشتری</span>
                  <span className="font-medium">{creditInvoiceToPay?.customerName || 'فروش عمومی'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-gray-500 text-[10px]">مبلغ کل</p>
                    <p className="font-bold text-gray-700">{formatCurrency(creditInvoiceToPay?.totalAmount)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-[10px]">پرداخت شده</p>
                    <p className="font-bold text-emerald-600">{formatCurrency(creditInvoiceToPay?.paidAmount)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-[10px]">باقیمانده</p>
                    <p className="font-bold text-amber-600">
                      {formatCurrency(((creditInvoiceToPay?.totalAmount || 0) - (creditInvoiceToPay?.paidAmount || 0)))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isOnline && (
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-800">
                <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>برای ثبت پرداخت و صدور سند حسابداری، باید به اینترنت متصل باشید.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">مبلغ پرداخت <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                value={creditPayAmount}
                onChange={(e) => setCreditPayAmount(e.target.value)}
                placeholder="مبلغ به ریال"
                className="text-left font-mono text-xs h-9"
                disabled={creditPaySubmitting || !isOnline}
              />
              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setCreditPayAmount(String(((creditInvoiceToPay?.totalAmount || 0) - (creditInvoiceToPay?.paidAmount || 0))))}
                  disabled={creditPaySubmitting || !isOnline}
                >
                  کل باقیمانده
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">روش پرداخت <span className="text-red-500">*</span></Label>
              <Select value={creditPayMethod} onValueChange={setCreditPayMethod} disabled={creditPaySubmitting || !isOnline}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="انتخاب روش پرداخت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدی (صندوق)</SelectItem>
                  <SelectItem value="card">کارتخوان</SelectItem>
                  <SelectItem value="bank">بانکی (واریز)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">تاریخ پرداخت <span className="text-red-500">*</span></Label>
              <ShamsiDatePicker
                value={creditPayDate}
                onChange={setCreditPayDate}
                placeholder="انتخاب تاریخ پرداخت"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">شماره مرجع (اختیاری)</Label>
              <Input
                type="text"
                value={creditPayRef}
                onChange={(e) => setCreditPayRef(e.target.value)}
                placeholder="شماره فیش / تراکنش"
                className="text-left font-mono text-xs h-9"
                disabled={creditPaySubmitting || !isOnline}
              />
            </div>

            {isOnline && (
              <div className="flex items-start gap-2 p-2 bg-purple-50 rounded-lg border border-purple-100 text-[10px] text-purple-700">
                <CreditCard className="w-3 h-3 shrink-0 mt-0.5" />
                <p>با ثبت پرداخت، سند حسابداری و بدهی مشتری بروزرسانی می‌شوند.</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-row pt-2 border-t">
            <Button 
              variant="outline" 
              className="flex-1 h-9 text-xs"
              onClick={() => {
                setCreditPayDialogOpen(false)
                setCreditInvoiceToPay(null)
                setCreditPayAmount('')
                setCreditPayRef('')
                setCreditPayDate('')
              }}
              disabled={creditPaySubmitting}
            >
              انصراف
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 h-9 text-xs flex-1 gap-1.5"
              onClick={handleCreditPayConfirm}
              disabled={creditPaySubmitting || !isOnline || !creditPayAmount || Number(creditPayAmount) <= 0 || !creditPayDate}
            >
              {creditPaySubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />در حال ثبت...</>
              ) : !isOnline ? (
                <><WifiOff className="w-4 h-4" />عدم دسترسی</>
              ) : (
                <><Wallet className="w-4 h-4" />ثبت پرداخت</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}