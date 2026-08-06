'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Building2, Plus, Edit2, Trash2, Loader2, Package, Crown, TrendingUp, 
  AlertTriangle, WifiOff, Upload, RefreshCw, CloudOff, CheckCircle2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ══════════════════════════
// Types
// ══════════════════════════
interface Branch {
  id: string
  name: string
  code: string
  isActive: boolean
}

interface StockItem {
  productId: string
  productName: string
  productCode: string
  quantity: number
  unitLabel: string
  salePrice: number
  purchasePrice: number
  value: number
  costValue: number
  minStock: number
}

interface Warehouse {
  id: string
  name: string
  code: string
  isDefault: boolean
  isActive: boolean
  branchId?: string | null      // ★★★ اضافه شده
  branchName?: string | null    // ★★★ اضافه شده برای نمایش
  _count?: { StockLevels: number; PurchaseInvoices: number; Invoices: number }
  stockItems?: StockItem[]
  totalStockItems?: number
  activeStockCount?: number
  totalValue?: number
  totalCostValue?: number
  totalItems?: number
  lowStockCount?: number
  _isOffline?: boolean
  _offlineId?: string
  _offlineAction?: 'create' | 'update' | 'delete'
  _syncStatus?: 'pending' | 'syncing' | 'failed'
}

interface SyncQueueItem {
  id: string
  offlineId: string
  serverId?: string
  action: 'create' | 'update' | 'delete'
  payload: any
  retryCount: number
  createdAt: string
  lastError?: string
}

// ══════════════════════════
// Helpers
// ══════════════════════════
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

