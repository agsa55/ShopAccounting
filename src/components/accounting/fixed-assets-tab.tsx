'use client'

// ============================================================================
// src/components/accounting/fixed-assets-tab.tsx — Fixed Assets Tab
// ShopAccounting v30.0 — Jalali Dates + Safe Decimal + Accounting Guards
// ============================================================================
// ★ v30.0:
//   - استفاده از jalali-utils برای تبدیل/نمایش تاریخ شمسی
//   - رفع باگ نمایش تاریخ‌ها (مثل ۴۰/۰/۰)
//   - تبدیل امن Decimal به number برای کارت‌های آماری
//   - دارایی ثابت به‌عنوان ثبت دائمی نمایش داده می‌شود (نه سال‌مالی‌محور)
//   - ثبت دارایی جدید فقط از طریق API و با اعتبارسنجی سال مالی فعال
//   - ویرایش مالی فقط اگر دارایی استهلاک نخورده باشد
//   - حذف فقط اگر استهلاک انباشته/سند استهلاک نداشته باشد
//   - پشتیبانی آفلاین با صف همگام‌سازی
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '@/lib/store'
import {
  cacheFixedAssets,
  getCachedFixedAssets,
  addFixedAssetToSyncQueue,
} from '@/lib/offline-db'
import { syncEngine } from '@/lib/sync-engine'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Package,
  Eye,
  CheckCircle2,
  AlertCircle,
  Save,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  RefreshCw,
  TrendingDown,
  Info,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  gregorianISOToJalali,
  jalaliToGregorianISO,
  toFaNum,
} from '@/lib/jalali-utils'

// ─── Types ────────────────────────────────────────────────────

