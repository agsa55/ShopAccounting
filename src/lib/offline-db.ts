'use client'

/**
 * Offline DB — ShopAccounting v6.2
 * ذخیره‌سازی واقعی با IndexedDB (پایدار بین session‌ها)
 * ★ v6.1: اضافه شدن cache پلن و فاکتورها
 * ★ v6.2: اضافه شدن cache انبارها برای POS آفلاین
 * ★ v6.3: اضافه شدن cache اقساط و طرح‌های قسطی
 */

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
  installmentPlans: number
  installmentSchedules: number
  syncQueue: number
  lastSync: number | null
}

// ─── IndexedDB Setup ────────────────────────────────────────────

const DB_NAME = 'ShopAccountingOffline'
const DB_VERSION = 2 // ★ v6.3: افزایش نسخه برای اقساط
const STORES = {
  syncQueue: 'syncQueue',
  products: 'products',
  customers: 'customers',
  categories: 'categories',
  invoices: 'invoices',
  installmentPlans: 'installmentPlans', // ★ v6.3: جدید
  installmentSchedules: 'installmentSchedules', // ★ v6.3: جدید
  meta: 'meta',
} as const

let _db: IDBDatabase | null = null

async function getDB(): Promise<IDBDatabase> {
  if (_db) return _db

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB فقط در مرورگر در دسترس است'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // syncQueue store
      if (!db.objectStoreNames.contains(STORES.syncQueue)) {
        const store = db.createObjectStore(STORES.syncQueue, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('type', 'type')
      }

      // products store
      if (!db.objectStoreNames.contains(STORES.products)) {
        const store = db.createObjectStore(STORES.products, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
        store.createIndex('name', 'name')
      }

      // customers store
      if (!db.objectStoreNames.contains(STORES.customers)) {
        const store = db.createObjectStore(STORES.customers, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
      }

      // categories store
      if (!db.objectStoreNames.contains(STORES.categories)) {
        db.createObjectStore(STORES.categories, { keyPath: 'id' })
      }

      // invoices store
      if (!db.objectStoreNames.contains(STORES.invoices)) {
        const store = db.createObjectStore(STORES.invoices, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
        store.createIndex('status', 'status')
      }

      // ★ v6.3: installmentPlans store
      if (!db.objectStoreNames.contains(STORES.installmentPlans)) {
        const store = db.createObjectStore(STORES.installmentPlans, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
        store.createIndex('status', 'status')
      }

      // ★ v6.3: installmentSchedules store
      if (!db.objectStoreNames.contains(STORES.installmentSchedules)) {
        const store = db.createObjectStore(STORES.installmentSchedules, { keyPath: 'id' })
        store.createIndex('planId', 'planId')
        store.createIndex('status', 'status')
      }

      // meta store (برای lastSync، plan، warehouses و غیره)
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' })
      }
    }

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result
      resolve(_db)
    }

    request.onerror = (event) => {
      console.error('[OfflineDB] خطا در باز کردن IndexedDB:', event)
      reject(new Error('خطا در باز کردن IndexedDB'))
    }
  })
}

// ─── Helper: IDB Transaction ─────────────────────────────────────

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(storeName: string, value: any): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.put(value)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbClear(storeName: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbCount(storeName: string): Promise<number> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── Sync Queue ──────────────────────────────────────────────────

export async function getSyncQueueCount(): Promise<number> {
  try {
    return await idbCount(STORES.syncQueue)
  } catch {
    return 0
  }
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    return await idbGetAll<SyncQueueItem>(STORES.syncQueue)
  } catch {
    return []
  }
}

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
  await idbPut(STORES.syncQueue, item)
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  await idbDelete(STORES.syncQueue, id)
}

export async function updateSyncQueueItem(
  id: string,
  updates: Partial<SyncQueueItem>
): Promise<void> {
  try {
    const existing = await idbGet<SyncQueueItem>(STORES.syncQueue, id)
    if (existing) {
      await idbPut(STORES.syncQueue, { ...existing, ...updates })
    }
  } catch (err) {
    console.error('[OfflineDB] updateSyncQueueItem error:', err)
  }
}

