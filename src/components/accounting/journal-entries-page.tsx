// ShopAccounting v28 — Accounting Page (Plan-Aware)
// ============================================================================
// ★★★ v28: صفحه حسابداری بر اساس پلن کاملاً متفاوت است ★★★
//
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  پلن پایه (رایگان + ساده)                                            │
//  │  ─────────────────────────                                          │
//  │  • فقط تب «اسناد» (لیست اسناد خودکار از فاکتورها)                    │
//  │  • دکمه «سند جدید» قفل — نمایش هشدار ارتقا                           │
//  │  • تب «چارت حساب‌ها» قفل — نمایش کارت ارتقا                           │
//  │  • تب «تراز آزمایشی» قفل — نمایش کارت ارتقا                           │
//  │  • فقط گزارش ساده درآمد/هزینه                                         │
//  │                                                                      │
//  │  پلن حرفه‌ای + سازمانی                                                │
//  │  ─────────────────────                                              │
//  │  • تمام تب‌ها فعال                                                     │
//  │  • دکمه «سند دستی» — ایجاد سند دوطرفه                                │
//  │  • چارت حساب‌ها — مشاهده درخت حساب‌ها                                  │
//  │  • تراز آزمایشی — نمایش جمع بدهکار/بستانکار + بررسی تعادل             │
//  │  • پلن سازمانی: + تب «گزارش‌های تلفیقی» (در نسخه بعدی)                 │
//  └─────────────────────────────────────────────────────────────────────┘
//
// ★ هیچ PlanBanner / PlanSwitcher / PlanIndicator اضافه نشده
// ★ فقط feature gating واقعی + کارت ارتقای inline
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchJournalEntries } from '@/lib/offline-api'
import { mockJournalEntries, mockAccounts, type Account } from '@/lib/mock-data'
import { getFeaturesByPlanName, resolvePlan, type PlanFeatureSet } from '@/lib/plan-features'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
 import {
    BookOpen, Plus, Search, Loader2, WifiOff, FileText, Eye,
    CheckCircle2, Lock, Crown, Scale, X, AlertCircle,
    FileEdit, Save, Pencil, Trash2, Printer, Calendar,
    Ban, History, Clock, User, Repeat,
    RefreshCw,    // v8.3: recover tab icon
    ShieldCheck,  // v8.3: admin badge icon
    Building,     // v8.8: fixed assets tab icon
  } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
// ★★★ v5.3 (Phase 4): اسناد تکرارشونده
import { RecurringJournalsManager } from '@/components/accounting/recurring-journals-manager'
 import { RecoverJournalsTab } from '@/components/accounting/recover-journals-tab'

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
  number?: string         // ★ برای mock data
  date: string
  entryDate?: string      // ★ برای mock data
  description: string
  totalDebit: number
  totalCredit: number
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED'
  isPosted?: boolean
  sourceType?: string
  isManual?: boolean
  items?: JournalEntryItem[]
  lines?: JournalEntryItem[]    // ★ برای mock data
  referenceType?: string
  referenceId?: string
}

// ─── Helpers ──────────────────────────────────────────────────

function formatPrice(price: number): string {
  return price.toLocaleString('fa-IR')
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

// ═══════════════════════════════════════════════════════════════
//  Persian/Jalali Date Utilities (v3.25)
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

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

function todayGregorianISO(): string {
  return new Date().toISOString().split('T')[0]
}

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

function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy).leap === 0
}

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

