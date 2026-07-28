'use client'
// src/components/settings/pos-devices-tab.tsx
// ShopAccounting v8.0 — POS Devices Management Tab
// ============================================================================
// ★★★ مدیریت دستگاه‌های POS (کارتخوان)
//   - لیست دستگاه‌های ثبت‌شده
//   - افزودن / ویرایش / حذف
//   - تست اتصال (frontend-side با adapter)
//   - تنظیم به‌عنوان فعال
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, useStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Monitor, Plus, Edit2, Trash2, Wifi, WifiOff, CheckCircle2, XCircle,
  Loader2, Power, AlertCircle, Settings2,
} from 'lucide-react'
import {
  type TerminalType, type TerminalBrand,
  TERMINAL_TYPES, TERMINAL_BRANDS,
  createPosAdapter, checkBrowserSupport,
} from '@/lib/pos-adapters'

// ═══════════════════════════════════════════════════════════════
//  Helper
// ═══════════════════════════════════════════════════════════════

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function getTenantId(): string {
  const state = useAppStore.getState()
  const ct = state.currentTenant as any
  if (ct && typeof ct === 'object' && ct.id) return ct.id
  if (ct && typeof ct === 'string') return ct
  if (state.tenantId) return state.tenantId
  if (state.user?.tenantId) return state.user.tenantId
  return ''
}

const formatPrice = (n: number) => (n || 0).toLocaleString('fa-IR')

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

interface PosDevice {
  id: string
  name: string
  terminalId: string | null
  terminalType: TerminalType
  brand: TerminalBrand | string | null
  bankName: string | null
  merchantId: string | null
  acceptorCode: string | null
  terminalSerial: string | null
  ipAddress: string | null
  port: number | null
  serialPort: string | null
  baudRate: number
  apiBaseUrl: string | null
  apiKey: string | null
  config: string | null
  isActive: boolean
  isOnline: boolean
  lastConnectedAt: string | null
  lastError: string | null
  paymentCount?: number
  lastPayment?: { paidAt: string; amount: number; referenceNumber: string | null } | null
  createdAt: string
}

// ═══════════════════════════════════════════════════════════════
//  Form State
// ═══════════════════════════════════════════════════════════════

interface DeviceForm {
  name: string
  terminalType: TerminalType
  brand: TerminalBrand
  terminalId: string
  bankName: string
  merchantId: string
  acceptorCode: string
  terminalSerial: string
  // web-serial
  serialPort: string
  baudRate: number
  // network-tcp
  ipAddress: string
  port: number | string
  // network-http
  apiBaseUrl: string
  apiKey: string
  isActive: boolean
}

