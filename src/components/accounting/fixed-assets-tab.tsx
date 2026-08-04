'use client'

// ============================================================================
// src/components/accounting/fixed-assets-tab.tsx — Fixed Assets Tab
// ShopAccounting v29 — با قابلیت آفلاین کامل + ریسپانسیو
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '@/lib/store'
import { 
  cacheFixedAssets, 
  getCachedFixedAssets, 
  addFixedAssetToSyncQueue,
  type CachedFixedAsset,
} from '@/lib/offline-db'
import { syncEngine } from '@/lib/sync-engine'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus, Search, Loader2, WifiOff, Package, Eye,
  CheckCircle2, AlertCircle, Save, Pencil, Trash2, Calendar,
  Clock, RefreshCw, TrendingDown,  // ← TrendingDown اضافه شد
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

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
  description?: string | null
  accumulatedDepreciation?: number
  bookValue?: number
  status?: 'active' | 'fully_depreciated' | 'sold'
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

function getStatusBadge(status?: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-100 text-emerald-700">فعال</Badge>
    case 'fully_depreciated':
      return <Badge className="bg-gray-100 text-gray-600">کاملاً مستهلک</Badge>
    case 'sold':
      return <Badge className="bg-blue-100 text-blue-700">فروخته شده</Badge>
    default:
      return <Badge>{status || 'فعال'}</Badge>
  }
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case 'active': return 'فعال'
    case 'fully_depreciated': return 'کاملاً مستهلک'
    case 'sold': return 'فروخته شده'
    default: return status || 'فعال'
  }
}

function getCategoryBadgeColor(category: string): string {
  const colorMap: Record<string, string> = {
    'تجهیزات': 'bg-blue-100 text-blue-700',
    'ماشین‌آلات': 'bg-purple-100 text-purple-700',
    'مبلمان': 'bg-amber-100 text-amber-700',
    'ساختمان': 'bg-emerald-100 text-emerald-700',
    'وسایل نقلیه': 'bg-cyan-100 text-cyan-700',
    'کامپیوتر و تجهیزات IT': 'bg-indigo-100 text-indigo-700',
  }
  return colorMap[category] || 'bg-gray-100 text-gray-700'
}

// ═══════════════════════════════════════════════════════════════
// Persian Date Picker (single date) — برای تاریخ خرید دارایی
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
// Main Component — FixedAssetsTab
// ═══════════════════════════════════════════════════════════════

