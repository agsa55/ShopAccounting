// ============================================================================
// src/lib/db.ts — Unified Database Manager (v3.1)
// ShopAccounting — Single Shared Database Architecture
// ============================================================================
// ★★★ v3.0 — تغییرات اساسی:
//   ★ حذف کامل سیستم multi-database
//   ★ یک PrismaClient واحد برای همه چیز
//   ★ برای backward compat، forTenant() هم همون client رو برمی‌گردونه
//   ★ حذف connection pool، encryption، و کدهای مربوط به multi-DB
//   ★ کد بسیار ساده‌تر و سریع‌تر
//
// ★★★ v3.1 — اصلاح مشکل Decimal Prisma:
//   ★ استفاده از Prisma $extends برای تبدیل خودکار Decimal به number
//   ★ تمام query ها به صورت خودکار serialize می‌شوند
//   ★ بدون نیاز به تغییر هیچ API یا کد دیگر
//   ★ حل مشکل "صفرهای زیاد" در JSON responses
//   ★ حل باگ ۴۹,۹۹۹,۹۹۹ به جای ۵۰,۰۰۰,۰۰۰
//
// ★ نکته مهم:
//   - همه query های tenant باید `where: { tenantId }` داشته باشن
//   - db.master و db.forTenant() هر دو همون client رو برمی‌گردونن
//   - این به‌خاطر backward compat با کدهای فعلیه
//
// ★ استفاده:
//   import { db } from '@/lib/db'
//   const tenant = await db.master.tenant.findUnique({ where: { tenantId: tenantId } })
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

// ★ Base client (قبل از extension)
const baseClient = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = baseClient
}

// ─── Decimal Serializer ─────────────────────────────────────

/**
 * تبدیل عمیق همه Decimal objects به number
 * این تابع به صورت خودکار تمام مقادیر Decimal Prisma را به number معمولی تبدیل می‌کند
 */
function serializeDecimal(data: any): any {
  if (data === null || data === undefined) return data
  if (typeof data !== 'object') return data
  if (data instanceof Date) return data

  if (Array.isArray(data)) {
    return data.map(item => serializeDecimal(item))
  }

  const result: any = {}
  for (const key of Object.keys(data)) {
    const value = data[key]

    // اگر Prisma Decimal است (دارای toNumber method)
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      typeof value.toNumber === 'function'
    ) {
      result[key] = value.toNumber()
    }
    // اگر object یا array است، recursive اعمال کن
    else if (value !== null && typeof value === 'object') {
      result[key] = serializeDecimal(value)
    }
    // در غیر این صورت، همان‌طور نگه دار
    else {
      result[key] = value
    }
  }
  return result
}

// ─── Extended PrismaClient with Auto-Serialization ──────────

/**
 * ★ PrismaClient با extension برای تبدیل خودکار Decimal به number
 * تمام query ها (findMany, findFirst, create, update, ...) به صورت خودکار
 * مقادیر Decimal را به number تبدیل می‌کنند.
 */
const client = (baseClient as any).$extends({
  name: 'decimalSerializer',
  query: {
    $allModels: {
      async findMany({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async findFirst({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async findUnique({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async findFirstOrThrow({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async findUniqueOrThrow({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async create({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async createMany({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async update({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async updateMany({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async upsert({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async delete({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async deleteMany({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async aggregate({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
      async count({ args, query }: any) {
        const result = await query(args)
        return result  // count همیشه عدد است
      },
      async groupBy({ args, query }: any) {
        const result = await query(args)
        return serializeDecimal(result)
      },
    },
  },
}) as PrismaClient

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
      await (baseClient as any).$disconnect()
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