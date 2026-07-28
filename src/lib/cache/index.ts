/**
 * Redis Cache Service
 * 
 * Provides high-level caching utilities for:
 * - Get/Set with TTL and namespaced keys
 * - Cache invalidation by pattern
 * - Tenant-scoped cache operations
 * - Circuit breaker pattern for Redis unavailability
 * 
 * Usage:
 *   import { cacheService } from '@/lib/cache'
 *   await cacheService.set('products', tenantId, data, CacheTTL.MEDIUM)
 *   const data = await cacheService.get('products', tenantId)
 */

import { getRedisClient, CacheKeys, CacheTTL, isRedisAvailable } from '@/lib/redis'
import { cacheLogger } from '@/lib/logger'

// ============================================
// Circuit Breaker for Redis
// ============================================

let circuitOpen = false
let circuitOpenSince = 0
const CIRCUIT_RESET_TIMEOUT = 30000 // Try again after 30s
let consecutiveFailures = 0
const MAX_FAILURES = 5

function isCircuitOpen(): boolean {
  if (!circuitOpen) return false
  // Try to reset circuit after timeout
  if (Date.now() - circuitOpenSince > CIRCUIT_RESET_TIMEOUT) {
    circuitOpen = false
    consecutiveFailures = 0
    cacheLogger.info('Circuit breaker reset - attempting Redis connection')
    return false
  }
  return true
}

function recordFailure() {
  consecutiveFailures++
  if (consecutiveFailures >= MAX_FAILURES) {
    circuitOpen = true
    circuitOpenSince = Date.now()
    cacheLogger.warn({ consecutiveFailures }, 'Circuit breaker opened - Redis unavailable')
  }
}

function recordSuccess() {
  consecutiveFailures = 0
  if (circuitOpen) {
    circuitOpen = false
    cacheLogger.info('Circuit breaker closed - Redis recovered')
  }
}

// ============================================
// Cache Service
// ============================================

export interface CacheOptions {
  ttl?: number          // TTL in seconds
  compress?: boolean    // Compress large values (future)
  staleWhileRevalidate?: boolean  // Return stale data while refreshing
}

class CacheService {
  /**
   * Get a cached value by key
   * Returns null if not found or Redis unavailable
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (isCircuitOpen()) return null

    try {
      const client = await getRedisClient()
      const value = await client.get(key)
      
      if (value === null) return null
      
      recordSuccess()
      return JSON.parse(value) as T
    } catch (error) {
      recordFailure()
      cacheLogger.debug({ key, error: (error as Error).message }, 'Cache GET failed')
      return null
    }
  }

  /**
   * Set a cached value with optional TTL
   */
  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<boolean> {
    if (isCircuitOpen()) return false

    try {
      const client = await getRedisClient()
      const serialized = JSON.stringify(value)
      
      if (ttl) {
        await client.setex(key, ttl, serialized)
      } else {
        await client.set(key, serialized)
      }
      
      recordSuccess()
      return true
    } catch (error) {
      recordFailure()
      cacheLogger.debug({ key, error: (error as Error).message }, 'Cache SET failed')
      return false
    }
  }

  /**
   * Delete a cached value
   */
  async del(key: string): Promise<boolean> {
    if (isCircuitOpen()) return false

    try {
      const client = await getRedisClient()
      await client.del(key)
      recordSuccess()
      return true
    } catch (error) {
      recordFailure()
      return false
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * Uses SCAN for safety (no blocking KEYS command)
   */
  async delPattern(pattern: string): Promise<number> {
    if (isCircuitOpen()) return 0

    try {
      const client = await getRedisClient()
      let deletedCount = 0
      let cursor = '0'

      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        )
        cursor = nextCursor

        if (keys.length > 0) {
          await client.del(...keys)
          deletedCount += keys.length
        }
      } while (cursor !== '0')

      recordSuccess()
      return deletedCount
    } catch (error) {
      recordFailure()
      cacheLogger.debug({ pattern, error: (error as Error).message }, 'Cache DEL_PATTERN failed')
      return 0
    }
  }