function formatJalaliLong(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}`
  } catch { return isoDate }
}

// ═══════════════════════════════════════════════════════════════
//  Persian Date Picker (single date) — v3.25
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
  color: LILAC.textSecondary,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'background-color 0.1s',
  lineHeight: 1,
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
          height: 32,
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
            fontSize: 11,
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
              right: 'auto',
              left: '50%',
              transform: 'translateX(-50%)',
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
//  Persian Date Range Picker — v3.25
// ═══════════════════════════════════════════════════════════════

interface DateRange { from: string; to: string }

function PersianDateRangePicker({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const handleFromChange = (iso: string) => {
    // ★★★ v5.3.4: حذف محدودیت maxDate برای انتخاب آزادانه
    if (value.to && iso > value.to) {
      onChange({ from: iso, to: iso })
    } else {
      onChange({ from: iso, to: value.to })
    }
  }

  const handleToChange = (iso: string) => {
    // ★★★ v5.3.4: حذف محدودیت minDate برای انتخاب آزادانه
    if (value.from && iso < value.from) {
      onChange({ from: iso, to: iso })
    } else {
      onChange({ from: value.from, to: iso })
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <PersianDatePicker
        value={value.from || ''}
        onChange={handleFromChange}
        placeholder="از تاریخ"
        // maxDate حذف شد تا کاربر بتواند تاریخ شروع را آزادانه تغییر دهد
      />
      <span className="text-gray-400 text-xs">-</span>
      <PersianDatePicker
        value={value.to || ''}
        onChange={handleToChange}
        placeholder="تا تاریخ"
        // minDate حذف شد تا کاربر بتواند تاریخ پایان را آزادانه تغییر دهد
      />
    </div>
  )
}

function getStatusBadge(status?: string, isPosted?: boolean) {
  // ★ تطبیق با هر دو حالت (status یا isPosted)
  const effective = status ?? (isPosted ? 'POSTED' : 'DRAFT')
  switch (effective) {
    case 'POSTED':
      return <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">ثبت‌شده</Badge>
    case 'DRAFT':
      return <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">پیش‌نویس</Badge>
    case 'CANCELLED':
      return <Badge variant="outline" className="text-[10px] border-red-300 text-red-600">لغوشده</Badge>
    default:
      return <Badge variant="outline" className="text-[10px]">{effective}</Badge>
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
//  UpgradeCard — کارت ارتقای inline برای تب‌های قفل‌شده
// ═══════════════════════════════════════════════════════════════

function UpgradeCard({
  feature,
  description,
  onUpgrade,
}: {
  feature: string
  description: string
  onUpgrade: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-100 flex items-center justify-center mb-4 sm:mb-5">
        <Lock className="h-8 w-8 sm:h-10 sm:w-10 text-amber-500" />
      </div>
      <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{feature}</h3>
      <p className="text-xs sm:text-sm text-gray-500 mb-5 max-w-md leading-relaxed">
        {description}
      </p>
      <Button
        className="gap-2 bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
        onClick={onUpgrade}
      >
        <Crown className="h-4 w-4" />
        ارتقا به پلن حرفه‌ای
      </Button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export default function JournalEntriesPage() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)
  const planName = useAppStore((s) => s.planName)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  // ★★★ v8.3: دریافت user از store برای تشخیص نقش (مدیر/صندوق‌دار)
  const user = useAppStore((s) => s.user)

  // ★ plan-based features
  const features: PlanFeatureSet = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const plan = useMemo(() => resolvePlan(planName), [planName])

  // ★ کاربر روی پلن پایه هست؟
  const isBasicTier = plan.tier === 'basic'

  // ★★★ v8.3: تشخیص نقش مدیر — فقط مدیران به تب «بازیابی اسناد» دسترسی دارند
  const isManager = ['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner'].includes(user?.role || '')

  const [activeTab, setActiveTab] = useState<string>('journals')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  // ★★★ v3.18: accounts از API واقعی لود می‌شه (نه mockAccounts)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  // ★★★ v5.3.3: فیلتر تاریخ برای اسناد
  const [entryDateRange, setEntryDateRange] = useState<DateRange>({ from: '', to: '' })
  // ★★★ v5.3.4: صفحه‌بندی اسناد
  const [currentPage, setCurrentPage] = useState(1)
  const entriesPerPage = 10 // ۱۰ سند در هر صفحه

  // ★★★ v3.18: state برای فرم سند دستی
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [manualLines, setManualLines] = useState<{
    accountId: string
    description: string
    debit: string
    credit: string
  }[]>([{ accountId: '', description: '', debit: '', credit: '' }, { accountId: '', description: '', debit: '', credit: '' }])
  const [manualDescription, setManualDescription] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0])
  const [manualSaving, setManualSaving] = useState(false)

  // ★ detail dialog state
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null)

  // ★★★ v3.24: state برای چک‌ها
  const [checks, setChecks] = useState<any[]>([])
  const [checkDialogOpen, setCheckDialogOpen] = useState(false)
  const [checkType, setCheckType] = useState<'receivable' | 'payable'>('receivable')
  const [checkNumber, setCheckNumber] = useState('')
  const [checkBank, setCheckBank] = useState('')
  const [checkAmount, setCheckAmount] = useState('')
  const [checkDueDate, setCheckDueDate] = useState(new Date().toISOString().split('T')[0])
  const [checkCustomerId, setCheckCustomerId] = useState('')
  const [checkPayee, setCheckPayee] = useState('')
  const [checkSaving, setCheckSaving] = useState(false)
  // ★★★ v3.25: state برای فرم حساب
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [accountFormMode, setAccountFormMode] = useState<'add' | 'edit'>('add')
  const [accountFormId, setAccountFormId] = useState('')
  const [accountFormCode, setAccountFormCode] = useState('')
  const [accountFormName, setAccountFormName] = useState('')
  const [accountFormType, setAccountFormType] = useState('cash')
  const [accountFormParentId, setAccountFormParentId] = useState('')
  const [accountFormIsActive, setAccountFormIsActive] = useState(true)
  const [accountFormSaving, setAccountFormSaving] = useState(false)
  // ★★★ v3.25: state برای حذف حساب
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteAccountId, setDeleteAccountId] = useState('')
  const [deleteAccountName, setDeleteAccountName] = useState('')
  const [deleteSaving, setDeleteSaving] = useState(false)

  // ★★★ v8.8: state برای دارایی‌های ثابت
  const [fixedAssets, setFixedAssets] = useState<any[]>([])
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [assetForm, setAssetForm] = useState({
    name: '', code: '', category: 'تجهیزات', purchasePrice: '', salvageValue: '0',
    usefulLife: '60', purchaseDate: new Date().toISOString().split('T')[0], description: '',
  })
  const [assetSaving, setAssetSaving] = useState(false)
  const [depreciating, setDepreciating] = useState(false)

  // ★★★ v8.8: state برای مودال ویرایش دارایی
  const [editAssetDialogOpen, setEditAssetDialogOpen] = useState(false)
  const [editAssetTarget, setEditAssetTarget] = useState<any>(null)
  const [editAssetSaving, setEditAssetSaving] = useState(false)

  // ★★★ v8.8: state برای مودال حذف چک
  const [deleteCheckDialogOpen, setDeleteCheckDialogOpen] = useState(false)
  const [deleteCheckTarget, setDeleteCheckTarget] = useState<any>(null)

  // ★★★ v8.8: state برای مودال ویرایش چک
  const [editCheckDialogOpen, setEditCheckDialogOpen] = useState(false)
  const [editCheckTarget, setEditCheckTarget] = useState<any>(null)
  const [editCheckSaving, setEditCheckSaving] = useState(false)

  // ★★★ v3.31: state برای ابطال سند
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelEntry, setCancelEntry] = useState<JournalEntry | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)

  // ★★★ v3.31: state برای مشاهده AuditLog
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [auditLogEntry, setAuditLogEntry] = useState<JournalEntry | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLogLoading, setAuditLogLoading] = useState(false)
  const [auditLogEntryInfo, setAuditLogEntryInfo] = useState<any>(null)

  // ★★★ v3.31: فیلتر نمایش اسناد ابطال‌شده
  const [showCancelled, setShowCancelled] = useState(false)
  // ★★★ v3.25: state برای دفتر کل
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string>('')
  // ★★★ v3.25: فیلتر تاریخ برای دفتر کل
  const [ledgerFromDate, setLedgerFromDate] = useState<string>('')
  const [ledgerToDate, setLedgerToDate] = useState<string>('')

  // ─── Load Data ─────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchJournalEntries({ limit: 9999 })
      if (res.success && res.data) {
        const list = (res.data as any).journalEntries || (res.data as any).entries || res.data
        if (Array.isArray(list)) {
          // ★★★ v3.18: حذف fallback به mockJournalEntries — فقط داده واقعی
          setEntries(list)
        } else {
          setEntries([])
        }
      } else {
        setEntries([])
      }
    } catch {
      // ★★★ v3.18: به‌جای fallback به mock، پیام خطا نشون بده
      setEntries([])
    }
    setLoading(false)
  }, [])

  // ★★★ v3.18: لود حساب‌ها از API واقعی
  const loadAccounts = useCallback(async () => {
    try {
      // ★★★ v3.18.2: ارسال توکن احراز هویت
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/accounts', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          const accList = data.data.accounts || data.data || []
          if (Array.isArray(accList)) {
            // ★ تبدیل به فرمت مورد انتظار
            const formatted = accList.map((a: any) => ({
              id: a.id,
              code: a.code,
              name: a.name,
              type: (a.type || 'asset'),
              parentId: a.parentId || null,
              isActive: a.isActive !== false,
              balance: a.balance || 0,
            }))
            setAccounts(formatted)
          }
        }
      } else {
        console.warn('[JournalEntries] /api/accounts returned', res.status)
      }
    } catch (err) {
      console.error('[JournalEntries] loadAccounts error:', err)
      setAccounts([])
    }
  }, [])

  // ★★★ v3.24.1: loadChecks قبل از useEffect تعریف می‌شه
  const loadChecks = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/checks', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          setChecks(data.data.checks || [])
        }
      }
    } catch {
      setChecks([])
    }
  }, [])

  useEffect(() => {
    loadEntries()
    // ★★★ v3.18: اگه پلن حرفه‌ای/سازمانی هست، حساب‌ها رو هم لود کن
    if (!isBasicTier) {
      loadAccounts()
      // ★★★ v3.24: لود چک‌ها
      loadChecks()
      // ★★★ v8.8: لود دارایی‌های ثابت
      loadFixedAssets()
    }
  }, [loadEntries, loadAccounts, loadChecks, isBasicTier])

  // ─── Filter ────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let result = entries

    // ★ فیلتر متن
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (e) =>
          (e.entryNumber || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.date || '').includes(q)
      )
    }

    // ★★★ v5.3.3: فیلتر تاریخ
    if (entryDateRange.from || entryDateRange.to) {
      result = result.filter((e) => {
        const entryDate = new Date(e.date).getTime()
        if (entryDateRange.from && entryDate < new Date(entryDateRange.from).getTime()) return false
        if (entryDateRange.to && entryDate > new Date(entryDateRange.to).getTime() + 86400000) return false // +1 day for inclusive end
        return true
      })
    }

    return result
  }, [entries, searchQuery, entryDateRange])

  // ★★★ v5.3.4: محاسبه اسناد صفحه فعلی
  const totalPages = Math.ceil(filteredEntries.length / entriesPerPage)
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    const end = start + entriesPerPage
    return filteredEntries.slice(start, end)
  }, [filteredEntries, currentPage])

  // ★ ریست صفحه به ۱ هنگام تغییر فیلترها
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, entryDateRange])

  // ─── Stats ─────────────────────────────────────────────────

  const totalEntries = entries.length
  const postedCount = entries.filter((e) => e.status === 'POSTED' || e.isPosted === true).length
  const draftCount = entries.filter((e) => e.status === 'DRAFT' || (e.isPosted === false && !e.status)).length
  const totalDebit = entries.reduce(
    (sum, e) => sum + (e.totalDebit || (e.lines || e.items || []).reduce((s, l) => s + (l.debit || 0), 0)),
    0
  )

  // ─── Trial Balance Computation (only for non-basic) ────────

  const trialBalanceRows = useMemo(() => {
    if (isBasicTier) return []
    const accountMap = new Map<string, {
      accountCode: string
      accountName: string
      totalDebit: number
      totalCredit: number
    }>()

    for (const entry of entries) {
      const lines = entry.lines || entry.items || []
      for (const line of lines) {
        const key = line.accountId || line.accountCode || line.accountName
        if (!accountMap.has(key)) {
          accountMap.set(key, {
            accountCode: line.accountCode || '—',
            accountName: line.accountName || 'نامشخص',
            totalDebit: 0,
            totalCredit: 0,
          })
        }
        const row = accountMap.get(key)!
        row.totalDebit += line.debit || 0
        row.totalCredit += line.credit || 0
      }
    }
    return Array.from(accountMap.values())
  }, [entries, isBasicTier])

  const trialGrandDebit = trialBalanceRows.reduce((s, r) => s + r.totalDebit, 0)
  const trialGrandCredit = trialBalanceRows.reduce((s, r) => s + r.totalCredit, 0)
  const isBalanced = Math.abs(trialGrandDebit - trialGrandCredit) < 1

  // ★★★ v3.25: محاسبه دفتر کل برای حساب انتخاب‌شده
  const ledgerRows = useMemo(() => {
    if (!selectedLedgerAccountId) return []
    const rows: any[] = []

    for (const entry of entries) {
      const lines = entry.lines || entry.items || []
      for (const line of lines) {
        if (line.accountId === selectedLedgerAccountId) {
          const debit = Number(line.debit) || 0
          const credit = Number(line.credit) || 0
          rows.push({
            date: entry.date || entry.entryDate,
            number: entry.number || entry.entryNumber,
            description: entry.description,
            lineDescription: line.description,
            debit,
            credit,
            balance: 0, // بعداً محاسبه می‌شه
          })
        }
      }
    }

    // مرتب‌سازی بر اساس تاریخ
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // محاسبه مانده تجمعی
    let bal = 0
    for (const r of rows) {
      bal += r.debit - r.credit
      r.balance = bal
    }

    return rows
  }, [entries, selectedLedgerAccountId])

  // ★★★ v3.25: ردیف‌های فیلترشده بر اساس تاریخ
  const filteredLedgerRows = useMemo(() => {
    if (!ledgerFromDate && !ledgerToDate) return ledgerRows

    return ledgerRows.filter((r) => {
      const rowDate = new Date(r.date).getTime()
      if (ledgerFromDate && rowDate < new Date(ledgerFromDate).getTime()) return false
      if (ledgerToDate && rowDate > new Date(ledgerToDate).getTime() + 86400000) return false // +1 day برای شامل کردن کل روز
      return true
    })
  }, [ledgerRows, ledgerFromDate, ledgerToDate])

  // ★★★ v3.25: مانده اولیه (قبل از فیلتر تاریخ)
  const openingBalance = useMemo(() => {
    if (!ledgerFromDate) return 0
    const fromDateMs = new Date(ledgerFromDate).getTime()
    return ledgerRows
      .filter((r) => new Date(r.date).getTime() < fromDateMs)
      .reduce((s, r) => s + r.debit - r.credit, 0)
  }, [ledgerRows, ledgerFromDate])

  // ★★★ v3.25: مانده آخر دوره (با احتساب مانده اولیه)
  const closingBalance = useMemo(() => {
    return openingBalance + filteredLedgerRows.reduce((s, r) => s + r.debit - r.credit, 0)
  }, [openingBalance, filteredLedgerRows])

  // ★★★ v3.25: حساب انتخاب‌شده
  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedLedgerAccountId)
  }, [accounts, selectedLedgerAccountId])

  // ★★★ v3.25: چاپ دفتر کل
  const handlePrintLedger = () => {
    const acc = selectedAccount
    if (!acc) return

    const printContent = `
      <html dir="rtl">
      <head>
        <title>دفتر کل - ${acc.name}</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Tahoma, sans-serif; padding: 20px; font-size: 12px; }
          h1 { text-align: center; font-size: 16px; margin-bottom: 5px; }
          h2 { text-align: center; font-size: 13px; margin-top: 0; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; font-size: 11px; }
          th { background: #f5f5f5; font-weight: bold; }
          .text-center { text-align: center; }
          .text-left { text-align: left; direction: ltr; }
          .text-right { text-align: right; }
          .header-info { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 5px; }
          .header-info div { margin: 3px 0; }
          .summary { margin-top: 15px; padding: 10px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 5px; }
          .summary div { display: flex; justify-content: space-between; margin: 4px 0; }
          .debit { color: #dc2626; }
          .credit { color: #16a34a; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>دفتر کل</h1>
        <h2>${acc.code} - ${acc.name}</h2>
        <div class="header-info">
          <div><strong>کد حساب:</strong> ${acc.code}</div>
          <div><strong>نام حساب:</strong> ${acc.name}</div>
          <div><strong>نوع حساب:</strong> ${acc.type}</div>
          ${ledgerFromDate ? `<div><strong>از تاریخ:</strong> ${formatJalaliLong(ledgerFromDate)}</div>` : ''}
          ${ledgerToDate ? `<div><strong>تا تاریخ:</strong> ${formatJalaliLong(ledgerToDate)}</div>` : ''}
          <div><strong>تاریخ چاپ:</strong> ${formatJalaliLong(new Date().toISOString())}</div>
        </div>
        ${openingBalance !== 0 ? `
        <div class="summary">
          <div><span>مانده اول دوره:</span> <span class="${openingBalance >= 0 ? 'debit' : 'credit'}">${Math.abs(openingBalance).toLocaleString('fa-IR')} ${openingBalance >= 0 ? 'بد' : 'بس'}</span></div>
        </div>
        ` : ''}
        <table>
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>شماره سند</th>
              <th>شرح</th>
              <th class="text-center">بدهکار</th>
              <th class="text-center">بستانکار</th>
              <th class="text-center">مانده</th>
            </tr>
          </thead>
          <tbody>
            ${filteredLedgerRows.map((r) => `
              <tr>
                <td class="text-left">${formatJalaliLong(r.date)}</td>
                <td class="text-left">${r.number || '-'}</td>
                <td>${r.lineDescription || r.description || '-'}</td>
                <td class="text-center debit">${r.debit > 0 ? r.debit.toLocaleString('fa-IR') : '-'}</td>
                <td class="text-center credit">${r.credit > 0 ? r.credit.toLocaleString('fa-IR') : '-'}</td>
                <td class="text-center ${r.balance >= 0 ? 'debit' : 'credit'}">${Math.abs(r.balance).toLocaleString('fa-IR')} ${r.balance >= 0 ? 'بد' : 'بس'}</td>
              </tr>
            `).join('')}
            <tr style="background: #f5f5f5; font-weight: bold;">
              <td colspan="3" class="text-right">جمع کل</td>
              <td class="text-center debit">${filteredLedgerRows.reduce((s, r) => s + r.debit, 0).toLocaleString('fa-IR')}</td>
              <td class="text-center credit">${filteredLedgerRows.reduce((s, r) => s + r.credit, 0).toLocaleString('fa-IR')}</td>
              <td class="text-center ${closingBalance >= 0 ? 'debit' : 'credit'}">${Math.abs(closingBalance).toLocaleString('fa-IR')} ${closingBalance >= 0 ? 'بد' : 'بس'}</td>
            </tr>
          </tbody>
        </table>
        <div class="summary">
          <div><span>مانده اول دوره:</span> <span class="${openingBalance >= 0 ? 'debit' : 'credit'}">${Math.abs(openingBalance).toLocaleString('fa-IR')} ${openingBalance >= 0 ? 'بد' : 'بس'}</span></div>
          <div><span>مانده آخر دوره:</span> <span class="${closingBalance >= 0 ? 'debit' : 'credit'}">${Math.abs(closingBalance).toLocaleString('fa-IR')} ${closingBalance >= 0 ? 'بد' : 'بس'}</span></div>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => printWindow.print(), 500)
    }
  }

  // ─── Handlers ──────────────────────────────────────────────

  const handleUpgradeClick = () => {
    setCurrentView('settings-subscription')
  }

  // ★★★ v3.18: باز کردن فرم سند دستی
  const handleNewEntry = () => {
    if (features.canCreateJournal) {
      // ★ ریست فرم
      setManualLines([
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' },
      ])
      setManualDescription('')
      setManualDate(new Date().toISOString().split('T')[0])
      setManualEntryOpen(true)
    } else {
      toast({
        title: 'قفل در پلن پایه',
        description: 'برای ثبت سند دستی به پلن حرفه‌ای ارتقا دهید',
        variant: 'destructive',
      })
      setCurrentView('settings-subscription')
    }
  }

  // ★★★ v3.18: مدیریت ردیف‌های سند دستی
  const updateManualLine = (index: number, field: 'accountId' | 'description' | 'debit' | 'credit', value: string) => {
    setManualLines((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addManualLine = () => {
    setManualLines((prev) => [...prev, { accountId: '', description: '', debit: '', credit: '' }])
  }

  const removeManualLine = (index: number) => {
    if (manualLines.length <= 2) return
    setManualLines((prev) => prev.filter((_, i) => i !== index))
  }

  // ★★★ v3.18: محاسبه جمع بدهکار و بستانکار
  const manualTotalDebit = manualLines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0)
  const manualTotalCredit = manualLines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0)
  const manualIsBalanced = Math.abs(manualTotalDebit - manualTotalCredit) < 1

  // ★★★ v3.18: ذخیره سند دستی
  const handleSaveManualEntry = async () => {
    if (!manualDescription.trim()) {
      toast({ title: 'خطا', description: 'شرح سند الزامی است' })
      return
    }
    if (manualLines.length < 2) {
      toast({ title: 'خطا', description: 'حداقل ۲ ردیف سند الزامی است' })
      return
    }
    // ★ بررسی اینکه هر ردیف حداقل یک حساب داره
    const validLines = manualLines.filter((l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
    if (validLines.length < 2) {
      toast({ title: 'خطا', description: 'هر ردیف باید شامل حساب و مبلغ باشد' })
      return
    }
    if (!manualIsBalanced) {
      toast({ title: 'خطا', description: `سند تراز نیست — بدهکار: ${manualTotalDebit}, بستانکار: ${manualTotalCredit}` })
      return
    }

    setManualSaving(true)
    try {
      const res = await fetch('/api/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: manualDescription.trim(),
          date: manualDate,
          status: 'posted',
          lines: validLines.map((l) => ({
            accountId: l.accountId,
            description: l.description || null,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'سند ثبت شد', description: 'سند دستی با موفقیت ثبت شد' })
        setManualEntryOpen(false)
        loadEntries()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ثبت سند' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    }
    setManualSaving(false)
  }

  // ★★★ v3.24: توابع چک‌ها (loadChecks در بالا تعریف شده)
  const handleSaveCheck = async () => {
    if (!checkNumber.trim() || !checkBank.trim() || !checkAmount || !checkDueDate) {
      toast({ title: 'خطا', description: 'شماره چک، بانک، مبلغ و سررسید الزامی است' })
      return
    }
    setCheckSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/checks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: checkType,
          checkNumber: checkNumber.trim(),
          bankName: checkBank.trim(),
          amount: parseFloat(checkAmount),
          dueDate: checkDueDate,
          customerId: checkType === 'receivable' ? (checkCustomerId || undefined) : undefined,
          payeeName: checkType === 'payable' ? (checkPayee || undefined) : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'چک ثبت شد', description: 'چک با موفقیت ثبت شد' })
        setCheckDialogOpen(false)
        setCheckNumber('')
        setCheckBank('')
        setCheckAmount('')
        setCheckCustomerId('')
        setCheckPayee('')
        loadChecks()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ثبت چک' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    }
    setCheckSaving(false)
  }

  const handleCheckStatus = async (checkId: string, newStatus: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/checks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: checkId, status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        toast({
          title: 'وضعیت چک تغییر کرد',
          description: newStatus === 'cleared' ? 'چک وصول شد' : newStatus === 'bounced' ? 'چک برگشت خورد' : 'چک به بانک سپرده شد',
        })
        loadChecks()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در تغییر وضعیت' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    }
  }

  const handleDeleteCheck = async (checkId: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/checks?id=${checkId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'چک حذف شد' })
        loadChecks()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در حذف چک' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    }
  }

  // ★★★ v8.8: ویرایش چک
  const handleEditCheck = async () => {
    if (!editCheckTarget) return
    if (!editCheckTarget.checkNumber?.trim() || !editCheckTarget.bankName?.trim() || !editCheckTarget.amount) {
      toast({ title: 'خطا', description: 'شماره چک، بانک و مبلغ الزامی است' })
      return
    }
    setEditCheckSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/checks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          id: editCheckTarget.id,
          action: 'edit',
          checkNumber: editCheckTarget.checkNumber.trim(),
          bankName: editCheckTarget.bankName.trim(),
          branchName: editCheckTarget.branchName?.trim() || '',
          amount: parseFloat(editCheckTarget.amount),
          dueDate: editCheckTarget.dueDate,
          payeeName: editCheckTarget.payeeName?.trim() || '',
          description: editCheckTarget.description?.trim() || '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'چک ویرایش شد ✓' })
        setEditCheckDialogOpen(false)
        setEditCheckTarget(null)
        loadChecks()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ویرایش' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    } finally {
      setEditCheckSaving(false)
    }
  }

  // ★★★ v8.8: توابع دارایی‌های ثابت
  const loadFixedAssets = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fixed-assets', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        setFixedAssets(data.data?.assets || [])
      }
    } catch {}
  }

  const handleSaveAsset = async () => {
    if (!assetForm.name.trim() || !assetForm.code.trim() || !assetForm.purchasePrice) {
      toast({ title: 'خطا', description: 'نام، کد و بهای خرید الزامی است' })
      return
    }
    setAssetSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fixed-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: assetForm.name.trim(),
          code: assetForm.code.trim(),
          category: assetForm.category,
          purchasePrice: parseFloat(assetForm.purchasePrice),
          salvageValue: parseFloat(assetForm.salvageValue) || 0,
          usefulLife: parseInt(assetForm.usefulLife) || 60,
          purchaseDate: assetForm.purchaseDate,
          description: assetForm.description.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'دارایی ثبت شد ✓', description: data.message })
        setAssetDialogOpen(false)
        setAssetForm({ name: '', code: '', category: 'تجهیزات', purchasePrice: '', salvageValue: '0', usefulLife: '60', purchaseDate: new Date().toISOString().split('T')[0], description: '' })
        loadFixedAssets()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ثبت' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    } finally {
      setAssetSaving(false)
    }
  }

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('آیا از حذف این دارایی اطمینان دارید؟ سند مربوطه ابطال می‌شود.')) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fixed-assets?id=${id}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'دارایی حذف شد' })
        loadFixedAssets()
      } else {
        toast({ title: 'خطا', description: data.error })
      }
    } catch {}
  }

  const handleDepreciate = async () => {
    if (!confirm('استهلاک همه دارایی‌های فعال محاسبه شود؟ سند استهلاک صادر خواهد شد.')) return
    setDepreciating(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fixed-assets/depreciate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'استهلاک محاسبه شد ✓', description: data.message })
        loadFixedAssets()
      } else {
        toast({ title: 'خطا', description: data.error })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    } finally {
      setDepreciating(false)
    }
  }

  // ★★★ v8.8: ویرایش دارایی ثابت
  const handleEditAsset = async () => {
    if (!editAssetTarget) return
    if (!editAssetTarget.name?.trim() || !editAssetTarget.code?.trim() || !editAssetTarget.purchasePrice) {
      toast({ title: 'خطا', description: 'نام، کد و بهای خرید الزامی است' })
      return
    }
    setEditAssetSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fixed-assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          id: editAssetTarget.id,
          action: 'edit',
          name: editAssetTarget.name.trim(),
          code: editAssetTarget.code.trim(),
          category: editAssetTarget.category,
          purchasePrice: parseFloat(editAssetTarget.purchasePrice),
          salvageValue: parseFloat(editAssetTarget.salvageValue) || 0,
          usefulLife: parseInt(editAssetTarget.usefulLife) || 60,
          description: editAssetTarget.description?.trim() || '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'دارایی ویرایش شد ✓' })
        setEditAssetDialogOpen(false)
        setEditAssetTarget(null)
        loadFixedAssets()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ویرایش' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    } finally {
      setEditAssetSaving(false)
    }
  }

  // ★★★ v3.25: ذخیره حساب (افزودن/ویرایش)
  const handleSaveAccount = async () => {
    // ★ اعتبارسنجی پیشرفته
    if (!accountFormCode.trim()) {
      toast({ title: 'خطا', description: 'کد حساب الزامی است' })
      return
    }
    if (!/^[0-9]+$/.test(accountFormCode.trim())) {
      toast({ title: 'خطا', description: 'کد حساب باید فقط شامل عدد باشد' })
      return
    }
    if (!accountFormName.trim()) {
      toast({ title: 'خطا', description: 'نام حساب الزامی است' })
      return
    }
    if (accountFormName.trim().length < 2) {
      toast({ title: 'خطا', description: 'نام حساب باید حداقل ۲ کاراکتر باشد' })
      return
    }

    // ★ بررسی کد تکراری (در حالت add)
    if (accountFormMode === 'add') {
      const exists = accounts.find((a) => a.code === accountFormCode.trim())
      if (exists) {
        toast({ title: 'خطا', description: `کد ${accountFormCode} قبلاً برای حساب «${exists.name}» استفاده شده است` })
        return
      }
    }

    setAccountFormSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const method = accountFormMode === 'add' ? 'POST' : 'PUT'
      const body: any = {
        code: accountFormCode.trim(),
        name: accountFormName.trim(),
        type: accountFormType,
        isActive: accountFormIsActive,
      }
      if (accountFormParentId) body.parentId = accountFormParentId
      if (accountFormMode === 'edit') body.id = accountFormId

      const res = await fetch('/api/accounts', {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        toast({
          title: 'حساب ذخیره شد',
          description: accountFormMode === 'add'
            ? `حساب «${accountFormName.trim()}» با کد ${accountFormCode} ایجاد شد`
            : `حساب «${accountFormName.trim()}» بروزرسانی شد`,
        })
        setAccountFormOpen(false)
        loadAccounts()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ذخیره حساب' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    }
    setAccountFormSaving(false)
  }

  // ★★★ v3.25: حذف حساب
  const handleDeleteAccount = async () => {
    if (!deleteAccountId) return
    setDeleteSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/accounts?id=${deleteAccountId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'حساب حذف شد', description: `حساب «${deleteAccountName}» حذف شد` })
        setDeleteConfirmOpen(false)
        setDeleteAccountId('')
        setDeleteAccountName('')
        loadAccounts()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در حذف حساب' })
      }
    } catch {
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور' })
    }
    setDeleteSaving(false)
  }

  const handleEntryClick = (entry: JournalEntry) => {
    setDetailEntry(entry)
  }

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v3.31: ابطال سند + AuditLog
  // ═══════════════════════════════════════════════════════════════

  // ★ باز کردن دیالوگ ابطال
  const openCancelDialog = (entry: JournalEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setCancelEntry(entry)
    setCancelReason('')
    setCancelDialogOpen(true)
  }

  // ★ تأیید ابطال سند
  const handleConfirmCancel = async () => {
    if (!cancelEntry) return

    // ★★★ v8.8: فقط اسناد posted قابل ابطال هستند (چه دستی، چه خودکار)
    const isPosted = cancelEntry.status === 'POSTED' || cancelEntry.isPosted === true ||
                     (cancelEntry.status as any) === 'posted'
    if (!isPosted) {
      toast({
        title: 'خطا',
        description: 'فقط اسناد ثبت‌شده (posted) قابل ابطال هستند.',
        variant: 'destructive',
      })
      return
    }

    setCancelSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/journal-entries/${cancelEntry.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reason: cancelReason.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({
          title: 'سند ابطال شد',
          description: `سند «${cancelEntry.entryNumber || cancelEntry.number}» با موفقیت ابطال شد`,
        })
        setCancelDialogOpen(false)
        setCancelEntry(null)
        setCancelReason('')
        setDetailEntry(null)
        loadEntries()
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'خطا در ابطال سند',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: err?.message || 'خطا در ارتباط با سرور',
        variant: 'destructive',
      })
    }
    setCancelSaving(false)
  }

  // ★ باز کردن دیالوگ AuditLog
  const openAuditLogDialog = async (entry: JournalEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setAuditLogEntry(entry)
    setAuditLogOpen(true)
    setAuditLogLoading(true)
    setAuditLogs([])
    setAuditLogEntryInfo(null)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/journal-entries/${entry.id}/audit-log`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        setAuditLogs(data.data.logs || [])
        setAuditLogEntryInfo(data.data.entry)
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'خطا در دریافت تاریخچه سند',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: err?.message || 'خطا در ارتباط با سرور',
        variant: 'destructive',
      })
    }
    setAuditLogLoading(false)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full bg-gray-50/80" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-emerald-600 text-white">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-bold text-gray-900">حسابداری</h1>
              <p className="text-[10px] sm:text-xs text-gray-500">
                {isBasicTier ? 'گزارش ساده اسناد حسابداری' : 'مدیریت کامل اسناد، چارت حساب‌ها و تراز آزمایشی'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isOnline && (
              <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs border-amber-300 text-amber-700 bg-amber-50">
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">آفلاین</span>
              </Badge>
            )}
            <Button
              className={`h-8 sm:h-9 px-2.5 sm:px-4 text-xs sm:text-sm gap-1.5 ${
                features.canCreateJournal
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'
              }`}
              onClick={handleNewEntry}
              title={features.canCreateJournal ? 'سند دستی جدید' : 'نیازمند ارتقا به پلن حرفه‌ای'}
            >
              {features.canCreateJournal ? (
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
              <span className="hidden sm:inline">
                {features.canCreateJournal ? 'سند جدید' : 'سند دستی (قفل)'}
              </span>
              <span className="sm:hidden">جدید</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="px-3 sm:px-6 py-2.5 sm:py-3 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-2.5 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-gray-500">کل اسناد</p>
              <p className="text-sm sm:text-lg font-black text-gray-900">{totalEntries}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-2.5 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-gray-500">ثبت‌شده</p>
              <p className="text-sm sm:text-lg font-black text-emerald-600">{postedCount}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-2.5 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-gray-500">پیش‌نویس</p>
              <p className="text-sm sm:text-lg font-black text-amber-600">{draftCount}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-2.5 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-gray-500">جمع بدهکار</p>
              <p className="text-xs sm:text-sm font-black text-gray-900">
                {formatPrice(totalDebit)} <span className="text-[9px] font-normal text-gray-400">ریال</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ★★★ Plan-Aware Tabs ★★★ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="bg-white border-b border-gray-200 px-3 sm:px-6 shrink-0 overflow-x-auto scrollbar-hide">
            <TabsList className="h-10 sm:h-11 bg-transparent p-0 gap-1 flex-nowrap">
              {/* ★ تب اسناد — همیشه فعال */}
              <TabsTrigger
                value="journals"
                className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
              >
                <FileText className="w-3.5 h-3.5" />
                اسناد
              </TabsTrigger>

              {/* ★ تب چارت حساب‌ها — قفل برای basic */}
              <TabsTrigger
                value="accounts"
                className={`gap-1.5 text-xs sm:text-sm ${
                  features.canViewAccounts
                    ? 'data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700'
                    : 'opacity-60 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700'
                }`}
              >
                {features.canViewAccounts ? (
                  <BookOpen className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3 h-3 text-amber-500" />
                )}
                چارت حساب‌ها
                {!features.canViewAccounts && (
                  <Badge className="text-[8px] h-3.5 px-1 bg-amber-100 text-amber-700 shrink-0">
                    حرفه‌ای
                  </Badge>
                )}
              </TabsTrigger>

              {/* ★ تب تراز آزمایشی — قفل برای basic */}
              <TabsTrigger
                value="trial-balance"
                className={`gap-1.5 text-xs sm:text-sm ${
                  features.canTrialBalance
                    ? 'data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700'
                    : 'opacity-60 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700'
                }`}
              >
                {features.canTrialBalance ? (
                  <Scale className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3 h-3 text-amber-500" />
                )}
                تراز آزمایشی
                {!features.canTrialBalance && (
                  <Badge className="text-[8px] h-3.5 px-1 bg-amber-100 text-amber-700 shrink-0">
                    حرفه‌ای
                  </Badge>
                )}
              </TabsTrigger>
              {/* ★★★ v3.25: تب دفتر کل */}
              <TabsTrigger
                value="ledger"
                className={`gap-1.5 text-xs sm:text-sm ${
                  features.canGeneralLedger
                    ? 'data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700'
                    : 'opacity-60 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700'
                }`}
              >
                {features.canGeneralLedger ? (
                  <BookOpen className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3 h-3 text-amber-500" />
                )}
                دفتر کل
                {!features.canGeneralLedger && (
                  <Badge className="text-[8px] h-3.5 px-1 bg-amber-100 text-amber-700 shrink-0">
                    حرفه‌ای
                  </Badge>
                )}
              </TabsTrigger>
              {/* ★★★ v3.24: تب چک‌ها — v3.32: نمایش همیشگی عنوان */}
              <TabsTrigger
                value="checks"
                className={`gap-1.5 text-xs sm:text-sm ${
                  features.canAccessCredit
                    ? 'data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700'
                    : 'opacity-60 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700'
                }`}
              >
                {features.canAccessCredit ? (
                  <FileText className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3 h-3 text-amber-500" />
                )}
                چک‌ها
                {!features.canAccessCredit && (
                  <Badge className="text-[8px] h-3.5 px-1 bg-amber-100 text-amber-700 shrink-0">
                    حرفه‌ای
                  </Badge>
                )}
              </TabsTrigger>
              {/* ★★★ v5.3 (Phase 4): تب اسناد تکرارشونده */}
            <TabsTrigger
                value="recurring"
                className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
              >
                <Repeat className="w-3.5 h-3.5" />
                تکرارشونده
              </TabsTrigger>
              {/* ★★★ v8.8: تب دارایی‌های ثابت */}
              <TabsTrigger
                value="fixed-assets"
                className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
              >
                <Building className="w-3.5 h-3.5" />
                دارایی‌های ثابت
              </TabsTrigger>
              {/* ★★★ v5.3 (Phase 4): تب سند های بازیابی شده */}
               {isManager && (
                <TabsTrigger
                  value="recover-journals"
                  className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  بازیابی اسناد
                  <Badge className="text-[8px] h-3.5 px-1 bg-amber-100 text-amber-700 shrink-0 gap-0.5">
                    <ShieldCheck className="w-2 h-2" />
                    مدیریتی
                  </Badge>
                </TabsTrigger>
                  )}
            </TabsList>
          </div>

          {/* ─── تب اسناد ─── */}
          <TabsContent value="journals" className="flex-1 overflow-auto m-0" dir="rtl">
            {/* Search + Date Filter */}
            <div className="px-3 sm:px-6 pt-3 pb-2 shrink-0 flex flex-wrap items-center gap-2 relative z-10">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="جستجوی شماره/توضیحات سند..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 h-8 sm:h-9 bg-white border-gray-200 focus:border-emerald-400 focus:ring-emerald-400/20 text-xs sm:text-sm"
                />
              </div>
              {/* ★★★ v5.3.3: فیلتر محدوده تاریخ */}
              <div className="flex items-center gap-1">
                <div style={{ width: 130 }}>
                  <PersianDatePicker
                    value={entryDateRange.from || ''}
                    onChange={(iso) => {
                      if (entryDateRange.to && iso > entryDateRange.to) {
                        setEntryDateRange({ from: iso, to: iso })
                      } else {
                        setEntryDateRange({ from: iso, to: entryDateRange.to })
                      }
                    }}
                    placeholder="از تاریخ"
                  />
                </div>
                <span className="text-gray-400 text-xs">-</span>
                <div style={{ width: 130 }}>
                  <PersianDatePicker
                    value={entryDateRange.to || ''}
                    onChange={(iso) => {
                      if (entryDateRange.from && iso < entryDateRange.from) {
                        setEntryDateRange({ from: iso, to: iso })
                      } else {
                        setEntryDateRange({ from: entryDateRange.from, to: iso })
                      }
                    }}
                    placeholder="تا تاریخ"
                  />
                </div>
              </div>
              {/* ★ دکمه پاک کردن فیلترها */}
              {(searchQuery || entryDateRange.from || entryDateRange.to) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-gray-500 hover:text-red-600"
                  onClick={() => {
                    setSearchQuery('')
                    setEntryDateRange({ from: '', to: '' })
                  }}
                >
                  پاک کردن
                </Button>
              )}
              {/* ★★★ v5.3.4: تعداد کل اسناد */}
              <span className="text-[10px] text-gray-400 mr-auto">
                {filteredEntries.length.toLocaleString('fa-IR')} سند
              </span>
            </div>

            {/* Content */}
            <div className="px-3 sm:px-6 pb-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-gray-400">
                  <Loader2 className="w-8 h-10 animate-spin text-emerald-600 mb-3" />
                  <p className="text-xs sm:text-sm font-medium">در حال بارگذاری اسناد...</p>
                </div>
              ) : paginatedEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-24 bg-emerald-50/50 rounded-xl border border-dashed border-emerald-200">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 mb-4">
                    <BookOpen className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-1">سند حسابداری یافت نشد</h2>
                  <p className="text-xs sm:text-sm text-emerald-600 font-medium">
                    {searchQuery ? 'عبارت دیگری را جستجو کنید' : 'هنوز سند حسابداری ثبت نشده است'}
                  </p>
                  {!isBasicTier && features.canCreateJournal && (
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-2 max-w-sm text-center">
                      با ایجاد فاکتور یا سند دستی، اسناد حسابداری خودکار ثبت می‌شوند
                    </p>
                  )}
                  {isBasicTier && (
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-2 max-w-sm text-center">
                      با ثبت فاکتور در صندوق فروش، اسناد حسابداری خودکار ثبت می‌شوند
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                              <TableHead className="text-xs font-bold text-gray-600 h-9">شماره سند</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9">تاریخ</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9">شرح</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">منبع</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">جمع بدهکار</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">جمع بستانکار</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">وضعیت</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">ردیف‌ها</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">مشاهده</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedEntries.map((entry) => {
                              const lines = entry.lines || entry.items || []
                              const tDebit = entry.totalDebit || lines.reduce((s, l) => s + (l.debit || 0), 0)
                              const tCredit = entry.totalCredit || lines.reduce((s, l) => s + (l.credit || 0), 0)
                              return (
                                <TableRow
                                  key={entry.id}
                                  className="hover:bg-emerald-50/40 transition-colors cursor-pointer"
                                  onClick={() => handleEntryClick(entry)}
                                >
                                  <TableCell className="text-xs font-mono text-gray-500">
                                    {entry.entryNumber || entry.number}
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-600">
                                    {formatDate(entry.date || entry.entryDate || '')}
                                  </TableCell>
                                  <TableCell className="text-sm font-medium text-gray-900">
                                    {entry.description}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline" className="text-[10px] border-gray-200">
                                      {getSourceTypeLabel(entry.sourceType, entry.isManual)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-center font-medium text-gray-900">
                                    {formatPrice(tDebit)}
                                  </TableCell>
                                  <TableCell className="text-xs text-center font-medium text-gray-900">
                                    {formatPrice(tCredit)}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {getStatusBadge(entry.status, entry.isPosted)}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline" className="text-[10px] border-gray-200">
                                      {lines.length} ردیف
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleEntryClick(entry)
                                        }}
                                        title="مشاهده"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      {/* ★★★ v3.31: دکمه AuditLog */}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                                        onClick={(e) => openAuditLogDialog(entry, e)}
                                        title="تاریخچه تغییرات"
                                      >
                                        <History className="h-3.5 w-3.5" />
                                      </Button>
                                      {/* ★★★ v3.31: دکمه ابطال — فقط برای اسناد دستی posted */}
                                      {(entry.isManual || entry.sourceType === 'manual') &&
                                       (entry.status === 'POSTED' || entry.isPosted === true ||
                                        (entry.status as any) === 'posted') &&
                                       entry.status !== 'CANCELLED' && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-red-500 hover:bg-red-50"
                                          onClick={(e) => openCancelDialog(entry, e)}
                                          title="ابطال سند"
                                        >
                                          <Ban className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-2">
                    {paginatedEntries.map((entry) => {
                      const lines = entry.lines || entry.items || []
                      const tDebit = entry.totalDebit || lines.reduce((s, l) => s + (l.debit || 0), 0)
                      const tCredit = entry.totalCredit || lines.reduce((s, l) => s + (l.credit || 0), 0)
                      return (
                        <Card
                          key={entry.id}
                          className="border border-gray-200 shadow-sm cursor-pointer hover:border-emerald-300 transition-colors"
                          onClick={() => handleEntryClick(entry)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span className="font-bold text-sm text-gray-900">
                                  {entry.entryNumber || entry.number}
                                </span>
                              </div>
                              {getStatusBadge(entry.status, entry.isPosted)}
                            </div>
                            <p className="text-xs text-gray-600 mb-2">{entry.description}</p>
                            <div className="flex items-center gap-3 text-[10px] text-gray-500">
                              <span>{formatDate(entry.date || entry.entryDate || '')}</span>
                              <span>بدهکار: {formatPrice(tDebit)}</span>
                              <span>بستانکار: {formatPrice(tCredit)}</span>
                            </div>
                            {lines.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                                {lines.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[10px]">
                                    <span className="text-gray-600">{item.accountName}</span>
                                    <div className="flex items-center gap-3">
                                      {item.debit > 0 && (
                                        <span className="text-emerald-600 font-medium">
                                          {formatPrice(item.debit)} بدهکار
                                        </span>
                                      )}
                                      {item.credit > 0 && (
                                        <span className="text-blue-600 font-medium">
                                          {formatPrice(item.credit)} بستانکار
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </>
              )}

              {/* ★★★ v5.3.4: صفحه‌بندی */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    قبلی
                  </Button>
                  <span className="text-xs text-gray-600">
                    صفحه {currentPage.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    بعدی
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── تب چارت حساب‌ها ─── */}
          <TabsContent value="accounts" className="flex-1 overflow-auto m-0" dir="rtl">
            {features.canViewAccounts ? (
              <div className="p-3 sm:p-6">
                {/* ★★★ v3.25: دکمه افزودن حساب — v3.32: justify-start برای RTL */}
                <div className="flex justify-start mb-3">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1"
                    onClick={() => {
                      setAccountFormOpen(true)
                      setAccountFormMode('add')
                      setAccountFormCode('')
                      setAccountFormName('')
                      setAccountFormType('cash')
                      setAccountFormParentId('')
                      setAccountFormIsActive(true)
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    افزودن حساب
                  </Button>
                </div>
                {accounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-gray-400">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-xs sm:text-sm">حسابی یافت نشد</p>
                  </div>
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto" dir="rtl">
                        <Table dir="rtl">
                          <TableHeader dir="rtl">
                            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80" dir="rtl">
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-right whitespace-nowrap px-4">کد حساب</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-right whitespace-nowrap px-4">نام حساب</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-right whitespace-nowrap px-4">نوع</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center whitespace-nowrap px-4">وضعیت</TableHead>
                              <TableHead className="text-xs font-bold text-gray-600 h-9 text-center whitespace-nowrap px-4">عملیات</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody dir="rtl">
                            {accounts.map((a) => (
                              <TableRow key={a.id} className="hover:bg-emerald-50/40" dir="rtl">
                                <TableCell className="text-xs font-mono text-gray-500 text-right whitespace-nowrap px-4" dir="ltr">{a.code}</TableCell>
                                <TableCell className="text-sm font-medium text-gray-900 text-right whitespace-nowrap px-4">{a.name}</TableCell>
                                <TableCell className="text-[10px] text-gray-500 text-right px-4">
                                  {a.type === 'cash' ? 'صندوق' :
                                   a.type === 'bank' ? 'بانک' :
                                   a.type === 'receivable' ? 'دریافتنی' :
                                   a.type === 'payable' ? 'پرداختنی' :
                                   a.type === 'inventory' ? 'موجودی' :
                                   a.type === 'revenue' ? 'درآمد' :
                                   a.type === 'cogs' ? 'بهای تمام شده' :
                                   a.type === 'expense' ? 'هزینه' :
                                   a.type === 'equity' ? 'سرمایه' :
                                   a.type === 'liability' ? 'بدهی' :
                                   a.type === 'asset' ? 'دارایی' : a.type}
                                </TableCell>
                                <TableCell className="text-center whitespace-nowrap px-4">
                                  {a.isActive !== false ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                  ) : (
                                    <X className="h-4 w-4 text-red-400 mx-auto" />
                                  )}
                                </TableCell>
                                <TableCell className="text-center px-4">
                                  <div className="flex items-center justify-center gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-gray-400 hover:text-emerald-600"
                                      onClick={() => {
                                        setAccountFormOpen(true)
                                        setAccountFormMode('edit')
                                        setAccountFormId(a.id)
                                        setAccountFormCode(a.code)
                                        setAccountFormName(a.name)
                                        setAccountFormType(a.type)
                                        setAccountFormParentId(a.parentId || '')
                                        setAccountFormIsActive(a.isActive !== false)
                                      }}
                                      title="ویرایش"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                                      onClick={() => {
                                        setDeleteAccountId(a.id)
                                        setDeleteAccountName(a.name)
                                        setDeleteConfirmOpen(true)
                                      }}
                                      title="حذف"
                                    >
                                      <Trash2 className="w-3 h-3" />
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
                )}
              </div>
            ) : (
              <UpgradeCard
                feature="چارت حساب‌ها"
                description="در پلن پایه، چارت حساب‌ها قابل مشاهده نیست. برای دسترسی به درخت کامل حساب‌ها (دارایی، بدهی، حقوق صاحبان، درآمد، هزینه) به پلن حرفه‌ای ارتقا دهید."
                onUpgrade={handleUpgradeClick}
              />
            )}
          </TabsContent>

          {/* ★★★ v3.25: تب دفتر کل — Enhanced */}
          <TabsContent value="ledger" className="flex-1 overflow-auto m-0" dir="rtl">
            {features.canGeneralLedger ? (
              <div className="p-3 sm:p-6 space-y-3">
                {/* ★★★ v3.25: نوار ابزار — انتخاب حساب + فیلتر تاریخ + چاپ */}
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs text-gray-600 shrink-0">انتخاب حساب:</Label>
                    <select
                      value={selectedLedgerAccountId}
                      onChange={(e) => {
                        setSelectedLedgerAccountId(e.target.value)
                        setLedgerFromDate('')
                        setLedgerToDate('')
                      }}
                      className="flex-1 min-w-[200px] h-8 text-xs border border-gray-200 rounded px-2 bg-white"
                    >
                      <option value="">— انتخاب کنید —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                    {selectedLedgerAccountId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        onClick={handlePrintLedger}
                        title="چاپ دفتر کل"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        چاپ
                      </Button>
                    )}
                  </div>

                  {/* ★★★ v3.25: فیلتر تاریخ شمسی */}
                  {selectedLedgerAccountId && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                      <Label className="text-[11px] text-gray-500 shrink-0">بازه تاریخ:</Label>
                      <PersianDateRangePicker
                        value={{ from: ledgerFromDate, to: ledgerToDate }}
                        onChange={(v) => { setLedgerFromDate(v.from); setLedgerToDate(v.to) }}
                      />
                      {(ledgerFromDate || ledgerToDate) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] text-gray-500"
                          onClick={() => { setLedgerFromDate(''); setLedgerToDate('') }}
                        >
                          پاک کردن فیلتر
                        </Button>
                      )}
                    </div>
                  )}

                  {/* ★★★ v3.25: مانده اولیه و آخر دوره */}
                  {selectedLedgerAccountId && ledgerRows.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                      <div className="bg-blue-50 border border-blue-100 rounded p-2">
                        <div className="text-[9px] text-blue-600 mb-0.5">مانده اول دوره</div>
                        <div className={`text-sm font-mono font-bold ${openingBalance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {Math.abs(openingBalance).toLocaleString('fa-IR')}
                          <span className="text-[9px] mr-1">{openingBalance >= 0 ? 'بد' : 'بس'}</span>
                        </div>
                      </div>
                      <div className="bg-purple-50 border border-purple-100 rounded p-2">
                        <div className="text-[9px] text-purple-600 mb-0.5">مانده آخر دوره</div>
                        <div className={`text-sm font-mono font-bold ${closingBalance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {Math.abs(closingBalance).toLocaleString('fa-IR')}
                          <span className="text-[9px] mr-1">{closingBalance >= 0 ? 'بد' : 'بس'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* جدول دفتر کل */}
                {!selectedLedgerAccountId ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <BookOpen className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">یک حساب را برای مشاهده دفتر کل انتخاب کنید</p>
                  </div>
                ) : filteredLedgerRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <FileText className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">
                      {ledgerRows.length === 0
                        ? 'تراکنشی برای این حساب ثبت نشده است'
                        : 'در بازه زمانی انتخاب‌شده تراکنشی وجود ندارد'}
                    </p>
                    {(ledgerFromDate || ledgerToDate) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 text-xs"
                        onClick={() => { setLedgerFromDate(''); setLedgerToDate('') }}
                      >
                        نمایش کل تراکنش‌ها
                      </Button>
                    )}
                  </div>
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto" dir="rtl">
                        <Table dir="rtl">
                          <TableHeader dir="rtl">
                            <TableRow className="bg-gray-50" dir="rtl">
                              <TableHead className="text-[10px] text-right whitespace-nowrap px-3">تاریخ</TableHead>
                              <TableHead className="text-[10px] text-right whitespace-nowrap px-3">شماره سند</TableHead>
                              <TableHead className="text-[10px] text-right px-3">شرح</TableHead>
                              <TableHead className="text-[10px] text-center whitespace-nowrap px-3">بدهکار</TableHead>
                              <TableHead className="text-[10px] text-center whitespace-nowrap px-3">بستانکار</TableHead>
                              <TableHead className="text-[10px] text-center whitespace-nowrap px-3">مانده</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody dir="rtl">
                            {/* ★★★ v3.25: ردیف مانده اول دوره (اگه فیلتر تاریخ فعال هست) */}
                            {openingBalance !== 0 && (
                              <TableRow className="bg-blue-50/50 font-bold" dir="rtl">
                                <TableCell className="text-[10px] text-right px-3" colSpan={3}>مانده اول دوره</TableCell>
                                <TableCell className="text-[10px] text-center px-3">—</TableCell>
                                <TableCell className="text-[10px] text-center px-3">—</TableCell>
                                <TableCell className="text-[10px] text-center font-mono px-3">
                                  <span className={openingBalance >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                                    {Math.abs(openingBalance).toLocaleString('fa-IR')}
                                    <span className="text-[8px] mr-0.5">{openingBalance >= 0 ? 'بد' : 'بس'}</span>
                                  </span>
                                </TableCell>
                              </TableRow>
                            )}
                            {filteredLedgerRows.map((r, idx) => (
                              <TableRow key={idx} dir="rtl" className="hover:bg-emerald-50/30">
                                <TableCell className="text-[10px] text-right whitespace-nowrap px-3">{new Date(r.date).toLocaleDateString('fa-IR')}</TableCell>
                                <TableCell className="text-[10px] font-mono text-right px-3" dir="ltr">{r.number}</TableCell>
                                <TableCell className="text-[10px] text-right px-3">{r.lineDescription || r.description || '—'}</TableCell>
                                <TableCell className="text-[10px] text-center font-mono px-3">
                                  {r.debit > 0 ? <span className="text-red-600">{r.debit.toLocaleString('fa-IR')}</span> : '—'}
                                </TableCell>
                                <TableCell className="text-[10px] text-center font-mono px-3">
                                  {r.credit > 0 ? <span className="text-emerald-600">{r.credit.toLocaleString('fa-IR')}</span> : '—'}
                                </TableCell>
                                <TableCell className="text-[10px] text-center font-mono font-bold px-3">
                                  <span className={r.balance >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                                    {Math.abs(r.balance).toLocaleString('fa-IR')}
                                    <span className="text-[8px] mr-0.5">{r.balance >= 0 ? 'بد' : 'بس'}</span>
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* ردیف جمع کل */}
                            <TableRow className="bg-gray-100 font-bold" dir="rtl">
                              <TableCell colSpan={3} className="text-[10px] text-right px-3">جمع کل</TableCell>
                              <TableCell className="text-[10px] text-center font-mono text-red-600 px-3">
                                {filteredLedgerRows.reduce((s, r) => s + r.debit, 0).toLocaleString('fa-IR')}
                              </TableCell>
                              <TableCell className="text-[10px] text-center font-mono text-emerald-600 px-3">
                                {filteredLedgerRows.reduce((s, r) => s + r.credit, 0).toLocaleString('fa-IR')}
                              </TableCell>
                              <TableCell className="text-[10px] text-center font-mono px-3">
                                <span className={closingBalance >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                                  {Math.abs(closingBalance).toLocaleString('fa-IR')}
                                  <span className="text-[8px] mr-0.5">{closingBalance >= 0 ? 'بد' : 'بس'}</span>
                                </span>
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <UpgradeCard
                feature="دفتر کل"
                description="دفتر کل فقط در پلن حرفه‌ای و سازمانی در دسترس است. برای مشاهده تراکنش‌های تفصیلی هر حساب به پلن حرفه‌ای ارتقا دهید."
                onUpgrade={handleUpgradeClick}
              />
            )}
          </TabsContent>

          {/* ─── تب تراز آزمایشی ─── */}
          <TabsContent value="trial-balance" className="flex-1 overflow-auto m-0" dir="rtl">
            {features.canTrialBalance ? (
              <div className="p-3 sm:p-6 space-y-4">
                {/* خلاصه تراز */}
                <Card className={
                  isBalanced
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-red-200 bg-red-50/50'
                }>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      {isBalanced ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-6 w-6 text-red-500" />
                      )}
                      <div>
                        <p className="font-semibold text-sm">
                          {isBalanced ? 'تراز متعادل است' : 'تراز نامتعادل!'}
                        </p>
                        <p className="text-xs text-gray-600">
                          {isBalanced
                            ? 'مجموع بدهکار با مجموع بستانکار برابر است'
                            : `اختلاف: ${formatPrice(Math.abs(trialGrandDebit - trialGrandCredit))} ریال`
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div className="text-center">
                        <p className="text-gray-500 text-xs">جمع بدهکار</p>
                        <p className="font-mono font-semibold">{formatPrice(trialGrandDebit)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500 text-xs">جمع بستانکار</p>
                        <p className="font-mono font-semibold">{formatPrice(trialGrandCredit)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* جدول تراز آزمایشی */}
                {trialBalanceRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-gray-400">
                    <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-xs sm:text-sm">داده‌ای برای تراز آزمایشی یافت نشد</p>
                    <p className="text-[10px] text-gray-400 mt-1">پس از ثبت اسناد حسابداری، تراز آزمایشی نمایش داده می‌شود</p>
                  </div>
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                            <TableHead className="text-xs font-bold text-gray-600 h-9">کد حساب</TableHead>
                            <TableHead className="text-xs font-bold text-gray-600 h-9">نام حساب</TableHead>
                            <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">جمع بدهکار</TableHead>
                            <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">جمع بستانکار</TableHead>
                            <TableHead className="text-xs font-bold text-gray-600 h-9 text-center">مانده</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trialBalanceRows.map((row, idx) => {
                            const balance = row.totalDebit - row.totalCredit
                            const balanceLabel = balance > 0
                              ? `${formatPrice(balance)} بد`
                              : balance < 0
                                ? `${formatPrice(Math.abs(balance))} بس`
                                : '—'
                            return (
                              <TableRow key={idx} className="hover:bg-emerald-50/40">
                                <TableCell className="text-xs font-mono text-gray-500">{row.accountCode}</TableCell>
                                <TableCell className="text-sm font-medium text-gray-900">{row.accountName}</TableCell>
                                <TableCell className="text-xs text-center font-mono">{formatPrice(row.totalDebit)}</TableCell>
                                <TableCell className="text-xs text-center font-mono">{formatPrice(row.totalCredit)}</TableCell>
                                <TableCell className="text-xs text-center font-mono">{balanceLabel}</TableCell>
                              </TableRow>
                            )
                          })}
                          {/* ردیف جمع کل */}
                          <TableRow className="bg-gray-100 font-bold">
                            <TableCell colSpan={2} className="text-sm">جمع کل</TableCell>
                            <TableCell className="text-xs text-center font-mono text-red-600">
                              {formatPrice(trialGrandDebit)}
                            </TableCell>
                            <TableCell className="text-xs text-center font-mono text-emerald-600">
                              {formatPrice(trialGrandCredit)}
                            </TableCell>
                            <TableCell className="text-xs text-center">—</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <UpgradeCard
                feature="تراز آزمایشی"
                description="در پلن پایه، تراز آزمایشی قابل مشاهده نیست. برای دسترسی به گزارش تراز آزمایشی (جمع بدهکار و بستانکار هر حساب + بررسی تعادل) به پلن حرفه‌ای ارتقا دهید."
                onUpgrade={handleUpgradeClick}
              />
            )}
          </TabsContent>

          {/* ★★★ v3.24: تب چک‌ها */}
          <TabsContent value="checks" className="flex-1 overflow-auto m-0" dir="rtl">
            {features.canAccessCredit ? (
              <div className="p-3 sm:p-6 space-y-3">
                {/* دکمه افزودن چک — v3.32: justify-start برای RTL */}
                <div className="flex justify-start">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1"
                    onClick={() => {
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
                    <Plus className="w-3.5 h-3.5" />
                    ثبت چک جدید
                  </Button>
                </div>

                {/* لیست چک‌ها */}
                {checks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <FileText className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">چکی ثبت نشده است</p>
                  </div>
                ) : (
                  <div className="space-y-2" dir="rtl">
                    <Table dir="rtl">
                      <TableHeader dir="rtl">
                        <TableRow className="bg-gray-50" dir="rtl">
                          <TableHead className="text-[10px] text-right">نوع</TableHead>
                          <TableHead className="text-[10px] text-right">شماره چک</TableHead>
                          <TableHead className="text-[10px] text-right">بانک</TableHead>
                          <TableHead className="text-[10px] text-right">مبلغ</TableHead>
                          <TableHead className="text-[10px] text-right">سررسید</TableHead>
                          <TableHead className="text-[10px] text-right">وضعیت</TableHead>
                          <TableHead className="text-[10px] text-center">عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody dir="rtl">
                        {checks.map((chk) => (
                          <TableRow key={chk.id} dir="rtl">
                            <TableCell className="text-[10px] text-right">
                              <Badge variant="outline" className={`text-[9px] ${chk.type === 'receivable' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                                {chk.type === 'receivable' ? 'دریافتنی' : 'پرداختنی'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-right" dir="ltr">{chk.checkNumber}</TableCell>
                            <TableCell className="text-[10px] text-right">{chk.bankName}</TableCell>
                            <TableCell className="text-[10px] font-mono text-right" dir="ltr">{(chk.amount || 0).toLocaleString('fa-IR')}</TableCell>
                            <TableCell className="text-[10px] text-right">{new Date(chk.dueDate).toLocaleDateString('fa-IR')}</TableCell>
                            <TableCell className="text-[10px] text-right">
                              <Badge variant="outline" className={`text-[9px] ${
                                chk.status === 'cleared' ? 'bg-emerald-100 text-emerald-700' :
                                chk.status === 'bounced' ? 'bg-red-100 text-red-700' :
                                chk.status === 'deposited' ? 'bg-blue-100 text-blue-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {chk.status === 'pending' ? 'در جریان' :
                                 chk.status === 'deposited' ? 'نزد بانک' :
                                 chk.status === 'cleared' ? 'وصول شده' :
                                 chk.status === 'bounced' ? 'برگشت خورده' : chk.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                {chk.status === 'pending' && (
                                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[9px] text-blue-600 hover:bg-blue-50" onClick={() => handleCheckStatus(chk.id, 'deposited')} title="سپردن به بانک">
                                    سپردن
                                  </Button>
                                )}
                                {chk.status === 'deposited' && (
                                  <>
                                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[9px] text-emerald-600 hover:bg-emerald-50" onClick={() => handleCheckStatus(chk.id, 'cleared')} title="وصول">
                                      وصول
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[9px] text-red-600 hover:bg-red-50" onClick={() => handleCheckStatus(chk.id, 'bounced')} title="برگشت">
                                      برگشت
                                    </Button>
                                  </>
                                )}
                                {(chk.status === 'pending' || chk.status === 'bounced') && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-blue-500 hover:bg-blue-50"
                                    onClick={() => {
                                      setEditCheckTarget({ ...chk })
                                      setEditCheckDialogOpen(true)
                                    }}
                                    title="ویرایش"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                )}
                                {(chk.status === 'pending' || chk.status === 'bounced') && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                                    onClick={() => {
                                      setDeleteCheckTarget(chk)
                                      setDeleteCheckDialogOpen(true)
                                    }}
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              <UpgradeCard
                feature="مدیریت چک‌ها"
                description="مدیریت چک‌های دریافتنی و پرداختنی فقط در پلن حرفه‌ای و سازمانی در دسترس است"
                onUpgrade={handleUpgradeClick}
              />
            )}
          </TabsContent>

          {/* ★★★ v5.3 (Phase 4): تب اسناد تکرارشونده */}
          {!isBasicTier && (
            <TabsContent value="recurring" className="flex-1 overflow-auto m-0" dir="rtl">
              <div className="p-3 sm:p-6">
                <RecurringJournalsManager accounts={accounts} />
              </div>
            </TabsContent>
          )}

          {/* ★★★ v8.8: تب دارایی‌های ثابت */}
          <TabsContent value="fixed-assets" className="flex-1 overflow-auto m-0" dir="rtl">
            <div className="p-3 sm:p-6 space-y-3">
              {/* هدر */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h3 className="text-sm font-bold">دارایی‌های ثابت</h3>
                    <p className="text-[10px] text-gray-500">ثبت دارایی‌های ثابت و محاسبه استهلاک</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDepreciate}
                    disabled={depreciating || fixedAssets.filter(a => a.status === 'active').length === 0}
                    className="text-amber-600 border-amber-300 hover:bg-amber-50"
                  >
                    {depreciating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span className="mr-1">محاسبه استهلاک</span>
                  </Button>
                  <Button size="sm" onClick={() => setAssetDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="mr-1">دارایی جدید</span>
                  </Button>
                </div>
              </div>

              {/* لیست دارایی‌ها */}
              {fixedAssets.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
                  <Building className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-500">هنوز دارایی ثابتی ثبت نشده است</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] text-right">کد</TableHead>
                        <TableHead className="text-[10px] text-right">نام</TableHead>
                        <TableHead className="text-[10px] text-right">دسته</TableHead>
                        <TableHead className="text-[10px] text-center">بهای خرید</TableHead>
                        <TableHead className="text-[10px] text-center">استهلاک انباشته</TableHead>
                        <TableHead className="text-[10px] text-center">ارزش دفتری</TableHead>
                        <TableHead className="text-[10px] text-center">عمر (ماه)</TableHead>
                        <TableHead className="text-[10px] text-center">وضعیت</TableHead>
                        <TableHead className="text-[10px] text-center">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fixedAssets.map((asset) => (
                        <TableRow key={asset.id}>
                          <TableCell className="text-[10px] font-mono" dir="ltr">{asset.code}</TableCell>
                          <TableCell className="text-[10px]">{asset.name}</TableCell>
                          <TableCell className="text-[10px] text-gray-500">{asset.category}</TableCell>
                          <TableCell className="text-[10px] text-center font-mono">{(asset.purchasePrice || 0).toLocaleString('fa-IR')}</TableCell>
                          <TableCell className="text-[10px] text-center font-mono text-orange-600">{(asset.accumulatedDepreciation || 0).toLocaleString('fa-IR')}</TableCell>
                          <TableCell className="text-[10px] text-center font-mono text-emerald-600">{(asset.bookValue || 0).toLocaleString('fa-IR')}</TableCell>
                          <TableCell className="text-[10px] text-center">{(asset.usefulLife || 0).toLocaleString('fa-IR')}</TableCell>
                          <TableCell className="text-[10px] text-center">
                            <Badge variant="outline" className={`text-[9px] ${
                              asset.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                              asset.status === 'fully_depreciated' ? 'bg-gray-100 text-gray-500' :
                              'bg-red-50 text-red-700'
                            }`}>
                              {asset.status === 'active' ? 'فعال' :
                               asset.status === 'fully_depreciated' ? 'کاملاً مستهلک' :
                               asset.status === 'sold' ? 'فروخته شده' : asset.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-blue-500 hover:bg-blue-50"
                                onClick={() => {
                                  setEditAssetTarget({ ...asset })
                                  setEditAssetDialogOpen(true)
                                }}
                                title="ویرایش"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                                onClick={() => handleDeleteAsset(asset.id)}
                                disabled={asset.status === 'fully_depreciated'}
                                title="حذف"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ★★★ v8.3: تب بازیابی اسناد — فقط مدیران */}
          {isManager && (
            <TabsContent value="recover-journals" className="flex-1 overflow-auto m-0" dir="rtl">
              <div className="p-3 sm:p-6">
                <RecoverJournalsTab embedded={true} />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ★★★ v8.8: مودال دارایی ثابت جدید */}
      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="sm:max-w-[480px] font-fa" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-emerald-600" />
              ثبت دارایی ثابت جدید
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">نام دارایی *</Label>
                <Input value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="مثلاً: یخچال فروشگاه" className="text-xs mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">کد *</Label>
                <Input value={assetForm.code} onChange={(e) => setAssetForm({ ...assetForm, code: e.target.value })} placeholder="مثلاً: FA-001" className="text-xs mt-1 h-9" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">دسته</Label>
                <select value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })} className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2 bg-white">
                  <option value="تجهیزات">تجهیزات</option>
                  <option value="ماشین‌آلات">ماشین‌آلات</option>
                  <option value="مبلمان">مبلمان</option>
                  <option value="ساختمان">ساختمان</option>
                  <option value="وسایل نقلیه">وسایل نقلیه</option>
                  <option value="کامپیوتر">کامپیوتر و تجهیزات IT</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">تاریخ خرید</Label>
                <PersianDatePicker
                  value={assetForm.purchaseDate}
                  onChange={(iso) => setAssetForm({ ...assetForm, purchaseDate: iso })}
                  placeholder="انتخاب تاریخ خرید"
                  label="تاریخ خرید"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">بهای خرید (ریال) *</Label>
                <Input type="number" value={assetForm.purchasePrice} onChange={(e) => setAssetForm({ ...assetForm, purchasePrice: e.target.value })} placeholder="15000000" className="text-xs mt-1 h-9" dir="ltr" />
              </div>
              <div>
                <Label className="text-xs">ارزش اسقاط</Label>
                <Input type="number" value={assetForm.salvageValue} onChange={(e) => setAssetForm({ ...assetForm, salvageValue: e.target.value })} placeholder="0" className="text-xs mt-1 h-9" dir="ltr" />
              </div>
              <div>
                <Label className="text-xs">عمر مفید (ماه)</Label>
                <Input type="number" value={assetForm.usefulLife} onChange={(e) => setAssetForm({ ...assetForm, usefulLife: e.target.value })} placeholder="60" className="text-xs mt-1 h-9" dir="ltr" />
              </div>
            </div>
            <div>
              <Label className="text-xs">توضیحات (اختیاری)</Label>
              <Textarea value={assetForm.description} onChange={(e) => setAssetForm({ ...assetForm, description: e.target.value })} placeholder="توضیحات..." className="text-xs mt-1 min-h-[40px]" />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-[10px] text-blue-700">
              ★ با ثبت دارایی، سند خرید خودکار صادر می‌شود (Dr. 1400 تجهیزات / Cr. 1010 صندوق).
              استهلاک را می‌توانید بعداً با دکمه «محاسبه استهلاک» ثبت کنید.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetDialogOpen(false)}>انصراف</Button>
            <Button onClick={handleSaveAsset} disabled={assetSaving || !assetForm.name || !assetForm.code || !assetForm.purchasePrice} className="bg-emerald-600 hover:bg-emerald-700">
              {assetSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              ثبت دارایی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v8.8: مودال ویرایش دارایی ثابت */}
      <Dialog open={editAssetDialogOpen} onOpenChange={setEditAssetDialogOpen}>
        <DialogContent className="sm:max-w-[480px] font-fa" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              ویرایش دارایی ثابت
            </DialogTitle>
          </DialogHeader>
          {editAssetTarget && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">نام دارایی *</Label>
                  <Input value={editAssetTarget.name || ''} onChange={(e) => setEditAssetTarget({ ...editAssetTarget, name: e.target.value })} className="text-xs mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">کد *</Label>
                  <Input value={editAssetTarget.code || ''} onChange={(e) => setEditAssetTarget({ ...editAssetTarget, code: e.target.value })} className="text-xs mt-1 h-9" dir="ltr" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">دسته</Label>
                  <select value={editAssetTarget.category || 'تجهیزات'} onChange={(e) => setEditAssetTarget({ ...editAssetTarget, category: e.target.value })} className="w-full text-xs mt-1 border border-gray-200 rounded h-9 px-2 bg-white">
                    <option value="تجهیزات">تجهیزات</option>
                    <option value="ماشین‌آلات">ماشین‌آلات</option>
                    <option value="مبلمان">مبلمان</option>
                    <option value="ساختمان">ساختمان</option>
                    <option value="وسایل نقلیه">وسایل نقلیه</option>
                    <option value="کامپیوتر">کامپیوتر و تجهیزات IT</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">تاریخ خرید</Label>
                  <PersianDatePicker
                    value={editAssetTarget.purchaseDate ? new Date(editAssetTarget.purchaseDate).toISOString().split('T')[0] : ''}
                    onChange={(iso) => setEditAssetTarget({ ...editAssetTarget, purchaseDate: iso })}
                    placeholder="انتخاب تاریخ"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">بهای خرید *</Label>
                  <Input type="number" value={editAssetTarget.purchasePrice || ''} onChange={(e) => setEditAssetTarget({ ...editAssetTarget, purchasePrice: e.target.value })} className="text-xs mt-1 h-9" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">ارزش اسقاط</Label>
                  <Input type="number" value={editAssetTarget.salvageValue || '0'} onChange={(e) => setEditAssetTarget({ ...editAssetTarget, salvageValue: e.target.value })} className="text-xs mt-1 h-9" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">عمر (ماه)</Label>
                  <Input type="number" value={editAssetTarget.usefulLife || '60'} onChange={(e) => setEditAssetTarget({ ...editAssetTarget, usefulLife: e.target.value })} className="text-xs mt-1 h-9" dir="ltr" />
                </div>
              </div>
              <div>
                <Label className="text-xs">توضیحات</Label>
                <Textarea value={editAssetTarget.description || ''} onChange={(e) => setEditAssetTarget({ ...editAssetTarget, description: e.target.value })} className="text-xs mt-1 min-h-[40px]" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAssetDialogOpen(false)}>انصراف</Button>
            <Button onClick={handleEditAsset} disabled={editAssetSaving} className="bg-blue-600 hover:bg-blue-700">
              {editAssetSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              ذخیره تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v8.8: مودال حذف چک */}
      <Dialog open={deleteCheckDialogOpen} onOpenChange={setDeleteCheckDialogOpen}>
        <DialogContent className="sm:max-w-[400px] font-fa" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              حذف چک
            </DialogTitle>
          </DialogHeader>
          {deleteCheckTarget && (
            <div className="space-y-3 py-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                <p className="font-bold">آیا از حذف این چک اطمینان دارید؟</p>
                <p className="mt-1">سند حسابداری مربوطه ابطال خواهد شد. این عمل قابل بازگشت نیست.</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">شماره چک:</span>
                  <span className="font-mono" dir="ltr">{deleteCheckTarget.checkNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">بانک:</span>
                  <span>{deleteCheckTarget.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">مبلغ:</span>
                  <span className="font-bold">{(deleteCheckTarget.amount || 0).toLocaleString('fa-IR')} ریال</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">نوع:</span>
                  <span>{deleteCheckTarget.type === 'receivable' ? 'دریافتنی' : 'پرداختنی'}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCheckDialogOpen(false)}>انصراف</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteCheckTarget) {
                  handleDeleteCheck(deleteCheckTarget.id)
                  setDeleteCheckDialogOpen(false)
                  setDeleteCheckTarget(null)
                }
              }}
            >
              <Trash2 className="w-4 h-4 ml-1" />
              بله، حذف کن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v8.8: مودال ویرایش چک */}
      <Dialog open={editCheckDialogOpen} onOpenChange={setEditCheckDialogOpen}>
        <DialogContent className="sm:max-w-[440px] font-fa" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              ویرایش چک
            </DialogTitle>
          </DialogHeader>
          {editCheckTarget && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">شماره چک *</Label>
                  <Input value={editCheckTarget.checkNumber || ''} onChange={(e) => setEditCheckTarget({ ...editCheckTarget, checkNumber: e.target.value })} className="text-xs h-9 mt-1" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">بانک *</Label>
                  <Input value={editCheckTarget.bankName || ''} onChange={(e) => setEditCheckTarget({ ...editCheckTarget, bankName: e.target.value })} className="text-xs h-9 mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">شعبه</Label>
                  <Input value={editCheckTarget.branchName || ''} onChange={(e) => setEditCheckTarget({ ...editCheckTarget, branchName: e.target.value })} className="text-xs h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">سررسید</Label>
                  <PersianDatePicker
                    value={editCheckTarget.dueDate ? new Date(editCheckTarget.dueDate).toISOString().split('T')[0] : ''}
                    onChange={(iso) => setEditCheckTarget({ ...editCheckTarget, dueDate: iso })}
                    placeholder="انتخاب سررسید"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">مبلغ (ریال) *</Label>
                  <Input type="number" value={editCheckTarget.amount || ''} onChange={(e) => setEditCheckTarget({ ...editCheckTarget, amount: e.target.value })} className="text-xs h-9 mt-1" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">ذی‌نفع</Label>
                  <Input value={editCheckTarget.payeeName || ''} onChange={(e) => setEditCheckTarget({ ...editCheckTarget, payeeName: e.target.value })} className="text-xs h-9 mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">توضیحات</Label>
                <Textarea value={editCheckTarget.description || ''} onChange={(e) => setEditCheckTarget({ ...editCheckTarget, description: e.target.value })} className="text-xs mt-1 min-h-[40px]" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCheckDialogOpen(false)}>انصراف</Button>
            <Button onClick={handleEditCheck} disabled={editCheckSaving} className="bg-blue-600 hover:bg-blue-700">
              {editCheckSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              ذخیره تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════
          Entry Detail Dialog — inline (بدون نیاز به store)
          ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              سند {detailEntry?.entryNumber || detailEntry?.number}
            </DialogTitle>
          </DialogHeader>

          {detailEntry && (
            <div className="space-y-4">
              {/* اطلاعات سند */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">شماره:</span>{' '}
                  <span className="font-mono">{detailEntry.entryNumber || detailEntry.number}</span>
                </div>
                <div>
                  <span className="text-gray-500">تاریخ:</span>{' '}
                  {formatDate(detailEntry.date || detailEntry.entryDate || '')}
                </div>
                <div>
                  <span className="text-gray-500">منبع:</span>{' '}
                  <Badge variant="outline" className="text-xs">
                    {getSourceTypeLabel(detailEntry.sourceType, detailEntry.isManual)}
                  </Badge>
                </div>
                <div>
                  <span className="text-gray-500">وضعیت:</span>{' '}
                  {getStatusBadge(detailEntry.status, detailEntry.isPosted)}
                </div>
              </div>

              {detailEntry.description && (
                <div className="text-sm">
                  <span className="text-gray-500">شرح:</span>{' '}
                  {detailEntry.description}
                </div>
              )}

              {/* خطوط سند */}
              {(detailEntry.lines || detailEntry.items || []).length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">حساب</TableHead>
                        <TableHead className="w-[100px] text-center text-xs">بدهکار</TableHead>
                        <TableHead className="w-[100px] text-center text-xs">بستانکار</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detailEntry.lines || detailEntry.items || []).map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">
                            {line.accountCode && (
                              <span className="font-mono text-gray-500 ml-1">{line.accountCode}</span>
                            )}
                            {line.accountName}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {line.debit > 0 ? formatPrice(line.debit) : '—'}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {line.credit > 0 ? formatPrice(line.credit) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50 font-semibold">
                        <TableCell className="text-xs">جمع</TableCell>
                        <TableCell className="text-center font-mono text-xs text-red-600">
                          {formatPrice(
                            (detailEntry.lines || detailEntry.items || []).reduce((s, l) => s + (l.debit || 0), 0)
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-emerald-600">
                          {formatPrice(
                            (detailEntry.lines || detailEntry.items || []).reduce((s, l) => s + (l.credit || 0), 0)
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailEntry(null)}>بستن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v3.18: دیالوگ سند دستی */}
      <Dialog open={manualEntryOpen} onOpenChange={setManualEntryOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileEdit className="w-4 h-4 text-emerald-600" />
              ثبت سند دستی
            </DialogTitle>
            <DialogDescription className="text-xs">
              سند حسابداری دستی را با حداقل ۲ ردیف وارد کنید
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* شرح و تاریخ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <Label className="text-[11px] text-gray-600 mb-0.5 block">شرح سند</Label>
                <Input
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="مثلاً: ثبت هزینه اجاره"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">تاریخ</Label>
                {/* ★★★ v3.32: استفاده از PersianDatePicker شمسی (به‌جای input date میلادی) */}
                <PersianDatePicker
                  value={manualDate}
                  onChange={(iso) => setManualDate(iso || new Date().toISOString().split('T')[0])}
                  placeholder="انتخاب تاریخ"
                />
              </div>
            </div>

            {/* ردیف‌های سند */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-[10px] h-7">حساب</TableHead>
                    <TableHead className="text-[10px] h-7 hidden sm:table-cell">شرح ردیف</TableHead>
                    <TableHead className="text-[10px] h-7 text-center w-20">بدهکار</TableHead>
                    <TableHead className="text-[10px] h-7 text-center w-20">بستانکار</TableHead>
                    <TableHead className="h-7 w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manualLines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <select
                          value={line.accountId}
                          onChange={(e) => updateManualLine(idx, 'accountId', e.target.value)}
                          className="w-full h-7 text-[11px] border border-gray-200 rounded px-1"
                        >
                          <option value="">— انتخاب —</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Input
                          value={line.description}
                          onChange={(e) => updateManualLine(idx, 'description', e.target.value)}
                          placeholder="توضیحات"
                          className="h-7 text-[11px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.debit}
                          onChange={(e) => updateManualLine(idx, 'debit', e.target.value)}
                          placeholder="0"
                          className="h-7 text-[11px] text-center font-mono"
                          dir="ltr"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.credit}
                          onChange={(e) => updateManualLine(idx, 'credit', e.target.value)}
                          placeholder="0"
                          className="h-7 text-[11px] text-center font-mono"
                          dir="ltr"
                        />
                      </TableCell>
                      <TableCell>
                        {manualLines.length > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                            onClick={() => removeManualLine(idx)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* ردیف جمع کل */}
                  <TableRow className="bg-gray-50 font-bold">
                    <TableCell className="text-[11px]">جمع کل</TableCell>
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="text-[11px] text-center font-mono text-red-600">
                      {manualTotalDebit.toLocaleString('fa-IR')}
                    </TableCell>
                    <TableCell className="text-[11px] text-center font-mono text-emerald-600">
                      {manualTotalCredit.toLocaleString('fa-IR')}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  {/* وضعیت تراز */}
                  <TableRow>
                    <TableCell colSpan={5} className={`text-[10px] text-center py-1 ${manualIsBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {manualIsBalanced ? '✓ سند متعادل است' : `✗ اختلاف: ${Math.abs(manualTotalDebit - manualTotalCredit).toLocaleString('fa-IR')}`}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <Button variant="outline" size="sm" className="text-xs h-7" onClick={addManualLine}>
              <Plus className="w-3 h-3 ml-1" />
              افزودن ردیف
            </Button>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setManualEntryOpen(false)} className="text-xs h-8">
              انصراف
            </Button>
            <Button
              onClick={handleSaveManualEntry}
              disabled={manualSaving || !manualIsBalanced || !manualDescription.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            >
              {manualSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 ml-1" />}
              ثبت سند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v3.24: دیالوگ ثبت چک */}
      <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-emerald-600" />
              ثبت چک جدید
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* نوع چک */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-md">
              <button
                className={`flex-1 py-1.5 text-xs rounded ${checkType === 'receivable' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500'}`}
                onClick={() => setCheckType('receivable')}
              >
                چک دریافتنی
              </button>
              <button
                className={`flex-1 py-1.5 text-xs rounded ${checkType === 'payable' ? 'bg-white text-orange-700 font-bold shadow-sm' : 'text-gray-500'}`}
                onClick={() => setCheckType('payable')}
              >
                چک پرداختنی
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">شماره چک</Label>
                <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="۱۲۳۴۵۶۷" className="h-8 text-xs" dir="ltr" />
              </div>
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">نام بانک</Label>
                <Input value={checkBank} onChange={(e) => setCheckBank(e.target.value)} placeholder="ملت" className="h-8 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">مبلغ (ریال)</Label>
                <Input type="number" value={checkAmount} onChange={(e) => setCheckAmount(e.target.value)} placeholder="۵۰۰۰۰۰۰" className="h-8 text-xs font-mono" dir="ltr" />
              </div>
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">تاریخ سررسید</Label>
                {/* ★★★ v3.36.11: استفاده از PersianDatePicker شمسی (به‌جای input date میلادی) */}
                <PersianDatePicker
                  value={checkDueDate}
                  onChange={(date) => setCheckDueDate(date)}
                  placeholder="انتخاب تاریخ سررسید"
                />
              </div>
            </div>

            {checkType === 'payable' && (
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">نام گیرنده</Label>
                <Input value={checkPayee} onChange={(e) => setCheckPayee(e.target.value)} placeholder="نام شخص/شرکت" className="h-8 text-xs" />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCheckDialogOpen(false)} className="text-xs h-8">انصراف</Button>
            <Button onClick={handleSaveCheck} disabled={checkSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
              {checkSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 ml-1" />}
              ثبت چک
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v3.25: دیالوگ افزودن/ویرایش حساب */}
      <Dialog open={accountFormOpen} onOpenChange={setAccountFormOpen}>
        <DialogContent className="sm:max-w-[400px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              {accountFormMode === 'add' ? 'افزودن حساب جدید' : 'ویرایش حساب'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">کد حساب</Label>
                <Input value={accountFormCode} onChange={(e) => setAccountFormCode(e.target.value)} placeholder="۶۰۰۰" className="h-8 text-xs font-mono" dir="ltr" />
              </div>
              <div>
                <Label className="text-[11px] text-gray-600 mb-0.5 block">نام حساب</Label>
                <Input value={accountFormName} onChange={(e) => setAccountFormName(e.target.value)} placeholder="هزینه سوخت" className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">نوع حساب</Label>
              <select
                value={accountFormType}
                onChange={(e) => setAccountFormType(e.target.value)}
                className="w-full h-8 text-xs border border-gray-200 rounded px-2 bg-white"
              >
                <option value="cash">صندوق</option>
                <option value="bank">بانک</option>
                <option value="receivable">دریافتنی</option>
                <option value="payable">پرداختنی</option>
                <option value="inventory">موجودی کالا</option>
                <option value="asset">دارایی</option>
                <option value="liability">بدهی</option>
                <option value="equity">سرمایه</option>
                <option value="revenue">درآمد</option>
                <option value="cogs">بهای تمام شده</option>
                <option value="expense">هزینه</option>
              </select>
            </div>
            {/* ★★★ v3.25: حساب والد */}
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">حساب والد (اختیاری)</Label>
              <select
                value={accountFormParentId}
                onChange={(e) => setAccountFormParentId(e.target.value)}
                className="w-full h-8 text-xs border border-gray-200 rounded px-2 bg-white"
              >
                <option value="">— بدون والد —</option>
                {accounts
                  .filter((a) => a.id !== accountFormId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
              </select>
              <p className="text-[9px] text-gray-400 mt-0.5">
                با انتخاب حساب والد، این حساب به‌عنوان حساب فرعی شناخته می‌شود
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 rounded">
              <span className="text-[11px] text-gray-700">حساب فعال</span>
              <Switch checked={accountFormIsActive} onCheckedChange={setAccountFormIsActive} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAccountFormOpen(false)} className="text-xs h-8">انصراف</Button>
            <Button onClick={handleSaveAccount} disabled={accountFormSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
              {accountFormSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 ml-1" />}
              {accountFormMode === 'add' ? 'افزودن' : 'ذخیره'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v3.25: دیالوگ تأیید حذف حساب */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-red-600" />
              تأیید حذف حساب
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-xs text-gray-700">
              آیا از حذف حساب «<span className="font-bold">{deleteAccountName}</span>» مطمئن هستید؟
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[10px] text-amber-700">
              <AlertCircle className="w-3 h-3 inline ml-1" />
              توجه: اگر این حساب در اسناد حسابداری استفاده شده باشد، حذف آن ممکن است باعث خطا شود. در این صورت ابتدا اسناد مربوطه را حذف یا ویرایش کنید.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} className="text-xs h-8">انصراف</Button>
            <Button onClick={handleDeleteAccount} disabled={deleteSaving} className="bg-red-600 hover:bg-red-700 text-white text-xs h-8">
              {deleteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 ml-1" />}
              حذف حساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v3.31: دیالوگ ابطال سند */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Ban className="w-5 h-5 text-red-600" />
              ابطال سند حسابداری
            </DialogTitle>
            <DialogDescription className="text-xs">
              سند به‌جای حذف، ابطال می‌شود تا سابقه آن حفظ شود.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {cancelEntry && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">شماره سند:</span>
                  <span className="font-mono font-bold text-gray-800">
                    {cancelEntry.entryNumber || cancelEntry.number}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">تاریخ:</span>
                  <span className="text-gray-700">
                    {formatDate(cancelEntry.date || cancelEntry.entryDate || '')}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">شرح:</span>
                  <span className="text-gray-700 text-left max-w-[280px] truncate">
                    {cancelEntry.description}
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                  <span className="text-gray-500">مبلغ:</span>
                  <span className="font-mono font-bold text-gray-800">
                    {formatPrice(cancelEntry.totalDebit || 0)} ریال
                  </span>
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-[11px] text-amber-700 leading-relaxed">
              <AlertCircle className="w-3.5 h-3.5 inline ml-1" />
              <strong>توجه:</strong> با ابطال سند:
              <ul className="list-disc pr-4 mt-1 space-y-0.5">
                <li>سند در گزارش‌ها قابل مشاهده خواهد بود ولی در محاسبات لحاظ نمی‌شود</li>
                <li>این عمل غیرقابل بازگشت است</li>
                <li>اطلاعات ابطال (کاربر، زمان، دلیل) در AuditLog ثبت می‌شود</li>
              </ul>
            </div>

            <div>
              <Label className="text-[11px] text-gray-600 mb-1 block">
                دلیل ابطال (اختیاری)
              </Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="مثلاً: سند اشتباه ثبت شده بود / مبلغ اشتباه بود / ..."
                className="text-xs min-h-[60px] resize-none"
                maxLength={500}
              />
              <p className="text-[9px] text-gray-400 mt-0.5">
                {cancelReason.length.toLocaleString('fa-IR')} / ۵۰۰ کاراکتر
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} className="text-xs h-8">
              انصراف
            </Button>
            <Button
              onClick={handleConfirmCancel}
              disabled={cancelSaving}
              className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
            >
              {cancelSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5 ml-1" />}
              تأیید ابطال سند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v3.31: دیالوگ مشاهده AuditLog (تاریخچه تغییرات) */}
      <Dialog open={auditLogOpen} onOpenChange={setAuditLogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <History className="w-5 h-5 text-blue-600" />
              تاریخچه تغییرات سند
            </DialogTitle>
            <DialogDescription className="text-xs">
              {auditLogEntry && (
                <>
                  سند: <span className="font-mono font-bold">{auditLogEntry.entryNumber || auditLogEntry.number}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* اطلاعات سند */}
            {auditLogEntryInfo && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-gray-700 mb-1">اطلاعات سند:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">شماره:</span>{' '}
                    <span className="font-mono">{auditLogEntryInfo.number}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">وضعیت:</span>{' '}
                    {getStatusBadge(auditLogEntryInfo.status, auditLogEntryInfo.status === 'posted')}
                  </div>
                  <div>
                    <span className="text-gray-500">تاریخ:</span>{' '}
                    {auditLogEntryInfo.date ? formatDate(auditLogEntryInfo.date) : '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">منبع:</span>{' '}
                    {getSourceTypeLabel(auditLogEntryInfo.sourceType, auditLogEntryInfo.sourceType === 'manual')}
                  </div>
                </div>
                {auditLogEntryInfo.isCancelled && (
                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                    <p className="text-[11px] font-bold text-red-700">اطلاعات ابطال:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">اطلاع توسط:</span>{' '}
                        <span className="font-medium">{auditLogEntryInfo.cancelledByUsername || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">تاریخ ابطال:</span>{' '}
                        {auditLogEntryInfo.cancelledAt ? formatDate(auditLogEntryInfo.cancelledAt) : '—'}
                      </div>
                    </div>
                    {auditLogEntryInfo.cancelReason && (
                      <div className="text-xs mt-1">
                        <span className="text-gray-500">دلیل:</span>{' '}
                        <span className="text-gray-700">{auditLogEntryInfo.cancelReason}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* لیست AuditLogها */}
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                تاریخچه ({auditLogs.length.toLocaleString('fa-IR')} رخداد)
              </p>
              {auditLogLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  هیچ رخدادی ثبت نشده است
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log: any, idx: number) => (
                    <div
                      key={log.id}
                      className={`border rounded-lg p-2.5 ${
                        log.actionColor === 'red' ? 'border-red-200 bg-red-50/30' :
                        log.actionColor === 'blue' ? 'border-blue-200 bg-blue-50/30' :
                        log.actionColor === 'emerald' ? 'border-emerald-200 bg-emerald-50/30' :
                        'border-gray-200 bg-gray-50/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${
                            log.actionColor === 'red' ? 'bg-red-500' :
                            log.actionColor === 'blue' ? 'bg-blue-500' :
                            log.actionColor === 'emerald' ? 'bg-emerald-500' :
                            'bg-gray-400'
                          }`} />
                          <span className="text-xs font-bold text-gray-800">{log.actionLabel}</span>
                        </div>
                        <span className="text-[10px] text-gray-500" dir="ltr">
                          {log.at ? new Date(log.at).toLocaleString('fa-IR') : ''}
                        </span>
                      </div>
                      {log.username && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
                          <User className="w-3 h-3" />
                          توسط: <span className="font-medium text-gray-700">{log.username}</span>
                          {log.userRole && <span className="text-gray-400">({log.userRole})</span>}
                        </div>
                      )}
                      {log.details && (
                        <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                          {typeof log.details === 'object' ? (
                            <div className="space-y-0.5">
                              {log.details.entryNumber && (
                                <div>• شماره سند: <span className="font-mono">{log.details.entryNumber}</span></div>
                              )}
                              {log.details.reason && (
                                <div>• دلیل: <span className="text-gray-700">{log.details.reason}</span></div>
                              )}
                              {log.details.cancelledByUsername && (
                                <div>• ابطال توسط: <span className="text-gray-700">{log.details.cancelledByUsername}</span></div>
                              )}
                              {log.details.totalDebit !== undefined && (
                                <div>• مبلغ: <span className="font-mono">{Number(log.details.totalDebit).toLocaleString('fa-IR')} ریال</span></div>
                              )}
                            </div>
                          ) : (
                            <span>{String(log.details)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditLogOpen(false)} className="text-xs h-8">
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


