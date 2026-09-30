'use client'

// ============================================================================
// src/components/check-printer/CheckPrinterModal.tsx — v8 (Per-Field Styling)
// ShopAccounting — مودال چاپ چک صیادی با تنظیم بصری + استایل اختصاصی هر فیلد
// ★ قابلیت‌ها:
// - کشیدن فیلدها با موس/لمس روی پیش‌نمایش
// - نمایش فاصله از چهار طرف به میلی‌متر
// - انتخاب هر فیلد و تغییر فونت/سایز/رنگ/وزن مخصوص همان فیلد
// - ذخیره خودکار قالب برای هر بانک
// - فقط ۵ مورد چاپ می‌شود
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Printer, CreditCard, Calendar, User, FileText, X, CheckCircle2,
  Loader2, Info, AlertTriangle, Settings2, Zap, Sparkles, Palette,
  SlidersHorizontal, RotateCcw, Hash,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { logger } from '@/lib/system-logger'
import { numberToWordsForCheck } from '@/lib/check-printer/number-to-words-fa'
import { SAYADI_PURPLE_TEMPLATE, type CheckField } from '@/lib/check-printer/sayadi-template'
import {
  loadCheckPrinterSettings,
  saveCheckPrinterSettings,
  getAllPrinterProfiles,
  PRINTER_PROFILES,
  AVAILABLE_FONTS,
  type PrinterType,
} from '@/lib/check-printer/printer-settings'

// ─── Types ───────────────────────────────────────────────────

export interface CheckPrintData {
  checkNumber?: string
  bankName?: string
  amount: number
  dueDate: string
  payee?: string
  description?: string
  transferable?: boolean
  invoiceNumber?: string
  supplierName?: string
  nationalId?: string
}

interface CheckPrinterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData: CheckPrintData | null
  onSuccess?: () => void
}

type FieldOverride = {
  x?: number
  y?: number
  fontFamily?: string
  fontSize?: number
  fontColor?: string
  fontWeight?: 'normal' | 'bold' | 'black'
}

type FieldOverrides = Record<string, FieldOverride>

// ─── Helpers ──────────────────────────────────────────────────

function toFaNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

function toEnNum(n: string): string {
  return n
    .replace(/[۰-۹]/g, (d) => String('۰۱۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

function formatNumber(n: number): string {
  if (isNaN(n)) return '۰'
  return toFaNum(n.toLocaleString('en-US'))
}

function mm(v: number): string {
  return `${Number(v).toFixed(1)}mm`
}

// ─── Persian Date Utilities ──────────────────────────────────

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  const days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * Math.floor(days / 12053)
  let d2 = days % 12053
  jy += 4 * Math.floor(d2 / 1461)
  d2 = d2 % 1461
  if (d2 > 365) { jy += Math.floor((d2 - 1) / 365); d2 = (d2 - 1) % 365 }
  const jm = d2 < 186 ? 1 + Math.floor(d2 / 31) : 7 + Math.floor((d2 - 186) / 30)
  const jd = 1 + (d2 < 186 ? d2 % 31 : (d2 - 186) % 30)
  return [jy, jm, jd]
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor((jy % 33 + 3) / 4) +
    78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * Math.floor(days / 146097)
  days = days % 146097
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524)
    days = days % 36524
    if (days >= 365) days++
  }
  gy += 4 * Math.floor(days / 1461)
  days = days % 1461
  if (days > 365) {
    gy += Math.floor((days - 1) / 365)
    days = (days - 1) % 365
  }
  let gd = days + 1
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm: number
  for (gm = 0; gm < 13; gm++) {
    if (gd <= sal_a[gm]) break
    gd -= sal_a[gm]
  }
  return [gy, gm, gd]
}

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const JALALI_DAY_ORDINALS = [
  'یکم', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم',
  'یازدهم', 'دوازدهم', 'سیزدهم', 'چهاردهم', 'پانزدهم', 'شانزدهم', 'هفدهم',
  'هجدهم', 'نوزدهم', 'بیستم', 'بیست و یکم', 'بیست و دوم', 'بیست و سوم',
  'بیست و چهارم', 'بیست و پنجم', 'بیست و ششم', 'بیست و هفتم', 'بیست و هشتم',
  'بیست و نهم', 'سی‌ام', 'سی و یکم'
]

function isoToJalaliParts(iso: string): { day: string; month: string; year: string } {
  if (!iso) return { day: '', month: '', year: '' }
  try {
    const parts = iso.split('-')
    if (parts.length !== 3) return { day: '', month: '', year: '' }
    const gy = parseInt(parts[0], 10)
    const gm = parseInt(parts[1], 10)
    const gd = parseInt(parts[2], 10)
    if (isNaN(gy) || isNaN(gm) || isNaN(gd)) return { day: '', month: '', year: '' }
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd)
    return {
      year: String(jy),
      month: String(jm).padStart(2, '0'),
      day: String(jd).padStart(2, '0'),
    }
  } catch {
    return { day: '', month: '', year: '' }
  }
}

function jalaliToISO(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
}

function jalaliDateToWordsFa(iso: string): string {
  const p = isoToJalaliParts(iso)
  if (!p.year) return ''
  const day = parseInt(p.day, 10)
  const month = parseInt(p.month, 10)
  const year = parseInt(p.year, 10)
  if (isNaN(day) || isNaN(month) || isNaN(year)) return ''
  const dayWord = JALALI_DAY_ORDINALS[day - 1] || String(day)
  const monthWord = `${JALALI_MONTHS[month - 1]}ماه`
  const yearWord = numberToWordsForCheck(year)
  return `${dayWord} ${monthWord} ${yearWord}`
}

// ─── Persian Date Picker ─────────────────────────────────────

function PersianDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const display = useMemo(() => {
    const p = isoToJalaliParts(value)
    if (!p.year) return ''
    return `${toFaNum(p.year)}/${toFaNum(p.month)}/${toFaNum(p.day)}`
  }, [value])

  const todayJalali = useMemo(() => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return {
      jy,
      jm,
      jd,
      iso: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    }
  }, [])

  const initial = useMemo(() => {
    const p = isoToJalaliParts(value)
    if (p.year) return { jy: parseInt(p.year, 10), jm: parseInt(p.month, 10) }
    return { jy: todayJalali.jy, jm: todayJalali.jm }
  }, [value, todayJalali])

  const [vy, setVy] = useState(initial.jy)
  const [vm, setVm] = useState(initial.jm)

  useEffect(() => {
    const p = isoToJalaliParts(value)
    if (p.year) {
      setVy(parseInt(p.year, 10))
      setVm(parseInt(p.month, 10))
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const daysInMonth = vm <= 6 ? 31 : vm <= 11 ? 30 : 29
  const [fy, fm, fd] = jalaliToGregorian(vy, vm, 1)
  const firstDay = (new Date(fy, fm - 1, fd).getDay() + 1) % 7

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selected = isoToJalaliParts(value)

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen((o) => !o)}
        className="w-full h-8 px-2 rounded border border-gray-300 bg-white flex items-center justify-between gap-1.5 cursor-pointer hover:border-purple-400 transition-colors"
      >
        <span className="text-xs font-mono" dir="ltr">
          {display || <span className="text-gray-400">{placeholder}</span>}
        </span>
        <Calendar className="w-3.5 h-3.5 text-purple-500" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-2 right-0">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => {
                if (vm === 1) {
                  setVm(12)
                  setVy((y) => y - 1)
                } else setVm((m) => m - 1)
              }}
              className="p-1 hover:bg-gray-100 rounded text-sm"
            >
              ‹
            </button>
            <span className="text-xs font-bold text-gray-800">
              {JALALI_MONTHS[vm - 1]} {toFaNum(vy)}
            </span>
            <button
              type="button"
              onClick={() => {
                if (vm === 12) {
                  setVm(1)
                  setVy((y) => y + 1)
                } else setVm((m) => m + 1)
              }}
              className="p-1 hover:bg-gray-100 rounded text-sm"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d, i) => (
              <div key={i} className="text-[9px] text-center text-gray-500 py-0.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />
              const isSel = Boolean(
                selected &&
                Number(selected.year) === vy &&
                Number(selected.month) === vm &&
                Number(selected.day) === d
              )
              const isToday = todayJalali.jy === vy && todayJalali.jm === vm && todayJalali.jd === d
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(jalaliToISO(vy, vm, d))
                    setOpen(false)
                  }}
                  className={`h-6 text-[11px] rounded ${isSel
                    ? 'bg-purple-600 text-white font-bold'
                    : isToday
                      ? 'bg-purple-100 text-purple-700 font-bold'
                      : 'hover:bg-gray-100 text-gray-700'
                    }`}
                >
                  {toFaNum(d)}
                </button>
              )
            })}
          </div>

          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                onChange(todayJalali.iso)
                setOpen(false)
              }}
              className="text-[10px] text-purple-600 hover:text-purple-700"
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-gray-500 hover:text-gray-700"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export function CheckPrinterModal({
  open,
  onOpenChange,
  initialData,
  onSuccess,
}: CheckPrinterModalProps) {
  const { toast } = useToast()

  const CHECK_W = SAYADI_PURPLE_TEMPLATE.width
  const CHECK_H = SAYADI_PURPLE_TEMPLATE.height
  const SCALE = 3.2

  const [checkNumber, setCheckNumber] = useState('')
  const [bankName, setBankName] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [amountInput, setAmountInput] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [payee, setPayee] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [description, setDescription] = useState('')
  const [transferable, setTransferable] = useState(false)

  const [settings, setSettings] = useState(loadCheckPrinterSettings())
  const [printing, setPrinting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'position'>('appearance')
  const [mounted, setMounted] = useState(false)

  // ★ Visual calibration + per-field styling
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({})
  const overridesRef = useRef<FieldOverrides>(fieldOverrides)
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    overridesRef.current = fieldOverrides
  }, [fieldOverrides])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open && initialData) {
      setCheckNumber(initialData.checkNumber || '')
      setBankName(initialData.bankName || '')
      setAmount(initialData.amount || 0)
      setAmountInput(initialData.amount ? formatNumber(initialData.amount) : '')
      setDueDate(initialData.dueDate || '')
      setPayee(initialData.payee || '')
      setNationalId(initialData.nationalId || '')
      setDescription(initialData.description || '')
      setTransferable(initialData.transferable ?? false)
    }
  }, [open, initialData])

  useEffect(() => {
    if (open) {
      setSettings(loadCheckPrinterSettings())
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setDraggedFieldId(null)
      setSelectedFieldId(null)
      dragCleanupRef.current?.()
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onOpenChange])

  const getBankKey = useCallback((name?: string) => {
    return (name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]/gu, '') || 'default'
  }, [])

  const templateStorageKey = useCallback((name?: string) => {
    return `sayadi_template_overrides_${getBankKey(name)}`
  }, [getBankKey])

  // Load saved template overrides for current bank
  useEffect(() => {
    if (!open) return

    const key = templateStorageKey(bankName)

    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        setFieldOverrides({})
        overridesRef.current = {}
        return
      }

      const parsed = JSON.parse(raw)
      const clean: FieldOverrides = {}

      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([id, value]) => {
          if (!value || typeof value !== 'object') return

          const v = value as any
          const override: FieldOverride = {}

          if (Number.isFinite(v.x)) override.x = Number(v.x)
          if (Number.isFinite(v.y)) override.y = Number(v.y)

          if (typeof v.fontFamily === 'string' && v.fontFamily.trim()) {
            override.fontFamily = v.fontFamily
          }

          if (Number.isFinite(v.fontSize)) {
            override.fontSize = Number(v.fontSize)
          }

          if (typeof v.fontColor === 'string' && /^#[0-9a-f]{6}$/i.test(v.fontColor)) {
            override.fontColor = v.fontColor
          }

          if (v.fontWeight === 'normal' || v.fontWeight === 'bold' || v.fontWeight === 'black') {
            override.fontWeight = v.fontWeight
          }

          if (Object.keys(override).length > 0) {
            clean[id] = override
          }
        })
      }

      setFieldOverrides(clean)
      overridesRef.current = clean
    } catch {
      setFieldOverrides({})
      overridesRef.current = {}
    }
  }, [open, bankName, templateStorageKey])

  const setFieldOverride = useCallback((
    fieldId: string,
    patch: Partial<FieldOverride>,
    persist = true
  ) => {
    setFieldOverrides((prev) => {
      const next: FieldOverrides = {
        ...prev,
        [fieldId]: {
          ...prev[fieldId],
          ...patch,
        },
      }

      overridesRef.current = next

      if (persist) {
        try {
          localStorage.setItem(templateStorageKey(bankName), JSON.stringify(next))
        } catch (err) {
          console.error('[CheckPrinter] Persist override error:', err)
        }
      }

      return next
    })
  }, [bankName, templateStorageKey])

  const saveOverrides = useCallback(() => {
    try {
      localStorage.setItem(templateStorageKey(bankName), JSON.stringify(overridesRef.current))
      toast({
        title: '✓ قالب ذخیره شد',
        description: `مختصات و استایل چاپ برای بانک «${bankName || 'پیش‌فرض'}» ذخیره شد.`,
      })
    } catch (err) {
      console.error('[CheckPrinter] Save template error:', err)
    }
  }, [bankName, templateStorageKey, toast])

  const resetOverrides = useCallback(() => {
    const key = templateStorageKey(bankName)
    localStorage.removeItem(key)
    setFieldOverrides({})
    overridesRef.current = {}
    setSelectedFieldId(null)
    toast({
      title: '✓ قالب بازنشانی شد',
      description: 'همه مختصات و استایل‌ها به حالت پیش‌فرض برگشتند.',
    })
  }, [bankName, templateStorageKey, toast])

  const resetFieldStyle = useCallback((fieldId: string) => {
    setFieldOverrides((prev) => {
      const current = prev[fieldId] || {}
      const positionOnly: FieldOverride = {}

      if (typeof current.x === 'number') positionOnly.x = current.x
      if (typeof current.y === 'number') positionOnly.y = current.y

      const next: FieldOverrides = { ...prev }

      if (Object.keys(positionOnly).length > 0) {
        next[fieldId] = positionOnly
      } else {
        delete next[fieldId]
      }

      overridesRef.current = next

      try {
        localStorage.setItem(templateStorageKey(bankName), JSON.stringify(next))
      } catch (err) {
        console.error('[CheckPrinter] Reset field style error:', err)
      }

      return next
    })

    toast({
      title: '✓ استایل فیلد بازنشانی شد',
      description: 'فونت، سایز، رنگ و وزن این فیلد به حالت پیش‌فرض برگشت.',
    })
  }, [bankName, templateStorageKey, toast])

  const amountWords = useMemo(() => (amount > 0 ? numberToWordsForCheck(amount) : ''), [amount])
  const dateWords = useMemo(() => jalaliDateToWordsFa(dueDate), [dueDate])

  const currentProfile = useMemo(() => {
    return settings.profiles[settings.selectedPrinter] || PRINTER_PROFILES.laser_a4
  }, [settings])

  const updateCurrentProfile = useCallback((patch: Record<string, any>) => {
    setSettings((prev) => {
      const current = prev.profiles[prev.selectedPrinter] || PRINTER_PROFILES[prev.selectedPrinter]
      const newSettings = {
        ...prev,
        profiles: {
          ...prev.profiles,
          [prev.selectedPrinter]: {
            ...PRINTER_PROFILES[prev.selectedPrinter],
            ...current,
            ...patch,
          },
        },
      }
      setTimeout(() => saveCheckPrinterSettings(newSettings), 0)
      return newSettings
    })
  }, [])

  const handleAmountChange = useCallback((value: string) => {
    const englishDigits = toEnNum(value).replace(/[,،\s]/g, '')
    setAmountInput(value)
    const parsed = parseFloat(englishDigits)
    setAmount(isNaN(parsed) ? 0 : parsed)
  }, [])

  const handlePrinterChange = useCallback((type: PrinterType) => {
    const newSettings = { ...settings, selectedPrinter: type }
    setSettings(newSettings)
    saveCheckPrinterSettings(newSettings)
  }, [settings])

  const handleResetProfile = useCallback(() => {
    const defaults = PRINTER_PROFILES[settings.selectedPrinter]
    updateCurrentProfile({
      offsetX: defaults.offsetX,
      offsetY: defaults.offsetY,
      scale: defaults.scale,
      fontFamily: defaults.fontFamily,
      fontScale: defaults.fontScale,
      fontColor: defaults.fontColor,
      fontWeight: defaults.fontWeight,
    })
    toast({ title: '✓ بازنشانی شد' })
  }, [settings.selectedPrinter, updateCurrentProfile, toast])

  const handlePrint = useCallback(async () => {
    if (!amount || amount <= 0) {
      toast({ title: 'خطا', description: 'مبلغ چک الزامی است', variant: 'destructive' })
      return
    }
    if (!dueDate) {
      toast({ title: 'خطا', description: 'تاریخ سررسید الزامی است', variant: 'destructive' })
      return
    }
    if (!payee.trim()) {
      toast({ title: 'خطا', description: 'نام گیرنده (در وجه) الزامی است', variant: 'destructive' })
      return
    }

    setPrinting(true)
    try {
      logger.info('چاپ چک صیادی', {
        checkNumber,
        bankName,
        amount,
        amountWords,
        dueDate,
        payee: payee.trim(),
        nationalId,
        description: description.trim(),
        transferable,
        printerType: settings.selectedPrinter,
        invoiceNumber: initialData?.invoiceNumber,
      })

      await new Promise((r) => setTimeout(r, 200))
      window.print()

      toast({
        title: '✓ دستور چاپ ارسال شد',
        description: `چک به مبلغ ${formatNumber(amount)} ریال در صف چاپ قرار گرفت.`,
      })

      onSuccess?.()
      setTimeout(() => onOpenChange(false), 500)
    } catch (err: any) {
      console.error('[CheckPrinter] Print error:', err)
      toast({
        title: 'خطا در چاپ',
        description: err?.message || 'خطای ناشناخته',
        variant: 'destructive',
      })
    } finally {
      setPrinting(false)
    }
  }, [
    amount, dueDate, payee, checkNumber, bankName, amountWords, nationalId,
    description, transferable, settings.selectedPrinter, initialData,
    toast, onSuccess, onOpenChange,
  ])

  const renderFieldValue = useCallback((field: CheckField): string => {
    switch (field.id) {
      case 'date_words':
        return dateWords
      case 'amount_words':
        return amountWords ? `${amountWords} ریال` : ''
      case 'payee':
        return payee.trim()
      case 'national_id':
        return toEnNum(nationalId).replace(/\D/g, '')
      case 'amount_number':
        return String(Math.round(amount)).replace(/\D/g, '')
      default:
        return ''
    }
  }, [dateWords, amountWords, payee, nationalId, amount])

  const effectiveFields = useMemo(() => {
    return SAYADI_PURPLE_TEMPLATE.fields.map((field) => {
      const override = fieldOverrides[field.id]
      if (override) {
        return {
          ...field,
          x: typeof override.x === 'number' ? override.x : field.x,
          y: typeof override.y === 'number' ? override.y : field.y,
        }
      }
      return field
    })
  }, [fieldOverrides])

  const getFieldStyle = useCallback((field: CheckField) => {
    const o = fieldOverrides[field.id]

    const weightKey = o?.fontWeight || currentProfile.fontWeight
    const fontWeightNum = weightKey === 'bold'
      ? '700'
      : weightKey === 'black'
        ? '900'
        : '400'

    const fontSize = typeof o?.fontSize === 'number'
      ? o.fontSize
      : field.fontSize * (currentProfile.fontScale || 1)

    return {
      fontFamily: o?.fontFamily || currentProfile.fontFamily,
      fontSize,
      fontColor: o?.fontColor || currentProfile.fontColor,
      fontWeight: weightKey,
      fontWeightNum,
    }
  }, [fieldOverrides, currentProfile])

  const getFieldBox = useCallback((field: CheckField, value: string) => {
    if (field.type === 'digits') {
      const digitCount = value ? value.replace(/\D/g, '').length : (field.maxDigits || 15)
      const dw = field.digitWidth || 4
      const dh = field.digitHeight || field.height || 6
      return {
        width: dw * Math.max(1, digitCount),
        height: dh,
      }
    }

    return {
      width: field.width,
      height: field.height || 6,
    }
  }, [])

  const getMeasurements = useCallback((field: CheckField, boxW: number, boxH: number) => {
    const left = field.x
    const top = field.y
    const right = CHECK_W - (field.x + boxW)
    const bottom = CHECK_H - (field.y + boxH)
    return { left, top, right, bottom }
  }, [CHECK_W, CHECK_H])

  const startDrag = useCallback((
    event: React.MouseEvent,
    field: CheckField,
    boxW: number,
    boxH: number
  ) => {
    event.preventDefault()
    event.stopPropagation()

    setSelectedFieldId(field.id)
    setDraggedFieldId(field.id)

    const startX = event.clientX
    const startY = event.clientY
    const initialX = field.x
    const initialY = field.y

    const minX = -10
    const minY = -10
    const maxX = Math.max(minX, CHECK_W - boxW)
    const maxY = Math.max(minY, CHECK_H - boxH)

    let moved = false

    const handleMove = (moveEvent: MouseEvent) => {
      moved = true

      const dxPixels = moveEvent.clientX - startX
      const dyPixels = moveEvent.clientY - startY

      const dxMm = dxPixels / SCALE
      const dyMm = dyPixels / SCALE

      const newX = Math.min(maxX, Math.max(minX, initialX + dxMm))
      const newY = Math.min(maxY, Math.max(minY, initialY + dyMm))

      setFieldOverride(field.id, { x: newX, y: newY }, false)
    }

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', cleanup)
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null
      setDraggedFieldId(null)
      if (moved) saveOverrides()
    }

    dragCleanupRef.current = cleanup
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', cleanup)
  }, [CHECK_W, CHECK_H, SCALE, saveOverrides, setFieldOverride])

  const startTouchDrag = useCallback((
    event: React.TouchEvent,
    field: CheckField,
    boxW: number,
    boxH: number
  ) => {
    const touch = event.touches[0]
    if (!touch) return

    setSelectedFieldId(field.id)
    setDraggedFieldId(field.id)

    const startX = touch.clientX
    const startY = touch.clientY
    const initialX = field.x
    const initialY = field.y

    const minX = -10
    const minY = -10
    const maxX = Math.max(minX, CHECK_W - boxW)
    const maxY = Math.max(minY, CHECK_H - boxH)

    let moved = false

    const handleMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault()
      const t = moveEvent.touches[0]
      if (!t) return

      moved = true

      const dxPixels = t.clientX - startX
      const dyPixels = t.clientY - startY

      const dxMm = dxPixels / SCALE
      const dyMm = dyPixels / SCALE

      const newX = Math.min(maxX, Math.max(minX, initialX + dxMm))
      const newY = Math.min(maxY, Math.max(minY, initialY + dyMm))

      setFieldOverride(field.id, { x: newX, y: newY }, false)
    }

    const cleanup = () => {
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', cleanup)
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null
      setDraggedFieldId(null)
      if (moved) saveOverrides()
    }

    dragCleanupRef.current = cleanup
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchend', cleanup)
  }, [CHECK_W, CHECK_H, SCALE, saveOverrides, setFieldOverride])

  const isDraggingField = useCallback((id: string) => draggedFieldId === id, [draggedFieldId])

  const renderTextContent = useCallback((
    field: CheckField,
    value: string,
    mode: 'preview' | 'print',
    style: ReturnType<typeof getFieldStyle>
  ) => {
    if (!value) {
      if (mode === 'print') return null
      return (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-purple-300 text-[8px]">({field.label})</span>
        </div>
      )
    }

    const fontSize = mode === 'preview'
      ? style.fontSize * SCALE * 0.35
      : `${style.fontSize}pt`

    return (
      <div
        className="w-full h-full flex items-center overflow-hidden"
        style={{
          justifyContent:
            field.align === 'right' ? 'flex-end' :
              field.align === 'left' ? 'flex-start' :
                'center',
        }}
      >
        <span
          style={{
            width: '100%',
            textAlign: field.align,
            direction: 'rtl',
            unicodeBidi: 'plaintext',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize,
            fontFamily: style.fontFamily,
            color: style.fontColor,
            fontWeight: style.fontWeight,
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
      </div>
    )
  }, [SCALE, getFieldStyle])

  const renderDigitsContent = useCallback((
    field: CheckField,
    value: string,
    mode: 'preview' | 'print',
    style: ReturnType<typeof getFieldStyle>
  ) => {
    const digits = value.replace(/\D/g, '').split('')

    if (!digits.length) {
      if (mode === 'print') return null
      return (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-purple-300 text-[8px]">({field.label})</span>
        </div>
      )
    }

    const dw = field.digitWidth || 4
    const dh = field.digitHeight || field.height || 6
    const fontSize = mode === 'preview'
      ? style.fontSize * SCALE * 0.35
      : `${style.fontSize}pt`

    return (
      <div className="relative w-full h-full">
        {digits.map((digit, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: mode === 'preview' ? i * dw * SCALE : `${i * dw}mm`,
              top: 0,
              width: mode === 'preview' ? dw * SCALE : `${dw}mm`,
              height: mode === 'preview' ? dh * SCALE : `${dh}mm`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize,
              fontFamily: style.fontFamily,
              color: style.fontColor,
              fontWeight: style.fontWeight,
              lineHeight: 1,
              direction: 'ltr',
              border: mode === 'preview' ? '0.5px dashed rgba(168, 85, 247, 0.35)' : 'none',
            }}
          >
            {toFaNum(digit)}
          </div>
        ))}
      </div>
    )
  }, [SCALE, getFieldStyle])

  const renderFieldContent = useCallback((
    field: CheckField,
    value: string,
    mode: 'preview' | 'print',
    style: ReturnType<typeof getFieldStyle>
  ) => {
    if (field.type === 'digits') {
      return renderDigitsContent(field, value, mode, style)
    }
    return renderTextContent(field, value, mode, style)
  }, [renderDigitsContent, renderTextContent])

  const previewWidth = CHECK_W * SCALE
  const previewHeight = CHECK_H * SCALE

  const selectedField = useMemo(() => {
    if (!selectedFieldId) return null
    return effectiveFields.find((f) => f.id === selectedFieldId) || null
  }, [selectedFieldId, effectiveFields])

  const selectedOverride = selectedField ? fieldOverrides[selectedField.id] : undefined
  const selectedStyle = selectedField ? getFieldStyle(selectedField) : null

  const fontVarStyle = {
    ['--check-font-family' as any]: currentProfile.fontFamily,
    ['--check-font-color' as any]: currentProfile.fontColor,
    ['--check-font-weight' as any]:
      currentProfile.fontWeight === 'normal' ? '400' :
        currentProfile.fontWeight === 'bold' ? '700' : '900',
  }

  if (!mounted || !open) return null

  return createPortal(
    <>
      <style>{`
        .check-print-area {
          position: fixed !important;
          left: -99999px !important;
          top: -99999px !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          z-index: -9999 !important;
        }

        .check-print-font-area,
        .check-print-font-area * {
          font-family: var(--check-font-family, Tahoma, Arial, sans-serif) !important;
          color: var(--check-font-color, #000000) !important;
          font-weight: var(--check-font-weight, 400) !important;
        }

        /* ★ استایل اختصاصی هر فیلد با اولویت بالاتر */
        .check-print-font-area .check-field-wrapper,
        .check-print-font-area .check-field-wrapper * {
          font-family: var(--field-font-family, var(--check-font-family, Tahoma, Arial, sans-serif)) !important;
          color: var(--field-font-color, var(--check-font-color, #000000)) !important;
          font-weight: var(--field-font-weight, var(--check-font-weight, 400)) !important;
        }

        /* ★ استثنای تولتیپ اندازه‌ها */
        .check-print-font-area .check-field-wrapper .check-measure-tooltip,
        .check-print-font-area .check-field-wrapper .check-measure-tooltip * {
          color: #ffffff !important;
          font-family: Tahoma, Arial, sans-serif !important;
          font-weight: 400 !important;
          background: transparent !important;
        }

        .check-print-font-area .check-field-wrapper .check-measure-tooltip {
          background: rgba(17, 24, 39, 0.94) !important;
          border: 1px solid rgba(255, 255, 255, 0.18) !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28) !important;
          line-height: 1.35 !important;
          direction: ltr !important;
          unicode-bidi: isolate !important;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          .check-print-area,
          .check-print-area * {
            visibility: visible !important;
            opacity: 1 !important;
          }

          .check-print-area {
            position: absolute !important;
            left: ${currentProfile.offsetX}mm !important;
            top: ${currentProfile.offsetY}mm !important;
            width: ${SAYADI_PURPLE_TEMPLATE.width}mm !important;
            height: ${SAYADI_PURPLE_TEMPLATE.height}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: scale(${currentProfile.scale}) !important;
            transform-origin: top left !important;
            z-index: 99999 !important;
          }

          .check-print-area .check-field {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: auto;
            margin: 0 !important;

            @top-left-corner { content: ""; }
            @top-left        { content: ""; }
            @top-center      { content: ""; }
            @top-right       { content: ""; }
            @top-right-corner{ content: ""; }

            @bottom-left-corner { content: ""; }
            @bottom-left        { content: ""; }
            @bottom-center      { content: ""; }
            @bottom-right       { content: ""; }
            @bottom-right-corner{ content: ""; }
          }

          html, body {
            background: white !important;
            width: 100% !important;
            height: auto !important;
            overflow: hidden !important;
          }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Overlay */}
      <div
        className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
        onClick={() => !printing && onOpenChange(false)}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center p-2"
        dir="rtl"
        style={{ animation: 'slideUp 0.25s ease-out' }}
      >
        <div
          className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: 'min(1100px, 96vw)', maxHeight: '94vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-3 py-2 border-b border-gray-100 bg-gradient-to-l from-purple-50 to-white"
            style={{ flexShrink: 0 }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold flex items-center gap-2 flex-wrap">
                    صدور و چاپ چک صیادی
                    <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-[8px]">
                      ۱۷۰×۸۷mm
                    </Badge>
                  </h2>
                  <p className="text-[10px] text-gray-500">
                    تنظیم بصری + استایل اختصاصی هر فیلد
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  onClick={() => setShowSettings((v) => !v)}
                  className={`text-[10px] gap-1 h-7 transition-all ${showSettings
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'
                    }`}
                >
                  <Settings2 className="w-3 h-3" />
                  <span className="hidden xs:inline">{showSettings ? 'بستن' : 'تنظیمات'}</span>
                </Button>

                <button
                  onClick={() => !printing && onOpenChange(false)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto" style={{ flex: '1 1 auto', minHeight: 0 }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
              {/* Right: Form */}
              <div className="space-y-2.5">
                <div className="bg-purple-50/50 border border-purple-200 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-purple-500 flex items-center justify-center">
                      <CreditCard className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-xs font-bold text-purple-900">مشخصات چک (فقط برای اطلاع)</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[9px]">شماره چک</Label>
                      <Input
                        value={checkNumber}
                        onChange={(e) => setCheckNumber(e.target.value)}
                        placeholder="شناسه ۱۶ رقمی"
                        className="text-[10px] h-7 mt-0.5 font-mono"
                        dir="ltr"
                      />
                      <p className="text-[8px] text-gray-400 mt-0.5">چاپ نمی‌شود</p>
                    </div>
                    <div>
                      <Label className="text-[9px]">نام بانک</Label>
                      <Input
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="بانک تجارت"
                        className="text-[10px] h-7 mt-0.5"
                      />
                      <p className="text-[8px] text-gray-400 mt-0.5">برای ذخیره قالب هر بانک</p>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center">
                      <Zap className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-xs font-bold text-emerald-900">مبلغ چک</h3>
                  </div>
                  <div>
                    <Label className="text-[9px]">
                      مبلغ (ریال) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={amountInput}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="۱۵,۰۰۰,۰۰۰"
                      className="text-xs h-8 mt-0.5 font-mono font-bold text-emerald-700"
                      dir="ltr"
                    />
                    {amount > 0 && (
                      <div className="mt-1.5 p-1.5 bg-white border border-emerald-200 rounded">
                        <div className="flex items-start gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-gray-800 leading-relaxed break-words">
                            <span className="text-[9px] text-gray-500">به حروف: </span>
                            {amountWords} ریال
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center">
                      <Calendar className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-xs font-bold text-blue-900">تاریخ و گیرنده</h3>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-[9px]">
                        تاریخ سررسید <span className="text-red-500">*</span>
                      </Label>
                      <div className="mt-0.5">
                        <PersianDatePicker value={dueDate} onChange={setDueDate} placeholder="انتخاب تاریخ" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[9px]">
                        <User className="w-3 h-3 inline ml-1" />
                        در وجه <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={payee}
                        onChange={(e) => setPayee(e.target.value)}
                        placeholder="نام شخص یا شرکت"
                        className="text-[10px] h-7 mt-0.5"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50/50 border border-orange-200 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-orange-500 flex items-center justify-center">
                      <Hash className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-xs font-bold text-orange-900">کد ملی / شناسه ملی</h3>
                  </div>
                  <div>
                    <Label className="text-[9px]">
                      کد ملی گیرنده (۱۰ رقم) یا شناسه ملی شرکت (۱۱ رقم)
                    </Label>
                    <Input
                      value={nationalId}
                      onChange={(e) => {
                        const v = toEnNum(e.target.value).replace(/\D/g, '').slice(0, 11)
                        setNationalId(v)
                      }}
                      placeholder="۰۰۱۳۴۵۶۷۸"
                      maxLength={11}
                      className="text-[10px] h-7 mt-0.5 font-mono"
                      dir="ltr"
                    />
                    <p className="text-[8px] text-gray-400 mt-0.5">
                      {nationalId.length === 0
                        ? 'اختیاری'
                        : nationalId.length === 10
                          ? 'کد ملی حقیقی ✓'
                          : nationalId.length === 11
                            ? 'شناسه ملی حقوقی ✓'
                            : `${toFaNum(11 - nationalId.length)} رقم دیگر`}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                  <Label className="text-[9px]">
                    <FileText className="w-3 h-3 inline ml-1" />
                    بابت (اختیاری)
                  </Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="خرید کالا، بدهی و ..."
                    className="text-[10px] h-7 mt-0.5"
                  />
                </div>
              </div>

              {/* Left: Preview + Per-field styling + Settings */}
              <div className="space-y-2.5">
                <div className="bg-white border border-gray-200 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      پیش‌نمایش زنده (قابل تنظیم)
                    </h3>
                    <button
                      onClick={resetOverrides}
                      className="text-[9px] text-gray-500 hover:text-red-600 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100"
                      title="بازنشانی کامل قالب این بانک"
                    >
                      <RotateCcw className="w-3 h-3" />
                      بازنشانی قالب
                    </button>
                  </div>

                  <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded mb-2">
                    <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-[9px] text-blue-800 leading-relaxed">
                      فیلد را با موس بگیرید و جابجا کنید. برای تغییر فونت/سایز/رنگ همان فیلد، روی آن کلیک کنید تا انتخاب شود.
                    </p>
                  </div>

                  <div className="bg-gray-100 p-2 rounded overflow-auto">
                    <div
                      className="check-print-font-area relative mx-auto shadow-lg select-none"
                      style={{
                        width: previewWidth,
                        height: previewHeight,
                        background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 50%, #ddd6fe 100%)',
                        border: '1.5px solid #a855f7',
                        borderRadius: 4,
                        minWidth: previewWidth,
                        ...fontVarStyle,
                      }}
                    >
                      {effectiveFields.map((field) => {
                        const value = renderFieldValue(field)
                        const box = getFieldBox(field, value)
                        const measurements = getMeasurements(field, box.width, box.height)
                        const style = getFieldStyle(field)
                        const isSelected = selectedFieldId === field.id
                        const isDragging = isDraggingField(field.id)

                        return (
                          <div
                            key={field.id}
                            className="check-field-wrapper absolute cursor-move z-10"
                            onMouseDown={(e) => startDrag(e, field, box.width, box.height)}
                            onTouchStart={(e) => startTouchDrag(e, field, box.width, box.height)}
                            style={{
                              left: field.x * SCALE,
                              top: field.y * SCALE,
                              width: box.width * SCALE,
                              height: box.height * SCALE,
                              touchAction: 'none',
                              ['--field-font-family' as any]: style.fontFamily,
                              ['--field-font-color' as any]: style.fontColor,
                              ['--field-font-weight' as any]: style.fontWeightNum,
                              backgroundColor: isDragging
                                ? 'rgba(239, 68, 68, 0.08)'
                                : isSelected
                                  ? 'rgba(239, 68, 68, 0.04)'
                                  : 'rgba(168, 85, 247, 0.04)',
                              outline: isDragging
                                ? '2px solid #ef4444'
                                : isSelected
                                  ? '1.5px solid #ef4444'
                                  : '1px dashed transparent',
                            }}
                          >
                            {renderFieldContent(field, value, 'preview', style)}

                            {isDragging && (
                              <div
                                className="check-measure-tooltip absolute -top-11 right-0 text-[9px] px-2 py-1.5 rounded-md z-50 pointer-events-none min-w-[118px] max-w-[170px]"
                                dir="ltr"
                              >
                                <div className="flex justify-between gap-2">
                                  <span>L:</span>
                                  <span className="font-mono">{mm(measurements.left)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <span>R:</span>
                                  <span className="font-mono">{mm(measurements.right)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <span>T:</span>
                                  <span className="font-mono">{mm(measurements.top)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <span>B:</span>
                                  <span className="font-mono">{mm(measurements.bottom)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Decorative signature area */}
                      <div className="absolute bottom-1.5 left-3 right-3 flex items-end justify-between pointer-events-none">
                        <div className="flex-1">
                          <div className="border-b border-dashed border-purple-400 h-3" />
                          <p className="text-[7px] text-purple-600 mt-0.5">امضاء</p>
                        </div>
                        <div className="w-16 text-center mr-2">
                          <div className="border-b border-dashed border-purple-400 h-3" />
                          <p className="text-[7px] text-purple-600 mt-0.5">مهر</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ★ Per-field styling panel */}
                  {selectedField && selectedStyle && (
                    <div className="mt-2 p-2 bg-white border border-red-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-gray-800 flex items-center gap-1">
                          <Palette className="w-3 h-3 text-red-500" />
                          تنظیمات فیلد: {selectedField.label}
                        </h4>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => resetFieldStyle(selectedField.id)}
                            className="text-[9px] text-gray-500 hover:text-red-600 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100"
                            title="بازنشانی فقط استایل همین فیلد"
                          >
                            <RotateCcw className="w-3 h-3" />
                            پیش‌فرض
                          </button>
                          <button
                            onClick={() => setSelectedFieldId(null)}
                            className="p-1 rounded hover:bg-gray-100"
                            title="بستن"
                          >
                            <X className="w-3 h-3 text-gray-500" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[9px] mb-0.5 block">فونت</Label>
                          <select
                            value={selectedOverride?.fontFamily || ''}
                            onChange={(e) =>
                              setFieldOverride(
                                selectedField.id,
                                { fontFamily: e.target.value || undefined },
                                true
                              )
                            }
                            className="w-full h-7 text-[10px] bg-white border border-gray-300 rounded px-1.5"
                          >
                            <option value="">پیش‌فرض مودال</option>
                            {AVAILABLE_FONTS.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label className="text-[9px] mb-0.5 block">وزن فونت</Label>
                          <select
                            value={selectedOverride?.fontWeight || ''}
                            onChange={(e) =>
                              setFieldOverride(
                                selectedField.id,
                                { fontWeight: (e.target.value || undefined) as FieldOverride['fontWeight'] },
                                true
                              )
                            }
                            className="w-full h-7 text-[10px] bg-white border border-gray-300 rounded px-1.5"
                          >
                            <option value="">پیش‌فرض</option>
                            <option value="normal">معمولی</option>
                            <option value="bold">ضخیم</option>
                            <option value="black">خیلی ضخیم</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <Label className="text-[9px] mb-0.5 block">رنگ متن</Label>
                          <div className="flex items-center gap-1">
                            <input
                              type="color"
                              value={selectedOverride?.fontColor || currentProfile.fontColor}
                              onChange={(e) =>
                                setFieldOverride(selectedField.id, { fontColor: e.target.value }, true)
                              }
                              className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0.5"
                            />
                            <span className="text-[9px] font-mono text-gray-600" dir="ltr">
                              {selectedOverride?.fontColor || currentProfile.fontColor}
                            </span>
                          </div>
                        </div>

                        <div>
                          <Label className="text-[9px] mb-0.5 block">
                            اندازه فونت: {toFaNum(selectedStyle.fontSize.toFixed(1))}pt
                          </Label>
                          <input
                            type="range"
                            min={4}
                            max={24}
                            step={0.5}
                            value={selectedStyle.fontSize}
                            onChange={(e) =>
                              setFieldOverride(
                                selectedField.id,
                                { fontSize: parseFloat(e.target.value) },
                                true
                              )
                            }
                            className="w-full h-1.5 accent-red-500 mt-1.5"
                          />
                        </div>
                      </div>

                      <p className="text-[8px] text-gray-500 mt-2 leading-relaxed">
                        💡 این تنظیمات فقط برای همین فیلد و همین بانک ذخیره می‌شود. اگر خواستید به حالت کلی برگردد، دکمه «پیش‌فرض» را بزنید.
                      </p>
                    </div>
                  )}

                  <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded grid grid-cols-3 gap-1.5">
                    <div className="text-center">
                      <p className="text-[8px] text-gray-500">مبلغ</p>
                      <p className="text-[9px] font-bold text-gray-900 truncate" dir="ltr">
                        {amount ? formatNumber(amount) : '—'}
                      </p>
                    </div>
                    <div className="text-center border-x border-purple-200">
                      <p className="text-[8px] text-gray-500">گیرنده</p>
                      <p className="text-[9px] font-medium text-gray-900 truncate">{payee || '—'}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] text-gray-500">سررسید</p>
                      <p className="text-[9px] font-medium text-gray-900 truncate">
                        {dateWords || '—'}
                      </p>
                    </div>
                  </div>

                  {(!amount || !dueDate || !payee) && (
                    <div className="mt-2 flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[9px] text-amber-800 leading-relaxed">
                        برای چاپ، مبلغ، تاریخ سررسید و نام گیرنده را وارد کنید.
                      </p>
                    </div>
                  )}
                </div>

                {showSettings && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-amber-100/50 border-b border-amber-200">
                      <h3 className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                        <SlidersHorizontal className="w-3 h-3 text-amber-600" />
                        تنظیمات عمومی
                      </h3>
                      <button
                        onClick={handleResetProfile}
                        className="text-[9px] text-amber-700 hover:text-amber-900 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-200/50"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        پیش‌فرض
                      </button>
                    </div>

                    <div className="flex border-b border-amber-200">
                      <button
                        onClick={() => setSettingsTab('appearance')}
                        className={`flex-1 text-[10px] font-medium py-1 px-2 flex items-center justify-center gap-1 ${settingsTab === 'appearance'
                          ? 'bg-white text-amber-900 border-b-2 border-amber-500'
                          : 'text-amber-700 hover:bg-amber-100/50'
                          }`}
                      >
                        <Palette className="w-3 h-3" />
                        ظاهر
                      </button>
                      <button
                        onClick={() => setSettingsTab('position')}
                        className={`flex-1 text-[10px] font-medium py-1 px-2 flex items-center justify-center gap-1 ${settingsTab === 'position'
                          ? 'bg-white text-amber-900 border-b-2 border-amber-500'
                          : 'text-amber-700 hover:bg-amber-100/50'
                          }`}
                      >
                        <Settings2 className="w-3 h-3" />
                        موقعیت
                      </button>
                    </div>

                    <div className="p-2.5">
                      {settingsTab === 'appearance' && (
                        <div className="space-y-2">
                          <p className="text-[8px] text-amber-800">
                            این تنظیمات پیش‌فرض کلی است. فیلدهایی که استایل اختصاصی داشته باشند، از همین پنل استفاده نمی‌کنند.
                          </p>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[9px] mb-0.5 block">فونت پیش‌فرض</Label>
                              <select
                                value={currentProfile.fontFamily}
                                onChange={(e) => updateCurrentProfile({ fontFamily: e.target.value })}
                                className="w-full h-7 text-[10px] bg-white border border-gray-300 rounded px-1.5"
                              >
                                {AVAILABLE_FONTS.map((f) => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label className="text-[9px] mb-0.5 block">وزن پیش‌فرض</Label>
                              <select
                                value={currentProfile.fontWeight}
                                onChange={(e) => updateCurrentProfile({ fontWeight: e.target.value as any })}
                                className="w-full h-7 text-[10px] bg-white border border-gray-300 rounded px-1.5"
                              >
                                <option value="normal">معمولی</option>
                                <option value="bold">ضخیم</option>
                                <option value="black">خیلی ضخیم</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[9px] mb-0.5 block">رنگ پیش‌فرض</Label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="color"
                                  value={currentProfile.fontColor}
                                  onChange={(e) => updateCurrentProfile({ fontColor: e.target.value })}
                                  className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0.5"
                                />
                                <span className="text-[9px] font-mono text-gray-600" dir="ltr">
                                  {currentProfile.fontColor}
                                </span>
                              </div>
                            </div>
                            <div>
                              <Label className="text-[9px] mb-0.5 block">
                                مقیاس عمومی: {toFaNum(Math.round((currentProfile.fontScale || 1) * 100))}%
                              </Label>
                              <input
                                type="range"
                                min="0.7"
                                max="1.5"
                                step="0.05"
                                value={currentProfile.fontScale || 1}
                                onChange={(e) => updateCurrentProfile({ fontScale: parseFloat(e.target.value) })}
                                className="w-full h-1.5 accent-amber-600 mt-1"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {settingsTab === 'position' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-1.5">
                            <div>
                              <Label className="text-[8px]">X: {toFaNum(currentProfile.offsetX)}</Label>
                              <input
                                type="range"
                                min="-20"
                                max="20"
                                step="0.5"
                                value={currentProfile.offsetX}
                                onChange={(e) => updateCurrentProfile({ offsetX: parseFloat(e.target.value) })}
                                className="w-full h-1.5 accent-amber-600"
                              />
                            </div>
                            <div>
                              <Label className="text-[8px]">Y: {toFaNum(currentProfile.offsetY)}</Label>
                              <input
                                type="range"
                                min="-20"
                                max="20"
                                step="0.5"
                                value={currentProfile.offsetY}
                                onChange={(e) => updateCurrentProfile({ offsetY: parseFloat(e.target.value) })}
                                className="w-full h-1.5 accent-amber-600"
                              />
                            </div>
                            <div>
                              <Label className="text-[8px]">S: {toFaNum((currentProfile.scale || 1).toFixed(2))}</Label>
                              <input
                                type="range"
                                min="0.8"
                                max="1.2"
                                step="0.01"
                                value={currentProfile.scale || 1}
                                onChange={(e) => updateCurrentProfile({ scale: parseFloat(e.target.value) })}
                                className="w-full h-1.5 accent-amber-600"
                              />
                            </div>
                          </div>

                          <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-[8px] text-blue-800">
                              ℹ️ این تنظیمات فقط در <strong>چاپ واقعی</strong> اعمال می‌شوند.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-2"
            style={{ flexShrink: 0 }}
          >
            <Button
              variant="outline"
              onClick={() => !printing && onOpenChange(false)}
              disabled={printing}
              className="text-[10px] h-8"
            >
              انصراف
            </Button>
            <Button
              onClick={handlePrint}
              disabled={printing || !amount || !dueDate || !payee.trim()}
              className="bg-gradient-to-l from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white gap-1.5 text-xs px-5 h-8"
            >
              {printing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  در حال چاپ...
                </>
              ) : (
                <>
                  <Printer className="w-3.5 h-3.5" />
                  چاپ چک
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Print Area */}
      <div
        className="check-print-area check-print-font-area"
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-99999px',
          top: '-99999px',
          width: `${SAYADI_PURPLE_TEMPLATE.width}mm`,
          height: `${SAYADI_PURPLE_TEMPLATE.height}mm`,
          pointerEvents: 'none',
          visibility: 'hidden',
          opacity: 0,
          zIndex: -9999,
          ...fontVarStyle,
        }}
      >
        {effectiveFields.map((field) => {
          const value = renderFieldValue(field)
          if (!value) return null

          const box = getFieldBox(field, value)
          const style = getFieldStyle(field)

          return (
            <div
              key={field.id}
              className="check-field check-field-wrapper absolute"
              style={{
                left: `${field.x}mm`,
                top: `${field.y}mm`,
                width: `${box.width}mm`,
                height: `${box.height}mm`,
                ['--field-font-family' as any]: style.fontFamily,
                ['--field-font-color' as any]: style.fontColor,
                ['--field-font-weight' as any]: style.fontWeightNum,
              }}
            >
              {renderFieldContent(field, value, 'print', style)}
            </div>
          )
        })}
      </div>
    </>,
    document.body
  )
}

export default CheckPrinterModal