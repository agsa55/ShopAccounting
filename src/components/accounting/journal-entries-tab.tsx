'use client'

// ============================================================================
// src/components/accounting/journal-entries-tab.tsx — Journal Entries Tab
// ShopAccounting v29 — با قابلیت آفلاین کامل + ریسپانسیو
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchJournalEntries } from '@/lib/offline-api'
import { mockJournalEntries } from '@/lib/mock-data'
import { 
  cacheJournalEntries, 
  getCachedJournalEntries, 
  addJournalToSyncQueue,
  updateJournalSyncStatus,
} from '@/lib/offline-db'
import { syncEngine } from '@/lib/sync-engine'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  BookOpen, Plus, Search, Loader2, WifiOff, FileText, Eye,
  CheckCircle2, AlertCircle, Save, Pencil, Trash2, Printer,
  Ban, History, Clock, RefreshCw, Calendar,
  FileEdit, Scale,  // ← اضافه شدند
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

// ─── Types ────────────────────────────────────────────────────

interface JournalEntryItem {
  accountId: string
  accountName: string
  accountCode?: string
  debit: number
  credit: number
  description?: string
}

interface JournalEntry {
  id: string
  entryNumber: string
  number?: string
  date: string
  entryDate?: string
  description: string
  totalDebit: number
  totalCredit: number
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED'
  isPosted?: boolean
  sourceType?: string
  isManual?: boolean
  items?: JournalEntryItem[]
  lines?: JournalEntryItem[]
  referenceType?: string
  referenceId?: string
  // ★★★ فیلدهای آفلاین
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

// ─── Helpers ──────────────────────────────────────────────────

function formatCurrency(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(Number(price))) return '۰ ریال'
  return `${Number(price).toLocaleString('fa-IR')} ریال`
}

// ═══════════════════════════════════════════════════════════════
// ★ v9.4: formatDate با Parse دستی ISO — بدون باگ Timezone
// ═══════════════════════════════════════════════════════════════
function formatDate(d: string): string {
  if (!d) return '—'
  try {
    // Parse دستی ISO string بدون استفاده از Date (بدون مشکل timezone)
    // فرمت‌های مورد انتظار:
    //   - 2026-08-03
    //   - 2026-08-03T00:00:00
    //   - 2026-08-03T00:00:00.000Z
    //   - 2026-08-03T10:30:00+03:30
    const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      const gy = parseInt(isoMatch[1], 10)
      const gm = parseInt(isoMatch[2], 10)
      const gd = parseInt(isoMatch[3], 10)
      // اعتبارسنجی تاریخ
      if (gy >= 1900 && gy <= 2200 && gm >= 1 && gm <= 12 && gd >= 1 && gd <= 31) {
        const [jy, jm, jd] = gregorianToJalali(gy, gm, gd)
        return `${toFaNum(jy)}/${toFaNum(String(jm).padStart(2, '0'))}/${toFaNum(String(jd).padStart(2, '0'))}`
      }
    }

    // Fallback: اگر فرمت ISO نبود، از Date استفاده کن (برای backward compatibility)
    const fallback = new Date(d)
    if (!isNaN(fallback.getTime())) {
      return fallback.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    }
    return d
  } catch {
    return d
  }
}

// ★ v9.4: فرمت طولانی تاریخ (مثلاً: ۱۳ مرداد ۱۴۰۵)
function formatDateLong(d: string): string {
  if (!d) return '—'
  try {
    const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      const gy = parseInt(isoMatch[1], 10)
      const gm = parseInt(isoMatch[2], 10)
      const gd = parseInt(isoMatch[3], 10)
      if (gy >= 1900 && gy <= 2200 && gm >= 1 && gm <= 12 && gd >= 1 && gd <= 31) {
        const [jy, jm, jd] = gregorianToJalali(gy, gm, gd)
        return `${toFaNum(gd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}`
      }
    }
    return d
  } catch {
    return d
  }
}

function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

function getStatusBadge(status?: string, isPosted?: boolean) {
  const effective = status ?? (isPosted ? 'POSTED' : 'DRAFT')
  switch (effective) {
    case 'POSTED':
      return <Badge className="bg-emerald-100 text-emerald-700">ثبت‌شده</Badge>
    case 'DRAFT':
      return <Badge className="bg-amber-100 text-amber-700">پیش‌نویس</Badge>
    case 'CANCELLED':
      return <Badge className="bg-red-100 text-red-700">لغوشده</Badge>
    default:
      return <Badge>{effective}</Badge>
  }
}

function getSourceTypeLabel(sourceType?: string, isManual?: boolean): string {
  if (isManual) return 'دستی'
  if (!sourceType) return 'خودکار'
  switch (sourceType) {
    case 'invoice': return 'فاکتور'
    case 'payment': return 'پرداخت'
    case 'receipt': return 'دریافت'
    case 'expense': return 'هزینه'
    case 'manual': return 'دستی'
    case 'Automatic': return 'خودکار'
    default: return sourceType
  }
}

// ═══════════════════════════════════════════════════════════════
// Persian Date Picker (v3.25) — بدون تغییر
// ═══════════════════════════════════════════════════════════════

