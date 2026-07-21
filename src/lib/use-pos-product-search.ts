'use client'

// ============================================================================
// src/lib/use-pos-product-search.ts — Lazy product search hook (v6.1.1)
// ----------------------------------------------------------------------------
// ★ hook اختصاصی POS که جایگزینِ بارگذاریِ «همه محصولات» می‌شود.
// ★ سه مود:
//   1) lookupByBarcode(barcode) → تک‌محصول (instant, برای اسکنر)
//   2) lookupByCode(code)       → تک‌محصول
//   3) search(q)                → لیست (debounced 350ms, min 2 chars)
// ★ وضعیت: idle / searching / success / error / not-found
// ============================================================================
// ★★★ v6.1.1 رفع باگ:
//   ★ API جدید به‌صورت { success, data: [...] } برمی‌گرداند (نه data.products)
//   ★ حالا هم آرایه مستقیم و هم data.products پشتیبانی می‌شود (compatibility)
//   ★ افزودن tenantId به درخواست‌ها
//   ★ افزودن پارامتر q همزمان با search (compatibility با API قدیمی)
//   ★ بهبورسانی lookupByBarcode/ByCode برای پاسخ آرایه‌ای
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'

export interface PosProduct {
  id: string
  code: string
  barcode: string | null
  name: string
  categoryId: string | null
  unitId?: string | null
  purchasePrice: number
  salePrice: number
  taxRate: number
  currentStock: number
  minStock: number
  isActive: boolean
  category?: { id: string; name: string } | null
  unit?: { id: string; name: string; nameFa: string; symbol: string | null } | null
}

export type LookupStatus = 'idle' | 'searching' | 'success' | 'not-found' | 'error'

interface UsePosProductSearchReturn {
  // search state
  searchQuery: string
  setSearchQuery: (q: string) => void
  searchResults: PosProduct[]
  searchStatus: LookupStatus

  // barcode lookup (instant)
  lookupByBarcode: (barcode: string) => Promise<PosProduct | null>
  lookupByCode: (code: string) => Promise<PosProduct | null>

  // recent products (کش شده در حافظه hook — برای نمایش پیش‌فرض)
  recents: PosProduct[]
  loadRecents: () => Promise<void>
  recentsLoading: boolean

  // cache برای جلوگیری از درخواست تکراری
  cacheRef: React.MutableRefObject<Map<string, PosProduct[]>>
}

// ═══════════════════════════════════════════════════════════════
//  Helper: دریافت tenantId از store/localStorage
//  این تابع tenantId را از چند منبع امتحان می‌کند تا با معماری‌های
//  مختلف Zustand سازگار باشد.
// ═══════════════════════════════════════════════════════════════
function getTenantIdFromStore(): string | null {
  // ★ تلاش ۱: متغیر global (اگر store در window ثبت شده باشد)
  try {
    const useStore = (window as any).__POS_STORE__ || (window as any).__APP_STORE__
    if (useStore?.getState) {
      const state = useStore.getState()
      return state.tenantId || state.user?.tenantId || state.currentTenant?.id || null
    }
  } catch {}

  // ★ تلاش ۲: localStorage
  try {
    const userStr = localStorage.getItem('user') || localStorage.getItem('currentUser')
    if (userStr) {
      const user = JSON.parse(userStr)
      return user.tenantId || user.user?.tenantId || null
    }
  } catch {}

  // ★ تلاش ۳: currentTenant در localStorage
  try {
    const tenantStr = localStorage.getItem('currentTenant')
    if (tenantStr) {
      const tenant = JSON.parse(tenantStr)
      return tenant.id || null
    }
  } catch {}

  return null
}

// ═══════════════════════════════════════════════════════════════
//  Helper: استخراج آرایه محصولات از پاسخ API
//  API جدید: { success: true, data: [...] }
//  API قدیمی: { success: true, data: { products: [...] } }
//  هر دو حالت پشتیبانی می‌شود.
// ═══════════════════════════════════════════════════════════════
function extractProducts(json: any): PosProduct[] {
  if (!json) return []
  const data = json.data
  if (!data) return []

  // ★ حالت ۱: data مستقیماً آرایه است (API جدید)
  if (Array.isArray(data)) return data

  // ★ حالت ۲: data.products آرایه است (API قدیمی)
  if (Array.isArray(data.products)) return data.products

  // ★ حالت ۳: data.product یک آبجکت است (lookup با بارکد/کد)
  if (data.product && typeof data.product === 'object') return [data.product]

  return []
}

