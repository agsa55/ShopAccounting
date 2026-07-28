'use client'

// ============================================================================
// src/components/inventory/stock-count-page.tsx
// ShopAccounting v6.5.2 — Stock Count Page (clean rewrite)
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ClipboardList, Plus, Loader2, CheckCircle2, Package, AlertTriangle,
  Search, Eye, XCircle, CheckCircle, Clock, FileText,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ============================================================================
//  Types
// ============================================================================

interface Warehouse { id: string; name: string; code: string; isDefault?: boolean }

interface StockCountItem {
  id: string
  productId: string
  systemQty: number
  countedQty: number
  difference: number
  unitCost: number
  differenceAmount: number
  reason: string | null
  Product: { id: string; name: string; code: string; barcode?: string | null; unit?: { nameFa: string; symbol: string | null } | null }
}

interface StockCount {
  id: string
  number: string
  warehouseId: string
  warehouseName: string
  countDate: string
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
  countedByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  notes: string | null
  totalDifference: number
  totalItems: number
  itemsCount: number
  items?: StockCountItem[]
}

interface Product {
  id: string
  name: string
  code: string
  barcode?: string | null
  currentStock: number
  purchasePrice: number
  unit?: { nameFa?: string; name: string } | null
}

// ============================================================================
//  Helpers
// ============================================================================

