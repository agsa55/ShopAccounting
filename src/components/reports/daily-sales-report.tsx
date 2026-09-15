// src/components/reports/daily-sales-report.tsx
// ShopAccounting v10.2.0 — Daily Sales Report (نسخه نهایی کامل)
// ★ حفظ کامل Date Picker شمسی
// ★ فیلترهای پیشرفته: جستجو، روش پرداخت، انبار
// ★ نمایش کاملاً جدید و واضح‌تر فاکتورها و کالاها
// ★ بک‌گراند متمایز برای بخش جزئیات فاکتور
// ★ نمایش انبار در سطح فاکتور و کالا

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  BarChart3, Calendar, Wallet, TrendingDown, Banknote, CreditCard,
  Receipt, RotateCcw, Package, ChevronDown, X, Search, Filter,
  Download, Printer, FileText, Tag, Building2, Hash, AlertCircle,
  CheckCircle2, Loader2, Layers, Box,
} from 'lucide-react'

import {
  exportToExcel, printReport, formatNumberFa, toFaNum,
  type ReportColumn, type ReportMeta,
} from '@/lib/report-utils'

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

interface DateRange {
  from: string
  to: string
}

interface DailySalesReportProps {
  invoices: any[]
}

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

const PAYMENT_LABELS_FA: Record<string, string> = {
  Cash: 'نقدی',
  Card: 'کارتی',
  Credit: 'نسیه',
  Installment: 'قسطی',
  Check: 'چک',
  Online: 'آنلاین',
  cash: 'نقدی',
  card: 'کارتی',
  credit: 'نسیه',
  installment: 'قسطی',
  check: 'چک',
  online: 'آنلاین',
}

const PAYMENT_ICONS: Record<string, string> = {
  Cash: '💵',
  Card: '💳',
  Credit: '📝',
  Installment: '📅',
  Check: '🏦',
  Online: '🌐',
  cash: '💵',
  card: '💳',
  credit: '📝',
  installment: '📅',
  check: '🏦',
  online: '🌐',
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

const PAGE_SIZE = 10

const EMERALD = {
  primary: '#047857', primaryLt: '#10b981', primaryDk: '#065f46',
  accent: '#0d9488', accentLt: '#14b8a6',
  textMain: '#1f2937', textMute: '#6b7280', textSoft: '#9ca3af',
  border: '#e5e7eb', borderSoft: '#f3f4f6',
  bgSoft: '#f9fafb', bgCard: '#ffffff', popupBg: '#ffffff',
  headerBg: '#ecfdf5', weekendBg: '#f0fdfa', todayRing: '#14b8a6',
}

// ═══════════════════════════════════════════════════════════════
//  Persian/Jalali Date Utilities (حفظ کامل)
// ═══════════════════════════════════════════════════════════════

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

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length; const gy = jy + 621; let leapJ = -14
  let jp = breaks[0]; let jm = 0, jump = 0, leap = 0, n = 0
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy)
  for (let i = 1; i < bl; i += 1) { jm = breaks[i]; jump = jm - jp; if (jy < jm) break; leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm }
  n = jy - jp; leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4
  return { leap, gy, march }
}

function isJalaliLeapYear(jy: number): boolean { return jalCal(jy).leap === 0 }
function daysInJalaliMonth(jy: number, jm: number): number { if (jm <= 6) return 31; if (jm <= 11) return 30; return isJalaliLeapYear(jy) ? 30 : 29 }

function isoToJalali(iso: string): { jy: number; jm: number; jd: number } | null {
  if (!iso) return null
  try {
    const safeDateStr = iso.includes('T') ? iso : `${iso}T12:00:00`
    const d = new Date(safeDateStr)
    if (isNaN(d.getTime())) return null
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return { jy, jm, jd }
  } catch { return null }
}

