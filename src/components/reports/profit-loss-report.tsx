// ============================================================================
// src/components/reports/profit-loss-report.tsx — v9.4 ★★★
// سازگار با API v8.7 و v9.1 و v9.2
// ★ v9.4: اضافه شدن "ریال" در سمت چپ تمام مبالغ + اصلاح ساختار نمایش فیلترها
// ============================================================================

'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  TrendingUp, TrendingDown, Coins, FileText, Scale, Package,
  Loader2, Download, Printer, Calendar, AlertCircle, BarChart3,
  PieChart as PieIcon, Layers, Crown, CheckCircle2, Database, Building2,
} from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts'

// ============================================================================
//  Types
// ============================================================================

interface PnLData {
  _version?: string
  _dataSource?: string
  grossSales: number
  salesReturns: number
  discounts: number
  netSales: number
  taxAmount: number
  cogs: number
  cogsFromSales?: number
  cogsFromReturns?: number
  cogsFromInvoices?: number
  cogsFromFallback?: number
  grossProfit: number
  grossMargin: number
  operatingExpenses: { name: string; amount: number; code?: string; accountCode?: string }[]
  totalOperatingExpenses: number
  paymentGatewayFees?: {
    zarinpal: number
    platform: number
    total: number
    percentage: number
  }
  otherIncome: number
  otherExpenses: number
  operatingProfit: number
  profitBeforeTax: number
  incomeTax: number
  netProfit: number
  netMargin: number
  invoiceCount: number
  returnCount?: number
  averageInvoiceValue: number
  monthlyBreakdown: {
    month: string
    revenue: number
    cogs: number
    grossProfit: number
    expenses: number
    netProfit: number
  }[]
  categoryBreakdown: {
    categoryId: string
    categoryName: string
    revenue: number
    cogs: number
    grossProfit: number
    quantity: number
    margin: number
  }[]
  topProfitableProducts: {
    productId: string
    productName: string
    revenue: number
    cogs: number
    grossProfit: number
    quantity: number
    margin: number
  }[]
  dateRange: { from: string; to: string }
}

// ============================================================================
//  Helpers
// ============================================================================

// ★ v9.5: اصلاح توابع فرمت‌دهی — حذف Math.abs برای نمایش صحیح اعداد منفی
function formatNumberFa(n: number): string {
  const num = n || 0
  return num.toLocaleString('fa-IR')
}

function formatCurrency(n: number): string {
  const num = n || 0
  // اعداد منفی با پرانتز نمایش داده می‌شوند (استاندارد حسابداری)
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString('fa-IR')} ریال)`
  }
  return `${num.toLocaleString('fa-IR')} ریال`
}

// ★ v9.5: تابع جدید برای نمایش با رنگ (مثبت سبز، منفی قرمز)
function formatCurrencySigned(n: number): string {
  const num = n || 0
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString('fa-IR')} ریال)`
  }
  return `${num.toLocaleString('fa-IR')} ریال`
}

function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

function div(a: number, b: number): number { return Math.floor(a / b) }
function mod(a: number, b: number): number { return a - Math.floor(a / b) * b }

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * Math.floor(days / 12053)
  days = days % 12053
  jy += 4 * Math.floor(days / 1461)
  days = days % 1461
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days =
    365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 +
    jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
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
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm: number
  for (gm = 0; gm < 13; gm++) { const v = sal_a[gm]; if (gd <= v) break; gd -= v }
  return [gy, gm, gd]
}

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length; const gy = jy + 621; let leapJ = -14; let jp = breaks[0]
  let jm = 0, jump = 0, leap = 0, n = 0
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy)
  for (let i = 1; i < bl; i++) {
    jm = breaks[i]; jump = jm - jp; if (jy < jm) break
    leapJ = leapJ + Math.floor(jump / 33) * 8 + Math.floor((jump % 33) / 4); jp = jm
  }
  n = jy - jp
  leapJ = leapJ + Math.floor(n / 33) * 8 + Math.floor((n % 33 + 3) / 4)
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1
  const leapG = Math.floor(gy / 4) - Math.floor((Math.floor(gy / 100) + 1) * 3 / 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + Math.floor((jump + 4) / 33) * 33
  leap = ((n + 1) % 33 - 1) % 4
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function isJalaliLeapYear(jy: number): boolean { return jalCal(jy).leap === 0 }
function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31; if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

function isoToJalali(iso: string): { jy: number; jm: number; jd: number } | null {
  if (!iso) return null
  try {
    const parts = iso.split('-')
    if (parts.length !== 3) return null
    const gy = parseInt(parts[0], 10)
    const gm = parseInt(parts[1], 10)
    const gd = parseInt(parts[2], 10)
    if (isNaN(gy) || isNaN(gm) || isNaN(gd)) return null
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd)
    return { jy, jm, jd }
  } catch { return null }
}

