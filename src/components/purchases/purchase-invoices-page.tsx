// src/components/purchases/purchase-invoices-page.tsx
// ============================================================================
// ★ v8.8.10: رسپانسیو کامل (موبایل + تبلت + دسکتاپ) + آفلاین بهبودیافته
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ShoppingCart, Plus, Search, Loader2, Trash2, Package, Building2,
  ArrowLeft, CheckCircle2, X, Edit2, AlertTriangle, Calendar, Printer,
  RotateCcw, Wrench, WifiOff, RefreshCw, CloudOff, Upload, Eye,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { PurchaseInvoicePrintModal } from '@/components/purchases/purchase-invoice-print-modal'

// ============================================================================
// Types
// ============================================================================

interface Supplier { id: string; name: string; code: string }
interface Warehouse { id: string; name: string; code: string; isDefault?: boolean }
interface Product {
  id: string
  name: string
  code: string
  salePrice: number
  purchasePrice?: number
  currentStock: number
  unitLabel?: string
}

interface PurchaseInvoice {
  id: string
  number: string
  invoiceDate: string
  status: string
  paymentType: string
  totalAmount: number
  paidAmount: number
  supplierId?: string | null
  warehouseId?: string | null
  supplier?: { name: string; code: string } | null
  warehouse?: { name: string } | null
  items?: any[]
  description?: string | null
  invoiceType?: string
  _isOffline?: boolean
  _offlineId?: string
  _syncStatus?: 'pending' | 'syncing' | 'failed'
  _offlineAction?: 'create' | 'update' | 'delete'
  _retryCount?: number
}

interface CartItem {
  productId?: string
  productName: string
  unitLabel: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  lineTotal: number
}

interface SyncQueueItem {
  id: string
  offlineId: string
  serverId?: string
  action: 'create' | 'update' | 'delete'
  payload: any
  retryCount: number
  createdAt: string
  lastError?: string
}

const STORAGE_KEYS = {
  INVOICES: 'purchase_invoices_offline',
  SYNC_QUEUE: 'purchase_invoices_sync_queue',
  SUPPLIERS: 'purchase_suppliers_cache',
  WAREHOUSES: 'purchase_warehouses_cache',
  LAST_SYNC: 'purchase_invoices_last_sync',
} as const

const MAX_RETRY = 3

// ============================================================================
// Persian/Jalali Date Utilities
// ============================================================================

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
  let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * div(days, 12053)
  days = mod(days, 12053)
  jy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) { jy += div(days - 1, 365); days = mod(days - 1, 365) }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30))
  return [jy, jm, jd]
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days = 365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * div(days, 146097)
  days = mod(days, 146097)
  if (days > 36524) { gy += 100 * div(--days, 36524); days = mod(days, 36524); if (days >= 365) days++ }
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

const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
const PERSIAN_WEEKDAYS = ['ش','ی','د','س','چ','پ','ج']

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178]
  const bl = breaks.length; const gy = jy + 621; let leapJ = -14; let jp = breaks[0]
  let jm2 = 0, jump = 0, leap = 0, n = 0
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy)
  for (let i = 1; i < bl; i++) { jm2 = breaks[i]; jump = jm2 - jp; if (jy < jm2) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm2 }
  n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  leap = mod(mod(n + 1, 33) - 1, 4)
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
    const d = new Date(iso); if (isNaN(d.getTime())) return null
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return { jy, jm, jd }
  } catch { return null }
}

function jalaliToISO(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  return `${gy}-${String(gm).padStart(2,'0')}-${String(gd).padStart(2,'0')}`
}

