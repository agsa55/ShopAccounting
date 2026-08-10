'use client'
// src/components/settings/pos-devices-tab.tsx
// ShopAccounting v11.1 — POS Devices Management Tab
// ============================================================================
// ★★★ v11.1 اصلاحات:
//   ✓ اضافه شدن Switch یکپارچه‌سازی با صندوق فروش
//   ✓ ذخیره در localStorage + dispatch event برای هماهنگی Real-time
//   ✓ اضافه شدن کارت راهنما برای توضیح قابلیت‌ها
// ★★★ v11.0 اصلاحات قبلی:
//   ✓ اضافه شدن اتصال سریع Web Serial (یک کلیک)
//   ✓ شناسایی خودکار دستگاه و برند
//   ✓ راهنمای جامع دستگاه‌های رایج در ایران
//   ✓ ذخیره خودکار دستگاه متصل شده در دیتابیس
// ★★★ v10.1 اصلاحات قبلی:
//   ✓ حذف tenantId از query parameters 
//   ✓ رفع خطای Unknown argument `tenantId`
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Loader2, Power, AlertCircle, Settings2, Usb, Smartphone, Network,
  Keyboard, Zap, Info, BookOpen, ChevronRight, X, HelpCircle,
  Link2, Link2Off,
} from 'lucide-react'
import {
  type TerminalType, type TerminalBrand,
  TERMINAL_TYPES, TERMINAL_BRANDS,
  createPosAdapter, checkBrowserSupport,
} from '@/lib/pos-adapters'

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

const formatPrice = (n: number) => (n || 0).toLocaleString('fa-IR')

// ═══════════════════════════════════════════════════════════════
//  ★★★ v11.1: کلید ثابت برای ذخیره یکپارچه‌سازی
// ═══════════════════════════════════════════════════════════════
const POS_INTEGRATION_KEY = 'pos_integration_enabled'
const DEFAULT_INTEGRATION_ENABLED = true

function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ v11.0: دیتابیس دستگاه‌های رایج در ایران
// ═══════════════════════════════════════════════════════════════
interface PopularDevice {
  brand: TerminalBrand
  model: string
  connectionType: TerminalType
  icon: string
  description: string
  popularity: number
  setupDifficulty: 'آسان' | 'متوسط' | 'پیچیده'
  notes: string
}

const POPULAR_DEVICES: PopularDevice[] = [
  {
    brand: 'pax',
    model: 'Pax S80',
    connectionType: 'web-serial',
    icon: '🟢',
    description: 'کارتخوان ثابت — رایج‌ترین در ایران',
    popularity: 5,
    setupDifficulty: 'آسان',
    notes: 'فقط کابل USB را وصل کنید. در Chrome یا Edge کار می‌کند.',
  },
  {
    brand: 'pax',
    model: 'Pax S90',
    connectionType: 'web-serial',
    icon: '🟢',
    description: 'کارتخوان سیار با USB',
    popularity: 4,
    setupDifficulty: 'آسان',
    notes: 'با کابل USB به کامپیوتر وصل شود.',
  },
  {
    brand: 'verifone',
    model: 'Verifone VX520',
    connectionType: 'web-serial',
    icon: '🟡',
    description: 'کارتخوان ثابت Verifone',
    popularity: 3,
    setupDifficulty: 'متوسط',
    notes: 'ممکن است نیاز به آداپتور USB-to-Serial باشد.',
  },
  {
    brand: 'pax',
    model: 'Pax A920 (اندرویدی)',
    connectionType: 'network-http',
    icon: '🔵',
    description: 'کارتخوان هوشمند اندرویدی',
    popularity: 4,
    setupDifficulty: 'متوسط',
    notes: 'از طریق WiFi و HTTP API وصل می‌شود.',
  },
  {
    brand: 'fannipars',
    model: 'Fanipars (سری‌های مختلف)',
    connectionType: 'keyboard-hid',
    icon: '🟠',
    description: 'کارتخوان‌های ایرانی',
    popularity: 3,
    setupDifficulty: 'آسان',
    notes: 'در حالت Keyboard HID تنظیم شود.',
  },
  {
      brand: 'generic',
    model: 'Castles S1F2',
    connectionType: 'web-serial',
    icon: '🟡',
    description: 'کارتخوان ثابت Castles',
    popularity: 2,
    setupDifficulty: 'متوسط',
    notes: 'اتصال USB با Web Serial.',
  },
  {
    brand: 'generic',
    model: 'سایر دستگاه‌ها',
    connectionType: 'manual',
    icon: '⚪',
    description: 'هر کارتخوان دیگری',
    popularity: 1,
    setupDifficulty: 'آسان',
    notes: 'شماره پیگیری دستی وارد می‌شود.',
  },
]

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

