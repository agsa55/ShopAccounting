// src/components/reports/reports-page.tsx
// ShopAccounting v10.0.0 — Reports Page (DailySales Overhaul)

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BarChart3, UserCheck, UserCircle, CalendarClock, ArrowRight, Download, Calendar,
  TrendingUp, TrendingDown, FileText, Scale, Wallet, Coins, Building2,
  Loader2, AlertCircle, Printer, BookOpen, CheckCircle2, XCircle, Clock, AlertTriangle,
  Package, Percent, PieChart as PieIcon, Activity, Crown, ArrowLeft, Store,
  Receipt, CreditCard, Banknote, LayoutDashboard,
  ChevronDown, RotateCcw, X,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

import { useAppStore } from '@/lib/store'
import {
  getFeaturesByPlanName, resolvePlan, isPlanAtLeast,
  type PlanFeatureSet, type PlanTier,
} from '@/lib/plan-features'
import {
  exportToExcel, printReport, formatNumberFa, toFaNum,
  type ReportColumn, type ReportMeta,
} from '@/lib/report-utils'

import { ProfitLossReport } from '@/components/reports/profit-loss-report'
import { InventoryAdvancedReport } from '@/components/reports/inventory-advanced-report'
import { BalanceSheetV8Report } from '@/components/reports/balance-sheet-v8-report'

// ============================================================================
//  Constants & Theme
// ============================================================================

const TIER_LABELS: Record<PlanTier, string> = {
  basic: 'ساده', professional: 'حرفه‌ای', enterprise: 'سازمانی',
}

const TIER_COLORS: Record<PlanTier, { bg: string; text: string; border: string; ring: string }> = {
  basic: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-500/20' },
  professional: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', ring: 'ring-blue-500/20' },
  enterprise: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', ring: 'ring-purple-500/20' },
}

const EMERALD = {
  primary: '#047857', primaryLt: '#10b981', primaryDk: '#065f46',
  accent: '#0d9488', accentLt: '#14b8a6',
  textMain: '#1f2937', textMute: '#6b7280', textSoft: '#9ca3af',
  border: '#e5e7eb', borderSoft: '#f3f4f6',
  bgSoft: '#f9fafb', bgCard: '#ffffff', popupBg: '#ffffff',
  headerBg: '#ecfdf5', weekendBg: '#f0fdfa', todayRing: '#14b8a6',
}

const PAYMENT_COLORS: Record<string, string> = {
  Cash: '#10b981', Card: '#3b82f6', Credit: '#f59e0b',
  Installment: '#8b5cf6', Check: '#ec4899', Online: '#06b6d4',
}

const PAYMENT_LABELS_FA: Record<string, string> = {
  Cash: 'نقدی', Card: 'کارتی', Credit: 'نسیه',
  Installment: 'قسطی', Check: 'چک', Online: 'آنلاین',
}

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

// ============================================================================
//  Persian/Jalali Date Utilities
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
  } catch { 
    return null 
  }
}

function jalaliToISO(jy: number, jm: number, jd: number): string { const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd); return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}` }
function formatJalaliShort(isoDate: string): string { try { const d = new Date(isoDate); const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}` } catch { return isoDate } }
function formatJalaliLong(isoDate: string): string { try { const d = new Date(isoDate); const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}` } catch { return isoDate } }
function formatJalaliDateTime(isoDate: string): string { try { const d = new Date(isoDate); const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); const hh = toFaNum(d.getHours()).padStart(2, '۰'); const mm = toFaNum(d.getMinutes()).padStart(2, '۰'); return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')} - ${hh}:${mm}` } catch { return isoDate } }
function todayGregorianISO(): string { return new Date().toISOString().split('T')[0] }
function daysAgoISO(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }
function firstDayOfCurrentJalaliMonthISO(): string { const now = new Date(); const [jy, jm] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()); const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1); return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}` }
function firstDayOfCurrentJalaliYearISO(): string { const now = new Date(); const [jy] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()); const [gy, gm, gd] = jalaliToGregorian(jy, 1, 1); return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}` }

// ============================================================================
//  Store Helpers
// ============================================================================

function getTenantIdFromStore(): string {
  const state = useAppStore.getState(); const ct = state.currentTenant as any
  if (ct && typeof ct === 'object' && ct.id) return ct.id
  if (ct && typeof ct === 'string') return ct
  if (state.tenantId) return state.tenantId
  if (state.user?.tenantId) return state.user.tenantId
  return ''
}
function getStoreName(): string { const state = useAppStore.getState(); return state.storeName || state.currentTenant?.companyName || 'فروشگاه' }
function getAuthHeaders(): Record<string, string> { const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null; return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }

function getInvoiceDate(inv: any): string { return inv.invoiceDate || inv.createdAt || inv.date || '' }
function getInvoiceTotal(inv: any): number { return Number(inv.finalAmount ?? inv.totalAmount ?? 0) }
function getInvoiceStatus(inv: any): string { return String(inv.status || inv.paymentStatus || '').toUpperCase() }
function getInvoicePaymentType(inv: any): string { return String(inv.paymentType || 'cash') }
function getInvoiceCustomer(inv: any): string {
  return inv.customerName || inv.customer?.name || (inv.customer ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim() : '') || (inv.customerId ? `مشتری ${String(inv.customerId).substring(0, 8)}` : 'بدون مشتری')
}
function getInvoiceNumber(inv: any): string { return inv.invoiceNumber || inv.number || '-' }
function getInvoiceCashier(inv: any): string { return inv.cashierName || inv.cashier?.username || inv.createdByUser?.username || inv.user?.username || 'سیستم' }

// ============================================================================
//  Persian Date Picker
// ============================================================================

interface PersianDatePickerProps { value: string; onChange: (iso: string) => void; placeholder?: string; label?: string; minDate?: string; maxDate?: string; size?: 'sm' | 'md' }

function PersianDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ', label, minDate, maxDate, size = 'md' }: PersianDatePickerProps) {
  const [open, setOpen] = useState(false); const containerRef = useRef<HTMLDivElement>(null)
  const displayText = useMemo(() => { if (!value) return ''; const j = isoToJalali(value); if (!j) return ''; return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2, '۰')}/${toFaNum(j.jd).padStart(2, '۰')}` }, [value])
  const todayJalali = useMemo(() => { const now = new Date(); const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()); return { jy, jm, jd, iso: now.toISOString().split('T')[0] } }, [])
  const initial = useMemo(() => { const j = value ? isoToJalali(value) : null; return j || { jy: todayJalali.jy, jm: todayJalali.jm, jd: todayJalali.jd } }, [value, todayJalali])
  const [viewYear, setViewYear] = useState<number>(initial.jy); const [viewMonth, setViewMonth] = useState<number>(initial.jm)
  useEffect(() => { const j = value ? isoToJalali(value) : null; if (j) { setViewYear(j.jy); setViewMonth(j.jm) } }, [value])
  useEffect(() => { if (!open) return; const handler = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler) }, [open])
  const daysCount = daysInJalaliMonth(viewYear, viewMonth)
  const firstDayOffset = useMemo(() => { const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, 1); const jsDay = new Date(gy, gm - 1, gd).getDay(); return (jsDay + 1) % 7 }, [viewYear, viewMonth])
  const cells: (number | null)[] = []; for (let i = 0; i < firstDayOffset; i++) cells.push(null); for (let d = 1; d <= daysCount; d++) cells.push(d); while (cells.length % 7 !== 0) cells.push(null)
  const selectedJalali = value ? isoToJalali(value) : null
  const isDayDisabled = (jd: number): boolean => { const cellIso = jalaliToISO(viewYear, viewMonth, jd); if (minDate && cellIso < minDate) return true; if (maxDate && cellIso > maxDate) return true; return false }
  const goPrevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1) } else setViewMonth((m) => m - 1) }
  const goNextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1) } else setViewMonth((m) => m + 1) }
  const goPrevYear = () => setViewYear((y) => y - 1); const goNextYear = () => setViewYear((y) => y + 1)
  const pickToday = () => { onChange(todayJalali.iso); setOpen(false) }
  const handleDayClick = (jd: number) => { if (isDayDisabled(jd)) return; onChange(jalaliToISO(viewYear, viewMonth, jd)); setOpen(false) }
  const heightClass = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'
  const navBtnStyle: React.CSSProperties = { padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: EMERALD.primary, fontSize: 12, cursor: 'pointer', lineHeight: 1 }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && <p style={{ fontSize: 10, color: EMERALD.textMute, marginBottom: 3, fontWeight: 500 }}>{label}</p>}
      <button type="button" onClick={() => setOpen((o) => !o)} className={`w-full ${heightClass} px-2.5 rounded-md border flex items-center justify-between gap-1.5 cursor-pointer transition-colors hover:border-emerald-400 hover:bg-emerald-50/50`} style={{ borderColor: EMERALD.border, backgroundColor: EMERALD.bgCard }}>
        <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="flex-1 text-right font-mono" style={{ color: displayText ? EMERALD.textMain : EMERALD.textSoft, fontSize: 11 }} dir="ltr">{displayText || placeholder}</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div dir="rtl" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 3, zIndex: 50, width: 240, backgroundColor: EMERALD.popupBg, border: `1px solid ${EMERALD.border}`, borderRadius: 10, boxShadow: '0 8px 24px -4px rgba(4, 120, 87, 0.18), 0 4px 8px -2px rgba(4, 120, 87, 0.1)', padding: 10, overflow: 'hidden' }}>
            <div style={{ background: `linear-gradient(135deg, ${EMERALD.headerBg} 0%, #d1fae5 100%)`, margin: -10, marginBottom: 8, padding: '8px 10px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={goPrevYear} title="سال قبل" style={navBtnStyle}>«</button>
              <button type="button" onClick={goPrevMonth} title="ماه قبل" style={navBtnStyle}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: EMERALD.primaryDk }}>{JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}</div>
              <button type="button" onClick={goNextMonth} title="ماه بعد" style={navBtnStyle}>›</button>
              <button type="button" onClick={goNextYear} title="سال بعد" style={navBtnStyle}>»</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (<div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: i === 6 ? EMERALD.primary : EMERALD.textMute, padding: '2px 0' }}>{w}</div>))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 24 }} />
                const isSelected = selectedJalali && selectedJalali.jy === viewYear && selectedJalali.jm === viewMonth && selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
                const isFriday = i % 7 === 6; const disabled = isDayDisabled(d)
                return (
                  <button key={i} type="button" disabled={disabled} onClick={() => handleDayClick(d)} style={{ height: 24, borderRadius: 5, fontSize: 11, border: isSelected ? 'none' : (isToday ? `1px solid ${EMERALD.todayRing}` : 'none'), backgroundColor: isSelected ? EMERALD.primary : (isToday ? EMERALD.headerBg : 'transparent'), color: isSelected ? '#fff' : (disabled ? EMERALD.textSoft : (isToday ? EMERALD.primaryDk : (isFriday ? EMERALD.primary : EMERALD.textMain))), cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)), transition: 'background-color 0.1s' }}
                    onMouseEnter={(e) => { if (!disabled && !isSelected) e.currentTarget.style.backgroundColor = '#d1fae5' }}
                    onMouseLeave={(e) => { if (!disabled && !isSelected) e.currentTarget.style.backgroundColor = isToday ? EMERALD.headerBg : 'transparent' }}
                  >{toFaNum(d)}</button>
                )
              })}
            </div>
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${EMERALD.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={pickToday} style={{ fontSize: 10, color: EMERALD.primary, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]} {toFaNum(todayJalali.jy)}</button>
              <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 10, color: EMERALD.textMute, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>بستن ✕</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
//  Persian Date Range Picker
// ============================================================================

interface DateRange { from: string; to: string }

function PersianDateRangePicker({ value, onChange, size = 'md' }: { value: DateRange; onChange: (v: DateRange) => void; size?: 'sm' | 'md' }) {
  const safeValue: DateRange = { from: value.from || todayGregorianISO(), to: value.to || todayGregorianISO() }
  const handleFromChange = (iso: string) => { if (iso > safeValue.to) onChange({ from: iso, to: iso }); else onChange({ from: iso, to: safeValue.to }) }
  const handleToChange = (iso: string) => { if (iso < safeValue.from) onChange({ from: iso, to: iso }); else onChange({ from: safeValue.from, to: iso }) }
  return (
    <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
      <div style={{ width: size === 'sm' ? 130 : 150, flexShrink: 0 }}><PersianDatePicker value={safeValue.from} onChange={handleFromChange} placeholder="از تاریخ" label="از تاریخ" maxDate={safeValue.to} size={size} /></div>
      <div style={{ width: size === 'sm' ? 130 : 150, flexShrink: 0 }}><PersianDatePicker value={safeValue.to} onChange={handleToChange} placeholder="تا تاریخ" label="تا تاریخ" minDate={safeValue.from} size={size} /></div>
    </div>
  )
}

// ============================================================================
//  Shared UI Components
// ============================================================================

interface ReportActionsProps { onExportExcel: () => void; onPrint: () => void; disabled?: boolean; size?: 'sm' | 'md' }

function generatePdfFromHtml(html: string) {
  if (typeof window === 'undefined') return
  try { const blob = new Blob([html], { type: 'text/html;charset=utf-8' }); const url = URL.createObjectURL(blob); const printWindow = window.open(url, '_blank'); if (!printWindow) { alert('پاپ‌آپ مسدود شده است.'); URL.revokeObjectURL(url); return }; printWindow.onload = function() { setTimeout(function() { printWindow.focus(); printWindow.print(); setTimeout(function() { URL.revokeObjectURL(url) }, 1000) }, 500) }; setTimeout(function() { try { printWindow.focus(); printWindow.print() } catch (e) { console.error('Print fallback:', e) } }, 2000) } catch (e) { console.error('PDF generation error:', e) }
}

function ReportActions({ onExportExcel, onPrint, disabled, size = 'sm' }: ReportActionsProps) {
  const sizeClass = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" onClick={onExportExcel} disabled={disabled} className={`gap-1.5 ${sizeClass} border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300`} title="دانلود فایل اکسل"><Download className="w-3.5 h-3.5" />اکسل</Button>
      <Button variant="outline" onClick={onPrint} disabled={disabled} className={`gap-1.5 ${sizeClass} border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300`} title="چاپ / ذخیره PDF"><Printer className="w-3.5 h-3.5" />PDF / چاپ</Button>
    </div>
  )
}

interface StatCardProps { label: string; value: number | string; icon?: React.ReactNode; color?: 'emerald' | 'blue' | 'amber' | 'red' | 'purple' | 'gray' | 'teal' | 'pink' | 'indigo'; suffix?: string; dir?: 'rtl' | 'ltr'; hint?: string }

function StatCard({ label, value, icon, color = 'emerald', suffix, dir = 'ltr', hint }: StatCardProps) {
  const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
    emerald: { bg: 'bg-emerald-50/50', border: 'border-emerald-200', text: 'text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600' },
    blue: { bg: 'bg-blue-50/50', border: 'border-blue-200', text: 'text-blue-700', iconBg: 'bg-blue-100 text-blue-600' },
    amber: { bg: 'bg-amber-50/50', border: 'border-amber-200', text: 'text-amber-700', iconBg: 'bg-amber-100 text-amber-600' },
    red: { bg: 'bg-red-50/50', border: 'border-red-200', text: 'text-red-700', iconBg: 'bg-red-100 text-red-600' },
    purple: { bg: 'bg-purple-50/50', border: 'border-purple-200', text: 'text-purple-700', iconBg: 'bg-purple-100 text-purple-600' },
    gray: { bg: 'bg-gray-50/50', border: 'border-gray-200', text: 'text-gray-700', iconBg: 'bg-gray-100 text-gray-600' },
    teal: { bg: 'bg-teal-50/50', border: 'border-teal-200', text: 'text-teal-700', iconBg: 'bg-teal-100 text-teal-600' },
    pink: { bg: 'bg-pink-50/50', border: 'border-pink-200', text: 'text-pink-700', iconBg: 'bg-pink-100 text-pink-600' },
    indigo: { bg: 'bg-indigo-50/50', border: 'border-indigo-200', text: 'text-indigo-700', iconBg: 'bg-indigo-100 text-indigo-600' },
  }
  const c = colorMap[color]; const display = typeof value === 'number' ? formatNumberFa(value) : value
  return (
    <Card className={`border ${c.border} ${c.bg} overflow-hidden`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-500 mb-1 truncate">{label}</p>
            <p className={`text-base font-bold ${c.text} truncate`} dir={dir}>{display}{suffix && <span className="text-[10px] text-gray-400 mr-1">{suffix}</span>}</p>
            {hint && <p className="text-[9px] text-gray-400 mt-0.5 truncate">{hint}</p>}
          </div>
          {icon && <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, icon, children, action, className = '' }: { title: string; icon?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <Card className={`border-gray-200 ${className}`}>
      <CardHeader className="p-3 pb-2"><div className="flex items-center justify-between"><CardTitle className="text-xs sm:text-sm flex items-center gap-1.5 text-gray-700">{icon}{title}</CardTitle>{action}</div></CardHeader>
      <CardContent className="p-3 pt-0">{children}</CardContent>
    </Card>
  )
}

function EmptyState({ message = 'داده‌ای برای نمایش وجود ندارد', icon }: { message?: string; icon?: React.ReactNode }) {
  return (<div className="py-12 text-center text-gray-400">{icon || <AlertCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />}<p className="text-sm">{message}</p></div>)
}

function LoadingState({ message = 'در حال بارگذاری...' }: { message?: string }) {
  return (<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /><span className="mr-2 text-sm text-gray-500">{message}</span></div>)
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={onRetry}>تلاش مجدد</Button>}
    </div>
  )
}

const PAGE_SIZE = 10

function Pagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (total <= PAGE_SIZE) return null
  const from = (page - 1) * PAGE_SIZE + 1; const to = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50/50">
      <p className="text-[10px] text-gray-500">نمایش {toFaNum(from)} تا {toFaNum(to)} از {toFaNum(total)} رکورد</p>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>قبلی</Button>
        <span className="text-xs text-gray-600 px-2 font-medium">صفحه {toFaNum(page)} از {toFaNum(totalPages)}</span>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>بعدی</Button>
      </div>
    </div>
  )
}

function paginate(data: any[], page: number): any[] { const start = (page - 1) * PAGE_SIZE; return data.slice(start, start + PAGE_SIZE) }