const emptyForm: DeviceForm = {
  name: '',
  terminalType: 'manual',
  brand: 'generic',
  terminalId: '',
  bankName: '',
  merchantId: '',
  acceptorCode: '',
  terminalSerial: '',
  serialPort: '',
  baudRate: 115200,
  ipAddress: '',
  port: '',
  apiBaseUrl: '',
  apiKey: '',
  isActive: true,
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function PosDevicesTab() {
  const { toast } = useToast()
  const [devices, setDevices] = useState<PosDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DeviceForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  const loadDevices = useCallback(async () => {
    const tid = getTenantId()
    if (!tid) return
    setLoading(true)
    try {
      const res = await fetch(`/api/pos-devices?tenantId=${tid}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setDevices(data.data || [])
      }
    } catch (err) {
      console.error('[PosDevices] load error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadDevices() }, [loadDevices])

  // ═══════════════════════════════════════════════════════════════
  //  Actions
  // ═══════════════════════════════════════════════════════════════

  const handleOpenAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (device: PosDevice) => {
    setForm({
      name: device.name,
      terminalType: device.terminalType,
      brand: (device.brand as TerminalBrand) || 'generic',
      terminalId: device.terminalId || '',
      bankName: device.bankName || '',
      merchantId: device.merchantId || '',
      acceptorCode: device.acceptorCode || '',
      terminalSerial: device.terminalSerial || '',
      serialPort: device.serialPort || '',
      baudRate: device.baudRate || 115200,
      ipAddress: device.ipAddress || '',
      port: device.port || '',
      apiBaseUrl: device.apiBaseUrl || '',
      apiKey: device.apiKey || '',
      isActive: device.isActive,
    })
    setEditingId(device.id)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (form.name.trim().length < 2) {
      toast({ title: 'خطا', description: 'نام دستگاه الزامی است', variant: 'destructive' })
      return
    }
    setSaving(true)
    const tid = getTenantId()
    try {
      const url = editingId
        ? `/api/pos-devices?id=${editingId}&tenantId=${tid}`
        : `/api/pos-devices?tenantId=${tid}`
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: editingId ? 'دستگاه به‌روزرسانی شد' : 'دستگاه افزوده شد' })
        setDialogOpen(false)
        loadDevices()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message || 'خطا در ذخیره‌سازی', variant: 'destructive' })
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('آیا از حذف این دستگاه مطمئن هستید؟')) return
    const tid = getTenantId()
    try {
      const res = await fetch(`/api/pos-devices?id=${id}&tenantId=${tid}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'حذف شد', description: 'دستگاه حذف شد' })
        loadDevices()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
  }

  const handleSetActive = async (id: string) => {
    const tid = getTenantId()
    try {
      const res = await fetch(`/api/pos-devices?id=${id}&tenantId=${tid}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: true }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'فعال شد', description: 'این دستگاه به‌عنوان فعال انتخاب شد' })
        loadDevices()
      }
    } catch {}
  }

  /**
   * ★ تست اتصال — این تست سمت frontend انجام می‌شه (adapter ساخته می‌شه)
   */
  const handleTestConnection = async (device: PosDevice) => {
    setTestingId(device.id)
    try {
      const support = checkBrowserSupport(device.terminalType)
      if (!support.supported) {
        setTestResults((p) => ({
          ...p,
          [device.id]: { success: false, message: support.message || 'پشتیبانی نمی‌شود' },
        }))
        setTestingId(null)
        return
      }

      const adapter = createPosAdapter({
        terminalType: device.terminalType,
        name: device.name,
        brand: device.brand as any,
        terminalId: device.terminalId || undefined,
        merchantId: device.merchantId || undefined,
        acceptorCode: device.acceptorCode || undefined,
        ipAddress: device.ipAddress || undefined,
        port: device.port || undefined,
        serialPort: device.serialPort || undefined,
        baudRate: device.baudRate,
        apiBaseUrl: device.apiBaseUrl || undefined,
        apiKey: device.apiKey || undefined,
      })

      const result = await adapter.testConnection()
      setTestResults((p) => ({
        ...p,
        [device.id]: { success: result.success, message: result.message },
      }))

      if (result.success) {
        toast({ title: 'موفق', description: result.message })
      } else {
        toast({ title: 'خطا', description: result.message, variant: 'destructive' })
      }

      await adapter.disconnect()
    } catch (err: any) {
      setTestResults((p) => ({
        ...p,
        [device.id]: { success: false, message: err?.message || 'خطا' },
      }))
    }
    setTestingId(null)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-3">
      {/* Header */}
      <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50/50 to-white">
        <CardContent className="p-3.5 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              دستگاه‌های POS (کارتخوان)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              مدیریت کارتخوان‌های متصل به صندوق فروش — هر نوع کارتخوانی قابل اتصال است
            </p>
          </div>
          <Button onClick={handleOpenAdd} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-3.5 h-3.5 ml-1" />
            افزودن کارتخوان
          </Button>
        </CardContent>
      </Card>

      {/* Devices List */}
      {loading ? (
        <Card><CardContent className="p-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" />
          <p className="text-xs text-gray-500 mt-2">در حال بارگذاری...</p>
        </CardContent></Card>
      ) : devices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Monitor className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-600">هیچ کارتخوانی ثبت نشده</p>
            <p className="text-xs text-gray-500 mt-1">
              برای شروع، یک کارتخوان اضافه کنید. ساده‌ترین حالت «ورودی دستی» است که با هر کارتخوانی کار می‌کند.
            </p>
            <Button onClick={handleOpenAdd} size="sm" className="mt-3" variant="outline">
              <Plus className="w-3.5 h-3.5 ml-1" />
              افزودن اولین کارتخوان
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2.5">
          {devices.map((device) => {
            const typeInfo = TERMINAL_TYPES.find((t) => t.value === device.terminalType)
            const brandInfo = TERMINAL_BRANDS.find((b) => b.value === device.brand)
            const testResult = testResults[device.id]
            return (
              <Card key={device.id} className={`border ${device.isActive ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200'}`}>
                <CardContent className="p-3.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-base">{typeInfo?.icon || '📟'}</span>
                        <h4 className="text-sm font-bold text-gray-900">{device.name}</h4>
                        {device.isActive && (
                          <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-600 bg-emerald-50">
                            <Power className="w-2.5 h-2.5 ml-0.5" />
                            فعال
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px]">
                          {typeInfo?.label || device.terminalType}
                        </Badge>
                        {brandInfo && brandInfo.value !== 'generic' && (
                          <Badge variant="outline" className="text-[9px] text-gray-500">
                            {brandInfo.label}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-gray-600">
                        {device.terminalId && (
                          <div><span className="text-gray-400">Terminal ID:</span> <span dir="ltr">{device.terminalId}</span></div>
                        )}
                        {device.merchantId && (
                          <div><span className="text-gray-400">Merchant:</span> <span dir="ltr">{device.merchantId}</span></div>
                        )}
                        {device.bankName && (
                          <div><span className="text-gray-400">بانک:</span> {device.bankName}</div>
                        )}
                        {device.ipAddress && (
                          <div><span className="text-gray-400">IP:</span> <span dir="ltr">{device.ipAddress}:{device.port}</span></div>
                        )}
                        {device.serialPort && (
                          <div><span className="text-gray-400">Serial:</span> <span dir="ltr">{device.serialPort} @ {device.baudRate}</span></div>
                        )}
                        {device.paymentCount !== undefined && device.paymentCount > 0 && (
                          <div><span className="text-gray-400">تراکنش‌ها:</span> {device.paymentCount.toLocaleString('fa-IR')}</div>
                        )}
                      </div>
                      {testResult && (
                        <div className={`mt-2 text-[10px] flex items-center gap-1 ${testResult.success ? 'text-emerald-600' : 'text-red-500'}`}>
                          {testResult.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {testResult.message}
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(device)}
                        disabled={testingId === device.id}
                        className="h-7 text-[10px] gap-1"
                        title="تست اتصال"
                      >
                        {testingId === device.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wifi className="w-3 h-3" />
                        )}
                        تست
                      </Button>
                      {!device.isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetActive(device.id)}
                          className="h-7 text-[10px] gap-1 text-emerald-600 hover:bg-emerald-50"
                          title="تنظیم به‌عنوان فعال"
                        >
                          <Power className="w-3 h-3" />
                          فعال‌سازی
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenEdit(device)}
                        className="h-7 w-7 p-0"
                        title="ویرایش"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(device.id)}
                        className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                        title="حذف"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Help Card */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-3.5">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-[11px] text-gray-700 space-y-1">
              <p className="font-medium">راهنمای انتخاب نوع اتصال:</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                <li><b>ورودی دستی</b>: ساده‌ترین حالت — صندوق‌دار شماره پیرو را دستی وارد می‌کند. با همه کارتخوان‌ها کار می‌کند.</li>
                <li><b>حالت کیبورد (HID)</b>: کارتخوان در حالت کیبورد تنظیم می‌شود و شماره پیرو را مستقیم تایپ می‌کند. رایج در ترمینال‌های ایرانی.</li>
                <li><b>USB/سریال</b>: اتصال مستقیم به کارتخوان با Web Serial API (Chrome 89+).</li>
                <li><b>شبکه (TCP)</b>: برای کارتخوان‌های تحت شبکه با IP — نیاز به bridge محلی.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Settings2 className="w-4 h-4" />
              {editingId ? 'ویرایش کارتخوان' : 'افزودن کارتخوان جدید'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              تنظیمات اتصال کارتخوان را پیکربندی کنید
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Name */}
            <div className="space-y-1">
              <Label className="text-xs">نام دستگاه *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثلاً: کارتخوان صندوق ۱"
                className="h-9 text-xs"
              />
            </div>

            {/* Terminal Type */}
            <div className="space-y-1">
              <Label className="text-xs">نوع اتصال *</Label>
              <Select
                value={form.terminalType}
                onValueChange={(v) => setForm({ ...form, terminalType: v as TerminalType })}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMINAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      <span className="ml-1">{t.icon}</span> {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-500">
                {TERMINAL_TYPES.find((t) => t.value === form.terminalType)?.description}
              </p>
              {checkBrowserSupport(form.terminalType).message && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {checkBrowserSupport(form.terminalType).message}
                </p>
              )}
            </div>

            {/* Brand */}
            <div className="space-y-1">
              <Label className="text-xs">برند کارتخوان</Label>
              <Select
                value={form.brand}
                onValueChange={(v) => setForm({ ...form, brand: v as TerminalBrand })}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMINAL_BRANDS.map((b) => (
                    <SelectItem key={b.value} value={b.value} className="text-xs">
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bank Info */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">نام بانک</Label>
                <Input
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  placeholder="مثلاً: بانک ملت"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">کد پذیرنده (Merchant ID)</Label>
                <Input
                  value={form.merchantId}
                  onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
                  placeholder="کد پذیرنده"
                  dir="ltr"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Terminal ID</Label>
                <Input
                  value={form.terminalId}
                  onChange={(e) => setForm({ ...form, terminalId: e.target.value })}
                  placeholder="شناسه ترمینال"
                  dir="ltr"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">کد پذیرش (Acceptor Code)</Label>
                <Input
                  value={form.acceptorCode}
                  onChange={(e) => setForm({ ...form, acceptorCode: e.target.value })}
                  placeholder="کد پذیرش"
                  dir="ltr"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Type-specific fields */}
            {form.terminalType === 'web-serial' && (
              <div className="grid grid-cols-2 gap-2 p-2 bg-blue-50/50 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs">پورت سریال</Label>
                  <Input
                    value={form.serialPort}
                    onChange={(e) => setForm({ ...form, serialPort: e.target.value })}
                    placeholder="مثلاً: COM3 یا /dev/ttyUSB0"
                    dir="ltr"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Baud Rate</Label>
                  <Select
                    value={String(form.baudRate)}
                    onValueChange={(v) => setForm({ ...form, baudRate: parseInt(v) })}
                  >
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="9600" className="text-xs">9600</SelectItem>
                      <SelectItem value="19200" className="text-xs">19200</SelectItem>
                      <SelectItem value="38400" className="text-xs">38400</SelectItem>
                      <SelectItem value="57600" className="text-xs">57600</SelectItem>
                      <SelectItem value="115200" className="text-xs">115200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {form.terminalType === 'network-tcp' && (
              <div className="grid grid-cols-2 gap-2 p-2 bg-blue-50/50 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs">IP Address</Label>
                  <Input
                    value={form.ipAddress}
                    onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                    placeholder="مثلاً: 192.168.1.100"
                    dir="ltr"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port</Label>
                  <Input
                    value={String(form.port)}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                    placeholder="مثلاً: 5000"
                    dir="ltr"
                    type="number"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-2 text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  برای اتصال TCP، یک bridge محلی روی http://localhost:3821/pos-tcp لازم است.
                </div>
              </div>
            )}

            {form.terminalType === 'network-http' && (
              <div className="space-y-2 p-2 bg-blue-50/50 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs">API Base URL</Label>
                  <Input
                    value={form.apiBaseUrl}
                    onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                    placeholder="مثلاً: http://192.168.1.100:8080/api"
                    dir="ltr"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">API Key (اختیاری)</Label>
                  <Input
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder="کلید API"
                    dir="ltr"
                    type="password"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs font-medium">دستگاه فعال</p>
                <p className="text-[10px] text-gray-500">این کارتخوان در صندوق فروش به‌عنوان پیش‌فرض استفاده می‌شود</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              انصراف
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 ml-1" />}
              {editingId ? 'ذخیره تغییرات' : 'افزودن دستگاه'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
