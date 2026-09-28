'use client'

// ============================================================================
// src/components/reports/custom-report-designer-page.tsx — v12.8 ★★★
// ShopAccounting — Custom Report Designer Page (Final Version)
// ----------------------------------------------------------------------------
// ★ v12.8: استفاده از توابع یکپارچه exportToExcel و printReport
// ★ v12.7: فیلد عنوان گزارش + دکمه پاک کردن + خروجی اکسل/چاپ
// ★ v12.6: یکپارچه‌سازی جدول (راست به چپ + وسط‌چین)
// ★ v12.5: PersianDatePicker + Drag & Drop با @dnd-kit
// ★ v12.4: پشتیبانی از فیلدهای فرمولی و رابطه‌ای
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  FileText, Database, Layers, Filter, Plus, X, Save, Loader2,
  AlertCircle, CheckCircle2, Star, StarOff, Trash2, Eye,
  ArrowUp, ArrowDown, Play, FolderOpen, BarChart3, Table as TableIcon,
  Package, User, CreditCard, Wallet, Calendar, Hash, Tag,
  Settings2, GripVertical, Sparkles, Crown, Lock, ListFilter,
  ChevronDown, ChevronUp, RotateCcw, Printer, FileSpreadsheet,
} from 'lucide-react'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type {
  Dataset,
  DatasetField,
  DatasetSummary,
  ReportDefinition,
  ReportColumn,
  ReportFilter,
  ReportGroupBy,
  ReportOrderBy,
  ReportResultColumn,
  ReportResultRow,
  ReportResultMeta,
  AggregateOperator,
  FilterOperator,
  SortDirection,
  SavedReportSummary,
} from '@/lib/reports/report-types'
import {
  exportToExcel, printReport, formatNumberFa, toFaNum,
  type ReportColumn as UtilsReportColumn,
  type ReportMeta,
} from '@/lib/report-utils'

// ═══════════════════════════════════════════════════════════════
//  Constants & Helpers
// ═══════════════════════════════════════════════════════════════

const AGGREGATE_LABELS: Record<string, string> = {
  sum: 'جمع',
  avg: 'میانگین',
  count: 'تعداد',
  countDistinct: 'تعداد یکتا',
  min: 'کمینه',
  max: 'بیشینه',
}

const FILTER_OPERATOR_LABELS: Record<string, string> = {
  equals: 'برابر با',
  notEquals: 'نابرابر با',
  contains: 'شامل',
  startsWith: 'شروع با',
  endsWith: 'پایان با',
  greaterThan: 'بزرگتر از',
  greaterThanOrEq: 'بزرگتر یا مساوی',
  lessThan: 'کوچکتر از',
  lessThanOrEq: 'کوچکتر یا مساوی',
  between: 'بین',
  in: 'در لیست',
  notIn: 'خارج از لیست',
  isNull: 'خالی',
  isNotNull: 'غیرخالی',
}

function getValidOperators(fieldType: string): FilterOperator[] {
  switch (fieldType) {
    case 'string':
      return ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'in', 'notIn', 'isNull', 'isNotNull']
    case 'currency':
    case 'number':
      return ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEq', 'lessThan', 'lessThanOrEq', 'between', 'isNull', 'isNotNull']
    case 'date':
    case 'datetime':
      return ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEq', 'lessThan', 'lessThanOrEq', 'between', 'isNull', 'isNotNull']
    case 'boolean':
      return ['equals', 'notEquals', 'isNull', 'isNotNull']
    case 'enum':
      return ['equals', 'notEquals', 'in', 'notIn', 'isNull', 'isNotNull']
    default:
      return ['equals', 'notEquals']
  }
}

function getFieldTypeIcon(type: string) {
  switch (type) {
    case 'currency': return <Wallet className="w-3.5 h-3.5" />
    case 'number': return <Hash className="w-3.5 h-3.5" />
    case 'date':
    case 'datetime': return <Calendar className="w-3.5 h-3.5" />
    case 'boolean': return <CheckCircle2 className="w-3.5 h-3.5" />
    case 'enum': return <Tag className="w-3.5 h-3.5" />
    default: return <FileText className="w-3.5 h-3.5" />
  }
}

function getDatasetIcon(iconName?: string) {
  switch (iconName) {
    case 'Package': return <Package className="w-5 h-5" />
    case 'User': return <User className="w-5 h-5" />
    case 'CreditCard': return <CreditCard className="w-5 h-5" />
    case 'Layers': return <Layers className="w-5 h-5" />
    case 'Database': return <Database className="w-5 h-5" />
    default: return <FileText className="w-5 h-5" />
  }
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function genUid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ═══════════════════════════════════════════════════════════════
//  Persian/Jalali Date Utilities
// ═══════════════════════════════════════════════════════════════

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

const EMERALD_COLORS = {
  primary: '#047857', primaryDk: '#065f46', textMain: '#1f2937',
  textMute: '#6b7280', textSoft: '#9ca3af', border: '#e5e7eb',
  bgCard: '#ffffff', popupBg: '#ffffff', headerBg: '#ecfdf5',
}

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

function jalaliToISO(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
}

function todayGregorianISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length; const gy = jy + 621; let leapJ = -14
  let jp = breaks[0]; let jm2 = 0, jump = 0, leap = 0, n = 0
  if (jy < jp || jy >= breaks[bl - 1]) return 29
  for (let i = 1; i < bl; i += 1) { jm2 = breaks[i]; jump = jm2 - jp; if (jy < jm2) break; leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm2 }
  n = jy - jp; leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4
  return leap === 0 ? 30 : 29
}

// ═══════════════════════════════════════════════════════════════
//  PersianDatePicker Component
// ═══════════════════════════════════════════════════════════════

function PersianDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
  size = 'sm',
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  size?: 'sm' | 'md'
}) {
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

  const firstDayOfMonth = useCallback((jy: number, jm: number): number => {
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1)
    const d = new Date(gy, gm - 1, gd)
    return (d.getDay() + 1) % 7
  }, [])

  const firstDayOffset = firstDayOfMonth(viewYear, viewMonth)

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const goNextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const handleDayClick = (jd: number) => {
    const iso = jalaliToISO(viewYear, viewMonth, jd)
    onChange(iso)
    setOpen(false)
  }

  const selectedJalali = value ? isoToJalali(value) : null

  const heightClass = size === 'sm' ? 'h-7 text-[10px]' : 'h-9 text-sm'

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full ${heightClass} px-2 rounded-md border flex items-center justify-between gap-1 cursor-pointer transition-colors hover:border-emerald-400 hover:bg-emerald-50/50`}
        style={{ borderColor: EMERALD_COLORS.border, backgroundColor: EMERALD_COLORS.bgCard }}
      >
        <Calendar className="w-3 h-3 text-emerald-500 shrink-0" />
        <span className="flex-1 text-right font-mono truncate" style={{ color: displayText ? EMERALD_COLORS.textMain : EMERALD_COLORS.textSoft, fontSize: 10 }} dir="ltr">
          {displayText || placeholder}
        </span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div dir="rtl" style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 3, zIndex: 50,
            width: 220, backgroundColor: EMERALD_COLORS.popupBg, border: `1px solid ${EMERALD_COLORS.border}`,
            borderRadius: 8, boxShadow: '0 8px 24px -4px rgba(4,120,87,0.18)', padding: 8,
          }}>
            <div style={{
              background: `linear-gradient(135deg, ${EMERALD_COLORS.headerBg} 0%, #d1fae5 100%)`,
              margin: -8, marginBottom: 6, padding: '6px 8px', borderRadius: '8px 8px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button type="button" onClick={goPrevMonth} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: EMERALD_COLORS.primary, fontSize: 12, cursor: 'pointer' }}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: EMERALD_COLORS.primaryDk }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button type="button" onClick={goNextMonth} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: EMERALD_COLORS.primary, fontSize: 12, cursor: 'pointer' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: i === 6 ? EMERALD_COLORS.primary : EMERALD_COLORS.textMute, padding: '2px 0' }}>{w}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 22 }} />
                const isSelected = selectedJalali && selectedJalali.jy === viewYear && selectedJalali.jm === viewMonth && selectedJalali.jd === d
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDayClick(d)}
                    style={{
                      height: 22, borderRadius: 4, fontSize: 10,
                      backgroundColor: isSelected ? EMERALD_COLORS.primary : 'transparent',
                      color: isSelected ? '#fff' : EMERALD_COLORS.textMain,
                      cursor: 'pointer',
                      fontWeight: isSelected ? 700 : 400,
                    }}
                  >
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Types for internal state
// ═══════════════════════════════════════════════════════════════

interface SelectedColumn extends ReportColumn {
  uid: string
}

interface SelectedFilter extends ReportFilter {
  uid: string
}

interface SelectedGroupBy extends ReportGroupBy {
  uid: string
}

interface SelectedOrderBy extends ReportOrderBy {
  uid: string
}

// ═══════════════════════════════════════════════════════════════
//  Draggable Field Item
// ═══════════════════════════════════════════════════════════════