function formatDateToJalali(iso: string): string {
  if (!iso) return '—'
  const j = isoToJalali(iso); if (!j) return '—'
  return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2,'۰')}/${toFaNum(j.jd).padStart(2,'۰')}`
}

function formatNumber(n: number): string { return (n || 0).toLocaleString('fa-IR') }

// ============================================================================
// Storage Helpers
// ============================================================================

function generateOfflineId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue
    return JSON.parse(raw) as T
  } catch { return defaultValue }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) {
    console.warn('localStorage write failed:', e)
  }
}

const DEFAULT_UNITS = ['عدد','کیلوگرم','گرم','متر','سانتی‌متر','لیتر','میلی‌لیتر','جفت','دوجین','کیس','بسته']

// ============================================================================
// Persian DatePicker
// ============================================================================

const LILAC = {
  popupBg: '#faf7ff', popupBgSolid: '#ffffff', headerBg: '#ede9fe',
  textPrimary: '#4c1d95', textSecondary: '#7c3aed', textMuted: '#a78bfa',
  textDisabled: '#d1d5db', textOnAccent: '#ffffff', border: '#e9d5ff',
  accent: '#7c3aed', accentLight: '#ede9fe', accentSoft: '#ddd6fe',
  todayBorder: '#a78bfa', todayText: '#6d28d9',
}

const navBtnStyle: CSSProperties = {
  padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent',
  fontSize: 12, cursor: 'pointer', transition: 'background-color 0.1s', lineHeight: 1,
}

interface PersianDatePickerProps {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  label?: string
  minDate?: string
  maxDate?: string
}

function PersianDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ', label, minDate, maxDate }: PersianDatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayText = useMemo(() => {
    if (!value) return ''
    const j = isoToJalali(value); if (!j) return ''
    return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2,'۰')}/${toFaNum(j.jd).padStart(2,'۰')}`
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

  const goPrevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const goNextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  const goPrevYear = () => setViewYear(y => y - 1)
  const goNextYear = () => setViewYear(y => y + 1)
  const pickToday = () => { onChange(todayJalali.iso); setOpen(false) }
  const handleDayClick = (jd: number) => {
    if (isDayDisabled(jd)) return
    onChange(jalaliToISO(viewYear, viewMonth, jd))
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && <p style={{ fontSize: 10, color: LILAC.textMuted, marginBottom: 3, fontWeight: 500 }}>{label}</p>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', height: 36, padding: '0 10px', borderRadius: 6,
          border: `1px solid ${LILAC.border}`, backgroundColor: LILAC.popupBg,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, cursor: 'pointer', fontSize: 12, transition: 'border-color 0.15s, background-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = LILAC.accent; e.currentTarget.style.backgroundColor = LILAC.accentLight }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = LILAC.border; e.currentTarget.style.backgroundColor = LILAC.popupBg }}
      >
        <Calendar style={{ width: 14, height: 14, color: LILAC.textMuted, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'right', fontFamily: 'monospace', color: displayText ? LILAC.textPrimary : LILAC.textMuted, fontSize: 12 }} dir="ltr">
          {displayText || placeholder}
        </span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div dir="rtl" style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 9999,
            width: 260, backgroundColor: LILAC.popupBgSolid, border: `1px solid ${LILAC.border}`,
            borderRadius: 10, boxShadow: '0 8px 24px -4px rgba(124,58,237,0.18)', padding: 10, overflow: 'hidden',
          }}>
            <div style={{
              background: `linear-gradient(135deg, ${LILAC.headerBg} 0%, ${LILAC.accentSoft} 100%)`,
              margin: -10, marginBottom: 8, padding: '8px 10px', borderRadius: '10px 10px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              {[{ fn: goPrevYear, label: '«', title: 'سال قبل' }, { fn: goPrevMonth, label: '‹', title: 'ماه قبل' }].map((b, i) => (
                <button key={i} type="button" onClick={b.fn} title={b.title} style={navBtnStyle}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}>{b.label}</button>
              ))}
              <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: LILAC.textPrimary }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              {[{ fn: goNextMonth, label: '›', title: 'ماه بعد' }, { fn: goNextYear, label: '»', title: 'سال بعد' }].map((b, i) => (
                <button key={i} type="button" onClick={b.fn} title={b.title} style={navBtnStyle}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}>{b.label}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: i === 6 ? LILAC.textSecondary : LILAC.textMuted, padding: '2px 0' }}>{w}</div>
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
                  <button key={i} type="button" disabled={disabled} onClick={() => handleDayClick(d)}
                    style={{
                      height: 24, borderRadius: 5, fontSize: 11,
                      border: isSelected ? 'none' : (isToday ? `1px solid ${LILAC.todayBorder}` : 'none'),
                      backgroundColor: isSelected ? LILAC.accent : (isToday ? LILAC.accentLight : 'transparent'),
                      color: isSelected ? LILAC.textOnAccent : (disabled ? LILAC.textDisabled : (isToday ? LILAC.todayText : (isFriday ? LILAC.textSecondary : LILAC.textPrimary))),
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)),
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={e => { if (disabled || isSelected) return; e.currentTarget.style.backgroundColor = LILAC.accentSoft }}
                    onMouseLeave={e => { if (disabled || isSelected) return; e.currentTarget.style.backgroundColor = isToday ? LILAC.accentLight : 'transparent' }}
                  >{toFaNum(d)}</button>
                )
              })}
            </div>

            <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${LILAC.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={pickToday} style={{ fontSize: 10, color: LILAC.accent, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 10, color: LILAC.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
// PersianNumberInput
// ============================================================================

function PersianNumberInput({ value, onChange, placeholder, className, dir = 'ltr', step = '1' }: {
  value: number; onChange: (value: number) => void; placeholder?: string
  className?: string; dir?: 'ltr' | 'rtl'; step?: string
}) {
  const displayValue = value ? toFaNum(value.toLocaleString('en-US')) : ''
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const englishDigits = raw
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/,/g, '').replace(/[^\d.]/g, '')
    onChange(englishDigits ? parseFloat(englishDigits) : 0)
  }
  return (
    <Input type="text" value={displayValue} onChange={handleChange}
      placeholder={placeholder || '۰'} className={className} dir={dir} inputMode="decimal" />
  )
}

// ============================================================================
// ★ MobileInvoiceCard — کارت موبایل
// ============================================================================

function MobileInvoiceCard({
  inv,
  onPrint,
  onEdit,
  onReturn,
  onDelete,
}: {
  inv: PurchaseInvoice
  onPrint: (inv: PurchaseInvoice) => void
  onEdit: (inv: PurchaseInvoice) => void
  onReturn: (inv: PurchaseInvoice) => void
  onDelete: (inv: PurchaseInvoice) => void
}) {
  const isCancelled = inv.status === 'cancelled'
  const isReturn = inv.invoiceType === 'purchase_return'
  const isOfflineDelete = inv._offlineAction === 'delete'

  const statusBadge = () => {
    if (inv._isOffline) {
      return (
        <Badge className={`text-[9px] ${isOfflineDelete ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
          {isOfflineDelete ? '⏳ حذف آفلاین' : '⏳ آفلاین'}
        </Badge>
      )
    }
    if (isReturn) return <Badge className="bg-amber-100 text-amber-700 text-[9px]">برگشتی</Badge>
    if (inv.status === 'confirmed') return <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">ثبت نهایی</Badge>
    if (inv.status === 'paid') return <Badge className="bg-blue-100 text-blue-700 text-[9px]">پرداخت شده</Badge>
    if (inv.status === 'cancelled') return <Badge className="bg-red-100 text-red-700 text-[9px]">لغو شده</Badge>
    return <Badge className="bg-gray-100 text-gray-500 text-[9px]">پیش‌نویس</Badge>
  }

  return (
    <Card className={`border shadow-none ${isCancelled ? 'opacity-60' : ''} ${inv._isOffline ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200 bg-white'}`}>
      <CardContent className="p-3">
        {/* ردیف ۱: شماره + وضعیت */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-mono font-bold text-sm text-gray-900">{inv.number}</span>
            {inv._isOffline && !isOfflineDelete && (
              <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 h-4 px-1">آفلاین</Badge>
            )}
            {inv.invoiceType === 'service' && <Badge className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 h-4 px-1">خدمات</Badge>}
            {inv.invoiceType === 'repair' && <Badge className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 h-4 px-1">تعمیرات</Badge>}
          </div>
          {statusBadge()}
        </div>

        {/* ردیف ۲: تامین‌کننده + تاریخ */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs text-gray-600 truncate flex-1">{inv.supplier?.name || <span className="text-gray-400">بدون تامین‌کننده</span>}</span>
          <span className="text-[10px] text-gray-400 shrink-0">{formatDateToJalali(inv.invoiceDate)}</span>
        </div>

        {/* ردیف ۳: مبالغ */}
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <div className="bg-gray-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">مبلغ کل</p>
            <p className="text-[10px] font-bold text-gray-700 leading-tight mt-0.5">{formatNumber(inv.totalAmount)}</p>
          </div>
          <div className="bg-blue-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">انبار</p>
            <p className="text-[10px] font-bold text-blue-600 leading-tight mt-0.5 truncate">{inv.warehouse?.name || '—'}</p>
          </div>
          <div className={`rounded p-1.5 text-center ${inv.paymentType === 'credit' ? 'bg-purple-50' : 'bg-emerald-50'}`}>
            <p className="text-[9px] text-gray-400 leading-tight">پرداخت</p>
            <p className={`text-[10px] font-bold leading-tight mt-0.5 ${inv.paymentType === 'credit' ? 'text-purple-600' : 'text-emerald-600'}`}>
              {inv.paymentType === 'credit' ? 'نسیه' : 'نقدی'}
            </p>
          </div>
        </div>

        {/* ردیف ۴: دکمه‌ها */}
        <div className="flex items-center justify-end gap-0.5 pt-2 border-t border-gray-100">
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-600"
            onClick={() => onPrint(inv)}
            disabled={inv._isOffline}
            title="چاپ"
          >
            <Printer className={`w-3.5 h-3.5 ${inv._isOffline ? 'text-gray-300' : 'text-emerald-600'}`} />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
            onClick={() => onEdit(inv)}
            disabled={isCancelled || isOfflineDelete}
            title="ویرایش"
          >
            <Edit2 className="w-3.5 h-3.5 text-blue-600" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 hover:bg-amber-50 hover:text-amber-600"
            onClick={() => onReturn(inv)}
            disabled={isCancelled || isReturn || inv._isOffline}
            title="برگشتی"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${inv._isOffline ? 'text-gray-300' : 'text-amber-600'}`} />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
            onClick={() => onDelete(inv)}
            disabled={isCancelled && !inv._isOffline}
            title="حذف"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PurchaseInvoicesPage() {
  const tenantId = useAppStore(s => s.tenantId)
  const setCurrentView = useAppStore(s => s.setCurrentView)
  const isOnline = useAppStore(s => s.isOnline)

  // ─── Data State ───────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  // ─── آفلاین State ─────────────────────────────────────────────────────────
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const syncInProgress = useRef(false)

  // ─── Dialog State ─────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [supplierId, setSupplierId] = useState<string>('')
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [paymentType, setPaymentType] = useState<string>('cash')
  const [description, setDescription] = useState('')
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [cart, setCart] = useState<CartItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productSearchResults, setProductSearchResults] = useState<Product[]>([])
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [editingOfflineId, setEditingOfflineId] = useState<string | null>(null)
  const [loadingEditItems, setLoadingEditItems] = useState(false)

  // ─── Delete State ─────────────────────────────────────────────────────────
  const [deletingInvoice, setDeletingInvoice] = useState<PurchaseInvoice | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ─── Print State ──────────────────────────────────────────────────────────
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null)
  const [printInvoiceNumber, setPrintInvoiceNumber] = useState<string>('')

  // ─── Return State ─────────────────────────────────────────────────────────
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [returnInvoice, setReturnInvoice] = useState<PurchaseInvoice | null>(null)
  const [returnItems, setReturnItems] = useState<Array<{
    purchaseInvoiceItemId: string; productId: string | null; productName: string
    unitLabel: string; originalQuantity: number; currentStock: number
    maxQuantity: number; quantity: number; returnReason: string
    unitPrice: number; lineTotal: number
  }>>([])
  const [returnSubmitting, setReturnSubmitting] = useState(false)

  // ─── Service Dialog State ─────────────────────────────────────────────────
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceSubmitting, setServiceSubmitting] = useState(false)
  const [serviceCategory, setServiceCategory] = useState<'repair' | 'service'>('repair')
  const [serviceForm, setServiceForm] = useState({
    supplierId: '', supplierName: '', serviceDevice: '', paymentType: 'cash', description: '',
  })
  const [serviceItems, setServiceItems] = useState<Array<{
    serviceName: string; description: string; quantity: number
    unitLabel: string; unitPrice: number; discountAmount: number; taxAmount: number
  }>>([])

  const { toast } = useToast()
    // ══════════════════════════════════════════════════════════════════════════
  // ★ مدیریت صف همگام‌سازی
  // ══════════════════════════════════════════════════════════════════════════

  const loadSyncQueue = useCallback((): SyncQueueItem[] => {
    return loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, [])
  }, [])

  const saveSyncQueue = useCallback((queue: SyncQueueItem[]) => {
    saveToStorage(STORAGE_KEYS.SYNC_QUEUE, queue)
    setSyncQueue(queue)
  }, [])

  const addToSyncQueue = useCallback((item: Omit<SyncQueueItem, 'id' | 'retryCount' | 'createdAt'>) => {
    const queue = loadSyncQueue()
    const newItem: SyncQueueItem = {
      ...item,
      id: generateOfflineId(),
      retryCount: 0,
      createdAt: new Date().toISOString(),
    }
    const updated = [...queue, newItem]
    saveSyncQueue(updated)
    return newItem
  }, [loadSyncQueue, saveSyncQueue])

  const removeFromSyncQueue = useCallback((queueItemId: string) => {
    const queue = loadSyncQueue()
    saveSyncQueue(queue.filter(i => i.id !== queueItemId))
  }, [loadSyncQueue, saveSyncQueue])

  const updateQueueItemRetry = useCallback((queueItemId: string, error: string) => {
    const queue = loadSyncQueue()
    const updated = queue.map(i =>
      i.id === queueItemId ? { ...i, retryCount: i.retryCount + 1, lastError: error } : i
    )
    saveSyncQueue(updated)
  }, [loadSyncQueue, saveSyncQueue])

  // ══════════════════════════════════════════════════════════════════════════
  // ★ مدیریت فاکتورهای آفلاین
  // ══════════════════════════════════════════════════════════════════════════

  const loadOfflineInvoices = useCallback((): PurchaseInvoice[] => {
    return loadFromStorage<PurchaseInvoice[]>(STORAGE_KEYS.INVOICES, [])
  }, [])

  const saveOfflineInvoices = useCallback((list: PurchaseInvoice[]) => {
    saveToStorage(STORAGE_KEYS.INVOICES, list)
  }, [])

  const mergeInvoices = useCallback((serverInvoices: PurchaseInvoice[], offlineInvoices: PurchaseInvoice[]): PurchaseInvoice[] => {
    const serverIds = new Set(serverInvoices.map(s => s.id))
    const stillOffline = offlineInvoices.filter(o => o._isOffline && !serverIds.has(o.id))
    return [...stillOffline, ...serverInvoices]
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // ★ بارگذاری داده‌ها
  // ══════════════════════════════════════════════════════════════════════════

 const loadData = useCallback(async (showLoader = true) => {
  if (showLoader) setLoading(true)
  const tid = tenantId || useAppStore.getState().currentTenant?.id
  if (!tid) { setLoading(false); return }

  // ★ لایه دفاعی اضافه: بررسی مستقیم navigator.onLine برای جلوگیری از خطای Fetch در لحظه قطع شدن شبکه
  const trulyOnline = isOnline && navigator.onLine

  if (!trulyOnline) {
    const cachedInvoices = loadOfflineInvoices()
    const cachedSuppliers = loadFromStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, [])
    const cachedWarehouses = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
    setInvoices(cachedInvoices)
    setSuppliers(cachedSuppliers)
    setWarehouses(cachedWarehouses)
    const defaultWh = cachedWarehouses.find(w => w.isDefault)
    if (defaultWh) setWarehouseId(defaultWh.id)
    const queue = loadSyncQueue()
    setSyncQueue(queue)
    setLoading(false)
    if (cachedInvoices.length === 0 && cachedSuppliers.length === 0) {
      toast({ title: 'حالت آفلاین', description: 'داده‌ای در حافظه محلی یافت نشد. لطفاً یک‌بار آنلاین وارد شوید.' })
    }
    return
  }

  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    
    const [invRes, supRes, whRes] = await Promise.all([
      fetch(`/api/purchase-invoices?tenantId=${tid}`, { headers }),
      fetch(`/api/suppliers?tenantId=${tid}&activeOnly=true`, { headers }),
      fetch(`/api/warehouses?tenantId=${tid}`, { headers }),
    ])

    const [invData, supData, whData] = await Promise.all([
      invRes.json(), supRes.json(), whRes.json(),
    ])

    let serverInvoices: PurchaseInvoice[] = []
    if (invData.success) serverInvoices = invData.data || []
    
    let serverSuppliers: Supplier[] = []
    if (supData.success) {
      serverSuppliers = supData.data || []
      saveToStorage(STORAGE_KEYS.SUPPLIERS, serverSuppliers)
    }
    
    let serverWarehouses: Warehouse[] = []
    if (whData.success) {
      serverWarehouses = whData.data || []
      saveToStorage(STORAGE_KEYS.WAREHOUSES, serverWarehouses)
      const defaultWh = serverWarehouses.find(w => w.isDefault)
      if (defaultWh) setWarehouseId(defaultWh.id)
    }
    
    setSuppliers(serverSuppliers)
    setWarehouses(serverWarehouses)
    
    const offlineInvoices = loadOfflineInvoices()
    const merged = mergeInvoices(serverInvoices, offlineInvoices)
    setInvoices(merged)
    
    saveOfflineInvoices([
      ...offlineInvoices.filter(o => o._isOffline),
      ...serverInvoices,
    ])
    
    const now = new Date().toISOString()
    saveToStorage(STORAGE_KEYS.LAST_SYNC, now)
    setLastSyncTime(now)
    
    const queue = loadSyncQueue()
    setSyncQueue(queue)
  } catch (err: any) {
    // ★ اگر خطا به خاطر قطعی شبکه بود، به جای console.error ترسناک، یک warning ملایم می‌دهیم
    // و به صورت خودکار به حالت آفلاین سوئیچ می‌کنیم
    if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
      console.warn('[PurchaseInvoicesPage] شبکه در دسترس نیست، سوئیچ خودکار به حالت آفلاین')
      const cachedInvoices = loadOfflineInvoices()
      const cachedSuppliers = loadFromStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, [])
      const cachedWarehouses = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
      setInvoices(cachedInvoices)
      setSuppliers(cachedSuppliers)
      setWarehouses(cachedWarehouses)
    } else {
      console.error('Error loading data:', err)
    }
  } finally {
    // ★ اطمینان از اینکه لودینگ تحت هر شرایطی متوقف می‌شود
    setLoading(false)
  }
}, [tenantId, isOnline, loadOfflineInvoices, saveOfflineInvoices, mergeInvoices, loadSyncQueue, toast])

  useEffect(() => { loadData() }, [loadData])

  // ══════════════════════════════════════════════════════════════════════════
  // ★ همگام‌سازی خودکار
  // ══════════════════════════════════════════════════════════════════════════

  const syncOfflineData = useCallback(async () => {
    if (syncInProgress.current || isSyncing) return
    const queue = loadSyncQueue()
    if (queue.length === 0) return
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    if (!tid) return

    syncInProgress.current = true
    setIsSyncing(true)

    let successCount = 0
    let failCount = 0

    for (const item of queue) {
      if (item.retryCount >= MAX_RETRY) { failCount++; continue }
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }
        let res: Response
        if (item.action === 'create') {
          res = await fetch('/api/purchase-invoices', { method: 'POST', headers, body: JSON.stringify({ ...item.payload, tenantId: tid }) })
        } else if (item.action === 'update') {
          res = await fetch(`/api/purchase-invoices/${item.serverId || item.payload.id}`, { method: 'PUT', headers, body: JSON.stringify({ ...item.payload, tenantId: tid }) })
        } else {
          res = await fetch(`/api/purchase-invoices/${item.serverId || item.payload.id}?tenantId=${tid}`, { method: 'DELETE', headers })
        }
        const data = await res.json()
        if (data.success) {
          if (item.action === 'create' && data.data?.id) {
            const offlineInvs = loadOfflineInvoices()
            const updated = offlineInvs.map(inv =>
              inv._offlineId === item.offlineId
                ? { ...inv, id: data.data.id, _isOffline: false, _syncStatus: undefined, _offlineId: undefined }
                : inv
            )
            saveOfflineInvoices(updated)
          } else if (item.action === 'delete') {
            const offlineInvs = loadOfflineInvoices()
            saveOfflineInvoices(offlineInvs.filter(inv => inv._offlineId !== item.offlineId && inv.id !== item.serverId))
          }
          removeFromSyncQueue(item.id)
          successCount++
        } else {
          updateQueueItemRetry(item.id, data.error || 'خطای نامشخص')
          failCount++
        }
      } catch (err: any) {
        updateQueueItemRetry(item.id, err?.message || 'خطای شبکه')
        failCount++
      }
    }

    syncInProgress.current = false
    setIsSyncing(false)

    if (successCount > 0) {
      toast({ title: `همگام‌سازی موفق ✓`, description: `${toFaNum(successCount)} فاکتور با سرور همگام‌سازی شد` })
      await loadData(false)
    }
    if (failCount > 0) {
      const failedItems = loadSyncQueue().filter(i => i.retryCount >= MAX_RETRY)
      if (failedItems.length > 0) {
        toast({ title: 'خطا در همگام‌سازی', description: `${toFaNum(failedItems.length)} فاکتور ناموفق ماند`, variant: 'destructive' })
      }
    }
  }, [isSyncing, loadSyncQueue, tenantId, loadOfflineInvoices, saveOfflineInvoices, removeFromSyncQueue, updateQueueItemRetry, loadData, toast])

  useEffect(() => {
    if (isOnline) {
      const queue = loadSyncQueue()
      if (queue.length > 0) {
        const timer = setTimeout(() => syncOfflineData(), 1500)
        return () => clearTimeout(timer)
      }
    }
  }, [isOnline])

  useEffect(() => {
    const last = loadFromStorage<string | null>(STORAGE_KEYS.LAST_SYNC, null)
    if (last) setLastSyncTime(last)
    const queue = loadSyncQueue()
    setSyncQueue(queue)
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // جستجوی محصول
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (productSearch.trim().length < 2) { setProductSearchResults([]); return }
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    const timer = setTimeout(async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const res = await fetch(`/api/products/lookup?q=${encodeURIComponent(productSearch)}&tenantId=${tid}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })
        const data = await res.json()
        if (data.success) {
          const prods = Array.isArray(data.data) ? data.data : (data.data?.products || [])
          setProductSearchResults(prods)
        }
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch, tenantId])

  // ══════════════════════════════════════════════════════════════════════════
  // Cart Operations
  // ══════════════════════════════════════════════════════════════════════════

  const handleAddProduct = useCallback((product: Product) => {
    const existing = cart.find(c => c.productId === product.id)
    if (existing) {
      setCart(cart.map(c =>
        c.productId === product.id
          ? { ...c, quantity: c.quantity + 1, lineTotal: (c.quantity + 1) * c.unitPrice - c.discountAmount + c.taxAmount }
          : c
      ))
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        unitLabel: product.unitLabel || 'عدد',
        quantity: 1,
        unitPrice: product.purchasePrice || 0,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: product.purchasePrice || 0,
      }])
    }
    setProductSearch('')
    setProductSearchResults([])
  }, [cart])

  const handleUpdateItem = useCallback((index: number, field: keyof CartItem, value: any) => {
    const newCart = [...cart]
    newCart[index] = { ...newCart[index], [field]: value }
    const item = newCart[index]
    item.lineTotal = item.quantity * item.unitPrice - item.discountAmount + item.taxAmount
    setCart(newCart)
  }, [cart])

  const handleRemoveItem = useCallback((index: number) => {
    setCart(cart.filter((_, i) => i !== index))
  }, [cart])

  const totals = useMemo(() => cart.reduce((acc, item) => {
    acc.subTotal += item.quantity * item.unitPrice
    acc.discount += item.discountAmount
    acc.tax += item.taxAmount
    acc.total += item.lineTotal
    return acc
  }, { subTotal: 0, discount: 0, tax: 0, total: 0 }), [cart])

    // ══════════════════════════════════════════════════════════════════════════
  // ★ ثبت فاکتور (آنلاین / آفلاین)
  // ══════════════════════════════════════════════════════════════════════════

  const handleSubmit = useCallback(async () => {
    if (cart.length === 0) {
      toast({ title: 'خطا', description: 'سبد خرید خالی است', variant: 'destructive' })
      return
    }
    if (!warehouseId) {
      toast({ title: 'خطا', description: 'انتخاب انبار الزامی است', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    const tid = tenantId || useAppStore.getState().currentTenant?.id

    const payload = {
      tenantId: tid,
      supplierId: supplierId || undefined,
      warehouseId,
      paymentType,
      description,
      invoiceDate,
      items: cart,
    }

    if (!isOnline) {
      const offlineId = editingOfflineId || generateOfflineId()
      if (editingInvoiceId && !editingOfflineId) {
        const offlineInvs = loadOfflineInvoices()
        const updated = offlineInvs.map(inv =>
          inv.id === editingInvoiceId
            ? { ...inv, ...payload, _isOffline: true, _syncStatus: 'pending' as const, _offlineAction: 'update' as const, totalAmount: totals.total, supplier: suppliers.find(s => s.id === supplierId) || inv.supplier, warehouse: warehouses.find(w => w.id === warehouseId) || inv.warehouse }
            : inv
        )
        saveOfflineInvoices(updated)
        setInvoices(updated)
        addToSyncQueue({ offlineId: editingInvoiceId, serverId: editingInvoiceId, action: 'update', payload })
      } else if (editingOfflineId) {
        const offlineInvs = loadOfflineInvoices()
        const updated = offlineInvs.map(inv =>
          inv._offlineId === editingOfflineId
            ? { ...inv, ...payload, totalAmount: totals.total, supplier: suppliers.find(s => s.id === supplierId) || inv.supplier, warehouse: warehouses.find(w => w.id === warehouseId) || inv.warehouse }
            : inv
        )
        saveOfflineInvoices(updated)
        setInvoices(updated)
        const queue = loadSyncQueue()
        saveSyncQueue(queue.map(q => q.offlineId === editingOfflineId ? { ...q, payload } : q))
      } else {
        const newInvoice: PurchaseInvoice = {
          id: offlineId,
          number: `OFFLINE-${Date.now()}`,
          invoiceDate,
          status: 'draft',
          paymentType,
          totalAmount: totals.total,
          paidAmount: 0,
          supplierId: supplierId || null,
          warehouseId,
          supplier: suppliers.find(s => s.id === supplierId) || null,
          warehouse: warehouses.find(w => w.id === warehouseId) || null,
          items: cart,
          description,
          _isOffline: true,
          _offlineId: offlineId,
          _syncStatus: 'pending',
          _offlineAction: 'create',
        }
        const offlineInvs = loadOfflineInvoices()
        const updated = [newInvoice, ...offlineInvs]
        saveOfflineInvoices(updated)
        setInvoices(updated)
        addToSyncQueue({ offlineId, action: 'create', payload })
      }
      toast({ title: 'ذخیره آفلاین ✓', description: 'فاکتور در حافظه محلی ذخیره شد و پس از اتصال همگام‌سازی می‌شود' })
      closeDialog()
      setSubmitting(false)
      return
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      const url = editingInvoiceId ? `/api/purchase-invoices/${editingInvoiceId}` : '/api/purchase-invoices'
      const method = editingInvoiceId ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        if (editingOfflineId) {
          const queue = loadSyncQueue()
          saveSyncQueue(queue.filter(q => q.offlineId !== editingOfflineId))
          const offlineInvs = loadOfflineInvoices()
          saveOfflineInvoices(offlineInvs.filter(i => i._offlineId !== editingOfflineId))
        }
        closeDialog()
        await loadData(false)
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      const offlineId = generateOfflineId()
      const newInvoice: PurchaseInvoice = {
        id: offlineId,
        number: `OFFLINE-${Date.now()}`,
        invoiceDate,
        status: 'draft',
        paymentType,
        totalAmount: totals.total,
        paidAmount: 0,
        supplierId: supplierId || null,
        warehouseId,
        supplier: suppliers.find(s => s.id === supplierId) || null,
        warehouse: warehouses.find(w => w.id === warehouseId) || null,
        items: cart,
        description,
        _isOffline: true,
        _offlineId: offlineId,
        _syncStatus: 'pending',
        _offlineAction: 'create',
      }
      const offlineInvs = loadOfflineInvoices()
      const updated = [newInvoice, ...offlineInvs]
      saveOfflineInvoices(updated)
      setInvoices(prev => [newInvoice, ...prev])
      addToSyncQueue({ offlineId, action: 'create', payload })
      toast({ title: 'ذخیره آفلاین ✓', description: 'اتصال قطع شد. فاکتور آفلاین ذخیره شد.' })
      closeDialog()
    }
    setSubmitting(false)
  }, [cart, warehouseId, tenantId, supplierId, paymentType, description, invoiceDate, totals, isOnline, editingInvoiceId, editingOfflineId, suppliers, warehouses, loadOfflineInvoices, saveOfflineInvoices, addToSyncQueue, loadSyncQueue, saveSyncQueue, loadData, toast])

  // ══════════════════════════════════════════════════════════════════════════
  // ★ حذف فاکتور
  // ══════════════════════════════════════════════════════════════════════════

  const handleDeleteInvoice = useCallback(async () => {
    if (!deletingInvoice) return
    setDeleting(true)

    if (deletingInvoice._isOffline && deletingInvoice._offlineId) {
      const offlineInvs = loadOfflineInvoices()
      saveOfflineInvoices(offlineInvs.filter(i => i._offlineId !== deletingInvoice._offlineId))
      setInvoices(prev => prev.filter(i => i._offlineId !== deletingInvoice._offlineId))
      const queue = loadSyncQueue()
      saveSyncQueue(queue.filter(q => q.offlineId !== deletingInvoice._offlineId))
      toast({ title: 'حذف شد', description: 'فاکتور آفلاین حذف شد' })
      setDeletingInvoice(null)
      setDeleting(false)
      return
    }

    if (!isOnline) {
      const offlineId = deletingInvoice._offlineId || generateOfflineId()
      const offlineInvs = loadOfflineInvoices()
      const updated = offlineInvs.map(inv =>
        inv.id === deletingInvoice.id
          ? { ...inv, _isOffline: true, _syncStatus: 'pending' as const, _offlineAction: 'delete' as const, _offlineId: offlineId }
          : inv
      )
      saveOfflineInvoices(updated)
      setInvoices(updated)
      addToSyncQueue({ offlineId, serverId: deletingInvoice.id, action: 'delete', payload: { id: deletingInvoice.id } })
      toast({ title: 'علامت‌گذاری برای حذف', description: 'فاکتور پس از اتصال اینترنت حذف خواهد شد' })
      setDeletingInvoice(null)
      setDeleting(false)
      return
    }

    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/purchase-invoices/${deletingInvoice.id}?tenantId=${tid}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        const offlineInvs = loadOfflineInvoices()
        saveOfflineInvoices(offlineInvs.filter(i => i.id !== deletingInvoice.id))
        setDeletingInvoice(null)
        await loadData(false)
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setDeleting(false)
  }, [deletingInvoice, isOnline, tenantId, loadOfflineInvoices, saveOfflineInvoices, addToSyncQueue, loadSyncQueue, saveSyncQueue, loadData, toast])

  // ══════════════════════════════════════════════════════════════════════════
  // Dialog Handlers
  // ══════════════════════════════════════════════════════════════════════════

  const openEditDialog = useCallback(async (inv: PurchaseInvoice) => {
    setEditingInvoiceId(inv._isOffline ? null : inv.id)
    setEditingOfflineId(inv._offlineId || null)
    setPaymentType(inv.paymentType || 'cash')
    setDescription(inv.description || '')
    setSupplierId(inv.supplierId || '')
    setWarehouseId(inv.warehouseId || '')
    if (inv.invoiceDate) setInvoiceDate(new Date(inv.invoiceDate).toISOString().split('T')[0])
    setCart([])
    setLoadingEditItems(true)
    setDialogOpen(true)

    if (inv._isOffline) {
      const items = (inv.items || []).map((item: any) => ({
        productId: item.productId || undefined,
        productName: item.productName || '',
        unitLabel: item.unitLabel || 'عدد',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        taxAmount: item.taxAmount || 0,
        lineTotal: item.lineTotal || (item.quantity * item.unitPrice),
      }))
      setCart(items)
      setLoadingEditItems(false)
      return
    }

    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/purchase-invoices/${inv.id}?tenantId=${tid}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.items) {
          setCart(data.data.items.map((item: any) => ({
            productId: item.productId || undefined,
            productName: item.productName || '',
            unitLabel: item.unitLabel || 'عدد',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
            lineTotal: item.lineTotal || (item.quantity * item.unitPrice),
          })))
        }
      }
    } catch {
      setCart((inv.items || []).map((item: any) => ({
        productId: item.productId || undefined,
        productName: item.productName || '',
        unitLabel: item.unitLabel || 'عدد',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        taxAmount: item.taxAmount || 0,
        lineTotal: item.lineTotal || (item.quantity * item.unitPrice),
      })))
    } finally {
      setLoadingEditItems(false)
    }
  }, [tenantId])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditingInvoiceId(null)
    setEditingOfflineId(null)
    setCart([])
    setSupplierId('')
    setDescription('')
    setInvoiceDate(new Date().toISOString().split('T')[0])
    setLoadingEditItems(false)
    const defaultWh = warehouses.find(w => w.isDefault)
    if (defaultWh) setWarehouseId(defaultWh.id)
  }, [warehouses])

  // ══════════════════════════════════════════════════════════════════════════
  // Return Invoice Handlers
  // ══════════════════════════════════════════════════════════════════════════

  const handleReturnClick = useCallback(async (inv: PurchaseInvoice) => {
    if (inv.invoiceType === 'purchase_return') {
      toast({ title: 'خطا', description: 'این فاکتور خودش برگشتی است', variant: 'destructive' })
      return
    }
    if (inv._isOffline) {
      toast({ title: 'خطا', description: 'فاکتور آفلاین قابل برگشت نیست. ابتدا همگام‌سازی کنید', variant: 'destructive' })
      return
    }
    if (!isOnline) {
      toast({ title: 'خطا', description: 'برگشتی فاکتور نیاز به اتصال اینترنت دارد', variant: 'destructive' })
      return
    }

    setReturnInvoice(inv)
    setReturnItems([])
    setReturnDialogOpen(true)

    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/purchase-invoices/${inv.id}?tenantId=${tid}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (!data.success || !data.data?.items) {
        toast({ title: 'خطا', description: 'بارگذاری آیتم‌ها ناموفق بود', variant: 'destructive' })
        return
      }
      const items = data.data.items
      const stockPromises = items.map(async (item: any) => {
        if (!item.productId) return null
        try {
          const stockRes = await fetch(`/api/products/lookup?q=${encodeURIComponent(item.productName)}&tenantId=${tid}`, {
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          })
          const stockData = await stockRes.json()
          if (stockData.success) {
            const prods = Array.isArray(stockData.data) ? stockData.data : (stockData.data?.products || [])
            const found = prods.find((p: Product) => p.id === item.productId)
            return found ? found.currentStock : null
          }
          return null
        } catch { return null }
      })
      const stockResults = await Promise.all(stockPromises)
      setReturnItems(items.map((item: any, idx: number) => {
        const originalQuantity = item.quantity
        const currentStock = stockResults[idx] ?? originalQuantity
        return {
          purchaseInvoiceItemId: item.id,
          productId: item.productId || null,
          productName: item.productName,
          unitLabel: item.unitLabel || 'عدد',
          originalQuantity,
          currentStock,
          maxQuantity: Math.min(originalQuantity, Math.max(0, currentStock)),
          quantity: 0,
          returnReason: '',
          unitPrice: item.unitPrice || 0,
          lineTotal: item.lineTotal || 0,
        }
      }))
    } catch {
      toast({ title: 'خطا', description: 'بارگذاری آیتم‌ها ناموفق بود', variant: 'destructive' })
    }
  }, [isOnline, tenantId, toast])

  const handleReturnItemChange = useCallback((index: number, field: string, value: any) => {
    const updated = [...returnItems]
    if (field === 'quantity') {
      const num = Number(value)
      updated[index].quantity = Math.min(Math.max(0, num), updated[index].maxQuantity)
    } else {
      (updated[index] as any)[field] = value
    }
    setReturnItems(updated)
  }, [returnItems])

  const handleReturnSubmit = useCallback(async () => {
    if (!returnInvoice) return
    const selectedItems = returnItems.filter(i => i.quantity > 0)
    if (selectedItems.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک آیتم باید برای برگشت انتخاب شود', variant: 'destructive' })
      return
    }
    setReturnSubmitting(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/purchase-invoices/${returnInvoice.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          items: selectedItems.map(i => ({ purchaseInvoiceItemId: i.purchaseInvoiceItemId, quantity: i.quantity, returnReason: i.returnReason || undefined })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'برگشتی ثبت شد ✓', description: data.message })
        setReturnDialogOpen(false)
        setReturnItems([])
        setReturnInvoice(null)
        await loadData(false)
      } else {
        toast({ title: 'خطا', description: data.error || 'ثبت برگشتی ناموفق بود', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    }
    setReturnSubmitting(false)
  }, [returnInvoice, returnItems, tenantId, loadData, toast])

  // ══════════════════════════════════════════════════════════════════════════
  // Service Invoice Handlers
  // ══════════════════════════════════════════════════════════════════════════

  const handleAddServiceItem = useCallback(() => {
    if (serviceItems.length === 0) {
      setServiceItems([{ serviceName: '', description: '', quantity: 1, unitLabel: 'عدد', unitPrice: 0, discountAmount: 0, taxAmount: 0 }])
      return
    }
    const lastItem = serviceItems[serviceItems.length - 1]
    if (lastItem && (!lastItem.serviceName || lastItem.serviceName.trim().length < 2)) {
      toast({ title: 'توجه', description: 'ابتدا نام خدمت/تعمیر ردیف قبلی را وارد کنید' })
      return
    }
    setServiceItems([...serviceItems, { serviceName: '', description: '', quantity: 1, unitLabel: 'عدد', unitPrice: 0, discountAmount: 0, taxAmount: 0 }])
  }, [serviceItems, toast])

  const handleRemoveServiceItem = useCallback((index: number) => {
    setServiceItems(serviceItems.filter((_, i) => i !== index))
  }, [serviceItems])

  const handleServiceItemChange = useCallback((index: number, field: string, value: any) => {
    const updated = [...serviceItems];
    (updated[index] as any)[field] = value
    setServiceItems(updated)
  }, [serviceItems])

  const handleServiceSubmit = useCallback(async () => {
    const validItems = serviceItems.filter(i => i.serviceName.trim().length >= 2)
    if (validItems.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک خدمت/تعمیر الزامی است', variant: 'destructive' })
      return
    }
    const totalAmount = validItems.reduce((sum, i) => sum + (i.quantity * i.unitPrice - i.discountAmount + i.taxAmount), 0)
    if (totalAmount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ کل باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }
    if (!isOnline) {
      toast({ title: 'خطا', description: 'فاکتور خدمات/تعمیرات نیاز به اتصال اینترنت دارد', variant: 'destructive' })
      return
    }
    setServiceSubmitting(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/purchase-invoices/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          tenantId: tid, serviceCategory,
          supplierId: serviceForm.supplierId || undefined,
          supplierName: serviceForm.supplierName || undefined,
          serviceDevice: serviceForm.serviceDevice || undefined,
          paymentType: serviceForm.paymentType,
          description: serviceForm.description || undefined,
          items: validItems,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'فاکتور صادر شد ✓', description: data.message })
        setServiceDialogOpen(false)
        setServiceForm({ supplierId: '', supplierName: '', serviceDevice: '', paymentType: 'cash', description: '' })
        setServiceItems([])
        await loadData(false)
      } else {
        toast({ title: 'خطا', description: data.error || 'صدور فاکتور ناموفق بود', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    }
    setServiceSubmitting(false)
  }, [serviceItems, serviceCategory, serviceForm, isOnline, tenantId, loadData, toast])

  // ══════════════════════════════════════════════════════════════════════════
  // Computed Values
  // ══════════════════════════════════════════════════════════════════════════

  const filteredInvoices = useMemo(() =>
    invoices.filter(inv =>
      inv.number.includes(search) || (inv.supplier?.name || '').includes(search)
    ), [invoices, search])

  const pendingSyncCount = syncQueue.filter(q => q.retryCount < MAX_RETRY).length
  const failedSyncCount = syncQueue.filter(q => q.retryCount >= MAX_RETRY).length

    // ══════════════════════════════════════════════════════════════════════════
  // Main Render
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full bg-gray-50/80" dir="rtl">

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-5 lg:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* عنوان */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 leading-tight">فاکتورهای خرید</h1>
              <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">
                {formatNumber(filteredInvoices.length)} فاکتور
              </p>
            </div>
          </div>

          {/* دکمه‌های هدر */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            {/* آفلاین badge */}
            {!isOnline && (
              <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50 px-1.5">
                <WifiOff className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">آفلاین</span>
              </Badge>
            )}

            {/* pending sync badge */}
            {pendingSyncCount > 0 && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] border-blue-300 text-blue-700 bg-blue-50 cursor-pointer px-1.5"
                onClick={() => isOnline && syncOfflineData()}
              >
                {isSyncing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
                <span className="hidden sm:inline">{toFaNum(pendingSyncCount)} در انتظار</span>
                <span className="sm:hidden">{toFaNum(pendingSyncCount)}</span>
              </Badge>
            )}

            {/* failed sync */}
            {failedSyncCount > 0 && (
              <Badge variant="outline" className="gap-1 text-[10px] border-red-300 text-red-700 bg-red-50 px-1.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">{toFaNum(failedSyncCount)} ناموفق</span>
              </Badge>
            )}

            {/* جستجو موبایل */}
            <Button
              variant="outline" size="icon"
              className="h-8 w-8 sm:hidden border-gray-200"
              onClick={() => setMobileSearchOpen(v => !v)}
            >
              <Search className="w-3.5 h-3.5" />
            </Button>

            {/* sync دستی */}
            {isOnline && pendingSyncCount > 0 && !isSyncing && (
              <Button
                variant="outline" size="sm"
                onClick={syncOfflineData}
                className="h-8 sm:h-9 text-xs border-blue-300 text-blue-600 hover:bg-blue-50 px-2 sm:px-3"
              >
                <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 sm:ml-1" />
                <span className="hidden sm:inline">همگام‌سازی</span>
              </Button>
            )}

            <Button
              onClick={() => {
                setEditingInvoiceId(null)
                setEditingOfflineId(null)
                setCart([])
                setSupplierId('')
                setDescription('')
                setInvoiceDate(new Date().toISOString().split('T')[0])
                const defaultWh = warehouses.find(w => w.isDefault)
                if (defaultWh) setWarehouseId(defaultWh.id)
                setDialogOpen(true)
              }}
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 h-8 sm:h-9 px-2 sm:px-3 lg:px-4 text-xs sm:text-sm"
            >
              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">فاکتور خرید جدید</span>
              <span className="sm:hidden">خرید</span>
            </Button>

            <Button
              onClick={() => setServiceDialogOpen(true)}
              size="sm"
              className="gap-1 bg-blue-600 hover:bg-blue-700 h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
            >
              <Wrench className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">تعمیرات و خدمات</span>
              <span className="sm:hidden">خدمات</span>
            </Button>
          </div>
        </div>

        {/* جستجوی کشویی موبایل */}
        {mobileSearchOpen && (
          <div className="mt-2 sm:hidden">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                autoFocus type="text" placeholder="جستجو..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="pr-9 pl-9 h-8 bg-gray-50 border-gray-200 text-xs"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ─── نوار وضعیت آفلاین ──────────────────────────────────────────── */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-3 sm:px-5 py-2 shrink-0">
          <CloudOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1 text-xs text-amber-700">
            <span className="font-bold">حالت آفلاین: </span>
            <span className="hidden sm:inline">فاکتورهای جدید در حافظه محلی ذخیره می‌شوند و پس از اتصال همگام‌سازی خواهند شد.</span>
            <span className="sm:hidden">ذخیره محلی فعال</span>
          </div>
          {lastSyncTime && (
            <span className="text-[10px] text-amber-500 shrink-0 hidden sm:inline">
              آخرین sync: {formatDateToJalali(lastSyncTime)}
            </span>
          )}
        </div>
      )}

      {/* نوار sync آنلاین */}
      {isOnline && pendingSyncCount > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-200 px-3 sm:px-5 py-2 shrink-0">
          <Upload className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="flex-1 text-xs text-blue-700">
            <span className="font-bold">{toFaNum(pendingSyncCount)} فاکتور آفلاین </span>
            <span className="hidden sm:inline">در انتظار همگام‌سازی با سرور هستند.</span>
          </div>
          <Button size="sm" variant="ghost"
            onClick={syncOfflineData} disabled={isSyncing}
            className="h-7 text-xs text-blue-700 hover:bg-blue-100 shrink-0"
          >
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <RefreshCw className="w-3.5 h-3.5 ml-1" />}
            <span className="hidden sm:inline">همگام‌سازی اکنون</span>
            <span className="sm:hidden">sync</span>
          </Button>
        </div>
      )}

      {/* ─── Search (Desktop) ────────────────────────────────────────────── */}
      <div className="px-3 sm:px-5 lg:px-6 pt-3 shrink-0">
        <div className="relative hidden sm:block">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="جستجو بر اساس شماره یا تامین‌کننده..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9 pl-9 h-9 text-sm bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-3 sm:px-5 lg:px-6 py-3">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-3" />
          </div>
        )}

        {/* Empty */}
        {!loading && filteredInvoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <ShoppingCart className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 mb-1">فاکتور خریدی یافت نشد</p>
            {!isOnline && (
              <p className="text-xs text-amber-500 mt-1">در حالت آفلاین، فاکتورهای قبلاً بارگذاری‌شده نمایش داده می‌شوند</p>
            )}
          </div>
        )}

        {!loading && filteredInvoices.length > 0 && (
          <>
            {/* ══ نمای موبایل - کارت ══ */}
            <div className="md:hidden space-y-2">
              {filteredInvoices.map(inv => (
                <MobileInvoiceCard
                  key={inv.id}
                  inv={inv}
                  onPrint={(inv) => { setPrintInvoiceId(inv.id); setPrintInvoiceNumber(inv.number); setPrintModalOpen(true) }}
                  onEdit={openEditDialog}
                  onReturn={handleReturnClick}
                  onDelete={(inv) => setDeletingInvoice(inv)}
                />
              ))}
            </div>

            {/* ══ نمای تبلت/دسکتاپ - جدول ══ */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/80">
                          <TableHead className="text-right text-xs font-semibold">شماره</TableHead>
                          <TableHead className="text-right text-xs font-semibold">تاریخ</TableHead>
                          <TableHead className="text-right text-xs font-semibold">تامین‌کننده</TableHead>
                          <TableHead className="text-right text-xs font-semibold hidden lg:table-cell">انبار</TableHead>
                          <TableHead className="text-right text-xs font-semibold">مبلغ</TableHead>
                          <TableHead className="text-center text-xs font-semibold hidden xl:table-cell">نوع</TableHead>
                          <TableHead className="text-center text-xs font-semibold">وضعیت</TableHead>
                          <TableHead className="text-center text-xs font-semibold">عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map(inv => (
                          <TableRow
                            key={inv.id}
                            className={`hover:bg-purple-50/50 transition-colors ${inv._isOffline ? 'bg-amber-50/40' : ''}`}
                          >
                            <TableCell className="text-xs font-mono" dir="ltr">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {inv.number}
                                {inv._isOffline && (
                                  <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 h-4 px-1">
                                    {inv._offlineAction === 'delete' ? 'حذف آفلاین' : 'آفلاین'}
                                  </Badge>
                                )}
                                {inv._syncStatus === 'syncing' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                                {inv._retryCount !== undefined && inv._retryCount >= MAX_RETRY && (
                                 <span title="sync ناموفق" className="inline-flex">
  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{formatDateToJalali(inv.invoiceDate)}</TableCell>
                            <TableCell className="text-xs">
                              <span className="truncate block max-w-[120px] lg:max-w-none">
                                {inv.supplier?.name || <span className="text-gray-400">—</span>}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs hidden lg:table-cell">{inv.warehouse?.name || '—'}</TableCell>
                            <TableCell className="text-xs font-bold" dir="ltr">{formatNumber(inv.totalAmount)}</TableCell>
                            <TableCell className="text-center hidden xl:table-cell">
                              <div className="flex flex-col items-center gap-0.5">
                                <Badge variant="outline" className="text-[9px]">
                                  {inv.paymentType === 'credit' ? 'نسیه' : 'نقدی'}
                                </Badge>
                                {inv.invoiceType === 'service' && (
                                  <Badge className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200">خدمات</Badge>
                                )}
                                {inv.invoiceType === 'repair' && (
                                  <Badge className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200">تعمیرات</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {inv._isOffline ? (
                                <Badge className={`text-[9px] ${inv._offlineAction === 'delete' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {inv._offlineAction === 'delete' ? '⏳ حذف' : '⏳ sync'}
                                </Badge>
                              ) : inv.invoiceType === 'purchase_return' ? (
                                <Badge className="bg-amber-100 text-amber-700 text-[9px]">برگشتی خرید</Badge>
                              ) : (
                                <Badge className={`text-[9px] ${
                                  inv.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                                  inv.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                                  inv.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {inv.status === 'confirmed' ? 'ثبت نهایی' :
                                   inv.status === 'paid' ? 'پرداخت شده' :
                                   inv.status === 'draft' ? 'پیش‌نویس' :
                                   inv.status === 'cancelled' ? 'لغو شده' : inv.status}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-0.5">
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 hover:bg-emerald-50"
                                  onClick={() => { setPrintInvoiceId(inv.id); setPrintInvoiceNumber(inv.number); setPrintModalOpen(true) }}
                                  disabled={inv._isOffline}
                                  title="چاپ"
                                >
                                  <Printer className={`w-3.5 h-3.5 ${inv._isOffline ? 'text-gray-300' : 'text-emerald-600'}`} />
                                </Button>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 hover:bg-blue-50"
                                  onClick={() => openEditDialog(inv)}
                                  disabled={inv.status === 'cancelled' || inv._offlineAction === 'delete'}
                                  title="ویرایش"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 hover:bg-amber-50"
                                  onClick={() => handleReturnClick(inv)}
                                  disabled={inv.status === 'cancelled' || inv.invoiceType === 'purchase_return' || inv._isOffline}
                                  title={inv._isOffline ? 'ابتدا همگام‌سازی کنید' : 'ثبت برگشتی'}
                                >
                                  <RotateCcw className={`w-3.5 h-3.5 ${inv._isOffline ? 'text-gray-300' : 'text-amber-600'}`} />
                                </Button>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 hover:bg-red-50"
                                  onClick={() => setDeletingInvoice(inv)}
                                  disabled={inv.status === 'cancelled' && !inv._isOffline}
                                  title="حذف"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          مودال فاکتور خرید جدید / ویرایش
      ══════════════════════════════════════════════════════════════════════ */}
      {dialogOpen && (
        <>
          <div onClick={closeDialog} className="fixed inset-0 bg-black/50 z-[9998]" />
          <div dir="rtl" className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-[95vw] sm:max-w-[900px] max-h-[95vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">

              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-bold">
                    {editingInvoiceId || editingOfflineId ? 'ویرایش فاکتور خرید' : 'فاکتور خرید جدید'}
                  </h2>
                  <div className="flex items-center gap-2">
                    {!isOnline && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                        <WifiOff className="w-3 h-3" />
                        آفلاین
                      </Badge>
                    )}
                    <button onClick={closeDialog} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {editingInvoiceId && !editingOfflineId && (
                  <p className="text-[10px] text-amber-600 mt-1">هنگام ویرایش، ابتدا اثرات فاکتور قدیمی برگشت می‌خورد.</p>
                )}
                {editingOfflineId && (
                  <p className="text-[10px] text-blue-600 mt-1">در حال ویرایش فاکتور آفلاین — تغییرات پس از اتصال همگام‌سازی می‌شوند.</p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 min-h-0">

                {/* اطلاعات پایه */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div>
                    <Label className="text-[10px]">تامین‌کننده</Label>
                    <Select value={supplierId || 'none'} onValueChange={setSupplierId}>
                      <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون</SelectItem>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">انبار <span className="text-red-500">*</span></Label>
                    <Select value={warehouseId} onValueChange={setWarehouseId}>
                      <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                      <SelectContent>
                        {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">پرداخت</Label>
                    <Select value={paymentType} onValueChange={setPaymentType}>
                      <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">نقدی</SelectItem>
                        <SelectItem value="credit">نسیه</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <PersianDatePicker value={invoiceDate} onChange={iso => setInvoiceDate(iso)} label="تاریخ" />
                  </div>
                </div>

                {/* جستجوی محصول */}
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="جستجو محصول..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="pr-9 h-9 text-sm"
                    disabled={!isOnline && !productSearch}
                  />
                  {!isOnline && (
                    <p className="text-[10px] text-amber-500 mt-1">⚠ جستجوی محصول در حالت آفلاین ممکن نیست.</p>
                  )}
                  {productSearchResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {productSearchResults.map(p => (
                        <button key={p.id} onClick={() => handleAddProduct(p)}
                          className="w-full text-right p-2 hover:bg-emerald-50 border-b border-gray-100 last:border-0 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-[10px] text-gray-400" dir="ltr">{p.code} • {p.unitLabel || 'عدد'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* افزودن ردیف دستی (آفلاین) */}
                {!isOnline && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setCart([...cart, { productId: undefined, productName: '', unitLabel: 'عدد', quantity: 1, unitPrice: 0, discountAmount: 0, taxAmount: 0, lineTotal: 0 }])}
                    className="w-full border-dashed border-amber-300 text-amber-700 hover:bg-amber-50 text-xs h-8"
                  >
                    <Plus className="w-3.5 h-3.5 ml-1" />
                    افزودن ردیف کالا (دستی — آفلاین)
                  </Button>
                )}

                {/* جدول کالاها */}
                {loadingEditItems ? (
                  <div className="border border-gray-200 rounded-lg p-8 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <p className="text-xs text-gray-500">در حال بارگذاری...</p>
                  </div>
                ) : cart.length > 0 ? (
                  <>
                    <div className="border border-gray-200 rounded-lg overflow-auto max-h-60 sm:max-h-72 lg:max-h-80 bg-white">
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-purple-100">
                            <th className="py-2 px-3 font-bold text-purple-900 border-b border-purple-300 text-right min-w-[120px]">نام محصول</th>
                            <th className="py-2 px-2 font-bold text-purple-900 border-b border-purple-300 text-center min-w-[80px]">واحد</th>
                            <th className="py-2 px-2 font-bold text-purple-900 border-b border-purple-300 text-center min-w-[70px]">مقدار</th>
                            <th className="py-2 px-2 font-bold text-purple-900 border-b border-purple-300 text-center min-w-[90px]">قیمت</th>
                            <th className="py-2 px-2 font-bold text-purple-900 border-b border-purple-300 text-center min-w-[80px] hidden sm:table-cell">تخفیف</th>
                            <th className="py-2 px-2 font-bold text-purple-900 border-b border-purple-300 text-center min-w-[80px] hidden sm:table-cell">مالیات</th>
                            <th className="py-2 px-2 font-bold text-purple-900 border-b border-purple-300 text-center min-w-[90px]">جمع</th>
                            <th className="py-2 px-2 font-bold text-purple-900 border-b border-purple-300 text-center w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.map((item, index) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-purple-50/30 transition-colors">
                              <td className="py-2 px-3 text-right">
                                {(!isOnline || !item.productId) ? (
                                  <Input value={item.productName} onChange={e => handleUpdateItem(index, 'productName', e.target.value)} placeholder="نام کالا" className="h-7 text-xs w-28 sm:w-36" />
                                ) : (
                                  <span className="text-xs">{item.productName}</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <select value={item.unitLabel} onChange={e => handleUpdateItem(index, 'unitLabel', e.target.value)} className="h-7 text-xs border border-gray-200 rounded px-1 bg-white w-20">
                                  {DEFAULT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </td>
                              <td className="py-2 px-2 text-center">
                                <PersianNumberInput value={item.quantity} onChange={v => handleUpdateItem(index, 'quantity', v)} className="h-7 text-xs text-center w-16" step="0.01" />
                              </td>
                              <td className="py-2 px-2 text-center">
                                <PersianNumberInput value={item.unitPrice} onChange={v => handleUpdateItem(index, 'unitPrice', v)} className="h-7 text-xs text-center w-24" dir="ltr" />
                              </td>
                              <td className="py-2 px-2 text-center hidden sm:table-cell">
                                <PersianNumberInput value={item.discountAmount} onChange={v => handleUpdateItem(index, 'discountAmount', v)} className="h-7 text-xs text-center w-20" dir="ltr" />
                              </td>
                              <td className="py-2 px-2 text-center hidden sm:table-cell">
                                <PersianNumberInput value={item.taxAmount} onChange={v => handleUpdateItem(index, 'taxAmount', v)} className="h-7 text-xs text-center w-20" dir="ltr" />
                              </td>
                              <td className="py-2 px-2 text-center font-bold text-emerald-700" dir="ltr">
                                {formatNumber(item.lineTotal)}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(index)} className="text-red-500 p-0 h-6 w-6 hover:bg-red-50">
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 sm:p-4 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-700 font-medium">جمع کل:</span>
                        <span className="font-bold text-gray-900" dir="ltr">{formatNumber(totals.subTotal)} ریال</span>
                      </div>
                      {totals.discount > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-700">تخفیف:</span>
                          <span className="text-red-600 font-bold" dir="ltr">-{formatNumber(totals.discount)} ریال</span>
                        </div>
                      )}
                      {totals.tax > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-700">مالیات:</span>
                          <span className="text-amber-600 font-bold" dir="ltr">+{formatNumber(totals.tax)} ریال</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm pt-2 border-t border-emerald-200 font-bold">
                        <span className="text-emerald-900">مبلغ نهایی:</span>
                        <span className="text-emerald-700" dir="ltr">{formatNumber(totals.total)} ریال</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="border border-dashed border-gray-200 rounded-lg p-8 flex flex-col items-center justify-center gap-2 text-center">
                    <Package className="w-8 h-8 text-gray-300" />
                    <p className="text-xs text-gray-500">{editingInvoiceId || editingOfflineId ? 'آیتمی ندارد' : 'سبد خالی است'}</p>
                    {!isOnline && <p className="text-[10px] text-amber-500">از دکمه «افزودن ردیف کالا» استفاده کنید</p>}
                  </div>
                )}

                <div>
                  <Label className="text-[10px]">توضیحات</Label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} className="mt-1 h-9 text-sm" placeholder="اختیاری" />
                </div>
              </div>

              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-white flex-shrink-0 flex items-center justify-between gap-2">
                {cart.length > 0 ? (
                  <span className="text-xs text-gray-400">{toFaNum(cart.length)} قلم کالا</span>
                ) : <span />}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={closeDialog} className="h-9 text-sm">انصراف</Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || loadingEditItems || (!(editingInvoiceId || editingOfflineId) && cart.length === 0)}
                    className={`h-9 gap-2 text-sm ${!isOnline ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {submitting || loadingEditItems
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : !isOnline ? <CloudOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />
                    }
                    {loadingEditItems ? 'بارگذاری...' : submitting ? 'ثبت...' : !isOnline ? 'ذخیره آفلاین' : editingInvoiceId || editingOfflineId ? 'ذخیره' : 'ثبت فاکتور'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          دیالوگ تأیید حذف
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deletingInvoice} onOpenChange={open => !open && setDeletingInvoice(null)}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-full sm:max-w-md rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              {deletingInvoice?._isOffline ? 'حذف فاکتور آفلاین' : 'لغو فاکتور خرید'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              آیا از {deletingInvoice?._isOffline ? 'حذف' : 'لغو'} فاکتور «{deletingInvoice?.number}» مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {deletingInvoice?._isOffline ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <p className="font-bold">این فاکتور آفلاین است و هنوز با سرور همگام‌سازی نشده.</p>
                <p className="mt-1">با حذف این فاکتور، داده‌های محلی آن از بین می‌رود.</p>
              </div>
            ) : !isOnline ? (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                <p className="font-bold">شما آفلاین هستید.</p>
                <p className="mt-1">این فاکتور پس از اتصال به اینترنت لغو خواهد شد.</p>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
                <p className="font-bold">توجه: این عمل قابل بازگشت نیست.</p>
                <ul className="list-disc list-inside space-y-0.5 mr-2">
                  <li>موجودی محصول کاهش می‌یابد</li>
                  <li>حرکت کالای مربوطه حذف می‌شود</li>
                  <li>سند حسابداری ابطال می‌شود</li>
                  {deletingInvoice?.paymentType === 'credit' && <li>بدهی تامین‌کننده کاهش می‌یابد</li>}
                </ul>
              </div>
            )}
            {deletingInvoice && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">شماره:</span><span className="font-mono">{deletingInvoice.number}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">مبلغ:</span><span className="font-bold">{formatNumber(deletingInvoice.totalAmount)} ریال</span></div>
                <div className="flex justify-between"><span className="text-slate-500">تامین‌کننده:</span><span>{deletingInvoice.supplier?.name || '—'}</span></div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeletingInvoice(null)} disabled={deleting}>انصراف</Button>
            <Button onClick={handleDeleteInvoice} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 gap-1.5">
  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
  {deletingInvoice?._isOffline ? 'حذف' : !isOnline ? 'علامت‌گذاری برای حذف' : 'بله، لغو کن'}
</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          مودال چاپ
      ══════════════════════════════════════════════════════════════════════ */}
      <PurchaseInvoicePrintModal
        invoiceId={printInvoiceId}
        invoiceNumber={printInvoiceNumber}
        open={printModalOpen}
        onOpenChange={setPrintModalOpen}
        storeName={useAppStore.getState().storeName || 'فروشگاه'}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          دیالوگ برگشتی فاکتور خرید
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="w-[calc(100%-0.5rem)] sm:w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              ثبت برگشتی فاکتور خرید
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {returnInvoice && `فاکتور ${returnInvoice.number} — انتخاب کالاهای مرجوعی`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {returnDialogOpen && returnItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                <p className="text-xs text-gray-500">در حال بارگذاری آیتم‌ها...</p>
              </div>
            ) : (
              <>
                {/* موبایل - کارت */}
                <div className="sm:hidden space-y-2">
                  {returnItems.map((item, index) => {
                    const itemReturnAmount = item.lineTotal > 0 && item.originalQuantity > 0
                      ? (item.lineTotal * (item.quantity / item.originalQuantity))
                      : (item.unitPrice * item.quantity)
                    const isDisabled = item.maxQuantity === 0
                    return (
                      <Card key={index} className={`border ${isDisabled ? 'opacity-60 bg-gray-50' : item.quantity > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm">{item.productName}</span>
                            {isDisabled && <Badge className="bg-red-100 text-red-600 text-[9px]">موجودی ندارد</Badge>}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                            <div className="text-center bg-gray-50 rounded p-1">
                              <p className="text-gray-400">خرید</p>
                              <p className="font-bold">{item.originalQuantity.toLocaleString('fa-IR')}</p>
                            </div>
                            <div className="text-center bg-emerald-50 rounded p-1">
                              <p className="text-gray-400">موجودی</p>
                              <p className={`font-bold ${item.currentStock === 0 ? 'text-red-600' : 'text-emerald-600'}`}>{item.currentStock.toLocaleString('fa-IR')}</p>
                            </div>
                            <div className="text-center bg-amber-50 rounded p-1">
                              <p className="text-gray-400">حداکثر</p>
                              <p className="font-bold text-amber-600">{item.maxQuantity.toLocaleString('fa-IR')}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px]">مقدار برگشتی</Label>
                              <Input type="number" value={item.quantity}
                                onChange={e => handleReturnItemChange(index, 'quantity', e.target.value)}
                                min={0} max={item.maxQuantity} disabled={isDisabled}
                                className={`h-8 text-xs text-center mt-0.5 ${isDisabled ? 'bg-gray-100' : ''}`}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px]">دلیل برگشت</Label>
                              <Input value={item.returnReason}
                                onChange={e => handleReturnItemChange(index, 'returnReason', e.target.value)}
                                placeholder="اختیاری" disabled={isDisabled} className="h-8 text-xs mt-0.5" />
                            </div>
                          </div>
                          {itemReturnAmount > 0 && (
                            <p className="text-xs text-amber-700 font-bold text-left">مبلغ: {itemReturnAmount.toLocaleString('fa-IR')} ریال</p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* دسکتاپ - جدول */}
                <div className="hidden sm:block border border-gray-200 rounded-lg overflow-auto max-h-96">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-100">
                      <tr>
                        {['نام کالا','واحد','مقدار خرید','موجودی','مقدار برگشتی','مبلغ برگشتی','دلیل'].map((h, i) => (
                          <th key={i} className={`p-2 font-bold min-w-max ${i === 0 ? 'text-right' : 'text-center'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {returnItems.map((item, index) => {
                        const itemReturnAmount = item.lineTotal > 0 && item.originalQuantity > 0
                          ? (item.lineTotal * (item.quantity / item.originalQuantity))
                          : (item.unitPrice * item.quantity)
                        const isDisabled = item.maxQuantity === 0
                        return (
                          <tr key={index} className={`border-t border-gray-100 ${isDisabled ? 'bg-gray-50 opacity-60' : ''}`}>
                            <td className="p-2">
                              <span>{item.productName}</span>
                              {isDisabled && <span className="mr-1 text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded">موجودی ندارد</span>}
                            </td>
                            <td className="p-2 text-center text-[9px]">{item.unitLabel}</td>
                            <td className="p-2 text-center">{item.originalQuantity.toLocaleString('fa-IR')}</td>
                            <td className="p-2 text-center">
                              <span className={`font-bold ${item.currentStock === 0 ? 'text-red-600' : item.currentStock < item.originalQuantity ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {item.currentStock.toLocaleString('fa-IR')}
                              </span>
                            </td>
                            <td className="p-2">
                              <Input type="number" value={item.quantity}
                                onChange={e => handleReturnItemChange(index, 'quantity', e.target.value)}
                                min={0} max={item.maxQuantity} disabled={isDisabled} step="0.01"
                                className={`h-8 text-xs w-20 text-center ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              />
                              {!isDisabled && <p className="text-[9px] text-gray-400 mt-0.5">حداکثر: {item.maxQuantity.toLocaleString('fa-IR')}</p>}
                            </td>
                            <td className="p-2 text-center font-medium text-amber-700">
                              {itemReturnAmount > 0 ? itemReturnAmount.toLocaleString('fa-IR') : '—'}
                            </td>
                            <td className="p-2">
                              <Input value={item.returnReason}
                                onChange={e => handleReturnItemChange(index, 'returnReason', e.target.value)}
                                placeholder="اختیاری" disabled={isDisabled} className="h-8 text-xs" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {returnItems.length > 0 && returnItems.every(i => i.maxQuantity === 0) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />
                    موجودی تمام کالاها صفر است.
                  </div>
                )}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                  ★ با ثبت برگشتی، موجودی انبار کاهش یافته و سند معکوس صادر می‌شود.
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1"
              onClick={() => { setReturnDialogOpen(false); setReturnItems([]); setReturnInvoice(null) }}
              disabled={returnSubmitting}>انصراف</Button>
            <Button
              onClick={handleReturnSubmit}
              disabled={returnSubmitting || returnItems.length === 0 || returnItems.every(i => i.quantity === 0)}
              className="flex-1 bg-amber-600 hover:bg-amber-700 gap-1.5"
            >
              {returnSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />در حال ثبت...</> : <><RotateCcw className="w-4 h-4" />ثبت برگشتی</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          دیالوگ فاکتور خدمات/تعمیرات
      ══════════════════════════════════════════════════════════════════════ */}
      {serviceDialogOpen && (
        <>
          <div onClick={() => setServiceDialogOpen(false)} className="fixed inset-0 bg-black/50 z-[9998]" />
          <div dir="rtl" className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-[95vw] sm:max-w-[700px] max-h-[95vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">

              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">
                    <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                    فاکتور خرید تعمیرات و خدمات
                  </h2>
                  <button onClick={() => setServiceDialogOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">ثبت فاکتور برای تعمیر یا خدمتی که فروشگاه برای آن هزینه می‌کند</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 min-h-0">

                {/* نوع فاکتور */}
                <div>
                  <Label className="text-xs font-bold">نوع فاکتور *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {(['repair', 'service'] as const).map(cat => (
                      <button
                        key={cat} type="button" onClick={() => setServiceCategory(cat)}
                        className={`p-2.5 rounded-lg border-2 transition-all text-right ${serviceCategory === cat ? (cat === 'repair' ? 'border-amber-400 bg-amber-50' : 'border-blue-400 bg-blue-50') : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${serviceCategory === cat ? (cat === 'repair' ? 'bg-amber-500' : 'bg-blue-500') : 'bg-gray-300'}`}>
                            <Wrench className="w-3.5 h-3.5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold">{cat === 'repair' ? 'تعمیرات' : 'خدمات'}</p>
                            <p className="text-[10px] text-gray-500 hidden sm:block">{cat === 'repair' ? 'تعمیر دستگاه، تعویض قطعه' : 'نصب، آموزش، مشاوره'}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* اطلاعات پایه */}
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">تامین‌کننده / تعمیرکار</Label>
                      <select
                        value={serviceForm.supplierId}
                        onChange={e => setServiceForm({ ...serviceForm, supplierId: e.target.value })}
                        className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2 bg-white"
                      >
                        <option value="">— بدون تامین‌کننده —</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">نحوه پرداخت</Label>
                      <select
                        value={serviceForm.paymentType}
                        onChange={e => setServiceForm({ ...serviceForm, paymentType: e.target.value })}
                        className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2 bg-white"
                      >
                        <option value="cash">نقدی</option>
                        <option value="credit">نسیه</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">دستگاه/محل انجام کار (اختیاری)</Label>
                    <Input
                      value={serviceForm.serviceDevice}
                      onChange={e => setServiceForm({ ...serviceForm, serviceDevice: e.target.value })}
                      placeholder="مثلاً: یخچال فروشگاه، کولر"
                      className="text-xs mt-1 h-9"
                    />
                  </div>
                </div>

                {/* آیتم‌های خدمت */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700">
                      {serviceCategory === 'repair' ? '🔧 تعمیرات انجام‌شده' : '🛠️ خدمات دریافتی'} *
                    </p>
                    <Button size="sm" variant="outline" onClick={handleAddServiceItem} className="h-7 text-xs">
                      <Plus className="w-3 h-3 ml-1" />افزودن
                    </Button>
                  </div>

                  {serviceItems.length === 0 && (
                    <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                      <Wrench className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-xs text-gray-500">هنوز موردی اضافه نشده</p>
                    </div>
                  )}

                  {serviceItems.length > 0 && (
                    <div className="space-y-2 max-h-40 sm:max-h-52 overflow-y-auto">
                      {serviceItems.map((item, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold shrink-0">
                              {(index + 1).toLocaleString('fa-IR')}
                            </span>
                            <Input
                              value={item.serviceName}
                              onChange={e => handleServiceItemChange(index, 'serviceName', e.target.value)}
                              placeholder={serviceCategory === 'repair' ? 'نام تعمیر...' : 'نام خدمت...'}
                              className="text-xs h-7 flex-1"
                            />
                            {serviceItems.length > 1 && (
                              <Button size="sm" variant="ghost" onClick={() => handleRemoveServiceItem(index)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>

                          <Input
                            value={item.description}
                            onChange={e => handleServiceItemChange(index, 'description', e.target.value)}
                            placeholder="توضیحات (اختیاری)"
                            className="text-xs h-7"
                          />

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <div>
                              <Label className="text-[9px] text-gray-500">مقدار</Label>
                              <Input type="number" value={item.quantity} onChange={e => handleServiceItemChange(index, 'quantity', Number(e.target.value))} className="text-xs h-7 mt-0.5" min={0} step="0.5" />
                            </div>
                            <div>
                              <Label className="text-[9px] text-gray-500">واحد</Label>
                              <select value={item.unitLabel} onChange={e => handleServiceItemChange(index, 'unitLabel', e.target.value)} className="w-full text-xs h-7 mt-0.5 border border-gray-200 rounded px-1 bg-white">
                                {DEFAULT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                            <div>
                              <Label className="text-[9px] text-gray-500">مبلغ</Label>
                              <Input type="number" value={item.unitPrice} onChange={e => handleServiceItemChange(index, 'unitPrice', Number(e.target.value))} className="text-xs h-7 mt-0.5" min={0} />
                            </div>
                            <div>
                              <Label className="text-[9px] text-gray-500">تخفیف</Label>
                              <Input type="number" value={item.discountAmount} onChange={e => handleServiceItemChange(index, 'discountAmount', Number(e.target.value))} className="text-xs h-7 mt-0.5" min={0} />
                            </div>
                          </div>

                          <div className="text-[10px] text-gray-600 text-left bg-gray-50 rounded px-2 py-0.5">
                            جمع: <span className="font-bold">{((item.quantity * item.unitPrice) - item.discountAmount + item.taxAmount).toLocaleString('fa-IR')}</span> ریال
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* توضیحات */}
                <div>
                  <Label className="text-xs">توضیحات کلی (اختیاری)</Label>
                  <Textarea
                    value={serviceForm.description}
                    onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })}
                    placeholder="مثلاً: گارانتی یک‌ماهه دارد..."
                    className="text-xs mt-1 min-h-[40px] resize-y"
                  />
                </div>

                {/* جمع کل */}
                <div className="bg-blue-600 text-white rounded-lg p-3 flex justify-between items-center">
                  <span className="text-xs sm:text-sm">مبلغ قابل پرداخت:</span>
                  <span className="font-bold text-sm sm:text-base">
                    {serviceItems.reduce((sum, i) => sum + (i.quantity * i.unitPrice - i.discountAmount + i.taxAmount), 0).toLocaleString('fa-IR')} ریال
                  </span>
                </div>
              </div>

              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-white flex-shrink-0 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setServiceDialogOpen(false)} disabled={serviceSubmitting} className="h-9 text-sm">انصراف</Button>
                <Button onClick={handleServiceSubmit} disabled={serviceSubmitting} className="bg-blue-600 hover:bg-blue-700 h-9 text-sm gap-2">
                  {serviceSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />در حال صدور...</> : <><Wrench className="w-4 h-4" />صدور فاکتور</>}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}