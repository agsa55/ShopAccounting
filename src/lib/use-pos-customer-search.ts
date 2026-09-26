// ============================================================================
// src/lib/use-pos-customer-search.ts — Hook جستجوی هوشمند مشتری در POS
// ★ v1.2: Fix — نرمال‌سازی کاراکترهای فارسی (ی/ك عربی ↔ فارسی)
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/lib/store'

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

export interface POSCustomer {
  id: string
  code: string
  firstName: string
  lastName: string
  mobile: string | null
  nationalCode?: string | null
  address?: string | null
  currentBalance: number
  isBlacklisted: boolean
  displayName: string
}

interface UsePOSCustomerSearchResult {
  query: string
  setQuery: (value: string) => void
  results: POSCustomer[]
  isLoading: boolean
  isSearching: boolean
  hasMore: boolean
  totalCount: number
  error: string | null
  clear: () => void
  retry: () => void
}

// ═══════════════════════════════════════════════════════════════
//  ★ v1.2: نرمال‌سازی فارسی — یکسان‌سازی ي/ك عربی با ی/ک فارسی
//  این تابع تمام اشکال مشابه را به یک شکل استاندارد تبدیل می‌کند
// ═══════════════════════════════════════════════════════════════

function normalizeFa(text: string): string {
  if (!text) return ''
  return text
    // ي عربی → ی فارسی
    .replace(/\u064A/g, '\u06CC')
    // ك عربی → ک فارسی
    .replace(/\u0643/g, '\u06A9')
    // ؤ → و
    .replace(/\u0624/g, '\u0648')
    // إ و أ و آ → ا
    .replace(/[\u0625\u0623\u0622]/g, '\u0627')
    // ة → ه
    .replace(/\u0629/g, '\u0647')
    // حذف اعراب (فتحه، کسره، ضمّه، تنوین)
    .replace(/[\u064B-\u0652]/g, '')
    // حذف کشیده (ـ)
    .replace(/\u0640/g, '')
}

// ═══════════════════════════════════════════════════════════════
//  Cache درون‌حافظه‌ای
// ═══════════════════════════════════════════════════════════════