function jalaliToISO(jy: number, jm: number, jd: number): string { const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd); return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}` }
function formatJalaliLong(isoDate: string): string { try { const d = new Date(isoDate); const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}` } catch { return isoDate } }
function formatJalaliShort(isoDate: string): string { try { const d = new Date(isoDate); const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}` } catch { return isoDate } }

function todayGregorianISO(): string { return new Date().toISOString().split('T')[0] }
function daysAgoISO(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }

// ═══════════════════════════════════════════════════════════════
//  Invoice Helpers
// ═══════════════════════════════════════════════════════════════

function getInvoiceDate(inv: any): string { return inv.invoiceDate || inv.createdAt || inv.date || '' }
function getInvoiceTotal(inv: any): number { return Number(inv.finalAmount ?? inv.totalAmount ?? 0) }
function getInvoiceStatus(inv: any): string { return String(inv.status || inv.paymentStatus || '').toUpperCase() }
function getInvoicePaymentType(inv: any): string { return String(inv.paymentType || 'cash') }
function getInvoiceCustomer(inv: any): string {
  return inv.customerName || inv.customer?.name || (inv.customer ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim() : '') || (inv.customerId ? `مشتری ${String(inv.customerId).substring(0, 8)}` : 'بدون مشتری')
}
function getInvoiceNumber(inv: any): string { return inv.invoiceNumber || inv.number || '-' }
function getInvoiceWarehouse(inv: any): string { return inv.warehouseName || inv.warehouse?.name || '' }

function paginate(data: any[], page: number): any[] { const start = (page - 1) * PAGE_SIZE; return data.slice(start, start + PAGE_SIZE) }

function getStoreName(): string { return 'فروشگاه' }
function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════
//  Persian Date Picker (حفظ کامل از کد اصلی)
// ═══════════════════════════════════════════════════════════════

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
    const j = isoToJalali(value)
    if (!j) return ''
    return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2, '۰')}/${toFaNum(j.jd).padStart(2, '۰')}`
  }, [value])

  const todayJalali = useMemo(() => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return { jy, jm, jd, iso: now.toISOString().split('T')[0] }
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
    const jsDay = new Date(gy, gm - 1, gd).getDay()
    return (jsDay + 1) % 7
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
  const handleDayClick = (jd: number) => { if (isDayDisabled(jd)) return; onChange(jalaliToISO(viewYear, viewMonth, jd)); setOpen(false) }

  const heightClass = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'
  const navBtnStyle: React.CSSProperties = {
    padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent',
    color: EMERALD.primary, fontSize: 12, cursor: 'pointer', lineHeight: 1,
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && <p style={{ fontSize: 10, color: EMERALD.textMute, marginBottom: 3, fontWeight: 500 }}>{label}</p>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
            borderRadius: 10, boxShadow: '0 8px 24px -4px rgba(4, 120, 87, 0.18), 0 4px 8px -2px rgba(4, 120, 87, 0.1)',
            padding: 10, overflow: 'hidden',
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
                const isFriday = i % 7 === 6
                const disabled = isDayDisabled(d)
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleDayClick(d)}
                    style={{
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
                  >
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${EMERALD.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={pickToday} style={{ fontSize: 10, color: EMERALD.primary, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]} {toFaNum(todayJalali.jy)}
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

// ═══════════════════════════════════════════════════════════════
//  Persian Date Range Picker (حفظ کامل از کد اصلی)
// ═══════════════════════════════════════════════════════════════

function PersianDateRangePicker({ value, onChange, size = 'md' }: { value: DateRange; onChange: (v: DateRange) => void; size?: 'sm' | 'md' }) {
  const safeValue: DateRange = { from: value.from || todayGregorianISO(), to: value.to || todayGregorianISO() }
  const handleFromChange = (iso: string) => { if (iso > safeValue.to) onChange({ from: iso, to: iso }); else onChange({ from: iso, to: safeValue.to }) }
  const handleToChange = (iso: string) => { if (iso < safeValue.from) onChange({ from: iso, to: iso }); else onChange({ from: safeValue.from, to: iso }) }
  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <div style={{ width: size === 'sm' ? 130 : 150, flexShrink: 0 }}>
        <PersianDatePicker value={safeValue.from} onChange={handleFromChange} placeholder="از تاریخ" label="از تاریخ" maxDate={safeValue.to} size={size} />
      </div>
      <div style={{ width: size === 'sm' ? 130 : 150, flexShrink: 0 }}>
        <PersianDatePicker value={safeValue.to} onChange={handleToChange} placeholder="تا تاریخ" label="تا تاریخ" minDate={safeValue.from} size={size} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Shared UI Components
// ═══════════════════════════════════════════════════════════════

function EmptyState({ message = 'داده‌ای برای نمایش وجود ندارد' }: { message?: string }) {
  return (
    <div className="py-12 text-center text-gray-400">
      <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function EmptyListPlaceholder({ message = 'برای مشاهده رکوردها، دکمه «نمایش لیست» را بزنید' }: { message?: string }) {
  return (
    <div className="py-10 text-center bg-gray-50/30 rounded-lg border border-dashed border-gray-200">
      <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
      <p className="text-xs text-gray-400">{message}</p>
    </div>
  )
}

function Pagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (total <= PAGE_SIZE) return null
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50/50">
      <p className="text-[10px] text-gray-500">
        نمایش {toFaNum(from)} تا {toFaNum(to)} از {toFaNum(total)} رکورد
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>قبلی</Button>
        <span className="text-xs text-gray-600 px-2 font-medium">صفحه {toFaNum(page)} از {toFaNum(totalPages)}</span>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>بعدی</Button>
      </div>
    </div>
  )
}

function ShowListButton({ onClick, loading, visible, totalCount }: { onClick: () => void; loading?: boolean; visible: boolean; totalCount?: number }) {
  if (visible) return (
    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200">
      <FileText className="w-3.5 h-3.5" />
      <span>لیست نمایش داده شد{typeof totalCount === 'number' ? ` (${toFaNum(totalCount)} رکورد)` : ''}</span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-gray-500 hover:text-gray-700 mr-1" onClick={onClick}>پنهان کنید</Button>
    </div>
  )
  return (
    <Button onClick={onClick} disabled={loading} className="gap-1.5 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600">
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
      نمایش لیست
    </Button>
  )
}

function ReportActions({ onExportExcel, onPrint, disabled }: { onExportExcel: () => void; onPrint: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" onClick={onExportExcel} disabled={disabled} className="gap-1.5 h-9 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300" title="دانلود فایل اکسل">
        <Download className="w-3.5 h-3.5" />اکسل
      </Button>
      <Button variant="outline" onClick={onPrint} disabled={disabled} className="gap-1.5 h-9 text-xs border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300" title="چاپ / ذخیره PDF">
        <Printer className="w-3.5 h-3.5" />PDF / چاپ
      </Button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت: کارت کالای فروخته‌شده (نمایش واضح و رنگی)
// ═══════════════════════════════════════════════════════════════

function InvoiceItemCard({ item, index }: { item: any; index: number }) {
  const qty = Number(item.quantity) || 0
  const unitPrice = Number(item.unitPrice) || 0
  const lineTotal = Number(item.totalAmount || item.lineTotal || 0)
  const productName = item.productName || item.name || 'کالا'
  const productCode = item.productCode || item.code || ''
  const unitLabel = item.unitLabel || ''
  const categoryName = item.categoryName || ''
  const warehouseName = item.warehouseName || item.warehouse?.name || ''
  const discount = Number(item.discount || item.discountAmount || 0)
  const tax = Number(item.taxAmount || 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* هدر کارت: نام و کد کالا */}
      <div className="bg-gradient-to-l from-blue-50/80 to-indigo-50/50 px-3 py-2.5 border-b border-blue-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
              <Box className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight">{productName}</p>
              {productCode && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Hash className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] font-mono text-gray-500" dir="ltr">{productCode}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-left shrink-0">
            <p className="text-[9px] text-gray-400 mb-0.5">مبلغ کل</p>
            <p className="text-sm font-bold text-blue-700 font-mono" dir="ltr">{formatNumberFa(lineTotal)}</p>
          </div>
        </div>
      </div>

      {/* بدنه کارت: جزئیات به صورت گرید */}
      <div className="px-3 py-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {/* تعداد */}
          <div className="bg-emerald-50/50 rounded-lg px-2 py-1.5 border border-emerald-100">
            <p className="text-[9px] text-emerald-600 font-medium mb-0.5">تعداد</p>
            <p className="text-xs font-bold text-emerald-700" dir="rtl">
              {formatNumberFa(qty)} <span className="text-[9px] font-normal">{unitLabel}</span>
            </p>
          </div>

          {/* قیمت واحد */}
          <div className="bg-purple-50/50 rounded-lg px-2 py-1.5 border border-purple-100">
            <p className="text-[9px] text-purple-600 font-medium mb-0.5">قیمت واحد</p>
            <p className="text-xs font-bold text-purple-700" dir="ltr">{formatNumberFa(unitPrice)}</p>
          </div>

          {/* تخفیف */}
          {discount > 0 && (
            <div className="bg-red-50/50 rounded-lg px-2 py-1.5 border border-red-100">
              <p className="text-[9px] text-red-600 font-medium mb-0.5">تخفیف</p>
              <p className="text-xs font-bold text-red-700" dir="ltr">-{formatNumberFa(discount)}</p>
            </div>
          )}

          {/* مالیات */}
          {tax > 0 && (
            <div className="bg-amber-50/50 rounded-lg px-2 py-1.5 border border-amber-100">
              <p className="text-[9px] text-amber-600 font-medium mb-0.5">مالیات</p>
              <p className="text-xs font-bold text-amber-700" dir="ltr">+{formatNumberFa(tax)}</p>
            </div>
          )}
        </div>

        {/* دسته‌بندی و انبار */}
        {(categoryName || warehouseName) && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-wrap">
            {categoryName && (
              <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">
                <Tag className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] text-indigo-700 font-medium">{categoryName}</span>
              </div>
            )}
            {warehouseName && (
              <div className="flex items-center gap-1.5 bg-teal-50 px-2 py-1 rounded-md border border-teal-100">
                <Building2 className="w-3 h-3 text-teal-500" />
                <span className="text-[10px] text-teal-700 font-medium">{warehouseName}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت: کارت فاکتور (بک‌گراند متمایز و نمایش بهتر)
// ═══════════════════════════════════════════════════════════════

function InvoiceCard({
  invoice,
  isSelected,
  onToggle,
}: {
  invoice: any
  isSelected: boolean
  onToggle: () => void
}) {
  const invNumber = getInvoiceNumber(invoice)
  const invTotal = getInvoiceTotal(invoice)
  const invCustomer = getInvoiceCustomer(invoice)
  const invType = (invoice.invoiceType || '').toLowerCase()
  const isReturn = invType === 'sale_return' || invType === 'purchase_return'
  const invPaymentType = getInvoicePaymentType(invoice)
  const paymentLabel = PAYMENT_LABELS_FA[invPaymentType] || invPaymentType
  const paymentIcon = PAYMENT_ICONS[invPaymentType] || '💰'
  const itemsCount = Array.isArray(invoice.items) ? invoice.items.length : 0
  const warehouseName = getInvoiceWarehouse(invoice)

  const invoiceTime = (() => {
    try {
      const d = new Date(getInvoiceDate(invoice))
      const hh = toFaNum(String(d.getHours()).padStart(2, '0'))
      const mm = toFaNum(String(d.getMinutes()).padStart(2, '0'))
      return `${hh}:${mm}`
    } catch {
      return ''
    }
  })()

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${
      isSelected
        ? 'border-emerald-400 shadow-lg shadow-emerald-100 ring-2 ring-emerald-200'
        : 'border-gray-200 hover:border-emerald-300 hover:shadow-md'
    }`}>
      {/* هدر فاکتور */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
          isSelected ? 'bg-gradient-to-l from-emerald-50 to-teal-50' : 'bg-white hover:bg-gray-50'
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* آیکون فاکتور */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
            isReturn
              ? 'bg-gradient-to-br from-amber-400 to-orange-500'
              : 'bg-gradient-to-br from-emerald-400 to-teal-600'
          }`}>
            {isReturn ? (
              <RotateCcw className="w-5 h-5 text-white" />
            ) : (
              <Receipt className="w-5 h-5 text-white" />
            )}
          </div>

          {/* اطلاعات فاکتور */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono font-bold text-gray-900">{invNumber}</span>
              <span className="text-[10px] text-gray-400 font-mono" dir="ltr">{invoiceTime}</span>
              {isReturn && (
                <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-300 h-5 px-1.5">
                  برگشتی
                </Badge>
              )}
              {itemsCount > 0 && (
                <Badge className="text-[9px] bg-blue-50 text-blue-600 border-blue-200 h-5 px-1.5">
                  {toFaNum(itemsCount)} کالا
                </Badge>
              )}
              {warehouseName && (
                <Badge className="text-[9px] bg-teal-50 text-teal-600 border-teal-200 h-5 px-1.5">
                  🏪 {warehouseName}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[11px] text-gray-600 truncate">{invCustomer}</p>
              <span className="text-gray-300">•</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px]">{paymentIcon}</span>
                <span className="text-[11px] text-gray-500">{paymentLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* مبلغ و فلش */}
        <div className="flex items-center gap-3 shrink-0 mr-3">
          <div className="text-left">
            <p className="text-[9px] text-gray-400 mb-0.5">مبلغ فاکتور</p>
            <p className={`text-base font-bold font-mono ${isReturn ? 'text-amber-600' : 'text-emerald-600'}`} dir="ltr">
              {isReturn ? `(${formatNumberFa(invTotal)})` : formatNumberFa(invTotal)}
            </p>
          </div>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${
            isSelected
              ? 'bg-emerald-600 text-white rotate-180 shadow-md'
              : 'bg-gray-100 text-gray-500'
          }`}>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* جزئیات فاکتور (باز شده) - بک‌گراند متمایز */}
      {isSelected && (
        <div className="bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 px-4 py-4 border-t-2 border-emerald-200">
          {/* هدر بخش کالاها */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                <Layers className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">
                  کالاهای فروخته‌شده
                </p>
                <p className="text-[10px] text-gray-500">
                  {toFaNum(itemsCount)} آیتم در این فاکتور
                </p>
              </div>
            </div>
            <div className="bg-white rounded-lg px-3 py-1.5 border border-gray-200 shadow-sm">
              <p className="text-[9px] text-gray-400">جمع کل</p>
              <p className="text-sm font-bold text-emerald-700 font-mono" dir="ltr">
                {formatNumberFa(invTotal)} ریال
              </p>
            </div>
          </div>

          {!Array.isArray(invoice.items) || invoice.items.length === 0 ? (
            <div className="py-6 text-center bg-white rounded-lg border border-dashed border-gray-300">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-500">آیتمی برای این فاکتور ثبت نشده است</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {invoice.items.map((item: any, idx: number) => (
                <InvoiceItemCard key={idx} item={item} index={idx} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function DailySalesReport({ invoices }: DailySalesReportProps) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: daysAgoISO(30),
    to: todayGregorianISO(),
  })
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  // فیلترهای پیشرفته
 // فیلترهای پیشرفته
const [searchQuery, setSearchQuery] = useState('')
const [paymentFilter, setPaymentFilter] = useState<string>('all')
const [warehouseFilter, setWarehouseFilter] = useState<string>('all')
const [showFilters, setShowFilters] = useState(false)

// ★ لیست انبارها از سرور
const [warehouses, setWarehouses] = useState<any[]>([])

useEffect(() => {
  setListVisible(false)
  setPage(1)
  setSelectedInvoiceId(null)
}, [dateRange.from, dateRange.to])

// ★ دریافت لیست انبارها از سرور
useEffect(() => {
  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses', { headers: getAuthHeaders() })
      const data = await res.json()
      console.log('[DailySales] Warehouses API response:', data)
      if (data.success) {
        const list = data.data || []
        console.log('[DailySales] Warehouses list:', list)
        setWarehouses(Array.isArray(list) ? list : [])
      } else {
        console.warn('[DailySales] Warehouses API not successful:', data.error)
      }
    } catch (err) {
      console.error('[DailySales] Failed to fetch warehouses:', err)
    }
  }
  fetchWarehouses()
}, [])

// ★ اضافه شود: دریافت لیست انبارها از سرور (مثل گزارش موجودی کالا)
useEffect(() => {
  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses', { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        const list = data.data || []
        setWarehouses(Array.isArray(list) ? list : [])
      }
    } catch (err) {
      console.error('[DailySales] Failed to fetch warehouses:', err)
    }
  }
  fetchWarehouses()
}, [])

  // استخراج لیست انبارهای موجود در فاکتورها
 // ★ لیست انبارها از سرور (همه انبارهای فروشگاه، نه فقط آن‌هایی که در فاکتورها هستند)
const availableWarehouses = useMemo(() => {
  return warehouses
    .filter((wh: any) => wh.isActive !== false)
    .map((wh: any) => ({
      id: wh.id,
      name: wh.name || wh.code || 'انبار',
    }))
}, [warehouses])

  // فیلتر فاکتورها بر اساس تاریخ و فیلترهای کاربر
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d) return false
      if (d < dateRange.from || d > dateRange.to) return false
      if (getInvoiceStatus(inv) === 'CANCELLED') return false

      // فیلتر روش پرداخت
      if (paymentFilter !== 'all') {
        const pt = getInvoicePaymentType(inv).toLowerCase()
        if (pt !== paymentFilter.toLowerCase()) return false
      }

     // فیلتر انبار
if (warehouseFilter !== 'all') {
  // بررسی انبار در سطح فاکتور
  const invWarehouseId = String(inv.warehouseId || inv.warehouse?.id || '')
  
  // بررسی انبار در سطح آیتم‌ها (اگر فاکتور مستقیماً انبار ندارد)
  const itemWarehouseIds = Array.isArray(inv.items)
    ? inv.items
        .map((item: any) => String(item.warehouseId || item.warehouse?.id || ''))
        .filter(Boolean)
    : []
  
  const allWarehouseIds = [invWarehouseId, ...itemWarehouseIds].filter(Boolean)
  
  // اگر فاکتور هیچ انباری ندارد، فقط در حالت "همه انبارها" نمایش داده شود
  if (allWarehouseIds.length === 0) {
    return false
  }
  
  if (!allWarehouseIds.includes(String(warehouseFilter))) {
    return false
  }
}

      // فیلتر جستجو
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const invNumber = getInvoiceNumber(inv).toLowerCase()
        const customer = getInvoiceCustomer(inv).toLowerCase()
        const items = inv.items || []
        const hasMatchingItem = items.some((item: any) => {
          const name = (item.productName || item.name || '').toLowerCase()
          const code = (item.productCode || item.code || '').toLowerCase()
          return name.includes(query) || code.includes(query)
        })
        if (!invNumber.includes(query) && !customer.includes(query) && !hasMatchingItem) {
          return false
        }
      }

      return true
    })
  }, [invoices, dateRange.from, dateRange.to, paymentFilter, warehouseFilter, searchQuery])

  // گروه‌بندی فاکتورها بر اساس تاریخ
  const salesByDate = useMemo(() => {
    const map: Record<string, {
      date: string
      count: number
      countReturn: number
      total: number
      totalSale: number
      totalReturn: number
      cash: number
      credit: number
    }> = {}

    filteredInvoices.forEach((inv) => {
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d) return

      const invType = (inv.invoiceType || '').toLowerCase()
      const isReturn = invType === 'sale_return' || invType === 'purchase_return'
      const totalAmount = getInvoiceTotal(inv)
      const pt = getInvoicePaymentType(inv)

      if (!map[d]) map[d] = { date: d, count: 0, countReturn: 0, total: 0, totalSale: 0, totalReturn: 0, cash: 0, credit: 0 }

      if (isReturn) {
        map[d].countReturn++
        map[d].totalReturn += totalAmount
        map[d].total -= totalAmount
        if (pt === 'Cash' || pt === 'cash') map[d].cash -= totalAmount
        else map[d].credit -= totalAmount
      } else {
        map[d].count++
        map[d].totalSale += totalAmount
        map[d].total += totalAmount
        if (pt === 'Cash' || pt === 'cash') map[d].cash += totalAmount
        else map[d].credit += totalAmount
      }
    })

    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
  }, [filteredInvoices])

  const invoicesByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    filteredInvoices.forEach((inv) => {
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d) return
      if (!map[d]) map[d] = []
      map[d].push(inv)
    })
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => new Date(getInvoiceDate(b)).getTime() - new Date(getInvoiceDate(a)).getTime())
    )
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredInvoices])

  const grandTotal = salesByDate.reduce((s, d) => s + d.total, 0)
  const grandCash = salesByDate.reduce((s, d) => s + d.cash, 0)
  const grandCredit = salesByDate.reduce((s, d) => s + d.credit, 0)
  const totalCount = salesByDate.reduce((s, d) => s + d.count, 0)
  const totalCountReturn = salesByDate.reduce((s, d) => s + d.countReturn, 0)
  const totalSale = salesByDate.reduce((s, d) => s + d.totalSale, 0)
  const totalReturn = salesByDate.reduce((s, d) => s + d.totalReturn, 0)

  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`

  const paginatedData = paginate(salesByDate, page)

  const handleExportExcel = () => {
    const meta: ReportMeta = {
      title: 'گزارش فروش روزانه',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'فروش کل (خالص)', value: formatNumberFa(grandTotal), color: 'green' },
        { label: 'فاکتورهای فروش', value: formatNumberFa(totalCount), color: 'blue' },
        { label: 'برگشتی‌ها', value: formatNumberFa(totalCountReturn), color: 'amber' },
        { label: 'نقدی (خالص)', value: formatNumberFa(grandCash), color: 'blue' },
        { label: 'نسیه (خالص)', value: formatNumberFa(grandCredit), color: 'amber' },
      ],
    }
    const columns: ReportColumn[] = [
      { key: 'date', label: 'تاریخ', align: 'right' },
      { key: 'count', label: 'فاکتور فروش', isNumeric: true, align: 'center' },
      { key: 'countReturn', label: 'برگشتی', isNumeric: true, align: 'center' },
      { key: 'totalSale', label: 'جمع فروش', isCurrency: true, align: 'left' },
      { key: 'totalReturn', label: 'جمع برگشتی', isCurrency: true, align: 'left' },
      { key: 'total', label: 'فروش خالص', isCurrency: true, align: 'left' },
    ]
    const rows = salesByDate.map((d) => ({
      date: formatJalaliLong(d.date),
      count: d.count,
      countReturn: d.countReturn,
      totalSale: d.totalSale,
      totalReturn: d.totalReturn,
      total: d.total,
    }))
    exportToExcel(meta, columns, rows, 'گزارش-فروش-روزانه')
  }

  const handlePrint = () => {
    const meta: ReportMeta = {
      title: 'گزارش فروش روزانه',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'فروش کل (خالص)', value: formatNumberFa(grandTotal), color: 'green' },
        { label: 'فاکتورهای فروش', value: formatNumberFa(totalCount), color: 'blue' },
        { label: 'برگشتی‌ها', value: formatNumberFa(totalCountReturn), color: 'amber' },
        { label: 'نقدی (خالص)', value: formatNumberFa(grandCash), color: 'blue' },
      ],
      note: `این گزارش بر اساس ${toFaNum(salesByDate.length)} روز فعال در بازه مشخص شده تولید شده است.`,
    }
    const columns: ReportColumn[] = [
      { key: 'date', label: 'تاریخ', align: 'right' },
      { key: 'count', label: 'فاکتور فروش', isNumeric: true, align: 'center' },
      { key: 'countReturn', label: 'برگشتی', isNumeric: true, align: 'center' },
      { key: 'totalSale', label: 'جمع فروش', isCurrency: true, align: 'left' },
      { key: 'totalReturn', label: 'جمع برگشتی', isCurrency: true, align: 'left' },
      { key: 'total', label: 'فروش خالص', isCurrency: true, align: 'left' },
    ]
    const rows = salesByDate.map((d) => ({
      date: formatJalaliLong(d.date),
      count: d.count,
      countReturn: d.countReturn,
      totalSale: d.totalSale,
      totalReturn: d.totalReturn,
      total: d.total,
    }))
    printReport(meta, columns, rows)
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  هدر: انتخاب بازه (شمسی) + فیلترها + اکسل/چاپ */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <PersianDateRangePicker value={dateRange} onChange={setDateRange} />

        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs gap-1"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-3.5 h-3.5" />
          فیلترها
        </Button>

        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={salesByDate.length === 0} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  پنل فیلترها (قابل باز/بسته شدن) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showFilters && (
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* جستجو */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">جستجو در فاکتورها</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="شماره فاکتور، نام مشتری، نام یا کد کالا..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-9 h-9 text-xs"
                  />
                </div>
              </div>

              {/* فیلتر روش پرداخت */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">روش پرداخت</label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="h-9 w-full text-xs">
                    <SelectValue placeholder="همه روش‌ها" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه روش‌ها</SelectItem>
                    <SelectItem value="cash">💵 نقدی</SelectItem>
                    <SelectItem value="card">💳 کارتخوان</SelectItem>
                    <SelectItem value="credit">📝 نسیه</SelectItem>
                    <SelectItem value="check">🏦 چک</SelectItem>
                    <SelectItem value="installment">📅 قسطی</SelectItem>
                    <SelectItem value="online">🌐 آنلاین</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* فیلتر انبار */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">انبار</label>
                <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                  <SelectTrigger className="h-9 w-full text-xs">
                    <Building2 className="w-3.5 h-3.5 ml-1 text-gray-400" />
                    <SelectValue placeholder="همه انبارها" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه انبارها</SelectItem>
                    {availableWarehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        🏪 {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  کارت‌های آماری */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">فروش خالص</p>
              <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(grandTotal)}</p>
              <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">{toFaNum(totalCount)} فاکتور</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Wallet className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">برگشتی</p>
              <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(totalReturn)}</p>
              <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">{toFaNum(totalCountReturn)} فاکتور</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <TrendingDown className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">نقدی (خالص)</p>
              <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(grandCash)}</p>
              <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">تومان</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Banknote className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">نسیه (خالص)</p>
              <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(grandCredit)}</p>
              <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">تومان</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <CreditCard className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  لیست فاکتورها با جزئیات کامل (کارت‌های جدید) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className="border-gray-200">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-1.5 text-gray-700">
              <Receipt className="w-4 h-4 text-emerald-600" />
              فاکتورهای فروش روزانه
              <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">
                {toFaNum(invoicesByDate.length)} روز
              </Badge>
              {filteredInvoices.length !== invoices.length && (
                <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200">
                  {toFaNum(filteredInvoices.length)} فاکتور (فیلتر شده)
                </Badge>
              )}
            </CardTitle>
            {selectedInvoiceId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] text-gray-500 hover:text-gray-700"
                onClick={() => setSelectedInvoiceId(null)}
              >
                <X className="w-3 h-3 ml-1" />
                بستن جزئیات
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {invoicesByDate.length === 0 ? (
            <EmptyState message="در این بازه فاکتوری ثبت نشده است" />
          ) : (
            <div className="max-h-[600px] overflow-y-auto space-y-4">
              {invoicesByDate.map(([date, dayInvoices]) => {
                const dayTotal = dayInvoices.reduce((s, inv) => {
                  const invType = (inv.invoiceType || '').toLowerCase()
                  const isReturn = invType === 'sale_return' || invType === 'purchase_return'
                  return s + (isReturn ? -getInvoiceTotal(inv) : getInvoiceTotal(inv))
                }, 0)
                const daySalesCount = dayInvoices.filter((inv) => {
                  const invType = (inv.invoiceType || '').toLowerCase()
                  return invType !== 'sale_return' && invType !== 'purchase_return'
                }).length
                const dayReturnCount = dayInvoices.filter((inv) => {
                  const invType = (inv.invoiceType || '').toLowerCase()
                  return invType === 'sale_return' || invType === 'purchase_return'
                }).length

                return (
                  <div key={date}>
                    {/* هدر روز */}
                    <div className="bg-gradient-to-l from-emerald-50 to-teal-50 px-4 py-3 rounded-xl border border-emerald-100 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md">
                            <Calendar className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{formatJalaliLong(date)}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge className="text-[9px] bg-white text-emerald-700 border-emerald-200 h-4 px-1.5">
                                {toFaNum(daySalesCount)} فروش
                              </Badge>
                              {dayReturnCount > 0 && (
                                <Badge className="text-[9px] bg-white text-amber-700 border-amber-200 h-4 px-1.5">
                                  {toFaNum(dayReturnCount)} برگشتی
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] text-gray-500 mb-0.5">جمع روز</p>
                          <p className={`text-base font-bold font-mono ${dayTotal >= 0 ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr">
                            {dayTotal >= 0 ? formatNumberFa(dayTotal) : `(${formatNumberFa(Math.abs(dayTotal))})`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* لیست فاکتورهای روز */}
                    <div className="space-y-2.5">
                      {dayInvoices.map((inv) => (
                        <InvoiceCard
                          key={inv.id}
                          invoice={inv}
                          isSelected={selectedInvoiceId === inv.id}
                          onToggle={() => setSelectedInvoiceId(selectedInvoiceId === inv.id ? null : inv.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  لیست تجمیعی فروش روزانه */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-600">لیست تجمیعی فروش روزانه</p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={salesByDate.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده رکوردهای روزانه، دکمه «نمایش لیست» را بزنید" />
          ) : salesByDate.length === 0 ? (
            <EmptyState message="داده‌ای در این بازه یافت نشد" />
          ) : (
            <div className="overflow-x-auto -mx-3 sm:-mx-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs whitespace-nowrap">تاریخ</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">فاکتور فروش</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">برگشتی</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">جمع فروش</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">جمع برگشتی</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">فروش خالص</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((day) => (
                    <TableRow
                      key={day.date}
                      className={day.totalReturn > 0 ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-emerald-50/50'}
                    >
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatJalaliLong(day.date)}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap text-blue-600 font-medium">
                        {formatNumberFa(day.count)}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap text-amber-600 font-medium">
                        {day.countReturn > 0 ? formatNumberFa(day.countReturn) : '—'}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-blue-600 font-medium whitespace-nowrap hidden sm:table-cell" dir="ltr">
                        {formatNumberFa(day.totalSale)}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-amber-600 font-medium whitespace-nowrap hidden sm:table-cell" dir="ltr">
                        {day.totalReturn > 0 ? formatNumberFa(day.totalReturn) : '—'}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm font-bold whitespace-nowrap" dir="ltr" style={{ color: day.total > 0 ? '#059669' : '#dc2626' }}>
                        {day.total >= 0 ? formatNumberFa(day.total) : `(${formatNumberFa(Math.abs(day.total))})`}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50 font-bold border-t-2 border-gray-300">
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">جمع کل</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap text-blue-600">{formatNumberFa(totalCount)}</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap text-amber-600">
                      {totalCountReturn > 0 ? formatNumberFa(totalCountReturn) : '—'}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm text-blue-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">
                      {formatNumberFa(totalSale)}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm text-amber-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">
                      {totalReturn > 0 ? formatNumberFa(totalReturn) : '—'}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap" dir="ltr" style={{ color: grandTotal > 0 ? '#059669' : '#dc2626' }}>
                      {grandTotal >= 0 ? formatNumberFa(grandTotal) : `(${formatNumberFa(Math.abs(grandTotal))})`}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <Pagination page={page} total={salesByDate.length} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default DailySalesReport