interface FixedAsset {
  id: string
  name: string
  code: string
  category: string
  purchasePrice: number
  salvageValue: number
  usefulLife: number
  purchaseDate: string
  depreciationStartDate?: string | null
  lastDepreciationDate?: string | null
  depreciationMethod?: string | null
  accumulatedDepreciation?: number
  bookValue?: number
  monthlyDepreciation?: number
  remainingUsefulLifeMonths?: number
  status?: 'active' | 'fully_depreciated' | 'sold' | string
  description?: string | null
  accountId?: string | null
  accumDepAccountId?: string | null
  depExpenseAccountId?: string | null
  journalEntryId?: string | null
  fiscalYearId?: string | null
  fiscalYearName?: string | null
  canEdit?: boolean
  canDelete?: boolean
  createdAt?: string
  // ★★★ فیلدهای آفلاین
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

// ─── Constants ────────────────────────────────────────────────

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

const ASSET_CATEGORIES = [
  'تجهیزات',
  'ماشین‌آلات',
  'مبلمان',
  'ساختمان',
  'وسایل نقلیه',
  'کامپیوتر و تجهیزات IT',
]

// ─── Helpers ─────────────────────────────────────────────────

function safeNum(value: any): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }

  if (typeof value === 'object') {
    try {
      const s = String(value)
      const n = parseFloat(s.replace(/,/g, ''))
      if (Number.isFinite(n)) return n
    } catch {}
  }

  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatCurrency(value: any): string {
  return `${Math.round(safeNum(value)).toLocaleString('fa-IR')} ریال`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toISODate(value: any): string | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }

  const s = String(value).trim()
  if (!s) return null

  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`

  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10)
  }

  return null
}

function formatDateJalali(value: any): string {
  const iso = toISODate(value)
  if (!iso) return '—'

  const j = gregorianISOToJalali(iso)
  if (!j) return '—'

  const [jy, jm, jd] = j
  return `${toFaNum(jy)}/${toFaNum(pad2(jm))}/${toFaNum(pad2(jd))}`
}

function formatDateLongJalali(value: any): string {
  const iso = toISODate(value)
  if (!iso) return '—'

  const j = gregorianISOToJalali(iso)
  if (!j) return '—'

  const [jy, jm, jd] = j
  const monthName = JALALI_MONTHS[jm - 1] || ''
  return `${toFaNum(jd)} ${monthName} ${toFaNum(jy)}`
}

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm < 1 || jm > 12) return 0
  if (jm <= 6) return 31
  if (jm <= 11) return 30

  // اسفند کبیسه ۳۰ روز و غیرکبیسه ۲۹ روز است
  return jalaliToGregorianISO(jy, 12, 30) ? 30 : 29
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function normalizeStatus(value: any): string {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function getStatusBadge(status?: string) {
  const st = normalizeStatus(status)

  if (st === 'active') {
    return <Badge className="bg-emerald-100 text-emerald-700">فعال</Badge>
  }

  if (st === 'fully_depreciated') {
    return <Badge className="bg-gray-100 text-gray-600">کاملاً مستهلک</Badge>
  }

  if (st === 'sold') {
    return <Badge className="bg-blue-100 text-blue-700">فروخته شده</Badge>
  }

  return <Badge>{status || 'فعال'}</Badge>
}

function getStatusLabel(status?: string): string {
  const st = normalizeStatus(status)

  if (st === 'active') return 'فعال'
  if (st === 'fully_depreciated') return 'کاملاً مستهلک'
  if (st === 'sold') return 'فروخته شده'

  return status || 'فعال'
}

function getCategoryBadgeColor(category: string): string {
  const colorMap: Record<string, string> = {
    تجهیزات: 'bg-blue-100 text-blue-700',
    'ماشین‌آلات': 'bg-purple-100 text-purple-700',
    مبلمان: 'bg-amber-100 text-amber-700',
    ساختمان: 'bg-emerald-100 text-emerald-700',
    'وسایل نقلیه': 'bg-cyan-100 text-cyan-700',
    'کامپیوتر و تجهیزات IT': 'bg-indigo-100 text-indigo-700',
  }

  return colorMap[category] || 'bg-gray-100 text-gray-700'
}

function normalizeAsset(raw: any): FixedAsset {
  const purchasePrice = safeNum(raw?.purchasePrice)
  const salvageValue = safeNum(raw?.salvageValue)
  const usefulLife = Math.max(1, Math.round(safeNum(raw?.usefulLife) || 60))
  const accumulatedDepreciation = safeNum(raw?.accumulatedDepreciation)
  const bookValue =
    raw?.bookValue !== undefined && raw?.bookValue !== null
      ? safeNum(raw.bookValue)
      : Math.max(salvageValue, purchasePrice - accumulatedDepreciation)

  const depreciableBase = Math.max(0, purchasePrice - salvageValue)
  const monthlyDepreciation =
    usefulLife > 0 ? depreciableBase / usefulLife : 0

  const depreciatedMonths =
    monthlyDepreciation > 0
      ? Math.floor(accumulatedDepreciation / monthlyDepreciation)
      : usefulLife

  return {
    ...raw,
    id: String(raw?.id || ''),
    name: String(raw?.name || ''),
    code: String(raw?.code || ''),
    category: String(raw?.category || 'تجهیزات'),
    purchasePrice,
    salvageValue,
    usefulLife,
    purchaseDate: toISODate(raw?.purchaseDate) || '',
    depreciationStartDate:
      toISODate(raw?.depreciationStartDate) ||
      toISODate(raw?.purchaseDate) ||
      '',
    lastDepreciationDate: toISODate(raw?.lastDepreciationDate),
    depreciationMethod: raw?.depreciationMethod || 'straight_line',
    accumulatedDepreciation,
    bookValue,
    monthlyDepreciation,
    remainingUsefulLifeMonths: Math.max(
      0,
      usefulLife - depreciatedMonths
    ),
    status: normalizeStatus(raw?.status) || 'active',
    description: raw?.description || null,
    accountId: raw?.accountId || null,
    accumDepAccountId: raw?.accumDepAccountId || null,
    depExpenseAccountId: raw?.depExpenseAccountId || null,
    journalEntryId: raw?.journalEntryId || null,
    fiscalYearId: raw?.fiscalYearId || null,
    fiscalYearName: raw?.fiscalYearName || null,
    canEdit:
      typeof raw?.canEdit === 'boolean'
        ? raw.canEdit
        : normalizeStatus(raw?.status) === 'active',
    canDelete:
      typeof raw?.canDelete === 'boolean'
        ? raw.canDelete
        : normalizeStatus(raw?.status) === 'active' &&
          accumulatedDepreciation <= 0.01,
    createdAt: raw?.createdAt,
    _offline: Boolean(raw?._offline),
    _syncStatus: raw?._syncStatus,
    _createdAt: raw?._createdAt,
    _lastError: raw?._lastError,
  }
}

// ═══════════════════════════════════════════════════════════════
// Persian Date Picker — based on jalali-utils
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
  const normalizedValue = useMemo(() => toISODate(value) || '', [value])
  const min = useMemo(() => toISODate(minDate) || '', [minDate])
  const max = useMemo(() => toISODate(maxDate) || '', [maxDate])

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const todayIso = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
      now.getDate()
    )}`
  }, [])

  const todayJalali = useMemo(() => {
    return gregorianISOToJalali(todayIso) || [1400, 1, 1]
  }, [todayIso])

  const displayText = useMemo(
    () => (normalizedValue ? formatDateJalali(normalizedValue) : ''),
    [normalizedValue]
  )

  const initial = useMemo(() => {
    const j = normalizedValue ? gregorianISOToJalali(normalizedValue) : null
    if (j) return { jy: j[0], jm: j[1], jd: j[2] }

    const minJ = min ? gregorianISOToJalali(min) : null
    if (minJ) return { jy: minJ[0], jm: minJ[1], jd: minJ[2] }

    const maxJ = max ? gregorianISOToJalali(max) : null
    if (maxJ) return { jy: maxJ[0], jm: maxJ[1], jd: maxJ[2] }

    return {
      jy: todayJalali[0],
      jm: todayJalali[1],
      jd: todayJalali[2],
    }
  }, [normalizedValue, min, max, todayJalali])

  const [viewYear, setViewYear] = useState(initial.jy)
  const [viewMonth, setViewMonth] = useState(initial.jm)

  useEffect(() => {
    const j = normalizedValue ? gregorianISOToJalali(normalizedValue) : null
    if (j) {
      setViewYear(j[0])
      setViewMonth(j[1])
    }
  }, [normalizedValue])

  useEffect(() => {
    if (!open) return

    const j =
      normalizedValue && gregorianISOToJalali(normalizedValue)
        ? gregorianISOToJalali(normalizedValue)
        : min && gregorianISOToJalali(min)
        ? gregorianISOToJalali(min)
        : max && gregorianISOToJalali(max)
        ? gregorianISOToJalali(max)
        : todayJalali

    if (j) {
      setViewYear(j[0])
      setViewMonth(j[1])
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
    const iso = jalaliToGregorianISO(viewYear, viewMonth, 1)
    if (!iso) return 0

    const d = new Date(`${iso}T00:00:00`)
    if (Number.isNaN(d.getTime())) return 0

    return (d.getDay() + 1) % 7
  }, [viewYear, viewMonth])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedJalali = normalizedValue
    ? gregorianISOToJalali(normalizedValue)
    : null

  const isDayDisabled = (jd: number): boolean => {
    if (disabled) return true

    const cellIso = jalaliToGregorianISO(viewYear, viewMonth, jd)
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

    const iso = jalaliToGregorianISO(viewYear, viewMonth, jd)
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

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <Label className="text-[11px] text-gray-600 mb-0.5 block">
          {label}
        </Label>
      )}

      <div
        onClick={() => !disabled && setOpen((o) => !o)}
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

              <button
                type="button"
                style={navBtnStyle}
                onClick={goPrevMonth}
              >
                ‹
              </button>

              <div
                style={{
                  color: LILAC.textPrimary,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>

              <button
                type="button"
                style={navBtnStyle}
                onClick={goNextMonth}
              >
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
                  selectedJalali[0] === viewYear &&
                  selectedJalali[1] === viewMonth &&
                  selectedJalali[2] === d

                const isToday =
                  todayJalali[0] === viewYear &&
                  todayJalali[1] === viewMonth &&
                  todayJalali[2] === d

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
                    {toFaNum(d)}
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
                امروز: {toFaNum(todayJalali[2])}{' '}
                {JALALI_MONTHS[todayJalali[1] - 1]}{' '}
                {toFaNum(todayJalali[0])}
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
// Main Component — FixedAssetsTab
// ═══════════════════════════════════════════════════════════════

export function FixedAssetsTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([])
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'active' | 'fully_depreciated' | 'sold'
  >('all')

  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [assetFormMode, setAssetFormMode] = useState<'add' | 'edit'>('add')
  const [assetFormId, setAssetFormId] = useState('')
  const [assetSaving, setAssetSaving] = useState(false)

  const [assetForm, setAssetForm] = useState({
    name: '',
    code: '',
    category: 'تجهیزات',
    purchasePrice: '',
    salvageValue: '0',
    usefulLife: '60',
    purchaseDate: new Date().toISOString().slice(0, 10),
    description: '',
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FixedAsset | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const [detailAsset, setDetailAsset] = useState<FixedAsset | null>(null)
  const [depreciating, setDepreciating] = useState(false)

  const editingAsset = useMemo(
    () => fixedAssets.find((a) => a.id === assetFormId) || null,
    [fixedAssets, assetFormId]
  )

  const financialLocked = useMemo(() => {
    if (assetFormMode !== 'edit') return false
    if (!editingAsset) return false

    return (
      safeNum(editingAsset.accumulatedDepreciation) > 0.01 ||
      normalizeStatus(editingAsset.status) !== 'active' ||
      editingAsset.canEdit === false
    )
  }, [assetFormMode, editingAsset])

  const loadFixedAssets = useCallback(async () => {
    setLoading(true)

    try {
      if (!isOnline) {
        const cachedAssets = await getCachedFixedAssets()
        const list = Array.isArray(cachedAssets)
          ? cachedAssets.map(normalizeAsset)
          : []

        setFixedAssets(list)
        setLoading(false)
        return
      }

      const res = await fetch('/api/fixed-assets', {
        headers: getAuthHeaders(),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در دریافت دارایی‌ها')
      }

      const rawList =
        json.data?.assets ??
        json.data?.items ??
        json.data ??
        []

      const list = (Array.isArray(rawList) ? rawList : []).map(
        normalizeAsset
      )

      setFixedAssets(list)
      await cacheFixedAssets(list as any)
    } catch (error: any) {
      console.warn(
        '[FixedAssetsTab] Fetch failed, using cached data:',
        error?.message
      )

      try {
        const cachedAssets = await getCachedFixedAssets()
        const list = Array.isArray(cachedAssets)
          ? cachedAssets.map(normalizeAsset)
          : []

        setFixedAssets(list)
      } catch {
        setFixedAssets([])
      }

      toast({
        title: 'خطای شبکه',
        description: 'نمایش داده‌های ذخیره‌شده محلی',
        variant: 'default',
      })
    } finally {
      setLoading(false)
    }
  }, [isOnline, toast])

  useEffect(() => {
    loadFixedAssets()
  }, [loadFixedAssets])

  const resetAssetForm = useCallback(() => {
    setAssetFormMode('add')
    setAssetFormId('')
    setAssetForm({
      name: '',
      code: '',
      category: 'تجهیزات',
      purchasePrice: '',
      salvageValue: '0',
      usefulLife: '60',
      purchaseDate: new Date().toISOString().slice(0, 10),
      description: '',
    })
  }, [])

  const openAddDialog = useCallback(() => {
    resetAssetForm()
    setAssetDialogOpen(true)
  }, [resetAssetForm])

  const openEditDialog = useCallback(
    (asset: FixedAsset) => {
      if (asset.canEdit === false) {
        toast({
          title: 'خطا',
          description: 'این دارایی در وضعیت فعلی قابل ویرایش نیست.',
          variant: 'destructive',
        })
        return
      }

      setAssetFormMode('edit')
      setAssetFormId(asset.id)
      setAssetForm({
        name: asset.name,
        code: asset.code,
        category: asset.category,
        purchasePrice: String(asset.purchasePrice || ''),
        salvageValue: String(asset.salvageValue || 0),
        usefulLife: String(asset.usefulLife || 60),
        purchaseDate: toISODate(asset.purchaseDate) || '',
        description: asset.description || '',
      })
      setAssetDialogOpen(true)
    },
    [toast]
  )

  const handleAssetSave = useCallback(async () => {
    if (
      !assetForm.name.trim() ||
      !assetForm.code.trim() ||
      !assetForm.purchasePrice.trim()
    ) {
      toast({
        title: 'خطا',
        description: 'نام، کد و بهای خرید الزامی است',
        variant: 'destructive',
      })
      return
    }

    const purchasePrice = safeNum(assetForm.purchasePrice)
    const salvageValue = safeNum(assetForm.salvageValue)
    const usefulLife = Math.max(
      1,
      Math.round(safeNum(assetForm.usefulLife) || 60)
    )

    if (purchasePrice <= 0) {
      toast({
        title: 'خطا',
        description: 'بهای خرید باید بزرگتر از صفر باشد',
        variant: 'destructive',
      })
      return
    }

    if (salvageValue < 0) {
      toast({
        title: 'خطا',
        description: 'ارزش اسقاط نمی‌تواند منفی باشد',
        variant: 'destructive',
      })
      return
    }

    if (salvageValue >= purchasePrice) {
      toast({
        title: 'خطا',
        description: 'ارزش اسقاط باید کمتر از بهای خرید باشد',
        variant: 'destructive',
      })
      return
    }

    if (!assetForm.purchaseDate) {
      toast({
        title: 'خطا',
        description: 'تاریخ خرید الزامی است',
        variant: 'destructive',
      })
      return
    }

    setAssetSaving(true)

    const payload = {
      name: assetForm.name.trim(),
      code: assetForm.code.trim(),
      category: assetForm.category.trim(),
      purchasePrice,
      salvageValue,
      usefulLife,
      purchaseDate: assetForm.purchaseDate,
      description: assetForm.description.trim() || null,
    }

    try {
      if (isOnline) {
        try {
          const url = '/api/fixed-assets'
          const method = assetFormMode === 'edit' ? 'PUT' : 'POST'

          const body =
            assetFormMode === 'edit'
              ? {
                  action: 'edit',
                  id: assetFormId,
                  ...payload,
                }
              : payload

          const res = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(body),
          })

          const data = await res.json().catch(() => ({}))

          if (!res.ok || !data.success) {
            throw new Error(data.error || 'خطا در ذخیره دارایی')
          }

          toast({
            title: '✓ موفق',
            description:
              data.message ||
              (assetFormMode === 'edit'
                ? 'دارایی ویرایش شد'
                : 'دارایی ثبت شد'),
          })

          setAssetDialogOpen(false)
          resetAssetForm()
          await loadFixedAssets()
          return
        } catch (err: any) {
          const isNetworkError =
            err instanceof TypeError ||
            /failed to fetch|networkerror|load failed/i.test(
              String(err?.message || '')
            )

          if (!isNetworkError) {
            toast({
              title: 'خطا',
              description: err?.message || 'خطا در ذخیره دارایی',
              variant: 'destructive',
            })
            return
          }

          // اگر خطای شبکه بود، به حالت آفلاین fallback می‌کنیم
        }
      }

      // ─── مسیر آفلاین / fallback شبکه ───────────────────────
      const localId =
        assetFormMode === 'edit'
          ? assetFormId
          : `offline-${Date.now()}-${Math.random()
              .toString(36)
              .substr(2, 9)}`

      const localAsset: FixedAsset = {
        id: localId,
        ...payload,
        accumulatedDepreciation:
          assetFormMode === 'edit'
            ? safeNum(editingAsset?.accumulatedDepreciation)
            : 0,
        bookValue:
          assetFormMode === 'edit'
            ? Math.max(
                payload.salvageValue,
                payload.purchasePrice -
                  safeNum(editingAsset?.accumulatedDepreciation)
              )
            : payload.purchasePrice,
        status:
          assetFormMode === 'edit'
            ? editingAsset?.status || 'active'
            : 'active',
        depreciationStartDate: payload.purchaseDate,
        lastDepreciationDate:
          assetFormMode === 'edit'
            ? editingAsset?.lastDepreciationDate || null
            : null,
        journalEntryId:
          assetFormMode === 'edit'
            ? editingAsset?.journalEntryId || null
            : null,
        fiscalYearId:
          assetFormMode === 'edit'
            ? editingAsset?.fiscalYearId || null
            : null,
        canEdit: true,
        canDelete: true,
        _offline: true,
        _syncStatus: 'pending',
        _createdAt: Date.now(),
      }

      if (assetFormMode === 'edit') {
        const updated = fixedAssets.map((a) =>
          a.id === assetFormId ? { ...a, ...localAsset } : a
        )

        setFixedAssets(updated)
        await cacheFixedAssets(updated as any)
        await addFixedAssetToSyncQueue('update', {
          id: assetFormId,
          ...payload,
        } as any)
      } else {
        const updated = [localAsset, ...fixedAssets]
        setFixedAssets(updated)
        await cacheFixedAssets(updated as any)
        await addFixedAssetToSyncQueue('create', localAsset as any)
      }

      if (isOnline) {
        setTimeout(() => syncEngine.sync(), 100)
      }

      toast({
        title: '✓ ذخیره شد',
        description: isOnline
          ? 'خطای شبکه رخ داد؛ دارایی در صف همگام‌سازی قرار گرفت'
          : 'دارایی در حافظه محلی ذخیره و در صف همگام‌سازی قرار گرفت',
      })

      setAssetDialogOpen(false)
      resetAssetForm()
    } catch (err: any) {
      console.error('[FixedAssetsTab] Save error:', err)
      toast({
        title: 'خطا',
        description: err?.message || 'خطا در ذخیره دارایی',
        variant: 'destructive',
      })
    } finally {
      setAssetSaving(false)
    }
  }, [
    assetForm,
    assetFormMode,
    assetFormId,
    editingAsset,
    fixedAssets,
    isOnline,
    loadFixedAssets,
    resetAssetForm,
    toast,
  ])

  const handleDeleteAsset = useCallback(async () => {
    if (!deleteTarget) return

    if (deleteTarget.canDelete === false) {
      toast({
        title: 'خطا',
        description: 'این دارایی قابل حذف نیست.',
        variant: 'destructive',
      })
      return
    }

    setDeleteSaving(true)

    try {
      if (deleteTarget._offline) {
        const updated = fixedAssets.filter(
          (a) => a.id !== deleteTarget.id
        )

        setFixedAssets(updated)
        await cacheFixedAssets(updated as any)

        toast({
          title: '✓ حذف شد',
          description: 'دارایی آفلاین حذف شد',
        })
      } else {
        if (!isOnline) {
          toast({
            title: 'خطا',
            description: 'حذف دارایی آنلاین نیاز به اتصال دارد',
            variant: 'destructive',
          })
          setDeleteDialogOpen(false)
          return
        }

        const res = await fetch(
          `/api/fixed-assets?id=${encodeURIComponent(deleteTarget.id)}`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
          }
        )

        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'خطا در حذف دارایی')
        }

        toast({
          title: '✓ حذف شد',
          description: 'دارایی با موفقیت حذف شد',
        })

        await loadFixedAssets()
      }

      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: err?.message || 'خطا در حذف دارایی',
        variant: 'destructive',
      })
    } finally {
      setDeleteSaving(false)
    }
  }, [deleteTarget, fixedAssets, isOnline, loadFixedAssets, toast])

  const handleDepreciation = useCallback(async () => {
    const activeAssets = fixedAssets.filter(
      (a) => normalizeStatus(a.status) === 'active'
    )

    if (activeAssets.length === 0) {
      toast({
        title: 'خطا',
        description:
          'هیچ دارایی فعالی برای محاسبه استهلاک وجود ندارد',
        variant: 'destructive',
      })
      return
    }

    if (!isOnline) {
      toast({
        title: 'خطا',
        description: 'محاسبه استهلاک نیاز به اتصال به سرور دارد',
        variant: 'destructive',
      })
      return
    }

    setDepreciating(true)

    try {
      const res = await fetch('/api/fixed-assets/depreciate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در محاسبه استهلاک')
      }

      toast({
        title: '✓ موفق',
        description:
          data.message || 'استهلاک دارایی‌ها محاسبه شد',
      })

      await loadFixedAssets()
    } catch (err: any) {
      toast({
        title: 'خطا',
        description: err?.message || 'خطا در محاسبه استهلاک',
        variant: 'destructive',
      })
    } finally {
      setDepreciating(false)
    }
  }, [fixedAssets, isOnline, loadFixedAssets, toast])

  const filteredAssets = useMemo(() => {
    let result = fixedAssets

    if (filterCategory !== 'all') {
      result = result.filter((a) => a.category === filterCategory)
    }

    if (filterStatus !== 'all') {
      result = result.filter(
        (a) => normalizeStatus(a.status) === filterStatus
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()

      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q)
      )
    }

    return result
  }, [fixedAssets, filterCategory, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const total = fixedAssets.length
    const active = fixedAssets.filter(
      (a) => normalizeStatus(a.status) === 'active'
    ).length
    const fullyDepreciated = fixedAssets.filter(
      (a) => normalizeStatus(a.status) === 'fully_depreciated'
    ).length
    const sold = fixedAssets.filter(
      (a) => normalizeStatus(a.status) === 'sold'
    ).length
    const offlineCount = fixedAssets.filter((a) => a._offline).length

    const totalPurchasePrice = fixedAssets.reduce(
      (s, a) => s + safeNum(a.purchasePrice),
      0
    )

    const totalAccumulatedDepreciation = fixedAssets.reduce(
      (s, a) => s + safeNum(a.accumulatedDepreciation),
      0
    )

    const totalBookValue = fixedAssets.reduce(
      (s, a) => s + safeNum(a.bookValue),
      0
    )

    return {
      total,
      active,
      fullyDepreciated,
      sold,
      offlineCount,
      totalPurchasePrice,
      totalAccumulatedDepreciation,
      totalBookValue,
    }
  }, [fixedAssets])

  const previewMonthlyDepreciation = useMemo(() => {
    const price = safeNum(assetForm.purchasePrice)
    const salvage = safeNum(assetForm.salvageValue)
    const life = Math.max(1, Math.round(safeNum(assetForm.usefulLife) || 60))
    const base = Math.max(0, price - salvage)

    return life > 0 ? base / life : 0
  }, [assetForm.purchasePrice, assetForm.salvageValue, assetForm.usefulLife])

  return (
    <div className="space-y-4" dir="rtl">
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> دارایی‌های جدید در حافظه
            محلی ذخیره شده و پس از اتصال به سرور ارسال می‌شوند. محاسبه
            استهلاک در حالت آفلاین غیرفعال است.
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900">
          <strong>نکته حسابداری:</strong> دارایی ثابت یک ثبت دائمی است و با
          تغییر سال مالی از لیست حذف نمی‌شود. اما سند خرید و سند استهلاک آن
          باید در سال مالی فعال و باز صادر شوند.
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5">
        <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">
              کل دارایی‌ها
            </span>
            <Package className="w-2.5 h-2.5 text-blue-400 shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-blue-700">
            {toFaNum(stats.total)}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600 truncate">
              فعال
            </span>
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-emerald-700">
            {toFaNum(stats.active)}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-md border border-red-200 bg-gradient-to-br from-red-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[8px] sm:text-[9px] font-medium text-red-600 truncate">
              بهای خرید
            </span>
            <TrendingDown className="w-2.5 h-2.5 text-red-400 shrink-0" />
          </div>
          <div className="text-[9px] sm:text-[10px] font-bold text-red-700 truncate">
            {formatCurrency(stats.totalPurchasePrice)}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[8px] sm:text-[9px] font-medium text-purple-600 truncate">
              ارزش دفتری
            </span>
            <TrendingDown className="w-2.5 h-2.5 text-purple-400 shrink-0" />
          </div>
          <div className="text-[9px] sm:text-[10px] font-bold text-purple-700 truncate">
            {formatCurrency(stats.totalBookValue)}
          </div>
        </div>

        {stats.offlineCount > 0 && (
          <div className="relative overflow-hidden rounded-md border border-orange-300 bg-gradient-to-br from-orange-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-orange-600 flex items-center gap-0.5 truncate">
                <Clock className="w-2 h-2 shrink-0" /> در انتظار sync
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
                placeholder="جستجو در نام، کد یا توضیحات دارایی..."
                className="pr-8 text-xs h-9"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full lg:w-44 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه دسته‌ها</option>
              {ASSET_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full lg:w-40 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="active">فعال</option>
              <option value="fully_depreciated">کاملاً مستهلک</option>
              <option value="sold">فروخته شده</option>
            </select>

            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDepreciation}
                disabled={!isOnline || stats.active === 0 || depreciating}
                className="text-xs h-9 text-amber-600 border-amber-300 hover:bg-amber-50 flex-1 lg:flex-none"
                title={
                  !isOnline
                    ? 'محاسبه استهلاک نیاز به اتصال دارد'
                    : 'محاسبه استهلاک بر اساس ماه‌های شمسی'
                }
              >
                {depreciating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 ml-1" />
                )}
                محاسبه استهلاک
              </Button>

              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 flex-1 lg:flex-none"
                onClick={openAddDialog}
              >
                <Plus className="w-3.5 h-3.5 ml-1" />
                دارایی جدید
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading ? (
        <Card className="border-gray-200">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">
              در حال بارگذاری دارایی‌ها...
            </p>
          </CardContent>
        </Card>
      ) : filteredAssets.length === 0 ? (
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Package className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">
              دارایی یافت نشد
            </h3>
            <p className="text-sm text-gray-400 text-center max-w-md">
              {fixedAssets.length === 0
                ? 'هنوز هیچ دارایی ثابتی ثبت نشده است. برای ثبت دارایی جدید، روی دکمه «دارایی جدید» کلیک کنید.'
                : 'با فیلترهای فعلی، دارایی یافت نشد. فیلترها را تغییر دهید.'}
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
                        کد
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        نام
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        دسته
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        تاریخ خرید
                      </TableHead>
                      <TableHead className="text-right text-xs w-32">
                        بهای خرید
                      </TableHead>
                      <TableHead className="text-right text-xs w-32">
                        استهلاک انباشته
                      </TableHead>
                      <TableHead className="text-right text-xs w-32">
                        ارزش دفتری
                      </TableHead>
                      <TableHead className="text-right text-xs w-24">
                        عمر (ماه)
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        وضعیت
                      </TableHead>
                      <TableHead className="text-right text-xs w-28">
                        عملیات
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredAssets.map((asset) => {
                      const allowEdit =
                        asset._offline || asset.canEdit !== false
                      const allowDelete =
                        asset._offline || asset.canDelete !== false

                      return (
                        <TableRow
                          key={asset.id}
                          className="hover:bg-gray-50/50"
                        >
                          <TableCell className="text-xs font-mono">
                            {asset.code}
                            {asset._offline && (
                              <Badge className="bg-orange-100 text-orange-700 mr-1 text-[9px]">
                                <Clock className="w-2.5 h-2.5 ml-0.5" />
                                آفلاین
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-xs font-medium">
                            {asset.name}
                          </TableCell>

                          <TableCell>
                            <Badge
                              className={getCategoryBadgeColor(
                                asset.category
                              )}
                            >
                              {asset.category}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-xs">
                            {formatDateJalali(asset.purchaseDate)}
                          </TableCell>

                          <TableCell className="text-xs">
                            {formatCurrency(asset.purchasePrice)}
                          </TableCell>

                          <TableCell className="text-xs text-red-600">
                            {formatCurrency(
                              asset.accumulatedDepreciation || 0
                            )}
                          </TableCell>

                          <TableCell className="text-xs font-bold text-emerald-600">
                            {formatCurrency(asset.bookValue || 0)}
                          </TableCell>

                          <TableCell className="text-xs">
                            {toFaNum(asset.usefulLife || 0)}
                          </TableCell>

                          <TableCell>
                            {getStatusBadge(asset.status)}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setDetailAsset(asset)}
                                title="مشاهده جزئیات"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => openEditDialog(asset)}
                                disabled={!allowEdit}
                                title={
                                  allowEdit
                                    ? 'ویرایش'
                                    : 'این دارایی قابل ویرایش نیست'
                                }
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500"
                                onClick={() => {
                                  setDeleteTarget(asset)
                                  setDeleteDialogOpen(true)
                                }}
                                disabled={!allowDelete}
                                title={
                                  allowDelete
                                    ? 'حذف'
                                    : 'دارایی مستهلک‌شده یا دارای سند استهلاک قابل حذف نیست'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {filteredAssets.map((asset) => {
              const allowEdit =
                asset._offline || asset.canEdit !== false
              const allowDelete =
                asset._offline || asset.canDelete !== false

              return (
                <Card key={asset.id} className="border-gray-200">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">
                          {asset.name}
                        </span>

                        {asset._offline && (
                          <Badge className="bg-orange-100 text-orange-700 text-[9px]">
                            <Clock className="w-2.5 h-2.5 ml-0.5" />
                            آفلاین
                          </Badge>
                        )}
                      </div>

                      {getStatusBadge(asset.status)}
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] text-gray-500 font-mono">
                        {asset.code}
                      </span>

                      <Badge
                        className={
                          getCategoryBadgeColor(asset.category) +
                          ' text-[9px]'
                        }
                      >
                        {asset.category}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-gray-50 border border-gray-100 rounded p-2">
                        <div className="text-[9px] text-gray-500 mb-0.5">
                          تاریخ خرید
                        </div>
                        <div className="text-[10px] font-bold text-gray-800">
                          {formatDateJalali(asset.purchaseDate)}
                        </div>
                      </div>

                      <div className="bg-gray-50 border border-gray-100 rounded p-2">
                        <div className="text-[9px] text-gray-500 mb-0.5">
                          عمر مفید
                        </div>
                        <div className="text-[10px] font-bold text-gray-800">
                          {toFaNum(asset.usefulLife || 0)} ماه
                        </div>
                      </div>

                      <div className="bg-blue-50 border border-blue-100 rounded p-2">
                        <div className="text-[9px] text-blue-600 mb-0.5">
                          بهای خرید
                        </div>
                        <div className="text-[10px] font-bold text-blue-700">
                          {formatCurrency(asset.purchasePrice)}
                        </div>
                      </div>

                      <div className="bg-red-50 border border-red-100 rounded p-2">
                        <div className="text-[9px] text-red-600 mb-0.5">
                          استهلاک
                        </div>
                        <div className="text-[10px] font-bold text-red-700">
                          {formatCurrency(
                            asset.accumulatedDepreciation || 0
                          )}
                        </div>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-100 rounded p-2 col-span-2">
                        <div className="text-[9px] text-emerald-600 mb-0.5">
                          ارزش دفتری
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700">
                          {formatCurrency(asset.bookValue || 0)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 flex-1"
                        onClick={() => setDetailAsset(asset)}
                      >
                        <Eye className="w-3 h-3 ml-1" /> جزئیات
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 flex-1"
                        onClick={() => openEditDialog(asset)}
                        disabled={!allowEdit}
                      >
                        <Pencil className="w-3 h-3 ml-1" /> ویرایش
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 flex-1"
                        onClick={() => {
                          setDeleteTarget(asset)
                          setDeleteDialogOpen(true)
                        }}
                        disabled={!allowDelete}
                      >
                        <Trash2 className="w-3 h-3 ml-1" /> حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Asset Form Dialog */}
      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="w-4 h-4 text-emerald-600" />
              {assetFormMode === 'add'
                ? 'ثبت دارایی ثابت جدید'
                : 'ویرایش دارایی'}
            </DialogTitle>

            <DialogDescription className="text-xs">
              {assetFormMode === 'add'
                ? 'اطلاعات دارایی جدید را وارد کنید. تاریخ خرید باید داخل سال مالی فعال و باز باشد.'
                : `ویرایش دارایی ${assetForm.name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {financialLocked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                این دارایی استهلاک خورده یا در وضعیت غیرفعال است. بنابراین
                بهای خرید، ارزش اسقاط، عمر مفید و تاریخ خرید قابل تغییر
                نیستند. فقط اطلاعات توصیفی قابل ویرایش است.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">نام دارایی *</Label>
                <Input
                  value={assetForm.name}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, name: e.target.value })
                  }
                  placeholder="مثلاً: یخچال فروشگاه"
                  className="text-xs mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-xs">کد *</Label>
                <Input
                  value={assetForm.code}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, code: e.target.value })
                  }
                  placeholder="مثلاً: FA-001"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">دسته دارایی</Label>
              <select
                value={assetForm.category}
                onChange={(e) =>
                  setAssetForm({ ...assetForm, category: e.target.value })
                }
                className="w-full text-xs mt-1 h-9 border border-gray-200 rounded px-2 bg-white"
              >
                {ASSET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <PersianDatePicker
                value={assetForm.purchaseDate}
                onChange={(iso) =>
                  setAssetForm({ ...assetForm, purchaseDate: iso })
                }
                placeholder="انتخاب تاریخ خرید"
                label="تاریخ خرید *"
                disabled={financialLocked}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">بهای خرید (ریال) *</Label>
                <Input
                  type="number"
                  value={assetForm.purchasePrice}
                  onChange={(e) =>
                    setAssetForm({
                      ...assetForm,
                      purchasePrice: e.target.value,
                    })
                  }
                  placeholder="15000000"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                  disabled={financialLocked}
                />
              </div>

              <div>
                <Label className="text-xs">ارزش اسقاط</Label>
                <Input
                  type="number"
                  value={assetForm.salvageValue}
                  onChange={(e) =>
                    setAssetForm({
                      ...assetForm,
                      salvageValue: e.target.value,
                    })
                  }
                  placeholder="0"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                  disabled={financialLocked}
                />
              </div>

              <div>
                <Label className="text-xs">عمر مفید (ماه)</Label>
                <Input
                  type="number"
                  value={assetForm.usefulLife}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, usefulLife: e.target.value })
                  }
                  placeholder="60"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                  disabled={financialLocked}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">توضیحات (اختیاری)</Label>
              <Textarea
                value={assetForm.description}
                onChange={(e) =>
                  setAssetForm({ ...assetForm, description: e.target.value })
                }
                placeholder="توضیحات اختیاری درباره دارایی"
                className="text-xs mt-1"
                rows={2}
              />
            </div>

            {safeNum(assetForm.purchasePrice) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-800">
                    پیش‌نمایش استهلاک ماهانه (خطی)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span className="text-gray-500">بهای خرید:</span>
                    <span className="font-bold mr-1">
                      {formatCurrency(assetForm.purchasePrice)}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-500">ارزش اسقاط:</span>
                    <span className="font-bold mr-1">
                      {formatCurrency(assetForm.salvageValue)}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-500">استهلاک ماهانه:</span>
                    <span className="font-bold text-blue-700 mr-1">
                      {formatCurrency(previewMonthlyDepreciation)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setAssetDialogOpen(false)}
              disabled={assetSaving}
              className="w-full sm:w-auto"
            >
              انصراف
            </Button>

            <Button
              onClick={handleAssetSave}
              disabled={
                assetSaving ||
                !assetForm.name.trim() ||
                !assetForm.code.trim() ||
                !assetForm.purchasePrice.trim()
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
            >
              {assetSaving ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <Save className="w-4 h-4 ml-1" />
              )}
              {assetSaving
                ? 'در حال ذخیره...'
                : assetFormMode === 'add'
                ? 'ثبت دارایی'
                : 'ذخیره تغییرات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-base text-red-600">
              حذف دارایی
            </DialogTitle>

            <DialogDescription className="text-xs sm:text-sm">
              آیا از حذف دارایی <strong>{deleteTarget?.name}</strong> (کد:{' '}
              {deleteTarget?.code}) مطمئن هستید؟
              <br />
              <span className="text-red-600 font-medium mt-2 block">
                ⚠️ این عمل غیرقابل بازگشت است.
              </span>
            </DialogDescription>
          </DialogHeader>

          {deleteTarget &&
            safeNum(deleteTarget.accumulatedDepreciation) > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  این دارایی دارای استهلاک انباشته به مبلغ{' '}
                  {formatCurrency(deleteTarget.accumulatedDepreciation)} است.
                  حذف آن ممکن است بر گزارش‌های مالی تأثیر بگذارد.
                </p>
              </div>
            )}

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
              onClick={handleDeleteAsset}
              disabled={deleteSaving}
              className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
            >
              {deleteSaving ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <Trash2 className="w-4 h-4 ml-1" />
              )}
              حذف دارایی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog
        open={!!detailAsset}
        onOpenChange={(open) => !open && setDetailAsset(null)}
      >
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          {detailAsset && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Package className="w-4 h-4 text-emerald-600" />
                  جزئیات دارایی {detailAsset.name}

                  {detailAsset._offline && (
                    <Badge className="bg-orange-100 text-orange-700 text-[10px]">
                      <Clock className="w-2.5 h-2.5 ml-0.5" /> آفلاین
                    </Badge>
                  )}
                </DialogTitle>

                <DialogDescription className="text-xs">
                  کد: {detailAsset.code} | دسته: {detailAsset.category}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      تاریخ خرید
                    </div>
                    <div className="font-medium">
                      {formatDateLongJalali(detailAsset.purchaseDate)}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      عمر مفید
                    </div>
                    <div className="font-medium">
                      {toFaNum(detailAsset.usefulLife || 0)} ماه
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      وضعیت
                    </div>
                    <div className="font-medium">
                      {getStatusLabel(detailAsset.status)}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      دسته
                    </div>
                    <div className="font-medium">
                      {detailAsset.category}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-blue-600 mb-1">
                      بهای خرید
                    </div>
                    <div className="text-sm font-bold text-blue-700">
                      {formatCurrency(detailAsset.purchasePrice)}
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-red-600 mb-1">
                      استهلاک انباشته
                    </div>
                    <div className="text-sm font-bold text-red-700">
                      {formatCurrency(
                        detailAsset.accumulatedDepreciation || 0
                      )}
                    </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-emerald-600 mb-1">
                      ارزش دفتری
                    </div>
                    <div className="text-sm font-bold text-emerald-700">
                      {formatCurrency(detailAsset.bookValue || 0)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      استهلاک ماهانه
                    </div>
                    <div className="font-bold">
                      {formatCurrency(detailAsset.monthlyDepreciation || 0)}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      باقیمانده عمر مفید
                    </div>
                    <div className="font-bold">
                      {toFaNum(
                        detailAsset.remainingUsefulLifeMonths || 0
                      )}{' '}
                      ماه
                    </div>
                  </div>
                </div>

                {detailAsset.fiscalYearName && (
                  <div className="bg-gray-50 rounded p-2 text-xs">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      سال مالی ثبت دارایی
                    </div>
                    <div className="font-medium">
                      {detailAsset.fiscalYearName}
                    </div>
                  </div>
                )}

                {detailAsset.lastDepreciationDate && (
                  <div className="bg-gray-50 rounded p-2 text-xs">
                    <div className="text-gray-500 text-[10px] mb-0.5">
                      آخرین محاسبه استهلاک
                    </div>
                    <div className="font-medium">
                      {formatDateLongJalali(
                        detailAsset.lastDepreciationDate
                      )}
                    </div>
                  </div>
                )}

                {/* Depreciation progress */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-600">
                      پیشرفت استهلاک
                    </span>

                    <span className="text-xs font-bold text-gray-800">
                      {(() => {
                        const base = Math.max(
                          0,
                          safeNum(detailAsset.purchasePrice) -
                            safeNum(detailAsset.salvageValue)
                        )

                        if (base <= 0) return '۱۰۰٪'

                        const percent = Math.min(
                          100,
                          Math.round(
                            (safeNum(detailAsset.accumulatedDepreciation) /
                              base) *
                              100
                          )
                        )

                        return `${toFaNum(percent)}٪`
                      })()}
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${(() => {
                          const base = Math.max(
                            0,
                            safeNum(detailAsset.purchasePrice) -
                              safeNum(detailAsset.salvageValue)
                          )

                          if (base <= 0) return '100%'

                          return `${Math.min(
                            100,
                            (safeNum(
                              detailAsset.accumulatedDepreciation
                            ) /
                              base) *
                              100
                          )}%`
                        })()}`,
                      }}
                    />
                  </div>
                </div>

                {detailAsset.description && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">
                      توضیحات
                    </div>
                    <p className="text-xs text-gray-700">
                      {detailAsset.description}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDetailAsset(null)}
                  className="w-full sm:w-auto"
                >
                  بستن
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FixedAssetsTab