interface DeviceForm {
  name: string
  terminalType: TerminalType
  brand: TerminalBrand
  terminalId: string
  bankName: string
  merchantId: string
  acceptorCode: string
  terminalSerial: string
  serialPort: string
  baudRate: number
  ipAddress: string
  port: number | string
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
//  ★★★ v11.0: هوک اتصال سریع Web Serial
// ═══════════════════════════════════════════════════════════════
function useQuickConnect() {
  const [isSupported, setIsSupported] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectedDevice, setConnectedDevice] = useState<{
    port: any
    name: string
    info: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const portRef = useRef<any>(null)

  useEffect(() => {
    const supported = typeof navigator !== 'undefined' && 'serial' in navigator
    setIsSupported(supported)
  }, [])

  const connect = async (): Promise<{
    success: boolean
    deviceName?: string
    deviceInfo?: string
    error?: string
  }> => {
    if (!isSupported) {
      setError('مرورگر شما از Web Serial API پشتیبانی نمی‌کند. لطفاً از Chrome یا Edge استفاده کنید.')
      return { success: false, error: 'مرورگر پشتیبانی نمی‌کند' }
    }

    setIsConnecting(true)
    setError(null)

    try {
      const port = await (navigator as any).serial.requestPort()
      portRef.current = port

      await port.open({ baudRate: 115200 })

      const info = port.getInfo()
      const vendorId = info.usbVendorId
      const productId = info.usbProductId

      let detectedBrand: TerminalBrand = 'generic'
      let detectedName = 'کارتخوان USB'

      if (vendorId === 0x09C1 || vendorId === 0x27E5) {
        detectedBrand = 'pax'
        detectedName = 'Pax POS Terminal'
      } else if (vendorId === 0x0E0F || vendorId === 0x11CA) {
        detectedBrand = 'verifone'
        detectedName = 'Verifone Terminal'
      } else if (vendorId === 0x18E8) {
         detectedBrand = 'generic'
        detectedName = 'Castles Terminal'
      } else if (vendorId === 0x1D1F) {
        detectedBrand = 'ingenico'
        detectedName = 'Ingenico Terminal'
      }

      const deviceInfo = `Vendor: 0x${vendorId?.toString(16).toUpperCase() || 'N/A'} | Product: 0x${productId?.toString(16).toUpperCase() || 'N/A'}`
      
      setConnectedDevice({
        port,
        name: detectedName,
        info: deviceInfo,
      })

      setIsConnecting(false)
      return { success: true, deviceName: detectedName, deviceInfo }

    } catch (err: any) {
      const errorMsg = err.name === 'NotFoundError'
        ? 'هیچ دستگاهی انتخاب نشد'
        : err.name === 'SecurityError'
          ? 'دسترسی به دستگاه رد شد'
          : err.message || 'خطا در اتصال'
      
      setError(errorMsg)
      setIsConnecting(false)
      return { success: false, error: errorMsg }
    }
  }

  const disconnect = async () => {
    try {
      if (portRef.current) {
        await portRef.current.close()
        portRef.current = null
      }
      setConnectedDevice(null)
    } catch (err) {
      console.error('[QuickConnect] disconnect error:', err)
    }
  }

  return {
    isSupported,
    isConnecting,
    connectedDevice,
    error,
    connect,
    disconnect,
  }
}

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
  
  const [guideDialogOpen, setGuideDialogOpen] = useState(false)
  const [savingQuickDevice, setSavingQuickDevice] = useState(false)
  const quickConnect = useQuickConnect()

