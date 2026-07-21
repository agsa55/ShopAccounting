/**
 * Redis Client Configuration (v3.32.1 — Performance Fix)
 * 
 * Fixes:
 * - Disabled infinite retry strategy that caused 5s hangs and log flooding
 * - Added fast-fail mechanism so the app runs at full speed even if Redis is down
 * - Preserved all original exports (CacheKeys, CacheTTL, etc.)
 */

import Redis, { RedisOptions } from 'ioredis'

// ============================================
// Configuration
// ============================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10)

// ★★★ v3.32.1: تنظیمات بهینه برای جلوگیری از کندی
const defaultOptions: RedisOptions = {
  password: REDIS_PASSWORD,
  db: REDIS_DB,
  // ★ تلاش مجدد غیرفعال است تا سیستم هنگ نکند
  retryStrategy(times) {
    return null // بلافاصله fail شود
  },
  maxRetriesPerRequest: 1, // فقط یک بار تلاش کند
  enableReadyCheck: false,
  keepAlive: 30000,
  // ★ timeout بسیار کوتاه (۱ ثانیه) برای جلوگیری از تاخیر
  connectTimeout: 1000,
  lazyConnect: true,
}

// ============================================
// Singleton Redis Client
// ============================================

let redisInstance: Redis | null = null
let isConnected = false
let isInitialized = false

export function createRedisClient(options?: RedisOptions): Redis {
  const client = new Redis(REDIS_URL, {
    ...defaultOptions,
    ...options,
  })

  // ★ فقط یک بار خطا را لاگ می‌کنیم
  let errorLogged = false
  client.on('error', (err) => {
    if (!errorLogged && (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT'))) {
      console.warn('[Redis] ⚠️ Not available (caching disabled)')
      errorLogged = true
      isConnected = false
    }
  })

  client.on('connect', () => {
    console.log('[Redis] ✅ Connected successfully')
    isConnected = true
  })

  client.on('close', () => {
    if (isConnected) {
      console.warn('[Redis] Connection closed (caching disabled)')
      isConnected = false
    }
  })

  return client
}

/**
 * Get or create the singleton Redis client
 */
export async function getRedisClient(): Promise<Redis> {
  if (redisInstance) {
    return redisInstance
  }

  redisInstance = createRedisClient()
  
  // ★ فقط یک بار تلاش برای اتصال
  if (!isInitialized) {
    isInitialized = true
    try {
      await redisInstance.connect()
    } catch (error) {
      // اتصال ناموفق بود، اما سیستم ادامه می‌دهد
    }
  }
  
  return redisInstance
}

/**
 * Disconnect Redis client gracefully
 */
export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    try {
      await redisInstance.quit()
    } catch (error) {
      // ignore
    }
    redisInstance = null
    isConnected = false
    isInitialized = false
  }
}

/**
 * Check if Redis is available (fast check)
 */
export async function isRedisAvailable(): Promise<boolean> {
  if (isInitialized && !isConnected) {
    return false
  }
  
  try {
    const client = await getRedisClient()
    const result = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 1000)
      )
    ])
    isConnected = result === 'PONG'
    return isConnected
  } catch {
    isConnected = false
    return false
  }
}

// ============================================
// Cache Key Helpers (همان قبلی)
// ============================================

export const CacheKeys = {
  storeSetting: (tenantId: string, key: string) =>
    `shopaccounting:${tenantId}:setting:${key}`,
  userSession: (userId: string) =>
    `shopaccounting:session:${userId}`,
  products: (tenantId: string, page?: number) =>
    `shopaccounting:${tenantId}:products:${page || 'all'}`,
  product: (tenantId: string, productId: string) =>
    `shopaccounting:${tenantId}:product:${productId}`,
  categories: (tenantId: string) =>
    `shopaccounting:${tenantId}:categories`,
  customers: (tenantId: string, page?: number) =>
    `shopaccounting:${tenantId}:customers:${page || 'all'}`,
  invoice: (tenantId: string, invoiceId: string) =>
    `shopaccounting:${tenantId}:invoice:${invoiceId}`,
  dashboardStats: (tenantId: string) =>
    `shopaccounting:${tenantId}:dashboard:stats`,
  rateLimit: (identifier: string) =>
    `shopaccounting:ratelimit:${identifier}`,
  syncQueue: (tenantId: string) =>
    `shopaccounting:${tenantId}:sync:queue`,
} as const

// ============================================
// Cache TTL Constants (همان قبلی)
// ============================================

export const CacheTTL = {
  SHORT: 60,
  MEDIUM: 300,
  LONG: 3600,
  VERY_LONG: 86400,
  SESSION: 86400 * 7,
} as const

export default getRedisClient