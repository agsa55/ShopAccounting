'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import {
  getFeaturesByPlanName,
  canUpgradePlan,
  isLifetimeCycle,
  type PlanName,
  type BillingCycle,
} from '@/lib/plan-features'
// ★★★ v9.2: hook بررسی وضعیت دمو
import { useDemoStatus } from '@/lib/use-demo-status'
import { mockPlans } from '@/lib/mock-data'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStore } from '@/lib/store'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Store,
  CreditCard,
  Monitor,
  FileText,
  Database,
  Crown,
  Users,
  Wallet,        // ★★★ v8.8: برای ویزارد راه‌اندازی اولیه
  Save,
  Upload,
  Wifi,
  WifiOff,
  CheckCircle2,
  Loader2,
  AlertTriangle,
   Zap, 
  Download,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  ShieldCheck,
  Trash2,
  Building2,
  Receipt,
  Package,
  Lock,
  Sparkles,
  Globe,
  Copy,
  ExternalLink,
  Printer,
  Calendar,
  CalendarDays,
  Archive,
  PlayCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Info,
  Bell,
  MessageSquare,
  Send,
  AlertCircle,
  FileArchive,
} from 'lucide-react'

// ★★★ v3.26: Datepicker شمسی اشتراک
import {
  PersianDatePicker,
  formatJalali,
  formatJalaliLong,
} from '@/components/ui/persian-date-picker'

// ★★★ v6.0: تب تنظیمات اتصال سامانه مودیان
import { MoidianTab } from './moidian-tab'
import { PosDevicesTab } from './pos-devices-tab'
import { SetupWizard } from '@/components/setup-wizard'

// این کامپوننت را قبل از SettingsPage اضافه کن

// ★★★ SetupStatusBadges را کاملاً حذف کن و این کو جایش بزار

function SetupStatusBadges() {
  const [status, setStatus] = useState({
    hasFiscalYear: false,
    hasWarehouse: false,
    hasInitialBalance: false,
    loading: true,
  })

  useEffect(() => {
    const load = async () => {
      try {
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('token')
          : null

        // ★ اصلاح کامل
        const fetchOptions = token
          ? { headers: { Authorization: `Bearer ${token}` } }
          : {}

        const [fyRes, whRes, balRes] = await Promise.all([
          fetch('/api/fiscal-years', fetchOptions)
            .then(r => r.json())
            .catch(() => ({})),
          fetch('/api/warehouses', fetchOptions)
            .then(r => r.json())
            .catch(() => ({})),
          fetch('/api/initial-balance', fetchOptions)
            .then(r => r.json())
            .catch(() => ({})),
        ])

        const years = fyRes?.data?.years || fyRes?.data || []
        const whs = whRes?.data || []
        const bals = balRes?.data || []

        setStatus({
          hasFiscalYear: Array.isArray(years) && years.some((y: any) => y.isActive),
          hasWarehouse: Array.isArray(whs) && whs.length > 0,
          hasInitialBalance: Array.isArray(bals) && bals.length > 0,
          loading: false,
        })
      } catch (error) {
        console.error('[SetupStatusBadges] Error:', error)
        setStatus(s => ({ ...s, loading: false }))
      }
    }
    load()
  }, [])

  if (status.loading) return null

  const items = [
    {
      label: 'سال مالی',
      done: status.hasFiscalYear,
      icon: <Calendar className="w-3 h-3" />,
    },
    {
      label: 'انبار',
      done: status.hasWarehouse,
      icon: <Building2 className="w-3 h-3" />,
    },
    {
      label: 'سند افتتاحیه',
      done: status.hasInitialBalance,
      icon: <Wallet className="w-3 h-3" />,
    },
  ]

  const allDone = items.every(i => i.done)

  return (
    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-violet-200">
      <span className="text-[10px] text-violet-700 shrink-0">وضعیت:</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${
              item.done
                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.done
              ? <CheckCircle2 className="w-2.5 h-2.5" />
              : <AlertCircle className="w-2.5 h-2.5" />}
          </div>
        ))}
      </div>
      {allDone && (
        <Badge className="bg-emerald-100 text-emerald-700 text-[9px] mr-auto">
          ✓ راه‌اندازی کامل
        </Badge>
      )}
    </div>
  )
}


// ✅ FIX v6: fallback به user.tenantId هم اضافه شد
// ★★★ v3.10.1: پذیرش string | null | undefined برای جلوگیری از خطای TypeScript
function resolveTenantId(
  currentTenant: any,
  storeTenantId?: string | null,
  userTenantId?: string | null
): string {
  // 1. از currentTenant.id
  if (currentTenant && typeof currentTenant === 'object' && currentTenant.id) return currentTenant.id
  if (currentTenant && typeof currentTenant === 'string') return currentTenant
  // 2. از storeTenantId (store.tenantId)
  if (storeTenantId && typeof storeTenantId === 'string' && storeTenantId.trim()) return storeTenantId.trim()
  // 3. از userTenantId (user.tenantId)
  if (userTenantId && typeof userTenantId === 'string' && userTenantId.trim()) return userTenantId.trim()
  return ''
}


// ✅ FIX v6: تابع کمکی برای گرفتن tenantId از store در هر لحظه
function getTenantIdFromStore(): string {
  const state = useAppStore.getState()
  return resolveTenantId(state.currentTenant, state.tenantId, state.user?.tenantId)
}

function formatNumber(num: number): string {
  return num.toLocaleString('fa-IR')
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr)
  return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ v3.28: الگوریتم صحیح تبدیل تاریخ شمسی-میلادی (Jalaali.js v1.1.0)
//
//  منبع: https://github.com/jalaali/jalaali-js
//  نویسنده: Behrang Noruzi Niya
//  لایسنس: MIT
//
//  ★ چرا بازنویسی شد؟
//  نسخه قبلی (v3.26) در پایان سال شمسی (اسفند) دچار خطای یک‌روزه/یک‌ساله
//  می‌شد. مثلاً ۱۴۰۵/۱۲/۲۹ به‌جای تبدیل به ۲۰۲۷/۰۳/۲۰، به ۲۰۲۶/۰۱/۲۰
//  تبدیل می‌شد (یک سال جابه‌جا).
//
//  الگوریتم جدید از Julian Day Number (JDN) استفاده می‌کند که دقیق‌ترین
//  روش تبدیل تاریخ است و در تمامی کتابخانه‌های استاندارد (مثل moment-jalaali،
//  day-jalaali، react-day-picker-jalaali) استفاده می‌شود.
// ═══════════════════════════════════════════════════════════════

// ★ توابع کمکی ریاضی (مطابق jalaali-js)
function _div(a: number, b: number): number {
  return ~~(a / b)
}

function _rem(a: number, b: number): number {
  return a - ~~(a / b) * b
}

