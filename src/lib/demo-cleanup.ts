// ============================================================================
// src/lib/demo-cleanup.ts (v9.3.0 ★★★)
// ShopAccounting — Advanced Demo Tenant Cleanup
// ----------------------------------------------------------------------------
// ★★★ این فایل شامل توابع پیشرفته پاکسازی tenant های دمو است:
//   - cleanupExpiredDemoTenants: پاکسازی تمام دموهای منقضی
//   - cleanupSpecificDemoTenant: پاکسازی یک tenant خاص
//   - getDemoCleanupStats: آمار دموهای فعال/منقضی
//   - shouldRunCleanup: آیا زمان اجرای پاکسازی فرا رسیده؟
//
// ★★★ ویژگی‌ها:
//   - حذف تمام جداول مرتبط (FK constraints)
//   - لاگ‌گذاری verbose (قابل کنترل با VERBOSE_CLEANUP_LOGS)
//   - محدودیت MAX_CLEANUP_PER_RUN برای جلوگیری از overload
//   - گزارش دقیق تعداد رکوردهای حذف شده
// ============================================================================

import { db } from '@/lib/db'
import {
  DEMO_DURATION_DAYS,
  DEMO_PENDING_TIMEOUT_MINUTES,
  MAX_CLEANUP_PER_RUN,
  VERBOSE_CLEANUP_LOGS,
} from '@/lib/cleanup-config'

// ─── Types ──────────────────────────────────────────────────────────────

export interface CleanupResult {
  success: boolean
  deletedCount: number
  totalRecordsDeleted: number
  details: Array<{
    tenantId: string
    subDomain: string
    companyName: string
    reason: 'demo_expired' | 'demo_pending_timeout'
    recordsDeleted: number
    durationMs: number
  }>
  errors: Array<{
    tenantId: string
    error: string
  }>
  totalDurationMs: number
}

export interface CleanupStats {
  totalDemoTenants: number
  activeDemoTenants: number
  expiredDemoTenants: number
  pendingDemoTenants: number
  pendingTimeoutTenants: number
}

// ─── Helper: لاگ‌گذاری ─────────────────────────────────────────────────

function log(message: string, ...args: any[]) {
  if (VERBOSE_CLEANUP_LOGS) {
    console.log(`[DemoCleanup] ${message}`, ...args)
  }
}

function logError(message: string, ...args: any[]) {
  console.error(`[DemoCleanup] ❌ ${message}`, ...args)
}

// ─── بررسی نیاز به پاکسازی ─────────────────────────────────────────────

let lastCleanupTime = 0

/**
 * آیا زمان اجرای پاکسازی فرا رسیده؟
 * (برای جلوگیری از اجرای مکرر)
 */
export function shouldRunCleanup(intervalMs: number): boolean {
  const now = Date.now()
  if (now - lastCleanupTime < intervalMs) {
    return false
  }
  return true
}

/**
 * به‌روزرسانی زمان آخرین پاکسازی
 */
export function markCleanupRun(): void {
  lastCleanupTime = Date.now()
}

// ─── پاکسازی یک tenant خاص ──────────────────────────────────────────────

/**
 * حذف کامل یک tenant دمو و تمام داده‌های مرتبط
 *
 * ★ این تابع تمام جداول مرتبط با tenant را پاک می‌کند.
 * ★★★ این عملیات غیرقابل بازگشت است!
 */
