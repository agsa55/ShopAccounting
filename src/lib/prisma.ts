/**
 * Prisma Client — لایه سازگاری — v4.5
 *
 * ⚠️ تغییر مهم: این فایل فقط MasterPrismaClient را export می‌کند
 *
 * بعد از تفکیک schema به master و tenant:
 *   - prisma = db.master (فقط جداول مدیریتی)
 *   - برای جداول فروشگاه: await db.forTenant(tenantId)
 *
 * ✅ صحیح:
 *   import { prisma } from '@/lib/prisma'
 *   prisma.tenant.findUnique(...)     // master model ✅
 *   prisma.portalUser.findFirst(...)  // master model ✅
 *   prisma.auditLog.create(...)       // master model ✅
 *   prisma.userLookup.findUnique(...) // master model ✅
 *
 * ❌ غلط:
 *   prisma.storeUser.findFirst(...)   // tenant model — از db.forTenant() استفاده کنید!
 *   prisma.product.findMany(...)      // tenant model — از db.forTenant() استفاده کنید!
 *
 * فایل: src/lib/prisma.ts
 */

import { PrismaClient } from '@/generated/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.MASTER_DATABASE_URL,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export default prisma;
