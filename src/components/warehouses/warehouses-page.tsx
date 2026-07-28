'use client'

// ============================================================================
// src/components/warehouses/warehouses-page.tsx — ریسپانسیو کامل موبایل/تبلت/دسکتاپ
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features' // ★ اضافه شد
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Building2, Plus, Edit2, Trash2, Loader2, Package, Crown,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Warehouse {
  id: string
  name: string
  code: string
  isDefault: boolean
  isActive: boolean
  _count?: { StockLevels: number; PurchaseInvoices: number; Invoices: number }
}

// ★ اضافه شد: تعریف نوع آیتم‌های صف همگام‌سازی
interface SyncQueueItem {
  id: string
  offlineId: string
  serverId?: string
  action: 'create' | 'update' | 'delete'
  payload: any
  retryCount: number
  createdAt: string
}

const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

export function WarehousesPage() {
  const tenantId = useAppStore((s) => s.tenantId)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [planInfo, setPlanInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', isDefault: false, isActive: true })
 const { toast } = useToast()
const isOnline = useAppStore((s) => s.isOnline)
const planName = useAppStore((s) => s.planName)
const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])

/// ★ آفلاین
const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([])
const STORAGE_KEYS = {
  WAREHOUSES: 'warehouses_offline',
  SYNC_QUEUE: 'warehouses_sync_queue',
} as const

