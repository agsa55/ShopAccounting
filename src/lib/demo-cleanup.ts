// ============================================================================
// src/lib/demo-cleanup.ts (v9.4.1 ★★★)
// ShopAccounting — Advanced Demo Tenant Cleanup
// ----------------------------------------------------------------------------
// ★★★ v9.4.1: اصلاح خطای tablesToDelete + بهبود حذف جداول relation-based
// ★★★ v9.4.0: اضافه شدن پاکسازی pending_payment های رها شده
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
  abandonedPayments: number
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

export function shouldRunCleanup(intervalMs: number): boolean {
  const now = Date.now()
  if (now - lastCleanupTime < intervalMs) {
    return false
  }
  return true
}

export function markCleanupRun(): void {
  lastCleanupTime = Date.now()
}

// ─── پاکسازی یک tenant خاص ──────────────────────────────────────────────

export async function cleanupSpecificDemoTenant(
  tenantId: string,
  reason: 'demo_expired' | 'demo_pending_timeout' | 'manual' | string = 'manual'
): Promise<{ success: boolean; recordsDeleted: number; error?: string }> {
  const startTime = Date.now()
  log(`Cleaning up tenant: ${tenantId} (reason: ${reason})`)

  let recordsDeleted = 0

  try {
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

    // ★★★ v9.4.0: اجازه حذف demo, demo_pending و pending_payment
    const allowedStatuses = ['demo', 'demo_pending', 'pending_payment']
    if (!allowedStatuses.includes(tenant.status)) {
      logError(`Tenant is not cleanupable, refusing to delete: ${tenantId} (status: ${tenant.status})`)
      return { success: false, recordsDeleted: 0, error: 'NOT_A_CLEANUPABLE_TENANT' }
    }

    log(`Cleaning up demo/abandoned tenant:`, {
      id: tenant.id,
      subDomain: tenant.subDomain,
      companyName: tenant.companyName,
      status: tenant.status,
    })

    // ═══════════════════════════════════════════════════════════════
    //  ۱. حذف جداول relation-based (قبل از حذف parent)
    // ═══════════════════════════════════════════════════════════════
    
    // invoiceItem از طریق invoice
    try {
      const invoices = await db.client.invoice.findMany({
        where: { tenantId },
        select: { id: true },
      })
      const invoiceIds = invoices.map((i) => i.id)
      if (invoiceIds.length > 0) {
        const r = await db.client.invoiceItem.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        })
        if (r.count > 0) {
          recordsDeleted += r.count
          log(`  ✓ Deleted ${r.count} records from invoiceItem (via relation)`)
        }
      }
    } catch (err: any) {
      log(`  ⚠ invoiceItem delete skipped: ${err?.message}`)
    }

    // purchaseInvoiceItem از طریق purchaseInvoice
    try {
      const purchaseInvoices = await db.client.purchaseInvoice.findMany({
        where: { tenantId },
        select: { id: true },
      })
      const purchaseInvoiceIds = purchaseInvoices.map((p) => p.id)
      if (purchaseInvoiceIds.length > 0) {
        const r = await db.client.purchaseInvoiceItem.deleteMany({
          where: { purchaseInvoiceId: { in: purchaseInvoiceIds } },
        })
        if (r.count > 0) {
          recordsDeleted += r.count
          log(`  ✓ Deleted ${r.count} records from purchaseInvoiceItem (via relation)`)
        }
      }
    } catch (err: any) {
      log(`  ⚠ purchaseInvoiceItem delete skipped: ${err?.message}`)
    }

    // ticketMessage از طریق ticket
    try {
      const tickets = await db.client.ticket.findMany({
        where: { tenantId },
        select: { id: true },
      })
      const ticketIds = tickets.map((t) => t.id)
      if (ticketIds.length > 0) {
        const r = await db.client.ticketMessage.deleteMany({
          where: { ticketId: { in: ticketIds } },
        })
        if (r.count > 0) {
          recordsDeleted += r.count
          log(`  ✓ Deleted ${r.count} records from ticketMessage (via relation)`)
        }
      }
    } catch (err: any) {
      log(`  ⚠ ticketMessage delete skipped: ${err?.message}`)
    }

    // ═══════════════════════════════════════════════════════════════
    //  ۲. حذف جداول direct (که tenantId مستقیم دارند)
    // ═══════════════════════════════════════════════════════════════
    const directTables = [
      'subscriptionPayments', 'subscriptions',
      'userLookups', 'storeUser',
      'otpCode',
      'fiscalYear', 'journalEntry', 'account',
      'invoice',
      'invoicePayment',
      'installmentPlan', 'installmentSchedule',
      'purchaseInvoice',
      'stockMovement', 'stockLevel', 'stockCount', 'warehouse',
      'product', 'category', 'unit',
      'customer', 'supplier',
      'storeSetting', 'paymentGateway', 'posDevice',
      'smsSettings', 'smsLog', 'moidianSettings',
      'branch',
      'check', 'fixedAsset', 'initialBalance',
      'ticket',
      'onlinePayment', 'cardPayment',
      'auditLogs', 'backup',
    ]

    for (const table of directTables) {
      try {
        const r = await (db.client as any)[table].deleteMany({ where: { tenantId } })
        if (r.count > 0) {
          recordsDeleted += r.count
          log(`  ✓ Deleted ${r.count} records from ${table}`)
        }
      } catch (err: any) {
        log(`  ⚠ ${table} delete skipped: ${err?.message}`)
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  ۳. حذف خود Tenant
    // ═══════════════════════════════════════════════════════════════
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

export async function cleanupExpiredDemoTenants(): Promise<CleanupResult> {
  const startTime = Date.now()
  log('═══════════════════════════════════════════════════════════════')
  log('🧹 Starting cleanup of expired demo tenants...')
  log('═══════════════════════════════════════════════════════════════')

  const now = new Date()
  const pendingTimeout = new Date(now.getTime() - DEMO_PENDING_TIMEOUT_MINUTES * 60 * 1000)
  const abandonedPaymentTimeout = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const result: CleanupResult = {
    success: true,
    deletedCount: 0,
    totalRecordsDeleted: 0,
    details: [],
    errors: [],
    totalDurationMs: 0,
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    //  ۱. پیدا کردن tenant های demo منقضی شده
    // ═══════════════════════════════════════════════════════════════
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
      take: MAX_CLEANUP_PER_RUN,
      orderBy: { expiresAt: 'asc' },
    })

    log(`Found ${expiredDemos.length} expired demo tenants (limit: ${MAX_CLEANUP_PER_RUN})`)

    // ═══════════════════════════════════════════════════════════════
    //  ۲. پیدا کردن tenant های demo_pending که بیش از ۳۰ دقیقه طول کشیده‌اند
    // ═══════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    //  ★★★ v9.4.0: پیدا کردن pending_payment های رها شده
    // ═══════════════════════════════════════════════════════════════
    const abandonedPayments = await db.client.tenant.findMany({
      where: {
        status: 'pending_payment',
        createdAt: { lt: abandonedPaymentTimeout },
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

    log(`Found ${abandonedPayments.length} abandoned pending_payment tenants (older than 3 days)`)

    // ═══════════════════════════════════════════════════════════════
    //  حذف tenant های demo منقضی شده
    // ═══════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    //  حذف tenant های demo_pending منقضی شده
    // ═══════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════
    //  ★★★ v9.4.0: حذف pending_payment های رها شده
    // ═══════════════════════════════════════════════════════════════
    for (const t of abandonedPayments) {
      const tenantStartTime = Date.now()
      const cleanupResult = await cleanupSpecificDemoTenant(t.id, 'abandoned_payment')
      const tenantDurationMs = Date.now() - tenantStartTime

      if (cleanupResult.success) {
        result.deletedCount++
        result.totalRecordsDeleted += cleanupResult.recordsDeleted
        result.details.push({
          tenantId: t.id,
          subDomain: t.subDomain,
          companyName: t.companyName || '(بدون نام)',
          reason: 'demo_expired', // تبدیل به نوع معتبر
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
    markCleanupRun()

    log('═══════════════════════════════════════════════════════════════')
    log(`✅ Cleanup completed!`)
    log(`   • Demo expired deleted: ${expiredDemos.length}`)
    log(`   • Demo pending deleted: ${expiredPending.length}`)
    log(`   • Abandoned pending_payment deleted: ${abandonedPayments.length}`)
    log(`   • Total tenants deleted: ${result.deletedCount}`)
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

export async function getDemoCleanupStats(): Promise<CleanupStats> {
  const now = new Date()
  const pendingTimeout = new Date(now.getTime() - DEMO_PENDING_TIMEOUT_MINUTES * 60 * 1000)
  const abandonedPaymentTimeout = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  try {
    const [
      totalDemo,
      activeDemo,
      expiredDemo,
      pendingDemo,
      pendingTimeoutDemo,
      abandonedPayments,
    ] = await Promise.all([
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
      db.client.tenant.count({
        where: {
          status: 'pending_payment',
          createdAt: { lt: abandonedPaymentTimeout },
        },
      }),
    ])

    return {
      totalDemoTenants: totalDemo,
      activeDemoTenants: activeDemo,
      expiredDemoTenants: expiredDemo,
      pendingDemoTenants: pendingDemo,
      pendingTimeoutTenants: pendingTimeoutDemo,
      abandonedPayments,
    }
  } catch (error: any) {
    logError('Error getting cleanup stats:', error?.message)
    return {
      totalDemoTenants: 0,
      activeDemoTenants: 0,
      expiredDemoTenants: 0,
      pendingDemoTenants: 0,
      pendingTimeoutTenants: 0,
      abandonedPayments: 0,
    }
  }
}