export async function clearSyncQueue(): Promise<void> {
  await idbClear(STORES.syncQueue)
}

// ─── Cache: Products ─────────────────────────────────────────────

export async function cacheProducts(products: any[]): Promise<void> {
  try {
    await idbClear(STORES.products)
    for (const p of products) {
      await idbPut(STORES.products, p)
    }
  } catch (err) {
    console.error('[OfflineDB] cacheProducts error:', err)
  }
}

export async function getCachedProducts(): Promise<any[]> {
  try {
    return await idbGetAll(STORES.products)
  } catch {
    return []
  }
}

export async function updateCachedProductStock(
  productId: string,
  newStock: number
): Promise<void> {
  try {
    const product = await idbGet<any>(STORES.products, productId)
    if (product) {
      await idbPut(STORES.products, { ...product, currentStock: newStock })
    }
  } catch (err) {
    console.error('[OfflineDB] updateCachedProductStock error:', err)
  }
}

// ─── Cache: Customers ────────────────────────────────────────────

export async function cacheCustomers(customers: any[]): Promise<void> {
  try {
    await idbClear(STORES.customers)
    for (const c of customers) {
      await idbPut(STORES.customers, c)
    }
  } catch (err) {
    console.error('[OfflineDB] cacheCustomers error:', err)
  }
}

export async function getCachedCustomers(): Promise<any[]> {
  try {
    return await idbGetAll(STORES.customers)
  } catch {
    return []
  }
}

// ─── Cache: Categories ───────────────────────────────────────────

export async function cacheCategories(categories: any[]): Promise<void> {
  try {
    await idbClear(STORES.categories)
    for (const c of categories) {
      await idbPut(STORES.categories, c)
    }
  } catch (err) {
    console.error('[OfflineDB] cacheCategories error:', err)
  }
}

export async function getCachedCategories(): Promise<any[]> {
  try {
    return await idbGetAll(STORES.categories)
  } catch {
    return []
  }
}

// ─── Cache: Invoices ─────────────────────────────────────────────

export async function cacheInvoices(invoices: any[]): Promise<void> {
  try {
    await idbClear(STORES.invoices)
    for (const inv of invoices) {
      await idbPut(STORES.invoices, inv)
    }
  } catch (err) {
    console.error('[OfflineDB] cacheInvoices error:', err)
  }
}

export async function getCachedInvoices(): Promise<any[]> {
  try {
    return await idbGetAll(STORES.invoices)
  } catch {
    return []
  }
}

export async function markInvoiceSynced(invoiceId: string): Promise<void> {
  try {
    const invoice = await idbGet<any>(STORES.invoices, invoiceId)
    if (invoice) {
      await idbPut(STORES.invoices, { ...invoice, _synced: true })
    }
  } catch (err) {
    console.error('[OfflineDB] markInvoiceSynced error:', err)
  }
}

// ─── ★ v6.3: Cache Installment Plans ──────────────────────────────

