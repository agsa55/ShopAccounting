// ============================================================================
// src/app/portal/page.tsx — Portal Entry Point (v1.0 ★★★)
// ShopAccounting — صفحه ورود به پورتال مشتری
// ============================================================================

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PortalEntryPage() {
  const router = useRouter()

  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('portal_token') : null

    if (savedToken) {
      console.log('[Portal Entry] Found portal_token, redirecting...')
      router.replace(`/portal/${savedToken}`)
      return
    }

    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)portal_token=([^;]+)/)
      if (match) {
        const cookieToken = decodeURIComponent(match[1])
        console.log('[Portal Entry] Found portal_token in cookie, redirecting...')
        localStorage.setItem('portal_token', cookieToken)
        router.replace(`/portal/${cookieToken}`)
        return
      }
    }

    console.log('[Portal Entry] No portal_token found, redirecting to home')
    router.replace('/')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50" dir="rtl">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">در حال هدایت به پورتال مشتری...</p>
      </div>
    </div>
  )
}