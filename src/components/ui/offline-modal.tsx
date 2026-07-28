'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { AlertCircle, RefreshCw, Wifi, WifiOff, Clock, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function OfflineModal() {
  const [isOpen, setIsOpen] = useState(false)
  const isOnline = useAppStore((s) => s.isOnline)
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount) ?? 0
  const syncInfo = useAppStore((s) => s.syncInfo)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await useAppStore.getState().startSync()
      useAppStore.getState().addNotification({
        title: '✅ همگام‌سازی انجام شد',
        message: 'تمام تغییرات با سرور همگام شدند',
        type: 'success',
      })
    } catch (err: any) {
      useAppStore.getState().addNotification({
        title: '❌ خطا در همگام‌سازی',
        message: err?.message || 'لطفاً دوباره تلاش کنید',
        type: 'error',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const statusColor = isOnline ? 'text-emerald-600' : 'text-red-600'
  const statusBg = isOnline ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
  const statusLabel = isOnline ? 'آنلاین' : 'آفلاین'

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer hover:shadow-md ${statusBg}`}
        title={isOnline ? 'اتصال برقرار' : 'بدون اتصال — کلیک برای جزئیات'}
      >
        {isOnline ? (
          <Wifi className={`w-4 h-4 ${statusColor}`} />
        ) : (
          <WifiOff className={`w-4 h-4 ${statusColor} animate-pulse`} />
        )}
        <span className={`text-xs font-medium ${statusColor} hidden sm:inline`}>{statusLabel}</span>
        {pendingSyncCount > 0 && (
          <Badge className={`ml-1 text-[9px] ${isOnline ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {pendingSyncCount}
          </Badge>
        )}
      </button>

      {/* Modal Overlay — z-index: 9998 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
          style={{ zIndex: 9998 }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Modal Container — z-index: 9999 */}
      {isOpen && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] sm:w-[400px] max-h-[80vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-200 animate-fade-in-up"
          style={{ zIndex: 9999 }}
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between rounded-t-xl">
            <div className="flex items-center gap-3">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-emerald-600" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-600 animate-pulse" />
              )}
              <h2 className="font-bold text-gray-900">وضعیت اتصال</h2>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Status Card */}
            <div className={`p-4 rounded-lg border ${statusBg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-900 text-sm">وضعیت اتصال</span>
                <Badge className={isOnline ? 'bg-emerald-600 text-white text-xs' : 'bg-red-600 text-white text-xs'}>
                  {statusLabel}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                {isOnline
                  ? '✅ اتصال اینترنت برقرار است. سیستم عادی کار می‌کند.'
                  : '⚠️ اتصال اینترنت قطع شده است. تغییرات ذخیره و پس از برقراری اتصال همگام‌سازی می‌شوند.'}
              </p>
            </div>

            {/* Sync Status Card */}
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">وضعیت همگام‌سازی</h3>

              <div className="space-y-2.5 text-xs sm:text-sm">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">حالت:</span>
                  <Badge className={`text-[10px] sm:text-[11px] ${
                    syncInfo.status === 'synced' ? 'bg-emerald-100 text-emerald-700' :
                    syncInfo.status === 'syncing' ? 'bg-blue-100 text-blue-700' :
                    syncInfo.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    syncInfo.status === 'offline' ? 'bg-gray-100 text-gray-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {syncInfo.status === 'synced' && '✅ همگام'}
                    {syncInfo.status === 'syncing' && '⟳ درحال همگام‌سازی'}
                    {syncInfo.status === 'pending' && '⏳ صف‌دار'}
                    {syncInfo.status === 'offline' && '📡 آفلاین'}
                    {syncInfo.status === 'error' && '❌ خطا'}
                  </Badge>
                </div>

                {/* Pending Count */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">تغییرات صف‌دار:</span>
                  <span className="font-bold">
                    {pendingSyncCount > 0 ? (
                      <span className="text-amber-600">{pendingSyncCount} مورد</span>
                    ) : (
                      <span className="text-emerald-600">هیچی</span>
                    )}
                  </span>
                </div>

                {/* Last Sync */}
                {syncInfo.lastSyncAt && (
                  <div className="flex items-start justify-between pt-2 border-t border-gray-300">
                    <span className="text-gray-600">آخرین همگام:</span>
                    <span className="text-[11px] text-gray-500 text-left">
                      {new Date(syncInfo.lastSyncAt).toLocaleString('fa-IR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}

                {/* Error Message */}
                {syncInfo.lastError && (
                  <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs leading-relaxed">
                    <span className="font-semibold block mb-1">خطا:</span>
                    {syncInfo.lastError}
                  </div>
                )}
              </div>
            </div>

            {/* Sync Now Button */}
            {isOnline && pendingSyncCount > 0 && (
              <Button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-9"
              >
                <RefreshCw className={`w-4 h-4 ml-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'درحال همگام‌سازی...' : 'همگام‌سازی فوری'}
              </Button>
            )}

            {/* Info Box */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 space-y-1">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1.5">نکات مهم:</p>
                  <ul className="space-y-1 text-[11px]">
                    <li>✓ تغییرات آفلاین ذخیره‌شده در کش محلی</li>
                    <li>✓ پس از برقراری اتصال خودکار همگام می‌شود</li>
                    <li>✓ بدون نیاز به دوبارہ ورود</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Footer - Close Button */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-3 rounded-b-xl">
            <Button
              onClick={() => setIsOpen(false)}
              variant="outline"
              className="w-full h-9"
            >
              بستن
            </Button>
          </div>
        </div>
      )}
    </>
  )
}