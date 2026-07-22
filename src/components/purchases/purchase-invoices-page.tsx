// src/components/purchases/purchase-invoices-page.tsx — صفحه فاکتورهای خرید
// ============================================================================
// ★★★ v6.2.0: استفاده از PersianDatePicker (نسخه صفحه حسابداری) + اعداد فارسی در input ها
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'  // ★★★ v8.7.2
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
  ArrowLeft, CheckCircle2, X, Edit2, AlertTriangle, Calendar, Printer, RotateCcw, Wrench,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
// ★★★ v6.9: مودال چاپ رسید فاکتور خرید
import { PurchaseInvoicePrintModal } from '@/components/purchases/purchase-invoice-print-modal'

interface Supplier { id: string; name: string; code: string }
interface Warehouse { id: string; name: string; code: string; isDefault?: boolean }
interface Product { id: string; name: string; code: string; salePrice: number; purchasePrice?: number; currentStock: number }

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
}

interface CartItem {
  productId?: string
  productName: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  lineTotal: number
}

// ═══════════════════════════════════════════════════════════════
//  Persian/Jalali Date Utilities (نسخه صفحه حسابداری)
// ═══════════════════════════════════════════════════════════════
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
  let days = 365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
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

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]
  let jm = 0, jump = 0, leap = 0, n = 0
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy)
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
  leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function isJalaliLeapYear(jy: number): boolean { return jalCal(jy).leap === 0 }

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

function isoToJalali(iso: string): { jy: number; jm: number; jd: number } | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return { jy, jm, jd }
  } catch { return null }
}

function jalaliToISO(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
}

function formatDateToJalali(iso: string): string {
  if (!iso) return '—'
  const j = isoToJalali(iso)
  if (!j) return '—'
  return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2, '۰')}/${toFaNum(j.jd).padStart(2, '۰')}`
}

function formatNumber(n: number): string {
  return (n || 0).toLocaleString('fa-IR')
}

// ═══════════════════════════════════════════════════════════════
//  Persian DatePicker (نسخه صفحه حسابداری — با inline styles و fixed overlay)
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

const navBtnStyle: CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  fontSize: 12,
  cursor: 'pointer',
  transition: 'background-color 0.1s',
  lineHeight: 1,
}

interface PersianDatePickerProps {
  value: string  // ISO date string
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
    if (j) {
      setViewYear(j.jy)
      setViewMonth(j.jm)
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

  const selectedJalali = value ? isoToJalali(value) : null

  const isDayDisabled = (jd: number): boolean => {
    const cellIso = jalaliToISO(viewYear, viewMonth, jd)
    if (minDate && cellIso < minDate) return true
    if (maxDate && cellIso > maxDate) return true
    return false
  }

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
    if (isDayDisabled(jd)) return
    onChange(jalaliToISO(viewYear, viewMonth, jd))
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && (
        <p style={{ fontSize: 10, color: LILAC.textMuted, marginBottom: 3, fontWeight: 500 }}>{label}</p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: 36,
          padding: '0 10px',
          borderRadius: 6,
          border: `1px solid ${LILAC.border}`,
          backgroundColor: LILAC.popupBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          cursor: 'pointer',
          fontSize: 12,
          transition: 'border-color 0.15s, background-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = LILAC.accent; e.currentTarget.style.backgroundColor = LILAC.accentLight }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = LILAC.border; e.currentTarget.style.backgroundColor = LILAC.popupBg }}
      >
        <Calendar style={{ width: 14, height: 14, color: LILAC.textMuted, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: 'right',
            fontFamily: 'monospace',
            color: displayText ? LILAC.textPrimary : LILAC.textMuted,
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
              zIndex: 9998,
            }}
            onClick={() => setOpen(false)}
          />
          <div
            dir="rtl"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              zIndex: 9999,
              width: 280,
              backgroundColor: LILAC.popupBgSolid,
              border: `1px solid ${LILAC.border}`,
              borderRadius: 10,
              boxShadow: '0 8px 24px -4px rgba(124, 58, 237, 0.18), 0 4px 8px -2px rgba(124, 58, 237, 0.1)',
              padding: 10,
              overflow: 'hidden',
            }}
          >
            <div style={{
              background: `linear-gradient(135deg, ${LILAC.headerBg} 0%, ${LILAC.accentSoft} 100%)`,
              margin: -10,
              marginBottom: 8,
              padding: '8px 10px',
              borderRadius: '10px 10px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button type="button" onClick={goPrevYear} title="سال قبل" style={navBtnStyle} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>«</button>
              <button type="button" onClick={goPrevMonth} title="ماه قبل" style={navBtnStyle} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: LILAC.textPrimary }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button type="button" onClick={goNextMonth} title="ماه بعد" style={navBtnStyle} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>›</button>
              <button type="button" onClick={goNextYear} title="سال بعد" style={navBtnStyle} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>»</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} style={{
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  color: i === 6 ? LILAC.textSecondary : LILAC.textMuted,
                  padding: '2px 0',
                }}>{w}</div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 24 }} />
                const isSelected = selectedJalali &&
                  selectedJalali.jy === viewYear &&
                  selectedJalali.jm === viewMonth &&
                  selectedJalali.jd === d
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
                      height: 24,
                      borderRadius: 5,
                      fontSize: 11,
                      border: isSelected ? 'none' : (isToday ? `1px solid ${LILAC.todayBorder}` : 'none'),
                      backgroundColor: isSelected
                        ? LILAC.accent
                        : (isToday ? LILAC.accentLight : 'transparent'),
                      color: isSelected
                        ? LILAC.textOnAccent
                        : (disabled ? LILAC.textDisabled : (isToday ? LILAC.todayText : (isFriday ? LILAC.textSecondary : LILAC.textPrimary))),
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)),
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (disabled || isSelected) return
                      e.currentTarget.style.backgroundColor = LILAC.accentSoft
                    }}
                    onMouseLeave={(e) => {
                      if (disabled || isSelected) return
                      e.currentTarget.style.backgroundColor = isToday ? LILAC.accentLight : 'transparent'
                    }}
                  >
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>

            <div style={{
              marginTop: 8,
              paddingTop: 6,
              borderTop: `1px dashed ${LILAC.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button
                type="button"
                onClick={pickToday}
                style={{
                  fontSize: 10,
                  color: LILAC.accent,
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]} {toFaNum(todayJalali.jy)}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 10,
                  color: LILAC.textMuted,
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
//  PersianNumberInput — input text با نمایش اعداد فارسی + جداکننده هزارگان
// ═══════════════════════════════════════════════════════════════
function PersianNumberInput({
  value,
  onChange,
  placeholder,
  className,
  dir = 'ltr',
}: {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
  dir?: 'ltr' | 'rtl'
}) {
  const displayValue = value ? toFaNum(value.toLocaleString('en-US')) : ''

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const englishDigits = raw
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/,/g, '')
      .replace(/[^\d]/g, '')
    const num = englishDigits ? parseInt(englishDigits, 10) : 0
    onChange(num)
  }

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder || '۰'}
      className={className}
      dir={dir}
      inputMode="numeric"
    />
  )
}

