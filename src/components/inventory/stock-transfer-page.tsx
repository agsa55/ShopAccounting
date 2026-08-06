'use client'

// ============================================================================
// src/components/inventory/stock-transfer-page.tsx — انتقال بین انبارها
// ShopAccounting v6.5.3 (Offline + Persian Numbers)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
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
  ArrowRightLeft, Search, Loader2, CheckCircle2, Package, AlertTriangle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Warehouse { id: string; name: string; code: string; isDefault?: boolean }
interface Product {
  id: string
  name: string
  code: string
  currentStock: number
  salePrice: number
  unit?: { nameFa?: string; name: string } | null
}

interface StockTransfer {
  id: string
  productId: string
  productName: string
  fromWarehouseId: string
  toWarehouseId: string
  quantity: number
  movementType: string
  description: string | null
  createdAt: string
}

function toFa(n: number | string): string {
  return String(n || 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function StockTransferPage() {
  const tenantId = useAppStore((s) => s.tenantId)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [fromWarehouseId, setFromWarehouseId] = useState<string>('')
  const [toWarehouseId, setToWarehouseId] = useState<string>('')
  const [productSearch, setProductSearch] = useState('')
  const [productSearchResults, setProductSearchResults] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState<string>('1')
  const [description, setDescription] = useState('')

  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  // ★ کلیدهای localStorage برای کش و صف آفلاین
  const STORAGE_KEYS = {
    TRANSFERS: 'stock_transfers_offline',
    WAREHOUSES: 'warehouses_offline',
    TRANSFERS_QUEUE: 'stock_transfers_queue',
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

  const generateOfflineId = () => `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const loadData = useCallback(async () => {
    setLoading(true)
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    const trulyOnline = isOnline && navigator.onLine
    
    if (!trulyOnline) {
      const cachedTransfers = loadFromStorage<StockTransfer[]>(STORAGE_KEYS.TRANSFERS, [])
      const cachedWh = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
      setTransfers(cachedTransfers)
      setWarehouses(cachedWh)
      setLoading(false)
      if (cachedTransfers.length === 0) {
        toast({ title: 'حالت آفلاین', description: 'داده‌ای در حافظه محلی یافت نشد' })
      }
      return
    }
    
    try {
      if (!tid) { setLoading(false); return }
      const [whRes, trRes] = await Promise.all([
        fetch(`/api/warehouses?tenantId=${tid}`, { headers: getAuthHeaders() }),
        fetch(`/api/stock-movements?tenantId=${tid}&type=transfer&limit=50`, { headers: getAuthHeaders() }),
      ])
      const [whData, trData] = await Promise.all([whRes.json(), trRes.json()])
      
      if (whData.success) {
        setWarehouses(whData.data || [])
        saveToStorage(STORAGE_KEYS.WAREHOUSES, whData.data || [])
        const defaultWh = whData.data?.find((w: Warehouse) => w.isDefault)
        if (defaultWh) {
          setFromWarehouseId(defaultWh.id)
          const otherWh = (whData.data || []).find((w: Warehouse) => w.id !== defaultWh.id)
          if (otherWh) setToWarehouseId(otherWh.id)
        }
      }
      if (trData.success) {
        setTransfers(trData.data || [])
        saveToStorage(STORAGE_KEYS.TRANSFERS, trData.data || [])
      }
    } catch (err: any) {
      if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
        console.warn('[StockTransferPage] سوئیچ به حالت آفلاین')
        setTransfers(loadFromStorage<StockTransfer[]>(STORAGE_KEYS.TRANSFERS, []))
        setWarehouses(loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, []))
      } else {
        console.error('Error loading data:', err)
      }
    }
    setLoading(false)
  }, [tenantId, isOnline, toast])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (productSearch.trim().length < 2 || !fromWarehouseId) {
      setProductSearchResults([])
      return
    }
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/lookup?q=${encodeURIComponent(productSearch)}&tenantId=${tid}&warehouseId=${fromWarehouseId}&limit=20`, { headers: getAuthHeaders() })
        const data = await res.json()
        if (data.success) {
          const prods = Array.isArray(data.data) ? data.data : (data.data?.products || [])
          setProductSearchResults(prods)
        }
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch, fromWarehouseId, tenantId])

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product)
    setProductSearch('')
    setProductSearchResults([])
  }

  const handleSubmit = async () => {
    if (!fromWarehouseId || !toWarehouseId) {
      toast({ title: 'خطا', description: 'انتخاب انبار مبدأ و مقصد الزامی است', variant: 'destructive' })
      return
    }
    if (fromWarehouseId === toWarehouseId) {
      toast({ title: 'خطا', description: 'انبار مبدأ و مقصد نمی‌توانند یکسان باشند', variant: 'destructive' })
      return
    }
    if (!selectedProduct) {
      toast({ title: 'خطا', description: 'انتخاب محصول الزامی است', variant: 'destructive' })
      return
    }
    const qty = parseFloat(quantity) || 0
    if (qty <= 0) {
      toast({ title: 'خطا', description: 'تعداد باید بیشتر از صفر باشد', variant: 'destructive' })
      return
    }
    if (isOnline && qty > selectedProduct.currentStock) {
      toast({ title: 'خطا', description: `موجودی کافی نیست. موجودی فعلی: ${formatNumber(selectedProduct.currentStock)}`, variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      
      // ★★★ حالت آفلاین
      if (!isOnline) {
        const queue = loadFromStorage<any[]>(STORAGE_KEYS.TRANSFERS_QUEUE, [])
        const offlineId = generateOfflineId()
        queue.push({
          id: offlineId,
          type: 'create',
          data: {
            tenantId: tid,
            productId: selectedProduct.id,
            fromWarehouseId,
            toWarehouseId,
            quantity: qty,
            movementType: 'transfer',
            description: description || `انتقال ${formatNumber(qty)} عدد ${selectedProduct.name}`,
          },
          createdAt: new Date().toISOString()
        })
        saveToStorage(STORAGE_KEYS.TRANSFERS_QUEUE, queue)

        const localTransfers = loadFromStorage<StockTransfer[]>(STORAGE_KEYS.TRANSFERS, [])
        const newLocalTransfer: StockTransfer = {
          id: offlineId,
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          fromWarehouseId,
          toWarehouseId,
          quantity: qty,
          movementType: 'transfer',
          description: description || `انتقال ${formatNumber(qty)} عدد`,
          createdAt: new Date().toISOString()
        }
        localTransfers.unshift(newLocalTransfer)
        saveToStorage(STORAGE_KEYS.TRANSFERS, localTransfers)
        setTransfers(localTransfers)

        toast({ title: 'ذخیره آفلاین', description: 'انتقال در صف همگام‌سازی قرار گرفت و پس از اتصال به اینترنت ارسال می‌شود.' })
        setDialogOpen(false)
        setSelectedProduct(null)
        setQuantity('1')
        setDescription('')
        setProductSearch('')
        setSubmitting(false)
        return
      }

      // ★★★ حالت آنلاین
      const res = await fetch('/api/stock-movements', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tenantId: tid,
          productId: selectedProduct.id,
          fromWarehouseId,
          toWarehouseId,
          quantity: qty,
          movementType: 'transfer',
          description: description || `انتقال ${formatNumber(qty)} عدد ${selectedProduct.name}`,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: 'موفق', description: data.message || 'انتقال با موفقیت ثبت شد' })
        setDialogOpen(false)
        setSelectedProduct(null)
        setQuantity('1')
        setDescription('')
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

  const warehouseName = (id: string) => warehouses.find(w => w.id === id)?.name || '—'

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900">انتقال بین انبارها</h1>
            <p className="text-xs text-gray-500">
              {formatNumber(transfers.length)} انتقال ثبت شده
              {!isOnline && <span className="mr-2 text-amber-600">• آفلاین</span>}
            </p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto" disabled={warehouses.length < 2}>
          <ArrowRightLeft className="w-4 h-4" />
          <span className="hidden sm:inline">انتقال جدید</span>
          <span className="sm:hidden">جدید</span>
        </Button>
      </div>

      {warehouses.length < 2 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-xs text-amber-700">برای انتقال بین انبارها، حداقل به ۲ انبار نیاز دارید.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ArrowRightLeft className="w-12 h-12 mb-2 text-gray-300" />
              <p className="text-sm">انتقالی ثبت نشده است</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
              {transfers.map((tr) => (
                <Card key={tr.id} className="border shadow-none hover:shadow-md transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 truncate">{tr.productName}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5" dir="ltr">
                          {new Date(tr.createdAt).toLocaleDateString('fa-IR')}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="bg-red-50 rounded p-1.5 text-center">
                        <p className="text-[9px] text-gray-400 leading-tight">از انبار</p>
                        <p className="text-[10px] font-bold text-red-600 leading-tight mt-0.5 truncate">
                          {warehouseName(tr.fromWarehouseId)}
                        </p>
                      </div>
                      <div className="bg-emerald-50 rounded p-1.5 text-center">
                        <p className="text-[9px] text-gray-400 leading-tight">به انبار</p>
                        <p className="text-[10px] font-bold text-emerald-600 leading-tight mt-0.5 truncate">
                          {warehouseName(tr.toWarehouseId)}
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded p-1.5 text-center">
                        <p className="text-[9px] text-gray-400 leading-tight">تعداد</p>
                        <p className="text-[10px] font-bold text-blue-600 leading-tight mt-0.5">
                          {formatNumber(tr.quantity)}
                        </p>
                      </div>
                    </div>
                    {tr.description && (
                      <p className="text-[10px] text-gray-500 truncate border-t border-gray-100 pt-2">
                        {tr.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ★ دیالوگ انتقال جدید */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[600px] max-h-[90vh] rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              انتقال بین انبارها
            </DialogTitle>
            <DialogDescription className="text-xs">
              موجودی یک محصول را از یک انبار به انبار دیگر منتقل کنید.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto max-h-[70vh] pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">انبار مبدأ <span className="text-red-500">*</span></Label>
                <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">انبار مقصد <span className="text-red-500">*</span></Label>
                <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== fromWarehouseId).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!selectedProduct ? (
              <div className="relative">
                <Label className="text-xs">جستجوی محصول</Label>
                <Search className="absolute right-3 top-9 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="نام محصول را تایپ کنید..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pr-9 mt-1"
                  disabled={!fromWarehouseId}
                />
                {productSearchResults.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-md max-h-48 overflow-y-auto bg-white shadow-sm z-10 relative">
                    {productSearchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        className="w-full text-right p-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-medium">{p.name}</span>
                            <span className="text-[10px] text-gray-400 mr-2" dir="ltr">{p.code}</span>
                          </div>
                          <span className="text-[10px] text-gray-500">موجودی: {formatNumber(p.currentStock)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!fromWarehouseId && (
                  <p className="text-[10px] text-amber-600 mt-1">ابتدا انبار مبدأ را انتخاب کنید</p>
                )}
              </div>
            ) : (
              <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">محصول انتخاب‌شده:</p>
                    <p className="text-sm font-bold">{selectedProduct.name}</p>
                    <p className="text-[10px] text-gray-400" dir="ltr">{selectedProduct.code}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-gray-500">موجودی در انبار مبدأ:</p>
                    <p className="text-sm font-bold text-blue-600">{formatNumber(selectedProduct.currentStock)}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)} className="text-red-500 p-1 h-8 w-8">
                    ✕
                  </Button>
                </div>
              </div>
            )}

            {selectedProduct && (
              <>
                <div>
                  <Label className="text-xs">تعداد انتقال <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="mt-1"
                    min="1"
                    max={selectedProduct.currentStock}
                  />
                  <p className="text-[10px] text-gray-500 mt-1">حداکثر: {formatNumber(selectedProduct.currentStock)}</p>
                </div>

                <div>
                  <Label className="text-xs">توضیحات (اختیاری)</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1"
                    placeholder="مثلاً: انتقال برای فروش..."
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={handleSubmit} disabled={submitting || !selectedProduct} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              ثبت انتقال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}