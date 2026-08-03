'use client'

// ============================================================================
// src/components/reports/inventory-advanced-report.tsx
// ShopAccounting v6.7 — Advanced Inventory Reports (Fully Fixed)
// ============================================================================
// ★ v6.7 تغییرات:
//   ۱. کارت‌های آماری گرادیان رنگی
//   ۲. اصلاح باگ DatePicker (timezone fix)
//   ۳. تمام مبالغ به ریال با "ریال" در سمت چپ
//   ۴. محاسبه دقیق ارزش انبار
//   ۵. ترجمه کامل اصطلاحات
// ============================================================================

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Package, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, Wallet,
  AlertTriangle, Loader2, Download, Printer, Calendar,
  TrendingUp, Coins, CheckCircle2, XCircle,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts'

// ============================================================================
//  Helpers
// ============================================================================

const toFaNum = (n: number | string) => String(n || 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

// ★ v6.7: تابع فرمت مبلغ با واحد ریال در انتها
const formatCurrency = (n: number) => `${(n || 0).toLocaleString('fa-IR')} ریال`

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const CHART_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
]

const REPORT_TYPES = [
  { value: 'stockByWarehouse', label: 'موجودی هر انبار', icon: Package },
  { value: 'movements', label: 'حرکت کالا', icon: ArrowRightLeft },
  { value: 'value', label: 'ارزش انبار', icon: Wallet },
  { value: 'lowStock', label: 'کالاهای کم‌موجود', icon: AlertTriangle },
]

// ============================================================================
//  Persian/Jalali Date Utilities — بدون باگ timezone
// ============================================================================

function div(a: number, b: number): number { return Math.floor(a / b) }
function mod(a: number, b: number): number { return a - Math.floor(a / b) * b }

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * div(days, 12053); days = mod(days, 12053)
  jy += 4 * div(days, 1461); days = mod(days, 1461)
  if (days > 365) { jy += div(days - 1, 365); days = mod(days - 1, 365) }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30))
  return [jy, jm, jd]
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days = 365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * div(days, 146097); days = mod(days, 146097)
  if (days > 36524) { gy += 100 * div(--days, 36524); days = mod(days, 36524); if (days >= 365) days++ }
  gy += 4 * div(days, 1461); days = mod(days, 1461)
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
  for (let i = 1; i < bl; i++) { jm = breaks[i]; jump = jm - jp; if (jy < jm) break; leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm }
  n = jy - jp; leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4
  return { leap, gy, march }
}

function isJalaliLeapYear(jy: number): boolean { return jalCal(jy).leap === 0 }
function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31; if (jm <= 11) return 30; return isJalaliLeapYear(jy) ? 30 : 29
}

// ★ اصلاح‌شده: parsing دستی ISO برای جلوگیری از باگ timezone
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