export function usePosProductSearch(): UsePosProductSearchReturn {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PosProduct[]>([])
  const [searchStatus, setSearchStatus] = useState<LookupStatus>('idle')
  const [recents, setRecents] = useState<PosProduct[]>([])
  const [recentsLoading, setRecentsLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cacheRef = useRef<Map<string, PosProduct[]>>(new Map())
  const reqIdRef = useRef(0)

  // ─── جستجوی debounced ────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim()

    // پاکسازی دیباندس قبلی
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    // اگر کوئری خالی یا کوتاه است → ریست
    if (q.length < 2) {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setSearchResults([])
      setSearchStatus('idle')
      return
    }

    // چک کش
    const cached = cacheRef.current.get(q)
    if (cached) {
      setSearchResults(cached)
      setSearchStatus('success')
      return
    }

    setSearchStatus('searching')

    debounceRef.current = setTimeout(async () => {
      // کنسل کردن درخواست قبلی
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const myReqId = ++reqIdRef.current

      try {
        const tenantId = getTenantIdFromStore()
        const params = new URLSearchParams({
          search: q,
          q: q,  // ★ ارسال هر دو پارامتر برای compatibility
          limit: '30',
        })
        if (tenantId) params.set('tenantId', tenantId)

        const res = await fetch(
          `/api/products/lookup?${params.toString()}`,
          { signal: controller.signal }
        )

        // اگر درخواست قدیمی است، نادیده بگیر
        if (myReqId !== reqIdRef.current) return

        if (!res.ok) {
          setSearchResults([])
          setSearchStatus('error')
          return
        }

        const json = await res.json()
        if (myReqId !== reqIdRef.current) return

        if (json.success) {
          // ★★★ v6.1.1: استخراج آرایه از پاسخ (هم آرایه مستقیم، هم data.products)
          const products = extractProducts(json)
          cacheRef.current.set(q, products)
          setSearchResults(products)
          setSearchStatus(products.length === 0 ? 'not-found' : 'success')
        } else {
          setSearchResults([])
          setSearchStatus('error')
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        if (myReqId !== reqIdRef.current) return
        setSearchResults([])
        setSearchStatus('error')
      }
    }, 350)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  // ─── lookupByBarcode — فوری، بدون دیباندس ────────────────────────
  const lookupByBarcode = useCallback(async (barcode: string): Promise<PosProduct | null> => {
    const b = barcode.trim()
    if (!b) return null

    try {
      const tenantId = getTenantIdFromStore()
      const params = new URLSearchParams({ barcode: b })
      if (tenantId) params.set('tenantId', tenantId)

      const res = await fetch(`/api/products/lookup?${params.toString()}`)
      if (!res.ok) return null
      const json = await res.json()

      // ★★★ v6.1.1: استخراج محصول از آرایه (API جدید) یا آبجکت (API قدیمی)
      const products = extractProducts(json)
      return products.length > 0 ? products[0] : null
    } catch {
      return null
    }
  }, [])

  const lookupByCode = useCallback(async (code: string): Promise<PosProduct | null> => {
    const c = code.trim()
    if (!c) return null

    try {
      const tenantId = getTenantIdFromStore()
      const params = new URLSearchParams({ code: c })
      if (tenantId) params.set('tenantId', tenantId)

      const res = await fetch(`/api/products/lookup?${params.toString()}`)
      if (!res.ok) return null
      const json = await res.json()

      // ★★★ v6.1.1: استخراج محصول از آرایه (API جدید) یا آبجکت (API قدیمی)
      const products = extractProducts(json)
      return products.length > 0 ? products[0] : null
    } catch {
      return null
    }
  }, [])

  // ─── loadRecents — ۲۰ محصول اخیراً فروخته‌شده ─────────────────────
  // ★★★ v3.36.1: ref برای جلوگیری از re-fetch تکراری و رفع infinite loop
  const recentsLoadedRef = useRef(false)
  const loadRecents = useCallback(async () => {
    // ★ اگر قبلاً لود شده، دوباره لود نکن — جلوگیری از loop در re-render
    if (recentsLoadedRef.current) return
    recentsLoadedRef.current = true

    setRecentsLoading(true)
    try {
      const tenantId = getTenantIdFromStore()
      const params = new URLSearchParams({ limit: '20', sort: 'recent' })
      if (tenantId) params.set('tenantId', tenantId)

      const res = await fetch(`/api/products?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          // ★★★ v6.1.1: استخراج آرایه از پاسخ (هم آرایه مستقیم، هم data.products)
          const prods = extractProducts(json)
          setRecents(prods.slice(0, 20))
          return
        }
      }
      // ★ fallback: اگر endpoint recents پشتیبانی نشد، خالی بگذار
      setRecents([])
    } catch {
      setRecents([])
    } finally {
      setRecentsLoading(false)
    }
  }, [])

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchStatus,
    lookupByBarcode,
    lookupByCode,
    recents,
    loadRecents,
    recentsLoading,
    cacheRef,
  }
}
