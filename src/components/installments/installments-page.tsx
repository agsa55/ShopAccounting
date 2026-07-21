'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { CreditCard, Search, CheckCircle2, Clock, AlertTriangle, RefreshCw, Loader2, Banknote, Lock, Crown, Wallet, Calendar as CalendarIcon } from 'lucide-react'
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

// ═══════════════════════════════════════════════════════════════
// ★★★ Types — سازگار با خروجی API واقعی ★★★
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
  // فیلدهای محاسباتی
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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '---'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '---'
    // ★★★ v3.4: الگوریتم مستقیم شمسی (بدون وابستگی به locale)
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
    return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}`
  } catch {
    return '---'
  }
}

// ★★★ v3.4: تاریخ کوتاه شمسی (۱۴۰۵/۰۳/۳۱) ★★★
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
// ★★★ v3.4: توابع شمسی + ShamsiDatePicker ★★★
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
  // ★ بررسی سررسید گذشته بر اساس تاریخ
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">در انتظار</Badge>
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
// ★★★ Main Component ★★★
// ═══════════════════════════════════════════════════════════════

export default function InstallmentsPage() {
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
  // ★★★ v3.3: state جدید برای روش و مبلغ پرداخت ★★★
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  // ★★★ v3.4: تاریخ پرداخت (ISO yyyy-mm-dd) ★★★
  const [payDate, setPayDate] = useState('')

  const { toast } = useToast()
  const tenantId = useStore((s) => s.tenantId)

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Plan Feature Gating ★★★
  // ═══════════════════════════════════════════════════════════════

  const planName = useStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const setCurrentView = useStore((s) => s.setCurrentView)

  // ═══════════════════════════════════════════════════════════════
  // ★★★ بارگذاری داده‌ها از API ★★★
  // ═══════════════════════════════════════════════════════════════

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/installment-plans', {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`خطا در دریافت اطلاعات: ${res.status}`)
      }

      const result = await res.json()

      if (result.success) {
        setPlans(result.data || [])
        setSummary(result.summary || null)
      } else {
        throw new Error(result.error || 'خطای ناشناخته')
      }
    } catch (err: any) {
      console.error('[InstallmentsPage] Load error:', err)
      setError(err.message || 'خطا در بارگذاری اطلاعات')
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [])

  // ★ بارگذاری اولیه
  useEffect(() => {
    loadData()
  }, [loadData])

  // ★ بروزرسانی خودکار هر ۶۰ ثانیه
  useEffect(() => {
    const interval = setInterval(() => {
      loadData()
    }, 60000)
    return () => clearInterval(interval)
  }, [loadData])

  // ★★★ v3.39: state برای فیلتر فقط سررسید‌شده‌ها
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false)

  // ★ فیلتر بر اساس جستجو
  let filteredPlans = plans.filter((plan) =>
    plan.customerName.includes(search) || plan.invoiceNumber.toLowerCase().includes(search.toLowerCase())
  )

  // ★★★ v3.39: فیلتر فقط پلن‌هایی که حداقل یک قسط سررسید‌شده دارند
  if (showOnlyOverdue) {
    filteredPlans = filteredPlans.filter((plan) =>
      plan.schedules.some((s) => isOverdue(s))
    )
  }

  // ★ بازنگری در وضعیت اقساط سررسید گذشته (محلی)
  const overdueCount = plans.reduce((sum, plan) => {
    return sum + plan.schedules.filter(s => isOverdue(s)).length
  }, 0)

  const totalRemaining = plans.reduce((sum, plan) => sum + (plan.remainingAmount || 0), 0)

  // ═══════════════════════════════════════════════════════════════
  // ★★★ پرداخت قسط ★★★
  // ═══════════════════════════════════════════════════════════════

  const handlePayClick = (schedule: ScheduleItem) => {
    if (schedule.status?.toLowerCase() === 'paid') return
    setPayingSchedule(schedule)
    setPayNotes('')
    setPayRef('')
    setPayMethod('cash')
    // ★★★ v3.3: مبلغ پیش‌فرض = مبلغ قسط
    setPayAmount(String(schedule.amount))
    // ★★★ v3.4: پیش‌فرض تاریخ پرداخت = امروز
    setPayDate(new Date().toISOString().split('T')[0])
    setPayDialogOpen(true)
  }

  const handlePayConfirm = async () => {
    if (!payingSchedule) return

    // ★★★ v3.3: اعتبارسنجی مبلغ
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      toast({
        title: 'خطا',
        description: 'مبلغ پرداخت باید بزرگتر از صفر باشد',
      })
      return
    }

    if (amount > payingSchedule.amount + 1) {
      toast({
        title: 'خطا',
        description: `مبلغ پرداخت نمی‌تواند بیش از مبلغ قسط (${formatCurrency(payingSchedule.amount)}) باشد`,
      })
      return
    }

    setPayingScheduleId(payingSchedule.id)
    setPayDialogOpen(false)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      // ★★★ v3.39: استفاده از API جدید که سند حسابداری خودکار هم می‌سازد
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
          // ★★★ v3.4: ارسال تاریخ پرداخت انتخاب‌شده
          paidAt: payDate || undefined,
        }),
      })

      const result = await res.json()

      if (result.success) {
        toast({
          title: 'پرداخت موفق',
          description: result.message || `قسط شماره ${formatNumber(payingSchedule.installmentNumber)} با مبلغ ${formatCurrency(amount)} پرداخت شد`,
        })

        // ★ بروزرسانی لیست
        await loadData()

        // ★ اگر در جزئیات طرح هستیم، بروزرسانی طرح انتخاب‌شده
        if (selectedPlan) {
          const updatedPlan = await fetchPlanDetail(selectedPlan.id)
          if (updatedPlan) setSelectedPlan(updatedPlan)
        }
      } else {
        toast({
          title: 'خطا در پرداخت',
          description: result.error || 'خطای ناشناخته',
        })
      }
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: 'خطا در ارتباط با سرور',
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

  const fetchPlanDetail = async (planId: string): Promise<PlanItem | null> => {
    try {
      const res = await fetch(`/api/installment-plans?id=${planId}`)
      const result = await res.json()
      if (result.success) return result.data
      return null
    } catch {
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ Feature Gate — نمایش صفحه قفل شده ★★★
  // ═══════════════════════════════════════════════════════════════

  if (!planFeatures.canAccessInstallments) {
    return (
      <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-md border-0 shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 mx-auto mb-6">
                <Lock className="w-10 h-10 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">دسترسی محدود</h2>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                مدیریت اقساط فقط در پلن حرفه‌ای و بالاتر در دسترس است
              </p>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
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
  // ★★★ نمایش جزئیات طرح قسطی ★★★
  // ═══════════════════════════════════════════════════════════════

  if (selectedPlan) {
    const installments = selectedPlan.schedules || []
    const paidCount = selectedPlan.paidCount ?? selectedPlan.schedules.filter(s => s.status?.toLowerCase() === 'paid').length
    const totalCount = selectedPlan.totalInstallments || installments.length
    const progressPct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0
    const overdueItems = installments.filter(s => isOverdue(s))

    return (
      <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">
        <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 text-white">
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h1 className="text-sm sm:text-lg font-bold text-gray-900">جزئیات اقساط</h1>
                <p className="text-[10px] sm:text-xs text-gray-500">{selectedPlan.customerName} — فاکتور {selectedPlan.invoiceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const updated = await fetchPlanDetail(selectedPlan.id)
                  if (updated) {
                    setSelectedPlan(updated)
                    toast({ title: 'بروزرسانی', description: 'اطلاعات بروزرسانی شد' })
                  }
                }}
              >
                <RefreshCw className="w-3 h-3 ml-1" />
                بروزرسانی
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedPlan(null)}>
                بازگشت
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">مبلغ کل</p>
                <p className="text-sm font-bold">{formatCurrency(selectedPlan.totalAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">پرداخت شده</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(selectedPlan.totalPaidAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">باقیمانده</p>
                <p className="text-sm font-bold text-amber-600">{formatCurrency(selectedPlan.remainingAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">پیشرفت</p>
                <p className="text-sm font-bold">{formatNumber(paidCount)}/{formatNumber(totalCount)} ({progressPct}%)</p>
              </CardContent>
            </Card>
          </div>

          {/* Info Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">پیش‌پرداخت</p>
                <p className="text-sm font-bold text-blue-600">{formatCurrency(selectedPlan.downPayment)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">سود</p>
                <p className="text-sm font-bold">{formatNumber(selectedPlan.interestRate)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">مبلغ کل با سود</p>
                <p className="text-sm font-bold">{formatCurrency(selectedPlan.totalWithInterest)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-gray-500">دوره پرداخت</p>
                <p className="text-sm font-bold">{getPeriodLabel(selectedPlan.installmentPeriod)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Installments Table */}
          <Card>
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
            <CardContent className="p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
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
                      <TableRow key={ins.id} className={overdue ? 'bg-red-50/50' : ''}>
                        <TableCell className="text-xs">{formatNumber(ins.installmentNumber)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(ins.amount)}</TableCell>
                        <TableCell className="text-xs">{formatDate(ins.dueDate)}</TableCell>
                        <TableCell className="text-xs">{formatDate(ins.paidAt)}</TableCell>
                        <TableCell>
                          {overdue && !isPaid
                            ? <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">سررسید گذشته</Badge>
                            : getInstallmentStatusBadge(ins.status)
                          }
                        </TableCell>
                        <TableCell>
                          {isPaid ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : isPaying ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1"
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
            </CardContent>
          </Card>
        </div>

        {/* ★★★ v3.3: Pay Dialog — با فیلد مبلغ، روش پرداخت و شماره مرجع ★★★ */}
        <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-600" />
                پرداخت قسط
              </DialogTitle>
              <DialogDescription>
                قسط شماره {formatNumber(payingSchedule?.installmentNumber)} از {formatNumber(selectedPlan?.numberOfInstallments)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {/* ★ اطلاعات قسط */}
              <Card className="bg-gray-50/50">
                <CardContent className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-gray-500">سررسید</p>
                      <p className="font-medium">{formatDate(payingSchedule?.dueDate)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">مشتری</p>
                      <p className="font-medium truncate">{selectedPlan?.customerName || '---'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">فاکتور</p>
                      <p className="font-mono">{selectedPlan?.invoiceNumber || '---'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">مبلغ قسط</p>
                      <p className="font-bold text-amber-700">{formatCurrency(payingSchedule?.amount)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ★ مبلغ پرداخت */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">مبلغ پرداخت <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="مبلغ به تومان"
                  className="text-left font-mono"
                  max={payingSchedule?.amount}
                  min={1}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] w-full"
                  onClick={() => setPayAmount(String(payingSchedule?.amount || 0))}
                >
                  پرداخت کامل قسط ({formatCurrency(payingSchedule?.amount)})
                </Button>
              </div>

              {/* ★ روش پرداخت */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">روش پرداخت <span className="text-red-500">*</span></Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
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
                  value={payDate}
                  onChange={setPayDate}
                  placeholder="انتخاب تاریخ پرداخت"
                />
              </div>

              {/* ★ شماره مرجع */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">شماره مرجع (اختیاری)</Label>
                <Input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="شماره فیش / تراکنش / چک"
                  className="text-left font-mono"
                />
              </div>

              {/* ★ یادداشت */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">یادداشت (اختیاری)</Label>
                <Input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="توضیحات پرداخت..."
                />
              </div>

              {/* ★ هشدار accounting */}
              <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                <CreditCard className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  با ثبت پرداخت، سند حسابداری خودکار (بدهکار صندوق/بانک، بستانکار حساب‌های دریافتنی) ایجاد می‌شود و بدهی مشتری کاهش می‌یابد.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setPayDialogOpen(false)}
              >
                انصراف
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                onClick={handlePayConfirm}
                disabled={!payAmount || Number(payAmount) <= 0 || !payDate}
              >
                <Wallet className="w-4 h-4" />
                تأیید پرداخت
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ لیست طرح‌های قسطی ★★★
  // ═══════════════════════════════════════════════════════════════

  return (
    <div dir="rtl" className="flex flex-col h-full bg-gray-50/80">
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 text-white">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-bold text-gray-900">اقساط</h1>
              <p className="text-[10px] sm:text-xs text-gray-500">مدیریت اقساط مشتریان</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 ml-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 ml-1" />
            )}
            بروزرسانی
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
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
            <Button variant="outline" size="sm" onClick={loadData}>
              تلاش مجدد
            </Button>
          </div>
        )}

        {/* Content */}
        {!loading || plans.length > 0 ? (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-gray-500">اقساط فعال</p>
                  <p className="text-sm font-bold text-blue-600">
                    {formatNumber(summary?.activePlans ?? plans.filter(p => p.status?.toLowerCase() === 'active').length)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-gray-500">اقساط معوق</p>
                  <p className="text-sm font-bold text-red-600">
                    {formatNumber(summary?.totalOverdueInstallments ?? overdueCount)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-gray-500">مانده کل</p>
                  <p className="text-sm font-bold">{formatCurrency(summary?.totalRemaining ?? totalRemaining)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Search + Filter */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="جستجوی مشتری یا شماره فاکتور..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pr-10 pe-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                />
              </div>
              {/* ★★★ v3.39: دکمه فیلتر فقط سررسید‌شده‌ها */}
              <button
                onClick={() => setShowOnlyOverdue(!showOnlyOverdue)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                  showOnlyOverdue
                    ? 'bg-red-100 text-red-700 border-2 border-red-300'
                    : 'bg-white text-gray-500 border-2 border-gray-200 hover:border-gray-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                فقط سررسید‌شده
                {overdueCount > 0 && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                    showOnlyOverdue ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'
                  }`}>
                    {formatNumber(overdueCount)}
                  </span>
                )}
              </button>
            </div>

            {/* Installment Plans List */}
            <div className="space-y-3">
              {filteredPlans.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  {search ? 'طرح قسطی با این مشخصات یافت نشد' : 'هنوز طرح قسطی ثبت نشده است'}
                </div>
              ) : (
                filteredPlans.map((plan) => {
                  const paidCount = plan.paidCount ?? plan.schedules.filter(s => s.status?.toLowerCase() === 'paid').length
                  const totalCount = plan.totalInstallments || plan.schedules.length
                  const progressPct = plan.progressPct ?? (totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0)
                  const planOverdueItems = plan.schedules.filter(s => isOverdue(s))

                  return (
                    <Card
                      key={plan.id}
                      className="cursor-pointer hover:border-emerald-300 transition-colors"
                      onClick={() => setSelectedPlan(plan)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${
                              planOverdueItems.length > 0 ? 'bg-red-100' : plan.status === 'completed' ? 'bg-emerald-100' : 'bg-blue-100'
                            }`}>
                              {planOverdueItems.length > 0 ? (
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                              ) : plan.status === 'completed' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <Clock className="w-5 h-5 text-blue-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{plan.customerName}</p>
                              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">
                                فاکتور {plan.invoiceNumber} • {formatNumber(plan.numberOfInstallments || totalCount)} قسطه • سررسید هر {getPeriodLabel(plan.installmentPeriod)}
                              </p>
                              {planOverdueItems.length > 0 && (
                                <p className="text-[10px] text-red-600 mt-0.5">
                                  {formatNumber(planOverdueItems.length)} قسط معوق
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-gray-900">{formatCurrency(plan.remainingAmount || plan.totalAmount)}</p>
                            <p className="text-[10px] text-gray-400">{progressPct}% پرداخت</p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-3 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              plan.status === 'completed' ? 'bg-emerald-500' : planOverdueItems.length > 0 ? 'bg-red-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          {getStatusBadge(plan.status)}
                          <span className="text-[10px] text-gray-400">
                            {formatNumber(paidCount)}/{formatNumber(totalCount)} قسط
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