function formatJalaliShort(isoDate: string): string {
  try {
    const j = isoToJalali(isoDate); if (!j) return isoDate
    return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2, '۰')}/${toFaNum(j.jd).padStart(2, '۰')}`
  } catch { return isoDate }
}

function formatJalaliLong(isoDate: string): string {
  try {
    const j = isoToJalali(isoDate); if (!j) return isoDate
    return `${toFaNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toFaNum(j.jy)}`
  } catch { return isoDate }
}

// ★ اصلاح‌شده: استفاده از timezone محلی
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

// ============================================================================
//  PersianDatePicker — نسخه اصلاح‌شده (بدون باگ)
// ============================================================================

const EMERALD = {
  primary: '#047857', primaryDk: '#065f46', textMain: '#1f2937',
  textMute: '#6b7280', textSoft: '#9ca3af', border: '#e5e7eb',
  bgCard: '#ffffff', popupBg: '#ffffff', headerBg: '#ecfdf5',
  todayRing: '#14b8a6',
}

interface PersianDatePickerProps {
  value: string; onChange: (iso: string) => void
  placeholder?: string; label?: string
  minDate?: string; maxDate?: string; size?: 'sm' | 'md'
}

function PersianDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ', label, minDate, maxDate, size = 'sm' }: PersianDatePickerProps) {
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
    return { jy, jm, jd, iso: todayGregorianISO() }
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
  const isDayDisabled = (jd: number): boolean => {
    const cellIso = jalaliToISO(viewYear, viewMonth, jd)
    if (minDate && cellIso < minDate) return true
    if (maxDate && cellIso > maxDate) return true
    return false
  }

  const goPrevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1) } else setViewMonth((m) => m - 1) }
  const goNextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1) } else setViewMonth((m) => m + 1) }
  const goPrevYear = () => setViewYear((y) => y - 1)
  const goNextYear = () => setViewYear((y) => y + 1)
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
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full ${heightClass} px-2.5 rounded-md border flex items-center justify-between gap-1.5 cursor-pointer transition-colors hover:border-emerald-400 hover:bg-emerald-50/50`}
        style={{ borderColor: EMERALD.border, backgroundColor: EMERALD.bgCard }}>
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
              <button type="button" onClick={goPrevYear} title="سال قبل" style={navBtnStyle}>«</button>
              <button type="button" onClick={goPrevMonth} title="ماه قبل" style={navBtnStyle}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: EMERALD.primaryDk }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button type="button" onClick={goNextMonth} title="ماه بعد" style={navBtnStyle}>›</button>
              <button type="button" onClick={goNextYear} title="سال بعد" style={navBtnStyle}>»</button>
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
                const isFriday = i % 7 === 6; const disabled = isDayDisabled(d)
                return (
                  <button key={i} type="button" disabled={disabled} onClick={() => handleDayClick(d)} style={{
                    height: 24, borderRadius: 5, fontSize: 11,
                    border: isSelected ? 'none' : (isToday ? `1px solid ${EMERALD.todayRing}` : 'none'),
                    backgroundColor: isSelected ? EMERALD.primary : (isToday ? EMERALD.headerBg : 'transparent'),
                    color: isSelected ? '#fff' : (disabled ? EMERALD.textSoft : (isToday ? EMERALD.primaryDk : (isFriday ? EMERALD.primary : EMERALD.textMain))),
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)),
                    transition: 'background-color 0.1s',
                  }}
                    onMouseEnter={(e) => { if (!disabled && !isSelected) e.currentTarget.style.backgroundColor = '#d1fae5' }}
                    onMouseLeave={(e) => { if (!disabled && !isSelected) e.currentTarget.style.backgroundColor = isToday ? EMERALD.headerBg : 'transparent' }}
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

// ============================================================================
//  PersianDateRangePicker
// ============================================================================

interface DateRange { from: string; to: string }