export async function cleanupSpecificDemoTenant(
  tenantId: string,
  reason: 'demo_expired' | 'demo_pending_timeout' | 'manual' = 'manual'
): Promise<{ success: boolean; recordsDeleted: number; error?: string }> {
  const startTime = Date.now()
  log(`Cleaning up tenant: ${tenantId} (reason: ${reason})`)

  let recordsDeleted = 0

  try {
    // ★ ۱. بررسی اینکه Tenant واقعاً دمو است
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        subDomain: true,
        companyName: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    if (!tenant) {
      log(`Tenant not found: ${tenantId}`)
      return { success: false, recordsDeleted: 0, error: 'TENANT_NOT_FOUND' }
    }

    // ★ فقط tenant های دمو یا demo_pending را حذف کن
    if (tenant.status !== 'demo' && tenant.status !== 'demo_pending') {
      logError(`Tenant is not a demo, refusing to delete: ${tenantId} (status: ${tenant.status})`)
      return { success: false, recordsDeleted: 0, error: 'NOT_A_DEMO_TENANT' }
    }

    log(`Cleaning up demo tenant:`, {
      id: tenant.id,
      subDomain: tenant.subDomain,
      companyName: tenant.companyName,
      status: tenant.status,
    })

    // ★ ۲. حذف به ترتیب (به دلیل FK constraints)
    //   تمام جداول مرتبط با tenantId
    //
    // ★★★ ترتیب حذف مهم است:
    //   ۱. جداول وابسته (که FK به tenant دارند)
    //   ۲. جداول مستقل
    //   ۳. خود Tenant

    const tablesToDelete = [
      // ★ جداول پرداخت و اشتراک
      { name: 'subscriptionPayments', model: 'subscriptionPayments' },
      { name: 'subscriptions', model: 'subscriptions' },

      // ★ جداول کاربران
      { name: 'userLookups', model: 'userLookups' },
      { name: 'storeUser', model: 'storeUser' },

      // ★ جداول OTP
      { name: 'otpCode', model: 'otpCode' },

      // ★ جداول حسابداری
      { name: 'fiscalYear', model: 'fiscalYear' },
      { name: 'journalEntry', model: 'journalEntry' },
      { name: 'account', model: 'account' },

      // ★ جداول فروش
      { name: 'invoice', model: 'invoice' },
      { name: 'invoiceItem', model: 'invoiceItem' },
      { name: 'invoicePayment', model: 'invoicePayment' },
      { name: 'installmentPlan', model: 'installmentPlan' },
      { name: 'installmentSchedule', model: 'installmentSchedule' },

      // ★ جداول خرید
      { name: 'purchaseInvoice', model: 'purchaseInvoice' },
      { name: 'purchaseInvoiceItem', model: 'purchaseInvoiceItem' },

      // ★ جداول انبارداری
      { name: 'stockMovement', model: 'stockMovement' },
      { name: 'stockLevel', model: 'stockLevel' },
      { name: 'stockCount', model: 'stockCount' },
      { name: 'warehouse', model: 'warehouse' },

      // ★ جداول محصولات
      { name: 'product', model: 'product' },
      { name: 'category', model: 'category' },
      { name: 'unit', model: 'unit' },

      // ★ جداول طرفین حساب
      { name: 'customer', model: 'customer' },
      { name: 'supplier', model: 'supplier' },

      // ★ جداول تنظیمات
      { name: 'storeSetting', model: 'storeSetting' },
      { name: 'paymentGateway', model: 'paymentGateway' },
      { name: 'posDevice', model: 'posDevice' },
      { name: 'smsSettings', model: 'smsSettings' },
      { name: 'smsLog', model: 'smsLog' },
      { name: 'moidianSettings', model: 'moidianSettings' },

      // ★ جداول شعب
      { name: 'branch', model: 'branch' },

      // ★ جداول چک و دارایی
      { name: 'check', model: 'check' },
      { name: 'fixedAsset', model: 'fixedAsset' },
      { name: 'initialBalance', model: 'initialBalance' },

      // ★ جداول تیکت
      { name: 'ticket', model: 'ticket' },
      { name: 'ticketMessage', model: 'ticketMessage' },

      // ★ جداول پرداخت آنلاین
      { name: 'onlinePayment', model: 'onlinePayment' },
      { name: 'cardPayment', model: 'cardPayment' },

      // ★ جداول Audit
      { name: 'auditLogs', model: 'auditLogs' },

      // ★ جداول بکاپ
      { name: 'backup', model: 'backup' },
    ]

    for (const { name, model } of tablesToDelete) {
      try {
        const r = await (db.client as any)[model].deleteMany({ where: { tenantId } })
        if (r.count > 0) {
          recordsDeleted += r.count
          log(`  ✓ Deleted ${r.count} records from ${name}`)
        }
      } catch (err: any) {
        // ★ برخی جداول ممکن است وجود نداشته باشند یا FK متفاوت داشته باشند
        // فقط لاگ کن و ادامه بده
        log(`  ⚠ ${name} delete skipped: ${err?.message}`)
      }
    }

    // ★ ۳. حذف خود Tenant
    try {
      await db.client.tenant.delete({ where: { id: tenantId } })
      recordsDeleted += 1
      log(`  ✓ Tenant deleted: ${tenantId}`)
    } catch (err: any) {
      logError(`Failed to delete tenant ${tenantId}:`, err?.message)
      return { success: false, recordsDeleted, error: err?.message }
    }

    const durationMs = Date.now() - startTime
    log(`✅ Cleanup completed for ${tenantId}: ${recordsDeleted} records in ${durationMs}ms`)

    return { success: true, recordsDeleted }
  } catch (error: any) {
    logError(`Cleanup error for ${tenantId}:`, error?.message)
    return { success: false, recordsDeleted, error: error?.message }
  }
}

