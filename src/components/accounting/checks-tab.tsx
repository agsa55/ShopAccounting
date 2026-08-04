'use client'

// ============================================================================
// src/components/accounting/checks-tab.tsx — Checks Tab
// ShopAccounting v29 — با قابلیت آفلاین کامل + ریسپانسیو
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus, Search, Loader2, WifiOff, CreditCard, Eye,
  CheckCircle2, AlertCircle, Save, Pencil, Trash2, Calendar,
  Ban, Clock, RefreshCw, Landmark,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Types ────────────────────────────────────────────────────

interface Check {
  id: string
  type: 'receivable' | 'payable'
  checkNumber: string
  bankName: string
  amount: number
  dueDate: string
  customerId?: string | null
  payee?: string | null
  status: 'pending' | 'deposited' | 'cleared' | 'bounced'
  createdAt?: string
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

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('fa-IR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch {
    return d
  }
}

function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700">در جریان</Badge>
    case 'deposited':
      return <Badge className="bg-blue-100 text-blue-700">نزد بانک</Badge>
    case 'cleared':
      return <Badge className="bg-emerald-100 text-emerald-700">وصول شده</Badge>
    case 'bounced':
      return <Badge className="bg-red-100 text-red-700">برگشت خورده</Badge>
    default:
      return <Badge>{status}</Badge>
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'در جریان'
    case 'deposited': return 'نزد بانک'
    case 'cleared': return 'وصول شده'
    case 'bounced': return 'برگشت خورده'
    default: return status
  }
}

// ═══════════════════════════════════════════════════════════════
// Persian Date Picker (single date) — برای تاریخ سررسید چک
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
  let leapJ = -14, jp = breaks[0], jm = 0, jump = 0, n = 0
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
  let leap = mod(mod(n + 1, 33) - 1, 4)
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

// ═══════════════════════════════════════════════════════════════
// Main Component — ChecksTab
// ═══════════════════════════════════════════════════════════════

