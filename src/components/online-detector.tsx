'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'

/**
 * تشخیص وضعیت آنلاین/آفلاین
 *
 * ★ v2.0: اولویت با navigator.onLine هست
 * ★ پینگ /api/health فقط وقتی navigator.onLine = true امتحان میشه
 * ★ اگر /api/health وجود نداشته باشه (404)، وضعیت آنلاین تغییر نمیکنه
 * ★ فقط وقتی navigator.onLine = true ولی سرور واقعاً دسترسی نداره، آفلاین نشون میده
 */
export function OnlineDetector() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const setOnline = useStore.getState().setOnline

    // ─── بروزرسانی اولیه ───
    setOnline(navigator.onLine)

    // ─── گوش دادن به رویدادهای مرورگر ───
    const handleOnline = () => {
      setOnline(true)
    }

    const handleOffline = () => {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // ─── بررسی وضعیت سرور (اختیاری) ───
    let isChecking = false

    const checkServerHealth = async () => {
      if (isChecking || !navigator.onLine) return
      isChecking = true

      try {
        const res = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(5000), // تایم‌اوت ۵ ثانیه
        })

        // اگر سرور پاسخ داد (حتی 404)، یعنی سرور در دسترسه
        // فقط خطای شبکه (fetch throw) یعنی سرور واقعاً دسترسی نداره
        if (navigator.onLine) {
          setOnline(true)
        }
      } catch {
        // خطای شبکه — فقط اگر navigator.onLine هم true هست ولی سرور دسترسی نداره
        if (navigator.onLine) {
          // ممکنه سرور واقعاً قطع باشه ولی اینترنت وصل باشه
          // آفلاین نمیکنیم چون کاربر هنوز میتونه به صف همگام‌سازی آیتم اضافه کنه
          // console.warn('[OnlineDetector] Server health check failed, but browser reports online')
        }
      } finally {
        isChecking = false
      }
    }

    // هر ۳۰ ثانیه یکبار بررسی وضعیت سرور
    const interval = setInterval(checkServerHealth, 30000)

    // اولین بررسی بعد از ۵ ثانیه (تا صفحه کامل لود بشه اول)
    const initialTimeout = setTimeout(checkServerHealth, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
      clearTimeout(initialTimeout)
    }
  }, [])

  return null // این کامپوننت هیچ UI نداره
}