const toFa = (n: number | string) => String(n || 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft:       { label: 'پیش‌نویس',     color: 'text-gray-700',  bg: 'bg-gray-100 border-gray-200',  icon: FileText },
  in_progress: { label: 'در حال شمارش', color: 'text-blue-700',  bg: 'bg-blue-100 border-blue-200',  icon: Clock },
  completed:   { label: 'تأیید شده',    color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-200', icon: CheckCircle2 },
  cancelled:   { label: 'لغو شده',      color: 'text-red-700',   bg: 'bg-red-100 border-red-200',    icon: XCircle },
}

// ============================================================================
//  Main Component
// ============================================================================

export function StockCountPage() {
  const { toast } = useToast()
  const [stockCounts, setStockCounts] = useState<StockCount[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [filterWarehouse, setFilterWarehouse] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('')
  const [products, setProducts] = useState<Product[]>([])
  const [countedItems, setCountedItems] = useState<Record<string, { countedQty: string; reason: string }>>({})
  const [productSearch, setProductSearch] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedCount, setSelectedCount] = useState<StockCount | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [approveNotes, setApproveNotes] = useState('')
const isOnline = useAppStore((s) => s.isOnline)

// ★ کلیدهای localStorage برای کش
const STORAGE_KEYS = {
  STOCK_COUNTS: 'stock_counts_offline',
  WAREHOUSES: 'warehouses_offline',
} as const

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch { return defaultValue }
}
const saveToStorage = <T,>(key: string, value: T): void => {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ★★★ v6.5.1: صفحه‌بندی


  // ★★★ v6.5.1: صفحه‌بندی
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

 const loadData = useCallback(async () => {
  setLoading(true)
  const tid = useAppStore.getState().tenantId || useAppStore.getState().currentTenant?.id
  const trulyOnline = isOnline && navigator.onLine
  
  if (!trulyOnline) {
    const cachedCounts = loadFromStorage<StockCount[]>(STORAGE_KEYS.STOCK_COUNTS, [])
    const cachedWh = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
    setStockCounts(cachedCounts)
    setWarehouses(cachedWh)
    setLoading(false)
    if (cachedCounts.length === 0) {
      toast({ title: 'حالت آفلاین', description: 'داده‌ای در حافظه یافت نشد' })
    }
    return
  }
  
  try {
    if (!tid) { setLoading(false); return }
    const params = new URLSearchParams({ tenantId: tid })
    if (filterWarehouse !== 'all') params.set('warehouseId', filterWarehouse)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    const [whRes, scRes] = await Promise.all([
      fetch(`/api/warehouses?tenantId=${tid}`, { headers: getAuthHeaders() }),
      fetch(`/api/stock-counts?${params.toString()}`, { headers: getAuthHeaders() }),
    ])
    const [whData, scData] = await Promise.all([whRes.json(), scRes.json()])
    if (whData.success) {
      setWarehouses(whData.data || [])
      saveToStorage(STORAGE_KEYS.WAREHOUSES, whData.data || [])
      const def = (whData.data || []).find((w: Warehouse) => w.isDefault)
      if (def) setSelectedWarehouse(def.id)
    }
    if (scData.success) {
      setStockCounts(scData.data || [])
      saveToStorage(STORAGE_KEYS.STOCK_COUNTS, scData.data || [])
    }
  } catch (err: any) {
    if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
      console.warn('[StockCountPage] سوئیچ به آفلاین')
      setStockCounts(loadFromStorage<StockCount[]>(STORAGE_KEYS.STOCK_COUNTS, []))
      setWarehouses(loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, []))
    } else {
      console.error('Error loading data:', err)
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
  }
  setLoading(false)
}, [filterWarehouse, filterStatus, isOnline, toast])

  useEffect(() => { loadData() }, [loadData])

  const loadProducts = useCallback(async () => {
    if (!selectedWarehouse) return
    setLoadingProducts(true)
    try {
      const tid = useAppStore.getState().tenantId || useAppStore.getState().currentTenant?.id
      const res = await fetch(
        `/api/products?tenantId=${tid}&limit=9999&warehouseId=${selectedWarehouse}`,
        { headers: getAuthHeaders() }
      )
      const data = await res.json()
      if (data.success) {
        const prods = Array.isArray(data.data) ? data.data : (data.data?.products || data.data?.data || [])
        setProducts(prods)
      }
    } catch (err: any) {
      console.error('Error loading products:', err)
    }
    setLoadingProducts(false)
  }, [selectedWarehouse])

  useEffect(() => {
    if (createDialogOpen && selectedWarehouse) {
      loadProducts()
    }
  }, [createDialogOpen, selectedWarehouse, loadProducts])

  const computedTotals = useMemo(() => {
    let totalShortage = 0
    let totalSurplus = 0
    let countedItemsCount = 0

    for (const product of products) {
      const item = countedItems[product.id]
      if (!item || item.countedQty === '') continue

      const countedQty = parseFloat(item.countedQty) || 0
      const systemQty = product.currentStock || 0
      const unitCost = product.purchasePrice || 0
      const difference = countedQty - systemQty
      const differenceAmount = difference * unitCost

      countedItemsCount++
      if (difference < 0) totalShortage += Math.abs(differenceAmount)
      else if (difference > 0) totalSurplus += differenceAmount
    }

    return {
      totalShortage,
      totalSurplus,
      netDifference: totalSurplus - totalShortage,
      countedItemsCount,
    }
  }, [products, countedItems])

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products
    const q = productSearch.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    )
  }, [products, productSearch])

  // ★★★ v6.5.1: صفحه‌بندی
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const currentPageSafe = Math.min(currentPage, totalPages)
  const paginatedProducts = useMemo(() => {
    const start = (currentPageSafe - 1) * pageSize
    return filteredProducts.slice(start, start + pageSize)
  }, [filteredProducts, currentPageSafe])

  useEffect(() => { setCurrentPage(1) }, [productSearch])

  const handleCreate = async () => {
    
     if (!isOnline) {
    toast({ title: 'عدم دسترسی', description: 'ایجاد سند انبار گردانی نیاز به اتصال اینترنت دارد', variant: 'destructive' })
    return
  }
  if (!selectedWarehouse) {
      toast({ title: 'خطا', description: 'انتخاب انبار الزامی است', variant: 'destructive' })
      return
    }
    if (computedTotals.countedItemsCount === 0) {
      toast({ title: 'خطا', description: 'حداقل یک محصول را شمارش کنید', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const tid = useAppStore.getState().tenantId || useAppStore.getState().currentTenant?.id
      const items = Object.entries(countedItems)
        .filter(([_, v]) => v.countedQty !== '')
        .map(([productId, v]) => ({
          productId,
          countedQty: parseFloat(v.countedQty) || 0,
          reason: v.reason || null,
        }))

      const res = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tenantId: tid,
          warehouseId: selectedWarehouse,
          status: 'draft',
          items,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        setCreateDialogOpen(false)
        setCountedItems({})
        setProductSearch('')
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setSubmitting(false)
  }

  const handleViewDetail = async (sc: StockCount) => {
    setLoadingDetail(true)
    setDetailDialogOpen(true)
    try {
      const res = await fetch(`/api/stock-counts/${sc.id}`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        setSelectedCount(data.data)
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setLoadingDetail(false)
  }

  const handleApprove = async () => {
    if (!isOnline) {
    toast({ title: 'عدم دسترسی', description: 'تأیید سند نیاز به اتصال اینترنت دارد', variant: 'destructive' })
    return
  }
  if (!selectedCount) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/stock-counts/${selectedCount.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'approve', notes: approveNotes }),
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        setApproveDialogOpen(false)
        setApproveNotes('')
        setDetailDialogOpen(false)
        setSelectedCount(null)
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setSubmitting(false)
  }

  const handleCancel = async (sc: StockCount) => {
    if (!isOnline) {
    toast({ title: 'عدم دسترسی', description: 'لغو سند نیاز به اتصال اینترنت دارد', variant: 'destructive' })
    return
  }
  if (!confirm(`آیا از لغو سند ${sc.number} مطمئن هستید؟`)) return
    try {
      const res = await fetch(`/api/stock-counts/${sc.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4" dir="rtl">
      {/* ★ Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">انبار گردانی</h1>
           <p className="text-xs text-gray-500">
  {formatNumber(stockCounts.length)} سند ثبت شده
  {!isOnline && <span className="mr-2 text-amber-600">• آفلاین</span>}
</p>
          </div>
        </div>
       <Button
  onClick={() => setCreateDialogOpen(true)}
  className="gap-1.5 bg-purple-600 hover:bg-purple-700 w-full sm:w-auto"
>
  <Plus className="w-4 h-4" />
  <span className="hidden sm:inline">انبار گردانی جدید</span>
  <span className="sm:hidden">جدید</span>
</Button>
      </div>

      {/* ★ فیلترها */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">انبار</Label>
            <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه انبارها</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <Label className="text-xs">وضعیت</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="draft">پیش‌نویس</SelectItem>
                <SelectItem value="in_progress">در حال شمارش</SelectItem>
                <SelectItem value="completed">تأیید شده</SelectItem>
                <SelectItem value="cancelled">لغو شده</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ★ لیست اسناد */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
          ) : stockCounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ClipboardList className="w-12 h-12 mb-2 text-gray-300" />
              <p className="text-sm">سند انبار گردانی ثبت نشده است</p>
              <Button onClick={() => setCreateDialogOpen(true)} variant="outline" className="mt-3 text-xs gap-1">
                <Plus className="w-3 h-3" />
                شروع انبار گردانی
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-right text-xs">شماره</TableHead>
                  <TableHead className="text-right text-xs">تاریخ</TableHead>
                  <TableHead className="text-right text-xs">انبار</TableHead>
                  <TableHead className="text-center text-xs">آیتم‌ها</TableHead>
                  <TableHead className="text-left text-xs">اختلاف مالی</TableHead>
                  <TableHead className="text-center text-xs">وضعیت</TableHead>
                  <TableHead className="text-center text-xs">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockCounts.map((sc) => {
                  const statusCfg = STATUS_CONFIG[sc.status] || STATUS_CONFIG.draft
                  const StatusIcon = statusCfg.icon
                  const isPositive = sc.totalDifference >= 0
                  return (
                    <TableRow key={sc.id} className="hover:bg-purple-50/30">
                      <TableCell className="text-xs font-bold" dir="ltr">{sc.number}</TableCell>
                      <TableCell className="text-xs" dir="ltr">
                        {new Date(sc.countDate).toLocaleDateString('fa-IR')}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[9px] bg-purple-50">{sc.warehouseName}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs font-medium">{formatNumber(sc.itemsCount || sc.totalItems)}</TableCell>
                      <TableCell className="text-left text-xs">
                        {sc.totalDifference === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span className={isPositive ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                            {isPositive ? '+' : '-'}{formatNumber(Math.abs(sc.totalDifference))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[9px] ${statusCfg.bg} ${statusCfg.color}`}>
                          <StatusIcon className="w-2.5 h-2.5 ml-1" />
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetail(sc)}
                            className="h-7 w-7 p-0"
                            title="مشاهده جزئیات"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {(sc.status === 'draft' || sc.status === 'in_progress') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedCount(sc)
                                setApproveNotes('')
                                setApproveDialogOpen(true)
                              }}
                              className="h-7 px-2 text-emerald-600 hover:bg-emerald-50"
                              title="تأیید و ثبت"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {(sc.status === 'draft' || sc.status === 'in_progress') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(sc)}
                              className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                              title="لغو"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ★ مودال ایجاد سند جدید */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
       <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[1200px] max-h-[95vh] rounded-xl" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="w-5 h-5 text-purple-600" />
              انبار گردانی جدید
            </DialogTitle>
            <DialogDescription className="text-xs">
              موجودی فیزیکی محصولات را شمارش کنید. اختلاف با موجودی سیستمی خودکار محاسبه می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 overflow-y-auto max-h-[80vh] pr-1">
            {/* ★ انتخاب انبار */}
            <div>
              <Label className="text-xs">انبار <span className="text-red-500">*</span></Label>
              <Select
                value={selectedWarehouse}
                onValueChange={(v) => { setSelectedWarehouse(v); setCountedItems({}) }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="انتخاب انبار..." /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {selectedWarehouse && (
              <>
                {/* ★ جستجوی محصول */}
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="جستجوی محصول (نام/کد/بارکد)..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pr-9"
                  />
                </div>

                {/* ★ خلاصه */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-blue-600">شمارش شده</p>
                    <p className="text-sm font-bold text-blue-700">{formatNumber(computedTotals.countedItemsCount)}</p>
                  </div>
                  <div className={`border rounded-lg p-2 text-center ${computedTotals.totalShortage > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-[10px] text-red-600">کسری</p>
                    <p className="text-sm font-bold text-red-700">{formatNumber(computedTotals.totalShortage)}</p>
                  </div>
                  <div className={`border rounded-lg p-2 text-center ${computedTotals.totalSurplus > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-[10px] text-emerald-600">مازاد</p>
                    <p className="text-sm font-bold text-emerald-700">{formatNumber(computedTotals.totalSurplus)}</p>
                  </div>
                </div>

                {/* ★ لیست محصولات — جمع‌وجور */}
                {loadingProducts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  </div>
                ) : paginatedProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs">محصولی یافت نشد</p>
                  </div>
                ) : (
                  <>
                    <div className="border border-gray-200 rounded-lg max-h-[420px] overflow-y-auto">
                      <Table className="compact-table">
                        <TableHeader className="sticky top-0 bg-gray-50 z-10">
                          <TableRow className="h-7">
                            <TableHead className="text-right text-[10px] py-1 px-2">محصول</TableHead>
                            <TableHead className="text-center text-[10px] py-1 px-2 w-16">سیستمی</TableHead>
                            <TableHead className="text-center text-[10px] py-1 px-2 w-20">شمارش</TableHead>
                            <TableHead className="text-center text-[10px] py-1 px-2 w-16">اختلاف</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedProducts.map((product) => {
                            const item = countedItems[product.id]
                            const countedQty = item?.countedQty ? parseFloat(item.countedQty) : null
                            const difference = countedQty !== null ? countedQty - (product.currentStock || 0) : 0
                            return (
                              <TableRow key={product.id} className="h-7 hover:bg-purple-50/40">
                                <TableCell className="text-[11px] py-0.5 px-2">
                                  <div className="font-medium truncate max-w-[280px] leading-tight">{product.name}</div>
                                  <div className="text-[9px] text-gray-400 leading-tight" dir="ltr">{product.code}</div>
                                </TableCell>
                                <TableCell className="text-center text-[11px] py-0.5 px-2 text-gray-600">{formatNumber(product.currentStock || 0)}</TableCell>
                                <TableCell className="py-0.5 px-2">
                                  <Input
                                    type="number"
                                    value={item?.countedQty || ''}
                                    onChange={(e) => setCountedItems(prev => ({
                                      ...prev,
                                      [product.id]: { countedQty: e.target.value, reason: item?.reason || '' }
                                    }))}
                                    className="h-6 text-[11px] text-center w-16 px-1"
                                    placeholder="۰"
                                  />
                                </TableCell>
                                <TableCell className="text-center text-[11px] py-0.5 px-2">
                                  {countedQty === null ? (
                                    <span className="text-gray-300">—</span>
                                  ) : (
                                    <span className={`font-bold ${
                                      difference === 0 ? 'text-gray-500'
                                      : difference > 0 ? 'text-emerald-600'
                                      : 'text-red-600'
                                    }`}>
                                      {difference > 0 ? '+' : ''}{formatNumber(difference)}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* ★★★ صفحه‌بندی */}
                    {filteredProducts.length > pageSize && (
                      <div className="flex items-center justify-between gap-2 px-2 py-1 border-t bg-gray-50 rounded-b-lg">
                        <div className="text-[10px] text-gray-500">
                          صفحه {toFa(currentPageSafe)} از {toFa(totalPages)} — {formatNumber(filteredProducts.length)} محصول
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPageSafe === 1}
                            className="h-6 px-1.5 text-[10px]"
                          >
                            قبلی
                          </Button>
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number
                            if (totalPages <= 5) {
                              pageNum = i + 1
                            } else if (currentPageSafe <= 3) {
                              pageNum = i + 1
                            } else if (currentPageSafe >= totalPages - 2) {
                              pageNum = totalPages - 4 + i
                            } else {
                              pageNum = currentPageSafe - 2 + i
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={pageNum === currentPageSafe ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setCurrentPage(pageNum)}
                                className={`h-6 w-6 p-0 text-[10px] ${pageNum === currentPageSafe ? 'bg-purple-600 text-white' : ''}`}
                              >
                                {toFa(pageNum)}
                              </Button>
                            )
                          })}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPageSafe === totalPages}
                            className="h-6 px-1.5 text-[10px]"
                          >
                            بعدی
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>انصراف</Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || computedTotals.countedItemsCount === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              ثبت سند ({formatNumber(computedTotals.countedItemsCount)} آیتم)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ مودال جزئیات */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
  <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[800px] max-h-[90vh] rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-600" />
              جزئیات انبار گردانی {selectedCount?.number}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
          ) : selectedCount ? (
            <div className="space-y-3 overflow-y-auto max-h-[70vh] pr-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">انبار</p>
                  <p className="text-sm font-bold">{selectedCount.warehouseName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">تاریخ</p>
                  <p className="text-sm font-bold" dir="ltr">{new Date(selectedCount.countDate).toLocaleDateString('fa-IR')}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">وضعیت</p>
                  <Badge variant="outline" className={`text-[9px] ${STATUS_CONFIG[selectedCount.status].bg} ${STATUS_CONFIG[selectedCount.status].color}`}>
                    {STATUS_CONFIG[selectedCount.status].label}
                  </Badge>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">آیتم‌ها</p>
                  <p className="text-sm font-bold">{formatNumber(selectedCount.itemsCount || selectedCount.totalItems)} قلم</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-red-600">جمع کسری</p>
                  <p className="text-sm font-bold text-red-700">
                    {formatNumber(selectedCount.items?.filter(i => i.difference < 0).reduce((s, i) => s + Math.abs(i.differenceAmount), 0) || 0)}
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-emerald-600">جمع مازاد</p>
                  <p className="text-sm font-bold text-emerald-700">
                    {formatNumber(selectedCount.items?.filter(i => i.difference > 0).reduce((s, i) => s + i.differenceAmount, 0) || 0)}
                  </p>
                </div>
                <div className={`border rounded-lg p-2 text-center ${selectedCount.totalDifference >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-[10px] text-gray-600">اختلاف خالص</p>
                  <p className={`text-sm font-bold ${selectedCount.totalDifference >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {selectedCount.totalDifference >= 0 ? '+' : '-'}{formatNumber(Math.abs(selectedCount.totalDifference))}
                  </p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50 z-10">
                    <TableRow>
                      <TableHead className="text-right text-[10px] py-2">محصول</TableHead>
                      <TableHead className="text-center text-[10px] py-2">سیستمی</TableHead>
                      <TableHead className="text-center text-[10px] py-2">شمارش</TableHead>
                      <TableHead className="text-center text-[10px] py-2">اختلاف</TableHead>
                      <TableHead className="text-left text-[10px] py-2">مبلغ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCount.items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs py-2">
                          <div className="font-medium">{item.Product.name}</div>
                          <div className="text-[9px] text-gray-400" dir="ltr">{item.Product.code}</div>
                        </TableCell>
                        <TableCell className="text-center text-xs py-2">{formatNumber(item.systemQty)}</TableCell>
                        <TableCell className="text-center text-xs py-2 font-bold">{formatNumber(item.countedQty)}</TableCell>
                        <TableCell className="text-center text-xs py-2">
                          <span className={`font-bold ${
                            item.difference === 0 ? 'text-gray-500'
                            : item.difference > 0 ? 'text-emerald-600'
                            : 'text-red-600'
                          }`}>
                            {item.difference > 0 ? '+' : ''}{formatNumber(item.difference)}
                          </span>
                        </TableCell>
                        <TableCell className="text-left text-xs py-2">
                          {item.differenceAmount === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={`font-bold ${item.differenceAmount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {item.differenceAmount > 0 ? '+' : '-'}{formatNumber(Math.abs(item.differenceAmount))}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedCount.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <p className="text-[10px] text-amber-600 mb-1">یادداشت:</p>
                  <p className="text-xs text-amber-800">{selectedCount.notes}</p>
                </div>
              )}

              {(selectedCount.status === 'draft' || selectedCount.status === 'in_progress') && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    onClick={() => {
                      setApproveNotes(selectedCount.notes || '')
                      setApproveDialogOpen(true)
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1"
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    تأیید و ثبت نهایی
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleCancel(selectedCount)}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 ml-1" />
                    لغو سند
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ★ مودال تأیید */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
<DialogContent className="w-[calc(100%-1rem)] sm:max-w-[500px] rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              تأیید انبار گردانی {selectedCount?.number}
            </DialogTitle>
            <DialogDescription className="text-xs">
              با تأیید این سند، موجودی انبار به‌روزرسانی شده و سند حسابداری خودکار ثبت می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 space-y-1">
                  <p className="font-bold">تأیید این عمل قابل بازگشت نیست!</p>
                  <p>• موجودی {selectedCount?.itemsCount || selectedCount?.totalItems} قلم به‌روزرسانی می‌شود</p>
                  <p>• سند حسابداری برای اختلافات ثبت می‌شود</p>
                  <p>• حرکت کالا (StockMovement) برای هر اختلاف ایجاد می‌شود</p>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">یادداشت (اختیاری)</Label>
              <Input
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="توضیحات یا دلیل تأیید..."
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>انصراف</Button>
            <Button
              onClick={handleApprove}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              تأیید نهایی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default StockCountPage
