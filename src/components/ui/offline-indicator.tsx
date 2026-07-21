'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '@/lib/store'
import { syncEngine } from '@/lib/sync-engine'
import { getSyncQueueCount } from '@/lib/offline-db'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CloudOff,
  Database,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

/**
 * تلاش برای خواندن getCacheStats از offline-db
 * اگر وجود نداشت، null برمی‌گردونه
 */
async function tryGetCacheStats(): Promise<{
  products: number
  customers: number
  categories: number
  invoices: number
  syncQueue: number
  lastSync: number | null
} | null> {
  try {
    const mod = await import('@/lib/offline-db')
    if (typeof mod.getCacheStats === 'function') {
      return await mod.getCacheStats()
    }
  } catch { /* ignore */ }
  return null
}

/**
 * شاخص وضعیت آنلاین/آفلاین — آیکون کوچک
 * ★ کلیک روی هر حالتی پنل همگام‌سازی رو باز می‌کنه
 * ★ بدون وابستگی به Dialog — از popover ساده استفاده میشه
 */
export function OfflineIndicator({ className = '' }: { className?: string }) {
  const isOnline = useStore((s) => s.isOnline)
  const pendingSyncCount = useStore((s) => s.pendingSyncCount)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [cacheStats, setCacheStats] = useState<{
    products: number
    customers: number
    categories: number
    invoices: number
    syncQueue: number
    lastSync: number | null
  } | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // بستن پنل با کلیک بیرون
  useEffect(() => {
    if (!panelOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [panelOpen])

  // بروزرسانی آمار وقتی پنل باز میشه
  useEffect(() => {
    if (panelOpen) {
      refreshStats()
    }
  }, [panelOpen])

  // بروزرسانی آمار هر ۵ ثانیه وقتی پنل بازه
  useEffect(() => {
    if (!panelOpen) return
    const interval = setInterval(refreshStats, 5000)
    return () => clearInterval(interval)
  }, [panelOpen])

  const refreshStats = useCallback(async () => {
    try {
      // تلاش برای خواندن cacheStats (optional)
      const stats = await tryGetCacheStats()
      if (stats) {
        setCacheStats(stats)
        setLastSync(stats.lastSync)
      }
      // بروزرسانی pendingSyncCount از store
      const count = await getSyncQueueCount()
      useStore.getState().setPendingSyncCount(count)
    } catch { /* ignore */ }
  }, [])

  const handleSync = async () => {
    if (isSyncing || !isOnline) return
    setIsSyncing(true)
    setSyncMessage(null)

    try {
      if (pendingSyncCount > 0) {
        // آیتم‌های در صف رو همگام‌سازی کن
        const result = await syncEngine.sync()
        if (result.succeeded > 0) {
          setSyncMessage(`${result.succeeded} آیتم با موفقیت همگام‌سازی شد`)
        } else if (result.failed > 0) {
          setSyncMessage(`همگام‌سازی ${result.failed} آیتم ناموفق بود`)
        } else {
          setSyncMessage('صف همگام‌سازی خالی بود')
        }
      } else {
        // صف خالیه — بارگذاری مجدد داده‌ها از سرور
        setSyncMessage('در حال بارگذاری مجدد داده‌ها...')
        await syncEngine.preloadData()
        setSyncMessage('داده‌ها با موفقیت بارگذاری شد')
      }

      // بروزرسانی آمار
      const count = await getSyncQueueCount()
      useStore.getState().setPendingSyncCount(count)
      await refreshStats()
    } catch (err: any) {
      setSyncMessage('خطا در همگام‌سازی: ' + (err.message || 'خطای ناشناخته'))
    } finally {
      setIsSyncing(false)
      // پاک کردن پیام بعد از ۵ ثانیه
      setTimeout(() => setSyncMessage(null), 5000)
    }
  }

  // فرمت زمان آخرین همگام‌سازی
  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return 'هنوز همگام‌سازی نشده'
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'لحظاتی پیش'
    if (minutes < 60) return `${minutes} دقیقه پیش`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} ساعت پیش`
    const days = Math.floor(hours / 24)
    return `${days} روز پیش`
  }

  // انتخاب رنگ و آیکون بر اساس وضعیت
  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        icon: WifiOff,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
        label: 'آفلاین',
        description: 'اتصال اینترنت قطع است',
      }
    }
    if (pendingSyncCount > 0) {
      return {
        icon: RefreshCw,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
        label: `${pendingSyncCount} در صف`,
        description: 'تغییرات همگام‌نشده وجود دارد',
      }
    }
    return {
      icon: Wifi,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
      label: 'آنلاین',
      description: 'همه تغییرات همگام‌شده',
    }
  }

  const statusConfig = getStatusConfig()
  const StatusIcon = statusConfig.icon

  return (
    <div className="relative">
      {/* ─── دکمه وضعیت — قابل کلیک ─── */}
      <button
        ref={buttonRef}
        onClick={() => setPanelOpen(!panelOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors cursor-pointer ${statusConfig.bgColor} ${statusConfig.color} ${className}`}
        title="مشاهده وضعیت اتصال و همگام‌سازی"
      >
        <StatusIcon className={`w-4 h-4 ${isSyncing && isOnline ? 'animate-spin' : ''}`} />
        <span className="text-[10px] sm:text-xs font-medium hidden sm:inline">{statusConfig.label}</span>
      </button>

      {/* ─── پنل همگام‌سازی ─── */}
      {panelOpen && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-2 z-[100] w-[340px] sm:w-[380px] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          dir="rtl"
        >
          {/* ─── هدر وضعیت ─── */}
          <div className={`px-4 py-3 ${!isOnline ? 'bg-amber-50' : pendingSyncCount > 0 ? 'bg-orange-50' : 'bg-emerald-50'}`}>
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-9 h-9 rounded-full ${
                !isOnline ? 'bg-amber-100' : pendingSyncCount > 0 ? 'bg-orange-100' : 'bg-emerald-100'
              }`}>
                <StatusIcon className={`w-4 h-4 ${statusConfig.color} ${isSyncing ? 'animate-spin' : ''}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{statusConfig.label}</p>
                <p className="text-[11px] text-gray-500">{statusConfig.description}</p>
              </div>
              {!isOnline ? (
                <Badge className="bg-amber-200 text-amber-800 border-amber-300 text-[10px]">
                  <CloudOff className="w-3 h-3 ml-0.5" />
                  قطع
                </Badge>
              ) : pendingSyncCount > 0 ? (
                <Badge className="bg-orange-200 text-orange-800 border-orange-300 text-[10px]">
                  <RefreshCw className="w-3 h-3 ml-0.5" />
                  {pendingSyncCount}
                </Badge>
              ) : (
                <Badge className="bg-emerald-200 text-emerald-800 border-emerald-300 text-[10px]">
                  <CheckCircle2 className="w-3 h-3 ml-0.5" />
                  فعال
                </Badge>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                className="p-1 rounded-md hover:bg-black/5 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          <Separator />

          {/* ─── اطلاعات همگام‌سازی ─── */}
          <div className="px-4 py-3 space-y-2.5">
            {/* آخرین همگام‌سازی */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                <span>آخرین همگام‌سازی</span>
              </div>
              <span className="text-[11px] text-gray-700 font-medium">
                {formatLastSync(lastSync)}
              </span>
            </div>

            {/* تعداد در صف */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>در صف همگام‌سازی</span>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0 h-5 ${
                  pendingSyncCount > 0
                    ? 'border-orange-300 text-orange-700 bg-orange-50'
                    : 'border-emerald-300 text-emerald-700 bg-emerald-50'
                }`}
              >
                {pendingSyncCount} آیتم
              </Badge>
            </div>

            {/* پیام نتیجه همگام‌سازی */}
            {syncMessage && (
              <div className={`flex items-start gap-2 p-2 rounded-lg text-[11px] leading-relaxed ${
                syncMessage.includes('موفق')
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : syncMessage.includes('ناموفق') || syncMessage.includes('خطا')
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-blue-50 border border-blue-200 text-blue-700'
              }`}>
                {syncMessage.includes('موفق') ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : syncMessage.includes('ناموفق') || syncMessage.includes('خطا') ? (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin" />
                )}
                <span>{syncMessage}</span>
              </div>
            )}

            {/* هشدار آفلاین */}
            {!isOnline && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  تغییرات شما به‌صورت محلی ذخیره می‌شوند و پس از اتصال مجدد به اینترنت همگام‌سازی خواهند شد.
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* ─── آمار کش (فقط اگر در دسترس باشه) ─── */}
          {cacheStats && (
            <>
              <div className="px-4 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[11px] font-medium text-gray-600">داده‌های کش‌شده</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="flex items-center justify-between px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
                    <span className="text-[10px] text-gray-500">محصولات</span>
                    <span className="text-[10px] font-bold text-gray-700">{cacheStats.products}</span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
                    <span className="text-[10px] text-gray-500">مشتریان</span>
                    <span className="text-[10px] font-bold text-gray-700">{cacheStats.customers}</span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
                    <span className="text-[10px] text-gray-500">دسته‌بندی</span>
                    <span className="text-[10px] font-bold text-gray-700">{cacheStats.categories}</span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
                    <span className="text-[10px] text-gray-500">فاکتورها</span>
                    <span className="text-[10px] font-bold text-gray-700">{cacheStats.invoices}</span>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* ─── دکمه همگام‌سازی — همیشه فعال وقتی آنلاین هست ─── */}
          <div className="px-4 py-3">
            <Button
              onClick={handleSync}
              disabled={isSyncing || !isOnline}
              className={`w-full h-9 text-sm font-medium gap-2 rounded-lg ${
                !isOnline
                  ? 'bg-gray-200 text-gray-400 hover:bg-gray-200 cursor-not-allowed'
                  : pendingSyncCount > 0
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  در حال همگام‌سازی...
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  بدون اتصال اینترنت
                </>
              ) : pendingSyncCount > 0 ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  همگام‌سازی {pendingSyncCount} تغییر
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  بارگذاری مجدد داده‌ها
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * بنر آفلاین — نوار بالای صفحه هنگام قطع اتصال
 */
export function OfflineBanner() {
  const isOnline = useStore((s) => s.isOnline)
  const pendingSyncCount = useStore((s) => s.pendingSyncCount)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    if (isSyncing || !isOnline) return
    setIsSyncing(true)
    try {
      if (pendingSyncCount > 0) {
        await syncEngine.sync()
      } else {
        await syncEngine.preloadData()
      }
      const count = await getSyncQueueCount()
      useStore.getState().setPendingSyncCount(count)
    } catch {
      // ignore
    } finally {
      setIsSyncing(false)
    }
  }

  if (isOnline && pendingSyncCount === 0) return null

  if (!isOnline) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center justify-center gap-2 text-xs text-amber-700">
        <CloudOff className="w-3.5 h-3.5" />
        <span className="font-medium">اتصال اینترنت قطع است — تغییرات شما ذخیره و پس از اتصال همگام‌سازی خواهند شد</span>
      </div>
    )
  }

  if (pendingSyncCount > 0) {
    return (
      <div className="bg-orange-50 border-b border-orange-200 px-3 py-1.5 flex items-center justify-center gap-2 text-xs text-orange-700">
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        <span className="font-medium">{pendingSyncCount} تغییر همگام‌نشده</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="h-6 text-[10px] px-2 border-orange-300 text-orange-700 hover:bg-orange-100"
        >
          {isSyncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی'}
        </Button>
      </div>
    )
  }

  return null
}
