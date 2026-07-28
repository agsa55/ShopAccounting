// ============================================================================
// src/instrumentation.ts (v9.3.0 ★★★)
// ShopAccounting — Server Instrumentation & Auto-Cleanup
// ----------------------------------------------------------------------------
// ★★★ v9.3.0: اضافه شدن auto-cleanup برای پاکسازی خودکار دموهای منقضی
//
// ★ کارهای انجام‌شده:
//   ۱. راه‌اندازی Redis (اگر وجود دارد)
//   ۲. ★★★ تنظیم auto-cleanup interval برای پاکسازی دموهای منقضی
//   ۳. تنظیم graceful shutdown
// ============================================================================

let isInitialized = false;

export async function register() {
  if (isInitialized) return;
  isInitialized = true;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server...')

    try {
      const { isRedisAvailable } = await import('@/lib/redis')
      const redisAvailable = await isRedisAvailable()
      console.log(`[Instrumentation] Redis: ${redisAvailable ? '✅ Connected' : '⚠️  Not available (caching disabled)'}`)

      // ★ فقط در Production و فقط اگر Redis در دسترس باشد Workerها اجرا شوند
     /*
      if (process.env.NODE_ENV === 'production' && redisAvailable) {
        const { startInvoiceWorker } = await import('@/lib/jobs/invoice.job')
        const { startNotificationWorker } = await import('@/lib/jobs/notification.job')
        startInvoiceWorker()
        startNotificationWorker()
        console.log('[Instrumentation] ✅ Background workers started')
      } else {
        console.log('[Instrumentation] ⏭️  Workers not started (no Redis or dev mode)')
      }
        */

      // ═══════════════════════════════════════════════════════════════
      //  ★★★ v9.3.0: Auto-Cleanup برای پاکسازی خودکار دموهای منقضی
      // ═══════════════════════════════════════════════════════════════
      try {
        const { cleanupExpiredDemoTenants } = await import('@/lib/demo-cleanup')
        const {
          CLEANUP_INTERVAL_MS,
          ENABLE_AUTO_CLEANUP_ON_STARTUP,
        } = await import('@/lib/cleanup-config')

        if (ENABLE_AUTO_CLEANUP_ON_STARTUP) {
          console.log(`[Instrumentation] 🧹 Auto-cleanup enabled (interval: ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes)`)

          // ★★★ اجرای پاکسازی بلافاصله پس از startup
          //   (برای پاکسازی دموهای منقضی شده در زمان توقف سرور)
          setTimeout(async () => {
            try {
              console.log('[Instrumentation] 🧹 Running initial cleanup on startup...')
              const result = await cleanupExpiredDemoTenants()
              console.log(`[Instrumentation] 🧹 Initial cleanup: ${result.deletedCount} tenants deleted, ${result.totalRecordsDeleted} records removed`)
            } catch (err) {
              console.error('[Instrumentation] 🧹 Initial cleanup error:', (err as Error).message)
            }
          }, 10000) // ★ ۱۰ ثانیه بعد از startup (برای اطمینان از آماده بودن دیتابیس)

          // ★★★ تنظیم interval برای پاکسازی دوره‌ای (هر ۱ ساعت)
          setInterval(async () => {
            try {
              const result = await cleanupExpiredDemoTenants()
              if (result.deletedCount > 0) {
                console.log(`[Instrumentation] 🧹 Periodic cleanup: ${result.deletedCount} tenants deleted, ${result.totalRecordsDeleted} records removed`)
              }
            } catch (err) {
              console.error('[Instrumentation] 🧹 Periodic cleanup error:', (err as Error).message)
            }
          }, CLEANUP_INTERVAL_MS)

          console.log('[Instrumentation] ✅ Auto-cleanup scheduled')
        } else {
          console.log('[Instrumentation] ⚠️ Auto-cleanup disabled (ENABLE_AUTO_CLEANUP_ON_STARTUP=false)')
        }
      } catch (err) {
        console.error('[Instrumentation] ❌ Failed to setup auto-cleanup:', (err as Error).message)
      }
      // ═══════════════════════════════════════════════════════════════

      const { disconnectRedis } = await import('@/lib/redis')
      const { closeAllQueues } = await import('@/lib/queue')

      const gracefulShutdown = async (signal: string) => {
        console.log(`[Instrumentation] Received ${signal}, shutting down gracefully...`)
        try {
          await closeAllQueues()
          await disconnectRedis()
          console.log('[Instrumentation] ✅ Graceful shutdown complete')
        } catch (error) {
          console.error('[Instrumentation] Error during shutdown:', error)
        }
        process.exit(0)
      }

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
      process.on('SIGINT', () => gracefulShutdown('SIGINT'))

      console.log('[Instrumentation] ✅ Server initialized')
    } catch (error) {
      console.error('[Instrumentation] ❌ Initialization error:', error)
    }
  }
}