function PersianDateRangePicker({ value, onChange, size = 'sm' }: { value: DateRange; onChange: (v: DateRange) => void; size?: 'sm' | 'md' }) {
  const safeValue: DateRange = { from: value.from || todayGregorianISO(), to: value.to || todayGregorianISO() }
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
//  StatCard — نسخه گرادیان (مثل صفحه گزارش)
// ============================================================================

interface StatCardProps {
  label: string; value: number | string; icon: React.ReactNode
  color: 'emerald' | 'blue' | 'amber' | 'red' | 'purple' | 'gray' | 'teal'
  suffix?: string; hint?: string
}

function StatCard({ label, value, icon, color, suffix, hint }: StatCardProps) {
  const colorMap: Record<string, { gradient: string; iconBg: string }> = {
    emerald: { gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20' },
    blue: { gradient: 'from-blue-500 to-blue-600', iconBg: 'bg-white/20' },
    amber: { gradient: 'from-amber-500 to-amber-600', iconBg: 'bg-white/20' },
    red: { gradient: 'from-red-500 to-red-600', iconBg: 'bg-white/20' },
    purple: { gradient: 'from-purple-500 to-purple-600', iconBg: 'bg-white/20' },
    gray: { gradient: 'from-gray-500 to-gray-600', iconBg: 'bg-white/20' },
    teal: { gradient: 'from-teal-500 to-teal-600', iconBg: 'bg-white/20' },
  }
  const c = colorMap[color]
  const displayValue = typeof value === 'number' ? formatNumber(value) : value

  return (
    <div className={`bg-gradient-to-br ${c.gradient} rounded-xl p-2.5 sm:p-3 text-white shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">{label}</p>
          <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">
            {displayValue}
          </p>
          {suffix && <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">{suffix}</p>}
          {hint && <p className="text-[9px] sm:text-[10px] text-white/60 mt-0.5 truncate">{hint}</p>}
        </div>
        <div className={`w-7 h-7 rounded-lg ${c.iconBg} backdrop-blur-sm flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
//  محاسبه دقیق ارزش انبار — v6.7
// ============================================================================

function calculateWarehouseValue(product: any): number {
  // ★ اولویت ۱: مقدار totalValue از سرور
  if (product.totalValue !== undefined && product.totalValue !== null) {
    return Number(product.totalValue) || 0
  }

  // ★ اولویت ۲: محاسبه از currentStock × averageCost
  const stock = Number(product.currentStock || product.totalQty || 0)
  const avgCost = Number(product.averageCost || product.purchasePrice || product.cost || 0)

  if (stock > 0 && avgCost > 0) {
    return stock * avgCost
  }

  // ★ اولویت ۳: جمع‌بندی از warehouseStocks
  if (Array.isArray(product.warehouseStocks)) {
    return product.warehouseStocks.reduce((sum: number, ws: any) => {
      const qty = Number(ws.quantity || 0)
      const cost = Number(ws.averageCost || ws.unitCost || avgCost || 0)
      return sum + (qty * cost)
    }, 0)
  }

  return 0
}

function calculateRetailValue(product: any): number {
  // ارزش فروش = موجودی × قیمت فروش
  const stock = Number(product.currentStock || product.totalQty || 0)
  const salePrice = Number(product.salePrice || product.retailPrice || 0)
  return stock * salePrice
}

function calculatePotentialProfit(product: any): number {
  // سود بالقوه = ارزش فروش - ارزش انبار
  const warehouseValue = calculateWarehouseValue(product)
  const retailValue = calculateRetailValue(product)
  return retailValue - warehouseValue
}

function calculateShortageValue(product: any): number {
  // ارزش کمبود = (حداقل - موجودی فعلی) × قیمت خرید
  const stock = Number(product.currentStock || 0)
  const minStock = Number(product.minStock || 0)
  const shortage = Math.max(0, minStock - stock)
  const cost = Number(product.averageCost || product.purchasePrice || product.cost || 0)
  return shortage * cost
}

// ============================================================================
//  Main Component
// ============================================================================

export function InventoryAdvancedReport() {
  const [reportType, setReportType] = useState<string>('stockByWarehouse')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [warehouseId, setWarehouseId] = useState<string>('all')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [dateRange, setDateRange] = useState<DateRange>({ from: daysAgoISO(30), to: todayGregorianISO() })
  const [lowStockOnly, setLowStockOnly] = useState(false)

  const warehouses = data?.warehouses || []
  const categories = data?.categories || []

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ type: reportType })
      if (warehouseId !== 'all') params.set('warehouseId', warehouseId)
      if (categoryId !== 'all') params.set('categoryId', categoryId)
      if (reportType === 'movements') {
        if (dateRange.from) params.set('dateFrom', dateRange.from)
        if (dateRange.to) params.set('dateTo', dateRange.to)
      }
      if (lowStockOnly) params.set('lowStockOnly', 'true')

      const res = await fetch(`/api/reports/inventory-advanced?${params.toString()}`, {
        headers: getAuthHeaders(),
      })
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.error || 'خطا در دریافت داده‌ها')
        setData(null)
      }
    } catch (err: any) {
      console.error('[Inventory Report] Fetch error:', err)
      setError(err?.message || 'خطا در ارتباط با سرور')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [reportType, warehouseId, categoryId, dateRange.from, dateRange.to, lowStockOnly])

  useEffect(() => { fetchData() }, [fetchData])

  // ★ محاسبه مجدد مقادیر در سمت کلاینت برای اطمینان از صحت
  const enrichedProducts = useMemo(() => {
    if (!data?.products) return []
    return data.products.map((p: any) => ({
      ...p,
      totalValue: calculateWarehouseValue(p),
      retailValue: calculateRetailValue(p),
      potentialProfit: calculatePotentialProfit(p),
      shortageValue: calculateShortageValue(p),
    }))
  }, [data?.products])

  const enrichedSummary = useMemo(() => {
    if (!data?.summary) return null
    const summary = { ...data.summary }

    if (reportType === 'stockByWarehouse' && enrichedProducts.length > 0) {
      summary.totalValue = enrichedProducts.reduce((sum, p) => sum + (p.totalValue || 0), 0)
      summary.totalPotentialProfit = enrichedProducts.reduce((sum, p) => sum + (p.potentialProfit || 0), 0)
      summary.totalRetailValue = enrichedProducts.reduce((sum, p) => sum + (p.retailValue || 0), 0)
    }

    if (reportType === 'lowStock' && enrichedProducts.length > 0) {
      summary.totalShortageValue = enrichedProducts.reduce((sum, p) => sum + (p.shortageValue || 0), 0)
    }

    if (reportType === 'value' && data.warehouseValues) {
      summary.totalValue = data.warehouseValues.reduce((sum: number, w: any) => sum + (Number(w.totalValue) || 0), 0)
    }

    return summary
  }, [data?.summary, enrichedProducts, reportType, data?.warehouseValues])

  const handleExportExcel = () => {
    if (!data) return
    let rows: (string | number)[][] = []
    let filename = `inventory-${reportType}`

    if (reportType === 'stockByWarehouse' && enrichedProducts.length > 0) {
      rows.push(['کد', 'نام محصول', 'دسته', 'موجودی کل', 'ارزش خرید (ریال)', 'ارزش فروش (ریال)', 'سود بالقوه (ریال)'])
      enrichedProducts.forEach((p: any) => {
        rows.push([p.code, p.name, p.categoryName, p.totalQty || p.currentStock, p.totalValue, p.retailValue, p.potentialProfit])
      })
    } else if (reportType === 'movements' && data.movements) {
      rows.push(['تاریخ', 'محصول', 'نوع', 'از انبار', 'به انبار', 'تعداد', 'هزینه واحد (ریال)', 'ارزش کل (ریال)'])
      data.movements.forEach((m: any) => {
        rows.push([
          formatJalaliLong(m.date),
          m.productName, m.movementTypeLabel,
          m.fromWarehouseName || '—', m.toWarehouseName || '—',
          m.quantity, m.unitCost, m.totalValue,
        ])
      })
    } else if (reportType === 'value' && data.warehouseValues) {
      rows.push(['انبار', 'تعداد محصولات', 'تعداد کل', 'ارزش کل (ریال)'])
      data.warehouseValues.forEach((w: any) => {
        rows.push([w.warehouseName, w.productCount, w.totalQuantity, w.totalValue])
      })
    } else if (reportType === 'lowStock' && enrichedProducts.length > 0) {
      rows.push(['کد', 'نام', 'دسته', 'موجودی', 'حداقل', 'کمبود', 'ارزش کمبود (ریال)', 'وضعیت'])
      enrichedProducts.forEach((p: any) => {
        rows.push([p.code, p.name, p.categoryName, p.currentStock, p.minStock, p.shortage, p.shortageValue, p.status === 'out' ? 'ناموجود' : 'کم‌موجود'])
      })
    }

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
        <p className="text-sm text-gray-500">در حال بارگذاری گزارش...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
        <Button variant="outline" onClick={fetchData}>تلاش مجدد</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* ★ انتخاب نوع گزارش */}
      <div className="flex flex-wrap gap-2">
        {REPORT_TYPES.map((rt) => {
          const Icon = rt.icon
          const isActive = reportType === rt.value
          return (
            <button
              key={rt.value}
              onClick={() => { setReportType(rt.value); setLowStockOnly(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {rt.label}
            </button>
          )
        })}
      </div>

      {/* ★ فیلترها */}
      <Card className="border-gray-200">
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          {(reportType === 'stockByWarehouse' || reportType === 'movements' || reportType === 'value') && (
            <div className="min-w-[150px]">
              <label className="text-[10px] text-gray-500">انبار</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه انبارها</SelectItem>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {reportType === 'stockByWarehouse' && (
            <div className="min-w-[150px]">
              <label className="text-[10px] text-gray-500">دسته</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {reportType === 'movements' && (
            <PersianDateRangePicker value={dateRange} onChange={setDateRange} size="sm" />
          )}

          {reportType === 'stockByWarehouse' && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer h-8 px-2">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              فقط کم‌موجود
            </label>
          )}

          <div className="flex-1" />

          <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-8 text-xs gap-1">
            <Download className="w-3.5 h-3.5" />
            خروجی اکسل
          </Button>
        </CardContent>
      </Card>

      {/* ★ محتوای گزارش */}
    {data && (
        <>
          {/* ★ کارت‌های آماری گرادیان */}
          {enrichedSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {reportType === 'stockByWarehouse' && (
                <>
                  <StatCard
                    label="تعداد محصولات"
                    value={enrichedSummary.totalProducts || 0}
                    icon={<Package className="w-3.5 h-3.5 text-white" />}
                    color="emerald"
                    suffix="محصول"
                  />
                  <StatCard
                    label="موجودی کل"
                    value={enrichedSummary.totalQty || 0}
                    icon={<Coins className="w-3.5 h-3.5 text-white" />}
                    color="blue"
                    suffix="واحد"
                  />
                  <StatCard
                    label="ارزش انبار"
                    value={formatCurrency(enrichedSummary.totalValue || 0)}
                    icon={<Wallet className="w-3.5 h-3.5 text-white" />}
                    color="amber"
                  />
                  <StatCard
                    label="سود بالقوه"
                    value={formatCurrency(enrichedSummary.totalPotentialProfit || 0)}
                    icon={<TrendingUp className="w-3.5 h-3.5 text-white" />}
                    color="teal"
                  />
                </>
              )}
              {reportType === 'movements' && (
                <>
                  <StatCard
                    label="تعداد حرکت‌ها"
                    value={enrichedSummary.totalMovements || 0}
                    icon={<ArrowRightLeft className="w-3.5 h-3.5 text-white" />}
                    color="emerald"
                    suffix="حرکت"
                  />
                  <StatCard
                    label="ارزش ورودی"
                    value={formatCurrency(enrichedSummary.totalIn || 0)}
                    icon={<ArrowDownToLine className="w-3.5 h-3.5 text-white" />}
                    color="blue"
                  />
                  <StatCard
                    label="ارزش خروجی"
                    value={formatCurrency(enrichedSummary.totalOut || 0)}
                    icon={<ArrowUpFromLine className="w-3.5 h-3.5 text-white" />}
                    color="amber"
                  />
                  <StatCard
                    label="انتقال‌ها"
                    value={enrichedSummary.totalTransfer || 0}
                    icon={<ArrowRightLeft className="w-3.5 h-3.5 text-white" />}
                    color="purple"
                    suffix="انتقال"
                  />
                </>
              )}
              {reportType === 'value' && (
                <>
                  <StatCard
                    label="تعداد انبارها"
                    value={enrichedSummary.totalWarehouses || 0}
                    icon={<Package className="w-3.5 h-3.5 text-white" />}
                    color="emerald"
                    suffix="انبار"
                  />
                  <StatCard
                    label="تعداد محصولات"
                    value={enrichedSummary.totalProducts || 0}
                    icon={<Coins className="w-3.5 h-3.5 text-white" />}
                    color="blue"
                    suffix="محصول"
                  />
                  <StatCard
                    label="تعداد کل کالا"
                    value={enrichedSummary.totalQuantity || 0}
                    icon={<Package className="w-3.5 h-3.5 text-white" />}
                    color="amber"
                    suffix="واحد"
                  />
                  <StatCard
                    label="ارزش کل انبار"
                    value={formatCurrency(enrichedSummary.totalValue || 0)}
                    icon={<Wallet className="w-3.5 h-3.5 text-white" />}
                    color="teal"
                  />
                </>
              )}
              {reportType === 'lowStock' && (
                <>
                  <StatCard
                    label="کم‌موجود"
                    value={enrichedSummary.totalLowStock || 0}
                    icon={<AlertTriangle className="w-3.5 h-3.5 text-white" />}
                    color="amber"
                    suffix="کالا"
                  />
                  <StatCard
                    label="ناموجود"
                    value={enrichedSummary.totalOutOfStock || 0}
                    icon={<XCircle className="w-3.5 h-3.5 text-white" />}
                    color="red"
                    suffix="کالا"
                  />
                  <StatCard
                    label="ارزش کمبود"
                    value={formatCurrency(enrichedSummary.totalShortageValue || 0)}
                    icon={<Wallet className="w-3.5 h-3.5 text-white" />}
                    color="red"
                  />
                  <StatCard
                    label="کل کالاهای نیازمند"
                    value={(enrichedSummary.totalLowStock || 0) + (enrichedSummary.totalOutOfStock || 0)}
                    icon={<CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    color="blue"
                    suffix="کالا"
                  />
                </>
              )}
            </div>
          )}

          {/* ★ نمودار (برای value) */}
          {reportType === 'value' && data.warehouseValues && data.warehouseValues.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ارزش انبارها</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.warehouseValues}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="warehouseName" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => formatNumber(v)} width={80} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'ارزش']} contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="totalValue" name="ارزش" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ★ نمودار Pie برای دسته‌بندی (value) */}
          {reportType === 'value' && data.categoryValues && data.categoryValues.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">توزیع ارزش بر اساس دسته</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={data.categoryValues}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry: any) => `${entry.name}: ${toFaNum(Math.round(entry.percent))}٪`}
                      >
                        {data.categoryValues.map((_: any, idx: number) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'ارزش']} contentStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ★ جدول گزارش */}
          <Card className="border-gray-200">
            <CardContent className="p-0">
              {reportType === 'stockByWarehouse' && enrichedProducts.length > 0 && (
                <InventoryStockTable products={enrichedProducts} warehouses={warehouses} />
              )}
              {reportType === 'movements' && data.movements && data.movements.length > 0 && (
                <MovementsTable movements={data.movements} />
              )}
              {reportType === 'value' && data.warehouseValues && (
                <ValueTable warehouseValues={data.warehouseValues} categoryValues={data.categoryValues} />
              )}
              {reportType === 'lowStock' && enrichedProducts.length > 0 && (
                <LowStockTable products={enrichedProducts} />
              )}
              
      
              {((reportType === 'stockByWarehouse' && enrichedProducts.length === 0) ||
                (reportType === 'movements' && (!data.movements || data.movements.length === 0)) ||
                (reportType === 'value' && (!data.warehouseValues || data.warehouseValues.length === 0)) ||
                (reportType === 'lowStock' && enrichedProducts.length === 0)) && (
                <EmptyState message="داده‌ای برای نمایش وجود ندارد" />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ============================================================================
//  Inventory Stock Table (موجودی هر انبار)
// ============================================================================

function InventoryStockTable({ products, warehouses }: { products: any[]; warehouses: any[] }) {
  if (products.length === 0) {
    return <EmptyState message="محصولی یافت نشد" />
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-right text-[10px] py-2 px-2">محصول</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">دسته</TableHead>
            {warehouses.map((w: any) => (
              <TableHead key={w.id} className="text-center text-[10px] py-2 px-2">{w.name}</TableHead>
            ))}
            <TableHead className="text-center text-[10px] py-2 px-2">کل</TableHead>
            <TableHead className="text-left text-[10px] py-2 px-2">ارزش انبار</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id} className="hover:bg-emerald-50/30">
              <TableCell className="text-[11px] py-1.5 px-2">
                <div className="font-medium truncate max-w-[180px]">{p.name}</div>
                <div className="text-[9px] text-gray-400" dir="ltr">{p.code}</div>
              </TableCell>
              <TableCell className="text-center text-[10px] py-1.5 px-2 text-gray-600">{p.categoryName}</TableCell>
              {warehouses.map((w: any) => {
                const ws = p.warehouseStocks?.find((s: any) => s.warehouseId === w.id)
                return (
                  <TableCell key={w.id} className="text-center text-[11px] py-1.5 px-2">
                    {ws ? (
                      <span className={ws.quantity <= 0 ? 'text-red-500' : ws.quantity <= p.minStock ? 'text-amber-600' : 'text-gray-700'}>
                        {formatNumber(ws.quantity)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </TableCell>
                )
              })}
              <TableCell className="text-center text-[11px] py-1.5 px-2 font-bold">
                <span className={p.isOutOfStock ? 'text-red-600' : p.isLowStock ? 'text-amber-600' : 'text-emerald-700'}>
                  {formatNumber(p.totalQty || p.currentStock || 0)}
                </span>
              </TableCell>
              <TableCell className="text-left text-[11px] py-1.5 px-2 font-medium text-gray-700" dir="ltr">
                {formatCurrency(p.totalValue || 0)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ============================================================================
//  Movements Table (حرکت کالا)
// ============================================================================

function MovementsTable({ movements }: { movements: any[] }) {
  if (movements.length === 0) {
    return <EmptyState message="حرکتی در این بازه ثبت نشده است" />
  }

  return (
    <div className="overflow-x-auto max-h-[500px]">
      <Table>
        <TableHeader className="sticky top-0 bg-gray-50 z-10">
          <TableRow>
            <TableHead className="text-right text-[10px] py-2 px-2">تاریخ</TableHead>
            <TableHead className="text-right text-[10px] py-2 px-2">محصول</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">نوع</TableHead>
            <TableHead className="text-right text-[10px] py-2 px-2">از / به</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">تعداد</TableHead>
            <TableHead className="text-left text-[10px] py-2 px-2">ارزش</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.id} className="hover:bg-blue-50/30">
              <TableCell className="text-[10px] py-1.5 px-2 text-gray-500">
                {formatJalaliShort(m.date)}
              </TableCell>
              <TableCell className="text-[11px] py-1.5 px-2">
                <div className="font-medium truncate max-w-[150px]">{m.productName}</div>
                <div className="text-[9px] text-gray-400" dir="ltr">{m.productCode}</div>
              </TableCell>
              <TableCell className="text-center py-1.5 px-2">
                <Badge variant="outline" className={`text-[9px] ${
                  m.movementType === 'sale' ? 'bg-red-50 text-red-700 border-red-200'
                  : m.movementType === 'purchase' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : m.movementType === 'transfer' ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : m.movementType === 'adjustment' ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-gray-50 text-gray-700 border-gray-200'
                }`}>
                  {m.movementTypeLabel}
                </Badge>
              </TableCell>
              <TableCell className="text-[10px] py-1.5 px-2 text-gray-600">
                {m.isTransfer ? (
                  <span>{m.fromWarehouseName} ← {m.toWarehouseName}</span>
                ) : m.isIncoming ? (
                  <span className="text-emerald-600">→ {m.toWarehouseName}</span>
                ) : (
                  <span className="text-red-600">{m.fromWarehouseName} ←</span>
                )}
              </TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2 font-medium">
                {formatNumber(m.quantity)}
                <span className="text-[9px] text-gray-400 mr-1">{m.unitName}</span>
              </TableCell>
              <TableCell className="text-left text-[11px] py-1.5 px-2 text-gray-700" dir="ltr">
                {formatCurrency(m.totalValue || 0)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ============================================================================
//  Value Table (ارزش انبار)
// ============================================================================

function ValueTable({ warehouseValues, categoryValues }: { warehouseValues: any[]; categoryValues: any[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      {/* ★ ارزش بر اساس انبار */}
      <div>
        <h3 className="text-xs font-bold text-gray-700 mb-2">ارزش بر اساس انبار</h3>
        {warehouseValues.length === 0 ? (
          <EmptyState message="داده‌ای موجود نیست" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-right text-[10px] py-2 px-2">انبار</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">محصولات</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">تعداد</TableHead>
                <TableHead className="text-left text-[10px] py-2 px-2">ارزش</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouseValues.map((w) => (
                <TableRow key={w.warehouseId} className="hover:bg-emerald-50/30">
                  <TableCell className="text-[11px] py-1.5 px-2 font-medium">
                    {w.warehouseName}
                    {w.isDefault && <Badge variant="outline" className="text-[8px] mr-1 bg-emerald-50">پیش‌فرض</Badge>}
                  </TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(w.productCount)}</TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(w.totalQuantity)}</TableCell>
                  <TableCell className="text-left text-[11px] py-1.5 px-2 font-bold text-emerald-700" dir="ltr">
                    {formatCurrency(w.totalValue || 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ★ ارزش بر اساس دسته */}
      <div>
        <h3 className="text-xs font-bold text-gray-700 mb-2">ارزش بر اساس دسته</h3>
        {categoryValues.length === 0 ? (
          <EmptyState message="داده‌ای موجود نیست" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-right text-[10px] py-2 px-2">دسته</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">محصولات</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">تعداد</TableHead>
                <TableHead className="text-left text-[10px] py-2 px-2">ارزش</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryValues.map((c, idx) => (
                <TableRow key={idx} className="hover:bg-emerald-50/30">
                  <TableCell className="text-[11px] py-1.5 px-2 font-medium">
                    <span className="inline-block w-2 h-2 rounded-full ml-1.5" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    {c.name}
                  </TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(c.count)}</TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(c.quantity)}</TableCell>
                  <TableCell className="text-left text-[11px] py-1.5 px-2 font-bold text-emerald-700" dir="ltr">
                    {formatCurrency(c.value || 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

// ============================================================================
//  Low Stock Table (کالاهای کم‌موجود)
// ============================================================================

function LowStockTable({ products }: { products: any[] }) {
  if (products.length === 0) {
    return <EmptyState message="همه محصولات موجودی کافی دارند ✓" />
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-right text-[10px] py-2 px-2">محصول</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">دسته</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">موجودی</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">حداقل</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">کمبود</TableHead>
            <TableHead className="text-left text-[10px] py-2 px-2">ارزش کمبود</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">وضعیت</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id} className="hover:bg-amber-50/30">
              <TableCell className="text-[11px] py-1.5 px-2">
                <div className="font-medium truncate max-w-[180px]">{p.name}</div>
                <div className="text-[9px] text-gray-400" dir="ltr">{p.code}</div>
              </TableCell>
              <TableCell className="text-center text-[10px] py-1.5 px-2 text-gray-600">{p.categoryName}</TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2">
                <span className={p.status === 'out' ? 'text-red-600 font-bold' : 'text-amber-600 font-bold'}>
                  {formatNumber(p.currentStock)}
                </span>
              </TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2 text-gray-600">{formatNumber(p.minStock)}</TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2 font-bold text-red-600">
                {p.shortage > 0 ? formatNumber(p.shortage) : '—'}
              </TableCell>
              <TableCell className="text-left text-[11px] py-1.5 px-2 text-red-600" dir="ltr">
                {p.shortageValue > 0 ? formatCurrency(p.shortageValue) : '—'}
              </TableCell>
              <TableCell className="text-center py-1.5 px-2">
                <Badge variant="outline" className={`text-[9px] ${
                  p.status === 'out' ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {p.status === 'out' ? 'ناموجود' : 'کم‌موجود'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ============================================================================
//  Empty State
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Package className="w-10 h-10 mb-2 text-gray-300" />
      <p className="text-xs">{message}</p>
    </div>
  )
}

export default InventoryAdvancedReport