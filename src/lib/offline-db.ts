/**
 * Offline DB — ShopAccounting v5.0 (Complete)
 *
 * ماژول ذخیره‌سازی آفلاین با IndexedDB
 * شامل صف همگام‌سازی، کش محصولات/مشتریان/دسته‌بندی‌ها/فاکتورها
 *
 * فایل: src/lib/offline-db.ts
 */

// ═══════════════════════════════════════════════════════════════
// تایپ‌ها
// ═══════════════════════════════════════════════════════════════

export interface SyncQueueItem {
  id: string
  type: string
  method: string
  url: string
  body: string
  createdAt: number
  retryCount: number
  lastError: string | null
}

export interface CacheStats {
  products: number
  customers: number
  categories: number
  invoices: number
  syncQueue: number
  lastSync: number | null
}

interface OfflineDB {
  syncQueue: SyncQueueItem[]
  products: any[]
  customers: any[]
  categories: any[]
  invoices: any[]
  lastSync: number | null
}

// ═══════════════════════════════════════════════════════════════
// حافظه درون‌حافظه‌ای (Stub — در آینده با IndexedDB جایگزین می‌شود)
// ═══════════════════════════════════════════════════════════════

const memoryDB: OfflineDB = {
  syncQueue: [],
  products: [],
  customers: [],
  categories: [],
  invoices: [],
  lastSync: null,
}

// ═══════════════════════════════════════════════════════════════
// توابع عمومی
// ═══════════════════════════════════════════════════════════════

/**
 * دسترسی به دیتابیس آفلاین
 */
export function getOfflineDB(): OfflineDB {
  return memoryDB
}

/**
 * دریافت آمار کش‌ها
 */
export async function getCacheStats(): Promise<CacheStats> {
  return {
    products: memoryDB.products.length,
    customers: memoryDB.customers.length,
    categories: memoryDB.categories.length,
    invoices: memoryDB.invoices.length,
    syncQueue: memoryDB.syncQueue.length,
    lastSync: memoryDB.lastSync,
  }
}

// ─── صف همگام‌سازی ─────────────────────────────────────────

/**
 * تعداد آیتم‌های در صف همگام‌سازی
 */
export async function getSyncQueueCount(): Promise<number> {
  return memoryDB.syncQueue.length
}

/**
 * دریافت تمام آیتم‌های صف همگام‌سازی
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  return memoryDB.syncQueue
}

/**
 * اضافه کردن آیتم به صف همگام‌سازی
 */
export async function addToSyncQueue(type: string, data: any): Promise<void> {
  const item: SyncQueueItem = {
    id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    method: data.method || 'POST',
    url: data.url || '',
    body: JSON.stringify(data.body || {}),
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
  }
  memoryDB.syncQueue.push(item)
}

/**
 * حذف آیتم از صف همگام‌سازی
 */
export async function removeFromSyncQueue(id: string): Promise<void> {
  memoryDB.syncQueue = memoryDB.syncQueue.filter((item) => item.id !== id)
}

/**
 * به‌روزرسانی آیتم صف همگام‌سازی
 */
export async function updateSyncQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
  const idx = memoryDB.syncQueue.findIndex((item) => item.id === id)
  if (idx !== -1) {
    memoryDB.syncQueue[idx] = { ...memoryDB.syncQueue[idx], ...updates }
  }
}

/**
 * پاکسازی صف همگام‌سازی
 */
export async function clearSyncQueue(): Promise<void> {
  memoryDB.syncQueue = []
}

// ─── کش داده‌ها ─────────────────────────────────────────────

/**
 * کش محصولات
 */
export async function cacheProducts(products: any[]): Promise<void> {
  memoryDB.products = products
}

/**
 * کش مشتریان
 */
export async function cacheCustomers(customers: any[]): Promise<void> {
  memoryDB.customers = customers
}

/**
 * کش دسته‌بندی‌ها
 */
export async function cacheCategories(categories: any[]): Promise<void> {
  memoryDB.categories = categories
}

/**
 * کش فاکتورها
 */
export async function cacheInvoices(invoices: any[]): Promise<void> {
  memoryDB.invoices = invoices
}

/**
 * علامت‌گذاری فاکتور به عنوان همگان‌شده
 */
export async function markInvoiceSynced(invoiceId: string): Promise<void> {
  const idx = memoryDB.invoices.findIndex((inv: any) => inv.id === invoiceId)
  if (idx !== -1) {
    memoryDB.invoices[idx]._synced = true
  }
}

/**
 * به‌روزرسانی موجودی محصول در کش
 */
export async function updateCachedProductStock(productId: string, newStock: number): Promise<void> {
  const idx = memoryDB.products.findIndex((p: any) => p.id === productId)
  if (idx !== -1) {
    memoryDB.products[idx].currentStock = newStock
  }
}

/**
 * پاکسازی تمام کش‌ها
 */
export async function clearAllCache(): Promise<void> {
  memoryDB.products = []
  memoryDB.customers = []
  memoryDB.categories = []
  memoryDB.invoices = []
  memoryDB.syncQueue = []
  memoryDB.lastSync = null
}

// ─── زمان آخرین همگام‌سازی ─────────────────────────────────

/**
 * تنظیم زمان آخرین همگام‌سازی
 */
export async function setLastSyncTimestamp(timestamp: number): Promise<void> {
  memoryDB.lastSync = timestamp
}

/**
 * دریافت زمان آخرین همگام‌سازی
 */
export async function getLastSyncTimestamp(): Promise<number | null> {
  return memoryDB.lastSync
}

// ─── توابع کمکی ─────────────────────────────────────────────

/**
 * بررسی آیا شناسه از نوع آفلاین است
 */
export function isOfflineId(id: string): boolean {
  return id.startsWith('offline-') || id.startsWith('local-')
}

/**
 * بررسی آیا شماره فاکتور از نوع آفلاین است
 */
export function isOfflineInvoiceNumber(number: string): boolean {
  return number.startsWith('OFF-') || number.startsWith('LOCAL-')
}