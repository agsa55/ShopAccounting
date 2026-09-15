'use client'

// ============================================================================
// src/lib/site-content.ts
// Hooks برای Client — خواندن محتوا از API
// ============================================================================

import { useEffect, useState } from 'react'
import { DEFAULT_SITE_CONTENT, type SiteContent, type PlanTierData } from './site-content.types'

// Re-export types
export * from './site-content.types'

// ═══════════════════════════════════════════════════════════════
//  HOOK: خواندن قیمت‌ها و تخفیف‌ها از API
// ═══════════════════════════════════════════════════════════════
export function useSiteContent() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/site-content', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setContent({ ...DEFAULT_SITE_CONTENT, ...data.data })
        }
      })
      .catch(err => {
        console.warn('[SiteContent] API failed, using defaults:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  return { content, loading }
}

// ═══════════════════════════════════════════════════════════════
//  HOOK: برای پنل ادمین
// ═══════════════════════════════════════════════════════════════
export function useAdminSiteContent() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchContent = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/site-content', { cache: 'no-store' })
      const data = await res.json()
      if (data.success && data.data) {
        setContent({ ...DEFAULT_SITE_CONTENT, ...data.data })
      }
    } catch (err: any) {
      setError(err?.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }

  const saveContent = async (newContent: SiteContent) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/site-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newContent, updatedAt: new Date().toISOString() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setContent({ ...newContent, updatedAt: new Date().toISOString() })
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { fetchContent() }, [])

  return { content, setContent, loading, saving, error, saveContent }
}

// ═══════════════════════════════════════════════════════════════
//  HELPER: Merge قیمت‌های API با planTiers ثابت لاندینگ
//  فقط annualPrice, lifetimePrice, discountPercent را override می‌کند
// ═══════════════════════════════════════════════════════════════
export function mergePlansWithApi<T extends { name: string; annualPrice: number; lifetimePrice: number }>(
  staticPlans: T[],
  apiPlans: PlanTierData[]
): (T & { discountPercent: number })[] {
  return staticPlans.map(plan => {
    const apiPlan = apiPlans.find(p => p.name === plan.name)
    return {
      ...plan,
      annualPrice: apiPlan?.annualPrice ?? plan.annualPrice,
      lifetimePrice: apiPlan?.lifetimePrice ?? plan.lifetimePrice,
      discountPercent: apiPlan?.discountPercent ?? 0,
    }
  })
}