export async function cacheInstallmentPlans(plans: any[]): Promise<void> {
  try {
    await idbClear(STORES.installmentPlans)
    for (const plan of plans) {
      await idbPut(STORES.installmentPlans, plan)
    }
    // fallback localStorage
    localStorage.setItem('cached_installment_plans', JSON.stringify({
      plans,
      cachedAt: new Date().toISOString(),
    }))
    console.log(`[OfflineDB] ✅ ${plans.length} طرح قسطی cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheInstallmentPlans error:', err)
    try {
      localStorage.setItem('cached_installment_plans', JSON.stringify({
        plans,
        cachedAt: new Date().toISOString(),
      }))
    } catch {}
  }
}

export async function getCachedInstallmentPlans(): Promise<any[]> {
  try {
    // ۱. IndexedDB
    const plans = await idbGetAll<any>(STORES.installmentPlans)
    if (plans.length > 0) {
      console.log('[OfflineDB] Installment plans loaded from IndexedDB')
      return plans
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading plans from IndexedDB:', err)
  }

  // ۲. localStorage fallback
  try {
    const cached = localStorage.getItem('cached_installment_plans')
    if (cached) {
      const data = JSON.parse(cached)
      console.log('[OfflineDB] Installment plans loaded from localStorage')
      return data.plans || []
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading plans from localStorage:', err)
  }

  return []
}

// ─── ★ v6.3: Cache Installment Schedules ──────────────────────────

export async function cacheInstallmentSchedules(schedules: any[]): Promise<void> {
  try {
    await idbClear(STORES.installmentSchedules)
    for (const schedule of schedules) {
      await idbPut(STORES.installmentSchedules, schedule)
    }
    // fallback localStorage
    localStorage.setItem('cached_installment_schedules', JSON.stringify({
      schedules,
      cachedAt: new Date().toISOString(),
    }))
    console.log(`[OfflineDB] ✅ ${schedules.length} قسط cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheInstallmentSchedules error:', err)
    try {
      localStorage.setItem('cached_installment_schedules', JSON.stringify({
        schedules,
        cachedAt: new Date().toISOString(),
      }))
    } catch {}
  }
}

export async function getCachedInstallmentSchedules(): Promise<any[]> {
  try {
    // ۱. IndexedDB
    const schedules = await idbGetAll<any>(STORES.installmentSchedules)
    if (schedules.length > 0) {
      console.log('[OfflineDB] Schedules loaded from IndexedDB')
      return schedules
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading schedules from IndexedDB:', err)
  }

  // ۲. localStorage fallback
  try {
    const cached = localStorage.getItem('cached_installment_schedules')
    if (cached) {
      const data = JSON.parse(cached)
      console.log('[OfflineDB] Schedules loaded from localStorage')
      return data.schedules || []
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading schedules from localStorage:', err)
  }

  return []
}

// ─── ★ v6.3: Cache Installment Summary ────────────────────────────

export interface CachedInstallmentSummary {
  totalPlans: number
  activePlans: number
  completedPlans: number
  overduePlans: number
  totalRemaining: number
  totalOverdueInstallments: number
  cachedAt: string
}

export async function cacheInstallmentSummary(summary: CachedInstallmentSummary): Promise<void> {
  try {
    await idbPut(STORES.meta, { key: 'installment_summary', value: summary })
    localStorage.setItem('cached_installment_summary', JSON.stringify(summary))
    console.log('[OfflineDB] ✅ Installment summary cached')
  } catch (err) {
    console.error('[OfflineDB] cacheInstallmentSummary error:', err)
    try {
      localStorage.setItem('cached_installment_summary', JSON.stringify(summary))
    } catch {}
  }
}

export async function getCachedInstallmentSummary(): Promise<CachedInstallmentSummary | null> {
  try {
    // ۱. IndexedDB
    const record = await idbGet<{ key: string; value: CachedInstallmentSummary }>(STORES.meta, 'installment_summary')
    if (record?.value) {
      console.log('[OfflineDB] Summary loaded from IndexedDB')
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading summary from IndexedDB:', err)
  }

  // ۲. localStorage fallback
  try {
    const cached = localStorage.getItem('cached_installment_summary')
    if (cached) {
      const data = JSON.parse(cached)
      console.log('[OfflineDB] Summary loaded from localStorage')
      return data
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading summary from localStorage:', err)
  }

  return null
}

// ─── ★ v6.1: Cache Plan ──────────────────────────────────────────

export interface CachedPlanData {
  planName: string
  daysRemaining: number
  isExpired: boolean
  cached_at: number
}

export async function cachePlan(planData: CachedPlanData): Promise<void> {
  try {
    // ۱. ذخیره در IndexedDB
    await idbPut(STORES.meta, { key: 'plan', value: planData })
    console.log('[OfflineDB] ✅ Plan cached:', planData.planName)

    // ۲. ذخیره هم در localStorage برای fallback
    localStorage.setItem('cached_plan', JSON.stringify(planData))
  } catch (err) {
    console.error('[OfflineDB] cachePlan error:', err)
    // اگه IndexedDB fail شد، حداقل localStorage رو تلاش کن
    try {
      localStorage.setItem('cached_plan', JSON.stringify(planData))
    } catch {}
  }
}

export async function getCachedPlan(): Promise<CachedPlanData | null> {
  try {
    // ۱. سعی از IndexedDB
    const record = await idbGet<{ key: string; value: CachedPlanData }>(STORES.meta, 'plan')
    if (record?.value) {
      console.log('[OfflineDB] Plan loaded from IndexedDB:', record.value.planName)
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading plan from IndexedDB:', err)
  }

  // ۲. Fallback به localStorage
  try {
    const cached = localStorage.getItem('cached_plan')
    if (cached) {
      const planData = JSON.parse(cached)
      console.log('[OfflineDB] Plan loaded from localStorage:', planData.planName)
      return planData
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading plan from localStorage:', err)
  }

  return null
}

export async function clearCachedPlan(): Promise<void> {
  try {
    // ۱. حذف از IndexedDB
    await idbDelete(STORES.meta, 'plan')
  } catch (err) {
    console.warn('[OfflineDB] Error deleting plan from IndexedDB:', err)
  }

  // ۲. حذف از localStorage
  try {
    localStorage.removeItem('cached_plan')
  } catch {}

  console.log('[OfflineDB] ✅ Plan cache cleared')
}

// ─── ★ v6.1: Cache Invoice Data ──────────────────────────────────

export interface CachedInvoiceData {
  invoices: any[]
  totalPages: number
  total: number
  cachedAt: string
  status: string
  page: number
}

export async function cacheInvoicesPage(
  invoices: any[],
  totalPages: number,
  total: number,
  status: string,
  page: number
): Promise<void> {
  try {
    const data: CachedInvoiceData = {
      invoices,
      totalPages,
      total,
      cachedAt: new Date().toISOString(),
      status,
      page,
    }

    // ۱. IndexedDB
    await idbPut(STORES.meta, {
      key: `invoices-${status}-${page}`,
      value: data,
    })

    // ۲. localStorage (fallback)
    const cacheKey = `invoices-cache-${status}-${page}`
    localStorage.setItem(cacheKey, JSON.stringify(data))

    console.log(`[OfflineDB] ✅ ${invoices.length} فاکتور cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheInvoicesPage error:', err)
    // حداقل localStorage رو تلاش کن
    try {
      const cacheKey = `invoices-cache-${status}-${page}`
      localStorage.setItem(cacheKey, JSON.stringify({
        invoices,
        totalPages,
        total,
        cachedAt: new Date().toISOString(),
        status,
        page,
      }))
    } catch {}
  }
}

export async function getCachedInvoicesPage(
  status: string,
  page: number
): Promise<CachedInvoiceData | null> {
  try {
    // ۱. IndexedDB
    const record = await idbGet<{ key: string; value: CachedInvoiceData }>(
      STORES.meta,
      `invoices-${status}-${page}`
    )
    if (record?.value) {
      console.log(`[OfflineDB] Invoices loaded from IndexedDB`)
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading invoices from IndexedDB:', err)
  }

  // ۲. localStorage (fallback)
  try {
    const cacheKey = `invoices-cache-${status}-${page}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const data = JSON.parse(cached)
      console.log(`[OfflineDB] Invoices loaded from localStorage`)
      return data
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading invoices from localStorage:', err)
  }

  return null
}

export async function clearInvoicesCache(): Promise<void> {
  try {
    // IndexedDB
    const allMeta = await idbGetAll<any>(STORES.meta)
    for (const item of allMeta) {
      if (item.key?.startsWith('invoices-')) {
        await idbDelete(STORES.meta, item.key)
      }
    }
  } catch {}

  // localStorage
  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (key.startsWith('invoices-cache-')) {
      localStorage.removeItem(key)
    }
  }

  console.log('[OfflineDB] ✅ Invoices cache cleared')
}

// ─── ★ v6.2: Cache Warehouses (در meta store) ────────────────────

export async function cacheWarehousesMeta(warehouses: any[]): Promise<void> {
  try {
    await idbPut(STORES.meta, {
      key: 'warehouses',
      value: warehouses,
    })
    // fallback localStorage
    localStorage.setItem('cached_warehouses', JSON.stringify({
      warehouses,
      cachedAt: new Date().toISOString(),
    }))
    console.log(`[OfflineDB] ✅ ${warehouses.length} انبار cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheWarehousesMeta error:', err)
    try {
      localStorage.setItem('cached_warehouses', JSON.stringify({
        warehouses,
        cachedAt: new Date().toISOString(),
      }))
    } catch {}
  }
}

export async function getCachedWarehouses(): Promise<any[]> {
  try {
    // ۱. IndexedDB
    const record = await idbGet<{ key: string; value: any[] }>(STORES.meta, 'warehouses')
    if (record?.value && Array.isArray(record.value)) {
      console.log('[OfflineDB] Warehouses loaded from IndexedDB')
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading warehouses from IndexedDB:', err)
  }

  // ۲. localStorage fallback
  try {
    const cached = localStorage.getItem('cached_warehouses')
    if (cached) {
      const data = JSON.parse(cached)
      console.log('[OfflineDB] Warehouses loaded from localStorage')
      return data.warehouses || []
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading warehouses from localStorage:', err)
  }

  return []
}

// ─── Meta: LastSync ──────────────────────────────────────────────

export async function setLastSyncTimestamp(timestamp: number): Promise<void> {
  await idbPut(STORES.meta, { key: 'lastSync', value: timestamp })
}

export async function getLastSyncTimestamp(): Promise<number | null> {
  try {
    const record = await idbGet<{ key: string; value: number }>(STORES.meta, 'lastSync')
    return record?.value ?? null
  } catch {
    return null
  }
}

// ─── Cache Stats ─────────────────────────────────────────────────

export async function getCacheStats(): Promise<CacheStats> {
  try {
    const [products, customers, categories, invoices, installmentPlans, installmentSchedules, syncQueue, lastSync] =
      await Promise.all([
        idbCount(STORES.products),
        idbCount(STORES.customers),
        idbCount(STORES.categories),
        idbCount(STORES.invoices),
        idbCount(STORES.installmentPlans),
        idbCount(STORES.installmentSchedules),
        idbCount(STORES.syncQueue),
        getLastSyncTimestamp(),
      ])
    return { products, customers, categories, invoices, installmentPlans, installmentSchedules, syncQueue, lastSync }
  } catch {
    return { products: 0, customers: 0, categories: 0, invoices: 0, installmentPlans: 0, installmentSchedules: 0, syncQueue: 0, lastSync: null }
  }
}

// ─── Clear All ───────────────────────────────────────────────────

export async function clearAllCache(): Promise<void> {
  await Promise.all([
    idbClear(STORES.products),
    idbClear(STORES.customers),
    idbClear(STORES.categories),
    idbClear(STORES.invoices),
    idbClear(STORES.installmentPlans),
    idbClear(STORES.installmentSchedules),
    idbClear(STORES.syncQueue),
    idbClear(STORES.meta),
  ])
  await clearCachedPlan()
}

// ─── Helpers ─────────────────────────────────────────────────────

export function isOfflineId(id: string): boolean {
  return id.startsWith('offline-') || id.startsWith('local-')
}

export function isOfflineInvoiceNumber(number: string): boolean {
  return number.startsWith('OFF-') || number.startsWith('LOCAL-')
}

// ★ برای backward compat
export function getOfflineDB() {
  console.warn('[OfflineDB] getOfflineDB() منسوخ شده — از توابع async استفاده کنید')
  return null
}