export function PurchaseInvoicesPage() {
  const tenantId = useAppStore((s) => s.tenantId)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
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
  const [loadingEditItems, setLoadingEditItems] = useState(false)
  const [deletingInvoice, setDeletingInvoice] = useState<PurchaseInvoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null)
  const [printInvoiceNumber, setPrintInvoiceNumber] = useState<string>('')
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [returnInvoice, setReturnInvoice] = useState<PurchaseInvoice | null>(null)

  const [returnItems, setReturnItems] = useState<Array<{
    purchaseInvoiceItemId: string
    productId: string | null
    productName: string
    originalQuantity: number
    currentStock: number
    maxQuantity: number
    quantity: number
    returnReason: string
    unitPrice: number
    lineTotal: number
  }>>([])
  const [returnSubmitting, setReturnSubmitting] = useState(false)

  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceSubmitting, setServiceSubmitting] = useState(false)
  const [serviceCategory, setServiceCategory] = useState<'repair' | 'service'>('repair')
  const [serviceForm, setServiceForm] = useState({
    supplierId: '',
    supplierName: '',
    serviceDevice: '',
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
  }>>([])

  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      if (!tid) return

      const [invRes, supRes, whRes] = await Promise.all([
        fetch(`/api/purchase-invoices?tenantId=${tid}`),
        fetch(`/api/suppliers?tenantId=${tid}&activeOnly=true`),
        fetch(`/api/warehouses?tenantId=${tid}`),
      ])

      const [invData, supData, whData] = await Promise.all([invRes.json(), supRes.json(), whRes.json()])

      if (invData.success) setInvoices(invData.data || [])
      if (supData.success) setSuppliers(supData.data || [])
      if (whData.success) {
        setWarehouses(whData.data || [])
        const defaultWh = whData.data?.find((w: Warehouse) => w.isDefault)
        if (defaultWh) setWarehouseId(defaultWh.id)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    }
    setLoading(false)
  }, [tenantId])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (productSearch.trim().length < 2) {
      setProductSearchResults([])
      return
    }
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/lookup?q=${encodeURIComponent(productSearch)}&tenantId=${tid}`)
        const data = await res.json()
        if (data.success) {
          const prods = Array.isArray(data.data) ? data.data : (data.data?.products || [])
          setProductSearchResults(prods)
        }
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch, tenantId])

  const handleAddProduct = (product: Product) => {
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
        quantity: 1,
        unitPrice: product.purchasePrice || 0,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: product.purchasePrice || 0,
      }])
    }
    setProductSearch('')
    setProductSearchResults([])
  }

  const handleUpdateItem = (index: number, field: keyof CartItem, value: any) => {
    const newCart = [...cart]
    newCart[index] = { ...newCart[index], [field]: value }
    const item = newCart[index]
    item.lineTotal = item.quantity * item.unitPrice - item.discountAmount + item.taxAmount
    setCart(newCart)
  }

  const handleRemoveItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index))
  }

  const totals = cart.reduce((acc, item) => {
    acc.subTotal += item.quantity * item.unitPrice
    acc.discount += item.discountAmount
    acc.tax += item.taxAmount
    acc.total += item.lineTotal
    return acc
  }, { subTotal: 0, discount: 0, tax: 0, total: 0 })

  const openEditDialog = async (inv: PurchaseInvoice) => {
    setEditingInvoiceId(inv.id)
    setPaymentType(inv.paymentType || 'cash')
    setDescription(inv.description || '')
    setSupplierId(inv.supplierId || '')
    setWarehouseId(inv.warehouseId || '')

    if (inv.invoiceDate) {
      setInvoiceDate(new Date(inv.invoiceDate).toISOString().split('T')[0])
    }

    setCart([])
    setLoadingEditItems(true)
    setDialogOpen(true)

    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const res = await fetch(`/api/purchase-invoices/${inv.id}?tenantId=${tid}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.items) {
          const items = data.data.items.map((item: any) => ({
            productId: item.productId || undefined,
            productName: item.productName || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
            lineTotal: item.lineTotal || (item.quantity * item.unitPrice),
          }))
          setCart(items)
        } else {
          const items = (inv.items || []).map((item: any) => ({
            productId: item.productId || undefined,
            productName: item.productName || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
            lineTotal: item.lineTotal || (item.quantity * item.unitPrice),
          }))
          setCart(items)
        }
      }
    } catch (err) {
      console.error('Error loading invoice for edit:', err)
      const items = (inv.items || []).map((item: any) => ({
        productId: item.productId || undefined,
        productName: item.productName || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        taxAmount: item.taxAmount || 0,
        lineTotal: item.lineTotal || (item.quantity * item.unitPrice),
      }))
      setCart(items)
    } finally {
      setLoadingEditItems(false)
    }
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingInvoiceId(null)
    setCart([])
    setSupplierId('')
    setDescription('')
    setInvoiceDate(new Date().toISOString().split('T')[0])
    setLoadingEditItems(false)
    const defaultWh = warehouses.find(w => w.isDefault)
    if (defaultWh) setWarehouseId(defaultWh.id)
  }

  const handleDeleteInvoice = async () => {
    if (!deletingInvoice) return
    setDeleting(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const res = await fetch(`/api/purchase-invoices/${deletingInvoice.id}?tenantId=${tid}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        setDeletingInvoice(null)
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setDeleting(false)
  }

  const handleReturnClick = async (inv: PurchaseInvoice) => {
    if ((inv as any).invoiceType === 'purchase_return') {
      toast({
        title: 'خطا',
        description: 'این فاکتور خودش برگشتی است',
        variant: 'destructive'
      })
      return
    }

    setReturnInvoice(inv)
    setReturnItems([])
    setReturnDialogOpen(true)

    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const res = await fetch(`/api/purchase-invoices/${inv.id}?tenantId=${tid}`)
      const data = await res.json()

      if (!data.success || !data.data?.items) {
        toast({
          title: 'خطا',
          description: 'بارگذاری آیتم‌ها ناموفق بود',
          variant: 'destructive'
        })
        return
      }

      const items = data.data.items

      const stockPromises = items.map(async (item: any) => {
        if (!item.productId) return null
        try {
          const stockRes = await fetch(
            `/api/products/lookup?q=${encodeURIComponent(item.productName)}&tenantId=${tid}`
          )
          const stockData = await stockRes.json()
          if (stockData.success) {
            const prods = Array.isArray(stockData.data)
              ? stockData.data
              : (stockData.data?.products || [])
            const found = prods.find((p: Product) => p.id === item.productId)
            return found ? found.currentStock : null
          }
          return null
        } catch {
          return null
        }
      })

      const stockResults = await Promise.all(stockPromises)

      const mappedItems = items.map((item: any, idx: number) => {
        const originalQuantity = item.quantity
        const currentStock = stockResults[idx] ?? originalQuantity
        const maxQuantity = Math.min(originalQuantity, Math.max(0, currentStock))

        return {
          purchaseInvoiceItemId: item.id,
          productId: item.productId || null,
          productName: item.productName,
          originalQuantity,
          currentStock: stockResults[idx] ?? originalQuantity,
          maxQuantity,
          quantity: 0,
          returnReason: '',
          unitPrice: item.unitPrice || 0,
          lineTotal: item.lineTotal || 0,
        }
      })

      setReturnItems(mappedItems)

    } catch (err: any) {
      toast({
        title: 'خطا',
        description: 'بارگذاری آیتم‌ها ناموفق بود',
        variant: 'destructive'
      })
    }
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
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: selectedItems.map(i => ({
            purchaseInvoiceItemId: i.purchaseInvoiceItemId,
            quantity: i.quantity,
            returnReason: i.returnReason || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'برگشتی ثبت شد ✓', description: data.message })
        setReturnDialogOpen(false)
        setReturnItems([])
        setReturnInvoice(null)
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error || 'ثبت برگشتی ناموفق بود', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    } finally {
      setReturnSubmitting(false)
    }
  }

  const handleAddServiceItem = () => {
    if (serviceItems.length === 0) {
      setServiceItems([{ serviceName: '', description: '', quantity: 1, unitLabel: 'عدد', unitPrice: 0, discountAmount: 0, taxAmount: 0 }])
      return
    }
    const lastItem = serviceItems[serviceItems.length - 1]
    if (lastItem && (!lastItem.serviceName || lastItem.serviceName.trim().length < 2)) {
      toast({
        title: 'توجه',
        description: 'ابتدا نام خدمت/تعمیر ردیف قبلی را وارد کنید',
      })
      return
    }
    setServiceItems([...serviceItems, {
      serviceName: '', description: '', quantity: 1, unitLabel: 'عدد',
      unitPrice: 0, discountAmount: 0, taxAmount: 0,
    }])
  }

  const handleRemoveServiceItem = (index: number) => {
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
      toast({ title: 'خطا', description: 'حداقل یک خدمت/تعمیر الزامی است', variant: 'destructive' })
      return
    }
    const totalAmount = validItems.reduce((sum, i) =>
      sum + (i.quantity * i.unitPrice - i.discountAmount + i.taxAmount), 0)
    if (totalAmount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ کل باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }
    if (serviceForm.paymentType === 'credit' && !serviceForm.supplierId) {
      toast({ title: 'خطا', description: 'برای نسیه، انتخاب تامین‌کننده الزامی است', variant: 'destructive' })
      return
    }

    setServiceSubmitting(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/purchase-invoices/service', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenantId: tid,
          serviceCategory,
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
        setServiceItems([{ serviceName: '', description: '', quantity: 1, unitLabel: 'عدد', unitPrice: 0, discountAmount: 0, taxAmount: 0 }])
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error || 'صدور فاکتور ناموفق بود', variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: 'خطا', description: 'ارتباط با سرور برقرار نشد', variant: 'destructive' })
    } finally {
      setServiceSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast({ title: 'خطا', description: 'سبد خرید خالی است', variant: 'destructive' })
      return
    }
    if (!warehouseId) {
      toast({ title: 'خطا', description: 'انتخاب انبار الزامی است', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const url = editingInvoiceId
        ? `/api/purchase-invoices/${editingInvoiceId}`
        : '/api/purchase-invoices'
      const method = editingInvoiceId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tid,
          supplierId: supplierId || undefined,
          warehouseId,
          paymentType,
          description,
          invoiceDate,
          items: cart,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        closeDialog()
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setSubmitting(false)
  }

  const filteredInvoices = invoices.filter(inv =>
    inv.number.includes(search) || (inv.supplier?.name || '').includes(search)
  )

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">فاکتورهای خرید</h1>
            <p className="text-xs text-gray-500">{formatNumber(filteredInvoices.length)} فاکتور</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => {
            setEditingInvoiceId(null)
            setCart([])
            setSupplierId('')
            setDescription('')
            setInvoiceDate(new Date().toISOString().split('T')[0])
            const defaultWh = warehouses.find(w => w.isDefault)
            if (defaultWh) setWarehouseId(defaultWh.id)
            setDialogOpen(true)
          }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" />
            فاکتور خرید جدید
          </Button>
          <Button
            onClick={() => setServiceDialogOpen(true)}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700"
          >
            <Wrench className="w-4 h-4" />
            تعمیرات و خدمات
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="جستجو بر اساس شماره یا تامین‌کننده..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 flex-wrap">
          <Badge className="bg-emerald-100 text-emerald-700">ثبت نهایی</Badge>
          <span>= ثبت شده + موجودی + سند</span>
          <Badge className="bg-blue-100 text-blue-700 mx-1">پرداخت شده</Badge>
          <Badge className="bg-gray-100 text-gray-500 mx-1">پیش‌نویس</Badge>
          <span>= ذخیره موقت</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ShoppingCart className="w-12 h-12 mb-2 text-gray-300" />
              <p className="text-sm">فاکتور خریدی یافت نشد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-right text-xs">شماره</TableHead>
                  <TableHead className="text-right text-xs">تاریخ</TableHead>
                  <TableHead className="text-right text-xs hidden sm:table-cell">تامین‌کننده</TableHead>
                  <TableHead className="text-right text-xs hidden md:table-cell">انبار</TableHead>
                  <TableHead className="text-right text-xs">مبلغ</TableHead>
                  <TableHead className="text-center text-xs">نوع</TableHead>
                  <TableHead className="text-center text-xs">وضعیت</TableHead>
                  <TableHead className="text-center text-xs">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-purple-50/50">
                    <TableCell className="text-xs font-mono" dir="ltr">{inv.number}</TableCell>
                    <TableCell className="text-xs" dir="ltr">{formatDateToJalali(inv.invoiceDate)}</TableCell>
                    <TableCell className="text-xs hidden sm:table-cell">{inv.supplier?.name || '—'}</TableCell>
                    <TableCell className="text-xs hidden md:table-cell">{inv.warehouse?.name || '—'}</TableCell>
                    <TableCell className="text-xs font-bold" dir="ltr">{formatNumber(inv.totalAmount)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge variant="outline" className="text-[9px]">
                          {inv.paymentType === 'credit' ? 'نسیه' : 'نقدی'}
                        </Badge>
                        {(inv as any).invoiceType === 'service' && (
                          <Badge className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200">
                            خدمات
                          </Badge>
                        )}
                        {(inv as any).invoiceType === 'repair' && (
                          <Badge className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200">
                            تعمیرات
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {(inv as any).invoiceType === 'purchase_return' ? (
                        <Badge title="فاکتور برگشتی از خرید" className="bg-amber-100 text-amber-700">
                          برگشتی خرید
                        </Badge>
                      ) : (inv as any).invoiceType === 'service' ? (
                        <Badge title="فاکتور خدمات/تعمیرات" className="bg-blue-100 text-blue-700">
                          {inv.status === 'confirmed' ? 'ثبت نهایی' :
                           inv.status === 'paid' ? 'پرداخت شده' :
                           inv.status === 'draft' ? 'پیش‌نویس' :
                           inv.status === 'cancelled' ? 'لغو شده' :
                           inv.status}
                        </Badge>
                      ) : (
                        <Badge
                          title={
                            inv.status === 'confirmed' ? 'فاکتور ثبت شده و موجودی انبار و سند حسابداری به‌روزرسانی شده است.' :
                            inv.status === 'paid' ? 'فاکتور پرداخت شده.' :
                            inv.status === 'draft' ? 'فاکتور پیش‌نویس.' :
                            inv.status === 'cancelled' ? 'این فاکتور لغو شده است.' :
                            'وضعیت نامشخص'
                          }
                          className={
                            inv.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                            inv.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                            inv.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-500'
                          }
                        >
                          {inv.status === 'confirmed' ? 'ثبت نهایی' :
                           inv.status === 'paid' ? 'پرداخت شده' :
                           inv.status === 'draft' ? 'پیش‌نویس' :
                           inv.status === 'cancelled' ? 'لغو شده' :
                           inv.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPrintInvoiceId(inv.id)
                            setPrintInvoiceNumber(inv.number)
                            setPrintModalOpen(true)
                          }}
                          title="چاپ رسید"
                          className="h-7 w-7 p-0"
                        >
                          <Printer className="w-3.5 h-3.5 text-emerald-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(inv)}
                          disabled={inv.status === 'cancelled'}
                          title={inv.status === 'cancelled' ? 'فاکتور لغو شده قابل ویرایش نیست' : 'ویرایش فاکتور'}
                          className="h-7 w-7 p-0"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReturnClick(inv)}
                          disabled={inv.status === "cancelled" || (inv as any).invoiceType === "purchase_return"}
                          title={inv.status === "cancelled" ? "فاکتور لغو شده است" : ((inv as any).invoiceType === "purchase_return" ? "این فاکتور برگشتی است" : "ثبت برگشتی خرید")}
                          className="h-7 w-7 p-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingInvoice(inv)}
                          disabled={inv.status === 'cancelled'}
                          title={inv.status === 'cancelled' ? 'فاکتور لغو شده است' : 'حذف/لغو فاکتور'}
                          className="h-7 w-7 p-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ★★★ دیالوگ فاکتور خرید جدید/ویرایش — ساختار flex کامل با اسکرول صحیح */}
 {/* ★★★ مودال فاکتور خرید — کد کامل و اصلاح شده */}
{dialogOpen && (
  <>
    {/* Overlay */}
    <div
      onClick={closeDialog}
      className="fixed inset-0 bg-black/50 z-[9998]"
    />

    {/* مودال */}
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      <div className="w-full max-w-[800px] max-h-[95vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        {/* ★ هدر ثابت */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold">
            {editingInvoiceId ? 'ویرایش فاکتور خرید' : 'فاکتور خرید جدید'}
          </h2>
          {editingInvoiceId && (
            <p className="text-[10px] text-amber-600 mt-1">
              هنگام ویرایش، ابتدا اثرات فاکتور قدیمی برگشت می‌خورد و سپس اطلاعات جدید اعمال می‌شود.
            </p>
          )}
        </div>

        {/* ★ محتوای اسکرول‌پذیر */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3 min-h-0">
          
          {/* فیلدهای بالا */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <Label className="text-[10px]">تامین‌کننده</Label>
              <Select value={supplierId || 'none'} onValueChange={setSupplierId}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">انبار <span className="text-red-500">*</span></Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">پرداخت</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدی</SelectItem>
                  <SelectItem value="credit">نسیه</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <PersianDatePicker value={invoiceDate} onChange={(iso) => setInvoiceDate(iso)} label="تاریخ" />
            </div>
          </div>

          {/* جستجوی محصول */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="جستجو محصول..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pr-9 h-9"
            />
            {productSearchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {productSearchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleAddProduct(p)}
                    className="w-full text-right p-2 hover:bg-emerald-50 border-b border-gray-100 last:border-0 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-[10px] text-gray-400" dir="ltr">{p.code}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ★ سبد خرید */}
          {loadingEditItems ? (
            <div className="border border-gray-200 rounded-lg p-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-xs text-gray-500">در حال بارگذاری...</p>
            </div>
          ) : cart.length > 0 ? (
            <>
              {/* جدول با اسکرول داخلی */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-y-auto max-h-72">
                  <Table>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-right text-[10px] py-2">محصول</TableHead>
                        <TableHead className="text-center text-[10px] py-2 w-16">تعداد</TableHead>
                        <TableHead className="text-center text-[10px] py-2 w-24">قیمت</TableHead>
                        <TableHead className="text-center text-[10px] py-2 w-20">تخفیف</TableHead>
                        <TableHead className="text-center text-[10px] py-2 w-20">جمع</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map((item, index) => (
                        <TableRow key={index} className="hover:bg-gray-50/50">
                          <TableCell className="text-xs py-1.5">{item.productName}</TableCell>
                          <TableCell className="py-1 px-1">
                            <PersianNumberInput
                              value={item.quantity}
                              onChange={(v) => handleUpdateItem(index, 'quantity', v)}
                              className="h-7 text-xs text-center"
                            />
                          </TableCell>
                          <TableCell className="py-1 px-1">
                            <PersianNumberInput
                              value={item.unitPrice}
                              onChange={(v) => handleUpdateItem(index, 'unitPrice', v)}
                              className="h-7 text-xs text-center"
                              dir="ltr"
                            />
                          </TableCell>
                          <TableCell className="py-1 px-1">
                            <PersianNumberInput
                              value={item.discountAmount}
                              onChange={(v) => handleUpdateItem(index, 'discountAmount', v)}
                              className="h-7 text-xs text-center"
                              dir="ltr"
                            />
                          </TableCell>
                          <TableCell className="text-xs font-bold text-center py-1" dir="ltr">{formatNumber(item.lineTotal)}</TableCell>
                          <TableCell className="py-1">
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(index)} className="text-red-500 p-0 h-6 w-6">
                              <X className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ★ جمع کل — خارج از جدول */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">جمع کل:</span>
                  <span className="font-semibold" dir="ltr">{formatNumber(totals.subTotal)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">تخفیف:</span>
                    <span className="text-red-600" dir="ltr">-{formatNumber(totals.discount)}</span>
                  </div>
                )}
                {totals.tax > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">مالیات:</span>
                    <span className="text-amber-600" dir="ltr">+{formatNumber(totals.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-emerald-200 font-bold">
                  <span>مبلغ نهایی:</span>
                  <span className="text-emerald-700" dir="ltr">{formatNumber(totals.total)} ریال</span>
                </div>
              </div>
            </>
          ) : (
            <div className="border border-dashed border-gray-200 rounded-lg p-8 flex flex-col items-center justify-center gap-2 text-center">
              <Package className="w-8 h-8 text-gray-300" />
              <p className="text-xs text-gray-500">
                {editingInvoiceId ? 'آیتمی ندارد' : 'سبد خالی است'}
              </p>
            </div>
          )}

          {/* توضیحات */}
          <div>
            <Label className="text-[10px]">توضیحات</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-9" placeholder="اختیاری" />
          </div>
        </div>

        {/* ★ فوتر ثابت — دکمه‌ها ۱۰۰% دیده میشن */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex-shrink-0 flex items-center justify-end gap-2">
          {cart.length > 0 && (
            <span className="text-xs text-gray-400 mr-auto">{toFaNum(cart.length)} قلم کالا</span>
          )}
          <Button variant="outline" onClick={closeDialog} className="h-9">
            انصراف
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={submitting || loadingEditItems || (!editingInvoiceId && cart.length === 0)} 
            className="bg-emerald-600 hover:bg-emerald-700 h-9 gap-2"
          >
            {submitting || loadingEditItems ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {loadingEditItems 
              ? 'بارگذاری...' 
              : submitting 
                ? 'ثبت...' 
                : editingInvoiceId ? 'ذخیره' : 'ثبت'}
          </Button>
        </div>
      </div>
    </div>
  </>
)}
      {/* دیالوگ تأیید حذف/لغو فاکتور */}
      <Dialog open={!!deletingInvoice} onOpenChange={(open) => !open && setDeletingInvoice(null)}>
        <DialogContent className="sm:max-w-[450px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              لغو فاکتور خرید
            </DialogTitle>
            <DialogDescription className="text-xs">
              آیا از لغو فاکتور «{deletingInvoice?.number}» مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800 space-y-1">
              <p className="font-bold">توجه: این عمل قابل بازگشت نیست.</p>
              <p>هنگام لغو فاکتور، عملیات زیر انجام می‌شود:</p>
              <ul className="list-disc list-inside space-y-0.5 mr-2">
                <li>موجودی محصول در <b>Products.currentStock</b> کاهش می‌یابد</li>
                <li>موجودی محصول در <b>StockLevels</b> کاهش می‌یابد</li>
                <li>حرکت کالای مربوطه (<b>StockMovement</b>) حذف می‌شود</li>
                <li>سند حسابداری مربوطه <b>ابطال</b> می‌شود (نه حذف)</li>
                <li>اگر نسیه بوده، بدهی تامین‌کننده کاهش می‌یابد</li>
              </ul>
            </div>
            {deletingInvoice && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">شماره:</span><span className="font-mono">{deletingInvoice.number}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">مبلغ:</span><span className="font-bold">{formatNumber(deletingInvoice.totalAmount)} ریال</span></div>
                <div className="flex justify-between"><span className="text-slate-500">تامین‌کننده:</span><span>{deletingInvoice.supplier?.name || '—'}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingInvoice(null)}>انصراف</Button>
            <Button onClick={handleDeleteInvoice} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              بله، لغو کن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* مودال چاپ رسید فاکتور خرید */}
      <PurchaseInvoicePrintModal
        invoiceId={printInvoiceId}
        invoiceNumber={printInvoiceNumber}
        open={printModalOpen}
        onOpenChange={setPrintModalOpen}
        storeName={useAppStore.getState().storeName || 'فروشگاه'}
      />

      {/* دیالوگ برگشتی فاکتور خرید */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              ثبت برگشتی فاکتور خرید
            </DialogTitle>
            <DialogDescription className="text-xs">
              {returnInvoice &&
                `فاکتور ${returnInvoice.number} — انتخاب کالاهای مرجوعی به تامین‌کننده`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {returnDialogOpen && returnItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                <p className="text-xs text-gray-500">در حال بارگذاری آیتم‌ها و موجودی انبار...</p>
              </div>
            ) : (
              <>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-right p-2 font-medium">نام کالا</th>
                        <th className="text-center p-2 font-medium">
                          <span className="block">مقدار خرید</span>
                        </th>
                        <th className="text-center p-2 font-medium">
                          <span className="block text-emerald-700">موجودی فعلی</span>
                        </th>
                        <th className="text-center p-2 font-medium">مقدار برگشتی</th>
                        <th className="text-center p-2 font-medium">مبلغ برگشتی</th>
                        <th className="text-right p-2 font-medium">دلیل برگشت</th>
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
                              {isDisabled && (
                                <span className="mr-1 text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded">
                                  موجودی ندارد
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center text-gray-500">
                              {item.originalQuantity.toLocaleString('fa-IR')}
                            </td>
                            <td className="p-2 text-center">
                              <span className={`font-bold ${
                                item.currentStock === 0
                                  ? 'text-red-600'
                                  : item.currentStock < item.originalQuantity
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                              }`}>
                                {item.currentStock.toLocaleString('fa-IR')}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleReturnItemChange(index, 'quantity', e.target.value)}
                                min={0}
                                max={item.maxQuantity}
                                disabled={isDisabled}
                                className={`h-8 text-xs w-20 text-center ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              />
                              {!isDisabled && (
                                <p className="text-[9px] text-gray-400 mt-0.5">
                                  حداکثر: {item.maxQuantity.toLocaleString('fa-IR')}
                                </p>
                              )}
                            </td>
                            <td className="p-2 text-center font-medium text-amber-700">
                              {itemReturnAmount > 0 ? itemReturnAmount.toLocaleString('fa-IR') : '—'}
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.returnReason}
                                onChange={(e) => handleReturnItemChange(index, 'returnReason', e.target.value)}
                                placeholder="اختیاری"
                                disabled={isDisabled}
                                className="h-8 text-xs"
                              />
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
                    موجودی تمام کالاهای این فاکتور صفر است و امکان ثبت برگشتی وجود ندارد.
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                  ★ با ثبت برگشتی، موجودی انبار کاهش یافته و سند معکوس صادر می‌شود.
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setReturnDialogOpen(false)
                setReturnItems([])
                setReturnInvoice(null)
              }}
              disabled={returnSubmitting}
            >
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

      {/* دیالوگ فاکتور خرید تعمیرات و خدمات */}
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="border-b border-gray-100 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wrench className="w-5 h-5 text-blue-600" />
              فاکتور خرید تعمیرات و خدمات
            </DialogTitle>
            <DialogDescription className="text-xs">
              ثبت فاکتور برای تعمیر یا خدمتی که فروشگاه برای آن هزینه می‌کند (مثل تعمیر یخچال فروشگاه)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-bold">نوع فاکتور *</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setServiceCategory('repair')}
                  className={`p-2.5 rounded-lg border-2 transition-all text-right ${
                    serviceCategory === 'repair'
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${serviceCategory === 'repair' ? 'bg-amber-500' : 'bg-gray-300'}`}>
                      <Wrench className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">تعمیرات</p>
                      <p className="text-[10px] text-gray-500">تعمیر دستگاه، تعویض قطعه</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setServiceCategory('service')}
                  className={`p-2.5 rounded-lg border-2 transition-all text-right ${
                    serviceCategory === 'service'
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${serviceCategory === 'service' ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <Wrench className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">خدمات</p>
                      <p className="text-[10px] text-gray-500">نصب، آموزش، مشاوره</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      تامین‌کننده / تعمیرکار {serviceForm.paymentType === 'credit' && <span className="text-red-500">*</span>}
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setServiceDialogOpen(false)
                        setCurrentView('contacts' as any)
                        toast({
                          title: 'افزودن شخص جدید',
                          description: 'در صفحه طرف حساب، شخص جدید را اضافه کنید، سپس برگردید و فاکتور را صادر کنید',
                        })
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      افزودن شخص جدید
                    </button>
                  </div>
                  <select
                    value={serviceForm.supplierId}
                    onChange={(e) => setServiceForm({ ...serviceForm, supplierId: e.target.value })}
                    className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2 bg-white"
                  >
                    <option value="">— بدون تامین‌کننده (نقدی) —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      ⚠ هنوز تامین‌کننده‌ای ثبت نشده. روی «افزودن شخص جدید» کلیک کنید.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">دستگاه/محل انجام کار (اختیاری)</Label>
                  <Input
                    value={serviceForm.serviceDevice}
                    onChange={(e) => setServiceForm({ ...serviceForm, serviceDevice: e.target.value })}
                    placeholder="مثلاً: یخچال فروشگاه، کولر، دوربین"
                    className="text-xs mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">نحوه پرداخت</Label>
                  <select
                    value={serviceForm.paymentType}
                    onChange={(e) => setServiceForm({ ...serviceForm, paymentType: e.target.value })}
                    className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2 bg-white"
                  >
                    <option value="cash">💵 نقدی</option>
                    <option value="credit">📋 نسیه</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">
                  {serviceCategory === 'repair' ? '🔧 تعمیرات انجام‌شده' : '🛠️ خدمات دریافتی'} *
                </p>
                <Button size="sm" variant="outline" onClick={handleAddServiceItem} className="h-7 text-xs">
                  <Plus className="w-3 h-3 ml-1" />
                  افزودن
                </Button>
              </div>

              {serviceItems.length === 0 && (
                <div className="text-center py-4 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <Wrench className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                  <p className="text-xs text-gray-500">هنوز موردی اضافه نشده</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">روی «افزودن» کلیک کنید</p>
                </div>
              )}

              {serviceItems.map((item, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex-shrink-0">
                      {(index + 1).toLocaleString('fa-IR')}
                    </span>
                    <Input
                      value={item.serviceName}
                      onChange={(e) => handleServiceItemChange(index, 'serviceName', e.target.value)}
                      placeholder={serviceCategory === 'repair' ? 'نام تعمیر — مثلاً: تعمیر موتور یخچال' : 'نام خدمت — مثلاً: نصب دوربین'}
                      className="text-xs h-8 flex-1"
                    />
                    {serviceItems.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveServiceItem(index)}
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={item.description}
                    onChange={(e) => handleServiceItemChange(index, 'description', e.target.value)}
                    placeholder="توضیحات (اختیاری)"
                    className="text-xs h-8"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px] text-gray-500">مقدار</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleServiceItemChange(index, 'quantity', Number(e.target.value))}
                        className="text-xs h-8 mt-0.5"
                        min={0}
                        step="0.5"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500">واحد</Label>
                      <select
                        value={item.unitLabel}
                        onChange={(e) => handleServiceItemChange(index, 'unitLabel', e.target.value)}
                        className="w-full text-xs h-8 mt-0.5 border border-gray-200 rounded px-1 bg-white"
                      >
                        <option value="عدد">عدد</option>
                        <option value="ساعت">ساعت</option>
                        <option value="روز">روز</option>
                        <option value="ماه">ماه</option>
                        <option value="بازه">بازه</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500">مبلغ (ریال)</Label>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleServiceItemChange(index, 'unitPrice', Number(e.target.value))}
                        className="text-xs h-8 mt-0.5"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500">تخفیف</Label>
                      <Input
                        type="number"
                        value={item.discountAmount}
                        onChange={(e) => handleServiceItemChange(index, 'discountAmount', Number(e.target.value))}
                        className="text-xs h-8 mt-0.5"
                        min={0}
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-600 text-left bg-gray-50 rounded px-2 py-0.5">
                    جمع: <span className="font-bold">{((item.quantity * item.unitPrice) - item.discountAmount + item.taxAmount).toLocaleString('fa-IR')}</span> ریال
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Label className="text-xs">توضیحات کلی (اختیاری)</Label>
              <Textarea
                value={serviceForm.description}
                onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                placeholder="مثلاً: گارانتی یک‌ماهه دارد..."
                className="text-xs mt-1 min-h-[40px] resize-y"
              />
            </div>

            <div className="bg-blue-600 text-white rounded-lg p-2.5 flex justify-between items-center">
              <span className="text-xs">مبلغ قابل پرداخت:</span>
              <span className="font-bold text-sm">
                {serviceItems.reduce((sum, i) => sum + (i.quantity * i.unitPrice - i.discountAmount + i.taxAmount), 0).toLocaleString('fa-IR')} ریال
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-gray-100 pt-3">
            <Button variant="outline" onClick={() => setServiceDialogOpen(false)} disabled={serviceSubmitting}>
              انصراف
            </Button>
            <Button
              onClick={handleServiceSubmit}
              disabled={serviceSubmitting}
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
    </div>
  )
}