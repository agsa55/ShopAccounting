/**
 * Sync UserLookups — ShopAccounting v4.5
 *
 * این اسکریپت جدول UserLookup در MasterDB را با
 * StoreUserها و PortalUserهای موجود همگام‌سازی می‌کند
 *
 * استفاده:
 *   npx tsx scripts/sync-user-lookups.ts
 *
 * فایل: scripts/sync-user-lookups.ts
 */

import { PrismaClient } from '../src/generated/master';

const masterDb = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🔄 Syncing UserLookups...');
  console.log('═══════════════════════════════════════════════════');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // ─── مرحله ۱: همگام‌سازی از Tenants ────────────────────
  console.log('\n📋 Step 1: Getting all active tenants...');
  const tenants = await masterDb.tenant.findMany({
    where: { status: 'active' },
    select: { id: true, companyName: true, isIsolated: true },
  });
  console.log(`   Found ${tenants.length} active tenants.`);

  // ─── مرحله ۲: همگام‌سازی از PortalUsers ────────────────
  console.log('\n📋 Step 2: Syncing PortalUsers...');
  const portalUsers = await masterDb.portalUser.findMany({
    where: { isActive: true },
    select: { username: true, tenantId: true },
  });

  for (const pu of portalUsers) {
    try {
      const existing = await masterDb.userLookup.findUnique({
        where: { username: pu.username },
      });

      if (existing) {
        if (existing.tenantId !== pu.tenantId || existing.userType !== 'portalUser') {
          await masterDb.userLookup.update({
            where: { username: pu.username },
            data: { tenantId: pu.tenantId, userType: 'portalUser', isActive: true },
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await masterDb.userLookup.create({
          data: {
            username: pu.username,
            tenantId: pu.tenantId,
            userType: 'portalUser',
            isActive: true,
          },
        });
        created++;
      }
    } catch (error: any) {
      console.error(`   ❌ Error syncing PortalUser ${pu.username}: ${error.message}`);
    }
  }

  console.log(`   PortalUsers: ${created} created, ${updated} updated, ${skipped} skipped.`);

  // ─── مرحله ۳: نمایش آمار ───────────────────────────────
  const totalLookups = await masterDb.userLookup.count();
  const storeUserLookups = await masterDb.userLookup.count({ where: { userType: 'storeUser' } });
  const portalUserLookups = await masterDb.userLookup.count({ where: { userType: 'portalUser' } });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ Sync completed!');
  console.log(`   Total UserLookups: ${totalLookups}`);
  console.log(`   StoreUser lookups: ${storeUserLookups}`);
  console.log(`   PortalUser lookups: ${portalUserLookups}`);
  console.log('═══════════════════════════════════════════════════');

  // ⚠️ نکته: UserLookup برای StoreUserها باید از طریق SQL
  // (migrate-data.sql) یا از طریق API (هنگام ایجاد کاربر)
  // ایجاد شود، چون StoreUser در دیتابیس tenant قرار دارد
  // و این اسکریپت فقط به MasterDB دسترسی دارد.

  if (storeUserLookups === 0) {
    console.log('\n⚠️ WARNING: No StoreUser lookups found!');
    console.log('   Run migrate-data.sql to create UserLookups from StoreUsers.');
    console.log('   Or they will be created automatically on first login (fallback).');
  }

  await masterDb.$disconnect();
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
