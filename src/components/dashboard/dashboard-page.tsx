// ============================================================================
// src/components/dashboard/dashboard-page.tsx — Dashboard Page (v9.0_merged ★★★)
// ----------------------------------------------------------------------------
// ★ ادغام نسخه بکاپ (v8.8.8 — منطق داده صحیح) با لی‌اوت v8.9.0:
//   ✓ منطق داده از بکاپ: /api/dashboard/stats (ساختار تودرتوی stats)
//   ✓ نمودار روند فروش → تمام‌عرض
//   ✓ نمودار دسته + پرفروش‌ها → دو ستون
//   ✓ آخرین فاکتورها → تمام‌عرض (جدول حرفه‌ای با ستون تاریخ)
//   ✓ موجودی بحرانی → تمام‌عرض (جدول حرفه‌ای)
//   ✓ یک نشانگر وضعیت آنلاین/آفلاین تمیز در هدر
//   ✓ هیچ قابلیتی حذف نشده است
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { resolvePlan } from '@/lib/plan-features'
import { authFetch } from '@/lib/auth-fetch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SetupWizard, useSetupWizard } from '@/components/setup-wizard'
import {
  TrendingUp, FileText, AlertCircle, AlertTriangle,
  ShoppingCart, CreditCard, Package, ArrowLeft,
  RefreshCw, Loader2, Wallet, WifiOff, CloudOff, Wifi,
} from 'lucide-react'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
} from 'recharts'

// ═══════════════════════════════════════════════════════════════
//  تایپ‌ها
// ═══════════════════════════════════════════════════════════════

interface DashboardStats {
  todaySales: number; todayInvoices: number
  monthSales: number; monthInvoices: number
  overdueInstallments: number; totalReceivable: number
  lowStockProducts: number
  monthlySales: number; monthlyProfit: number
}

interface RecentInvoice {
  id: string; number: string; invoiceDate: string
  customerName: string; totalAmount: number
  paymentType: string; status: string
}

interface OverdueInstallment {
  id: string; amount: number; dueDate: string
  status: string; planCustomerName: string; planInvoiceNumber: string
}

interface LowStockProduct {
  id: string; code: string; name: string; category: string
  currentStock: number; minStock: number; unit: string
}

interface DailySale { date: string; sales: number }
interface CategorySale { name: string; value: number }
interface TopProduct {
  id: string; name: string; code: string
  totalQuantity: number; totalSales: number; category: string
}

interface DashboardData {
  stats: DashboardStats
  recentInvoices: RecentInvoice[]
  overdueInstallments: OverdueInstallment[]
  lowStockProducts: LowStockProduct[]
  dailySales: DailySale[]
  categorySales: CategorySale[]
  dailySales30?: DailySale[]
  topProducts?: TopProduct[]
}

interface DashboardCache {
  data: DashboardData
  timestamp: string
}

// ★ ساختار cache
const STORAGE_KEYS = {
  DASHBOARD_CACHE: 'dashboard_cache',
  LAST_UPDATE: 'dashboard_last_update',
} as const

function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('localStorage write failed:', e)
  }
}

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی
// ═══════════════════════════════════════════════════════════════

const formatNumber = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString('fa-IR')

const formatCurrency = (n: number | undefined | null) =>
  `${(n ?? 0).toLocaleString('fa-IR')} ریال`

const formatCompact = (n: number | undefined | null) => {
  if (!n || isNaN(n)) return '۰'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString('fa-IR')
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    Paid: { label: 'پرداخت', className: 'bg-emerald-100 text-emerald-700' },
    Confirmed: { label: 'تایید', className: 'bg-sky-100 text-sky-700' },
    PartiallyPaid: { label: 'جزئی', className: 'bg-amber-100 text-amber-700' },
    Cancelled: { label: 'لغو', className: 'bg-red-100 text-red-700' },
    Pending: { label: 'در انتظار', className: 'bg-amber-100 text-amber-700' },
    Overdue: { label: 'سررسید', className: 'bg-red-100 text-red-700' },
    paid: { label: 'پرداخت', className: 'bg-emerald-100 text-emerald-700' },
    confirmed: { label: 'تایید', className: 'bg-sky-100 text-sky-700' },
    pending: { label: 'در انتظار', className: 'bg-amber-100 text-amber-700' },
    cancelled: { label: 'لغو', className: 'bg-red-100 text-red-700' },
  }
  const info = map[status] || { label: status, className: '' }
  return <Badge className={`text-[9px] px-1.5 py-0 h-4 ${info.className}`}>{info.label}</Badge>
}

