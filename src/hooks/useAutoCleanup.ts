// ============================================================================
// src/hooks/useAutoCleanup.ts — v1.1.0
// ★ پاکسازی خودکار لاگ‌های قدیمی (فقط ۲۴ ساعت)
// ★ v1.1.0: رفع مشکل پاک شدن سریع لاگ‌ها
// ============================================================================

import { useEffect, useRef } from 'react'
import { cleanupLogs } from '@/lib/system-logger'

/**
 * پاکسازی خودکار لاگ‌های قدیمی‌تر از ۲۴ ساعت
 * - هنگام لود اپ اجرا می‌شود (فقط یکبار)
 * - هر ۱ ساعت یکبار اجرا می‌شود
 * - از اجرای چندباره جلوگیری می‌کند
 */
export function useAutoCleanup() {
  const hasRunRef = useRef(false)

  useEffect(() => {
    // ★ فقط یکبار در هر session اجرا شود
    if (hasRunRef.current) return
    hasRunRef.current = true

    console.log('[AutoCleanup] 🧹 شروع پاکسازی اولیه لاگ‌ها...')
    
    // پاکسازی اولیه هنگام لود
    const cleaned = cleanupLogs()
    console.log(`[AutoCleanup] ✅ پاکسازی اولیه: ${cleaned} لاگ قدیمی حذف شد`)

    // ★ پاکسازی هر ۱ ساعت (به جای ۵ دقیقه)
    const interval = setInterval(() => {
      const cleanedCount = cleanupLogs()
      if (cleanedCount > 0) {
        console.log(`[AutoCleanup] 🧹 پاکسازی دوره‌ای: ${cleanedCount} لاگ قدیمی حذف شد`)
      }
    }, 60 * 60 * 1000) // 1 hour

    return () => {
      clearInterval(interval)
      console.log('[AutoCleanup] ⏹️ interval متوقف شد')
    }
  }, [])
}