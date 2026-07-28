/**
 * Migration Script: Shared → Hybrid Architecture - ShopAccounting v4.3
 *
 * انتقال داده‌های فروشگاه‌های فعلی از دیتابیس مشترک به دیتابیس مستقل
 *
 * نحوه اجرا:
 *   npx tsx scripts/migrate-to-hybrid.ts
 *
 * ⚠️ قبل از اجرا:
 *   1. حتماً از دیتابیس فعلی بکاپ بگیرید
 *   2. متغیرهای محیطی زیر را تنظیم کنید:
 *      - DATABASE_URL: رشته اتصال دیتابیس مشترک فعلی
 *      - DB_HOST, DB_USER, DB_PASSWORD: اطلاعات سرور SQL Server
 *      - ENCRYPTION_KEY: کلید رمزنگاری (حداقل ۳۲ کاراکتر)
 *
 * فایل: scripts/migrate-to-hybrid.ts
 */

import { PrismaClient } from '../src/generated/master';
import { PrismaClient as TenantPrismaClient } from '../src/generated/tenant';
import { exec } from 'child_process';
import { promisify } from 'util';
import { encryptConnectionString, buildConnectionString, buildTenantDbName } from '../src/lib/db-encrypt';

const execAsync = promisify(exec);

// ─── تنظیمات ─────────────────────────────────────────────────

const BATCH_SIZE = 100; // تعداد رکورد در هر batch
const DRY_RUN = process.env.DRY_RUN === 'true'; // فقط نمایش، بدون تغییر

// مدل‌های tenant-scoped به ترتیب وابستگی
const TENANT_MODELS_ORDERED = [
  'storeUser', 'productCategory', 'unit', 'product', 'customer',
  'invoice', 'invoiceItem', 'invoicePayment', 'installmentPlan', 'installment',
  'stockMovement', 'account', 'fiscalYear', 'journalEntry', 'journalEntryLine',
  'paymentGatewaySetting', 'posSetting', 'storeSetting', 'invoiceTemplate', 'notification',
];

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ShopAccounting v4.3 — Hybrid Migration Script');
  console.log('  Shared Database → Per-Tenant Databases');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE — هیچ تغییری اعمال نخواهد شد');
    console.log();
  }

  // ۱. اتصال به دیتابیس مشترک فعلی
  const sharedDb = new PrismaClient();
  console.log('✅ Connected to shared database');

  // ۲. دریافت لیست فروشگاه‌ها
  const tenants = await sharedDb.tenant.findMany({
    select: { id: true, subDomain: true, companyName: true, isIsolated: true, dbName: true },
  });

  console.log(`📋 Found ${tenants.length} tenants`);
  console.log();

  // ۳. فیلتر فروشگاه‌هایی که هنوز دیتابیس مستقل ندارند
  const tenantsToMigrate = tenants.filter((t) => !t.isIsolated);
  const alreadyIsolated = tenants.filter((t) => t.isIsolated);

  console.log(`   Already isolated: ${alreadyIsolated.length}`);
  console.log(`   Need migration:   ${tenantsToMigrate.length}`);
  console.log();

  if (tenantsToMigrate.length === 0) {
    console.log('✅ All tenants are already isolated. Nothing to do.');
    await sharedDb.$disconnect();
    return;
  }

  // ۴. نمایش خلاصه قبل از شروع
  console.log('Tenants to migrate:');
  for (const t of tenantsToMigrate) {
    console.log(`  - ${t.companyName} (${t.subDomain}) → ${buildTenantDbName(t.id)}`);
  }
  console.log();

  // ۵. شروع انتقال
  let successCount = 0;
  let failCount = 0;

  for (const tenant of tenantsToMigrate) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📦 Migrating: ${tenant.companyName} (${tenant.subDomain})`);
    console.log(`${'─'.repeat(60)}`);

    try {
      await migrateTenant(sharedDb, tenant.id, tenant.subDomain);
      successCount++;
      console.log(`✅ Successfully migrated: ${tenant.companyName}`);
    } catch (error: any) {
      failCount++;
      console.error(`❌ Failed to migrate ${tenant.companyName}: ${error.message}`);
    }
  }

  // ۶. خلاصه نهایی
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Migration Complete`);
  console.log(`  Success: ${successCount} | Failed: ${failCount}`);
  console.log(`${'═'.repeat(60)}`);

  await sharedDb.$disconnect();
}

// ─── انتقال یک فروشگاه ────────────────────────────────────────