// ★ فرمت تاریخ شمسی
function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return ''
  try {
    const now = new Date()
    const past = new Date(isoDate)
    const diffMs = now.getTime() - past.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffMin < 1) return 'هم‌اکنون'
    if (diffMin < 60) return `${toFaNum(diffMin)} دقیقه پیش`
    if (diffHour < 24) return `${toFaNum(diffHour)} ساعت پیش`
    if (diffDay === 1) return 'دیروز'
    if (diffDay < 7) return `${toFaNum(diffDay)} روز پیش`
    return past.toLocaleDateString('fa-IR')
  } catch {
    return ''
  }
}

// Chart configs
const lineChartConfig: ChartConfig = { sales: { label: 'فروش', color: '#10b981' } }
const PIE_COLORS = ['#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899']

// ═══════════════════════════════════════════════════════════════
//  ★ KPI Card — فشرده
// ═══════════════════════════════════════════════════════════════

function KpiCard({
  label, value, sublabel, icon, gradient, onClick,
}: {
  label: string; value: string; sublabel?: string
  icon: React.ReactNode; gradient: string; onClick?: () => void
}) {
  return (
    <div
      className={`${gradient} cursor-pointer hover:shadow-lg transition-all transform hover:scale-[1.02] rounded-xl`}
      onClick={onClick}
      style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-white/80 truncate">{label}</p>
        <p className="text-base font-bold text-white truncate">{value}</p>
        {sublabel && <p className="text-[9px] text-white/70 truncate">{sublabel}</p>}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { setCurrentView } = useAppStore()
  const planName = useAppStore((s) => s.planName)
  const isOnline = useAppStore((s) => s.isOnline)
  const plan = resolvePlan(planName)
 const { open, setOpen, handleComplete, wizardMode, renewalData } = useSetupWizard()

  // ✅ ✅ ✅ اصلاح قطعی: بستن اجباری ویزارد اگر پلن دمو یا تستی است (جلوگیری از Race Condition)
  useEffect(() => {
    if (planName === 'demo' || planName === 'trial') {
      setOpen(false)
    }
  }, [planName, setOpen])

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [salesRange, setSalesRange] = useState<'7d' | '30d'>('7d')

  const [isFromCache, setIsFromCache] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null)

  // ═══════════════════════════════════════════════════════════════
  // ★ بارگذاری داده‌ها (آنلاین + آفلاین)
  //   ★ نکته کلیدی: از /api/dashboard/stats استفاده می‌شود که ساختار
  //     تودرتوی stats را برمی‌گرداند (با صفحه سازگار است)
  // ═══════════════════════════════════════════════════════════════

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    // ─── حالت آفلاین: بارگذاری از cache ──────────────────────────
    if (!isOnline) {
      const cached = loadFromStorage<DashboardCache | null>(STORAGE_KEYS.DASHBOARD_CACHE, null)
      const lastUpdate = loadFromStorage<string | null>(STORAGE_KEYS.LAST_UPDATE, null)

      if (cached?.data) {
        setData(cached.data)
        setIsFromCache(true)
        setLastUpdateTime(cached.timestamp || lastUpdate)
        setLoading(false)
        setRefreshing(false)
      } else {
        setError('داده‌ای در حافظه محلی یافت نشد. لطفاً یک‌بار آنلاین وارد شوید.')
        setLoading(false)
        setRefreshing(false)
      }
      return
    }

    // ─── حالت آنلاین: درخواست از سرور ────────────────────────────
    try {
      const res = await authFetch('/api/dashboard/stats', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) {
          setError('نشست منقضی شده')
          // fallback به cache
          const cached = loadFromStorage<DashboardCache | null>(STORAGE_KEYS.DASHBOARD_CACHE, null)
          if (cached?.data) {
            setData(cached.data)
            setIsFromCache(true)
            setLastUpdateTime(cached.timestamp)
          }
          return
        }
        throw new Error(`خطای سرور (${res.status})`)
      }

      const json = await res.json()
      if (json.success && json.data) {
        const serverData = json.data as DashboardData
        setData(serverData)
        setIsFromCache(false)

        // ★ ذخیره در cache
        const now = new Date().toISOString()
        saveToStorage<DashboardCache>(STORAGE_KEYS.DASHBOARD_CACHE, {
          data: serverData,
          timestamp: now,
        })
        saveToStorage(STORAGE_KEYS.LAST_UPDATE, now)
        setLastUpdateTime(now)
      } else {
        throw new Error(json.error || 'پاسخ نامعتبر')
      }
    } catch (err: any) {
      console.error('[Dashboard] error:', err)
      setError(err?.message || 'خطا در دریافت داده‌ها')

      // fallback به cache
      const cached = loadFromStorage<DashboardCache | null>(STORAGE_KEYS.DASHBOARD_CACHE, null)
      if (cached?.data) {
        setData(cached.data)
        setIsFromCache(true)
        setLastUpdateTime(cached.timestamp)
      }
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [isOnline])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ═══════════════════════════════════════════════════════════════
  //  Loading
  // ═══════════════════════════════════════════════════════════════
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  //  Error (بدون cache)
  // ═══════════════════════════════════════════════════════════════
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center" dir="rtl">
        <div className="size-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">خطا در بارگذاری</h3>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
        <Button
          onClick={() => loadData()}
          disabled={!isOnline}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          <RefreshCw className="w-4 h-4" /> تلاش مجدد
        </Button>
        {!isOnline && (
          <p className="text-xs text-amber-600 mt-2">
            ⚠ برای بارگذاری، اتصال اینترنت لازم است
          </p>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  //  داده‌ها
  // ═══════════════════════════════════════════════════════════════
  const stats = data?.stats || {
    todaySales: 0, todayInvoices: 0, monthSales: 0, monthInvoices: 0,
    overdueInstallments: 0, totalReceivable: 0, lowStockProducts: 0,
    monthlySales: 0, monthlyProfit: 0,
  }
  const recentInvoices = data?.recentInvoices || []
  const overdueInstallments = data?.overdueInstallments || []
  const lowStockProducts = data?.lowStockProducts || []
  const dailySales = data?.dailySales || []
  const categorySales = data?.categorySales || []
  const dailySales30 = data?.dailySales30 || []
  const topProducts = data?.topProducts || []

  return (
    <div className="space-y-4" dir="rtl">

      {/* ★ هدر + نشانگر وضعیت اتصال (تک و تمیز) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">داشبورد</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              خلاصه وضعیت فروشگاه
              {lastUpdateTime && !loading && (
                <span className="mr-1 text-gray-400">
                  • {formatRelativeTime(lastUpdateTime)}
                </span>
              )}
              {isFromCache && (
                <span className="mr-1 text-amber-500">• از حافظه محلی</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        
     
          <Button
            onClick={() => loadData(true)}
            variant="outline"
            className="gap-1.5 h-8 text-xs"
            disabled={refreshing || !isOnline}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'در حال...' : 'بروزرسانی'}
          </Button>
          <Button
            onClick={() => setCurrentView('pos')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs"
          >
            <ShoppingCart className="size-3.5" /> فاکتور جدید
          </Button>
        </div>
      </div>

      {/* هشدار موجودی بحرانی (فشرده) */}
      {lowStockProducts.length > 0 && (
        <div
          className="border border-red-300 rounded-lg bg-gradient-to-l from-red-50 to-white cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCurrentView('products')}
          style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">
              {formatNumber(lowStockProducts.length)} محصول با موجودی بحرانی
            </p>
            <p className="text-[9px] text-red-500 truncate">
              {lowStockProducts.slice(0, 3).map(p => p.name).join('، ')}
              {lowStockProducts.length > 3 &&
                ` و ${formatNumber(lowStockProducts.length - 3)} مورد دیگر`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 h-6 text-[9px] gap-0.5 shrink-0 px-1.5"
          >
            مشاهده <ArrowLeft className="size-2.5" />
          </Button>
        </div>
      )}

      {/* KPI کارت‌ها — گرادیان رنگی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard
          label="فروش امروز"
          value={formatNumber(stats.todaySales)}
          sublabel={`${formatNumber(stats.todayInvoices)} فاکتور`}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          icon={
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
          }
          onClick={() => setCurrentView('invoices')}
        />
        <KpiCard
          label="فروش ماه"
          value={formatNumber(stats.monthSales)}
          sublabel={`${formatNumber(stats.monthInvoices)} فاکتور`}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          icon={
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
          }
          onClick={() => setCurrentView('invoices')}
        />
        <KpiCard
          label="سود ماه"
          value={formatNumber(stats.monthlyProfit)}
          sublabel={stats.monthlyProfit >= 0 ? 'سودآور' : 'زیان'}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          icon={
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
          }
          onClick={() => setCurrentView('reports')}
        />
        <KpiCard
          label="موجودی بحرانی"
          value={formatNumber(stats.lowStockProducts)}
          sublabel="نیاز به سفارش"
          gradient="bg-gradient-to-br from-red-500 to-red-600"
          icon={
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
          }
          onClick={() => setCurrentView('products')}
        />
      </div>

      {/* ★ هشدار اقساط سررسید (اگه هست) */}
      {overdueInstallments.length > 0 && plan.features.canAccessInstallments && (
        <Card
          className="border-amber-300 bg-gradient-to-l from-amber-50 to-white cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCurrentView('installments')}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-700">
                {formatNumber(overdueInstallments.length)} قسط سررسید شده
              </p>
              <p className="text-[10px] text-amber-500">
                مبلغ کل: {formatCurrency(overdueInstallments.reduce((s, i) => s + i.amount, 0))}
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-amber-600 border-amber-200 hover:bg-amber-50 h-7 text-xs gap-1 shrink-0">
              مشاهده <ArrowLeft className="size-3" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ★★★ نمودار روند فروش — تمام‌عرض */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              روند فروش
            </CardTitle>
            <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-md">
              <button
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${salesRange === '7d' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setSalesRange('7d')}
              >۷ روز</button>
              <button
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${salesRange === '30d' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setSalesRange('30d')}
              >۳۰ روز</button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={salesRange === '7d' ? dailySales : dailySales30} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval={salesRange === '30d' ? 'preserveStartEnd' : 0} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={10} tickFormatter={(v) => formatCompact(v)} width={50} />
              <Tooltip content={({ active, payload }) => {
                if (active && payload?.length) {
                  return <div className="bg-white p-2 border border-gray-200 rounded shadow text-xs"><p className="font-bold">{formatCurrency(payload[0].value as number)}</p></div>
                }
                return null
              }} />
              <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2.5} dot={salesRange === '7d' ? { fill: '#10b981', r: 3 } : false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ★★★ نمودار دسته‌بندی + پرفروش‌ها — دو ستون */}
      {(categorySales.length > 0 || topProducts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* نمودار دسته‌بندی */}
          {categorySales.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">فروش بر اساس دسته</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categorySales} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} label={({ name, value }) => `${name} ${value}%`} labelLine={false}>
                      {categorySales.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload?.length) {
                        return <div className="bg-white p-2 border border-gray-200 rounded shadow text-xs"><p>{payload[0].payload.name}</p><p className="font-bold">{payload[0].value}%</p></div>
                      }
                      return null
                    }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* پرفروش‌ترین محصولات */}
          {topProducts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  پرفروش‌ترین محصولات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topProducts.map(p => ({ name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name, totalSales: p.totalSales, totalQuantity: p.totalQuantity }))} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} fontSize={9} tickFormatter={(v) => formatCompact(v)} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={9} width={80} />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload?.length) {
                        return <div className="bg-white p-2 border border-gray-200 rounded shadow text-xs"><p className="font-bold">{formatCurrency(payload[0].value as number)}</p><p>{formatNumber(payload[0].payload.totalQuantity)} عدد</p></div>
                      }
                      return null
                    }} />
                    <Bar dataKey="totalSales" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ★★★ آخرین فاکتورها — تمام‌عرض + جدول حرفه‌ای */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-600" />
              آخرین فاکتورها
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-emerald-600 gap-1 text-[10px] h-6" onClick={() => setCurrentView('invoices')}>
              همه فاکتورها <ArrowLeft className="size-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {recentInvoices.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">فاکتوری ثبت نشده</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-right px-3 py-2 font-bold text-gray-500 whitespace-nowrap">شماره</th>
                    <th className="text-right px-3 py-2 font-bold text-gray-500">مشتری</th>
                    <th className="text-right px-3 py-2 font-bold text-gray-500 whitespace-nowrap hidden sm:table-cell">تاریخ</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-500 whitespace-nowrap">مبلغ</th>
                    <th className="text-center px-3 py-2 font-bold text-gray-500 whitespace-nowrap">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.slice(0, 6).map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-emerald-50/30 transition-colors cursor-pointer"
                      onClick={() => setCurrentView('invoices')}
                    >
                      <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{inv.number}</td>
                      <td className="px-3 py-2 truncate max-w-[200px]">{inv.customerName || 'فروش عمومی'}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap hidden sm:table-cell">
                        {formatRelativeTime(inv.invoiceDate)}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-left whitespace-nowrap">{formatCurrency(inv.totalAmount)}</td>
                      <td className="px-3 py-2 text-center">{getStatusBadge(inv.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ★★★ محصولات کم‌موجود — تمام‌عرض + جدول حرفه‌ای */}
      {lowStockProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                موجودی بحرانی
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-emerald-600 gap-1 text-[10px] h-6" onClick={() => setCurrentView('products')}>
                همه محصولات <ArrowLeft className="size-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-right px-3 py-2 font-bold text-gray-500 whitespace-nowrap">کد</th>
                    <th className="text-right px-3 py-2 font-bold text-gray-500">نام محصول</th>
                    <th className="text-right px-3 py-2 font-bold text-gray-500 whitespace-nowrap hidden sm:table-cell">دسته</th>
                    <th className="text-center px-3 py-2 font-bold text-gray-500 whitespace-nowrap">موجودی</th>
                    <th className="text-center px-3 py-2 font-bold text-gray-500 whitespace-nowrap">حداقل</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.slice(0, 6).map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-red-50/30 transition-colors cursor-pointer"
                      onClick={() => setCurrentView('products')}
                    >
                      <td className="px-3 py-2 font-mono text-gray-400 whitespace-nowrap">{p.code}</td>
                      <td className="px-3 py-2 truncate max-w-[240px]">{p.name}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap hidden sm:table-cell">{p.category || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="font-mono font-bold text-red-600">{formatNumber(p.currentStock)}</span>
                        <span className="text-[9px] text-gray-400 mr-1">{p.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-gray-400">{formatNumber(p.minStock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lowStockProducts.length > 6 && (
                <p className="text-[10px] text-gray-400 text-center pt-2 pb-1">
                  و {formatNumber(lowStockProducts.length - 6)} محصول دیگر
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ★★★ ویزارد راه‌اندازی — فقط در حالت آنلاین و برای پلن‌های غیر دمو */}
      {isOnline && planName !== 'demo' && planName !== 'trial' && (
       <SetupWizard 
  open={open} 
  onOpenChange={setOpen} 
  onComplete={handleComplete} 
  wizardMode={wizardMode}
  renewalData={renewalData}
/>
      )}
    </div>
  )
}