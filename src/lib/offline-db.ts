'use client'

/**
 * Offline DB — ShopAccounting v6.5
 * ذخیره‌سازی واقعی با IndexedDB (پایدار بین session‌ها)
 * ★ v6.1: اضافه شدن cache پلن و فاکتورها
 * ★ v6.2: اضافه شدن cache انبارها برای POS آفلاین
 * ★ v6.3: اضافه شدن cache اقساط و طرح‌های قسطی
 * ★ v6.4: اضافه شدن cache تیکت‌ها و پیام‌ها
 * ★ v6.5: FIX — حذف ساخت تکراری meta store + افزودن offlineOperations store
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
  tickets: number
  syncQueue: number
  lastSync: number | null
}

const DB_NAME = 'ShopAccountingOffline'
// ★ FIX: کامنت اصلاح شد — نسخه واقعی ۴ است (نه ۳)
const DB_VERSION = 4
const STORES = {
  syncQueue: 'syncQueue',
  products: 'products',
  customers: 'customers',
  categories: 'categories',
  invoices: 'invoices',
  installmentPlans: 'installmentPlans',
  installmentSchedules: 'installmentSchedules',
  tickets: 'tickets',
  ticketMessages: 'ticketMessages',
  offlineOperations: 'offlineOperations',
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

      if (!db.objectStoreNames.contains(STORES.syncQueue)) {
        const store = db.createObjectStore(STORES.syncQueue, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('type', 'type')
      }

      if (!db.objectStoreNames.contains(STORES.products)) {
        const store = db.createObjectStore(STORES.products, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
        store.createIndex('name', 'name')
      }

      if (!db.objectStoreNames.contains(STORES.customers)) {
        const store = db.createObjectStore(STORES.customers, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
      }

      if (!db.objectStoreNames.contains(STORES.categories)) {
        db.createObjectStore(STORES.categories, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(STORES.invoices)) {
        const store = db.createObjectStore(STORES.invoices, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
        store.createIndex('status', 'status')
      }

      if (!db.objectStoreNames.contains(STORES.installmentPlans)) {
        const store = db.createObjectStore(STORES.installmentPlans, { keyPath: 'id' })
        store.createIndex('tenantId', 'tenantId')
        store.createIndex('status', 'status')
      }

      if (!db.objectStoreNames.contains(STORES.installmentSchedules)) {
        const store = db.createObjectStore(STORES.installmentSchedules, { keyPath: 'id' })
        store.createIndex('planId', 'planId')
        store.createIndex('status', 'status')
      }

      if (!db.objectStoreNames.contains(STORES.tickets)) {
        const store = db.createObjectStore(STORES.tickets, { keyPath: 'id' })
        store.createIndex('status', 'status')
        store.createIndex('updatedAt', 'updatedAt')
      }

      if (!db.objectStoreNames.contains(STORES.ticketMessages)) {
        const store = db.createObjectStore(STORES.ticketMessages, { keyPath: 'id' })
        store.createIndex('ticketId', 'ticketId')
        store.createIndex('createdAt', 'createdAt')
      }

      if (!db.objectStoreNames.contains(STORES.offlineOperations)) {
        const store = db.createObjectStore(STORES.offlineOperations, { keyPath: 'id' })
        store.createIndex('type', 'type')
        store.createIndex('status', 'status')
        store.createIndex('createdAt', 'createdAt')
      }

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

export async function cacheInstallmentPlans(plans: any[]): Promise<void> {
  try {
    await idbClear(STORES.installmentPlans)
    for (const plan of plans) {
      await idbPut(STORES.installmentPlans, plan)
    }
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
    const plans = await idbGetAll<any>(STORES.installmentPlans)
    if (plans.length > 0) {
      console.log('[OfflineDB] Installment plans loaded from IndexedDB')
      return plans
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading plans from IndexedDB:', err)
  }

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

export async function cacheInstallmentSchedules(schedules: any[]): Promise<void> {
  try {
    await idbClear(STORES.installmentSchedules)
    for (const schedule of schedules) {
      await idbPut(STORES.installmentSchedules, schedule)
    }
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
    const schedules = await idbGetAll<any>(STORES.installmentSchedules)
    if (schedules.length > 0) {
      console.log('[OfflineDB] Schedules loaded from IndexedDB')
      return schedules
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading schedules from IndexedDB:', err)
  }

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
    const record = await idbGet<{ key: string; value: CachedInstallmentSummary }>(STORES.meta, 'installment_summary')
    if (record?.value) {
      console.log('[OfflineDB] Summary loaded from IndexedDB')
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading summary from IndexedDB:', err)
  }

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
  // ★ v9.1: فیلدهای اختیاری جدید — رفع خطای TS2353 در app-shell.tsx
  //   (بدون این فیلدها، فراخوانی cachePlan با hoursRemaining/isDemo/isLifetime کامپایل نمی‌شد)
  hoursRemaining?: number
  isDemo?: boolean
  isLifetime?: boolean
}

export async function cachePlan(planData: CachedPlanData): Promise<void> {
  try {
    await idbPut(STORES.meta, { key: 'plan', value: planData })
    console.log('[OfflineDB] ✅ Plan cached:', planData.planName)
    localStorage.setItem('cached_plan', JSON.stringify(planData))
  } catch (err) {
    console.error('[OfflineDB] cachePlan error:', err)
    try {
      localStorage.setItem('cached_plan', JSON.stringify(planData))
    } catch {}
  }
}

export async function getCachedPlan(): Promise<CachedPlanData | null> {
  try {
    const record = await idbGet<{ key: string; value: CachedPlanData }>(STORES.meta, 'plan')
    if (record?.value) {
      console.log('[OfflineDB] Plan loaded from IndexedDB:', record.value.planName)
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading plan from IndexedDB:', err)
  }

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
    await idbDelete(STORES.meta, 'plan')
  } catch (err) {
    console.warn('[OfflineDB] Error deleting plan from IndexedDB:', err)
  }

  try {
    localStorage.removeItem('cached_plan')
  } catch {}

  console.log('[OfflineDB] ✅ Plan cache cleared')
}

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

    await idbPut(STORES.meta, {
      key: `invoices-${status}-${page}`,
      value: data,
    })

    const cacheKey = `invoices-cache-${status}-${page}`
    localStorage.setItem(cacheKey, JSON.stringify(data))

    console.log(`[OfflineDB] ✅ ${invoices.length} فاکتور cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheInvoicesPage error:', err)
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
    const allMeta = await idbGetAll<any>(STORES.meta)
    for (const item of allMeta) {
      if (item.key?.startsWith('invoices-')) {
        await idbDelete(STORES.meta, item.key)
      }
    }
  } catch {}

  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (key.startsWith('invoices-cache-')) {
      localStorage.removeItem(key)
    }
  }

  console.log('[OfflineDB] ✅ Invoices cache cleared')
}

export async function cacheWarehousesMeta(warehouses: any[]): Promise<void> {
  try {
    await idbPut(STORES.meta, {
      key: 'warehouses',
      value: warehouses,
    })
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
    const record = await idbGet<{ key: string; value: any[] }>(STORES.meta, 'warehouses')
    if (record?.value && Array.isArray(record.value)) {
      console.log('[OfflineDB] Warehouses loaded from IndexedDB')
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading warehouses from IndexedDB:', err)
  }

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

export async function getCacheStats(): Promise<CacheStats> {
  try {
    const [products, customers, categories, invoices, installmentPlans, installmentSchedules, tickets, syncQueue, lastSync] =
      await Promise.all([
        idbCount(STORES.products),
        idbCount(STORES.customers),
        idbCount(STORES.categories),
        idbCount(STORES.invoices),
        idbCount(STORES.installmentPlans),
        idbCount(STORES.installmentSchedules),
        idbCount(STORES.tickets),
        idbCount(STORES.syncQueue),
        getLastSyncTimestamp(),
      ])
    return { products, customers, categories, invoices, installmentPlans, installmentSchedules, tickets, syncQueue, lastSync }
  } catch {
    return { products: 0, customers: 0, categories: 0, invoices: 0, installmentPlans: 0, installmentSchedules: 0, tickets: 0, syncQueue: 0, lastSync: null }
  }
}

export async function clearAllCache(): Promise<void> {
  await Promise.all([
    idbClear(STORES.products),
    idbClear(STORES.customers),
    idbClear(STORES.categories),
    idbClear(STORES.invoices),
    idbClear(STORES.installmentPlans),
    idbClear(STORES.installmentSchedules),
    idbClear(STORES.tickets),
    idbClear(STORES.ticketMessages),
    idbClear(STORES.offlineOperations),
    idbClear(STORES.syncQueue),
    idbClear(STORES.meta),
  ])
  await clearCachedPlan()
}

export function isOfflineId(id: string): boolean {
  return id.startsWith('offline-') || id.startsWith('local-')
}

export function isOfflineInvoiceNumber(number: string): boolean {
  return number.startsWith('OFF-') || number.startsWith('LOCAL-')
}

export function getOfflineDB() {
  console.warn('[OfflineDB] getOfflineDB() منسوخ شده — از توابع async استفاده کنید')
  return null
}

export async function cacheTickets(tickets: any[]): Promise<void> {
  try {
    await idbClear(STORES.tickets)
    for (const t of tickets) {
      await idbPut(STORES.tickets, t)
    }
    localStorage.setItem('cached_tickets', JSON.stringify({
      tickets,
      cachedAt: new Date().toISOString(),
    }))
    console.log(`[OfflineDB] ✅ ${tickets.length} تیکت cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheTickets error:', err)
    try {
      localStorage.setItem('cached_tickets', JSON.stringify({
        tickets,
        cachedAt: new Date().toISOString(),
      }))
    } catch {}
  }
}

export async function getCachedTickets(): Promise<any[]> {
  try {
    const tickets = await idbGetAll<any>(STORES.tickets)
    if (tickets.length > 0) {
      console.log('[OfflineDB] Tickets loaded from IndexedDB')
      return tickets
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading tickets from IndexedDB:', err)
  }

  try {
    const cached = localStorage.getItem('cached_tickets')
    if (cached) {
      const data = JSON.parse(cached)
      console.log('[OfflineDB] Tickets loaded from localStorage')
      return data.tickets || []
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading tickets from localStorage:', err)
  }

  return []
}

export async function cacheTicketMessages(ticketId: string, messages: any[]): Promise<void> {
  try {
    const allMsgs = await idbGetAll<any>(STORES.ticketMessages)
    for (const msg of allMsgs) {
      if (msg.ticketId === ticketId) {
        await idbDelete(STORES.ticketMessages, msg.id)
      }
    }
    for (const m of messages) {
      await idbPut(STORES.ticketMessages, m)
    }
    console.log(`[OfflineDB] ✅ ${messages.length} پیام تیکت cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheTicketMessages error:', err)
  }
}

export async function getCachedTicketMessages(ticketId: string): Promise<any[]> {
  try {
    const allMsgs = await idbGetAll<any>(STORES.ticketMessages)
    return allMsgs
      .filter(m => m.ticketId === ticketId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  } catch (err) {
    console.warn('[OfflineDB] Error reading ticket messages:', err)
    return []
  }
}

export async function cacheTicketStats(stats: any): Promise<void> {
  try {
    await idbPut(STORES.meta, { key: 'ticket_stats', value: stats })
    localStorage.setItem('cached_ticket_stats', JSON.stringify(stats))
    console.log('[OfflineDB] ✅ Ticket stats cached')
  } catch (err) {
    console.error('[OfflineDB] cacheTicketStats error:', err)
    try {
      localStorage.setItem('cached_ticket_stats', JSON.stringify(stats))
    } catch {}
  }
}

export async function getCachedTicketStats(): Promise<any | null> {
  try {
    const record = await idbGet<{ key: string; value: any }>(STORES.meta, 'ticket_stats')
    if (record?.value) {
      console.log('[OfflineDB] Ticket stats loaded from IndexedDB')
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading ticket stats from IndexedDB:', err)
  }

  try {
    const cached = localStorage.getItem('cached_ticket_stats')
    if (cached) {
      console.log('[OfflineDB] Ticket stats loaded from localStorage')
      return JSON.parse(cached)
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading ticket stats from localStorage:', err)
  }

  return null
}

export type OperationType = 'create_ticket' | 'reply_ticket' | 'close_ticket' | 'rate_ticket' | 'update_stock' | 'create_invoice'

export interface OfflineOperation {
  id: string
  type: OperationType
  endpoint: string
  method: 'POST' | 'PUT' | 'PATCH'
  payload: any
  createdAt: number
  retryCount: number
  status: 'pending' | 'syncing' | 'failed' | 'completed'
  lastError: string | null
}

export async function addOfflineOperation(op: Omit<OfflineOperation, 'id' | 'createdAt' | 'retryCount' | 'status' | 'lastError'>): Promise<string> {
  const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newOp: OfflineOperation = {
    ...op,
    id,
    createdAt: Date.now(),
    retryCount: 0,
    status: 'pending',
    lastError: null,
  }
  try {
    await idbPut(STORES.offlineOperations, newOp)
    console.log(`[OfflineDB] ✅ Operation queued: ${op.type}`)
    return id
  } catch (err) {
    console.error('[OfflineDB] addOfflineOperation error:', err)
    throw err
  }
}

export async function getOfflineOperations(): Promise<OfflineOperation[]> {
  try {
    return await idbGetAll<OfflineOperation>(STORES.offlineOperations)
  } catch {
    return []
  }
}

export async function removeOfflineOperation(id: string): Promise<void> {
  try {
    await idbDelete(STORES.offlineOperations, id)
  } catch (err) {
    console.error('[OfflineDB] removeOfflineOperation error:', err)
  }
}

export async function updateOfflineOperation(id: string, updates: Partial<OfflineOperation>): Promise<void> {
  try {
    const existing = await idbGet<OfflineOperation>(STORES.offlineOperations, id)
    if (existing) {
      await idbPut(STORES.offlineOperations, { ...existing, ...updates })
    }
  } catch (err) {
    console.error('[OfflineDB] updateOfflineOperation error:', err)
  }
}

export interface CachedJournalEntry {
  id: string
  entryNumber: string
  date: string
  description: string
  totalDebit: number
  totalCredit: number
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED'
  isPosted?: boolean
  sourceType?: string
  isManual?: boolean
  items?: Array<{
    accountId: string
    accountName: string
    accountCode?: string
    debit: number
    credit: number
    description?: string
  }>
  lines?: Array<{
    accountId: string
    accountName: string
    accountCode?: string
    debit: number
    credit: number
    description?: string
  }>
  referenceType?: string
  referenceId?: string
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

export async function cacheJournalEntries(entries: CachedJournalEntry[]): Promise<void> {
  try {
    await idbClear(STORES.meta)
    await idbPut(STORES.meta, {
      key: 'journal-entries',
      value: entries,
      cachedAt: Date.now(),
    })
    try {
      localStorage.setItem('cached_journal_entries', JSON.stringify({
        entries,
        cachedAt: Date.now(),
      }))
    } catch {}
    console.log(`[OfflineDB] ✅ ${entries.length} سند حسابداری cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheJournalEntries error:', err)
  }
}

export async function getCachedJournalEntries(): Promise<CachedJournalEntry[]> {
  try {
    const record = await idbGet<{ key: string; value: CachedJournalEntry[] }>(
      STORES.meta,
      'journal-entries'
    )
    if (record?.value && Array.isArray(record.value)) {
      console.log('[OfflineDB] Journal entries loaded from IndexedDB')
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading journal entries from IndexedDB:', err)
  }

  try {
    const cached = localStorage.getItem('cached_journal_entries')
    if (cached) {
      const data = JSON.parse(cached)
      console.log('[OfflineDB] Journal entries loaded from localStorage')
      return data.entries || []
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading journal entries from localStorage:', err)
  }

  return []
}

export async function addJournalToSyncQueue(
  operation: 'create' | 'update' | 'delete',
  entry: CachedJournalEntry
): Promise<string> {
  const item: SyncQueueItem = {
    id: `sync-journal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: `journal_${operation}`,
    method: operation === 'delete' ? 'DELETE' : operation === 'update' ? 'PUT' : 'POST',
    url: operation === 'delete' || operation === 'update'
      ? `/api/journal-entries/${entry.id}`
      : '/api/journal-entries',
    body: JSON.stringify({
      ...entry,
      _offline: undefined,
      _syncStatus: undefined,
      _createdAt: undefined,
      _lastError: undefined,
    }),
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
  }
  
  try {
    await idbPut(STORES.syncQueue, item)
    console.log(`[OfflineDB] ✅ Journal ${operation} added to sync queue: ${entry.id}`)
    return item.id
  } catch (err) {
    console.error('[OfflineDB] addJournalToSyncQueue error:', err)
    throw err
  }
}

export async function removeOfflineJournalFromCache(offlineId: string): Promise<void> {
  try {
    const entries = await getCachedJournalEntries()
    const filtered = entries.filter(e => e.id !== offlineId)
    await cacheJournalEntries(filtered)
    console.log(`[OfflineDB] ✅ Offline journal removed from cache: ${offlineId}`)
  } catch (err) {
    console.error('[OfflineDB] removeOfflineJournalFromCache error:', err)
  }
}

export async function updateJournalSyncStatus(
  id: string,
  status: 'pending' | 'syncing' | 'synced' | 'failed',
  error?: string
): Promise<void> {
  try {
    const entries = await getCachedJournalEntries()
    const updated = entries.map(e =>
      e.id === id
        ? { ...e, _syncStatus: status, _lastError: error || undefined }
        : e
    )
    await cacheJournalEntries(updated)
  } catch (err) {
    console.error('[OfflineDB] updateJournalSyncStatus error:', err)
  }
}

export interface CachedCheck {
  id: string
  type: 'receivable' | 'payable'
  checkNumber: string
  bankName: string
  amount: number
  dueDate: string
  customerId?: string | null
  payee?: string | null
  status: 'pending' | 'deposited' | 'cleared' | 'bounced' | 'returned'
  createdAt?: string
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

export async function cacheChecks(checks: CachedCheck[]): Promise<void> {
  try {
    await idbPut(STORES.meta, {
      key: 'checks',
      value: checks,
      cachedAt: Date.now(),
    })
    try {
      localStorage.setItem('cached_checks', JSON.stringify({ checks, cachedAt: Date.now() }))
    } catch {}
    console.log(`[OfflineDB] ✅ ${checks.length} چک cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheChecks error:', err)
  }
}

export async function getCachedChecks(): Promise<CachedCheck[]> {
  try {
    const record = await idbGet<{ key: string; value: CachedCheck[] }>(STORES.meta, 'checks')
    if (record?.value && Array.isArray(record.value)) {
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading checks from IndexedDB:', err)
  }
  try {
    const cached = localStorage.getItem('cached_checks')
    if (cached) {
      const data = JSON.parse(cached)
      return data.checks || []
    }
  } catch {}
  return []
}

export async function addCheckToSyncQueue(
  operation: 'create' | 'update' | 'delete' | 'status_change',
  check: CachedCheck
): Promise<string> {
  const item: SyncQueueItem = {
    id: `sync-check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: `check_${operation}`,
    method: operation === 'delete' ? 'DELETE' : operation === 'create' ? 'POST' : 'PATCH',
    url: operation === 'create' 
      ? '/api/checks' 
      : `/api/checks/${check.id}`,
    body: JSON.stringify({
      ...check,
      _offline: undefined,
      _syncStatus: undefined,
      _createdAt: undefined,
      _lastError: undefined,
    }),
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
  }
  
  try {
    await idbPut(STORES.syncQueue, item)
    console.log(`[OfflineDB] ✅ Check ${operation} added to sync queue: ${check.id}`)
    return item.id
  } catch (err) {
    console.error('[OfflineDB] addCheckToSyncQueue error:', err)
    throw err
  }
}

export interface CachedFixedAsset {
  id: string
  name: string
  code: string
  category: string
  purchasePrice: number
  salvageValue: number
  usefulLife: number
  purchaseDate: string
  description?: string | null
  accumulatedDepreciation?: number
  bookValue?: number
  status?: 'active' | 'fully_depreciated' | 'sold'
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

export async function cacheFixedAssets(assets: CachedFixedAsset[]): Promise<void> {
  try {
    await idbPut(STORES.meta, {
      key: 'fixed-assets',
      value: assets,
      cachedAt: Date.now(),
    })
    try {
      localStorage.setItem('cached_fixed_assets', JSON.stringify({ assets, cachedAt: Date.now() }))
    } catch {}
    console.log(`[OfflineDB] ✅ ${assets.length} دارایی ثابت cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheFixedAssets error:', err)
  }
}

export async function getCachedFixedAssets(): Promise<CachedFixedAsset[]> {
  try {
    const record = await idbGet<{ key: string; value: CachedFixedAsset[] }>(STORES.meta, 'fixed-assets')
    if (record?.value && Array.isArray(record.value)) {
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading fixed assets from IndexedDB:', err)
  }
  try {
    const cached = localStorage.getItem('cached_fixed_assets')
    if (cached) {
      const data = JSON.parse(cached)
      return data.assets || []
    }
  } catch {}
  return []
}

export async function addFixedAssetToSyncQueue(
  operation: 'create' | 'update' | 'delete' | 'depreciate',
  asset: CachedFixedAsset
): Promise<string> {
  const item: SyncQueueItem = {
    id: `sync-asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: `asset_${operation}`,
    method: operation === 'delete' ? 'DELETE' : operation === 'create' ? 'POST' : 'PATCH',
    url: operation === 'create' 
      ? '/api/fixed-assets' 
      : operation === 'depreciate'
        ? '/api/fixed-assets/depreciate'
        : `/api/fixed-assets/${asset.id}`,
    body: JSON.stringify({
      ...asset,
      _offline: undefined,
      _syncStatus: undefined,
      _createdAt: undefined,
      _lastError: undefined,
    }),
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
  }
  
  try {
    await idbPut(STORES.syncQueue, item)
    console.log(`[OfflineDB] ✅ Fixed asset ${operation} added to sync queue: ${asset.id}`)
    return item.id
  } catch (err) {
    console.error('[OfflineDB] addFixedAssetToSyncQueue error:', err)
    throw err
  }
}

export interface CachedAccount {
  id: string
  code: string
  name: string
  type: string
  parentId?: string | null
  isActive: boolean
  balance?: number
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

export async function cacheAccounts(accounts: CachedAccount[]): Promise<void> {
  try {
    await idbPut(STORES.meta, {
      key: 'accounts',
      value: accounts,
      cachedAt: Date.now(),
    })
    try {
      localStorage.setItem('cached_accounts', JSON.stringify(accounts))
    } catch {}
    console.log(`[OfflineDB] ✅ ${accounts.length} حساب cached`)
  } catch (err) {
    console.error('[OfflineDB] cacheAccounts error:', err)
  }
}

export async function getCachedAccounts(): Promise<CachedAccount[]> {
  try {
    const record = await idbGet<{ key: string; value: CachedAccount[] }>(STORES.meta, 'accounts')
    if (record?.value && Array.isArray(record.value)) {
      return record.value
    }
  } catch (err) {
    console.warn('[OfflineDB] Error reading accounts from IndexedDB:', err)
  }
  try {
    const cached = localStorage.getItem('cached_accounts')
    if (cached) {
      return JSON.parse(cached)
    }
  } catch {}
  return []
}

export async function addAccountToSyncQueue(
  operation: 'create' | 'update' | 'delete',
  account: CachedAccount
): Promise<string> {
  const item: SyncQueueItem = {
    id: `sync-account-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: `account_${operation}`,
    method: operation === 'delete' ? 'DELETE' : operation === 'create' ? 'POST' : 'PUT',
    url: operation === 'delete' 
      ? `/api/accounts?id=${account.id}` 
      : '/api/accounts',
    body: JSON.stringify({
      ...account,
      _offline: undefined,
      _syncStatus: undefined,
      _createdAt: undefined,
      _lastError: undefined,
    }),
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
  }
  
  try {
    await idbPut(STORES.syncQueue, item)
    console.log(`[OfflineDB] ✅ Account ${operation} added to sync queue: ${account.id}`)
    return item.id
  } catch (err) {
    console.error('[OfflineDB] addAccountToSyncQueue error:', err)
    throw err
  }
}