interface SyncQueueItem {
  id: string
  offlineId: string
  serverId?: string
  action: 'create' | 'update' | 'delete'
  payload: any
  retryCount: number
  createdAt: string
}


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
    const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
    setWarehouses(cached)
    setSyncQueue(loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, []))
    setLoading(false)
    return
  }
  
  try {
    if (!tid) { setLoading(false); return }
    const res = await fetch(`/api/warehouses?tenantId=${tid}`)
    const data = await res.json()
    if (data.success) {
      setWarehouses(data.data || [])
      setPlanInfo(data.planInfo)
      saveToStorage(STORAGE_KEYS.WAREHOUSES, data.data || [])
    }
  } catch (err: any) {
    if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
      console.warn('[WarehousesPage] سوئیچ به آفلاین')
      setWarehouses(loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, []))
    } else {
      console.error('Error loading warehouses:', err)
    }
  }
  setLoading(false)
}, [tenantId, isOnline])

  useEffect(() => { loadData() }, [loadData])

  // ★★★ بررسی صحیح محدودیت: اگر maxWarehouses نامحدود است، canAdd همیشه true
  const canAddWarehouse = (() => {
    if (!planInfo) return true
    if (planInfo.maxWarehouses === 'نامحدود' || planInfo.maxWarehouses === 0) return true
    return planInfo.canAdd
  })()

  const handleOpenAdd = () => {
    if (!canAddWarehouse) {
      toast({
        title: 'محدودیت پلن',
        description: `در پلن فعلی فقط ${planInfo?.maxWarehouses} انبار مجاز است.`,
        variant: 'destructive',
      })
      return
    }
    setEditingWarehouse(null)
    setForm({ name: '', code: '', isDefault: false, isActive: true })
    setDialogOpen(true)
  }

  const handleOpenEdit = (wh: Warehouse) => {
    setEditingWarehouse(wh)
    setForm({ name: wh.name, code: wh.code, isDefault: wh.isDefault, isActive: wh.isActive })
    setDialogOpen(true)
  }

 const handleSubmit = async () => {
  if (!form.name.trim()) { toast({ title: 'خطا', description: 'نام انبار الزامی است', variant: 'destructive' }); return }
  setSubmitting(true)
  const tid = tenantId || useAppStore.getState().currentTenant?.id
  const trulyOnline = isOnline && navigator.onLine
  
  if (!trulyOnline) {
    const offlineId = generateOfflineId()
    const newWarehouse: Warehouse = {
      id: offlineId,
      name: form.name,
      code: form.code || `WH-${Date.now()}`,
      isDefault: form.isDefault,
      isActive: form.isActive,
      _count: { StockLevels: 0, PurchaseInvoices: 0, Invoices: 0 },
    } as any
    
    const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
    const updated = editingWarehouse
      ? cached.map(w => w.id === editingWarehouse.id ? { ...w, ...newWarehouse } : w)
      : [...cached, newWarehouse]
    saveToStorage(STORAGE_KEYS.WAREHOUSES, updated)
    setWarehouses(updated)
    
    const queue = loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, [])
    queue.push({
      id: generateOfflineId(),
      offlineId,
      serverId: editingWarehouse?.id,
      action: editingWarehouse ? 'update' : 'create',
      payload: form,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    })
    saveToStorage(STORAGE_KEYS.SYNC_QUEUE, queue)
    setSyncQueue(queue)
    
    toast({ title: 'ذخیره آفلاین ✓', description: 'پس از اتصال به اینترنت همگام‌سازی می‌شود' })
    setDialogOpen(false)
    setSubmitting(false)
    return
  }
  
  try {
    const method = editingWarehouse ? 'PUT' : 'POST'
    const body: any = { ...form, tenantId: tid }
    if (editingWarehouse) body.id = editingWarehouse.id
    const res = await fetch('/api/warehouses', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (data.success) { toast({ title: 'موفق', description: editingWarehouse ? 'انبار به‌روزرسانی شد' : 'انبار ایجاد شد' }); setDialogOpen(false); loadData() }
    else { toast({ title: 'خطا', description: data.error, variant: 'destructive' }) }
  } catch (err: any) { toast({ title: 'خطا', description: err?.message, variant: 'destructive' }) }
  setSubmitting(false)
}

 const handleDelete = async (wh: Warehouse) => {
  if (!confirm(`آیا از حذف "${wh.name}" مطمئن هستید؟`)) return
  const tid = tenantId || useAppStore.getState().currentTenant?.id
  const trulyOnline = isOnline && navigator.onLine
  
  if (!trulyOnline) {
    const cached = loadFromStorage<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, [])
    const updated = cached.filter(w => w.id !== wh.id)
    saveToStorage(STORAGE_KEYS.WAREHOUSES, updated)
    setWarehouses(updated)
    
    const queue = loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, [])
    queue.push({
      id: generateOfflineId(),
      offlineId: wh.id,
      serverId: wh.id,
      action: 'delete',
      payload: { id: wh.id },
      retryCount: 0,
      createdAt: new Date().toISOString(),
    })
    saveToStorage(STORAGE_KEYS.SYNC_QUEUE, queue)
    setSyncQueue(queue)
    
    toast({ title: 'حذف در صف', description: 'پس از اتصال به اینترنت حذف می‌شود' })
    return
  }
  
  try {
    const res = await fetch(`/api/warehouses?id=${wh.id}&tenantId=${tid}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { toast({ title: 'موفق', description: data.message }); loadData() }
    else { toast({ title: 'خطا', description: data.error, variant: 'destructive' }) }
  } catch (err: any) { toast({ title: 'خطا', description: err?.message, variant: 'destructive' }) }
}

  return (
    <div className="font-fa space-y-3 sm:space-y-4" dir="rtl">
      {/* ★ Header — ریسپانسیو */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900">انبارها</h1>
            <p className="text-xs text-gray-500">
              {formatNumber(warehouses.length)} انبار
              {planInfo && <span className="mr-2">• سقف پلن: {planInfo.maxWarehouses === 'نامحدود' || planInfo.maxWarehouses === 0 ? 'نامحدود' : formatNumber(planInfo.maxWarehouses)}</span>}
            </p>
          </div>
        </div>
        <Button onClick={handleOpenAdd} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto h-9">
          <Plus className="w-4 h-4" />انبار جدید
        </Button>
      </div>

      {/* ★★★ فقط وقتی واقعا محدودیت داریم نشان بده */}
      {planInfo && !canAddWarehouse && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              در پلن فعلی به سقف انبار رسیده‌اید. برای افزودن انبار بیشتر، به پلن بالاتر ارتقا دهید.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
      ) : warehouses.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Building2 className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-400">انباری تعریف نشده</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {warehouses.map((wh) => (
            <Card key={wh.id} className={wh.isDefault ? 'border-emerald-300 bg-emerald-50/30' : ''}>
             <CardContent className="p-3 sm:p-4">
  <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${wh.isDefault ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                      <Package className={`w-4 h-4 ${wh.isDefault ? 'text-emerald-600' : 'text-gray-500'}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-gray-900 truncate">{wh.name}</h3>
                      <p className="text-[10px] text-gray-400 truncate" dir="ltr">{wh.code}</p>
                    </div>
                  </div>
                  {wh.isDefault && <Badge className="text-[9px] bg-emerald-100 text-emerald-700 shrink-0">پیش‌فرض</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><p className="text-[9px] text-gray-400">اقلام</p><p className="text-xs font-bold">{formatNumber(wh._count?.StockLevels || 0)}</p></div>
                  <div><p className="text-[9px] text-gray-400">خرید</p><p className="text-xs font-bold">{formatNumber(wh._count?.PurchaseInvoices || 0)}</p></div>
                  <div><p className="text-[9px] text-gray-400">فروش</p><p className="text-xs font-bold">{formatNumber(wh._count?.Invoices || 0)}</p></div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <Badge className={wh.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}>{wh.isActive ? 'فعال' : 'غیرفعال'}</Badge>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(wh)} className="h-7 w-7 p-0"><Edit2 className="w-3.5 h-3.5" /></Button>
                    {!wh.isDefault && <Button variant="ghost" size="sm" onClick={() => handleDelete(wh)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
     <DialogContent className="font-fa w-[calc(100%-1rem)] sm:max-w-[400px] rounded-xl" dir="rtl">
          <DialogHeader><DialogTitle className="text-sm sm:text-base">{editingWarehouse ? 'ویرایش انبار' : 'انبار جدید'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">نام انبار <span className="text-red-500">*</span></Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="مثلاً: انبار اصلی" /></div>
            <div><Label className="text-xs">کد (اختیاری)</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1" placeholder="خودکار" /></div>
            <div className="flex items-center justify-between"><Label className="text-xs">انبار پیش‌فرض</Label><Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} /></div>
            <div className="flex items-center justify-between"><Label className="text-xs">فعال</Label><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /></div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-9">انصراف</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 h-9">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{editingWarehouse ? 'به‌روزرسانی' : 'ایجاد'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}