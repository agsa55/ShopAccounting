'use client'

// ============================================================================
// src/components/sw-register.tsx — Service Worker Registration
// ثبت و مدیریت Service Worker برای قابلیت آفلاین
// ★ فیکس: فقط در production ثبت می‌شود (جلوگیری از حلقه رفرش در dev)
// ============================================================================

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'

export function ServiceWorkerRegister() {
  const { setOnline } = useAppStore()

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('[SW] Service Worker پشتیبانی نمی‌شود')
      return
    }

    // ★ فیکس: در محیط development اصلاً ثبت نمی‌کنیم
    // چون Turbopack مدام فایل‌ها رو rebuild می‌کنه و SW آپدیت میشه
    // → controllerchange → reload حلقه بی‌نهایت
    if (process.env.NODE_ENV === 'development') {
      console.log('[SW] ⏭️ Development mode — Service Worker ثبت نمی‌شود')

      // در dev فقط SW های قبلی رو unregister کن تا مشکلی نباشه
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister().then((success) => {
            if (success) {
              console.log('[SW] 🧹 SW قبلی unregister شد (dev mode)')
            }
          })
        })
      })

      return
    }

    // ★ فقط در production ثبت می‌کنیم
    // ثبت Service Worker
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] ✅ ثبت شد:', registration.scope)

        // بررسی بروزرسانی
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] 🔄 نسخه جدید در دسترس است')
              // می‌توانید نوتیفیکیشن نمایش دهید
            }
          })
        })
      })
      .catch((error) => {
        console.error('[SW] خطا در ثبت:', error)
      })

    // دریافت پیام از SW
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data?.type === 'TRIGGER_SYNC') {
        console.log('[SW] درخواست همگام‌سازی از SW')
        try {
          const { syncEngine } = await import('@/lib/sync-engine')
          await syncEngine.sync()
        } catch (err) {
          console.error('[SW] خطا در همگام‌سازی:', err)
        }
      }
    })
  }, [setOnline])

  return null
}

export default ServiceWorkerRegister