  // ═══════════════════════════════════════════════════════════════
  //  ★★★ v11.1: State یکپارچه‌سازی با صندوق فروش
  // ═══════════════════════════════════════════════════════════════
  const [integrationEnabled, setIntegrationEnabled] = useState<boolean>(DEFAULT_INTEGRATION_ENABLED)
  const [integrationLoading, setIntegrationLoading] = useState(false)
  const [integrationSaving, setIntegrationSaving] = useState(false)

  const [showAdvanced, setShowAdvanced] = useState(false)

  
  // بارگذاری وضعیت از localStorage
  const loadIntegrationStatus = useCallback(() => {
    setIntegrationLoading(true)
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(POS_INTEGRATION_KEY)
        if (cached !== null) {
          setIntegrationEnabled(cached === 'true')
        }
      }
    } catch (err) {
      console.warn('[PosDevices] Failed to load integration status:', err)
    }
    setIntegrationLoading(false)
  }, [])

  // تغییر وضعیت یکپارچه‌سازی
  const handleIntegrationToggle = async (enabled: boolean) => {
    setIntegrationSaving(true)
    
    // ۱. به‌روزرسانی فوری UI (Optimistic Update)
    setIntegrationEnabled(enabled)
    
    // ۲. ذخیره در localStorage (منبع اصلی)
    if (typeof window !== 'undefined') {
      localStorage.setItem(POS_INTEGRATION_KEY, String(enabled))
      
      // ۳. dispatch event برای اطلاع‌رسانی به صندوق فروش (Real-time sync)
      window.dispatchEvent(new CustomEvent('pos-integration-changed', { 
        detail: { enabled } 
      }))
    }

    toast({
      title: enabled ? '✅ یکپارچه‌سازی فعال شد' : '⏸️ یکپارچه‌سازی غیرفعال شد',
      description: enabled 
        ? 'دکمه «کارتخوان» در صندوق فروش نمایش داده می‌شود.'
        : 'دکمه «کارتخوان» از صندوق فروش مخفی شد.',
      duration: 3000,
    })

    setIntegrationSaving(false)
  }

  useEffect(() => { loadIntegrationStatus() }, [loadIntegrationStatus])

  const loadDevices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pos-devices', { headers: getAuthHeaders() })
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

  const handleOpenAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
     setShowAdvanced(false) 
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
     setShowAdvanced(false) 
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (form.name.trim().length < 2) {
      toast({ title: 'خطا', description: 'نام دستگاه الزامی است', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const url = editingId
        ? `/api/pos-devices?id=${editingId}`
        : '/api/pos-devices'
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
    try {
      const res = await fetch(`/api/pos-devices?id=${id}`, {
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
    try {
      const res = await fetch(`/api/pos-devices?id=${id}`, {
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

  const handleQuickConnect = async () => {
    const result = await quickConnect.connect()
    
    if (result.success) {
      setSavingQuickDevice(true)
      try {
        const res = await fetch('/api/pos-devices', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: `کارتخوان USB - ${result.deviceName}`,
            terminalType: 'web-serial',
            brand: 'pax',
            isActive: true,
            baudRate: 115200,
          }),
        })
        const data = await res.json()
        if (data.success) {
          toast({
            title: '✅ اتصال موفق',
            description: `${result.deviceName} شناسایی و ذخیره شد. حالا می‌توانید از صندوق فروش مبلغ را ارسال کنید.`,
          })
          loadDevices()
        } else {
          toast({
            title: '⚠️ متصل شد اما ذخیره نشد',
            description: `دستگاه متصل است اما در ذخیره خطا رخ داد: ${data.error}`,
            variant: 'destructive',
          })
        }
      } catch (err: any) {
        toast({
          title: '⚠️ اتصال برقرار شد',
          description: `دستگاه متصل است اما در ذخیره خطا رخ داد: ${err.message}`,
          variant: 'destructive',
        })
      }
      setSavingQuickDevice(false)
    } else {
      if (result.error !== 'هیچ دستگاهی انتخاب نشد') {
        toast({
          title: '❌ خطا در اتصال',
          description: result.error || 'خطای ناشناخته',
          variant: 'destructive',
        })
      }
    }
  }

  const handleQuickDisconnect = async () => {
    await quickConnect.disconnect()
    toast({ title: 'قطع شد', description: 'اتصال کارتخوان قطع شد' })
  }

  const activeDeviceCount = devices.filter(d => d.isActive).length

  return (
    <div className="space-y-3">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  ★★★ v11.1: کارت اصلی — فعال/غیرفعال کردن یکپارچه‌سازی       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className={`border-2 transition-all ${
        integrationEnabled 
          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-green-50/30 to-white' 
          : 'border-slate-200 bg-slate-50/50'
      }`}>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all ${
              integrationEnabled
                ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                : 'bg-slate-400'
            }`}>
              {integrationEnabled ? (
                <Link2 className="w-5 h-5 text-white" />
              ) : (
                <Link2Off className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-800">
                  یکپارچه‌سازی با صندوق فروش
                </span>
                <Badge 
                  variant="outline" 
                  className={`text-[9px] ${
                    integrationEnabled 
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300' 
                      : 'bg-slate-200 text-slate-600 border-slate-300'
                  }`}
                >
                  {integrationEnabled ? '✓ فعال' : '⏸ غیرفعال'}
                </Badge>
              </div>
              <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-relaxed">
                {integrationEnabled
                  ? 'دکمه «کارتخوان» در صندوق فروش نمایش داده می‌شود و مبلغ فاکتور به دستگاه ارسال می‌گردد.'
                  : 'دکمه «کارتخوان» از صندوق فروش مخفی شده است. برای استفاده از کارتخوان، این گزینه را فعال کنید.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {integrationLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
              )}
              <Switch
                checked={integrationEnabled}
                onCheckedChange={handleIntegrationToggle}
                disabled={integrationSaving || integrationLoading}
                className="scale-110"
              />
            </div>
          </CardTitle>
        </CardHeader>
        
        {integrationEnabled && (
          <CardContent className="pt-0 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-white border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500">دستگاه‌های فعال</p>
                  <p className="text-sm font-bold text-emerald-700">
                    {toFaNum(activeDeviceCount)} دستگاه
                  </p>
                </div>
              </div>
              <div className="bg-white border border-blue-200 rounded-lg p-2.5 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500">وضعیت</p>
                  <p className="text-sm font-bold text-blue-700">
                    {quickConnect.connectedDevice ? '🟢 متصل' : '⚪ در انتظار'}
                  </p>
                </div>
              </div>
            </div>

            {activeDeviceCount === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 leading-relaxed">
                  <strong>هیچ دستگاه فعالی ثبت نشده است.</strong>
                  <br />
                  برای استفاده از کارتخوان، ابتدا یک دستگاه اضافه و فعال کنید.
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  ★★★ v11.1: کارت راهنما — توضیح قابلیت‌ها                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className="border-slate-200 bg-gradient-to-l from-slate-50 to-white">
        <CardContent className="p-3.5">
          <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            راهنمای قابلیت‌های این صفحه
          </h4>
          <div className="space-y-2 text-[11px]">
            <div className="flex items-start gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-emerald-600 font-bold shrink-0">۱.</span>
              <div>
                <strong className="text-emerald-800">یکپارچه‌سازی با صندوق فروش (Switch بالا)</strong>
                <p className="text-emerald-700 mt-0.5">
                  این Switch کل قابلیت کارتخوان را فعال/غیرفعال می‌کند. وقتی غیرفعال باشد، دکمه «💳 کارتخوان» از صندوق فروش <strong>حذف</strong> می‌شود.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-blue-600 font-bold shrink-0">۲.</span>
              <div>
                <strong className="text-blue-800">اتصال سریع USB</strong>
                <p className="text-blue-700 mt-0.5">
                  برای دستگاه‌های Pax S80/S90 و Verifone VX520 که با کابل USB وصل می‌شوند. ساده‌ترین روش اتصال.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
              <span className="text-purple-600 font-bold shrink-0">۳.</span>
              <div>
                <strong className="text-purple-800">افزودن دستی (دکمه پایین صفحه)</strong>
                <p className="text-purple-700 mt-0.5">
                  برای دستگاه‌هایی که با USB وصل نمی‌شوند (مثل کارتخوان‌های شبکه‌ای، اندرویدی، یا قدیمی). در اینجا مشخصات دستگاه (IP، Port، Terminal ID و...) را دستی وارد می‌کنید.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>



      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  کارت اتصال سریع (فقط در صورت فعال بودن یکپارچه‌سازی)        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {integrationEnabled && (
        <Card className="border-emerald-300 bg-gradient-to-br from-emerald-50 via-green-50/30 to-white shadow-sm">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-bold">اتصال سریع با یک کلیک</span>
                <p className="text-[10px] text-gray-500 font-normal mt-0.5">
                  ساده‌ترین راه — فقط کابل USB را وصل کنید
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGuideDialogOpen(true)}
                className="text-[10px] h-7 gap-1"
              >
                <BookOpen className="w-3 h-3" />
                راهنمای دستگاه‌ها
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            {!quickConnect.isSupported ? (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-900">
                  <strong>مرورگر شما پشتیبانی نمی‌کند!</strong>
                  <br />
                  برای استفاده از اتصال سریع، از <strong>Google Chrome</strong> یا <strong>Microsoft Edge</strong> استفاده کنید.
                  <br />
                  <span className="text-amber-700">می‌توانید از روش‌های دیگر (دستی، شبکه، ...) استفاده کنید.</span>
                </div>
              </div>
            ) : quickConnect.connectedDevice ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-900">
                      {quickConnect.connectedDevice.name}
                    </p>
                    <p className="text-[10px] text-emerald-700 font-mono mt-0.5" dir="ltr">
                      {quickConnect.connectedDevice.info}
                    </p>
                  </div>
                  <Badge className="bg-emerald-600 text-white text-[10px] shrink-0">
                    متصل
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleQuickDisconnect}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[11px] gap-1 text-red-600 hover:bg-red-50 border-red-200"
                  >
                    <WifiOff className="w-3 h-3" />
                    قطع اتصال
                  </Button>
                  <Button
                    onClick={handleOpenAdd}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[11px] gap-1"
                  >
                    <Settings2 className="w-3 h-3" />
                    ویرایش تنظیمات
                  </Button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                  <p className="text-[10px] text-blue-900 flex items-start gap-1.5">
                    <Info className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      <strong>آماده استفاده!</strong> در صندوق فروش، هنگام انتخاب «پرداخت با کارتخوان»،
                      مبلغ به طور خودکار به این دستگاه ارسال می‌شود.
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={handleQuickConnect}
                  disabled={quickConnect.isConnecting || savingQuickDevice}
                  className="w-full bg-gradient-to-l from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white py-6 h-auto shadow-sm"
                  size="lg"
                >
                  {quickConnect.isConnecting || savingQuickDevice ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin ml-2" />
                      {quickConnect.isConnecting ? 'در حال شناسایی دستگاه...' : 'در حال ذخیره...'}
                    </>
                  ) : (
                    <>
                      <Usb className="w-5 h-5 ml-2" />
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-bold">🔌 اتصال کارتخوان با USB</span>
                        <span className="text-[10px] opacity-90 font-normal mt-0.5">
                          ۱. کابل را وصل کنید ۲. دکمه را بزنید ۳. دستگاه را انتخاب کنید
                        </span>
                      </div>
                    </>
                  )}
                </Button>

                {quickConnect.error && quickConnect.error !== 'هیچ دستگاهی انتخاب نشد' && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-800">{quickConnect.error}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <div className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg">
                    <span className="text-lg">🟢</span>
                    <span className="text-[9px] text-gray-700 font-medium text-center">Pax S80/S90</span>
                    <span className="text-[8px] text-emerald-600 font-bold">پیشنهادی</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg">
                    <span className="text-lg">🟡</span>
                    <span className="text-[9px] text-gray-700 font-medium text-center">Verifone VX520</span>
                    <span className="text-[8px] text-gray-500">پشتیبانی</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg">
                    <span className="text-lg">🔵</span>
                    <span className="text-[9px] text-gray-700 font-medium text-center">اندرویدی</span>
                    <span className="text-[8px] text-gray-500">HTTP API</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  کارت هدر لیست دستگاه‌ها                                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className="border-gray-200 bg-white">
        <CardContent className="p-3.5 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              دستگاه‌های ثبت شده
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              مدیریت کارتخوان‌های ذخیره شده — هر نوع کارتخوانی قابل اتصال است
            </p>
          </div>
          <Button onClick={handleOpenAdd} size="sm" variant="outline" className="gap-1">
            <Plus className="w-3.5 h-3.5" />
            افزودن دستی
          </Button>
        </CardContent>
      </Card>

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
              از <strong>اتصال سریع</strong> در بالا استفاده کنید یا یک کارتخوان دستی اضافه کنید.
            </p>
            <Button onClick={handleOpenAdd} size="sm" variant="outline" className="mt-2">
              <Plus className="w-3.5 h-3.5 ml-1" />
              افزودن دستی
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  راهنمای سریع (خلاصه)                                         */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-3.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-[11px] text-gray-700">
              <p className="font-medium mb-1">راهنمای سریع:</p>
              <p className="text-gray-600 leading-relaxed">
                برای <strong>Pax S80/S90</strong> از <strong>«اتصال سریع USB»</strong> استفاده کنید.
                برای کارتخوان‌های اندرویدی یا دستگاه‌های خاص، روی «راهنمای دستگاه‌ها» در بالا کلیک کنید.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  Dialog افزودن/ویرایش دستگاه                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
         {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  Dialog افزودن/ویرایش دستگاه (با بخش پیشرفته مخفی)             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
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
            {/* ─── فیلدهای اصلی (همیشه نمایش داده می‌شوند) ─── */}
            <div className="space-y-1">
              <Label className="text-xs">نام دستگاه *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثلاً: کارتخوان صندوق ۱"
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-gray-500">یک نام دلخواه برای شناسایی دستگاه</p>
            </div>

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

            {/* ─── فیلدهای خاص نوع اتصال USB ─── */}
            {form.terminalType === 'web-serial' && (
              <div className="space-y-2 p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                <p className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
                  🔌 تنظیمات USB
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">پورت سریال (اختیاری)</Label>
                    <Input
                      value={form.serialPort}
                      onChange={(e) => setForm({ ...form, serialPort: e.target.value })}
                      placeholder="خالی بگذارید تا خودکار شناسایی شود"
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
              </div>
            )}

            {/* ─── فیلدهای خاص نوع اتصال TCP ─── */}
            {form.terminalType === 'network-tcp' && (
              <div className="space-y-2 p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                <p className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
                  🌐 تنظیمات شبکه TCP
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">IP Address *</Label>
                    <Input
                      value={form.ipAddress}
                      onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                      placeholder="مثلاً: 192.168.1.100"
                      dir="ltr"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Port *</Label>
                    <Input
                      value={String(form.port)}
                      onChange={(e) => setForm({ ...form, port: e.target.value })}
                      placeholder="مثلاً: 5000"
                      dir="ltr"
                      type="number"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  برای اتصال TCP، یک bridge محلی روی http://localhost:3821/pos-tcp لازم است.
                </div>
              </div>
            )}

            {/* ─── فیلدهای خاص نوع اتصال HTTP ─── */}
            {form.terminalType === 'network-http' && (
              <div className="space-y-2 p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                <p className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
                  🔗 تنظیمات شبکه HTTP (کارتخوان اندرویدی)
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">API Base URL *</Label>
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
                      placeholder="اگر دستگاه کلید API دارد وارد کنید"
                      dir="ltr"
                      type="password"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── بخش تنظیمات پیشرفته (مخفی به صورت پیش‌فرض) ─── */}
            <div className="border-t border-gray-200 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">
                    تنظیمات پیشرفته (فقط برای متخصصان)
                  </span>
                </div>
                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="mt-2 space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                    <p className="text-[10px] text-amber-800 flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>
                        این فیلدها معمولاً نیازی به پر کردن ندارند. فقط در صورتی که شرکت پرداخت (PSP) این اطلاعات را به شما داده، وارد کنید.
                      </span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">نام بانک (اختیاری)</Label>
                      <Input
                        value={form.bankName}
                        onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                        placeholder="مثلاً: بانک ملت"
                        className="h-9 text-xs"
                      />
                      <p className="text-[9px] text-gray-500">فقط برای مستندسازی</p>
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
                      <p className="text-[9px] text-gray-500">فقط برای کارتخوان‌های اندرویدی</p>
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
                      <p className="text-[9px] text-gray-500">شناسه یکتای دستگاه</p>
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
                      <p className="text-[9px] text-gray-500">کد پذیرش PSP</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── دستگاه فعال ─── */}
            <div className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
              <div>
                <p className="text-xs font-medium text-emerald-900">دستگاه فعال</p>
                <p className="text-[10px] text-emerald-700">این کارتخوان در صندوق فروش به‌عنوان پیش‌فرض استفاده می‌شود</p>
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  Dialog راهنمای جامع دستگاه‌ها                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={guideDialogOpen} onOpenChange={setGuideDialogOpen}>
        <DialogContent className="sm:max-w-[720px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-5 h-5 text-blue-600" />
              راهنمای دستگاه‌های کارتخوان
            </DialogTitle>
            <DialogDescription className="text-xs">
              دستگاه‌های رایج در ایران و روش راه‌اندازی هر یک
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="bg-gradient-to-l from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-900 leading-relaxed">
                سیستم ما از <strong>۵ روش مختلف اتصال</strong> پشتیبانی می‌کند تا تقریباً هر کارتخوانی قابل استفاده باشد.
                در زیر رایج‌ترین دستگاه‌های ایران و روش راه‌اندازی آن‌ها را می‌بینید.
              </p>
            </div>

            <div className="space-y-2">
              {POPULAR_DEVICES.map((device, idx) => (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{device.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-gray-900">{device.model}</h4>
                          <Badge variant="outline" className="text-[9px]">
                            {TERMINAL_BRANDS.find(b => b.value === device.brand)?.label}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            {TERMINAL_TYPES.find(t => t.value === device.connectionType)?.icon}
                            <span className="mr-1">{TERMINAL_TYPES.find(t => t.value === device.connectionType)?.label}</span>
                          </Badge>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${
                            device.setupDifficulty === 'آسان'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : device.setupDifficulty === 'متوسط'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {device.setupDifficulty}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-700 mb-1.5">{device.description}</p>
                      <p className="text-[11px] text-gray-600 bg-gray-50 p-2 rounded border-r-2 border-blue-300">
                        <strong>راه‌اندازی:</strong> {device.notes}
                      </p>
                      {device.popularity >= 4 && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] text-amber-700 font-bold">
                            پر استفاده در ایران
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                کدام روش برای من مناسب است؟
              </h4>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">🟢</span>
                  <div>
                    <strong>اتصال سریع USB:</strong> برای Pax S80/S90 و Verifone VX520 — <span className="text-emerald-700">بهترین گزینه</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">🔵</span>
                  <div>
                    <strong>شبکه (HTTP API):</strong> برای کارتخوان‌های هوشمند اندرویدی مثل Pax A920
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-orange-600 font-bold">🟠</span>
                  <div>
                    <strong>کیبورد (HID):</strong> برای کارتخوان‌های ایرانی Fanipars و مشابه
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-600 font-bold">🟣</span>
                  <div>
                    <strong>شبکه (TCP):</strong> برای دستگاه‌های تحت شبکه با bridge محلی
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-600 font-bold">⚪</span>
                  <div>
                    <strong>ورودی دستی:</strong> هر کارتخوانی — شماره پیگیری را دستی وارد کنید
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-900 space-y-1">
                  <p className="font-bold">نکات مهم:</p>
                  <ul className="list-disc pr-4 space-y-0.5 text-amber-800">
                    <li>برای اتصال USB حتماً از <strong>Google Chrome</strong> یا <strong>Microsoft Edge</strong> استفاده کنید.</li>
                    <li>قبل از اتصال، مطمئن شوید درایور کارتخوان نصب شده است (معمولاً خودکار نصب می‌شود).</li>
                    <li>اگر دستگاه شناسایی نشد، آن را از USB جدا کرده و دوباره وصل کنید.</li>
                    <li>کارتخوان باید به شبکه شاپرک متصل باشد (از طریق PSP).</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setGuideDialogOpen(false)} className="bg-blue-600 hover:bg-blue-700">
              متوجه شدم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}