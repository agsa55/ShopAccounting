'use client'

// ============================================================================
// src/components/reports/inventory-advanced-report.tsx
// ShopAccounting v6.6 — Advanced Inventory Reports
// ============================================================================
// ★★★ ۴ نوع گزارش:
//   ۱. موجودی هر محصول در هر انبار (stockByWarehouse)
//   ۲. حرکت کالا (movements) با فیلتر تاریخ و نوع
//   ۳. ارزش انبار (value) — گروه‌بندی بر اساس انبار و دسته
//   ۴. کالاهای کم‌موجود (lowStock)
// ============================================================================

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Package, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, Wallet,
  AlertTriangle, Loader2, Download, Printer, Calendar,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts'

// ============================================================================
//  Helpers
// ============================================================================

const toFaNum = (n: number | string) => String(n || 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const CHART_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
]

const REPORT_TYPES = [
  { value: 'stockByWarehouse', label: 'موجودی هر انبار', icon: Package },
  { value: 'movements', label: 'حرکت کالا', icon: ArrowRightLeft },
  { value: 'value', label: 'ارزش انبار', icon: Wallet },
  { value: 'lowStock', label: 'کالاهای کم‌موجود', icon: AlertTriangle },
]

// ============================================================================
//  Main Component
// ============================================================================