function DraggableFieldItem({
  field,
  isAdded,
  onAdd,
}: {
  field: DatasetField
  isAdded: boolean
  onAdd: (fieldId: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `field-${field.id}`,
    data: { type: 'field', fieldId: field.id },
    disabled: isAdded,
  })

  // ★ وقتی فیلد اضافه شد، انیمیشن بازگشت را حذف کن
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isAdded ? 'none' : 'transform 200ms ease',
    opacity: isDragging ? 0.4 : isAdded ? 0.6 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group flex items-center gap-2 p-2 rounded-md border transition-colors ${
        isAdded
          ? 'border-amber-200 bg-amber-50/50 cursor-default'
          : 'border-gray-100 bg-gray-50/50 hover:border-blue-200 hover:bg-blue-50/50 cursor-grab active:cursor-grabbing'
      }`}
      onClick={() => !isAdded && onAdd(field.id)}
    >
      <span className="text-gray-400">{getFieldTypeIcon(field.type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-gray-700 truncate">{field.label}</p>
        {field.description && <p className="text-[9px] text-gray-400 truncate">{field.description}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {field.aggregatable && (
          <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded" title="قابل تجمیع">Σ</span>
        )}
        {isAdded ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <Plus className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500" />
        )}
      </div>
    </div>
  )
}
// ═══════════════════════════════════════════════════════════════
//  Sortable Column Item
// ═══════════════════════════════════════════════════════════════

function SortableColumnItem({
  col,
  idx,
  totalColumns,
  dataset,
  onRemove,
  onMove,
  onUpdateAggregate,
}: {
  col: SelectedColumn
  idx: number
  totalColumns: number
  dataset: Dataset
  onRemove: (uid: string) => void
  onMove: (uid: string, direction: 'up' | 'down') => void
  onUpdateAggregate: (uid: string, aggregate?: AggregateOperator) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.uid,
    data: { type: 'column' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const field = dataset.fields.find((f) => f.id === col.field)
  const isAggregatable = field?.aggregatable || false

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
      <button
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200"
        title="بکشید و رها کنید تا مرتب شود"
      >
        <GripVertical className="w-4 h-4 text-gray-300" />
      </button>
      <span className="text-gray-400 shrink-0">{getFieldTypeIcon(field?.type || 'string')}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{col.label || field?.label || col.field}</p>
      </div>

      {isAggregatable && (
        <Select
          value={col.aggregate || 'none'}
          onValueChange={(v) => onUpdateAggregate(col.uid, v === 'none' ? undefined : v as AggregateOperator)}
        >
          <SelectTrigger className="h-7 w-[110px] text-[10px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون تجمیع</SelectItem>
            <SelectItem value="sum">جمع</SelectItem>
            <SelectItem value="avg">میانگین</SelectItem>
            <SelectItem value="count">تعداد</SelectItem>
            <SelectItem value="min">کمینه</SelectItem>
            <SelectItem value="max">بیشینه</SelectItem>
          </SelectContent>
        </Select>
      )}

      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={() => onMove(col.uid, 'up')} disabled={idx === 0} className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronUp className="w-3 h-3 text-gray-500" />
        </button>
        <button onClick={() => onMove(col.uid, 'down')} disabled={idx === totalColumns - 1} className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronDown className="w-3 h-3 text-gray-500" />
        </button>
      </div>

      <button onClick={() => onRemove(col.uid)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Columns Drop Zone
// ═══════════════════════════════════════════════════════════════

function ColumnsDropZone({
  columns,
  dataset,
  onRemove,
  onMove,
  onUpdateAggregate,
  isOver,
}: {
  columns: SelectedColumn[]
  dataset: Dataset
  onRemove: (uid: string) => void
  onMove: (uid: string, direction: 'up' | 'down') => void
  onUpdateAggregate: (uid: string, aggregate?: AggregateOperator) => void
  isOver: boolean
}) {
  return (
    <SortableContext items={columns.map(c => c.uid)} strategy={verticalListSortingStrategy}>
      <div className={`space-y-1.5 min-h-[60px] rounded-lg transition-all ${isOver ? 'bg-blue-50/50 border border-dashed border-blue-300 p-2' : ''}`}>
        {columns.map((col, idx) => (
          <SortableColumnItem
            key={col.uid}
            col={col}
            idx={idx}
            totalColumns={columns.length}
            dataset={dataset}
            onRemove={onRemove}
            onMove={onMove}
            onUpdateAggregate={onUpdateAggregate}
          />
        ))}
      </div>
    </SortableContext>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export default function CustomReportDesignerPage() {
  const planName = useAppStore((s) => s.planName)
  const tenantId = useAppStore((s) => s.tenantId)
  const features = getFeaturesByPlanName(planName)

  if (!features.canUseCustomReportDesigner) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4" dir="rtl">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-3">طراحی گزارش دلخواه</h2>
        <p className="text-sm text-gray-600 text-center max-w-md leading-relaxed mb-6">
          با طراحی گزارش دلخواه می‌توانید گزارش‌های اختصاصی خود را بسازید، فیلتر کنید، گروه‌بندی کنید و خروجی بگیرید.
        </p>
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 mb-6">
          <Crown className="w-3 h-3 ml-1" />
          پلن فعلی: پایه
        </Badge>
        <Button className="bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-2">
          <Sparkles className="w-4 h-4" />
          ارتقا به پلن پیشرفته
        </Button>
      </div>
    )
  }

  return <ReportDesignerInner tenantId={tenantId || ''} />
}

// ═══════════════════════════════════════════════════════════════
//  Inner Component
// ═══════════════════════════════════════════════════════════════

function ReportDesignerInner({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState<'designer' | 'saved'>('designer')

  // Dataset state
  const [datasetSummaries, setDatasetSummaries] = useState<DatasetSummary[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('')
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [loadingDataset, setLoadingDataset] = useState(false)

  // Report design state
  const [columns, setColumns] = useState<SelectedColumn[]>([])
  const [filters, setFilters] = useState<SelectedFilter[]>([])
  const [groupBy, setGroupBy] = useState<SelectedGroupBy[]>([])
  const [orderBy, setOrderBy] = useState<SelectedOrderBy[]>([])
  const [limit, setLimit] = useState<number>(100)

  // Report title
  const [reportTitle, setReportTitle] = useState('')

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewColumns, setPreviewColumns] = useState<ReportResultColumn[]>([])
  const [previewRows, setPreviewRows] = useState<ReportResultRow[]>([])
  const [previewMeta, setPreviewMeta] = useState<ReportResultMeta | null>(null)

  // Saved reports state
  const [savedReports, setSavedReports] = useState<SavedReportSummary[]>([])
  const [loadingSavedReports, setLoadingSavedReports] = useState(false)
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [reportDescription, setReportDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Drag & Drop state
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const { isOver: isColumnsOver, setNodeRef: columnsDropRef } = useDroppable({
    id: 'columns-drop-zone',
  })

  const activeDragField = useMemo(() => {
    if (!activeDragId || !dataset) return null
    const fieldId = activeDragId.replace('field-', '')
    return dataset.fields.find(f => f.id === fieldId) || null
  }, [activeDragId, dataset])

  // ═══════════════════════════════════════════════════════════
  //  Load datasets
  // ═══════════════════════════════════════════════════════════

  const loadDatasetSummaries = useCallback(async () => {
    setLoadingDatasets(true)
    try {
      const res = await fetch(`/api/reports/designer/datasets?tenantId=${tenantId}`, {
        headers: { 'x-tenant-id': tenantId, ...getAuthHeaders() },
      })
      const data = await res.json()
      if (data.success && data.data?.datasets) {
        setDatasetSummaries(data.data.datasets)
      } else {
        setDatasetSummaries([])
        setPreviewError(data.error || 'خطا در بارگذاری دیتاست‌ها')
      }
    } catch (err) {
      console.error('[ReportDesigner] Failed to load dataset summaries:', err)
      setDatasetSummaries([])
      setPreviewError('خطا در ارتباط با سرور')
    } finally {
      setLoadingDatasets(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadDatasetSummaries()
  }, [loadDatasetSummaries])

  const handleSelectDataset = useCallback(async (datasetId: string) => {
    setSelectedDatasetId(datasetId)
    setLoadingDataset(true)
    setColumns([])
    setFilters([])
    setGroupBy([])
    setOrderBy([])
    setPreviewRows([])
    setPreviewColumns([])
    setPreviewMeta(null)
    setPreviewError(null)
    setCurrentReportId(null)

    try {
      const res = await fetch(`/api/reports/designer/datasets/${datasetId}?tenantId=${tenantId}`, {
        headers: { 'x-tenant-id': tenantId, ...getAuthHeaders() },
      })
      const data = await res.json()
      if (data.success && data.data) {
        const ds = data.data
        setDataset(ds)
        if (ds.fields && ds.fields.length > 0) {
          const defaultCols = ds.fields.slice(0, Math.min(4, ds.fields.length)).map((f: DatasetField) => ({
            uid: genUid(),
            field: f.id,
            label: f.label,
          }))
          setColumns(defaultCols)
        }
      } else {
        setDataset(null)
        setPreviewError(data.error || 'خطا در بارگذاری دیتاست')
      }
    } catch (err) {
      console.error('[ReportDesigner] Failed to load dataset:', err)
      setDataset(null)
      setPreviewError('خطا در ارتباط با سرور')
    } finally {
      setLoadingDataset(false)
    }
  }, [tenantId])

  // ═══════════════════════════════════════════════════════════
  //  Column operations
  // ═══════════════════════════════════════════════════════════

  const addColumn = useCallback((fieldId: string) => {
    if (!dataset) return
    const field = dataset.fields.find(f => f.id === fieldId)
    if (!field) return
    setColumns(prev => {
      if (prev.some(c => c.field === fieldId)) return prev
      return [...prev, { uid: genUid(), field: fieldId, label: field.label }]
    })
  }, [dataset])

  const removeColumn = useCallback((uid: string) => {
    setColumns(prev => prev.filter(c => c.uid !== uid))
  }, [])

  const moveColumn = useCallback((uid: string, direction: 'up' | 'down') => {
    setColumns(prev => {
      const idx = prev.findIndex(c => c.uid === uid)
      if (idx === -1) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      return arrayMove(prev, idx, newIdx)
    })
  }, [])

  const updateColumnAggregate = useCallback((uid: string, aggregate?: AggregateOperator) => {
    setColumns(prev => prev.map(c => c.uid === uid ? { ...c, aggregate: aggregate || undefined } : c))
  }, [])

  // ═══════════════════════════════════════════════════════════
  //  Drag Handlers
  // ═══════════════════════════════════════════════════════════

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

   const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    
    if (!dataset) return

    const activeId = String(active.id)

    // اگر فیلد در حال درگ است، آن را به ستون‌ها اضافه کن
    if (activeId.startsWith('field-')) {
      const fieldId = activeId.replace('field-', '')
      const field = dataset.fields.find(f => f.id === fieldId)
      
      if (field) {
        // اگر over وجود دارد، یعنی در ناحیه قابل قبول رها شده
        // حتی اگر دقیقاً 'columns-drop-zone' نباشد، باز هم اضافه کن
        addColumn(fieldId)
      }
    }
  }, [dataset, addColumn])

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null)
  }, [])

  // ═══════════════════════════════════════════════════════════
  //  Filter operations
  // ═══════════════════════════════════════════════════════════

  const addFilter = useCallback(() => {
    if (!dataset || dataset.fields.length === 0) return
    const firstField = dataset.fields[0]
    const ops = getValidOperators(firstField.type)
    setFilters(prev => [...prev, {
      uid: genUid(),
      field: firstField.id,
      operator: ops[0] || 'equals',
      value: '',
    }])
  }, [dataset])

  const removeFilter = useCallback((uid: string) => {
    setFilters(prev => prev.filter(f => f.uid !== uid))
  }, [])

  const updateFilter = useCallback((uid: string, patch: Partial<ReportFilter>) => {
    setFilters(prev => prev.map(f => {
      if (f.uid !== uid) return f
      const updated = { ...f, ...patch }
      if (patch.field && dataset) {
        const field = dataset.fields.find(fd => fd.id === patch.field)
        if (field) {
          const ops = getValidOperators(field.type)
          if (!ops.includes(updated.operator as FilterOperator)) {
            updated.operator = ops[0] || 'equals'
          }
        }
      }
      return updated
    }))
  }, [dataset])

  // ═══════════════════════════════════════════════════════════
  //  GroupBy & OrderBy operations
  // ═══════════════════════════════════════════════════════════

  const addGroupBy = useCallback(() => {
    if (!dataset || dataset.fields.length === 0) return
    const firstField = dataset.fields[0]
    setGroupBy(prev => {
      if (prev.some(g => g.field === firstField.id)) return prev
      return [...prev, { uid: genUid(), field: firstField.id }]
    })
  }, [dataset])

  const removeGroupBy = useCallback((uid: string) => {
    setGroupBy(prev => prev.filter(g => g.uid !== uid))
  }, [])

  const updateGroupByField = useCallback((uid: string, fieldId: string) => {
    setGroupBy(prev => prev.map(g => g.uid === uid ? { ...g, field: fieldId } : g))
  }, [])

  const addOrderBy = useCallback(() => {
    if (!dataset || dataset.fields.length === 0) return
    const firstField = dataset.fields[0]
    setOrderBy(prev => [...prev, {
      uid: genUid(),
      field: firstField.id,
      direction: 'asc' as SortDirection,
    }])
  }, [dataset])

  const removeOrderBy = useCallback((uid: string) => {
    setOrderBy(prev => prev.filter(o => o.uid !== uid))
  }, [])

  const updateOrderBy = useCallback((uid: string, patch: Partial<ReportOrderBy>) => {
    setOrderBy(prev => prev.map(o => o.uid === uid ? { ...o, ...patch } : o))
  }, [])

  // ═══════════════════════════════════════════════════════════
  //  Build definition
  // ═══════════════════════════════════════════════════════════

  const buildDefinition = useCallback((): ReportDefinition => {
    return {
      datasetId: selectedDatasetId,
      columns: columns.map(({ uid, ...col }) => col),
      filters: filters.map(({ uid, ...f }) => f),
      groupBy: groupBy.map(({ uid, ...g }) => g),
      orderBy: orderBy.map(({ uid, ...o }) => o),
      limit,
    }
  }, [selectedDatasetId, columns, filters, groupBy, orderBy, limit])

  // ═══════════════════════════════════════════════════════════
  //  Preview
  // ═══════════════════════════════════════════════════════════

  const handlePreview = useCallback(async () => {
    if (!selectedDatasetId) {
      setPreviewError('لطفاً ابتدا یک منبع داده انتخاب کنید.')
      return
    }
    if (columns.length === 0) {
      setPreviewError('لطفاً حداقل یک ستون انتخاب کنید.')
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const definition = buildDefinition()
      const res = await fetch('/api/reports/designer/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          ...getAuthHeaders(),
        },
        body: JSON.stringify(definition),
      })

      const data = await res.json()

      if (data.success && data.data) {
        setPreviewColumns(data.data.columns || [])
        setPreviewRows(data.data.rows || [])
        setPreviewMeta(data.data.meta || null)
      } else {
        const msg = data.error || 'خطا در اجرای گزارش'
        const validationMsgs = data.validationErrors || []
        setPreviewError(validationMsgs.length > 0 ? validationMsgs.join('، ') : msg)
        setPreviewRows([])
        setPreviewColumns([])
        setPreviewMeta(null)
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'خطا در ارتباط با سرور')
      setPreviewRows([])
      setPreviewColumns([])
      setPreviewMeta(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedDatasetId, columns, buildDefinition, tenantId])

  // ═══════════════════════════════════════════════════════════
  //  Reset (پاک کردن کامل)
  // ═══════════════════════════════════════════════════════════

  const handleReset = useCallback(() => {
    setColumns([])
    setFilters([])
    setGroupBy([])
    setOrderBy([])
    setLimit(100)
    setPreviewRows([])
    setPreviewColumns([])
    setPreviewMeta(null)
    setPreviewError(null)
    setPreviewLoading(false)
    setReportTitle('')
    setReportDescription('')
    setDataset(null)
    setSelectedDatasetId('')
    setCurrentReportId(null)
  }, [])

  // ═══════════════════════════════════════════════════════════
  //  Export Excel
  // ═══════════════════════════════════════════════════════════

  const handleExportExcel = useCallback(() => {
    if (previewRows.length === 0 || previewColumns.length === 0) return

    const title = reportTitle.trim() || 'گزارش دلخواه'

    const meta: ReportMeta = {
      title,
      storeName: 'فروشگاه',
      period: `تاریخ تولید: ${new Date().toLocaleDateString('fa-IR')}`,
      summary: [
        {
                  label: 'منبع داده',
          value: dataset?.label || '—',  // ✅ اصلاح شد
          color: 'blue',
        },
        {
          label: 'تعداد ردیف',
          value: toFaNum(previewMeta?.returnedRows || previewRows.length),
          color: 'green',
        },
      ],
    }

    const excelColumns: UtilsReportColumn[] = previewColumns.map((col) => {
      let align: 'right' | 'center' | 'left' = 'right'
      if (col.type === 'currency' || col.type === 'number') {
        align = 'left'
      } else if (col.type === 'boolean') {
        align = 'center'
      }

      return {
        key: col.id,
        label: col.label + (col.isAggregate && col.aggregate
          ? ` (${AGGREGATE_LABELS[col.aggregate] || col.aggregate})`
          : ''),
        align,
        isNumeric: col.type === 'number',
        isCurrency: col.type === 'currency',
      }
    })

     const rows = previewRows.map((row) => {
      const out: any = {}
      for (const col of previewColumns) {
        const value = row[col.id]
        const fieldDef = dataset?.fields.find(f => f.id === col.id)
        
        if (value === null || value === undefined || value === '') {
          out[col.id] = '—'
        } else if (col.type === 'currency' || col.type === 'number') {
          const num = Number(value)
          out[col.id] = isNaN(num) ? String(value) : num
        } else if (col.type === 'date' || col.type === 'datetime') {
          try {
            const d = new Date(value)
            out[col.id] = isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fa-IR')
          } catch {
            out[col.id] = String(value)
          }
        } else if (col.type === 'boolean') {
          out[col.id] = value ? 'بله' : 'خیر'
        } else if (col.type === 'enum' && fieldDef?.enumLabels) {
          // ★ تبدیل enum به فارسی در اکسل
          out[col.id] = fieldDef.enumLabels[String(value)] || String(value)
        } else {
          out[col.id] = String(value)
        }
      }
      return out
    })

    const fileName = title.replace(/[\\/:*?"<>|]/g, '_')
    exportToExcel(meta, excelColumns, rows, fileName)
  }, [previewRows, previewColumns, previewMeta, reportTitle])

  // ═══════════════════════════════════════════════════════════
  //  Print / PDF
  // ═══════════════════════════════════════════════════════════

  const handlePrint = useCallback(() => {
    if (previewRows.length === 0 || previewColumns.length === 0) return

    const title = reportTitle.trim() || 'گزارش دلخواه'

    const meta: ReportMeta = {
      title,
      storeName: 'فروشگاه',
      period: `تاریخ تولید: ${new Date().toLocaleDateString('fa-IR')}`,
      summary: [
        {
           label: 'منبع داده',
          value: dataset?.label || '—',  // ✅ اصلاح شد
          color: 'blue',
        },
        {
          label: 'تعداد ردیف',
          value: toFaNum(previewMeta?.returnedRows || previewRows.length),
          color: 'green',
        },
      ],
    }

    const printColumns: UtilsReportColumn[] = previewColumns.map((col) => {
      let align: 'right' | 'center' | 'left' = 'right'
      if (col.type === 'currency' || col.type === 'number') {
        align = 'left'
      } else if (col.type === 'boolean') {
        align = 'center'
      }

      return {
        key: col.id,
        label: col.label + (col.isAggregate && col.aggregate
          ? ` (${AGGREGATE_LABELS[col.aggregate] || col.aggregate})`
          : ''),
        align,
        isNumeric: col.type === 'number',
        isCurrency: col.type === 'currency',
      }
    })

     const rows = previewRows.map((row) => {
      const out: any = {}
      for (const col of previewColumns) {
        const value = row[col.id]
        const fieldDef = dataset?.fields.find(f => f.id === col.id)
        
        if (value === null || value === undefined || value === '') {
          out[col.id] = '—'
        } else if (col.type === 'currency' || col.type === 'number') {
          const num = Number(value)
          out[col.id] = isNaN(num) ? String(value) : num
        } else if (col.type === 'date' || col.type === 'datetime') {
          try {
            const d = new Date(value)
            out[col.id] = isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fa-IR')
          } catch {
            out[col.id] = String(value)
          }
        } else if (col.type === 'boolean') {
          out[col.id] = value ? 'بله' : 'خیر'
        } else if (col.type === 'enum' && fieldDef?.enumLabels) {
          // ★ تبدیل enum به فارسی در چاپ
          out[col.id] = fieldDef.enumLabels[String(value)] || String(value)
        } else {
          out[col.id] = String(value)
        }
      }
      return out
    })

    printReport(meta, printColumns, rows)
  }, [previewRows, previewColumns, previewMeta, reportTitle])

  // ═══════════════════════════════════════════════════════════
  //  Save report
  // ═══════════════════════════════════════════════════════════

  const handleOpenSaveDialog = useCallback(() => {
    if (!selectedDatasetId || columns.length === 0) {
      setPreviewError('برای ذخیره گزارش، ابتدا یک منبع داده و حداقل یک ستون انتخاب کنید.')
      return
    }
    setSaveDialogOpen(true)
  }, [selectedDatasetId, columns])

  const handleSaveReport = useCallback(async () => {
    if (!reportTitle.trim()) return

    setSaving(true)
    try {
      const definition = buildDefinition()
      const res = await fetch('/api/reports/designer/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          id: currentReportId || undefined,
          name: reportTitle,
          description: reportDescription || undefined,
          definition,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setSaveDialogOpen(false)
        setCurrentReportId(data.data.id)
        setPreviewError(null)
        loadSavedReports()
        setActiveTab('saved')
      } else {
        setPreviewError(data.error || 'خطا در ذخیره گزارش')
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setSaving(false)
    }
  }, [reportTitle, reportDescription, buildDefinition, tenantId, currentReportId])

  // ═══════════════════════════════════════════════════════════
  //  Load saved reports
  // ═══════════════════════════════════════════════════════════

  const loadSavedReports = useCallback(async () => {
    setLoadingSavedReports(true)
    try {
      const res = await fetch(`/api/reports/saved?tenantId=${tenantId}`, {
        headers: { 'x-tenant-id': tenantId, ...getAuthHeaders() },
      })
      const data = await res.json()
      if (data.success && data.data?.reports) {
        setSavedReports(data.data.reports)
      } else {
        setSavedReports([])
      }
    } catch (err) {
      console.error('[ReportDesigner] Failed to load saved reports:', err)
      setSavedReports([])
    } finally {
      setLoadingSavedReports(false)
    }
  }, [tenantId])

  useEffect(() => {
    if (activeTab === 'saved') {
      loadSavedReports()
    }
  }, [activeTab, loadSavedReports])

  // ═══════════════════════════════════════════════════════════
  //  Open / Delete / Favorite saved reports
  // ═══════════════════════════════════════════════════════════

  const handleOpenSavedReport = useCallback(async (reportId: string) => {
    try {
      const res = await fetch(`/api/reports/saved/${reportId}?tenantId=${tenantId}`, {
        headers: { 'x-tenant-id': tenantId, ...getAuthHeaders() },
      })
      const data = await res.json()

      if (data.success && data.data) {
        const report = data.data
        const def: ReportDefinition = report.definition as any

        setSelectedDatasetId(def.datasetId)
        setCurrentReportId(report.id)
        setReportTitle(report.name)
        setReportDescription(report.description || '')

        try {
          const dsRes = await fetch(`/api/reports/designer/datasets/${def.datasetId}?tenantId=${tenantId}`, {
            headers: { 'x-tenant-id': tenantId, ...getAuthHeaders() },
          })
          const dsData = await dsRes.json()

          if (dsData.success && dsData.data) {
            const ds = dsData.data
            setDataset(ds)

            if (def.columns) {
              setColumns(def.columns.map((col: ReportColumn) => ({
                uid: genUid(),
                field: col.field,
                label: col.label,
                aggregate: col.aggregate,
              })))
            }

            if (def.filters) {
              setFilters(def.filters.map((f: ReportFilter) => ({
                uid: genUid(),
                field: f.field,
                operator: f.operator,
                value: f.value,
              })))
            }

            if (def.groupBy) {
              setGroupBy(def.groupBy.map((g: ReportGroupBy) => ({
                uid: genUid(),
                field: g.field,
              })))
            }

            if (def.orderBy) {
              setOrderBy(def.orderBy.map((o: ReportOrderBy) => ({
                uid: genUid(),
                field: o.field,
                direction: o.direction,
              })))
            }

            if (def.limit) {
              setLimit(def.limit)
            }
          }
        } catch (err) {
          console.error('[ReportDesigner] Failed to load dataset for saved report:', err)
        }

        setActiveTab('designer')
      } else {
        setPreviewError(data.error || 'خطا در بارگذاری گزارش')
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'خطا در ارتباط با سرور')
    }
  }, [tenantId])

  const handleDeleteSavedReport = useCallback(async (reportId: string) => {
    if (!confirm('آیا از حذف این گزارش مطمئن هستید؟')) return

    try {
      const res = await fetch(`/api/reports/saved/${reportId}?tenantId=${tenantId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId, ...getAuthHeaders() },
      })
      const data = await res.json()

      if (data.success) {
        setSavedReports(prev => prev.filter(r => r.id !== reportId))
        if (currentReportId === reportId) {
          setCurrentReportId(null)
        }
      } else {
        setPreviewError(data.error || 'خطا در حذف گزارش')
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'خطا در ارتباط با سرور')
    }
  }, [tenantId, currentReportId])

  const handleToggleFavorite = useCallback(async (reportId: string, isFavorite: boolean) => {
    try {
      const res = await fetch(`/api/reports/saved/${reportId}?tenantId=${tenantId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ isFavorite: !isFavorite }),
      })
      const data = await res.json()
      if (data.success) {
        setSavedReports(prev => prev.map(r =>
          r.id === reportId ? { ...r, isFavorite: !isFavorite } : r
        ))
      }
    } catch (err) {
      console.error('[ReportDesigner] Failed to toggle favorite:', err)
    }
  }, [tenantId])

  // ═══════════════════════════════════════════════════════════
  //  Format cell value for table display
  // ═══════════════════════════════════════════════════════════

   const formatCellValue = useCallback((value: any, type: string, field?: DatasetField): string => {
    if (value === null || value === undefined || value === '') return '—'

    if (type === 'currency' || type === 'number') {
      const num = Number(value)
      return isNaN(num) ? '—' : formatNumberFa(num)
    }

    if (type === 'date' || type === 'datetime') {
      try {
        const d = new Date(value)
        return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fa-IR')
      } catch {
        return String(value)
      }
    }

    if (type === 'boolean') {
      return value ? 'بله' : 'خیر'
    }

    // ★ تبدیل مقادیر enum به فارسی
    if (type === 'enum' && field?.enumLabels) {
      return field.enumLabels[String(value)] || String(value)
    }

    return String(value)
  }, [])

  // ═══════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-4" dir="rtl">
        {/* ─── Header & Tabs ─── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
              <Settings2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                طراحی گزارش دلخواه
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">
                  نسخه نهایی
                </Badge>
              </h2>
              <p className="text-[11px] text-gray-500">
                گزارش اختصاصی خود را بسازید، فیلتر کنید و خروجی بگیرید
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === 'designer' ? 'default' : 'outline'}
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => setActiveTab('designer')}
            >
              <Settings2 className="w-3.5 h-3.5" />
              طراحی گزارش
            </Button>
            <Button
              variant={activeTab === 'saved' ? 'default' : 'outline'}
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => setActiveTab('saved')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              گزارش‌های من
              {savedReports.length > 0 && (
                <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full">
                  {toFaNum(savedReports.length)}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* ─── Error message ─── */}
        {previewError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs text-red-700 flex-1">{previewError}</p>
            <button onClick={() => setPreviewError(null)} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*  TAB: DESIGNER */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'designer' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* ─── Right Column: Title + Dataset + Fields Palette ─── */}
            <div className="lg:col-span-3 space-y-4">
              {/* ─── عنوان گزارش ─── */}
              <Card className="border-gray-200">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    عنوان گزارش
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">
                      در خروجی
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <Input
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    placeholder="مثلاً: گزارش پرفروش‌ترین کالاها"
                    className="text-sm h-9"
                    maxLength={200}
                  />
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    این عنوان در خروجی اکسل، چاپ و پی‌دی‌اف نمایش داده می‌شود
                  </p>
                </CardContent>
              </Card>

              {/* ─── Dataset Selector ─── */}
              <Card className="border-gray-200">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-600" />
                    منبع داده
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  {loadingDatasets ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    </div>
                  ) : datasetSummaries.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      هیچ منبع داده‌ای موجود نیست
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {datasetSummaries.map((ds) => (
                        <button
                          key={ds.id}
                          onClick={() => handleSelectDataset(ds.id)}
                          className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-right ${
                            selectedDatasetId === ds.id
                              ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
                              : 'border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/50'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            selectedDatasetId === ds.id
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {getDatasetIcon(ds.icon)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold truncate ${
                              selectedDatasetId === ds.id ? 'text-amber-900' : 'text-gray-700'
                            }`}>
                              {ds.label}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {toFaNum(ds.fieldsCount)} فیلد
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ─── Fields Palette ─── */}
              {dataset && (
                <Card className="border-gray-200">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ListFilter className="w-4 h-4 text-blue-600" />
                        فیلدهای موجود
                      </span>
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[9px]">
                        {toFaNum(dataset.fields.length)}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">
                      فیلدها را به ناحیه ستون‌ها بکشید و رها کنید، یا روی آن‌ها کلیک کنید.
                    </p>
                    <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                      {dataset.fields.map((field) => {
                        const isAdded = columns.some(c => c.field === field.id)
                        return (
                          <DraggableFieldItem
                            key={field.id}
                            field={field}
                            isAdded={isAdded}
                            onAdd={addColumn}
                          />
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ─── Middle & Left: Builder + Preview ─── */}
            <div className="lg:col-span-9 space-y-4">
              {!dataset && !loadingDataset ? (
                <Card className="border-gray-200">
                  <CardContent className="flex flex-col items-center justify-center py-24">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                      <Database className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">
                      یک منبع داده انتخاب کنید
                    </h3>
                    <p className="text-xs text-gray-400 text-center max-w-sm">
                      برای شروع طراحی گزارش، از پنل سمت راست یک منبع داده انتخاب کنید.
                    </p>
                  </CardContent>
                </Card>
              ) : loadingDataset ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                </div>
              ) : dataset ? (
                <>
                  {/* ─── Columns Builder ─── */}
                  <Card className="border-gray-200">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TableIcon className="w-4 h-4 text-emerald-600" />
                        ستون‌های گزارش
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">
                          {toFaNum(columns.length)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {columns.length === 0 ? (
                        <div
                          ref={columnsDropRef}
                          className={`py-6 text-center border border-dashed rounded-lg transition-all ${
                            isColumnsOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                          }`}
                        >
                          <p className="text-xs text-gray-400">
                            فیلدها را از پنل سمت راست به اینجا بکشید و رها کنید
                          </p>
                        </div>
                      ) : (
                        <div ref={columnsDropRef}>
                          <ColumnsDropZone
                            columns={columns}
                            dataset={dataset}
                            onRemove={removeColumn}
                            onMove={moveColumn}
                            onUpdateAggregate={updateColumnAggregate}
                            isOver={isColumnsOver}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ─── Filters Builder ─── */}
                  <Card className="border-gray-200">
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Filter className="w-4 h-4 text-purple-600" />
                          فیلترها
                          {filters.length > 0 && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[9px]">
                              {toFaNum(filters.length)}
                            </Badge>
                          )}
                        </CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 gap-1"
                          onClick={addFilter}
                        >
                          <Plus className="w-3 h-3" />
                          افزودن فیلتر
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {filters.length === 0 ? (
                        <p className="text-[10px] text-gray-400 text-center py-3">
                          فیلتری اضافه نشده است. روی «افزودن فیلتر» کلیک کنید.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {filters.map((filter) => {
                            const field = dataset.fields.find(f => f.id === filter.field)
                            const validOps = getValidOperators(field?.type || 'string')
                            const needsValue = !['isNull', 'isNotNull'].includes(filter.operator)

                            return (
                              <div key={filter.uid} className="flex items-center gap-2 p-2 bg-purple-50/50 border border-purple-100 rounded-lg flex-wrap">
                                <Select
                                  value={filter.field}
                                  onValueChange={(v) => updateFilter(filter.uid, { field: v })}
                                >
                                  <SelectTrigger className="h-7 w-[130px] text-[10px]">
                                    <SelectValue placeholder="فیلد" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {dataset.fields.map(f => (
                                      <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Select
                                  value={filter.operator}
                                  onValueChange={(v) => updateFilter(filter.uid, { operator: v as FilterOperator })}
                                >
                                  <SelectTrigger className="h-7 w-[110px] text-[10px]">
                                    <SelectValue placeholder="عملگر" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {validOps.map(op => (
                                      <SelectItem key={op} value={op}>
                                        {FILTER_OPERATOR_LABELS[op] || op}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {needsValue && (
                                  <>
                                    {filter.operator === 'between' ? (
                                      <div className="flex items-center gap-1">
                                        {field?.type === 'date' || field?.type === 'datetime' ? (
                                          <>
                                            <PersianDatePicker
                                              value={Array.isArray(filter.value) ? filter.value[0] || '' : ''}
                                              onChange={(date) => {
                                                const cv = Array.isArray(filter.value) ? filter.value : ['', '']
                                                updateFilter(filter.uid, { value: [date, cv[1] || ''] })
                                              }}
                                              placeholder="از تاریخ"
                                              size="sm"
                                            />
                                            <span className="text-[10px] text-gray-400">تا</span>
                                            <PersianDatePicker
                                              value={Array.isArray(filter.value) ? filter.value[1] || '' : ''}
                                              onChange={(date) => {
                                                const cv = Array.isArray(filter.value) ? filter.value : ['', '']
                                                updateFilter(filter.uid, { value: [cv[0] || '', date] })
                                              }}
                                              placeholder="تا تاریخ"
                                              size="sm"
                                            />
                                          </>
                                        ) : (
                                          <>
                                            <Input
                                              type="number"
                                              value={Array.isArray(filter.value) ? filter.value[0] || '' : ''}
                                              onChange={(e) => {
                                                const cv = Array.isArray(filter.value) ? filter.value : ['', '']
                                                updateFilter(filter.uid, { value: [e.target.value, cv[1] || ''] })
                                              }}
                                              placeholder="از"
                                              className="h-7 w-[100px] text-[10px]"
                                            />
                                            <span className="text-[10px] text-gray-400">تا</span>
                                            <Input
                                              type="number"
                                              value={Array.isArray(filter.value) ? filter.value[1] || '' : ''}
                                              onChange={(e) => {
                                                const cv = Array.isArray(filter.value) ? filter.value : ['', '']
                                                updateFilter(filter.uid, { value: [cv[0] || '', e.target.value] })
                                              }}
                                              placeholder="تا"
                                              className="h-7 w-[100px] text-[10px]"
                                            />
                                          </>
                                        )}
                                      </div>
                                    ) : field?.type === 'date' || field?.type === 'datetime' ? (
                                      <PersianDatePicker
                                        value={String(filter.value || '')}
                                        onChange={(date) => updateFilter(filter.uid, { value: date })}
                                        placeholder="انتخاب تاریخ"
                                        size="sm"
                                      />
                                    ) : (
                                      <Input
                                        type={field?.type === 'number' || field?.type === 'currency' ? 'number' : 'text'}
                                        value={String(filter.value || '')}
                                        onChange={(e) => updateFilter(filter.uid, { value: e.target.value })}
                                        placeholder="مقدار"
                                        className="h-7 w-[120px] text-[10px]"
                                      />
                                    )}
                                  </>
                                )}

                                <button
                                  onClick={() => removeFilter(filter.uid)}
                                  className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 mr-auto"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ─── GroupBy & OrderBy ─── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-gray-200">
                      <CardHeader className="p-3 pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-600" />
                            گروه‌بندی
                          </CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px] h-7 gap-1"
                            onClick={addGroupBy}
                            disabled={!dataset?.allowGroupBy}
                          >
                            <Plus className="w-3 h-3" />
                            افزودن
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        {groupBy.length === 0 ? (
                          <p className="text-[10px] text-gray-400 text-center py-3">
                            گروه‌بندی اضافه نشده است
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {groupBy.map((gb) => (
                              <div key={gb.uid} className="flex items-center gap-2 p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                                <Select
                                  value={gb.field}
                                  onValueChange={(v) => updateGroupByField(gb.uid, v)}
                                >
                                  <SelectTrigger className="h-7 flex-1 text-[10px]">
                                    <SelectValue placeholder="فیلد" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {dataset.fields.map(f => (
                                      <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <button
                                  onClick={() => removeGroupBy(gb.uid)}
                                  className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-gray-200">
                      <CardHeader className="p-3 pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <ArrowUp className="w-4 h-4 text-teal-600" />
                            مرتب‌سازی
                          </CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px] h-7 gap-1"
                            onClick={addOrderBy}
                          >
                            <Plus className="w-3 h-3" />
                            افزودن
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        {orderBy.length === 0 ? (
                          <p className="text-[10px] text-gray-400 text-center py-3">
                            مرتب‌سازی اضافه نشده است
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {orderBy.map((ob) => (
                              <div key={ob.uid} className="flex items-center gap-2 p-2 bg-teal-50/50 border border-teal-100 rounded-lg">
                                <Select
                                  value={ob.field}
                                  onValueChange={(v) => updateOrderBy(ob.uid, { field: v })}
                                >
                                  <SelectTrigger className="h-7 flex-1 text-[10px]">
                                    <SelectValue placeholder="فیلد" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {dataset.fields.map(f => (
                                      <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={ob.direction}
                                  onValueChange={(v) => updateOrderBy(ob.uid, { direction: v as SortDirection })}
                                >
                                  <SelectTrigger className="h-7 w-[80px] text-[10px] shrink-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="asc">صعودی</SelectItem>
                                    <SelectItem value="desc">نزولی</SelectItem>
                                  </SelectContent>
                                </Select>
                                <button
                                  onClick={() => removeOrderBy(ob.uid)}
                                  className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                                 {/* ─── Actions: Preview + Save + Export + Print + Reset + Limit ─── */}
                  <Card className="border-gray-200">
                    <CardContent className="p-3">
                      <div className="space-y-3">
                        {/* ردیف اول: انتخاب حداکثر ردیف */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 whitespace-nowrap">حداکثر ردیف:</span>
                          <Select
                            value={String(limit)}
                            onValueChange={(v) => setLimit(Number(v))}
                          >
                            <SelectTrigger className="h-8 w-[100px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="50">۵۰</SelectItem>
                              <SelectItem value="100">۱۰۰</SelectItem>
                              <SelectItem value="500">۵۰۰</SelectItem>
                              <SelectItem value="1000">۱۰۰۰</SelectItem>
                              <SelectItem value="5000">۵۰۰۰</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* ردیف دوم: دکمه‌های اصلی (با grid responsive) */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                          <Button
                            onClick={handlePreview}
                            disabled={previewLoading || columns.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs h-9 w-full"
                          >
                            {previewLoading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                در حال اجرا...
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                پیش‌نمایش
                              </>
                            )}
                          </Button>

                          <Button
                            onClick={handleOpenSaveDialog}
                            disabled={columns.length === 0}
                            variant="outline"
                            className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1.5 text-xs h-9 w-full"
                          >
                            <Save className="w-3.5 h-3.5" />
                            ذخیره
                          </Button>

                          <Button
                            onClick={handleExportExcel}
                            disabled={previewRows.length === 0}
                            variant="outline"
                            className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5 text-xs h-9 w-full"
                            title="خروجی اکسل"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            اکسل
                          </Button>

                          <Button
                            onClick={handlePrint}
                            disabled={previewRows.length === 0}
                            variant="outline"
                            className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5 text-xs h-9 w-full"
                            title="چاپ / ذخیره پی‌دی‌اف"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            چاپ
                          </Button>

                          <Button
                            onClick={handleReset}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5 text-xs h-9 w-full col-span-2 sm:col-span-1"
                            title="پاک کردن همه چیز"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            پاک کردن
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ─── Preview Table (یکپارچه: راست به چپ + وسط‌چین) ─── */}
                  {(previewRows.length > 0 || previewMeta) && (
                    <Card className="border-gray-200">
                      <CardHeader className="p-3 pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-gray-600" />
                            نتایج گزارش
                            {reportTitle && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">
                                {reportTitle}
                              </Badge>
                            )}
                          </CardTitle>
                          {previewMeta && (
                            <div className="flex items-center gap-2">
                              <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[9px]">
                                {toFaNum(previewMeta.returnedRows)} ردیف
                              </Badge>
                              {previewMeta.executionTimeMs !== undefined && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">
                                  {toFaNum(previewMeta.executionTimeMs)} میلی‌ثانیه
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto" dir="rtl">
                          <Table>
                            <TableHeader className="sticky top-0 z-10">
                              <TableRow className="bg-gradient-to-l from-emerald-50 to-teal-50 hover:bg-emerald-50">
                                {previewColumns.map((col) => (
                                  <TableHead
                                    key={col.id}
                                    className="text-[11px] text-emerald-800 whitespace-nowrap text-center font-bold border-b-2 border-emerald-200 py-2.5 px-3"
                                  >
                                    {col.label}
                                    {col.isAggregate && col.aggregate && (
                                      <span className="mr-1.5 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md border border-emerald-200">
                                        {AGGREGATE_LABELS[col.aggregate] || col.aggregate}
                                      </span>
                                    )}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewRows.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={previewColumns.length || 1}
                                    className="text-center py-12 text-gray-400 text-xs"
                                  >
                                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                    داده‌ای یافت نشد
                                  </TableCell>
                                </TableRow>
                              ) : (
                                previewRows.map((row, rowIdx) => (
                                  <TableRow
                                    key={rowIdx}
                                    className={`transition-colors hover:bg-emerald-50/50 ${
                                      rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                                    }`}
                                  >
                                                                {previewColumns.map((col) => {
                                      const fieldDef = dataset?.fields.find(f => f.id === col.id)
                                      return (
                                        <TableCell
                                          key={col.id}
                                          className={`text-[11px] whitespace-nowrap text-center border-b border-gray-100 py-2 px-3 ${
                                            col.type === 'currency' || col.type === 'number'
                                              ? 'font-mono tabular-nums'
                                              : ''
                                          }`}
                                        >
                                          {formatCellValue(row[col.id], col.type, fieldDef)}
                                        </TableCell>
                                      )
                                    })}
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*  TAB: SAVED REPORTS */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'saved' && (
          <div className="space-y-4">
            {loadingSavedReports ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            ) : savedReports.length === 0 ? (
              <Card className="border-gray-200">
                <CardContent className="flex flex-col items-center justify-center py-24">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                    <FolderOpen className="w-8 h-8 text-gray-300" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">
                    هنوز گزارشی ذخیره نکرده‌اید
                  </h3>
                  <p className="text-xs text-gray-400 text-center max-w-sm mb-6">
                    با طراحی یک گزارش و کلیک روی «ذخیره»، می‌توانید آن را برای استفاده مجدد ذخیره کنید.
                  </p>
                  <Button
                    onClick={() => setActiveTab('designer')}
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-2 text-xs"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    شروع طراحی گزارش
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {savedReports.map((report) => (
                  <Card
                    key={report.id}
                    className="border-gray-200 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => handleOpenSavedReport(report.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                            {getDatasetIcon(report.datasetIcon)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-gray-800 truncate">
                              {report.name}
                            </h4>
                            <p className="text-[10px] text-gray-400 truncate">
                              {report.datasetLabel}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleFavorite(report.id, report.isFavorite)
                            }}
                            className={`p-1 rounded hover:bg-amber-100 ${
                              report.isFavorite ? 'text-amber-500' : 'text-gray-300'
                            }`}
                          >
                            {report.isFavorite ? (
                              <Star className="w-4 h-4 fill-current" />
                            ) : (
                              <StarOff className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteSavedReport(report.id)
                            }}
                            className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {report.description && (
                        <p className="text-[10px] text-gray-500 mb-3 line-clamp-2 leading-relaxed">
                          {report.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-gray-400">
                          به‌روزرسانی: {new Date(report.updatedAt).toLocaleDateString('fa-IR')}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-6 gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenSavedReport(report.id)
                          }}
                        >
                          <Eye className="w-3 h-3" />
                          باز کردن
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*  Save Report Dialog */}
        {/* ═══════════════════════════════════════════════════════ */}
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Save className="w-4 h-4 text-amber-600" />
                ذخیره گزارش
              </DialogTitle>
              <DialogDescription className="text-xs">
                یک نام برای گزارش خود انتخاب کنید تا بعداً بتوانید آن را باز کنید.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">
                  نام گزارش <span className="text-red-500">*</span>
                </label>
                <Input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="مثلاً: گزارش فروش ماهانه مشتریان"
                  className="text-sm"
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">
                  توضیحات (اختیاری)
                </label>
                <Textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="توضیح کوتاه درباره این گزارش..."
                  className="text-sm min-h-[70px]"
                  maxLength={500}
                />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-[10px] font-bold text-gray-500 mb-2">خلاصه گزارش:</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">
                    {dataset?.label || selectedDatasetId}
                  </Badge>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">
                    {toFaNum(columns.length)} ستون
                  </Badge>
                  {filters.length > 0 && (
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[9px]">
                      {toFaNum(filters.length)} فیلتر
                    </Badge>
                  )}
                  {groupBy.length > 0 && (
                    <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[9px]">
                      {toFaNum(groupBy.length)} گروه‌بندی
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setSaveDialogOpen(false)}
                disabled={saving}
                className="text-xs"
              >
                انصراف
              </Button>
              <Button
                onClick={handleSaveReport}
                disabled={saving || !reportTitle.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    در حال ذخیره...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {currentReportId ? 'به‌روزرسانی گزارش' : 'ذخیره گزارش'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  Drag Overlay */}
      {/* ═══════════════════════════════════════════════════════ */}
      <DragOverlay>
        {activeDragField ? (
          <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-300 rounded-md shadow-lg">
            <span className="text-blue-500">
              {getFieldTypeIcon(activeDragField.type)}
            </span>
            <p className="text-[11px] font-medium text-blue-700">
              {activeDragField.label}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}