/**
 * Sync Engine — ShopAccounting v5.1
 *
 * موتور همگام‌سازی آفلاین/آنلاین
 * ارسال صف همگام‌سازی به سرور هنگام اتصال
 *
 * ★ v5.1: بروزرسانی pendingSyncCount در store بعد از هر همگام‌سازی
 *
 * فایل: src/lib/sync-engine.ts
 */

import {
  getSyncQueue,
  removeFromSyncQueue,
  updateSyncQueueItem,
  cacheProducts,
  cacheCustomers,
  cacheCategories,
  cacheInvoices,
  markInvoiceSynced,
  clearAllCache,
  setLastSyncTimestamp,
  getLastSyncTimestamp,
  updateCachedProductStock,
  isOfflineId,
  isOfflineInvoiceNumber,
  type SyncQueueItem,
} from '@/lib/offline-db'
import { useAppStore } from '@/lib/store'

// ═══════════════════════════════════════════════════════════════
// تایپ‌ها
// ═══════════════════════════════════════════════════════════════

export interface SyncResult {
  processed: number
  succeeded: number
  failed: number
  errors: string[]
}

// ═══════════════════════════════════════════════════════════════
// کلاس SyncEngine
// ═══════════════════════════════════════════════════════════════

class SyncEngineClass {
  private isRunning = false
  private maxRetries = 3

  /**
   * اجرای همگام‌سازی — ارسال تمام آیتم‌های صف به سرور
   */
  async sync(): Promise<SyncResult> {
    if (this.isRunning) {
      return { processed: 0, succeeded: 0, failed: 0, errors: ['همگام‌سازی قبلی هنوز در حال اجراست'] }
    }

    this.isRunning = true
    const result: SyncResult = { processed: 0, succeeded: 0, failed: 0, errors: [] }

    try {
      const queue = await getSyncQueue()

      for (const item of queue) {
        result.processed++

        try {
          const success = await this.processItem(item)
          if (success) {
            await removeFromSyncQueue(item.id)
            result.succeeded++
          } else {
            await updateSyncQueueItem(item.id, {
              retryCount: item.retryCount + 1,
              lastError: 'خطای ناشناخته',
            })
            result.failed++
          }
        } catch (error: any) {
          await updateSyncQueueItem(item.id, {
            retryCount: item.retryCount + 1,
            lastError: error.message || 'خطای شبکه',
          })
          result.failed++
          result.errors.push(`${item.type}: ${error.message || 'خطای شبکه'}`)
        }
      }

      if (result.succeeded > 0) {
        await setLastSyncTimestamp(Date.now())
      }

      // ★ بروزرسانی تعداد آیتم‌های در صف در store
      try {
        const { getSyncQueueCount } = await import('@/lib/offline-db')
        const remainingCount = await getSyncQueueCount()
        useAppStore.getState().setPendingSyncCount(remainingCount)
      } catch { /* ignore */ }
    } finally {
      this.isRunning = false
    }

    return result
  }

  /**
   * پردازش یک آیتم از صف
   */
  private async processItem(item: SyncQueueItem): Promise<boolean> {
    if (item.retryCount >= this.maxRetries) {
      return false
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body,
      })

      if (response.ok) {
        return true
      }

      return false
    } catch {
      return false
    }
  }

  /**
   * پیش‌بارگذاری داده‌ها از سرور و ذخیره در کش
   */
  async preloadData(): Promise<void> {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (!token) return

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }

      try {
        const res = await fetch('/api/products', { headers })
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            await cacheProducts(data.data)
          }
        }
      } catch { /* ignore */ }

      try {
        const res = await fetch('/api/customers', { headers })
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            await cacheCustomers(data.data)
          }
        }
      } catch { /* ignore */ }

      try {
        const res = await fetch('/api/categories', { headers })
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            await cacheCategories(data.data)
          }
        }
      } catch { /* ignore */ }

      try {
        const res = await fetch('/api/invoices', { headers })
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            await cacheInvoices(data.data)
          }
        }
      } catch { /* ignore */ }

      await setLastSyncTimestamp(Date.now())
    } catch {
      // خطا در پیش‌بارگذاری
    }
  }

  /**
   * بررسی وضعیت همگام‌سازی
   */
  async getStatus(): Promise<{
    lastSync: number | null
    pendingCount: number
  }> {
    const lastSync = await getLastSyncTimestamp()
    const { getSyncQueueCount } = await import('@/lib/offline-db')
    const pendingCount = await getSyncQueueCount()
    return { lastSync, pendingCount }
  }

  /**
   * پاکسازی کامل
   */
  async reset(): Promise<void> {
    await clearAllCache()
    // ★ بروزرسانی store بعد از پاکسازی
    useAppStore.getState().setPendingSyncCount(0)
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const syncEngine = new SyncEngineClass()