const LILAC = {
  popupBg: '#faf7ff', popupBgSolid: '#ffffff', headerBg: '#ede9fe',
  textPrimary: '#4c1d95', textSecondary: '#7c3aed', textMuted: '#a78bfa',
  textDisabled: '#d1d5db', textOnAccent: '#ffffff', border: '#e9d5ff',
  accent: '#7c3aed', accentLight: '#ede9fe', accentSoft: '#ddd6fe',
  todayBorder: '#a78bfa', todayText: '#6d28d9',
}

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

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
  let days = 365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * div(days, 146097)
  days = mod(days, 146097)
  if (days > 36524) { gy += 100 * div(--days, 36524); days = mod(days, 36524); if (days >= 365) days++ }
  gy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) { gy += div(days - 1, 365); days = mod(days - 1, 365) }
  let gd = days + 1
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm: number
  for (gm = 0; gm < 13; gm++) { const v = sal_a[gm]; if (gd <= v) break; gd -= v }
  return [gy, gm, gd]
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14, jp = breaks[0], jm = 0, jump = 0, n = 0  // ← leap حذف شد
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy)
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i]; jump = jm - jp
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
  let leap = mod(mod(n + 1, 33) - 1, 4)  // ← فقط یک بار تعریف می‌شود
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

  const [viewYear, setViewYear] = useState(initial.jy)
  const [viewMonth, setViewMonth] = useState(initial.jm)

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

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }
  const goNextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  const handleDayClick = (jd: number) => {
    if (isDayDisabled(jd)) return
    onChange(jalaliToISO(viewYear, viewMonth, jd))
    setOpen(false)
  }

  const navBtnStyle: CSSProperties = {
    padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent',
    color: LILAC.textSecondary, fontSize: 12, cursor: 'pointer', lineHeight: 1,
  }

  return (
    <div ref={containerRef} className="relative">
      {label && <Label className="text-[11px] text-gray-600 mb-0.5 block">{label}</Label>}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', height: 32, padding: '0 10px', borderRadius: 6,
          border: `1px solid ${LILAC.border}`, backgroundColor: LILAC.popupBg,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, cursor: 'pointer', fontSize: 12,
        }}
      >
        <span style={{ color: displayText ? LILAC.textPrimary : LILAC.textMuted }}>
          {displayText || placeholder}
        </span>
        <Calendar className="w-3.5 h-3.5" style={{ color: LILAC.textSecondary }} />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute z-50 mt-1 rounded-lg shadow-xl border"
            style={{
              backgroundColor: LILAC.popupBgSolid,
              borderColor: LILAC.border,
              minWidth: 280, padding: 12,
              top: '100%', right: 0,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <button style={navBtnStyle} onClick={() => setViewYear((y) => y - 1)}>«</button>
              <button style={navBtnStyle} onClick={goPrevMonth}>‹</button>
              <div style={{ color: LILAC.textPrimary, fontSize: 13, fontWeight: 600 }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button style={navBtnStyle} onClick={goNextMonth}>›</button>
              <button style={navBtnStyle} onClick={() => setViewYear((y) => y + 1)}>»</button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} className="text-center text-[10px] font-medium py-1"
                  style={{ color: i === 6 ? LILAC.textSecondary : LILAC.textMuted }}>
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />
                const isSelected = selectedJalali && selectedJalali.jy === viewYear && selectedJalali.jm === viewMonth && selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
                const isFriday = i % 7 === 6
                const disabled = isDayDisabled(d)
                return (
                  <button
                    key={i}
                    onClick={() => handleDayClick(d)}
                    style={{
                      height: 28, borderRadius: 5, fontSize: 11,
                      border: isSelected ? 'none' : (isToday ? `1px solid ${LILAC.todayBorder}` : 'none'),
                      backgroundColor: isSelected ? LILAC.accent : (isToday ? LILAC.accentLight : 'transparent'),
                      color: isSelected ? LILAC.textOnAccent : (disabled ? LILAC.textDisabled : (isToday ? LILAC.todayText : (isFriday ? LILAC.textSecondary : LILAC.textPrimary))),
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)),
                    }}
                  >
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>

            <div className="flex justify-between items-center mt-3 pt-2" style={{ borderTop: `1px solid ${LILAC.border}` }}>
              <span className="text-[10px]" style={{ color: LILAC.textMuted }}>
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]} {toFaNum(todayJalali.jy)}
              </span>
              <button
                onClick={() => { onChange(todayJalali.iso); setOpen(false) }}
                style={{ fontSize: 10, color: LILAC.accent, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                انتخاب امروز
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface DateRange { from: string; to: string }

function PersianDateRangePicker({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <div className="flex items-center gap-2">
      <PersianDatePicker value={value.from} onChange={(iso) => onChange({ ...value, from: iso })} placeholder="از تاریخ" />
      <span className="text-gray-400 text-sm">—</span>
      <PersianDatePicker value={value.to} onChange={(iso) => onChange({ ...value, to: iso })} placeholder="تا تاریخ" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main Component — Journal Entries Tab
// ═══════════════════════════════════════════════════════════════

export function JournalEntriesTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)
  const planName = useAppStore((s) => s.planName)
  const user = useAppStore((s) => s.user)
  const isManager = ['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner'].includes(user?.role || '')

  // ─── State: Entries & Accounts ───────────────────────────
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // ─── State: Filter & Pagination ─────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [entryDateRange, setEntryDateRange] = useState<DateRange>({ from: '', to: '' })
  const [currentPage, setCurrentPage] = useState(1)
  const [showCancelled, setShowCancelled] = useState(false)
  const entriesPerPage = 10

  // ─── State: Manual Entry Dialog ─────────────────────────
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [manualLines, setManualLines] = useState<Array<{
    accountId: string
    description: string
    debit: string
    credit: string
  }>>([
    { accountId: '', description: '', debit: '', credit: '' },
    { accountId: '', description: '', debit: '', credit: '' },
  ])
  const [manualDescription, setManualDescription] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0])
  const [manualSaving, setManualSaving] = useState(false)

  // ─── State: Detail Dialog ───────────────────────────────
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null)

  // ─── State: Cancel Dialog ───────────────────────────────
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelEntry, setCancelEntry] = useState<JournalEntry | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)

  // ─── State: Audit Log ───────────────────────────────────
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [auditLogEntry, setAuditLogEntry] = useState<JournalEntry | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLogLoading, setAuditLogLoading] = useState(false)

  // ═══════════════════════════════════════════════════════════
  // ★★★ Load Data (Bulletproof Offline + IndexedDB)
  // ═══════════════════════════════════════════════════════════
  
  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      // ۱. حالت آفلاین: خواندن از IndexedDB
      if (!isOnline) {
        const cachedEntries = await getCachedJournalEntries()
        if (cachedEntries.length > 0) {
          setEntries(cachedEntries as JournalEntry[])
          toast({ 
            title: "حالت آفلاین", 
            description: `${cachedEntries.length} سند از حافظه محلی بارگذاری شد`, 
            variant: "default" 
          })
        } else {
          setEntries((mockJournalEntries as unknown as JournalEntry[]) || [])
        }
        setLoading(false)
        return
      }

      // ۲. حالت آنلاین: دریافت از سرور
      const res = await fetchJournalEntries({ limit: 9999 })
      if (res.success && res.data) {
        const list = (res.data as any).journalEntries || (res.data as any).entries || res.data
        const finalList = Array.isArray(list) ? list : ((mockJournalEntries as unknown as JournalEntry[]) || [])
        
        setEntries(finalList)
        
        // ★★★ ذخیره در IndexedDB برای استفاده در حالت آفلاین
        await cacheJournalEntries(finalList)
      } else {
        // اگر سرور خطا داد اما کش داریم، از کش استفاده کن
        const cachedEntries = await getCachedJournalEntries()
        if (cachedEntries.length > 0) {
          setEntries(cachedEntries as JournalEntry[])
        } else {
          setEntries((mockJournalEntries as unknown as JournalEntry[]) || [])
        }
      }
    } catch (error: any) {
      console.warn("[JournalEntries] Fetch failed, using cached data:", error.message)
      const cachedEntries = await getCachedJournalEntries()
      if (cachedEntries.length > 0) {
        setEntries(cachedEntries as JournalEntry[])
        toast({ 
          title: "خطای شبکه", 
          description: "نمایش داده‌های ذخیره‌شده محلی", 
          variant: "default" 
        })
      } else {
        setEntries((mockJournalEntries as unknown as JournalEntry[]) || [])
      }
    } finally {
      setLoading(false)
    }
  }, [isOnline, toast])

  const loadAccounts = useCallback(async () => {
    try {
      // حالت آفلاین: خواندن از کش
      if (!isOnline) {
        const cachedData = localStorage.getItem('cached_accounts')
        if (cachedData) {
          try {
            setAccounts(JSON.parse(cachedData))
          } catch {
            setAccounts([])
          }
        }
        return
      }

      // حالت آنلاین: دریافت از سرور
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/accounts', {
        headers: { 
          'Content-Type': 'application/json', 
          ...(token ? { Authorization: `Bearer ${token}` } : {}) 
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          const accList = data.data.accounts || data.data || []
          if (Array.isArray(accList)) {
            const formatted = accList.map((a: any) => ({
              id: a.id, code: a.code, name: a.name, type: (a.type || 'asset'),
              parentId: a.parentId || null, isActive: a.isActive !== false, balance: a.balance || 0,
            }))
            setAccounts(formatted)
            localStorage.setItem('cached_accounts', JSON.stringify(formatted))
          }
        }
      }
    } catch (err) {
      console.error('[JournalEntries] loadAccounts error:', err)
      const cachedData = localStorage.getItem('cached_accounts')
      if (cachedData) {
        try { setAccounts(JSON.parse(cachedData)) } catch { setAccounts([]) }
      }
    }
  }, [isOnline])

  useEffect(() => {
    loadEntries()
    loadAccounts()
  }, [loadEntries, loadAccounts])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Create Manual Entry (با Optimistic UI + SyncQueue)
  // ═══════════════════════════════════════════════════════════

  const handleCreateManualEntry = useCallback(async () => {
    // Validation
    const validLines = manualLines.filter(l => l.accountId && (l.debit || l.credit))
    if (validLines.length < 2) {
      toast({ title: 'خطا', description: 'حداقل دو ردیف با حساب و مبلغ الزامی است', variant: 'destructive' })
      return
    }

    const totalDebit = validLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
    const totalCredit = validLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast({ 
        title: 'خطای تراز', 
        description: `جمع بدهکار (${totalDebit.toLocaleString('fa-IR')}) با جمع بستانکار (${totalCredit.toLocaleString('fa-IR')}) برابر نیست`, 
        variant: 'destructive' 
      })
      return
    }

    setManualSaving(true)
    try {
      const newEntry: JournalEntry = {
        id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        entryNumber: `OFF-${Date.now()}`,
        date: manualDate,
        description: manualDescription || 'سند دستی',
        totalDebit,
        totalCredit,
        status: 'DRAFT',
        isPosted: false,
        isManual: true,
        lines: validLines.map(l => {
          const acc = accounts.find(a => a.id === l.accountId)
          return {
            accountId: l.accountId,
            accountName: acc?.name || 'نامشخص',
            accountCode: acc?.code || '',
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
            description: l.description,
          }
        }),
        // ★★★ فیلدهای آفلاین
        _offline: true,
        _syncStatus: 'pending',
        _createdAt: Date.now(),
      }

      // ۱. Optimistic UI: افزودن فوری به لیست
      setEntries(prev => [newEntry, ...prev])

      // ۲. ذخیره در IndexedDB
      const updatedEntries = [newEntry, ...entries]
      await cacheJournalEntries(updatedEntries)

      // ۳. افزودن به SyncQueue
      await addJournalToSyncQueue('create', newEntry)

      // ۴. Trigger sync اگر آنلاین هستیم
      if (isOnline) {
        setTimeout(() => syncEngine.sync(), 100)
      }

      toast({ 
        title: '✓ سند ایجاد شد', 
        description: isOnline 
          ? 'سند در حال ارسال به سرور است' 
          : 'سند در صف همگام‌سازی قرار گرفت' 
      })

      // Reset form
      setManualEntryOpen(false)
      setManualLines([
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' },
      ])
      setManualDescription('')
      setManualDate(new Date().toISOString().split('T')[0])
    } catch (err: any) {
      console.error('[JournalEntries] Create error:', err)
      toast({ title: 'خطا', description: err.message || 'خطا در ایجاد سند', variant: 'destructive' })
    } finally {
      setManualSaving(false)
    }
  }, [manualLines, manualDate, manualDescription, accounts, entries, isOnline, toast])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Cancel Entry (لغو سند)
  // ═══════════════════════════════════════════════════════════

  const handleCancelEntry = useCallback(async () => {
    if (!cancelEntry) return
    if (!cancelReason.trim()) {
      toast({ title: 'خطا', description: 'دلیل لغو الزامی است', variant: 'destructive' })
      return
    }

    setCancelSaving(true)
    try {
      if (cancelEntry._offline) {
        // سند آفلاین: فقط از لیست محلی حذف کن
        const updated = entries.filter(e => e.id !== cancelEntry.id)
        setEntries(updated)
        await cacheJournalEntries(updated)
        toast({ title: '✓ لغو شد', description: 'سند آفلاین حذف شد' })
      } else {
        // سند آنلاین: درخواست به سرور
        if (!isOnline) {
          toast({ title: 'خطا', description: 'لغو سند آنلاین نیاز به اتصال دارد', variant: 'destructive' })
          return
        }

        const token = localStorage.getItem('token')
        const res = await fetch(`/api/journal-entries/${cancelEntry.id}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ reason: cancelReason }),
        })

        if (res.ok) {
          toast({ title: '✓ لغو شد', description: 'سند با موفقیت لغو شد' })
          await loadEntries()
        } else {
          const data = await res.json()
          throw new Error(data.error || 'خطا در لغو سند')
        }
      }

      setCancelDialogOpen(false)
      setCancelEntry(null)
      setCancelReason('')
    } catch (err: any) {
      toast({ title: 'خطا', description: err.message || 'خطا در لغو سند', variant: 'destructive' })
    } finally {
      setCancelSaving(false)
    }
  }, [cancelEntry, cancelReason, entries, isOnline, toast, loadEntries])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Load Audit Log (تاریخچه تغییرات سند)
  // ═══════════════════════════════════════════════════════════

  const loadAuditLog = useCallback(async (entry: JournalEntry) => {
    setAuditLogEntry(entry)
    setAuditLogOpen(true)
    setAuditLogLoading(true)

    if (entry._offline) {
      setAuditLogs([{
        action: 'CREATE',
        timestamp: entry._createdAt || Date.now(),
        user: 'آفلاین',
        description: 'سند در حالت آفلاین ایجاد شد',
      }])
      setAuditLogLoading(false)
      return
    }

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/journal-entries/${entry.id}/audit-log`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data.data || [])
      } else {
        setAuditLogs([])
      }
    } catch {
      setAuditLogs([])
    } finally {
      setAuditLogLoading(false)
    }
  }, [])

  // ═══════════════════════════════════════════════════════════
  // Filter & Pagination
  // ═══════════════════════════════════════════════════════════

  const filteredEntries = useMemo(() => {
    let result = entries
    
    // فیلتر اسناد لغوشده
    if (!showCancelled) {
      result = result.filter(e => e.status !== 'CANCELLED')
    }

    // فیلتر جستجو
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (e) =>
          (e.entryNumber || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.date || '').includes(q)
      )
    }

    // فیلتر تاریخ
    if (entryDateRange.from || entryDateRange.to) {
      result = result.filter((e) => {
        const entryDate = new Date(e.date).getTime()
        if (entryDateRange.from && entryDate < new Date(entryDateRange.from).getTime()) return false
        if (entryDateRange.to && entryDate > new Date(entryDateRange.to).getTime() + 86400000) return false
        return true
      })
    }
    return result
  }, [entries, searchQuery, entryDateRange, showCancelled])

  const totalPages = Math.ceil(filteredEntries.length / entriesPerPage)
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    const end = start + entriesPerPage
    return filteredEntries.slice(start, end)
  }, [filteredEntries, currentPage])

  useEffect(() => { setCurrentPage(1) }, [searchQuery, entryDateRange])

  // ═══════════════════════════════════════════════════════════
  // Stats
  // ═══════════════════════════════════════════════════════════

  const totalEntries = entries.length
  const postedCount = entries.filter((e) => e.status === 'POSTED' || e.isPosted === true).length
  const draftCount = entries.filter((e) => e.status === 'DRAFT' || (e.isPosted === false && !e.status)).length
  const cancelledCount = entries.filter((e) => e.status === 'CANCELLED').length
  const offlineCount = entries.filter((e) => e._offline).length
  const totalDebit = entries.reduce(
    (sum, e) => sum + (e.totalDebit || (e.lines || e.items || []).reduce((s, l) => s + (l.debit || 0), 0)),
    0
  )

  // ═══════════════════════════════════════════════════════════
  // Helper: Add Manual Line
  // ═══════════════════════════════════════════════════════════

  const addManualLine = () => {
    setManualLines([...manualLines, { accountId: '', description: '', debit: '', credit: '' }])
  }

  const removeManualLine = (index: number) => {
    if (manualLines.length <= 2) {
      toast({ title: 'خطا', description: 'حداقل دو ردیف الزامی است', variant: 'destructive' })
      return
    }
    setManualLines(manualLines.filter((_, i) => i !== index))
  }

  const updateManualLine = (index: number, field: string, value: string) => {
    const updated = [...manualLines]
    updated[index] = { ...updated[index], [field]: value }
    setManualLines(updated)
  }

  const manualTotalDebit = manualLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const manualTotalCredit = manualLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const manualBalanceDiff = Math.abs(manualTotalDebit - manualTotalCredit)

    // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4" dir="rtl">
      {/* ★★★ بنر هشدار آفلاین */}
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> اسناد جدید در حافظه محلی ذخیره شده و پس از اتصال به سرور ارسال می‌شوند.
          </div>
        </div>
      )}

 {/* ═══════════════════════════════════════════════════════
    Stats Cards — خیلی کوچک و رنگی
═══════════════════════════════════════════════════════ */}
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-1.5">
  {/* کل اسناد */}
  <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">کل اسناد</span>
      <BookOpen className="w-2.5 h-2.5 text-blue-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-blue-700">{totalEntries.toLocaleString('fa-IR')}</div>
  </div>

  {/* ثبت‌شده */}
  <div className="relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600 truncate">ثبت‌شده</span>
      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-emerald-700">{postedCount.toLocaleString('fa-IR')}</div>
  </div>

  {/* پیش‌نویس */}
  <div className="relative overflow-hidden rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-amber-600 truncate">پیش‌نویس</span>
      <FileEdit className="w-2.5 h-2.5 text-amber-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-amber-700">{draftCount.toLocaleString('fa-IR')}</div>
  </div>

  {/* جمع بدهکار */}
  <div className="relative overflow-hidden rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2 hidden lg:block">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-purple-600 truncate">جمع بدهکار</span>
      <Scale className="w-2.5 h-2.5 text-purple-400 shrink-0" />
    </div>
    <div className="text-[10px] sm:text-xs font-bold text-purple-700 truncate">{formatCurrency(totalDebit)}</div>
  </div>

  {/* در انتظار sync */}
  {offlineCount > 0 && (
    <div className="relative overflow-hidden rounded-md border border-orange-300 bg-gradient-to-br from-orange-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[8px] sm:text-[9px] font-medium text-orange-600 flex items-center gap-0.5 truncate">
          <Clock className="w-2 h-2 shrink-0" /> در انتظار sync
        </span>
      </div>
      <div className="text-xs sm:text-sm font-bold text-orange-700">{offlineCount.toLocaleString('fa-IR')}</div>
    </div>
  )}