// ─── پاکسازی تمام دموهای منقضی ───────────────────────────────────────────

/**
 * پیدا کردن و حذف تمام tenant های دمو منقضی شده
 *
 * ★ این تابع باید توسط cron job یا auto-cleanup صدا زده شود.
 * ★ همچنین tenant های demo_pending که بیش از ۳۰ دقیقه طول کشیده‌اند را هم حذف می‌کند.
 *
 * @returns گزارش کامل پاکسازی
 */
export async function cleanupExpiredDemoTenants(): Promise<CleanupResult> {
  const startTime = Date.now()
  log('═══════════════════════════════════════════════════════════════')
  log('🧹 Starting cleanup of expired demo tenants...')
  log('═══════════════════════════════════════════════════════════════')

  const now = new Date()
  const pendingTimeout = new Date(now.getTime() - DEMO_PENDING_TIMEOUT_MINUTES * 60 * 1000)

  const result: CleanupResult = {
    success: true,
    deletedCount: 0,
    totalRecordsDeleted: 0,
    details: [],
    errors: [],
    totalDurationMs: 0,
  }

  try {
    // ★ ۱. پیدا کردن tenant های demo منقضی شده
    const expiredDemos = await db.client.tenant.findMany({
      where: {
        status: 'demo',
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        subDomain: true,
        companyName: true,
        expiresAt: true,
        createdAt: true,
      },
      take: MAX_CLEANUP_PER_RUN,  // ★ محدودیت برای جلوگیری از overload
      orderBy: { expiresAt: 'asc' },  // ★ قدیمی‌ترین‌ها اول
    })

    log(`Found ${expiredDemos.length} expired demo tenants (limit: ${MAX_CLEANUP_PER_RUN})`)

    // ★ ۲. پیدا کردن tenant های demo_pending که بیش از ۳۰ دقیقه طول کشیده‌اند
    const expiredPending = await db.client.tenant.findMany({
      where: {
        status: 'demo_pending',
        createdAt: { lt: pendingTimeout },
      },
      select: {
        id: true,
        subDomain: true,
        companyName: true,
        createdAt: true,
      },
      take: MAX_CLEANUP_PER_RUN,
      orderBy: { createdAt: 'asc' },
    })

    log(`Found ${expiredPending.length} expired demo_pending tenants (timeout: ${DEMO_PENDING_TIMEOUT_MINUTES} min)`)

    // ★ ۳. حذف تک‌تک tenant های demo منقضی شده
    for (const t of expiredDemos) {
      const tenantStartTime = Date.now()
      const cleanupResult = await cleanupSpecificDemoTenant(t.id, 'demo_expired')
      const tenantDurationMs = Date.now() - tenantStartTime

      if (cleanupResult.success) {
        result.deletedCount++
        result.totalRecordsDeleted += cleanupResult.recordsDeleted
        result.details.push({
          tenantId: t.id,
          subDomain: t.subDomain,
          companyName: t.companyName || '(بدون نام)',
          reason: 'demo_expired',
          recordsDeleted: cleanupResult.recordsDeleted,
          durationMs: tenantDurationMs,
        })
      } else {
        result.errors.push({
          tenantId: t.id,
          error: cleanupResult.error || 'UNKNOWN_ERROR',
        })
      }
    }

    // ★ ۴. حذف تک‌تک tenant های demo_pending منقضی شده
    for (const t of expiredPending) {
      const tenantStartTime = Date.now()
      const cleanupResult = await cleanupSpecificDemoTenant(t.id, 'demo_pending_timeout')
      const tenantDurationMs = Date.now() - tenantStartTime

      if (cleanupResult.success) {
        result.deletedCount++
        result.totalRecordsDeleted += cleanupResult.recordsDeleted
        result.details.push({
          tenantId: t.id,
          subDomain: t.subDomain,
          companyName: t.companyName || '(بدون نام)',
          reason: 'demo_pending_timeout',
          recordsDeleted: cleanupResult.recordsDeleted,
          durationMs: tenantDurationMs,
        })
      } else {
        result.errors.push({
          tenantId: t.id,
          error: cleanupResult.error || 'UNKNOWN_ERROR',
        })
      }
    }

    result.totalDurationMs = Date.now() - startTime

    // ★ ۵. به‌روزرسانی زمان آخرین پاکسازی
    markCleanupRun()

    log('═══════════════════════════════════════════════════════════════')
    log(`✅ Cleanup completed!`)
    log(`   • Tenants deleted: ${result.deletedCount}`)
    log(`   • Total records deleted: ${result.totalRecordsDeleted}`)
    log(`   • Errors: ${result.errors.length}`)
    log(`   • Duration: ${result.totalDurationMs}ms`)
    log('═══════════════════════════════════════════════════════════════')

    return result
  } catch (error: any) {
    result.success = false
    result.totalDurationMs = Date.now() - startTime
    logError('Fatal error during cleanup:', error?.message)
    return result
  }
}