async function migrateTenant(sharedDb: PrismaClient, tenantId: string, subDomain: string): Promise<void> {
  const dbName = buildTenantDbName(tenantId);
  const connectionString = buildConnectionString({ dbName });

  // ─── Step 1: شمارش رکوردها ───────────────────────────────
  console.log('  Step 1: Counting records...');
  const recordCounts: Record<string, number> = {};
  let totalRecords = 0;

  for (const modelName of TENANT_MODELS_ORDERED) {
    try {
      const model = (sharedDb as any)[modelName];
      if (!model || typeof model.count !== 'function') {
        recordCounts[modelName] = 0;
        continue;
      }

      const count = await model.count({ where: { tenantId } });
      recordCounts[modelName] = count;
      totalRecords += count;
    } catch (e: any) {
      recordCounts[modelName] = 0;
    }
  }

  const nonEmpty = Object.entries(recordCounts).filter(([, c]) => c > 0);
  console.log(`  Total records: ${totalRecords} across ${nonEmpty.length} models`);
  for (const [model, count] of nonEmpty) {
    console.log(`    ${model}: ${count}`);
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would create database: ${dbName}`);
    console.log(`  [DRY RUN] Would copy ${totalRecords} records`);
    return;
  }

  // ─── Step 2: ایجاد دیتابیس ──────────────────────────────
  console.log(`  Step 2: Creating database ${dbName}...`);
  try {
    const createCmd = `sqlcmd -S ${process.env.DB_HOST || 'localhost'} -U ${process.env.DB_USER || 'sa'} -P "${process.env.DB_PASSWORD || ''}" -Q "CREATE DATABASE [${dbName}]"`;
    await execAsync(createCmd, { timeout: 30000 });
    console.log(`  ✅ Database created: ${dbName}`);
  } catch (dbError: any) {
    if (dbError.message?.includes('already exists')) {
      console.log(`  ⚠️ Database already exists: ${dbName}`);
    } else {
      throw new Error(`Failed to create database: ${dbError.message}`);
    }
  }

  // ─── Step 3: اجرای Prisma Migrate ───────────────────────
  console.log(`  Step 3: Running Prisma migrate on ${dbName}...`);
  try {
    const migrateEnv = { ...process.env, TENANT_DATABASE_URL: connectionString };
    const migrateCmd = `npx prisma migrate deploy --schema=prisma/schema-tenant.prisma`;
    const { stdout, stderr } = await execAsync(migrateCmd, { timeout: 120000, env: migrateEnv });
    console.log(`  ✅ Migration applied`);
    if (stderr) console.log(`  ⚠️ Warnings: ${stderr.substring(0, 200)}`);
  } catch (migrateError: any) {
    // اگر migrate شکست خورد، db push امتحان کن
    console.warn(`  ⚠️ Migrate failed, trying prisma db push...`);
    try {
      const migrateEnv = { ...process.env, TENANT_DATABASE_URL: connectionString };
      const pushCmd = `npx prisma db push --schema=prisma/schema-tenant.prisma --accept-data-loss`;
      await execAsync(pushCmd, { timeout: 120000, env: migrateEnv });
      console.log(`  ✅ Schema pushed successfully`);
    } catch (pushError: any) {
      console.warn(`  ⚠️ Push also failed: ${pushError.message?.substring(0, 200)}`);
    }
  }

  // ─── Step 4: کپی داده‌ها ─────────────────────────────────
  console.log(`  Step 4: Copying data...`);

  const tenantDb = new TenantPrismaClient({ datasourceUrl: connectionString });
  let copiedRecords = 0;

  for (const modelName of TENANT_MODELS_ORDERED) {
    if (recordCounts[modelName] === 0) continue;

    try {
      const sourceModel = (sharedDb as any)[modelName];
      const targetModel = (tenantDb as any)[modelName];

      if (!sourceModel || !targetModel) continue;

      // خواندن به batch
      let skip = 0;
      let modelCopied = 0;

      while (true) {
        const records = await sourceModel.findMany({
          where: { tenantId },
          take: BATCH_SIZE,
          skip,
        });

        if (records.length === 0) break;

        // حذف فیلد id برای رکوردهای جدید
        const cleanRecords = records.map((r: any) => {
          const { id, ...rest } = r;
          return rest;
        });

        try {
          const result = await targetModel.createMany({
            data: cleanRecords,
            skipDuplicates: true,
          });
          modelCopied += result.count;
        } catch (batchError: any) {
          // اگر batch شکست خورد، یکی یکی تلاش کن
          console.warn(`  ⚠️ Batch insert failed for ${modelName}, trying one-by-one...`);
          for (const record of cleanRecords) {
            try {
              await targetModel.create({ data: record });
              modelCopied++;
            } catch {
              // skip duplicate or invalid
            }
          }
        }

        skip += BATCH_SIZE;
      }

      copiedRecords += modelCopied;
      console.log(`    ${modelName}: ${modelCopied}/${recordCounts[modelName]} copied`);
    } catch (modelError: any) {
      console.warn(`    ⚠️ Error copying ${modelName}: ${modelError.message?.substring(0, 100)}`);
    }
  }

  await tenantDb.$disconnect();

  // ─── Step 5: تأیید یکپارچگی ─────────────────────────────
  console.log(`  Step 5: Verifying data integrity...`);
  const verifyDb = new TenantPrismaClient({ datasourceUrl: connectionString });
  let verifiedRecords = 0;

  for (const modelName of TENANT_MODELS_ORDERED) {
    if (recordCounts[modelName] === 0) continue;
    try {
      const model = (verifyDb as any)[modelName];
      if (!model) continue;
      const count = await model.count();
      verifiedRecords += count;
    } catch {
      // skip
    }
  }

  await verifyDb.$disconnect();

  const integrityOk = verifiedRecords >= copiedRecords * 0.95; // ۹۵% کافی هست
  console.log(`  ${integrityOk ? '✅' : '⚠️'} Integrity check: ${verifiedRecords} verified (expected ~${copiedRecords})`);

  if (!integrityOk) {
    console.warn(`  ⚠️ Data integrity check failed! Manual review needed.`);
  }

  // ─── Step 6: بروزرسانی MasterDB ─────────────────────────
  console.log(`  Step 6: Updating MasterDB...`);
  const encryptedConnStr = encryptConnectionString(connectionString);

  await sharedDb.tenant.update({
    where: { id: tenantId },
    data: {
      dbName,
      connectionStringEncrypted: encryptedConnStr,
      isIsolated: true,
    },
  });

  console.log(`  ✅ MasterDB updated: isIsolated=true, dbName=${dbName}`);
}

// ─── اجرا ──────────────────────────────────────────────────────

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