const searchCache = new Map<string, { results: POSCustomer[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE_SIZE = 50

function getFromCache(key: string): POSCustomer[] | null {
  const entry = searchCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    searchCache.delete(key)
    return null
  }
  return entry.results
}

function setInCache(key: string, results: POSCustomer[]) {
  if (searchCache.size >= MAX_CACHE_SIZE) {
    const firstKey = searchCache.keys().next().value
    if (firstKey) searchCache.delete(firstKey)
  }
  searchCache.set(key, { results, timestamp: Date.now() })
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function getTenantId(): string | null {
  try {
    const store = useStore.getState?.() as any
    if (store?.tenantId) return store.tenantId
    if (store?.user?.tenantId) return store.user.tenantId
    
    if (typeof window !== 'undefined') {
      const cookies = document.cookie.split(';').reduce((acc, c) => {
        const [k, v] = c.trim().split('=')
        acc[k] = v
        return acc
      }, {} as Record<string, string>)
      if (cookies.tenantId) return cookies.tenantId
      
      const stored = localStorage.getItem('tenantId')
      if (stored) return stored
    }
    return null
  } catch {
    return null
  }
}

function buildDisplayName(c: any): string {
  if (c.displayName) return c.displayName
  if (c.name) return c.name
  return `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'بدون نام'
}

function normalizeCustomer(c: any): POSCustomer {
  return {
    id: c.id,
    code: c.code || '',
    firstName: c.firstName || '',
    lastName: c.lastName || '',
    mobile: c.mobile || null,
    nationalCode: c.nationalCode || null,
    address: c.address || null,
    currentBalance: Number(c.currentBalance) || 0,
    isBlacklisted: Boolean(c.isBlacklisted),
    displayName: buildDisplayName(c),
  }
}

// ═══════════════════════════════════════════════════════════════
//  Hook اصلی
// ═══════════════════════════════════════════════════════════════

export function usePOSCustomerSearch(
  minChars: number = 2,
  debounceMs: number = 300,
  maxResults: number = 20,
  hideBlacklisted: boolean = true
): UsePOSCustomerSearchResult {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<POSCustomer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const getStoreCustomers = useCallback((): any[] => {
    try {
      const state = useStore.getState?.() as any
      return state?.customers || []
    } catch {
      return []
    }
  }, [])

  const doSearch = useCallback(async (searchTerm: string) => {
    const trimmed = searchTerm.trim()
    
    if (trimmed.length < minChars) {
      setResults([])
      setIsSearching(false)
      setError(null)
      return
    }

    // ★ v1.2: نرمال‌سازی عبارت جستجو قبل از ارسال به سرور
    const normalizedTerm = normalizeFa(trimmed)

    const tenantId = getTenantId()
    if (!tenantId) {
      setError('شناسه فروشگاه یافت نشد')
      setResults([])
      setIsSearching(false)
      return
    }

    const cacheKey = `${tenantId}:${normalizedTerm.toLowerCase()}`
    
    const cached = getFromCache(cacheKey)
    if (cached) {
      const filtered = hideBlacklisted ? cached.filter(c => !c.isBlacklisted) : cached
      setResults(filtered)
      setHasMore(filtered.length >= maxResults)
      setTotalCount(filtered.length)
      setIsSearching(false)
      setError(null)
      return
    }

    // ★ جستجوی آفلاین با نرمال‌سازی
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const storeCustomers = getStoreCustomers()
      const normalizedLower = normalizedTerm.toLowerCase()
      const filtered = storeCustomers
        .filter((c: any) => {
          if (hideBlacklisted && c.isBlacklisted) return false
          // ★ v1.2: نرمال‌سازی هر فیلد قبل از مقایسه
          const fullName = normalizeFa(`${c.firstName || ''} ${c.lastName || ''}`).toLowerCase()
          const mobile = c.mobile || ''
          const code = (c.code || '').toLowerCase()
          const nationalCode = c.nationalCode || ''
          return (
            fullName.includes(normalizedLower) ||
            mobile.includes(trimmed) ||
            code.includes(normalizedLower) ||
            nationalCode.includes(trimmed)
          )
        })
        .slice(0, maxResults)
        .map(normalizeCustomer)
      
      setResults(filtered)
      setHasMore(false)
      setTotalCount(filtered.length)
      setIsSearching(false)
      setError(null)
      return
    }

    // ★ جستجوی آنلاین — ارسال عبارت نرمال‌سازی شده به سرور
    setIsLoading(true)
    setError(null)

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    try {
      let res = await fetch(
        `/api/contacts?type=customer&search=${encodeURIComponent(normalizedTerm)}&tenantId=${encodeURIComponent(tenantId)}`,
        {
          signal: abortControllerRef.current.signal,
          headers: { 'Accept': 'application/json' }
        }
      )

      let data: any = null
      
      if (!res.ok) {
        res = await fetch(
          `/api/customers?search=${encodeURIComponent(normalizedTerm)}&tenantId=${encodeURIComponent(tenantId)}&limit=${maxResults}`,
          { signal: abortControllerRef.current.signal }
        )
      }

      if (res.ok) {
        data = await res.json()
      }

      if (data?.success) {
        const rawList = Array.isArray(data.data) 
          ? data.data 
          : (data.data?.customers || [])
        
        let normalized = rawList.map(normalizeCustomer)
        if (hideBlacklisted) {
          normalized = normalized.filter(c => !c.isBlacklisted)
        }
        
        setResults(normalized)
        setHasMore(normalized.length >= maxResults)
        setTotalCount(normalized.length)
        setInCache(cacheKey, normalized)
      } else {
        setResults([])
        setError(data?.error || 'خطا در جستجو')
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      console.error('[POSCustomerSearch] Error:', err)
      setError('خطا در اتصال به سرور')
      setResults([])
    } finally {
      setIsLoading(false)
      setIsSearching(false)
    }
  }, [minChars, maxResults, hideBlacklisted, getStoreCustomers])

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (query.trim().length < minChars) {
      setResults([])
      setIsSearching(false)
      setError(null)
      return
    }

    setIsSearching(true)
    timeoutRef.current = setTimeout(() => {
      doSearch(query)
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [query, debounceMs, minChars, doSearch])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    setError(null)
  }, [])

  const retry = useCallback(() => {
    doSearch(query)
  }, [query, doSearch])

  return {
    query,
    setQuery,
    results,
    isLoading,
    isSearching,
    hasMore,
    totalCount,
    error,
    clear,
    retry,
  }
}