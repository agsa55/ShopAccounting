'use client'

// ============================================================================
// src/components/demo/auto-cleanup-trigger.tsx (v9.3.0 ★★★)
// ShopAccounting — Silent Auto-Cleanup Trigger Component
// ----------------------------------------------------------------------------
// ★★★ این کامپونند هیچ چیزی نمایش نمی‌دهد (rendered = null).
//   فقط هنگام لود شدن داشبورد، یک درخواست silent به /api/demo/auto-cleanup
//   ارسال می‌کند تا پاکسازی دموهای منقضی شده در background اجرا شود.
//
// ★ نحوه استفاده:
//   در app-shell.tsx یا dashboard-page.tsx، این کامپوننت را اضافه کنید:
//   <AutoCleanupTrigger />
//
// ★ این کامپوننت:
//   - هیچ UI نمایش نمی‌دهد
//   - هر ۱ ساعت یک‌بار درخواست می‌فرستد (نه در هر لود)
//   - در background اجرا می‌شود (کاربر چیزی نمی‌بیند)
// ============================================================================

import { useEffect } from 'react'

const TRIGGER_INTERVAL_MS = 60 * 60 * 1000  // ۱ ساعت
const STORAGE_KEY = 'lastAutoCleanupTrigger'

export function AutoCleanupTrigger() {
  useEffect(() => {
    // ★ بررسی آیا زمان اجرای پاکسازی فرا رسیده؟
    const lastTrigger = localStorage.getItem(STORAGE_KEY)
    const now = Date.now()

    if (lastTrigger) {
      const lastTime = parseInt(lastTrigger, 10)
      if (now - lastTime < TRIGGER_INTERVAL_MS) {
        // ★ هنوز زمان نشده، skip کن
        return
      }
    }

    // ★ ارسال درخواست silent به auto-cleanup endpoint
    const triggerCleanup = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/demo/auto-cleanup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          // ★ keepalive: true برای اطمینان از ارسال درخواست حتی اگر صفحه بسته شود
          keepalive: true,
        })

        if (res.ok) {
          // ★ به‌روزرسانی زمان آخرین اجرا
          localStorage.setItem(STORAGE_KEY, String(now))
          console.log('[AutoCleanupTrigger] ✅ Cleanup triggered successfully')
        }
      } catch (err) {
        // ★ خطا را silent نادیده بگیر (کاربر نباید ببیند)
        console.debug('[AutoCleanupTrigger] Failed (will retry later)')
      }
    }

    // ★ اجرای پاکسازی با تأخیر ۵ ثانیه (تا dashboard کامل لود شود)
    const timer = setTimeout(triggerCleanup, 5000)

    return () => clearTimeout(timer)
  }, [])

  // ★ هیچ چیزی نمایش نده
  return null
}
