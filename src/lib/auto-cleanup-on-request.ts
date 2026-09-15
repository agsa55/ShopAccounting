// ============================================================================
// src/lib/auto-cleanup-on-request.ts (v1.0 ★★★)
// ShopAccounting — خودکار cleanup در هر request
// ----------------------------------------------------------------------------
// ★ این سیستم در هر request چک می‌کند آیا زمان cleanup فرا رسیده؟
// ★ اگر ۱۰ دقیقه گذشته باشد، cleanup را در background اجرا می‌کند
// ★ هیچ تأخیری برای کاربر ایجاد نمی‌کند
// ★ نیاز به cron job خارجی ندارد
// ============================================================================

let lastCleanupTime = 0
let isRunning = false

// ★ هر ۱۰ دقیقه یکبار cleanup اجرا شود
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

/**
 * بررسی و اجرای cleanup در صورت نیاز
 * این تابع باید در middleware یا API های پرکاربرد صدا زده شود
 */
export async function tryRunCleanupOnRequest(): Promise<void> {
  const now = Date.now()
  
  // اگر هنوز ۱۰ دقیقه نگذشته، skip کن
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
    return
  }
  
  // اگر cleanup در حال اجراست، skip کن (جلوگیری از اجرای همزمان)
  if (isRunning) {
    return
  }
  
  // علامت‌گذاری شروع اجرا
  isRunning = true
  lastCleanupTime = now
  
  try {
    // اجرای cleanup در background (بدون await)
    // این کار باعث می‌شود request کاربر بلاک نشود
    import('@/lib/demo-cleanup')
      .then(async ({ cleanupExpiredDemoTenants }) => {
        try {
          const result = await cleanupExpiredDemoTenants()
          if (result.deletedCount > 0) {
            console.log(
              `[AutoCleanup] 🧹 Background cleanup: ${result.deletedCount} tenants, ${result.totalRecordsDeleted} records`
            )
          }
        } catch (err: any) {
          console.error('[AutoCleanup] Background cleanup error:', err?.message)
        } finally {
          isRunning = false
        }
      })
      .catch((err) => {
        console.error('[AutoCleanup] Import error:', err)
        isRunning = false
      })
  } catch (err: any) {
    console.error('[AutoCleanup] Error:', err?.message)
    isRunning = false
  }
}