export function InventoryAdvancedReport() {
  const [reportType, setReportType] = useState<string>('stockByWarehouse')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ★ فیلترها
  const [warehouseId, setWarehouseId] = useState<string>('all')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  const warehouses = data?.warehouses || []
  const categories = data?.categories || []

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ type: reportType })
      if (warehouseId !== 'all') params.set('warehouseId', warehouseId)
      if (categoryId !== 'all') params.set('categoryId', categoryId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (lowStockOnly) params.set('lowStockOnly', 'true')

      const res = await fetch(`/api/reports/inventory-advanced?${params.toString()}`, {
        headers: getAuthHeaders(),
      })
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.error || 'خطا در دریافت داده‌ها')
        setData(null)
      }
    } catch (err: any) {
      console.error('[Inventory Report] Fetch error:', err)
      setError(err?.message || 'خطا در ارتباط با سرور')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [reportType, warehouseId, categoryId, dateFrom, dateTo, lowStockOnly])

  useEffect(() => { fetchData() }, [fetchData])

  // ★ Export CSV
  const handleExportExcel = () => {
    if (!data) return
    let rows: (string | number)[][] = []
    let filename = `inventory-${reportType}`

    if (reportType === 'stockByWarehouse' && data.products) {
      rows.push(['کد', 'نام محصول', 'دسته', 'موجودی کل', 'ارزش خرید', 'ارزش فروش', 'سود بالقوه'])
      data.products.forEach((p: any) => {
        rows.push([p.code, p.name, p.categoryName, p.totalQty, p.totalValue, p.retailValue, p.potentialProfit])
      })
    } else if (reportType === 'movements' && data.movements) {
      rows.push(['تاریخ', 'محصول', 'نوع', 'از انبار', 'به انبار', 'تعداد', 'هزینه واحد', 'ارزش کل'])
      data.movements.forEach((m: any) => {
        rows.push([
          new Date(m.date).toLocaleDateString('fa-IR'),
          m.productName, m.movementTypeLabel,
          m.fromWarehouseName || '—', m.toWarehouseName || '—',
          m.quantity, m.unitCost, m.totalValue,
        ])
      })
    } else if (reportType === 'value' && data.warehouseValues) {
      rows.push(['انبار', 'تعداد محصولات', 'تعداد کل', 'ارزش کل'])
      data.warehouseValues.forEach((w: any) => {
        rows.push([w.warehouseName, w.productCount, w.totalQuantity, w.totalValue])
      })
    } else if (reportType === 'lowStock' && data.products) {
      rows.push(['کد', 'نام', 'دسته', 'موجودی', 'حداقل', 'کمبود', 'ارزش کمبود', 'وضعیت'])
      data.products.forEach((p: any) => {
        rows.push([p.code, p.name, p.categoryName, p.currentStock, p.minStock, p.shortage, p.shortageValue, p.status])
      })
    }

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
        <p className="text-sm text-gray-500">در حال بارگذاری گزارش...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
        <Button variant="outline" onClick={fetchData}>تلاش مجدد</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* ★ انتخاب نوع گزارش */}
      <div className="flex flex-wrap gap-2">
        {REPORT_TYPES.map((rt) => {
          const Icon = rt.icon
          const isActive = reportType === rt.value
          return (
            <button
              key={rt.value}
              onClick={() => { setReportType(rt.value); setLowStockOnly(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {rt.label}
            </button>
          )
        })}
      </div>

      {/* ★ فیلترها */}
      <Card className="border-gray-200">
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          {(reportType === 'stockByWarehouse' || reportType === 'movements' || reportType === 'value') && (
            <div className="min-w-[150px]">
              <label className="text-[10px] text-gray-500">انبار</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه انبارها</SelectItem>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {reportType === 'stockByWarehouse' && (
            <div className="min-w-[150px]">
              <label className="text-[10px] text-gray-500">دسته</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {reportType === 'movements' && (
            <>
              <div>
                <label className="text-[10px] text-gray-500">از تاریخ</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 text-xs px-2 border border-gray-200 rounded-md mt-0.5"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">تا تاریخ</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 text-xs px-2 border border-gray-200 rounded-md mt-0.5"
                  dir="ltr"
                />
              </div>
            </>
          )}

          {reportType === 'stockByWarehouse' && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer h-8 px-2">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              فقط کم‌موجود
            </label>
          )}

          <div className="flex-1" />

          <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-8 text-xs gap-1">
            <Download className="w-3.5 h-3.5" />
            خروجی Excel
          </Button>
        </CardContent>
      </Card>

      {/* ★ محتوای گزارش */}
      {data && (
        <>
          {/* ★ خلاصه KPI */}
          {data.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {reportType === 'stockByWarehouse' && (
                <>
                  <KpiCard label="تعداد محصولات" value={formatNumber(data.summary.totalProducts)} color="emerald" />
                  <KpiCard label="موجودی کل" value={formatNumber(data.summary.totalQty)} color="blue" />
                  <KpiCard label="ارزش انبار" value={formatNumber(data.summary.totalValue) + ' ریال'} color="amber" />
                  <KpiCard label="سود بالقوه" value={formatNumber(data.summary.totalPotentialProfit) + ' ریال'} color="emerald" />
                </>
              )}
              {reportType === 'movements' && (
                <>
                  <KpiCard label="تعداد حرکت‌ها" value={formatNumber(data.summary.totalMovements)} color="emerald" />
                  <KpiCard label="ارزش ورودی" value={formatNumber(data.summary.totalIn) + ' ریال'} color="blue" />
                  <KpiCard label="ارزش خروجی" value={formatNumber(data.summary.totalOut) + ' ریال'} color="amber" />
                  <KpiCard label="انتقال‌ها" value={formatNumber(data.summary.totalTransfer)} color="purple" />
                </>
              )}
              {reportType === 'value' && (
                <>
                  <KpiCard label="تعداد انبارها" value={formatNumber(data.summary.totalWarehouses)} color="emerald" />
                  <KpiCard label="تعداد محصولات" value={formatNumber(data.summary.totalProducts)} color="blue" />
                  <KpiCard label="تعداد کل" value={formatNumber(data.summary.totalQuantity)} color="amber" />
                  <KpiCard label="ارزش کل انبار" value={formatNumber(data.summary.totalValue) + ' ریال'} color="emerald" />
                </>
              )}
              {reportType === 'lowStock' && (
                <>
                  <KpiCard label="کم‌موجود" value={formatNumber(data.summary.totalLowStock)} color="amber" />
                  <KpiCard label="ناموجود" value={formatNumber(data.summary.totalOutOfStock)} color="red" />
                  <KpiCard label="ارزش کمبود" value={formatNumber(data.summary.totalShortageValue) + ' ریال'} color="red" />
                  <KpiCard label="کل کالاهای نیاز" value={formatNumber(data.summary.totalLowStock + data.summary.totalOutOfStock)} color="blue" />
                </>
              )}
            </div>
          )}

          {/* ★ نمودار (برای value) */}
          {reportType === 'value' && data.warehouseValues && data.warehouseValues.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ارزش انبارها</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.warehouseValues}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="warehouseName" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => formatNumber(v)} width={80} />
                      <Tooltip formatter={(value: number) => [formatNumber(value) + ' ریال', 'ارزش']} contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="totalValue" name="ارزش" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ★ نمودار Pie برای دسته‌بندی (value) */}
          {reportType === 'value' && data.categoryValues && data.categoryValues.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">توزیع ارزش بر اساس دسته</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={data.categoryValues}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry: any) => `${entry.name}: ${formatNumber(entry.value)}`}
                      >
                        {data.categoryValues.map((_: any, idx: number) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [formatNumber(value) + ' ریال', 'ارزش']} contentStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ★ جدول گزارش */}
          <Card className="border-gray-200">
            <CardContent className="p-0">
              {reportType === 'stockByWarehouse' && data.products && (
                <InventoryStockTable products={data.products} warehouses={warehouses} />
              )}
              {reportType === 'movements' && data.movements && (
                <MovementsTable movements={data.movements} />
              )}
              {reportType === 'value' && data.warehouseValues && (
                <ValueTable warehouseValues={data.warehouseValues} categoryValues={data.categoryValues} />
              )}
              {reportType === 'lowStock' && data.products && (
                <LowStockTable products={data.products} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ============================================================================
//  KPI Card
// ============================================================================

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div className={`border rounded-lg p-2.5 ${colorMap[color] || colorMap.emerald}`}>
      <p className="text-[10px] opacity-80 mb-0.5">{label}</p>
      <p className="text-sm font-bold" dir="ltr">{value}</p>
    </div>
  )
}

// ============================================================================
//  Inventory Stock Table (موجودی هر انبار)
// ============================================================================

function InventoryStockTable({ products, warehouses }: { products: any[]; warehouses: any[] }) {
  if (products.length === 0) {
    return <EmptyState message="محصولی یافت نشد" />
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-right text-[10px] py-2 px-2">محصول</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">دسته</TableHead>
            {warehouses.map((w: any) => (
              <TableHead key={w.id} className="text-center text-[10px] py-2 px-2">{w.name}</TableHead>
            ))}
            <TableHead className="text-center text-[10px] py-2 px-2">کل</TableHead>
            <TableHead className="text-left text-[10px] py-2 px-2">ارزش</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id} className="hover:bg-emerald-50/30">
              <TableCell className="text-[11px] py-1.5 px-2">
                <div className="font-medium truncate max-w-[180px]">{p.name}</div>
                <div className="text-[9px] text-gray-400" dir="ltr">{p.code}</div>
              </TableCell>
              <TableCell className="text-center text-[10px] py-1.5 px-2 text-gray-600">{p.categoryName}</TableCell>
              {warehouses.map((w: any) => {
                const ws = p.warehouseStocks.find((s: any) => s.warehouseId === w.id)
                return (
                  <TableCell key={w.id} className="text-center text-[11px] py-1.5 px-2">
                    {ws ? (
                      <span className={ws.quantity <= 0 ? 'text-red-500' : ws.quantity <= p.minStock ? 'text-amber-600' : 'text-gray-700'}>
                        {formatNumber(ws.quantity)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </TableCell>
                )
              })}
              <TableCell className="text-center text-[11px] py-1.5 px-2 font-bold">
                <span className={p.isOutOfStock ? 'text-red-600' : p.isLowStock ? 'text-amber-600' : 'text-emerald-700'}>
                  {formatNumber(p.totalQty)}
                </span>
              </TableCell>
              <TableCell className="text-left text-[11px] py-1.5 px-2 font-medium text-gray-700" dir="ltr">
                {formatNumber(p.totalValue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ============================================================================
//  Movements Table (حرکت کالا)
// ============================================================================

function MovementsTable({ movements }: { movements: any[] }) {
  if (movements.length === 0) {
    return <EmptyState message="حرکتی در این بازه ثبت نشده است" />
  }

  return (
    <div className="overflow-x-auto max-h-[500px]">
      <Table>
        <TableHeader className="sticky top-0 bg-gray-50 z-10">
          <TableRow>
            <TableHead className="text-right text-[10px] py-2 px-2">تاریخ</TableHead>
            <TableHead className="text-right text-[10px] py-2 px-2">محصول</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">نوع</TableHead>
            <TableHead className="text-right text-[10px] py-2 px-2">از / به</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">تعداد</TableHead>
            <TableHead className="text-left text-[10px] py-2 px-2">ارزش</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.id} className="hover:bg-blue-50/30">
              <TableCell className="text-[10px] py-1.5 px-2 text-gray-500" dir="ltr">
                {new Date(m.date).toLocaleDateString('fa-IR')}
              </TableCell>
              <TableCell className="text-[11px] py-1.5 px-2">
                <div className="font-medium truncate max-w-[150px]">{m.productName}</div>
                <div className="text-[9px] text-gray-400" dir="ltr">{m.productCode}</div>
              </TableCell>
              <TableCell className="text-center py-1.5 px-2">
                <Badge variant="outline" className={`text-[9px] ${
                  m.movementType === 'sale' ? 'bg-red-50 text-red-700 border-red-200'
                  : m.movementType === 'purchase' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : m.movementType === 'transfer' ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : m.movementType === 'adjustment' ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-gray-50 text-gray-700 border-gray-200'
                }`}>
                  {m.movementTypeLabel}
                </Badge>
              </TableCell>
              <TableCell className="text-[10px] py-1.5 px-2 text-gray-600">
                {m.isTransfer ? (
                  <span>{m.fromWarehouseName} ← {m.toWarehouseName}</span>
                ) : m.isIncoming ? (
                  <span className="text-emerald-600">→ {m.toWarehouseName}</span>
                ) : (
                  <span className="text-red-600">{m.fromWarehouseName} ←</span>
                )}
              </TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2 font-medium">
                {formatNumber(m.quantity)}
                <span className="text-[9px] text-gray-400 mr-1">{m.unitName}</span>
              </TableCell>
              <TableCell className="text-left text-[11px] py-1.5 px-2 text-gray-700" dir="ltr">
                {formatNumber(m.totalValue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ============================================================================
//  Value Table (ارزش انبار)
// ============================================================================

function ValueTable({ warehouseValues, categoryValues }: { warehouseValues: any[]; categoryValues: any[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      {/* ★ ارزش بر اساس انبار */}
      <div>
        <h3 className="text-xs font-bold text-gray-700 mb-2">ارزش بر اساس انبار</h3>
        {warehouseValues.length === 0 ? (
          <EmptyState message="داده‌ای موجود نیست" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-right text-[10px] py-2 px-2">انبار</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">محصولات</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">تعداد</TableHead>
                <TableHead className="text-left text-[10px] py-2 px-2">ارزش</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouseValues.map((w) => (
                <TableRow key={w.warehouseId} className="hover:bg-emerald-50/30">
                  <TableCell className="text-[11px] py-1.5 px-2 font-medium">
                    {w.warehouseName}
                    {w.isDefault && <Badge variant="outline" className="text-[8px] mr-1 bg-emerald-50">پیش‌فرض</Badge>}
                  </TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(w.productCount)}</TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(w.totalQuantity)}</TableCell>
                  <TableCell className="text-left text-[11px] py-1.5 px-2 font-bold text-emerald-700" dir="ltr">
                    {formatNumber(w.totalValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ★ ارزش بر اساس دسته */}
      <div>
        <h3 className="text-xs font-bold text-gray-700 mb-2">ارزش بر اساس دسته</h3>
        {categoryValues.length === 0 ? (
          <EmptyState message="داده‌ای موجود نیست" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-right text-[10px] py-2 px-2">دسته</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">محصولات</TableHead>
                <TableHead className="text-center text-[10px] py-2 px-2">تعداد</TableHead>
                <TableHead className="text-left text-[10px] py-2 px-2">ارزش</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryValues.map((c, idx) => (
                <TableRow key={idx} className="hover:bg-emerald-50/30">
                  <TableCell className="text-[11px] py-1.5 px-2 font-medium">
                    <span className="inline-block w-2 h-2 rounded-full ml-1.5" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    {c.name}
                  </TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(c.count)}</TableCell>
                  <TableCell className="text-center text-[11px] py-1.5 px-2">{formatNumber(c.quantity)}</TableCell>
                  <TableCell className="text-left text-[11px] py-1.5 px-2 font-bold text-emerald-700" dir="ltr">
                    {formatNumber(c.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

// ============================================================================
//  Low Stock Table (کالاهای کم‌موجود)
// ============================================================================

function LowStockTable({ products }: { products: any[] }) {
  if (products.length === 0) {
    return <EmptyState message="همه محصولات موجودی کافی دارند ✓" />
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-right text-[10px] py-2 px-2">محصول</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">دسته</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">موجودی</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">حداقل</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">کمبود</TableHead>
            <TableHead className="text-left text-[10px] py-2 px-2">ارزش کمبود</TableHead>
            <TableHead className="text-center text-[10px] py-2 px-2">وضعیت</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id} className="hover:bg-amber-50/30">
              <TableCell className="text-[11px] py-1.5 px-2">
                <div className="font-medium truncate max-w-[180px]">{p.name}</div>
                <div className="text-[9px] text-gray-400" dir="ltr">{p.code}</div>
              </TableCell>
              <TableCell className="text-center text-[10px] py-1.5 px-2 text-gray-600">{p.categoryName}</TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2">
                <span className={p.status === 'out' ? 'text-red-600 font-bold' : 'text-amber-600 font-bold'}>
                  {formatNumber(p.currentStock)}
                </span>
              </TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2 text-gray-600">{formatNumber(p.minStock)}</TableCell>
              <TableCell className="text-center text-[11px] py-1.5 px-2 font-bold text-red-600">
                {p.shortage > 0 ? formatNumber(p.shortage) : '—'}
              </TableCell>
              <TableCell className="text-left text-[11px] py-1.5 px-2 text-red-600" dir="ltr">
                {p.shortageValue > 0 ? formatNumber(p.shortageValue) : '—'}
              </TableCell>
              <TableCell className="text-center py-1.5 px-2">
                <Badge variant="outline" className={`text-[9px] ${
                  p.status === 'out' ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {p.status === 'out' ? 'ناموجود' : 'کم'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ============================================================================
//  Empty State
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Package className="w-10 h-10 mb-2 text-gray-300" />
      <p className="text-xs">{message}</p>
    </div>
  )
}

export default InventoryAdvancedReport