function ShowListButton({ onClick, loading, visible, totalCount }: { onClick: () => void; loading?: boolean; visible: boolean; totalCount?: number }) {
  if (visible) return (
    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200">
      <CheckCircle2 className="w-3.5 h-3.5" />
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

function EmptyListPlaceholder({ message = 'برای مشاهده رکوردها، دکمه «نمایش لیست» را بزنید' }: { message?: string }) {
  return (<div className="py-10 text-center bg-gray-50/30 rounded-lg border border-dashed border-gray-200"><FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-xs text-gray-400">{message}</p></div>)
}

function PersianChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs" dir="rtl">
      {label && <p className="font-bold text-gray-700 mb-1.5 border-b border-gray-100 pb-1.5">{label}</p>}
      {payload.map((entry: any, idx: number) => {
        const value = formatter ? formatter(entry.value) : formatNumberFa(entry.value)
        return (<div key={idx} className="flex items-center gap-2 py-0.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} /><span className="text-gray-600">{entry.name}:</span><span className="font-bold text-gray-800" dir="ltr">{value}</span></div>)
      })}
    </div>
  )
}

// ============================================================================
//  API Hooks
// ============================================================================

async function fetchInvoicesApi(tenantId: string): Promise<any[]> {
  if (!tenantId) return []
  try { const params = new URLSearchParams({ tenantId, limit: '9999', include: 'payments' }); const res = await fetch(`/api/invoices?${params.toString()}`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success && data.data) { const list = data.data.invoices || data.data; return Array.isArray(list) ? list : [] }; return [] } catch (err) { console.error('[Reports] fetchInvoices error:', err); return [] }
}
async function fetchJournalEntriesApi(tenantId: string): Promise<any[]> {
  if (!tenantId) return []
  try { const res = await fetch(`/api/journal-entries?tenantId=${tenantId}`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success && data.data) { const list = data.data.entries || data.data.journalEntries || data.data; return Array.isArray(list) ? list : [] }; return [] } catch (err) { console.error('[Reports] fetchJournalEntries error:', err); return [] }
}
async function fetchCustomersApi(tenantId: string): Promise<any[]> {
  if (!tenantId) return []
  try { const res = await fetch(`/api/customers?tenantId=${tenantId}&limit=9999`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success && data.data) { const list = data.data.customers || data.data; return Array.isArray(list) ? list : [] }; return [] } catch (err) { console.error('[Reports] fetchCustomers error:', err); return [] }
}
async function fetchInstallmentPlansApi(tenantId: string): Promise<any[]> {
  if (!tenantId) return []
  try { const res = await fetch(`/api/installment-plans?tenantId=${tenantId}`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success && data.data) { const list = data.data.plans || data.data; return Array.isArray(list) ? list : [] }; return [] } catch (err) { console.error('[Reports] fetchInstallmentPlans error:', err); return [] }
}
async function fetchDashboardStatsApi(): Promise<any | null> {
  try { const res = await fetch(`/api/dashboard/stats`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success && data.data) return data.data; return null } catch (err) { console.error('[Reports] fetchDashboardStats error:', err); return null }
}
async function fetchBranchesApi(): Promise<any[]> {
  try { const res = await fetch(`/api/branches`, { headers: getAuthHeaders() }); const data = await res.json(); if (data.success && data.data) { const list = data.data.branches || data.data; return Array.isArray(list) ? list : [] }; return [] } catch (err) { console.error('[Reports] fetchBranches error:', err); return [] }
}

// ============================================================================
//  P&L Computation
// ============================================================================

interface PnLData {
  grossSales: number; salesReturns: number; discounts: number; netSales: number;
  taxAmount: number; cogs: number; grossProfit: number;
  operatingExpenses: { name: string; amount: number }[]; totalOperatingExpenses: number;
  operatingProfit: number; otherIncome: number; otherExpenses: number;
  profitBeforeTax: number; incomeTax: number; netProfit: number; invoiceCount: number;
}

function computePnLFromInvoices(invoices: any[], dateFrom: string, dateTo: string, journalEntries?: any[]): PnLData {
  let validInvoices = invoices.filter((inv) => { const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]; if (!d) return false; return d >= dateFrom && d <= dateTo && getInvoiceStatus(inv) !== 'CANCELLED' })
  if (validInvoices.length === 0 && invoices.length > 0) validInvoices = invoices.filter((inv) => getInvoiceStatus(inv) !== 'CANCELLED')
  const saleInvoices = validInvoices.filter((inv) => { const invType = (inv as any).invoiceType; return invType !== 'sale_return' && invType !== 'purchase_return' })
  const returnInvoices = validInvoices.filter((inv) => { const invType = (inv as any).invoiceType; return invType === 'sale_return' || invType === 'purchase_return' })
  const grossSales = saleInvoices.reduce((s, i) => s + getInvoiceTotal(i), 0) - returnInvoices.reduce((s, i) => s + getInvoiceTotal(i), 0)
  const discounts = saleInvoices.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0) - returnInvoices.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0)
  const taxAmount = saleInvoices.reduce((s, i) => s + (Number(i.taxAmount) || 0), 0) - returnInvoices.reduce((s, i) => s + (Number(i.taxAmount) || 0), 0)
  const salesReturns = returnInvoices.reduce((s, i) => s + getInvoiceTotal(i), 0); const netSales = grossSales - discounts
  const saleCogs = saleInvoices.reduce((s, i) => { const cogsAmount = Number(i.cogsAmount) || 0; if (cogsAmount > 0) return s + cogsAmount; if (Array.isArray(i.items)) return s + i.items.reduce((ss: number, it: any) => { const cost = Number(it.cost) || Number(it.purchasePrice) || 0; return ss + cost * (Number(it.quantity) || 0) }, 0); return s }, 0)
  const returnCogs = returnInvoices.reduce((s, i) => { const cogsAmount = Number(i.cogsAmount) || 0; if (cogsAmount > 0) return s + cogsAmount; if (Array.isArray(i.items)) return s + i.items.reduce((ss: number, it: any) => { const cost = Number(it.cost) || Number(it.purchasePrice) || 0; return ss + cost * (Number(it.quantity) || 0) }, 0); return s }, 0)
  const cogs = saleCogs - returnCogs; const grossProfit = netSales - cogs
  const operatingExpenses: { name: string; amount: number }[] = []; let totalOperatingExpenses = 0; let computedOtherIncome = 0
  const SALES_REVENUE_PREFIXES = ['41', '42', '43']
  if (journalEntries && journalEntries.length > 0) {
    const validEntries = journalEntries.filter((je: any) => { const jeDate = new Date(je.date || je.entryDate || je.createdAt || '').toISOString().split('T')[0]; if (!jeDate) return false; return jeDate >= dateFrom && jeDate <= dateTo })
    const expenseMap = new Map<string, number>()
    for (const je of validEntries) {
      if (je.sourceType === 'invoice' || je.sourceType === 'sale_return' || je.sourceType === 'purchase_return' || je.sourceType === 'purchase') continue
      const lines = je.lines || je.items || []
      for (const line of lines) {
        const accName = line.accountName || line.description || 'سایر'; const accCode = String(line.accountCode || ''); const accType = (line.accountType || '').toLowerCase()
        const isExpense = accType === 'expense' || accType === 'cogs' || accType === 'cost' || accCode.startsWith('5') || accName.includes('هزینه') || accName.includes('دستمزد') || accName.includes('اجاره') || accName.includes('حقوق')
        const isSalesRevenueAccount = SALES_REVENUE_PREFIXES.some(p => accCode.startsWith(p))
        const isOtherIncomeAccount = (accType === 'income' || accType === 'revenue') && !isSalesRevenueAccount || (accCode.startsWith('44') || accCode.startsWith('49'))
        if (isExpense && (Number(line.debit) > 0)) { const current = expenseMap.get(accName) || 0; expenseMap.set(accName, current + (Number(line.debit) || 0)) } else if (isOtherIncomeAccount && (Number(line.credit) > 0)) { computedOtherIncome += Number(line.credit) || 0 }
      }
    }
    for (const [name, amount] of expenseMap) { operatingExpenses.push({ name, amount }); totalOperatingExpenses += amount }
  }
  const operatingProfit = grossProfit - totalOperatingExpenses; const otherIncome = computedOtherIncome; const otherExpenses = 0; const profitBeforeTax = operatingProfit + otherIncome - otherExpenses; const incomeTax = 0; const netProfit = profitBeforeTax - incomeTax
  return { grossSales, salesReturns, discounts, netSales, taxAmount, cogs, grossProfit, operatingExpenses, totalOperatingExpenses, operatingProfit, otherIncome, otherExpenses, profitBeforeTax, incomeTax, netProfit, invoiceCount: validInvoices.length }
}
// ============================================================================
//  REPORT 1: Dashboard Overview
// ============================================================================