// ★ الگوریتم اصلی jalCal (محاسبه march و leap)
function _jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
    1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
    2456, 3178,
  ]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]

  if (jy < jp || jy >= breaks[bl - 1]) {
    throw new Error('Invalid Jalaali year ' + jy)
  }

  let jump = 0
  let jm = 0
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + _div(jump, 33) * 8 + _div(_rem(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp

  leapJ = leapJ + _div(n, 33) * 8 + _div(_rem(n, 33) + 3, 4)
  if (_rem(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + _div(jump + 4, 33) * 33
  let leap = _rem(_rem(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { leap, gy, march }
}

// ★ تبدیل میلادی به Julian Day Number
function _g2d(gy: number, gm: number, gd: number): number {
  let d =
    _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) +
    _div(153 * _rem(gm + 9, 12) + 2, 5) +
    gd - 34840408
  d = d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

// ★ تبدیل Julian Day Number به میلادی
function _d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631
  j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = _div(_rem(j, 1461), 4) * 5 + 308
  const gd = _div(_rem(i, 153), 5) + 1
  const gm = _rem(_div(i, 153), 12) + 1
  const gy = _div(j, 1461) - 100100 + _div(8 - gm, 6)
  return { gy, gm, gd }
}

// ★ تبدیل شمسی به Julian Day Number
function _j2d(jy: number, jm: number, jd: number): number {
  const r = _jalCal(jy)
  return _g2d(r.gy, 3, r.march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1
}

// ★ تبدیل Julian Day Number به شمسی
function _d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = _d2g(jdn).gy
  let jy = gy - 621
  const r = _jalCal(jy)
  const jdn1f = _g2d(gy, 3, r.march)

  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + _div(k, 31)
      const jd = _rem(k, 31) + 1
      return { jy, jm, jd }
    } else {
      k -= 186
    }
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }

  const jm = 7 + _div(k, 30)
  const jd = _rem(k, 30) + 1
  return { jy, jm, jd }
}

// ═══════════════════════════════════════════════════════════════
//  توابع عمومی (API حفظ شده)
// ═══════════════════════════════════════════════════════════════

// تبدیل تاریخ شمسی (jy, jm, jd) به میلادی ISO (YYYY-MM-DD)
function jalaliToGregorianISO(jy: number, jm: number, jd: number): string {
  try {
    const r = _d2g(_j2d(jy, jm, jd))
    return (
      String(r.gy).padStart(4, '0') + '-' +
      String(r.gm).padStart(2, '0') + '-' +
      String(r.gd).padStart(2, '0')
    )
  } catch {
    return ''
  }
}

// تبدیل ISO میلادی (YYYY-MM-DD) به شمسی [jy, jm, jd]
function gregorianISOToJalali(iso: string): [number, number, number] | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const gy = parseInt(m[1], 10)
  const gm = parseInt(m[2], 10)
  const gd = parseInt(m[3], 10)
  try {
    const r = _d2j(_g2d(gy, gm, gd))
    return [r.jy, r.jm, r.jd]
  } catch {
    return null
  }
}

// تبدیل رشته شمسی «1403/05/12» یا «۱۴۰۳/۰۵/۱۲» به ISO میلادی
function parseJalaliString(jalali: string): string | null {
  const normalized = jalali
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim()
  const m = normalized.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return null
  const jy = parseInt(m[1], 10)
  const jm = parseInt(m[2], 10)
  const jd = parseInt(m[3], 10)
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  return jalaliToGregorianISO(jy, jm, jd)
}

// گرفتن تاریخ امروز به ISO میلادی
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// گرفتن تاریخ امروز به شمسی «۱۴۰۳/۰۵/۱۲»
function todayJalali(): string {
  const iso = todayISO()
  const j = gregorianISOToJalali(iso)
  if (!j) return ''
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  const toFa = (n: number, len = 2) =>
    String(n).padStart(len, '0').replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
  return `${toFa(j[0], 4)}/${toFa(j[1])}/${toFa(j[2])}`
}

// تبدیل ISO به شمسی فارسی «۱۴۰۳/۰۵/۱۲»
function isoToJalaliFa(iso: string | null | undefined): string {
  if (!iso) return '—'
  const j = gregorianISOToJalali(iso.slice(0, 10))
  if (!j) return '—'
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  const toFa = (n: number, len = 2) =>
    String(n).padStart(len, '0').replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
  return `${toFa(j[0], 4)}/${toFa(j[1])}/${toFa(j[2])}`
}

// =========== Store Settings Tab ===========
function StoreSettingsTab() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantId = useAppStore((s) => s.tenantId)
  const user = useAppStore((s) => s.user)
  const [storeName, setStoreName] = useState('\u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0646\u0645\u0648\u0646\u0647')
  const [address, setAddress] = useState('\u062A\u0647\u0631\u0627\u0646\u060C \u062E\u06CC\u0627\u0628\u0627\u0646 \u0648\u0644\u06CC\u0639\u0635\u0631\u060C \u067E\u0644\u0627\u06A9 \u06F1\u06F2')
  const [phone, setPhone] = useState('02112345678')
  const [registrationNumber, setRegistrationNumber] = useState('12345')
  const [defaultTaxRate, setDefaultTaxRate] = useState('9')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  // ★★★ v3.20: تنظیمات چاپ خودکار
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  // ★★★ v3.36.7: اضافه شدن گزینه 58mm برای چاپ خودکار
  const [autoPrintTemplate, setAutoPrintTemplate] = useState<'58mm' | '8cm' | 'a4'>('8cm')
  const [autoPrintPaymentTypes, setAutoPrintPaymentTypes] = useState<string[]>(['cash', 'card', 'credit', 'installment'])
  // ★★★ v3.17.1: state برای tenant data از API
  const [tenantData, setTenantData] = useState<any>(null)

  // ★★★ v3.17.1: دریافت subDomain از چند منبع
  // ۱. از currentTenant (store)
  // ۲. از URL pathname (مثلاً /lbm/dashboard → lbm)
  // ۳. از localStorage (tenant)
  // ۴. از tenantData (API)
  const getSubDomain = (): string => {
    // ۱. از currentTenant
    if (currentTenant?.subDomain) return currentTenant.subDomain

    // ۲. از URL pathname
    if (typeof window !== 'undefined') {
      const path = window.location.pathname
      const match = path.match(/^\/([^\/]+)/)
      if (match && match[1]) {
        const candidate = match[1]
        // ★.exclude مسیرهای سیستمی
        if (!['api', 'login', 'register', '_next', 'favicon.ico'].includes(candidate)) {
          return candidate
        }
      }
    }

    // ۳. از localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tenant')
      if (stored) {
        try {
          const t = JSON.parse(stored)
          if (t?.subDomain) return t.subDomain
        } catch {}
      }
    }

    // ۴. از tenantData (که از API لود شده)
    if (tenantData?.subDomain) return tenantData.subDomain

    return ''
  }

  const subDomain = getSubDomain()
  const isLocalDev = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  )
  // ★ آدرس کامل دامین
  const fullDomain = subDomain
    ? (isLocalDev
      ? `${window.location.host}/${subDomain}`
      : `${subDomain}.shopaccounting.ir`)
    : ''
  const fullUrl = subDomain
    ? (isLocalDev
      ? `${window.location.origin}/${subDomain}`
      : `https://${subDomain}.shopaccounting.ir`)
    : ''

  // ★★★ v3.17.1: لود tenant data از API (برای دریافت subDomain)
  useEffect(() => {
    const tid = tenantId || getTenantIdFromStore()
    if (!tid) return

    // ★★★ v3.20: لود تنظیمات چاپ خودکار از localStorage
    const printSettings = localStorage.getItem('auto-print-settings')
    if (printSettings) {
      try {
        const ps = JSON.parse(printSettings)
        setAutoPrintEnabled(ps.enabled || false)
        setAutoPrintTemplate(ps.template || '8cm')
        setAutoPrintPaymentTypes(ps.paymentTypes || ['cash', 'card', 'credit', 'installment'])
      } catch {}
    }

    // ★ لود tenant info برای subDomain
    fetch(`/api/tenants/trial-check`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setTenantData(data.data)
        }
      })
      .catch(() => {})

    // ★ لود تنظیمات فروشگاه از API
    fetch(`/api/store-settings?tenantId=${tid}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          // ★★★ v3.36.3: اصلاح خواندن از data.data.settings (نه data.data مستقیم)
          //   API این ساختار را برمی‌گرداند:
          //   { success: true, data: { settings: {...}, storeName: ..., ... } }
          const s = data.data.settings || data.data
          if (s.storeName) setStoreName(s.storeName)
          if (s.address) setAddress(s.address)
          if (s.phone) setPhone(s.phone)
          if (s.registrationNumber) setRegistrationNumber(s.registrationNumber)
          if (s.defaultTaxRate !== undefined && s.defaultTaxRate !== null) {
            setDefaultTaxRate(String(s.defaultTaxRate))
          }
          // ★★★ v3.36.3: به‌روزرسانی store در useAppStore برای استفاده در پورتال و سایر صفحات
          if (s.storeName) {
            try {
              useAppStore.setState((state) => ({
                storeName: s.storeName,
              }))
            } catch {}
          }
        }
      })
      .catch(() => {})
  }, [tenantId, currentTenant, user])

  const handleSave = async () => {
    setSaving(true)
    try {
      const tid = tenantId || getTenantIdFromStore()
      if (!tid) {
        alert('خطا: شناسه فروشگاه در دسترس نیست')
        setSaving(false)
        return
      }
      // ★★★ v3.20: ذخیره تنظیمات چاپ خودکار
      localStorage.setItem('auto-print-settings', JSON.stringify({
        enabled: autoPrintEnabled,
        template: autoPrintTemplate,
        paymentTypes: autoPrintPaymentTypes,
      }))

      const res = await fetch('/api/store-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tid,
          storeName,
          address,
          phone,
          registrationNumber,
          defaultTaxRate: parseFloat(defaultTaxRate) || 0,
        }),
      })
      const data = await res.json()
      if (data.success) {
        // ★★★ v3.36.3: به‌روزرسانی storeName در useAppStore برای سایر صفحات
        try {
          useAppStore.setState((state) => ({
            storeName: storeName,
          }))
        } catch {}

        // ★★★ v3.36.3: نمایش پیام موفقیت
        alert(data.message || 'تنظیمات با موفقیت ذخیره شد')

        // ★★★ v3.36.3: اعتبارسنجی — داده‌ها را دوباره از API بخوان
        //   برای اطمینان از اینکه واقعاً ذخیره شده‌اند
        try {
          const verifyRes = await fetch(`/api/store-settings?tenantId=${tid}`)
          const verifyData = await verifyRes.json()
          if (verifyData.success && verifyData.data) {
            const s = verifyData.data.settings || verifyData.data
            if (s.storeName) setStoreName(s.storeName)
            if (s.address) setAddress(s.address)
            if (s.phone) setPhone(s.phone)
            if (s.registrationNumber) setRegistrationNumber(s.registrationNumber)
            if (s.defaultTaxRate !== undefined && s.defaultTaxRate !== null) {
              setDefaultTaxRate(String(s.defaultTaxRate))
            }
          }
        } catch (verifyErr) {
          console.warn('[StoreSettings] Verify failed (non-blocking):', verifyErr)
        }
      } else {
        alert(data.error || 'خطا در ذخیره تنظیمات')
      }
    } catch (err: any) {
      console.error('[StoreSettings] Save error:', err)
      alert('خطا در ارتباط با سرور: ' + (err?.message || 'نامشخص'))
    }
    setSaving(false)
  }

  // ★★★ v3.17: کپی آدرس دامین
  const handleCopyDomain = () => {
    if (!fullUrl) return
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      const textArea = document.createElement('textarea')
      textArea.value = fullUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ★★★ v3.17: باز کردن آدرس دامین در تب جدید
  const handleOpenDomain = () => {
    if (!fullUrl) return
    window.open(fullUrl, '_blank')
  }

  return (
    <Card className="border-gray-200">
      <CardHeader className="p-2.5 sm:p-3 pb-1">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Store className="w-4 h-4 text-emerald-600" />
          اطلاعات فروشگاه
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2.5 sm:p-3 pt-2 space-y-2">
        {/* ★★★ v3.17: نمایش آدرس دامین اختصاصی فروشگاه */}
        {subDomain && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
            <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-gray-500">آدرس اختصاصی فروشگاه</p>
              <p className="text-xs font-bold text-emerald-700 truncate" dir="ltr">{fullDomain}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-500 hover:text-emerald-600 shrink-0"
              onClick={handleCopyDomain}
              title="کپی آدرس"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-500 hover:text-emerald-600 shrink-0"
              onClick={handleOpenDomain}
              title="باز کردن در تب جدید"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* ★★★ v3.12: layout ۳ ستونه برای فشرده‌سازی */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div>
            <Label htmlFor="storeName" className="text-[11px] text-gray-600 mb-0.5 block">نام فروشگاه</Label>
            <Input id="storeName" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label htmlFor="phone" className="text-[11px] text-gray-600 mb-0.5 block">شماره تماس</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="h-8 text-xs" />
          </div>
          <div>
            <Label htmlFor="regNumber" className="text-[11px] text-gray-600 mb-0.5 block">شماره ثبت</Label>
            <Input id="regNumber" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} dir="ltr" className="h-8 text-xs" />
          </div>
        </div>

        {/* آدرس — تمام عرض */}
        <div>
          <Label htmlFor="address" className="text-[11px] text-gray-600 mb-0.5 block">آدرس</Label>
          <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={1} className="text-xs min-h-[32px]" />
        </div>

        {/* ردیف آخر: مالیات + دکمه ذخیره */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
          <div>
            <Label htmlFor="taxRate" className="text-[11px] text-gray-600 mb-0.5 block">درصد مالیات پیش‌فرض</Label>
            <Input id="taxRate" type="number" value={defaultTaxRate} onChange={(e) => setDefaultTaxRate(e.target.value)} dir="ltr" className="h-8 text-xs" />
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 ml-1" />ذخیره تنظیمات</>}
          </Button>
        </div>

        <Separator className="my-1" />

        {/* ★★★ v3.20: تنظیمات چاپ خودکار فاکتور */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-blue-600" />
                <p className="text-[11px] font-bold text-blue-800">چاپ خودکار فاکتور</p>
              </div>
              <Switch checked={autoPrintEnabled} onCheckedChange={setAutoPrintEnabled} />
            </div>
            {autoPrintEnabled && (
              <div className="space-y-2 pt-1 border-t border-blue-100">
                {/* انتخاب قالب چاپ */}
                <div>
                  <Label className="text-[10px] text-gray-600 mb-0.5 block">قالب چاپ</Label>
                  <div className="flex gap-1">
                    <button
                      className={`flex-1 py-1 text-[10px] rounded border ${autoPrintTemplate === '58mm' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      onClick={() => setAutoPrintTemplate('58mm')}
                    >
                      ۵ سانتی
                    </button>
                    <button
                      className={`flex-1 py-1 text-[10px] rounded border ${autoPrintTemplate === '8cm' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      onClick={() => setAutoPrintTemplate('8cm')}
                    >
                      ۸ سانتی
                    </button>
                    <button
                      className={`flex-1 py-1 text-[10px] rounded border ${autoPrintTemplate === 'a4' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      onClick={() => setAutoPrintTemplate('a4')}
                    >
                      A4
                    </button>
                  </div>
                </div>
                {/* انتخاب نوع پرداخت */}
                <div>
                  <Label className="text-[10px] text-gray-600 mb-0.5 block">چاپ برای کدام نوع پرداخت؟</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { key: 'cash', label: 'نقدی' },
                      { key: 'card', label: 'کارتخوان' },
                      { key: 'credit', label: 'نسیه' },
                      { key: 'installment', label: 'قسطی' },
                    ].map((pt) => (
                      <label key={pt.key} className={`flex items-center gap-1 p-1 rounded border cursor-pointer text-[10px] ${autoPrintPaymentTypes.includes(pt.key) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                        <input
                          type="checkbox"
                          checked={autoPrintPaymentTypes.includes(pt.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAutoPrintPaymentTypes([...autoPrintPaymentTypes, pt.key])
                            } else {
                              setAutoPrintPaymentTypes(autoPrintPaymentTypes.filter((k) => k !== pt.key))
                            }
                          }}
                          className="w-3 h-3"
                        />
                        {pt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-[9px] text-blue-600">
                  با فعال کردن این گزینه، به محض ثبت فاکتور، فاکتور با قالب انتخاب‌شده چاپ می‌شود.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-1" />

        {/* آپلود لوگو — کاملاً فشرده */}
        <div className="flex items-center gap-2 border border-dashed border-gray-200 rounded-lg p-2 hover:border-emerald-300 transition-colors cursor-pointer">
          <Upload className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-600">آپلود لوگوی فروشگاه</p>
            <p className="text-[9px] text-gray-400">PNG, JPG تا ۲ مگابایت</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =========== Payment Gateway Tab (v3.34.1 — Fixed) ===========
function PaymentGatewayTab() {
  const [guideOpen, setGuideOpen] = useState(false)
  const [gatewayType, setGatewayType] = useState<'zarinpal' | 'idpay'>('zarinpal')
  const [merchantId, setMerchantId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeySet, setApiKeySet] = useState(false)
  const [terminalCode, setTerminalCode] = useState('')
  const [bankIban, setBankIban] = useState('')
  const [bankName, setBankName] = useState('')
  const [sandbox, setSandbox] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [gatewayId, setGatewayId] = useState<string | null>(null)
  const { toast } = useToast()

  // ★ لود تنظیمات فعلی درگاه
  useEffect(() => {
    const loadGateway = async () => {
      const tid = getTenantIdFromStore()
      if (!tid) {
        setLoading(false)
        return
      }
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const res = await fetch('/api/payment-gateway', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        if (data.success && data.data) {
          const g = data.data
          setGatewayId(g.id)
          setGatewayType(g.type || 'zarinpal')
          setMerchantId(g.merchantId || '')
          setApiKey('')  // همیشه خالی — کاربر باید دوباره وارد کنه
          setApiKeySet(g.apiKeySet || false)
          setTerminalCode(g.terminalCode || '')
          setBankIban(g.bankIban || '')
          setBankName(g.bankName || '')
          setSandbox(g.sandbox || false)
          setIsActive(g.isActive !== false)
        }
      } catch (err) {
        console.error('[PaymentGatewayTab] Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadGateway()
  }, [])

  const handleSave = async () => {
    // ★ اعتبارسنجی
    if (!merchantId.trim() || merchantId.trim().length < 4) {
      toast({ title: 'خطا', description: 'کد مرچنت (Merchant ID) الزامی است', variant: 'destructive' })
      return
    }
    if (gatewayType === 'idpay' && !apiKey.trim() && !apiKeySet) {
      toast({ title: 'خطا', description: 'برای درگاه ای‌دی‌پی، کلید API الزامی است', variant: 'destructive' })
      return
    }
    if (bankIban.trim()) {
      const ibanRegex = /^IR\d{24}$/
      if (!ibanRegex.test(bankIban.replace(/\s/g, '').toUpperCase())) {
        toast({ title: 'خطا', description: 'فرمت شبا نامعتبر است', variant: 'destructive' })
        return
      }
    }

    setSaving(true)
    setSaved(false)
    try {
      const tid = getTenantIdFromStore()
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/payment-gateway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenantId: tid,
          type: gatewayType,
          merchantId: merchantId.trim(),
          // ★ فقط اگه کاربر apiKey جدید وارد کرده بفرست
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          terminalCode: terminalCode.trim() || undefined,
          bankIban: bankIban ? bankIban.replace(/\s/g, '').toUpperCase() : undefined,
          bankName: bankName.trim() || undefined,
          sandbox,
          isActive,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSaved(true)
        setApiKey('')
        setApiKeySet(true)
        toast({ title: 'ذخیره شد ✓', description: data.message || 'تنظیمات درگاه ذخیره شد' })
        setTimeout(() => setSaved(false), 3000)
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در ذخیره', variant: 'destructive' })
      }
    } catch (err) {
      console.error('[PaymentGatewayTab] Save error:', err)
      toast({ title: 'خطا', description: 'خطا در ارتباط با سرور', variant: 'destructive' })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="mr-2 text-sm text-gray-600">در حال بارگذاری...</span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <CollapsibleSection title="راهنمای تنظیم درگاه پرداخت اختصاصی" open={guideOpen} onToggle={() => setGuideOpen(!guideOpen)}>
        <div className="text-sm text-gray-600 pr-2 space-y-2">
          <p>برای فعال‌سازی درگاه پرداخت آنلاین، باید در یکی از سرویس‌های زیر ثبت‌نام کنید و کدهای دریافتی را وارد نمایید:</p>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-2">
            <p className="font-bold text-emerald-700 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" />
              زرین‌پال (Zarinpal)
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-1.5 text-xs">
              <li>به سایت <a href="https://www.zarinpal.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">zarinpal.com</a> مراجعه کنید و ثبت‌نام کنید</li>
              <li>در پنل، یک وب‌سایت جدید اضافه کنید (آدرس سایت خودتان را وارد کنید)</li>
              <li>پس از تأیید، «کد مرچنت» (Merchant ID) را دریافت می‌کنید</li>
              <li>کد مرچنت را در فیلد زیر وارد کنید</li>
            </ol>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
            <p className="font-bold text-blue-700 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" />
              ای‌دی‌پی (IDPay)
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-1.5 text-xs">
              <li>به سایت <a href="https://idpay.ir" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">idpay.ir</a> مراجعه کنید و ثبت‌نام کنید</li>
              <li>یک وب‌سایت جدید اضافه کنید و منتظر تأیید بمانید</li>
              <li>«کد مرچنت» و «کلید API» (X-API-Key) را از پنل دریافت کنید</li>
              <li>هر دو کد را در فیلدهای زیر وارد کنید</li>
            </ol>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2 text-xs text-amber-700">
            <p className="font-medium">⚠ توجه:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>درگاه اشتراکی «تسهیم فردا» زرین‌پال متوقف شده است</li>
              <li>هر فروشگاه باید درگاه اختصاصی خودش را تنظیم کند</li>
              <li>وجه پرداخت‌ها مستقیماً به حساب بانکی شما (شبا) واریز می‌شود</li>
            </ul>
          </div>
        </div>
      </CollapsibleSection>

      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3.5">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            تنظیمات درگاه پرداخت اختصاصی
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-2.5 sm:p-3.5 pt-0 sm:pt-0">
          {/* انتخاب نوع درگاه */}
          <div className="space-y-1.5">
            <Label>نوع درگاه پرداخت</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGatewayType('zarinpal')}
                className={`p-3 rounded-lg border-2 transition-all text-right ${
                  gatewayType === 'zarinpal'
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${gatewayType === 'zarinpal' ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <CreditCard className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">زرین‌پال</p>
                    <p className="text-[10px] text-gray-500">Zarinpal</p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setGatewayType('idpay')}
                className={`p-3 rounded-lg border-2 transition-all text-right ${
                  gatewayType === 'idpay'
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${gatewayType === 'idpay' ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <CreditCard className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">ای‌دی‌پی</p>
                    <p className="text-[10px] text-gray-500">IDPay</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* کد مرچنت — الزامی برای هر دو */}
          <div className="space-y-1.5">
            <Label>کد مرچنت (Merchant ID) <span className="text-red-500">*</span></Label>
            <Input
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder={gatewayType === 'zarinpal' ? 'مثلاً: 12345678-90ab-cdef-...' : 'کد ۳۶ کاراکتری'}
              className="font-mono text-xs"
              dir="ltr"
            />
            <p className="text-[10px] text-gray-400">
              {gatewayType === 'zarinpal'
                ? 'این کد را از پنل زرین‌پال → وب‌سایت‌ها → جزئیات سایت دریافت می‌کنید'
                : 'این کد را از پنل ای‌دی‌پی → وب‌سایت‌ها دریافت می‌کنید'}
            </p>
          </div>

          {/* کلید API — فقط برای ای‌دی‌پی الزامی است */}
          {gatewayType === 'idpay' && (
            <div className="space-y-1.5">
              <Label>
                کلید API (X-API-Key) <span className="text-red-500">*</span>
                {apiKeySet && <span className="text-emerald-600 mr-2 text-[10px]">✓ تنظیم شده</span>}
              </Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeySet ? '•••••••• (برای تغییر، وارد کنید)' : 'کلید API ای‌دی‌پی'}
                className="font-mono text-xs"
                dir="ltr"
              />
              <p className="text-[10px] text-gray-400">این کلید را از پنل ای‌دی‌پی دریافت می‌کنید</p>
            </div>
          )}

          {/* کد ترمینال — اختیاری */}
          <div className="space-y-1.5">
            <Label>کد ترمینال (اختیاری)</Label>
            <Input
              value={terminalCode}
              onChange={(e) => setTerminalCode(e.target.value)}
              placeholder="در صورت داشتن کد ترمینال جداگانه"
              className="font-mono text-xs"
              dir="ltr"
            />
          </div>

          {/* شماره شبا */}
          <div className="space-y-1.5">
            <Label>شماره شبا (اختیاری — برای نمایش)</Label>
            <Input
              value={bankIban}
              onChange={(e) => setBankIban(e.target.value)}
              placeholder="IR820570012880011411111111"
              className="font-mono text-xs"
              dir="ltr"
              maxLength={26}
            />
            <p className="text-[10px] text-gray-400">وجه پرداخت‌ها به این شبا واریز می‌شود</p>
          </div>

          <div className="space-y-1.5">
            <Label>نام بانک (اختیاری)</Label>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="مثلاً: بانک ملت"
              className="h-8 text-xs"
            />
          </div>

          {/* حالت تست */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div>
              <Label className="text-xs">حالت تست (Sandbox)</Label>
              <p className="text-[10px] text-gray-500 mt-0.5">برای تست درگاه بدون پرداخت واقعی</p>
            </div>
            <Switch checked={sandbox} onCheckedChange={setSandbox} />
          </div>

          {/* فعال بودن */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div>
              <Label className="text-xs">درگاه فعال است</Label>
              <p className="text-[10px] text-gray-500 mt-0.5">اگه خاموش باشه، مشتریان نمی‌تونن آنلاین پرداخت کنند</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 ml-1" /> : <Save className="w-4 h-4 ml-1" />}
            {saving ? 'در حال ذخیره...' : saved ? 'ذخیره شد ✓' : 'ذخیره تنظیمات درگاه'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// =========== POS Settings Tab ===========
function POSSettingsTab() {
  const [connectionType, setConnectionType] = useState('simulator')
  const [terminalId, setTerminalId] = useState('')
  const [merchantCode, setMerchantCode] = useState('')
  const [posEnabled, setPosEnabled] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle')

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult('idle')
    await new Promise((r) => setTimeout(r, 2000))
    setTestResult('success')
    setTesting(false)
  }

  return (
    <div className="space-y-1.5">
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3.5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-600" />
            تنظیمات کارتخوان
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-2.5 sm:p-3.5 pt-0 sm:pt-0">
          <div className="space-y-1.5">
            <Label>نوع اتصال</Label>
            <Select value={connectionType} onValueChange={setConnectionType}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simulator">شبیه‌ساز</SelectItem>
                <SelectItem value="serial">سریال</SelectItem>
                <SelectItem value="network">شبکه</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label htmlFor="terminalId">Terminal ID</Label>
              <Input id="terminalId" value={terminalId} onChange={(e) => setTerminalId(e.target.value)} placeholder="شناسه ترمینال" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="merchantCode">Merchant Code</Label>
              <Input id="merchantCode" value={merchantCode} onChange={(e) => setMerchantCode(e.target.value)} placeholder="کد پذیرنده" dir="ltr" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2.5 p-3 bg-gray-50 rounded-lg">
            <div className="min-w-0">
              <p className="text-sm font-medium">فعال‌سازی کارتخوان</p>
              <p className="text-xs text-gray-500">اتصال به دستگاه کارتخوان</p>
            </div>
            <Switch checked={posEnabled} onCheckedChange={setPosEnabled} className="shrink-0" />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="w-full sm:w-auto">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4 ml-1" />}
              تست ارتباط
            </Button>
            {testResult === 'success' && (
              <div className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">ارتباط برقرار</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// =========== Invoice Template Tab ===========
// ★★★ v3.13: پشتیبانی از دو قالب A4 و 8cm (چاپگرهای کوچک)
function InvoiceTemplateTab() {
  const [headerText, setHeaderText] = useState('فاکتور فروش')
  const [footerText, setFooterText] = useState('با تشکر از خرید شما')
  const [bankAccounts, setBankAccounts] = useState('بانک ملت: ۶۱۰۴-****-****-۱۲۳۴')
  const [contactInfo, setContactInfo] = useState('تلفن: ۰۲۱۱۲۳۴۵۶۷۸')
  const [primaryColor, setPrimaryColor] = useState('#059669')
  const [showTax, setShowTax] = useState(true)
  const [showDiscount, setShowDiscount] = useState(true)
  // ★★★ v3.14: قالب پیش‌فرض A4، قالب دوم 8cm
  const [defaultTemplate, setDefaultTemplate] = useState<'a4' | '8cm'>('a4')
  const [previewTemplate, setPreviewTemplate] = useState<'a4' | '8cm'>('a4')
  // ★★★ v3.14: لوگو به‌صورت base64 در localStorage ذخیره می‌شه
  const [logoData, setLogoData] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ★ ذخیره تنظیمات در localStorage
  useEffect(() => {
    const saved = localStorage.getItem('invoice-template-settings')
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.headerText) setHeaderText(s.headerText)
        if (s.footerText) setFooterText(s.footerText)
        if (s.bankAccounts) setBankAccounts(s.bankAccounts)
        if (s.contactInfo) setContactInfo(s.contactInfo)
        if (s.primaryColor) setPrimaryColor(s.primaryColor)
        if (s.showTax !== undefined) setShowTax(s.showTax)
        if (s.showDiscount !== undefined) setShowDiscount(s.showDiscount)
        if (s.defaultTemplate) setDefaultTemplate(s.defaultTemplate)
        if (s.logoData) setLogoData(s.logoData)
      } catch {}
    }
  }, [])

  // ★★★ v3.14: آپلود لوگو — تبدیل به base64 و ذخیره
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // بررسی نوع فایل
    if (!file.type.startsWith('image/')) {
      alert('فقط فایل تصویری مجاز است (PNG, JPG)')
      return
    }

    // بررسی حجم (حداکثر ۵۰۰KB)
    if (file.size > 500 * 1024) {
      alert('حجم فایل باید کمتر از ۵۰۰ کیلوبایت باشد')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      setLogoData(result)
    }
    reader.readAsDataURL(file)
  }

  // ★★★ v3.14: حذف لوگو
  const handleLogoRemove = () => {
    setLogoData('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const saveSettings = () => {
    localStorage.setItem('invoice-template-settings', JSON.stringify({
      headerText, footerText, bankAccounts, contactInfo, primaryColor,
      showTax, showDiscount, defaultTemplate, logoData,
    }))
    alert('تنظیمات قالب فاکتور ذخیره شد')
  }

  return (
    <div className="space-y-2">
      {/* ★★★ v3.13: انتخاب قالب پیش‌فرض — A4 یا 8cm */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="p-2.5 sm:p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-emerald-600" />
            <p className="text-xs font-bold text-emerald-800">انتخاب قالب پیش‌فرض فاکتور</p>
          </div>
          <p className="text-[10px] text-emerald-700">
            قالب پیش‌فرض در صفحه صندوق فروش برای چاپ استفاده می‌شه. صندوق‌دار می‌تونه در زمان چاپ، قالب دیگه‌ای هم انتخاب کنه.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`p-2 rounded-lg border-2 transition-all text-right ${defaultTemplate === 'a4' ? 'border-emerald-500 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
              onClick={() => setDefaultTemplate('a4')}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className={`w-4 h-4 ${defaultTemplate === 'a4' ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className="text-xs font-bold">قالب A4</span>
                {defaultTemplate === 'a4' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-auto" />}
              </div>
              <p className="text-[9px] text-gray-500">فاکتور کامل با جزئیات، مناسب پرینترهای معمولی و A4</p>
            </button>
            <button
              className={`p-2 rounded-lg border-2 transition-all text-right ${defaultTemplate === '8cm' ? 'border-emerald-500 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
              onClick={() => setDefaultTemplate('8cm')}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Receipt className={`w-4 h-4 ${defaultTemplate === '8cm' ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className="text-xs font-bold">قالب ۸ سانتی‌متر</span>
                {defaultTemplate === '8cm' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-auto" />}
              </div>
              <p className="text-[9px] text-gray-500">فاکتور باریک، مناسب پرینترهای حرارتی و چاپگرهای کوچک</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* تنظیمات مشترک */}
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            تنظیمات مشترک قالب
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2.5 sm:p-3 pt-2 space-y-2">
          {/* ★★★ v3.14: لوگو + رنگ در یک ردیف — آپلود واقعی */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">لوگوی فروشگاه</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleLogoUpload}
                className="hidden"
              />
              {logoData ? (
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1.5">
                  <img src={logoData} alt="logo" className="w-10 h-10 object-contain rounded border border-gray-100 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-emerald-600 font-medium">لوگو آپلود شد</p>
                    <p className="text-[9px] text-gray-400">PNG, JPG تا ۵۰۰KB</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700 shrink-0"
                    onClick={handleLogoRemove}
                    title="حذف لوگو"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-2 border border-dashed border-gray-300 rounded-lg p-2 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
                >
                  <Upload className="w-5 h-5 text-gray-400 shrink-0" />
                  <div className="min-w-0 text-right">
                    <p className="text-[11px] text-gray-700">آپلود لوگو</p>
                    <p className="text-[9px] text-gray-400">PNG, JPG تا ۵۰۰KB</p>
                  </div>
                </button>
              )}
            </div>
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">رنگ اصلی</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-9 h-9 rounded-lg border cursor-pointer shrink-0" />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} dir="ltr" className="h-8 text-xs w-24" />
              </div>
            </div>
          </div>

          {/* متن سربرگ و پاورقی در یک ردیف */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">متن سربرگ</Label>
              <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">متن پاورقی</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {/* اطلاعات تماس و حساب‌ها در یک ردیف */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">اطلاعات تماس</Label>
              <Input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">حساب‌های بانکی</Label>
              <Input value={bankAccounts} onChange={(e) => setBankAccounts(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {/* سوییچ‌ها در یک ردیف */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between gap-2 px-2 py-1 bg-gray-50 rounded">
              <span className="text-[11px] text-gray-700">نمایش مالیات</span>
              <Switch checked={showTax} onCheckedChange={setShowTax} />
            </div>
            <div className="flex items-center justify-between gap-2 px-2 py-1 bg-gray-50 rounded">
              <span className="text-[11px] text-gray-700">نمایش تخفیف</span>
              <Switch checked={showDiscount} onCheckedChange={setShowDiscount} />
            </div>
          </div>

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" onClick={saveSettings}>
            <Save className="w-3.5 h-3.5 ml-1" />
            ذخیره تنظیمات
          </Button>
        </CardContent>
      </Card>

      {/* ★★★ v3.13: پیش‌نمایش با انتخاب قالب */}
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-600" />
              پیش‌نمایش قالب
            </CardTitle>
            <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded text-[10px]">
              <button
                className={`px-2 py-0.5 rounded ${previewTemplate === 'a4' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500'}`}
                onClick={() => setPreviewTemplate('a4')}
              >
                A4
              </button>
              <button
                className={`px-2 py-0.5 rounded ${previewTemplate === '8cm' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500'}`}
                onClick={() => setPreviewTemplate('8cm')}
              >
                8cm
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2.5 sm:p-3 pt-2">
          {/* ★★★ پیش‌نمایش قالب A4 */}
          {previewTemplate === 'a4' && (
            <div className="border rounded-lg p-3 bg-white overflow-hidden" dir="rtl" style={{ aspectRatio: '1/1.414' }}>
              <div className="text-center text-white py-2 rounded-t-lg mb-2" style={{ backgroundColor: primaryColor }}>
                {logoData && (
                  <img src={logoData} alt="logo" className="max-h-12 max-w-24 mx-auto mb-1 block" />
                )}
                <p className="text-sm font-bold">{headerText}</p>
                <p className="text-[10px] opacity-80">فروشگاه نمونه</p>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between border-b pb-1 gap-2">
                  <span className="text-gray-500">شماره:</span>
                  <span>INV-14031201</span>
                </div>
                <div className="flex justify-between border-b pb-1 gap-2">
                  <span className="text-gray-500">تاریخ:</span>
                  <span>۱۴۰۳/۱۲/۲۱</span>
                </div>
                <div className="flex justify-between border-b pb-1 gap-2">
                  <span className="text-gray-500">مشتری:</span>
                  <span>محمد احمدی</span>
                </div>
              </div>
              <table className="w-full text-[10px] mt-2">
                <thead>
                  <tr style={{ backgroundColor: primaryColor + '15' }}>
                    <th className="text-right p-1">کالا</th>
                    <th className="text-center p-1">تعداد</th>
                    <th className="text-center p-1">قیمت</th>
                    <th className="text-center p-1">مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-1">شیر کاله</td>
                    <td className="text-center p-1">۵</td>
                    <td className="text-center p-1" dir="ltr">۳۲,۰۰۰</td>
                    <td className="text-center p-1" dir="ltr">۱۶۰,۰۰۰</td>
                  </tr>
                </tbody>
              </table>
              <div className="space-y-0.5 mt-2 text-[11px]">
                {showTax && (
                  <div className="flex justify-between border-t pt-1 gap-2">
                    <span className="text-gray-500">مالیات (۹٪):</span>
                    <span dir="ltr">۱۴,۴۰۰</span>
                  </div>
                )}
                {showDiscount && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">تخفیف:</span>
                    <span dir="ltr">۰</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1 border-t-2 gap-2" style={{ borderColor: primaryColor }}>
                  <span>جمع کل:</span>
                  <span dir="ltr">۱۷۴,۴۰۰ ریال</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t text-[9px] text-gray-500 text-center">
                <p>{footerText}</p>
                <p>{contactInfo} | {bankAccounts}</p>
              </div>
            </div>
          )}

          {/* ★★★ پیش‌نمایش قالب 8cm (باریک و بلند) */}
          {previewTemplate === '8cm' && (
            <div className="mx-auto border rounded-lg p-2 bg-white overflow-hidden" dir="rtl" style={{ maxWidth: '220px', minHeight: '400px' }}>
              <div className="text-center py-1.5 border-b-2" style={{ borderColor: primaryColor }}>
                {logoData && (
                  <img src={logoData} alt="logo" className="max-h-8 max-w-16 mx-auto mb-0.5 block" />
                )}
                <p className="text-[11px] font-bold" style={{ color: primaryColor }}>{headerText}</p>
                <p className="text-[8px] text-gray-600">فروشگاه نمونه</p>
                <p className="text-[8px] text-gray-500">{contactInfo}</p>
              </div>
              <div className="space-y-0.5 text-[9px] py-1.5 border-b border-dashed">
                <div className="flex justify-between gap-1">
                  <span className="text-gray-500">شماره:</span>
                  <span className="font-mono">INV-01401</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-gray-500">تاریخ:</span>
                  <span>۱۴۰۳/۱۲/۲۱</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-gray-500">مشتری:</span>
                  <span>محمد احمدی</span>
                </div>
              </div>
              <div className="py-1.5 border-b border-dashed">
                <div className="flex justify-between text-[8px] font-bold pb-0.5 border-b" style={{ color: primaryColor }}>
                  <span>کالا</span>
                  <span>مبلغ</span>
                </div>
                <div className="flex justify-between text-[9px] py-0.5">
                  <span className="truncate">شیر کاله × ۵</span>
                  <span dir="ltr" className="font-mono">۱۶۰,۰۰۰</span>
                </div>
                <div className="flex justify-between text-[9px] py-0.5">
                  <span className="truncate">نان بربری × ۲</span>
                  <span dir="ltr" className="font-mono">۴۰,۰۰۰</span>
                </div>
              </div>
              <div className="space-y-0.5 text-[9px] py-1.5">
                {showTax && (
                  <div className="flex justify-between gap-1">
                    <span className="text-gray-500">مالیات:</span>
                    <span dir="ltr" className="font-mono">۱۴,۴۰۰</span>
                  </div>
                )}
                {showDiscount && (
                  <div className="flex justify-between gap-1">
                    <span className="text-gray-500">تخفیف:</span>
                    <span dir="ltr" className="font-mono">۰</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1 border-t-2 gap-1" style={{ borderColor: primaryColor }}>
                  <span>جمع کل:</span>
                  <span dir="ltr" className="font-mono">۱۷۴,۴۰۰</span>
                </div>
              </div>
              <div className="text-center text-[8px] text-gray-500 mt-2 pt-1 border-t">
                <p>{footerText}</p>
                <p className="mt-0.5">{bankAccounts}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// =========== Backup Tab (Real API v4.3) ===========

interface BackupInfo {
  id: string
  fileName: string
  fileSize: number
  recordCount: number | null
  createdAt: string
}

function BackupTab() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [lastBackupResult, setLastBackupResult] = useState<any>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteBackupId, setDeleteBackupId] = useState<string | null>(null)

  const fetchBackups = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      // ★★★ تغییر: حذف tenantId از URL، Middleware خودش آن را از توکن می‌خواند
      const res = await fetch('/api/backup', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success && data.data) {
        setBackups(data.data)
      } else {
        setBackups([])
      }
    } catch {
      setBackups([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchBackups()
  }, [fetchBackups])

  // ایجاد پشتیبان جدید
  const handleCreateBackup = async () => {
    setCreating(true)
    setLastBackupResult(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        // ★★★ تغییر: دیگر نیازی به ارسال tenantId در body نیست
        body: JSON.stringify({}), 
      })
      const data = await res.json()
      if (data.success) {
        setLastBackupResult(data.data)
        fetchBackups()
      } else {
        alert(data.error || 'خطا در ایجاد پشتیبان')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setCreating(false)
  }

  // دانلود پشتیبان
  const handleDownloadBackup = async (backupId: string, fileName: string) => {
    try {
      const token = localStorage.getItem('token')
      // ★★★ تغییر: استفاده از API اختصاصی دانلود
      const res = await fetch(`/api/backup/download?id=${backupId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        alert('خطا در دانلود پشتیبان')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName // ★★★ استفاده از نام فایل واقعی سرور
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      alert('خطا در دانلود پشتیبان')
    }
  }

  // بازیابی از پشتیبان
  const handleRestore = async () => {
    if (!selectedBackupId) return
    setRestoring(true)
    try {
      const token = localStorage.getItem('token')
      // ★★★ تغییر: متد POST به جای PUT و آدرس جدید /api/backup/restore
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ backupId: selectedBackupId }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`بازیابی موفق! ${data.data.restoredCount} رکورد بازیابی شد. صفحه رفرش می‌شود...`)
        setRestoreDialogOpen(false)
        setSelectedBackupId(null)
        // رفرش صفحه برای اعمال تغییرات
        window.location.reload() 
      } else {
        alert(data.error || 'خطا در بازیابی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setRestoring(false)
  }

  // حذف پشتیبان
  const handleDeleteBackup = async () => {
    if (!deleteBackupId) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/backup?id=${deleteBackupId}`, { 
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        fetchBackups()
      } else {
        alert(data.error || 'خطا در حذف پشتیبان')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setDeleteDialogOpen(false)
    setDeleteBackupId(null)
  }

  // تابع کمکی برای فرمت حجم فایل
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fa-IR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="space-y-3">
      {/* کارت‌های عملیات اصلی */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* ایجاد پشتیبان */}
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <p className="text-sm font-bold text-emerald-800">ایجاد پشتیبان جدید</p>
            </div>
            <p className="text-[11px] text-emerald-700 leading-relaxed">
              یک نسخه فشرده و امن از تمام داده‌های فروشگاه (فاکتورها، حسابداری، انبار و...) در سرور ذخیره می‌شود.
            </p>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-8 text-xs"
              onClick={handleCreateBackup}
              disabled={creating}
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Database className="w-3.5 h-3.5 ml-1" />}
              {creating ? 'در حال پردازش...' : 'ایجاد پشتیبان'}
            </Button>
          </CardContent>
        </Card>

        {/* نتیجه آخرین پشتیبان‌گیری */}
        {lastBackupResult && (
          <Alert className="border-emerald-200 bg-emerald-50 py-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800 text-xs">
              پشتیبان با موفقیت ایجاد شد. 
              <span className="font-bold mr-1">حجم: {formatSize(lastBackupResult.fileSize)}</span>
              <span className="font-bold mr-1">| رکورد: {lastBackupResult.recordCount?.toLocaleString('fa-IR')}</span>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* لیست پشتیبان‌ها */}
      <Card className="border-gray-200">
        <CardHeader className="p-3 sm:p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-emerald-600" />
            پشتیبان‌های ذخیره شده ({backups.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span className="text-xs text-gray-500">در حال بارگذاری...</span>
            </div>
          ) : backups.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">هنوز هیچ پشتیبانی ایجاد نشده است.</p>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div key={backup.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100/80 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">{backup.fileName}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {formatDate(backup.createdAt)} • {formatSize(backup.fileSize)} 
                      {backup.recordCount && ` • ${backup.recordCount.toLocaleString('fa-IR')} رکورد`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => handleDownloadBackup(backup.id, backup.fileName)} title="دانلود فایل">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => { setSelectedBackupId(backup.id); setRestoreDialogOpen(true) }} title="بازیابی (جایگزینی داده‌ها)">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleteBackupId(backup.id); setDeleteDialogOpen(true) }} title="حذف دائمی">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* هشدار بازیابی */}
      <Alert className="border-amber-200 bg-amber-50/50 py-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <AlertDescription className="text-amber-800 text-xs leading-relaxed">
          <strong>توجه:</strong> عملیات «بازیابی»، تمام داده‌های فعلی فروشگاه را پاک کرده و داده‌های فایل پشتیبان را جایگزین می‌کند. این عمل <strong>غیرقابل بازگشت</strong> است.
        </AlertDescription>
      </Alert>

      {/* دیالوگ تأیید بازیابی */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              تأیید بازیابی از پشتیبان
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              با تأیید این عمل، <strong>تمام داده‌های فعلی</strong> فروشگاه حذف شده و داده‌های این پشتیبان جایگزین می‌شود. 
              <br/><br/>
              آیا کاملاً مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoring}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {restoring ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              بله، بازیابی کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* دیالوگ تأیید حذف پشتیبان */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف فایل پشتیبان</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف دائمی این فایل پشتیبان مطمئن هستید؟ این عمل فقط فایل بکاپ را پاک می‌کند و تأثیری روی داده‌های فعال فروشگاه ندارد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBackup}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              حذف دائمی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// =========== Subscription Tab ===========
// ★★★ v9.0: بازنویسی کامل ساختار پلن‌ها
//   - ۳ پلن: پایه / پیشرفته / حرفه‌ای  (نام کد: simple / professional / enterprise)
//   - ۲ دوره: سالانه (۳۶۵ روز) / مادام‌العمر (بدون انقضا)
//   - حذف پلن ماهانه
//   - قوانین ارتقا:
//       پایه → پیشرفته یا حرفه‌ای (در هر دوره)
//       پیشرفته → فقط حرفه‌ای (نمی‌تواند به پایه برگردد)
//       حرفه‌ای → هیچ تنزل‌ای ندارد
//       هر پلن سالانه می‌تواند به پلن مادام‌العمر همان سطح ارتقا کند
//   - نمایش قیمت واقعی هر پلن + مشخصات
//   - دکمه ارتقا (با اعمال قوانین ارتقا)
function SubscriptionTab() {
  const rawPlanName = useStore((s) => s.planName)
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [renewing, setRenewing] = useState(false)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success && data.data) {
          setStatus(data.data)
        }
      } catch (err) {
        console.error('Failed to fetch subscription status', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStatus()
  }, [])

  const handleRenewAnnual = async () => {
    setRenewing(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/subscription/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billingCycle: 'annual' }),
      })
      const data = await res.json()
      if (data.success) {
        alert('✅ اشتراک شما با موفقیت برای یک سال دیگر تمدید شد!')
        window.location.reload()
      } else {
        alert('❌ خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err) {
      alert('❌ خطا در ارتباط با سرور')
    } finally {
      setRenewing(false)
    }
  }

  const handleUpgrade = async (tierName: string, billingCycle: 'annual' | 'lifetime') => {
    setUpgrading(`${tierName}-${billingCycle}`)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tierName, billingCycle }),
      })
      const data = await res.json()
      if (data.success) {
        const cycleLabel = billingCycle === 'lifetime' ? 'مادام‌العمر' : 'سالانه'
        alert(`✅ پلن شما با موفقیت به ${cycleLabel} ارتقا یافت!`)
        window.location.reload()
      } else {
        alert('❌ خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err) {
      alert('❌ خطا در ارتباط با سرور')
    } finally {
      setUpgrading(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
  }

  if (!status) {
    return (
      <div className="text-center py-10 text-gray-500">
        <Lock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p>لطفاً یک بار از حساب خارج و دوباره وارد شوید (خطای احراز هویت)</p>
      </div>
    )
  }

  // ★★★ منطق عیب‌یابی و تشخیص قطعی پلن فعلی (رفع باگ basic/simple)
  const normalizedCurrent = (String(rawPlanName).toLowerCase() === 'basic' || String(rawPlanName).toLowerCase() === 'simple') ? 'simple' : String(rawPlanName)

  const PLANS_INFO = {
    simple: {
      label: 'پایه',
      icon: Zap,
      color: 'emerald',
      annualPrice: 1_590_000,
      lifetimePrice: 16_000_000,
      features: ['تا ۲ کاربر', '۲۰۰ محصول', '۵۰۰ فاکتور', 'داشبورد مالی'],
    },
    professional: {
      label: 'پیشرفته',
      icon: Crown,
      color: 'blue',
      annualPrice: 2_760_000,
      lifetimePrice: 28_000_000,
      features: ['تا ۵ کاربر', '۲۰۰۰ محصول', 'فاکتور نامحدود', 'حسابداری دوطرفه'],
      featured: true,
    },
    enterprise: {
      label: 'حرفه‌ای',
      icon: Building2,
      color: 'purple',
      annualPrice: 3_550_000,
      lifetimePrice: 36_000_000,
      features: ['کاربر نامحدود', 'محصول نامحدود', 'حسابداری شعب', 'اتصال مودیان'],
    },
  }

  return (
    <div className="space-y-6">
      {/* کارت وضعیت فعلی */}
      <Card className={`border-2 ${status.isLifetime ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'}`}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {status.isLifetime ? <Sparkles className="w-5 h-5 text-emerald-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              <div>
                <CardTitle className="text-lg">پلن فعلی: {status.tierNameFa || 'پایه'}</CardTitle>
                <CardDescription className="mt-1">{status.message}</CardDescription>
              </div>
            </div>
            <Badge className={status.isLifetime ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}>
              {status.isLifetime ? 'مادام‌العمر' : 'فعال'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* ★★★ کارت‌های پلن‌ها با ۳ دکمه در پلن فعال */}
      <div>
        <h3 className="text-base font-bold text-gray-800 mb-3">مدیریت اشتراک</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(PLANS_INFO) as any[]).map((pn: any) => {
            const info = PLANS_INFO[pn]
            const Icon = info.icon
            
            // ★★★ تشخیص درست پلن فعلی
            const isCurrent = pn === normalizedCurrent
            
            console.log(`[DEBUG Inside SettingsPage] pn: '${pn}' | raw: '${rawPlanName}' | normalized: '${normalizedCurrent}' | isCurrent: ${isCurrent}`)

            const colorClasses: any = {
              emerald: { border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', button: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
              blue: { border: 'border-blue-300', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', button: 'bg-blue-600 hover:bg-blue-700 text-white' },
              purple: { border: 'border-purple-300', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', button: 'bg-purple-600 hover:bg-purple-700 text-white' },
            }[info.color]

            return (
              <Card key={pn} className={`relative overflow-hidden transition-all hover:shadow-md ${colorClasses.border} ${isCurrent ? 'ring-2 ring-emerald-400' : ''} ${info.featured ? 'ring-2 ring-blue-400' : ''}`}>
                {isCurrent && <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-center text-[10px] font-bold py-1 z-10">پلن فعلی</div>}
                {info.featured && !isCurrent && <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-center text-[10px] font-bold py-1 z-10">پیشنهادی</div>}

                <CardContent className={`p-5 ${isCurrent || info.featured ? 'pt-8' : ''}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClasses.iconBg}`}>
                      <Icon className={`w-6 h-6 ${colorClasses.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{info.label}</h3>
                      <p className="text-[10px] text-gray-500">{pn}</p>
                    </div>
                  </div>

                  <div className="mb-4 space-y-1.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{info.annualPrice.toLocaleString('fa-IR')}</span>
                      <span className="text-xs text-gray-500">تومان/سالانه</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-medium text-gray-600">{info.lifetimePrice.toLocaleString('fa-IR')}</span>
                      <span className="text-[10px] text-gray-400">تومان/مادام‌العمر</span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-4 text-[11px]">
                    {info.features.map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-gray-600">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        {feat}
                      </div>
                    ))}
                  </div>

                  {/* ★★★ دکمه‌های عملیات - ۳ دکمه برای پلن فعال */}
                  <div className="space-y-2">
                    {isCurrent ? (
                      <>
                        {/* دکمه ۱: نشانگر پلن فعال */}
                        <Button className="w-full gap-2 bg-gray-100 text-gray-600 hover:bg-gray-100 cursor-default" disabled>
                          <CheckCircle2 className="w-4 h-4" />
                          پلن فعلی شما
                        </Button>
                        
                        {/* دکمه ۲: تمدید یک سال دیگر */}
                        <Button
                          className={`w-full gap-2 ${colorClasses.button}`}
                          onClick={handleRenewAnnual}
                          disabled={renewing || status.isLifetime}
                        >
                          {renewing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          {status.isLifetime ? 'تمدید (مادام‌العمر فعال)' : 'تمدید یک سال دیگر'}
                        </Button>
                        
                        {/* دکمه ۳: ارتقا به مادام‌العمر */}
                        <Button
                          variant="outline"
                          className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => handleUpgrade(pn, 'lifetime')}
                          disabled={upgrading === `${pn}-lifetime` || status.isLifetime}
                        >
                          {upgrading === `${pn}-lifetime` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {status.isLifetime ? 'مادام‌العمر فعال' : 'ارتقا به مادام‌العمر'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button className={`w-full gap-2 ${colorClasses.button}`} onClick={() => handleUpgrade(pn, 'annual')} disabled={upgrading === `${pn}-annual`}>
                          {upgrading === `${pn}-annual` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                          ارتقا به {info.label} (سالانه)
                        </Button>
                        <Button variant="outline" className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleUpgrade(pn, 'lifetime')} disabled={upgrading === `${pn}-lifetime`}>
                          {upgrading === `${pn}-lifetime` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          ارتقا به {info.label} (مادام‌العمر)
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ v9.0: کامپوننت کمکی PlanCycleRow
//    یک ردیف برای نمایش قیمت یک دوره (سالانه یا مادام‌العمر) + دکمه ارتقا
// ═══════════════════════════════════════════════════════════════
function PlanCycleRow({
  label,
  price,
  unit,
  icon,
  isCurrent,
  canUpgrade,
  isUpgrading,
  color,
  onUpgrade,
  highlight = false,
}: {
  label: string
  price: number
  unit: string
  icon: React.ReactNode
  isCurrent: boolean
  canUpgrade: boolean
  isUpgrading: boolean
  color: string
  onUpgrade: () => void
  highlight?: boolean
}) {
  const formatPrice = (n: number) => n.toLocaleString('fa-IR')
  return (
    <div
      className={`flex items-center justify-between gap-1 p-1 rounded ${
        isCurrent ? 'bg-white' : highlight ? 'bg-amber-50' : 'bg-gray-50'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[9px] text-gray-500 flex items-center gap-1">
          {icon}
          {label}
        </p>
        <p className="text-[11px] font-bold text-gray-900">
          {formatPrice(price)} <span className="text-[8px] text-gray-500">{unit}</span>
        </p>
      </div>
      {isCurrent ? (
        <Badge className="bg-emerald-100 text-emerald-700 text-[8px] shrink-0">فعال</Badge>
      ) : canUpgrade ? (
        <Button
          size="sm"
          className={`h-6 text-[10px] px-2 bg-${color}-600 hover:bg-${color}-700 text-white shrink-0`}
          onClick={onUpgrade}
          disabled={isUpgrading}
        >
          {isUpgrading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'ارتقا'}
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0" disabled title="این تنزل مجاز نیست">
          <Lock className="w-2.5 h-2.5" />
        </Button>
      )}
    </div>
  )
}

// =========== Employees Tab (FIXED v3) ===========
function EmployeesTab() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const storeTenantId = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)

  // ✅ FIX v6: استفاده از resolveTenantId با ۳ fallback
  const tenantId = resolveTenantId(currentTenant, storeTenantId, userTenantId)
  console.log('[EmployeesTab] currentTenant:', currentTenant, '→ tenantId:', tenantId)

  // ★★★ v9.3: در حالت دمو، افزودن کاربر جدید غیرفعال است
  //   فقط کاربران فعلی قابل ویرایش/حذف هستند
  //   دلیل: در دمو ۳ روزه، ساخت کاربر تستی باعث شلوغی و سردرگمی می‌شود
  const { isDemo } = useDemoStatus()

  // ✅ FIX v7: نوع محلی به جای StoreUser از mock-data (که ممکنه id نداشته باشه)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formMobile, setFormMobile] = useState('')
  const [formRole, setFormRole] = useState<'Cashier' | 'Manager'>('Cashier')
  const [formPermissions, setFormPermissions] = useState<string[]>(['pos'])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

  const CASHIER_PERMISSIONS = [
    { key: 'dashboard', label: 'داشبورد' },
    { key: 'pos', label: 'صندوق فروش' },
    { key: 'products', label: 'محصولات' },
    { key: 'categories', label: 'دسته‌بندی‌ها' },
    { key: 'customers', label: 'مشتریان' },
    { key: 'invoices', label: 'فاکتورها' },
    { key: 'installments', label: 'اقساط' },
    { key: 'accounting', label: 'حسابداری' },
    { key: 'reports', label: 'گزارشات' },
  ]

  const togglePermission = (key: string) => {
    setFormPermissions((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key])
  }

  // ✅ FIX v3: fetchUsers از آخرین tenantId استفاده می‌کنه (نه مقدار ذخیره‌شده در closure)
  const fetchUsers = useCallback(async () => {
    // ✅ FIX v6: tenantId رو از store بخون (با ۳ fallback)
    const currentTid = getTenantIdFromStore()
    console.log('[EmployeesTab] fetchUsers called, tid:', currentTid)

    if (!currentTid) {
      console.warn('[EmployeesTab] No tenantId, cannot fetch employees')
      setUsers([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/employees?tenantId=${currentTid}`)
      const data = await res.json()
      console.log('[EmployeesTab] API response:', JSON.stringify(data)?.substring(0, 300))

      if (data.success) {
        // ✅ FIX v7: استخراج مقاوم — API ممکنه data.data.users یا data.data یا data.employees برگردونه
        let usersList: any[] = []
        if (Array.isArray(data.data)) {
          usersList = data.data
        } else if (data.data && Array.isArray(data.data.users)) {
          usersList = data.data.users
        } else if (data.data && Array.isArray(data.data.employees)) {
          usersList = data.data.employees
        } else if (Array.isArray(data.employees)) {
          usersList = data.employees
        } else if (Array.isArray(data.users)) {
          usersList = data.users
        }
        console.log('[EmployeesTab] Extracted users:', usersList.length, usersList[0] ? Object.keys(usersList[0]) : 'empty')
        setUsers(usersList)
      } else {
        console.error('[EmployeesTab] API error:', data.error)
        setUsers([])
      }
    } catch (error) {
      console.error('[EmployeesTab] Fetch error:', error)
      setUsers([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tenantId) {
      fetchUsers()
    } else {
      setLoading(false)
    }
  }, [tenantId, fetchUsers])

  const resetForm = () => {
    setFormUsername('')
    setFormPassword('')
    setFormMobile('')
    setFormRole('Cashier')
    setFormPermissions(['pos'])
    setFormError('')
    setEditUserId(null)
  }

  const handleAddUser = () => {
    resetForm()
    setDialogOpen(true)
  }

  const handleEditUser = (user: any) => {
    setFormUsername(user.username)
    setFormPassword('')
    setFormMobile(user.mobile || '')
    setFormRole(user.role as 'Cashier' | 'Manager')
    let userPerms: string[] = []
    const p = user.permissions
    if (typeof p === 'string') {
      try { userPerms = JSON.parse(p) } catch { userPerms = [] }
    } else if (Array.isArray(p)) {
      userPerms = p
    }
    setFormPermissions(userPerms.length > 0 ? userPerms : ['pos'])
    setEditUserId(user.id || user.userId)
    setDialogOpen(true)
  }

  const handleSaveUser = async () => {
    setFormError('')
    if (!formUsername) { setFormError('نام کاربری الزامی است'); return }
    if (!editUserId && !formPassword) { setFormError('رمز عبور الزامی است'); return }
    if (formPassword && formPassword.length < 6) { setFormError('رمز عبور باید حداقل ۶ کاراکتر باشد'); return }
    setFormSaving(true)
    try {
      const tid = getTenantIdFromStore()
      console.log('[EmployeesTab] handleSaveUser tid:', tid, 'editUserId:', editUserId)
      if (!tid) { setFormError('خطا: tenantId در دسترس نیست'); setFormSaving(false); return }

      if (editUserId) {
        // ★★★ v3.16.1: ارسال employeeId (نه id) — مطابق API واقعی شما
        const requestBody = {
          employeeId: editUserId,
          username: formUsername,
          password: formPassword || undefined,
          mobile: formMobile,
          role: formRole,
          tenantId: tid,
          permissions: formRole === 'Cashier' ? formPermissions : undefined,
        }
        console.log('[EmployeesTab] PUT request body:', { ...requestBody, password: requestBody.password ? '***' : undefined })

        const res = await fetch('/api/employees', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        const data = await res.json()
        console.log('[EmployeesTab] PUT response:', data)

        if (!data.success) {
          setFormError(data.error || 'خطا در ویرایش کاربر')
          setFormSaving(false)
          return
        }
      } else {
        const requestBody = {
          username: formUsername,
          password: formPassword,
          mobile: formMobile,
          role: formRole,
          tenantId: tid,
          permissions: formRole === 'Cashier' ? formPermissions : undefined,
        }
        console.log('[EmployeesTab] POST request body:', { ...requestBody, password: '***' })

        const res = await fetch('/api/employees', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        const data = await res.json()
        console.log('[EmployeesTab] POST response:', data)

        if (!data.success) { setFormError(data.error || 'خطا در افزودن کاربر'); setFormSaving(false); return }
      }
      setDialogOpen(false)
      resetForm()
      fetchUsers()
    } catch (err: any) {
      console.error('[EmployeesTab] handleSaveUser error:', err)
      setFormError('خطا در ارتباط با سرور')
    }
    setFormSaving(false)
  }

  const toggleUserActive = async (user: any) => {
    try {
      const tid = getTenantIdFromStore()
      const userId = user.id || user.userId
      // ★★★ v3.16.1: استفاده از employeeId مطابق API شما
      const res = await fetch('/api/employees', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: userId,
          isActive: !user.isActive,
          tenantId: tid
        }),
      })
      const data = await res.json()
      if (data.success) fetchUsers()
      else console.error('[EmployeesTab] toggleUserActive error:', data.error)
    } catch (err) {
      console.error('[EmployeesTab] toggleUserActive error:', err)
    }
  }

  const handleDeleteClick = (userId: string) => {
    setDeleteUserId(userId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteUserId) return
    try {
      const tid = getTenantIdFromStore()
      const res = await fetch(`/api/employees?id=${deleteUserId}&tenantId=${tid}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchUsers()
      else alert(data.error || 'خطا در حذف کاربر')
    } catch { alert('خطا در ارتباط با سرور') }
    setDeleteDialogOpen(false)
    setDeleteUserId(null)
  }

  const getPermissionLabels = (user: any) => {
    if (user.role === 'Manager') return 'دسترسی کامل'
    let perms: string[] = []
    const p = user.permissions
    if (typeof p === 'string') { try { perms = JSON.parse(p) } catch { perms = [] } } else if (Array.isArray(p)) { perms = p }
    if (perms.length === 0) return 'بدون دسترسی'
    return perms.map((key) => CASHIER_PERMISSIONS.find((pp) => pp.key === key)?.label || key).join('، ')
  }

  return (
    <div className="space-y-1.5">
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              کاربران فروشگاه
              {isDemo && (
                <Badge className="bg-amber-100 text-amber-700 text-[10px] mr-1" variant="secondary">
                  دمو — فقط ویرایش
                </Badge>
              )}
            </CardTitle>
            {/* ★★★ v9.3: در حالت دمو، دکمه افزودن صندوق‌دار غیرفعال است */}
            {isDemo ? (
              <Button
                size="sm"
                disabled
                title="در حالت تست دمو، افزودن کاربر جدید غیرفعال است"
                className="bg-gray-300 text-gray-500 cursor-not-allowed w-full sm:w-auto gap-1"
              >
                <Lock className="w-3.5 h-3.5 ms-1" />
                افزودن صندوق‌دار (غیرفعال در دمو)
              </Button>
            ) : (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto" onClick={handleAddUser}>
                <Plus className="w-4 h-4 ms-1" />
                افزودن صندوق‌دار
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                <span className="ms-2 text-sm text-gray-500">در حال بارگذاری...</span>
              </div>
            ) : (
              <div className="overflow-x-auto" dir="rtl">
                <Table dir="rtl">
                  <TableHeader dir="rtl">
                    <TableRow className="bg-gray-50" dir="rtl">
                      <TableHead className="text-right text-xs whitespace-nowrap">نام کاربری</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap">نقش</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap hidden md:table-cell">مجوزها</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">موبایل</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap">وضعیت</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap hidden lg:table-cell">آخرین ورود</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody dir="rtl">
                    {users.map((user, index) => (
                      <TableRow key={user.id || user.userId || index} className="hover:bg-emerald-50/50" dir="rtl">
                        <TableCell className="text-sm font-medium whitespace-nowrap text-right">{user.username}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Badge className={`text-xs ${user.role === 'Manager' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`} variant="outline">
                            {user.role === 'Manager' ? 'مدیر' : 'صندوق‌دار'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 max-w-[180px] hidden md:table-cell text-right">
                          <span className="line-clamp-2">{getPermissionLabels(user)}</span>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap hidden sm:table-cell text-right" dir="ltr">{user.mobile || '\u2014'}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Badge className={`text-xs ${user.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`} variant="outline">
                            {user.isActive ? 'فعال' : 'غیرفعال'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 whitespace-nowrap hidden lg:table-cell text-right">{formatDate(user.lastLoginAt)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-700" onClick={() => handleEditUser(user)} title="ویرایش">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${user.isActive ? 'text-amber-500 hover:text-amber-700' : 'text-emerald-500 hover:text-emerald-700'}`} onClick={() => toggleUserActive(user)} title={user.isActive ? 'غیرفعال کردن' : 'فعال کردن'}>
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </Button>
                            {user.role !== 'Manager' && (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => handleDeleteClick(user.id || user.userId)} title="حذف">
                                <Trash2 className="w-3.5 h-3.5" />
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
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="w-[95vw] sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              {editUserId ? <><Pencil className="w-4 h-4 text-emerald-600 shrink-0" />ویرایش کاربر</> : <><Plus className="w-4 h-4 text-emerald-600 shrink-0" />افزودن کاربر جدید</>}
            </DialogTitle>
            <DialogDescription className="text-sm">{editUserId ? 'اطلاعات کاربر را ویرایش کنید' : 'اطلاعات کاربر جدید را وارد کنید'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 sm:py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="emp-username">نام کاربری</Label>
                <Input id="emp-username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} placeholder="مثال: cashier3" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-password">رمز عبور {editUserId && '(خالی = بدون تغییر)'}</Label>
                <Input id="emp-password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="حداقل ۶ کاراکتر" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="emp-mobile">شماره موبایل</Label>
                <Input id="emp-mobile" type="tel" value={formMobile} onChange={(e) => setFormMobile(e.target.value)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-role">نقش</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as 'Cashier' | 'Manager')}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cashier">صندوق‌دار</SelectItem>
                    <SelectItem value="Manager">مدیر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formRole === 'Cashier' && (
              <div className="space-y-2 p-2.5 sm:p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <Label className="text-sm font-semibold text-amber-800">مجوزهای دسترسی صندوق‌دار</Label>
                </div>
                <p className="text-xs text-amber-700">منوهایی که این صندوق‌دار می‌بیند و به آنها دسترسی دارد. مدیر همیشه دسترسی کامل دارد.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {CASHIER_PERMISSIONS.map((perm) => (
                    <label key={perm.key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${formPermissions.includes(perm.key) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={formPermissions.includes(perm.key)} onChange={() => togglePermission(perm.key)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
                      <span className="truncate">{perm.label}</span>
                    </label>
                  ))}
                </div>
                {formPermissions.length === 0 && <p className="text-xs text-red-500 mt-1">حداقل یک مجوز باید انتخاب شود</p>}
              </div>
            )}
            {formRole === 'Manager' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-emerald-800">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>مدیر دسترسی کامل به تمام بخش‌ها دارد</span>
                </div>
              </div>
            )}
            {formError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <AlertDescription className="text-red-700 text-sm">{formError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }} className="w-full sm:w-auto">انصراف</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto" onClick={handleSaveUser} disabled={formSaving || (formRole === 'Cashier' && formPermissions.length === 0)}>
              {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editUserId ? 'ذخیره تغییرات' : 'افزودن کاربر'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[95vw] sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کاربر</AlertDialogTitle>
            <AlertDialogDescription>آیا از حذف این کاربر اطمینان دارید؟ این عمل قابل بازگشت نیست.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// =========== Helper: Collapsible Section ===========
function CollapsibleSection({ title, children, open, onToggle }: { title: string; children?: React.ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <Card className="border-gray-200">
      <button className="w-full p-2.5 sm:p-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-lg text-right gap-2" onClick={onToggle}>
        <span className="text-sm font-medium text-gray-700 min-w-0">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>
      {open && <CardContent className="pt-0 pb-3 sm:pb-4 px-3 sm:px-4">{children}</CardContent>}
    </Card>
  )
}

// =========== Enterprise Tab (v3.25 — Enhanced) ===========
function EnterpriseTab() {
  const planName = useAppStore((s) => s.planName)
  const features = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const [fiscalYearClosing, setFiscalYearClosing] = useState(false)
  const [fiscalYearResult, setFiscalYearResult] = useState<any>(null)
  const [moidianStatus, setMoidianStatus] = useState<any>(null)

  // ★★★ v8.2: state‌های مربوط به branches و consolidatedReport حذف شدند
  //   چون مدیریت شعب به منوی اختصاصی منتقل شد
  // ★★★ v8.2: state‌های moidian (apiKey, privateKey, saving, sending) حذف شدند
  //   چون تنظیمات مودیان به تب اختصاصی منتقل شد

  const loadMoidian = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/moidian', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setMoidianStatus(data.data)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (features.canMoidianIntegration) loadMoidian()
  }, [features.canMoidianIntegration, loadMoidian])

  // ★★★ v8.2: handleSaveBranch حذف شد — به branches-page منتقل شد

  // ★★★ v8.2: handleSaveMoidianConfig حذف شد — به moidian-tab منتقل شد

  const handleFiscalYearClose = async () => {
    if (!confirm('آیا از بستن سال مالی اطمینان دارید؟ این عمل تمام حساب‌های درآمد و هزینه را صفر کرده و سود/زیان را به سود انباشته منتقل می‌کند.')) return
    setFiscalYearClosing(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-year/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setFiscalYearResult(data.data)
        alert(data.message)
      } else {
        alert(data.error || 'خطا در بستن سال مالی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setFiscalYearClosing(false)
  }

  // ★★★ v8.2: handleSendMoidian حذف شد — به moidian-tab منتقل شد


  // ★ اگه پلن سازمانی نیست
  if (!features.canMultiBranch) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-6 text-center">
          <Crown className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-2">قابلیت‌های سازمانی</h3>
          <p className="text-xs text-gray-500 mb-4">
            مدیریت شعب، بستن سال مالی، اتصال سامانه مودیان و گزارش تلفیقی فقط در پلن سازمانی در دسترس است
          </p>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => useAppStore.getState().setCurrentView('settings-subscription' as any)}>
            ارتقا به پلن سازمانی
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* ★★★ v8.2: مدیریت شعب به منوی اختصاصی منتقل شد */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-purple-600" />
            مدیریت شعب
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★ مدیریت کامل شعب (ایجاد، ویرایش، حذف، فعال‌سازی) به منوی اختصاصی «شعب» در نوار کناری منتقل شد. در آن منو می‌توانید:
          </p>
          <ul className="text-[10px] text-gray-600 leading-relaxed pr-3 list-disc space-y-0.5">
            <li>شعبه جدید با کد، آدرس، تلفن و مدیر ایجاد کنید</li>
            <li>شعبه‌های موجود را ویرایش یا حذف کنید</li>
            <li>انبارهای هر شعبه را مشاهده کنید</li>
            <li>فعال/غیرفعال کردن شعبه‌ها</li>
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="border-purple-300 text-purple-600 hover:bg-purple-50 text-[11px] h-7 w-full"
            onClick={() => useAppStore.getState().setCurrentView('branches' as any)}
          >
            <Building2 className="w-3 h-3 ml-1" />
            رفتن به منوی شعب
          </Button>
        </CardContent>
      </Card>

      {/* ★★★ v3.26: مدیریت سال مالی — انتقال به تب اختصاصی */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
            مدیریت سال مالی
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★★★ v3.26: مدیریت کامل سال مالی (تعریف، فعال‌سازی، بستن و تاریخچه) به تب اختصاصی منتقل شد. در آن تب می‌توانید:
          </p>
          <ul className="text-[10px] text-gray-600 leading-relaxed pr-3 list-disc space-y-0.5">
            <li>سال مالی جدید با تاریخ شروع/پایان شمسی تعریف کنید</li>
            <li>سال فعال را مشاهده و پیشرفت آن را دنبال کنید</li>
            <li>سال‌های قبلی را فعال یا ویرایش کنید</li>
            <li>سال فعلی را ببندید (با ایجاد خودکار سال جدید)</li>
            <li>تاریخچه کامل سال‌های بسته‌شده را ببینید</li>
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-600 hover:bg-emerald-50 text-[11px] h-7 w-full"
            onClick={() => {
              // ★ جستجوی دکمه تب «سال مالی» و کلیک روی آن
              const triggers = document.querySelectorAll('[role="tab"]')
              triggers.forEach((t) => {
                if (t.getAttribute('value') === 'fiscal-year' || t.textContent?.includes('سال مالی')) {
                  ;(t as HTMLElement).click()
                }
              })
            }}
          >
            <CalendarDays className="w-3 h-3 ml-1" />
            رفتن به تب سال مالی
          </Button>
        </CardContent>
      </Card>

      {/* ★★★ v8.2: اتصال سامانه مودیان — به تب اختصاصی منتقل شد */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            اتصال سامانه مودیان
            <Badge className={`text-[9px] ${moidianStatus?.config?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {moidianStatus?.config?.connected ? 'متصل' : 'غیرفعال'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★ تنظیمات کامل اتصال به سامانه مودیان (کلید API، کلید خصوصی، ارسال فاکتورها) در تب اختصاصی «سامانه مودیان» در دسترس است.
          </p>
          {moidianStatus?.stats && (
            <div className="bg-white rounded p-2 border border-gray-200 text-[10px] space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">فاکتورهای قابل ارسال:</span><span className="font-mono text-blue-600">{moidianStatus.stats.pendingInvoices?.toLocaleString('fa-IR') || '۰'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">فاکتورهای ارسال‌شده:</span><span className="font-mono text-emerald-600">{moidianStatus.stats.sentInvoices?.toLocaleString('fa-IR') || '۰'}</span></div>
              {moidianStatus.config?.fiscalId && (
                <div className="flex justify-between pt-1 border-t border-gray-100"><span className="text-gray-500">شناسه مالیاتی:</span><span className="font-mono text-gray-700" dir="ltr">{moidianStatus.config.fiscalId}</span></div>
              )}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-600 hover:bg-blue-50 text-[11px] h-7 w-full"
            onClick={() => {
              // ★ جستجوی دکمه تب «سامانه مودیان» و کلیک روی آن
              const triggers = document.querySelectorAll('[role="tab"]')
              triggers.forEach((t) => {
                if (t.getAttribute('value') === 'moidian' || t.textContent?.includes('مودیان')) {
                  ;(t as HTMLElement).click()
                }
              })
            }}
          >
            <Database className="w-3 h-3 ml-1" />
            رفتن به تب سامانه مودیان
          </Button>
        </CardContent>
      </Card>

      {/* ★★★ v8.2: گزارش تلفیقی شعب — به منوی گزارش‌ها منتقل شد */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5 text-purple-600" />
            گزارش تلفیقی شعب
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★ گزارش تلفیقی شعب (فروش، هزینه، سود به تفکیک شعبه) در منوی «گزارش‌ها» در دسترس است. در آن منو می‌توانید گزارش‌های پیشرفته را مشاهده کنید.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-purple-300 text-purple-600 hover:bg-purple-50 text-[11px] h-7 w-full"
            onClick={() => useAppStore.getState().setCurrentView('reports' as any)}
          >
            <Crown className="w-3 h-3 ml-1" />
            مشاهده گزارش‌ها
          </Button>
        </CardContent>
      </Card>

      {/* ★★★ v8.2: دیالوگ افزودن شعبه حذف شد — به منوی شعب منتقل شد */}
    </div>
  )
}

// =========== Fiscal Year Tab (v3.26 ★★★ — Enterprise) ===========
// ★ مدیریت کامل سال مالی: تعریف، فعال‌سازی، بستن، تاریخچه
function FiscalYearTab() {
  const planName = useAppStore((s) => s.planName)
  const features = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const { toast } = useToast()  // ★★★ v8.8: برای هشدار بستن سال

  // ─── state ──────────────────────────────────────────────
  const [years, setYears] = useState<any[]>([])
  const [activeYear, setActiveYear] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // ★ فرم تعریف سال جدید
  // ★★★ v3.27: تغییر state از jalali string به ISO (برای کار با PersianDatePicker)
  const [formOpen, setFormOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formStartISO, setFormStartISO] = useState<string | null>(null)
  const [formEndISO, setFormEndISO] = useState<string | null>(null)
  const [formActivate, setFormActivate] = useState(true)
  const [formSaving, setFormSaving] = useState(false)

  // ★ دیالوگ تأیید بستن سال
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeLoading, setCloseLoading] = useState(false)
  const [closeResult, setCloseResult] = useState<any>(null)

  // ★ ویرایش نام سال
  const [editingYear, setEditingYear] = useState<any>(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // ─── بارگذاری سال‌های مالی ─────────────────────────────
  const loadYears = useCallback(async () => {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setYears(data.data.years || [])
          setActiveYear(data.data.activeYear || null)
        }
      }
    } catch (err) {
      console.error('[FiscalYearTab] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (features.canFiscalYearManagement || features.canCloseFiscalYear) {
      loadYears()
    }
  }, [features.canFiscalYearManagement, features.canCloseFiscalYear, loadYears, refreshKey])

  // ─── پیش‌فرض فرم با امروز و سال بعد ──────────────────
  // ★★★ v3.27: حالا با ISO کار می‌کنیم (نه jalali string)
  useEffect(() => {
    if (formOpen && !formStartISO) {
      const isoToday = todayISO()
      setFormStartISO(isoToday)
      // پایان = امروز + ۳۶۵ روز (تقریبی)
      const d = new Date(isoToday)
      d.setDate(d.getDate() + 364)
      const endIso = d.toISOString().slice(0, 10)
      setFormEndISO(endIso)
      // نام پیش‌فرض = «سال مالی YYYY» (با سال شمسی)
      const jToday = gregorianISOToJalali(isoToday)
      if (jToday) {
        const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
        const toFa = (n: number) => String(n).replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
        setFormName(`سال مالی ${toFa(jToday[0])}`)
      }
    }
  }, [formOpen, formStartISO])

  // ─── ذخیره سال جدید ─────────────────────────────────
  // ★★★ v3.27: حالا با ISO کار می‌کنیم
  const handleSave = async () => {
    // اعتبارسنجی
    if (!formName.trim() || formName.trim().length < 2) {
      alert('نام سال مالی باید حداقل ۲ کاراکتر باشد')
      return
    }
    if (!formStartISO || !formEndISO) {
      alert('تاریخ شروع و پایان الزامی هستند')
      return
    }
    if (formStartISO >= formEndISO) {
      alert('تاریخ شروع باید قبل از تاریخ پایان باشد')
      return
    }

    setFormSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: formName.trim(),
          startDate: formStartISO,
          endDate: formEndISO,
          activate: formActivate,
        }),
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        setFormOpen(false)
        setFormName('')
        setFormStartISO(null)
        setFormEndISO(null)
        setFormActivate(true)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در ایجاد سال مالی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setFormSaving(false)
  }

  // ─── فعال‌سازی سال ─────────────────────────────────
  const handleActivate = async (yearId: string, yearName: string) => {
    if (!confirm(`آیا از فعال‌سازی سال مالی «${yearName}» مطمئن هستید؟ سال فعلی غیرفعال خواهد شد.`)) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fiscal-years/${yearId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'activate' }),
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در فعال‌سازی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
  }

  // ─── ویرایش نام سال ─────────────────────────────────
  const handleEditSave = async () => {
    if (!editingYear) return
    if (!editName.trim() || editName.trim().length < 2) {
      alert('نام سال مالی باید حداقل ۲ کاراکتر باشد')
      return
    }
    setEditSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fiscal-years/${editingYear.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'update', name: editName.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        setEditingYear(null)
        setEditName('')
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در به‌روزرسانی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setEditSaving(false)
  }

  // ─── حذف سال ─────────────────────────────────────
  const handleDelete = async (yearId: string, yearName: string) => {
    if (!confirm(`آیا از حذف سال مالی «${yearName}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`)) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(`/api/fiscal-years/${yearId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در حذف')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
  }

  // ─── بستن سال فعال ─────────────────────────────────
  const handleCloseConfirm = async () => {
    setCloseLoading(true)
    setCloseResult(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/fiscal-years', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setCloseResult(data.data)
        alert(data.message)
        setCloseDialogOpen(false)
        setRefreshKey((k) => k + 1)
      } else {
        alert(data.error || 'خطا در بستن سال مالی')
      }
    } catch {
      alert('خطا در ارتباط با سرور')
    }
    setCloseLoading(false)
  }

  // ─── پلن سازمانی نیست ─────────────────────────────────
  if (!features.canFiscalYearManagement && !features.canCloseFiscalYear) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-6 text-center">
          <CalendarDays className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-2">مدیریت سال مالی</h3>
          <p className="text-xs text-gray-500 mb-4">
            تعریف، فعال‌سازی و بستن سال‌های مالی فقط در پلن سازمانی در دسترس است. این قابلیت برای نگهداری تاریخچه حسابداری دوره‌ای و گزارش‌گیری صحیح ضروری است.
          </p>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => useAppStore.getState().setCurrentView('settings-subscription' as any)}>
            ارتقا به پلن سازمانی
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* ★★★ کارت سال فعال فعلی */}
      <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50/50 to-transparent">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
              سال مالی فعال
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] border-emerald-300 text-emerald-600 hover:bg-emerald-50"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
              title="به‌روزرسانی"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-1">
          {loading && !activeYear ? (
            <div className="py-3 text-center">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500 mx-auto" />
              <p className="text-[10px] text-gray-400 mt-1">در حال بارگذاری...</p>
            </div>
          ) : activeYear ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">{activeYear.name}</p>
                  <p className="text-[10px] text-gray-500" dir="ltr">
                    {isoToJalaliFa(activeYear.startDate)} — {isoToJalaliFa(activeYear.endDate)}
                  </p>
                </div>
                {activeYear.progress !== undefined && (
                  <div className="text-left">
                    <div className="text-[10px] text-gray-500 mb-0.5">پیشرفت</div>
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${activeYear.progress}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-emerald-600 mt-0.5 font-mono">
                      {(activeYear.progress || 0).toLocaleString('fa-IR')}٪
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-emerald-100">
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">تعداد اسناد</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(activeYear.entryCount || 0).toLocaleString('fa-IR')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">مدت سال</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(() => {
                      const start = new Date(activeYear.startDate).getTime()
                      const end = new Date(activeYear.endDate).getTime()
                      const days = Math.round((end - start) / (1000 * 60 * 60 * 24))
                      return days.toLocaleString('fa-IR') + ' روز'
                    })()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">روزهای باقی‌مانده</div>
                  <div className="text-xs font-bold text-gray-700">
                    {(() => {
                      const end = new Date(activeYear.endDate).getTime()
                      const now = Date.now()
                      const days = Math.max(0, Math.round((end - now) / (1000 * 60 * 60 * 24)))
                      return days.toLocaleString('fa-IR') + ' روز'
                    })()}
                  </div>
                </div>
              </div>
              {features.canCloseFiscalYear && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 text-[11px] h-7 w-full mt-1"
                  onClick={() => {
                    // ★★★ v8.8: بررسی ۳۶۵ روز قبل از باز کردن مودال
                    if (activeYear) {
                      const startDate = new Date(activeYear.startDate)
                      const now = new Date()
                      const daysPassed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                      if (daysPassed < 365) {
                        const remaining = 365 - daysPassed
                        toast({
                          title: 'بستن سال مالی ممکن نیست',
                          description: `هنوز سال مالی به اتمام نرسیده است. ${remaining.toLocaleString('fa-IR')} روز تا پایان سال مالی باقی مانده است.`,
                          variant: 'destructive',
                        })
                        return
                      }
                    }
                    setCloseResult(null)
                    setCloseDialogOpen(true)
                  }}
                >
                  <Archive className="w-3 h-3 ml-1" />
                  بستن این سال مالی
                </Button>
              )}
            </div>
          ) : (
            <div className="py-3 text-center">
              <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-[11px] text-gray-600 mb-2">هیچ سال مالی فعالی وجود ندارد</p>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] h-7"
                onClick={() => setFormOpen(true)}
              >
                <Plus className="w-3 h-3 ml-1" />
                تعریف سال اول
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ★★★ دکمه تعریف سال جدید + عنوان لیست */}
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              همه سال‌های مالی
              <Badge className="text-[9px] bg-blue-100 text-blue-700 mr-1">
                {years.length.toLocaleString('fa-IR')} سال
              </Badge>
            </CardTitle>
            {features.canFiscalYearManagement && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] border-blue-300 text-blue-600 hover:bg-blue-50"
                onClick={() => setFormOpen(true)}
              >
                <Plus className="w-3 h-3 ml-1" />
                سال جدید
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-1">
          {loading && years.length === 0 ? (
            <div className="py-3 text-center">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 mx-auto" />
            </div>
          ) : years.length === 0 ? (
            <p className="text-[11px] text-gray-400 py-3 text-center">
              هنوز سال مالی تعریف نشده است
            </p>
          ) : (
            <div className="space-y-1" dir="rtl">
              {years.map((y) => (
                <div
                  key={y.id}
                  className={`flex items-center justify-between px-2 py-1.5 rounded border ${
                    y.isActive
                      ? 'bg-emerald-50 border-emerald-200'
                      : y.isClosed
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {y.isActive ? (
                      <PlayCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : y.isClosed ? (
                      <Archive className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      {editingYear?.id === y.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-6 text-xs"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-6 px-2 bg-emerald-600 text-white"
                            onClick={handleEditSave}
                            disabled={editSaving}
                          >
                            {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'ذخیره'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => setEditingYear(null)}
                          >
                            انصراف
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-medium text-gray-800 truncate">
                              {y.name}
                            </span>
                            {y.isActive && (
                              <Badge className="text-[9px] bg-emerald-100 text-emerald-700">فعال</Badge>
                            )}
                            {y.isClosed && (
                              <Badge className="text-[9px] bg-gray-200 text-gray-600">بسته‌شده</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[9px] text-gray-500" dir="ltr">
                            <span>{isoToJalaliFa(y.startDate)} — {isoToJalaliFa(y.endDate)}</span>
                          </div>
                          {y.isClosed && y.closedAt && (
                            <div className="text-[9px] text-gray-400 mt-0.5">
                              <Clock className="w-2.5 h-2.5 inline ml-0.5" />
                              بسته شد: {isoToJalaliFa(y.closedAt.toISOString ? y.closedAt.toISOString() : y.closedAt)}
                            </div>
                          )}
                          {y.notes && (
                            <div className="text-[9px] text-gray-400 mt-0.5 truncate">
                              <Info className="w-2.5 h-2.5 inline ml-0.5" />
                              {y.notes}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {y.entryCount > 0 && (
                      <Badge className="text-[9px] bg-blue-50 text-blue-600" title="تعداد اسناد">
                        {y.entryCount.toLocaleString('fa-IR')} سند
                      </Badge>
                    )}
                    {features.canFiscalYearManagement && !y.isClosed && !y.isActive && editingYear?.id !== y.id && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => handleActivate(y.id, y.name)}
                          title="فعال‌سازی"
                        >
                          <PlayCircle className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-100"
                          onClick={() => {
                            setEditingYear(y)
                            setEditName(y.name)
                          }}
                          title="ویرایش نام"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                          onClick={() => handleDelete(y.id, y.name)}
                          title="حذف"
                          disabled={y.entryCount > 0}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    {features.canFiscalYearManagement && !y.isClosed && y.isActive && editingYear?.id !== y.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-100"
                        onClick={() => {
                          setEditingYear(y)
                          setEditName(y.name)
                        }}
                        title="ویرایش نام"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ★★★ راهنما */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-2.5">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-[10px] text-gray-600 leading-relaxed space-y-1">
              <p>
                <strong className="text-blue-700">سال فعال:</strong> تمام اسناد حسابداری جدید به این سال متصل می‌شوند. در هر لحظه فقط یک سال فعال می‌تواند وجود داشته باشد.
              </p>
              <p>
                <strong className="text-gray-700">سال بسته‌شده:</strong> قابل ویرایش یا حذف نیست. برای حفظ سابقه حسابداری، سال‌های بسته‌شده دائمی هستند.
              </p>
              <p>
                <strong className="text-emerald-700">بستن سال:</strong> تمام حساب‌های درآمد و هزینه صفر شده، سود/زیان به حساب سود انباشته منتقل می‌شود، و سال جدید به‌صورت خودکار ایجاد و فعال می‌شود.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ★★★ دیالوگ تعریف سال جدید */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[480px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-emerald-600" />
              تعریف سال مالی جدید
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              سال مالی دوره‌ای است که اسناد حسابداری در آن ثبت می‌شوند. در هر لحظه فقط یک سال فعال می‌تواند وجود داشته باشد.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* نام */}
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">نام سال مالی *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثلاً: سال مالی ۱۴۰۳"
                className="h-8 text-xs"
              />
            </div>
            {/* تاریخ شروع */}
            <div>
              {/* ★★★ v3.27: استفاده از PersianDatePicker به‌جای Input متنی */}
              <PersianDatePicker
                value={formStartISO}
                onChange={setFormStartISO}
                placeholder="انتخاب تاریخ شروع"
                label="تاریخ شروع (شمسی) *"
                maxDate={formEndISO || undefined}
              />
            </div>
            {/* تاریخ پایان */}
            <div>
              <PersianDatePicker
                value={formEndISO}
                onChange={setFormEndISO}
                placeholder="انتخاب تاریخ پایان"
                label="تاریخ پایان (شمسی) *"
                minDate={formStartISO || undefined}
              />
              <p className="text-[9px] text-gray-400 mt-0.5">
                اسفند ۳۰ روز است (۲۹ در سال غیر کبیسه)
              </p>
            </div>
            {/* فعال‌سازی */}
            <div className="flex items-center justify-between bg-emerald-50/50 border border-emerald-200 rounded p-2">
              <div>
                <Label className="text-[11px] text-emerald-700">فعال‌سازی به‌عنوان سال جاری</Label>
                <p className="text-[9px] text-gray-500">سال فعلی غیرفعال و این سال فعال می‌شود</p>
              </div>
              <Switch checked={formActivate} onCheckedChange={setFormActivate} />
            </div>
            {/* پیش‌نمایش تاریخ‌ها */}
            {/* ★★★ v3.27: حالا با ISO کار می‌کنیم */}
            {formStartISO && formEndISO && (
              <div className="bg-gray-50 rounded p-2 text-[10px] text-gray-600 space-y-0.5">
                <div className="flex justify-between">
                  <span>تاریخ شروع (شمسی):</span>
                  <span className="font-mono" dir="ltr">
                    {isoToJalaliFa(formStartISO)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>تاریخ پایان (شمسی):</span>
                  <span className="font-mono" dir="ltr">
                    {isoToJalaliFa(formEndISO)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>تاریخ شروع (میلادی):</span>
                  <span className="font-mono" dir="ltr">{formStartISO}</span>
                </div>
                <div className="flex justify-between">
                  <span>تاریخ پایان (میلادی):</span>
                  <span className="font-mono" dir="ltr">{formEndISO}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-200">
                  <span>مدت سال:</span>
                  <span className="font-mono">
                    {(() => {
                      const start = new Date(formStartISO)
                      const end = new Date(formEndISO)
                      const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
                      return days.toLocaleString('fa-IR') + ' روز'
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="text-xs h-8">
              انصراف
            </Button>
            <Button
              onClick={handleSave}
              disabled={formSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            >
              {formSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 ml-1" />}
              ایجاد سال مالی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ دیالوگ تأیید بستن سال */}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              تأیید بستن سال مالی
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-relaxed">
              {activeYear ? (
                <>
                  در حال بستن سال مالی «<strong>{activeYear.name}</strong>» هستید.
                  <br />
                  این عملیات غیرقابل بازگشت است و:
                  <br />
                  • تمام حساب‌های درآمد و هزینه صفر می‌شوند
                  <br />
                  • سود/زیان به حساب سود انباشته منتقل می‌شود
                  <br />
                  • سند بستن سال مالی ایجاد می‌شود
                  <br />
                  • سال جدید با تاریخ شروع = روز بعد از پایان این سال ایجاد و فعال می‌شود
                  <br /><br />
                  <strong className="text-red-600">توصیه:</strong> قبل از بستن سال، حتماً از سیستم پشتیبان بگیرید.
                </>
              ) : (
                'سال فعالی برای بستن وجود ندارد.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {closeResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-[10px] space-y-1 my-2">
              <div className="font-bold text-emerald-700 pb-1 border-b border-emerald-100">نتیجه بستن سال:</div>
              <div className="flex justify-between">
                <span>درآمد کل:</span>
                <span className="font-mono text-emerald-600">
                  {(closeResult.totalRevenue || 0).toLocaleString('fa-IR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>هزینه کل:</span>
                <span className="font-mono text-red-600">
                  {(closeResult.totalExpense || 0).toLocaleString('fa-IR')}
                </span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-emerald-100">
                <span>سود/زیان خالص:</span>
                <span className={`font-mono ${(closeResult.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {(closeResult.netProfit || 0).toLocaleString('fa-IR')}
                </span>
              </div>
              {closeResult.newYear && (
                <div className="pt-1 border-t border-emerald-100 text-emerald-700">
                  ✓ سال جدید «{closeResult.newYear.name}» ایجاد و فعال شد
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="text-xs h-8">انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseConfirm}
              disabled={closeLoading || !activeYear}
              className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
            >
              {closeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Archive className="w-3.5 h-3.5 ml-1" />}
              بستن سال مالی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// =========== SMS Notifications Tab (v5.2 ★★★ Phase 4) ===========
//   اعلان‌های SMS برای یادآوری اقساط سررسید‌شده
//   - فعال/غیرفعال کردن SMS
//   - تنظیم روزهای یادآوری (قبل، روز، بعد)
//   - مشاهده لاگ پیامک‌های ارسالی
function SmsNotificationsTab() {
  const planName = useAppStore((s) => s.planName)
  const currentTenant = useAppStore((s) => s.currentTenant)

  // ★ فقط در پلن حرفه‌ای و سازمانی فعال است (canAccessInstallments)
  const features = getFeaturesByPlanName(planName || currentTenant?.planName || currentTenant?.planTierName || 'simple')
  const canUseSms = features.canAccessInstallments

  const [settings, setSettings] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ★ state فرم
  const [isEnabled, setIsEnabled] = useState(true)
  const [daysBeforeDue, setDaysBeforeDue] = useState(1)
  const [sendOnDueDate, setSendOnDueDate] = useState(true)
  const [daysAfterDue, setDaysAfterDue] = useState(3)
  const [sendHour, setSendHour] = useState(9)
  // ★★★ v5.2.1: دقیقه ارسال
  const [sendMinute, setSendMinute] = useState(30)

 const loadData = useCallback(async () => {
  setLoading(true)
  try {
    const tid = getTenantIdFromStore()
    if (!tid) return

    const token = typeof window !== 'undefined'
      ? localStorage.getItem('token')
      : null
    
    // ★ اصلاح: تایپ صریح
    const headers: Record<string, string> = token 
      ? { Authorization: `Bearer ${token}` } 
      : {}

    const [balRes, prodRes] = await Promise.all([
      fetch('/api/initial-balance', { headers }),
      fetch(`/api/products?limit=100&tenantId=${tid}`),
    ])

    const balData = await balRes.json()
    const prodData = await prodRes.json()

    if (balData.success) {
      // ... بقیه کد
    }
    
    // ... بقیه کد
  } catch (err) {
    console.error('[InitialBalanceTab] Load error:', err)
  } finally {
    setLoading(false)
  }
}, [])
  useEffect(() => {
    loadData()
  }, [loadData])

  // ★★★ v5.2.1: helper — فرمت ۲۴ ساعته به ۱۲ ساعته با AM/PM
  const formatTo12Hour = (hour: number, minute: number): string => {
    const period = hour < 12 ? 'صبح' : hour < 17 ? 'بعدازظهر' : 'شب'
    const h12 = hour % 12 || 12
    return `${h12.toLocaleString('fa-IR')}:${minute.toString().padStart(2, '0').replace('0', '۰').replace('1', '۱').replace('2', '۲').replace('3', '۳').replace('4', '۴').replace('5', '۵').replace('6', '۶').replace('7', '۷').replace('8', '۸').replace('9', '۹')} ${period}`
  }

  // ★ ذخیره تنظیمات
  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/sms-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          isEnabled,
          daysBeforeDue,
          sendOnDueDate,
          daysAfterDue,
          sendHour,
          sendMinute,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('تنظیمات با موفقیت ذخیره شد')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'خطا در ذخیره')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setSaving(false)
    }
  }

  // ★ تست ارسال پیامک (در محیط dev)
  const handleTestSend = async () => {
    setError('')
    setSuccess('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/cron/installment-reminders?secret=' + process.env.NEXT_PUBLIC_CRON_SECRET, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(`کرون جاب اجرا شد: ${data.data.smsSent} پیامک واقعی، ${data.data.mockSent} پیامک تست`)
        setTimeout(() => setSuccess(''), 5000)
        loadData() // رفرش لاگ‌ها
      } else {
        setError(data.error || 'خطا در اجرای کرون جاب')
      }
    } catch (err: any) {
      setError('برای تست کرون جاب، آن را به‌صورت دستی اجرا کنید')
    }
  }

  // ★ اگر پلن ساده است
  if (!canUseSms) {
    return (
      <Card className="border-amber-200">
        <CardContent className="p-6 text-center">
          <MessageSquare className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-2">اعلان‌های SMS فقط در پلن حرفه‌ای</h3>
          <p className="text-xs text-gray-500 mb-4">
            برای استفاده از یادآوری خودکار اقساط از طریق SMS، لطفاً به پلن حرفه‌ای ارتقا دهید
          </p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ★★★ v5.2.1: کارت توضیحی — چه کسانی پیامک دریافت می‌کنند */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 space-y-1.5">
              <p className="font-bold">📋 سیستم چطور کار می‌کند؟</p>
              <p>هر روز در ساعت تنظیم‌شده، سیستم به‌طور خودکار اقساط سررسید‌شده را بررسی می‌کند و به مشتریانی که فاکتور قسطی دارند، پیامک یادآوری می‌فرستد.</p>
              <div className="bg-white rounded p-2 border border-blue-100 space-y-1">
                <p className="font-medium text-blue-700">👥 چه کسانی پیامک دریافت می‌کنند؟</p>
                <p>• مشتریانی که <strong>فاکتور قسطی (Installment)</strong> دارند</p>
                <p>• قسط آن‌ها <strong>پرداخت‌نشده</strong> است (pending یا partial)</p>
                <p>• تاریخ سررسید قسط در یکی از این روزها است:</p>
                <p className="pr-3">✓ <strong>۱ روز قبل</strong> از سررسید (یادآوری قبلی)</p>
                <p className="pr-3">✓ <strong>روز سررسید</strong> (یادآوری روز سررسید)</p>
                <p className="pr-3">✓ <strong>۳ روز بعد</strong> از سررسید (یادآوری بعدی)</p>
              </div>
              <p className="text-[10px] text-blue-600">⚠️ فاکتورهای نسیه (Credit) تحت پوشش این سیستم نیستند — فقط اقساط.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ★ کارت اصلی: تنظیمات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-600" />
            اعلان‌های SMS
          </CardTitle>
          <CardDescription className="text-xs">
            یادآوری خودکار اقساط سررسید‌شده برای مشتریان
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* فعال/غیرفعال */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">فعال‌سازی اعلان SMS</p>
                <p className="text-[10px] text-gray-500">پیامک یادآوری برای اقساط سررسید‌شده ارسال می‌شود</p>
              </div>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          {isEnabled && (
            <>
              {/* روزهای یادآوری */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">یادآوری قبل از سررسید (روز)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={daysBeforeDue}
                    onChange={(e) => setDaysBeforeDue(parseInt(e.target.value) || 0)}
                    className="h-9"
                  />
                  <p className="text-[10px] text-gray-400">چند روز قبل از سررسید پیامک بفرست</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">یادآوری بعد از سررسید (روز)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={daysAfterDue}
                    onChange={(e) => setDaysAfterDue(parseInt(e.target.value) || 0)}
                    className="h-9"
                  />
                  <p className="text-[10px] text-gray-400">چند روز بعد از سررسید هم یادآوری کن</p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ساعت ارسال پیامک (فرمت ۲۴ ساعته)</Label>
                  <div className="flex items-center gap-2">
                    {/* ساعت */}
                    <div className="flex-1">
                      <Label className="text-[10px] text-gray-500 mb-1 block">ساعت (۰-۲۳)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={sendHour}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0
                          setSendHour(Math.max(0, Math.min(23, v)))
                        }}
                        className="h-9"
                      />
                    </div>
                    <span className="text-lg font-bold mt-5">:</span>
                    {/* دقیقه */}
                    <div className="flex-1">
                      <Label className="text-[10px] text-gray-500 mb-1 block">دقیقه (۰-۵۹)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={sendMinute}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0
                          setSendMinute(Math.max(0, Math.min(59, v)))
                        }}
                        className="h-9"
                      />
                    </div>
                    {/* نمایش AM/PM */}
                    <div className="mt-5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs font-bold text-emerald-700 min-w-[80px] text-center">
                      {formatTo12Hour(sendHour, sendMinute)}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    زمان ارسال روزانه پیامک‌ها — فرمت ۲۴ ساعته (۰ تا ۲۳ ساعت، ۰ تا ۵۹ دقیقه)
                  </p>
                  <div className="text-[10px] text-blue-600 bg-blue-50 p-2 rounded border border-blue-100 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">راهنمای ساعت:</p>
                      <p>• ۰ تا ۱۱ = صبح (AM) • ۱۲ تا ۱۶ = بعدازظهر (PM) • ۱۷ تا ۲۳ = شب (PM)</p>
                      <p>• مثال: ۹:۳۰ صبح → ساعت=۹، دقیقه=۳۰</p>
                      <p>• مثال: ۱۴:۰۰ بعدازظهر → ساعت=۱۴، دقیقه=۰</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs font-medium">ارسال در روز سررسید</p>
                    <p className="text-[10px] text-gray-500">در روز سررسید هم پیامک بفرست</p>
                  </div>
                  <Switch checked={sendOnDueDate} onCheckedChange={setSendOnDueDate} />
                </div>
              </div>

              {/* دکمه‌ها */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  size="sm"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  ذخیره تنظیمات
                </Button>
              </div>
            </>
          )}

          {/* پیام‌ها */}
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {success}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ★ کارت آمار */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">آمار پیامک‌ها</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-[10px] text-gray-500">کل</p>
                <p className="text-base font-bold text-gray-900">{stats.total?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
              <div className="bg-emerald-50 rounded p-2 text-center">
                <p className="text-[10px] text-emerald-600">ارسال شده</p>
                <p className="text-base font-bold text-emerald-700">{stats.sent?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
              <div className="bg-red-50 rounded p-2 text-center">
                <p className="text-[10px] text-red-600">ناموفق</p>
                <p className="text-base font-bold text-red-700">{stats.failed?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
              <div className="bg-amber-50 rounded p-2 text-center">
                <p className="text-[10px] text-amber-600">تست</p>
                <p className="text-base font-bold text-amber-700">{stats.mock?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ★ کارت لاگ پیامک‌ها */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            تاریخچه پیامک‌ها (۲۰ اخیر)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">
              هنوز پیامکی ارسال نشده
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {logs.map((log: any) => (
                <div
                  key={log.id}
                  className={`p-2 rounded border text-xs ${
                    log.status === 'sent'
                      ? 'bg-emerald-50 border-emerald-200'
                      : log.status === 'failed'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono" dir="ltr">{log.recipient}</span>
                    <div className="flex items-center gap-1.5">
                      {log.mockMode && (
                        <Badge className="bg-amber-100 text-amber-700 text-[9px] px-1">تست</Badge>
                      )}
                      <Badge className={
                        log.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-700 text-[9px] px-1'
                          : log.status === 'failed'
                            ? 'bg-red-100 text-red-700 text-[9px] px-1'
                            : 'bg-gray-100 text-gray-700 text-[9px] px-1'
                      }>
                        {log.status === 'sent' ? 'ارسال شد' : log.status === 'failed' ? 'ناموفق' : 'در انتظار'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-gray-600 text-[10px]">{log.message}</p>
                  <p className="text-gray-400 text-[9px] mt-1">
                    {new Date(log.sentAt).toLocaleString('fa-IR')}
                    {log.errorMessage && ` — ${log.errorMessage}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// =========== ★★★ v8.8.6: Initial Balance Tab (راه‌اندازی اولیه) ===========
// ★ بازنویسی کامل: جداسازی state محلی از داده‌های API
function InitialBalanceTab() {
  const { toast } = useToast()

  // ── داده‌های لود‌شده از API (ثبت‌شده نهایی)
  const [savedItems, setSavedItems] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // ── آیتم‌های محلی (در حال افزودن — هنوز ثبت نشده)
  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])

  // ── فرم آیتم جدید
  const [form, setForm] = useState({
    type: 'cash',
    title: '',
    amount: '',
    productId: '',
    quantity: '',
    description: '',
  })

  // ─────────────────────────────────────────────────────
  // لود داده‌های API
  // ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const tid = getTenantIdFromStore()
      if (!tid) return

      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null
  const headers = token 
  ? { Authorization: `Bearer ${token}` } 
  : undefined

      const [balRes, prodRes] = await Promise.all([
  fetch('/api/initial-balance', { ...(headers && { headers }) }),
  fetch(`/api/products?limit=100&tenantId=${tid}`),
])

      const balData = await balRes.json()
      const prodData = await prodRes.json()

      if (balData.success) {
        // ★ کلید: savedItems فقط از API میاد
        const apiItems = Array.isArray(balData.data) ? balData.data : []
        setSavedItems(apiItems)

        // ★ summary — از API یا محاسبه محلی
        if (balData.summary) {
          setSummary(balData.summary)
        } else if (apiItems.length > 0) {
          const assets = apiItems
            .filter((b: any) =>
              ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type)
            )
            .reduce((s: number, b: any) => s + (b.amount || 0), 0)
          const liabs = apiItems
            .filter((b: any) => b.type === 'liability')
            .reduce((s: number, b: any) => s + (b.amount || 0), 0)
          setSummary({
            isPosted: apiItems.some((b: any) => b.isPosted),
            journalEntryId: apiItems.find((b: any) => b.journalEntryId)
              ?.journalEntryId,
            totalAssets: assets,
            totalLiabilities: liabs,
            equity: assets - liabs,
            count: apiItems.length,
          })
        } else {
          setSummary(null)
        }

        // ★ وقتی از API لود شد، pendingItems رو خالی کن
        // (چون داده‌ها از API نمایش داده میشن)
        setPendingItems([])
      }

      if (prodData.success) {
        const prods = Array.isArray(prodData.data)
          ? prodData.data
          : prodData.data?.products || []
        setProducts(prods)
      }
    } catch (err) {
      console.error('[InitialBalanceTab] Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─────────────────────────────────────────────────────
  // افزودن آیتم به لیست pending
  // ─────────────────────────────────────────────────────
  const handleAddItem = () => {
    if (!form.title.trim()) {
      toast({
        title: 'خطا',
        description: 'عنوان الزامی است',
        variant: 'destructive',
      })
      return
    }
    const amt = Number(form.amount)
    if (!form.amount || amt <= 0) {
      toast({
        title: 'خطا',
        description: 'مبلغ باید بزرگتر از صفر باشد',
        variant: 'destructive',
      })
      return
    }
    if (form.type === 'inventory' && !form.productId) {
      toast({
        title: 'خطا',
        description: 'برای موجودی کالا، انتخاب محصول الزامی است',
        variant: 'destructive',
      })
      return
    }

    const selectedProduct = form.productId
      ? products.find((p) => p.id === form.productId)
      : null

    setPendingItems((prev) => [
      ...prev,
      {
        type: form.type,
        title: form.title.trim(),
        amount: amt,
        productId: form.productId || null,
        quantity: form.quantity ? Number(form.quantity) : null,
        description: form.description.trim() || null,
        Product: selectedProduct,
      },
    ])

    // ریست فرم
    setForm({
      type: 'cash',
      title: '',
      amount: '',
      productId: '',
      quantity: '',
      description: '',
    })
  }

  // ─────────────────────────────────────────────────────
  // ثبت نهایی (pending → API)
  // ─────────────────────────────────────────────────────
  const handleSave = async (postToJournal: boolean = false) => {
    if (pendingItems.length === 0) {
      toast({
        title: 'خطا',
        description: 'حداقل یک آیتم اضافه کنید',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null

      // ★ ارسال به API: pending + saved (اگه قبلاً ثبت شده)
      // اگه سند قبلی وجود داشته باشه، API اون رو حذف و سند جدید میسازه
      const allItems = [
        // آیتم‌های قدیمی (اگه isPosted نباشه یعنی هنوز draft هستن)
        ...savedItems
          .filter((b) => !summary?.isPosted)
          .map((b) => ({
            type: b.type,
            title: b.title,
            amount: b.amount,
            productId: b.productId || undefined,
            quantity: b.quantity || undefined,
            description: b.description || undefined,
          })),
        // آیتم‌های جدید
        ...pendingItems.map((b) => ({
          type: b.type,
          title: b.title,
          amount: b.amount,
          productId: b.productId || undefined,
          quantity: b.quantity || undefined,
          description: b.description || undefined,
        })),
      ]

      const res = await fetch('/api/initial-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: allItems,
          postToJournal,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast({
          title: postToJournal ? 'سند افتتاحیه صادر شد ✓' : 'ذخیره شد ✓',
          description: data.message,
        })
        // ★ reload از API تا لیست به‌روز بشه
        await loadData()
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'ثبت ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'خطا',
        description: 'ارتباط با سرور برقرار نشد',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────
  // حذف سند افتتاحیه
  // ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    setSubmitting(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null
      const res = await fetch('/api/initial-balance', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'حذف شد ✓', description: data.message })
        setSavedItems([])
        setSummary(null)
        setPendingItems([])
        setDeleteDialogOpen(false)
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'حذف ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'خطا',
        description: 'ارتباط با سرور برقرار نشد',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────
  // helpers
  // ─────────────────────────────────────────────────────
  const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

  const TYPE_LABELS: Record<string, string> = {
    cash: '💵 نقدی (صندوق)',
    bank: '🏦 بانک',
    inventory: '📦 موجودی کالا',
    fixed_asset: '🏭 دارایی ثابت',
    liability: '📋 بدهی (وام)',
  }

  const TYPE_COLORS: Record<string, string> = {
    cash: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    bank: 'bg-blue-100 text-blue-700 border-blue-200',
    inventory: 'bg-amber-100 text-amber-700 border-amber-200',
    fixed_asset: 'bg-purple-100 text-purple-700 border-purple-200',
    liability: 'bg-red-100 text-red-700 border-red-200',
  }

  // محاسبه جمع pending
  const pendingAssets = pendingItems
    .filter((b) => ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type))
    .reduce((s, b) => s + b.amount, 0)
  const pendingLiabs = pendingItems
    .filter((b) => b.type === 'liability')
    .reduce((s, b) => s + b.amount, 0)

  // ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        <span className="mr-2 text-sm text-gray-600">در حال بارگذاری...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3" dir="rtl">

      {/* ── راهنما */}
      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Wallet className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-violet-900">
                راه‌اندازی اولیه فروشگاه
              </p>
              <p className="text-xs text-violet-700 mt-1 leading-relaxed">
                موجودی‌های اولیه (نقد، بانک، کالا، تجهیزات، بدهی) را ثبت کنید.
                سیستم سند افتتاحیه را خودکار صادر می‌کند.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════
          بخش ۱: سند ثبت‌شده از API (savedItems)
      ══════════════════════════════════════════════════ */}
      {savedItems.length > 0 && (
        <Card className={`border-2 ${
          summary?.isPosted
            ? 'border-emerald-300 bg-emerald-50/30'
            : 'border-amber-300 bg-amber-50/30'
        }`}>
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {summary?.isPosted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>
                  سند افتتاحیه
                  {summary?.isPosted
                    ? ' — صادر شده ✓'
                    : ' — پیش‌نویس'}
                </span>
                <Badge className={`text-[10px] ${
                  summary?.isPosted
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {savedItems.length} آیتم
                </Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1 shrink-0"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={submitting}
              >
                <Trash2 className="w-3 h-3" />
                حذف
              </Button>
            </div>
            {summary?.journalEntryId && (
              <p className="text-[10px] text-gray-500 font-mono mt-1">
                شناسه سند: {summary.journalEntryId.slice(0, 20)}...
              </p>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {/* لیست آیتم‌های ثبت‌شده */}
            <div className="divide-y divide-gray-100">
              {savedItems.map((item: any, idx: number) => (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${
                      TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {TYPE_LABELS[item.type]?.split(' ')[0] || item.type}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-[10px] text-gray-500 truncate">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-bold font-mono text-gray-700">
                    {formatNumber(item.amount)} ﷼
                  </div>
                </div>
              ))}
            </div>

            {/* خلاصه مالی */}
            {summary && (
              <div className="border-t border-gray-200 bg-white/50 p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    جمع دارایی‌ها:
                  </span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {formatNumber(summary.totalAssets)} ﷼
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    جمع بدهی‌ها:
                  </span>
                  <span className="font-bold text-red-600 font-mono">
                    {formatNumber(summary.totalLiabilities)} ﷼
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-1.5 border-t border-gray-200">
                  <span className="font-bold text-gray-900">سرمایه مالک:</span>
                  <span className={`font-bold text-base font-mono ${
                    summary.equity >= 0
                      ? 'text-violet-700'
                      : 'text-red-600'
                  }`}>
                    {formatNumber(summary.equity)} ﷼
                  </span>
                </div>
                {/* معادله حسابداری */}
                <p className="text-[9px] text-center text-gray-400 pt-1 border-t border-gray-100">
                  دارایی‌ها ({formatNumber(summary.totalAssets)}) ={' '}
                  بدهی‌ها ({formatNumber(summary.totalLiabilities)}) +{' '}
                  سرمایه ({formatNumber(summary.equity)})
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════
          بخش ۲: فرم افزودن آیتم جدید
      ══════════════════════════════════════════════════ */}
      <Card className="border-gray-200">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-violet-600" />
            {savedItems.length > 0
              ? 'افزودن آیتم جدید به سند'
              : 'ثبت موجودی‌های اولیه'}
          </CardTitle>
          {savedItems.length > 0 && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              ⚠ با ثبت آیتم جدید، سند قبلی حذف و سند جدید با همه آیتم‌ها صادر می‌شود
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-3 p-3 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600">نوع موجودی</Label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value, productId: '' })
                }
                className="w-full mt-0.5 text-xs border border-gray-200 rounded-md h-9 px-2 bg-white"
              >
                <option value="cash">💵 نقدی (صندوق)</option>
                <option value="bank">🏦 بانک</option>
                <option value="inventory">📦 موجودی کالا</option>
                <option value="fixed_asset">🏭 دارایی ثابت</option>
                <option value="liability">📋 بدهی (وام)</option>
              </select>
            </div>

            <div>
              <Label className="text-[11px] text-gray-600">عنوان</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={
                  form.type === 'cash'
                    ? 'صندوق فروشگاه'
                    : form.type === 'bank'
                      ? 'بانک ملت'
                      : form.type === 'liability'
                        ? 'وام بانک'
                        : 'عنوان'
                }
                className="mt-0.5 text-xs h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              />
            </div>
          </div>

          {form.type === 'inventory' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <div>
                <Label className="text-[11px] text-gray-600">محصول</Label>
                <select
                  value={form.productId}
                  onChange={(e) =>
                    setForm({ ...form, productId: e.target.value })
                  }
                  className="w-full mt-0.5 text-xs border border-gray-200 rounded-md h-9 px-2 bg-white"
                >
                  <option value="">— انتخاب محصول —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[11px] text-gray-600">مقدار</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  placeholder="۱۰۰"
                  className="mt-0.5 text-xs h-9"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600">مبلغ (ریال)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="۵۰٬۰۰۰٬۰۰۰"
                className="mt-0.5 text-xs h-9"
                dir="ltr"
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              />
            </div>
            <div>
              <Label className="text-[11px] text-gray-600">
                توضیحات (اختیاری)
              </Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="یادداشت"
                className="mt-0.5 text-xs h-9"
              />
            </div>
          </div>

          <Button
            onClick={handleAddItem}
            variant="outline"
            className="w-full border-violet-300 text-violet-700 hover:bg-violet-50 gap-1.5 h-9 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            افزودن به لیست
          </Button>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════
          بخش ۳: آیتم‌های pending (هنوز ثبت نشده)
      ══════════════════════════════════════════════════ */}
      {pendingItems.length > 0 && (
        <Card className="border-violet-200 bg-violet-50/20">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-violet-700">
              <AlertCircle className="w-3.5 h-3.5" />
              آیتم‌های در انتظار ثبت
              <Badge className="bg-violet-100 text-violet-700 text-[10px]">
                {pendingItems.length} آیتم
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-violet-100">
              {pendingItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${
                      TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {TYPE_LABELS[item.type]?.split(' ')[0] || item.type}
                    </span>
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {item.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold font-mono text-gray-700">
                      {formatNumber(item.amount)} ﷼
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() =>
                        setPendingItems((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* خلاصه pending */}
            <div className="border-t border-violet-100 bg-white/50 p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">دارایی‌های جدید:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {formatNumber(pendingAssets)} ﷼
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">بدهی‌های جدید:</span>
                <span className="font-bold text-red-600 font-mono">
                  {formatNumber(pendingLiabs)} ﷼
                </span>
              </div>
            </div>
          </CardContent>

          {/* دکمه‌های ثبت */}
          <div className="p-3 pt-0 grid grid-cols-2 gap-2">
            <Button
              onClick={() => handleSave(false)}
              disabled={submitting}
              variant="outline"
              className="text-xs h-9 gap-1"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              ذخیره موقت
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={submitting}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-9 gap-1"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              ثبت + صدور سند
            </Button>
          </div>
        </Card>
      )}

      {/* ── حالت خالی */}
      {savedItems.length === 0 && pendingItems.length === 0 && (
        <Card className="border-dashed border-violet-200">
          <CardContent className="py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3">
              <Wallet className="w-7 h-7 text-violet-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              سند افتتاحیه ثبت نشده
            </p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
              موجودی‌های اولیه فروشگاه را از فرم بالا اضافه کنید
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── مودال حذف */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700 text-sm">
              <AlertTriangle className="w-5 h-5" />
              حذف سند افتتاحیه
            </AlertDialogTitle>
           <AlertDialogDescription asChild>
  <div className="text-right text-xs leading-relaxed">
    <p className="text-gray-500">این عملیات:</p>
    <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
      <li>
        تمام {savedItems.length} آیتم موجودی اولیه را حذف می‌کند
      </li>
    </ul>
  </div>
</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={submitting}>
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <Trash2 className="w-4 h-4 ml-1" />
              )}
              بله، حذف شود
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// =========== Main Settings Page ===========
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('store')

  // ★★★ v5.1 (Phase 4): Plan-based tab visibility
  //   وقتی کاربر از پلن بالاتر به پایین‌تر downgrade می‌کند، تب‌های مربوط به پلن بالاتر
  //   باید نمایش داده نشوند (نه فقط قفل شوند)
  const planName = useAppStore((s) => s.planName)
  const currentTenant = useAppStore((s) => s.currentTenant)
 // ★★★ v9.2: بررسی وضعیت دمو
  const { isDemo } = useDemoStatus()
  const resolvedTenantId = getTenantIdFromStore()
  const [wizardOpen, setWizardOpen] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0) 

 

  

  // ★★★ v5.1: state برای planName واقعی از API (مهم پس از upgrade/downgrade)
  //   چون useAppStore ممکن است stale باشد پس از تغییر پلن
  const [realPlanName, setRealPlanName] = useState<string>('')

  useEffect(() => {
    // ★ لود planName واقعی از API trial-check (مشابه SubscriptionTab)
    fetch('/api/tenants/trial-check')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          if (data.data.planName) setRealPlanName(data.data.planName)
          else if (data.data.tierName) setRealPlanName(data.data.tierName)
        }
      })
      .catch(() => {})
  }, [])

  // ★ تشخیص tier فعلی از چندین منبع (اولویت با API واقعی)
  //   توجه: در plan-features.ts، tier پلن simple برابر 'basic' است (نه 'simple')
  const currentTier: 'simple' | 'professional' | 'enterprise' = (() => {
    const name = (realPlanName || planName || currentTenant?.planName || currentTenant?.planTierName || 'simple').toLowerCase().trim()
    if (name === 'professional' || name === 'standard' || name.includes('حرفه')) return 'professional'
    if (name === 'enterprise' || name === 'organization' || name.includes('سازمانی') || name.includes('پیشرفته')) return 'enterprise'
    return 'simple'
  })()

  // ★ feature flags بر اساس tier
  //   getFeaturesByPlanName از plan-features.ts خودش resolvePlanTier را صدا می‌زند
  //   و 'simple' را به 'basic' تبدیل می‌کند
  const features = getFeaturesByPlanName(currentTier)
  const isEnterprise = currentTier === 'enterprise'

  // ★ اگر activeTab فعلی دیگر در دسترس نیست، به تب پیش‌فرض برگردان
  useEffect(() => {
    const visibleTabs = ['store', 'invoice', 'backup', 'subscription', 'employees', 'initial-balance']
    if (features.canAccessInstallments) visibleTabs.push('sms')
    if (features.canOnlinePayment) visibleTabs.push('gateway')
    if (features.canMultiCashRegister) visibleTabs.push('pos')
    if (features.canMoidianIntegration) visibleTabs.push('moidian')
    if (isEnterprise) {
      visibleTabs.push('enterprise')
    }
    // ★★★ v6.7: تب سال مالی برای حرفه‌ای و سازمانی (canFiscalYearManagement)
    if (features.canFiscalYearManagement) visibleTabs.push('fiscal-year')

    // ★★★ v9.2.5: در حالت دمو، تب‌های زیر غیرفعال هستند:
    //   - backup (پشتیبان‌گیری)
    //   - subscription (اشتراک)
    //   - initial-balance (راه‌اندازی)
    // ★ تب employees (کاربران) فعال است
    // ★ تب tickets در سایدبار فعال است
    const disabledInDemoTabs = ['backup', 'subscription', 'initial-balance']
    if (isDemo && disabledInDemoTabs.includes(activeTab)) {
      setActiveTab('store')
      return
    }

    if (!visibleTabs.includes(activeTab)) {
      setActiveTab('store')
    }
  }, [activeTab, features, isEnterprise, isDemo])

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-gray-50 p-2.5 sm:p-3.5 md:p-6" dir="rtl">
      <div className="mb-2 sm:mb-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">تنظیمات</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">مدیریت تنظیمات فروشگاه و حساب کاربری</p>
      </div>

 {/* ★★★ دکمه ویزارد — قبل از Tabs */}
      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-violet-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-violet-900">ویزارد راه‌اندازی فروشگاه</p>
                <p className="text-[10px] text-violet-600 truncate">
                  سال مالی، انبار و سند افتتاحیه را مدیریت کنید
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5 shrink-0 h-8"
              onClick={() => {
                if (resolvedTenantId) {
                  localStorage.removeItem(`setup_wizard_done_${resolvedTenantId}`)
                }
                setWizardOpen(true)
              }}
            >
              <Zap className="w-3.5 h-3.5" />
              باز کردن ویزارد
            </Button>
          </div>

          {/* ★ نمایش وضعیت هر مرحله */}
          <SetupStatusBadges />
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
        {/* ★★★ v3.10: dir="rtl" صریح + flex flex-row + justify-start برای RTL بودن تب‌ها */}
     <div className="mb-2 sm:mb-3" dir="rtl">
  <TabsList 
    dir="rtl" 
    className="w-max flex flex-row flex-nowrap gap-1.5 bg-gray-50/80 border border-gray-200 rounded-xl p-1.5 overflow-x-auto scrollbar-hide h-auto"
  >
    <TabsTrigger 
      value="store" 
      className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100"
    >
      <Store className="w-4 h-4" />
      <span className="hidden sm:inline">فروشگاه</span>
    </TabsTrigger>

    {/* ★★★ v5.1: تب درگاه پرداخت فقط در پلن حرفه‌ای و سازمانی */}
    {features.canOnlinePayment && (
      <TabsTrigger 
        value="gateway" 
        className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100"
      >
        <CreditCard className="w-4 h-4" />
        <span className="hidden sm:inline">درگاه پرداخت</span>
      </TabsTrigger>
    )}

    {/* ★★★ v5.1: تب کارتخوان فقط در پلن حرفه‌ای و سازمانی */}
    {features.canMultiCashRegister && (
      <TabsTrigger 
        value="pos" 
        className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100"
      >
        <Monitor className="w-4 h-4" />
        <span className="hidden sm:inline">کارتخوان</span>
      </TabsTrigger>
    )}

    <TabsTrigger 
      value="invoice" 
      className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100"
    >
      <FileText className="w-4 h-4" />
      <span className="hidden sm:inline">قالب فاکتور</span>
    </TabsTrigger>

    {/* ★★★ v9.2: در حالت دمو، تب «پشتیبان‌گیری» غیرفعال است */}
    <TabsTrigger
      value="backup"
      disabled={isDemo}
      title={isDemo ? 'این بخش در حالت تست دمو غیرفعال است' : ''}
      className={`flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100 ${
        isDemo ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <Database className="w-4 h-4" />
      <span className="hidden sm:inline">پشتیبان‌گیری</span>
      {isDemo && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">دمو</span>}
    </TabsTrigger>

    {/* ★★★ v9.2: در حالت دمو، تب «اشتراک» غیرفعال است */}
    <TabsTrigger
      value="subscription"
      disabled={isDemo}
      title={isDemo ? 'این بخش در حالت تست دمو غیرفعال است' : ''}
      className={`flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100 ${
        isDemo ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <Crown className="w-4 h-4" />
      <span className="hidden sm:inline">اشتراک</span>
      {isDemo && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">دمو</span>}
    </TabsTrigger>

    {/* ★★★ v9.2: تب کاربران */}
    <TabsTrigger 
      value="employees" 
      className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100"
    >
      <Users className="w-4 h-4" />
      <span className="hidden sm:inline">کاربران</span>
    </TabsTrigger>

    {/* ★★★ v5.2: تب اعلان SMS فقط در پلن حرفه‌ای+ */}
    {features.canAccessInstallments && (
      <TabsTrigger 
        value="sms" 
        className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100"
      >
        <Bell className="w-4 h-4" />
        <span className="hidden sm:inline">اعلان SMS</span>
      </TabsTrigger>
    )}

    {/* ★★★ v6.0: تب مودیان فقط در پلن حرفه‌ای+ */}
    {features.canMoidianIntegration && (
      <TabsTrigger 
        value="moidian" 
        className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 data-[state=active]:shadow-sm hover:bg-purple-100"
      >
        <Building2 className="w-4 h-4" />
        <span className="hidden sm:inline">مودیان</span>
      </TabsTrigger>
    )}

    {/* ★★★ v5.1: تب سازمانی فقط در پلن سازمانی */}
    {isEnterprise && (
      <TabsTrigger 
        value="enterprise" 
        className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 data-[state=active]:shadow-sm hover:bg-purple-100"
      >
        <Crown className="w-4 h-4" />
        <span className="hidden sm:inline">سازمانی</span>
      </TabsTrigger>
    )}

    {/* ★★★ v5.1: تب سال مالی فقط در پلن سازمانی */}
    {features.canFiscalYearManagement && (
      <TabsTrigger 
        value="fiscal-year" 
        className="flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100"
      >
        <CalendarDays className="w-4 h-4" />
        <span className="hidden sm:inline">سال مالی</span>
      </TabsTrigger>
    )}

    {/* ★★★ v8.8: تب راه‌اندازی اولیه فروشگاه */}
    <TabsTrigger
      value="initial-balance"
      disabled={isDemo}
      title={isDemo ? 'این بخش در حالت تست دمو غیرفعال است' : ''}
      className={`flex-shrink-0 min-w-fit gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm hover:bg-gray-100 ${
        isDemo ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <Wallet className="w-4 h-4" />
      <span className="hidden sm:inline">راه‌اندازی</span>
      {isDemo && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">دمو</span>}
    </TabsTrigger>
  </TabsList>
</div>

        <TabsContent value="store"><StoreSettingsTab /></TabsContent>
        {/* ★★★ v5.1: تب‌های مشروط فقط هنگام مجاز بودن رندر می‌شوند */}
        {features.canOnlinePayment && (
          <TabsContent value="gateway"><PaymentGatewayTab /></TabsContent>
        )}
        {features.canMultiCashRegister && (
          <TabsContent value="pos"><PosDevicesTab /></TabsContent>
        )}
        <TabsContent value="invoice"><InvoiceTemplateTab /></TabsContent>
        {/* ★★★ v9.2: در حالت دمو، محتوای این تب‌ها پیام نمایش می‌دهد */}
        <TabsContent value="backup">
          {isDemo ? <DemoDisabledSection message="بخش پشتیبان‌گیری در حالت تست دمو غیرفعال است. برای استفاده از این بخش، لطفاً یکی از پلن‌ها را خریداری کنید." /> : <BackupTab />}
        </TabsContent>
        <TabsContent value="subscription">
          {isDemo ? <DemoDisabledSection message="بخش مدیریت اشتراک در حالت تست دمو غیرفعال است. برای خرید پلن، لطفاً پس از پایان مدت دمو اقدام کنید." /> : <SubscriptionTab />}
        </TabsContent>
        {/* ★★★ v9.2.5: در حالت دمو، تب «کاربران» فعال است (تغییر از v9.2) */}
        <TabsContent value="employees">
          <EmployeesTab />
        </TabsContent>
        {/* ★★★ v5.2 (Phase 4): تب اعلان SMS فقط در پلن حرفه‌ای+ */}
        {features.canAccessInstallments && (
          <TabsContent value="sms"><SmsNotificationsTab /></TabsContent>
        )}
        {/* ★★★ v6.0: تب مودیان فقط در پلن حرفه‌ای+ (canMoidianIntegration) */}
        {features.canMoidianIntegration && (
          <TabsContent value="moidian"><MoidianTab /></TabsContent>
        )}
        {isEnterprise && (
          <TabsContent value="enterprise"><EnterpriseTab /></TabsContent>
        )}
        {features.canFiscalYearManagement && (
          <TabsContent value="fiscal-year"><FiscalYearTab /></TabsContent>
        )}
        {/* ★★★ v8.8: تب راه‌اندازی اولیه فروشگاه */}
        {/* ★★★ v9.2.5: در حالت دمو، محتوای این تب پیام نمایش می‌دهد */}
                     <TabsContent value="initial-balance" className="w-full mt-2 outline-none">
          {isDemo ? (
            <DemoDisabledSection message="بخش راه‌اندازی اولیه (سند افتتاحیه) در حالت تست دمو غیرفعال است. در پلن‌های پولی می‌توانید موجودی اولیه فروشگاه خود را تنظیم کنید." />
          ) : (
            <InitialBalanceTab key={refreshKey} />
          )}
        </TabsContent>
         {/* ★★★ ویزارد راه‌اندازی */}
        <SetupWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onComplete={() => {
            setWizardOpen(false)
               setTimeout(() => {
            setRefreshKey(k => k + 1)
          // تغییر تب
          setActiveTab('initial-balance')
          }, 500)
          }}
        />
      </Tabs>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════
//  ★★★ v9.2: کامپوننت نمایش پیام «غیرفعال در دمو»
//    برای تب‌هایی که در حالت دمو غیرفعال هستند
// ═══════════════════════════════════════════════════════════════
function DemoDisabledSection({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-amber-600" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-2">این بخش در حالت تست دمو غیرفعال است</h3>
      <p className="text-sm text-gray-600 text-center max-w-md leading-relaxed mb-4">{message}</p>
      <Badge className="bg-amber-100 text-amber-700 text-xs">
        <Sparkles className="w-3 h-3 ml-1" />
        تست دمو ۳ روزه
      </Badge>
    </div>
  )
}
