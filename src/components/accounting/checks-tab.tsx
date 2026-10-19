'use client'

// ============================================================================
// src/components/accounting/checks-tab.tsx — Checks Tab
// ShopAccounting v30.0 — Fiscal Year Aware + Fixed Jalali Date Picker
// ============================================================================
// ★ v30.0:
//   - اتصال به selectedFiscalYearId از useAppStore
//   - دکمه همه سنوات
//   - ثبت چک فقط در سال مالی فعال و باز
//   - تاریخ صدور داخل سال مالی فعال قفل می‌شود
//   - تاریخ سررسید می‌تواند بعد از سال مالی باشد
//   - ویرایش/حذف فقط با permission از API
//   - تغییر وضعیت فقط اگر سال مالی فعال باز باشد
//   - دیتاپیکر شمسی اصلاح‌شده و پایدار
//   - ریست فیلترها با تغییر سال مالی
//   - پشتیبانی آفلاین با هشدار مناسب
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '@/lib/store'
import {
  cacheChecks,
  getCachedChecks,
  addCheckToSyncQueue,
} from '@/lib/offline-db'
import { syncEngine } from '@/lib/sync-engine'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus,
  Search,
  Loader2,
  WifiOff,
  CreditCard,
  Eye,
  CheckCircle2,
  AlertCircle,
  Save,
  Pencil,
  Trash2,
  Calendar,
  Ban,
  Clock,
  Landmark,
  RotateCcw,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Printer,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { logger } from '@/lib/system-logger'
import { CheckPrinterModal } from '@/components/check-printer/CheckPrinterModal'
import type { CheckPrintData } from '@/components/check-printer/CheckPrinterModal'

// ─── Types ────────────────────────────────────────────────────

interface Check {
  id: string
  type: 'receivable' | 'payable'
  checkNumber: string
  bankName: string
  branchName?: string | null
  amount: number
  issueDate?: string
  dueDate: string
  customerId?: string | null
  supplierId?: string | null
  payee?: string | null
  payeeName?: string | null
  description?: string | null
  invoiceId?: string | null
  invoiceNumber?: string | null
  journalEntryId?: string | null
  fiscalYearId?: string | null
  fiscalYearName?: string | null
  customerName?: string | null
  status: 'pending' | 'deposited' | 'cleared' | 'bounced' | 'returned'
  createdAt?: string
  canEdit?: boolean
  canDelete?: boolean
  canChangeStatus?: boolean
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

interface FiscalYearInfo {
  id: string | null
  name: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  isClosed: boolean
}

// ─── Constants ───────────────────────────────────────────────

const LAST_ACTIVE_FY_KEY = 'shopaccounting_last_active_fiscal_year_id'

const ALL_YEARS_WARNING =
  'این لیست همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای ثبت/ویرایش رسمی، یک سال مالی فعال انتخاب کنید.'

const OFFLINE_CHECKS_WARNING =
  'در حالت آفلاین، چک‌ها از حافظه محلی نمایش داده می‌شوند. ثبت/ویرایش فقط وقتی مجاز است که سال مالی فعال از آخرین همگام‌سازی موفق شناخته شده باشد.'

// ─── Helpers ─────────────────────────────────────────────────

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  const token = localStorage.getItem('token')

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function toPersianDigits(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return String(val).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)] ?? d)
}

function toFaNum(n: number | string): string {
  return toPersianDigits(n)
}

function formatCurrency(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(Number(price)))
    return '۰ ریال'
  return `${Number(price).toLocaleString('fa-IR')} ریال`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function normalizeStatus(value: any): string {
  return String(value || '')
    .toLowerCase()
    .trim()
}

// ═══════════════════════════════════════════════════════════════
// Persian Date Utilities — Fixed
// ═══════════════════════════════════════════════════════════════

const LILAC = {
  popupBg: '#faf7ff',
  popupBgSolid: '#ffffff',
  headerBg: '#ede9fe',
  textPrimary: '#4c1d95',
  textSecondary: '#7c3aed',
  textMuted: '#a78bfa',
  textDisabled: '#d1d5db',
  textOnAccent: '#ffffff',
  border: '#e9d5ff',
  accent: '#7c3aed',
  accentLight: '#ede9fe',
  accentSoft: '#ddd6fe',
  todayBorder: '#a78bfa',
  todayText: '#6d28d9',
}

const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
]

const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

function div(a: number, b: number): number {
  return Math.floor(a / b)
}

function mod(a: number, b: number): number {
  return a - Math.floor(a / b) * b
}

function gregorianToJalali(
  gy: number,
  gm: number,
  gd: number
): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number

  if (gy > 1600) {
    jy = 979
    gy -= 1600
  } else {
    jy = 0
    gy -= 621
  }

  const gy2 = gm > 2 ? gy + 1 : gy

  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    g_d_m[gm - 1]

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

function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number
): [number, number, number] {
  let gy: number

  if (jy > 979) {
    gy = 1600
    jy -= 979
  } else {
    gy = 621
  }

  let days =
    365 * jy +
    div(jy, 33) * 8 +
    div(mod(jy, 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)

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

  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  let gm: number

  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm]
    if (gd <= v) break
    gd -= v
  }

  return [gy, gm, gd]
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ]

  const bl = breaks.length
  const gy = jy + 621

  let leapJ = -14
  let jp = breaks[0]
  let jm = 0
  let jump = 0
  let n = 0

  if (jy < jp || jy >= breaks[bl - 1]) {
    throw new Error('Invalid Jalaali year ' + jy)
  }

  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }

  n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)

  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33

  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { leap, gy, march }
}

function isJalaliLeapYear(jy: number): boolean {
  try {
    return jalCal(jy).leap === 0
  } catch {
    return false
  }
}

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm < 1 || jm > 12) return 0
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

function isValidGregorianDate(y: number, m: number, d: number): boolean {
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d
  )
}

function isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
  if (jy < 1 || jm < 1 || jm > 12 || jd < 1) return false
  return jd <= daysInJalaliMonth(jy, jm)
}

function gregorianToIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`
}

function jalaliToGregorianIso(jy: number, jm: number, jd: number): string {
  if (!isValidJalaliDate(jy, jm, jd)) return ''
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  if (!isValidGregorianDate(gy, gm, gd)) return ''
  return gregorianToIso(gy, gm, gd)
}

function extractYmd(value: string):
  | { year: number; month: number; day: number }
  | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function isLikelyJalaliYear(year: number): boolean {
  return year >= 1000 && year <= 1700
}

function isLikelyGregorianYear(year: number): boolean {
  return year >= 1701 && year <= 2400
}

function normalizeDateToGregorianIso(value: any): string | undefined {
  if (value === null || value === undefined || value === '') return undefined

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    return gregorianToIso(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    )
  }

const raw = String(value)
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۴۵۶۸۹'.indexOf(d)))
  .trim()
  if (!raw) return undefined

  if (/^\d{10,}$/.test(raw)) {
    const d = new Date(Number(raw))
    if (!Number.isNaN(d.getTime())) {
      return gregorianToIso(
        d.getFullYear(),
        d.getMonth() + 1,
        d.getDate()
      )
    }
  }

  const ymd = extractYmd(raw)

  if (ymd) {
    if (isLikelyJalaliYear(ymd.year)) {
      const iso = jalaliToGregorianIso(ymd.year, ymd.month, ymd.day)
      if (iso) return iso
    }

    if (
      isLikelyGregorianYear(ymd.year) &&
      isValidGregorianDate(ymd.year, ymd.month, ymd.day)
    ) {
      return gregorianToIso(ymd.year, ymd.month, ymd.day)
    }
  }

  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) {
    return gregorianToIso(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }

  return undefined
}

function toDateOnly(value: any): string | undefined {
  return normalizeDateToGregorianIso(value)
}

function isoToJalali(
  value: any
): { jy: number; jm: number; jd: number } | null {
  const iso = normalizeDateToGregorianIso(value)
  if (!iso) return null

  const [y, m, d] = iso.split('-').map(Number)
  if (!isValidGregorianDate(y, m, d)) return null

  const [jy, jm, jd] = gregorianToJalali(y, m, d)
  return { jy, jm, jd }
}

function jalaliToISO(jy: number, jm: number, jd: number): string {
  return jalaliToGregorianIso(jy, jm, jd)
}

function formatCheckDate(value: any): string {
  const j = isoToJalali(value)
  if (!j) return '—'

  return `${toPersianDigits(j.jy)}/${toPersianDigits(
    pad2(j.jm)
  )}/${toPersianDigits(pad2(j.jd))}`
}

function formatDate(d: any): string {
  return formatCheckDate(d)
}

function formatDateLong(d: any): string {
  const j = isoToJalali(d)
  if (!j) return '—'

  const monthName = JALALI_MONTHS[j.jm - 1] || ''
  return `${toPersianDigits(j.jd)} ${monthName} ${toPersianDigits(j.jy)}`
}

function getStatusBadge(status: string) {
  switch (normalizeStatus(status)) {
    case 'pending':
      return (
        <Badge className="bg-amber-100 text-amber-700 border border-amber-300 px-2.5 py-0.5 text-xs font-bold">
          ⏳ در جریان
        </Badge>
      )
    case 'deposited':
      return (
        <Badge className="bg-blue-100 text-blue-700 border border-blue-300 px-2.5 py-0.5 text-xs font-bold">
          🏦 نزد بانک
        </Badge>
      )
    case 'cleared':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 px-2.5 py-0.5 text-xs font-bold">
          ✅ وصول شده
        </Badge>
      )
    case 'bounced':
      return (
        <Badge className="bg-red-100 text-red-700 border border-red-300 px-2.5 py-0.5 text-xs font-bold">
          ❌ برگشت خورده
        </Badge>
      )
    case 'returned':
      return (
        <Badge className="bg-orange-100 text-orange-700 border border-orange-300 px-2.5 py-0.5 text-xs font-bold">
          ↩️ پس داده/باطل
        </Badge>
      )
    default:
      return <Badge className="border px-2.5 py-0.5 text-xs">{status}</Badge>
  }
}

// ═══════════════════════════════════════════════════════════════
// Persian Date Picker — Fixed & Stable
// ═══════════════════════════════════════════════════════════════

interface PersianDatePickerProps {
  value: string | null | undefined
  onChange: (iso: string) => void
  placeholder?: string
  label?: string
  minDate?: string | null
  maxDate?: string | null
  disabled?: boolean
}

function PersianDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
  label,
  minDate,
  maxDate,
  disabled = false,
}: PersianDatePickerProps) {
  const normalizedValue = useMemo(
    () => normalizeDateToGregorianIso(value),
    [value]
  )

  const min = useMemo(
    () => normalizeDateToGregorianIso(minDate),
    [minDate]
  )

  const max = useMemo(
    () => normalizeDateToGregorianIso(maxDate),
    [maxDate]
  )

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const todayIso = useMemo(() => {
    const now = new Date()
    return gregorianToIso(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate()
    )
  }, [])

  const todayJalali = useMemo(() => {
    return (
      isoToJalali(todayIso) || {
        jy: 1400,
        jm: 1,
        jd: 1,
      }
    )
  }, [todayIso])

  const displayText = useMemo(() => {
    if (!normalizedValue) return ''
    const j = isoToJalali(normalizedValue)
    if (!j) return ''

    return `${toPersianDigits(j.jy)}/${toPersianDigits(
      pad2(j.jm)
    )}/${toPersianDigits(pad2(j.jd))}`
  }, [normalizedValue])

  const initialView = useMemo(() => {
    const selected = normalizedValue ? isoToJalali(normalizedValue) : null
    if (selected) return selected

    const minDateJalali = min ? isoToJalali(min) : null
    if (minDateJalali) return minDateJalali

    const maxDateJalali = max ? isoToJalali(max) : null
    if (maxDateJalali) return maxDateJalali

    return todayJalali
  }, [normalizedValue, min, max, todayJalali])

  const [viewYear, setViewYear] = useState(initialView.jy)
  const [viewMonth, setViewMonth] = useState(initialView.jm)

  useEffect(() => {
    const j = normalizedValue ? isoToJalali(normalizedValue) : null
    if (j) {
      setViewYear(j.jy)
      setViewMonth(j.jm)
    }
  }, [normalizedValue])

  useEffect(() => {
    if (!open) return

    const j =
      normalizedValue && isoToJalali(normalizedValue)
        ? isoToJalali(normalizedValue)
        : min && isoToJalali(min)
        ? isoToJalali(min)
        : max && isoToJalali(max)
        ? isoToJalali(max)
        : todayJalali

    if (j) {
      setViewYear(j.jy)
      setViewMonth(j.jm)
    }
  }, [open, normalizedValue, min, max, todayJalali])

  useEffect(() => {
    if (!open) return

    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const daysCount = daysInJalaliMonth(viewYear, viewMonth)

  const firstDayOffset = useMemo(() => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, 1)
    if (!isValidGregorianDate(gy, gm, gd)) return 0

    const jsDay = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay()
    return (jsDay + 1) % 7
  }, [viewYear, viewMonth])

  const cells: (number | null)[] = []

  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedJalali = normalizedValue
    ? isoToJalali(normalizedValue)
    : null

  const isDayDisabled = (jd: number): boolean => {
    if (disabled) return true

    const cellIso = jalaliToISO(viewYear, viewMonth, jd)
    if (!cellIso) return true

    if (min && cellIso < min) return true
    if (max && cellIso > max) return true

    return false
  }

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const handleDayClick = (jd: number) => {
    if (isDayDisabled(jd)) return

    const iso = jalaliToISO(viewYear, viewMonth, jd)
    if (!iso) return

    onChange(iso)
    setOpen(false)
  }

  const navBtnStyle: CSSProperties = {
    padding: '2px 6px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: LILAC.textSecondary,
    fontSize: 12,
    cursor: 'pointer',
    lineHeight: 1,
  }

  const todayInRange =
    (!min || todayIso >= min) && (!max || todayIso <= max)

  const todayFallbackIso =
    min && todayIso < min
      ? min
      : max && todayIso > max
      ? max
      : todayIso

  const handleToggle = () => {
    if (disabled) return
    setOpen((o) => !o)
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <Label className="text-[11px] text-gray-600 mb-0.5 block">
          {label}
        </Label>
      )}

      <div
        onClick={handleToggle}
        style={{
          width: '100%',
          height: 32,
          padding: '0 10px',
          borderRadius: 6,
          border: `1px solid ${LILAC.border}`,
          backgroundColor: disabled ? '#f9fafb' : LILAC.popupBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 12,
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <span
          style={{
            color: displayText ? LILAC.textPrimary : LILAC.textMuted,
          }}
        >
          {displayText || placeholder}
        </span>

        <Calendar
          className="w-3.5 h-3.5"
          style={{ color: LILAC.textSecondary }}
        />
      </div>

      {open && !disabled && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          <div
            className="absolute z-50 mt-1 rounded-lg shadow-xl border"
            style={{
              backgroundColor: LILAC.popupBgSolid,
              borderColor: LILAC.border,
              minWidth: 280,
              padding: 12,
              top: '100%',
              right: 0,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                style={navBtnStyle}
                onClick={() => setViewYear((y) => y - 1)}
              >
                «
              </button>

              <button type="button" style={navBtnStyle} onClick={goPrevMonth}>
                ‹
              </button>

              <div
                style={{
                  color: LILAC.textPrimary,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {JALALI_MONTHS[viewMonth - 1]}{' '}
                {toPersianDigits(viewYear)}
              </div>

              <button type="button" style={navBtnStyle} onClick={goNextMonth}>
                ›
              </button>

              <button
                type="button"
                style={navBtnStyle}
                onClick={() => setViewYear((y) => y + 1)}
              >
                »
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div
                  key={i}
                  className="text-center text-[10px] font-medium py-1"
                  style={{
                    color:
                      i === 6 ? LILAC.textSecondary : LILAC.textMuted,
                  }}
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />

                const isSelected =
                  selectedJalali &&
                  selectedJalali.jy === viewYear &&
                  selectedJalali.jm === viewMonth &&
                  selectedJalali.jd === d

                const isToday =
                  todayJalali.jy === viewYear &&
                  todayJalali.jm === viewMonth &&
                  todayJalali.jd === d

                const isFriday = i % 7 === 6
                const dayDisabled = isDayDisabled(d)

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDayClick(d)}
                    style={{
                      height: 28,
                      borderRadius: 5,
                      fontSize: 11,
                      border: isSelected
                        ? 'none'
                        : isToday
                        ? `1px solid ${LILAC.todayBorder}`
                        : 'none',
                      backgroundColor: isSelected
                        ? LILAC.accent
                        : isToday
                        ? LILAC.accentLight
                        : 'transparent',
                      color: isSelected
                        ? LILAC.textOnAccent
                        : dayDisabled
                        ? LILAC.textDisabled
                        : isToday
                        ? LILAC.todayText
                        : isFriday
                        ? LILAC.textSecondary
                        : LILAC.textPrimary,
                      cursor: dayDisabled ? 'not-allowed' : 'pointer',
                      fontWeight: isSelected
                        ? 700
                        : isToday
                        ? 600
                        : isFriday
                        ? 500
                        : 400,
                    }}
                  >
                    {toPersianDigits(d)}
                  </button>
                )
              })}
            </div>

            <div
              className="flex justify-between items-center mt-3 pt-2"
              style={{ borderTop: `1px solid ${LILAC.border}` }}
            >
              <span
                className="text-[10px]"
                style={{ color: LILAC.textMuted }}
              >
                امروز: {toPersianDigits(todayJalali.jd)}{' '}
                {JALALI_MONTHS[todayJalali.jm - 1]}{' '}
                {toPersianDigits(todayJalali.jy)}
              </span>

              <button
                type="button"
                onClick={() => {
                  onChange(todayInRange ? todayIso : todayFallbackIso)
                  setOpen(false)
                }}
                style={{
                  fontSize: 10,
                  color: LILAC.accent,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {todayInRange
                  ? 'انتخاب امروز'
                  : 'انتخاب نزدیک‌ترین تاریخ مجاز'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main Component — ChecksTab
// ═══════════════════════════════════════════════════════════════

export function ChecksTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  const storeSelectedFiscalYearId = useAppStore(
    (s: any) => s.selectedFiscalYearId
  ) as string | null | undefined
  const fiscalYearBounds = useAppStore((s: any) => s.fiscalYearBounds) as any
  const selectedFiscalYearId =
    storeSelectedFiscalYearId && storeSelectedFiscalYearId !== 'all'
      ? storeSelectedFiscalYearId
      : null

  const [allYears, setAllYears] = useState(
    storeSelectedFiscalYearId === 'all'
  )

  const [checks, setChecks] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<
    'all' | 'receivable' | 'payable'
  >('all')
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'pending' | 'deposited' | 'cleared' | 'bounced' | 'returned'
  >('all')

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const [selectedFiscalYearInfo, setSelectedFiscalYearInfo] =
    useState<FiscalYearInfo | null>(null)
  const [activeFiscalYearInfo, setActiveFiscalYearInfo] =
    useState<FiscalYearInfo | null>(null)
  const [serverCanCreateCheck, setServerCanCreateCheck] =
    useState<boolean | null>(null)
  const [serverCanChangeStatusGlobally, setServerCanChangeStatusGlobally] =
    useState<boolean | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const [lastKnownActiveFiscalYearId, setLastKnownActiveFiscalYearId] =
    useState<string | null>(() => {
      if (typeof window === 'undefined') return null
      return localStorage.getItem(LAST_ACTIVE_FY_KEY)
    })

  // Dialog: Check Form
  const [checkDialogOpen, setCheckDialogOpen] = useState(false)
  const [checkFormMode, setCheckFormMode] = useState<'add' | 'edit'>('add')
  const [checkFormId, setCheckFormId] = useState('')
  const [checkType, setCheckType] = useState<'receivable' | 'payable'>(
    'receivable'
  )
  const [checkNumber, setCheckNumber] = useState('')
  const [checkBank, setCheckBank] = useState('')
  const [checkAmount, setCheckAmount] = useState('')
  const [checkIssueDate, setCheckIssueDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [checkDueDate, setCheckDueDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [checkCustomerId, setCheckCustomerId] = useState('')
  const [checkPayee, setCheckPayee] = useState('')
  const [checkSaving, setCheckSaving] = useState(false)

  // Dialog: Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Check | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  // Dialog: Detail
  const [detailCheck, setDetailCheck] = useState<Check | null>(null)

  // Check Printer
  const [checkPrinterOpen, setCheckPrinterOpen] = useState(false)
  const [checkPrintData, setCheckPrintData] =
    useState<CheckPrintData | null>(null)

  useEffect(() => {
    if (storeSelectedFiscalYearId === 'all') {
      setAllYears(true)
    } else if (storeSelectedFiscalYearId) {
      setAllYears(false)
    }
  }, [storeSelectedFiscalYearId])

  useEffect(() => {
    setSearchQuery('')
    setFilterType('all')
    setFilterStatus('all')
    setCurrentPage(1)
  }, [selectedFiscalYearId, allYears])

  // ★ v30.1: اولویت با سال مالی انتخابی از Store است، نه پاسخ API
  const effectiveFiscalYearId =
    selectedFiscalYearId ||
    selectedFiscalYearInfo?.id ||
    (fiscalYearBounds?.fiscalYearId ?? null)

  // ★ v30.1: بازه سال مالی از bounds استور اولویت دارد
  const fiscalStartIso: string | undefined =
    toDateOnly(fiscalYearBounds?.from) ||
    toDateOnly(selectedFiscalYearInfo?.startDate)

  const fiscalEndIso: string | undefined =
    toDateOnly(fiscalYearBounds?.to) ||
    toDateOnly(selectedFiscalYearInfo?.endDate)
  const offlineCanCreateCheck = Boolean(
    !allYears &&
      effectiveFiscalYearId &&
      effectiveFiscalYearId === lastKnownActiveFiscalYearId
  )

  const canCreateCheck = Boolean(
    !allYears &&
      (isOnline
        ? serverCanCreateCheck !== null
          ? serverCanCreateCheck
          : Boolean(
              selectedFiscalYearInfo?.isActive &&
                !selectedFiscalYearInfo?.isClosed
            )
        : offlineCanCreateCheck)
  )

  const canChangeStatusGlobally = Boolean(
    isOnline
      ? serverCanChangeStatusGlobally !== null
        ? serverCanChangeStatusGlobally
        : Boolean(
            activeFiscalYearInfo?.isActive &&
              !activeFiscalYearInfo?.isClosed
          )
      : Boolean(lastKnownActiveFiscalYearId && !allYears)
  )

  const createDisabledReason = allYears
    ? 'در نمای «همه سنوات» امکان ثبت چک جدید وجود ندارد. برای ثبت، یک سال مالی مشخص انتخاب کنید.'
    : !isOnline
    ? offlineCanCreateCheck
      ? ''
      : OFFLINE_CHECKS_WARNING
    : selectedFiscalYearInfo?.isClosed
    ? `سال مالی «${
        selectedFiscalYearInfo?.name || 'انتخابی'
      }» بسته شده است و امکان ثبت چک جدید وجود ندارد.`
    : selectedFiscalYearInfo && !selectedFiscalYearInfo.isActive
    ? 'فقط در سال مالی فعال امکان ثبت چک جدید وجود دارد.'
    : !canCreateCheck
    ? 'امکان ثبت چک جدید در این وضعیت وجود ندارد.'
    : ''

const loadChecks = useCallback(async () => {
  setLoading(true)

  try {
    const normalizeCheck = (c: any): Check => {
      const rawStatus = normalizeStatus(c?.status)
      const allowedStatuses: Check['status'][] = [
        'pending',
        'deposited',
        'cleared',
        'bounced',
        'returned',
      ]

      const status = allowedStatuses.includes(rawStatus as Check['status'])
        ? (rawStatus as Check['status'])
        : 'pending'

      return {
        ...c,
        id: String(c?.id || ''),
        type: c?.type === 'payable' ? 'payable' : 'receivable',
        checkNumber: String(c?.checkNumber || ''),
        bankName: String(c?.bankName || ''),
        branchName: c?.branchName || null,
        amount: Number(c?.amount || 0),
        issueDate:
          toDateOnly(c?.issueDate || c?.createdAt) ||
          String(c?.issueDate || ''),
        dueDate: toDateOnly(c?.dueDate) || String(c?.dueDate || ''),
        customerId: c?.customerId || null,
        supplierId: c?.supplierId || null,
        payee: c?.payee || c?.payeeName || null,
        payeeName: c?.payeeName || c?.payee || null,
        description: c?.description || null,
        invoiceId: c?.invoiceId || null,
        invoiceNumber: c?.invoiceNumber || null,
        journalEntryId: c?.journalEntryId || null,
        fiscalYearId: c?.fiscalYearId || null,
        fiscalYearName: c?.fiscalYearName || null,
        customerName: c?.customerName || null,
        status,
        createdAt: c?.createdAt,
        canEdit: Boolean(c?.canEdit),
        canDelete: Boolean(c?.canDelete),
        canChangeStatus: Boolean(c?.canChangeStatus),
        _offline: Boolean(c?._offline),
        _syncStatus: c?._syncStatus,
        _createdAt: c?._createdAt,
        _lastError: c?._lastError,
      }
    }

    // ─── حالت آفلاین ─────────────────────────────────────────
    if (!isOnline) {
      const cachedChecks = await getCachedChecks()
      const list = Array.isArray(cachedChecks)
        ? cachedChecks.map(normalizeCheck).filter((c) => c.id)
        : []

      setChecks(list)
      setSelectedFiscalYearInfo(null)
      setActiveFiscalYearInfo(null)
      setServerCanCreateCheck(null)
      setServerCanChangeStatusGlobally(null)
      setWarning(OFFLINE_CHECKS_WARNING)

      setLoading(false)
      return
    }

    // ─── حالت آنلاین ─────────────────────────────────────────
    const params = new URLSearchParams()

    if (allYears) {
      params.set('allYears', 'true')
    } else if (selectedFiscalYearId) {
      params.set('fiscalYearId', selectedFiscalYearId)
    }

    const res = await fetch(`/api/checks?${params.toString()}`, {
      headers: getAuthHeaders(),
    })

    const json = await res.json()

    if (!res.ok || !json.success) {
      throw new Error(json.error || 'خطا در دریافت چک‌ها')
    }

    const rawList =
      json?.data?.checks ??
      json?.data?.items ??
      json?.data ??
      []

    const list = (Array.isArray(rawList) ? rawList : [])
      .map(normalizeCheck)
      .filter((c) => c.id)

    setChecks(list)
    await cacheChecks(list as any)

    const fy = json.fiscalYear
    const activeFy = json.activeFiscalYear

    if (fy) {
      setSelectedFiscalYearInfo({
        id: fy.id || json.fiscalYearId || null,
        name: fy.name || json.fiscalYearName || null,
        startDate: fy.startDate || null,
        endDate: fy.endDate || null,
        isActive: Boolean(fy.isActive),
        isClosed: Boolean(fy.isClosed),
      })
    } else if (json.fiscalYearId) {
      setSelectedFiscalYearInfo({
        id: json.fiscalYearId,
        name: json.fiscalYearName || null,
        startDate: null,
        endDate: null,
        isActive: false,
        isClosed: false,
      })
    } else {
      setSelectedFiscalYearInfo(null)
    }

    if (activeFy) {
      setActiveFiscalYearInfo({
        id: activeFy.id || null,
        name: activeFy.name || null,
        startDate: activeFy.startDate || null,
        endDate: activeFy.endDate || null,
        isActive: Boolean(activeFy.isActive),
        isClosed: Boolean(activeFy.isClosed),
      })

      if (activeFy.isActive && !activeFy.isClosed && activeFy.id) {
        setLastKnownActiveFiscalYearId(activeFy.id)
        localStorage.setItem(LAST_ACTIVE_FY_KEY, activeFy.id)
      }
    } else {
      setActiveFiscalYearInfo(null)
    }

    const canCreateFromServer =
      typeof json.canCreateCheck === 'boolean'
        ? json.canCreateCheck
        : Boolean(!allYears && fy?.isActive && !fy?.isClosed)

    const canChangeFromServer =
      typeof json.canChangeStatusGlobally === 'boolean'
        ? json.canChangeStatusGlobally
        : Boolean(activeFy?.isActive && !activeFy?.isClosed)

    setServerCanCreateCheck(canCreateFromServer)
    setServerCanChangeStatusGlobally(canChangeFromServer)

    setWarning(
      json.warning ||
        (allYears ? ALL_YEARS_WARNING : null)
    )
  } catch (error: any) {
    console.warn(
      '[ChecksTab] Fetch failed, using cached data:',
      error?.message
    )

    try {
      const cachedChecks = await getCachedChecks()
      const list = Array.isArray(cachedChecks)
        ? cachedChecks.map((c: any) => ({
            ...c,
            amount: Number(c?.amount || 0),
            status: normalizeStatus(c?.status),
          }))
        : []

      setChecks(list as Check[])
    } catch {
      setChecks([])
    }

    setWarning(error?.message || 'خطا در دریافت چک‌ها از سرور')

    toast({
      title: 'خطای شبکه',
      description: 'نمایش داده‌های ذخیره‌شده محلی',
      variant: 'default',
    })
  } finally {
    setLoading(false)
  }
}, [isOnline, allYears, selectedFiscalYearId, toast])
  useEffect(() => {
    loadChecks()
  }, [loadChecks])

  useEffect(() => {
    setCurrentPage(1)
  }, [filterType, filterStatus, searchQuery])

  const handleIssueDateChange = (iso: string) => {
    setCheckIssueDate(iso)

    if (checkDueDate && iso && checkDueDate < iso) {
      setCheckDueDate(iso)
    }
  }

  const handleDueDateChange = (iso: string) => {
    if (checkIssueDate && iso && iso < checkIssueDate) {
      setCheckDueDate(checkIssueDate)
      return
    }

    setCheckDueDate(iso)
  }

  const openAddCheckDialog = useCallback(() => {
    if (!canCreateCheck) {
      toast({
        title: 'خطا',
        description:
          createDisabledReason ||
          'در این وضعیت امکان ثبت چک جدید وجود ندارد.',
        variant: 'destructive',
      })
      return
    }

    const today = new Date().toISOString().split('T')[0]

    const defaultIssueDate = today

    setCheckFormMode('add')
    setCheckFormId('')
    setCheckType('receivable')
    setCheckNumber('')
    setCheckBank('')
    setCheckAmount('')
    setCheckIssueDate(defaultIssueDate)
    setCheckDueDate(defaultIssueDate)
    setCheckCustomerId('')
    setCheckPayee('')
    setCheckDialogOpen(true)
  }, [
    canCreateCheck,
    createDisabledReason,
    toast,
  ])

  const openEditDialog = (check: Check) => {
    if (!check._offline && check.canEdit === false) {
      toast({
        title: 'خطا',
        description: 'این چک قابل ویرایش نیست.',
        variant: 'destructive',
      })
      return
    }

    setCheckFormMode('edit')
    setCheckFormId(check.id)
    setCheckType(check.type)
    setCheckNumber(check.checkNumber)
    setCheckBank(check.bankName)
    setCheckAmount(String(check.amount))
    setCheckIssueDate(
      toDateOnly(check.issueDate) ||
        new Date().toISOString().split('T')[0]
    )
    setCheckDueDate(toDateOnly(check.dueDate) || check.dueDate)
    setCheckCustomerId(check.customerId || '')
    setCheckPayee(check.payee || check.payeeName || '')
    setCheckDialogOpen(true)
  }

  const handleCreateCheck = useCallback(async () => {
    if (!checkNumber.trim() || !checkBank.trim() || !checkAmount.trim()) {
      toast({
        title: 'خطا',
        description: 'شماره چک، بانک و مبلغ الزامی است',
        variant: 'destructive',
      })
      return
    }

    const amount = parseFloat(checkAmount)

    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'خطا',
        description: 'مبلغ چک باید بزرگتر از صفر باشد',
        variant: 'destructive',
      })
      return
    }

    if (checkDueDate && checkIssueDate && checkDueDate < checkIssueDate) {
      toast({
        title: 'خطا',
        description: 'تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد.',
        variant: 'destructive',
      })
      return
    }

   
    setCheckSaving(true)

    try {
      if (checkFormMode === 'edit') {
        const updated = checks.map((c) =>
          c.id === checkFormId
            ? {
                ...c,
                type: checkType,
                checkNumber: checkNumber.trim(),
                bankName: checkBank.trim(),
                amount,
                dueDate: checkDueDate,
                customerId: checkCustomerId || null,
                payee: checkPayee || null,
                payeeName: checkPayee || null,
              }
            : c
        )

        setChecks(updated)
        await cacheChecks(updated as any)

        if (!checkFormId.startsWith('offline-')) {
          await addCheckToSyncQueue('update', {
            id: checkFormId,
            action: 'edit',
            type: checkType,
            checkNumber: checkNumber.trim(),
            bankName: checkBank.trim(),
            amount,
            dueDate: checkDueDate,
            customerId: checkCustomerId || null,
            payeeName: checkPayee || null,
          } as any)

          if (isOnline) setTimeout(() => syncEngine.sync(), 100)
        }

        logger.info('چک ویرایش شد', {
          checkId: checkFormId,
          checkNumber: checkNumber.trim(),
          checkType,
          bankName: checkBank.trim(),
          amount,
          dueDate: checkDueDate,
          fiscalYearId: effectiveFiscalYearId,
        })

        toast({
          title: '✓ چک ویرایش شد',
          description: isOnline
            ? 'در حال ارسال به سرور'
            : 'در صف همگام‌سازی قرار گرفت',
        })
      } else {
        const newCheck: Check = {
          id: `offline-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          type: checkType,
          checkNumber: checkNumber.trim(),
          bankName: checkBank.trim(),
          amount,
          issueDate: checkIssueDate,
          dueDate: checkDueDate,
          customerId: checkCustomerId || null,
          payee: checkPayee || null,
          payeeName: checkPayee || null,
          status: 'pending',
          fiscalYearId: effectiveFiscalYearId,
          canEdit: true,
          canDelete: true,
          canChangeStatus: true,
          _offline: true,
          _syncStatus: 'pending',
          _createdAt: Date.now(),
        }

        setChecks((prev) => [newCheck, ...prev])

        const updated = [newCheck, ...checks]

        await cacheChecks(updated as any)
        await addCheckToSyncQueue('create', newCheck as any)

        if (isOnline) setTimeout(() => syncEngine.sync(), 100)

        logger.info('چک جدید ثبت شد', {
          checkId: newCheck.id,
          checkNumber: newCheck.checkNumber,
          checkType: newCheck.type,
          bankName: newCheck.bankName,
          amount: newCheck.amount,
          issueDate: newCheck.issueDate,
          dueDate: newCheck.dueDate,
          fiscalYearId: newCheck.fiscalYearId || null,
          fiscalYearName: selectedFiscalYearInfo?.name || null,
        })

        toast({
          title: '✓ چک ایجاد شد',
          description: isOnline
            ? 'در حال ارسال به سرور'
            : 'در صف همگام‌سازی قرار گرفت',
        })
      }

      setCheckDialogOpen(false)
      setCheckFormMode('add')
      setCheckFormId('')
      setCheckType('receivable')
      setCheckNumber('')
      setCheckBank('')
      setCheckAmount('')
      setCheckIssueDate(new Date().toISOString().split('T')[0])
      setCheckDueDate(new Date().toISOString().split('T')[0])
      setCheckCustomerId('')
      setCheckPayee('')
    } catch (err: any) {
      console.error('[ChecksTab] Create/Edit error:', err)
      toast({
        title: 'خطا',
        description: err.message || 'خطا در ثبت/ویرایش چک',
        variant: 'destructive',
      })
    } finally {
      setCheckSaving(false)
    }
  }, [
    checkFormMode,
    checkFormId,
    checkType,
    checkNumber,
    checkBank,
    checkAmount,
    checkIssueDate,
    checkDueDate,
    checkCustomerId,
    checkPayee,
    checks,
    isOnline,
    toast,
    effectiveFiscalYearId,
    selectedFiscalYearInfo?.name,
  ])

  const handleCheckStatus = useCallback(
    async (
      checkId: string,
      newStatus: 'deposited' | 'cleared' | 'bounced' | 'returned'
    ) => {
      const check = checks.find((c) => c.id === checkId)
      if (!check) return

      if (!check._offline && check.canChangeStatus === false) {
        toast({
          title: 'خطا',
          description:
            allYears
              ? 'در نمای همه سنوات امکان تغییر وضعیت چک وجود ندارد.'
              : 'این چک در وضعیت فعلی قابل تغییر وضعیت نیست.',
          variant: 'destructive',
        })
        return
      }

      const previousChecks = [...checks]

      try {
        const updated = checks.map((c) =>
          c.id === checkId ? { ...c, status: newStatus } : c
        )

        setChecks(updated)
        await cacheChecks(updated as any)

        if (check._offline || !isOnline) {
          await addCheckToSyncQueue('status_change', {
            ...check,
            status: newStatus,
          } as any)

          toast({
            title: '✓ وضعیت به‌روزرسانی شد',
            description: !isOnline
              ? 'در صف همگام‌سازی قرار گرفت (آفلاین)'
              : 'در حال ارسال به سرور',
          })

          if (isOnline) {
            setTimeout(async () => {
              await syncEngine.sync()
              await loadChecks()
            }, 500)
          }

          logger.info('وضعیت چک تغییر کرد', {
            checkId,
            checkNumber: check.checkNumber,
            checkType: check.type,
            amount: check.amount,
            previousStatus: check.status,
            newStatus,
            fiscalYearId: check.fiscalYearId || null,
            activeFiscalYearId: activeFiscalYearInfo?.id || null,
          })

          return
        }

        const res = await fetch('/api/checks', {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            id: checkId,
            status: newStatus,
          }),
        })

        const data = await res.json()

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'خطا در به‌روزرسانی وضعیت چک')
        }

        logger.info('وضعیت چک تغییر کرد', {
          checkId,
          checkNumber: check.checkNumber,
          checkType: check.type,
          amount: check.amount,
          previousStatus: check.status,
          newStatus,
          fiscalYearId: check.fiscalYearId || null,
          statusJournalFiscalYearId: data.fiscalYearId || null,
          statusJournalFiscalYearName: data.fiscalYearName || null,
        })

        toast({
          title: '✓ موفق',
          description: data.message || 'وضعیت چک به‌روزرسانی شد',
        })

        await loadChecks()
      } catch (err: any) {
        console.error('[Check Status Error]:', err)
        toast({
          title: 'خطا',
          description: err.message || 'خطا در به‌روزرسانی',
          variant: 'destructive',
        })
        setChecks(previousChecks)
        await cacheChecks(previousChecks as any)
      }
    },
    [
      checks,
      isOnline,
      toast,
      loadChecks,
      allYears,
      activeFiscalYearInfo?.id,
    ]
  )

  const handleDeleteCheck = useCallback(async () => {
    if (!deleteTarget) return

    if (!deleteTarget._offline && deleteTarget.canDelete === false) {
      toast({
        title: 'خطا',
        description: 'این چک قابل حذف نیست.',
        variant: 'destructive',
      })
      return
    }

    setDeleteSaving(true)

    try {
      if (deleteTarget._offline) {
        const updated = checks.filter((c) => c.id !== deleteTarget.id)
        setChecks(updated)
        await cacheChecks(updated as any)

        logger.info('چک آفلاین حذف شد', {
          checkId: deleteTarget.id,
          checkNumber: deleteTarget.checkNumber,
        })

        toast({ title: '✓ حذف شد', description: 'چک آفلاین حذف شد' })
      } else {
        if (!isOnline) {
          toast({
            title: 'خطا',
            description: 'حذف چک آنلاین نیاز به اتصال دارد',
            variant: 'destructive',
          })
          setDeleteDialogOpen(false)
          return
        }

        const res = await fetch(`/api/checks?id=${deleteTarget.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'خطا در حذف چک')
        }

        logger.info('چک حذف شد', {
          checkId: deleteTarget.id,
          checkNumber: deleteTarget.checkNumber,
          checkType: deleteTarget.type,
          amount: deleteTarget.amount,
          dueDate: deleteTarget.dueDate,
          status: deleteTarget.status,
          fiscalYearId: deleteTarget.fiscalYearId || null,
        })

        toast({ title: '✓ حذف شد', description: 'چک با موفقیت حذف شد' })
        await loadChecks()
      }

      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: err.message || 'خطا در حذف چک',
        variant: 'destructive',
      })
    } finally {
      setDeleteSaving(false)
    }
  }, [deleteTarget, checks, isOnline, toast, loadChecks])

  const openCheckPrinter = useCallback((check: Check) => {
    const printData: CheckPrintData = {
      checkNumber: check.checkNumber,
      bankName: check.bankName,
      amount: check.amount,
      dueDate: check.dueDate,
      payee: check.payee || check.payeeName || '',
      description: `بابت چک شماره ${check.checkNumber}`,
      nationalId: '',
    }

    setCheckPrintData(printData)
    setCheckPrinterOpen(true)
  }, [])
  // ★ v30.1: چک‌ها فقط در محدوده سال مالی انتخابی نمایش داده می‌شوند
  const fiscalScopedChecks = useMemo(() => {
    if (allYears || !effectiveFiscalYearId) {
      return checks
    }

    return checks.filter((c) => {
      // اگر چک fiscalYearId دارد، فقط همان سال مالی نمایش داده شود
      if (c.fiscalYearId) {
        return c.fiscalYearId === effectiveFiscalYearId
      }

      // اگر fiscalYearId نداشت، بر اساس تاریخ صدور داخل سال مالی فیلتر شود
      const issue = toDateOnly(c.issueDate)

      if (issue && fiscalStartIso && fiscalEndIso) {
        return issue >= fiscalStartIso && issue <= fiscalEndIso
      }

      // اگر هیچکدام مشخص نبود، در سال مالی انتخابی نمایش داده نشود
      return false
    })
  }, [
    checks,
    allYears,
    effectiveFiscalYearId,
    fiscalStartIso,
    fiscalEndIso,
  ])

   const filteredChecks = useMemo(() => {
    let result = fiscalScopedChecks

    if (filterType !== 'all') {
      result = result.filter((c) => c.type === filterType)
    }

    if (filterStatus !== 'all') {
      result = result.filter((c) => normalizeStatus(c.status) === filterStatus)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()

      result = result.filter(
        (c) =>
          c.checkNumber.toLowerCase().includes(q) ||
          c.bankName.toLowerCase().includes(q) ||
          (c.payee || c.payeeName || '').toLowerCase().includes(q) ||
          (c.customerName || '').toLowerCase().includes(q) ||
          (c.invoiceNumber || '').toLowerCase().includes(q)
      )
    }

    return result
  }, [fiscalScopedChecks, filterType, filterStatus, searchQuery])

  const totalPages = Math.ceil(filteredChecks.length / pageSize)

  const paginatedChecks = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredChecks.slice(start, start + pageSize)
  }, [filteredChecks, currentPage])

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [totalPages, currentPage])

const stats = useMemo(() => {
  const safeChecks = Array.isArray(fiscalScopedChecks) ? fiscalScopedChecks : []

  const total = safeChecks.length
  const receivable = safeChecks.filter((c) => c.type === 'receivable').length
  const payable = safeChecks.filter((c) => c.type === 'payable').length
  const pending = safeChecks.filter(
    (c) => normalizeStatus(c.status) === 'pending'
  ).length
  const deposited = safeChecks.filter(
    (c) => normalizeStatus(c.status) === 'deposited'
  ).length
  const cleared = safeChecks.filter(
    (c) => normalizeStatus(c.status) === 'cleared'
  ).length
  const bounced = safeChecks.filter(
    (c) => normalizeStatus(c.status) === 'bounced'
  ).length
  const returned = safeChecks.filter(
    (c) => normalizeStatus(c.status) === 'returned'
  ).length
  const offlineCount = safeChecks.filter((c) => c._offline).length
  const totalAmount = safeChecks.reduce(
    (s, c) => s + (Number(c.amount) || 0),
    0
  )

  return {
    total,
    receivable,
    payable,
    pending,
    deposited,
    cleared,
    bounced,
    returned,
    offlineCount,
    totalAmount,
  }
}, [fiscalScopedChecks])
  const PaginationUI = ({ className = '' }: { className?: string }) => {
    if (totalPages <= 1) return null

    const getPageNumbers = () => {
      const pages: (number | string)[] = []
      const maxVisible = 5

      if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i)
      } else {
        pages.push(1)
        if (currentPage > 3) pages.push('...')

        const start = Math.max(2, currentPage - 1)
        const end = Math.min(totalPages - 1, currentPage + 1)
        for (let i = start; i <= end; i++) pages.push(i)

        if (currentPage < totalPages - 2) pages.push('...')
        pages.push(totalPages)
      }

      return pages
    }

    return (
      <div
        className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50 ${className}`}
        dir="rtl"
      >
        <p className="text-xs text-gray-600 order-2 sm:order-1">
          نمایش {toFaNum((currentPage - 1) * pageSize + 1)} تا{' '}
          {toFaNum(Math.min(currentPage * pageSize, filteredChecks.length))} از{' '}
          {toFaNum(filteredChecks.length)} چک
        </p>

        <div className="flex items-center gap-1 order-1 sm:order-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 px-2"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">قبلی</span>
          </Button>

          <div className="flex items-center gap-0.5">
            {getPageNumbers().map((page, idx) =>
              typeof page === 'number' ? (
                <Button
                  key={idx}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  className={`h-8 w-8 p-0 text-xs ${
                    currentPage === page
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'text-gray-700'
                  }`}
                  onClick={() => setCurrentPage(page)}
                >
                  {toFaNum(page)}
                </Button>
              ) : (
                <span key={idx} className="px-1 text-gray-400 text-xs">
                  …
                </span>
              )
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 px-2"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            <span className="hidden sm:inline">بعدی</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> چک‌های جدید در حافظه محلی
            ذخیره شده و پس از اتصال به سرور ارسال می‌شوند.
          </div>
        </div>
      )}

      {(allYears || warning || (!canCreateCheck && createDisabledReason)) && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border ${
            allYears
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : !canCreateCheck && createDisabledReason
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />

          <div className="text-xs">
            {allYears ? (
              <>
                <strong>نمای همه سنوات فعال است.</strong> این لیست فقط برای
                بررسی مدیریتی است. برای ثبت چک جدید، یک سال مالی مشخص انتخاب
                کنید.
              </>
            ) : !canCreateCheck && createDisabledReason ? (
              <>
                <strong>ثبت چک غیرفعال است.</strong> {createDisabledReason}
              </>
            ) : (
              warning
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5">
        <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">
              کل چک‌ها
            </span>
            <CreditCard className="w-2.5 h-2.5 text-blue-400 shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-blue-700">
            {toFaNum(stats.total)}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600 truncate">
              وصول شده
            </span>
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-emerald-700">
            {toFaNum(stats.cleared)}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[8px] sm:text-[9px] font-medium text-amber-600 truncate">
              در جریان
            </span>
            <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-amber-700">
            {toFaNum(stats.pending)}
          </div>
        </div>

        {stats.offlineCount > 0 && (
          <div className="relative overflow-hidden rounded-md border border-orange-300 bg-gradient-to-br from-orange-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-orange-600 flex items-center gap-0.5 truncate">
                <WifiOff className="w-2 h-2 shrink-0" /> در انتظار sync
              </span>
            </div>
            <div className="text-xs sm:text-sm font-bold text-orange-700">
              {toFaNum(stats.offlineCount)}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در شماره چک، بانک، ذینفع، مشتری..."
                className="pr-8 text-xs h-9"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full lg:w-40 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه انواع</option>
              <option value="receivable">دریافتنی</option>
              <option value="payable">پرداختنی</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full lg:w-40 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="pending">در جریان</option>
              <option value="deposited">نزد بانک</option>
              <option value="cleared">وصول شده</option>
              <option value="bounced">برگشت خورده</option>
              <option value="returned">پس داده/باطل</option>
            </select>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={allYears ? 'default' : 'outline'}
                className={`text-xs h-9 ${
                  allYears
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : ''
                }`}
                onClick={() => setAllYears((v) => !v)}
              >
                <Calendar className="w-3.5 h-3.5 ml-1" />
                {allYears ? 'همه سنوات' : 'سال مالی انتخابی'}
              </Button>

              {!allYears && selectedFiscalYearInfo?.name && (
                <Badge className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 h-9">
                  {selectedFiscalYearInfo.name}
                </Badge>
              )}
            </div>

            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 flex-1 lg:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={openAddCheckDialog}
              disabled={!canCreateCheck}
              title={createDisabledReason || 'ثبت چک جدید در سال مالی فعال'}
            >
              <Plus className="w-3.5 h-3.5 ml-1" />
              ثبت چک جدید
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading ? (
        <Card className="border-gray-200">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">
              در حال بارگذاری چک‌ها...
            </p>
          </CardContent>
        </Card>
      ) : filteredChecks.length === 0 ? (
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <CreditCard className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">
              چکی یافت نشد
            </h3>
            <p className="text-sm text-gray-400 text-center max-w-md">
                  {fiscalScopedChecks.length === 0
                ? 'در سال مالی انتخابی چکی ثبت نشده است. برای ثبت چک جدید، روی دکمه «ثبت چک جدید» کلیک کنید.'
                : 'با فیلترهای فعلی، چکی یافت نشد. فیلترها را تغییر دهید.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Card className="border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-right text-xs w-24">
                        نوع
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        شماره چک
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        بانک
                      </TableHead>
                      <TableHead className="text-right text-xs w-32">
                        مبلغ
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        صدور
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        سررسید
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        وضعیت
                      </TableHead>
                      <TableHead className="text-right text-xs w-60">
                        عملیات
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginatedChecks.map((chk) => {
                      const allowEdit =
                        chk._offline ||
                        (normalizeStatus(chk.status) === 'pending' &&
                          (chk.canEdit ?? canCreateCheck))

                      const allowDelete = allowEdit

                      const allowStatus =
                        chk._offline ||
                        (chk.canChangeStatus ??
                          (canChangeStatusGlobally &&
                            !['cleared', 'returned'].includes(
                              normalizeStatus(chk.status)
                            )))

                      return (
                        <TableRow
                          key={chk.id}
                          className="hover:bg-gray-50/50"
                        >
                          <TableCell className="text-xs">
                            <Badge
                              className={
                                chk.type === 'receivable'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-purple-100 text-purple-700'
                              }
                            >
                              {chk.type === 'receivable'
                                ? 'دریافتنی'
                                : 'پرداختنی'}
                            </Badge>

                            {chk._offline && (
                              <Badge className="bg-orange-100 text-orange-700 mr-1 text-[9px]">
                                <Clock className="w-2.5 h-2.5 ml-0.5" />
                                آفلاین
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-xs font-mono">
                            {toFaNum(chk.checkNumber)}
                          </TableCell>

                          <TableCell className="text-xs">
                            {chk.bankName}
                          </TableCell>

                          <TableCell className="text-xs font-bold">
                            {formatCurrency(chk.amount)}
                          </TableCell>

                          <TableCell className="text-xs">
                            {formatDate(chk.issueDate)}
                          </TableCell>

                          <TableCell className="text-xs">
                            {formatDate(chk.dueDate)}
                          </TableCell>

                          <TableCell>
                            {getStatusBadge(chk.status)}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              {chk.type === 'payable' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 text-purple-600 border-purple-200 hover:bg-purple-50"
                                  onClick={() => openCheckPrinter(chk)}
                                  title="چاپ چک صیادی"
                                >
                                  <Printer className="w-3 h-3 ml-1" />
                                  چاپ چک
                                </Button>
                              )}

                              {chk.type === 'receivable' && allowStatus && (
                                <>
                                  {normalizeStatus(chk.status) ===
                                    'pending' && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7"
                                        onClick={() =>
                                          handleCheckStatus(chk.id, 'deposited')
                                        }
                                        title="سپردن به بانک"
                                      >
                                        <Landmark className="w-3 h-3 ml-1" />
                                        سپردن
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 text-orange-600 border-orange-200 hover:bg-orange-50"
                                        onClick={() =>
                                          handleCheckStatus(chk.id, 'returned')
                                        }
                                        title="پس دادن چک به مشتری"
                                      >
                                        <RotateCcw className="w-3 h-3 ml-1" />
                                        پس دادن
                                      </Button>
                                    </>
                                  )}

                                  {normalizeStatus(chk.status) ===
                                    'deposited' && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                        onClick={() =>
                                          handleCheckStatus(chk.id, 'cleared')
                                        }
                                        title="وصول چک"
                                      >
                                        <CheckCircle2 className="w-3 h-3 ml-1" />
                                        وصول
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                                        onClick={() =>
                                          handleCheckStatus(chk.id, 'bounced')
                                        }
                                        title="برگشت چک"
                                      >
                                        <Ban className="w-3 h-3 ml-1" />
                                        برگشت
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}

                              {chk.type === 'payable' && allowStatus && (
                                <>
                                  {normalizeStatus(chk.status) ===
                                    'pending' && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                        onClick={() =>
                                          handleCheckStatus(chk.id, 'cleared')
                                        }
                                        title="ثبت پرداخت چک"
                                      >
                                        <CheckCircle2 className="w-3 h-3 ml-1" />
                                        ثبت پرداخت
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 text-orange-600 border-orange-200 hover:bg-orange-50"
                                        onClick={() =>
                                          handleCheckStatus(chk.id, 'returned')
                                        }
                                        title="باطل کردن / پس گرفتن چک"
                                      >
                                        <XCircle className="w-3 h-3 ml-1" />
                                        باطل
                                      </Button>
                                    </>
                                  )}

                                  {normalizeStatus(chk.status) ===
                                    'bounced' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                      onClick={() =>
                                        handleCheckStatus(chk.id, 'cleared')
                                      }
                                      title="ثبت تسویه چک برگشتی"
                                    >
                                      <CheckCircle2 className="w-3 h-3 ml-1" />
                                      تسویه
                                    </Button>
                                  )}
                                </>
                              )}

                              {allowEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openEditDialog(chk)}
                                  title="ویرایش"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              {allowDelete && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-500"
                                  onClick={() => {
                                    setDeleteTarget(chk)
                                    setDeleteDialogOpen(true)
                                  }}
                                  title="حذف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <PaginationUI />
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden">
            <Card className="border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {paginatedChecks.map((chk) => {
                  const allowEdit =
                    chk._offline ||
                    (normalizeStatus(chk.status) === 'pending' &&
                      (chk.canEdit ?? canCreateCheck))

                  const allowDelete = allowEdit

                  const allowStatus =
                    chk._offline ||
                    (chk.canChangeStatus ??
                      (canChangeStatusGlobally &&
                        !['cleared', 'returned'].includes(
                          normalizeStatus(chk.status)
                        )))

                  return (
                    <div key={chk.id} className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={
                              chk.type === 'receivable'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }
                          >
                            {chk.type === 'receivable'
                              ? 'دریافتنی'
                              : 'پرداختنی'}
                          </Badge>

                          {getStatusBadge(chk.status)}

                          {chk._offline && (
                            <Badge className="bg-orange-100 text-orange-700 text-[9px]">
                              <Clock className="w-2.5 h-2.5 ml-0.5" />
                              آفلاین
                            </Badge>
                          )}
                        </div>

                        <span className="text-sm font-bold text-gray-800 font-mono">
                          {toFaNum(chk.checkNumber)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <Landmark className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-600">
                          {chk.bankName}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-gray-50 border border-gray-100 rounded p-2">
                          <div className="text-[10px] text-gray-500 mb-0.5">
                            مبلغ
                          </div>
                          <div className="text-xs font-bold text-gray-800">
                            {formatCurrency(chk.amount)}
                          </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-100 rounded p-2">
                          <div className="text-[10px] text-gray-500 mb-0.5">
                            صدور
                          </div>
                          <div className="text-xs font-bold text-gray-800">
                            {formatDate(chk.issueDate)}
                          </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-100 rounded p-2 col-span-2">
                          <div className="text-[10px] text-gray-500 mb-0.5">
                            سررسید
                          </div>
                          <div className="text-xs font-bold text-gray-800">
                            {formatDateLong(chk.dueDate)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                        {chk.type === 'payable' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-9 text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
                            onClick={() => openCheckPrinter(chk)}
                          >
                            <Printer className="w-3.5 h-3.5 ml-1" />
                            <span>چاپ چک صیادی</span>
                          </Button>
                        )}

                        {chk.type === 'receivable' && allowStatus && (
                          <>
                            {normalizeStatus(chk.status) === 'pending' && (
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-9"
                                  onClick={() =>
                                    handleCheckStatus(chk.id, 'deposited')
                                  }
                                >
                                  <Landmark className="w-3 h-3 ml-1" />
                                  سپردن
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-9 text-orange-600 border-orange-200 hover:bg-orange-50"
                                  onClick={() =>
                                    handleCheckStatus(chk.id, 'returned')
                                  }
                                >
                                  <RotateCcw className="w-3 h-3 ml-1" />
                                  پس دادن
                                </Button>
                              </div>
                            )}

                            {normalizeStatus(chk.status) === 'deposited' && (
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-9 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  onClick={() =>
                                    handleCheckStatus(chk.id, 'cleared')
                                  }
                                >
                                  <CheckCircle2 className="w-3 h-3 ml-1" />
                                  وصول
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-9 text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() =>
                                    handleCheckStatus(chk.id, 'bounced')
                                  }
                                >
                                  <Ban className="w-3 h-3 ml-1" />
                                  برگشت
                                </Button>
                              </div>
                            )}
                          </>
                        )}

                        {chk.type === 'payable' && allowStatus && (
                          <>
                            {normalizeStatus(chk.status) === 'pending' && (
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-9 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  onClick={() =>
                                    handleCheckStatus(chk.id, 'cleared')
                                  }
                                >
                                  <CheckCircle2 className="w-3 h-3 ml-1" />
                                  ثبت پرداخت
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-9 text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() =>
                                    handleCheckStatus(chk.id, 'returned')
                                  }
                                >
                                  <XCircle className="w-3 h-3 ml-1" />
                                  باطل
                                </Button>
                              </div>
                            )}

                            {normalizeStatus(chk.status) === 'bounced' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-xs h-9 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                onClick={() =>
                                  handleCheckStatus(chk.id, 'cleared')
                                }
                              >
                                <CheckCircle2 className="w-3 h-3 ml-1" />
                                تسویه چک برگشتی
                              </Button>
                            )}
                          </>
                        )}

                        {(allowEdit || allowDelete) && (
                          <div className="flex items-center justify-center gap-2">
                            {allowEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-3"
                                onClick={() => openEditDialog(chk)}
                                title="ویرایش"
                              >
                                <Pencil className="w-3.5 h-3.5 ml-1" />
                                <span className="text-xs">ویرایش</span>
                              </Button>
                            )}

                            {allowDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-3 text-red-500"
                                onClick={() => {
                                  setDeleteTarget(chk)
                                  setDeleteDialogOpen(true)
                                }}
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5 ml-1" />
                                <span className="text-xs">حذف</span>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <PaginationUI />
            </Card>
          </div>
        </>
      )}

      {/* Dialog: Check Form */}
      <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-4 h-4 text-blue-600" />
              {checkFormMode === 'add' ? 'ثبت چک جدید' : 'ویرایش چک'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {checkFormMode === 'add'
                ? 'اطلاعات چک را وارد کنید'
                : `ویرایش چک شماره ${checkNumber}`}
              {checkFormMode === 'add' &&
                selectedFiscalYearInfo?.name &&
                !allYears &&
                ` — سال مالی: ${selectedFiscalYearInfo.name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!canCreateCheck && checkFormMode === 'add' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                برای ثبت چک جدید باید یک سال مالی فعال و باز انتخاب شده باشد.
              </div>
            )}

            <div>
              <Label className="text-xs font-medium">
                نوع چک <span className="text-red-500">*</span>
              </Label>

              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => setCheckType('receivable')}
                  className={`relative flex items-center gap-2 px-2.5 py-2 rounded-md border-2 transition-all duration-200 cursor-pointer ${
                    checkType === 'receivable'
                      ? 'bg-blue-50 border-blue-500 shadow-sm'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {checkType === 'receivable' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  )}

                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                      checkType === 'receivable'
                        ? 'bg-blue-500 text-white'
                        : 'bg-blue-50 text-blue-500'
                    }`}
                  >
                    <Landmark className="w-3.5 h-3.5" />
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-[11px] font-bold block leading-tight ${
                        checkType === 'receivable'
                          ? 'text-blue-700'
                          : 'text-gray-700'
                      }`}
                    >
                      دریافتنی
                    </span>
                    <span className="text-[9px] text-gray-400 leading-tight block">
                      از مشتری
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCheckType('payable')}
                  className={`relative flex items-center gap-2 px-2.5 py-2 rounded-md border-2 transition-all duration-200 cursor-pointer ${
                    checkType === 'payable'
                      ? 'bg-purple-50 border-purple-500 shadow-sm'
                      : 'bg-white border-gray-200 hover:border-purple-300'
                  }`}
                >
                  {checkType === 'payable' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  )}

                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                      checkType === 'payable'
                        ? 'bg-purple-500 text-white'
                        : 'bg-purple-50 text-purple-500'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-[11px] font-bold block leading-tight ${
                        checkType === 'payable'
                          ? 'text-purple-700'
                          : 'text-gray-700'
                      }`}
                    >
                      پرداختنی
                    </span>
                    <span className="text-[9px] text-gray-400 leading-tight block">
                      به تامین‌کننده
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">شماره چک *</Label>
                <Input
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  placeholder="مثلاً: 123456"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                />
              </div>

              <div>
                <Label className="text-xs">بانک *</Label>
                <Input
                  value={checkBank}
                  onChange={(e) => setCheckBank(e.target.value)}
                  placeholder="مثلاً: بانک ملت"
                  className="text-xs mt-1 h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">مبلغ (ریال) *</Label>
              <Input
                type="number"
                value={checkAmount}
                onChange={(e) => setCheckAmount(e.target.value)}
                placeholder="1000000"
                className="text-xs mt-1 h-9"
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PersianDatePicker
                value={checkIssueDate}
                onChange={handleIssueDateChange}
                placeholder="تاریخ صدور"
                label="تاریخ صدور *"
                disabled={checkFormMode === 'edit'}
              />

              <PersianDatePicker
                value={checkDueDate}
                onChange={handleDueDateChange}
                placeholder="تاریخ سررسید"
                label="تاریخ سررسید *"
                minDate={checkIssueDate}
              />
            </div>

            <div>
              <Label className="text-xs">در وجه / از طرف (اختیاری)</Label>
              <Input
                value={checkPayee}
                onChange={(e) => setCheckPayee(e.target.value)}
                placeholder="نام شخص یا شرکت"
                className="text-xs mt-1 h-9"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCheckDialogOpen(false)}
              disabled={checkSaving}
              className="w-full sm:w-auto"
            >
              انصراف
            </Button>

            <Button
              onClick={handleCreateCheck}
              disabled={
                checkSaving ||
                !checkNumber.trim() ||
                !checkBank.trim() ||
                !checkAmount.trim() ||
                (checkFormMode === 'add' && !canCreateCheck)
              }
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkSaving ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <Save className="w-4 h-4 ml-1" />
              )}
              {checkSaving
                ? 'در حال ذخیره...'
                : checkFormMode === 'add'
                ? 'ثبت چک'
                : 'ذخیره تغییرات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-base text-red-600">
              حذف چک
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              آیا از حذف چک{' '}
              <strong>{deleteTarget?.checkNumber}</strong> (
              {deleteTarget?.bankName}) مطمئن هستید؟ این عمل غیرقابل بازگشت
              است.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteSaving}
              className="w-full sm:w-auto"
            >
              انصراف
            </Button>

            <Button
              onClick={handleDeleteCheck}
              disabled={deleteSaving}
              className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
            >
              {deleteSaving ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <Trash2 className="w-4 h-4 ml-1" />
              )}
              حذف چک
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detail View */}
      <Dialog
        open={!!detailCheck}
        onOpenChange={(open) => !open && setDetailCheck(null)}
      >
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          {detailCheck && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  جزئیات چک {detailCheck.checkNumber}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      نوع
                    </div>
                    <div className="font-medium">
                      {detailCheck.type === 'receivable'
                        ? 'دریافتنی'
                        : 'پرداختنی'}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      بانک
                    </div>
                    <div className="font-medium">{detailCheck.bankName}</div>
                  </div>

                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      مبلغ
                    </div>
                    <div className="font-bold">
                      {formatCurrency(detailCheck.amount)}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      صدور
                    </div>
                    <div className="font-medium">
                      {formatDate(detailCheck.issueDate)}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2 col-span-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      سررسید
                    </div>
                    <div className="font-medium">
                      {formatDateLong(detailCheck.dueDate)}
                    </div>
                  </div>

                  {detailCheck.fiscalYearName && (
                    <div className="bg-gray-50 rounded p-2 col-span-2">
                      <div className="text-gray-500 text-[10px] mb-0.5">
                        سال مالی
                      </div>
                      <div className="font-medium">
                        {detailCheck.fiscalYearName}
                      </div>
                    </div>
                  )}
                </div>

                {detailCheck.type === 'payable' && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const checkToPrint = detailCheck
                      setDetailCheck(null)
                      setTimeout(() => openCheckPrinter(checkToPrint), 200)
                    }}
                    className="w-full text-purple-600 border-purple-200 hover:bg-purple-50"
                  >
                    <Printer className="w-4 h-4 ml-1" />
                    چاپ چک صیادی
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDetailCheck(null)}
                  className="w-full sm:w-auto"
                >
                  بستن
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Check Printer Modal */}
      {checkPrinterOpen && (
        <CheckPrinterModal
          open={checkPrinterOpen}
          onOpenChange={(open) => {
            setCheckPrinterOpen(open)
            if (!open) {
              setCheckPrintData(null)
            }
          }}
          initialData={checkPrintData}
          onSuccess={() => {
            logger.info('چک صیادی با موفقیت چاپ شد', {
              checkNumber: checkPrintData?.checkNumber,
              amount: checkPrintData?.amount,
              payee: checkPrintData?.payee,
            })

            setCheckPrinterOpen(false)
            setCheckPrintData(null)
            loadChecks()
          }}
        />
      )}
    </div>
  )
}

export default ChecksTab