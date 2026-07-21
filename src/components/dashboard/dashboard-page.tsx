// ============================================================================
// src/components/dashboard/dashboard-page.tsx — Dashboard Page (v6.9 ★★★)
// ShopAccounting v6.9 — Clean & Compact Dashboard
// ============================================================================
// ★★★ v6.9 تغییرات:
//   ★ حذف کادر ارتقا به پلن حرفه‌ای از پایین داشبورد
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { resolvePlan } from '@/lib/plan-features'
import { authFetch } from '@/lib/auth-fetch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SetupWizard, useSetupWizard } from '@/components/setup-wizard'
import {
  TrendingUp, FileText, AlertCircle, AlertTriangle,
  ShoppingCart, CreditCard, Package, ArrowLeft,
  RefreshCw, Loader2, Wallet,
} from 'lucide-react'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
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

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی
// ═══════════════════════════════════════════════════════════════

const formatNumber = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString('fa-IR')

const formatCurrency = (n: number | undefined | null) =>
  `${(n ?? 0).toLocaleString('fa-IR')} ریال`

// ★ برای نمودارها فقط (خلاصه)
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

// Chart configs
const lineChartConfig: ChartConfig = { sales: { label: 'فروش', color: '#10b981' } }
const PIE_COLORS = ['#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899']

// ═══════════════════════════════════════════════════════════════
//  کامپوننت KPI کارت (کوچک و جمع‌وجور)
// ═══════════════════════════════════════════════════════════════

