'use client'

// ============================================================================
// src/lib/use-demo-status.ts (v9.5.8 ★★★)
// ShopAccounting — Hook for checking demo tenant status
// ----------------------------------------------------------------------------
// ★★★ v9.5.8: رفع باگ محاسبه زمان دمو
//   - همیشه از expiresAt با Math.floor محاسبه می‌کنیم (نه از مقادیر سرور)
//   - سرور از Math.ceil استفاده می‌کند که باعث نمایش اشتباه می‌شود
//   - daysRemaining = تعداد کامل روزهای باقی‌مانده (گرد به پایین)
//   - hoursRemaining = ساعت‌های باقی‌مانده (۰ تا ۲۳)
// ============================================================================

import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'

interface DemoStatus {
  isDemo: boolean
  isExpired: boolean
  daysRemaining: number
  hoursRemaining: number
  expiresAt: string | null
  startedAt: string | null
  totalDays: number
}

interface DemoStatusState {
  status: DemoStatus | null
  loading: boolean
  isDemo: boolean
  isDemoLoading: boolean
}

const DEMO_DURATION_DAYS = 3
const CACHE_DURATION = 5 * 60 * 1000  // ۵ دقیقه

let cachedDemoStatus: DemoStatus | null = null
let lastFetchTime = 0

/**
 * تشخیص دمو بودن از user.tenantId یا tenant
 */
function checkIsDemo(user: any, tenant: any): boolean {
  // ★ روش ۱: user.tenantId
  if (user?.tenantId && typeof user.tenantId === 'string') {
    if (user.tenantId.startsWith('demo-') || user.tenantId.startsWith('demo_')) {
      return true
    }
  }
  // ★ روش ۲: tenant.status
  if (tenant?.status === 'demo' || tenant?.status === 'demo_pending') {
    return true
  }
  // ★ روش ۳: tenant.id
  if (tenant?.id && typeof tenant.id === 'string') {
    if (tenant.id.startsWith('demo-') || tenant.id.startsWith('demo_')) {
      return true
    }
  }
  return false
}

/**
 * ★★★ v9.5.8: محاسبه دقیق روز و ساعت باقی‌مانده
 *   از Math.floor استفاده می‌کنیم (گرد به پایین)
 *   مثال: ۲ روز و ۱۵.۷ ساعت → ۲ روز و ۱۵ ساعت
 *
 * @param expiresAtStr تاریخ انقضا (ISO string)
 * @returns { daysRemaining, hoursRemaining, isExpired }
 */
function calculateRemaining(expiresAtStr: string | null): { daysRemaining: number; hoursRemaining: number; isExpired: boolean } {
  if (!expiresAtStr) {
    return { daysRemaining: 0, hoursRemaining: 0, isExpired: false }
  }

  const now = new Date()
  const expiresAt = new Date(expiresAtStr)
  const isExpired = expiresAt < now

  if (isExpired) {
    return { daysRemaining: 0, hoursRemaining: 0, isExpired: true }
  }

  const diffMs = expiresAt.getTime() - now.getTime()
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60))  // ★ floor (گرد به پایین)
  const daysRemaining = Math.floor(totalHours / 24)          // ★ floor
  const hoursRemaining = totalHours % 24                     // ★ ۰ تا ۲۳

  return { daysRemaining, hoursRemaining, isExpired }
}

export function useDemoStatus(): DemoStatusState {
  const currentTenant = useAppStore((s) => s.currentTenant) as any
  const user = useAppStore((s) => s.user) as any
  const [status, setStatus] = useState<DemoStatus | null>(cachedDemoStatus)
  const [loading, setLoading] = useState<boolean>(false)

  const isDemo = checkIsDemo(user, currentTenant)

  useEffect(() => {
    if (!isDemo) {
      cachedDemoStatus = null
      setStatus(null)
      setLoading(false)
      return
    }

    // ★★★ v9.5.8: ابتدا از currentTenant محاسبه کن (اگر موجود باشد)
    const tenantExpiresAt = currentTenant?.expiresAt
    const tenantSoldAt = currentTenant?.soldAt

    if (tenantExpiresAt) {
      const { daysRemaining, hoursRemaining, isExpired } = calculateRemaining(tenantExpiresAt)
      const demoStatus: DemoStatus = {
        isDemo: true,
        isExpired,
        daysRemaining,
        hoursRemaining,
        expiresAt: new Date(tenantExpiresAt).toISOString(),
        startedAt: tenantSoldAt ? new Date(tenantSoldAt).toISOString() : null,
        totalDays: DEMO_DURATION_DAYS,
      }
      cachedDemoStatus = demoStatus
      lastFetchTime = Date.now()
      setStatus(demoStatus)
      setLoading(false)
      return
    }

    // ★★★ v9.5.8: اگر currentTenant null است، از API بگیر
    const now = Date.now()
    if (cachedDemoStatus && (now - lastFetchTime) < CACHE_DURATION) {
      setStatus(cachedDemoStatus)
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)

    const fetchDemoStatus = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const res = await fetch('/api/demo/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (!mounted) return

        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.isDemo) {
            // ★★★ v9.5.8: همیشه از expiresAt محاسبه کن (نه از مقادیر سرور)
            //   سرور از Math.ceil استفاده می‌کند که اشتباه است
            const { daysRemaining, hoursRemaining, isExpired } = calculateRemaining(data.data.expiresAt)
            const demoStatus: DemoStatus = {
              isDemo: true,
              isExpired,
              daysRemaining,
              hoursRemaining,
              expiresAt: data.data.expiresAt,
              startedAt: data.data.startedAt,
              totalDays: data.data.totalDays || DEMO_DURATION_DAYS,
            }
            cachedDemoStatus = demoStatus
            lastFetchTime = Date.now()
            setStatus(demoStatus)
          } else {
            cachedDemoStatus = null
            setStatus(null)
          }
        } else if (res.status === 410) {
          // ★ دمو منقضی شده
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token')
            localStorage.removeItem('refreshToken')
            localStorage.removeItem('user')
            window.location.href = '/?demo_expired=1'
          }
        } else {
          cachedDemoStatus = null
          setStatus(null)
        }
      } catch (err) {
        if (mounted) {
          // ★ اگر API خطا داد، حدس بزن که ۳ روز کامل مانده
          const demoStatus: DemoStatus = {
            isDemo: true,
            isExpired: false,
            daysRemaining: DEMO_DURATION_DAYS,
            hoursRemaining: 0,
            expiresAt: null,
            startedAt: null,
            totalDays: DEMO_DURATION_DAYS,
          }
          setStatus(demoStatus)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchDemoStatus()

    return () => {
      mounted = false
    }
  }, [isDemo, currentTenant])

  return {
    status,
    loading,
    isDemo,
    isDemoLoading: loading,
  }
}

export function clearDemoStatusCache(): void {
  cachedDemoStatus = null
  lastFetchTime = 0
}

export function isCurrentTenantDemo(): boolean {
  return cachedDemoStatus?.isDemo || false
}