export function FixedAssetsTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  // ─── State: Fixed Assets ──────────────────────────────────
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([])
  const [loading, setLoading] = useState(true)
  
  // ─── State: Filter ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'fully_depreciated' | 'sold'>('all')

  // ─── State: Asset Dialog (Add/Edit) ───────────────────────
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [assetFormMode, setAssetFormMode] = useState<'add' | 'edit'>('add')
  const [assetFormId, setAssetFormId] = useState('')
  const [assetForm, setAssetForm] = useState({
    name: '', code: '', category: 'تجهیزات', purchasePrice: '', salvageValue: '0',
    usefulLife: '60', purchaseDate: new Date().toISOString().split('T')[0], description: '',
  })
  const [assetSaving, setAssetSaving] = useState(false)

  // ─── State: Delete Dialog ─────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FixedAsset | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  // ─── State: Detail Dialog ─────────────────────────────────
  const [detailAsset, setDetailAsset] = useState<FixedAsset | null>(null)

  // ─── State: Depreciation ──────────────────────────────────
  const [depreciating, setDepreciating] = useState(false)

  // ═══════════════════════════════════════════════════════════
  // ★★★ Load Data (Bulletproof Offline + IndexedDB)
  // ═══════════════════════════════════════════════════════════

  const loadFixedAssets = useCallback(async () => {
    setLoading(true)
    try {
      // ۱. حالت آفلاین: خواندن از IndexedDB
      if (!isOnline) {
        const cachedAssets = await getCachedFixedAssets()
        if (cachedAssets.length > 0) {
          setFixedAssets(cachedAssets as FixedAsset[])
          toast({ 
            title: "حالت آفلاین", 
            description: `${cachedAssets.length} دارایی از حافظه محلی بارگذاری شد`, 
            variant: "default" 
          })
        } else {
          setFixedAssets([])
        }
        setLoading(false)
        return
      }

      // ۲. حالت آنلاین: دریافت از سرور
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fixed-assets', { 
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } 
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          const assetList = data.data?.assets || data.data || []
          setFixedAssets(assetList)
          // ★★★ ذخیره در IndexedDB برای استفاده در حالت آفلاین
          await cacheFixedAssets(assetList)
        }
      } else {
        // اگر سرور خطا داد، از کش استفاده کن
        const cachedAssets = await getCachedFixedAssets()
        if (cachedAssets.length > 0) {
          setFixedAssets(cachedAssets as FixedAsset[])
        }
      }
    } catch (error: any) {
      console.warn("[FixedAssetsTab] Fetch failed, using cached data:", error.message)
      const cachedAssets = await getCachedFixedAssets()
      if (cachedAssets.length > 0) {
        setFixedAssets(cachedAssets as FixedAsset[])
        toast({ 
          title: "خطای شبکه", 
          description: "نمایش داده‌های ذخیره‌شده محلی", 
          variant: "default" 
        })
      } else {
        setFixedAssets([])
      }
    } finally {
      setLoading(false)
    }
  }, [isOnline, toast])

  useEffect(() => {
    loadFixedAssets()
  }, [loadFixedAssets])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Create/Update Asset (با Optimistic UI + SyncQueue)
  // ═══════════════════════════════════════════════════════════

  const handleAssetSave = useCallback(async () => {
    // Validation
    if (!assetForm.name.trim() || !assetForm.code.trim() || !assetForm.purchasePrice.trim()) {
      toast({ title: 'خطا', description: 'نام، کد و بهای خرید الزامی است', variant: 'destructive' })
      return
    }

    const purchasePrice = parseFloat(assetForm.purchasePrice)
    if (isNaN(purchasePrice) || purchasePrice <= 0) {
      toast({ title: 'خطا', description: 'بهای خرید باید بزرگتر از صفر باشد', variant: 'destructive' })
      return
    }

    setAssetSaving(true)
    try {
      const newAsset: FixedAsset = {
        id: assetFormMode === 'edit' ? assetFormId : `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: assetForm.name.trim(),
        code: assetForm.code.trim(),
        category: assetForm.category,
        purchasePrice,
        salvageValue: parseFloat(assetForm.salvageValue) || 0,
        usefulLife: parseInt(assetForm.usefulLife) || 60,
        purchaseDate: assetForm.purchaseDate,
        description: assetForm.description || null,
        accumulatedDepreciation: 0,
        bookValue: purchasePrice,
        status: 'active',
        // ★★★ فیلدهای آفلاین
        _offline: true,
        _syncStatus: 'pending',
        _createdAt: Date.now(),
      }

      if (assetFormMode === 'edit') {
        // ویرایش دارایی موجود
        const updated = fixedAssets.map(a => 
          a.id === assetFormId 
            ? { 
                ...a, 
                name: assetForm.name.trim(), 
                code: assetForm.code.trim(), 
                category: assetForm.category,
                purchasePrice,
                salvageValue: parseFloat(assetForm.salvageValue) || 0,
                usefulLife: parseInt(assetForm.usefulLife) || 60,
                purchaseDate: assetForm.purchaseDate,
                description: assetForm.description || null,
              }
            : a
        )
        setFixedAssets(updated)
        await cacheFixedAssets(updated)
        
        // افزودن عملیات update به SyncQueue
        await addFixedAssetToSyncQueue('update', { ...newAsset, id: assetFormId })
        
        toast({ title: '✓ دارایی ویرایش شد', description: isOnline ? 'در حال ارسال به سرور' : 'در صف همگام‌سازی قرار گرفت' })
      } else {
        // ایجاد دارایی جدید
        setFixedAssets(prev => [newAsset, ...prev])
        const updated = [newAsset, ...fixedAssets]
        await cacheFixedAssets(updated)
        
        // افزودن عملیات create به SyncQueue
        await addFixedAssetToSyncQueue('create', newAsset)
        
        toast({ title: '✓ دارایی ثبت شد', description: isOnline ? 'در حال ارسال به سرور' : 'در صف همگام‌سازی قرار گرفت' })
      }

      // Trigger sync اگر آنلاین هستیم
      if (isOnline) {
        setTimeout(() => syncEngine.sync(), 100)
      }

      // Reset form
      setAssetDialogOpen(false)
      setAssetFormMode('add')
      setAssetFormId('')
      setAssetForm({
        name: '', code: '', category: 'تجهیزات', purchasePrice: '', salvageValue: '0',
        usefulLife: '60', purchaseDate: new Date().toISOString().split('T')[0], description: '',
      })
    } catch (err: any) {
      console.error('[FixedAssetsTab] Save error:', err)
      toast({ title: 'خطا', description: err.message || 'خطا در ذخیره دارایی', variant: 'destructive' })
    } finally {
      setAssetSaving(false)
    }
  }, [assetFormMode, assetFormId, assetForm, fixedAssets, isOnline, toast])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Delete Asset
  // ═══════════════════════════════════════════════════════════

  const handleDeleteAsset = useCallback(async () => {
    if (!deleteTarget) return

    setDeleteSaving(true)
    try {
      if (deleteTarget._offline) {
        // دارایی آفلاین: فقط از لیست محلی حذف کن
        const updated = fixedAssets.filter(a => a.id !== deleteTarget.id)
        setFixedAssets(updated)
        await cacheFixedAssets(updated)
        toast({ title: '✓ حذف شد', description: 'دارایی آفلاین حذف شد' })
      } else {
        // دارایی آنلاین: درخواست به سرور
        if (!isOnline) {
          toast({ title: 'خطا', description: 'حذف دارایی آنلاین نیاز به اتصال دارد', variant: 'destructive' })
          setDeleteDialogOpen(false)
          return
        }

        const token = localStorage.getItem('token')
        const res = await fetch(`/api/fixed-assets?id=${deleteTarget.id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (res.ok) {
          toast({ title: '✓ حذف شد', description: 'دارایی با موفقیت حذف شد' })
          await loadFixedAssets()
        } else {
          const data = await res.json()
          throw new Error(data.error || 'خطا در حذف دارایی')
        }
      }

      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    } catch (err: any) {
      toast({ title: 'خطا', description: err.message || 'خطا در حذف دارایی', variant: 'destructive' })
    } finally {
      setDeleteSaving(false)
    }
  }, [deleteTarget, fixedAssets, isOnline, toast, loadFixedAssets])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Calculate Depreciation (محاسبه استهلاک)
  // ═══════════════════════════════════════════════════════════

  const handleDepreciation = useCallback(async () => {
    const activeAssets = fixedAssets.filter(a => a.status === 'active')
    if (activeAssets.length === 0) {
      toast({ title: 'خطا', description: 'هیچ دارایی فعالی برای محاسبه استهلاک وجود ندارد', variant: 'destructive' })
      return
    }

    setDepreciating(true)
    try {
      if (!isOnline) {
        toast({ title: 'خطا', description: 'محاسبه استهلاک نیاز به اتصال به سرور دارد', variant: 'destructive' })
        setDepreciating(false)
        return
      }

      const token = localStorage.getItem('token')
      const res = await fetch('/api/fixed-assets/depreciate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          ...(token ? { Authorization: `Bearer ${token}` } : {}) 
        },
        body: JSON.stringify({}),
      })

      const data = await res.json()
      if (data.success) {
        toast({ title: '✓ موفق', description: data.message || 'استهلاک محاسبه شد' })
        await loadFixedAssets()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در محاسبه استهلاک', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err.message || 'خطا در محاسبه استهلاک', variant: 'destructive' })
    } finally {
      setDepreciating(false)
    }
  }, [fixedAssets, isOnline, toast, loadFixedAssets])

  // ═══════════════════════════════════════════════════════════
  // Filter & Stats
  // ═══════════════════════════════════════════════════════════

  const filteredAssets = useMemo(() => {
    let result = fixedAssets
    
    // فیلتر دسته
    if (filterCategory !== 'all') {
      result = result.filter(a => a.category === filterCategory)
    }
    
    // فیلتر وضعیت
    if (filterStatus !== 'all') {
      result = result.filter(a => a.status === filterStatus)
    }
    
    // فیلتر جستجو
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        a =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q)
      )
    }
    
    return result
  }, [fixedAssets, filterCategory, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const total = fixedAssets.length
    const active = fixedAssets.filter(a => a.status === 'active').length
    const fullyDepreciated = fixedAssets.filter(a => a.status === 'fully_depreciated').length
    const offlineCount = fixedAssets.filter(a => a._offline).length
    const totalPurchasePrice = fixedAssets.reduce((s, a) => s + (a.purchasePrice || 0), 0)
    const totalBookValue = fixedAssets.reduce((s, a) => s + (a.bookValue || 0), 0)
    const totalDepreciation = fixedAssets.reduce((s, a) => s + (a.accumulatedDepreciation || 0), 0)
    
    return { total, active, fullyDepreciated, offlineCount, totalPurchasePrice, totalBookValue, totalDepreciation }
  }, [fixedAssets])

  // ═══════════════════════════════════════════════════════════
  // Helper: Open Edit Dialog
  // ═══════════════════════════════════════════════════════════

  const openEditDialog = (asset: FixedAsset) => {
    setAssetFormMode('edit')
    setAssetFormId(asset.id)
    setAssetForm({
      name: asset.name,
      code: asset.code,
      category: asset.category,
      purchasePrice: String(asset.purchasePrice),
      salvageValue: String(asset.salvageValue || 0),
      usefulLife: String(asset.usefulLife),
      purchaseDate: asset.purchaseDate,
      description: asset.description || '',
    })
    setAssetDialogOpen(true)
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
            <strong>حالت آفلاین فعال است.</strong> دارایی‌های جدید در حافظه محلی ذخیره شده و پس از اتصال به سرور ارسال می‌شوند.
          </div>
        </div>
      )}

 {/* ═══════════════════════════════════════════════════════
    Stats Cards — خیلی کوچک و رنگی
═══════════════════════════════════════════════════════ */}
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5">
  {/* کل دارایی‌ها */}
  <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">کل دارایی‌ها</span>
      <Package className="w-2.5 h-2.5 text-blue-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-blue-700">{stats.total.toLocaleString('fa-IR')}</div>
  </div>

  {/* فعال */}
  <div className="relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600 truncate">فعال</span>
      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-emerald-700">{stats.active.toLocaleString('fa-IR')}</div>
  </div>

  {/* ارزش دفتری */}
  <div className="relative overflow-hidden rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-purple-600 truncate">ارزش دفتری</span>
      <TrendingDown className="w-2.5 h-2.5 text-purple-400 shrink-0" />
    </div>
    <div className="text-[9px] sm:text-[10px] font-bold text-purple-700 truncate">{formatCurrency(stats.totalBookValue)}</div>
  </div>

  {/* در انتظار sync */}
  {stats.offlineCount > 0 && (
    <div className="relative overflow-hidden rounded-md border border-orange-300 bg-gradient-to-br from-orange-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[8px] sm:text-[9px] font-medium text-orange-600 flex items-center gap-0.5 truncate">
          <Clock className="w-2 h-2 shrink-0" /> در انتظار sync
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
                placeholder="جستجو در نام یا کد دارایی..."
                className="pr-8 text-xs h-9"
              />
            </div>

            {/* فیلتر دسته */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full lg:w-44 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه دسته‌ها</option>
              <option value="تجهیزات">تجهیزات</option>
              <option value="ماشین‌آلات">ماشین‌آلات</option>
              <option value="مبلمان">مبلمان</option>
              <option value="ساختمان">ساختمان</option>
              <option value="وسایل نقلیه">وسایل نقلیه</option>
              <option value="کامپیوتر و تجهیزات IT">کامپیوتر و تجهیزات IT</option>
            </select>

            {/* فیلتر وضعیت */}
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

            {/* دکمه‌های عملیات */}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => isOnline && handleDepreciation()}
                disabled={!isOnline || stats.active === 0}
                className="text-xs h-9 text-amber-600 border-amber-300 hover:bg-amber-50 flex-1 lg:flex-none"
                title={!isOnline ? 'محاسبه استهلاک نیاز به اتصال دارد' : 'محاسبه استهلاک ماهانه'}
              >
                {depreciating ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <RefreshCw className="w-3.5 h-3.5 ml-1" />}
                {isOnline ? 'محاسبه استهلاک' : 'استهلاک (آفلاین)'}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 flex-1 lg:flex-none"
                onClick={() => {
                  setAssetFormMode('add')
                  setAssetFormId('')
                  setAssetForm({
                    name: '', code: '', category: 'تجهیزات', purchasePrice: '', salvageValue: '0',
                    usefulLife: '60', purchaseDate: new Date().toISOString().split('T')[0], description: '',
                  })
                  setAssetDialogOpen(true)
                }}
              >
                <Plus className="w-3.5 h-3.5 ml-1" />
                دارایی جدید
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
            <p className="text-sm text-gray-500">در حال بارگذاری دارایی‌ها...</p>
          </CardContent>
        </Card>
      ) : filteredAssets.length === 0 ? (
        /* ═══════════════════════════════════════════════════════
            Empty State
        ═══════════════════════════════════════════════════════ */
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Package className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">دارایی یافت نشد</h3>
            <p className="text-sm text-gray-400 text-center max-w-md">
              {fixedAssets.length === 0
                ? 'هنوز هیچ دارایی ثابتی ثبت نشده است. برای ثبت دارایی جدید، روی دکمه «دارایی جدید» کلیک کنید.'
                : 'با فیلترهای فعلی، دارایی یافت نشد. فیلترها را تغییر دهید.'}
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
                      <TableHead className="text-right text-xs w-24">کد</TableHead>
                      <TableHead className="text-right text-xs">نام</TableHead>
                      <TableHead className="text-right text-xs w-28">دسته</TableHead>
                      <TableHead className="text-right text-xs w-32">بهای خرید</TableHead>
                      <TableHead className="text-right text-xs w-32">استهلاک انباشته</TableHead>
                      <TableHead className="text-right text-xs w-32">ارزش دفتری</TableHead>
                      <TableHead className="text-right text-xs w-24">عمر (ماه)</TableHead>
                      <TableHead className="text-right text-xs w-28">وضعیت</TableHead>
                      <TableHead className="text-right text-xs w-28">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.map((asset) => (
                      <TableRow key={asset.id} className="hover:bg-gray-50/50">
                        <TableCell className="text-xs font-mono">
                          {asset.code}
                          {/* ★★★ نشانگر آفلاین */}
                          {asset._offline && (
                            <Badge className="bg-orange-100 text-orange-700 mr-1 text-[9px]">
                              <Clock className="w-2.5 h-2.5 ml-0.5" />
                              آفلاین
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{asset.name}</TableCell>
                        <TableCell>
                          <Badge className={getCategoryBadgeColor(asset.category)}>
                            {asset.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatCurrency(asset.purchasePrice)}</TableCell>
                        <TableCell className="text-xs text-red-600">{formatCurrency(asset.accumulatedDepreciation || 0)}</TableCell>
                        <TableCell className="text-xs font-bold text-emerald-600">{formatCurrency(asset.bookValue || 0)}</TableCell>
                        <TableCell className="text-xs">{(asset.usefulLife || 0).toLocaleString('fa-IR')}</TableCell>
                        <TableCell>{getStatusBadge(asset.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => setDetailAsset(asset)}
                              title="مشاهده جزئیات"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => openEditDialog(asset)}
                              title="ویرایش"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                              onClick={() => { setDeleteTarget(asset); setDeleteDialogOpen(true) }}
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
            {filteredAssets.map((asset) => (
              <Card key={asset.id} className="border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  {/* هدر کارت: نام + وضعیت */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{asset.name}</span>
                      {asset._offline && (
                        <Badge className="bg-orange-100 text-orange-700 text-[9px]">
                          <Clock className="w-2.5 h-2.5 ml-0.5" />
                          آفلاین
                        </Badge>
                      )}
                    </div>
                    {getStatusBadge(asset.status)}
                  </div>

                  {/* کد و دسته */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-gray-500 font-mono">{asset.code}</span>
                    <Badge className={getCategoryBadgeColor(asset.category) + ' text-[9px]'}>
                      {asset.category}
                    </Badge>
                  </div>

                  {/* مبالغ */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-50 border border-gray-100 rounded p-2">
                      <div className="text-[9px] text-gray-500 mb-0.5">بهای خرید</div>
                      <div className="text-[10px] font-bold text-gray-800">{formatCurrency(asset.purchasePrice)}</div>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded p-2">
                      <div className="text-[9px] text-red-600 mb-0.5">استهلاک</div>
                      <div className="text-[10px] font-bold text-red-700">{formatCurrency(asset.accumulatedDepreciation || 0)}</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded p-2">
                      <div className="text-[9px] text-emerald-600 mb-0.5">ارزش دفتری</div>
                      <div className="text-[10px] font-bold text-emerald-700">{formatCurrency(asset.bookValue || 0)}</div>
                    </div>
                  </div>

                  {/* عمر مفید */}
                  <div className="text-xs text-gray-500 mb-3">
                    عمر مفید: {(asset.usefulLife || 0).toLocaleString('fa-IR')} ماه
                  </div>

                  {/* دکمه‌های عملیات */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1"
                      onClick={() => setDetailAsset(asset)}
                    >
                      <Eye className="w-3 h-3 ml-1" /> جزئیات
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1"
                      onClick={() => openEditDialog(asset)}
                    >
                      <Pencil className="w-3 h-3 ml-1" /> ویرایش
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 flex-1"
                      onClick={() => { setDeleteTarget(asset); setDeleteDialogOpen(true) }}
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
          ★★★ Dialog: Asset Form (Add/Edit) — ریسپانسیو + fullscreen موبایل
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="w-4 h-4 text-emerald-600" />
              {assetFormMode === 'add' ? 'ثبت دارایی ثابت جدید' : 'ویرایش دارایی'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {assetFormMode === 'add' 
                ? 'اطلاعات دارایی جدید را وارد کنید' 
                : `ویرایش دارایی ${assetForm.name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* نام و کد دارایی */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">نام دارایی *</Label>
                <Input
                  value={assetForm.name}
                  onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                  placeholder="مثلاً: یخچال فروشگاه"
                  className="text-xs mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">کد *</Label>
                <Input
                  value={assetForm.code}
                  onChange={(e) => setAssetForm({ ...assetForm, code: e.target.value })}
                  placeholder="مثلاً: FA-001"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                />
              </div>
            </div>

            {/* دسته دارایی */}
            <div>
              <Label className="text-xs">دسته دارایی</Label>
              <select
                value={assetForm.category}
                onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                className="w-full text-xs mt-1 h-9 border border-gray-200 rounded px-2 bg-white"
              >
                <option value="تجهیزات">تجهیزات</option>
                <option value="ماشین‌آلات">ماشین‌آلات</option>
                <option value="مبلمان">مبلمان</option>
                <option value="ساختمان">ساختمان</option>
                <option value="وسایل نقلیه">وسایل نقلیه</option>
                <option value="کامپیوتر و تجهیزات IT">کامپیوتر و تجهیزات IT</option>
              </select>
            </div>

            {/* تاریخ خرید */}
            <div>
              <PersianDatePicker
                value={assetForm.purchaseDate}
                onChange={(iso) => setAssetForm({ ...assetForm, purchaseDate: iso })}
                placeholder="انتخاب تاریخ خرید"
                label="تاریخ خرید"
              />
            </div>

            {/* مبالغ */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">بهای خرید (ریال) *</Label>
                <Input
                  type="number"
                  value={assetForm.purchasePrice}
                  onChange={(e) => setAssetForm({ ...assetForm, purchasePrice: e.target.value })}
                  placeholder="15000000"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">ارزش اسقاط</Label>
                <Input
                  type="number"
                  value={assetForm.salvageValue}
                  onChange={(e) => setAssetForm({ ...assetForm, salvageValue: e.target.value })}
                  placeholder="0"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">عمر مفید (ماه)</Label>
                <Input
                  type="number"
                  value={assetForm.usefulLife}
                  onChange={(e) => setAssetForm({ ...assetForm, usefulLife: e.target.value })}
                  placeholder="60"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                />
              </div>
            </div>

            {/* توضیحات */}
            <div>
              <Label className="text-xs">توضیحات (اختیاری)</Label>
              <Textarea
                value={assetForm.description}
                onChange={(e) => setAssetForm({ ...assetForm, description: e.target.value })}
                placeholder="توضیحات اختیاری درباره دارایی"
                className="text-xs mt-1"
                rows={2}
              />
            </div>

            {/* پیش‌نمایش محاسبه استهلاک */}
            {assetForm.purchasePrice && assetForm.usefulLife && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-800">پیش‌نمایش استهلاک ماهانه (خطی)</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span className="text-gray-500">بهای خرید:</span>
                    <span className="font-bold mr-1">{formatCurrency(parseFloat(assetForm.purchasePrice) || 0)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">ارزش اسقاط:</span>
                    <span className="font-bold mr-1">{formatCurrency(parseFloat(assetForm.salvageValue) || 0)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">استهلاک ماهانه:</span>
                    <span className="font-bold text-blue-700 mr-1">
                      {formatCurrency(
                        ((parseFloat(assetForm.purchasePrice) || 0) - (parseFloat(assetForm.salvageValue) || 0)) / (parseInt(assetForm.usefulLife) || 60)
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAssetDialogOpen(false)} disabled={assetSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button
              onClick={handleAssetSave}
              disabled={assetSaving || !assetForm.name.trim() || !assetForm.code.trim() || !assetForm.purchasePrice.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
            >
              {assetSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
              {assetSaving ? 'در حال ذخیره...' : assetFormMode === 'add' ? 'ثبت دارایی' : 'ذخیره تغییرات'}
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
            <DialogTitle className="text-base text-red-600">حذف دارایی</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              آیا از حذف دارایی <strong>{deleteTarget?.name}</strong> (کد: {deleteTarget?.code}) مطمئن هستید؟
              <br />
              <span className="text-red-600 font-medium mt-2 block">⚠️ این عمل غیرقابل بازگشت است.</span>
            </DialogDescription>
          </DialogHeader>

          {/* هشدار اگر دارایی استهلاک داشته باشد */}
          {deleteTarget && (deleteTarget.accumulatedDepreciation || 0) > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                این دارایی دارای استهلاک انباشته به مبلغ {formatCurrency(deleteTarget.accumulatedDepreciation)} است. 
                حذف آن ممکن است بر گزارش‌های مالی تأثیر بگذارد.
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button onClick={handleDeleteAsset} disabled={deleteSaving} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
              {deleteSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
              حذف دارایی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Detail View — ریسپانسیو
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailAsset} onOpenChange={(open) => !open && setDetailAsset(null)}>
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
                {/* اطلاعات کلی */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">تاریخ خرید</div>
                    <div className="font-medium">{formatDate(detailAsset.purchaseDate)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">عمر مفید</div>
                    <div className="font-medium">{(detailAsset.usefulLife || 0).toLocaleString('fa-IR')} ماه</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">وضعیت</div>
                    <div className="font-medium">{getStatusLabel(detailAsset.status)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500 text-[10px] mb-0.5">دسته</div>
                    <div className="font-medium">{detailAsset.category}</div>
                  </div>
                </div>

                {/* مبالغ */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-blue-600 mb-1">بهای خرید</div>
                    <div className="text-sm font-bold text-blue-700">{formatCurrency(detailAsset.purchasePrice)}</div>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-red-600 mb-1">استهلاک انباشته</div>
                    <div className="text-sm font-bold text-red-700">{formatCurrency(detailAsset.accumulatedDepreciation || 0)}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-emerald-600 mb-1">ارزش دفتری</div>
                    <div className="text-sm font-bold text-emerald-700">{formatCurrency(detailAsset.bookValue || 0)}</div>
                  </div>
                </div>

                {/* نوار پیشرفت استهلاک */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-600">پیشرفت استهلاک</span>
                    <span className="text-xs font-bold text-gray-800">
                      {Math.min(100, Math.round(((detailAsset.accumulatedDepreciation || 0) / (detailAsset.purchasePrice || 1)) * 100))}٪
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-red-500 h-2 rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, ((detailAsset.accumulatedDepreciation || 0) / (detailAsset.purchasePrice || 1)) * 100)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* توضیحات */}
                {detailAsset.description && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">توضیحات</div>
                    <p className="text-xs text-gray-700">{detailAsset.description}</p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailAsset(null)} className="w-full sm:w-auto">بستن</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FixedAssetsTab