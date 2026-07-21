// ============================================================================
// src/lib/cleanup-config.ts (v9.3.0 ★★★)
// ShopAccounting — Centralized Demo Cleanup Configuration
// ----------------------------------------------------------------------------
// ★★★ این فایل تمام تنظیمات پاکسازی خودکار دمو را در یک جا نگه می‌دارد.
//
// ★ روش‌های پاکسازی خودکار:
//   ۱. Cron Job خارجی (هر ساعت) — با CRON_SECRET
//   ۲. Auto-cleanup در startup سرور (instrumentation.ts)
//   ۳. Auto-cleanup هنگام ورود به داشبورد (silent background)
//   ۴. SQL Server Agent Job (پشتیبان)
// ============================================================================

/** مدت تست دمو به روز — ۳ روز = ۷۲ ساعت */
export const DEMO_DURATION_DAYS = 3

/** مدت تست دمو به ساعت — ۷۲ ساعت */
export const DEMO_DURATION_HOURS = 72

/** مدت اعتبار کد OTP دمو به دقیقه — ۱۰ دقیقه */
export const DEMO_OTP_EXPIRY_MINUTES = 10

/** مدت انتظار تکمیل ثبت‌نام دمو به دقیقه — ۳۰ دقیقه */
export const DEMO_PENDING_TIMEOUT_MINUTES = 30

/**
 * ★★★ فاصله بین اجرای پاکسازی خودکار (به میلی‌ثانیه)
 *
 * پیشنهاد: ۱ ساعت (60 * 60 * 1000)
 * برای تست: ۵ دقیقه (5 * 60 * 1000)
 *
 * ★ این مقدار برای:
 *   - auto-cleanup در startup
 *   - auto-cleanup هنگام ورود به داشبورد
 *   استفاده می‌شود.
 */
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000  // ۱ ساعت

/**
 * ★★★ حداکثر تعداد tenant هایی که در هر اجرای پاکسازی حذف می‌شوند
 *
 * این محدودیت برای جلوگیری از overload دیتابیس هنگام حذف تعداد زیادی tenant است.
 * اگر تعداد دموهای منقضی بیشتر از این مقدار باشد، در اجراهای بعدی حذف می‌شوند.
 */
export const MAX_CLEANUP_PER_RUN = 50

/**
 * ★★★ آیا پاکسازی خودکار در startup سرور فعال باشد؟
 *
 * اگر true باشد، هنگام شروع سرور (در instrumentation.ts)،
 * یک interval تنظیم می‌شود که هر CLEANUP_INTERVAL_MS یک‌بار پاکسازی را اجرا کند.
 */
export const ENABLE_AUTO_CLEANUP_ON_STARTUP = true

/**
 * ★★★ آیا پاکسازی خودکار هنگام ورود به داشبورد فعال باشد؟
 *
 * اگر true باشد، هنگام لود شدن داشبورد توسط هر کاربر،
 * یک درخواست silent به /api/demo/auto-cleanup ارسال می‌شود.
 * این درخواست در background اجرا می‌شود و کاربر چیزی نمی‌بیند.
 *
 * ★ این روش به‌خصوص مفید است اگر cron job تنظیم نشده باشد.
 */
export const ENABLE_AUTO_CLEANUP_ON_DASHBOARD = true

/**
 * ★★★ آیا لاگ‌های verbose پاکسازی فعال باشد؟
 *
 * اگر true باشد، جزئیات کامل هر حذف در کنسول سرور لاگ می‌شود.
 * برای production پیشنهاد می‌شود false باشد.
 */
export const VERBOSE_CLEANUP_LOGS = true

/**
 * ★★★ آیا هدر X-Cleanup-Count در response تنظیم شود؟
 *
 * اگر true باشد، تعداد tenant های حذف شده در هدر response تنظیم می‌شود
 * تا کلاینت بتواند آن را ببیند (مثلاً برای نمایش در پنل ادمین).
 */
export const SET_CLEANUP_COUNT_HEADER = true