function KpiCard({
  label, value, sublabel, icon, color, onClick,
}: {
  label: string; value: string; sublabel?: string
  icon: React.ReactNode; color: string; onClick?: () => void
}) {
  return (
    <Card
      className={`border-2 ${color} cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onClick}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-gray-500 truncate">{label}</p>
          <p className="text-base font-bold text-gray-900 truncate">{value}</p>
          {sublabel && <p className="text-[9px] text-gray-400 truncate">{sublabel}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { setCurrentView } = useAppStore()
  const planName = useAppStore((s) => s.planName)
  const plan = resolvePlan(planName)
  const { open, setOpen, handleComplete } = useSetupWizard()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [salesRange, setSalesRange] = useState<'7d' | '30d'>('7d')

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const res = await authFetch('/api/dashboard/stats', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) { setError('نشست منقضی شده'); return }
        throw new Error(`خطای سرور (${res.status})`)
      }
      const json = await res.json()
      if (json.success && json.data) setData(json.data)
      else throw new Error(json.error || 'پاسخ نامعتبر')
    } catch (err: any) {
      console.error('[Dashboard] error:', err)
      setError(err?.message || 'خطا در دریافت داده‌ها')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
  //  Error
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
        <Button onClick={() => loadData()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          <RefreshCw className="w-4 h-4" /> تلاش مجدد
        </Button>
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
      {/* ★ هدر ساده */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">داشبورد</h1>
          <p className="text-xs text-gray-500 mt-0.5">خلاصه وضعیت فروشگاه</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => loadData(true)} variant="outline" className="gap-1.5 h-8 text-xs" disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'در حال...' : 'بروزرسانی'}
          </Button>
          <Button onClick={() => setCurrentView('pos')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs">
            <ShoppingCart className="size-3.5" /> فاکتور جدید
          </Button>
        </div>
      </div>

      {/* ★★★ هشدار موجودی کم (نوار برجسته) */}
      {lowStockProducts.length > 0 && (
        <Card
          className="border-red-300 bg-gradient-to-l from-red-50 to-white cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCurrentView('products')}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-700">
                {formatNumber(lowStockProducts.length)} محصول با موجودی بحرانی
              </p>
              <p className="text-[10px] text-red-500 truncate">
                {lowStockProducts.slice(0, 3).map(p => p.name).join('، ')}
                {lowStockProducts.length > 3 && ` و ${formatNumber(lowStockProducts.length - 3)} مورد دیگر`}
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs gap-1 shrink-0">
              مشاهده <ArrowLeft className="size-3" />
            </Button>
          </CardContent>
        </Card>
      )}

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

      {/* ★ KPI کارت‌ها (۴ تا، کوچک و جمع‌وجور) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard
          label="فروش امروز"
          value={formatNumber(stats.todaySales)}
          sublabel={`${formatNumber(stats.todayInvoices)} فاکتور`}
          color="border-emerald-200"
          icon={<div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>}
          onClick={() => setCurrentView('invoices')}
        />
        <KpiCard
          label="فروش ماه"
          value={formatNumber(stats.monthSales)}
          sublabel={`${formatNumber(stats.monthInvoices)} فاکتور`}
          color="border-sky-200"
          icon={<div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center"><FileText className="w-5 h-5 text-sky-600" /></div>}
          onClick={() => setCurrentView('invoices')}
        />
        <KpiCard
          label="سود ماه"
          value={formatNumber(stats.monthlyProfit)}
          sublabel={stats.monthlyProfit >= 0 ? 'سودآور' : 'زیان'}
          color="border-purple-200"
          icon={<div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center"><Wallet className="w-5 h-5 text-purple-600" /></div>}
          onClick={() => setCurrentView('reports')}
        />
        <KpiCard
          label="موجودی بحرانی"
          value={formatNumber(stats.lowStockProducts)}
          sublabel="نیاز به سفارش"
          color="border-red-200"
          icon={<div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center"><Package className="w-5 h-5 text-red-600" /></div>}
          onClick={() => setCurrentView('products')}
        />
      </div>

      {/* ★ نمودار فروش + دسته‌بندی */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* نمودار روند فروش */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">روند فروش</CardTitle>
              <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-md">
                <button
                  className={`px-2 py-0.5 text-[10px] rounded ${salesRange === '7d' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500'}`}
                  onClick={() => setSalesRange('7d')}
                >۷ روز</button>
                <button
                  className={`px-2 py-0.5 text-[10px] rounded ${salesRange === '30d' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500'}`}
                  onClick={() => setSalesRange('30d')}
                >۳۰ روز</button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig} className="h-[200px] w-full">
              <LineChart data={salesRange === '7d' ? dailySales : dailySales30} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={salesRange === '30d' ? 9 : 11} interval={salesRange === '30d' ? 'preserveStartEnd' : 0} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={10} tickFormatter={(v) => formatCompact(v)} width={50} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(v as number)} />} />
                <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2.5} dot={salesRange === '7d' ? { fill: '#10b981', r: 3 } : false} activeDot={{ r: 5 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* نمودار دسته‌بندی */}
        {categorySales.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">فروش بر اساس دسته</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={lineChartConfig} className="h-[200px] w-full">
                <PieChart>
                  <Pie data={categorySales} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} label={({ name, value }) => `${name} ${value}%`} labelLine={false}>
                    {categorySales.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ★ پرفروش‌ترین محصولات */}
      {topProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Package className="w-4 h-4 text-emerald-600" />
              پرفروش‌ترین محصولات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig} className="h-[180px] w-full">
              <BarChart data={topProducts.map(p => ({ name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name, totalSales: p.totalSales, totalQuantity: p.totalQuantity }))} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={9} tickFormatter={(v) => formatCompact(v)} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={9} width={80} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v, _n, props) => [formatCurrency(v as number), `${formatNumber(props.payload.totalQuantity)} عدد`]} />} />
                <Bar dataKey="totalSales" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* ★ آخرین فاکتورها + محصولات کم‌موجود */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* آخرین فاکتورها */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">آخرین فاکتورها</CardTitle>
              <Button variant="ghost" size="sm" className="text-emerald-600 gap-1 text-[10px] h-6" onClick={() => setCurrentView('invoices')}>
                همه <ArrowLeft className="size-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {recentInvoices.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">فاکتوری ثبت نشده</p>
            ) : (
              <div className="px-3 space-y-1">
                {recentInvoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-gray-500 shrink-0">{inv.number}</span>
                      <span className="truncate">{inv.customerName || 'فروش عمومی'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold">{formatNumber(inv.totalAmount)}</span>
                      {getStatusBadge(inv.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* محصولات کم‌موجود */}
        {lowStockProducts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  موجودی بحرانی
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-emerald-600 gap-1 text-[10px] h-6" onClick={() => setCurrentView('products')}>
                  همه <ArrowLeft className="size-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <div className="px-3 space-y-1">
                {lowStockProducts.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-gray-400 text-[10px] shrink-0">{p.code}</span>
                      <span className="truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-red-600">{formatNumber(p.currentStock)}</span>
                      <span className="text-[9px] text-gray-400">{p.unit}</span>
                    </div>
                  </div>
                ))}
                {lowStockProducts.length > 5 && (
                  <p className="text-[10px] text-gray-400 text-center pt-1">
                    و {formatNumber(lowStockProducts.length - 5)} محصول دیگر
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
        {/* ★★★ ویزارد راه‌اندازی */}
      <SetupWizard
        open={open}
        onOpenChange={setOpen}
        onComplete={handleComplete}
      />
    </div>
  )
}