export function ChecksTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  // ─── State: Checks ────────────────────────────────────────
  const [checks, setChecks] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)
  
  // ─── State: Filter ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'receivable' | 'payable'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'deposited' | 'cleared' | 'bounced'>('all')

  // ─── State: Check Dialog (Add/Edit) ───────────────────────
  const [checkDialogOpen, setCheckDialogOpen] = useState(false)
  const [checkFormMode, setCheckFormMode] = useState<'add' | 'edit'>('add')
  const [checkFormId, setCheckFormId] = useState('')
  const [checkType, setCheckType] = useState<'receivable' | 'payable'>('receivable')
  const [checkNumber, setCheckNumber] = useState('')
  const [checkBank, setCheckBank] = useState('')
  const [checkAmount, setCheckAmount] = useState('')
  const [checkDueDate, setCheckDueDate] = useState(new Date().toISOString().split('T')[0])
  const [checkCustomerId, setCheckCustomerId] = useState('')
  const [checkPayee, setCheckPayee] = useState('')
  const [checkSaving, setCheckSaving] = useState(false)

  // ─── State: Delete Dialog ─────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Check | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  // ─── State: Detail Dialog ─────────────────────────────────
  const [detailCheck, setDetailCheck] = useState<Check | null>(null)

  // ═══════════════════════════════════════════════════════════
  // ★★★ Load Data (Bulletproof Offline + IndexedDB)
  // ═══════════════════════════════════════════════════════════

  const loadChecks = useCallback(async () => {
    setLoading(true)
    try {
      // ۱. حالت آفلاین: خواندن از IndexedDB
      if (!isOnline) {
        const cachedChecks = await getCachedChecks()
        if (cachedChecks.length > 0) {
          setChecks(cachedChecks as Check[])
          toast({ 
            title: "حالت آفلاین", 
            description: `${cachedChecks.length} چک از حافظه محلی بارگذاری شد`, 
            variant: "default" 
          })
        } else {
          setChecks([])
        }
        setLoading(false)
        return
      }

      // ۲. حالت آنلاین: دریافت از سرور
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/checks', { 
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } 
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          const checkList = data.data.checks || data.data || []
          setChecks(checkList)
          // ★★★ ذخیره در IndexedDB برای استفاده در حالت آفلاین
          await cacheChecks(checkList)
        }
      } else {
        // اگر سرور خطا داد، از کش استفاده کن
        const cachedChecks = await getCachedChecks()
        if (cachedChecks.length > 0) {
          setChecks(cachedChecks as Check[])
        }
      }
    } catch (error: any) {
      console.warn("[ChecksTab] Fetch failed, using cached data:", error.message)
      const cachedChecks = await getCachedChecks()
      if (cachedChecks.length > 0) {
        setChecks(cachedChecks as Check[])
        toast({ 
          title: "خطای شبکه", 
          description: "نمایش داده‌های ذخیره‌شده محلی", 
          variant: "default" 
        })
      } else {
        setChecks([])
      }
    } finally {
      setLoading(false)
    }
  }, [isOnline, toast])

  useEffect(() => {
    loadChecks()
  }, [loadChecks])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Create Check (با Optimistic UI + SyncQueue)
  // ═══════════════════════════════════════════════════════════

  const handleCreateCheck = useCallback(async () => {
    // Validation
    if (!checkNumber.trim() || !checkBank.trim() || !checkAmount.trim()) {
      toast({ title: 'خطا', description: 'شماره چک، بانک و مبلغ الزامی است', variant: 'destructive' })
      return
    }

    const amount = parseFloat(checkAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ چک باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }

    setCheckSaving(true)
    try {
      const newCheck: Check = {
        id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: checkType,
        checkNumber: checkNumber.trim(),
        bankName: checkBank.trim(),
        amount,
        dueDate: checkDueDate,
        customerId: checkCustomerId || null,
        payee: checkPayee || null,
        status: 'pending',
        // ★★★ فیلدهای آفلاین
        _offline: true,
        _syncStatus: 'pending',
        _createdAt: Date.now(),
      }

      if (checkFormMode === 'edit') {
        // ویرایش چک موجود
        const updated = checks.map(c => 
          c.id === checkFormId 
            ? { ...c, type: checkType, checkNumber: checkNumber.trim(), bankName: checkBank.trim(), amount, dueDate: checkDueDate, customerId: checkCustomerId || null, payee: checkPayee || null }
            : c
        )
        setChecks(updated)
        await cacheChecks(updated)
        
        // افزودن عملیات update به SyncQueue
        await addCheckToSyncQueue('update', { ...newCheck, id: checkFormId })
        
        toast({ title: '✓ چک ویرایش شد', description: isOnline ? 'در حال ارسال به سرور' : 'در صف همگام‌سازی قرار گرفت' })
      } else {
        // ایجاد چک جدید
        setChecks(prev => [newCheck, ...prev])
        const updated = [newCheck, ...checks]
        await cacheChecks(updated)
        
        // افزودن عملیات create به SyncQueue
        await addCheckToSyncQueue('create', newCheck)
        
        toast({ title: '✓ چک ایجاد شد', description: isOnline ? 'در حال ارسال به سرور' : 'در صف همگام‌سازی قرار گرفت' })
      }

      // Trigger sync اگر آنلاین هستیم
      if (isOnline) {
        setTimeout(() => syncEngine.sync(), 100)
      }

      // Reset form
      setCheckDialogOpen(false)
      setCheckFormMode('add')
      setCheckFormId('')
      setCheckType('receivable')
      setCheckNumber('')
      setCheckBank('')
      setCheckAmount('')
      setCheckDueDate(new Date().toISOString().split('T')[0])
      setCheckCustomerId('')
      setCheckPayee('')
    } catch (err: any) {
      console.error('[ChecksTab] Create error:', err)
      toast({ title: 'خطا', description: err.message || 'خطا در ایجاد چک', variant: 'destructive' })
    } finally {
      setCheckSaving(false)
    }
  }, [checkFormMode, checkFormId, checkType, checkNumber, checkBank, checkAmount, checkDueDate, checkCustomerId, checkPayee, checks, isOnline, toast])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Change Check Status (سپردن، وصول، برگشت)
  // ═══════════════════════════════════════════════════════════

  const handleCheckStatus = useCallback(async (checkId: string, newStatus: 'deposited' | 'cleared' | 'bounced') => {
    const check = checks.find(c => c.id === checkId)
    if (!check) return

    try {
      // Optimistic UI: به‌روزرسانی فوری
      const updated = checks.map(c => 
        c.id === checkId ? { ...c, status: newStatus } : c
      )
      setChecks(updated)
      await cacheChecks(updated)

      if (check._offline) {
        // چک آفلاین: فقط در صف sync قرار بده
        await addCheckToSyncQueue('status_change', { ...check, status: newStatus })
        toast({ title: '✓ وضعیت به‌روزرسانی شد', description: 'در صف همگام‌سازی قرار گرفت' })
      } else {
        // چک آنلاین: درخواست به سرور
        if (!isOnline) {
          toast({ title: 'خطا', description: 'تغییر وضعیت چک آنلاین نیاز به اتصال دارد', variant: 'destructive' })
          // برگرداندن تغییر
          setChecks(checks)
          return
        }

        const token = localStorage.getItem('token')
        const res = await fetch(`/api/checks/${checkId}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json', 
            ...(token ? { Authorization: `Bearer ${token}` } : {}) 
          },
          body: JSON.stringify({ status: newStatus }),
        })

        if (res.ok) {
          toast({ title: '✓ موفق', description: 'وضعیت چک به‌روزرسانی شد' })
        } else {
          const data = await res.json()
          throw new Error(data.error || 'خطا در به‌روزرسانی')
        }
      }

      // Trigger sync اگر آنلاین هستیم
      if (isOnline) {
        setTimeout(() => syncEngine.sync(), 100)
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err.message || 'خطا در به‌روزرسانی چک', variant: 'destructive' })
      // برگرداندن تغییر
      await loadChecks()
    }
  }, [checks, isOnline, toast, loadChecks])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Delete Check
  // ═══════════════════════════════════════════════════════════

  const handleDeleteCheck = useCallback(async () => {
    if (!deleteTarget) return

    setDeleteSaving(true)
    try {
      if (deleteTarget._offline) {
        // چک آفلاین: فقط از لیست محلی حذف کن
        const updated = checks.filter(c => c.id !== deleteTarget.id)
        setChecks(updated)
        await cacheChecks(updated)
        toast({ title: '✓ حذف شد', description: 'چک آفلاین حذف شد' })
      } else {
        // چک آنلاین: درخواست به سرور
        if (!isOnline) {
          toast({ title: 'خطا', description: 'حذف چک آنلاین نیاز به اتصال دارد', variant: 'destructive' })
          setDeleteDialogOpen(false)
          return
        }

        const token = localStorage.getItem('token')
        const res = await fetch(`/api/checks?id=${deleteTarget.id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (res.ok) {
          toast({ title: '✓ حذف شد', description: 'چک با موفقیت حذف شد' })
          await loadChecks()
        } else {
          const data = await res.json()
          throw new Error(data.error || 'خطا در حذف چک')
        }
      }

      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    } catch (err: any) {
      toast({ title: 'خطا', description: err.message || 'خطا در حذف چک', variant: 'destructive' })
    } finally {
      setDeleteSaving(false)
    }
  }, [deleteTarget, checks, isOnline, toast, loadChecks])

  // ═══════════════════════════════════════════════════════════
  // Filter & Stats
  // ═══════════════════════════════════════════════════════════

  const filteredChecks = useMemo(() => {
    let result = checks
    
    // فیلتر نوع
    if (filterType !== 'all') {
      result = result.filter(c => c.type === filterType)
    }
    
    // فیلتر وضعیت
    if (filterStatus !== 'all') {
      result = result.filter(c => c.status === filterStatus)
    }
    
    // فیلتر جستجو
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        c =>
          c.checkNumber.toLowerCase().includes(q) ||
          c.bankName.toLowerCase().includes(q) ||
          (c.payee || '').toLowerCase().includes(q)
      )
    }
    
    return result
  }, [checks, filterType, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const total = checks.length
    const receivable = checks.filter(c => c.type === 'receivable').length
    const payable = checks.filter(c => c.type === 'payable').length
    const pending = checks.filter(c => c.status === 'pending').length
    const cleared = checks.filter(c => c.status === 'cleared').length
    const bounced = checks.filter(c => c.status === 'bounced').length
    const offlineCount = checks.filter(c => c._offline).length
    const totalAmount = checks.reduce((s, c) => s + (c.amount || 0), 0)
    
    return { total, receivable, payable, pending, cleared, bounced, offlineCount, totalAmount }
  }, [checks])

  // ═══════════════════════════════════════════════════════════
  // Helper: Open Edit Dialog
  // ═══════════════════════════════════════════════════════════

  const openEditDialog = (check: Check) => {
    setCheckFormMode('edit')
    setCheckFormId(check.id)
    setCheckType(check.type)
    setCheckNumber(check.checkNumber)
    setCheckBank(check.bankName)
    setCheckAmount(String(check.amount))
    setCheckDueDate(check.dueDate)
    setCheckCustomerId(check.customerId || '')
    setCheckPayee(check.payee || '')
    setCheckDialogOpen(true)
  }

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
            <strong>حالت آفلاین فعال است.</strong> چک‌های جدید در حافظه محلی ذخیره شده و پس از اتصال به سرور ارسال می‌شوند.
          </div>
        </div>
      )}

  {/* ═══════════════════════════════════════════════════════
    Stats Cards — خیلی کوچک و رنگی
═══════════════════════════════════════════════════════ */}
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5">
  {/* کل چک‌ها */}
  <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">کل چک‌ها</span>
      <CreditCard className="w-2.5 h-2.5 text-blue-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-blue-700">{stats.total.toLocaleString('fa-IR')}</div>
  </div>

  {/* وصول شده */}
  <div className="relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600 truncate">وصول شده</span>
      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-emerald-700">{stats.cleared.toLocaleString('fa-IR')}</div>
  </div>

  {/* در جریان */}
  <div className="relative overflow-hidden rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-amber-600 truncate">در جریان</span>
      <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-amber-700">{stats.pending.toLocaleString('fa-IR')}</div>
  </div>

  {/* در انتظار sync */}
  {stats.offlineCount > 0 && (
    <div className="relative overflow-hidden rounded-md border border-orange-300 bg-gradient-to-br from-orange-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[8px] sm:text-[9px] font-medium text-orange-600 flex items-center gap-0.5 truncate">
          <WifiOff className="w-2 h-2 shrink-0" /> در انتظار sync
        </span>
      </div>
      <div className="text-xs sm:text-sm font-bold text-orange-700">{stats.offlineCount.toLocaleString('fa-IR')}</div>
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
                placeholder="جستجو در شماره چک، بانک، ذینفع..."
                className="pr-8 text-xs h-9"
              />
            </div>

            {/* فیلتر نوع */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full lg:w-40 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه انواع</option>
              <option value="receivable">دریافتنی</option>
              <option value="payable">پرداختنی</option>
            </select>

            {/* فیلتر وضعیت */}
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
            </select>

            {/* دکمه ثبت چک جدید */}
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 flex-1 lg:flex-none"
              onClick={() => {
                setCheckFormMode('add')
                setCheckFormId('')
                setCheckType('receivable')
                setCheckNumber('')
                setCheckBank('')
                setCheckAmount('')
                setCheckDueDate(new Date().toISOString().split('T')[0])
                setCheckCustomerId('')
                setCheckPayee('')
                setCheckDialogOpen(true)
              }}
            >
              <Plus className="w-3.5 h-3.5 ml-1" />
              ثبت چک جدید
            </Button>
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
            <p className="text-sm text-gray-500">در حال بارگذاری چک‌ها...</p>
          </CardContent>
        </Card>
      ) : filteredChecks.length === 0 ? (
        /* ═══════════════════════════════════════════════════════
            Empty State
        ═══════════════════════════════════════════════════════ */
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <CreditCard className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">چکی یافت نشد</h3>
            <p className="text-sm text-gray-400 text-center max-w-md">
              {checks.length === 0
                ? 'هنوز هیچ چکی ثبت نشده است. برای ثبت چک جدید، روی دکمه «ثبت چک جدید» کلیک کنید.'
                : 'با فیلترهای فعلی، چکی یافت نشد. فیلترها را تغییر دهید.'}
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
                      <TableHead className="text-right text-xs w-24">نوع</TableHead>
                      <TableHead className="text-right text-xs w-28">شماره چک</TableHead>
                      <TableHead className="text-right text-xs">بانک</TableHead>
                      <TableHead className="text-right text-xs w-32">مبلغ</TableHead>
                      <TableHead className="text-right text-xs w-28">سررسید</TableHead>
                      <TableHead className="text-right text-xs w-28">وضعیت</TableHead>
                      <TableHead className="text-right text-xs w-48">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredChecks.map((chk) => (
                      <TableRow key={chk.id} className="hover:bg-gray-50/50">
                        <TableCell className="text-xs">
                          <Badge className={chk.type === 'receivable' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}>
                            {chk.type === 'receivable' ? 'دریافتنی' : 'پرداختنی'}
                          </Badge>
                          {/* ★★★ نشانگر آفلاین */}
                          {chk._offline && (
                            <Badge className="bg-orange-100 text-orange-700 mr-1 text-[9px]">
                              <Clock className="w-2.5 h-2.5 ml-0.5" />
                              آفلاین
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{chk.checkNumber}</TableCell>
                        <TableCell className="text-xs">{chk.bankName}</TableCell>
                        <TableCell className="text-xs font-bold">{formatCurrency(chk.amount)}</TableCell>
                        <TableCell className="text-xs">{formatDate(chk.dueDate)}</TableCell>
                        <TableCell>{getStatusBadge(chk.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* دکمه‌های تغییر وضعیت */}
                            {chk.status === 'pending' && (
                              <Button size="sm" variant="outline" className="text-xs h-7"
                                onClick={() => handleCheckStatus(chk.id, 'deposited')}
                                title="سپردن به بانک"
                              >
                                <Landmark className="w-3 h-3 ml-1" /> سپردن
                              </Button>
                            )}
                            {chk.status === 'deposited' && (
                              <>
                                <Button size="sm" variant="outline" className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  onClick={() => handleCheckStatus(chk.id, 'cleared')}
                                  title="وصول چک"
                                >
                                  <CheckCircle2 className="w-3 h-3 ml-1" /> وصول
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => handleCheckStatus(chk.id, 'bounced')}
                                  title="برگشت چک"
                                >
                                  <Ban className="w-3 h-3 ml-1" /> برگشت
                                </Button>
                              </>
                            )}
                            {/* دکمه‌های ویرایش و حذف */}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => openEditDialog(chk)}
                              title="ویرایش"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                              onClick={() => { setDeleteTarget(chk); setDeleteDialogOpen(true) }}
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
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
            {filteredChecks.map((chk) => (
              <Card key={chk.id} className="border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  {/* هدر کارت: نوع + وضعیت */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={chk.type === 'receivable' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}>
                        {chk.type === 'receivable' ? 'چک دریافتنی' : 'چک پرداختنی'}
                      </Badge>
                      {getStatusBadge(chk.status)}
                      {/* ★★★ نشانگر آفلاین */}
                      {chk._offline && (
                        <Badge className="bg-orange-100 text-orange-700 text-[9px]">
                          <Clock className="w-2.5 h-2.5 ml-0.5" />
                          آفلاین
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm font-bold text-gray-800 font-mono">{chk.checkNumber}</span>
                  </div>

                  {/* اطلاعات بانک */}
                  <div className="flex items-center gap-2 mb-2">
                    <Landmark className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-600">{chk.bankName}</span>
                  </div>

                  {/* مبلغ و سررسید */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-50 border border-gray-100 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-0.5">مبلغ</div>
                      <div className="text-xs font-bold text-gray-800">{formatCurrency(chk.amount)}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-0.5">سررسید</div>
                      <div className="text-xs font-bold text-gray-800">{formatDate(chk.dueDate)}</div>
                    </div>
                  </div>

                  {/* دکمه‌های عملیات */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-wrap">
                    {/* تغییر وضعیت */}
                    {chk.status === 'pending' && (
                      <Button size="sm" variant="outline" className="text-xs h-8 flex-1"
                        onClick={() => handleCheckStatus(chk.id, 'deposited')}
                      >
                        <Landmark className="w-3 h-3 ml-1" /> سپردن به بانک
                      </Button>
                    )}
                    {chk.status === 'deposited' && (
                      <>
                        <Button size="sm" variant="outline" className="text-xs h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50 flex-1"
                          onClick={() => handleCheckStatus(chk.id, 'cleared')}
                        >
                          <CheckCircle2 className="w-3 h-3 ml-1" /> وصول
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 flex-1"
                          onClick={() => handleCheckStatus(chk.id, 'bounced')}
                        >
                          <Ban className="w-3 h-3 ml-1" /> برگشت
                        </Button>
                      </>
                    )}
                    {/* ویرایش و حذف */}
                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1"
                      onClick={() => openEditDialog(chk)}
                    >
                      <Pencil className="w-3 h-3 ml-1" /> ویرایش
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 flex-1"
                      onClick={() => { setDeleteTarget(chk); setDeleteDialogOpen(true) }}
                    >
                      <Trash2 className="w-3 h-3 ml-1" /> حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Check Form (Add/Edit) — ریسپانسیو + fullscreen موبایل
      ═══════════════════════════════════════════════════════════ */}
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
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* نوع چک */}
            <div>
              <Label className="text-xs">نوع چک</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  size="sm" 
                  variant={checkType === 'receivable' ? 'default' : 'outline'}
                  className="text-xs flex-1"
                  onClick={() => setCheckType('receivable')}
                >
                  دریافتنی
                </Button>
                <Button
                  size="sm" 
                  variant={checkType === 'payable' ? 'default' : 'outline'}
                  className="text-xs flex-1"
                  onClick={() => setCheckType('payable')}
                >
                  پرداختنی
                </Button>
              </div>
            </div>

            {/* شماره چک و بانک */}
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

            {/* مبلغ */}
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

            {/* تاریخ سررسید */}
            <div>
              <PersianDatePicker
                value={checkDueDate}
                onChange={setCheckDueDate}
                placeholder="انتخاب تاریخ سررسید"
                label="تاریخ سررسید *"
              />
            </div>

            {/* ذینفع */}
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
            <Button variant="outline" onClick={() => setCheckDialogOpen(false)} disabled={checkSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button
              onClick={handleCreateCheck}
              disabled={checkSaving || !checkNumber.trim() || !checkBank.trim() || !checkAmount.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            >
              {checkSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
              {checkSaving ? 'در حال ذخیره...' : checkFormMode === 'add' ? 'ثبت چک' : 'ذخیره تغییرات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Delete Confirmation
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-base text-red-600">حذف چک</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              آیا از حذف چک <strong>{deleteTarget?.checkNumber}</strong> ({deleteTarget?.bankName}) مطمئن هستید؟ این عمل غیرقابل بازگشت است.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button onClick={handleDeleteCheck} disabled={deleteSaving} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
              {deleteSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
              حذف چک
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Detail View
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailCheck} onOpenChange={(open) => !open && setDetailCheck(null)}>
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
                    <div className="text-gray-500 text-[10px] mb-0.5">نوع</div>
                    <div className="font-medium">{detailCheck.type === 'receivable' ? 'دریافتنی' : 'پرداختنی'}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">بانک</div>
                    <div className="font-medium">{detailCheck.bankName}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">مبلغ</div>
                    <div className="font-bold">{formatCurrency(detailCheck.amount)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">سررسید</div>
                    <div className="font-medium">{formatDate(detailCheck.dueDate)}</div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailCheck(null)} className="w-full sm:w-auto">بستن</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ChecksTab