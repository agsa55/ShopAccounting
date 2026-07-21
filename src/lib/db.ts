// ============================================================================
// src/lib/db.ts — Unified Database Manager (v3.0)
// ShopAccounting — Single Shared Database Architecture
// ============================================================================
// ★★★ v3.0 — تغییرات اساسی:
//   ★ حذف کامل سیستم multi-database
//   ★ یک PrismaClient واحد برای همه چیز
//   ★ برای backward compat، forTenant() هم همون client رو برمی‌گردونه
//   ★ حذف connection pool، encryption، و کدهای مربوط به multi-DB
//   ★ کد بسیار ساده‌تر و سریع‌تر
//
// ★ نکته مهم:
//   - همه query های tenant باید `where: { tenantId }` داشته باشن
//   - db.master و db.forTenant() هر دو همون client رو برمی‌گردونن
//   - این به‌خاطر backward compat با کدهای فعلیه
//
// ★ استفاده:
//   import { db } from '@/lib/db'
//   const tenant = await db.master.tenant.findUnique({ where: { id: tenantId } })
//   const invoices = await db.forTenant(tenantId).invoice.findMany({ where: { tenantId } })
//   // یا مستقیم:
//   const client = db.client
//   const invoices = await client.invoice.findMany({ where: { tenantId } })
// ============================================================================

import { PrismaClient } from '@/generated/client'

// ─── Singleton PrismaClient ─────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const client = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client
}

// ─── Database Manager (خروجی اصلی) ───────────────────────────

export const db = {
  /**
   * ★ PrismaClient اصلی — برای استفاده مستقیم
   * مثال: const invoices = await db.client.invoice.findMany({ where: { tenantId } })
   */
  client,

  /**
   * ★ برای backward compat — همون client رو برمی‌گردونه
   * استفاده: db.master.tenant.findUnique(...)
   */
  get master(): PrismaClient {
    return client
  },

  /**
   * ★★★ برای backward compat — همون client رو برمی‌گردونه
   * استفاده: const tenantDb = await db.forTenant(tenantId)
   *          await tenantDb.invoice.findMany({ where: { tenantId } })
   *
   * ★ نکته: tenantId پارامتر ورودی فقط برای backward compat نگه داشته شده
   *   در معماری جدید، باید `where: { tenantId }` در query استفاده بشه
   */
  async forTenant(_tenantId: string): Promise<PrismaClient> {
    return client
  },

  /**
   * ★ در معماری جدید همیشه false — دیگه بانک اختصاصی نداریم
   */
  async isTenantIsolated(_tenantId: string): Promise<boolean> {
    return false
  },

  /**
   * ★ در معماری جدید هیچ کاری نمی‌کنه — cache ای وجود نداره
   */
  invalidateTenantCache(_tenantId: string): void {
    // No-op in unified architecture
  },

  /**
   * ★ آمار اتصال — در معماری جدید فقط یک اتصال داریم
   */
  getPoolStats(): {
    totalConnections: number
    isolatedConnections: number
    tenants: string[]
  } {
    return {
      totalConnections: 1,
      isolatedConnections: 0,
      tenants: [],
    }
  },

  /**
   * ★ قطع اتصال — برای graceful shutdown
   */
  async disconnectAll(): Promise<void> {
    try {
      await client.$disconnect()
      console.log('[DB] Disconnected successfully')
    } catch (error: any) {
      console.error('[DB] Error during disconnect:', error.message)
    }
  },

  // ★★★ متدهای حذف‌شده در v3.0 (برای backward compat با خطای 명حقیر):
  //   - reEncryptConnectionString → حذف شد
  //   - reEncryptAllIsolatedTenants → حذف شد
  //   اگه کدی این متدها رو صدا می‌زنه، باید حذف بشه
}

// ─── Graceful Shutdown ────────────────────────────────────────

if (typeof process !== 'undefined' && process.on) {
  process.on('SIGTERM', async () => {
    console.log('[DB] SIGTERM received, disconnecting...')
    await db.disconnectAll()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('[DB] SIGINT received, disconnecting...')
    await db.disconnectAll()
    process.exit(0)
  })
}

export default db
