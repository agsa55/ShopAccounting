/**
 * Safe Migration: Add Hybrid Fields to Existing Database
 *
 * این اسکریپت فقط فیلدهای جدید به جداول اضافه می‌کنه
 * بدون حذف یا تغییر هیچ داده‌ای
 *
 * از Prisma Client استفاده می‌کنه (نه sqlcmd) تا از همان
 * DATABASE_URL در فایل .env استفاده کنه
 *
 * نحوه اجرا:
 *   npx tsx scripts/add-hybrid-fields.ts
 *
 * فایل: scripts/add-hybrid-fields.ts
 */

import { PrismaClient } from '@/lib/prisma';

const prisma = new PrismaClient();

async function safeAlter(tableName: string, columnName: string, columnDef: string): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = '${columnName}'
      )
      ALTER TABLE ${tableName} ADD ${columnName} ${columnDef}
    `);
    console.log(`  ✅ ${tableName}.${columnName} added or already exists`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ Error adding ${tableName}.${columnName}: ${error.message}`);
    return false;
  }
}

async function safeRename(tableName: string, oldCol: string, newCol: string): Promise<boolean> {
  try {
    // بررسی اینکه آیا ستون قدیمی وجود داره و جدید هنوز نیست
    const checkOld: any[] = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = '${oldCol}'
    `);
    const checkNew: any[] = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = '${newCol}'
    `);

    if (checkOld.length > 0 && checkNew.length === 0) {
      await prisma.$executeRawUnsafe(`
        EXEC sp_rename '${tableName}.${oldCol}', '${newCol}', 'COLUMN'
      `);
      console.log(`  ✅ ${tableName}.${oldCol} renamed to ${newCol}`);
      return true;
    } else if (checkNew.length > 0) {
      console.log(`  ✅ ${tableName}.${newCol} already exists, skipping rename`);
      return true;
    } else {
      console.log(`  ⚠️ ${tableName}.${oldCol} not found, cannot rename to ${newCol}`);
      return false;
    }
  } catch (error: any) {
    console.error(`  ❌ Error renaming ${tableName}.${oldCol}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ShopAccounting v4.3 — Safe Hybrid Field Addition');
  console.log('  افزودن فیلدهای Hybrid به دیتابیس موجود');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // ─── ۱. افزودن فیلدهای Hybrid به جدول Tenants ───────────
  console.log('Step 1: Adding Hybrid fields to Tenants table...');
  await safeAlter('Tenants', 'dbName', 'NVARCHAR(255) NULL');
  await safeAlter('Tenants', 'connectionStringEncrypted', 'NVARCHAR(MAX) NULL');
  await safeAlter('Tenants', 'isIsolated', 'BIT NOT NULL DEFAULT 0');
  console.log();

  // ─── ۲. افزودن فیلد productId به InvoiceItems ────────────
  console.log('Step 2: Adding productId to InvoiceItems...');
  await safeAlter('InvoiceItems', 'productId', 'NVARCHAR(450) NULL');
  console.log();

  // ─── ۳. اصلاح فیلدهای StockMovements ───────────────────
  console.log('Step 3: Checking StockMovements columns...');
  // rename type → movementType
  await safeRename('StockMovements', 'type', 'movementType');
  // اضافه کردن فیلدهای جدید
  await safeAlter('StockMovements', 'movementType', 'NVARCHAR(50) NULL');
  await safeAlter('StockMovements', 'userId', 'NVARCHAR(450) NULL');
  await safeAlter('StockMovements', 'reference', 'NVARCHAR(450) NULL');
  await safeAlter('StockMovements', 'at', 'DATETIME2 NULL');
  console.log();

  // ─── ۴. اصلاح فیلدهای JournalEntries ──────────────────
  console.log('Step 4: Checking JournalEntries columns...');
  await safeRename('JournalEntries', 'date', 'entryDate');
  await safeAlter('JournalEntries', 'entryDate', 'DATETIME2 NOT NULL DEFAULT GETDATE()');
  await safeAlter('JournalEntries', 'entryType', 'NVARCHAR(50) DEFAULT \'manual\'');
  await safeAlter('JournalEntries', 'referenceType', 'NVARCHAR(100) NULL');
  await safeAlter('JournalEntries', 'referenceId', 'NVARCHAR(450) NULL');
  console.log();

  // ─── ۵. اصلاح فیلدهای Accounts و FiscalYears ───────────
  console.log('Step 5: Checking Account/FiscalYear columns...');
  await safeAlter('Accounts', 'level', 'INT DEFAULT 1');
  await safeAlter('FiscalYears', 'status', 'NVARCHAR(50) DEFAULT \'active\'');
  console.log();

  // ─── ۶. تأیید نهایی ────────────────────────────────────
  console.log('Step 6: Verifying hybrid columns on Tenants...');
  try {
    const columns: any[] = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Tenants'
        AND COLUMN_NAME IN ('dbName', 'connectionStringEncrypted', 'isIsolated')
    `);
    const colNames = columns.map((c: any) => c.COLUMN_NAME);
    console.log('  Columns found:', colNames.join(', '));

    if (colNames.length === 3) {
      console.log('  ✅ All 3 hybrid columns are present!');
    } else {
      console.log(`  ⚠️ Only ${colNames.length}/3 columns found.`);
    }
  } catch (error: any) {
    console.error('  ❌ Verification error:', error.message);
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Done! Now you can proceed with:');
  console.log('  1. npx prisma generate');
  console.log('  2. npx prisma db push');
  console.log('  3. npx prisma generate --schema=prisma/schema-tenant.prisma');
  console.log('═══════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    prisma.$disconnect();
    process.exit(1);
  });
