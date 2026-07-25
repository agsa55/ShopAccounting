'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── Offline Indicator (هدر) ─────────────────────────────────

export function OfflineIndicator() {
  const isOnline = useAppStore((s) => s.isOnline)
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount) ?? 0 // ★ fallback امن
  const setOnline = useAppStore((s) => s.setOnline)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    // ★ وضعیت اولیه واقعی از مرورگر
    setOnline(navigator.onLine)

    const onOnline = () => {
      console.log('[OfflineIndicator] 🟢 آنلاین')
      setOnline(true)
    }
    const onOffline = () => {
      console.log('[OfflineIndicator] 🔴 آفلاین')
      setOnline(false)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [setOnline])

  const handleSync = async () => {
    if (!isOnline || isSyncing) return
    setIsSyncing(true)
    try {
      const { syncEngine } = await import('@/lib/sync-engine')
      const result = await syncEngine.sync()
      if (result.succeeded > 0) {
        useAppStore.getState().addNotification({
          title: '✅ همگام‌سازی موفق',
          message: `${result.succeeded} مورد با سرور همگام شد`,
          type: 'success',
        })
      }
    } catch (err) {
      console.error('[OfflineIndicator] sync error:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  // ★★★ اصلاح اصلی: اول از همه صراحتاً وضعیت آفلاین چک می‌شود ★★★
  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 text-red-600 bg-red-50 border border-red-300 rounded-full px-2.5 py-1 animate-pulse"
        title="آفلاین — بدون اتصال اینترنت"
      >
        <WifiOff className="w-4 h-4 shrink-0" />
        <span className="text-xs font-semibold hidden md:inline">آفلاین</span>
        {pendingSyncCount > 0 && (
          <Badge className="bg-red-600 text-white text-[9px] px-1.5 leading-none">
            {pendingSyncCount}
          </Badge>
        )}
      </div>
    )
  }

  // آنلاین + صف دارد
  if (pendingSyncCount > 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSync}
        disabled={isSyncing}
        className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700 h-8 px-2"
      >
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        <span className="text-xs hidden md:inline">
          {isSyncing ? 'همگام‌سازی...' : `صف (${pendingSyncCount})`}
        </span>
        <Badge className="bg-amber-100 text-amber-700 text-[9px] px-1 md:hidden">
          {pendingSyncCount}
        </Badge>
      </Button>
    )
  }

  // آنلاین + بدون صف
  return (
    <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
      <Wifi className="w-4 h-4 shrink-0" />
      <span className="text-xs font-medium hidden md:inline">آنلاین</span>
    </div>
  )
}

// ─── Offline Banner (بالای صفحه) — بدون تغییر ───────────────

export function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline)
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount) ?? 0
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isOnline) setDismissed(false)
  }, [isOnline])

  if (isOnline || dismissed) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            اتصال اینترنت برقرار نیست
          </p>
          <p className="text-xs text-amber-700 truncate">
            تغییرات ذخیره و پس از اتصال همگام‌سازی می‌شوند
            {pendingSyncCount > 0 && ` — ${pendingSyncCount} مورد در صف`}
          </p>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-500 hover:text-amber-800 shrink-0 text-lg leading-none"
        aria-label="بستن"
      >
        ✕
      </button>
    </div>
  )
}