const formatPrice = (price: number | string): string => {
  const num = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(num)) return '۰ ریال'
  return `${toFaNum(Math.round(num).toLocaleString('en-US'))} ریال`
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function CustomSwitch({
  checked,
  onCheckedChange,
  disabled = false,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className="sr-only">وضعیت</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 h-5 w-5 rounded-full bg-white shadow ring-0 transition-all duration-200 ease-in-out ${
          checked ? 'right-0' : 'left-0'
        }`}
      />
    </button>
  )
}

const MAX_RETRY = 3

// ══════════════════════════
// Component
// ══════════════════════════
export function WarehousesPage() {
  const tenantId = useAppStore((s) => s.tenantId)
  const isOnline = useAppStore((s) => s.isOnline)
  const planName = useAppStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])
  
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [branches, setBranches] = useState<Branch[]>([]) // ★★★ اضافه شده
  const [planInfo, setPlanInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  
  // ★★★ اضافه شدن branchId به فرم
  const [form, setForm] = useState({ name: '', code: '', isDefault: false, isActive: true, branchId: '' })
  
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([])
  const syncInProgress = useRef(false)
  
  const { toast } = useToast()
  
  const STORAGE_KEYS = {
    WAREHOUSES: 'warehouses_offline',
    SYNC_QUEUE: 'warehouses_sync_queue',
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

  const loadSyncQueue = useCallback((): SyncQueueItem[] => {
    return loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, [])
  }, [])

  const saveSyncQueue = useCallback((queue: SyncQueueItem[]) => {
    saveToStorage(STORAGE_KEYS.SYNC_QUEUE, queue)
    setSyncQueue(queue)
  }, [])

  const addToSyncQueue = useCallback((item: Omit<SyncQueueItem, 'id' | 'retryCount' | 'createdAt'>) => {
    const queue = loadSyncQueue()
    const newItem: SyncQueueItem = {
      ...item,
      id: generateOfflineId(),
      retryCount: 0,
      createdAt: new Date().toISOString(),
    }
    const updated = [...queue, newItem]
    saveSyncQueue(updated)
    return newItem
  }, [loadSyncQueue, saveSyncQueue])

  const removeFromSyncQueue = useCallback((queueItemId: string) => {
    const queue = loadSyncQueue()
    saveSyncQueue(queue.filter(i => i.id !== queueItemId))
  }, [loadSyncQueue, saveSyncQueue])

  const updateQueueItemRetry = useCallback((queueItemId: string, error: string) => {
    const queue = loadSyncQueue()
    const updated = queue.map(i =>
      i.id === queueItemId ? { ...i, retryCount: i.retryCount + 1, lastError: error } : i
    )
    saveSyncQueue(updated)
  }, [loadSyncQueue, saveSyncQueue])

  // ══════════════════════════
  // Load Data
  // ══════════════════════════
    const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    const trulyOnline = isOnline && navigator.onLine
    
    let branchesList: Branch[] = []

    // ۱. دریافت لیست شعب (همیشه اول)
    if (trulyOnline && tid) {
      try {
        const resBranches = await fetch('/api/branches', { headers: getAuthHeaders() })
        const branchesData = await resBranches.json()
        if (branchesData.success) {
          branchesList = branchesData.data || []
          setBranches(branchesList)
        }
      } catch (err) {
        console.error('Error loading branches:', err)
      }
    }

    if (!trulyOnline) {
      const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
      // ★★★ افزودن branchName به انبارهای کش شده
      const enriched = cached.map(wh => {
        if (wh.branchId && branchesList.length > 0) {
          const matched = branchesList.find(b => b.id === wh.branchId)
          return { ...wh, branchName: matched?.name || null }
        }
        return wh
      })
      setWarehouses(enriched)
      setSyncQueue(loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, []))
      setLoading(false)
      if (cached.length === 0) {
        toast({ title: '📡 حالت آفلاین', description: 'داده‌ای در حافظه محلی یافت نشد.', duration: 3000 })
      }
      return
    }
    
    try {
      if (!tid) { setLoading(false); return }
      const res = await fetch(`/api/warehouses?tenantId=${tid}`, { headers: getAuthHeaders() })
      const data = await res.json()
      
      if (data.success) {
        // ★★★ نگاشت branchId به branchName
        const serverWarehouses = (data.data || []).map((wh: any) => {
          const matchedBranch = branchesList.find((b: any) => b.id === wh.branchId)
          return {
            ...wh,
            branchName: matchedBranch ? matchedBranch.name : null
          }
        })

        const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
        const serverIds = new Set(serverWarehouses.map((w: any) => w.id))
        const stillOffline = cached.filter(o => 
          o._isOffline && (!serverIds.has(o.id) || o._offlineAction === 'delete')
        )
        
        const merged = [...stillOffline, ...serverWarehouses]
        setWarehouses(merged)
        setPlanInfo(data.planInfo)
        saveToStorage(STORAGE_KEYS.WAREHOUSES, merged)
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
        setWarehouses(loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, []))
      } else {
        console.error('Error loading warehouses:', err)
        toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
      }
    }
    setLoading(false)
  }, [tenantId, isOnline, toast])


  useEffect(() => { loadData() }, [loadData])

  // ══════════════════════════
  // Sync
  // ══════════════════════════
  const syncOfflineData = useCallback(async () => {
    if (syncInProgress.current || isSyncing) return
    const queue = loadSyncQueue()
    if (queue.length === 0) return
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    if (!tid) return

    syncInProgress.current = true
    setIsSyncing(true)

    let successCount = 0
    for (const item of queue) {
      if (item.retryCount >= MAX_RETRY) continue
      try {
        const headers = getAuthHeaders()
        let res: Response
        if (item.action === 'create') {
          res = await fetch('/api/warehouses', { method: 'POST', headers, body: JSON.stringify({ ...item.payload, tenantId: tid }) })
        } else if (item.action === 'update') {
          res = await fetch('/api/warehouses', { method: 'PUT', headers, body: JSON.stringify({ ...item.payload, id: item.serverId, tenantId: tid }) })
        } else {
          res = await fetch(`/api/warehouses?id=${item.serverId}&tenantId=${tid}`, { method: 'DELETE', headers })
        }
        const data = await res.json()
        if (data.success) {
          removeFromSyncQueue(item.id)
          successCount++
        } else {
          updateQueueItemRetry(item.id, data.error || 'خطای نامشخص')
        }
      } catch (err: any) {
        updateQueueItemRetry(item.id, err?.message || 'خطای شبکه')
      }
    }

    syncInProgress.current = false
    setIsSyncing(false)

    if (successCount > 0) {
      toast({ title: '✓ همگام‌سازی موفق', description: `${toFaNum(successCount)} انبار همگام شد` })
      await loadData(false)
    }
  }, [isSyncing, loadSyncQueue, tenantId, removeFromSyncQueue, updateQueueItemRetry, loadData, toast])

  useEffect(() => {
    if (isOnline) {
      const queue = loadSyncQueue()
      if (queue.length > 0) {
        const timer = setTimeout(() => syncOfflineData(), 1500)
        return () => clearTimeout(timer)
      }
    }
  }, [isOnline, loadSyncQueue, syncOfflineData])

  useEffect(() => { setSyncQueue(loadSyncQueue()) }, [loadSyncQueue])

  // ══════════════════════════
  // Computed
  // ══════════════════════════
  const canAddWarehouse = (() => {
    if (!planInfo) return true
    if (planInfo.maxWarehouses === 'نامحدود' || planInfo.maxWarehouses === 0) return true
    return planInfo.canAdd
  })()

  const offlineCount = useMemo(() => syncQueue.filter(q => q.retryCount < MAX_RETRY).length, [syncQueue])

  const totalWarehouseValue = useMemo(() => 
    warehouses.reduce((sum, wh) => sum + (wh.totalValue || 0), 0), [warehouses])

  const totalWarehouseItems = useMemo(() => 
    warehouses.reduce((sum, wh) => sum + (wh.totalItems || 0), 0), [warehouses])

  const totalLowStockItems = useMemo(() => 
    warehouses.reduce((sum, wh) => sum + (wh.lowStockCount || 0), 0), [warehouses])

  const totalActiveStocks = useMemo(() => 
    warehouses.reduce((sum, wh) => sum + (wh.activeStockCount || 0), 0), [warehouses])

  // ══════════════════════════
  // Handlers
  // ══════════════════════════
  const handleOpenAdd = () => {
    if (!canAddWarehouse) {
      toast({
        title: 'محدودیت پلن',
        description: `در پلن فعلی فقط ${toFaNum(planInfo?.maxWarehouses)} انبار مجاز است.`,
        variant: 'destructive',
      })
      return
    }
    setEditingWarehouse(null)
    setForm({ name: '', code: '', isDefault: false, isActive: true, branchId: '' }) // ★★★ ریست branchId
    setDialogOpen(true)
  }

     const handleOpenEdit = (wh: Warehouse) => {
    setEditingWarehouse(wh)
    setForm({ 
      name: wh.name, 
      code: wh.code, 
      isDefault: wh.isDefault, 
      isActive: wh.isActive, 
      branchId: wh.branchId || '' // این خط حیاتی است
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { 
      toast({ title: 'خطا', description: 'نام انبار الزامی است', variant: 'destructive' })
      return 
    }
    setSubmitting(true)
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    const trulyOnline = isOnline && navigator.onLine
    
    if (!trulyOnline) {
      const offlineId = editingWarehouse?.id || generateOfflineId()
      const newWarehouse: Warehouse = {
        id: offlineId,
        name: form.name,
        code: form.code || `WH-${Date.now()}`,
        isDefault: form.isDefault,
        isActive: form.isActive,
        branchId: form.branchId || null, // ★★★ اضافه شده
        branchName: branches.find(b => b.id === form.branchId)?.name || null,
        _count: { StockLevels: 0, PurchaseInvoices: 0, Invoices: 0 },
        stockItems: [],
        totalStockItems: 0,
        activeStockCount: 0,
        totalValue: 0,
        totalCostValue: 0,
        totalItems: 0,
        lowStockCount: 0,
        _isOffline: true,
        _offlineId: offlineId,
        _offlineAction: editingWarehouse ? 'update' : 'create',
        _syncStatus: 'pending',
      }
      
      const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
      const updated = editingWarehouse
        ? cached.map(w => w.id === editingWarehouse.id ? { ...w, ...newWarehouse } : w)
        : [...cached, newWarehouse]
      saveToStorage(STORAGE_KEYS.WAREHOUSES, updated)
      setWarehouses(updated)
      
      addToSyncQueue({
        offlineId,
        serverId: editingWarehouse?.id,
        action: editingWarehouse ? 'update' : 'create',
        payload: { ...form, branchId: form.branchId || null }, // ★★★ ارسال در payload
      })
      
      toast({ title: '📡 ذخیره آفلاین ✓', description: 'پس از اتصال همگام‌سازی می‌شود' })
      setDialogOpen(false)
      setSubmitting(false)
      return
    }
    
       try {
      const method = editingWarehouse ? 'PUT' : 'POST'
      // ★★★ اطمینان از ارسال branchId (حتی اگر خالی باشد)
      const body: any = { 
        ...form, 
        tenantId: tid, 
        branchId: form.branchId || null 
      }
      if (editingWarehouse) body.id = editingWarehouse.id
      
      console.log('[Warehouses] Submitting body:', JSON.stringify(body)) // ★★★ لاگ
      
      const res = await fetch('/api/warehouses', { method, headers: getAuthHeaders(), body: JSON.stringify(body) })
      const data = await res.json()
      if (data.success) { 
        toast({ title: '✓ موفق', description: editingWarehouse ? 'انبار به‌روزرسانی شد' : 'انبار ایجاد شد' })
        setDialogOpen(false)
        await loadData(false)
      } else { 
        toast({ title: 'خطا', description: data.error, variant: 'destructive' }) 
      }
    } catch (err: any) { 
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setSubmitting(false)
  }

  const handleDelete = async (wh: Warehouse) => {
    if (!confirm(`آیا از حذف "${wh.name}" مطمئن هستید؟`)) return
    const tid = tenantId || useAppStore.getState().currentTenant?.id
    const trulyOnline = isOnline && navigator.onLine

    if (wh._isOffline && wh._offlineAction === 'create') {
      const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
      saveToStorage(STORAGE_KEYS.WAREHOUSES, cached.filter(w => w.id !== wh.id))
      setWarehouses(cached.filter(w => w.id !== wh.id))
      const queue = loadSyncQueue()
      saveSyncQueue(queue.filter(q => q.offlineId !== wh.id))
      toast({ title: '✓ حذف شد', description: 'انبار آفلاین حذف شد' })
      return
    }
    
    if (!trulyOnline) {
      const offlineId = generateOfflineId()
      const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
      const updated = cached.map(w => 
        w.id === wh.id 
          ? { ...w, _isOffline: true, _offlineAction: 'delete' as const, _syncStatus: 'pending' as const, _offlineId: offlineId }
          : w
      )
      saveToStorage(STORAGE_KEYS.WAREHOUSES, updated)
      setWarehouses(updated)
      
      addToSyncQueue({ offlineId, serverId: wh.id, action: 'delete', payload: { id: wh.id } })
      toast({ title: '📡 حذف در صف', description: 'پس از اتصال حذف می‌شود' })
      return
    }
    
    try {
      const res = await fetch(`/api/warehouses?id=${wh.id}&tenantId=${tid}`, { 
        method: 'DELETE', headers: getAuthHeaders() 
      })
      const data = await res.json()
      if (data.success) { 
        toast({ title: '✓ موفق', description: data.message })
        await loadData(false)
      } else { 
        toast({ title: 'خطا', description: data.error, variant: 'destructive' }) 
      }
    } catch (err: any) { 
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' }) 
    }
  }

  // ══════════════════════════
  // Render
  // ══════════════════════════
  return (
    <div className="font-fa space-y-3 sm:space-y-4" dir="rtl">
      
      {/* ★ Header — کوچک و جمع‌وجور */}
      <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">انبارها</h1>
            <p className="text-[10px] text-gray-500">
              {toFaNum(warehouses.length)} انبار
              {planInfo && <span> • سقف: {planInfo.maxWarehouses === 'نامحدود' || planInfo.maxWarehouses === 0 ? 'نامحدود' : toFaNum(planInfo.maxWarehouses)}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isOnline && (
            <Badge variant="outline" className="gap-1 text-[9px] border-amber-300 text-amber-700 bg-amber-50 h-5 px-1.5">
              <WifiOff className="w-2.5 h-2.5" />
              آفلاین
            </Badge>
          )}
          {offlineCount > 0 && (
            <Badge
              variant="outline"
              className="gap-1 text-[9px] border-blue-300 text-blue-700 bg-blue-50 cursor-pointer h-5 px-1.5"
              onClick={() => isOnline && syncOfflineData()}
            >
              {isSyncing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
              {toFaNum(offlineCount)}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => loadData(false)} className="h-7 text-[10px] px-2 gap-1">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button 
            onClick={handleOpenAdd} 
            className="gap-1 bg-emerald-600 hover:bg-emerald-700 h-7 text-xs px-2.5"
            disabled={!canAddWarehouse}
          >
            <Plus className="w-3.5 h-3.5" />
            انبار جدید
          </Button>
        </div>
      </div>

      {/* ★ Stats Cards */}
      {warehouses.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardContent className="p-2.5 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-emerald-700 font-medium">ارزش کل انبارها</p>
                <p className="text-xs font-bold text-emerald-900 truncate">{formatPrice(totalWarehouseValue)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-2.5 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-blue-700 font-medium">موجودی کل</p>
                <p className="text-xs font-bold text-blue-900">{toFaNum(totalWarehouseItems)} قلم</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-2.5 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-purple-700 font-medium">کالاهای دارای موجودی</p>
                <p className="text-xs font-bold text-purple-900">{toFaNum(totalActiveStocks)} کالا</p>
              </div>
            </CardContent>
          </Card>

          {totalLowStockItems > 0 ? (
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <CardContent className="p-2.5 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-amber-700 font-medium">کم‌موجودی</p>
                  <p className="text-xs font-bold text-amber-900">{toFaNum(totalLowStockItems)} کالا</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
              <CardContent className="p-2.5 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gray-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-gray-700 font-medium">وضعیت</p>
                  <p className="text-xs font-bold text-gray-900">عالی ✓</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
      ) : warehouses.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Building2 className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-400">انباری تعریف نشده</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {warehouses.map((wh) => (
            <Card key={wh.id} className={`${wh.isDefault ? 'border-emerald-300 bg-emerald-50/30' : ''} ${wh._isOffline ? 'border-amber-200' : ''}`}>
              <CardContent className="p-3 sm:p-4 space-y-2.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${wh.isDefault ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                      <Package className={`w-5 h-5 ${wh.isDefault ? 'text-emerald-600' : 'text-gray-500'}`} />
                    </div>
                 <div className="min-w-0 flex-1">
  <div className="flex items-center gap-1.5 flex-wrap">
    <h3 className="text-sm font-bold text-gray-900 truncate">{wh.name}</h3>
    {wh._isOffline && (
      <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 bg-amber-50 h-4 px-1">
        {wh._offlineAction === 'delete' ? 'حذف آفلاین' : 'آفلاین'}
      </Badge>
    )}
  </div>
  
  <p className="text-[10px] text-gray-400 font-mono" dir="ltr">{wh.code}</p>
  
  {/* ★★★ نمایش نام شعبه (فقط و فقط یک بار) */}
  {wh.branchName && (
    <div className="flex items-center gap-1 mt-1">
      <Building2 className="w-3 h-3 text-purple-500 shrink-0" />
      <span className="text-[10px] text-purple-700 font-medium truncate">
        شعبه: {wh.branchName}
      </span>
    </div>
  )}
</div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {wh.isDefault && <Badge className="text-[9px] bg-emerald-100 text-emerald-700 h-4 px-1.5">پیش‌فرض</Badge>}
                    <Badge className={`text-[9px] h-4 px-1.5 ${wh.isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {wh.isActive ? 'فعال' : 'غیرفعال'}
                    </Badge>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-gray-100">
                  <div className="bg-emerald-50 rounded p-1.5 text-center">
                    <p className="text-[8px] text-emerald-700 font-medium leading-tight">ارزش</p>
                    <p className="text-[10px] font-bold text-emerald-900 leading-tight mt-0.5 truncate">{formatPrice(wh.totalValue || 0)}</p>
                  </div>
                  <div className="bg-blue-50 rounded p-1.5 text-center">
                    <p className="text-[8px] text-blue-700 font-medium leading-tight">موجودی</p>
                    <p className="text-[10px] font-bold text-blue-900 leading-tight mt-0.5">{toFaNum(wh.totalItems || 0)}</p>
                  </div>
                  <div className="bg-purple-50 rounded p-1.5 text-center">
                    <p className="text-[8px] text-purple-700 font-medium leading-tight">کالا</p>
                    <p className="text-[10px] font-bold text-purple-900 leading-tight mt-0.5">{toFaNum(wh.activeStockCount || 0)}</p>
                  </div>
                </div>

                {/* Low Stock Warning */}
                {(wh.lowStockCount || 0) > 0 && (
                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded p-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                    <p className="text-[10px] text-amber-700 font-medium">
                      {toFaNum(wh.lowStockCount)} کالا کم‌موجودی است
                    </p>
                  </div>
                )}

                {/* Stock Items List */}
                {wh.stockItems && wh.stockItems.length > 0 && (
                  <div className="space-y-1 pt-1.5 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-gray-700 mb-1">
                      کالاها ({toFaNum(wh.totalStockItems || 0)}):
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {wh.stockItems.map((item, idx) => {
                        const isLowStock = item.minStock > 0 && item.quantity <= item.minStock
                        return (
                          <div 
                            key={idx} 
                            className={`flex items-center justify-between text-[10px] rounded px-2 py-1.5 ${
                              isLowStock ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-1">
                              <p className="font-medium text-gray-900 truncate">{item.productName}</p>
                              <p className="text-gray-400 font-mono text-[9px]" dir="ltr">{item.productCode}</p>
                            </div>
                            <div className="text-left shrink-0">
                              <p className={`font-bold ${isLowStock ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {toFaNum(item.quantity)} {item.unitLabel}
                              </p>
                              <p className="text-gray-500 text-[9px]">{formatPrice(item.value)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {(wh.totalStockItems || 0) > 10 && (
                      <p className="text-[9px] text-gray-400 text-center mt-1">
                        + {toFaNum((wh.totalStockItems || 0) - 10)} کالای دیگر
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(wh)} className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  {!wh.isDefault && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(wh)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="font-fa w-[calc(100%-1rem)] sm:max-w-[450px] rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base flex items-center gap-2">
              {editingWarehouse ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingWarehouse ? 'ویرایش انبار' : 'انبار جدید'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">نام انبار <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="مثلاً: انبار اصلی" />
            </div>
            
            {/* ★★★ کمبوباکس انتخاب شعبه */}
            <div>
              <Label className="text-xs">شعبه مربوطه (اختیاری)</Label>
              <select
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                className="w-full text-xs mt-1 h-9 border border-gray-200 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">بدون شعبه (مرکزی)</option>
                {branches.filter(b => b.isActive).map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
              {branches.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1">شعبه‌ای تعریف نشده است. برای تعریف شعبه به بخش مدیریت شعب مراجعه کنید.</p>
              )}
            </div>

            <div>
              <Label className="text-xs">کد (اختیاری)</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1" placeholder="خودکار" dir="ltr" />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <Label className="text-xs">انبار پیش‌فرض</Label>
                <CustomSwitch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <Label className="text-xs">فعال</Label>
                <CustomSwitch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-9">انصراف</Button>
            <Button onClick={handleSubmit} disabled={submitting} className={`h-9 gap-2 ${!isOnline ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : !isOnline ? <CloudOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {!isOnline ? 'ذخیره آفلاین' : editingWarehouse ? 'به‌روزرسانی' : 'ایجاد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}