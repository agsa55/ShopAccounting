/**
 * Sync Engine — ShopAccounting v5.3
 *
 * موتور همگام‌سازی آفلاین/آنلاین
 * ارسال صف همگام‌سازی به سرور هنگام اتصال
 *
 * ★ v5.3: اصلاح preloadData — واکشی صحیح محصولات، مشتریان، دسته‌بندی‌ها، انبارها و فاکتورها
 *         + اضافه شدن cache انبارها برای POS آفلاین
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
  cacheInvoicesPage,
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
  private initialized = false
  private syncInterval: NodeJS.Timeout | null = null

  /**
   * راه‌اندازی اولیه موتور همگام‌سازی
   * ★ v5.2: متد جدید برای PWA
   */
  init(): void {
    if (this.initialized) {
      console.log('[SyncEngine] Already initialized')
      return
    }

    this.initialized = true
    console.log('[SyncEngine] Initialized')

    // همگام‌سازی خودکار هر 5 دقیقه
    if (typeof window !== 'undefined') {
      this.syncInterval = setInterval(() => {
        if (navigator.onLine) {
          this.sync().catch(() => {})
        }
      }, 5 * 60 * 1000)

      // همگام‌سازی وقتی آنلاین می‌شویم
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Device is online, syncing...')
        this.sync().catch(() => {})
      })
    }
  }

  /**
   * توقف موتور همگام‌سازی
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.initialized = false
    console.log('[SyncEngine] Stopped')
  }

  /**
   * اجرای همگام‌سازی — ارسال تمام آیتم‌های صف به سرور
   */
  async sync(): Promise<SyncResult> {
    if (this.isRunning) {
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: ['همگام‌سازی قبلی هنوز در حال اجراست'],
      }
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
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null

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

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * ★ v5.3: ذخیره انبارها در IndexedDB (meta store)
   */
  private async cacheWarehouses(warehouses: any[]): Promise<void> {
    try {
      const offlineDb = await import('@/lib/offline-db')
      await offlineDb.cacheWarehousesMeta(warehouses)
    } catch (err) {
      console.warn('[SyncEngine] ⚠️ Cache warehouses error:', err)
    }
  }

  /**
   * پیش‌بارگذاری داده‌ها از سرور و ذخیره در کش
   * ★ v5.3: اصلاح کامل — واکشی صحیح همه داده‌ها برای آفلاین
   */
  async preloadData(tenantId?: string): Promise<void> {
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null

      if (!token) {
        console.warn('[SyncEngine] No token — preload skipped')
        return
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }

      const tid = tenantId || useAppStore.getState().tenantId || ''
      const tidParam = tid ? `&tenantId=${tid}` : ''

      console.log('[SyncEngine] 🔄 Preloading data for offline use...')

      // ── ۱. محصولات (همه، بدون pagination) ──────────────────────
      try {
        const res = await fetch(
          `/api/products?page=1&limit=1000&sort=recent${tidParam}`,
          { headers }
        )
        if (res.ok) {
          const data = await res.json()
          // ★ ساختار صحیح: data.data آرایه محصولاته
          const products = Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.data?.products)
              ? data.data.products
              : []
          if (products.length > 0) {
            await cacheProducts(products)
            console.log(`[SyncEngine] ✅ ${products.length} محصول cached`)
          }
        }
      } catch (err) {
        console.warn('[SyncEngine] ⚠️ Products preload failed:', err)
      }

      // ── ۲. مشتریان ──────────────────────────────────────────────
      try {
        const res = await fetch(
          `/api/customers?limit=500${tidParam}`,
          { headers }
        )
        if (res.ok) {
          const data = await res.json()
          const customers = Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.data?.customers)
              ? data.data.customers
              : []
          if (customers.length > 0) {
            await cacheCustomers(customers)
            console.log(`[SyncEngine] ✅ ${customers.length} مشتری cached`)
          }
        }
      } catch (err) {
        console.warn('[SyncEngine] ⚠️ Customers preload failed:', err)
      }

      // ── ۳. دسته‌بندی‌ها ─────────────────────────────────────────
      try {
        const res = await fetch(
          `/api/categories?tenantId=${tid}`,
          { headers }
        )
        if (res.ok) {
          const data = await res.json()
          // ★ ساختار: data.data یا data.data.categories
          const categories = Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.data?.categories)
              ? data.data.categories
              : []
          if (categories.length > 0) {
            await cacheCategories(categories)
            console.log(`[SyncEngine] ✅ ${categories.length} دسته‌بندی cached`)
          }
        }
      } catch (err) {
        console.warn('[SyncEngine] ⚠️ Categories preload failed:', err)
      }

      // ── ۴. انبارها (برای POS) ───────────────────────────────────
      try {
        const res = await fetch(
          `/api/warehouses?tenantId=${tid}`,
          { headers }
        )
        if (res.ok) {
          const data = await res.json()
          const warehouses = Array.isArray(data.data)
            ? data.data
            : []
          if (warehouses.length > 0) {
            await this.cacheWarehouses(warehouses)
            console.log(`[SyncEngine] ✅ ${warehouses.length} انبار cached`)
          }
        }
      } catch (err) {
        console.warn('[SyncEngine] ⚠️ Warehouses preload failed:', err)
      }

      // ── ۵. فاکتورهای فروش (صفحه اول) ───────────────────────────
      try {
        const res = await fetch(
          `/api/invoices?page=1&limit=50${tidParam}`,
          { headers }
        )
        if (res.ok) {
          const data = await res.json()
          const invoices = Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.data?.invoices)
              ? data.data.invoices
              : []
          const totalPages = data.totalPages || data.data?.totalPages || 1
          const total = data.total || data.data?.total || invoices.length

          if (invoices.length > 0) {
            // ذخیره در invoices store (برای جستجو)
            await cacheInvoices(invoices)
            // ذخیره در meta store (برای صفحه‌بندی)
            await cacheInvoicesPage(invoices, totalPages, total, 'all', 1)
            console.log(`[SyncEngine] ✅ ${invoices.length} فاکتور cached`)
          }
        }
      } catch (err) {
        console.warn('[SyncEngine] ⚠️ Invoices preload failed:', err)
      }

      await setLastSyncTimestamp(Date.now())
      console.log('[SyncEngine] ✅ Preload completed')

    } catch (err) {
      console.warn('[SyncEngine] ⚠️ Preload failed:', err)
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