</div>
      {/* ═══════════════════════════════════════════════════════
          Toolbar — ریسپانسیو (ستونی در موبایل، ردیفی در دسکتاپ)
      ═══════════════════════════════════════════════════════ */}
      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row gap-2 sm:gap-3">
            {/* جستجو */}
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در شماره سند، شرح، تاریخ..."
                className="pr-8 text-xs h-9"
              />
            </div>

            {/* فیلتر تاریخ */}
            <div className="w-full lg:w-auto lg:min-w-[280px]">
              <PersianDateRangePicker
                value={entryDateRange}
                onChange={setEntryDateRange}
              />
            </div>

            {/* دکمه‌ها */}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={showCancelled ? 'default' : 'outline'}
                className="text-xs h-9 flex-1 lg:flex-none"
                onClick={() => setShowCancelled(!showCancelled)}
              >
                <Ban className="w-3.5 h-3.5 ml-1" />
                {showCancelled ? 'مخفی‌سازی لغوشده' : 'نمایش لغوشده'}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 flex-1 lg:flex-none"
                onClick={() => {
                  setManualEntryOpen(true)
                  setManualLines([
                    { accountId: '', description: '', debit: '', credit: '' },
                    { accountId: '', description: '', debit: '', credit: '' },
                  ])
                  setManualDescription('')
                  setManualDate(new Date().toISOString().split('T')[0])
                }}
              >
                <Plus className="w-3.5 h-3.5 ml-1" />
                سند جدید
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          Loading State
      ═══════════════════════════════════════════════════════ */}
      {loading ? (
        <Card className="border-gray-200">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">در حال بارگذاری اسناد...</p>
          </CardContent>
        </Card>
      ) : paginatedEntries.length === 0 ? (
        /* ═══════════════════════════════════════════════════════
            Empty State
        ═══════════════════════════════════════════════════════ */
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <BookOpen className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">سندی یافت نشد</h3>
            <p className="text-sm text-gray-400 text-center max-w-md">
              {entries.length === 0
                ? 'هنوز هیچ سند حسابداری ثبت نشده است. برای ایجاد سند دستی، روی دکمه «سند جدید» کلیک کنید.'
                : 'با فیلترهای فعلی، سندی یافت نشد. فیلترها را تغییر دهید.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════════
              نمای دسکتاپ (جدول) — فقط در lg و بالاتر
          ═══════════════════════════════════════════════════════ */}
          <div className="hidden lg:block">
            <Card className="border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-right text-xs w-24">شماره</TableHead>
                      <TableHead className="text-right text-xs w-28">تاریخ</TableHead>
                      <TableHead className="text-right text-xs">شرح</TableHead>
                      <TableHead className="text-right text-xs w-24">منبع</TableHead>
                      <TableHead className="text-right text-xs w-32">بدهکار</TableHead>
                      <TableHead className="text-right text-xs w-32">بستانکار</TableHead>
                      <TableHead className="text-right text-xs w-24">وضعیت</TableHead>
                      <TableHead className="text-right text-xs w-36">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEntries.map((entry) => (
                      <TableRow key={entry.id} className="hover:bg-gray-50/50">
                        <TableCell className="text-xs font-mono">
                          {entry.entryNumber || entry.number || '—'}
                          {/* ★★★ نشانگر آفلاین */}
                          {entry._offline && (
                            <Badge className="bg-orange-100 text-orange-700 mr-1 text-[9px]">
                              <Clock className="w-2.5 h-2.5 ml-0.5" />
                              آفلاین
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(entry.date)}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{entry.description}</TableCell>
                        <TableCell className="text-xs">{getSourceTypeLabel(entry.sourceType, entry.isManual)}</TableCell>
                        <TableCell className="text-xs text-red-600">{formatCurrency(entry.totalDebit)}</TableCell>
                        <TableCell className="text-xs text-emerald-600">{formatCurrency(entry.totalCredit)}</TableCell>
                        <TableCell>{getStatusBadge(entry.status, entry.isPosted)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => setDetailEntry(entry)}
                              title="مشاهده جزئیات"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => loadAuditLog(entry)}
                              title="تاریخچه تغییرات"
                            >
                              <History className="w-3.5 h-3.5" />
                            </Button>
                            {isManager && !entry._offline && entry.status !== 'CANCELLED' && (
                              <Button
                                size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                                onClick={() => { setCancelEntry(entry); setCancelDialogOpen(true) }}
                                title="لغو سند"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* ═══════════════════════════════════════════════════════
              نمای موبایل (کارت‌ها) — فقط زیر lg
          ═══════════════════════════════════════════════════════ */}
          <div className="lg:hidden space-y-3">
            {paginatedEntries.map((entry) => (
              <Card key={entry.id} className="border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  {/* هدر کارت: شماره + وضعیت */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-800 font-mono">
                        {entry.entryNumber || entry.number || '—'}
                      </span>
                      {getStatusBadge(entry.status, entry.isPosted)}
                      {/* ★★★ نشانگر آفلاین */}
                      {entry._offline && (
                        <Badge className="bg-orange-100 text-orange-700 text-[9px]">
                          <Clock className="w-2.5 h-2.5 ml-0.5" />
                          آفلاین
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500">{formatDate(entry.date)}</span>
                  </div>

                  {/* شرح */}
                  <p className="text-xs text-gray-600 mb-3 line-clamp-2">{entry.description}</p>

                  {/* مبالغ */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-red-50 border border-red-100 rounded p-2">
                      <div className="text-[10px] text-red-600 mb-0.5">بدهکار</div>
                      <div className="text-xs font-bold text-red-700">{formatCurrency(entry.totalDebit)}</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded p-2">
                      <div className="text-[10px] text-emerald-600 mb-0.5">بستانکار</div>
                      <div className="text-xs font-bold text-emerald-700">{formatCurrency(entry.totalCredit)}</div>
                    </div>
                  </div>

                  {/* دکمه‌های عملیات */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1" onClick={() => setDetailEntry(entry)}>
                      <Eye className="w-3.5 h-3.5 ml-1" /> جزئیات
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1" onClick={() => loadAuditLog(entry)}>
                      <History className="w-3.5 h-3.5 ml-1" /> تاریخچه
                    </Button>
                    {isManager && !entry._offline && entry.status !== 'CANCELLED' && (
                      <Button 
                        size="sm" variant="outline" 
                        className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { setCancelEntry(entry); setCancelDialogOpen(true) }}
                      >
                        <Ban className="w-3.5 h-3.5 ml-1" /> لغو
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ═══════════════════════════════════════════════════════
              Pagination — ریسپانسیو
          ═══════════════════════════════════════════════════════ */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                size="sm" variant="outline"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="text-xs"
              >
                قبلی
              </Button>
              <span className="text-xs text-gray-600">
                صفحه {currentPage.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')}
              </span>
              <Button
                size="sm" variant="outline"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="text-xs"
              >
                بعدی
              </Button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Manual Entry (Create) — ریسپانسیو + fullscreen موبایل
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={manualEntryOpen} onOpenChange={setManualEntryOpen}>
        <DialogContent className="max-w-4xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto sm:max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Plus className="w-4 h-4 text-emerald-600" />
              ثبت سند حسابداری دستی
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              سند دوطرفه با ردیف‌های بدهکار و بستانکار
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* شرح و تاریخ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">شرح سند *</Label>
                <Input
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="مثلاً: پرداخت اجاره فروشگاه"
                  className="text-xs mt-1 h-9"
                />
              </div>
              <div>
                <PersianDatePicker
                  value={manualDate}
                  onChange={setManualDate}
                  placeholder="انتخاب تاریخ"
                  label="تاریخ سند *"
                />
              </div>
            </div>

            {/* ردیف‌های سند */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">ردیف‌های سند</Label>
                <Button size="sm" variant="outline" onClick={addManualLine} className="text-xs h-7">
                  <Plus className="w-3 h-3 ml-1" /> افزودن ردیف
                </Button>
              </div>

              {/* هدر ردیف‌ها — فقط دسکتاپ */}
              <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] text-gray-500 font-medium px-1">
                <div className="col-span-4">حساب</div>
                <div className="col-span-3">شرح ردیف</div>
                <div className="col-span-2">بدهکار</div>
                <div className="col-span-2">بستانکار</div>
                <div className="col-span-1"></div>
              </div>

              {manualLines.map((line, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-2 md:p-1 md:border-0 md:bg-transparent">
                  {/* نمای موبایل: برچسب‌دار */}
                  <div className="md:hidden space-y-2">
                    <div>
                      <Label className="text-[10px] text-gray-500">حساب</Label>
                      <select
                        value={line.accountId}
                        onChange={(e) => updateManualLine(index, 'accountId', e.target.value)}
                        className="w-full text-xs mt-0.5 h-8 border border-gray-200 rounded px-2 bg-white"
                      >
                        <option value="">— انتخاب حساب —</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-500">شرح ردیف</Label>
                      <Input
                        value={line.description}
                        onChange={(e) => updateManualLine(index, 'description', e.target.value)}
                        placeholder="شرح اختیاری"
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-gray-500">بدهکار</Label>
                        <Input
                          type="number"
                          value={line.debit}
                          onChange={(e) => updateManualLine(index, 'debit', e.target.value)}
                          placeholder="0"
                          className="text-xs h-8"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-gray-500">بستانکار</Label>
                        <Input
                          type="number"
                          value={line.credit}
                          onChange={(e) => updateManualLine(index, 'credit', e.target.value)}
                          placeholder="0"
                          className="text-xs h-8"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button 
                        size="sm" variant="ghost" 
                        className="text-red-500 h-7 text-xs"
                        onClick={() => removeManualLine(index)}
                      >
                        <Trash2 className="w-3 h-3 ml-1" /> حذف ردیف
                      </Button>
                    </div>
                  </div>

                  {/* نمای دسکتاپ: ردیفی */}
                  <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <select
                        value={line.accountId}
                        onChange={(e) => updateManualLine(index, 'accountId', e.target.value)}
                        className="w-full text-xs h-8 border border-gray-200 rounded px-2 bg-white"
                      >
                        <option value="">— انتخاب حساب —</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={line.description}
                        onChange={(e) => updateManualLine(index, 'description', e.target.value)}
                        placeholder="شرح اختیاری"
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={line.debit}
                        onChange={(e) => updateManualLine(index, 'debit', e.target.value)}
                        placeholder="0"
                        className="text-xs h-8"
                        dir="ltr"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={line.credit}
                        onChange={(e) => updateManualLine(index, 'credit', e.target.value)}
                        placeholder="0"
                        className="text-xs h-8"
                        dir="ltr"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => removeManualLine(index)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* جمع‌ها و وضعیت تراز */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">جمع بدهکار:</span>
                  <span className="font-bold text-red-600">{manualTotalDebit.toLocaleString('fa-IR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">جمع بستانکار:</span>
                  <span className="font-bold text-emerald-600">{manualTotalCredit.toLocaleString('fa-IR')}</span>
                </div>
              </div>
              {manualBalanceDiff > 0.01 ? (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>اختلاف تراز: {manualBalanceDiff.toLocaleString('fa-IR')} ریال</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded p-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>سند متوازن است ✓</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setManualEntryOpen(false)} disabled={manualSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button
              onClick={handleCreateManualEntry}
              disabled={manualSaving || manualBalanceDiff > 0.01}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
            >
              {manualSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
              {manualSaving ? 'در حال ذخیره...' : 'ذخیره سند'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Entry Detail — ریسپانسیو
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          {detailEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap text-base sm:text-lg">
                  <FileText className="w-4 h-4 text-blue-600" />
                  سند {detailEntry.entryNumber || detailEntry.number || '—'}
                  {getStatusBadge(detailEntry.status, detailEntry.isPosted)}
                  {detailEntry._offline && (
                    <Badge className="bg-orange-100 text-orange-700 text-[10px]">
                      <Clock className="w-2.5 h-2.5 ml-0.5" /> آفلاین
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  {detailEntry.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* اطلاعات کلی */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">تاریخ</div>
                   <div className="font-medium">{formatDateLong(detailEntry.date)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">منبع</div>
                    <div className="font-medium">{getSourceTypeLabel(detailEntry.sourceType, detailEntry.isManual)}</div>
                  </div>
                  <div className="bg-red-50 rounded p-2">
                    <div className="text-red-600 text-[10px] mb-0.5">جمع بدهکار</div>
                    <div className="font-bold text-red-700">{formatCurrency(detailEntry.totalDebit)}</div>
                  </div>
                  <div className="bg-emerald-50 rounded p-2">
                    <div className="text-emerald-600 text-[10px] mb-0.5">جمع بستانکار</div>
                    <div className="font-bold text-emerald-700">{formatCurrency(detailEntry.totalCredit)}</div>
                  </div>
                </div>

                {/* ردیف‌های سند — دسکتاپ */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-right text-xs">حساب</TableHead>
                        <TableHead className="text-right text-xs">شرح</TableHead>
                        <TableHead className="text-right text-xs">بدهکار</TableHead>
                        <TableHead className="text-right text-xs">بستانکار</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detailEntry.lines || detailEntry.items || []).map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">
                            <span className="font-mono text-gray-500 ml-1">{line.accountCode || '—'}</span>
                            {line.accountName}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">{line.description || '—'}</TableCell>
                          <TableCell className="text-xs text-red-600">{line.debit > 0 ? formatCurrency(line.debit) : '—'}</TableCell>
                          <TableCell className="text-xs text-emerald-600">{line.credit > 0 ? formatCurrency(line.credit) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* ردیف‌های سند — موبایل */}
                <div className="sm:hidden space-y-2">
                  {(detailEntry.lines || detailEntry.items || []).map((line, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-2">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-medium">{line.accountName}</span>
                        <span className="text-[10px] text-gray-500 font-mono">{line.accountCode || '—'}</span>
                      </div>
                      {line.description && <p className="text-[10px] text-gray-500 mb-2">{line.description}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-red-50 rounded p-1.5 text-center">
                          <div className="text-[9px] text-red-600">بدهکار</div>
                          <div className="text-[11px] font-bold text-red-700">{line.debit > 0 ? formatCurrency(line.debit) : '—'}</div>
                        </div>
                        <div className="bg-emerald-50 rounded p-1.5 text-center">
                          <div className="text-[9px] text-emerald-600">بستانکار</div>
                          <div className="text-[11px] font-bold text-emerald-700">{line.credit > 0 ? formatCurrency(line.credit) : '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailEntry(null)} className="w-full sm:w-auto">بستن</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Cancel Confirmation
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 text-base">
              <Ban className="w-4 h-4" />
              لغو سند حسابداری
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              سند <strong>{cancelEntry?.entryNumber || cancelEntry?.number}</strong> لغو خواهد شد. این عمل غیرقابل بازگشت است.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Label className="text-xs">دلیل لغو *</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="دلیل لغو سند را وارد کنید..."
              className="text-xs mt-1"
              rows={3}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button
              onClick={handleCancelEntry}
              disabled={cancelSaving || !cancelReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
            >
              {cancelSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Ban className="w-4 h-4 ml-1" />}
              لغو سند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Audit Log
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={auditLogOpen} onOpenChange={setAuditLogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4 text-blue-600" />
              تاریخچه تغییرات سند {auditLogEntry?.entryNumber || auditLogEntry?.number || '—'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {auditLogLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">تاریخچه‌ای ثبت نشده است</div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge className="text-[10px]">{log.action}</Badge>
                      <span className="text-[10px] text-gray-500">
                        {new Date(log.timestamp).toLocaleString('fa-IR')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">{log.description}</p>
                    {log.user && <p className="text-[10px] text-gray-400 mt-1">کاربر: {log.user}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditLogOpen(false)} className="w-full sm:w-auto">بستن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default JournalEntriesTab