// ─── آمار دموها ─────────────────────────────────────────────────────────

/**
 * دریافت آمار tenant های دمو
 *
 * @returns آمار کامل دموهای فعال، منقضی، و در انتظار
 */
export async function getDemoCleanupStats(): Promise<CleanupStats> {
  const now = new Date()
  const pendingTimeout = new Date(now.getTime() - DEMO_PENDING_TIMEOUT_MINUTES * 60 * 1000)

  try {
    const [totalDemo, activeDemo, expiredDemo, pendingDemo, pendingTimeoutDemo] = await Promise.all([
      db.client.tenant.count({ where: { status: { in: ['demo', 'demo_pending'] } } }),
      db.client.tenant.count({
        where: {
          status: 'demo',
          expiresAt: { gte: now },
        },
      }),
      db.client.tenant.count({
        where: {
          status: 'demo',
          expiresAt: { lt: now },
        },
      }),
      db.client.tenant.count({ where: { status: 'demo_pending' } }),
      db.client.tenant.count({
        where: {
          status: 'demo_pending',
          createdAt: { lt: pendingTimeout },
        },
      }),
    ])

    return {
      totalDemoTenants: totalDemo,
      activeDemoTenants: activeDemo,
      expiredDemoTenants: expiredDemo,
      pendingDemoTenants: pendingDemo,
      pendingTimeoutTenants: pendingTimeoutDemo,
    }
  } catch (error: any) {
    logError('Error getting cleanup stats:', error?.message)
    return {
      totalDemoTenants: 0,
      activeDemoTenants: 0,
      expiredDemoTenants: 0,
      pendingDemoTenants: 0,
      pendingTimeoutTenants: 0,
    }
  }
}