  /**
   * Get or Set pattern - fetch from cache, or compute and cache
   * This is the main method to use for caching database queries
   */
  async getOrSet<T = unknown>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = CacheTTL.MEDIUM } = options

    // Try cache first
    const cached = await this.get<T>(key)
    if (cached !== null) {
      cacheLogger.debug({ key, hit: true }, 'Cache HIT')
      return cached
    }

    cacheLogger.debug({ key, hit: false }, 'Cache MISS')

    // Fetch from source
    const value = await fetcher()

    // Store in cache (fire-and-forget)
    this.set(key, value, ttl).catch(() => {
      // Ignore cache write failures
    })

    return value
  }

  /**
   * Invalidate all cached data for a specific tenant
   */
  async invalidateTenant(tenantId: string): Promise<number> {
    cacheLogger.info({ tenantId }, 'Invalidating tenant cache')
    return this.delPattern(`shopaccounting:${tenantId}:*`)
  }

  /**
   * Invalidate cached data for a specific entity type
   */
  async invalidateEntity(tenantId: string, entity: string): Promise<number> {
    cacheLogger.info({ tenantId, entity }, 'Invalidating entity cache')
    return this.delPattern(`shopaccounting:${tenantId}:${entity}*`)
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    if (isCircuitOpen()) return false

    try {
      const client = await getRedisClient()
      const result = await client.exists(key)
      recordSuccess()
      return result === 1
    } catch (error) {
      recordFailure()
      return false
    }
  }

  /**
   * Set a key with expiry only if it doesn't exist (for distributed locks)
   */
  async setNX(key: string, value: string, ttl: number): Promise<boolean> {
    if (isCircuitOpen()) return false

    try {
      const client = await getRedisClient()
      const result = await client.set(key, value, 'EX', ttl, 'NX')
      recordSuccess()
      return result === 'OK'
    } catch (error) {
      recordFailure()
      return false
    }
  }

  /**
   * Get Redis info for monitoring
   */
  async getInfo(): Promise<{
    available: boolean
    usedMemory?: string
    connectedClients?: number
    keyspaceHits?: number
    keyspaceMisses?: number
    hitRate?: string
  }> {
    try {
      const available = await isRedisAvailable()
      if (!available) {
        return { available: false }
      }

      const client = await getRedisClient()
      const info = await client.info('memory')
      const statsInfo = await client.info('stats')

      // Parse used_memory_human
      const memoryMatch = info.match(/used_memory_human:(\S+)/)
      const usedMemory = memoryMatch ? memoryMatch[1] : undefined

      // Parse connected_clients
      const clientsMatch = info.match(/connected_clients:(\d+)/)
      const connectedClients = clientsMatch ? parseInt(clientsMatch[1], 10) : undefined

      // Parse keyspace hits/misses
      const hitsMatch = statsInfo.match(/keyspace_hits:(\d+)/)
      const missesMatch = statsInfo.match(/keyspace_misses:(\d+)/)
      const keyspaceHits = hitsMatch ? parseInt(hitsMatch[1], 10) : undefined
      const keyspaceMisses = missesMatch ? parseInt(missesMatch[1], 10) : undefined

      let hitRate: string | undefined
      if (keyspaceHits !== undefined && keyspaceMisses !== undefined) {
        const total = keyspaceHits + keyspaceMisses
        hitRate = total > 0 ? `${((keyspaceHits / total) * 100).toFixed(1)}%` : '0%'
      }

      return {
        available: true,
        usedMemory,
        connectedClients,
        keyspaceHits,
        keyspaceMisses,
        hitRate,
      }
    } catch (error) {
      return { available: false }
    }
  }
}

// Singleton instance
export const cacheService = new CacheService()

// ============================================
// Convenience Functions for Common Cache Operations
// ============================================

/**
 * Cache store settings (long TTL since they rarely change)
 */
export async function getCachedStoreSetting<T = unknown>(
  tenantId: string,
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  return cacheService.getOrSet(
    CacheKeys.storeSetting(tenantId, key),
    fetcher,
    { ttl: CacheTTL.LONG }
  )
}

/**
 * Cache product catalog (medium TTL)
 */
export async function getCachedProducts<T = unknown>(
  tenantId: string,
  page: number,
  fetcher: () => Promise<T>
): Promise<T> {
  return cacheService.getOrSet(
    CacheKeys.products(tenantId, page),
    fetcher,
    { ttl: CacheTTL.MEDIUM }
  )
}

/**
 * Cache dashboard stats (short TTL - changes frequently)
 */
export async function getCachedDashboardStats<T = unknown>(
  tenantId: string,
  fetcher: () => Promise<T>
): Promise<T> {
  return cacheService.getOrSet(
    CacheKeys.dashboardStats(tenantId),
    fetcher,
    { ttl: CacheTTL.SHORT }
  )
}

export default cacheService