function jalaliToISO(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
}

function formatJalaliLong(isoDate: string): string {
  const d = new Date(isoDate); if (isNaN(d.getTime())) return '—'
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}`
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-'); const mi = parseInt(m) - 1
  if (mi < 0 || mi > 11) return monthKey
  return `${JALALI_MONTHS[mi]} ${toFaNum(y)}`
}

function todayGregorianISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date()
  const [jy, jm] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const firstOfMonth = jalaliToISO(jy, jm, 1)
  return { from: firstOfMonth, to: todayGregorianISO() }
}

function extractCogsInfo(data: PnLData): {
  cogsNet: number
  cogsFromSales: number
  cogsFromReturns: number
  isJEBased: boolean
} {
  const isJEBased = data._dataSource === 'journal_entry'
  if (data.cogsFromSales !== undefined && data.cogsFromReturns !== undefined) {
    return {
      cogsNet: data.cogs,
      cogsFromSales: data.cogsFromSales,
      cogsFromReturns: data.cogsFromReturns,
      isJEBased,
    }
  } else {
    return {
      cogsNet: data.cogs,
      cogsFromSales: data.cogsFromInvoices || data.cogs,
      cogsFromReturns: data.cogsFromFallback || 0,
      isJEBased: false,
    }
  }
}

const CHART_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
]

const EMERALD = {
  primary: '#047857', primaryLt: '#10b981', primaryDk: '#065f46',
  accent: '#0d9488', textMain: '#1f2937', textMute: '#6b7280',
  textSoft: '#9ca3af', border: '#e5e7eb', bgCard: '#ffffff',
  popupBg: '#ffffff', headerBg: '#ecfdf5', todayRing: '#14b8a6',
  accentSoft: '#d1fae5',
}

// ============================================================================
//  PersianDatePicker
// ============================================================================

interface PersianDatePickerProps {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  label?: string
  minDate?: string
  maxDate?: string
  size?: 'sm' | 'md'
}

function PersianDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ', label, minDate, maxDate, size = 'md' }: PersianDatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayText = useMemo(() => {
    if (!value) return ''
    const j = isoToJalali(value); if (!j) return ''
    return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2, '۰')}/${toFaNum(j.jd).padStart(2, '۰')}`
  }, [value])

  const todayJalali = useMemo(() => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return { jy, jm, jd, iso: `${year}-${month}-${day}` }
  }, [])

  const initial = useMemo(() => {
    const j = value ? isoToJalali(value) : null
    return j || { jy: todayJalali.jy, jm: todayJalali.jm, jd: todayJalali.jd }
  }, [value, todayJalali])

  const [viewYear, setViewYear] = useState<number>(initial.jy)
  const [viewMonth, setViewMonth] = useState<number>(initial.jm)

  useEffect(() => {
    const j = value ? isoToJalali(value) : null
    if (j) { setViewYear(j.jy); setViewMonth(j.jm) }
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
    return (new Date(gy, gm - 1, gd).getDay() + 1) % 7
  }, [viewYear, viewMonth])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedJalali = value ? isoToJalali(value) : null
  const isDayDisabled = (jd: number) => {
    const iso = jalaliToISO(viewYear, viewMonth, jd)
    if (minDate && iso < minDate) return true
    if (maxDate && iso > maxDate) return true
    return false
  }

  const goPrevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const goNextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  const goPrevYear = () => setViewYear(y => y - 1)
  const goNextYear = () => setViewYear(y => y + 1)
  const pickToday = () => { onChange(todayJalali.iso); setOpen(false) }
  const handleDayClick = (jd: number) => {
    if (isDayDisabled(jd)) return
    onChange(jalaliToISO(viewYear, viewMonth, jd)); setOpen(false)
  }

  const navBtnStyle: React.CSSProperties = {
    padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent',
    color: EMERALD.primary, fontSize: 12, cursor: 'pointer', lineHeight: 1,
  }
  const heightClass = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && <p style={{ fontSize: 10, color: EMERALD.textMute, marginBottom: 3, fontWeight: 500 }}>{label}</p>}
      <button
        type="button" onClick={() => setOpen(o => !o)}
        className={`w-full ${heightClass} px-2.5 rounded-md border flex items-center justify-between gap-1.5 cursor-pointer transition-colors hover:border-emerald-400 hover:bg-emerald-50/50`}
        style={{ borderColor: EMERALD.border, backgroundColor: EMERALD.bgCard }}
      >
        <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="flex-1 text-right font-mono" style={{ color: displayText ? EMERALD.textMain : EMERALD.textSoft, fontSize: 11 }} dir="ltr">
          {displayText || placeholder}
        </span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div dir="rtl" style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 3, zIndex: 50,
            width: 240, backgroundColor: EMERALD.popupBg, border: `1px solid ${EMERALD.border}`,
            borderRadius: 10, boxShadow: '0 8px 24px -4px rgba(4,120,87,0.18)', padding: 10, overflow: 'hidden',
          }}>
            <div style={{
              background: `linear-gradient(135deg, ${EMERALD.headerBg} 0%, #d1fae5 100%)`,
              margin: -10, marginBottom: 8, padding: '8px 10px', borderRadius: '10px 10px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button type="button" onClick={goPrevYear} style={navBtnStyle}>«</button>
              <button type="button" onClick={goPrevMonth} style={navBtnStyle}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: EMERALD.primaryDk }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button type="button" onClick={goNextMonth} style={navBtnStyle}>›</button>
              <button type="button" onClick={goNextYear} style={navBtnStyle}>»</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: i === 6 ? EMERALD.primary : EMERALD.textMute, padding: '2px 0' }}>{w}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 24 }} />
                const isSelected = selectedJalali && selectedJalali.jy === viewYear && selectedJalali.jm === viewMonth && selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
                const isFriday = i % 7 === 6
                const disabled = isDayDisabled(d)
                return (
                  <button key={i} type="button" disabled={disabled} onClick={() => handleDayClick(d)} style={{
                    height: 24, borderRadius: 5, fontSize: 11,
                    border: isSelected ? 'none' : isToday ? `1px solid ${EMERALD.todayRing}` : 'none',
                    backgroundColor: isSelected ? EMERALD.primary : isToday ? EMERALD.headerBg : 'transparent',
                    color: isSelected ? '#fff' : disabled ? EMERALD.textSoft : isToday ? EMERALD.primaryDk : isFriday ? EMERALD.primary : EMERALD.textMain,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: isSelected ? 700 : isToday ? 600 : isFriday ? 500 : 400,
                  }}
                    onMouseEnter={e => { if (!disabled && !isSelected) e.currentTarget.style.backgroundColor = '#d1fae5' }}
                    onMouseLeave={e => { if (!disabled && !isSelected) e.currentTarget.style.backgroundColor = isToday ? EMERALD.headerBg : 'transparent' }}
                  >{toFaNum(d)}</button>
                )
              })}
            </div>
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${EMERALD.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={pickToday} style={{ fontSize: 10, color: EMERALD.primary, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 10, color: EMERALD.textMute, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                بستن ✕
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface DateRangePickerProps {
  value: { from: string; to: string }
  onChange: (v: { from: string; to: string }) => void
  size?: 'sm' | 'md'
}

function PersianDateRangePicker({ value, onChange, size = 'md' }: DateRangePickerProps) {
  const safeValue = { from: value.from || todayGregorianISO(), to: value.to || todayGregorianISO() }
  const handleFromChange = (iso: string) => {
    if (iso > safeValue.to) onChange({ from: iso, to: iso })
    else onChange({ from: iso, to: safeValue.to })
  }
  const handleToChange = (iso: string) => {
    if (iso < safeValue.from) onChange({ from: iso, to: iso })
    else onChange({ from: safeValue.from, to: iso })
  }
  return (
    <div className="flex items-end gap-2">
      <div style={{ width: size === 'sm' ? 130 : 150, flexShrink: 0 }}>
        <PersianDatePicker value={safeValue.from} onChange={handleFromChange} placeholder="از تاریخ" label="از تاریخ" maxDate={safeValue.to} size={size} />
      </div>
      <div style={{ width: size === 'sm' ? 130 : 150, flexShrink: 0 }}>
        <PersianDatePicker value={safeValue.to} onChange={handleToChange} placeholder="تا تاریخ" label="تا تاریخ" minDate={safeValue.from} size={size} />
      </div>
    </div>
  )
}

// ============================================================================
//  StatCard
// ============================================================================

interface StatCardProps {
  label: string; value: number; icon: React.ReactNode
  color: 'emerald' | 'blue' | 'amber' | 'red' | 'gray' | 'purple' | 'teal' | 'pink' | 'indigo'
  suffix?: string; hint?: string
}

// ★ v9.5: StatCard با تشخیص خودکار رنگ بر اساس مثبت/منفی بودن
function StatCard({ label, value, icon, color, suffix, hint }: StatCardProps) {
  // ★ v9.5: اگر مقدار منفی است، رنگ قرمز استفاده شود
  const isNegative = value < 0
  const effectiveColor = isNegative ? 'red' : color
  
  const colorMap: Record<string, { gradient: string; iconBg: string }> = {
    emerald: { gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20' },
    blue: { gradient: 'from-blue-500 to-blue-600', iconBg: 'bg-white/20' },
    amber: { gradient: 'from-amber-500 to-amber-600', iconBg: 'bg-white/20' },
    red: { gradient: 'from-red-500 to-red-600', iconBg: 'bg-white/20' },
    purple: { gradient: 'from-purple-500 to-purple-600', iconBg: 'bg-white/20' },
    gray: { gradient: 'from-gray-500 to-gray-600', iconBg: 'bg-white/20' },
    teal: { gradient: 'from-teal-500 to-teal-600', iconBg: 'bg-white/20' },
    pink: { gradient: 'from-pink-500 to-pink-600', iconBg: 'bg-white/20' },
    indigo: { gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20' },
  }
  const c = colorMap[effectiveColor]
  return (
    <div className={`bg-gradient-to-br ${c.gradient} rounded-xl p-2.5 sm:p-3 text-white shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">{label}</p>
          <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">
            {/* ★ v9.5: نمایش علامت منفی برای اعداد منفی */}
          {isNegative ? '-' : ''}{Math.abs(value).toLocaleString('fa-IR')}
          </p>
          <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">
            {suffix}
          </p>
          {hint && <p className="text-[9px] sm:text-[10px] text-white/60 mt-0.5 truncate">{hint}</p>}
        </div>
        <div className={`w-7 h-7 rounded-lg ${c.iconBg} backdrop-blur-sm flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-300">
      <AlertCircle className="w-10 h-10 mb-2" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}

// ============================================================================
//  Main Component
// ============================================================================

interface ProfitLossReportProps {
  tier: 'basic' | 'professional' | 'enterprise'
}

export function ProfitLossReport({ tier }: ProfitLossReportProps) {
  const [data, setData] = useState<PnLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(getDefaultDateRange())

  // ★★★ Stateهای جدید برای فیلتر شعبه
  const [branchId, setBranchId] = useState<string>('all')
  const [branches, setBranches] = useState<any[]>([])

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await fetch('/api/branches', { headers: getAuthHeaders() })
        const jsonData = await res.json()
        if (jsonData.success) setBranches(jsonData.data || [])
      } catch (err) {
        console.error('Failed to fetch branches', err)
      }
    }
    fetchBranches()
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ dateFrom: dateRange.from, dateTo: dateRange.to })

      // ★★★ ارسال branchId به بک‌اند اگر "همه شعب" انتخاب نشده باشد
      if (branchId !== 'all') {
        params.set('branchId', branchId)
      }
      
      const res = await fetch(`/api/reports/profit-loss?${params.toString()}`, {
        headers: getAuthHeaders(),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setData(json.data)
      } else {
        setError(json.error || 'خطا در دریافت داده‌ها')
        setData(null)
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange.from, dateRange.to, branchId])

  useEffect(() => { fetchData() }, [fetchData])

  const isProfit = data ? data.netProfit >= 0 : true
  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`
  const cogsInfo = data ? extractCogsInfo(data) : null

  const handleExportExcel = () => {
    if (!data) return
    const rows: [string, number | string][] = [
      ['شرح', 'مبلغ (ریال)'],
      ['فروش کالا و خدمات', data.grossSales],
      ['کم: بازگشت از فروش', -data.salesReturns],
      ['کم: تخفیفات', -data.discounts],
      ['درآمد خالص فروش', data.netSales],
      ['بهای تمام شده کالای فروش رفته', -data.cogs],
      ['سود ناخالص', data.grossProfit],
      ['هزینه‌های عملیاتی', -data.totalOperatingExpenses],
      ...data.operatingExpenses.map(e => [`  - ${e.name}`, -e.amount] as [string, number]),
      ['سود عملیاتی', data.operatingProfit],
      ['سایر درآمدها', data.otherIncome],
      ['کم: سایر هزینه‌ها', -data.otherExpenses],
      ['سود قبل از مالیات', data.profitBeforeTax],
      [isProfit ? 'سود خالص دوره' : 'زیان خالص دوره', data.netProfit],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `profit-loss-${dateRange.from}-to-${dateRange.to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    if (!data) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(generatePrintHtml(data, periodText))
    printWindow.document.close()
  }

  // ========================================================================
  //  ★★★ RENDER: ساختار اصلاح‌شده برای نمایش همیشگی فیلترها
  // ========================================================================
  return (
    <div className="space-y-3 sm:space-y-4">
      
      {/* ۱. نوار ابزار: همیشه در بالای صفحه نمایش داده می‌شود */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
        <PersianDateRangePicker value={dateRange} onChange={setDateRange} />
        
        {/* فیلتر شعبه */}
        <div className="min-w-[150px]">
          <label className="text-[10px] text-gray-500 mb-0.5 block">شعبه</label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 text-xs">
              <Building2 className="w-3.5 h-3.5 ml-1 text-gray-400" />
              <SelectValue placeholder="همه شعب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه شعب (تلفیقی)</SelectItem>
              {branches.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5 mr-auto">
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-9 text-xs" disabled={!data}>
            <Download className="w-3.5 h-3.5 ml-1" />
            اکسل
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 text-xs" disabled={!data}>
            <Printer className="w-3.5 h-3.5 ml-1" />
            چاپ
          </Button>
        </div>
      </div>

      {/* ۲. وضعیت بارگذاری */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 bg-white rounded-lg border border-gray-200">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
          <p className="text-sm text-gray-500">در حال محاسبه گزارش سود و زیان...</p>
        </div>
      )}

      {/* ۳. وضعیت خطا */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 bg-white rounded-lg border border-red-200">
          <AlertCircle className="w-10 h-10 mb-2 text-red-500" />
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-8 text-xs mt-3">
            تلاش مجدد
          </Button>
        </div>
      )}

      {/* ۴. وضعیت خالی بودن داده (فیلترها بالای این بخش هستند و کاربر می‌تواند آن‌ها را تغییر دهد) */}
      {!loading && !error && (!data || (data.invoiceCount === 0 && data.netSales === 0 && data.cogs === 0)) && (
        <div className="flex flex-col items-center justify-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
          <AlertCircle className="w-10 h-10 mb-2 text-gray-300" />
          <p className="text-sm text-gray-500 font-medium">در این بازه زمانی و برای این شعبه، داده‌ای یافت نشد.</p>
          <p className="text-xs text-gray-400 mt-1 mb-3">لطفاً بازه تاریخ را گسترش دهید یا فیلتر شعبه را روی "همه شعب" قرار دهید.</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-8 text-xs">
            تلاش مجدد
          </Button>
        </div>
      )}

      {/* ۵. نمایش داده‌ها (فقط وقتی داده وجود دارد) */}
      {!loading && !error && data && (data.invoiceCount > 0 || data.netSales > 0 || data.cogs > 0) && (
        <>
          {/* Header badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              <Scale className="w-3 h-3 ml-1" />
              صورت سود و زیان — {data._version || 'v9.2'}
            </Badge>
            {data._dataSource && (
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                <Database className="w-3 h-3 ml-1" />
                {data._dataSource === 'journal_entry' ? 'از اسناد حسابداری' : 'از فاکتورها'}
              </Badge>
            )}
            {(data.returnCount ?? 0) > 0 && (
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                {toFaNum(data.returnCount!)} برگشتی
              </Badge>
            )}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            <StatCard
              label="درآمد خالص فروش" value={data.netSales}
              icon={<TrendingUp className="w-3.5 h-3.5 text-white" />} color="emerald" suffix="ریال"
              hint={`${toFaNum(data.invoiceCount)} فاکتور`}
            />
            <StatCard
              label="سود ناخالص" value={data.grossProfit}
              icon={<Coins className="w-3.5 h-3.5 text-white" />} color="blue" suffix="ریال"
              hint={`درصد سود: ${toFaNum(data.grossMargin.toFixed(1))}٪`}
            />
            <StatCard
              label="سود عملیاتی" value={data.operatingProfit}
              icon={<FileText className="w-3.5 h-3.5 text-white" />} color="amber" suffix="ریال"
            />
            <StatCard
              label={isProfit ? 'سود خالص' : 'زیان خالص'}
              value={Math.abs(data.netProfit)}
              icon={isProfit ? <TrendingUp className="w-3.5 h-3.5 text-white" /> : <TrendingDown className="w-3.5 h-3.5 text-white" />}
              color={isProfit ? 'emerald' : 'red'} suffix="ریال"
              hint={`درصد سود: ${toFaNum(data.netMargin.toFixed(1))}٪`}
            />
          </div>

          {/* جزئیات بهای تمام شده */}
          {cogsInfo && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span className="text-xs sm:text-sm font-bold text-blue-900">
                      جزئیات بهای تمام شده کالای فروش رفته
                      {cogsInfo.isJEBased && (
                        <span className="text-[10px] font-normal text-blue-600 mr-2">از اسناد حسابداری</span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">بهای تمام شده فروش:</span>
                      <span className="font-bold text-emerald-700" dir="rtl">
                        {formatCurrency(cogsInfo.cogsFromSales)}
                      </span>
                    </div>
                    {cogsInfo.cogsFromReturns > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">کم: بهای تمام شده برگشتی:</span>
                        <span className="font-bold text-amber-700" dir="rtl">
                          ({formatCurrency(cogsInfo.cogsFromReturns)})
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">بهای تمام شده خالص:</span>
                      <span className="font-bold text-blue-700" dir="rtl">
                        {formatCurrency(cogsInfo.cogsNet)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly trend chart */}
          {data.monthlyBreakdown && data.monthlyBreakdown.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                  روند ماهانه سود و زیان
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={data.monthlyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={v => formatNumberFa(v)} width={80} />
                      <Tooltip formatter={(value: number, name: string) => [formatNumberFa(value), name]} labelFormatter={label => formatMonthLabel(label as string)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" name="فروش" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cogs" name="بهای تمام شده" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="netProfit" name="سود خالص" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Two-column: P&L Statement + Category Pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* P&L Statement */}
            <Card className="border-gray-200 lg:col-span-2">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                  <Scale className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                  صورت سود و زیان استاندارد
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  دوره: {periodText} • تعداد فاکتور: {toFaNum(data.invoiceCount)}
                  {(data.returnCount ?? 0) > 0 && ` • برگشتی: ${toFaNum(data.returnCount!)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="space-y-1">
                  <div className="py-2 border-b-2 border-gray-200">
                    <p className="text-xs font-bold text-gray-700">۱. درآمد فروش</p>
                  </div>
                  <PnLRow label="فروش کالا و خدمات" value={data.grossSales} color="emerald" indent={false} />
                  {data.salesReturns > 0 && (
                    <PnLRow label="کم: بازگشت از فروش" value={data.salesReturns} color="red" negative indent />
                  )}
                  {data.discounts > 0 && (
                    <PnLRow label="کم: تخفیفات" value={data.discounts} color="red" negative indent />
                  )}
                  <PnLRow label="درآمد خالص فروش" value={data.netSales} color="emerald" bold highlight="emerald" />

                  <div className="py-2 border-b-2 border-gray-200 mt-3">
                    <p className="text-xs font-bold text-gray-700">۲. بهای تمام شده کالای فروش رفته</p>
                  </div>
                  <PnLRow
                    label={`از انبار (میانگین وزنی)${cogsInfo?.isJEBased ? ' — از اسناد حسابداری' : ''}`}
                    value={data.cogs} color="gray" indent
                  />
                  <PnLRow label="سود ناخالص" value={data.grossProfit} color="blue" bold highlight="blue" />

                  <div className="py-2 border-b-2 border-gray-200 mt-3">
                    <p className="text-xs font-bold text-gray-700">۳. هزینه‌های عملیاتی</p>
                  </div>
                  {data.operatingExpenses.length === 0 ? (
                    <p className="text-xs text-gray-400 pr-4 py-1.5">هزینه عملیاتی ثبت نشده است</p>
                  ) : (
                    data.operatingExpenses.map((exp, idx) => (
                      <PnLRow key={idx} label={exp.name} value={exp.amount} color="red" negative indent />
                    ))
                  )}
                  <PnLRow label="سود عملیاتی" value={data.operatingProfit} color="amber" bold highlight="amber" />

                  <div className="py-2 border-b-2 border-gray-200 mt-3">
                    <p className="text-xs font-bold text-gray-700">۴. سایر درآمدها و هزینه‌ها</p>
                  </div>
                  <PnLRow label="سایر درآمدها" value={data.otherIncome} color="emerald" indent />
                  <PnLRow label="سایر هزینه‌ها" value={data.otherExpenses} color="red" negative indent />
                  <PnLRow label="سود قبل از مالیات" value={data.profitBeforeTax} color="gray" bold highlight="gray" />

                  <div className="py-2 border-b-2 border-gray-200 mt-3">
                    <p className="text-xs font-bold text-gray-700">۵. مالیات بر درآمد</p>
                  </div>
                  <PnLRow label="مالیات بر درآمد" value={data.incomeTax} color="red" negative indent />

                 {/* ★ v9.5: نمایش صحیح زیان/سود خالص */}
<div className={`flex justify-between items-center py-3 mt-2 border-2 rounded-lg px-3 ${
  isProfit ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
}`}>
  <span className="text-sm sm:text-base font-bold text-gray-900">
    {isProfit ? 'سود خالص دوره' : 'زیان خالص دوره'}
  </span>
  <span className={`text-base sm:text-lg font-bold ${isProfit ? 'text-emerald-700' : 'text-red-700'}`} dir="ltr">
    {/* ★ v9.5: نمایش با پرانتز برای زیان */}
    {isProfit 
      ? `${data.netProfit.toLocaleString('fa-IR')} ریال` 
      : `(${Math.abs(data.netProfit).toLocaleString('fa-IR')} ریال)`
    }
  </span>
</div>
                </div>
              </CardContent>
            </Card>

            {/* Category Pie */}
            <Card className="border-gray-200">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                  <PieIcon className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                  سود ناخالص به تفکیک دسته
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                {!data.categoryBreakdown || data.categoryBreakdown.length === 0 ? (
                  <EmptyState message="داده‌ای موجود نیست" />
                ) : (
                  <>
                    <div style={{ width: '100%', height: 200 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={data.categoryBreakdown} dataKey="grossProfit" nameKey="categoryName" cx="50%" cy="50%" outerRadius={70}>
                            {data.categoryBreakdown.map((_, idx) => (
                              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatNumberFa(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 space-y-1 max-h-[180px] overflow-y-auto">
                      {data.categoryBreakdown.map((cat, idx) => (
                        <div key={cat.categoryId} className="flex items-center justify-between text-xs py-1 border-b border-gray-100">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                            <span className="text-gray-700">{cat.categoryName}</span>
                          </div>
                          <span className="font-bold text-emerald-700" dir="ltr">{formatCurrency(cat.grossProfit)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top 10 Products */}
          {data.topProfitableProducts && data.topProfitableProducts.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                  <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                  ۱۰ محصول برتر از نظر سودآوری
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-200 bg-gray-50">
                        <th className="py-2 px-2 text-right text-gray-600">رتبه</th>
                        <th className="py-2 px-2 text-right text-gray-600">نام محصول</th>
                        <th className="py-2 px-2 text-center text-gray-600">تعداد</th>
                        <th className="py-2 px-2 text-left text-gray-600">فروش</th>
                        <th className="py-2 px-2 text-left text-gray-600">بهای تمام شده</th>
                        <th className="py-2 px-2 text-left text-gray-600">سود</th>
                        <th className="py-2 px-2 text-center text-gray-600">درصد سود</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProfitableProducts.map((p, idx) => (
                        <tr key={p.productId} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                              idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>{toFaNum(idx + 1)}</span>
                          </td>
                          <td className="py-2 px-2 font-medium text-gray-800">{p.productName}</td>
                          <td className="py-2 px-2 text-center" dir="ltr">{toFaNum(p.quantity)}</td>
                          <td className="py-2 px-2 text-left text-emerald-700" dir="rtl">{formatCurrency(p.revenue)}</td>
                          <td className="py-2 px-2 text-left text-red-500" dir="rtl">{formatCurrency(p.cogs)}</td>
                          <td className="py-2 px-2 text-left font-bold text-blue-700" dir="rtl">{formatCurrency(p.grossProfit)}</td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              {toFaNum(p.margin)}٪
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400 py-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>
              گزارش سود و زیان — {data._version || 'v9.2'} — منبع: {data._dataSource === 'journal_entry' ? 'اسناد حسابداری' : 'فاکتورها'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
//  PnLRow
// ============================================================================

// ★ v9.5: PnLRow — تشخیص خودکار منفی/مثبت بودن
function PnLRow({
  label, value, color, negative = false, indent = false, bold = false,
  highlight,
}: {
  label: string; value: number; color: string
  negative?: boolean; indent?: boolean; bold?: boolean
  highlight?: 'emerald' | 'blue' | 'amber' | 'gray'
}) {
  // ★ v9.5: اگر خود عدد منفی است، رنگ قرمز بگیرد
  const isNegative = negative || value < 0
  
  const textColor = isNegative 
    ? 'text-red-600'  // منفی → قرمز
    : ({
        emerald: 'text-emerald-600', blue: 'text-blue-700',
        amber: 'text-amber-700', red: 'text-red-500', gray: 'text-gray-700',
      }[color] || 'text-gray-700')

  const highlightClass = highlight ? {
    emerald: 'border-b-2 border-emerald-200 bg-emerald-50/30 px-2 -mx-2',
    blue: 'border-b-2 border-blue-200 bg-blue-50/30 px-2 -mx-2',
    amber: 'border-b-2 border-amber-200 bg-amber-50/30 px-2 -mx-2',
    gray: 'border-b-2 border-gray-300 bg-gray-50/50 px-2 -mx-2',
  }[highlight] : ''

  // ★ v9.5: فرمت‌دهی صحیح — منفی با پرانتز
  const displayValue = value < 0 
    ? `(${Math.abs(value).toLocaleString('fa-IR')} ریال)`
    : `${value.toLocaleString('fa-IR')} ریال`

  return (
    <div className={`flex justify-between items-center py-1.5 ${highlightClass}`}>
      <span className={`text-xs sm:text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${indent ? 'pr-4' : ''}`}>
        {label}
      </span>
      <span className={`text-xs sm:text-sm ${bold ? 'font-bold' : 'font-medium'} ${textColor}`} dir="ltr">
        {displayValue}
      </span>
    </div>
  )
}

// ============================================================================
//  Print HTML
// ============================================================================

function generatePrintHtml(data: PnLData, periodText: string): string {
  const isProfit = data.netProfit >= 0
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>صورت سود و زیان</title>
<style>
  body { font-family: Tahoma, sans-serif; font-size: 11px; padding: 20px; direction: rtl; }
  h1 { color: #059669; margin-bottom: 4px; font-size: 16px; }
  p.period { color: #6b7280; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 1px solid #f3f4f6; }
  th { background: #f9fafb; padding: 8px; text-align: right; font-size: 11px; color: #374151; }
  td { padding: 6px 8px; font-size: 11px; }
  td:last-child { text-align: left; direction: ltr; }
  .section { background: #f3f4f6; font-weight: bold; }
  .indent { padding-right: 20px; color: #6b7280; }
  .subtotal { font-weight: bold; background: #f0fdf4; }
  .total { font-weight: bold; font-size: 13px; background: ${isProfit ? '#d1fae5' : '#fee2e2'}; color: ${isProfit ? '#065f46' : '#991b1b'}; }
  .negative { color: #dc2626; }
</style>
</head>
<body>
<h1>صورت سود و زیان</h1>
<p class="period">${periodText} • تعداد فاکتور: ${data.invoiceCount}</p>
<table>
  <tr class="section"><td colspan="2">۱. درآمد فروش</td></tr>
  <tr><td class="indent">فروش کالا و خدمات</td><td>${formatCurrency(data.grossSales)}</td></tr>
  ${data.salesReturns > 0 ? `<tr><td class="indent">کم: بازگشت از فروش</td><td class="negative">(${formatCurrency(data.salesReturns)})</td></tr>` : ''}
  ${data.discounts > 0 ? `<tr><td class="indent">کم: تخفیفات</td><td class="negative">(${formatCurrency(data.discounts)})</td></tr>` : ''}
  <tr class="subtotal"><td>درآمد خالص فروش</td><td>${formatCurrency(data.netSales)}</td></tr>
  <tr class="section"><td colspan="2">۲. بهای تمام شده</td></tr>
  <tr><td class="indent">بهای تمام شده کالای فروش رفته</td><td class="negative">(${formatCurrency(data.cogs)})</td></tr>
  <tr class="subtotal"><td>سود ناخالص</td><td>${formatCurrency(data.grossProfit)}</td></tr>
  <tr class="section"><td colspan="2">۳. هزینه‌های عملیاتی</td></tr>
  ${data.operatingExpenses.map(e => `<tr><td class="indent">${e.name}</td><td class="negative">(${formatCurrency(e.amount)})</td></tr>`).join('')}
  <tr class="subtotal"><td>سود عملیاتی</td><td>${formatCurrency(data.operatingProfit)}</td></tr>
  <tr class="section"><td colspan="2">۴. سایر</td></tr>
  <tr><td class="indent">سایر درآمدها</td><td>${formatCurrency(data.otherIncome)}</td></tr>
  <tr><td class="indent">سایر هزینه‌ها</td><td class="negative">(${formatCurrency(data.otherExpenses)})</td></tr>
  <tr class="subtotal"><td>سود قبل از مالیات</td><td>${formatCurrency(data.profitBeforeTax)}</td></tr>
  <tr class="total"><td>${isProfit ? 'سود خالص دوره' : 'زیان خالص دوره'}</td><td>${formatCurrency(Math.abs(data.netProfit))}</td></tr>
</table>
<br><p style="color:#9ca3af;font-size:9px;">ShopAccounting — ${data._version || ''} — منبع: ${data._dataSource === 'journal_entry' ? 'اسناد حسابداری' : 'فاکتورها'}</p>
</body>
</html>`
}

export default ProfitLossReport