function DashboardOverviewReport({ tier, dashboardData }: { tier: PlanTier; dashboardData: any }) {
  const stats = dashboardData?.stats; const dailySales30 = dashboardData?.dailySales30 || []; const paymentMethods = dashboardData?.paymentMethods || []; const monthComparison = dashboardData?.monthComparison; const topProducts = dashboardData?.topProducts || []; const lowStockProducts = dashboardData?.lowStockProducts || []
  const chartData = useMemo(() => dailySales30.map((d: any) => ({ name: d.date, فروش: d.sales })), [dailySales30])
  const pieData = useMemo(() => paymentMethods.filter((p: any) => p.value > 0).map((p: any) => ({ name: p.label || PAYMENT_LABELS_FA[p.name] || p.name, value: p.value, count: p.count, color: p.color || PAYMENT_COLORS[p.name] || '#64748b' })), [paymentMethods])
  const handleExportExcel = () => { const meta: ReportMeta = { title: 'گزارش داشبورد خلاصه', storeName: getStoreName(), period: '۳۰ روز اخیر', summary: [{ label: 'فروش امروز', value: formatNumberFa(stats?.todaySales || 0), color: 'green' }, { label: 'فروش ماه', value: formatNumberFa(stats?.monthSales || 0), color: 'blue' }, { label: 'سود ماه', value: formatNumberFa(stats?.monthlyProfit || 0), color: stats?.monthlyProfit >= 0 ? 'green' : 'red' }, { label: 'اقساط سررسید شده', value: formatNumberFa(stats?.overdueInstallments || 0), color: 'amber' }, { label: 'مطالبات کل', value: formatNumberFa(stats?.totalReceivable || 0), color: 'amber' }, { label: 'موجودی بحرانی', value: formatNumberFa(stats?.lowStockProducts || 0), color: 'red' }] }; const columns: ReportColumn[] = [{ key: 'date', label: 'تاریخ', align: 'right' }, { key: 'sales', label: 'فروش روزانه', isCurrency: true, align: 'left' }]; exportToExcel(meta, columns, dailySales30.map((d: any) => ({ date: d.date, sales: d.sales })), 'داشبورد-خلاصه') }
  const handlePrint = () => { const meta: ReportMeta = { title: 'گزارش داشبورد خلاصه', storeName: getStoreName(), period: '۳۰ روز اخیر', summary: [{ label: 'فروش امروز', value: formatNumberFa(stats?.todaySales || 0), color: 'green' }, { label: 'فروش ماه', value: formatNumberFa(stats?.monthSales || 0), color: 'blue' }, { label: 'سود ماه', value: formatNumberFa(stats?.monthlyProfit || 0), color: stats?.monthlyProfit >= 0 ? 'green' : 'red' }, { label: 'اقساط سررسید شده', value: formatNumberFa(stats?.overdueInstallments || 0), color: 'amber' }], note: 'این گزارش خلاصه‌ای از وضعیت فروشگاه در ۳۰ روز اخیر است.' }; const columns: ReportColumn[] = [{ key: 'date', label: 'تاریخ', align: 'right' }, { key: 'sales', label: 'فروش روزانه', isCurrency: true, align: 'left' }]; printReport(meta, columns, dailySales30.map((d: any) => ({ date: d.date, sales: d.sales }))) }
  if (!stats) return <EmptyState message="داده‌ای برای نمایش داشبورد موجود نیست" icon={<LayoutDashboard className="w-10 h-10 mx-auto mb-2 text-gray-300" />} />
  const growthBadge = (growth: number, label: string) => { if (growth > 0) return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200"><TrendingUp className="w-3 h-3 ml-1" />{toFaNum(growth)}٪ رشد {label}</Badge>; if (growth < 0) return <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200"><TrendingDown className="w-3 h-3 ml-1" />{toFaNum(Math.abs(growth))}٪ افت {label}</Badge>; return <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">بدون تغییر</Badge> }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className={`text-[10px] ${TIER_COLORS[tier].bg} ${TIER_COLORS[tier].text} ${TIER_COLORS[tier].border}`}><LayoutDashboard className="w-3 h-3 ml-1" />خلاصه عملکرد — پلن {TIER_LABELS[tier]}</Badge>
        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={!stats} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <StatCard label="فروش امروز" value={stats.todaySales || 0} icon={<Wallet className="w-4 h-4" />} color="emerald" suffix="تومان" hint={`${toFaNum(stats.todayInvoices || 0)} فاکتور`} />
        <StatCard label="فروش ماه" value={stats.monthSales || 0} icon={<TrendingUp className="w-4 h-4" />} color="blue" suffix="تومان" hint={`${toFaNum(stats.monthInvoices || 0)} فاکتور`} />
        <StatCard label="سود ماه" value={stats.monthlyProfit || 0} icon={<Coins className="w-4 h-4" />} color={stats.monthlyProfit >= 0 ? 'emerald' : 'red'} suffix="تومان" />
        <StatCard label="مطالبات کل" value={stats.totalReceivable || 0} icon={<Receipt className="w-4 h-4" />} color="amber" suffix="تومان" hint={`${toFaNum(stats.overdueInstallments || 0)} قسط سررسید`} />
        <StatCard label="موجودی بحرانی" value={stats.lowStockProducts || 0} icon={<AlertTriangle className="w-4 h-4" />} color="red" suffix="کالا" />
        <StatCard label="پلن فعلی" value={TIER_LABELS[tier]} icon={<Crown className="w-4 h-4" />} color="purple" dir="rtl" />
      </div>
      {monthComparison && (
        <Card className={`border ${TIER_COLORS[tier].border} ${TIER_COLORS[tier].bg}`}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-emerald-600" /><p className="text-xs sm:text-sm font-bold text-gray-700">مقایسه با ماه قبل</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-gray-500">فروش</span>{growthBadge(monthComparison.salesGrowth, '')}</div>
                <div className="flex items-center justify-between text-xs"><span className="text-gray-600">این ماه: <span className="font-bold text-emerald-700" dir="ltr">{formatNumberFa(monthComparison.currentMonth.sales)}</span></span></div>
                <div className="flex items-center justify-between text-xs mt-0.5"><span className="text-gray-500">ماه قبل: <span className="font-medium text-gray-600" dir="ltr">{formatNumberFa(monthComparison.previousMonth.sales)}</span></span></div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-gray-500">تعداد فاکتور</span>{growthBadge(monthComparison.invoicesGrowth, '')}</div>
                <div className="flex items-center justify-between text-xs"><span className="text-gray-600">این ماه: <span className="font-bold text-blue-700" dir="ltr">{formatNumberFa(monthComparison.currentMonth.invoices)}</span></span></div>
                <div className="flex items-center justify-between text-xs mt-0.5"><span className="text-gray-500">ماه قبل: <span className="font-medium text-gray-600" dir="ltr">{formatNumberFa(monthComparison.previousMonth.invoices)}</span></span></div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-gray-500">سود</span>{growthBadge(monthComparison.profitGrowth, '')}</div>
                <div className="flex items-center justify-between text-xs"><span className="text-gray-600">این ماه: <span className="font-bold text-emerald-700" dir="ltr">{formatNumberFa(monthComparison.currentMonth.profit)}</span></span></div>
                <div className="flex items-center justify-between text-xs mt-0.5"><span className="text-gray-500">ماه قبل: <span className="font-medium text-gray-600" dir="ltr">{formatNumberFa(monthComparison.previousMonth.profit)}</span></span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard title="روند فروش ۳۰ روز اخیر" icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} className="lg:col-span-2">
          {chartData.length === 0 ? <EmptyState message="داده‌ای موجود نیست" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs><linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} interval={4} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => toFaNum(Math.round(v / 1000)) + 'k'} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip content={<PersianChartTooltip formatter={(v: number) => formatNumberFa(v) + ' تومان'} />} />
                <Area type="monotone" dataKey="فروش" stroke="#047857" strokeWidth={2} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="توزیع روش‌های پرداخت (ماه جاری)" icon={<PieIcon className="w-4 h-4 text-purple-600" />}>
          {pieData.length === 0 ? <EmptyState message="داده‌ای موجود نیست" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>{pieData.map((entry: any, idx: number) => (<Cell key={idx} fill={entry.color} />))}</Pie>
                <Tooltip content={<PersianChartTooltip formatter={(v: number) => toFaNum(v) + '٪'} />} />
                <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 10, fontFamily: 'Tahoma' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="پرفروش‌ترین محصولات ماه" icon={<Package className="w-4 h-4 text-indigo-600" />}>
          {topProducts.length === 0 ? <EmptyState message="داده‌ای موجود نیست" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProducts.map((p: any) => ({ name: p.name, فروش: p.totalSales, تعداد: p.totalQuantity }))} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => toFaNum(Math.round(v / 1000)) + 'k'} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} width={80} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip content={<PersianChartTooltip formatter={(v: number) => formatNumberFa(v) + ' تومان'} />} />
                <Bar dataKey="فروش" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="کالاهای رو به اتمام" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}>
          {lowStockProducts.length === 0 ? (
            <div className="py-8 text-center"><CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" /><p className="text-sm text-emerald-600">همه محصولات موجود هستند ✓</p></div>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {lowStockProducts.slice(0, 8).map((p: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-amber-50/50 rounded-md border border-amber-100">
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium text-gray-700 truncate">{p.name}</p><p className="text-[10px] text-gray-400">{p.category}</p></div>
                  <Badge variant="outline" className="text-[9px] bg-red-100 text-red-700 border-red-200 mr-2">{toFaNum(p.currentStock)} {p.unit}</Badge>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ============================================================================
//  REPORT 2: Daily Sales — v10.0.0 ★ اصلاح کامل ★
// ============================================================================

function DailySalesReport({ invoices }: { invoices: any[] }) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: daysAgoISO(30),
    to: todayGregorianISO(),
  })
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  useEffect(() => { setListVisible(false); setPage(1); setSelectedInvoiceId(null) }, [dateRange.from, dateRange.to])

  const salesByDate = useMemo(() => {
    const map: Record<string, {
      date: string; count: number; countReturn: number;
      total: number; totalSale: number; totalReturn: number;
      cash: number; credit: number;
    }> = {}

    invoices.forEach((inv) => {
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d) return
      if (d < dateRange.from || d > dateRange.to) return
      if (getInvoiceStatus(inv) === 'CANCELLED') return

      const invType = (inv.invoiceType || '').toLowerCase()
      const isReturn = invType === 'sale_return' || invType === 'purchase_return'
      const totalAmount = getInvoiceTotal(inv)
      const pt = getInvoicePaymentType(inv)

      if (!map[d]) map[d] = { date: d, count: 0, countReturn: 0, total: 0, totalSale: 0, totalReturn: 0, cash: 0, credit: 0 }

      if (isReturn) {
        map[d].countReturn++; map[d].totalReturn += totalAmount; map[d].total -= totalAmount
        if (pt === 'Cash' || pt === 'cash') map[d].cash -= totalAmount
        else map[d].credit -= totalAmount
      } else {
        map[d].count++; map[d].totalSale += totalAmount; map[d].total += totalAmount
        if (pt === 'Cash' || pt === 'cash') map[d].cash += totalAmount
        else map[d].credit += totalAmount
      }
    })

    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
  }, [invoices, dateRange.from, dateRange.to])

  const invoicesByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    invoices.forEach((inv) => {
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d) return
      if (d < dateRange.from || d > dateRange.to) return
      if (getInvoiceStatus(inv) === 'CANCELLED') return
      if (!map[d]) map[d] = []
      map[d].push(inv)
    })
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(getInvoiceDate(b)).getTime() - new Date(getInvoiceDate(a)).getTime()))
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [invoices, dateRange.from, dateRange.to])

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
      title: 'گزارش فروش روزانه', storeName: getStoreName(), period: periodText,
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
      date: formatJalaliLong(d.date), count: d.count, countReturn: d.countReturn,
      totalSale: d.totalSale, totalReturn: d.totalReturn, total: d.total,
    }))
    exportToExcel(meta, columns, rows, 'گزارش-فروش-روزانه')
  }

  const handlePrint = () => {
    const meta: ReportMeta = {
      title: 'گزارش فروش روزانه', storeName: getStoreName(), period: periodText,
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
      date: formatJalaliLong(d.date), count: d.count, countReturn: d.countReturn,
      totalSale: d.totalSale, totalReturn: d.totalReturn, total: d.total,
    }))
    printReport(meta, columns, rows)
  }

  const selectedInvoice = selectedInvoiceId
    ? invoices.find(inv => inv.id === selectedInvoiceId)
    : null

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <PersianDateRangePicker value={dateRange} onChange={setDateRange} />
        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={salesByDate.length === 0} />
      </div>

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

      <Card className="border-gray-200">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-1.5 text-gray-700">
              <Receipt className="w-4 h-4 text-emerald-600" />
              فاکتورهای فروش روزانه
              <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">
                {toFaNum(invoicesByDate.length)} روز
              </Badge>
            </CardTitle>
            {selectedInvoiceId && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-gray-500 hover:text-gray-700"
                onClick={() => setSelectedInvoiceId(null)}>
                <X className="w-3 h-3 ml-1" />بستن جزئیات
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {invoicesByDate.length === 0 ? (
            <EmptyState message="در این بازه فاکتوری ثبت نشده است" />
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              {invoicesByDate.map(([date, dayInvoices]) => {
                const dayTotal = dayInvoices.reduce((s, inv) => {
                  const invType = (inv.invoiceType || '').toLowerCase()
                  const isReturn = invType === 'sale_return' || invType === 'purchase_return'
                  return s + (isReturn ? -getInvoiceTotal(inv) : getInvoiceTotal(inv))
                }, 0)
                const daySalesCount = dayInvoices.filter(inv => {
                  const invType = (inv.invoiceType || '').toLowerCase()
                  return invType !== 'sale_return' && invType !== 'purchase_return'
                }).length
                const dayReturnCount = dayInvoices.filter(inv => {
                  const invType = (inv.invoiceType || '').toLowerCase()
                  return invType === 'sale_return' || invType === 'purchase_return'
                }).length

                return (
                  <div key={date} className="border-b border-gray-100 last:border-b-0">
                    <div className="bg-gradient-to-l from-emerald-50 to-teal-50 px-3 sm:px-4 py-2 border-b border-emerald-100 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                          <Calendar className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-gray-800">{formatJalaliLong(date)}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge className="text-[8px] bg-white text-emerald-700 border-emerald-200 h-4 px-1">
                              {toFaNum(daySalesCount)} فروش
                            </Badge>
                            {dayReturnCount > 0 && (
                              <Badge className="text-[8px] bg-white text-amber-700 border-amber-200 h-4 px-1">
                                {toFaNum(dayReturnCount)} برگشتی
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-[9px] text-gray-500">جمع روز</p>
                        <p className={`text-xs sm:text-sm font-bold font-mono ${dayTotal >= 0 ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr">
                          {dayTotal >= 0 ? formatNumberFa(dayTotal) : `(${formatNumberFa(Math.abs(dayTotal))})`}
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {dayInvoices.map((inv) => {
                        const isSelected = selectedInvoiceId === inv.id
                        const invNumber = getInvoiceNumber(inv)
                        const invTotal = getInvoiceTotal(inv)
                        const invCustomer = getInvoiceCustomer(inv)
                        const invType = (inv.invoiceType || '').toLowerCase()
                        const isReturn = invType === 'sale_return' || invType === 'purchase_return'
                        const invPaymentType = getInvoicePaymentType(inv)
                        const paymentLabel = PAYMENT_LABELS_FA[invPaymentType] || invPaymentType
                        const invoiceTime = (() => {
                          try {
                            const d = new Date(getInvoiceDate(inv))
                            const hh = toFaNum(String(d.getHours()).padStart(2, '0'))
                            const mm = toFaNum(String(d.getMinutes()).padStart(2, '0'))
                            return `${hh}:${mm}`
                          } catch { return '' }
                        })()

                        return (
                          <div key={inv.id}>
                            <div
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/70' : 'hover:bg-gray-50'}`}
                              onClick={() => setSelectedInvoiceId(isSelected ? null : inv.id)}
                            >
                              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isReturn ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                                  {isReturn
                                    ? <RotateCcw className="w-4 h-4 text-amber-600" />
                                    : <Receipt className="w-4 h-4 text-emerald-600" />
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-mono font-bold text-gray-800 truncate">{invNumber}</span>
                                    <span className="text-[10px] text-gray-400 font-mono" dir="ltr">{invoiceTime}</span>
                                    {isReturn && (
                                      <Badge className="text-[8px] bg-amber-100 text-amber-700 border-amber-200 h-4 px-1">برگشتی</Badge>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                    {invCustomer} • {paymentLabel}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 mr-2">
                                <span className={`text-xs sm:text-sm font-bold font-mono ${isReturn ? 'text-amber-600' : 'text-emerald-600'}`} dir="ltr">
                                  {isReturn ? `(${formatNumberFa(invTotal)})` : formatNumberFa(invTotal)}
                                </span>
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform ${isSelected ? 'bg-emerald-600 text-white rotate-180' : 'bg-gray-100 text-gray-500'}`}>
                                  <ChevronDown className="w-3 h-3" />
                                </div>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="bg-gradient-to-l from-emerald-50/30 to-teal-50/30 px-3 sm:px-4 py-3 border-t border-emerald-100">
                                <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-emerald-200/50">
                                  <Package className="w-3.5 h-3.5 text-emerald-600" />
                                  <p className="text-[11px] font-bold text-emerald-800">
                                    کالاهای فروخته شده ({toFaNum(Array.isArray(inv.items) ? inv.items.length : 0)} آیتم)
                                  </p>
                                </div>

                                {!Array.isArray(inv.items) || inv.items.length === 0 ? (
                                  <p className="text-[10px] text-gray-400 text-center py-3">آیتمی برای این فاکتور ثبت نشده است</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {inv.items.map((item: any, idx: number) => {
                                      const qty = Number(item.quantity) || 0
                                      const unitPrice = Number(item.unitPrice) || 0
                                      const lineTotal = Number(item.totalAmount || item.lineTotal || 0)
                                      const productName = item.productName || item.name || 'کالا'
                                      const unitLabel = item.unitLabel || ''
                                      return (
                                        <div key={idx} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs bg-white rounded-lg px-2.5 py-2 border border-gray-100 hover:border-emerald-200 transition-colors">
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <div className="w-5 h-5 rounded bg-emerald-50 flex items-center justify-center shrink-0">
                                              <span className="text-[9px] font-bold text-emerald-600">{toFaNum(idx + 1)}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-gray-800 font-medium truncate">{productName}</p>
                                              {item.discount > 0 && (
                                                <p className="text-[9px] text-red-500 mt-0.5">
                                                  تخفیف: {formatNumberFa(item.discount)} ریال
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                            <div className="text-left hidden sm:block">
                                              <p className="text-[9px] text-gray-400">تعداد</p>
                                              <p className="text-gray-600 font-mono" dir="rtl">
                                                {formatNumberFa(qty)} {unitLabel}
                                              </p>
                                            </div>
                                            <div className="text-left hidden sm:block">
                                              <p className="text-[9px] text-gray-400">قیمت واحد</p>
                                              <p className="text-gray-600 font-mono" dir="rtl">{formatNumberFa(unitPrice)}</p>
                                            </div>
                                            <div className="text-left">
                                              <p className="text-[9px] text-gray-400">مبلغ کل</p>
                                              <p className="font-bold text-emerald-700 font-mono text-xs sm:text-sm" dir="rtl">
                                                {formatNumberFa(lineTotal)}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })}

                                    <div className="flex items-center justify-between gap-2 text-xs bg-gradient-to-l from-emerald-100 to-teal-100 rounded-lg px-2.5 py-2 mt-2 border border-emerald-200">
                                      <span className="font-bold text-emerald-800">جمع کل فاکتور</span>
                                      <span className="font-bold text-emerald-800 font-mono text-sm" dir="rtl">
                                        {formatNumberFa(invTotal)} ریال
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                    <TableRow key={day.date} className={day.totalReturn > 0 ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-emerald-50/50'}>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatJalaliLong(day.date)}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap text-blue-600 font-medium">{formatNumberFa(day.count)}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap text-amber-600 font-medium">{day.countReturn > 0 ? formatNumberFa(day.countReturn) : '—'}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-blue-600 font-medium whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(day.totalSale)}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-amber-600 font-medium whitespace-nowrap hidden sm:table-cell" dir="ltr">{day.totalReturn > 0 ? formatNumberFa(day.totalReturn) : '—'}</TableCell>
                      <TableCell className="text-xs sm:text-sm font-bold whitespace-nowrap" dir="ltr" style={{ color: day.total > 0 ? '#059669' : '#dc2626' }}>
                        {day.total >= 0 ? formatNumberFa(day.total) : `(${formatNumberFa(Math.abs(day.total))})`}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50 font-bold border-t-2 border-gray-300">
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">جمع کل</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap text-blue-600">{formatNumberFa(totalCount)}</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap text-amber-600">{totalCountReturn > 0 ? formatNumberFa(totalCountReturn) : '—'}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-blue-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(totalSale)}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-amber-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{totalReturn > 0 ? formatNumberFa(totalReturn) : '—'}</TableCell>
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

// ============================================================================
//  REPORT 3: Customer Statement
// ============================================================================

function CustomerStatementReport({ invoices, customers }: { invoices: any[]; customers: any[] }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange>({
    from: daysAgoISO(90),
    to: todayGregorianISO(),
  })
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { setListVisible(false); setPage(1) }, [selectedCustomerId, dateRange.from, dateRange.to])

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id)
    }
  }, [customers, selectedCustomerId])

  const customer = customers.find((c) => c.id === selectedCustomerId)

  const customerInvoices = useMemo(() => {
    if (!customer) return []
    return invoices.filter((inv) => {
      const invCustomerId = inv.customerId || inv.customer?.id
      const invCustomerName = getInvoiceCustomer(inv)
      const targetName = customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
      return (invCustomerId && invCustomerId === customer.id) || (targetName && invCustomerName === targetName)
    }).filter((inv) => {
      if (getInvoiceStatus(inv) === 'CANCELLED') return false
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d) return false
      return d >= dateRange.from && d <= dateRange.to
    })
  }, [invoices, customer, dateRange.from, dateRange.to])

  const transactions = useMemo(() => {
    const t: { date: string; type: string; description: string; debit: number; credit: number }[] = []
    customerInvoices.forEach((inv) => {
      t.push({
        date: getInvoiceDate(inv),
        type: 'invoice',
        description: `فاکتور ${getInvoiceNumber(inv)}`,
        debit: getInvoiceTotal(inv),
        credit: 0,
      })
      if (Array.isArray(inv.payments)) {
        inv.payments.forEach((p: any) => {
          const paymentType = p.paymentType || p.method || 'cash'
          const paymentLabel = PAYMENT_LABELS_FA[paymentType] || paymentType
          const refInfo = p.paymentRef ? ` (مرجع: ${p.paymentRef})` : ''
          t.push({
            date: p.paidAt || p.paymentDate || p.date || getInvoiceDate(inv),
            type: 'payment',
            description: `پرداخت ${paymentLabel}${refInfo} — ${getInvoiceNumber(inv)}`,
            debit: 0,
            credit: Number(p.amount) || 0,
          })
        })
      }
    })
    t.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let running = 0
    return t.map((x) => { running += x.debit - x.credit; return { ...x, balance: running } })
  }, [customerInvoices])

  const customerName = customer ? (customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim()) : '—'
  const customerMobile = customer?.mobile || customer?.phone || '—'
  const customerBalance = customer?.currentBalance || customer?.balance || 0
  const customerCreditLimit = customer?.creditLimit || 0
  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`

  const totalDebit = transactions.reduce((s, t) => s + t.debit, 0)
  const totalCredit = transactions.reduce((s, t) => s + t.credit, 0)

  const paginatedTransactions = paginate(transactions, page)

  const handleExportExcel = () => {
    const meta: ReportMeta = {
      title: 'گردش حساب مشتری',
      storeName: getStoreName(),
      period: periodText,
      filters: [
        { label: 'مشتری', value: customerName },
        { label: 'موبایل', value: customerMobile },
      ],
      summary: [
        { label: 'سقف اعتبار', value: formatNumberFa(customerCreditLimit), color: 'amber' },
        { label: 'مانده حساب', value: formatNumberFa(Math.abs(customerBalance)), color: customerBalance > 0 ? 'red' : 'green' },
        { label: 'جمع بدهکار', value: formatNumberFa(totalDebit), color: 'red' },
        { label: 'جمع بستانکار', value: formatNumberFa(totalCredit), color: 'green' },
      ],
    }
    const columns: ReportColumn[] = [
      { key: 'date', label: 'تاریخ', align: 'right' },
      { key: 'type', label: 'نوع', align: 'center' },
      { key: 'description', label: 'شرح', align: 'right' },
      { key: 'debit', label: 'بدهکار', isCurrency: true, align: 'left' },
      { key: 'credit', label: 'بستانکار', isCurrency: true, align: 'left' },
      { key: 'balance', label: 'مانده', isCurrency: true, align: 'left' },
    ]
    const rows = transactions.map((t) => ({
      date: formatJalaliDateTime(t.date),
      type: t.type === 'invoice' ? 'فاکتور' : 'پرداخت',
      description: t.description,
      debit: t.debit,
      credit: t.credit,
      balance: t.balance,
    }))
    exportToExcel(meta, columns, rows, `گردش-حساب-${customerName}`)
  }

  const handlePrint = () => {
    const meta: ReportMeta = {
      title: 'صورت‌حساب مشتری',
      storeName: getStoreName(),
      period: periodText,
      filters: [
        { label: 'مشتری', value: customerName },
        { label: 'موبایل', value: customerMobile },
      ],
      summary: [
        { label: 'سقف اعتبار', value: formatNumberFa(customerCreditLimit), color: 'amber' },
        { label: 'مانده حساب', value: formatNumberFa(Math.abs(customerBalance)), color: customerBalance > 0 ? 'red' : 'green' },
        { label: 'جمع بدهکار', value: formatNumberFa(totalDebit), color: 'red' },
        { label: 'جمع بستانکار', value: formatNumberFa(totalCredit), color: 'green' },
      ],
      note: customerBalance > 0
        ? `مشتری بدهکار است به مبلغ ${formatNumberFa(Math.abs(customerBalance))} تومان`
        : customerBalance < 0
          ? `مشتری بستانکار است به مبلغ ${formatNumberFa(Math.abs(customerBalance))} تومان`
          : 'حساب مشتری تسویه است',
    }
    const columns: ReportColumn[] = [
      { key: 'date', label: 'تاریخ', align: 'right' },
      { key: 'type', label: 'نوع', align: 'center' },
      { key: 'description', label: 'شرح', align: 'right' },
      { key: 'debit', label: 'بدهکار', isCurrency: true, align: 'left' },
      { key: 'credit', label: 'بستانکار', isCurrency: true, align: 'left' },
      { key: 'balance', label: 'مانده', isCurrency: true, align: 'left' },
    ]
    const rows = transactions.map((t) => ({
      date: formatJalaliDateTime(t.date),
      type: t.type === 'invoice' ? 'فاکتور' : 'پرداخت',
      description: t.description,
      debit: t.debit,
      credit: t.credit,
      balance: t.balance,
    }))
    printReport(meta, columns, rows)
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <div className="w-[180px] sm:w-[220px]">
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="h-9 w-full text-xs sm:text-sm"><SelectValue placeholder="انتخاب مشتری" /></SelectTrigger>
            <SelectContent>
              {customers.length === 0 ? (
                <SelectItem value="_none" disabled>مشتری‌ای یافت نشد</SelectItem>
              ) : (
                customers.map((c) => {
                  const name = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'بدون نام'
                  return <SelectItem key={c.id} value={c.id}>{name}</SelectItem>
                })
              )}
            </SelectContent>
          </Select>
        </div>
        <PersianDateRangePicker value={dateRange} onChange={setDateRange} />
        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={transactions.length === 0} />
      </div>

      {customer && (
        <Card className="border-gray-200">
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <p className="text-[10px] text-gray-500">نام مشتری</p>
                <p className="text-xs sm:text-sm font-medium truncate">{customerName}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">موبایل</p>
                <p className="text-xs sm:text-sm font-medium" dir="ltr">{customerMobile}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">سقف اعتبار</p>
                <p className="text-xs sm:text-sm font-medium" dir="ltr">{formatNumberFa(customerCreditLimit)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">مانده حساب</p>
                <p className={`text-xs sm:text-sm font-bold ${customerBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`} dir="ltr">
                  {formatNumberFa(Math.abs(customerBalance))}
                  <span className="text-[10px] mr-1">{customerBalance > 0 ? 'بدهکار' : customerBalance < 0 ? 'بستانکار' : 'تسویه'}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-600">لیست تراکنش‌ها</p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={transactions.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده تراکنش‌ها، دکمه «نمایش لیست» را بزنید" />
          ) : transactions.length === 0 ? (
            <EmptyState message="تراکنشی یافت نشد" />
          ) : (
            <div className="overflow-x-auto -mx-3 sm:-mx-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">تاریخ</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">نوع</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">شرح</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">بدهکار</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">بستانکار</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">مانده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.map((t, i) => (
                    <TableRow key={i} className="hover:bg-emerald-50/50">
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap hidden sm:table-cell">{formatJalaliDateTime(t.date)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={`text-[10px] ${t.type === 'invoice' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`} variant="outline">
                          {t.type === 'invoice' ? 'فاکتور' : 'پرداخت'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm max-w-[100px] sm:max-w-none truncate">{t.description}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t.debit > 0 ? <span className="text-xs sm:text-sm text-red-600 font-medium" dir="ltr">{formatNumberFa(t.debit)}</span> : <span className="text-xs sm:text-sm text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap hidden sm:table-cell">
                        {t.credit > 0 ? <span className="text-xs sm:text-sm text-emerald-600 font-medium" dir="ltr">{formatNumberFa(t.credit)}</span> : <span className="text-xs sm:text-sm text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className={`text-xs sm:text-sm font-medium ${t.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`} dir="ltr">
                          {formatNumberFa(Math.abs(t.balance))}
                          {t.balance > 0 ? ' بـد' : t.balance < 0 ? ' بـس' : ''}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={transactions.length} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 4: Simple Profit & Loss — سود و زیان ساده (تک‌دفتری)
// ============================================================================

function SimpleProfitLossReport({ tier, invoices, journalEntries }: { tier: PlanTier; invoices: any[]; journalEntries?: any[] }) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: firstDayOfCurrentJalaliMonthISO(),
    to: todayGregorianISO(),
  })

  const data = useMemo(
    () => computePnLFromInvoices(invoices, dateRange.from, dateRange.to, journalEntries),
    [invoices, dateRange.from, dateRange.to, journalEntries]
  )

  const totalExpenses = data.cogs + data.totalOperatingExpenses + data.otherExpenses
  const isProfit = data.netProfit >= 0
  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`

  const handleExportExcel = () => {
    const meta: ReportMeta = {
      title: 'صورت سود و زیان (تک‌دفتری)',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'درآمد فروش', value: formatNumberFa(data.netSales), color: 'green' },
        { label: 'مجموع هزینه‌ها', value: formatNumberFa(totalExpenses), color: 'red' },
        { label: 'مالیات بر ارزش افزوده', value: formatNumberFa(data.taxAmount), color: 'amber' },
        { label: isProfit ? 'سود خالص' : 'زیان خالص', value: formatNumberFa(Math.abs(data.netProfit)), color: isProfit ? 'green' : 'red' },
      ],
    }
    const columns: ReportColumn[] = [
      { key: 'description', label: 'شرح', align: 'right' },
      { key: 'amount', label: 'مبلغ', isCurrency: true, align: 'left' },
    ]
    const rows = [
      { description: 'درآمد فروش (ناخالص)', amount: data.grossSales },
      { description: 'کم: تخفیف', amount: -data.discounts },
      { description: 'درآمد خالص فروش', amount: data.netSales },
      { description: 'بهای تمام شده کالا', amount: -data.cogs },
      { description: 'مجموع هزینه‌های عملیاتی', amount: -data.totalOperatingExpenses },
      { description: 'سایر هزینه‌ها', amount: -data.otherExpenses },
      { description: isProfit ? 'سود خالص دوره' : 'زیان خالص دوره', amount: data.netProfit },
    ]
    exportToExcel(meta, columns, rows, 'گزارش-سود-زیان')
  }

  const handlePrint = () => {
    const meta: ReportMeta = {
      title: 'صورت سود و زیان (تک‌دفتری)',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'درآمد فروش', value: formatNumberFa(data.netSales), color: 'green' },
        { label: 'مجموع هزینه‌ها', value: formatNumberFa(totalExpenses), color: 'red' },
        { label: 'مالیات بر ارزش افزوده', value: formatNumberFa(data.taxAmount), color: 'amber' },
        { label: isProfit ? 'سود خالص' : 'زیان خالص', value: formatNumberFa(Math.abs(data.netProfit)), color: isProfit ? 'green' : 'red' },
      ],
      note: `تعداد فاکتورها در این دوره: ${toFaNum(data.invoiceCount)}`,
    }
    const columns: ReportColumn[] = [
      { key: 'description', label: 'شرح', align: 'right' },
      { key: 'amount', label: 'مبلغ', isCurrency: true, align: 'left' },
    ]
    const rows = [
      { description: 'درآمد فروش (ناخالص)', amount: data.grossSales },
      { description: 'کم: تخفیف', amount: -data.discounts },
      { description: 'درآمد خالص فروش', amount: data.netSales },
      { description: 'بهای تمام شده کالا', amount: -data.cogs },
      { description: 'مجموع هزینه‌های عملیاتی', amount: -data.totalOperatingExpenses },
      { description: 'سایر هزینه‌ها', amount: -data.otherExpenses },
      { description: isProfit ? 'سود خالص دوره' : 'زیان خالص دوره', amount: data.netProfit },
    ]
    printReport(meta, columns, rows)
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
          <FileText className="w-3 h-3 ml-1" />
          گزارش تک‌دفتری — پلن {TIER_LABELS[tier]}
        </Badge>
      </div>

      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <PersianDateRangePicker value={dateRange} onChange={setDateRange} />
        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={data.invoiceCount === 0} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="درآمد فروش" value={data.netSales} icon={<TrendingUp className="w-4 h-4" />} color="emerald" suffix="تومان" />
        <StatCard label="مجموع هزینه‌ها" value={totalExpenses} icon={<TrendingDown className="w-4 h-4" />} color="red" suffix="تومان" />
        <StatCard label="مالیات بر ارزش افزوده" value={data.taxAmount} icon={<Percent className="w-4 h-4" />} color="amber" suffix="تومان" />
        <StatCard
          label={isProfit ? 'سود خالص' : 'زیان خالص'}
          value={Math.abs(data.netProfit)}
          icon={isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          color={isProfit ? 'emerald' : 'red'}
          suffix="تومان"
        />
      </div>

      <Card className="border-gray-200">
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            خلاصه سود و زیان (تک‌دفتری)
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            دوره: {periodText} • تعداد فاکتور: {formatNumberFa(data.invoiceCount)}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          {data.invoiceCount === 0 ? (
            <EmptyState message="در این دوره فاکتوری ثبت نشده است" />
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs sm:text-sm text-gray-700">درآمد فروش (ناخالص)</span>
                <span className="text-xs sm:text-sm font-medium text-emerald-600" dir="ltr">{formatNumberFa(data.grossSales)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 pr-4">
                <span className="text-xs sm:text-sm text-gray-500">کم: تخفیف</span>
                <span className="text-xs sm:text-sm text-red-500" dir="ltr">({formatNumberFa(data.discounts)})</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b-2 border-emerald-200 bg-emerald-50/30 px-2 -mx-2">
                <span className="text-xs sm:text-sm font-bold text-gray-900">درآمد خالص فروش</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-700" dir="ltr">{formatNumberFa(data.netSales)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs sm:text-sm text-gray-700">بهای تمام شده کالا</span>
                <span className="text-xs sm:text-sm font-medium text-red-600" dir="ltr">({formatNumberFa(data.cogs)})</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs sm:text-sm text-gray-700">هزینه‌های عملیاتی</span>
                <span className="text-xs sm:text-sm font-medium text-red-600" dir="ltr">({formatNumberFa(data.totalOperatingExpenses)})</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs sm:text-sm text-gray-700">سایر هزینه‌ها</span>
                <span className="text-xs sm:text-sm font-medium text-red-600" dir="ltr">({formatNumberFa(data.otherExpenses)})</span>
              </div>
              <div className={`flex justify-between items-center py-3 px-2 -mx-2 rounded-lg ${isProfit ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className="text-xs sm:text-base font-bold text-gray-900">
                  {isProfit ? 'سود خالص دوره' : 'زیان خالص دوره'}
                </span>
                <span className={`text-xs sm:text-base font-bold ${isProfit ? 'text-emerald-700' : 'text-red-700'}`} dir="ltr">
                  {isProfit ? '' : '('}{formatNumberFa(Math.abs(data.netProfit))}{isProfit ? '' : ')'}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 5: Standard Profit & Loss
// ============================================================================

function StandardProfitLossReport({ tier, invoices, journalEntries }: { tier: PlanTier; invoices: any[]; journalEntries?: any[] }) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: firstDayOfCurrentJalaliMonthISO(),
    to: todayGregorianISO(),
  })
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [branches, setBranches] = useState<any[]>([])

  const isEnterprise = tier === 'enterprise'

  useEffect(() => {
    if (isEnterprise) {
      fetchBranchesApi().then(setBranches)
    }
  }, [isEnterprise])

  const data = useMemo(
    () => computePnLFromInvoices(invoices, dateRange.from, dateRange.to, journalEntries),
    [invoices, dateRange.from, dateRange.to, journalEntries]
  )

  const isProfit = data.netProfit >= 0
  const grossMargin = data.netSales > 0 ? (data.grossProfit / data.netSales) * 100 : 0
  const netMargin = data.netSales > 0 ? (data.netProfit / data.netSales) * 100 : 0
  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`
  const branchText = isEnterprise
    ? (selectedBranch === 'all' ? 'تلفیقی همه شعب' : `شعبه: ${branches.find((b) => b.id === selectedBranch)?.name || ''}`)
    : undefined

  const buildRows = () => [
    { description: '۱. فروش کالا و خدمات', amount: data.grossSales },
    { description: 'کم: بازگشت از فروش', amount: -data.salesReturns },
    { description: 'کم: تخفیفات', amount: -data.discounts },
    { description: 'درآمد خالص فروش', amount: data.netSales },
    { description: '۲. بهای تمام شده کالای فروش رفته', amount: -data.cogs },
    { description: 'سود ناخالص', amount: data.grossProfit },
    ...data.operatingExpenses.map((e) => ({ description: `۳. ${e.name}`, amount: -e.amount })),
    { description: 'سود عملیاتی', amount: data.operatingProfit },
    { description: '۴. سایر درآمدها', amount: data.otherIncome },
    { description: 'کم: سایر هزینه‌ها', amount: -data.otherExpenses },
    { description: 'سود قبل از مالیات', amount: data.profitBeforeTax },
    { description: '۵. مالیات بر درآمد (۲۵٪)', amount: -data.incomeTax },
    { description: isProfit ? 'سود خالص دوره' : 'زیان خالص دوره', amount: data.netProfit },
  ]

  const handleExportExcel = () => {
    const meta: ReportMeta = {
      title: 'صورت سود و زیان استاندارد',
      storeName: getStoreName(),
      period: periodText,
      filters: branchText ? [{ label: 'شعبه', value: branchText }] : [],
      summary: [
        { label: 'درآمد خالص فروش', value: formatNumberFa(data.netSales), color: 'green' },
        { label: 'سود ناخالص', value: formatNumberFa(data.grossProfit), color: 'blue' },
        { label: 'سود عملیاتی', value: formatNumberFa(data.operatingProfit), color: 'amber' },
        { label: isProfit ? 'سود خالص' : 'زیان خالص', value: formatNumberFa(Math.abs(data.netProfit)), color: isProfit ? 'green' : 'red' },
      ],
    }
    const columns: ReportColumn[] = [
      { key: 'description', label: 'شرح', align: 'right' },
      { key: 'amount', label: 'مبلغ', isCurrency: true, align: 'left' },
    ]
    exportToExcel(meta, columns, buildRows(), 'صورت-سود-زیان-استاندارد')
  }

  const handlePrint = () => {
    const meta: ReportMeta = {
      title: 'صورت سود و زیان استاندارد',
      storeName: getStoreName(),
      period: periodText,
      filters: branchText ? [{ label: 'شعبه', value: branchText }] : [],
      summary: [
        { label: 'درآمد خالص فروش', value: formatNumberFa(data.netSales), color: 'green' },
        { label: 'سود ناخالص', value: formatNumberFa(data.grossProfit), color: 'blue' },
        { label: 'سود عملیاتی', value: formatNumberFa(data.operatingProfit), color: 'amber' },
        { label: isProfit ? 'سود خالص' : 'زیان خالص', value: formatNumberFa(Math.abs(data.netProfit)), color: isProfit ? 'green' : 'red' },
      ],
      note: `تعداد فاکتورها: ${toFaNum(data.invoiceCount)} • حاشیه سود ناخالص: ${toFaNum(Math.round(grossMargin))}٪ • حاشیه سود خالص: ${toFaNum(Math.round(netMargin))}٪`,
    }
    const columns: ReportColumn[] = [
      { key: 'description', label: 'شرح', align: 'right' },
      { key: 'amount', label: 'مبلغ', isCurrency: true, align: 'left' },
    ]
    printReport(meta, columns, buildRows())
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
          <Scale className="w-3 h-3 ml-1" />
          صورت سود و زیان استاندارد — پلن {TIER_LABELS[tier]}
        </Badge>
        {isEnterprise && (
          <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
            <Building2 className="w-3 h-3 ml-1" />
            چند شعبه‌ای
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <PersianDateRangePicker value={dateRange} onChange={setDateRange} />
        {isEnterprise && (
          <div className="w-[150px] sm:w-[180px]">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="h-9 w-full text-xs sm:text-sm">
                <Building2 className="w-3.5 h-3.5 ml-1 text-gray-400" />
                <SelectValue placeholder="شعبه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه شعب (تلفیقی)</SelectItem>
                {branches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        )}
        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={data.invoiceCount === 0} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="درآمد خالص فروش" value={data.netSales} icon={<TrendingUp className="w-4 h-4" />} color="emerald" suffix="تومان" />
        <StatCard label="سود ناخالص" value={data.grossProfit} icon={<Coins className="w-4 h-4" />} color="blue" suffix="تومان" hint={`حاشیه: ${toFaNum(Math.round(grossMargin))}٪`} />
        <StatCard label="سود عملیاتی" value={data.operatingProfit} icon={<FileText className="w-4 h-4" />} color="amber" suffix="تومان" />
        <StatCard
          label="سود خالص"
          value={Math.abs(data.netProfit)}
          icon={isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          color={isProfit ? 'emerald' : 'red'}
          suffix="تومان"
          hint={`حاشیه: ${toFaNum(Math.round(netMargin))}٪`}
        />
      </div>

      <Card className="border-gray-200">
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
            <Scale className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            صورت سود و زیان استاندارد
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            دوره: {periodText} • تعداد فاکتور: {formatNumberFa(data.invoiceCount)}
            {branchText && <span className="mr-2">— {branchText}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          {data.invoiceCount === 0 ? (
            <EmptyState message="در این دوره فاکتوری ثبت نشده است" />
          ) : (
            <div className="space-y-1">
              <div className="py-2 border-b-2 border-gray-200">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">۱. درآمد فروش</p>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs sm:text-sm text-gray-700 pr-4">فروش کالا و خدمات</span>
                <span className="text-xs sm:text-sm font-medium text-emerald-600" dir="ltr">{formatNumberFa(data.grossSales)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs sm:text-sm text-gray-500 pr-4">کم: بازگشت از فروش</span>
                <span className="text-xs sm:text-sm text-red-500" dir="ltr">({formatNumberFa(data.salesReturns)})</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs sm:text-sm text-gray-500 pr-4">کم: تخفیفات</span>
                <span className="text-xs sm:text-sm text-red-500" dir="ltr">({formatNumberFa(data.discounts)})</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b-2 border-emerald-200 bg-emerald-50/30 px-2 -mx-2">
                <span className="text-xs sm:text-sm font-bold text-gray-900">درآمد خالص فروش</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-700" dir="ltr">{formatNumberFa(data.netSales)}</span>
              </div>

              <div className="py-2 border-b-2 border-gray-200 mt-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">۲. بهای تمام شده کالای فروش رفته</p>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs sm:text-sm text-gray-700 pr-4">موجودی اول دوره + خرید</span>
                <span className="text-xs sm:text-sm font-medium text-gray-700" dir="ltr">{formatNumberFa(data.cogs)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b-2 border-blue-200 bg-blue-50/30 px-2 -mx-2">
                <span className="text-xs sm:text-sm font-bold text-gray-900">سود ناخالص</span>
                <span className="text-xs sm:text-sm font-bold text-blue-700" dir="ltr">{formatNumberFa(data.grossProfit)}</span>
              </div>

              <div className="py-2 border-b-2 border-gray-200 mt-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">۳. هزینه‌های عملیاتی</p>
              </div>
              {data.operatingExpenses.length === 0 ? (
                <p className="text-xs text-gray-400 pr-4 py-1.5">هزینه عملیاتی ثبت نشده است</p>
              ) : (
                data.operatingExpenses.map((exp, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1.5">
                    <span className="text-xs sm:text-sm text-gray-700 pr-4">{exp.name}</span>
                    <span className="text-xs sm:text-sm font-medium text-red-600" dir="ltr">({formatNumberFa(exp.amount)})</span>
                  </div>
                ))
              )}
              <div className="flex justify-between items-center py-2 border-b-2 border-amber-200 bg-amber-50/30 px-2 -mx-2">
                <span className="text-xs sm:text-sm font-bold text-gray-900">سود عملیاتی</span>
                <span className="text-xs sm:text-sm font-bold text-amber-700" dir="ltr">{formatNumberFa(data.operatingProfit)}</span>
              </div>

              <div className="py-2 border-b-2 border-gray-200 mt-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">۴. سایر درآمدها و هزینه‌ها</p>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs sm:text-sm text-gray-700 pr-4">سایر درآمدها</span>
                <span className="text-xs sm:text-sm font-medium text-emerald-600" dir="ltr">{formatNumberFa(data.otherIncome)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs sm:text-sm text-gray-700 pr-4">سایر هزینه‌ها</span>
                <span className="text-xs sm:text-sm font-medium text-red-600" dir="ltr">({formatNumberFa(data.otherExpenses)})</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b-2 border-gray-300 bg-gray-50/50 px-2 -mx-2">
                <span className="text-xs sm:text-sm font-bold text-gray-900">سود قبل از مالیات</span>
                <span className="text-xs sm:text-sm font-bold text-gray-900" dir="ltr">{formatNumberFa(data.profitBeforeTax)}</span>
              </div>

              <div className="py-2 border-b-2 border-gray-200 mt-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">۵. مالیات بر درآمد</p>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs sm:text-sm text-gray-700 pr-4">مالیات بر درآمد (۲۵٪)</span>
                <span className="text-xs sm:text-sm font-medium text-red-600" dir="ltr">({formatNumberFa(data.incomeTax)})</span>
              </div>

              <div className={`flex justify-between items-center py-4 px-3 -mx-3 rounded-lg mt-3 ${isProfit ? 'bg-gradient-to-l from-emerald-50 to-emerald-100/50 border border-emerald-300' : 'bg-gradient-to-l from-red-50 to-red-100/50 border border-red-300'}`}>
                <span className="text-sm sm:text-base font-bold text-gray-900">
                  {isProfit ? 'سود خالص دوره' : 'زیان خالص دوره'}
                </span>
                <span className={`text-base sm:text-xl font-bold ${isProfit ? 'text-emerald-700' : 'text-red-700'}`} dir="ltr">
                  {isProfit ? '' : '('}{formatNumberFa(Math.abs(data.netProfit))}{isProfit ? '' : ')'}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 6: Inventory — موجودی کالاها (v6.9 اصلاح‌شده با فیلتر هوشمند انبار)
// ============================================================================

function InventoryReport() {
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)

  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all')

  const calculateProductValue = useCallback((p: any): number => {
    if (p.stockValue !== undefined && p.stockValue !== null && Number(p.stockValue) > 0) {
      return Number(p.stockValue)
    }
    const stock = Number(p.currentStock || 0)
    const purchasePrice = Number(p.purchasePrice || 0)
    if (stock > 0 && purchasePrice > 0) return stock * purchasePrice
    const avgCost = Number(p.averageCost || p.cost || 0)
    if (stock > 0 && avgCost > 0) return stock * avgCost
    return 0
  }, [])

  const calculateRetailValue = useCallback((p: any): number => {
    const stock = Number(p.currentStock || 0)
    const salePrice = Number(p.salePrice || 0)
    return stock * salePrice
  }, [])

  const calculatePotentialProfit = useCallback((p: any): number => {
    return calculateRetailValue(p) - calculateProductValue(p)
  }, [calculateRetailValue, calculateProductValue])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('summary', 'true')
      if (selectedCategory !== 'all') params.set('categoryId', selectedCategory)
      if (selectedWarehouse !== 'all') params.set('warehouseId', selectedWarehouse)

      const res = await fetch(`/api/reports/inventory?${params.toString()}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        setCategories(data.data.categories || [])
        setSummary(data.data.summary || null)
        setProducts(data.data.products || [])
      } else {
        setError(data.error || 'خطا در بارگذاری داده‌ها')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setLoading(false)
  }, [selectedCategory, selectedWarehouse])

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const res = await fetch('/api/warehouses', { headers: getAuthHeaders() })
        const data = await res.json()
        if (data.success) setWarehouses(data.data || [])
      } catch (err) {
        console.error('Failed to fetch warehouses', err)
      }
    }
    fetchWarehouses()
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { setListVisible(false); setPage(1) }, [selectedCategory, showOnlyLowStock, selectedWarehouse])

  const enrichedProducts = useMemo(() => {
    return products.map((p: any) => ({
      ...p,
      stockValue: calculateProductValue(p),
      retailValue: calculateRetailValue(p),
      potentialProfit: calculatePotentialProfit(p),
    }))
  }, [products, calculateProductValue, calculateRetailValue, calculatePotentialProfit])

  const filteredProducts = useMemo(() => {
    let result = enrichedProducts

    if (selectedWarehouse !== 'all') {
      result = result.filter((p: any) => {
        if (p.warehouseStocks && Array.isArray(p.warehouseStocks)) {
          return p.warehouseStocks.length > 0
        }
        return true
      })
    }

    if (showOnlyLowStock) {
      result = result.filter((p: any) => p.stockStatus === 'low' || p.stockStatus === 'out')
    }

    return result
  }, [enrichedProducts, selectedWarehouse, showOnlyLowStock])
  

  const calculatedSummary = useMemo(() => {
    if (!summary) return null
    if (filteredProducts.length === 0) return { ...summary, totalProducts: 0, totalStockValue: 0, totalRetailValue: 0, totalPotentialProfit: 0, lowStockCount: 0, outOfStockCount: 0 }

    const totalProducts = filteredProducts.length
    const totalStockValue = filteredProducts.reduce((sum, p) => sum + (p.stockValue || 0), 0)
    const totalRetailValue = filteredProducts.reduce((sum, p) => sum + (p.retailValue || 0), 0)
    const totalPotentialProfit = filteredProducts.reduce((sum, p) => sum + (p.potentialProfit || 0), 0)
    const lowStockCount = filteredProducts.filter((p) => p.stockStatus === 'low').length
    const outOfStockCount = filteredProducts.filter((p) => p.stockStatus === 'out').length

    return {
      ...summary,
      totalProducts,
      totalStockValue,
      totalRetailValue,
      totalPotentialProfit,
      lowStockCount,
      outOfStockCount,
    }
  }, [summary, filteredProducts])

  const paginatedProducts = paginate(filteredProducts, page)

  const columns: ReportColumn[] = [
    { key: 'code', label: 'کد کالا', width: 80, align: 'center' },
    { key: 'name', label: 'نام کالا', width: 200, align: 'right' },
    { key: 'categoryName', label: 'دسته‌بندی', width: 100, align: 'right' },
    { key: 'currentStock', label: 'موجودی', isNumeric: true, align: 'center' },
    { key: 'unitName', label: 'واحد', width: 60, align: 'center' },
    { key: 'purchasePrice', label: 'قیمت خرید', isCurrency: true, align: 'left' },
    { key: 'salePrice', label: 'قیمت فروش', isCurrency: true, align: 'left' },
    { key: 'stockValue', label: 'ارزش انبار (خرید)', isCurrency: true, align: 'left' },
    { key: 'retailValue', label: 'ارزش فروش', isCurrency: true, align: 'left' },
    { key: 'potentialProfit', label: 'سود بالقوه', isCurrency: true, align: 'left' },
  ]

  const meta: ReportMeta = {
    title: 'گزارش موجودی کالاها',
    storeName: getStoreName(),
    summary: calculatedSummary ? [
      { label: 'تعداد کالاها', value: formatNumberFa(calculatedSummary.totalProducts), color: 'blue' },
      { label: 'ارزش انبار (قیمت خرید)', value: formatNumberFa(calculatedSummary.totalStockValue), color: 'blue' },
      { label: 'ارزش فروش', value: formatNumberFa(calculatedSummary.totalRetailValue), color: 'green' },
      { label: 'سود بالقوه', value: formatNumberFa(calculatedSummary.totalPotentialProfit), color: 'green' },
      { label: 'کالاهای رو به اتمام', value: formatNumberFa(calculatedSummary.lowStockCount), color: 'amber' },
      { label: 'کالاهای ناموجود', value: formatNumberFa(calculatedSummary.outOfStockCount), color: 'red' },
    ] : [],
  }

  if (loading) return <LoadingState message="در حال بارگذاری خلاصه موجودی..." />
  if (error) return <ErrorState message={error} onRetry={loadSummary} />

  return (
    <div className="space-y-4">
      {calculatedSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">تعداد کالاها</p>
                <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(calculatedSummary.totalProducts)}</p>
                <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">محصول</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Package className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">ارزش انبار</p>
                <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(calculatedSummary.totalStockValue)}</p>
                <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">ریال</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Coins className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">ارزش فروش</p>
                <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(calculatedSummary.totalRetailValue)}</p>
                <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">ریال</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <TrendingUp className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">سود بالقوه</p>
                <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(calculatedSummary.totalPotentialProfit)}</p>
                <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">ریال</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Wallet className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">رو به اتمام</p>
                <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(calculatedSummary.lowStockCount)}</p>
                <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">کالا</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-2.5 sm:p-3 text-white shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-white/80 leading-tight truncate">ناموجود</p>
                <p className="text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate" dir="ltr">{formatNumberFa(calculatedSummary.outOfStockCount)}</p>
                <p className="text-[9px] sm:text-[10px] text-white/70 leading-tight mt-0.5 truncate">کالا</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <XCircle className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <Package className="w-3.5 h-3.5 ml-1 text-gray-400" />
            <SelectValue placeholder="همه انبارها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه انبارها (تلفیقی)</SelectItem>
            {warehouses.map((w: any) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="همه دسته‌ها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه دسته‌ها</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={showOnlyLowStock} onChange={(e) => setShowOnlyLowStock(e.target.checked)} className="w-3.5 h-3.5" />
          <span>فقط کالاهای رو به اتمام و ناموجود</span>
        </label>
        <div className="flex-1" />
        <ReportActions
          onExportExcel={() => exportToExcel(meta, columns, filteredProducts, 'گزارش-موجودی-کالا')}
          onPrint={() => printReport(meta, columns, filteredProducts)}
          disabled={filteredProducts.length === 0}
        />
      </div>

      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-600">لیست کالاها</p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={filteredProducts.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده رکوردها، دکمه «نمایش لیست» را بزنید" />
          ) : filteredProducts.length === 0 ? (
            <EmptyState message="کالایی در این انبار/دسته یافت نشد" />
          ) : (
            <div className="overflow-x-auto -mx-3 sm:-mx-4">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs text-right">کد</TableHead>
                    <TableHead className="text-xs text-right">نام کالا</TableHead>
                    <TableHead className="text-xs text-right">دسته</TableHead>
                    <TableHead className="text-xs text-center">موجودی</TableHead>
                    <TableHead className="text-xs text-center">قیمت خرید</TableHead>
                    <TableHead className="text-xs text-center">قیمت فروش</TableHead>
                    <TableHead className="text-xs text-center">ارزش انبار</TableHead>
                    <TableHead className="text-xs text-center">ارزش فروش</TableHead>
                    <TableHead className="text-xs text-center">وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((p) => (
                    <TableRow key={p.id} className="hover:bg-gray-50">
                      <TableCell className="text-xs text-right font-mono">{p.code}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs text-right">{p.categoryName}</TableCell>
                      <TableCell className="text-xs text-center font-mono">{formatNumberFa(p.currentStock)} {p.unitName}</TableCell>
                      <TableCell className="text-xs text-center font-mono" dir="ltr">{formatNumberFa(p.purchasePrice)} ریال</TableCell>
                      <TableCell className="text-xs text-center font-mono" dir="ltr">{formatNumberFa(p.salePrice)} ریال</TableCell>
                      <TableCell className="text-xs text-center font-mono font-bold text-emerald-700" dir="ltr">{formatNumberFa(p.stockValue)} ریال</TableCell>
                      <TableCell className="text-xs text-center font-mono font-bold text-blue-700" dir="ltr">{formatNumberFa(p.retailValue)} ریال</TableCell>
                      <TableCell className="text-xs text-center">
                        {p.stockStatus === 'out' ? (
                          <Badge className="bg-red-100 text-red-700 text-[9px]">ناموجود</Badge>
                        ) : p.stockStatus === 'low' ? (
                          <Badge className="bg-amber-100 text-amber-700 text-[9px]">رو به اتمام</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">موجود</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={filteredProducts.length} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 7: VAT
// ============================================================================

function VATReport() {
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [dateFrom, setDateFrom] = useState(firstDayOfCurrentJalaliMonthISO())
  const [dateTo, setDateTo] = useState(todayGregorianISO())
  const [error, setError] = useState<string | null>(null)
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)

      const res = await fetch(`/api/reports/vat?${params.toString()}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        setSummary(data.data.summary || null)
        setInvoices(data.data.invoices || [])
      } else {
        setError(data.error || 'خطا در بارگذاری داده‌ها')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { setListVisible(false); setPage(1) }, [dateFrom, dateTo])

  const paginatedInvoices = paginate(invoices, page)
  const periodText = `${formatJalaliLong(dateFrom)} تا ${formatJalaliLong(dateTo)}`

  const columns: ReportColumn[] = [
    { key: 'number', label: 'شماره فاکتور', width: 100, align: 'right' },
    { key: 'invoiceDateJalali', label: 'تاریخ', width: 100, align: 'right' },
    { key: 'customerName', label: 'مشتری', width: 150, align: 'right' },
    { key: 'invoiceType', label: 'نوع', width: 80, align: 'center' },
    { key: 'subTotal', label: 'پایه مالیاتی', isCurrency: true, align: 'left' },
    { key: 'discountAmount', label: 'تخفیف', isCurrency: true, align: 'left' },
    { key: 'taxAmount', label: 'مالیات', isCurrency: true, align: 'left' },
    { key: 'totalAmount', label: 'مبلغ کل', isCurrency: true, align: 'left' },
  ]

  const meta: ReportMeta = {
    title: 'گزارش مالیات بر ارزش افزوده',
    storeName: getStoreName(),
    period: periodText,
    summary: summary ? [
      { label: 'فاکتورهای فروش', value: formatNumberFa(summary.saleInvoiceCount), color: 'blue' },
      { label: 'برگشتی‌ها', value: formatNumberFa(summary.returnInvoiceCount), color: 'amber' },
      { label: 'پایه مالیاتی خالص', value: formatNumberFa(summary.netTaxBase), color: 'blue' },
      { label: 'جمع تخفیف‌ها', value: formatNumberFa(summary.totalDiscount), color: 'red' },
      { label: 'مالیات دریافتی (خالص)', value: formatNumberFa(summary.totalTaxCollected), color: 'amber' },
      { label: 'مالیات قابل پرداخت', value: formatNumberFa(summary.vatPayable), color: 'blue' },
    ] : [],
  }

  if (loading) return <LoadingState message="در حال بارگذاری خلاصه مالیات..." />
  if (error) return <ErrorState message={error} onRetry={loadData} />

  const handleExportExcel = () => {
    const rows = invoices.map((inv) => ({
      number: inv.number,
      invoiceDateJalali: inv.invoiceDateJalali,
      customerName: inv.customerName,
      invoiceType: inv.invoiceType === 'return' ? 'برگشتی' : 'فروش',
      subTotal: inv.subTotal,
      discountAmount: inv.discountAmount,
      taxAmount: inv.taxAmount,
      totalAmount: inv.totalAmount,
    }))
    exportToExcel(meta, columns, rows, 'گزارش-مالیات-بر-ارزش-افزوده')
  }

  const handlePrint = () => {
    const rows = invoices.map((inv) => ({
      number: inv.number,
      invoiceDateJalali: inv.invoiceDateJalali,
      customerName: inv.customerName,
      invoiceType: inv.invoiceType === 'return' ? 'برگشتی' : 'فروش',
      subTotal: inv.subTotal,
      discountAmount: inv.discountAmount,
      taxAmount: inv.taxAmount,
      totalAmount: inv.totalAmount,
    }))
    printReport(meta, columns, rows)
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatCard label="فاکتورهای فروش" value={summary.saleInvoiceCount} icon={<FileText className="w-4 h-4" />} color="blue" dir="rtl" />
          <StatCard label="برگشتی‌ها" value={summary.returnInvoiceCount} icon={<TrendingDown className="w-4 h-4" />} color="amber" dir="rtl" />
          <StatCard label="پایه خالص" value={summary.netTaxBase} icon={<Coins className="w-4 h-4" />} color="blue" suffix="تومان" />
          <StatCard label="تخفیف‌ها" value={summary.totalDiscount} icon={<TrendingDown className="w-4 h-4" />} color="red" suffix="تومان" />
          <StatCard label="مالیات (خالص)" value={summary.totalTaxCollected} icon={<Percent className="w-4 h-4" />} color="amber" suffix="تومان" />
          <StatCard label="قابل پرداخت" value={summary.vatPayable} icon={<Building2 className="w-4 h-4" />} color="purple" suffix="تومان" />
        </div>
      )}

      {summary?.taxRates?.length > 0 && (
        <ChartCard title="تفکیک نرخ‌های مالیاتی" icon={<Percent className="w-4 h-4 text-gray-500" />}>
          <Table dir="rtl">
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs text-right">نرخ مالیات</TableHead>
                <TableHead className="text-xs text-center">تعداد آیتم</TableHead>
                <TableHead className="text-xs text-center">پایه مالیاتی</TableHead>
                <TableHead className="text-xs text-center">مالیات محاسبه‌شده</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.taxRates.map((tr: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell className="text-xs text-right font-bold">{toFaNum(tr.rate)}٪</TableCell>
                  <TableCell className="text-xs text-center">{formatNumberFa(tr.count)}</TableCell>
                  <TableCell className="text-xs text-center font-mono">{formatNumberFa(tr.baseAmount)}</TableCell>
                  <TableCell className="text-xs text-center font-mono font-bold">{formatNumberFa(tr.taxAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <PersianDateRangePicker
          value={{ from: dateFrom, to: dateTo }}
          onChange={(v) => { setDateFrom(v.from); setDateTo(v.to) }}
        />
        <div className="flex-1" />
        <ReportActions
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          disabled={invoices.length === 0}
        />
      </div>

      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-600">لیست فاکتورهای مالیاتی</p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={invoices.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده فاکتورها، دکمه «نمایش لیست» را بزنید" />
          ) : invoices.length === 0 ? (
            <EmptyState message="فاکتوری در این بازه یافت نشد" />
          ) : (
             <div className="overflow-x-auto -mx-3 sm:-mx-4">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs text-right">شماره</TableHead>
                    <TableHead className="text-xs text-right">تاریخ</TableHead>
                    <TableHead className="text-xs text-right">مشتری</TableHead>
                    <TableHead className="text-xs text-center">نوع</TableHead>
                    <TableHead className="text-xs text-center">پایه مالیاتی</TableHead>
                    <TableHead className="text-xs text-center">تخفیف</TableHead>
                    <TableHead className="text-xs text-center">مالیات</TableHead>
                    <TableHead className="text-xs text-center">مبلغ کل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInvoices.map((inv) => (
                    <TableRow key={inv.id} className={inv.invoiceType === 'return' ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-gray-50'}>
                      <TableCell className="text-xs text-right font-mono">{inv.number}</TableCell>
                      <TableCell className="text-xs text-right">{inv.invoiceDateJalali}</TableCell>
                      <TableCell className="text-xs text-right">{inv.customerName}</TableCell>
                      <TableCell className="text-xs text-center">
                        {inv.invoiceType === 'return' ? (
                          <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">برگشتی</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">فروش</Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-xs text-center font-mono ${inv.invoiceType === 'return' ? 'text-red-600' : 'text-gray-800'}`}>
                        {formatNumberFa(Math.abs(inv.subTotal))} ریال
                      </TableCell>
                      <TableCell className={`text-xs text-center font-mono ${inv.invoiceType === 'return' ? 'text-red-600' : 'text-red-600'}`}>
                        {inv.discountAmount > 0 ? `-${formatNumberFa(Math.abs(inv.discountAmount))} ریال` : '—'}
                      </TableCell>
                      <TableCell className={`text-xs text-center font-mono font-bold ${inv.invoiceType === 'return' ? 'text-amber-600' : 'text-amber-600'}`}>
                        {formatNumberFa(Math.abs(inv.taxAmount))} ریال
                      </TableCell>
                      <TableCell className={`text-xs text-center font-mono font-bold ${inv.invoiceType === 'return' ? 'text-red-600' : 'text-gray-800'}`}>
                        {inv.invoiceType === 'return' ? `(${formatNumberFa(Math.abs(inv.totalAmount))}) ریال` : `${formatNumberFa(inv.totalAmount)} ریال`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={invoices.length} onPageChange={setPage} />
            </div>

          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 8: Cashier Performance — عملکرد صندوق‌دار (پلن حرفه‌ای+)
// ============================================================================

function CashierPerformanceReport({ invoices, dateRange }: { invoices: any[]; dateRange: DateRange }) {
  const [selectedCashier, setSelectedCashier] = useState<string>('all')
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { setListVisible(false); setPage(1) }, [selectedCashier, dateRange.from, dateRange.to])

  const stats = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number; cash: number; credit: number }> = {}
    invoices.forEach((inv) => {
      if (getInvoiceStatus(inv) === 'CANCELLED') return
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d || d < dateRange.from || d > dateRange.to) return
      const name = getInvoiceCashier(inv)
      if (!map[name]) map[name] = { name, count: 0, total: 0, cash: 0, credit: 0 }
      const total = getInvoiceTotal(inv)
      map[name].count++
      map[name].total += total
      const pt = getInvoicePaymentType(inv)
      if (pt === 'Cash' || pt === 'cash') map[name].cash += total
      else map[name].credit += total
    })
    return Object.values(map)
  }, [invoices, dateRange.from, dateRange.to])

  const cashiers = stats.map((s) => s.name)
  const filtered = selectedCashier === 'all' ? stats : stats.filter((c) => c.name === selectedCashier)

  const grandTotal = filtered.reduce((s, c) => s + c.total, 0)
  const grandCash = filtered.reduce((s, c) => s + c.cash, 0)
  const grandCredit = filtered.reduce((s, c) => s + c.credit, 0)
  const totalCount = filtered.reduce((s, c) => s + c.count, 0)
  const cashierFilterText = selectedCashier === 'all' ? 'همه صندوق‌داران' : selectedCashier

  const paginatedStats = paginate(filtered, page)
  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`

  const chartData = filtered.map((s) => ({
    name: s.name,
    'فروش نقدی': s.cash,
    'فروش نسیه': s.credit,
  }))

  const columns: ReportColumn[] = [
    { key: 'name', label: 'نام صندوق‌دار', align: 'right' },
    { key: 'count', label: 'تعداد فاکتور', isNumeric: true, align: 'center' },
    { key: 'cash', label: 'فروش نقدی', isCurrency: true, align: 'left' },
    { key: 'credit', label: 'فروش نسیه', isCurrency: true, align: 'left' },
    { key: 'total', label: 'جمع فروش', isCurrency: true, align: 'left' },
    { key: 'avg', label: 'میانگین فاکتور', isCurrency: true, align: 'left' },
  ]

  const rows = filtered.map((s) => ({
    name: s.name,
    count: s.count,
    cash: s.cash,
    credit: s.credit,
    total: s.total,
    avg: s.count > 0 ? Math.round(s.total / s.count) : 0,
  }))

  const meta: ReportMeta = {
    title: 'گزارش عملکرد صندوق‌داران',
    storeName: getStoreName(),
    period: periodText,
    filters: [{ label: 'صندوق‌دار', value: cashierFilterText }],
    summary: [
      { label: 'تعداد صندوق‌دار', value: formatNumberFa(filtered.length), color: 'blue' },
      { label: 'تعداد فاکتور', value: formatNumberFa(totalCount), color: 'gray' },
      { label: 'فروش نقدی', value: formatNumberFa(grandCash), color: 'green' },
      { label: 'جمع فروش', value: formatNumberFa(grandTotal), color: 'green' },
    ],
    note: 'این گزارش بر اساس فاکتورهای صادر شده توسط هر صندوق‌دار تولید شده است.',
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <div className="w-[150px] sm:w-[180px]">
          <Select value={selectedCashier} onValueChange={setSelectedCashier}>
            <SelectTrigger className="h-9 w-full text-xs sm:text-sm"><SelectValue placeholder="صندوق‌دار" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه صندوق‌داران</SelectItem>
              {cashiers.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <ReportActions
          onExportExcel={() => exportToExcel(meta, columns, rows, 'گزارش-عملکرد-صندوق‌داران')}
          onPrint={() => printReport(meta, columns, rows)}
          disabled={filtered.length === 0}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="تعداد صندوق‌دار" value={filtered.length} icon={<UserCheck className="w-4 h-4" />} color="blue" dir="rtl" />
        <StatCard label="تعداد فاکتور" value={totalCount} icon={<FileText className="w-4 h-4" />} color="gray" dir="rtl" />
        <StatCard label="فروش نقدی" value={grandCash} icon={<Banknote className="w-4 h-4" />} color="emerald" suffix="تومان" />
        <StatCard label="جمع فروش" value={grandTotal} icon={<Wallet className="w-4 h-4" />} color="teal" suffix="تومان" />
      </div>

      {chartData.length > 0 && (
        <ChartCard title="مقایسه عملکرد صندوق‌داران" icon={<BarChart3 className="w-4 h-4 text-blue-600" />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => toFaNum(Math.round(v / 1000)) + 'k'} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <Tooltip content={<PersianChartTooltip formatter={(v: number) => formatNumberFa(v) + ' تومان'} />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Tahoma' }} />
              <Bar dataKey="فروش نقدی" stackId="a" fill="#10b981" />
              <Bar dataKey="فروش نسیه" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-600">لیست عملکرد صندوق‌داران</p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={filtered.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده رکوردها، دکمه «نمایش لیست» را بزنید" />
          ) : filtered.length === 0 ? (
            <EmptyState message="داده‌ای یافت نشد" />
          ) : (
            <div className="overflow-x-auto -mx-3 sm:-mx-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs whitespace-nowrap">نام صندوق‌دار</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">تعداد فاکتور</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">فروش نقدی</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">فروش نسیه</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">جمع فروش</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden md:table-cell">میانگین فاکتور</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStats.map((stat) => (
                    <TableRow key={stat.name} className="hover:bg-emerald-50/50">
                      <TableCell className="text-xs sm:text-sm font-medium whitespace-nowrap">{stat.name}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatNumberFa(stat.count)}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-emerald-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(stat.cash)}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-amber-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(stat.credit)}</TableCell>
                      <TableCell className="text-xs sm:text-sm font-bold whitespace-nowrap" dir="ltr">{formatNumberFa(stat.total)}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-gray-600 whitespace-nowrap hidden md:table-cell" dir="ltr">{stat.count > 0 ? formatNumberFa(Math.round(stat.total / stat.count)) : '۰'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={filtered.length} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 9: Installments — گزارش اقساط (پلن حرفه‌ای+)
// ============================================================================
// ★★★ v2.0: رفع باگ فیلتر تاریخ + fallback هوشمند + لاگ دقیق
// ============================================================================

function InstallmentReport({ plans, dateRange }: { plans: any[]; dateRange: DateRange }) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)
  const [showAll, setShowAll] = useState(false)

  const safeDateRange: DateRange = {
    from: new Date(new Date().setFullYear(new Date().getFullYear() - 5)).toISOString().split('T')[0],
    to: new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().split('T')[0],
  };

  useEffect(() => { 
    setListVisible(false)
    setPage(1) 
  }, [statusFilter, dateRange.from, dateRange.to])

  const allInstallments = useMemo(() => {
    const list: any[] = []
    if (!Array.isArray(plans)) return list

    plans.forEach((plan) => {
      const schedules = plan.schedules || plan.installments || []
      const customerName = plan.customerName || 
        (plan.invoice?.customer ? `${plan.invoice.customer.firstName || ''} ${plan.invoice.customer.lastName || ''}`.trim() : 'مشتری نامشخص')
      const invoiceNumber = plan.invoiceNumber || plan.invoice?.number || '---'
      const totalInstallments = plan.numberOfInstallments || plan.totalInstallments || schedules.length

      schedules.forEach((s: any) => {
        list.push({
          id: s.id,
          customerName,
          invoiceNumber,
          installmentNumber: s.installmentNumber,
          totalInstallments,
          dueDate: s.dueDate,
          amount: Number(s.amount) || 0,
          paidAmount: Number(s.paidAmount) || 0,
          status: (s.status || 'PENDING').toUpperCase(),
        })
      })
    })
    
    console.log('[InstallmentReport] Total flattened installments:', list.length)
    if (list.length > 0) {
      console.log('[InstallmentReport] Sample installment:', list[0])
      console.log('[InstallmentReport] Date range received:', {
        from: dateRange.from,
        to: dateRange.to,
        fromDateObj: new Date(dateRange.from).toISOString(),
        toDateObj: new Date(dateRange.to).toISOString(),
      })
    }
    return list
  }, [plans, dateRange.from, dateRange.to])

  const filtered = useMemo(() => {
    return allInstallments.filter((ins) => {
      if (statusFilter !== 'all') {
        const isOverdue = ins.status !== 'PAID' && new Date(ins.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0)
        const displayStatus = isOverdue && ins.status === 'PENDING' ? 'OVERDUE' : ins.status
        if (displayStatus !== statusFilter) return false
      }
      return true
    })
  }, [allInstallments, statusFilter])

  console.log('[InstallmentReport] Final filtered installments:', filtered.length)

  const pendingCount = filtered.filter((i) => i.status === 'PENDING' && new Date(i.dueDate).setHours(0,0,0,0) >= new Date().setHours(0,0,0,0)).length
  const overdueCount = filtered.filter((i) => i.status !== 'PAID' && new Date(i.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0)).length
  const paidCount = filtered.filter((i) => i.status === 'PAID').length
  const totalRemaining = filtered.filter((i) => i.status !== 'PAID').reduce((s, i) => s + (i.amount - i.paidAmount), 0)

  const paginatedInstallments = paginate(filtered, page)

  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`
  const statusText = statusFilter === 'all' ? 'همه وضعیت‌ها' :
    statusFilter === 'PENDING' ? 'سررسید نشده' :
    statusFilter === 'OVERDUE' ? 'سررسید گذشته' : 'پرداخت شده'

  const columns: ReportColumn[] = [
    { key: 'customerName', label: 'مشتری', align: 'right' },
    { key: 'invoiceNumber', label: 'شماره فاکتور', align: 'right' },
    { key: 'installmentNumber', label: 'قسط', align: 'center' },
    { key: 'dueDate', label: 'سررسید', align: 'right' },
    { key: 'amount', label: 'مبلغ قسط', isCurrency: true, align: 'left' },
    { key: 'paidAmount', label: 'پرداخت شده', isCurrency: true, align: 'left' },
    {
      key: 'status', label: 'وضعیت', align: 'center',
      colorClass: (value: any) => {
        const v = String(value || '').toUpperCase()
        if (v === 'PAID' || v === 'پرداخت شده') return 'text-green-600'
        if (v === 'OVERDUE' || v === 'سررسید گذشته') return 'text-red-600'
        return 'text-amber-600'
      },
    },
  ]

  // ✅ اصلاح: ترجمه وضعیت‌ها به فارسی برای چاپ و اکسل
  const rows = filtered.map((ins) => {
    const isOverdue = ins.status !== 'PAID' && new Date(ins.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0)
    const rawStatus = isOverdue && ins.status === 'PENDING' ? 'OVERDUE' : ins.status
    const translatedStatus = rawStatus === 'PAID' ? 'پرداخت شده' : rawStatus === 'OVERDUE' ? 'سررسید گذشته' : 'در انتظار'
    return {
      customerName: ins.customerName,
      invoiceNumber: ins.invoiceNumber,
      installmentNumber: `${toFaNum(ins.installmentNumber)} از ${toFaNum(ins.totalInstallments)}`,
      dueDate: formatJalaliLong(ins.dueDate),
      amount: ins.amount,
      paidAmount: ins.paidAmount,
      status: translatedStatus,
    }
  })

  const meta: ReportMeta = {
    title: 'گزارش اقساط',
    storeName: getStoreName(),
    period: periodText,
    filters: [{ label: 'وضعیت', value: statusText }],
    summary: [
      { label: 'اقساط پرداخت شده', value: formatNumberFa(paidCount), color: 'green' },
      { label: 'اقساط در انتظار', value: formatNumberFa(pendingCount), color: 'amber' },
      { label: 'اقساط سررسید گذشته', value: formatNumberFa(overdueCount), color: 'red' },
      { label: 'مانده اقساط', value: formatNumberFa(totalRemaining), color: 'gray' },
    ],
    note: 'این گزارش بر اساس تاریخ سررسید اقساط در بازه مشخص شده تولید شده است.',
  }

  const dateFilterIsEmpty = useMemo(() => {
    if (allInstallments.length === 0) return false
    const dateFilteredOnly = allInstallments.filter((ins) => {
      try {
        const dueDateObj = new Date(ins.dueDate)
        dueDateObj.setHours(0, 0, 0, 0)
        const fromDate = new Date(dateRange.from)
        fromDate.setHours(0, 0, 0, 0)
        const toDate = new Date(dateRange.to)
        toDate.setHours(23, 59, 59, 999)
        return dueDateObj >= fromDate && dueDateObj <= toDate
      } catch {
        return false
      }
    })
    return dateFilteredOnly.length === 0
  }, [allInstallments, dateRange.from, dateRange.to])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 w-full mb-2">
        <div className="w-[160px] shrink-0">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue placeholder="وضعیت قسط" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              <SelectItem value="PENDING">سررسید نشده</SelectItem>
              <SelectItem value="OVERDUE">سررسید گذشته</SelectItem>
              <SelectItem value="PAID">پرداخت شده</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <button
          onClick={() => setShowAll(!showAll)}
          className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
            showAll 
              ? 'bg-purple-100 text-purple-700 border-purple-300' 
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {showAll ? '✓ نمایش همه اقساط' : 'نمایش همه اقساط (بدون فیلتر تاریخ)'}
        </button>

        <ReportActions
          onExportExcel={() => exportToExcel(meta, columns, rows, 'گزارش-اقساط')}
          onPrint={() => printReport(meta, columns, rows)}
          disabled={filtered.length === 0}
        />
      </div>

      {dateFilterIsEmpty && allInstallments.length > 0 && !showAll && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-800">
            <p className="font-bold mb-1">هیچ قسطی در بازه تاریخ انتخاب‌شده یافت نشد</p>
            <p>
              {toFaNum(allInstallments.length)} قسط در سیستم وجود دارد، اما سررسید آنها در بازه {periodText} نیست.
              برای مشاهده همه اقساط، دکمه «نمایش همه اقساط» را بزنید یا بازه تاریخ را گسترش دهید.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="پرداخت شده" value={paidCount} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" dir="rtl" />
        <StatCard label="در انتظار" value={pendingCount} icon={<Clock className="w-4 h-4" />} color="amber" dir="rtl" />
        <StatCard label="سررسید گذشته" value={overdueCount} icon={<AlertTriangle className="w-4 h-4" />} color="red" dir="rtl" />
        <StatCard label="مانده اقساط" value={totalRemaining} icon={<Wallet className="w-4 h-4" />} color="gray" suffix="ریال" dir="rtl" />
      </div>

      <Card className="border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-gray-700">
              لیست اقساط ({formatNumberFa(filtered.length)} مورد)
              {dateFilterIsEmpty && allInstallments.length > 0 && !showAll && (
                <span className="text-xs text-amber-600 mr-2">
                  (از {formatNumberFa(allInstallments.length)} قسط کل)
                </span>
              )}
            </p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={filtered.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده رکوردها، دکمه «نمایش لیست» را بزنید" />
          ) : filtered.length === 0 ? (
            <EmptyState message="قسطی در این بازه زمانی و با این فیلتر یافت نشد." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs">مشتری</TableHead>
                    <TableHead className="text-right text-xs hidden sm:table-cell">شماره فاکتور</TableHead>
                    <TableHead className="text-center text-xs hidden md:table-cell">قسط</TableHead>
                    <TableHead className="text-right text-xs hidden lg:table-cell">سررسید</TableHead>
                    <TableHead className="text-left text-xs">مبلغ قسط</TableHead>
                    <TableHead className="text-left text-xs hidden sm:table-cell">پرداخت شده</TableHead>
                    <TableHead className="text-center text-xs">وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInstallments.map((ins) => {
                    const isOverdue = ins.status !== 'PAID' && new Date(ins.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0)
                    const displayStatus = isOverdue && ins.status === 'PENDING' ? 'OVERDUE' : ins.status
                    
                    return (
                      <TableRow key={ins.id} className="hover:bg-gray-50/50">
                        <TableCell className="text-sm font-medium">{ins.customerName}</TableCell>
                        <TableCell className="text-sm font-mono hidden sm:table-cell" dir="ltr">{ins.invoiceNumber}</TableCell>
                        <TableCell className="text-sm text-center hidden md:table-cell">{formatNumberFa(ins.installmentNumber)} از {formatNumberFa(ins.totalInstallments)}</TableCell>
                        <TableCell className="text-sm hidden lg:table-cell">{formatJalaliLong(ins.dueDate)}</TableCell>
                        <TableCell className="text-sm font-mono text-left" dir="ltr">{formatNumberFa(ins.amount)}</TableCell>
                        <TableCell className="text-sm font-mono text-left hidden sm:table-cell" dir="ltr">{formatNumberFa(ins.paidAmount)}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={`text-[10px] ${
                            displayStatus === 'PAID' ? 'bg-green-100 text-green-700 border-green-200' : 
                            displayStatus === 'OVERDUE' ? 'bg-red-100 text-red-700 border-red-200' : 
                            'bg-amber-100 text-amber-700 border-amber-200'
                          }`} variant="outline">
                            {displayStatus === 'PAID' ? 'پرداخت شده' : displayStatus === 'OVERDUE' ? 'سررسید گذشته' : 'در انتظار'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <Pagination page={page} total={filtered.length} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 10: Balance Sheet — ترازنامه (پلن حرفه‌ای+)
// ============================================================================

function BalanceSheetReport() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOf, setAsOf] = useState<string>(todayGregorianISO())

  const loadData = useCallback(async (asOfDate: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/balance-sheet?asOf=${asOfDate}`, { headers: getAuthHeaders() })
      const result = await res.json()
      if (result.success) setData(result.data)
      else setError(result.error || 'خطا در بارگذاری ترازنامه')
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData(asOf) }, [loadData, asOf])

  if (loading) return <LoadingState message="در حال محاسبه ترازنامه..." />
  if (error) return <ErrorState message={error} onRetry={() => loadData(asOf)} />
  if (!data) return null

  const handleExportExcel = () => {
    const rows: Record<string, any>[] = []
    rows.push({ section: 'دارایی‌ها', code: '', name: '', balance: '' })
    data.assets.accounts.forEach((a: any) => rows.push({ section: '', code: a.code, name: a.name, balance: a.balance }))
    rows.push({ section: 'جمع دارایی‌ها', code: '', name: '', balance: data.totalAssets })
    rows.push({ section: 'بدهی‌ها', code: '', name: '', balance: '' })
    data.liabilities.accounts.forEach((a: any) => rows.push({ section: '', code: a.code, name: a.name, balance: a.balance }))
    rows.push({ section: 'جمع بدهی‌ها', code: '', name: '', balance: data.totalLiabilities })
    rows.push({ section: 'حقوق صاحبان سهام', code: '', name: '', balance: '' })
    data.equity.accounts.forEach((a: any) => rows.push({ section: '', code: a.code, name: a.name, balance: a.balance }))
    rows.push({ section: 'جمع حقوق صاحبان سهام', code: '', name: '', balance: data.totalEquity })
    rows.push({ section: 'جمع بدهی‌ها و حقوق صاحبان سهام', code: '', name: '', balance: data.totalLiabilitiesAndEquity })

    const meta: ReportMeta = {
      title: 'ترازنامه',
      storeName: getStoreName(),
      filters: [{ label: 'تاریخ مرجع', value: formatJalaliLong(asOf) }],
      summary: [
        { label: 'جمع دارایی‌ها', value: formatNumberFa(data.totalAssets), color: 'green' },
        { label: 'جمع بدهی‌ها', value: formatNumberFa(data.totalLiabilities), color: 'red' },
        { label: 'حقوق صاحبان سهام', value: formatNumberFa(data.totalEquity), color: 'blue' },
        { label: 'وضعیت تراز', value: data.isBalanced ? 'متوازن ✓' : 'نامتوازن ✗', color: data.isBalanced ? 'green' : 'red' },
      ],
      note: data.isBalanced ? 'ترازنامه متوازن است — دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام' : `ترازنامه متوازن نیست — اختلاف: ${formatNumberFa(data.difference)}`,
    }
    const columns: ReportColumn[] = [
      { key: 'section', label: 'بخش', align: 'right' },
      { key: 'code', label: 'کد', align: 'center' },
      { key: 'name', label: 'نام حساب', align: 'right' },
      { key: 'balance', label: 'مانده', isCurrency: true, align: 'left' },
    ]
    exportToExcel(meta, columns, rows, 'ترازنامه')
  }

  const handlePrint = () => {
    const rows: Record<string, any>[] = []
    rows.push({ section: 'دارایی‌ها', code: '', name: '', balance: '' })
    data.assets.accounts.forEach((a: any) => rows.push({ section: '', code: a.code, name: a.name, balance: a.balance }))
    rows.push({ section: 'جمع دارایی‌ها', code: '', name: '', balance: data.totalAssets })
    rows.push({ section: 'بدهی‌ها', code: '', name: '', balance: '' })
    data.liabilities.accounts.forEach((a: any) => rows.push({ section: '', code: a.code, name: a.name, balance: a.balance }))
    rows.push({ section: 'جمع بدهی‌ها', code: '', name: '', balance: data.totalLiabilities })
    rows.push({ section: 'حقوق صاحبان سهام', code: '', name: '', balance: '' })
    data.equity.accounts.forEach((a: any) => rows.push({ section: '', code: a.code, name: a.name, balance: a.balance }))
    rows.push({ section: 'جمع حقوق صاحبان سهام', code: '', name: '', balance: data.totalEquity })
    rows.push({ section: 'جمع بدهی‌ها و حقوق صاحبان سهام', code: '', name: '', balance: data.totalLiabilitiesAndEquity })

    const meta: ReportMeta = {
      title: 'ترازنامه',
      storeName: getStoreName(),
      filters: [{ label: 'تاریخ مرجع', value: formatJalaliLong(asOf) }],
      summary: [
        { label: 'جمع دارایی‌ها', value: formatNumberFa(data.totalAssets), color: 'green' },
        { label: 'جمع بدهی‌ها', value: formatNumberFa(data.totalLiabilities), color: 'red' },
        { label: 'حقوق صاحبان سهام', value: formatNumberFa(data.totalEquity), color: 'blue' },
      ],
      note: data.isBalanced ? 'ترازنامه متوازن است — دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام' : `ترازنامه متوازن نیست — اختلاف: ${formatNumberFa(data.difference)}`,
    }
    const columns: ReportColumn[] = [
      { key: 'section', label: 'بخش', align: 'right' },
      { key: 'code', label: 'کد', align: 'center' },
      { key: 'name', label: 'نام حساب', align: 'right' },
      { key: 'balance', label: 'مانده', isCurrency: true, align: 'left' },
    ]
    printReport(meta, columns, rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            ترازنامه
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            تاریخ مرجع: {formatJalaliLong(asOf)} • تعداد حساب‌ها: {toFaNum(data.accountCount)} • تعداد اسناد: {toFaNum(data.entryCount)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 150 }}>
            <PersianDatePicker value={asOf} onChange={(iso) => setAsOf(iso || todayGregorianISO())} placeholder="تاریخ مرجع" size="sm" />
          </div>
          <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={!data} />
        </div>
      </div>

      <div className={`rounded-lg p-3 flex items-center gap-2 ${data.isBalanced ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
        {data.isBalanced ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-amber-600 shrink-0" />}
        <div className="flex-1">
          <p className={`text-sm font-bold ${data.isBalanced ? 'text-emerald-700' : 'text-amber-700'}`}>
            {data.isBalanced ? 'ترازنامه متوازن است' : 'ترازنامه متوازن نیست'}
          </p>
          <p className="text-xs text-gray-600">
            {data.isBalanced
              ? 'دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام ✓'
              : `اختلاف: ${formatNumberFa(data.difference)} ریال — احتمالاً به دلیل اسناد تراز نشده یا حساب‌های نامشخص`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="جمع دارایی‌ها" value={data.totalAssets} icon={<Wallet className="w-4 h-4" />} color="emerald" suffix="ریال" hint={`${toFaNum(data.assets.accounts.length)} حساب`} />
        <StatCard label="جمع بدهی‌ها" value={data.totalLiabilities} icon={<TrendingDown className="w-4 h-4" />} color="red" suffix="ریال" hint={`${toFaNum(data.liabilities.accounts.length)} حساب`} />
        <StatCard label="حقوق صاحبان سهام" value={data.totalEquity} icon={<Coins className="w-4 h-4" />} color="blue" suffix="ریال" hint={`${toFaNum(data.equity.accounts.length)} حساب`} />
      </div>

      <AccountSectionTable title="دارایی‌ها" icon={<Wallet className="w-4 h-4 text-emerald-600" />} accounts={data.assets.accounts} total={data.totalAssets} colorClass="emerald" />
      <AccountSectionTable title="بدهی‌ها" icon={<TrendingDown className="w-4 h-4 text-red-600" />} accounts={data.liabilities.accounts} total={data.totalLiabilities} colorClass="red" />
      <AccountSectionTable title="حقوق صاحبان سهام" icon={<Coins className="w-4 h-4 text-blue-600" />} accounts={data.equity.accounts} total={data.totalEquity} colorClass="blue" />

      <Card className="border-2 border-emerald-300 bg-gradient-to-l from-emerald-50/50 to-transparent">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-600 mb-1">جمع کل دارایی‌ها</p>
              <p className="text-lg font-bold text-emerald-700 font-mono" dir="ltr">{formatNumberFa(data.totalAssets)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600 mb-1">جمع بدهی‌ها + حقوق صاحبان سهام</p>
              <p className="text-lg font-bold text-blue-700 font-mono" dir="ltr">{formatNumberFa(data.totalLiabilitiesAndEquity)}</p>
            </div>
          </div>
          {data.uncategorized && data.uncategorized.accounts.length > 0 && (
            <p className="text-[10px] text-amber-600 text-center mt-3">
              ⚠ {toFaNum(data.uncategorized.accounts.length)} حساب نامشخص به حقوق صاحبان سهام اضافه شده است
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// helper برای جدول بخش‌های ترازنامه
function AccountSectionTable({
  title, icon, accounts, total, colorClass,
}: {
  title: string
  icon: React.ReactNode
  accounts: any[]
  total: number
  colorClass: 'emerald' | 'red' | 'blue'
}) {
  const colorMap = {
    emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    red:     { border: 'border-red-200',     bg: 'bg-red-50',     text: 'text-red-700',     badge: 'bg-red-100 text-red-700' },
    blue:    { border: 'border-blue-200',    bg: 'bg-blue-50',    text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700' },
  }
  const c = colorMap[colorClass]

  return (
    <Card className="border-gray-200">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
          <Badge className={`text-[9px] ${c.badge}`}>{toFaNum(accounts.length)} حساب</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {accounts.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">حسابی وجود ندارد</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs h-9">کد</TableHead>
                <TableHead className="text-xs h-9">نام حساب</TableHead>
                <TableHead className="text-xs h-9 text-left">مانده</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs font-mono" dir="ltr">{a.code}</TableCell>
                  <TableCell className="text-xs">{a.name}</TableCell>
                  <TableCell className={`text-xs font-mono text-left ${c.text}`}>{formatNumberFa(a.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className={`${c.bg} border-t-2 ${c.border}`}>
                <TableCell colSpan={2} className={`text-xs font-bold ${c.text}`}>جمع {title}</TableCell>
                <TableCell className={`text-xs font-bold font-mono text-left ${c.text}`}>{formatNumberFa(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
//  REPORT 11: Aging — سنین بدهی (پلن حرفه‌ای+)
// ============================================================================

function AgingReport() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOf, setAsOf] = useState<string>(todayGregorianISO())
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)

  const loadData = useCallback(async (asOfDate: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/aging?asOf=${asOfDate}`, { headers: getAuthHeaders() })
      const result = await res.json()
      if (result.success) setData(result.data)
      else setError(result.error || 'خطا در بارگذاری گزارش سنین بدهی')
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData(asOf) }, [loadData, asOf])

  if (loading) return <LoadingState message="در حال محاسبه سنین بدهی..." />
  if (error) return <ErrorState message={error} onRetry={() => loadData(asOf)} />
  if (!data) return null

  const bucketColors: Record<string, { bg: string; text: string; border: string; cell: string }> = {
    '0-30':  { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200',  cell: 'text-emerald-700' },
    '31-60': { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200',    cell: 'text-amber-700' },
    '61-90': { bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-200',   cell: 'text-orange-700' },
    '90+':   { bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-200',      cell: 'text-red-700' },
  }

  const handleExportExcel = () => {
    const rows = data.customers.map((c: any) => ({
      customerName: c.customerName,
      mobile: c.mobile || '',
      totalDebt: c.totalDebt,
      '0-30': c.buckets['0-30'],
      '31-60': c.buckets['31-60'],
      '61-90': c.buckets['61-90'],
      '90+': c.buckets['90+'],
      invoiceCount: c.invoiceCount,
    }))
    const meta: ReportMeta = {
      title: 'گزارش سنین بدهی',
      storeName: getStoreName(),
      filters: [{ label: 'تاریخ مرجع', value: formatJalaliLong(asOf) }],
      summary: [
        { label: 'کل بدهی', value: formatNumberFa(data.summary.totalDebt), color: 'red' },
        { label: 'تعداد مشتریان بدهکار', value: formatNumberFa(data.summary.customerCount), color: 'amber' },
        ...data.bucketRanges.map((b: any) => ({
          label: b.label, value: formatNumberFa(data.buckets[b.key].total), color: b.key === '90+' ? 'red' : (b.key === '61-90' ? 'amber' : 'green') as any,
        })),
      ],
      note: 'این گزارش بدهی مشتریان را بر اساس عمر بدهی دسته‌بندی می‌کند.',
    }
    const columns: ReportColumn[] = [
      { key: 'customerName', label: 'نام مشتری', align: 'right' },
      { key: 'mobile', label: 'موبایل', align: 'center' },
      { key: 'totalDebt', label: 'کل بدهی', isCurrency: true, align: 'left' },
      { key: '0-30', label: '۰-۳۰ روز', isCurrency: true, align: 'left' },
      { key: '31-60', label: '۳۱-۶۰ روز', isCurrency: true, align: 'left' },
      { key: '61-90', label: '۶۱-۹۰ روز', isCurrency: true, align: 'left' },
      { key: '90+', label: '۹۰+ روز', isCurrency: true, align: 'left' },
      { key: 'invoiceCount', label: 'تعداد فاکتور', isNumeric: true, align: 'center' },
    ]
    exportToExcel(meta, columns, rows, 'گزارش-سنین-بدهی')
  }

  const handlePrint = () => {
    const rows = data.customers.map((c: any) => ({
      customerName: c.customerName,
      mobile: c.mobile || '',
      totalDebt: c.totalDebt,
      '0-30': c.buckets['0-30'],
      '31-60': c.buckets['31-60'],
      '61-90': c.buckets['61-90'],
      '90+': c.buckets['90+'],
      invoiceCount: c.invoiceCount,
    }))
    const meta: ReportMeta = {
      title: 'گزارش سنین بدهی',
      storeName: getStoreName(),
      filters: [{ label: 'تاریخ مرجع', value: formatJalaliLong(asOf) }],
      summary: [
        { label: 'کل بدهی', value: formatNumberFa(data.summary.totalDebt), color: 'red' },
        { label: 'تعداد مشتریان بدهکار', value: formatNumberFa(data.summary.customerCount), color: 'amber' },
      ],
      note: 'این گزارش بدهی مشتریان را بر اساس عمر بدهی دسته‌بندی می‌کند.',
    }
    const columns: ReportColumn[] = [
      { key: 'customerName', label: 'نام مشتری', align: 'right' },
      { key: 'mobile', label: 'موبایل', align: 'center' },
      { key: 'totalDebt', label: 'کل بدهی', isCurrency: true, align: 'left' },
      { key: '0-30', label: '۰-۳۰ روز', isCurrency: true, align: 'left' },
      { key: '31-60', label: '۳۱-۶۰ روز', isCurrency: true, align: 'left' },
      { key: '61-90', label: '۶۱-۹۰ روز', isCurrency: true, align: 'left' },
      { key: '90+', label: '۹۰+ روز', isCurrency: true, align: 'left' },
    ]
    printReport(meta, columns, rows)
  }

  const hasData = data.customers.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            گزارش سنین بدهی
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            تاریخ مرجع: {formatJalaliLong(asOf)} • تعداد مشتریان بدهکار: {toFaNum(data.summary.customerCount)} • کل بدهی: {formatNumberFa(data.summary.totalDebt)} ریال
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 150 }}>
            <PersianDatePicker value={asOf} onChange={(iso) => setAsOf(iso || todayGregorianISO())} placeholder="تاریخ مرجع" size="sm" />
          </div>
          <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={!hasData} />
        </div>
      </div>

      {!hasData ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-emerald-700">هیچ بدهی ثبت نشده است</p>
          <p className="text-xs text-gray-600 mt-1">همه مشتریان تسویه هستند ✓</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.bucketRanges.map((b: any) => {
              const bucket = data.buckets[b.key]
              const colors = bucketColors[b.key]
              const isOverdue = b.key === '90+'
              return (
                <Card key={b.key} className={`border-2 ${colors.border} ${colors.bg}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      {isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                      <span className={`text-[10px] font-bold ${colors.text}`}>{b.label}</span>
                    </div>
                    <p className={`text-base font-bold font-mono ${colors.text}`}>{formatNumberFa(bucket.total)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{toFaNum(bucket.customerCount)} مشتری</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="border-gray-200">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-blue-600" />
                جزئیات به تفکیک مشتری
                <Badge className="text-[9px] bg-blue-100 text-blue-700">{toFaNum(data.customers.length)} مشتری</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-9">نام مشتری</TableHead>
                    <TableHead className="text-xs h-9 text-left">کل بدهی</TableHead>
                    <TableHead className="text-xs h-9 text-left">۰-۳۰ روز</TableHead>
                    <TableHead className="text-xs h-9 text-left">۳۱-۶۰ روز</TableHead>
                    <TableHead className="text-xs h-9 text-left">۶۱-۹۰ روز</TableHead>
                    <TableHead className="text-xs h-9 text-left">۹۰+ روز</TableHead>
                    <TableHead className="text-xs h-9 w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.customers.map((c: any) => (
                    <React.Fragment key={c.customerId}>
                      <TableRow
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedCustomer(expandedCustomer === c.customerId ? null : c.customerId)}
                      >
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <UserCircle className="w-3.5 h-3.5 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-800">{c.customerName}</p>
                              {c.mobile && <p className="text-[10px] text-gray-400" dir="ltr">{c.mobile}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-bold font-mono text-left text-gray-800">{formatNumberFa(c.totalDebt)}</TableCell>
                        <TableCell className={`text-xs font-mono text-left ${c.buckets['0-30'] > 0 ? bucketColors['0-30'].cell : 'text-gray-300'}`}>
                          {c.buckets['0-30'] > 0 ? formatNumberFa(c.buckets['0-30']) : '—'}
                        </TableCell>
                        <TableCell className={`text-xs font-mono text-left ${c.buckets['31-60'] > 0 ? bucketColors['31-60'].cell : 'text-gray-300'}`}>
                          {c.buckets['31-60'] > 0 ? formatNumberFa(c.buckets['31-60']) : '—'}
                        </TableCell>
                        <TableCell className={`text-xs font-mono text-left ${c.buckets['61-90'] > 0 ? bucketColors['61-90'].cell : 'text-gray-300'}`}>
                          {c.buckets['61-90'] > 0 ? formatNumberFa(c.buckets['61-90']) : '—'}
                        </TableCell>
                        <TableCell className={`text-xs font-mono text-left ${c.buckets['90+'] > 0 ? bucketColors['90+'].cell : 'text-gray-300'}`}>
                          {c.buckets['90+'] > 0 ? formatNumberFa(c.buckets['90+']) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          {expandedCustomer === c.customerId ? '▲' : '▼'}
                        </TableCell>
                      </TableRow>
                      {expandedCustomer === c.customerId && (
                        <TableRow className="bg-gray-50/50">
                          <TableCell colSpan={7} className="p-3">
                            <div className="space-y-2">
                              <p className="text-[11px] font-bold text-gray-700">فاکتورهای نسیه:</p>
                              {c.details.length === 0 ? (
                                <p className="text-[10px] text-gray-400">فاکتوری یافت نشد</p>
                              ) : (
                                <div className="space-y-1">
                                  {c.details.map((d: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[10px] bg-white rounded p-2 border border-gray-100">
                                      <div className="flex items-center gap-3">
                                        <span className="font-mono text-gray-500" dir="ltr">{d.invoiceNumber}</span>
                                        <span className="text-gray-600">تاریخ: {d.invoiceDate ? formatJalaliLong(d.invoiceDate) : '—'}</span>
                                        {d.dueDate && <span className="text-gray-600">سررسید: {formatJalaliLong(d.dueDate)}</span>}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-gray-500">سن: {toFaNum(d.ageDays)} روز</span>
                                        <Badge className={`text-[9px] ${bucketColors[d.bucket].bg} ${bucketColors[d.bucket].text} border-0`}>
                                          {data.bucketRanges.find((b: any) => b.key === d.bucket)?.label}
                                        </Badge>
                                        <span className="font-mono font-bold text-gray-800">{formatNumberFa(d.remainingAmount)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ============================================================================
//  REPORT 12: Sales Trend & Payment Analysis — روند فروش و تحلیل پرداخت
// ============================================================================

function SalesTrendAnalysisReport({ invoices, dashboardData }: { invoices: any[]; dashboardData: any }) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: daysAgoISO(90),
    to: todayGregorianISO(),
  })
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { setListVisible(false); setPage(1) }, [dateRange.from, dateRange.to])

  const monthlyTrend = useMemo(() => {
    const map: Record<string, { month: string; total: number; count: number; cash: number; credit: number }> = {}
    invoices.forEach((inv) => {
      if (getInvoiceStatus(inv) === 'CANCELLED') return
      const d = new Date(getInvoiceDate(inv))
      const iso = d.toISOString().split('T')[0]
      if (!iso || iso < dateRange.from || iso > dateRange.to) return

      const j = isoToJalali(iso)
      if (!j) return
      const key = `${j.jy}/${String(j.jm).padStart(2, '0')}`
      const monthLabel = `${JALALI_MONTHS[j.jm - 1]} ${toFaNum(j.jy)}`

      if (!map[key]) map[key] = { month: monthLabel, total: 0, count: 0, cash: 0, credit: 0 }
      const total = getInvoiceTotal(inv)
      map[key].total += total
      map[key].count++
      const pt = getInvoicePaymentType(inv)
      if (pt === 'Cash' || pt === 'cash') map[key].cash += total
      else map[key].credit += total
    })
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month))
  }, [invoices, dateRange.from, dateRange.to])

  const weekdayStats = useMemo(() => {
    const weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
    const stats: Record<string, { day: string; total: number; count: number; avg: number }> = {}
    weekdays.forEach((d) => stats[d] = { day: d, total: 0, count: 0, avg: 0 })

    invoices.forEach((inv) => {
      if (getInvoiceStatus(inv) === 'CANCELLED') return
      const d = new Date(getInvoiceDate(inv))
      const iso = d.toISOString().split('T')[0]
      if (!iso || iso < dateRange.from || iso > dateRange.to) return

      const jsDay = d.getDay()
      const persianDayIdx = (jsDay + 1) % 7
      const persianDayName = weekdays[persianDayIdx]

      stats[persianDayName].total += getInvoiceTotal(inv)
      stats[persianDayName].count++
    })

    return Object.values(stats).map((s) => ({
      ...s,
      avg: s.count > 0 ? Math.round(s.total / s.count) : 0,
    }))
  }, [invoices, dateRange.from, dateRange.to])

  const paymentBreakdown = useMemo(() => {
    const map: Record<string, { name: string; label: string; value: number; count: number; color: string }> = {}
    invoices.forEach((inv) => {
      if (getInvoiceStatus(inv) === 'CANCELLED') return
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d || d < dateRange.from || d > dateRange.to) return

      const pt = getInvoicePaymentType(inv)
      const label = PAYMENT_LABELS_FA[pt] || pt
      if (!map[pt]) {
        map[pt] = {
          name: pt,
          label,
          value: 0,
          count: 0,
          color: PAYMENT_COLORS[pt] || '#64748b',
        }
      }
      map[pt].value += getInvoiceTotal(inv)
      map[pt].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [invoices, dateRange.from, dateRange.to])

  const totalSales = monthlyTrend.reduce((s, m) => s + m.total, 0)
  const totalCount = monthlyTrend.reduce((s, m) => s + m.count, 0)
  const avgInvoice = totalCount > 0 ? Math.round(totalSales / totalCount) : 0

  const lastTwoMonths = monthlyTrend.slice(-2)
  const growthRate = lastTwoMonths.length === 2 && lastTwoMonths[0].total > 0
    ? Math.round(((lastTwoMonths[1].total - lastTwoMonths[0].total) / lastTwoMonths[0].total) * 100)
    : 0

  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`

  const chartMonthlyData = monthlyTrend.map((m) => ({
    name: m.month,
    'فروش کل': m.total,
    'فروش نقدی': m.cash,
    'فروش نسیه': m.credit,
  }))

  const pieData = paymentBreakdown.map((p) => ({
    name: p.label,
    value: p.value,
    count: p.count,
    color: p.color,
  }))

  const weekdayChartData = weekdayStats.map((w) => ({
    name: w.day,
    'میانگین فاکتور': w.avg,
    'تعداد': w.count,
  }))

  const paginatedMonthlyTrend = paginate(monthlyTrend, page)

  const handleExportExcel = () => {
    const meta: ReportMeta = {
      title: 'گزارش روند فروش و تحلیل پرداخت',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'فروش کل', value: formatNumberFa(totalSales), color: 'green' },
        { label: 'تعداد فاکتور', value: formatNumberFa(totalCount), color: 'gray' },
        { label: 'میانگین فاکتور', value: formatNumberFa(avgInvoice), color: 'blue' },
        { label: 'نرخ رشد ماهانه', value: `${toFaNum(growthRate)}٪`, color: growthRate >= 0 ? 'green' : 'red' },
      ],
      note: 'این گزارش تحلیلی شامل روند ماهانه فروش، توزیع روش‌های پرداخت و الگوهای روز هفته است.',
    }
    const columns: ReportColumn[] = [
      { key: 'month', label: 'ماه', align: 'right' },
      { key: 'count', label: 'تعداد فاکتور', isNumeric: true, align: 'center' },
      { key: 'cash', label: 'فروش نقدی', isCurrency: true, align: 'left' },
      { key: 'credit', label: 'فروش نسیه', isCurrency: true, align: 'left' },
      { key: 'total', label: 'فروش کل', isCurrency: true, align: 'left' },
    ]
    const rows = monthlyTrend.map((m) => ({
      month: m.month, count: m.count, cash: m.cash, credit: m.credit, total: m.total,
    }))
    exportToExcel(meta, columns, rows, 'گزارش-روند-فروش')
  }

  const handlePrint = () => {
    const meta: ReportMeta = {
      title: 'گزارش روند فروش و تحلیل پرداخت',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'فروش کل', value: formatNumberFa(totalSales), color: 'green' },
        { label: 'تعداد فاکتور', value: formatNumberFa(totalCount), color: 'gray' },
        { label: 'میانگین فاکتور', value: formatNumberFa(avgInvoice), color: 'blue' },
        { label: 'نرخ رشد ماهانه', value: `${toFaNum(growthRate)}٪`, color: growthRate >= 0 ? 'green' : 'red' },
      ],
      note: 'این گزارش تحلیلی شامل روند ماهانه فروش، توزیع روش‌های پرداخت و الگوهای روز هفته است.',
    }
    const columns: ReportColumn[] = [
      { key: 'month', label: 'ماه', align: 'right' },
      { key: 'count', label: 'تعداد فاکتور', isNumeric: true, align: 'center' },
      { key: 'cash', label: 'فروش نقدی', isCurrency: true, align: 'left' },
      { key: 'credit', label: 'فروش نسیه', isCurrency: true, align: 'left' },
      { key: 'total', label: 'فروش کل', isCurrency: true, align: 'left' },
    ]
    const rows = monthlyTrend.map((m) => ({
      month: m.month, count: m.count, cash: m.cash, credit: m.credit, total: m.total,
    }))
    printReport(meta, columns, rows)
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <PersianDateRangePicker value={dateRange} onChange={setDateRange} />
        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={monthlyTrend.length === 0} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="فروش کل" value={totalSales} icon={<Wallet className="w-4 h-4" />} color="emerald" suffix="تومان" />
        <StatCard label="تعداد فاکتور" value={totalCount} icon={<FileText className="w-4 h-4" />} color="gray" dir="rtl" />
        <StatCard label="میانگین فاکتور" value={avgInvoice} icon={<Activity className="w-4 h-4" />} color="blue" suffix="تومان" />
        <StatCard
          label="نرخ رشد ماهانه"
          value={`${toFaNum(growthRate)}٪`}
          icon={growthRate >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          color={growthRate >= 0 ? 'emerald' : 'red'}
          dir="ltr"
          hint={lastTwoMonths.length === 2 ? `${lastTwoMonths[0].month} → ${lastTwoMonths[1].month}` : ''}
        />
      </div>

      <ChartCard
        title="روند ماهانه فروش (نقدی / نسیه)"
        icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
      >
        {chartMonthlyData.length === 0 ? (
          <EmptyState message="داده‌ای در این بازه موجود نیست" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartMonthlyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#047857" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#047857" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCredit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => toFaNum(Math.round(v / 1000)) + 'k'} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <Tooltip content={<PersianChartTooltip formatter={(v: number) => formatNumberFa(v) + ' تومان'} />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Tahoma' }} />
              <Area type="monotone" dataKey="فروش کل" stroke="#047857" strokeWidth={2.5} fill="url(#colorTotal)" />
              <Area type="monotone" dataKey="فروش نقدی" stroke="#10b981" strokeWidth={1.5} fill="url(#colorCash)" />
              <Area type="monotone" dataKey="فروش نسیه" stroke="#f59e0b" strokeWidth={1.5} fill="url(#colorCredit)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="توزیع روش‌های پرداخت" icon={<PieIcon className="w-4 h-4 text-purple-600" />}>
          {pieData.length === 0 ? (
            <EmptyState message="داده‌ای موجود نیست" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} label={(entry: any) => `${entry.name}: ${toFaNum(Math.round(entry.percent))}٪`}>
                  {pieData.map((entry: any, idx: number) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PersianChartTooltip formatter={(v: number) => formatNumberFa(v) + ' تومان'} />} />
              </PieChart>
            </ResponsiveContainer>
          )}

          {pieData.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {pieData.map((p, idx) => {
                const total = pieData.reduce((s, x) => s + x.value, 0)
                const percent = total > 0 ? Math.round((p.value / total) * 100) : 0
                return (
                  <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-gray-700">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{toFaNum(p.count)} فاکتور</span>
                      <span className="font-bold text-gray-800" dir="ltr">{toFaNum(percent)}٪</span>
                      <span className="text-emerald-600 font-mono" dir="ltr">{formatNumberFa(p.value)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard title="الگوی فروش بر اساس روز هفته" icon={<Calendar className="w-4 h-4 text-blue-600" />}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekdayChartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => toFaNum(Math.round(v / 1000)) + 'k'} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <Tooltip content={<PersianChartTooltip formatter={(v: number, name: string) => name === 'تعداد' ? toFaNum(v) : formatNumberFa(v) + ' تومان'} />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Tahoma' }} />
              <Bar yAxisId="left" dataKey="میانگین فاکتور" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="تعداد" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-600">جزئیات روند ماهانه</p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={monthlyTrend.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده رکوردها، دکمه «نمایش لیست» را بزنید" />
          ) : monthlyTrend.length === 0 ? (
            <EmptyState message="داده‌ای موجود نیست" />
          ) : (
            <div className="overflow-x-auto -mx-3 sm:-mx-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs whitespace-nowrap">ماه</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">تعداد فاکتور</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">فروش نقدی</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">فروش نسیه</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">فروش کل</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">میانگین فاکتور</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedMonthlyTrend.map((m, idx) => (
                    <TableRow key={idx} className="hover:bg-emerald-50/50">
                      <TableCell className="text-xs sm:text-sm font-medium whitespace-nowrap">{m.month}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatNumberFa(m.count)}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-emerald-600 whitespace-nowrap" dir="ltr">{formatNumberFa(m.cash)}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-amber-600 whitespace-nowrap" dir="ltr">{formatNumberFa(m.credit)}</TableCell>
                      <TableCell className="text-xs sm:text-sm font-bold whitespace-nowrap" dir="ltr">{formatNumberFa(m.total)}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-gray-600 whitespace-nowrap" dir="ltr">{m.count > 0 ? formatNumberFa(Math.round(m.total / m.count)) : '۰'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={monthlyTrend.length} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  REPORT 13: Branch Consolidated — گزارش تلفیقی شعب (پلن سازمانی)
// ============================================================================

function BranchConsolidatedReport({ tier, invoices, dateRange }: { tier: PlanTier; invoices: any[]; dateRange: DateRange }) {
  const [branches, setBranches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [listVisible, setListVisible] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { setListVisible(false); setPage(1) }, [dateRange.from, dateRange.to])

  useEffect(() => {
    fetchBranchesApi().then((b) => {
      setBranches(b)
      setLoading(false)
    })
  }, [])

  const branchStats = useMemo(() => {
    const map: Record<string, { id: string; name: string; total: number; count: number; cash: number; credit: number }> = {}

    if (branches.length === 0) {
      map['main'] = { id: 'main', name: 'شعبه مرکزی (پیش‌فرض)', total: 0, count: 0, cash: 0, credit: 0 }
    } else {
      branches.forEach((b) => {
        map[b.id] = { id: b.id, name: b.name, total: 0, count: 0, cash: 0, credit: 0 }
      })
    }

    invoices.forEach((inv) => {
      if (getInvoiceStatus(inv) === 'CANCELLED') return
      const d = new Date(getInvoiceDate(inv)).toISOString().split('T')[0]
      if (!d || d < dateRange.from || d > dateRange.to) return

      const branchId = inv.branchId || 'main'
      if (!map[branchId]) {
        const fallbackName = branchId === 'main' ? 'شعبه مرکزی (پیش‌فرض)' : `شعبه ${branchId}`
        map[branchId] = { id: branchId, name: inv.branchName || fallbackName, total: 0, count: 0, cash: 0, credit: 0 }
      }
      
      const total = getInvoiceTotal(inv)
      map[branchId].total += total
      map[branchId].count++
      const pt = getInvoicePaymentType(inv)
      if (pt === 'Cash' || pt === 'cash') map[branchId].cash += total
      else map[branchId].credit += total
    })

    return Object.values(map).filter((s) => s.count > 0).sort((a, b) => b.total - a.total)
  }, [invoices, branches, dateRange.from, dateRange.to])

  const grandTotal = branchStats.reduce((s, b) => s + b.total, 0)
  const grandCash = branchStats.reduce((s, b) => s + b.cash, 0)
  const grandCredit = branchStats.reduce((s, b) => s + b.credit, 0)
  const totalCount = branchStats.reduce((s, b) => s + b.count, 0)
  const periodText = `${formatJalaliLong(dateRange.from)} تا ${formatJalaliLong(dateRange.to)}`

  const paginatedBranchStats = paginate(branchStats, page)

  const chartData = branchStats.map((b) => ({
    name: b.name,
    'فروش نقدی': b.cash,
    'فروش نسیه': b.credit,
  }))

  const handleExportExcel = () => {
    const meta: ReportMeta = {
      title: 'گزارش تلفیقی شعب',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'تعداد شعب فعال', value: formatNumberFa(branchStats.length), color: 'blue' },
        { label: 'تعداد فاکتور', value: formatNumberFa(totalCount), color: 'gray' },
        { label: 'فروش نقدی', value: formatNumberFa(grandCash), color: 'green' },
        { label: 'فروش کل', value: formatNumberFa(grandTotal), color: 'green' },
      ],
      note: 'این گزارش مقایسه عملکرد شعب مختلف سازمان را نشان می‌دهد.',
    }
    const columns: ReportColumn[] = [
      { key: 'name', label: 'نام شعبه', align: 'right' },
      { key: 'count', label: 'تعداد فاکتور', isNumeric: true, align: 'center' },
      { key: 'cash', label: 'فروش نقدی', isCurrency: true, align: 'left' },
      { key: 'credit', label: 'فروش نسیه', isCurrency: true, align: 'left' },
      { key: 'total', label: 'فروش کل', isCurrency: true, align: 'left' },
      { key: 'share', label: 'سهم از کل', align: 'center' },
    ]
    const rows = branchStats.map((b) => ({
      name: b.name,
      count: b.count,
      cash: b.cash,
      credit: b.credit,
      total: b.total,
      share: `${toFaNum(grandTotal > 0 ? Math.round((b.total / grandTotal) * 100) : 0)}٪`,
    }))
    exportToExcel(meta, columns, rows, 'گزارش-تلفیقی-شعب')
  }

  const handlePrint = () => {
    const meta: ReportMeta = {
      title: 'گزارش تلفیقی شعب',
      storeName: getStoreName(),
      period: periodText,
      summary: [
        { label: 'تعداد شعب فعال', value: formatNumberFa(branchStats.length), color: 'blue' },
        { label: 'تعداد فاکتور', value: formatNumberFa(totalCount), color: 'gray' },
        { label: 'فروش نقدی', value: formatNumberFa(grandCash), color: 'green' },
        { label: 'فروش کل', value: formatNumberFa(grandTotal), color: 'green' },
      ],
      note: 'این گزارش مقایسه عملکرد شعب مختلف سازمان را نشان می‌دهد.',
    }
    const columns: ReportColumn[] = [
      { key: 'name', label: 'نام شعبه', align: 'right' },
      { key: 'count', label: 'تعداد فاکتور', isNumeric: true, align: 'center' },
      { key: 'cash', label: 'فروش نقدی', isCurrency: true, align: 'left' },
      { key: 'credit', label: 'فروش نسیه', isCurrency: true, align: 'left' },
      { key: 'total', label: 'فروش کل', isCurrency: true, align: 'left' },
      { key: 'share', label: 'سهم از کل', align: 'center' },
    ]
    const rows = branchStats.map((b) => ({
      name: b.name,
      count: b.count,
      cash: b.cash,
      credit: b.credit,
      total: b.total,
      share: `${toFaNum(grandTotal > 0 ? Math.round((b.total / grandTotal) * 100) : 0)}٪`,
    }))
    printReport(meta, columns, rows)
  }

  if (loading) return <LoadingState message="در حال بارگذاری شعب..." />

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
          <Building2 className="w-3 h-3 ml-1" />
          گزارش تلفیقی — پلن {TIER_LABELS[tier]}
        </Badge>
      </div>

      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <PersianDateRangePicker value={dateRange} onChange={() => { /* controlled by parent */ }} />
        <ReportActions onExportExcel={handleExportExcel} onPrint={handlePrint} disabled={branchStats.length === 0} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="تعداد شعب فعال" value={branchStats.length} icon={<Building2 className="w-4 h-4" />} color="purple" dir="rtl" />
        <StatCard label="تعداد فاکتور" value={totalCount} icon={<FileText className="w-4 h-4" />} color="gray" dir="rtl" />
        <StatCard label="فروش نقدی" value={grandCash} icon={<Banknote className="w-4 h-4" />} color="emerald" suffix="تومان" />
        <StatCard label="فروش کل" value={grandTotal} icon={<Wallet className="w-4 h-4" />} color="teal" suffix="تومان" />
      </div>

      {chartData.length > 0 && (
        <ChartCard title="مقایسه فروش شعب" icon={<BarChart3 className="w-4 h-4 text-purple-600" />}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => toFaNum(Math.round(v / 1000)) + 'k'} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <Tooltip content={<PersianChartTooltip formatter={(v: number) => formatNumberFa(v) + ' تومان'} />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Tahoma' }} />
              <Bar dataKey="فروش نقدی" stackId="a" fill="#10b981" />
              <Bar dataKey="فروش نسیه" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-600">لیست عملکرد شعب</p>
            <ShowListButton
              onClick={() => setListVisible((v) => !v)}
              visible={listVisible}
              totalCount={branchStats.length}
            />
          </div>

          {!listVisible ? (
            <EmptyListPlaceholder message="برای مشاهده رکوردها، دکمه «نمایش لیست» را بزنید" />
          ) : branchStats.length === 0 ? (
            <EmptyState message="داده‌ای برای شعب یافت نشد" icon={<Building2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />} />
          ) : (
            <div className="overflow-x-auto -mx-3 sm:-mx-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs whitespace-nowrap">نام شعبه</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">تعداد فاکتور</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">فروش نقدی</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">فروش نسیه</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">فروش کل</TableHead>
                    <TableHead className="text-right text-xs whitespace-nowrap">سهم از کل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBranchStats.map((b) => {
                    const share = grandTotal > 0 ? Math.round((b.total / grandTotal) * 100) : 0
                    return (
                      <TableRow key={b.id} className="hover:bg-purple-50/50">
                        <TableCell className="text-xs sm:text-sm font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-purple-400" />
                            {b.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatNumberFa(b.count)}</TableCell>
                        <TableCell className="text-xs sm:text-sm text-emerald-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(b.cash)}</TableCell>
                        <TableCell className="text-xs sm:text-sm text-amber-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(b.credit)}</TableCell>
                        <TableCell className="text-xs sm:text-sm font-bold whitespace-nowrap" dir="ltr">{formatNumberFa(b.total)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs font-bold text-purple-700" dir="ltr">{toFaNum(share)}٪</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="bg-purple-50 border-t-2 border-purple-200 font-bold">
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">جمع کل</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatNumberFa(totalCount)}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-emerald-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(grandCash)}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-amber-600 whitespace-nowrap hidden sm:table-cell" dir="ltr">{formatNumberFa(grandCredit)}</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap" dir="ltr">{formatNumberFa(grandTotal)}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-purple-700 whitespace-nowrap" dir="ltr">۱۰۰٪</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <Pagination page={page} total={branchStats.length} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
//  Main Reports Page
// ============================================================================

type ReportType =
  | 'dashboard-overview'
  | 'daily-sales'
  | 'customer-statement'
  | 'profit-loss'
  | 'inventory'
  | 'inventory-advanced'
  | 'vat'
  | 'cashier-performance'
  | 'installments'
  | 'balance-sheet'
  | 'aging'
  | 'sales-trend'
  | 'branch-consolidated'
  | null

interface ReportMetaInfo {
  id: ReportType
  title: string
  description: string
  icon: any
  color: string
  minTier: PlanTier
  requiresInstallments?: boolean
  category: 'overview' | 'sales' | 'financial' | 'analytics' | 'enterprise'
}

const REPORT_DEFINITIONS: ReportMetaInfo[] = [
  {
    id: 'dashboard-overview',
    title: 'داشبورد خلاصه',
    description: 'نمای کلی از وضعیت فروشگاه با KPIها و نمودارهای تحلیلی',
    icon: LayoutDashboard,
    color: 'bg-emerald-100 text-emerald-600',
    minTier: 'basic',
    category: 'overview',
  },
  {
    id: 'daily-sales',
    title: 'فروش روزانه',
    description: 'گزارش جامع فروش به تفکیک روز با لیست فاکتورها و کالاهای فروخته شده',
    icon: BarChart3,
    color: 'bg-emerald-100 text-emerald-600',
    minTier: 'basic',
    category: 'sales',
  },
  {
    id: 'customer-statement',
    title: 'گردش حساب مشتری',
    description: 'صورت‌حساب تفصیلی مشتریان با تراکنش‌های فاکتور و پرداخت',
    icon: UserCircle,
    color: 'bg-cyan-100 text-cyan-600',
    minTier: 'basic',
    category: 'sales',
  },
  {
    id: 'profit-loss',
    title: 'سود و زیان',
    description: 'گزارش ساده درآمد و هزینه (تک‌دفتری) — پلن ساده',
    icon: Scale,
    color: 'bg-blue-100 text-blue-600',
    minTier: 'basic',
    category: 'financial',
  },
  {
    id: 'inventory',
    title: 'موجودی کالاها',
    description: 'گزارش کامل موجودی انبار با ارزش‌گذاری و کالاهای رو به اتمام',
    icon: Package,
    color: 'bg-indigo-100 text-indigo-600',
    minTier: 'basic',
    category: 'sales',
  },
  {
    id: 'inventory-advanced',
    title: 'گزارش‌های انبارداری',
    description: 'موجودی هر انبار، حرکت کالا، ارزش انبار و کالاهای کم‌موجود',
    icon: Package,
    color: 'bg-purple-100 text-purple-600',
    minTier: 'professional',
    category: 'analytics',
  },
  {
    id: 'vat',
    title: 'مالیات بر ارزش افزوده',
    description: 'گزارش جامع مالیات فروش و تخفیف‌ها',
    icon: Percent,
    color: 'bg-pink-100 text-pink-600',
    minTier: 'basic',
    category: 'financial',
  },
  {
    id: 'profit-loss',
    title: 'صورت سود و زیان با COGS',
    description: 'صورت سود و زیان با بهای تمام شده واقعی (میانگین وزنی) + نمودار روند و محصول برتر',
    icon: Scale,
    color: 'bg-emerald-100 text-emerald-600',
    minTier: 'professional',
    category: 'financial',
  },
  {
    id: 'cashier-performance',
    title: 'عملکرد صندوق‌دار',
    description: 'بررسی عملکرد صندوق‌داران فروشگاه با نمودار مقایسه‌ای',
    icon: UserCheck,
    color: 'bg-teal-100 text-teal-600',
    minTier: 'professional',
    category: 'sales',
  },
  {
    id: 'installments',
    title: 'گزارش اقساط',
    description: 'وضعیت اقساط و سررسیدها با فیلتر وضعیت',
    icon: CalendarClock,
    color: 'bg-amber-100 text-amber-600',
    minTier: 'professional',
    requiresInstallments: true,
    category: 'financial',
  },
  {
    id: 'balance-sheet',
    title: 'ترازنامه',
    description: 'گزارش وضعیت دارایی‌ها، بدهی‌ها و حقوق صاحبان سهام',
    icon: BookOpen,
    color: 'bg-purple-100 text-purple-600',
    minTier: 'professional',
    category: 'financial',
  },
  {
    id: 'aging',
    title: 'سنین بدهی',
    description: 'دسته‌بندی بدهی مشتریان بر اساس عمر بدهی (۰-۳۰ / ۳۱-۶۰ / ۶۱-۹۰ / ۹۰+ روز)',
    icon: Clock,
    color: 'bg-rose-100 text-rose-600',
    minTier: 'professional',
    category: 'financial',
  },
  {
    id: 'sales-trend',
    title: 'روند فروش و تحلیل پرداخت',
    description: 'تحلیل پیشرفته روند ماهانه فروش، توزیع روش‌های پرداخت و الگوهای روز هفته',
    icon: Activity,
    color: 'bg-blue-100 text-blue-600',
    minTier: 'professional',
    category: 'analytics',
  },
  {
    id: 'branch-consolidated',
    title: 'گزارش تلفیقی شعب',
    description: 'مقایسه عملکرد شعب مختلف سازمان با نمودار و درصد سهم',
    icon: Building2,
    color: 'bg-purple-100 text-purple-600',
    minTier: 'enterprise',
    category: 'enterprise',
  },
]

// ★ فیلتر کردن گزارش‌ها بر اساس پلن فعلی (مخفی کردن کامل گزارش‌های غیرفعال)
function getAccessibleReports(tier: PlanTier, features: PlanFeatureSet): ReportMetaInfo[] {
  return REPORT_DEFINITIONS.filter((r) => {
    if (!isPlanAtLeast(tier, r.minTier)) return false
    if (r.requiresInstallments && !features.canAccessInstallments) return false
    return true
  })
}

// ★ گروه‌بندی گزارش‌ها بر اساس دسته
const CATEGORY_LABELS: Record<ReportMetaInfo['category'], { label: string; color: string; icon: any }> = {
  overview:   { label: 'نمای کلی',     color: 'emerald', icon: LayoutDashboard },
  sales:      { label: 'گزارش‌های فروش', color: 'blue',    icon: BarChart3 },
  financial:  { label: 'گزارش‌های مالی', color: 'purple',  icon: Scale },
  analytics:  { label: 'تحلیل‌ها',      color: 'teal',    icon: Activity },
  enterprise: { label: 'سازمانی',       color: 'purple',  icon: Building2 },
}

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>(null)
  const [sharedDateRange, setSharedDateRange] = useState<DateRange>({
    from: firstDayOfCurrentJalaliMonthISO(),
    to: todayGregorianISO(),
  })

  const planName = useAppStore((s) => s.planName)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const features: PlanFeatureSet = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const plan = useMemo(() => resolvePlan(planName), [planName])
  const tier = plan.tier

  const [invoices, setInvoices] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [installmentPlans, setInstallmentPlans] = useState<any[]>([])
  const [journalEntries, setJournalEntries] = useState<any[]>([])
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  const loadReportData = useCallback(async (reportId: ReportType) => {
    const tenantId = getTenantIdFromStore()
    if (!tenantId) return

    setReportLoading(true)
    try {
      const needsInvoices = ['daily-sales', 'customer-statement', 'profit-loss', 'cashier-performance', 'sales-trend', 'branch-consolidated'].includes(reportId || '')
      const needsCustomers = ['customer-statement'].includes(reportId || '')
      const needsJournal = (tier === 'basic') && ['profit-loss'].includes(reportId || '')
      const needsInstallments = ['installments'].includes(reportId || '')

      const promises: Promise<any>[] = []
      if (needsInvoices && invoices.length === 0) promises.push(fetchInvoicesApi(tenantId).then(setInvoices))
      if (needsCustomers && customers.length === 0) promises.push(fetchCustomersApi(tenantId).then(setCustomers))
      if (needsJournal && journalEntries.length === 0) promises.push(fetchJournalEntriesApi(tenantId).then(setJournalEntries))
      if (needsInstallments && features.canAccessInstallments && installmentPlans.length === 0) {
        promises.push(fetchInstallmentPlansApi(tenantId).then(setInstallmentPlans))
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }
    } catch (err: any) {
      console.error('[Reports] loadReportData error:', err)
    }
    setReportLoading(false)
  }, [invoices.length, customers.length, journalEntries.length, installmentPlans.length, features.canAccessInstallments])

  useEffect(() => {
    if (activeReport) {
      loadReportData(activeReport)
    }
  }, [activeReport, loadReportData])

  const accessibleReports = useMemo(() => getAccessibleReports(tier, features), [tier, features])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const tenantId = getTenantIdFromStore()
    if (!tenantId) {
      setError('tenant در دسترس نیست. لطفاً دوباره وارد شوید.')
      setLoading(false)
      return
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      console.warn('[Reports] حالت آفلاین: بارگذاری آمار متوقف شد')
      setDashboardData(null)
      setLoading(false)
      return
    }

    try {
      const dash = await fetchDashboardStatsApi()
      setDashboardData(dash)
    } catch (err: any) {
      console.error('[Reports] loadData error:', err)

      if (err?.message?.includes('fetch') || (typeof window !== 'undefined' && !navigator.onLine)) {
        console.warn('[Reports] خطای شبکه. ادامه کار در حالت آفلاین.')
        setDashboardData(null)
      } else {
        setError(err?.message || 'خطا در بارگذاری داده‌ها')
      }
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { loadData() }, [loadData])

  const reportsByCategory = useMemo<Record<string, ReportMetaInfo[]>>(() => {
    const grouped: Record<string, ReportMetaInfo[]> = {}
    accessibleReports.forEach((r) => {
      const key = r.category
      if (!grouped[key]) grouped[key] = []
      const exists = grouped[key].some((x) => x.id === r.id)
      if (!exists) {
        let displayReport: ReportMetaInfo = r
        if (false) {
          displayReport = { ...r, title: 'سود و زیان (ساده)', description: 'گزارش ساده درآمد و هزینه (تک‌دفتری)' }
        } else if (r.id === 'profit-loss' && tier !== 'basic') {
          displayReport = { ...r, title: 'صورت سود و زیان استاندارد', description: 'صورت سود و زیان استاندارد با تفکیک بخش‌های درآمد، هزینه و سود' }
        }
        grouped[key].push(displayReport)
      }
    })
    return grouped
  }, [accessibleReports, tier])

  const onUpgrade = () => setCurrentView('settings-subscription')

  const activeReportInfo = REPORT_DEFINITIONS.find((r) => r.id === activeReport)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-emerald-50/30 p-3 sm:p-4 md:p-6" dir="rtl">
      {/* هدر صفحه */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3 mb-2">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">مرکز گزارش‌ها</h1>
            <p className="text-[10px] sm:text-sm text-gray-500">
              دسترسی به انواع گزارش‌های فروشگاهی بر اساس پلن فعلی شما
              <span className="mr-2 text-emerald-600">•</span>
              <span className="mr-1">پلن: <Badge variant="outline" className={`text-[10px] mx-1 ${TIER_COLORS[tier].bg} ${TIER_COLORS[tier].text} ${TIER_COLORS[tier].border}`}>{plan.label}</Badge></span>
              <span className="mr-2 text-gray-300">•</span>
              <span className="mr-1">{formatNumberFa(invoices.length)} فاکتور</span>
            </p>
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 mb-4">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs text-red-700 flex-1">{error}</p>
            <Button size="sm" variant="outline" className="text-xs" onClick={loadData}>تلاش مجدد</Button>
          </CardContent>
        </Card>
      )}

      {!activeReport ? (
        /* لیست گزارش‌ها */
        <div className="space-y-5 sm:space-y-6">
          {Object.entries(reportsByCategory).map(([catKey, reports]: [string, ReportMetaInfo[]]) => {
            if (reports.length === 0) return null
            const cat = CATEGORY_LABELS[catKey as ReportMetaInfo['category']]
            const CatIcon = cat.icon
            return (
              <div key={catKey}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-1 h-5 rounded bg-${cat.color}-600`} />
                  <CatIcon className={`w-4 h-4 text-${cat.color}-600`} />
                  <h2 className="text-xs sm:text-sm font-bold text-gray-700">{cat.label}</h2>
                  <Badge variant="outline" className={`text-[10px] bg-${cat.color}-50 text-${cat.color}-700 border-${cat.color}-200`}>
                    {formatNumberFa(reports.length)} گزارش
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                  {reports.map((report) => {
                    const Icon = report.icon
                    return (
                      <Card
                        key={`${report.id}-${report.minTier}`}
                        className="border-gray-200 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-500/10 transition-all cursor-pointer group overflow-hidden"
                        onClick={() => setActiveReport(report.id)}
                      >
                        <CardContent className="p-3 sm:p-3.5 relative">
                          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 to-emerald-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                          <div className="flex items-start gap-2.5 relative">
                            <div className={`w-9 h-9 rounded-lg ${report.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-xs sm:text-sm font-bold text-gray-900 mb-0.5 group-hover:text-emerald-700 transition-colors leading-tight">{report.title}</h3>
                              <p className="text-[10px] sm:text-[11px] text-gray-500 leading-snug line-clamp-2">{report.description}</p>
                            </div>
                            <ArrowLeft className="w-3.5 h-3.5 text-gray-300 group-hover:text-emerald-500 group-hover:-translate-x-1 transition-all mt-0.5 shrink-0" />
                          </div>
                          {report.minTier !== 'basic' && (
                            <div className="mt-2 pt-2 border-t border-gray-100 relative">
                              <Badge variant="outline" className={`text-[8px] ${TIER_COLORS[report.minTier].bg} ${TIER_COLORS[report.minTier].text} ${TIER_COLORS[report.minTier].border}`}>
                                <Crown className="w-2 h-2 ml-0.5" />
                                {TIER_LABELS[report.minTier]}
                              </Badge>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {accessibleReports.length === 0 && !loading && (
            <Card className="border-gray-200">
              <CardContent className="p-12 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">گزارشی برای پلن فعلی شما در دسترس نیست.</p>
                <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={onUpgrade}>
                  <Crown className="w-3.5 h-3.5 ml-1" />
                  ارتقا به پلن بالاتر
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* نمایش گزارش فعال */
        <div>
          {/* نوار بالا: بازگشت + عنوان گزارش + انتخابگر بازه مشترک */}
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6 pb-3 border-b border-gray-200 w-full">
            <div className="flex items-center gap-3 shrink-0 z-10">
              <Button variant="ghost" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 -mr-2 text-xs sm:text-sm gap-1" onClick={() => setActiveReport(null)}>
                <ArrowRight className="w-4 h-4" />
                بازگشت
              </Button>
              <div className="flex items-center gap-2">
                {activeReportInfo && (
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg ${activeReportInfo.color} flex items-center justify-center`}>
                    <activeReportInfo.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                )}
                <div>
                  <h2 className="text-sm sm:text-lg font-bold text-gray-900 whitespace-nowrap">{activeReportInfo?.title}</h2>
                  <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">{activeReportInfo?.description}</p>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
              {(activeReport === 'cashier-performance' || activeReport === 'installments' || activeReport === 'branch-consolidated') && (
                <PersianDateRangePicker value={sharedDateRange} onChange={setSharedDateRange} size="sm" />
              )}
            </div>

            <div className="sm:hidden w-full flex justify-center mt-1">
              {(activeReport === 'cashier-performance' || activeReport === 'installments' || activeReport === 'branch-consolidated') && (
                <PersianDateRangePicker value={sharedDateRange} onChange={setSharedDateRange} size="sm" />
              )}
            </div>

            <div className="hidden sm:block w-[150px] shrink-0"></div>
          </div>

          {loading ? (
            <LoadingState message="در حال بارگذاری داده‌ها..." />
          ) : reportLoading ? (
            <LoadingState message="در حال آماده‌سازی داده‌های گزارش..." />
          ) : (
            <>
              {activeReport === 'dashboard-overview' && (
                <DashboardOverviewReport tier={tier} dashboardData={dashboardData} />
              )}
              {activeReport === 'daily-sales' && (
                <DailySalesReport invoices={invoices} />
              )}
              {activeReport === 'customer-statement' && (
                <CustomerStatementReport invoices={invoices} customers={customers} />
              )}
              {activeReport === 'profit-loss' && (
                <ProfitLossReport tier={tier} />
              )}
              {activeReport === 'inventory' && <InventoryReport />}
              {activeReport === 'inventory-advanced' && <InventoryAdvancedReport />}
              {activeReport === 'vat' && <VATReport />}
              {activeReport === 'cashier-performance' && (
                <CashierPerformanceReport invoices={invoices} dateRange={sharedDateRange} />
              )}
              {activeReport === 'installments' && (
                <InstallmentReport plans={installmentPlans} dateRange={sharedDateRange} />
              )}
              {activeReport === 'balance-sheet' && <BalanceSheetV8Report tier={tier} />}
              {activeReport === 'aging' && <AgingReport />}
              {activeReport === 'sales-trend' && (
                <SalesTrendAnalysisReport invoices={invoices} dashboardData={dashboardData} />
              )}
              {activeReport === 'branch-consolidated' && (
                <BranchConsolidatedReport tier={tier} invoices={invoices} dateRange={sharedDateRange} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

